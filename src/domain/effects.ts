import { calculateDirectHit, resolveStats } from './stats'
import type { DirectHit } from './stats'
import { getTalentEffect } from './talent-catalog'
import type { Hero, RandomSource, ResolvedStats } from './types'

export type CombatSource = 'direct' | 'burn' | 'proc'
export type CombatAttack = 'basic' | 'cleave'

export interface CombatTarget {
  readonly id: string
  readonly health: number
  readonly armor: number
  readonly x: number
  readonly z: number
}

export interface CombatDamage {
  readonly targetId: string
  readonly amount: number
  readonly critical?: boolean
  readonly source: CombatSource
  readonly effect?: 'burn' | 'storm' | 'chain_lightning_on_crit'
}

interface BurnStatus {
  readonly targetId: string
  readonly nextTickAt: number
  readonly ticksLeft: number
  readonly interval: number
  readonly damage: number
}

export interface CombatEffectsState {
  readonly lastDamageAt: number
  readonly rageUntil: number
  readonly retaliationUntil: number
  readonly stormReadyAt: number
  readonly legendaryReadyAt: ReadonlyMap<string, number>
  readonly burns: readonly BurnStatus[]
}

export function createCombatEffects(
  hero?: Pick<Hero, 'inventory'>, now = 0, reloaded = false,
): CombatEffectsState {
  const legendaryReadyAt = new Map<string, number>()
  if (reloaded && hero) {
    for (const item of [...hero.inventory.items, ...Object.values(hero.inventory.equipped)]) {
      if (item?.legendaryEffect) {
        legendaryReadyAt.set(item.instanceId, now + item.legendaryEffect.params.cooldownSeconds)
      }
    }
  }
  return {
    lastDamageAt: -Infinity, rageUntil: -Infinity, retaliationUntil: -Infinity,
    stormReadyAt: reloaded ? now + 1 : -Infinity, legendaryReadyAt, burns: [],
  }
}

export function syncCombatEffects(hero: Hero, state: CombatEffectsState, now: number): CombatEffectsState {
  const rageUntil = now < state.rageUntil && hero.talents.includes('M6') ? state.rageUntil : -Infinity
  const retaliationUntil = now < state.retaliationUntil && hero.talents.includes('G7') ? state.retaliationUntil : -Infinity
  const burns = state.burns.length && !hero.talents.includes('E4') ? [] : state.burns
  if (rageUntil === state.rageUntil && retaliationUntil === state.retaliationUntil && burns === state.burns) return state
  return { ...state, rageUntil, retaliationUntil, burns }
}

export function resolveHealthRegen(
  hero: Hero, state: CombatEffectsState, now: number, stats: ResolvedStats = resolveStats(hero),
): number {
  const conditional = getTalentEffect(hero, 'G5', 'outOfCombatRegen')
  return stats.healthRegen + (conditional && now >= state.lastDamageAt + conditional.delay ? conditional.healingPerSecond : 0)
}

export function resolveCombatStats(hero: Hero, state: CombatEffectsState, now: number): ResolvedStats {
  const stats = resolveStats(hero, { rageActive: now < state.rageUntil })
  return { ...stats, healthRegen: resolveHealthRegen(hero, state, now, stats) }
}

export interface OutgoingHitEvent {
  readonly now: number
  readonly target: CombatTarget
  readonly enemies: readonly CombatTarget[]
  readonly hit: Pick<DirectHit, 'amount' | 'critical' | 'fire'>
  readonly source: CombatSource
  readonly rng?: RandomSource
}

function chainTargets(origin: CombatTarget, enemies: readonly CombatTarget[], radius: number, limit: number): CombatTarget[] {
  const hitIds = new Set([origin.id])
  const result: CombatTarget[] = []
  let current = origin
  while (result.length < limit) {
    let closest: CombatTarget | undefined
    let closestDistance = radius ** 2
    for (const enemy of enemies) {
      if (enemy.health <= 0 || hitIds.has(enemy.id)) continue
      const distance = (enemy.x - current.x) ** 2 + (enemy.z - current.z) ** 2
      if (distance < closestDistance || (distance === closestDistance && (!closest || enemy.id < closest.id))) {
        closestDistance = distance
        closest = enemy
      }
    }
    if (!closest) break
    result.push(closest)
    hitIds.add(closest.id)
    current = closest
  }
  return result
}

export function resolveOutgoingHit(hero: Hero, state: CombatEffectsState, event: OutgoingHitEvent): {
  state: CombatEffectsState; damage: CombatDamage[]
} {
  const damage: CombatDamage[] = []
  const { now, hit, target, enemies } = event
  if (event.source !== 'direct' || target.health <= 0 || !Number.isFinite(hit.amount) || hit.amount <= 0) {
    return { state, damage }
  }

  let next = syncCombatEffects(hero, state, now)
  const rage = getTalentEffect(hero, 'M6', 'rage')
  if (hit.critical && rage) next = { ...next, rageUntil: now + rage.duration }

  const storm = getTalentEffect(hero, 'E5', 'storm')
  const burn = getTalentEffect(hero, 'E4', 'burn')
  const targetSurvives = target.health > hit.amount
  const existingBurn = next.burns.find((status) => status.targetId === target.id)
  const alreadyBurning = existingBurn && now <= existingBurn.nextTickAt + (existingBurn.ticksLeft - 1) * existingBurn.interval
  if (targetSurvives && storm && now >= next.stormReadyAt && (event.rng ?? Math.random)() < storm.chance) {
    const synergy = alreadyBurning ? getTalentEffect(hero, 'E6', 'stormOnBurning') : undefined
    damage.push({ targetId: target.id, amount: synergy?.damage ?? storm.damage, source: 'proc', effect: 'storm' })
    next = { ...next, stormReadyAt: now + storm.cooldown }
  }

  if (targetSurvives && burn && hit.fire > 0) {
    const status = { targetId: target.id, nextTickAt: now + burn.interval, ticksLeft: burn.ticks, interval: burn.interval, damage: burn.damage }
    next = { ...next, burns: [...next.burns.filter((active) => active.targetId !== target.id), status] }
  }

  if (hit.critical) {
    for (const equipped of Object.values(hero.inventory.equipped)) {
      const legendary = equipped?.legendaryEffect
      if (!equipped || legendary?.effectId !== 'chain_lightning_on_crit'
        || now < (next.legendaryReadyAt.get(equipped.instanceId) ?? -Infinity)) continue
      const { jumpRadius, maxTargets, damageRatio, cooldownSeconds } = legendary.params
      if (!(jumpRadius > 0 && maxTargets > 0 && damageRatio > 0 && cooldownSeconds > 0)
        || ![jumpRadius, maxTargets, damageRatio, cooldownSeconds].every(Number.isFinite)) continue
      const targets = chainTargets(target, enemies, jumpRadius, Math.min(5, Math.floor(maxTargets)))
      if (targets.length === 0) continue
      const actualDamage = Math.min(target.health, hit.amount)
      for (const enemy of targets) {
        damage.push({ targetId: enemy.id, amount: actualDamage * damageRatio, source: 'proc', effect: legendary.effectId })
      }
      next = {
        ...next,
        legendaryReadyAt: new Map(next.legendaryReadyAt).set(equipped.instanceId, now + cooldownSeconds),
      }
    }
  }
  return { state: next, damage }
}

export interface IncomingHitEvent {
  readonly now: number
  readonly health: number
  readonly maxHealth: number
  readonly physical: number
  readonly elemental?: number
  readonly source: CombatSource
}

export function resolveIncomingHit(hero: Hero, state: CombatEffectsState, event: IncomingHitEvent): {
  state: CombatEffectsState; damage: number
} {
  const direct = event.source === 'direct'
  const reduction = direct ? getTalentEffect(hero, 'G6', 'lowHealthReduction') : undefined
  const multiplier = reduction && event.health < event.maxHealth * reduction.threshold ? 1 - reduction.reduction : 1
  const amount = Math.max(0, event.physical) * multiplier + Math.max(0, event.elemental ?? 0)
  if (event.health <= 0 || !Number.isFinite(amount) || amount === 0) return { state, damage: 0 }
  const retaliation = direct ? getTalentEffect(hero, 'G7', 'retaliation') : undefined
  return {
    damage: amount,
    state: {
      ...state,
      lastDamageAt: event.now,
      retaliationUntil: retaliation ? event.now + retaliation.duration : state.retaliationUntil,
    },
  }
}

export function tickCombatEffects(hero: Hero, state: CombatEffectsState, now: number, enemies: readonly CombatTarget[]): {
  state: CombatEffectsState; damage: CombatDamage[]
} {
  const active = syncCombatEffects(hero, state, now)
  const health = new Map(enemies.map((enemy) => [enemy.id, enemy.health]))
  const damage: CombatDamage[] = []
  const burns: BurnStatus[] = []
  let changed = false
  for (const burn of active.burns) {
    let remainingHealth = health.get(burn.targetId) ?? 0
    let nextTickAt = burn.nextTickAt
    let ticksLeft = burn.ticksLeft
    while (remainingHealth > 0 && nextTickAt <= now && ticksLeft > 0) {
      damage.push({ targetId: burn.targetId, amount: burn.damage, source: 'burn', effect: 'burn' })
      remainingHealth -= burn.damage
      nextTickAt += burn.interval
      ticksLeft -= 1
    }
    if (remainingHealth > 0 && ticksLeft > 0) {
      burns.push(ticksLeft === burn.ticksLeft ? burn : { ...burn, nextTickAt, ticksLeft })
    }
    if (remainingHealth <= 0 || ticksLeft !== burn.ticksLeft) changed = true
  }
  return { state: changed ? { ...active, burns } : active, damage }
}

export interface CombatAttackEvent {
  readonly now: number
  readonly attack: CombatAttack
  readonly targets: readonly CombatTarget[]
  readonly enemies: readonly CombatTarget[]
  readonly stats?: ResolvedStats
  readonly rng?: RandomSource
}

export function resolveCombatAttack(hero: Hero, state: CombatEffectsState, event: CombatAttackEvent): {
  state: CombatEffectsState; damage: CombatDamage[]
} {
  const { attack, now, rng } = event
  let next = syncCombatEffects(hero, state, now)
  const stats = event.stats ?? resolveCombatStats(hero, next, now)
  const retaliation = attack === 'basic' && now < next.retaliationUntil ? getTalentEffect(hero, 'G7', 'retaliation') : undefined
  const targets = new Set<string>()
  const enemies = new Map(event.enemies.map((enemy) => [enemy.id, enemy]))
  const damage: CombatDamage[] = []

  function apply(hit: CombatDamage) {
    const enemy = enemies.get(hit.targetId)
    if (!enemy || enemy.health <= 0) return
    damage.push(hit)
    enemies.set(hit.targetId, { ...enemy, health: Math.max(0, enemy.health - hit.amount) })
  }

  for (const candidate of event.targets) {
    if (targets.has(candidate.id)) continue
    targets.add(candidate.id)
    const target = enemies.get(candidate.id)
    if (!target || target.health <= 0) continue
    const hit = calculateDirectHit(stats, {
      targetArmor: target.armor,
      skillMultiplier: attack === 'cleave' ? 1.35 : 1,
      physicalIncrease: retaliation?.physicalIncrease,
      rng,
    })
    apply({ targetId: target.id, amount: hit.amount, critical: hit.critical, source: 'direct' })
    if (retaliation && hit.amount > 0) next = { ...next, retaliationUntil: -Infinity }
    const result = resolveOutgoingHit(hero, next, { now, target, enemies: [...enemies.values()], hit, source: 'direct', rng })
    next = result.state
    result.damage.forEach(apply)
  }
  return { state: next, damage }
}
