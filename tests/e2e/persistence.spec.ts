import type { Page } from '@playwright/test'
import { createHero, generateItem, type Hero } from '../../src/domain'
import { closePanel, expect, openCamp, openPanel, screenshot, test } from './browser'

test.use({ trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false } })

async function seedCharacter(page: Page, slot: { schema: number; revision: number; hero: unknown }) {
  await page.route('**/e2e-seed-slot', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>存档测试</title>' }))
  await page.goto('/e2e-seed-slot')
  await page.evaluate(async record => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('endless-odyssey', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('characters')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('characters', 'readwrite')
        tx.objectStore('characters').put(record, 'hero')
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }, slot)
}

function savedHero(): Hero {
  const starter = createHero()
  function item(baseId: 'base_iron_sword' | 'base_war_axe') {
    return generateItem({ baseId, itemLevel: 1, rarity: 'common' }, { createId: () => baseId, now: () => 1000 })
  }
  return {
    ...starter,
    level: 4,
    experience: 7,
    health: 0,
    talentConfigVersion: 'historical',
    talents: ['M2', 'M1', 'E6'],
    inventory: {
      ...starter.inventory,
      gold: 17,
      items: [item('base_war_axe')],
      equipped: { weapon: item('base_iron_sword') },
    },
  }
}

test('恢复历史角色、比较并更换武器、回营洗点后重载', async ({ page }) => {
  test.setTimeout(240_000)
  await seedCharacter(page, { revision: 6, schema: 1, hero: savedHero() })
  await openCamp(page)
  await expect(page.getByLabel('角色等级 4', { exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: '升级经验' })).toHaveAttribute('aria-valuenow', '7')
  await expect(page.getByRole('progressbar', { name: '角色生命' })).toHaveAttribute('aria-valuenow', '124')
  await expect(page.getByRole('button', { name: '天赋，1 点可用' })).toBeVisible()

  let talents = await openPanel(page, 't')
  await expect(talents.getByRole('button', { name: '力量，已点亮' })).toBeVisible()
  await expect(talents.getByRole('button', { name: '迅刃，已点亮' })).toBeVisible()
  await expect(talents.getByRole('button', { name: '风暴余烬，锁定' })).toBeVisible()
  await closePanel(page)

  let inventory = await openPanel(page, 'i')
  const bag = () => inventory.getByRole('region', { name: '背包内容' })
  const equipped = () => inventory.getByRole('region', { name: '已穿戴装备' })
  await bag().getByRole('button', { name: '战斧，普通' }).click()
  await inventory.getByRole('button', { name: '比较装备' }).click()
  await expect(inventory.getByText('同部位当前装备 · 铁剑')).toBeVisible()
  const comparisonRows = inventory.getByRole('table').getByRole('row')
  for (const [stat, before, after, change] of [
    ['最小武器伤害', '8', '10', '+2'],
    ['最大武器伤害', '12', '16', '+4'],
    ['基础攻频', '1.55', '1.2', '-0.35'],
  ]) {
    const row = comparisonRows.filter({ has: page.getByRole('rowheader', { name: stat, exact: true }) })
    await expect(row.getByRole('cell').nth(0)).toHaveText(before)
    await expect(row.getByRole('cell').nth(1)).toHaveText(after)
    await expect(row.getByRole('cell').nth(2)).toHaveText(change)
  }
  await screenshot(page, '08-equipment-comparison')
  await inventory.getByRole('button', { name: '穿戴', exact: true }).click()
  await expect(equipped().getByRole('button', { name: /战斧/ })).toBeVisible()
  await expect(bag().getByRole('button', { name: '铁剑，普通' })).toBeVisible()
  await closePanel(page)

  talents = await openPanel(page, 't')
  await talents.getByRole('button', { name: '重置天赋' }).click()
  const reset = talents.getByRole('group', { name: '确认重置天赋' })
  await reset.getByRole('button', { name: '取消' }).click()
  await expect(talents.getByRole('button', { name: '力量，已点亮' })).toBeVisible()
  await talents.getByRole('button', { name: '重置天赋' }).click()
  await reset.getByRole('button', { name: '确认重置' }).click()
  await expect(talents.getByRole('button', { name: '力量，可点亮' })).toBeVisible()
  await expect(talents.getByRole('button', { name: '迅刃，锁定' })).toBeVisible()
  await closePanel(page)
  await expect(page.getByRole('button', { name: '天赋，3 点可用' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible()

  await openCamp(page, true)
  await expect(page.getByRole('button', { name: '天赋，3 点可用' })).toBeVisible()
  talents = await openPanel(page, 't')
  await expect(talents.getByRole('button', { name: '迅刃，锁定' })).toBeVisible()
  await closePanel(page)
  inventory = await openPanel(page, 'i')
  await expect(equipped().getByRole('button', { name: /战斧/ })).toBeVisible()
  await expect(bag().getByRole('button', { name: '铁剑，普通' })).toBeVisible()
  await expect(bag().getByText('17', { exact: true })).toBeVisible()
})

test('遇到不支持的存档格式时保留原记录并提供重载入口', async ({ page }) => {
  const original = { revision: 22, schema: 99, hero: { untouched: true } }
  await seedCharacter(page, original)
  await page.goto('/')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('无法读取此版本的角色存档。已保留原始记录。')
  await alert.getByRole('button', { name: '重新载入' }).click()
  await expect(alert).toContainText('无法读取此版本的角色存档。已保留原始记录。')
  const record = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('endless-odyssey', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction('characters').objectStore('characters').get('hero')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  })
  expect(record).toEqual(original)
})
