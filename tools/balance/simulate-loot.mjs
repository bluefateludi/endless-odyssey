import { parseArgs } from 'node:util'
import { createServer } from 'vite'

const { values } = parseArgs({ options: {
  kills: { type: 'string', default: '100000' },
  level: { type: 'string', default: '1' },
  seed: { type: 'string', default: '25' },
  kind: { type: 'string', default: 'all' },
} })
const kills = Number(values.kills), level = Number(values.level), seed = Number(values.seed)
if (![kills, level, seed].every(Number.isSafeInteger) || kills < 1 || level < 1) {
  throw new Error('Expected positive integer --kills and --level and an integer --seed')
}
const vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error' })
try {
  const { rollLoot, DROP_TABLES, createSeededRng, validateEquipmentCatalog } = await vite.ssrLoadModule('/src/domain/index.ts')
  const issues = validateEquipmentCatalog()
  if (issues.length) throw new Error(issues.join('\n'))
  const kinds = values.kind === 'all' ? Object.keys(DROP_TABLES) : [values.kind]
  const samples = []
  for (const kind of kinds) {
    if (!Object.hasOwn(DROP_TABLES, kind)) throw new Error('Unknown --kind: ' + kind)
    const rng = createSeededRng(seed), table = DROP_TABLES[kind]
    let dropped = 0, items = 0, id = 0
    const options = { rng, now: () => 0, createId: () => String(++id) }
    const rarity = Object.fromEntries(Object.keys(table.rarity).map(key => [key, 0]))
    const affixes = {}
    for (let i = 0; i < kills; i++) {
      const result = rollLoot(kind, level, options)
      if (result.length) dropped++
      items += result.length
      for (const item of result) {
        rarity[item.rarity]++
        for (const roll of item.affixes) affixes[roll.affixId] = (affixes[roll.affixId] || 0) + 1
      }
    }
    samples.push({ kind, dropped, items, observedDropChance: dropped / kills, expectedDropChance: table.chance,
      rarity, expectedRarityWeights: table.rarity, affixes })
  }
  console.log(JSON.stringify({ killsPerKind: kills, level, seed, samples }, null, 2))
} finally { await vite.close() }
