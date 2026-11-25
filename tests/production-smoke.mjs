import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

// Serve only the built files, below a non-root URL as on a repository Pages site.
const root = resolve('dist')
const prefix = '/endless-odyssey/'
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const filename = resolve(root, pathname.slice(prefix.length) || 'index.html')
  if (!pathname.startsWith(prefix) || !filename.startsWith(root + sep)) { response.writeHead(404).end(); return }
  try {
    const bytes = await readFile(filename)
    response.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream' }).end(bytes)
  } catch { response.writeHead(404).end() }
})
await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
let browser
try {
  const systemBrowser = process.platform === 'win32' && [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync)
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || systemBrowser || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', r => { if (r.status() >= 400) errors.push(r.url() + ' HTTP ' + r.status()) })
  const model = page.waitForResponse(r => r.url().includes(prefix + 'assets/models/') && r.url().endsWith('.glb') && r.ok())
  await Promise.all([model, page.goto('http://127.0.0.1:' + server.address().port + prefix)])
  await page.getByRole('button', { name: '出发远征' }).waitFor()
  await page.keyboard.press('t')
  const tree = page.getByRole('dialog', { name: '天赋树' })
  await tree.waitFor()
  assert.equal(await tree.getByRole('button', { name: /，锁定$/ }).count(), 20)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '出发远征' }).click()
  await page.getByLabel('当前目标').waitFor()
  await mkdir('output/playwright', { recursive: true })
  await page.screenshot({ path: 'output/playwright/production-subpath.png' })
  assert.deepEqual(errors, [])
  console.log('Production subpath passed: camp, registry, versioned GLB, 20 talents and first encounter.')
} finally {
  await browser?.close()
  await new Promise(done => server.close(done))
}
