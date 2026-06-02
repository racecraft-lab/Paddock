import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

async function loadConfigWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules()

  const original = {
    PADDOCK_DATA_DIR: process.env.PADDOCK_DATA_DIR,
    PADDOCK_BUILD_DATA_DIR: process.env.PADDOCK_BUILD_DATA_DIR,
    PADDOCK_BUILD_DB_PATH: process.env.PADDOCK_BUILD_DB_PATH,
    PADDOCK_BUILD_TOKENS_PATH: process.env.PADDOCK_BUILD_TOKENS_PATH,
    PADDOCK_DB_PATH: process.env.PADDOCK_DB_PATH,
    PADDOCK_TOKENS_PATH: process.env.PADDOCK_TOKENS_PATH,
    NEXT_PHASE: process.env.NEXT_PHASE,
  }

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  const mod = await import('./config')

  if (original.PADDOCK_DATA_DIR === undefined) delete process.env.PADDOCK_DATA_DIR
  else process.env.PADDOCK_DATA_DIR = original.PADDOCK_DATA_DIR

  if (original.PADDOCK_BUILD_DATA_DIR === undefined) delete process.env.PADDOCK_BUILD_DATA_DIR
  else process.env.PADDOCK_BUILD_DATA_DIR = original.PADDOCK_BUILD_DATA_DIR

  if (original.PADDOCK_BUILD_DB_PATH === undefined) delete process.env.PADDOCK_BUILD_DB_PATH
  else process.env.PADDOCK_BUILD_DB_PATH = original.PADDOCK_BUILD_DB_PATH

  if (original.PADDOCK_BUILD_TOKENS_PATH === undefined) delete process.env.PADDOCK_BUILD_TOKENS_PATH
  else process.env.PADDOCK_BUILD_TOKENS_PATH = original.PADDOCK_BUILD_TOKENS_PATH

  if (original.PADDOCK_DB_PATH === undefined) delete process.env.PADDOCK_DB_PATH
  else process.env.PADDOCK_DB_PATH = original.PADDOCK_DB_PATH

  if (original.PADDOCK_TOKENS_PATH === undefined) delete process.env.PADDOCK_TOKENS_PATH
  else process.env.PADDOCK_TOKENS_PATH = original.PADDOCK_TOKENS_PATH

  if (original.NEXT_PHASE === undefined) delete process.env.NEXT_PHASE
  else process.env.NEXT_PHASE = original.NEXT_PHASE

  return mod.config
}

describe('config data paths', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('derives db and token paths from PADDOCK_DATA_DIR', async () => {
    const config = await loadConfigWithEnv({
      PADDOCK_DATA_DIR: '/tmp/paddock-data',
      PADDOCK_DB_PATH: undefined,
      PADDOCK_TOKENS_PATH: undefined,
    })

    expect(config.dataDir).toBe('/tmp/paddock-data')
    expect(config.dbPath).toBe('/tmp/paddock-data/paddock.db')
    expect(config.tokensPath).toBe('/tmp/paddock-data/paddock-tokens.json')
  })

  it('respects explicit db and token path overrides', async () => {
    const config = await loadConfigWithEnv({
      PADDOCK_DATA_DIR: '/tmp/paddock-data',
      PADDOCK_DB_PATH: '/tmp/custom.db',
      PADDOCK_TOKENS_PATH: '/tmp/custom-tokens.json',
    })

    expect(config.dataDir).toBe('/tmp/paddock-data')
    expect(config.dbPath).toBe('/tmp/custom.db')
    expect(config.tokensPath).toBe('/tmp/custom-tokens.json')
  })

  it('uses a build-scoped worker data dir during next build', async () => {
    const config = await loadConfigWithEnv({
      NEXT_PHASE: 'phase-production-build',
      PADDOCK_DATA_DIR: '/tmp/runtime-data',
      PADDOCK_BUILD_DATA_DIR: '/tmp/build-scratch',
      PADDOCK_DB_PATH: undefined,
      PADDOCK_TOKENS_PATH: undefined,
    })

    expect(config.dataDir).toMatch(/^\/tmp\/build-scratch\/worker-\d+$/)
    expect(config.dbPath).toMatch(/^\/tmp\/build-scratch\/worker-\d+\/paddock\.db$/)
    expect(config.tokensPath).toMatch(/^\/tmp\/build-scratch\/worker-\d+\/paddock-tokens\.json$/)
  })

  it('prefers build-specific db and token overrides during next build', async () => {
    const config = await loadConfigWithEnv({
      NEXT_PHASE: 'phase-production-build',
      PADDOCK_DATA_DIR: '/tmp/runtime-data',
      PADDOCK_DB_PATH: '/tmp/runtime.db',
      PADDOCK_TOKENS_PATH: '/tmp/runtime-tokens.json',
      PADDOCK_BUILD_DB_PATH: '/tmp/build.db',
      PADDOCK_BUILD_TOKENS_PATH: '/tmp/build-tokens.json',
    })

    const expectedBuildRoot = path.join(os.tmpdir(), 'paddock-build')
    expect(config.dataDir).toMatch(new RegExp(`^${expectedBuildRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/worker-\\d+$`))
    expect(config.dbPath).toBe('/tmp/build.db')
    expect(config.tokensPath).toBe('/tmp/build-tokens.json')
  })
})
