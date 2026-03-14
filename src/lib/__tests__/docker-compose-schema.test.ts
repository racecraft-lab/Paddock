import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Tests that docker-compose.yml and Dockerfile contain the expected
 * configuration for Compose v5+ compatibility and complete runtime assets.
 */

const ROOT = resolve(__dirname, '../../..')

describe('docker-compose.yml schema', () => {
  const content = readFileSync(resolve(ROOT, 'docker-compose.yml'), 'utf-8')

  it('uses service-level pids_limit instead of deploy.resources.limits.pids', () => {
    // pids_limit should be at service level (not nested inside deploy)
    expect(content).toContain('pids_limit:')

    // Should NOT have pids inside deploy.resources.limits
    const deployBlock = content.match(/deploy:[\s\S]*?(?=\n\s{4}\w|\nvolumes:|\nnetworks:)/)?.[0] ?? ''
    expect(deployBlock).not.toContain('pids:')
  })

  it('still has memory and cpus in deploy.resources.limits', () => {
    expect(content).toContain('memory:')
    expect(content).toContain('cpus:')
  })
})

describe('Dockerfile runtime stage', () => {
  const content = readFileSync(resolve(ROOT, 'Dockerfile'), 'utf-8')

  it('copies public directory to runtime stage', () => {
    expect(content).toContain('COPY --from=build /app/public ./public')
  })

  it('copies standalone output', () => {
    expect(content).toContain('COPY --from=build /app/.next/standalone ./')
  })

  it('copies static assets', () => {
    expect(content).toContain('COPY --from=build /app/.next/static ./.next/static')
  })

  it('copies schema.sql for migrations', () => {
    expect(content).toContain('schema.sql')
  })
})
