import * as domain from './domain'
import type { GameHooks, GameSnapshot } from './game/contracts'
import { combatBridge } from './combat-bridge'

export function createEncounterHooks(
  hero: () => domain.Hero,
  commit: (next: domain.Hero) => void,
  onSnapshot: (value: GameSnapshot<domain.EquipmentInstance>) => void,
  notify: (text: string, tone: 'info' | 'success' | 'warning') => void,
): GameHooks<domain.EquipmentInstance> {
  let rewards = domain.createRewardState()
  let expeditionLevel = hero().level
  const combat = combatBridge(hero)
  return {
    ...combat.hooks,
    onSnapshot, onNotice: notify,
    onRunStart() {
      rewards = domain.createRewardState()
      expeditionLevel = hero().level
      combat.begin()
    },
    onReturnToCamp() {
      rewards = domain.createRewardState()
      commit(domain.reviveHero(hero()))
    },
    onKill(event) {
      const reward = domain.resolveDeath(hero(), rewards, {
        deathEventId: event.encounterId + '/' + event.enemyId,
        kind: event.kind, level: expeditionLevel, experience: event.experience,
      })
      if (!reward.accepted) return []
      rewards = reward.rewards
      const inventory = reward.hero.inventory
      const gold = { normal: 1, elite: 5, boss: 15 }[event.kind]
      commit({ ...reward.hero, inventory: { ...inventory, gold: inventory.gold + gold } })
      return reward.drops
    },
    onPickup(item) {
      const result = domain.pickupItem(hero(), rewards, item.id)
      if (!result.ok) {
        notify(result.reason === 'bag-full' ? '背包已满，装备留在原地。' : '这件装备已被拾取。', 'warning')
        return false
      }
      rewards = result.rewards
      commit(result.hero)
      notify('获得 ' + item.name, 'success')
      return true
    },
  }
}
