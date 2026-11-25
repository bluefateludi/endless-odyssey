import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, open, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const formatJson = object => JSON.stringify(object, null, 2) + '\n';

async function replaceFile(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const scratch = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(scratch, content, { flag: 'wx' });
    await rename(scratch, path);
  } finally {
    await rm(scratch, { force: true });
  }
}

async function readOptional(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

function isNewer(version, current) {
  if (!current) return true;
  const other = current.split('.').map(BigInt);
  for (const [index, number] of version.split('.').map(BigInt).entries()) {
    if (number !== other[index]) return number > other[index];
  }
  return false;
}

export async function publishAsset(root, runDir, spec, specBytes, model, report) {
  if (report.status !== 'accepted' || report.failures.length || !report.screenshots.length) {
    throw new Error('Only accepted assets with browser previews can be registered');
  }
  await mkdir(root, { recursive: true });
  const lockPath = join(root, '.registry.lock');
  const lock = await open(lockPath, 'wx').catch(error => {
    if (error.code === 'EEXIST') throw new Error('Another publish operation holds ' + lockPath);
    throw error;
  });
  try {
    const registryPath = join(root, 'registry.json');
    const saved = await readOptional(registryPath);
    const registry = saved ? JSON.parse(saved) : { schemaVersion: 1, assets: {} };
    if (registry.schemaVersion !== 1 || !registry.assets) throw new Error('Invalid existing asset registry');
    const entry = Object.hasOwn(registry.assets, spec.id) ? registry.assets[spec.id] : { versions: {} };
    const previous = entry.versions[spec.version];

    const modelDir = join(root, 'models', spec.id);
    const modelPath = join(modelDir, spec.version + '.glb');
    const previewDir = join(root, 'previews', spec.id, spec.version);
    const previewUrl = '/assets/previews/' + spec.id + '/' + spec.version + '/';
    const specHash = sha256(specBytes);
    const modelHash = sha256(model);
    const stored = await readOptional(modelPath);
    if ((previous && (previous.sha256 !== modelHash || previous.specSha256 !== specHash)) ||
        (stored && sha256(stored) !== modelHash)) {
      throw new Error('Version ' + spec.version + ' is immutable. Increment the version for changed input or output.');
    }

    if (!stored) await replaceFile(modelPath, model);
    const savedReport = await readOptional(join(previewDir, 'report.json'));
    if (!savedReport) {
      const staging = previewDir + '.' + randomUUID() + '.tmp';
      try {
        await mkdir(staging, { recursive: true });
        for (const file of report.screenshots) await copyFile(join(runDir, file), join(staging, file));
        await writeFile(join(staging, 'report.json'), formatJson(report));
        await writeFile(join(staging, 'spec.json'), specBytes);
        await rename(staging, previewDir);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    } else if (JSON.parse(savedReport).sha256 !== modelHash || JSON.parse(savedReport).specSha256 !== specHash) {
      throw new Error('Versioned previews already belong to a different specification or model');
    }

    entry.versions[spec.version] = previous ?? {
      name: spec.name,
      tags: spec.tags,
      url: '/assets/models/' + spec.id + '/' + spec.version + '.glb',
      sha256: modelHash,
      specSha256: specHash,
      acceptedAt: report.completedAt,
      reportUrl: previewUrl + 'report.json',
      specUrl: previewUrl + 'spec.json',
      previews: report.screenshots.map(file => previewUrl + file),
      units: spec.units,
      up: spec.up,
      forward: spec.forward,
      boundsMeters: report.metrics.bounds.size,
      collider: spec.collider,
      animations: spec.animations,
      source: spec.source,
    };
    if (isNewer(spec.version, entry.currentVersion)) entry.currentVersion = spec.version;
    if (entry.currentVersion === spec.version) {
      const currentPath = join(root, 'models', spec.id + '.glb');
      const current = await readOptional(currentPath);
      if (!current || sha256(current) !== modelHash) await replaceFile(currentPath, model);
    }
    registry.assets[spec.id] = entry;
    if (!previous || !saved) await replaceFile(registryPath, formatJson(registry));
    return entry.versions[spec.version];
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
