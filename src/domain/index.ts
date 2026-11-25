export type * from './types'

export { createHero, DEFAULT_HERO, experienceToNextLevel, gainExperience, setHeroHealth, reviveHero } from './hero'
export { resolveStats, resolveModifiers, calculateDirectHit, calculateArmorFactor } from './stats'
export type { DirectHit, DirectHitOptions, StatContext } from './stats'

export {
  TALENTS, TALENT_CONFIG_VERSION, TALENT_POINT_CAP, getTalentPoints, getTalentPurchaseIssue,
  purchaseTalent, resetTalents, restoreTalents, validateTalents,
} from './talents'
export type { TalentDefinition, TalentEffect, TalentPurchaseIssue } from './talents'

export { EQUIPMENT_CONFIG_VERSION, EQUIPMENT_SLOTS, EQUIPMENT_BASES, AFFIXES, RARITIES, THUNDER_OATH, MATERIALS } from './catalog'
export { createSeededRng, generateItem, rollLoot, DROP_TABLES, validateEquipmentCatalog } from './loot'
export type { GenerateItemInput } from './loot'
export { equipItem, unequipItem, compareItem, addItem, dismantleItem } from './inventory'
export { createRewardState, resolveDeath, pickupItem } from './rewards'

export {
  createCombatEffects, syncCombatEffects, resolveOutgoingHit, resolveIncomingHit,
  tickCombatEffects, resolveHealthRegen, resolveCombatStats, resolveCombatAttack,
} from './effects'
export type * from './effects'
