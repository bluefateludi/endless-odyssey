import { setHeroHealth } from './hero'
import { TALENTS, TALENT_BY_ID, TALENT_CONFIG_VERSION, TALENT_POINT_CAP } from './talent-catalog'
import type { TalentDefinition } from './talent-catalog'
import type { Hero, HeroChange, TalentId } from './types'

export { TALENTS, TALENT_CONFIG_VERSION, TALENT_POINT_CAP } from './talent-catalog'
export type { TalentDefinition, TalentEffect } from './talent-catalog'

export function getTalentPoints(hero: Pick<Hero, 'level' | 'talents'>): number {
  const selected = new Set(hero.talents)
  const spent = TALENTS.reduce((total, talent) => total + (selected.has(talent.id) ? talent.cost : 0), 0)
  return Math.max(0, Math.min(TALENT_POINT_CAP, hero.level - 1) - spent)
}

export type TalentPurchaseIssue = 'unknown-talent' | 'already-purchased' | 'missing-prerequisites' | 'insufficient-points'

export function getTalentPurchaseIssue(hero: Pick<Hero, 'level' | 'talents'>, id: string): TalentPurchaseIssue | null {
  const talent = TALENT_BY_ID.get(id as TalentId)
  if (!talent) return 'unknown-talent'
  if (hero.talents.includes(talent.id)) return 'already-purchased'
  if (!talent.prerequisites.every((prerequisite) => hero.talents.includes(prerequisite))) return 'missing-prerequisites'
  if (getTalentPoints(hero) < talent.cost) return 'insufficient-points'
  return null
}

export function purchaseTalent(hero: Hero, id: string): HeroChange<TalentPurchaseIssue> {
  const reason = getTalentPurchaseIssue(hero, id)
  if (reason) return { ok: false, hero, reason }
  return { ok: true, hero: setHeroHealth({ ...hero, talents: [...hero.talents, id as TalentId] }, hero.health) }
}

export function resetTalents(hero: Hero, inCamp: boolean): HeroChange<'camp-required'> {
  if (!inCamp) return { ok: false, hero, reason: 'camp-required' }
  if (hero.talents.length === 0) return { ok: true, hero }
  return { ok: true, hero: setHeroHealth({ ...hero, talents: [] }, hero.health) }
}

export function restoreTalents(hero: Hero, savedIds: readonly string[]): Hero {
  let restored: Hero = { ...hero, talents: [], talentConfigVersion: TALENT_CONFIG_VERSION }
  const pending = new Set(savedIds)
  while (pending.size > 0) {
    let purchased = false
    for (const id of pending) {
      const issue = getTalentPurchaseIssue(restored, id)
      if (issue === 'missing-prerequisites') continue
      pending.delete(id)
      if (issue) continue
      restored = { ...restored, talents: [...restored.talents, id as TalentId] }
      purchased = true
    }
    if (!purchased) break
  }
  return setHeroHealth(restored, hero.health)
}

export function validateTalents(talents: readonly TalentDefinition[] = TALENTS): string[] {
  const issues: string[] = []
  const catalog = new Map(talents.map((talent) => [talent.id, talent]))
  if (catalog.size !== talents.length) issues.push('Duplicate talent ID')
  function visit(id: TalentId, path: Set<TalentId>, required: Set<TalentId>): void {
    if (path.has(id)) {
      issues.push('Cyclic talent prerequisite: ' + id)
      return
    }
    const talent = catalog.get(id)
    if (!talent) {
      issues.push('Unknown talent prerequisite: ' + id)
      return
    }
    if (required.has(id)) return
    required.add(id)
    path.add(id)
    for (const prerequisite of talent.prerequisites) visit(prerequisite, path, required)
    path.delete(id)
  }
  for (const talent of talents) {
    if (!Number.isSafeInteger(talent.cost) || talent.cost < 1) issues.push('Invalid talent cost: ' + talent.id)
    const required = new Set<TalentId>()
    visit(talent.id, new Set(), required)
    const cost = [...required].reduce((sum, id) => sum + (catalog.get(id)?.cost ?? 0), 0)
    if (cost > TALENT_POINT_CAP) issues.push('Unreachable talent: ' + talent.id)
  }
  return [...new Set(issues)]
}
