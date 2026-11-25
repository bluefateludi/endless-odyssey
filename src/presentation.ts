import { AFFIXES, TALENTS, type EquipmentInstance, type ResolvedStats, type StatId, type StatModifier } from './domain'
import type { UIComparisonRow, UIEquipment, UITalent } from './ui/types'

const labels: Record<StatId, string> = {
  weaponDamageMin: '最小武器伤害', weaponDamageMax: '最大武器伤害', baseAttackSpeed: '基础攻频',
  attackPower: '攻击力', maxHealth: '最大生命', armor: '护甲', critChance: '暴击率',
  critMultiplier: '暴击倍率', attackSpeedBonus: '攻击速度', moveSpeedBonus: '移动速度',
  fireDamage: '火焰伤害', iceDamage: '寒冰伤害', lightningDamage: '雷电伤害', healthRegen: '每秒回复', lifeSteal: '生命偷取',
}
const percentages = new Set<StatId>(['critChance', 'attackSpeedBonus', 'moveSpeedBonus', 'lifeSteal'])
const number = (n: number) => Number(n.toFixed(2)).toString()

function formatStat(stat: StatId, value: number, relative = false) {
  if (relative || percentages.has(stat)) return number(value * 100) + '%'
  if (stat === 'critMultiplier') return number(value) + '×'
  return number(value)
}

function line(m: StatModifier) {
  return { label: labels[m.stat], value: '+' + formatStat(m.stat, m.value, m.operation !== 'flat') }
}

export function displayItem(i: EquipmentInstance): UIEquipment {
  return {
    ...i, stats: i.baseStats.map(line),
    affixes: i.affixes.map(a => ({ ...line(a.modifier), tier: a.tier,
      label: (AFFIXES.find(d => d.id === a.affixId)?.name ?? '') + ' · ' + labels[a.modifier.stat] })),
    legendaryEffect: i.legendaryEffect ? { name: '连锁闪电', description: '直接暴击向附近其他目标释放闪电，最多跳跃 ' + i.legendaryEffect.params.maxTargets + ' 次。' } : undefined,
  }
}

export const talentViews: UITalent[] = TALENTS.map(t => ({
  ...t, branch: t.id.startsWith('M') ? 'martial' : t.id.startsWith('G') ? 'guard' : 'elemental',
}))

export function compareStats(before: ResolvedStats, after: ResolvedStats): UIComparisonRow[] {
  return (Object.keys(labels) as StatId[]).filter(k => Math.abs(after[k] - before[k]) > 0.00001).map(k => ({
    label: labels[k], current: formatStat(k, before[k]), proposed: formatStat(k, after[k]),
    change: (after[k] > before[k] ? '+' : '') + formatStat(k, after[k] - before[k]),
    direction: after[k] > before[k] ? 'increase' : 'decrease',
  }))
}
