import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  testMatch: /\.(spec|e2e)\.ts$/,
  testIgnore: /openclaw-harness\.spec\.ts/,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  outputDir: 'test-results/playwright-artifacts/docker',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report/docker' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3301',
    bypassCSP: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
