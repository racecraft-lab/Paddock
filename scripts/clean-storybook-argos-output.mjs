#!/usr/bin/env node

import { rm } from 'node:fs/promises'
import path from 'node:path'

function resolveStorybookOutputRoot() {
  return path.resolve(
    process.env.ARGOS_STORYBOOK_SCREENSHOT_DIR || path.join(process.cwd(), 'screenshots', 'storybook'),
  )
}

function assertWorkspacePath(targetPath) {
  const relative = path.relative(process.cwd(), targetPath)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`refusing to clean path outside workspace: ${targetPath}`)
  }
  return relative
}

async function main() {
  const root = resolveStorybookOutputRoot()
  const relative = assertWorkspacePath(root)

  await rm(root, { recursive: true, force: true })
  console.log(`[argos-clean] removed ${relative}`)
}

main().catch((error) => {
  console.error(`[argos-clean] ${error.stack || error.message}`)
  process.exit(1)
})
