import type { EquipmentInstance, Hero, StatModifier } from '../domain/types'
import { TALENTS } from '../domain/talents'

function record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const slots = ['weapon', 'head', 'chest', 'hands', 'feet', 'accessory']
const statNames = ['weaponDamageMin', 'weaponDamageMax', 'baseAttackSpeed', 'attackPower', 'maxHealth', 'armor', 'critChance', 'critMultiplier', 'attackSpeedBonus', 'moveSpeedBonus', 'fireDamage', 'iceDamage', 'lightningDamage', 'healthRegen', 'lifeSteal']

function modifier(v: unknown): v is StatModifier {
  return record(v) && statNames.includes(String(v.stat))
    && ['flat', 'increased', 'more'].includes(String(v.operation)) && finite(v.value)
}

function item(v: unknown): v is EquipmentInstance {
  if (!record(v) || v.schemaVersion !== 1 || typeof v.configVersion !== 'string' || typeof v.id !== 'string' || !v.id
    || v.id !== v.instanceId || typeof v.baseId !== 'string' || typeof v.name !== 'string'
    || !count(v.requiredLevel) || !count(v.itemLevel) || !count(v.upgradeLevel)
    || !slots.includes(String(v.slot)) || !['common', 'magic', 'rare', 'epic', 'legendary'].includes(String(v.rarity))
    || !Array.isArray(v.affixes) || !Array.isArray(v.baseStats) || !v.baseStats.every(modifier)
    || !v.affixes.every(a => record(a) && typeof a.affixId === 'string' && count(a.tier) && modifier(a.modifier))) return false
  if (!v.legendaryEffect) return true
  const effect = v.legendaryEffect
  if (!record(effect) || effect.effectId !== 'chain_lightning_on_crit' || !record(effect.params)) return false
  const p = effect.params
  return [p.maxTargets, p.damageRatio, p.cooldownSeconds, p.jumpRadius].every(finite)
}

export function isCharacter(v: unknown): v is Hero {
  if (!record(v) || !count(v.level) || v.level < 1 || !count(v.experience) || !finite(v.health)
    || typeof v.talentConfigVersion !== 'string' || !Array.isArray(v.talents)
    || !v.talents.every(id => typeof id === 'string') || !record(v.inventory)) return false
  const bag = v.inventory
  if (!count(bag.capacity) || !count(bag.gold) || !record(bag.materials) || !Object.values(bag.materials).every(count)
    || !Array.isArray(bag.items) || bag.items.length > bag.capacity || !bag.items.every(item) || !record(bag.equipped)) return false
  const ids = new Set(bag.items.map(i => i.id))
  if (ids.size !== bag.items.length) return false
  for (const [slot, equipped] of Object.entries(bag.equipped)) {
    if (!item(equipped) || slot !== equipped.slot || ids.has(equipped.id)) return false
    ids.add(equipped.id)
  }
  // Unrecognized historical talent IDs are refunded by restoreTalents after loading.
  return v.talents.length <= Math.max(100, TALENTS.length)
}
