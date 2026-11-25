import type { GameSnapshot } from '../game/contracts'

export type UIPanel = 'inventory' | 'talents' | 'controls'
export type UIEquipmentSlot = 'weapon' | 'head' | 'chest' | 'hands' | 'feet' | 'accessory'
export type UIRarity = 'common' | 'magic' | 'rare' | 'epic' | 'legendary'
export type UITalentBranch = 'martial' | 'guard' | 'elemental'

export interface UIPlayer {
  level: number
  experience: number
  experienceToNext: number
  talentPoints: number
  gold: number
  materials: readonly { label: string; amount: number }[]
}

export interface UIEquipment {
  id: string
  name: string
  slot: UIEquipmentSlot
  rarity: UIRarity
  requiredLevel: number
  itemLevel: number
  locked?: boolean
  stats: readonly { label: string; value: string }[]
  affixes?: readonly { label: string; value: string; tier?: number }[]
  legendaryEffect?: { name: string; description: string }
}

export interface UIComparisonRow {
  label: string
  current: string
  proposed: string
  change?: string
  direction?: 'increase' | 'decrease' | 'neutral'
}

export interface UITalent {
  id: string
  name: string
  branch: UITalentBranch
  description: string
  cost: number
  prerequisites: readonly string[]
}

export interface UISave {
  status: 'loading' | 'idle' | 'saving' | 'saved' | 'error'
  message?: string
}

export interface UINotice {
  id: string | number
  text: string
  tone?: 'info' | 'success' | 'warning'
}

export interface GameUIProps {
  game: GameSnapshot
  player: UIPlayer
  inventory: readonly UIEquipment[]
  equipment: Partial<Record<UIEquipmentSlot, UIEquipment>>
  inventoryCapacity: number
  talents: readonly UITalent[]
  allocatedTalents: readonly string[]
  save: UISave
  notice?: UINotice | null
  ready?: boolean
  onStart: () => void
  onReturnToCamp: () => void
  onPickup: () => void
  onEquip: (id: string) => void | boolean
  onUnequip: (slot: UIEquipmentSlot) => void | boolean
  onSalvage: (id: string) => void | boolean
  /** Project the same character stats used in combat for this replacement. */
  onCompare: (id: string) => readonly UIComparisonRow[]
  onAllocateTalent: (id: string) => void | boolean
  onResetTalents: () => void | boolean
  onRetrySave?: () => void
  /** Keeps the caller's game input and clock paused while a panel is open. */
  onPanelChange: (panel: UIPanel | null) => void
}
