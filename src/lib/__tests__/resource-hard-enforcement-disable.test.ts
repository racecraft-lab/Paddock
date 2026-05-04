/**
 * SPEC-008 — T161 — Hard-enforcement disable 4-step typed-confirmation test.
 *
 * @see specs/008-resource-governance/tasks.md T161
 */

import { describe, expect, it } from 'vitest'
import {
  HARD_ENFORCEMENT_DISABLE,
  validateHardEnforcementDisable,
} from '../resource-hard-enforcement-disable'

const baseRequest = {
  workspace_slug: 'racecraft',
  expected_workspace_slug: 'racecraft',
  typed_phrase: HARD_ENFORCEMENT_DISABLE.REQUIRED_PHRASE,
  reason: 'Operator-led incident drill: rolling back budget guard.',
  actor: 'operator-1',
  workspace_id: 7,
  ttl_seconds: 600,
}

describe('SPEC-008 T161 — hard-enforcement disable 4-step', () => {
  it('passes validation when every step is correct', () => {
    expect(validateHardEnforcementDisable(baseRequest)).toBeNull()
  })

  it('rejects mismatched workspace slug (Step 1)', () => {
    const v = validateHardEnforcementDisable({
      ...baseRequest,
      workspace_slug: 'wrong',
    })
    expect(v?.ok).toBe(false)
    if (v && !v.ok) expect(v.error).toBe('workspace_slug_mismatch')
  })

  it('rejects wrong typed phrase (Step 2)', () => {
    const v = validateHardEnforcementDisable({
      ...baseRequest,
      typed_phrase: 'disable hard enforcement',
    })
    expect(v?.ok).toBe(false)
    if (v && !v.ok) expect(v.error).toBe('phrase_mismatch')
  })

  it('rejects too-short reason (Step 3)', () => {
    const v = validateHardEnforcementDisable({
      ...baseRequest,
      reason: 'too short',
    })
    expect(v?.ok).toBe(false)
    if (v && !v.ok) expect(v.error).toBe('reason_too_short')
  })

  it('rejects out-of-bounds TTL (Step 4)', () => {
    const v = validateHardEnforcementDisable({
      ...baseRequest,
      ttl_seconds: HARD_ENFORCEMENT_DISABLE.MAX_TTL_SECONDS + 1,
    })
    expect(v?.ok).toBe(false)
    if (v && !v.ok) expect(v.error).toBe('invalid_ttl')

    const v2 = validateHardEnforcementDisable({
      ...baseRequest,
      ttl_seconds: 0,
    })
    expect(v2?.ok).toBe(false)
    if (v2 && !v2.ok) expect(v2.error).toBe('invalid_ttl')
  })
})
