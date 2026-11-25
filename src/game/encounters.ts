import type { EnemyKind } from './contracts'

export interface GroundPoint {
  x: number
  z: number
}

interface AttackDimensions {
  radius: number
  angle?: number
  halfWidth?: number
}

export interface EnemyDefinition {
  name: string
  health: number
  armor: number
  experience: number
  radius: number
  height: number
  speed: number
  damage: number
  windup: number
  recovery: number
  range: number
  shape: 'line' | 'cone' | 'circle'
  area: AttackDimensions
}

export const ENEMIES: Record<EnemyKind, EnemyDefinition> = {
  normal: { name: '灰棘猎犬', health: 21, armor: 0, experience: 5, radius: 0.38, height: 1.02, speed: 3.6, damage: 8, windup: 0.57, recovery: 1.1, range: 2.3, shape: 'line', area: { radius: 3.05, halfWidth: 0.68 } },
  elite: { name: '苔角守卫', health: 88, armor: 8, experience: 16, radius: 0.72, height: 2.85, speed: 2.55, damage: 19, windup: 1.1, recovery: 1.3, range: 2.95, shape: 'cone', area: { radius: 4.05, angle: Math.PI * 0.69 } },
  boss: { name: '裂木古王', health: 172, armor: 15, experience: 40, radius: 1.05, height: 3.75, speed: 2.58, damage: 29, windup: 1.16, recovery: 1.6, range: 3.2, shape: 'circle', area: { radius: 3.95 } },
}

export const CAMP_SPAWN: GroundPoint = { x: 0, z: 10.4 }
export const ENCOUNTERS = [
  { name: '林道前哨', gateZ: -6, kind: 'normal', positions: [{ x: -2.1, z: 4.5 }, { x: 2.5, z: 2.9 }, { x: -3.4, z: 0.5 }, { x: 1.7, z: -1.5 }] },
  { name: '苔角空地', gateZ: -22, kind: 'elite', positions: [{ x: 0.6, z: -14 }] },
  { name: '裂木石环', gateZ: -43, kind: 'boss', positions: [{ x: 0, z: -34 }] },
] as const

export const PLAYER_AREAS = {
  basic: { radius: 2.65, angle: Math.PI * 0.54 },
  cleave: { radius: 2.5, angle: Math.PI * 100 / 180 },
} as const

export const CLEAVE_COOLDOWN = 4

export interface HitArea extends AttackDimensions {
  shape: EnemyDefinition['shape']
  x: number
  z: number
  facing: number
}

export function containsPoint(area: HitArea, point: GroundPoint): boolean {
  const dx = point.x - area.x
  const dz = point.z - area.z
  if (area.shape === 'circle') return dx * dx + dz * dz <= area.radius ** 2

  const forward = dx * Math.sin(area.facing) + dz * Math.cos(area.facing)
  const sideways = dx * Math.cos(area.facing) - dz * Math.sin(area.facing)
  if (area.shape === 'line') return forward >= 0 && forward <= area.radius && Math.abs(sideways) <= (area.halfWidth ?? 0)
  return dx * dx + dz * dz <= area.radius ** 2 && Math.abs(Math.atan2(sideways, forward)) <= (area.angle ?? 0) / 2
}
