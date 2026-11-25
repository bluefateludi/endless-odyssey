import { createCombatEffects, resolveCombatAttack, resolveIncomingHit, tickCombatEffects } from './domain/effects'
import { calculateArmorFactor, resolveStats } from './domain/stats'
import { getTalentEffect } from './domain/talent-catalog'
import type { Hero } from './domain/types'
import type { GameHooks } from './game/contracts'

export function combatBridge(hero: () => Hero) {
  let effects = createCombatEffects(hero(), 0, true)
  let now = 0
  let lastHero: Hero | undefined
  let lastRage = false
  let lastRecovery = false
  let stats = resolveStats(hero())
  function getStats() {
    const character = hero()
    const rage = now < effects.rageUntil
    const regeneration = getTalentEffect(character, 'G5', 'outOfCombatRegen')
    const recovery = !!regeneration && now >= effects.lastDamageAt + regeneration.delay
    if (lastHero !== character || lastRage !== rage || lastRecovery !== recovery) {
      stats = resolveStats(character, { rageActive: rage })
      if (recovery) stats.healthRegen += regeneration.healingPerSecond
      lastHero = character
      lastRage = rage
      lastRecovery = recovery
    }
    return stats
  }
  const hooks: Pick<GameHooks, 'getStats'|'resolveAttack'|'resolveIncomingDamage'|'resolveEffects'> = {
    getStats,
    resolveAttack(ctx) {
      now = ctx.time
      const result = resolveCombatAttack(hero(), effects, { ...ctx, now, stats: getStats() })
      effects = result.state
      return result.damage
    },
    resolveIncomingDamage(amount, ctx) {
      now = ctx.time
      const result = resolveIncomingHit(hero(), effects, {
        now, health: ctx.health, maxHealth: ctx.stats.maxHealth,
        physical: amount * calculateArmorFactor(ctx.stats.armor), source: 'direct',
      })
      effects = result.state
      return result.damage
    },
    resolveEffects(ctx) {
      now = ctx.time
      const result = tickCombatEffects(hero(), effects, now, ctx.enemies)
      effects = result.state
      return result.damage
    },
  }
  return { hooks, begin() {
    // Encounter time restarts at zero. Apply the complete cooldown to effects carried into a run.
    now = 0
    effects = createCombatEffects(hero(), 0, true)
    lastHero = undefined
  } }
}
