import type { Page, Route } from '@playwright/test'
import type { EnemyKind, GamePhase, GameStage } from '../../src/game/contracts'
import { containsPoint, PLAYER_AREAS, type GroundPoint, type HitArea } from '../../src/game/encounters'

type CombatEnemy = GroundPoint & {
  id: string
  kind: EnemyKind
  health: number
  screen: { x: number; y: number }
  warning?: HitArea
}

interface CombatFrame {
  time: number
  phase: GamePhase
  stage: GameStage
  paused: boolean
  health: number
  kills: number
  hero: GroundPoint
  enemies: CombatEnemy[]
  drops: (GroundPoint & { name: string })[]
  swing: boolean
  cleaveReady: boolean
  cleaveRadius: number
}

type ObservableCanvas = HTMLCanvasElement & { readCombatFrame?: () => CombatFrame }

async function transformModule(route: Route, transform: (body: string) => string) {
  const response = await route.fetch()
  const original = await response.text()
  const body = transform(original)
  if (body === original) {
    await route.fulfill({ status: 500, body: 'Playwright could not install the combat fixture in ' + route.request().url() })
    return
  }
  await route.fulfill({ response, body })
}

// The canvas stays a real game canvas. The intercepted module provides only copied
// coordinates and combat state so input can follow enemies without guessing pixels.
export async function observeCombat(page: Page) {
  // Advance the real game loop explicitly. Browser/GPU latency between input events
  // must not change how much combat time elapses while Playwright inspects a frame.
  const epoch = new Date('2026-01-01T08:00:00Z')
  await page.clock.install({ time: epoch })
  await page.clock.pauseAt(new Date(epoch.getTime() + 60_000))
  await page.route(/\/src\/game\/index\.ts(?:\?|$)/, route => transformModule(route, body => body.replace(
    /return\s+\{\s*start,\s*setPaused,/,
    `Object.defineProperty(canvas, 'readCombatFrame', { value: () => ({
      time, phase, stage, paused, health, kills, swing: Boolean(swing),
      cleaveReady: time >= nextCleave, cleaveRadius: stats.cleaveRadius,
      hero: { x: hero.x, z: hero.z },
      enemies: Array.from(enemies.values(), enemy => ({
        id: enemy.id, x: enemy.x, z: enemy.z, health: enemy.health, kind: enemy.kind,
        screen: screenPosition(enemy.x, 0, enemy.z),
        warning: enemy.warning && { ...enemy.warning.area },
      })),
      drops: drops.map(({ x, z, loot }) => ({ x, z, name: loot.name })),
    }) });
    return { start, setPaused,`,
  )))
}

// Fix the loot and damage samples in their own modules. Rendering and instance
// IDs continue to use their ordinary randomness.
export async function fixCombatRolls(page: Page) {
  await page.route(/\/src\/domain\/loot\.ts(?:\?|$)/, route => transformModule(route, body =>
    body.replaceAll('options.rng ?? Math.random', 'options.rng ?? (() => 0.1)')))
  await page.route(/\/src\/domain\/stats\.ts(?:\?|$)/, route => transformModule(route, body =>
    body.replaceAll('options.rng ?? Math.random', 'options.rng ?? (() => 0.8)')))
}

export async function readCombat(page: Page, after?: Pick<CombatFrame, 'time' | 'stage'>) {
  // Two render frames still execute every underlying 60 Hz physics step.
  // The software renderer needs only the final pose between input observations.
  await page.clock.fastForward(after ? 48 : 32)
  if (after) await page.clock.fastForward(48)
  return page.evaluate(() => {
    const read = document.querySelector<ObservableCanvas>('canvas[aria-label="林地遗迹战斗场景"]')?.readCombatFrame
    if (!read) throw new Error('Combat observation is missing from the canvas')
    return read()
  })
}

const distance = (a: GroundPoint, b: GroundPoint) => Math.hypot(a.x - b.x, a.z - b.z)
const toward = (from: GroundPoint, to: GroundPoint) => ({ x: to.x - from.x, z: to.z - from.z })
const pathX = (z: number) => Math.sin(z * 0.17) * 0.7
const forward = { x: -7.6 / Math.hypot(7.6, 12.2), z: -12.2 / Math.hypot(7.6, 12.2) }
const right = { x: -forward.z, z: forward.x }

function dodgeVector(hero: GroundPoint, area: HitArea): GroundPoint | undefined {
  if (area.shape !== 'line') {
    const padded = { ...area, radius: area.radius + 0.28, angle: area.angle && area.angle + 0.13 }
    return containsPoint(padded, hero) ? toward(area, hero) : undefined
  }
  const sideways = { x: Math.cos(area.facing), z: -Math.sin(area.facing) }
  const lateral = (hero.x - area.x) * sideways.x + (hero.z - area.z) * sideways.z
  if (Math.abs(lateral) >= (area.halfWidth ?? 0) + 0.17 || distance(hero, area) > area.radius + 0.15) return
  const direction = Math.abs(lateral) > 0.12 ? Math.sign(lateral) : Math.sign((pathX(hero.z) - hero.x) * sideways.x) || 1
  return { x: sideways.x * direction, z: sideways.z * direction }
}

class CombatControls {
  private heldKeys = new Set<string>()
  private attacking = false

  constructor(private page: Page) {}

  async move(vector?: GroundPoint) {
    const next = new Set<string>()
    if (vector) {
      const horizontal = vector.x * right.x + vector.z * right.z
      const vertical = vector.x * forward.x + vector.z * forward.z
      const threshold = Math.hypot(horizontal, vertical) * 0.39
      if (Math.abs(horizontal) > threshold) next.add(horizontal > 0 ? 'd' : 'a')
      if (Math.abs(vertical) > threshold) next.add(vertical > 0 ? 'w' : 's')
    }
    for (const key of this.heldKeys) if (!next.has(key)) await this.page.keyboard.up(key)
    for (const key of next) if (!this.heldKeys.has(key)) await this.page.keyboard.down(key)
    this.heldKeys = next
  }

  async attack(held: boolean) {
    if (held === this.attacking) return
    if (held) await this.page.mouse.down()
    else await this.page.mouse.up()
    this.attacking = held
  }

  async release() {
    await this.move()
    await this.attack(false)
  }
}

function approach(hero: GroundPoint, target: GroundPoint): GroundPoint {
  if (Math.abs(target.z - hero.z) > 4.5) {
    const nextZ = hero.z + Math.sign(target.z - hero.z) * 2
    return toward(hero, { x: pathX(nextZ), z: nextZ })
  }
  return toward(hero, target)
}

function steerPastObstacle(hero: GroundPoint, movement: GroundPoint): GroundPoint {
  const left = { x: movement.z, z: -movement.x }
  const right = { x: -movement.z, z: movement.x }
  const steer = Math.abs(hero.x + left.x * 0.35 - pathX(hero.z)) < Math.abs(hero.x + right.x * 0.35 - pathX(hero.z)) ? left : right
  return { x: movement.x * 0.3 + steer.x, z: movement.z * 0.3 + steer.z }
}

export async function fight(page: Page, stage: 1 | 2 | 3, onApproach?: () => Promise<void>) {
  const controls = new CombatControls(page)
  let frame = await readCombat(page)
  const start = frame.time
  let previousMovement: { from: GroundPoint; time: number } | undefined
  let detourUntil = 0
  try {
    while (frame.stage === stage && frame.phase === 'combat' && frame.time - start < 29) {
      const nearest = frame.enemies.toSorted((a, b) => distance(frame.hero, a) - distance(frame.hero, b))
      const target = nearest[0]
      const range = distance(frame.hero, target)
      const dodge = nearest.map(enemy => enemy.warning && dodgeVector(frame.hero, enemy.warning)).find(Boolean)

      if (onApproach && range < 6.2) {
        await controls.release()
        await page.mouse.move(target.screen.x, target.screen.y)
        await onApproach()
        onApproach = undefined
        frame = await readCombat(page)
        continue
      }
      if (range < 6.2) await page.mouse.move(target.screen.x, target.screen.y)

      const cleave = frame.cleaveReady && !frame.swing && range < frame.cleaveRadius + 0.12 && !dodge
      const basic = range < PLAYER_AREAS.basic.radius + 0.15 && !dodge && !cleave
      const safeToApproach = !target.warning || (target.kind === 'normal' && !dodge)
      const moving = dodge || (range > PLAYER_AREAS.basic.radius - 0.45 && safeToApproach ? approach(frame.hero, target) : undefined)
      if (moving && previousMovement && frame.time - previousMovement.time > 0.18) {
        if (distance(frame.hero, previousMovement.from) < 0.18) detourUntil = frame.time + 0.3
        previousMovement = undefined
      }
      previousMovement = moving ? previousMovement ?? { from: frame.hero, time: frame.time } : undefined
      await controls.move(moving && frame.time < detourUntil ? steerPastObstacle(frame.hero, moving) : moving)
      await controls.attack(basic)
      if (cleave) await page.keyboard.press('q')
      frame = await readCombat(page, frame)
    }
    if (frame.phase === 'defeat' || (frame.phase === 'combat' && frame.stage === stage)) {
      throw new Error(`Could not finish encounter ${stage}: ${JSON.stringify(frame)}`)
    }
    return frame
  } finally {
    await controls.release()
  }
}

export async function approachLoot(page: Page) {
  const controls = new CombatControls(page)
  const pickup = page.getByRole('button', { name: /拾取/ })
  try {
    let frame = await readCombat(page)
    const start = frame.time
    while (!(await pickup.isVisible()) && frame.time - start < 5) {
      const target = frame.drops.toSorted((a, b) => distance(frame.hero, a) - distance(frame.hero, b))[0]
      if (!target) break
      await controls.move(toward(frame.hero, target))
      frame = await readCombat(page, frame)
    }
  } finally {
    await controls.release()
  }
  return pickup
}
