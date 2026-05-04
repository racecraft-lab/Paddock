#!/usr/bin/env node

import { rm } from 'node:fs/promises'
import path from 'node:path'

const root = process.env.MC_VISUAL_OUTPUT_DIR ||
  path.join(process.cwd(), 'test-results', 'visual-current')
const mode = process.argv.includes('--mode')
  ? process.argv[process.argv.indexOf('--mode') + 1]
  : null
const target = mode && ['playwright', 'storybook'].includes(mode)
  ? path.join(root, mode)
  : root

await rm(target, { recursive: true, force: true })
console.log(`[clean-visual-output] removed ${path.relative(process.cwd(), target) || target}`)
