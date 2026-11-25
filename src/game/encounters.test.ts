import { describe, expect, it } from 'vitest'
import { containsPoint, ENCOUNTERS, ENEMIES, PLAYER_AREAS, type HitArea } from './encounters'

describe('encounter warning geometry', () => {
  it('lets lateral movement avoid a locked hound lunge', () => {
    const area: HitArea = { x: 2, z: 4, facing: Math.PI / 2, shape: 'line', ...ENEMIES.normal.area }
    expect(containsPoint(area, { x: 4.7, z: 4.6 })).toBe(true)
    expect(containsPoint(area, { x: 4.7, z: 4.7 })).toBe(false)
    expect(containsPoint(area, { x: 1.99, z: 4 })).toBe(false)
  })

  it('uses the cleave radius from the current build and honors its direction', () => {
    const area: HitArea = { x: 0, z: 0, facing: Math.PI, shape: 'cone', ...PLAYER_AREAS.cleave }
    expect(containsPoint(area, { x: 0, z: -2.8 })).toBe(false)
    expect(containsPoint({ ...area, radius: 3.1 }, { x: 0, z: -2.8 })).toBe(true)
    expect(containsPoint({ ...area, radius: 3.1 }, { x: 1.85, z: -1.1 })).toBe(false)
    expect(containsPoint(area, { x: 0, z: 1 })).toBe(false)
  })

  it('keeps the boss shockwave anchored to its origin', () => {
    const area: HitArea = { x: -1, z: -34, facing: 0.14, shape: 'circle', ...ENEMIES.boss.area }
    expect(containsPoint(area, { x: -1, z: -37.9 })).toBe(true)
    expect(containsPoint(area, { x: -1, z: -38.1 })).toBe(false)
    expect(containsPoint({ ...area, radius: area.radius * 1.16 }, { x: -1, z: -38.1 })).toBe(true)
  })

  it('starts with enough experience for one level-up', () => {
    expect(ENCOUNTERS[0].positions.length * ENEMIES.normal.experience).toBe(20)
  })
})
