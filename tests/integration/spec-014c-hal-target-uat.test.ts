import { describe, expect, it } from 'vitest'
import { runSpec014cHalTargetUat } from '../../scripts/spec-014c/hal-target-uat.ts'

const halTargetUat = process.env.SPEC_014C_UAT_RUN_ID && process.env.PADDOCK_DATA_DIR
const uatIt = halTargetUat ? it : it.skip

describe('SPEC-014C HAL target UAT', () => {
  uatIt('executes the deployed Codex app-server adapter UAT matrix', async () => {
    await expect(runSpec014cHalTargetUat()).resolves.toBeUndefined()
  }, 180_000)
})
