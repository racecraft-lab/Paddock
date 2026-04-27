import { defineConfig, devices } from '@playwright/test'
import { createArgosReporterOptions } from '@argos-ci/playwright/reporter'

const uploadToArgos = process.env.CI === 'true'
const recordArgosTraces = process.env.SPEC002_ARGOS_TRACES === '1'

export default defineConfig({
  testDir: 'tests',
  testIgnore: /openclaw-harness\.spec\.ts/,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report/docker' }],
    [
      '@argos-ci/playwright/reporter',
      createArgosReporterOptions({
        uploadToArgos,
        buildName: 'spec-002-playwright',
      }),
    ],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3301',
    bypassCSP: true,
    screenshot: 'only-on-failure',
    trace: recordArgosTraces ? 'on' : 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
