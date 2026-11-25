import { AFFIXES, EQUIPMENT_BASES, EQUIPMENT_CONFIG_VERSION, EQUIPMENT_SLOTS, RARITIES, THUNDER_OATH } from './catalog'
import type {
  AffixDefinition, EnemyKind, EquipmentBase, EquipmentInstance, EquipmentSlot, ItemGenerationOptions, RandomSource, Rarity,
} from './types'

export interface GenerateItemInput {
  rarity: Rarity
  itemLevel: number
  baseId?: string
}

const BASE_BY_ID = new Map(EQUIPMENT_BASES.map((base) => [base.id, base]))

export const DROP_TABLES = {
  normal: { chance: 0.2, count: [1, 1], itemLevelOffset: 0, rarity: { common: 65, magic: 25, rare: 9, epic: 0.9, legendary: 0.1 } },
  elite: { chance: 0.75, count: [1, 1], itemLevelOffset: 1, rarity: { common: 30, magic: 40, rare: 25, epic: 4, legendary: 1 } },
  boss: { chance: 1, count: [2, 4], itemLevelOffset: 2, rarity: { common: 5, magic: 20, rare: 55, epic: 17, legendary: 3 } },
} as const satisfies Record<EnemyKind, {
  chance: number; count: readonly [number, number]; itemLevelOffset: number; rarity: Record<Rarity, number>
}>

export function createSeededRng(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function draw(rng: RandomSource): number {
  const value = rng()
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Expected a random sample in [0, 1)')
  return value
}

function integerBetween(min: number, max: number, rng: RandomSource): number {
  return min === max ? min : min + Math.floor(draw(rng) * (max - min + 1))
}

function pickWeighted<T>(entries: readonly T[], weight: (entry: T) => number, rng: RandomSource): T {
  const total = entries.reduce((sum, entry) => sum + weight(entry), 0)
  if (!(total > 0)) throw new Error('Equipment configuration has an empty weighted pool')
  let remaining = draw(rng) * total
  let lastPositive: T | undefined
  for (const entry of entries) {
    const entryWeight = weight(entry)
    if (entryWeight <= 0) continue
    lastPositive = entry
    remaining -= entryWeight
    if (remaining < 0) return entry
  }
  return lastPositive!
}

function validLevel(level: number): number {
  if (!Number.isSafeInteger(level)) throw new RangeError('Expected a safe integer item or monster level')
  return Math.max(1, level)
}

function availableTiers(affix: AffixDefinition, rarity: Rarity, level: number) {
  return affix.tiers.filter((tier) => tier.minItemLevel <= level && tier.tier <= RARITIES[rarity].maxTier && tier.weight > 0)
}

function availableAffixes(slot: EquipmentSlot, rarity: Rarity, level: number) {
  return AFFIXES.filter((affix) => affix.weight > 0 && affix.allowedSlots.includes(slot) && availableTiers(affix, rarity, level).length > 0)
}

function compatibleAffixes(pool: readonly AffixDefinition[], selected: readonly AffixDefinition[], maxPerKind: number) {
  const prefixes = selected.filter((affix) => affix.kind === 'prefix').length
  const suffixes = selected.length - prefixes
  return pool.filter((affix) =>
    (affix.kind === 'prefix' ? prefixes : suffixes) < maxPerKind
    && selected.every((chosen) => chosen.id !== affix.id && chosen.exclusiveGroup !== affix.exclusiveGroup),
  )
}

function canComplete(pool: readonly AffixDefinition[], selected: readonly AffixDefinition[], count: number, maxPerKind: number): boolean {
  if (selected.length === count) return true
  return compatibleAffixes(pool, selected, maxPerKind)
    .some((candidate, index, compatible) => canComplete(compatible.slice(index + 1), [...selected, candidate], count, maxPerKind))
}

function rollAffixes(base: EquipmentBase, rarity: Rarity, itemLevel: number, rng: RandomSource) {
  const { minAffixes, maxAffixes, maxPerKind } = RARITIES[rarity]
  const count = integerBetween(minAffixes, maxAffixes, rng)
  const pool = availableAffixes(base.slot, rarity, itemLevel)
  const selected: AffixDefinition[] = []
  while (selected.length < count) {
    const candidates = compatibleAffixes(pool, selected, maxPerKind)
      .filter((candidate) => canComplete(pool, [...selected, candidate], count, maxPerKind))
    if (candidates.length === 0) throw new Error('Insufficient legal affixes for ' + base.id + ' (' + rarity + ')')
    selected.push(pickWeighted(candidates, (candidate) => candidate.weight, rng))
  }
  return selected.map((affix) => {
    const tier = pickWeighted(availableTiers(affix, rarity, itemLevel), (entry) => entry.weight, rng)
    const min = Math.ceil(tier.min / affix.precision - 1e-9)
    const max = Math.floor(tier.max / affix.precision + 1e-9)
    const value = Number((integerBetween(min, max, rng) * affix.precision).toFixed(3))
    return { affixId: affix.id, tier: tier.tier, modifier: { stat: affix.stat, operation: affix.operation, value } }
  })
}

export function generateItem(input: GenerateItemInput, options: ItemGenerationOptions = {}): EquipmentInstance {
  const rng = options.rng ?? Math.random
  const itemLevel = validLevel(input.itemLevel)
  const rarity = input.rarity
  const legendary = rarity === 'legendary' ? THUNDER_OATH : undefined
  if (legendary && (itemLevel < legendary.minItemLevel || (input.baseId && input.baseId !== legendary.baseId))) {
    throw new Error('No legendary template for the requested base and level')
  }
  const baseId = legendary?.baseId ?? input.baseId
  const base = baseId ? BASE_BY_ID.get(baseId) : pickWeighted(
    EQUIPMENT_BASES.filter((item) => item.minRequiredLevel <= itemLevel), (item) => item.dropWeight, rng,
  )
  if (!base) throw new Error('Unknown equipment base: ' + baseId)
  const multiplier = 1 + (Math.min(itemLevel, 50) - 1) * 0.06
  const baseStats = base.baseStats.map((modifier) => {
    const scales = ['weaponDamageMin', 'weaponDamageMax', 'armor', 'maxHealth', 'lightningDamage'].includes(modifier.stat)
    return { ...modifier, value: scales ? Math.round(modifier.value * multiplier) : modifier.value }
  })
  const affixes = rollAffixes(base, rarity, itemLevel, rng)
  const instanceId = (options.createId ?? (() => globalThis.crypto.randomUUID()))()
  const createdAt = (options.now ?? Date.now)()
  if (!instanceId || !Number.isFinite(createdAt)) throw new Error('Invalid equipment instance ID or creation time')
  return {
    id: instanceId, instanceId, name: legendary?.name ?? base.name, slot: base.slot, schemaVersion: 1,
    configVersion: EQUIPMENT_CONFIG_VERSION, baseId: base.id, rarity, itemLevel,
    requiredLevel: Math.max(base.minRequiredLevel, Math.floor(itemLevel * 0.8), 1), upgradeLevel: 0,
    baseStats, affixes, createdAt, locked: false,
    ...(legendary && {
      legendaryTemplateId: legendary.id,
      legendaryEffect: { effectId: legendary.effect.effectId, params: { ...legendary.effect.params } },
    }),
  }
}

export function rollLoot(kind: EnemyKind, monsterLevel: number, options: ItemGenerationOptions = {}): EquipmentInstance[] {
  const table = DROP_TABLES[kind]
  const rng = options.rng ?? Math.random
  const itemLevel = validLevel(validLevel(monsterLevel) + table.itemLevelOffset)
  if (table.chance < 1 && draw(rng) >= table.chance) return []
  const count = integerBetween(table.count[0], table.count[1], rng)
  const rarities = (Object.keys(table.rarity) as Rarity[]).filter(
    (rarity) => rarity !== 'legendary' || itemLevel >= THUNDER_OATH.minItemLevel,
  )
  return Array.from({ length: count }, () => {
    const rarity = pickWeighted(rarities, (entry) => table.rarity[entry], rng)
    return generateItem({ rarity, itemLevel }, options)
  })
}

export function validateEquipmentCatalog(): string[] {
  const issues: string[] = []
  if (BASE_BY_ID.size !== EQUIPMENT_BASES.length) issues.push('Duplicate equipment base ID')
  if (new Set(AFFIXES.map((affix) => affix.id)).size !== AFFIXES.length) issues.push('Duplicate affix ID')
  if (!BASE_BY_ID.has(THUNDER_OATH.baseId) || THUNDER_OATH.effect.effectId !== 'chain_lightning_on_crit') {
    issues.push('Invalid legendary template reference')
  }
  for (const base of EQUIPMENT_BASES) {
    if (!EQUIPMENT_SLOTS.includes(base.slot) || !Number.isFinite(base.dropWeight) || base.dropWeight < 0
      || !Number.isSafeInteger(base.minRequiredLevel) || base.minRequiredLevel < 1
      || !base.assetId || base.baseStats.some(({ value }) => !Number.isFinite(value))) {
      issues.push('Invalid equipment base: ' + base.id)
    }
  }
  if (!EQUIPMENT_BASES.some((base) => base.dropWeight > 0 && base.minRequiredLevel === 1)) issues.push('No level-one drop base')
  for (const affix of AFFIXES) {
    const tierIds = new Set(affix.tiers.map((tier) => tier.tier))
    if (!Number.isFinite(affix.weight) || affix.weight < 0 || tierIds.size !== affix.tiers.length
      || affix.allowedSlots.length === 0 || affix.allowedSlots.some((slot) => !EQUIPMENT_SLOTS.includes(slot))
      || !affix.exclusiveGroup || !(affix.precision > 0)
      || affix.tiers.some((tier) => !Number.isInteger(tier.tier) || tier.tier < 1 || tier.tier > 5
        || !Number.isInteger(tier.minItemLevel) || tier.minItemLevel < 1 || !Number.isFinite(tier.min)
        || !Number.isFinite(tier.max) || tier.min > tier.max || !Number.isFinite(tier.weight) || tier.weight < 0)) {
      issues.push('Invalid affix: ' + affix.id)
    }
  }
  for (const base of EQUIPMENT_BASES) {
    for (const [rarity, rule] of Object.entries(RARITIES) as [Rarity, typeof RARITIES[Rarity]][]) {
      if (rarity === 'legendary' && base.id !== THUNDER_OATH.baseId) continue
      // Tiers only enter pools as levels increase, so the first legal level is the smallest pool.
      const minLevel = rarity === 'legendary' ? THUNDER_OATH.minItemLevel : base.minRequiredLevel
      if (!canComplete(availableAffixes(base.slot, rarity, minLevel), [], rule.maxAffixes, rule.maxPerKind)) {
        issues.push('Insufficient legal affixes for ' + base.id + ' (' + rarity + ')')
      }
    }
  }
  for (const [kind, table] of Object.entries(DROP_TABLES)) {
    const weights = Object.values(table.rarity)
    if (!Number.isFinite(table.chance) || table.chance < 0 || table.chance > 1
      || !table.count.every(Number.isSafeInteger) || table.count[0] < 1 || table.count[1] < table.count[0]
      || !Number.isSafeInteger(table.itemLevelOffset) || weights.some((weight) => !Number.isFinite(weight) || weight < 0)
      || Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 100) > 1e-9) {
      issues.push('Invalid drop table: ' + kind)
    }
  }
  return issues
}
