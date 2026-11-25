import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const up = new THREE.Vector3(0, 1, 0);

export function buildMossWarden(spec) {
  let seed = spec.seed >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const color = Object.fromEntries(Object.entries(spec.art.palette).map(([name, hex]) => [name, new THREE.Color(hex)]));
  const surface = new THREE.MeshStandardMaterial({ name: 'Painted bark and moss', vertexColors: true, roughness: 0.93 });
  const heartwood = new THREE.MeshStandardMaterial({
    name: 'Amber heartwood', vertexColors: true, roughness: 0.6,
    emissive: color.ember, emissiveIntensity: 0.65,
  });
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'MossWarden';
  root.userData = { assetId: spec.id, units: spec.units, up: spec.up, forward: spec.forward, collider: spec.collider };
  scene.add(root);

  const parts = {};
  function part(name, parent, position) {
    const node = new THREE.Group();
    node.name = name;
    node.position.fromArray(position);
    parent.add(node);
    return parts[name] = { node, bark: [], glow: [] };
  }

  function paint(target, input, position, rotation, scale, tone, glow = false) {
    const geometry = input.index ? input.toNonIndexed() : input;
    const orientation = rotation instanceof THREE.Quaternion ? rotation : new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), orientation, new THREE.Vector3(...scale)));
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('normal');
    geometry.computeVertexNormals();
    const colors = [];
    for (let i = 0; i < geometry.attributes.position.count; i += 3) {
      const shade = color[tone].clone().multiplyScalar(0.87 + random() * 0.24);
      for (let j = 0; j < 3; j++) colors.push(shade.r, shade.g, shade.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    (glow ? target.glow : target.bark).push(geometry);
    if (geometry !== input) input.dispose();
  }

  function lump(target, tone, position, scale, rotation = [0, 0, 0], detail = 0, glow = false) {
    paint(target, new THREE.IcosahedronGeometry(1, detail), position, rotation, scale, tone, glow);
  }

  function limb(target, tone, from, to, startRadius, endRadius, sides = 6) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const delta = end.clone().sub(start);
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize());
    paint(target, new THREE.CylinderGeometry(endRadius, startRadius, delta.length(), sides), start.lerp(end, 0.5).toArray(), rotation, [1, 1, 1], tone);
  }

  function plate(target, tone, points, depth, position, rotation = [0, 0, 0]) {
    const shape = new THREE.Shape(points.map(point => new THREE.Vector2(...point)));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.016, bevelSegments: 1, curveSegments: 1,
    });
    paint(target, geometry, position, rotation, [1, 1, 1], tone);
  }

  const hip = part('Hip', root, [0, 1.06, 0]);
  const chest = part('Chest', hip.node, [0, 0.53, 0]);
  const head = part('Head', chest.node, [0, 0.65, 0.23]);
  const facing = new THREE.Object3D();
  facing.name = 'Facing';
  facing.position.set(0, 1.5, 1);
  root.add(facing);

  lump(hip, 'darkBark', [0, 0.05, 0], [0.51, 0.31, 0.35], [0, 0.2, 0], 1);
  lump(hip, 'stone', [0, 0.03, -0.21], [0.41, 0.23, 0.25], [0, 0.2, 0]);
  lump(chest, 'darkBark', [0, 0.25, 0], [0.76, 0.72, 0.44], [0.13, 0, 0], 1);
  lump(chest, 'bark', [0, 0.42, -0.17], [0.72, 0.56, 0.42], [0.1, 0, 0], 1);
  lump(chest, 'wood', [0, 0.30, 0.31], [0.44, 0.50, 0.18], [0, 0, 0], 1);
  lump(chest, 'darkBark', [0, 0.29, 0.47], [0.25, 0.34, 0.09], [0, 0, 0.24], 1);
  lump(chest, 'ember', [0, 0.29, 0.50], [0.13, 0.21, 0.086], [0, 0, 0.24], 0, true);

  for (const side of [-1, 1]) {
    for (let rib = 0; rib < 3; rib++) {
      const offset = rib * 0.19;
      const points = [[0.13, -0.07], [0.3, 0.11], [0.55, 0.18], [0.63, 0.06], [0.5, -0.065], [0.25, -0.15]];
      plate(chest, rib === 1 ? 'wood' : 'bark', points.map(([x, y]) => [side * x, y]), 0.07, [0, 0.49 - offset, 0.37 - rib * 0.014], [0, side * 0.3, -side * 0.06]);
      limb(chest, 'cutWood', [side * 0.31, 0.43 - offset, 0.47], [side * 0.54, 0.54 - offset, 0.32], 0.015, 0.005, 4);
    }
    limb(chest, 'bark', [side * 0.31, 0.48, -0.28], [side * 0.41, 0.92, -0.43], 0.12, 0.048);
    limb(chest, 'wood', [side * 0.41, 0.92, -0.43], [side * 0.54, 1.21 + side * 0.03, -0.43], 0.051, 0.006);
    limb(chest, 'cutWood', [side * 0.44, 0.97, -0.43], [side * 0.3, 1.14, -0.48], 0.032, 0.004, 5);

    const thigh = part(side < 0 ? 'LeftThigh' : 'RightThigh', hip.node, [side * 0.34, -0.03, 0]);
    const shin = part(side < 0 ? 'LeftShin' : 'RightShin', thigh.node, [side * 0.085, -0.51, 0.045]);
    limb(thigh, 'bark', [0, 0.05, 0], [side * 0.075, -0.5, 0.03], 0.242, 0.197);
    lump(thigh, 'wood', [side * 0.01, -0.22, 0.16], [0.23, 0.29, 0.15], [0, 0.1, -side * 0.17], 1);
    lump(shin, 'stone', [0, -0.05, 0.13], [0.22, 0.21, 0.19], [0, 0, side * 0.23], 1);
    limb(shin, 'darkBark', [0, 0.02, 0.01], [side * 0.045, -0.42, -0.02], 0.197, 0.174);
    plate(shin, 'bark', [[-0.17, 0.03], [-0.19, -0.24], [-0.11, -0.34], [0.14, -0.28], [0.2, -0.06], [0.09, 0.12]], 0.08, [0, -0.12, 0.10]);
    lump(shin, 'darkBark', [side * 0.06, -0.43, 0.1], [0.26, 0.097, 0.33], [0, side * 0.16, 0], 1);
    for (let toe = -1; toe <= 1; toe++) {
      limb(shin, 'wood', [toe * 0.128 + side * 0.045, -0.43, 0.20], [toe * 0.157 + side * 0.07, -0.46, 0.43 - Math.abs(toe) * 0.05], 0.086, 0.037, 5);
    }

    const arm = part(side < 0 ? 'LeftArm' : 'RightArm', chest.node, [side * 0.66, 0.47, -0.015]);
    arm.node.rotation.z = side * 0.14;
    const forearm = part(side < 0 ? 'LeftForearm' : 'RightForearm', arm.node, [side * 0.12, -0.59, 0.025]);
    forearm.node.rotation.x = -0.1;
    lump(arm, 'bark', [side * 0.13, -0.15, 0], [0.37, 0.47, 0.33], [0, 0, side * 0.35], 1);
    lump(arm, 'stone', [side * 0.14, 0.095, -0.035], [0.43, 0.36, 0.37], [0.1, 0, side * 0.27], 1);
    lump(arm, 'moss', [side * 0.17, 0.27, -0.07], [0.40, 0.235, 0.31], [-0.13, 0, side * 0.19], 1);
    limb(arm, 'darkBark', [side * 0.1, -0.14, 0], [side * 0.13, -0.55, 0.01], 0.26, 0.2);
    for (let i = 0; i < 15; i++) {
      const a = random() * Math.PI * 2;
      const radius = 0.10 + random() * 0.23;
      const x = side * 0.16 + Math.cos(a) * radius;
      const z = -0.06 + Math.sin(a) * radius * 0.75;
      const y = 0.38 + random() * 0.10 - radius * 0.36;
      const size = 0.035 + random() * 0.06;
      lump(arm, i % 6 === 0 ? 'lichen' : 'leaf', [x, y, z], [size * 1.45, size * 0.83, size], [0.3, a, 0.1]);
    }
    const fork = [side * 0.35, 0.47, -0.16];
    limb(arm, 'wood', [side * 0.25, 0.22, -0.1], fork, 0.103, 0.057);
    limb(arm, 'cutWood', fork, [side * 0.48, 0.67, -0.22], 0.055, 0.006);
    limb(arm, 'wood', fork, [side * 0.54, 0.48, -0.10], 0.038, 0.005);

    limb(forearm, 'bark', [0, 0.04, 0], [side * 0.10, -0.58, 0.045], 0.22, 0.27);
    lump(forearm, 'wood', [side * 0.1, -0.28, 0.14], [0.24, 0.37, 0.15], [0, 0, side * 0.2], 1);
    lump(forearm, 'moss', [side * 0.24, -0.20, -0.02], [0.15, 0.24, 0.22], [0, 0, side * 0.12], 1);
    if (side < 0) {
      const blade = [[-0.09, 0.10], [-0.31, -0.02], [-0.52, -0.34], [-0.49, -0.64], [-0.27, -0.93], [-0.12, -0.90], [-0.23, -0.69], [-0.18, -0.49], [0.07, -0.28]];
      const edge = [[-0.32, -0.14], [-0.52, -0.34], [-0.49, -0.64], [-0.27, -0.93], [-0.12, -0.90], [-0.32, -0.72], [-0.41, -0.57], [-0.43, -0.34]];
      plate(forearm, 'darkBark', blade, 0.18, [-0.13, -0.36, 0.04], [0, 0.10, -0.12]);
      plate(forearm, 'stone', edge, 0.125, [-0.13, -0.36, 0.09], [0, 0.10, -0.12]);
      limb(forearm, 'cutWood', [-0.19, -0.40, 0.20], [-0.43, -0.75, 0.23], 0.043, 0.009, 5);
      limb(forearm, 'wood', [-0.43, -0.75, 0.23], [-0.39, -1.00, 0.23], 0.023, 0.007, 5);
    } else {
      lump(forearm, 'darkBark', [0.11, -0.59, 0.09], [0.27, 0.25, 0.23], [0, 0.2, 0.1], 1);
      for (let i = 0; i < 3; i++) {
        const x = i * 0.14 - 0.01;
        limb(forearm, 'wood', [x, -0.58, 0.19], [x + 0.07, -0.83 + i * 0.03, 0.28], 0.071, 0.017, 5);
      }
    }
  }

  lump(head, 'darkBark', [0, 0.08, 0], [0.38, 0.39, 0.34], [0, 0, 0], 1);
  lump(head, 'bark', [0, 0.25, -0.035], [0.36, 0.31, 0.33], [0.12, 0, 0], 1);
  lump(head, 'moss', [0, 0.38, -0.15], [0.32, 0.19, 0.25], [0, 0, -0.14], 1);
  lump(head, 'darkBark', [0, 0.105, 0.265], [0.32, 0.18, 0.084], [0, 0, 0], 1);
  for (const side of [-1, 1]) {
    lump(head, 'ember', [side * 0.151, 0.126, 0.335], [0.104, 0.045, 0.026], [0, side * 0.21, side * 0.29], 0, true);
    limb(head, 'wood', [side * 0.037, 0.15, 0.35], [side * 0.27, 0.26, 0.22], 0.056, 0.093);
    limb(head, 'bark', [side * 0.24, 0.07, 0.25], [side * 0.12, -0.23, 0.245], 0.083, 0.032);
    lump(head, 'lichen', [side * 0.23, 0.36, 0.03], [0.13, 0.075, 0.115]);
  }
  limb(head, 'cutWood', [0, 0.27, 0.31], [0, 0.026, 0.37], 0.041, 0.055, 5);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.10;
    limb(chest, 'wood', [x, -0.05, -0.38], [x - 0.04, 0.56, -0.57 + Math.abs(x) * 0.18], 0.052, 0.077, 5);
    lump(chest, i % 2 ? 'leaf' : 'moss', [x * 1.8, 0.69 - Math.abs(x) * 0.8, -0.43], [0.17, 0.16, 0.10], [0, 0, x], 0);
  }

  for (const { node, bark, glow } of Object.values(parts)) {
    for (const [geometries, material, label] of [[bark, surface, 'Surface'], [glow, heartwood, 'Glow']]) {
      if (!geometries.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
      mesh.name = node.name + label;
      node.add(mesh);
      geometries.forEach(geometry => geometry.dispose());
    }
  }
  return { scene, animations: createAnimations(root, parts, spec.animations) };
}

function createAnimations(root, parts, definitions) {
  const groundY = new THREE.Box3().setFromObject(root, true).min.y;
  const sampledBounds = new THREE.Box3();
  const mixer = new THREE.AnimationMixer(root);
  const walk = (side, sign) => [[0.31 * sign, 0, 0], [0, 0, 0], [-0.31 * sign, 0, 0], [0, 0, 0], [0.31 * sign, 0, 0]].map(
    ([x, y, z]) => [x * side, y, z],
  );
  const presets = {
    Idle: {
      stops: [0, 0.25, 0.5, 0.75, 1], bob: [0, 0.017, 0.027, 0.013, 0],
      Chest: [[0,0,0], [-0.018,0.028,0.01], [-0.03,0,0], [-0.016,-0.025,-0.01], [0,0,0]],
      Head: [[0,0,0], [0,-0.05,0], [0.03,0,0], [0,0.045,0], [0,0,0]],
    },
    Walk: {
      stops: [0, 0.25, 0.5, 0.75, 1], bob: [0.02, 0.046, 0.02, 0.046, 0.02],
      LeftThigh: walk(1, 1), RightThigh: walk(-1, 1),
      LeftArm: walk(-1, 1), RightArm: walk(1, 1),
      LeftShin: [[-0.25], [-0.08], [0.18], [0], [-0.25]],
      RightShin: [[0.18], [0], [-0.25], [-0.08], [0.18]],
    },
    Attack: {
      stops: [0, 0.28, 0.48, 0.76 / 1.3, 0.78, 1], bob: [0, -0.07, 0.075, -0.14, -0.10, 0],
      Chest: [[0,0,0], [-0.12,0.46,0.12], [-0.20,0.79,0.12], [0.21,-0.57,-0.08], [0.13,-0.63,-0.09], [0,0,0]],
      LeftArm: [[0,0,0], [-0.65,0.35,-0.42], [-1.22,0.45,-0.75], [-0.96,-0.25,0.64], [-0.51,-0.53,0.58], [0,0,0]],
      LeftForearm: [[0,0,0], [-0.34,0,-0.2], [-0.64,0,-0.11], [0.05,0.18,0.04], [0.21,0.21,0.13], [0,0,0]],
      RightArm: [[0,0,0], [-0.22,0,0.28], [-0.35,0,0.45], [0.20,0,0.44], [0.06,0,0.23], [0,0,0]],
      LeftThigh: [[0], [-0.12], [0.10], [-0.38], [-0.27], [0]],
      RightThigh: [[0], [-0.16], [0.06], [0.19], [0.13], [0]],
      LeftShin: [[0], [0.15], [-0.20], [0.32], [0.21], [0]],
      RightShin: [[0], [0.19], [-0.19], [0.14], [0.09], [0]],
    },
    Hit: {
      stops: [0, 0.4375, 1], bob: [0, -0.09, 0],
      Chest: [[0,0,0], [-0.21,0.07,0.15], [0,0,0]],
      Head: [[0,0,0], [-0.21,0.16,0.08], [0,0,0]],
      LeftArm: [[0,0,0], [0.17,0,-0.24], [0,0,0]],
      RightArm: [[0,0,0], [0.16,0,0.31], [0,0,0]],
    },
    Death: {
      stops: [0, 0.30, 0.67, 1], bob: [0, -0.11, -0.38, -0.55],
      Hip: [[0,0,0], [0.14,0,0.05], [0.55,0,-0.17], [1.20,0,-0.22]],
      Chest: [[0,0,0], [0.21,0.08,0.07], [0.35,-0.10,-0.18], [0.33,-0.07,-0.27]],
      Head: [[0,0,0], [0.14,0,0.02], [0.23,0.08,0.04], [0.34,0.13,0.14]],
      LeftArm: [[0,0,0], [-0.21,0,-0.12], [0.22,0.22,-0.42], [-0.30,0.32,-0.92]],
      RightArm: [[0,0,0], [-0.36,0,0.23], [-0.51,0.15,0.84], [-0.35,0.12,0.97]],
      LeftThigh: [[0,0,0], [-0.24], [-0.70], [-0.95]],
      RightThigh: [[0,0,0], [-0.17], [-0.49], [-0.82]],
    },
  };
  return Object.entries(definitions).map(([name, { duration }]) => {
    const { stops, bob, ...rotations } = presets[name];
    const times = stops.map(fraction => fraction * duration);
    const tracks = Object.entries(rotations).map(([part, values]) => {
      const node = parts[part].node;
      const keys = values.flatMap(angles => node.quaternion.clone()
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles))).toArray());
      return new THREE.QuaternionKeyframeTrack(node.name + '.quaternion', times, keys);
    });
    const chest = parts.Chest.node.position;
    const chestKeys = bob.flatMap(dy => [chest.x, chest.y + dy * (name === 'Death' ? 0.22 : 0.65), chest.z]);
    tracks.push(new THREE.VectorKeyframeTrack('Chest.position', times, chestKeys));

    // Bake ground contact for the articulated mesh, including the blade during the fall.
    const clip = new THREE.AnimationClip(name, duration, tracks);
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
    const hip = parts.Hip.node.position.clone();
    const frames = Math.ceil(duration * 60);
    const groundTimes = Array.from({ length: frames + 1 }, (_, frame) => frame * duration / frames);
    action.clampWhenFinished = true;
    action.play();
    const hipKeys = groundTimes.flatMap(time => {
      action.time = time;
      mixer.update(0);
      const offset = groundY - sampledBounds.setFromObject(root, true).min.y;
      return [hip.x, hip.y + offset, hip.z];
    });
    mixer.uncacheClip(clip);
    tracks.push(new THREE.VectorKeyframeTrack('Hip.position', groundTimes, hipKeys));
    return clip;
  });
}

