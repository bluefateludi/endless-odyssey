import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatJson, sha256 } from './publish.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const approvedSpec = join(project, 'data', 'asset-specs', 'moss-warden.json');
const base = join(project, 'tools', 'asset-pipeline', 'runs');
await mkdir(base, { recursive: true });
const fixtures = await mkdtemp(join(base, 'regression-'));
const assets = join(fixtures, 'assets');
const registryPath = join(assets, 'registry.json');
const testSpec = JSON.parse(await readFile(approvedSpec, 'utf8'));
const [major, minor, patch] = testSpec.version.split('.');
const version = [major, minor, BigInt(patch) + 1n].join('.');
const rejectedSpec = join(fixtures, 'over-budget.json');
const browserArgs = process.argv.slice(2);
assert(browserArgs.length === 0 || (browserArgs.length === 2 && browserArgs[0] === '--channel'), 'Use regression.mjs [--channel <chrome|msedge|chromium>]');

await writeFile(rejectedSpec, formatJson({ ...testSpec, version, budget: { ...testSpec.budget, maxTriangles: 100 } }));

async function run(spec, expectedExit, extra = []) {
  const result = spawnSync(process.execPath, [cli, spec, '--publish', '--publish-to', assets, ...extra, ...browserArgs], {
    cwd: project, encoding: 'utf8', timeout: 90_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, expectedExit, result.stdout + result.stderr);
  const [reportPath] = result.stdout.trim().split(/\r?\n/);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  console.log(report.status + ' → ' + reportPath);
  return { report, reportPath };
}

async function verifyScreenshots(report, reportPath) {
  assert.equal(report.screenshots.length, 9);
  for (const filename of report.screenshots) {
    const png = await readFile(join(dirname(reportPath), filename));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 780);
    assert.equal(png.readUInt32BE(20), 620);
  }
}

const accepted = await run(approvedSpec, 0);
assert.equal(accepted.report.status, 'accepted');
assert.deepEqual(accepted.report.failures, []);
await verifyScreenshots(accepted.report, accepted.reportPath);
const registryBytes = await readFile(registryPath);
const entry = JSON.parse(registryBytes).assets[testSpec.id];
assert.equal(entry.currentVersion, testSpec.version);
assert.equal(entry.versions[testSpec.version].sha256, accepted.report.sha256);
const alias = await readFile(join(assets, 'models', testSpec.id + '.glb'));
assert.equal(sha256(alias), accepted.report.sha256);
const savedModel = await readFile(join(assets, 'models', testSpec.id, testSpec.version + '.glb'));
assert.deepEqual(alias, savedModel);
const shipped = await readFile(join(project, 'public', 'assets', 'models', testSpec.id + '.glb'));
assert.deepEqual(shipped, savedModel, 'Committed alias must match a fresh deterministic generation');

const rejected = await run(rejectedSpec, 1);
assert.equal(rejected.report.status, 'rejected');
assert.deepEqual(rejected.report.failures.map(failure => failure.field), ['maxTriangles']);
assert.equal(rejected.report.failures[0].actual, accepted.report.metrics.triangles);
assert.equal(rejected.report.failures[0].expected, 100);
await verifyScreenshots(rejected.report, rejected.reportPath);
assert.deepEqual(await readFile(registryPath), registryBytes);
assert.deepEqual(await readFile(join(assets, 'models', testSpec.id + '.glb')), alias);
assert(!existsSync(join(assets, 'models', testSpec.id, version + '.glb')));
assert(!existsSync(join(assets, 'previews', testSpec.id, version)));

const bad = join(fixtures, 'truncated.glb');
await writeFile(bad, alias.subarray(0, 27));
const corrupt = await run(approvedSpec, 1, ['--input', bad]);
assert.equal(corrupt.report.status, 'rejected');
assert.deepEqual(corrupt.report.failures.map(failure => failure.field), ['integrity']);
assert.deepEqual(corrupt.report.screenshots, []);
assert.deepEqual(await readFile(registryPath), registryBytes);
console.log('Acceptance, over-budget rejection, corrupt GLB rejection and registry preservation passed.');
