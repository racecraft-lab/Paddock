import { screenshot } from '@storycap-testrun/browser'
import { afterEach, beforeEach } from 'vitest'
import { page } from 'vitest/browser'

beforeEach(async () => {
  await page.viewport(1366, 768)
})

afterEach(async (context) => {
  await screenshot(page, context, {
    image: {
      fullPage: true,
      scale: 'device',
    },
    flakiness: {
      metrics: { enabled: true, retries: 1000 },
      retake: { enabled: true, interval: 100, retries: 3 },
    },
  })
})
