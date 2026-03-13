#!/usr/bin/env node

const MIN_NODE_MAJOR = 22

const current = process.versions.node
const currentMajor = Number.parseInt(current.split('.')[0] || '', 10)

if (currentMajor < MIN_NODE_MAJOR) {
  console.error(
    [
      `error: Mission Control requires Node ${MIN_NODE_MAJOR} or later, but found ${current}.`,
      'use `nvm use 22` (recommended LTS) or any later version before installing, building, or starting the app.',
    ].join('\n')
  )
  process.exit(1)
}
