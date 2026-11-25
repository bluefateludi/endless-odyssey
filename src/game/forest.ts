import * as THREE from 'three'
import type { GameStage } from './contracts'

type Obstacle = (x: number, z: number, width: number, depth: number) => () => void
type Style = 'bark' | 'leaf' | 'stone' | 'ground' | 'grass' | 'glow' | 'glowTeal'

export interface Forest {
  setGate: (index: number, closed: boolean) => void
  update: (time: number, stage: GameStage) => void
}

export function seededRandom(seed: number): () => number {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

const pathCenter = (z: number) => Math.sin(z * 0.17) * 0.7
const hues = {
  trees: [0x243d35, 0x294b3d, 0x35513c, 0x305b4b, 0x3d6450, 0x263d44, 0x37534d],
  grass: [0x375339, 0x455b3d, 0x536444, 0x496447, 0x5d6547, 0x34493a],
  stone: [0x525b50, 0x5f685b, 0x4b5149, 0x6b7064, 0x404f48, 0x646457, 0x4e625b],
  moss: [0x4b603e, 0x5f704a, 0x69764c, 0x3c5c43],
}

export function buildForest(scene: THREE.Scene, addObstacle: Obstacle): Forest {
  const forest = new THREE.Group()
  forest.name = '林间遗迹'
  scene.add(forest)
  const random = seededRandom(793112)
  const range = (min: number, max: number) => min + random() * (max - min)
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]
  const glowAmber = 0xe9af6a
  const glowTeal = 0x8df5dc

  const terrain = new THREE.PlaneGeometry(131, 135, 104, 105)
  terrain.rotateX(-Math.PI / 2).translate(0, -0.035, -12)
  const terrainPositions = terrain.getAttribute('position')
  const groundColors = []
  const darkGrass = new THREE.Color(0x273a31)
  const lightGrass = new THREE.Color(0x3a4933)
  const warmTrail = new THREE.Color(0x6a6450)
  const bossGround = new THREE.Color(0x4c5041)
  const groundColor = new THREE.Color()
  for (let i = 0; i < terrainPositions.count; i++) {
    const x = terrainPositions.getX(i)
    const z = terrainPositions.getZ(i)
    const roughness = 0.5 + Math.sin(x * 0.42 + z * 0.18) * 0.24 + Math.cos(z * 0.68 - x * 1.15) * 0.13
    groundColor.copy(darkGrass).lerp(lightGrass, THREE.MathUtils.clamp(roughness + range(-0.12, 0.12), 0, 1))
    const ring = Math.hypot(x, z + 34)
    const court = Math.hypot(x * 1.25, z + 14)
    const laneWidth = z > 7 ? 3.3 : 2.5
    const lane = 1 - THREE.MathUtils.smoothstep(Math.abs(x - pathCenter(z)), laneWidth * 0.35, laneWidth + roughness)
    if (court < 7) groundColor.lerp(warmTrail, (1 - court / 7) * 0.65)
    if (ring < 8) groundColor.lerp(bossGround, THREE.MathUtils.clamp((8 - ring) / 2, 0, 1))
    if (z > -42 && z < 18) groundColor.lerp(warmTrail, lane * 0.72)
    groundColor.multiplyScalar(range(0.88, 1.14))
    groundColors.push(groundColor.r, groundColor.g, groundColor.b)
    if (Math.abs(x) > 8.6) terrainPositions.setY(i, -0.07 + roughness * range(0.02, 0.35))
  }
  terrain.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3))
  terrain.computeVertexNormals()
  const earth = new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }))
  earth.receiveShadow = true
  forest.add(earth)

  const geometries = {
    cone: new THREE.ConeGeometry(1, 1, 7, 1),
    trunk: new THREE.CylinderGeometry(0.67, 1, 1, 6),
    stone: new THREE.DodecahedronGeometry(1),
    box: new THREE.BoxGeometry(1, 1, 1),
    petal: new THREE.ConeGeometry(1, 1, 3, 1),
    diamond: new THREE.OctahedronGeometry(1),
  }
  const surfaces: Record<Style, THREE.Material> = {
    bark: new THREE.MeshStandardMaterial({ roughness: 0.99, flatShading: true }),
    leaf: new THREE.MeshStandardMaterial({ roughness: 0.93, flatShading: true }),
    stone: new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true }),
    ground: new THREE.MeshStandardMaterial({ roughness: 0.99, flatShading: true }),
    grass: new THREE.MeshStandardMaterial({ roughness: 0.99, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ toneMapped: false }),
    glowTeal: new THREE.MeshBasicMaterial({ toneMapped: false }),
  }
  type GeometryName = keyof typeof geometries
  const batches = new Map<string, { shape: GeometryName; style: Style; transforms: THREE.Matrix4[]; colors: number[] }>()
  const placement = new THREE.Object3D()
  const tint = new THREE.Color()
  function part(shape: GeometryName, style: Style, color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, tilt = 0) {
    const key = style + ' ' + shape
    let batch = batches.get(key)
    if (!batch) {
      batch = { shape, style, transforms: [], colors: [] }
      batches.set(key, batch)
    }
    placement.position.set(x, y, z)
    placement.rotation.set(tilt, yaw, tilt * 0.62)
    placement.scale.set(sx, sy, sz)
    placement.updateMatrix()
    batch.transforms.push(placement.matrix.clone())
    batch.colors.push(color)
  }

  for (let i = 0; i < 200; i++) {
    const z = range(-54, 27)
    const x = (random() > 0.5 ? 1 : -1) * range(6.9, 35)
    const close = Math.abs(x) < 10.3
    const size = range(0.75, 1.42) * (close ? 0.88 : 1)
    const lean = range(-0.17, 0.18)
    const turn = range(0, 6.28)
    part('trunk', 'bark', pick([0x493e31, 0x3f3b2f, 0x504536]), x, 1.55 * size, z, 0.22 * size, 3.3 * size, 0.22 * size, turn, lean)
    if (i % 5 === 0) {
      part('trunk', 'bark', 0x534b3b, x - 0.66 * size, 2.0 * size, z, 0.11 * size, 1.7 * size, 0.1, turn, 0.67)
      part('stone', 'leaf', pick(hues.trees), x - 0.56 * size, (close ? 3.8 : 3.46) * size, z, 1.44 * size, 1.28 * size, 1.18 * size, turn, lean)
      part('stone', 'leaf', pick(hues.trees), x + 0.65 * size, 4.25 * size, z + 0.33, 1.32 * size, 1.18 * size, 1.48 * size, turn, 0.22)
    } else {
      const firstLayer = close ? 2.84 : 2.25
      for (let layer = 0; layer < 3; layer++) {
        const width = (1.41 - layer * 0.25) * size
        part('cone', 'leaf', pick(hues.trees), x + lean * layer, (firstLayer + layer * 0.85) * size, z, width, (2.14 - layer * 0.12) * size, width * range(0.85, 1.12), turn + layer * 0.45, lean * 0.5)
      }
    }
    if (close && Math.abs(x) < 8.2 && z < 18 && z > -43) addObstacle(x, z, 0.55 * size, 0.55 * size)
  }

  for (let index = 0; index < 232; index++) {
    const z = range(-43, 18)
    const x = range(-7.9, 7.9)
    const width = Math.abs(x - pathCenter(z))
    if (width > 3.4 && random() < 0.82) continue
    if (Math.hypot(x, z + 34) < 5.8 && random() < 0.64) continue
    const flatness = range(0.035, 0.105)
    part('stone', 'ground', pick(hues.stone), x, -0.03, z, range(0.18, 0.61), flatness, range(0.16, 0.52), range(0, 6.28), range(-0.14, 0.14))
  }

  for (let index = 0; index < 940; index++) {
    const z = range(-49, 22)
    const x = range(-16, 16)
    if (Math.abs(x - pathCenter(z)) < 2 && random() < 0.86) continue
    if (Math.hypot(x, z + 34) < 5.2 && random() < 0.92) continue
    const height = range(0.12, 0.42)
    const color = pick(hues.grass)
    const angle = range(0, 6.28)
    part('petal', 'grass', color, x, height * 0.42, z, 0.055, height, 0.036, angle, range(-0.36, 0.36))
    part('petal', 'grass', color, x + 0.08, height * 0.35, z - 0.06, 0.069, height * 0.78, 0.032, angle + 1.15, -0.51)
    if (random() < 0.032) {
      part('diamond', 'glowTeal', pick([0x688878, 0x8ec0a0, 0xb18364]), x, height, z, 0.024, 0.04, 0.023, angle)
    }
  }

  for (let index = 0; index < 150; index++) {
    const z = range(-49, 19)
    const x = (random() < 0.5 ? -1 : 1) * range(5.65, 18.5)
    const size = range(0.18, 1.11)
    const angle = range(0, 6.28)
    const height = range(0.61, 1)
    part('stone', 'stone', pick(hues.stone), x, size * 0.2, z, size, size * height, size * 0.79, angle, 0.16)
    if (index % 3 !== 0) part('stone', 'ground', pick(hues.moss), x, size * 0.68, z, size * 0.75, size * 0.27, size * 0.58, angle + 0.15, 0.13)
    if (size > 0.69 && Math.abs(x) < 7.65 && z < 17 && z > -43 && (Math.abs(z + 6) > 1.5 && Math.abs(z + 22) > 1.5)) addObstacle(x, z, size * 1.3, size * 1.06)
  }

  const fallenRoots = [{ x: 4.7, z: 3.8, turn: 0.42 }, { x: -4.6, z: -9.8, turn: -0.56 }, { x: 4.7, z: -19.3, turn: 0.15 }]
  for (const { x, z, turn } of fallenRoots) {
    part('trunk', 'bark', 0x544334, x, 0.43, z, 0.48, 2.28, 0.43, turn, 1.46)
    part('stone', 'ground', 0x576643, x + 0.17, 0.64, z - 0.42, 0.42, 0.3, 0.78, turn)
    part('stone', 'ground', 0x7f6546, x, 0.48, z + 0.94, 0.3, 0.35, 0.2, turn)
    addObstacle(x, z, 0.9, 1.8)
  }

  function pillar(x: number, z: number, height: number, angle: number, glowing: boolean) {
    for (let y = 0; y < height; y += 0.48) {
      const width = (y === 0 ? 0.93 : 0.67) * range(0.92, 1.13)
      part('box', 'stone', pick(hues.stone), x + range(-0.065, 0.065), y + 0.24, z, width, 0.445, 0.78, angle + range(-0.14, 0.14), range(-0.056, 0.056))
    }
    part('stone', 'ground', pick(hues.moss), x - 0.12, height, z + 0.1, 0.46, 0.19, 0.45, angle)
    if (glowing) {
      part('diamond', 'glowTeal', glowTeal, x, height * 0.68, z + 0.455, 0.053, 0.24, 0.035, angle)
      part('box', 'glowTeal', 0x5caaa0, x, height * 0.69 - 0.03, z + 0.45, 0.24, 0.03, 0.04, angle)
    }
    addObstacle(x, z, 0.7, 0.7)
  }
  for (const z of [-6, -22]) {
    pillar(-2.7, z, 2.65, 0.12, true)
    pillar(2.7, z, 2.25, -0.08, true)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const x = side * (3.7 + i * 0.77)
        const height = range(0.65, 1.48)
        for (let level = 0; level < 3; level++) {
          if (level * 0.39 > height) break
          part('box', 'stone', pick(hues.stone), x + range(-0.11, 0.11), 0.2 + level * 0.39, z + range(-0.14, 0.14), 0.78, 0.36, 0.85, range(-0.18, 0.18), range(-0.065, 0.09))
        }
      }
      addObstacle(side * 5.7, z, 5.2, 0.8)
    }
  }

  for (let index = 0; index < 23; index++) {
    const angle = index * 2 * Math.PI / 23
    const x = Math.sin(angle) * 6.5
    const z = -34 + Math.cos(angle) * 6.5
    part('stone', 'stone', pick(hues.stone), x, 0.06, z, 0.81, 0.19, 0.5, angle)
    if (index % 4 === 2) pillar(x, z, range(1.12, 1.84), angle, true)
  }
  for (const radius of [3.35, 5.27]) {
    for (let i = 0; i < 35; i++) {
      const theta = 2 * Math.PI * i / 35
      part('box', 'ground', i % 5 === 0 ? 0x8b8264 : 0x6c6b55, radius * Math.sin(theta), 0.009, -34 + radius * Math.cos(theta), 0.22 + radius * 0.053, 0.04, 0.115, theta)
    }
  }
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6
    const radius = 3.72
    part('box', 'glowTeal', 0x648f73, radius * Math.sin(angle), 0.024, -34 + radius * Math.cos(angle), 0.062, 0.016, 0.25, angle)
  }

  for (const [x, z, yaw] of [[-5.1, 11.8, -0.2], [-5.2, 14.55, 0.16]]) {
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.09, 1.22, 2.17, 3, 1, false, Math.PI / 2), new THREE.MeshStandardMaterial({ color: x === -5.1 ? 0x7d5135 : 0x67553c, roughness: 0.94, flatShading: true }))
    canopy.rotation.set(Math.PI / 2, 0, yaw)
    canopy.position.set(x, 0.67, z)
    canopy.castShadow = true
    canopy.receiveShadow = true
    forest.add(canopy)
    part('box', 'bark', 0x433e31, x, 0.06, z, 2, 0.13, 2.2, yaw)
    addObstacle(x, z - 0.18, 1.7, 1.55)
  }

  for (const [x, z, yaw] of [[3.9, 10.9, -0.3], [4.7, 11.5, 0.16], [4.35, 12, 0.5]]) {
    part('box', 'bark', 0x796046, x, 0.26, z, 0.57, 0.53, 0.59, yaw)
    part('box', 'bark', 0x58452f, x, 0.54, z, 0.6, 0.08, 0.61, yaw)
    addObstacle(x, z, 0.55, 0.55)
  }
  const fireX = -2.75
  const fireZ = 11.5
  for (let index = 0; index < 9; index++) {
    const theta = index * Math.PI * 2 / 9
    part('stone', 'stone', pick(hues.stone), fireX + Math.cos(theta) * 0.58, 0.085, fireZ + Math.sin(theta) * 0.58, 0.18, 0.17, 0.2, theta)
  }
  for (let index = 0; index < 4; index++) part('trunk', 'bark', 0x594332, fireX, 0.12 + index * 0.042, fireZ, 0.09, 0.83, 0.1, index * 0.85, Math.PI / 2)
  addObstacle(fireX, fireZ, 0.85, 0.85)
  const fire = new THREE.Group()
  fire.position.set(fireX, 0.23, fireZ)
  const fireMaterial = new THREE.MeshBasicMaterial({ color: 0xf89042, toneMapped: false })
  const innerFlame = new THREE.MeshBasicMaterial({ color: 0xffd990, toneMapped: false })
  for (let index = 0; index < 6; index++) {
    const flame = new THREE.Mesh(geometries.diamond, index % 3 === 0 ? innerFlame : fireMaterial)
    flame.position.set(range(-0.2, 0.2), range(0.15, 0.56), range(-0.19, 0.19))
    flame.scale.set(range(0.11, 0.22), range(0.26, 0.52), range(0.09, 0.19))
    flame.rotation.z = range(-0.27, 0.27)
    fire.add(flame)
  }
  forest.add(fire)
  const fireLight = new THREE.PointLight(0xffa25e, 30, 8, 1.6)
  fireLight.position.set(fireX, 0.77, fireZ)
  forest.add(fireLight)

  for (const [x, z] of [[-3.8, 8.7], [3.25, 8.4], [3.13, -8.9], [-3.4, -24.1], [3.45, -24.2], [5.6, -37.9], [-4.9, -32]]) {
    part('trunk', 'bark', 0x534739, x, 0.56, z, 0.105, 1.18, 0.105)
    part('stone', 'stone', 0x64665c, x, 0.08, z, 0.23, 0.136, 0.21)
    part('diamond', 'glow', glowAmber, x, 1.23, z, 0.112, 0.26, 0.106, 0.29)
    part('cone', 'bark', 0x564230, x, 1.03, z, 0.17, 0.2, 0.17)
  }

  // Understory glints use a single points draw and a deterministic phase.
  const glintPositions = new Float32Array(150 * 3)
  const glintOrigin: { x: number; z: number; y: number; phase: number }[] = []
  for (let i = 0; i < 150; i++) {
    glintOrigin.push({ x: range(-10, 10), y: range(0.18, 2.8), z: range(-46, 20), phase: range(0, 12) })
  }
  const glintGeometry = new THREE.BufferGeometry()
  glintGeometry.setAttribute('position', new THREE.BufferAttribute(glintPositions, 3))
  const glints = new THREE.Points(glintGeometry, new THREE.PointsMaterial({ color: 0xf0dba5, size: 0.054, transparent: true, opacity: 0.61, depthWrite: false }))
  glints.frustumCulled = false
  forest.add(glints)

  const gates = [-6, -22].map(z => {
    const material = new THREE.MeshBasicMaterial({ color: 0x8fd3ac, transparent: true, opacity: 0.55, depthWrite: false })
    const marker = new THREE.Group()
    marker.position.z = z
    for (let i = -8; i <= 8; i++) {
      const height = 0.48 + Math.cos(i * 0.32) * 0.28
      const beam = new THREE.Mesh(geometries.diamond, material)
      beam.position.set(i * 0.28, 0.16 + height * 0.52, 0)
      beam.scale.set(0.025, height, 0.035)
      marker.add(beam)
    }
    const threshold = new THREE.Mesh(geometries.box, material)
    threshold.position.set(0, 0.023, 0)
    threshold.scale.set(4.76, 0.027, 0.07)
    marker.add(threshold)
    forest.add(marker)
    return { z, marker, material, removeCollision: undefined as (() => void) | undefined }
  })

  addObstacle(-8.15, -13.2, 0.8, 61)
  addObstacle(8.15, -13.2, 0.8, 61)
  addObstacle(0, -43.4, 17, 0.8)
  addObstacle(0, 17, 17, 0.8)

  for (let index = 0; index < 58; index++) {
    const side = index % 2 ? 1 : -1
    const x = side * range(3.3, 8.3)
    const z = range(-41, 16)
    const growth = range(0.54, 1.1)
    for (let leaf = 0; leaf < 5; leaf++) {
      const angle = leaf * Math.PI * 0.4 + index * 0.36
      part('petal', 'grass', pick([0x386854, 0x4b735c, 0x537746]), x + Math.sin(angle) * 0.16, 0.23 * growth, z + Math.cos(angle) * 0.16,
        0.102 * growth, 0.56 * growth, 0.054 * growth, angle, range(0.46, 0.78))
    }
    if (index % 3 === 0) {
      const hue = pick([0xe5a46d, 0x83a790, 0xc89e78])
      part('diamond', 'glowTeal', hue, x, 0.245 * growth, z, 0.052, 0.072, 0.052, index)
    }
  }

  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometries[batch.shape], surfaces[batch.style], batch.transforms.length)
    for (let i = 0; i < batch.transforms.length; i++) {
      mesh.setMatrixAt(i, batch.transforms[i])
      mesh.setColorAt(i, tint.setHex(batch.colors[i]))
    }
    mesh.castShadow = ['bark', 'leaf', 'stone'].includes(batch.style)
    mesh.receiveShadow = !batch.style.startsWith('glow')
    forest.add(mesh)
  }

  return {
    setGate(index, closed) {
      const gate = gates[index]
      if (!gate) return
      gate.marker.visible = closed
      if (closed) {
        gate.removeCollision ??= addObstacle(0, gate.z, 5.45, 0.52)
      } else {
        gate.removeCollision?.()
        gate.removeCollision = undefined
      }
    },
    update(time, stage) {
      fire.scale.set(1 + Math.sin(time * 10.5) * 0.12, 1 + Math.sin(time * 15.3) * 0.17, 1)
      fire.rotation.y = time * 0.69
      fireLight.intensity = 28 + 3.2 * Math.sin(time * 11) + 4 * Math.sin(time * 19.4)
      fireLight.visible = stage < 2
      for (const gate of gates) gate.material.opacity = 0.44 + 0.17 * Math.sin(time * 2.9)
      for (let i = 0; i < glintOrigin.length; i++) {
        const origin = glintOrigin[i]
        glintPositions[i * 3] = origin.x + Math.cos(time * 0.51 + origin.phase) * 0.43
        glintPositions[i * 3 + 1] = origin.y + Math.sin(time * 0.87 + origin.phase) * 0.22
        glintPositions[i * 3 + 2] = origin.z + Math.sin(time * 0.48 + origin.phase) * 0.53
      }
      glintGeometry.getAttribute('position').needsUpdate = true
    },
  }
}

