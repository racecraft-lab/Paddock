import { describe, expect, it } from 'vitest'
import { runSpec014cHalTargetUat } from './hal-target-uat'

describe('SPEC-014C HAL target UAT', () => {
  it('executes the deployed Codex app-server adapter UAT matrix', async () => {
    await expect(runSpec014cHalTargetUat()).resolves.toBeUndefined()
  }, 180_000)
})
