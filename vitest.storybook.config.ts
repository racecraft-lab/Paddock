import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { argosVitestPlugin } from '@argos-ci/storybook/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
            tags: { include: ['visual'] },
          }),
          argosVitestPlugin({
            root: process.env.ARGOS_STORYBOOK_SCREENSHOT_DIR || './screenshots/storybook',
            uploadToArgos: process.env.CI === 'true',
            buildName: 'mission-control-storybook',
            token: process.env.ARGOS_TOKEN,
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
          setupFiles: ['.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
})
