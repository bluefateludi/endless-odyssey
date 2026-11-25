import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { readSlot, SaveConflict, writeSlot } from './store'

it('persists a coherent character and refuses stale writers or unknown formats', async () => {
  const valid = (v: unknown): v is number => typeof v === 'number'
  expect(await readSlot(valid)).toBeNull()
  expect(await writeSlot(7, 0)).toBe(1)
  const results = await Promise.allSettled([writeSlot(8, 1), writeSlot(9, 1)])
  const failures = results.filter(r => r.status === 'rejected')
  expect(failures).toHaveLength(1)
  expect(failures[0].reason).toBeInstanceOf(SaveConflict)
  expect((await readSlot(valid))?.revision).toBe(2)
  await expect(readSlot((v): v is string => typeof v === 'string')).rejects.toThrow()
  expect((await readSlot(valid))?.revision).toBe(2)
})
