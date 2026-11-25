import { EQUIPMENT_SLOTS, MATERIALS } from './catalog'
import { setHeroHealth } from './hero'
import { resolveStats } from './stats'
import type { EquipmentInstance, EquipmentSlot, Hero, HeroChange, InventoryState, Rarity, ResolvedStats } from './types'

type EquipIssue = 'item-not-in-bag' | 'slot-mismatch' | 'level-too-low'

export function ownsItem(inventory: InventoryState, instanceId: string): boolean {
  return inventory.items.some((item) => item.instanceId === instanceId)
    || Object.values(inventory.equipped).some((item) => item?.instanceId === instanceId)
}

export function addItem(hero: Hero, item: EquipmentInstance): HeroChange<'already-owned' | 'bag-full'> {
  if (ownsItem(hero.inventory, item.instanceId)) return { ok: false, hero, reason: 'already-owned' }
  if (hero.inventory.items.length >= hero.inventory.capacity) return { ok: false, hero, reason: 'bag-full' }
  return { ok: true, hero: { ...hero, inventory: { ...hero.inventory, items: [...hero.inventory.items, item] } } }
}

export function equipItem(hero: Hero, instanceId: string, slot?: EquipmentSlot): HeroChange<EquipIssue> {
  const index = hero.inventory.items.findIndex((item) => item.instanceId === instanceId)
  if (index === -1) return { ok: false, hero, reason: 'item-not-in-bag' }
  const item = hero.inventory.items[index]
  const targetSlot = slot ?? item.slot
  if (item.slot !== targetSlot || !EQUIPMENT_SLOTS.includes(targetSlot)) return { ok: false, hero, reason: 'slot-mismatch' }
  if (item.requiredLevel > hero.level) return { ok: false, hero, reason: 'level-too-low' }
  const oldItem = hero.inventory.equipped[targetSlot]
  const items = [...hero.inventory.items]
  if (oldItem) items[index] = oldItem
  else items.splice(index, 1)
  const inventory = { ...hero.inventory, items, equipped: { ...hero.inventory.equipped, [targetSlot]: item } }
  return { ok: true, hero: setHeroHealth({ ...hero, inventory }, hero.health) }
}

export function unequipItem(hero: Hero, slot: EquipmentSlot): HeroChange<'empty-slot' | 'bag-full'> {
  const item = hero.inventory.equipped[slot]
  if (!item) return { ok: false, hero, reason: 'empty-slot' }
  if (hero.inventory.items.length >= hero.inventory.capacity) return { ok: false, hero, reason: 'bag-full' }
  const equipped = { ...hero.inventory.equipped }
  delete equipped[slot]
  const inventory = { ...hero.inventory, items: [...hero.inventory.items, item], equipped }
  return { ok: true, hero: setHeroHealth({ ...hero, inventory }, hero.health) }
}

export function compareItem(hero: Hero, item: EquipmentInstance): {
  current: ResolvedStats; projected: ResolvedStats; delta: ResolvedStats; equipped?: EquipmentInstance
} {
  const current = resolveStats(hero)
  const projected = resolveStats({
    ...hero, inventory: { ...hero.inventory, equipped: { ...hero.inventory.equipped, [item.slot]: item } },
  })
  const delta = { ...projected }
  for (const key of Object.keys(delta) as (keyof ResolvedStats)[]) delta[key] -= current[key]
  return { current, projected, delta, equipped: hero.inventory.equipped[item.slot] }
}

const SALVAGE_YIELD = {
  common: [1, 0], magic: [2, 0], rare: [4, 1], epic: [8, 2], legendary: [15, 5],
} as const satisfies Record<Rarity, readonly [number, number]>

type DismantleIssue = 'item-not-in-bag' | 'equipped' | 'locked' | 'confirmation-required'

export function dismantleItem(hero: Hero, instanceId: string, confirmed = false):
  | { ok: true; hero: Hero; materials: Readonly<Record<string, number>> }
  | { ok: false; hero: Hero; reason: DismantleIssue } {
  const inventory = hero.inventory
  if (Object.values(inventory.equipped).some((item) => item?.instanceId === instanceId)) {
    return { ok: false, hero, reason: 'equipped' }
  }
  const item = inventory.items.find((candidate) => candidate.instanceId === instanceId)
  if (!item) return { ok: false, hero, reason: 'item-not-in-bag' }
  if (item.locked) return { ok: false, hero, reason: 'locked' }
  if ((item.rarity === 'epic' || item.rarity === 'legendary') && !confirmed) {
    return { ok: false, hero, reason: 'confirmation-required' }
  }

  const [shards, crystals] = SALVAGE_YIELD[item.rarity]
  const gained: Record<string, number> = { [MATERIALS.shards]: shards }
  if (crystals > 0) gained[MATERIALS.crystals] = crystals
  const materials = { ...inventory.materials }
  for (const [id, count] of Object.entries(gained)) materials[id] = (materials[id] ?? 0) + count
  return {
    ok: true, materials: gained,
    hero: { ...hero, inventory: { ...inventory, items: inventory.items.filter((candidate) => candidate !== item), materials } },
  }
}
