import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import type { EnemyKind } from './contracts'
import { ENEMIES, type HitArea } from './encounters'

export type Motion = 'idle' | 'walk' | 'windup' | 'strike' | 'hit' | 'death'
export type ActorModel = { root: THREE.Group; setMotion: (motion: Motion, dt: number, time: number) => void; dispose: () => void }

export function disposeScene(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const skeletons = new Set<THREE.Skeleton>()
  group.traverse(object => {
    if (object instanceof THREE.InstancedMesh) object.dispose()
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton)
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return
    geometries.add(object.geometry)
    const list = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of list) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value)
      }
    }
  })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
  for (const texture of textures) texture.dispose()
  for (const skeleton of skeletons) skeleton.dispose()
}

const palettes = {
  playerCoat: 0x438076,
  playerCape: 0x1b544e,
  playerHood: 0x3e726a,
  playerBoots: 0x262c2d,
  playerSkin: 0xc69572,
  gold: 0xd6b778,
  steel: 0xe0e2cc,
  darkMetal: 0x4b625c,
  ember: 0xff9264,
  dog: 0x544540,
  dogFur: 0x746154,
  dogBack: 0x38363a,
  bark: 0x382e2b,
  barkSide: 0x5d4938,
  bossPlate: 0x655342,
  charcoal: 0x383a36,
  moss: 0x587345,
  horn: 0xa39a68,
  bossGlow: 0xfea357,
  spirit: 0xa1f3d0,
} as const

export class GameModels {
  private readonly geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    stone: new THREE.DodecahedronGeometry(1),
    joint: new THREE.IcosahedronGeometry(1, 0),
    cap: new THREE.ConeGeometry(1, 1, 5),
    cone: new THREE.ConeGeometry(1, 1, 7),
    trunk: new THREE.CylinderGeometry(0.71, 1, 1, 6),
    gem: new THREE.OctahedronGeometry(1),
  }
  private readonly surfaces = new Map<string, THREE.Material>()
  private readonly elites = new Set<(gltf: GLTF) => void>()
  private eliteAsset?: GLTF
  private disposed = false

  async loadElite() {
    const base = new URL(import.meta.env.BASE_URL, document.baseURI)
    try {
      const response = await fetch(new URL('assets/registry.json', base))
      if (!response.ok) throw new Error('Asset registry HTTP ' + response.status)
      const catalog = await response.json()
      const entry = catalog.assets?.['moss-warden']
      const path = entry?.versions?.[entry.currentVersion]?.url
      if (typeof path !== 'string' || !path.startsWith('/assets/models/')) throw new Error('Missing published moss-warden model')
      if (this.disposed) return
      const gltf = await new GLTFLoader().loadAsync(new URL(path.slice(1), base).href)
      if (this.disposed) {
        disposeScene(gltf.scene)
        return
      }
      this.eliteAsset = gltf
      for (const apply of this.elites) apply(gltf)
    } catch (error) {
      console.warn('苔角守卫模型加载失败，使用内置模型。', error)
    }
  }

  private bit(parent: THREE.Object3D, shape: keyof GameModels['geometry'], color: number, xyz: readonly number[], size: readonly number[], rotate: readonly number[] = [], emissive = false) {
    const key = color + ':' + emissive
    let material = this.surfaces.get(key)
    if (!material) {
      material = emissive
        ? new THREE.MeshBasicMaterial({ color, toneMapped: false })
        : new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.84 })
      this.surfaces.set(key, material)
    }
    const part = new THREE.Mesh(this.geometry[shape], material)
    part.position.set(xyz[0], xyz[1], xyz[2])
    part.scale.set(size[0], size[1], size[2])
    part.rotation.set(rotate[0] ?? 0, rotate[1] ?? 0, rotate[2] ?? 0)
    part.castShadow = !emissive
    part.receiveShadow = !emissive
    parent.add(part)
    return part
  }

  player(): ActorModel {
    const root = new THREE.Group()
    const body = new THREE.Group()
    const legs: THREE.Group[] = []
    root.add(body)
    const p = palettes
    this.bit(body, 'trunk', p.playerCoat, [0, 0.91, 0], [0.31, 0.63, 0.26])
    const cape = this.bit(body, 'box', p.playerCape, [0, 0.83, -0.21], [0.46, 0.74, 0.078], [0.2, 0, 0.05])
    this.bit(body, 'trunk', p.darkMetal, [0, 0.86, 0], [0.286, 0.103, 0.262])
    this.bit(body, 'box', p.gold, [0.04, 0.87, 0.252], [0.125, 0.108, 0.037])
    this.bit(body, 'stone', p.playerHood, [0, 1.39, -0.023], [0.285, 0.34, 0.28], [0.08, 0.18, 0.08])
    this.bit(body, 'joint', p.playerSkin, [0, 1.37, 0.176], [0.138, 0.21, 0.125])
    this.bit(body, 'cap', p.playerCape, [0, 1.58, -0.08], [0.27, 0.38, 0.26], [-0.32, 0.15, 0.05])
    this.bit(body, 'box', p.gold, [-0.19, 1.10, 0.10], [0.13, 0.047, 0.14], [0.18, -0.17, -0.55])
    for (const side of [-1, 1]) {
      const leg = new THREE.Group()
      leg.position.set(0.158 * side, 0.69, 0)
      this.bit(leg, 'box', p.playerBoots, [0, -0.30, 0], [0.18, 0.54, 0.2], [-0.07, 0, side * 0.06])
      this.bit(leg, 'box', p.darkMetal, [0, -0.55, 0.07], [0.206, 0.162, 0.34])
      body.add(leg)
      legs.push(leg)
    }
    this.bit(body, 'stone', p.playerCoat, [-0.32, 1.02, 0.03], [0.145, 0.3, 0.145], [-0.32, 0, -0.17])
    this.bit(body, 'stone', p.darkMetal, [-0.4, 0.84, 0.08], [0.115, 0.153, 0.127])
    this.bit(body, 'trunk', p.darkMetal, [-0.4, 0.89, 0.153], [0.2, 0.14, 0.2], [Math.PI / 2, 0, 0])
    this.bit(body, 'gem', p.gold, [-0.41, 0.92, 0.258], [0.069, 0.087, 0.044])
    const arm = new THREE.Group()
    arm.position.set(0.27, 1.12, 0.06)
    this.bit(arm, 'stone', p.playerCoat, [0.08, -0.122, 0], [0.158, 0.28, 0.164], [-0.33, 0, 0.28])
    this.bit(arm, 'stone', p.playerSkin, [0.16, -0.26, 0.09], [0.115, 0.146, 0.12])
    const sword = new THREE.Group()
    sword.position.set(0.145, -0.32, 0.13)
    sword.rotation.z = -0.27
    this.bit(sword, 'box', p.playerBoots, [0, 0.09, 0], [0.08, 0.24, 0.08])
    this.bit(sword, 'box', p.gold, [0, 0.23, 0], [0.34, 0.065, 0.093])
    this.bit(sword, 'box', p.steel, [0, 0.59, 0], [0.135, 0.64, 0.035])
    this.bit(sword, 'box', p.spirit, [0, 0.6, 0.022], [0.034, 0.56, 0.012], [], true)
    this.bit(sword, 'cap', p.steel, [0, 0.96, 0], [0.087, 0.17, 0.035])
    arm.add(sword)
    body.add(arm)

    return {
      root,
      setMotion(motion, dt, time) {
        const moving = motion === 'walk'
        const wave = Math.sin(time * 13)
        body.position.y = moving ? Math.abs(wave) * 0.105 : Math.sin(time * 3.9) * 0.026
        const angle = moving ? wave * 0.54 : 0
        legs[0].rotation.x = THREE.MathUtils.damp(legs[0].rotation.x, angle, 16, dt)
        legs[1].rotation.x = THREE.MathUtils.damp(legs[1].rotation.x, -angle, 16, dt)
        cape.rotation.x = 0.17 + (moving ? 0.21 + wave * 0.07 : Math.sin(time * 4) * 0.06)
        arm.rotation.x = THREE.MathUtils.damp(arm.rotation.x, motion === 'windup' ? -0.42 : motion === 'strike' ? -1.35 : -0.09, 22, dt)
        arm.rotation.z = THREE.MathUtils.damp(arm.rotation.z, motion === 'windup' ? -0.95 : motion === 'strike' ? 1.54 : -0.22 + angle * 0.22, 25, dt)
        body.rotation.y = THREE.MathUtils.damp(body.rotation.y, motion === 'windup' ? 0.42 : motion === 'strike' ? -0.45 : 0, 20, dt)
      },
      dispose() {},
    }
  }

  private hound(): ActorModel {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    const p = palettes
    this.bit(body, 'stone', p.dog, [0, 0.53, 0], [0.31, 0.31, 0.61], [0.12, 0.17, 0.13])
    this.bit(body, 'stone', p.dogFur, [0, 0.54, 0.33], [0.36, 0.36, 0.36])
    const head = new THREE.Group()
    head.position.set(0, 0.65, 0.52)
    this.bit(head, 'joint', p.dogFur, [0, 0.09, 0.07], [0.26, 0.28, 0.31])
    this.bit(head, 'box', p.dogBack, [0, 0.01, 0.27], [0.245, 0.145, 0.3], [-0.14, 0, 0])
    this.bit(head, 'stone', p.dogBack, [0, 0.03, 0.41], [0.125, 0.08, 0.05])
    for (const side of [-1, 1]) {
      this.bit(head, 'cap', p.dogBack, [0.166 * side, 0.29, -0.043], [0.103, 0.25, 0.112], [-0.43, 0, side * -0.36])
      this.bit(head, 'box', p.ember, [0.159 * side, 0.114, 0.275], [0.102, 0.049, 0.028], [0, side * 0.48, side * 0.12], true)
      this.bit(head, 'cap', p.steel, [0.115 * side, -0.058, 0.32], [0.02, 0.089, 0.025], [Math.PI, 0, 0])
    }
    body.add(head)
    this.bit(body, 'cap', p.dogBack, [0.03, 0.62, -0.74], [0.135, 0.58, 0.12], [-1.21, 0.06, 0.17])
    for (let i = 0; i < 4; i++) this.bit(body, 'cap', p.dogBack, [0, 0.82 - i * 0.026, 0.31 - i * 0.17], [0.14, 0.25, 0.13], [-0.37, 0.11, 0.1])
    const paws: THREE.Group[] = []
    for (const side of [-1, 1]) {
      for (const z of [-0.37, 0.36]) {
        const paw = new THREE.Group()
        paw.position.set(side * 0.205, 0.49, z)
        this.bit(paw, 'trunk', p.dog, [0, -0.20, -0.02], [0.093, 0.42, 0.107], [z < 0 ? 0.21 : -0.12, 0.06, side * 0.11])
        this.bit(paw, 'box', p.dogBack, [0, -0.39, 0.03], [0.145, 0.115, 0.214])
        body.add(paw)
        paws.push(paw)
      }
    }
    return {
      root,
      setMotion(motion, dt, time) {
        const moving = motion === 'walk'
        const strike = motion === 'strike'
        body.position.y = THREE.MathUtils.damp(body.position.y, motion === 'windup' ? -0.14 : strike ? 0.12 : moving ? Math.abs(Math.sin(time * 14)) * 0.055 : 0, 17, dt)
        body.rotation.x = THREE.MathUtils.damp(body.rotation.x, motion === 'windup' ? 0.21 : strike ? -0.1 : 0, 19, dt)
        for (let i = 0; i < paws.length; i++) {
          const step = Math.sin(time * 15 + (i === 0 || i === 3 ? 0 : Math.PI))
          paws[i].rotation.x = THREE.MathUtils.damp(paws[i].rotation.x, moving ? step * 0.7 : strike ? 0.28 : 0, 21, dt)
        }
      },
      dispose() {},
    }
  }

  private giant(kind: 'elite' | 'boss'): ActorModel {
    const boss = kind === 'boss'
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.scale.setScalar(boss ? 1.27 : 0.93)
    root.add(body)
    const p = palettes
    const shade = boss ? p.bossPlate : p.moss
    const signal = boss ? p.bossGlow : p.spirit
    this.bit(body, 'stone', p.bark, [0, 1.18, 0], [0.49, 0.60, 0.43], [0.09, 0.25, 0.11])
    this.bit(body, 'stone', shade, [0, 1.72, -0.05], [0.7, 0.66, 0.47], [0.02, 0.19, -0.12])
    this.bit(body, 'stone', p.barkSide, [0, 2.22, 0.25], [0.39, 0.445, 0.34], [-0.11, 0.22, 0.12])
    this.bit(body, 'cone', p.charcoal, [0.03, 1.99, 0.45], [0.26, 0.28, 0.19], [Math.PI + 0.41, 0.26, -0.14])
    this.bit(body, 'gem', signal, [0, 1.51, 0.37], [0.135, 0.3, 0.085], [0, 0.14, 0.07], true)
    const arms: THREE.Group[] = []
    const legs: THREE.Group[] = []
    for (const side of [-1, 1]) {
      this.bit(body, 'box', signal, [side * 0.143, 2.24, 0.5], [0.18, 0.064, 0.043], [0.04, -side * 0.41, side * 0.23], true)
      this.bit(body, 'cone', boss ? p.bark : p.horn, [side * 0.39, 2.58, 0.13], [0.18, 0.75, 0.14], [-0.26, side * 0.37, side * -0.78])
      this.bit(body, 'cone', boss ? p.barkSide : p.horn, [side * 0.6, 2.69, 0.01], [0.116, 0.49, 0.108], [-0.72, side * 0.31, side * -0.25])
      this.bit(body, 'cone', p.bark, [side * 0.44, 2.3, -0.33], [0.13, 1.06, 0.105], [-0.59, 0.34, side * -0.36])
      const upperArm = new THREE.Group()
      upperArm.position.set(0.59 * side, 1.9, 0)
      this.bit(upperArm, 'stone', shade, [side * 0.17, 0, 0.027], [0.51, 0.48, 0.38], [0.14, 0.31, side * 0.22])
      this.bit(upperArm, 'trunk', p.barkSide, [side * 0.29, -0.51, -0.04], [0.23, 0.82, 0.26], [0.14, 0.1, side * 0.19])
      this.bit(upperArm, 'stone', p.bark, [side * 0.4, -0.94, 0.05], [0.31, 0.37, 0.3], [0.14, 0.18, 0.31])
      this.bit(upperArm, 'gem', signal, [side * 0.3, -0.75, 0.29], [0.095, 0.194, 0.038], [0.14, 0.24, side * 0.5], true)
      this.bit(upperArm, 'cone', p.barkSide, [side * 0.45, 0.22, -0.1], [0.17, 0.53, 0.15], [0.12, 0.17, side * -0.64])
      if (boss) this.bit(upperArm, 'cone', p.bark, [side * 0.12, 0.41, -0.13], [0.14, 0.58, 0.19], [-0.39, 0.18, side * -0.21])
      const leg = new THREE.Group()
      leg.position.set(0.35 * side, 1.02, 0)
      this.bit(leg, 'trunk', p.bark, [0.045 * side, -0.41, 0.012], [0.219, 0.81, 0.218], [0.12, 0, side * 0.12])
      this.bit(leg, 'stone', p.barkSide, [0.102 * side, -0.82, 0.14], [0.295, 0.185, 0.48], [0.05, 0.15, 0.22])
      arms.push(upperArm)
      legs.push(leg)
      body.add(upperArm, leg)
    }

    let model: THREE.Object3D | undefined
    let mixer: THREE.AnimationMixer | undefined
    let active: THREE.AnimationAction | undefined
    const clips = new Map<Motion, THREE.AnimationClip>()
    const registerElite = (gltf: GLTF) => {
      const clone = cloneSkeleton(gltf.scene)
      clone.name = '苔角守卫 GLB'
      clone.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(clone)
      const sourceHeight = bounds.max.y - bounds.min.y
      if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) return
      const center = bounds.getCenter(new THREE.Vector3())
      const scale = 2.81 / sourceHeight / root.scale.y
      const fitted = new THREE.Group()
      fitted.scale.setScalar(scale)
      fitted.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
      clone.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true
          object.receiveShadow = true
        }
      })
      fitted.add(clone)
      root.add(fitted)
      body.visible = false
      model = clone
      mixer = new THREE.AnimationMixer(clone)
      const patterns: Record<Motion, RegExp> = { idle: /idle|rest|待机/i, walk: /walk|run|move|移动/i, windup: /windup|charge|蓄力/i, strike: /attack|swipe|strike|攻击/i, hit: /hit|hurt|受击/i, death: /death|die|死亡/i }
      for (const [motion, pattern] of Object.entries(patterns)) {
        const clip = gltf.animations.find(animation => pattern.test(animation.name))
        if (clip) clips.set(motion as Motion, clip)
      }
    }
    if (!boss) {
      this.elites.add(registerElite)
      if (this.eliteAsset) registerElite(this.eliteAsset)
    }
    return {
      root,
      setMotion(motion, dt, time) {
        const moving = motion === 'walk'
        const windup = motion === 'windup'
        const swing = motion === 'strike'
        if (model && mixer) {
          const animation = clips.get(motion) ?? (windup ? clips.get('strike') : undefined) ?? clips.get('idle')
          if (animation) {
            const next = mixer.clipAction(animation)
            if (next !== active) {
              active?.fadeOut(0.13)
              const looping = motion === 'idle' || motion === 'walk' || animation === clips.get('idle')
              next.reset().setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1)
              next.clampWhenFinished = !looping
              // The asset's 0.76-second contact pose lands at the end of the game warning.
              next.timeScale = animation === clips.get('strike') && windup ? 0.76 / ENEMIES.elite.windup : 1
              next.fadeIn(0.12).play()
              active = next
            }
          }
          if (model.parent) {
            model.parent.rotation.x = THREE.MathUtils.damp(model.parent.rotation.x, !animation && windup ? -0.1 : !animation && swing ? 0.18 : 0, 13, dt)
            model.parent.rotation.z = THREE.MathUtils.damp(model.parent.rotation.z, !animation && windup ? -0.13 : !animation && swing ? 0.16 : 0, 13, dt)
          }
          mixer.update(dt)
          return
        }
        const walk = Math.sin(time * 8.6)
        body.position.y = moving ? Math.abs(walk) * 0.11 : Math.sin(time * 3.1) * 0.032
        body.rotation.x = THREE.MathUtils.damp(body.rotation.x, swing ? 0.29 : windup ? -0.12 : 0, 12, dt)
        for (let i = 0; i < 2; i++) {
          const side = i * 2 - 1
          legs[i].rotation.x = THREE.MathUtils.damp(legs[i].rotation.x, moving ? side * walk * 0.37 : 0, 13, dt)
          const raise = windup ? (boss || i ? -1.47 : -0.57) : swing ? 0.48 : (moving ? -side * walk * 0.27 : 0)
          arms[i].rotation.x = THREE.MathUtils.damp(arms[i].rotation.x, raise, 16, dt)
          arms[i].rotation.z = THREE.MathUtils.damp(arms[i].rotation.z, windup ? 0.39 * side : (swing ? 0.61 * side : 0.07 * side), 17, dt)
        }
      },
      dispose: () => {
        this.elites.delete(registerElite)
        if (model) {
          mixer?.stopAllAction()
          mixer?.uncacheRoot(model)
          model.traverse(object => {
            if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose()
          })
        }
      },
    }
  }

  enemy(kind: EnemyKind): ActorModel {
    return kind === 'normal' ? this.hound() : this.giant(kind)
  }

  loot(rarity: string) {
    const root = new THREE.Group()
    const color = { uncommon: 0x8cdca2, magic: 0x8bc6ea, rare: 0xf3ca71, epic: 0xd5a5fa, legendary: 0xf5a65f }[rarity.toLowerCase()] ?? 0xf0e0a7
    this.bit(root, 'gem', color, [0, 0.38, 0], [0.113, 0.19, 0.113], [], true)
    this.bit(root, 'box', color, [0, 0.96, 0], [0.024, 0.99, 0.024], [], true)
    this.bit(root, 'gem', color, [0, 1.5, 0], [0.044, 0.084, 0.044], [], true)
    return root
  }

  dispose() {
    this.disposed = true
    this.elites.clear()
    if (this.eliteAsset) disposeScene(this.eliteAsset.scene)
    for (const geometry of Object.values(this.geometry)) geometry.dispose()
    for (const surface of this.surfaces.values()) surface.dispose()
  }
}

export interface GroundMark {
  root: THREE.Group
  fill: THREE.MeshBasicMaterial
  outline: THREE.LineBasicMaterial
  dispose: () => void
}

export function groundMark(area: HitArea, color: number, height: number): GroundMark {
  const points: THREE.Vector2[] = []
  if (area.shape === 'line') {
    const halfWidth = area.halfWidth ?? 0
    points.push(new THREE.Vector2(-halfWidth, 0), new THREE.Vector2(-halfWidth, area.radius), new THREE.Vector2(halfWidth, area.radius), new THREE.Vector2(halfWidth, 0))
  } else {
    const circle = area.shape === 'circle'
    const angle = circle ? Math.PI * 2 : (area.angle ?? 0)
    const segments = circle ? 56 : 26
    if (!circle) points.push(new THREE.Vector2(0, 0))
    for (let i = 0; i <= segments; i++) {
      const t = angle * (i / segments - 0.5)
      points.push(new THREE.Vector2(Math.sin(t) * area.radius, Math.cos(t) * area.radius))
    }
  }
  const areaShape = new THREE.Shape(points)
  const geometry = new THREE.ShapeGeometry(areaShape).rotateX(Math.PI / 2)
  const fill = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: 0.26, toneMapped: false })
  const outline = new THREE.LineBasicMaterial({ color, transparent: true, depthWrite: false, opacity: 0.84, toneMapped: false })
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(point.x, 0.003, point.y)))
  const disk = new THREE.Mesh(geometry, fill)
  const rim = new THREE.LineLoop(lineGeometry, outline)
  const root = new THREE.Group()
  root.add(disk, rim)
  root.position.set(area.x, height, area.z)
  root.rotation.y = area.facing
  return { root, fill, outline, dispose() {
    root.removeFromParent()
    geometry.dispose()
    lineGeometry.dispose()
    fill.dispose()
    outline.dispose()
  } }
}

