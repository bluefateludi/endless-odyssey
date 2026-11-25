import { describe, expect, it, vi } from 'vitest'
import {
  AFFIXES, EQUIPMENT_BASES, MATERIALS, RARITIES, TALENTS, addItem, calculateDirectHit, compareItem,
  createCombatEffects, createHero, createRewardState, createSeededRng, dismantleItem, equipItem,
  experienceToNextLevel, gainExperience, generateItem, getTalentPoints, pickupItem, purchaseTalent,
  resetTalents, resolveCombatAttack, resolveCombatStats, resolveDeath, resolveHealthRegen, resolveIncomingHit,
  resolveOutgoingHit, resolveStats, restoreTalents, rollLoot, setHeroHealth, syncCombatEffects,
  tickCombatEffects, unequipItem, validateEquipmentCatalog, validateTalents,
  type CombatTarget, type EquipmentInstance, type Hero, type HeroChange, type Rarity, type TalentId,
} from './index'

function nextHero(result: HeroChange<string>): Hero {
  if (!result.ok) throw new Error(result.reason)
  return result.hero
}

function heroWithTalents(...ids: TalentId[]): Hero {
  return ids.reduce((hero, id) => nextHero(purchaseTalent(hero, id)), gainExperience(createHero(), 1100))
}

function item(rarity: Rarity, baseId: string, instanceId = baseId, level = 1, rng = createSeededRng(219)): EquipmentInstance {
  return generateItem({ rarity, baseId, itemLevel: level }, { createId: () => instanceId, now: () => 7, rng })
}

function target(id: string, x = 0, health = 100): CombatTarget {
  return { id, x, health, z: 0, armor: 0 }
}

describe('hero growth and talents', () => {
  it('starts with the documented unarmed attributes and no talent points', () => {
    const hero = createHero()
    expect(resolveStats(hero)).toMatchObject({
      maxHealth: 100, attackPower: 4, weaponMin: 4, weaponMax: 6, attacksPerSecond: 1.4,
      critChance: 0.05, critMultiplier: 1.5, cleaveRadius: 2.5,
    })
    expect(getTalentPoints(hero)).toBe(0)
    expect(TALENTS).toHaveLength(20)
    expect(validateTalents()).toEqual([])
  })

  it('rolls excess XP across levels and caps the total allocation at ten', () => {
    const initial = setHeroHealth(createHero(), 20)
    const level2 = gainExperience(initial, 20)
    expect(level2).toMatchObject({ level: 2, experience: 0, health: 20 })
    expect(experienceToNextLevel(level2.level)).toBe(40)
    expect(getTalentPoints(level2)).toBe(1)
    const level4 = gainExperience(level2, 105)
    expect(level4).toMatchObject({ level: 4, experience: 5, health: 20 })
    expect(resolveStats(level4)).toMatchObject({ maxHealth: 124, attackPower: 7 })
    expect(getTalentPoints(level4)).toBe(3)
    expect(getTalentPoints(gainExperience(level4, 100_000))).toBe(10)
    expect(gainExperience(level4, -1)).toBe(level4)
    expect(gainExperience(level4, Infinity)).toBe(level4)
  })

  it('rejects missing prerequisites, repeated clicks, and unaffordable talent purchases', () => {
    const hero = gainExperience(createHero(), 20)
    expect(purchaseTalent(hero, 'M2')).toEqual({ ok: false, hero, reason: 'missing-prerequisites' })
    expect(purchaseTalent(hero, 'removed')).toEqual({ ok: false, hero, reason: 'unknown-talent' })
    const stronger = nextHero(purchaseTalent(hero, 'M1'))
    expect(purchaseTalent(stronger, 'M1')).toEqual({ ok: false, hero: stronger, reason: 'already-purchased' })
    expect(purchaseTalent(stronger, 'G1')).toEqual({ ok: false, hero: stronger, reason: 'insufficient-points' })
    const hitOptions = { targetArmor: 0, critical: false, rng: () => 0 }
    expect(calculateDirectHit(resolveStats(stronger), hitOptions).amount - calculateDirectHit(resolveStats(hero), hitOptions).amount).toBe(4)
  })

  it('keeps absolute life when allocating, clamps on reset, and refunds removed talents on restore', () => {
    const initial = setHeroHealth(gainExperience(createHero(), 20), 75)
    const stronger = nextHero(purchaseTalent(initial, 'G1'))
    expect(stronger.health).toBe(75)
    expect(resolveStats(stronger).maxHealth).toBe(128)
    expect(resetTalents(stronger, false)).toEqual({ ok: false, hero: stronger, reason: 'camp-required' })
    const reset = nextHero(resetTalents(setHeroHealth(stronger, 126), true))
    expect(reset.health).toBe(108)
    expect(getTalentPoints(reset)).toBe(1)
    const migrated = restoreTalents(gainExperience(initial, 100), ['M2', 'removed-id', 'E4', 'M1', 'M1'])
    expect(migrated.talents).toEqual(['M1', 'M2'])
    expect(getTalentPoints(migrated)).toBe(1)
  })

  it('resolves stats from all three branches including the radius of cleave', () => {
    const hero = heroWithTalents('M1', 'M2', 'M3', 'M4', 'M5', 'G1', 'G2', 'G3', 'G4', 'E1')
    const stats = resolveStats(hero)
    expect(stats.cleaveRadius).toBe(3.1)
    expect(stats.attacksPerSecond).toBeCloseTo(1.4 * 1.08)
    expect(stats.critChance).toBeCloseTo(0.09)
    expect(stats.critMultiplier).toBeCloseTo(1.7)
    expect(stats.armor).toBe(12)
    expect(stats.healthRegen).toBe(1)
    expect(stats.movementSpeed).toBeCloseTo(4.5 * 1.06)
    expect(stats.lightningDamage).toBe(3)
  })
})

describe('equipment generation and ownership', () => {
  it('validates configured affix combinations and reproduces fixed seed instances', () => {
    expect(validateEquipmentCatalog()).toEqual([])
    expect(EQUIPMENT_BASES).toHaveLength(12)
    expect(item('legendary', 'base_iron_sword', 'fixture', 50)).toEqual(item('legendary', 'base_iron_sword', 'fixture', 50))
  })

  it('honors rarity, per-kind budgets, tier limits, and affix exclusivity across all bases', () => {
    for (const level of [1, 10, 20, 35, 50]) {
      for (const base of EQUIPMENT_BASES) {
        for (const rarity of Object.keys(RARITIES) as Rarity[]) {
          if (rarity === 'legendary' && base.id !== 'base_iron_sword') continue
          for (let seed = 0; seed < 5; seed++) {
            const generated = item(rarity, base.id, base.id, level, createSeededRng(seed))
            const rule = RARITIES[rarity]
            expect(generated.affixes.length).toBeGreaterThanOrEqual(rule.minAffixes)
            expect(generated.affixes.length).toBeLessThanOrEqual(rule.maxAffixes)
            const definitions = generated.affixes.map((rolled) => {
              const definition = AFFIXES.find((affix) => affix.id === rolled.affixId)!
              const tier = definition.tiers.find((entry) => entry.tier === rolled.tier)!
              expect(tier.minItemLevel).toBeLessThanOrEqual(level)
              expect(tier.tier).toBeLessThanOrEqual(rule.maxTier)
              expect(rolled.modifier.value).toBeGreaterThanOrEqual(tier.min - 1e-9)
              expect(rolled.modifier.value).toBeLessThanOrEqual(tier.max + 1e-9)
              expect(definition.allowedSlots).toContain(base.slot)
              return definition
            })
            expect(new Set(definitions.map((definition) => definition.exclusiveGroup)).size).toBe(definitions.length)
            expect(new Set(definitions.map((definition) => definition.id)).size).toBe(definitions.length)
            expect(definitions.filter((definition) => definition.kind === 'prefix').length).toBeLessThanOrEqual(rule.maxPerKind)
            expect(definitions.filter((definition) => definition.kind === 'suffix').length).toBeLessThanOrEqual(rule.maxPerKind)
            expect(Boolean(generated.legendaryEffect)).toBe(rarity === 'legendary')
          }
        }
      }
    }
  })

  it('uses independent equipment and quality rolls with boss minimums and level offsets', () => {
    let sequence = 0
    const makeOptions = (sample: number) => ({ rng: () => sample, createId: () => String(++sequence), now: () => 0 })
    expect(rollLoot('normal', 1, makeOptions(0.2))).toEqual([])
    expect(rollLoot('elite', 1, makeOptions(0.75))).toEqual([])
    expect(rollLoot('normal', 1, makeOptions(0.19))[0]?.itemLevel).toBe(1)
    expect(rollLoot('elite', 2, makeOptions(0.74))[0]?.itemLevel).toBe(3)
    const minimum = rollLoot('boss', 3, makeOptions(0))
    expect(minimum.map((value) => value.rarity)).toEqual(['common', 'common'])
    const maximum = rollLoot('boss', 3, makeOptions(0.999))
    expect(maximum.map((value) => value.rarity)).toEqual(['legendary', 'legendary', 'legendary', 'legendary'])
    expect(maximum.every((value) => value.itemLevel === 5)).toBe(true)
  })

  it('settles XP and drops once, and keeps full-bag pickups on the ground', () => {
    const start = createHero()
    const event = { deathEventId: 'run-1:enemy-1', kind: 'normal', level: 1, experience: 20 } as const
    const generate = vi.fn(() => 'drop')
    const result = resolveDeath(start, createRewardState(), event, { rng: () => 0, now: () => 1, createId: generate })
    expect(result.accepted).toBe(true)
    expect(result.hero.level).toBe(2)
    expect(result.drops[0]?.id).toBe('drop')
    expect(resolveDeath(result.hero, result.rewards, event, { createId: generate })).toEqual({
      accepted: false, hero: result.hero, rewards: result.rewards, drops: [],
    })
    expect(generate).toHaveBeenCalledTimes(1)
    const full = { ...result.hero, inventory: { ...result.hero.inventory, capacity: 0 } }
    expect(pickupItem(full, result.rewards, 'drop')).toEqual({ ok: false, hero: full, rewards: result.rewards, reason: 'bag-full' })
    const picked = pickupItem(result.hero, result.rewards, 'drop')
    if (!picked.ok) throw new Error(picked.reason)
    expect(picked.rewards.groundLoot).toEqual([])
    expect(picked.hero.inventory.items).toEqual(result.drops)
    expect(pickupItem(picked.hero, picked.rewards, 'drop')).toMatchObject({ ok: false, reason: 'not-on-ground' })
    expect(addItem(picked.hero, picked.item)).toMatchObject({ ok: false, reason: 'already-owned' })
  })

  it('allows a legal full-bag exchange and rejects level, slot, and unload violations atomically', () => {
    const base = createHero()
    const initial = { ...base, inventory: { ...base.inventory, capacity: 1 } }
    const sword = item('common', 'base_iron_sword')
    const axe = item('common', 'base_war_axe')
    let hero = nextHero(addItem(initial, sword))
    expect(equipItem(hero, sword.id, 'feet')).toEqual({ ok: false, hero, reason: 'slot-mismatch' })
    expect(equipItem(nextHero(addItem(initial, item('common', 'base_war_axe', 'axe2', 10))), 'axe2')).toMatchObject({ ok: false, reason: 'level-too-low' })
    hero = nextHero(equipItem(hero, sword.id))
    expect(resolveStats(hero)).toMatchObject({ weaponMin: 8, weaponMax: 12, attacksPerSecond: 1.55 })
    hero = nextHero(addItem(hero, axe))
    expect(compareItem(hero, axe).delta.weaponMin).toBe(2)
    expect(hero.inventory.equipped.weapon).toBe(sword)
    expect(unequipItem(hero, 'weapon')).toEqual({ ok: false, hero, reason: 'bag-full' })
    hero = nextHero(equipItem(hero, axe.id))
    expect(hero.inventory.items).toEqual([sword])
    expect(hero.inventory.equipped.weapon).toBe(axe)
  })

  it('clamps life when removing equipment and cannot heal by swapping or revive by equipping', () => {
    const chest = item('common', 'base_leather_vest')
    const hero = nextHero(addItem(setHeroHealth(createHero(), 65), chest))
    const wearing = nextHero(equipItem(hero, chest.id))
    expect(wearing.health).toBe(65)
    expect(resolveStats(wearing).maxHealth).toBe(112)
    const removed = nextHero(unequipItem(setHeroHealth(wearing, 110), 'chest'))
    expect(removed.health).toBe(100)
    expect(nextHero(equipItem(removed, chest.id)).health).toBe(100)
    expect(nextHero(equipItem(setHeroHealth(removed, 0), chest.id)).health).toBe(0)
  })

  it('protects locked, equipped, and high-rarity items during decomposition', () => {
    const sword = item('legendary', 'base_iron_sword')
    const hero = nextHero(addItem(createHero(), sword))
    expect(dismantleItem(hero, sword.id)).toMatchObject({ ok: false, reason: 'confirmation-required' })
    expect(dismantleItem(nextHero(addItem(createHero(), { ...sword, locked: true })), sword.id, true)).toMatchObject({ ok: false, reason: 'locked' })
    expect(dismantleItem(nextHero(equipItem(hero, sword.id)), sword.id, true)).toMatchObject({ ok: false, reason: 'equipped' })
    const result = dismantleItem(hero, sword.id, true)
    expect(result).toMatchObject({ ok: true, materials: { [MATERIALS.shards]: 15, [MATERIALS.crystals]: 5 } })
    expect(result.hero.inventory.items).toEqual([])
    expect(dismantleItem(result.hero, sword.id, true)).toMatchObject({ ok: false, reason: 'item-not-in-bag' })
  })
})

describe('combat effects', () => {
  it('applies armor to the physical component before adding elements and applying the crit', () => {
    const hero = heroWithTalents('E1', 'E2', 'E3')
    const stats = resolveStats(hero)
    const hit = calculateDirectHit(stats, { targetArmor: 100, skillMultiplier: 1.35, critical: true, rng: () => 0 })
    expect(hit.fire).toBe(3)
    expect(hit.elemental).toBe(10)
    expect(hit.amount).toBeCloseTo(((4 + stats.attackPower) * 1.35 * 0.5 + 10) * 1.5)
  })

  it('refreshes rage without stacking and expires its attack power and speed together', () => {
    const hero = heroWithTalents('M1', 'M2', 'M3', 'M4', 'M6', 'M7')
    const enemy = target('original')
    const hit = { target: enemy, enemies: [enemy], hit: { amount: 10, fire: 0, critical: true }, source: 'direct' } as const
    let state = resolveOutgoingHit(hero, createCombatEffects(), { ...hit, now: 1 }).state
    const baseline = resolveStats(hero)
    const active = resolveCombatStats(hero, state, 2)
    expect(active.attacksPerSecond).toBeCloseTo(1.4 * 1.23)
    expect(active.attackPower).toBeCloseTo(baseline.attackPower * 1.15)
    state = resolveOutgoingHit(hero, state, { ...hit, now: 2 }).state
    expect(resolveCombatStats(hero, state, 4)).toEqual(active)
    expect(resolveCombatStats(hero, state, 5)).toEqual(baseline)
    const reset = nextHero(resetTalents(hero, true))
    expect(syncCombatEffects(reset, state, 3).rageUntil).toBe(-Infinity)
  })

  it('gates recovery, mitigates only low-health direct physical damage, and consumes retaliation on basic hits', () => {
    const hero = heroWithTalents('G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'E1')
    const state = createCombatEffects()
    const maxHealth = resolveStats(hero).maxHealth
    const struck = resolveIncomingHit(hero, state, { now: 1, health: maxHealth * 0.34, maxHealth, physical: 20, elemental: 5, source: 'direct' })
    expect(struck.damage).toBe(22)
    expect(resolveIncomingHit(hero, state, { now: 1, health: maxHealth * 0.35, maxHealth, physical: 20, elemental: 5, source: 'direct' }).damage).toBe(25)
    expect(resolveIncomingHit(hero, state, { now: 1, health: 10, maxHealth, physical: 20, elemental: 5, source: 'proc' }).damage).toBe(25)
    expect(resolveHealthRegen(hero, struck.state, 4.99)).toBe(1)
    expect(resolveHealthRegen(hero, struck.state, 5)).toBe(3)

    const enemy = target('original')
    const attack = { targets: [enemy], enemies: [enemy], rng: () => 0.5, now: 2 } as const
    const cleave = resolveCombatAttack(hero, struck.state, { ...attack, attack: 'cleave' })
    expect(cleave.state.retaliationUntil).toBe(3)
    const basic = resolveCombatAttack(hero, cleave.state, { ...attack, attack: 'basic' })
    const stats = resolveStats(hero)
    expect(basic.damage[0].amount).toBeCloseTo((5 + stats.attackPower) * 1.25 + 3)
    expect(basic.state.retaliationUntil).toBe(-Infinity)
    const expired = resolveCombatAttack(hero, cleave.state, { ...attack, now: 3, attack: 'basic' })
    expect(expired.damage[0].amount).toBeCloseTo(5 + stats.attackPower + 3)
  })

  it('refreshes burns, strengthens storm on a burning target, and shares storm cooldown across targets', () => {
    const hero = heroWithTalents('E1', 'E2', 'E3', 'E4', 'E5', 'E6')
    const enemy = target('original')
    const second = target('second')
    const event = { target: enemy, enemies: [enemy, second], hit: { amount: 5, fire: 3, critical: false }, source: 'direct', rng: () => 0 } as const
    const first = resolveOutgoingHit(hero, createCombatEffects(), { ...event, now: 0 })
    expect(first.damage).toMatchObject([{ amount: 8, effect: 'storm', source: 'proc' }])
    const blocked = resolveOutgoingHit(hero, first.state, { ...event, target: second, now: 0.5 })
    expect(blocked.damage).toEqual([])
    const ticking = tickCombatEffects(hero, blocked.state, 1, [enemy, second])
    expect(ticking.damage).toMatchObject([{ amount: 2, effect: 'burn', source: 'burn' }])
    const seeded = resolveOutgoingHit(hero, ticking.state, { ...event, now: 1 })
    expect(seeded.damage).toMatchObject([{ amount: 14, effect: 'storm', source: 'proc' }])
    const finished = tickCombatEffects(hero, seeded.state, 4, [enemy, second])
    expect(finished.damage.filter((hit) => hit.targetId === enemy.id).map((hit) => hit.amount)).toEqual([2, 2, 2])
    expect(finished.state.burns).toEqual([])
    expect(tickCombatEffects(hero, seeded.state, 4, [target('original', 0, 1)]).damage).toHaveLength(1)
  })

  it('limits chain jumps to live unique nearby targets and preserves cooldown through re-equipping and reload', () => {
    const weapon = item('legendary', 'base_iron_sword', 'sword')
    const hero = nextHero(equipItem(nextHero(addItem(createHero(), weapon)), weapon.id))
    const origin = target('origin', 0, 10)
    const enemies = [origin, target('dead', 1, 0), ...[4, 8, 12, 16, 20, 24].map((x) => target(String(x), x)), target('far', 40)]
    const event = { target: origin, enemies, hit: { amount: 20, fire: 0, critical: true }, source: 'direct' } as const
    const result = resolveOutgoingHit(hero, createCombatEffects(), { ...event, now: 1 })
    expect(result.damage.map((hit) => [hit.targetId, hit.amount, hit.source])).toEqual(
      ['4', '8', '12', '16', '20'].map((id) => [id, 3.5, 'proc']),
    )
    const reequipped = nextHero(equipItem(nextHero(unequipItem(hero, 'weapon')), weapon.id))
    expect(resolveOutgoingHit(reequipped, result.state, { ...event, now: 2 }).damage).toEqual([])
    expect(resolveOutgoingHit(reequipped, result.state, { ...event, now: 2.5 }).damage).toHaveLength(5)
    expect(resolveOutgoingHit(hero, result.state, { ...event, now: 4, source: 'proc' }).damage).toEqual([])
    const loaded = createCombatEffects(hero, 0, true)
    expect(resolveOutgoingHit(hero, loaded, { ...event, now: 1 }).damage).toEqual([])
    expect(resolveOutgoingHit(hero, loaded, { ...event, now: 1.5 }).damage).toHaveLength(5)
  })

  it('can proc storm and legendary chain independently from the same direct hit', () => {
    const elemental = heroWithTalents('E1', 'E2', 'E3', 'E4', 'E5', 'E6')
    const weapon = item('legendary', 'base_iron_sword', 'sword')
    const hero = nextHero(equipItem(nextHero(addItem(elemental, weapon)), weapon.id))
    const enemy = target('origin')
    const other = target('other', 2)
    const result = resolveCombatAttack(hero, createCombatEffects(), {
      now: 1, attack: 'basic', targets: [enemy, enemy], enemies: [enemy, other], rng: () => 0,
    })
    expect(result.damage.map((hit) => [hit.targetId, hit.source, hit.effect])).toEqual([
      ['origin', 'direct', undefined], ['origin', 'proc', 'storm'], ['other', 'proc', 'chain_lightning_on_crit'],
    ])
  })
})
