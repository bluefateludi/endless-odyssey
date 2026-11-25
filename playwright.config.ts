import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const installed = process.platform === 'win32' && [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 120_000,
  outputDir: 'output/playwright/results',
  use: {
    baseURL: 'http://127.0.0.1:4187',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || installed || undefined,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: !process.env.CI,
  },
})
