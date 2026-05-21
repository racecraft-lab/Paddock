import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = process.cwd()

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('SPEC-007 Docker visual clock anchoring', () => {
  it('uses one fixed SPEC-007 clock for the Docker app and preseed script', () => {
    const dockerScript = readRepoFile('scripts/e2e-docker.sh')
    const seedScript = readRepoFile('scripts/seed-e2e-spec-007.cjs')

    expect(dockerScript).toContain('SPEC_007_FIXED_NOW_ISO=')
    expect(dockerScript).toContain('-e MC_SPEC_007_FIXED_NOW="$SPEC_007_FIXED_NOW_ISO"')
    expect(dockerScript).toContain('MC_SPEC_007_FIXED_NOW="$SPEC_007_FIXED_NOW_ISO" node scripts/seed-e2e-spec-007.cjs')
    expect(seedScript).toContain('process.env.MC_SPEC_007_FIXED_NOW')
    expect(seedScript).toContain('const NOW_SECONDS = Math.floor(FIXED_NOW_MS / 1000)')
  })
})
