import type { Hero, StatId, StatModifier, TalentId } from './types'

export const TALENT_CONFIG_VERSION = '0.1.0'
export const TALENT_POINT_CAP = 10

export type TalentEffect =
  | { kind: 'stat'; modifier: StatModifier }
  | { kind: 'cleaveRadius'; meters: number }
  | { kind: 'rage'; duration: number; attackSpeedBonus: number }
  | { kind: 'rageAttackPower'; increased: number }
  | { kind: 'outOfCombatRegen'; delay: number; healingPerSecond: number }
  | { kind: 'lowHealthReduction'; threshold: number; reduction: number }
  | { kind: 'retaliation'; duration: number; physicalIncrease: number }
  | { kind: 'burn'; ticks: number; interval: number; damage: number }
  | { kind: 'storm'; chance: number; damage: number; cooldown: number }
  | { kind: 'stormOnBurning'; damage: number }

export interface TalentDefinition {
  readonly id: TalentId
  readonly name: string
  readonly prerequisites: readonly TalentId[]
  readonly cost: number
  readonly description: string
  readonly effect: TalentEffect
}

function stat(id: StatId, value: number): TalentEffect {
  return { kind: 'stat', modifier: { stat: id, operation: 'flat', value } }
}

function node(
  id: TalentId, name: string, prerequisites: readonly TalentId[], description: string, effect: TalentEffect,
): TalentDefinition {
  return { id, name, prerequisites, cost: 1, description, effect }
}

export const TALENTS: readonly TalentDefinition[] = [
  node('M1', '力量', [], '攻击力 +4。', stat('attackPower', 4)),
  node('M2', '迅刃', ['M1'], '攻击速度 +8%。', stat('attackSpeedBonus', 0.08)),
  node('M3', '精准', ['M1'], '暴击率 +4 个百分点。', stat('critChance', 0.04)),
  node('M4', '致命', ['M3'], '暴击伤害倍率 +0.20。', stat('critMultiplier', 0.2)),
  node('M5', '横扫', ['M2'], '顺劈半径 +0.6 米。', { kind: 'cleaveRadius', meters: 0.6 }),
  node('M6', '狂暴', ['M2', 'M3'], '直接暴击后 3 秒内攻击速度 +15%。', { kind: 'rage', duration: 3, attackSpeedBonus: 0.15 }),
  node('M7', '乘胜', ['M6', 'M4'], '狂暴期间攻击力 +15%。', { kind: 'rageAttackPower', increased: 0.15 }),
  node('G1', '体质', [], '最大生命 +20。', stat('maxHealth', 20)),
  node('G2', '厚甲', ['G1'], '护甲 +12。', stat('armor', 12)),
  node('G3', '复苏', ['G1'], '每秒回复 +1 生命。', stat('healthRegen', 1)),
  node('G4', '稳步', ['G2'], '移动速度 +6%。', stat('moveSpeedBonus', 0.06)),
  node('G5', '回春', ['G3'], '4 秒未受伤时额外每秒回复 2 生命。', { kind: 'outOfCombatRegen', delay: 4, healingPerSecond: 2 }),
  node('G6', '不屈', ['G2', 'G3'], '低于 35% 生命时，直接物理伤害降低 15%。', { kind: 'lowHealthReduction', threshold: 0.35, reduction: 0.15 }),
  node('G7', '反击', ['G6', 'G4'], '受直接命中后 2 秒内，下次普攻物理伤害 +25%。', { kind: 'retaliation', duration: 2, physicalIncrease: 0.25 }),
  node('E1', '元素', [], '附加雷伤 +3。', stat('lightningDamage', 3)),
  node('E2', '火种', ['E1'], '附加火伤 +3。', stat('fireDamage', 3)),
  node('E3', '导电', ['E1'], '附加雷伤 +4。', stat('lightningDamage', 4)),
  node('E4', '燃烧', ['E2'], '带火伤的直接命中使目标在 3 秒内每秒受到 2 点火伤。', { kind: 'burn', ticks: 3, interval: 1, damage: 2 }),
  node('E5', '雷暴', ['E3'], '直接命中有 20% 概率追加 8 雷伤，冷却 1 秒。', { kind: 'storm', chance: 0.2, damage: 8, cooldown: 1 }),
  node('E6', '风暴余烬', ['E4', 'E5'], '雷暴对正在燃烧的目标附加 14 雷伤。', { kind: 'stormOnBurning', damage: 14 }),
]

export const TALENT_BY_ID = new Map(TALENTS.map((talent) => [talent.id, talent]))

export function getTalentEffect<Kind extends TalentEffect['kind']>(
  hero: Pick<Hero, 'talents'>, id: TalentId, kind: Kind,
): Extract<TalentEffect, { kind: Kind }> | undefined {
  const effect = hero.talents.includes(id) ? TALENT_BY_ID.get(id)?.effect : undefined
  if (effect?.kind === kind) return effect as Extract<TalentEffect, { kind: Kind }>
}
