import { resolveStats } from './stats'
import { TALENT_CONFIG_VERSION } from './talent-catalog'
import type { Hero } from './types'

export function createHero(): Hero {
  return {
    level: 1,
    experience: 0,
    health: 100,
    talents: [],
    talentConfigVersion: TALENT_CONFIG_VERSION,
    inventory: { capacity: 40, items: [], equipped: {}, materials: {}, gold: 0 },
  }
}

export const DEFAULT_HERO: Hero = createHero()

export function experienceToNextLevel(level: number): number {
  return 20 * level
}

export function setHeroHealth(hero: Hero, health: number): Hero {
  if (!Number.isFinite(health)) return hero
  const next = Math.min(resolveStats(hero).maxHealth, Math.max(0, health))
  return next === hero.health ? hero : { ...hero, health: next }
}

export function reviveHero(hero: Hero): Hero {
  return setHeroHealth(hero, resolveStats(hero).maxHealth)
}

export function gainExperience(hero: Hero, amount: number): Hero {
  if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(hero.experience + amount)) return hero
  const total = hero.experience + amount
  // Cost of n levels from L is 10 × n × (2L + n − 1).
  const offset = 2 * hero.level - 1
  const levelsEstimate = Math.floor((2 * total / 10) / (Math.sqrt(offset ** 2 + 4 * total / 10) + offset))
  const cost = (levels: number) => 10 * levels * (2 * hero.level + levels - 1)
  let levels = levelsEstimate
  if (cost(levels + 1) <= total) levels += 1
  if (cost(levels) > total) levels -= 1
  return { ...hero, level: hero.level + levels, experience: total - cost(levels) }
}
