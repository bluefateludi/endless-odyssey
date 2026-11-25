import { getGenerator } from './generate.mjs';

export const limits = {
  maxGlbBytes: 'glbBytes',
  maxTriangles: 'triangles',
  maxTextures: 'textures',
  maxTextureBytes: 'textureBytes',
  maxTexturePixels: 'texturePixels',
  maxDrawCalls: 'drawCalls',
  maxFrameP95Ms: 'frameP95Ms',
};
const requiredColors = ['bark', 'darkBark', 'wood', 'cutWood', 'stone', 'moss', 'leaf', 'lichen', 'ember'];

export function validateSpec(spec) {
  const errors = [];
  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const text = item => typeof item === 'string' && item.trim().length > 0;
  const positive = n => Number.isFinite(n) && n > 0;
  const nonnegative = n => Number.isFinite(n) && n >= 0;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['Specification must be a JSON object'];
  check(spec.schemaVersion === 1, 'schemaVersion must be 1');
  check(typeof spec.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spec.id), 'id must be a lowercase slug');
  check(typeof spec.version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(spec.version), 'version must use MAJOR.MINOR.PATCH');
  check(text(spec.name), 'name is required');
  try {
    getGenerator(spec.generator);
  } catch (error) {
    errors.push(error.message);
  }
  check(Number.isSafeInteger(spec.seed) && spec.seed >= 0 && spec.seed <= 0xffffffff, 'seed must be an unsigned 32-bit integer');
  check(Array.isArray(spec.tags) && spec.tags.length && spec.tags.every(text), 'tags must contain at least one nonempty string');
  check(text(spec.art?.silhouette) && text(spec.art?.surface), 'art.silhouette and art.surface are required');
  for (const color of requiredColors) {
    const entry = spec.art?.palette?.[color];
    check(typeof entry === 'string' && /^#[0-9a-f]{6}$/i.test(entry), 'Invalid palette color ' + color);
  }
  check(spec.units === 'meters' && spec.up === '+Y' && spec.forward === '+Z', 'Expected meters, +Y up and +Z forward');
  for (const axis of ['width', 'height', 'depth']) {
    const range = spec.dimensions?.[axis];
    check(Array.isArray(range) && range.length === 2 && range.every(positive) && range[0] <= range[1], 'Invalid dimension range: ' + axis);
  }
  check(positive(spec.dimensions?.groundTolerance), 'A positive groundTolerance is required');
  const collider = spec.collider;
  check(collider?.shape === 'cylinder' && positive(collider.radius) && positive(collider.height), 'Expected a vertical cylinder with positive radius and height');
  check(Array.isArray(collider?.center) && collider.center.length === 3 &&
    collider.center[0] === 0 && collider.center[2] === 0 &&
    Math.abs(collider.center[1] - collider.height / 2) <= 0.000001, 'Collider must be centered over the foot origin');
  const clips = Object.entries(spec.animations ?? {});
  const expectedClips = ['Idle', 'Walk', 'Attack', 'Hit', 'Death'];
  check(clips.length === expectedClips.length && expectedClips.every(name => Object.hasOwn(spec.animations, name)), 'Expected Idle, Walk, Attack, Hit and Death animation specifications');
  for (const [name, action] of clips) {
    check(positive(action?.duration) && positive(action.sample) && action.sample <= action.duration && typeof action.loop === 'boolean', 'Invalid animation specification: ' + name);
  }
  check(text(spec.gameplay?.attack) && text(spec.gameplay?.lootRole), 'gameplay.attack and gameplay.lootRole are required');
  for (const limit of Object.keys(limits)) {
    const value = spec.budget?.[limit];
    check(nonnegative(value) && (limit === 'maxFrameP95Ms' || Number.isSafeInteger(value)), 'Invalid budget limit: ' + limit);
  }
  const source = spec.source;
  check(source?.type === 'original-procedural' && text(source.author) && text(source.license) &&
    source.generator === 'tools/asset-pipeline/models/' + spec.generator + '.mjs' &&
    Array.isArray(source.inputs) && source.inputs.length === 0, 'Original procedural source and license must be documented');
  return errors;
}
