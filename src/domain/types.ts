export type EquipmentSlot = 'weapon' | 'head' | 'chest' | 'hands' | 'feet' | 'accessory'
export type Rarity = 'common' | 'magic' | 'rare' | 'epic' | 'legendary'
export type EnemyKind = 'normal' | 'elite' | 'boss'
export type TalentId =
  | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7'
  | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7'
  | 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6'

export type StatId =
  | 'weaponDamageMin' | 'weaponDamageMax' | 'baseAttackSpeed' | 'attackPower'
  | 'maxHealth' | 'armor' | 'critChance' | 'critMultiplier' | 'attackSpeedBonus'
  | 'moveSpeedBonus' | 'fireDamage' | 'iceDamage' | 'lightningDamage' | 'healthRegen' | 'lifeSteal'

export type ModifierOperation = 'flat' | 'increased' | 'more'

export interface StatModifier {
  readonly stat: StatId
  readonly operation: ModifierOperation
  readonly value: number
}

export type ResolvedStats = Record<StatId, number> & {
  attacksPerSecond: number
  weaponMin: number
  weaponMax: number
  movementSpeed: number
  cleaveRadius: number
}

export interface EquipmentBase {
  readonly id: string
  readonly name: string
  readonly slot: EquipmentSlot
  readonly tags: readonly string[]
  readonly minRequiredLevel: number
  readonly baseStats: readonly StatModifier[]
  readonly assetId: string
  readonly dropWeight: number
}

export interface AffixTier {
  readonly tier: number
  readonly minItemLevel: number
  readonly min: number
  readonly max: number
  readonly weight: number
}

export interface AffixDefinition {
  readonly id: string
  readonly name: string
  readonly kind: 'prefix' | 'suffix'
  readonly stat: StatId
  readonly operation: ModifierOperation
  readonly allowedSlots: readonly EquipmentSlot[]
  readonly exclusiveGroup: string
  readonly weight: number
  readonly tiers: readonly AffixTier[]
  readonly precision: number
}

export interface RolledAffix {
  readonly affixId: string
  readonly tier: number
  readonly modifier: StatModifier
}

export interface LegendaryEffectRef {
  readonly effectId: 'chain_lightning_on_crit'
  readonly params: Readonly<{ maxTargets: number; damageRatio: number; cooldownSeconds: number; jumpRadius: number }>
}

export interface EquipmentInstance {
  readonly instanceId: string
  readonly id: string
  readonly name: string
  readonly slot: EquipmentSlot
  readonly schemaVersion: number
  readonly configVersion: string
  readonly baseId: string
  readonly legendaryTemplateId?: string
  readonly rarity: Rarity
  readonly itemLevel: number
  readonly requiredLevel: number
  readonly upgradeLevel: number
  readonly baseStats: readonly StatModifier[]
  readonly affixes: readonly RolledAffix[]
  readonly legendaryEffect?: LegendaryEffectRef
  readonly createdAt: number
  readonly locked: boolean
}

export interface InventoryState {
  readonly capacity: number
  readonly items: readonly EquipmentInstance[]
  readonly equipped: Readonly<Partial<Record<EquipmentSlot, EquipmentInstance>>>
  readonly materials: Readonly<Record<string, number>>
  readonly gold: number
}

export interface Hero {
  readonly level: number
  readonly experience: number
  readonly health: number
  readonly talents: readonly TalentId[]
  readonly talentConfigVersion: string
  readonly inventory: InventoryState
}

export type RandomSource = () => number

export interface ItemGenerationOptions {
  rng?: RandomSource
  now?: () => number
  createId?: () => string
}

export interface DeathEvent {
  deathEventId: string
  kind: EnemyKind
  level: number
  experience: number
}

export interface RewardState {
  readonly processedDeathIds: readonly string[]
  readonly groundLoot: readonly EquipmentInstance[]
}

export type HeroChange<Reason extends string> =
  | { ok: true; hero: Hero }
  | { ok: false; hero: Hero; reason: Reason }
