import { getTalentEffect, TALENTS } from './talent-catalog'
import type { Hero, RandomSource, ResolvedStats, StatId, StatModifier } from './types'

const BASE_STATS: Readonly<Record<StatId, number>> = {
  weaponDamageMin: 4, weaponDamageMax: 6, baseAttackSpeed: 1.4,
  attackPower: 4, maxHealth: 100, armor: 0, critChance: 0.05, critMultiplier: 1.5,
  attackSpeedBonus: 0, moveSpeedBonus: 0, fireDamage: 0, iceDamage: 0, lightningDamage: 0,
  healthRegen: 0, lifeSteal: 0,
}

export interface StatContext {
  readonly rageActive?: boolean
  readonly modifiers?: readonly StatModifier[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function resolveModifiers(
  base: Readonly<Record<StatId, number>>, modifiers: readonly StatModifier[],
): Record<StatId, number> {
  const totals: Partial<Record<StatId, { flat: number; increased: number; more: number }>> = {}
  for (const { stat, operation, value } of modifiers) {
    if (!Object.hasOwn(base, stat) || !Number.isFinite(value)) continue
    const statModifiers = totals[stat] ??= { flat: 0, increased: 0, more: 1 }
    if (operation === 'flat') statModifiers.flat += value
    if (operation === 'increased') statModifiers.increased += value
    if (operation === 'more') statModifiers.more *= 1 + value
  }
  const result = { ...base }
  for (const stat of Object.keys(totals) as StatId[]) {
    const total = totals[stat]!
    const value = (base[stat] + total.flat) * (1 + total.increased) * total.more
    const signed = stat === 'attackSpeedBonus' || stat === 'moveSpeedBonus'
    result[stat] = Number.isFinite(value) ? (signed ? value : Math.max(0, value)) : base[stat]
  }
  return result
}

export function resolveStats(hero: Pick<Hero, 'level' | 'talents' | 'inventory'>, context: StatContext = {}): ResolvedStats {
  const base = { ...BASE_STATS, maxHealth: 100 + 8 * (hero.level - 1), attackPower: 4 + hero.level - 1 }
  if (hero.inventory.equipped.weapon) {
    base.weaponDamageMin = 0
    base.weaponDamageMax = 0
    base.baseAttackSpeed = 0
  }

  const modifiers = [...(context.modifiers ?? [])]
  for (const item of Object.values(hero.inventory.equipped)) {
    if (!item) continue
    modifiers.push(...item.baseStats, ...item.affixes.map((affix) => affix.modifier))
  }
  for (const talent of TALENTS) {
    if (hero.talents.includes(talent.id) && talent.effect.kind === 'stat') modifiers.push(talent.effect.modifier)
  }

  if (context.rageActive) {
    const rage = getTalentEffect(hero, 'M6', 'rage')
    const attackPower = getTalentEffect(hero, 'M7', 'rageAttackPower')
    if (rage) modifiers.push({ stat: 'attackSpeedBonus', operation: 'flat', value: rage.attackSpeedBonus })
    if (rage && attackPower) modifiers.push({ stat: 'attackPower', operation: 'increased', value: attackPower.increased })
  }

  const stats = resolveModifiers(base, modifiers)
  stats.maxHealth = Math.max(1, stats.maxHealth)
  stats.critChance = clamp(stats.critChance, 0, 0.75)
  stats.critMultiplier = Math.max(1, stats.critMultiplier)
  stats.attackSpeedBonus = Math.max(-1, stats.attackSpeedBonus)
  stats.moveSpeedBonus = clamp(stats.moveSpeedBonus, -0.8, 2)
  stats.lifeSteal = clamp(stats.lifeSteal, 0, 1)
  stats.weaponDamageMax = Math.max(stats.weaponDamageMin, stats.weaponDamageMax)
  const cleave = getTalentEffect(hero, 'M5', 'cleaveRadius')
  return {
    ...stats,
    attacksPerSecond: clamp(stats.baseAttackSpeed * (1 + stats.attackSpeedBonus), 0.2, 8),
    weaponMin: stats.weaponDamageMin,
    weaponMax: stats.weaponDamageMax,
    movementSpeed: 4.5 * (1 + stats.moveSpeedBonus),
    cleaveRadius: 2.5 + (cleave?.meters ?? 0),
  }
}

export interface DirectHitOptions {
  targetArmor: number
  skillMultiplier?: number
  physicalIncrease?: number
  rng?: RandomSource
  critical?: boolean
}

export interface DirectHit {
  readonly amount: number
  readonly weaponRoll: number
  readonly physical: number
  readonly elemental: number
  readonly fire: number
  readonly critical: boolean
}

export function calculateArmorFactor(armor: number): number {
  return 100 / (100 + (Number.isFinite(armor) ? Math.max(0, armor) : 0))
}

export function calculateDirectHit(stats: ResolvedStats, options: DirectHitOptions): DirectHit {
  const rng = options.rng ?? Math.random
  const weaponSample = rng()
  const critSample = options.critical === undefined ? rng() : 0
  if (!Number.isFinite(weaponSample) || !Number.isFinite(critSample)) throw new RangeError('Expected finite damage RNG samples')
  const weaponRoll = stats.weaponDamageMin + (stats.weaponDamageMax - stats.weaponDamageMin) * clamp(weaponSample, 0, 1)
  const physical = Math.max(0, (weaponRoll + stats.attackPower) * (options.skillMultiplier ?? 1)
    * (1 + (options.physicalIncrease ?? 0))) * calculateArmorFactor(options.targetArmor)
  const elemental = stats.fireDamage + stats.iceDamage + stats.lightningDamage
  const critical = options.critical ?? clamp(critSample, 0, 1) < stats.critChance
  const amount = (physical + elemental) * (critical ? stats.critMultiplier : 1)
  if (!Number.isFinite(amount)) throw new RangeError('Expected finite direct hit damage')
  return { amount, weaponRoll, physical, elemental, fire: stats.fireDamage, critical }
}
