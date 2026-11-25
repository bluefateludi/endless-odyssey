import { gainExperience } from './hero'
import { addItem, ownsItem } from './inventory'
import { rollLoot } from './loot'
import type { DeathEvent, EquipmentInstance, Hero, ItemGenerationOptions, RewardState } from './types'

export function createRewardState(): RewardState {
  return { processedDeathIds: [], groundLoot: [] }
}

export function resolveDeath(hero: Hero, rewards: RewardState, event: DeathEvent, options: ItemGenerationOptions = {}): {
  accepted: boolean; hero: Hero; rewards: RewardState; drops: readonly EquipmentInstance[]
} {
  if (!event.deathEventId || rewards.processedDeathIds.includes(event.deathEventId)) {
    return { accepted: false, hero, rewards, drops: [] }
  }
  const drops = rollLoot(event.kind, event.level, options)
  const ids = new Set(rewards.groundLoot.map((item) => item.instanceId))
  for (const drop of drops) {
    if (ids.has(drop.instanceId) || ownsItem(hero.inventory, drop.instanceId)) {
      throw new Error('Duplicate generated equipment instance ID: ' + drop.instanceId)
    }
    ids.add(drop.instanceId)
  }
  return {
    accepted: true,
    hero: gainExperience(hero, event.experience),
    drops,
    rewards: {
      processedDeathIds: [...rewards.processedDeathIds, event.deathEventId],
      groundLoot: [...rewards.groundLoot, ...drops],
    },
  }
}

export function pickupItem(hero: Hero, rewards: RewardState, instanceId: string):
  | { ok: true; hero: Hero; rewards: RewardState; item: EquipmentInstance }
  | { ok: false; hero: Hero; rewards: RewardState; reason: 'not-on-ground' | 'already-owned' | 'bag-full' } {
  const item = rewards.groundLoot.find((loot) => loot.instanceId === instanceId)
  if (!item) return { ok: false, hero, rewards, reason: 'not-on-ground' }
  const result = addItem(hero, item)
  return result.ok
    ? { ...result, item, rewards: { ...rewards, groundLoot: rewards.groundLoot.filter((loot) => loot !== item) } }
    : { ...result, rewards }
}
