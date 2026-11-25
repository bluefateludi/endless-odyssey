import { resolve } from 'node:path'
import { expect, test as base, type Page } from '@playwright/test'

export { expect }

export const test = base.extend<{ browserErrors: void }>({
  browserErrors: [async ({ page }, use, testInfo) => {
    const errors: string[] = []
    const warnings: string[] = []
    page.on('pageerror', error => errors.push(error.stack || `${error.name}: ${error.message}`))
    page.on('console', message => {
      const location = message.location()
      const entry = [message.text(), location.url].filter(Boolean).join(' | ')
      if (message.type() === 'error') errors.push(entry)
      if (message.type() === 'warning') warnings.push(entry)
    })
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`)
    })
    page.on('requestfailed', request => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') {
        errors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`)
      }
    })
    try {
      await use()
    } finally {
      if (errors.length || warnings.length) {
        await testInfo.attach('browser-messages', {
          body: [...errors.map(message => `ERROR ${message}`), ...warnings.map(message => `WARN ${message}`)].join('\n'),
          contentType: 'text/plain',
        })
      }
      expect(errors, 'Browser errors').toEqual([])
    }
  }, { auto: true }],
})

export async function openCamp(page: Page, reload = false) {
  if (reload) await page.reload()
  else await page.goto('/')
  await expect(page.getByRole('button', { name: '出发远征' })).toBeEnabled({ timeout: 30_000 })
}

export async function screenshot(page: Page, name: string, pausedCombat = false) {
  if (pausedCombat) await openPanel(page, 'i')
  try {
    await page.screenshot({
      path: resolve('output/playwright', name + '.png'),
      animations: 'disabled',
      style: pausedCombat ? 'dialog[open], dialog[open]::backdrop { visibility: hidden }' : undefined,
    })
  } finally {
    if (pausedCombat) await closePanel(page)
  }
}

export async function openPanel(page: Page, key: 'i' | 't') {
  await page.keyboard.press(key)
  const dialog = page.getByRole('dialog', { name: key === 'i' ? '背包' : '天赋树' })
  await expect(dialog).toBeVisible()
  return dialog
}

export async function closePanel(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
}
