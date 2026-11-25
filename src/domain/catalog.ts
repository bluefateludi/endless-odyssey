import type { AffixDefinition, EquipmentBase, EquipmentSlot, LegendaryEffectRef, Rarity, StatId, StatModifier } from './types'

export const EQUIPMENT_CONFIG_VERSION = '0.1.0'
export const EQUIPMENT_SLOTS = ['weapon', 'head', 'chest', 'hands', 'feet', 'accessory'] as const satisfies readonly EquipmentSlot[]

export const RARITIES = {
  common: { name: '普通', color: '#B8BEC7', minAffixes: 0, maxAffixes: 0, maxPerKind: 0, maxTier: 1 },
  magic: { name: '魔法', color: '#6196F5', minAffixes: 1, maxAffixes: 2, maxPerKind: 1, maxTier: 2 },
  rare: { name: '稀有', color: '#EAC45E', minAffixes: 3, maxAffixes: 4, maxPerKind: 2, maxTier: 3 },
  epic: { name: '史诗', color: '#AE78E8', minAffixes: 4, maxAffixes: 5, maxPerKind: 3, maxTier: 4 },
  legendary: { name: '传说', color: '#F0A34B', minAffixes: 4, maxAffixes: 5, maxPerKind: 3, maxTier: 5 },
} as const satisfies Record<Rarity, { name: string; color: string; minAffixes: number; maxAffixes: number; maxPerKind: number; maxTier: number }>

export const MATERIALS = { shards: 'upgrade_shard', crystals: 'reforge_crystal' } as const

const flat = (stat: StatId, value: number): StatModifier => ({ stat, operation: 'flat', value })

function base(
  id: string, name: string, slot: EquipmentSlot, baseStats: readonly StatModifier[],
  minRequiredLevel = 1, dropWeight = 1,
): EquipmentBase {
  return { id: 'base_' + id, name, slot, baseStats, minRequiredLevel, dropWeight, tags: [slot], assetId: 'equipment_' + id }
}

export const EQUIPMENT_BASES: readonly EquipmentBase[] = [
  base('iron_sword', '铁剑', 'weapon', [flat('weaponDamageMin', 8), flat('weaponDamageMax', 12), flat('baseAttackSpeed', 1.55)], 1, 2),
  base('war_axe', '战斧', 'weapon', [flat('weaponDamageMin', 10), flat('weaponDamageMax', 16), flat('baseAttackSpeed', 1.2)]),
  base('leather_cap', '皮帽', 'head', [flat('armor', 4), flat('maxHealth', 6)]),
  base('iron_helm', '铁盔', 'head', [flat('armor', 8), flat('maxHealth', 4)], 2),
  base('leather_vest', '皮甲', 'chest', [flat('armor', 7), flat('maxHealth', 12)]),
  base('chainmail', '锁子甲', 'chest', [flat('armor', 13), flat('maxHealth', 8)], 2),
  base('leather_gloves', '皮手套', 'hands', [flat('armor', 3), flat('attackSpeedBonus', 0.025)]),
  base('iron_gauntlets', '铁手套', 'hands', [flat('armor', 6)], 2),
  base('travel_boots', '旅行靴', 'feet', [flat('armor', 3), flat('moveSpeedBonus', 0.04)]),
  base('iron_boots', '铁靴', 'feet', [flat('armor', 7), flat('moveSpeedBonus', 0.02)], 2),
  base('charm', '雷石护符', 'accessory', [flat('lightningDamage', 2)]),
  base('silver_ring', '银戒指', 'accessory', [flat('critChance', 0.025)]),
]

const offensive: readonly EquipmentSlot[] = ['weapon', 'accessory']
const armor: readonly EquipmentSlot[] = ['head', 'chest', 'hands', 'feet']
const defensive: readonly EquipmentSlot[] = [...armor, 'accessory']
const tierLevels = [1, 10, 20, 35, 50]
const tierMultipliers = [1, 1.5, 2.2, 3.1, 4.5]
const ratioMultipliers = [1, 1.25, 1.55, 1.85, 2.15]

function affix(
  id: string, name: string, kind: AffixDefinition['kind'], stat: StatId, allowedSlots: readonly EquipmentSlot[],
  range: readonly [number, number],
  options: { operation?: StatModifier['operation']; group?: string; ratio?: true } = {},
): AffixDefinition {
  return {
    id: 'affix_' + id,
    name,
    kind,
    stat,
    allowedSlots,
    operation: options.operation ?? 'flat',
    exclusiveGroup: options.group ?? id,
    weight: 1,
    precision: options.ratio ? 0.001 : 1,
    tiers: (options.ratio ? ratioMultipliers : tierMultipliers).map((multiplier, index) => ({
      tier: index + 1,
      minItemLevel: tierLevels[index],
      min: range[0] * multiplier,
      max: range[1] * multiplier,
      weight: 5 - index,
    })),
  }
}

export const AFFIXES: readonly AffixDefinition[] = [
  affix('attack_flat', '锋利的', 'prefix', 'attackPower', offensive, [3, 8]),
  affix('attack_pct', '毁灭的', 'prefix', 'attackPower', ['weapon'], [0.05, 0.10], { operation: 'increased', ratio: true }),
  affix('health', '坚韧的', 'prefix', 'maxHealth', defensive, [10, 25]),
  affix('armor', '坚固的', 'prefix', 'armor', armor, [4, 12]),
  affix('lightning', '雷鸣的', 'prefix', 'lightningDamage', offensive, [2, 6], { group: 'element' }),
  affix('fire', '灼热的', 'prefix', 'fireDamage', offensive, [2, 6], { group: 'element' }),
  affix('ice', '霜寒的', 'prefix', 'iceDamage', offensive, [2, 6], { group: 'element' }),
  affix('crit', '精准', 'suffix', 'critChance', offensive, [0.02, 0.05], { ratio: true }),
  affix('crit_multi', '致命', 'suffix', 'critMultiplier', offensive, [0.10, 0.20], { ratio: true }),
  affix('attack_speed', '迅捷', 'suffix', 'attackSpeedBonus', ['weapon', 'hands', 'accessory'], [0.05, 0.10], { ratio: true }),
  affix('move_speed', '疾行', 'suffix', 'moveSpeedBonus', ['feet'], [0.03, 0.08], { ratio: true }),
  affix('regen', '再生', 'suffix', 'healthRegen', defensive, [1, 3]),
  affix('armor_pct', '精锻的', 'prefix', 'armor', armor, [0.08, 0.16], { operation: 'increased', ratio: true }),
  affix('health_pct', '活力', 'suffix', 'maxHealth', armor, [0.04, 0.08], { operation: 'increased', ratio: true }),
]

export const THUNDER_OATH = {
  id: 'legendary_thunder_oath',
  baseId: 'base_iron_sword',
  name: '雷霆之誓',
  minItemLevel: 1,
  effect: {
    effectId: 'chain_lightning_on_crit',
    params: { maxTargets: 5, damageRatio: 0.35, cooldownSeconds: 1.5, jumpRadius: 5 },
  } satisfies LegendaryEffectRef,
}
