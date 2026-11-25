import RAPIER, { type Collider, type RigidBody } from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { calculateArmorFactor, calculateDirectHit } from '../domain/stats'
import type { EnemyKind, GameAttackContext, GameCombatContext, GameController, GameDamage, GameHooks, GameLoot, GamePhase, GameSnapshot, GameStage, PlayerAttack } from './contracts'
import { CAMP_SPAWN, CLEAVE_COOLDOWN, ENCOUNTERS, ENEMIES, PLAYER_AREAS, containsPoint, type GroundPoint, type HitArea } from './encounters'
import { buildForest } from './forest'
import { disposeScene, GameModels, groundMark, type ActorModel, type GroundMark, type Motion } from './models'

export type * from './contracts'

const FIXED_DT = 1 / 60
const PLAYER_RADIUS = 0.34
const PICKUP_RADIUS = 2.35
const CAMERA_OFFSET = new THREE.Vector3(7.6, 13.8, 12.2)
const CAMERA_FORWARD = new THREE.Vector2(-CAMERA_OFFSET.x, -CAMERA_OFFSET.z).normalize()
const CAMERA_RIGHT = new THREE.Vector2(-CAMERA_FORWARD.y, CAMERA_FORWARD.x)
const UP = new THREE.Vector3(0, 1, 0)
const CAMERA_AIM_OFFSET = new THREE.Vector3(0, 0.25, -1.75)

type Actor = GroundPoint & { body: RigidBody; collider: Collider; height: number; model: ActorModel; facing: number }
type Warning = { area: HitArea; mark: GroundMark; duration: number; resolveAt: number; second: boolean }
type Enemy = Actor & { id: string; kind: EnemyKind; health: number; wakeAt: number; nextAttack: number; struckAt: number; recoverUntil: number; hitUntil: number; lungeUntil: number; warning?: Warning }
type Drop<Loot> = GroundPoint & { loot: Loot; model: THREE.Group }
type FloatingNumber = GroundPoint & { y: number; starts: number; text: string; color: string }
type Flash = { mark: GroundMark; start: number; duration: number }
type Corpse = { actor: Enemy; start: number; scale: number }
type Swing = { attack: PlayerAttack; area: HitArea; hitAt: number; endAt: number; warning: GroundMark; landed: boolean }
type IncomingHit = { area: HitArea; damage: number }

function distance(a: GroundPoint, b: GroundPoint) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function facingBetween(a: GroundPoint, b: GroundPoint) {
  return Math.atan2(b.x - a.x, b.z - a.z)
}

function turnTowards(current: number, target: number, strength: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * strength
}

function baselineAttack(context: GameAttackContext): GameDamage[] {
  return context.targets.map(target => {
    const { amount, critical } = calculateDirectHit(context.stats, {
      targetArmor: target.armor,
      skillMultiplier: context.attack === 'cleave' ? 1.35 : 1,
    })
    return { targetId: target.id, amount, critical, source: 'direct' }
  })
}

let physicsInitialization: Promise<void> | undefined

/**
 * Mounts the safe camp and starts rendering. start() opens the first encounter.
 * The host owns character progression, persistence and menu/UI state.
 */
export async function mountGame<Loot extends GameLoot>(container: HTMLElement, hooks: GameHooks<Loot>): Promise<GameController> {
  physicsInitialization ??= RAPIER.init().catch(error => {
    physicsInitialization = undefined
    throw error
  })
  await physicsInitialization

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1e302a)
  scene.fog = new THREE.FogExp2(0x25382f, 0.027)
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.23
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const camera = new THREE.OrthographicCamera(-12, 12, 8.6, -8.6, 0.1, 110)
  const cameraCenter = new THREE.Vector3(CAMP_SPAWN.x, 0, CAMP_SPAWN.z)

  const canvas = renderer.domElement
  canvas.setAttribute('aria-label', '林地遗迹战斗场景')
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none'
  const overlay = document.createElement('canvas')
  overlay.setAttribute('aria-hidden', 'true')
  overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'
  const layer = document.createElement('div')
  layer.className = 'odyssey-game-layer'
  layer.style.cssText = 'position:absolute;inset:0;overflow:hidden'
  layer.append(canvas, overlay)
  container.append(layer)
  const context2d = overlay.getContext('2d')

  const sky = new THREE.HemisphereLight(0xc8e9df, 0x8b7d61, 2.15)
  const sun = new THREE.DirectionalLight(0xffe3b2, 2.85)
  const rim = new THREE.DirectionalLight(0x8fcfcc, 0.88)
  rim.position.set(6, 8, 1)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { near: 0.5, far: 45, left: -13, right: 13, top: 13, bottom: -13 })
  sun.shadow.camera.updateProjectionMatrix()
  sun.shadow.bias = -0.00018
  sun.shadow.normalBias = 0.038
  scene.add(sky, sun, sun.target, rim)

  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = FIXED_DT
  const character = world.createCharacterController(0.026)
  const forest = buildForest(scene, (x, z, width, depth) => {
    const body = world.createCollider(RAPIER.ColliderDesc.cuboid(width * 0.5, 1.1, depth * 0.5).setTranslation(x, 1.1, z))
    return () => world.removeCollider(body, false)
  })
  forest.setGate(0, true)
  forest.setGate(1, true)

  const models = new GameModels()
  models.loadElite()
  function makeActor(position: GroundPoint, radius: number, height: number, model: ActorModel): Actor {
    const y = Math.max(radius, height * 0.5)
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, y, position.z))
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(Math.max(0, y - radius), radius), body)
    model.root.position.set(position.x, 0, position.z)
    scene.add(model.root)
    return { ...position, body, collider, height, model, facing: Math.PI }
  }

  const hero = makeActor(CAMP_SPAWN, PLAYER_RADIUS, 1.78, models.player())
  const playerRing = groundMark({ ...CAMP_SPAWN, shape: 'circle', facing: 0, radius: 0.53 }, 0xa9e5bb, 0.016)
  playerRing.fill.opacity = 0.06
  playerRing.outline.opacity = 0.65
  scene.add(playerRing.root)
  const aimRing = groundMark({ x: 0, z: 0, shape: 'circle', facing: 0, radius: 0.14 }, 0xd6efb8, 0.025)
  aimRing.fill.opacity = 0.17
  aimRing.outline.opacity = 0.75
  scene.add(aimRing.root)
  world.step()

  let phase: GamePhase = 'camp'
  let stage: GameStage = 0
  let stats = hooks.getStats()
  let health = stats.maxHealth
  let kills = 0
  let time = 0
  let visualTime = 0
  let paused = false
  let disposed = false
  let encounterId = ''
  let runIndex = 0
  let nextBasic = 0
  let nextCleave = 0
  let swing: Swing | undefined
  let hurtUntil = 0
  let defeatedAt = 0
  let lastSnapshot: GameSnapshot<Loot> | undefined
  let width = 1
  let height = 1
  let pixelRatio = 1
  let sceneScale = 1
  let slowFrames = 0
  let raf = 0
  let previousFrame = performance.now()
  let accumulator = 0
  let nextSnapshot = 0
  let heldAttack = false
  let requestAttack = false
  let requestCleaveUntil = -Infinity
  let hasPointer = false

  const keys = new Set<string>()
  const enemies = new Map<string, Enemy>()
  const drops: Drop<Loot>[] = []
  const corpses: Corpse[] = []
  const numbers: FloatingNumber[] = []
  const flashes: Flash[] = []
  const incomingHits: IncomingHit[] = []
  const move = new THREE.Vector2()
  const screenMove = new THREE.Vector2()
  const pointer = new THREE.Vector2()
  const aim = new THREE.Vector3()
  const ray = new THREE.Raycaster()
  const plane = new THREE.Plane(UP, 0)
  const projection = new THREE.Vector3()

  function cameraUpdate(dt: number, snap = false) {
    const strength = snap ? 1 : 1 - Math.exp(-dt * 7.5)
    cameraCenter.x += (hero.x - cameraCenter.x) * strength
    cameraCenter.z += (hero.z - cameraCenter.z) * strength
    camera.position.copy(cameraCenter).add(CAMERA_OFFSET).add(CAMERA_AIM_OFFSET)
    camera.lookAt(projection.copy(cameraCenter).add(CAMERA_AIM_OFFSET))
    camera.updateMatrixWorld()
    sun.position.set(cameraCenter.x - 7.2, 15, cameraCenter.z - 5.4)
    sun.target.position.set(cameraCenter.x, 0, cameraCenter.z - 1.9)
  }

  function resize() {
    width = Math.max(1, layer.clientWidth)
    height = Math.max(1, layer.clientHeight)
    pixelRatio = Math.min(1.65, window.devicePixelRatio || 1)
    renderer.setPixelRatio(pixelRatio * sceneScale)
    renderer.setSize(width, height, false)
    overlay.width = Math.floor(pixelRatio * width)
    overlay.height = Math.floor(pixelRatio * height)
    const aspect = width / height
    const halfHeight = Math.max(7.45, 5.75 / aspect)
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.right = halfHeight * aspect
    camera.left = -camera.right
    camera.updateProjectionMatrix()
  }

  function nearestDrop() {
    let nearest: Drop<Loot> | undefined
    let closest = PICKUP_RADIUS
    for (const drop of drops) {
      const length = distance(hero, drop)
      if (length < closest) {
        closest = length
        nearest = drop
      }
    }
    return nearest
  }

  function pickup() {
    if (paused || (phase !== 'combat' && phase !== 'victory')) return
    const drop = nearestDrop()
    if (!drop) return
    if (hooks.onPickup(drop.loot) === false) return
    drops.splice(drops.indexOf(drop), 1)
    drop.model.removeFromParent()
    hooks.onNotice?.('拾取「' + drop.loot.name + '」', 'success')
    publish()
  }

  function targetEnemy() {
    let nearest: Enemy | undefined
    let closest = 7.4
    for (const enemy of enemies.values()) {
      const range = distance(hero, enemy)
      if (range >= 12.5) continue
      const score = hasPointer ? Math.min(range, Math.hypot(aim.x - enemy.x, aim.z - enemy.z) * 2.3 + 0.35) : range
      if (score < closest) {
        closest = score
        nearest = enemy
      }
    }
    return nearest
  }

  function publish(force = false) {
    const enemy = targetEnemy()
    const view = enemy ? { id: enemy.id, kind: enemy.kind, name: ENEMIES[enemy.kind].name, health: enemy.health, maxHealth: ENEMIES[enemy.kind].health } : null
    const snapshot = {
      phase, stage, stageName: stage === 0 ? '林缘营地' : ENCOUNTERS[stage - 1].name, health, maxHealth: stats.maxHealth,
      cleaveCooldown: Math.max(0, nextCleave - time),
      cleaveCooldownMax: CLEAVE_COOLDOWN, paused, enemiesRemaining: enemies.size, kills, target: view,
      nearbyLoot: nearestDrop()?.loot ?? null,
      groundLootCount: drops.length,
    } satisfies GameSnapshot<Loot>
    if (!force && lastSnapshot
      && snapshot.phase === lastSnapshot.phase && snapshot.paused === lastSnapshot.paused && snapshot.stage === lastSnapshot.stage
      && snapshot.health === lastSnapshot.health && snapshot.maxHealth === lastSnapshot.maxHealth
      && snapshot.cleaveCooldown === lastSnapshot.cleaveCooldown && snapshot.kills === lastSnapshot.kills
      && snapshot.enemiesRemaining === lastSnapshot.enemiesRemaining && snapshot.groundLootCount === lastSnapshot.groundLootCount
      && snapshot.target?.id === lastSnapshot.target?.id && snapshot.target?.health === lastSnapshot.target?.health
      && snapshot.nearbyLoot === lastSnapshot.nearbyLoot) return
    lastSnapshot = snapshot
    hooks.onSnapshot(snapshot)
  }

  function heal(amount: number) {
    if (Number.isFinite(amount) && amount > 0) health = Math.min(stats.maxHealth, health + amount)
  }

  function resetPosition(actor: Actor, x: number, z: number) {
    actor.x = x
    actor.z = z
    actor.body.setTranslation({ x, y: Math.max(0.01, actor.height * 0.5), z }, false)
    actor.model.root.position.set(x, 0, z)
  }

  function moveActor(actor: Actor, x: number, z: number) {
    if (x === 0 && z === 0) return 0
    const translation = actor.body.translation()
    character.computeColliderMovement(actor.collider, { x, y: 0, z })
    const delta = character.computedMovement()
    actor.body.setNextKinematicTranslation({ x: translation.x + delta.x, y: translation.y, z: translation.z + delta.z })
    return Math.hypot(delta.x, delta.z)
  }

  function readPosition(actor: Actor) {
    const translation = actor.body.translation()
    actor.x = translation.x
    actor.z = translation.z
    actor.model.root.position.set(actor.x, 0, actor.z)
    actor.model.root.rotation.y = actor.facing
  }

  function addNumber(actor: Actor, amount: number, color: string, critical = false) {
    numbers.push({ x: actor.x + (Math.random() - 0.5) * 0.48, y: actor.height + 0.35, z: actor.z, starts: visualTime, text: String(Math.max(1, Math.round(amount))) + (critical ? '!' : ''), color })
  }

  function flash(area: HitArea, color: number, duration = 0.32) {
    const mark = groundMark(area, color, 0.069)
    scene.add(mark.root)
    flashes.push({ mark, start: visualTime, duration })
  }

  function spawn(next: Exclude<GameStage, 0>) {
    stage = next
    const encounter = ENCOUNTERS[next - 1]
    const definition = ENEMIES[encounter.kind]
    encounter.positions.forEach((position, index) => {
      const actor = makeActor(position, definition.radius, definition.height, models.enemy(encounter.kind))
      actor.facing = facingBetween(actor, hero)
      const enemy = {
        ...actor, id: encounterId + ':' + next + ':' + index, kind: encounter.kind, health: definition.health,
        wakeAt: time + 0.32 + index * 0.42, nextAttack: time + 0.46 + index * 0.4,
        struckAt: -10, recoverUntil: 0, hitUntil: 0, lungeUntil: 0,
      } satisfies Enemy
      enemy.model.root.rotation.y = enemy.facing
      enemies.set(enemy.id, enemy)
    })
  }

  function claimKill(enemy: Enemy) {
    enemies.delete(enemy.id)
    world.removeRigidBody(enemy.body)
    enemy.warning?.mark.dispose()
    corpses.push({ actor: enemy, start: visualTime, scale: enemy.model.root.scale.x })
    kills++
    const loot = hooks.onKill({ encounterId, enemyId: enemy.id, kind: enemy.kind, experience: ENEMIES[enemy.kind].experience })
    loot.forEach((item, index) => {
      const angle = index * 2.4
      const offset = loot.length > 1 ? 0.32 + index * 0.16 : 0
      const x = enemy.x + Math.sin(angle) * offset
      const z = enemy.z + Math.cos(angle) * offset
      const model = models.loot(item.rarity)
      model.position.set(x, 0, z)
      scene.add(model)
      drops.push({ x, z, model, loot: item })
    })
  }

  function applyDamage(damages: readonly GameDamage[]) {
    for (const damage of damages) {
      const enemy = enemies.get(damage.targetId)
      if (!enemy || !Number.isFinite(damage.amount) || damage.amount <= 0) continue
      const applied = Math.min(enemy.health, damage.amount)
      enemy.health -= applied
      enemy.hitUntil = time + 0.14
      addNumber(enemy, damage.amount, damage.critical ? '#ffdf84' : damage.source === 'burn' ? '#ff9d74' : damage.source === 'proc' ? '#a4e8ff' : '#eaf8d9', damage.critical)
      if (damage.source === undefined || damage.source === 'direct') heal(applied * stats.lifeSteal)
      if (enemy.health <= 0) claimKill(enemy)
    }
    if (phase !== 'combat' || enemies.size > 0) return
    if (stage === 3) {
      phase = 'victory'
      hooks.onRunEnd?.('victory')
      publish()
    } else {
      forest.setGate(stage - 1, false)
      spawn((stage + 1) as Exclude<GameStage, 0>)
      hooks.onNotice?.('前路已打开 · ' + ENCOUNTERS[stage - 1].name, 'success')
      publish()
    }
  }

  function combatContext(): GameCombatContext {
    return {
      time, health, stats,
      enemies: Array.from(enemies.values(), enemy => ({ id: enemy.id, health: enemy.health, armor: ENEMIES[enemy.kind].armor, x: enemy.x, z: enemy.z })),
    }
  }

  function cancelSwing() {
    swing?.warning.dispose()
    swing = undefined
  }

  function startSwing(attack: PlayerAttack) {
    const area = {
      x: hero.x, z: hero.z, facing: hasPointer ? facingBetween(hero, aim) : hero.facing, shape: 'cone',
      ...PLAYER_AREAS[attack],
      radius: attack === 'cleave' ? stats.cleaveRadius : PLAYER_AREAS.basic.radius,
    } satisfies HitArea
    hero.facing = area.facing
    const warning = groundMark(area, attack === 'cleave' ? 0xffd595 : 0x9ae0c7, 0.055)
    warning.fill.opacity = attack === 'cleave' ? 0.14 : 0.08
    warning.outline.opacity = 0.52
    scene.add(warning.root)
    const attackInterval = 1 / Math.max(0.2, stats.attacksPerSecond)
    const windup = attack === 'cleave' ? 0.23 : Math.min(0.15, attackInterval * 0.27)
    const recovery = attack === 'cleave' ? 0.23 : Math.min(0.24, attackInterval * 0.58)
    swing = { area, warning, attack, hitAt: time + windup, endAt: time + windup + recovery, landed: false }
    if (attack === 'basic') nextBasic = time + attackInterval
  }

  function updateSwing() {
    if (!swing) return
    if (!swing.landed) {
      swing.area.x = hero.x
      swing.area.z = hero.z
      swing.warning.root.position.set(hero.x, 0.055, hero.z)
      if (time >= swing.hitAt) {
        swing.landed = true
        swing.warning.dispose()
        const attack = swing.attack
        if (attack === 'cleave') nextCleave = time + CLEAVE_COOLDOWN
        flash(swing.area, attack === 'cleave' ? 0xffd08d : 0xafffe0, attack === 'cleave' ? 0.29 : 0.18)
        const context = combatContext()
        const targets = context.enemies.filter(enemy => containsPoint(swing!.area, enemy))
        applyDamage((hooks.resolveAttack ?? baselineAttack)({ ...context, targets, attack }))
      }
    }
    if (swing && time >= swing.endAt) swing = undefined
  }

  function incomingDamage(amount: number) {
    const total = hooks.resolveIncomingDamage?.(amount, combatContext()) ?? amount * calculateArmorFactor(stats.armor)
    if (!Number.isFinite(total) || total <= 0) return
    health = Math.max(0, health - total)
    hurtUntil = time + 0.2
    addNumber(hero, total, '#ff926e')
    if (health === 0) {
      phase = 'defeat'
      defeatedAt = visualTime
      releaseInput()
      cancelSwing()
      for (const enemy of enemies.values()) {
        enemy.warning?.mark.dispose()
        enemy.warning = undefined
      }
      hooks.onRunEnd?.('defeat')
      publish()
    }
  }

  function startWarning(enemy: Enemy, second = false) {
    const def = ENEMIES[enemy.kind]
    const facing = facingBetween(enemy, hero)
    enemy.facing = facing
    const area = { x: enemy.x, z: enemy.z, shape: def.shape, facing, ...def.area }
    if (second) area.radius *= 1.16
    const duration = second ? 1.32 : def.windup
    const mark = groundMark(area, second ? 0xff8357 : 0xef7755, second ? 0.048 : 0.042)
    scene.add(mark.root)
    enemy.warning = { area, mark, duration, resolveAt: time + duration, second }
  }

  function updateEnemy(enemy: Enemy, dt: number) {
    const def = ENEMIES[enemy.kind]
    const range = distance(enemy, hero)
    let motion: Motion = time < enemy.hitUntil ? 'hit' : 'idle'
    if (enemy.warning) {
      const warning = enemy.warning
      const progress = THREE.MathUtils.clamp(1 - (warning.resolveAt - time) / warning.duration, 0, 1)
      warning.mark.fill.opacity = 0.14 + progress * 0.31
      warning.mark.outline.opacity = 0.62 + progress * 0.34
      motion = 'windup'
      if (time >= warning.resolveAt) {
        enemy.warning = undefined
        warning.mark.dispose()
        enemy.struckAt = time
        enemy.facing = warning.area.facing
        enemy.recoverUntil = time + def.recovery
        enemy.nextAttack = enemy.recoverUntil + (enemy.kind === 'normal' ? 0.42 : 0.7)
        if (enemy.kind === 'normal') enemy.lungeUntil = time + 0.16
        flash(warning.area, warning.second ? 0xffae70 : 0xff8564, 0.37)
        incomingHits.push({ area: warning.area, damage: def.damage * (warning.second ? 0.79 : 1) })
        motion = 'strike'
        if (phase === 'combat' && enemy.kind === 'boss' && enemy.health <= def.health * 0.5 && !warning.second) {
          startWarning(enemy, true)
        }
      }
    } else if (time < enemy.lungeUntil) {
      moveActor(enemy, Math.sin(enemy.facing) * dt * 8.1, Math.cos(enemy.facing) * dt * 8.1)
      motion = 'strike'
    } else if (time < enemy.recoverUntil) {
      if (time - enemy.struckAt < 0.26) motion = 'strike'
    } else if (time >= enemy.wakeAt && range < (enemy.kind === 'normal' ? 10.6 : 12.9)) {
      const angle = facingBetween(enemy, hero)
      enemy.facing = turnTowards(enemy.facing, angle, 0.24)
      if (range <= def.range && time >= enemy.nextAttack) {
        startWarning(enemy)
        motion = 'windup'
      } else {
        const desiredRange = def.range * 0.77
        const direction = range > desiredRange + 0.12 ? angle : angle + Math.PI
        const speed = range > desiredRange + 0.12 ? def.speed : def.speed * 0.31
        const step = moveActor(enemy, Math.sin(direction) * speed * dt, Math.cos(direction) * speed * dt)
        if (step > 0.009) motion = 'walk'
        else if (range > def.range) {
          const flank = direction + (enemy.x < hero.x ? -1 : 1) * 1.1
          if (moveActor(enemy, Math.sin(flank) * speed * dt, Math.cos(flank) * speed * dt) > 0.009) motion = 'walk'
        }
      }
    }
    const hit = time < enemy.hitUntil && motion !== 'windup' && motion !== 'strike'
    enemy.model.setMotion(hit ? 'hit' : motion, dt, time)
  }

  function simulation(dt: number) {
    time += dt
    incomingHits.length = 0
    if (phase === 'combat') {
      if (!swing) {
        if (time <= requestCleaveUntil && time >= nextCleave) {
          startSwing('cleave')
          requestCleaveUntil = -Infinity
        } else if ((heldAttack || requestAttack) && time >= nextBasic) startSwing('basic')
      }
      requestAttack = false
    }

    screenMove.set(Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
      Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')))
    if (screenMove.lengthSq() > 1) screenMove.normalize()
    move.copy(CAMERA_RIGHT).multiplyScalar(screenMove.x).addScaledVector(CAMERA_FORWARD, screenMove.y)
    const speed = stats.movementSpeed * (swing ? swing.landed ? 0.79 : 0.61 : 1)
    const isMoving = moveActor(hero, move.x * dt * speed, move.y * dt * speed) > 0.004
    if (isMoving && !swing) hero.facing = turnTowards(hero.facing, Math.atan2(move.x, move.y), 0.34)
    const motion = swing ? swing.landed ? 'strike' : 'windup' : isMoving ? 'walk' : time < hurtUntil ? 'hit' : 'idle'
    hero.model.setMotion(motion, dt, time)

    if (phase === 'combat') {
      for (const enemy of enemies.values()) {
        if (phase !== 'combat') break
        updateEnemy(enemy, dt)
      }
      if (phase === 'combat') {
        heal(dt * (hooks.resolveRegen?.(combatContext()) ?? stats.healthRegen))
      }
    }
    world.step()
    readPosition(hero)
    for (const enemy of enemies.values()) readPosition(enemy)
    for (const hit of incomingHits) {
      if (phase !== 'combat') break
      if (containsPoint(hit.area, hero)) incomingDamage(hit.damage)
    }
    if (phase === 'combat') {
      updateSwing()
      if (hooks.resolveEffects) applyDamage(hooks.resolveEffects(combatContext()))
    }
  }

  function clearRun() {
    cancelSwing()
    for (const enemy of enemies.values()) {
      enemy.warning?.mark.dispose()
      enemy.model.root.removeFromParent()
      enemy.model.dispose()
      world.removeRigidBody(enemy.body)
    }
    enemies.clear()
    for (const corpse of corpses) {
      corpse.actor.model.root.removeFromParent()
      corpse.actor.model.dispose()
    }
    corpses.length = 0
    for (const drop of drops) drop.model.removeFromParent()
    drops.length = 0
    for (const effect of flashes) effect.mark.dispose()
    flashes.length = 0
    numbers.length = 0
    releaseInput()
    if (disposed) return
    forest.setGate(0, true)
    forest.setGate(1, true)
    nextBasic = 0
    nextCleave = 0
    hurtUntil = 0
    time = 0
    kills = 0
    hero.facing = Math.PI
    hero.model.root.rotation.z = 0
    resetPosition(hero, CAMP_SPAWN.x, CAMP_SPAWN.z)
    world.step()
    readPosition(hero)
    cameraUpdate(0, true)
  }

  function start() {
    if (disposed || phase !== 'camp') return
    clearRun()
    encounterId = globalThis.crypto?.randomUUID?.() ?? 'encounter-' + Date.now() + '-' + (++runIndex)
    phase = 'combat'
    hooks.onRunStart?.(encounterId)
    stats = hooks.getStats()
    health = Math.min(health, stats.maxHealth)
    spawn(1)
    publish(true)
  }

  function returnToCamp() {
    if (disposed || phase === 'camp') return
    const leftovers = drops.length
    clearRun()
    stage = 0
    phase = 'camp'
    hooks.onReturnToCamp?.()
    stats = hooks.getStats()
    health = stats.maxHealth
    if (leftovers > 0) hooks.onNotice?.('已返回营地，遗留战利品已消失', 'info')
    publish(true)
  }

  function releaseInput() {
    keys.clear()
    heldAttack = false
    requestAttack = false
    requestCleaveUntil = -Infinity
  }

  function setPaused(value: boolean) {
    if (disposed || paused === value) return
    paused = value
    releaseInput()
    accumulator = 0
    stats = hooks.getStats()
    health = Math.min(health, stats.maxHealth)
    publish()
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey || event.altKey || event.metaKey || paused || phase === 'defeat'
      || (event.target instanceof HTMLElement && event.target.matches('input, textarea, select, [contenteditable]'))) return
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      keys.add(event.code)
      event.preventDefault()
    } else if (!event.repeat && event.code === 'KeyQ' && phase === 'combat') {
      requestCleaveUntil = time + 0.27
      event.preventDefault()
    } else if (!event.repeat && event.code === 'KeyE') {
      pickup()
      event.preventDefault()
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    keys.delete(event.code)
  }

  function onPointerMove(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    hasPointer = true
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2)
    updateAim()
  }

  function updateAim() {
    if (!hasPointer) return
    ray.setFromCamera(pointer, camera)
    ray.ray.intersectPlane(plane, aim)
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || paused || phase !== 'combat') return
    onPointerMove(event)
    heldAttack = true
    requestAttack = true
    event.preventDefault()
  }

  function onPointerUp(event: PointerEvent) {
    if (event.button === 0) heldAttack = false
  }

  function onPointerLeave() {
    hasPointer = false
    heldAttack = false
  }

  const observers = new AbortController()
  const listener = { signal: observers.signal }
  window.addEventListener('keydown', onKeyDown, listener)
  window.addEventListener('keyup', onKeyUp, listener)
  window.addEventListener('blur', releaseInput, listener)
  canvas.addEventListener('pointerdown', onPointerDown, listener)
  canvas.addEventListener('pointermove', onPointerMove, listener)
  canvas.addEventListener('pointerleave', onPointerLeave, listener)
  window.addEventListener('pointerup', onPointerUp, listener)
  window.addEventListener('pointercancel', releaseInput, listener)
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(layer)
  resize()

  function screenPosition(x: number, y: number, z: number) {
    const vertex = projection.set(x, y, z).project(camera)
    return { x: (vertex.x + 1) * 0.5 * width, y: (1 - vertex.y) * 0.5 * height }
  }

  function drawOverlay() {
    if (!context2d) return
    context2d.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context2d.clearRect(0, 0, width, height)
    const selected = targetEnemy()
    for (const enemy of enemies.values()) {
      const def = ENEMIES[enemy.kind]
      if (distance(enemy, hero) > 11 || (enemy.health === def.health && enemy !== selected && enemy.kind === 'normal' && !enemy.warning)) continue
      const screen = screenPosition(enemy.x, enemy.height + 0.22, enemy.z)
      if (screen.x < -40 || screen.x > width + 40 || screen.y < 0 || screen.y > height) continue
      const w = enemy.kind === 'normal' ? 35 : enemy.kind === 'elite' ? 66 : 96
      const barHeight = enemy.kind === 'normal' ? 4 : 5
      context2d.fillStyle = 'rgba(16,21,18,.94)'
      context2d.fillRect(screen.x - w / 2 - 1, screen.y - 1, w + 2, barHeight + 2)
      context2d.fillStyle = '#543e36'
      context2d.fillRect(screen.x - w / 2, screen.y, w, barHeight)
      context2d.fillStyle = enemy.kind === 'normal' ? '#d07a5b' : enemy.kind === 'elite' ? '#d1a268' : '#e28d52'
      context2d.fillRect(screen.x - w / 2, screen.y, w * enemy.health / def.health, barHeight)
    }
    for (const number of numbers) {
      const age = visualTime - number.starts
      const screen = screenPosition(number.x, number.y + age * 0.72, number.z)
      context2d.globalAlpha = Math.min(1, (0.85 - age) * 3.6)
      context2d.font = '700 ' + (number.text.endsWith('!') ? 19 : 15) + 'px Georgia, serif'
      context2d.textAlign = 'center'
      context2d.lineJoin = 'round'
      context2d.lineWidth = 3
      context2d.strokeStyle = '#18221c'
      context2d.strokeText(number.text, screen.x, screen.y)
      context2d.fillStyle = number.color
      context2d.fillText(number.text, screen.x, screen.y)
    }
    context2d.globalAlpha = 1
  }

  function updateVisuals(dt: number) {
    forest.update(visualTime, stage)
    if (phase === 'defeat') {
      hero.model.root.rotation.z = THREE.MathUtils.smoothstep(visualTime - defeatedAt, 0, 0.44) * -1.22
    }
    playerRing.root.position.set(hero.x, 0.016, hero.z)
    playerRing.fill.color.setHex(time < hurtUntil ? 0xf8866d : 0xa9e5bb)
    aimRing.root.visible = hasPointer && phase === 'combat' && !paused
    aimRing.root.position.set(aim.x, 0.025, aim.z)
    const closest = nearestDrop()
    for (const drop of drops) {
      drop.model.rotation.y = visualTime * 1.7
      drop.model.position.y = 0.07 * Math.sin(visualTime * 4 + drop.x)
      drop.model.scale.setScalar(drop === closest ? 1.16 : 0.91)
    }
    for (let index = flashes.length - 1; index >= 0; index--) {
      const effect = flashes[index]
      const progress = (visualTime - effect.start) / effect.duration
      if (progress >= 1) {
        effect.mark.dispose()
        flashes.splice(index, 1)
      } else {
        effect.mark.fill.opacity = (1 - progress) * 0.48
        effect.mark.outline.opacity = (1 - progress) * 0.91
      }
    }
    for (let i = corpses.length - 1; i >= 0; i--) {
      const corpse = corpses[i]
      const animated = corpse.actor.kind === 'elite'
      const progress = (visualTime - corpse.start) / (animated ? 1.23 : 0.5)
      if (progress >= 1) {
        corpse.actor.model.root.removeFromParent()
        corpse.actor.model.dispose()
        corpses.splice(i, 1)
      } else if (animated) {
        corpse.actor.model.setMotion('death', dt, time)
        const collapse = Math.max(0, (progress - 0.72) / 0.28)
        corpse.actor.model.root.scale.setScalar(corpse.scale * (1 - collapse * 0.85))
      } else {
        corpse.actor.model.root.rotation.z = progress * 0.9
        corpse.actor.model.root.scale.setScalar(corpse.scale * (1 - progress * 0.85))
      }
    }
    while (numbers[0] && visualTime - numbers[0].starts >= 0.85) numbers.shift()
  }

  function frame(now: number) {
    if (disposed) return
    const elapsed = Math.max(0, (now - previousFrame) / 1000)
    const dt = Math.min(0.06, elapsed)
    if (sceneScale === 1 && !document.hidden) {
      slowFrames = elapsed > 0.055 ? slowFrames + 1 : Math.max(0, slowFrames - 1)
      if (slowFrames >= 12) {
        // Reduce the 3D framebuffer and shadow cost while keeping the HUD at native resolution.
        sceneScale = 0.75
        sun.shadow.mapSize.set(768, 768)
        sun.shadow.map?.dispose()
        sun.shadow.map = null
        resize()
      }
    }
    previousFrame = now
    stats = hooks.getStats()
    if (phase === 'camp') health = stats.maxHealth
    else health = Math.min(health, stats.maxHealth)
    if (!paused) visualTime += dt
    if (!paused && phase !== 'defeat') {
      accumulator += dt
      while (accumulator >= FIXED_DT) {
        accumulator -= FIXED_DT
        simulation(FIXED_DT)
        if ((phase as GamePhase) === 'defeat') {
          accumulator = 0
          break
        }
      }
    }
    cameraUpdate(dt)
    updateAim()
    updateVisuals(paused ? 0 : dt)
    renderer.render(scene, camera)
    drawOverlay()
    if (now >= nextSnapshot) {
      nextSnapshot = now + 68
      publish()
    }
    raf = requestAnimationFrame(frame)
  }

  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(raf)
    observers.abort()
    resizeObserver.disconnect()
    clearRun()
    hero.model.root.removeFromParent()
    hero.model.dispose()
    playerRing.dispose()
    aimRing.dispose()
    models.dispose()
    disposeScene(scene)
    world.removeCharacterController(character)
    world.free()
    sun.shadow.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    layer.remove()
  }

  cameraUpdate(0, true)
  publish(true)
  raf = requestAnimationFrame(frame)
  return { start, setPaused, pause: () => setPaused(true), resume: () => setPaused(false), returnToCamp, pickup, dispose }
}

