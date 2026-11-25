export type GamePhase = 'camp' | 'combat' | 'victory' | 'defeat'
export type EnemyKind = 'normal' | 'elite' | 'boss'
export type GameStage = 0 | 1 | 2 | 3
export type PlayerAttack = 'basic' | 'cleave'

export interface GameLoot {
  id: string
  name: string
  rarity: string
}

export type GamePlayerStats = ResolvedStats

export interface EnemyView {
  id: string
  kind: EnemyKind
  name: string
  health: number
  maxHealth: number
}

export interface GameSnapshot<Loot extends GameLoot = GameLoot> {
  phase: GamePhase
  stage: GameStage
  stageName: string
  health: number
  maxHealth: number
  cleaveCooldown: number
  cleaveCooldownMax: number
  paused: boolean
  enemiesRemaining: number
  kills: number
  target: EnemyView | null
  nearbyLoot: Loot | null
  groundLootCount: number
}

export interface GameKill {
  encounterId: string
  enemyId: string
  kind: EnemyKind
  experience: number
}

export interface GameCombatTarget {
  id: string
  health: number
  armor: number
  x: number
  z: number
}

export interface GameDamage {
  targetId: string
  amount: number
  critical?: boolean
  source?: 'direct' | 'burn' | 'proc'
}

export interface GameCombatContext {
  time: number
  health: number
  stats: GamePlayerStats
  enemies: readonly GameCombatTarget[]
}

export interface GameAttackContext extends GameCombatContext {
  attack: PlayerAttack
  targets: readonly GameCombatTarget[]
}

export interface GameHooks<Loot extends GameLoot = GameLoot> {
  getStats: () => GamePlayerStats
  onSnapshot: (snapshot: GameSnapshot<Loot>) => void
  /** Called once per enemy death. Return the items to place on the ground. */
  onKill: (event: GameKill) => readonly Loot[]
  /** Return false to leave the item on the ground. */
  onPickup: (loot: Loot) => void | boolean
  onNotice?: (text: string, tone: 'info' | 'success' | 'warning') => void
  onRunStart?: (encounterId: string) => void
  onRunEnd?: (result: 'victory' | 'defeat') => void
  onReturnToCamp?: () => void
  /** Resolve the targets inside the swing at its active frame. */
  resolveAttack?: (context: GameAttackContext) => readonly GameDamage[]
  /** Advance status effects in encounter time, which stays frozen during pause. */
  resolveEffects?: (context: GameCombatContext) => readonly GameDamage[]
  /** Convert a monster's raw physical hit into final damage. This hook applies armor. */
  resolveIncomingDamage?: (amount: number, context: GameCombatContext) => number
  resolveRegen?: (context: GameCombatContext) => number
}

export interface GameController {
  start: () => void
  pause: () => void
  resume: () => void
  setPaused: (paused: boolean) => void
  returnToCamp: () => void
  pickup: () => void
  dispose: () => void
}
import type { ResolvedStats } from '../domain/types'

