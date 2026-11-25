import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { generateGlb } from './generate.mjs';
import { capturePreview } from './preview.mjs';
import { formatJson, publishAsset, sha256 } from './publish.mjs';
import { validateSpec } from './spec.mjs';
import { inspectAcceptance, inspectGlb } from './validate.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const usage = 'node tools/asset-pipeline/cli.mjs <spec.json> [--input <candidate.glb>] [--publish [--publish-to <directory>]] [--channel <chrome|msedge|chromium>]';
const options = {
  input: { type: 'string' },
  publish: { type: 'boolean' },
  'publish-to': { type: 'string' },
  channel: { type: 'string' },
  help: { type: 'boolean' },
};
const fail = (field, message, actual = null, expected = null) => ({ field, message, actual, expected });

async function main() {
  const { positionals, values } = parseArgs({ options, allowPositionals: true });
  if (values.help) {
    console.log(usage);
    return;
  }
  if (positionals.length !== 1 || (values['publish-to'] && !values.publish)) throw new Error(usage);
  if (values.channel && !['chrome', 'msedge', 'chromium'].includes(values.channel)) throw new Error('Unsupported browser channel');

  const runs = join(project, 'tools', 'asset-pipeline', 'runs');
  await mkdir(runs, { recursive: true });
  const directory = await mkdtemp(join(runs, 'run-'));
  const specPath = resolve(positionals[0]);
  const report = {
    schemaVersion: 1,
    id: null,
    version: null,
    specification: relative(project, specPath).split('\\').join('/'),
    startedAt: new Date().toISOString(),
    status: 'rejected',
    failures: [],
    screenshots: [],
    metrics: {},
  };
  const reportPath = join(directory, 'report.json');

  async function step(name, execute) {
    try {
      return await execute();
    } catch (error) {
      report.failures.push(fail(name, error.message));
      return null;
    }
  }

  const specBytes = await step('specification', () => readFile(specPath));
  const spec = specBytes && await step('specification', () => JSON.parse(specBytes.toString('utf8').replace(/^\uFEFF/, '')));
  if (specBytes) {
    report.specSha256 = sha256(specBytes);
    await writeFile(join(directory, 'spec.json'), specBytes);
  }
  if (spec) {
    report.id = spec.id ?? null;
    report.version = spec.version ?? null;
    report.source = spec.source ?? null;
    report.failures.push(...validateSpec(spec).map(message => fail('specification', message)));
  } else if (specBytes && !report.failures.length) {
    report.failures.push(fail('specification', 'Specification must be a JSON object'));
  }

  if (spec && !report.failures.length) {
    const bytes = await step('candidate', () => values.input ? readFile(resolve(values.input)) : generateGlb(spec));
    if (bytes) {
      report.sha256 = sha256(bytes);
      await writeFile(join(directory, 'candidate.glb'), bytes);
      const container = await step('integrity', () => inspectGlb(bytes));
      if (container) {
        Object.assign(report.metrics, container);
        const browser = await step('browser', () => capturePreview(bytes, spec, directory, values.channel, report.screenshots));
        Object.assign(report.metrics, browser);
        inspectAcceptance(spec, report.metrics, report.failures);
      }
    }
    report.completedAt = new Date().toISOString();
    if (!report.failures.length) {
      report.status = 'accepted';
      if (values.publish) {
        const published = await step('publish', () => publishAsset(
          values['publish-to'] ? resolve(values['publish-to']) : join(project, 'public', 'assets'),
          directory, spec, specBytes, bytes, report,
        ));
        if (published) report.published = published.url;
        else report.status = 'rejected';
      }
    }
  }

  report.completedAt ??= new Date().toISOString();
  await writeFile(reportPath, formatJson(report));
  console.log(reportPath);
  if (report.status === 'rejected') {
    for (const failure of report.failures) console.error(failure.field + ': ' + failure.message);
    process.exitCode = 1;
  } else {
    console.log('Accepted ' + report.id + ' ' + report.version + (report.published ? ' → ' + report.published : ''));
  }
}

await main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
