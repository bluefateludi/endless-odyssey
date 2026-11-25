import { limits } from './spec.mjs';

const GLB = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const itemWidths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const isIndex = n => Number.isSafeInteger(n) && n >= 0;

export function inspectGlb(bytes) {
  function require(condition, message) {
    if (!condition) throw new Error(message);
  }
  require(bytes.length >= 28 && bytes.readUInt32LE(0) === GLB, 'Missing GLB magic or binary chunks');
  require(bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length, 'Invalid GLB version or total byte length');
  const jsonLength = bytes.readUInt32LE(12);
  const binHeader = 20 + jsonLength;
  require(jsonLength % 4 === 0 && binHeader + 8 <= bytes.length && bytes.readUInt32LE(16) === JSON_CHUNK, 'Invalid GLB JSON chunk');
  const binLength = bytes.readUInt32LE(binHeader);
  require(binLength % 4 === 0 && binHeader + 8 + binLength === bytes.length && bytes.readUInt32LE(binHeader + 4) === BIN_CHUNK, 'Invalid GLB binary chunk');
  const doc = JSON.parse(bytes.toString('utf8', 20, binHeader));
  const bin = bytes.subarray(binHeader + 8);
  const { buffers, bufferViews, accessors, meshes, nodes, scenes, images = [], textures = [], materials = [], animations = [] } = doc;
  const reference = (array, index, label) => {
    require(Array.isArray(array) && isIndex(index) && index < array.length && array[index], 'Broken reference: ' + label + ' [' + index + ']');
    return array[index];
  };

  require(doc.asset?.version === '2.0', 'Expected glTF 2.0 metadata');
  require(buffers?.length === 1 && !Object.hasOwn(buffers[0], 'uri'), 'GLB must use one embedded buffer');
  const usedBytes = buffers[0].byteLength;
  require(isIndex(usedBytes) && usedBytes > 0 && binLength >= usedBytes && binLength - usedBytes <= 3, 'Invalid embedded buffer length');
  require(Array.isArray(bufferViews) && Array.isArray(accessors) && Array.isArray(meshes) && Array.isArray(nodes), 'Expected mesh, node and binary accessor arrays');
  for (const [index, view] of bufferViews.entries()) {
    const { byteOffset = 0, byteLength, byteStride } = view;
    require(view.buffer === 0 && isIndex(byteOffset) && isIndex(byteLength) && byteLength > 0 &&
      byteOffset + byteLength <= usedBytes && (byteStride === undefined || (isIndex(byteStride) && byteStride >= 4 && byteStride <= 252 && byteStride % 4 === 0)),
    'Invalid buffer view ' + index);
  }
  for (const [index, accessor] of accessors.entries()) {
    const view = reference(bufferViews, accessor.bufferView, 'accessor buffer view');
    const { byteOffset = 0, componentType, type, count } = accessor;
    const alignment = componentBytes[componentType];
    const width = alignment * itemWidths[type];
    const stride = view.byteStride ?? width;
    require(!accessor.sparse && Number.isFinite(width) && isIndex(byteOffset) && byteOffset % alignment === 0 &&
      ((view.byteOffset ?? 0) + byteOffset) % alignment === 0 && isIndex(count) && count > 0 &&
      stride >= width && byteOffset + (count - 1) * stride + width <= view.byteLength, 'Invalid accessor ' + index);
  }

  const scene = reference(scenes, doc.scene ?? 0, 'default scene');
  const assetRoots = scene.nodes.map(index => reference(nodes, index, 'scene node')).filter(node => node.extras?.assetId);
  require(assetRoots.length === 1, 'Expected one scene root with asset metadata');
  const instances = [];
  const seen = new Set();
  function visit(index) {
    require(!seen.has(index), 'Scene graph repeats or cycles through node ' + index);
    seen.add(index);
    const node = reference(nodes, index, 'node');
    if (node.mesh !== undefined) instances.push(reference(meshes, node.mesh, 'node mesh'));
    for (const child of node.children ?? []) visit(child);
  }
  for (const index of scene.nodes) visit(index);
  require(instances.length, 'Scene contains no mesh instances');
  const meshTriangles = new Map();
  for (const mesh of instances) {
    if (meshTriangles.has(mesh)) continue;
    let triangles = 0;
    for (const primitive of mesh.primitives) {
      const position = reference(accessors, primitive.attributes.POSITION, 'mesh POSITION');
      require((primitive.mode ?? 4) === 4 && position.type === 'VEC3' && position.componentType === 5126, 'Expected triangle geometry with floating point positions');
      if (primitive.material !== undefined) reference(materials, primitive.material, 'mesh material');
      for (const attribute of Object.values(primitive.attributes)) {
        require(reference(accessors, attribute, 'vertex attribute').count === position.count, 'Inconsistent vertex attribute count');
      }
      let elementCount = position.count;
      if (primitive.indices !== undefined) {
        const accessor = reference(accessors, primitive.indices, 'triangle index accessor');
        const view = bufferViews[accessor.bufferView];
        const width = componentBytes[accessor.componentType];
        require(accessor.type === 'SCALAR' && [5121, 5123, 5125].includes(accessor.componentType) && !view.byteStride, 'Invalid triangle index accessor');
        const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
        for (let offset = start; offset < start + accessor.count * width; offset += width) {
          require(bin.readUIntLE(offset, width) < position.count, 'Triangle index is outside the vertex array');
        }
        elementCount = accessor.count;
      }
      require(elementCount % 3 === 0, 'Invalid triangle element count');
      triangles += elementCount / 3;
    }
    meshTriangles.set(mesh, triangles);
  }

  const imageViews = new Set(images.map(image => {
    require(!Object.hasOwn(image, 'uri') && ['image/png', 'image/jpeg'].includes(image.mimeType), 'Expected embedded PNG or JPEG textures');
    return reference(bufferViews, image.bufferView, 'image buffer view');
  }));
  for (const texture of textures) {
    reference(images, texture.source, 'texture image');
    if (texture.sampler !== undefined) reference(doc.samplers, texture.sampler, 'texture sampler');
  }
  for (const material of materials) {
    const pbr = material.pbrMetallicRoughness;
    for (const slot of [pbr?.baseColorTexture, pbr?.metallicRoughnessTexture, material.normalTexture, material.occlusionTexture, material.emissiveTexture]) {
      if (slot) reference(textures, slot.index, 'material texture');
    }
  }

  const clipNames = new Set();
  for (const clip of animations) {
    require(typeof clip.name === 'string' && !clipNames.has(clip.name), 'Missing or duplicate animation name');
    clipNames.add(clip.name);
    for (const channel of clip.channels) {
      const sampler = reference(clip.samplers, channel.sampler, 'animation sampler');
      const target = reference(nodes, channel.target.node, 'animation target');
      require(seen.has(channel.target.node) && target !== assetRoots[0] && target.name !== 'Facing', 'Animation moves the game-owned root or facing marker, or targets a hidden node');
      const input = reference(accessors, sampler.input, 'animation timestamp accessor');
      const output = reference(accessors, sampler.output, 'animation keyframe accessor');
      const outputType = { translation: 'VEC3', rotation: 'VEC4', scale: 'VEC3' }[channel.target.path];
      const interpolation = sampler.interpolation ?? 'LINEAR';
      require(input.type === 'SCALAR' && input.componentType === 5126 && outputType && output.type === outputType &&
        output.componentType === 5126 && ['LINEAR', 'STEP', 'CUBICSPLINE'].includes(interpolation) &&
        output.count === input.count * (interpolation === 'CUBICSPLINE' ? 3 : 1), 'Invalid animation keyframe data');
    }
  }

  const triangles = instances.reduce((sum, mesh) => sum + meshTriangles.get(mesh), 0);
  require(triangles > 0, 'Verified scene contains no triangles');
  return {
    glbBytes: bytes.length, triangles, textures: textures.length, images: images.length,
    textureBytes: [...imageViews].reduce((sum, view) => sum + view.byteLength, 0),
  };
}

export function inspectAcceptance(spec, metrics, failures) {
  const report = (field, message, actual, expected) => failures.push({ field, message, actual, expected });
  for (const [limit, metric] of Object.entries(limits)) {
    if (Number.isFinite(metrics[metric]) && metrics[metric] > spec.budget[limit]) {
      report(limit, metric + ' exceeds the budget', metrics[metric], spec.budget[limit]);
    }
  }
  if (!metrics.bounds) return;
  for (const [index, axis] of ['width', 'height', 'depth'].entries()) {
    const actual = metrics.bounds.size[index];
    const [min, max] = spec.dimensions[axis];
    if (!Number.isFinite(actual) || actual < min || actual > max) {
      report('dimensions.' + axis, 'Model dimension outside the allowed range', actual, [min, max]);
    }
  }
  const tolerance = spec.dimensions.groundTolerance;
  if (!Number.isFinite(metrics.bounds.min[1]) || Math.abs(metrics.bounds.min[1]) > tolerance) {
    report('dimensions.groundTolerance', 'Resting model misses ground level', metrics.bounds.min[1], [-tolerance, tolerance]);
  }
  if (!metrics.origin.every(value => Number.isFinite(value) && Math.abs(value) <= 0.001)) {
    report('origin', 'Model origin is not at ground center', metrics.origin, [0, 0, 0]);
  }
  const marker = metrics.facing;
  if (!marker || Math.abs(marker[0]) > 0.001 || marker[2] <= 0) {
    report('forward', 'Facing marker does not point along +Z', marker, '+Z');
  }
  for (const field of ['units', 'up', 'forward']) {
    if (metrics.metadata[field] !== spec[field]) report(field, 'GLB metadata disagrees with specification', metrics.metadata[field], spec[field]);
  }
  const collider = metrics.metadata.collider;
  const expectedCollider = spec.collider;
  const matches = ['shape', 'radius', 'height'].every(key => collider?.[key] === expectedCollider[key]) &&
    Array.isArray(collider?.center) && collider.center.length === 3 &&
    collider.center.every((coordinate, i) => coordinate === expectedCollider.center[i]);
  if (!matches || expectedCollider.height > metrics.bounds.max[1] || expectedCollider.radius * 2 > metrics.bounds.size[0]) {
    report('collider', 'Collision metadata differs from the spec or exceeds the model body', collider, expectedCollider);
  }
  for (const [name, expected] of Object.entries(spec.animations)) {
    const actual = metrics.animations[name];
    if (!actual || Math.abs(actual.duration - expected.duration) > 0.001 || !actual.changesPose ||
      (expected.loop && !actual.loopMatches) || actual.groundDeviation > tolerance) {
      report('animations.' + name, 'Missing clip, duration mismatch, unchanged pose, loop discontinuity or bad ground contact', actual ?? null, { ...expected, groundTolerance: tolerance });
    }
  }
}
