import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const views = {
  front: [0, 0.16, 1],
  side: [-1, 0.13, 0],
  back: [0.12, 0.22, -1],
  isometric: [0.74, 0.90, 1],
  action: [0.72, 0.42, 1],
};

window.ready = (async () => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1b2623');
  scene.add(new THREE.HemisphereLight('#eff7dc', '#625365', 2.15));
  const key = new THREE.DirectionalLight('#fff3cf', 3.25);
  key.position.set(-3.5, 6, 4.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#afd5ce', 2.10);
  rim.position.set(2, 4, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#e2e8e3', 0.85);
  fill.position.set(3, 0.5, 4);
  scene.add(fill);

  const stage = new THREE.Group();
  scene.add(stage);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(7.2, 64),
    new THREE.MeshStandardMaterial({ color: '#222b28', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.036;
  stage.add(ground);
  const grid = new THREE.GridHelper(8, 16, '#475c50', '#303f38');
  grid.position.y = -0.028;
  stage.add(grid);
  for (let i = 0; i < 6; i++) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.05 - i * 0.10, 40),
      new THREE.MeshBasicMaterial({ color: '#101613', transparent: true, opacity: 0.14 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.y = 0.76;
    shadow.position.y = -0.023 + i * 0.001;
    stage.add(shadow);
  }

  const [asset, spec] = await Promise.all([
    new GLTFLoader().loadAsync('/candidate.glb'),
    fetch('/spec.json').then(response => response.json()),
  ]);
  scene.add(asset.scene);
  scene.updateMatrixWorld(true);
  const root =
    asset.scene.children.find(node => node.userData.assetId === spec.id);
  if (!root) throw new Error('GLB has no asset root for ' + spec.id);
  const mixer = new THREE.AnimationMixer(asset.scene);
  const animations = new Map(asset.animations.map(clip => [clip.name, clip]));
  const camera = new THREE.OrthographicCamera();
  const bounds = () => new THREE.Box3().setFromObject(asset.scene, true);
  const rest = bounds();
  const position = object => object.getWorldPosition(new THREE.Vector3()).toArray();
  const facing = root.getObjectByName('Facing');
  const restCenter = rest.getCenter(new THREE.Vector3());
  const restSize = rest.getSize(new THREE.Vector3());
  const stats = {
    bounds: { min: rest.min.toArray(), max: rest.max.toArray(), size: restSize.toArray() },
    origin: position(root), facing: facing ? position(facing) : null, metadata: root.userData,
    animations: {}, drawCalls: 0,
  };
  document.querySelector('h1').textContent = spec.name;
  document.querySelector('#asset-version').textContent = spec.id + ' · ' + spec.version;

  function pose(name, time) {
    mixer.stopAllAction();
    if (!name) return;
    const clip = animations.get(name);
    if (!clip) throw new Error('Missing animation: ' + name);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.reset().play();
    action.time = Math.min(time, clip.duration);
    mixer.update(0);
  }

  function render(view, name, time) {
    pose(name, time);
    const current = bounds();
    const target = name ? current.getCenter(new THREE.Vector3()) : restCenter.clone();
    if (name !== 'Death') target.y = Math.max(target.y, restCenter.y - 0.05) + 0.13;
    const radius = Math.max(restSize.y * 0.73, current.getSize(new THREE.Vector3()).length() * 0.56);
    const ratio = window.innerWidth / window.innerHeight;
    camera.left = -radius * ratio;
    camera.right = radius * ratio;
    camera.top = radius;
    camera.bottom = -radius;
    camera.near = 0.1;
    camera.far = 50;
    camera.updateProjectionMatrix();
    camera.position.copy(target).add(new THREE.Vector3(...views[view]).normalize().multiplyScalar(8));
    camera.lookAt(target);
    stage.visible = false;
    renderer.render(scene, camera);
    stats.drawCalls = Math.max(stats.drawCalls, renderer.info.render.calls);
    stage.visible = true;
    renderer.render(scene, camera);
    document.querySelector('output').textContent = name ? name + ' · ' + time.toFixed(2) + ' s' : view;
  }

  const textures = await asset.parser.getDependencies("texture");
  stats.texturePixels = textures.reduce((sum, texture) => {
    const { width, height } = texture.image;
    if (!width || !height) throw new Error('Embedded texture has no decoded dimensions');
    return sum + width * height;
  }, 0);
  const poseSignature = () => {
    scene.updateMatrixWorld(true);
    const matrices = [];
    root.traverse(child => {
      if (child.isMesh) matrices.push(...child.matrixWorld.elements);
    });
    return matrices;
  };
  const differs = (a, b) => a.some((value, index) => Math.abs(value - b[index]) > 0.001);
  for (const clip of asset.animations) {
    const definition = spec.animations[clip.name];
    const time = definition?.sample ?? clip.duration / 2;
    pose(clip.name, 0);
    const start = poseSignature();
    pose(clip.name, time);
    const atSample = poseSignature();
    const animatedBounds = bounds();
    pose(clip.name, clip.duration);
    const loopMatches = !differs(start, poseSignature());
    let groundDeviation = 0;
    const steps = Math.ceil(clip.duration * 30);
    for (let i = 0; i <= steps; i++) {
      pose(clip.name, clip.duration * i / steps);
      groundDeviation = Math.max(groundDeviation, Math.abs(bounds().min.y));
    }
    stats.animations[clip.name] = {
      duration: clip.duration, tracks: clip.tracks.length, sample: time,
      changesPose: differs(atSample, start), loopMatches, groundDeviation,
      bounds: { min: animatedBounds.min.toArray(), max: animatedBounds.max.toArray() },
    };
  }

  async function benchmark() {
    render('isometric');
    stage.visible = false;
    const gl = renderer.getContext();
    await renderer.compileAsync(scene, camera);
    const samples = [];
    for (let index = 0; index < 52; index++) {
      await new Promise(requestAnimationFrame);
      const start = performance.now();
      const walk = animations.get('Walk');
      if (walk) pose('Walk', (index / 60) % walk.duration);
      renderer.render(scene, camera);
      gl.finish();
      if (index >= 12) samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    stage.visible = true;
    render('isometric');
    return {
      ...stats,
      frameP95Ms: samples[Math.ceil(samples.length * 0.95) - 1],
      benchmark: {
        renderer: rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        viewport: [window.innerWidth, window.innerHeight],
        sampleCount: samples.length,
        warmupCount: 12,
        method: 'Single animated model; animation update, render submission and gl.finish elapsed time. Floor and grid hidden.',
      },
    };
  }

  return { render, benchmark };
})();

