import { describe, expect, it } from 'vitest'
import {
  buildCodexAppServerRuntimeInventory,
  buildRuntimeInventory,
} from '@/lib/harness-adapters/runtime-inventory'

const scope = {
  kind: 'productLine' as const,
  workspace_id: '1',
  workspace_ids: ['1'],
}

const generatedAt = '2026-06-03T00:00:00.000Z'

describe('SPEC-014B runtime inventory read model', () => {
  it('derives visible, unassigned, assigned, eligible, and blocked states without persistence', () => {
    const visible = buildRuntimeInventory({
      generatedAt,
      scope,
      featureFlagEnabled: true,
    })
    expect(visible.entries.map((entry) => entry.state)).toEqual(['visible', 'visible'])
    expect(visible.summary).toMatchObject({ total: 2, visible: 2 })

    const unassigned = buildRuntimeInventory({
      generatedAt,
      scope,
      featureFlagEnabled: true,
      filters: { projectId: 10, manifestId: 'external_harness_fake' },
      assignments: [{ project_id: 10, role: 'builder', agent_name: 'paddock_owned_sandbox_fake' }],
    })
    expect(unassigned.entries).toHaveLength(1)
    expect(unassigned.entries[0]).toMatchObject({
      state: 'unassigned',
      assignment: { status: 'unassigned' },
      reason_codes: ['adapter_unassigned'],
    })

    const assigned = buildRuntimeInventory({
      generatedAt,
      scope,
      featureFlagEnabled: true,
      filters: { projectId: 10, manifestId: 'paddock_owned_sandbox_fake' },
      assignments: [{ project_id: 10, role: 'builder', agent_name: 'paddock_owned_sandbox_fake' }],
    })
    expect(assigned.entries[0]).toMatchObject({
      state: 'assigned',
      assignment: { status: 'assigned', role: 'builder' },
      reason_codes: [],
    })

    const eligible = buildRuntimeInventory({
      generatedAt,
      scope,
      featureFlagEnabled: true,
      filters: {
        projectId: 10,
        taskId: 100,
        manifestId: 'paddock_owned_sandbox_fake',
        requestedCapability: 'launch',
      },
      assignments: [{ project_id: 10, role: 'builder', agent_name: 'paddock_owned_sandbox_fake' }],
      task: { id: 100, workspace_id: 1, project_id: 10, status: 'assigned', stage_key: 'issue_remediation' },
      lifecycles: [{
        id: 1,
        workspace_id: 1,
        task_id: 100,
        stage_key: 'issue_remediation',
        owner: 'paddock',
        status: 'running',
        updated_at: generatedAt,
      }],
    })
    expect(eligible.entries[0]).toMatchObject({
      state: 'eligible',
      reason_codes: [],
    })
    expect(eligible.summary).toMatchObject({ total: 1, eligible: 1 })

    const blocked = buildRuntimeInventory({
      generatedAt,
      scope,
      featureFlagEnabled: true,
      filters: {
        projectId: 10,
        taskId: 100,
        manifestId: 'paddock_owned_sandbox_fake',
        requestedCapability: 'user_input_policy',
      },
      assignments: [{ project_id: 10, role: 'builder', agent_name: 'paddock_owned_sandbox_fake' }],
      policyRequirements: { userInputRequired: true },
      task: { id: 100, workspace_id: 1, project_id: 10, status: 'done', stage_key: 'issue_remediation' },
      lifecycles: [],
    })
    expect(blocked.entries[0]).toMatchObject({
      state: 'blocked',
      capability_resolution: {
        requested_capability: 'user_input_policy',
        supported: true,
      },
      reason_codes: ['task_ineligible', 'sandbox_lifecycle_missing'],
    })
  })

  it('fails closed for disabled feature flag, unsupported capabilities, expired timeout, and unsafe evidence', () => {
    const envelope = buildRuntimeInventory({
      generatedAt,
      scope,
      featureFlagEnabled: false,
      filters: {
        projectId: 10,
        taskId: 100,
        manifestId: 'external_harness_fake',
        requestedCapability: 'launch',
      },
      assignments: [{ project_id: 10, role: 'builder', agent_name: 'external_harness_fake' }],
      policyRequirements: {
        approvalRequired: true,
        userInputRequired: true,
        timeoutExpiresAt: '2026-06-02T00:00:00.000Z',
      },
      task: { id: 100, workspace_id: 1, project_id: 10, status: 'assigned', stage_key: 'issue_remediation' },
      lifecycles: [{
        id: 2,
        workspace_id: 1,
        task_id: 100,
        stage_key: 'issue_remediation',
        owner: 'external_harness',
        status: 'terminal',
        updated_at: generatedAt,
      }],
      evidenceByManifest: {
        external_harness_fake: [{
          kind: 'synthetic_summary',
          label: 'unsafe',
          ref: 'event-1',
          summary: 'Bearer abcdefghijklmnopqrstuvwxyz1234567890',
        }],
      },
    })

    expect(envelope.entries[0]).toMatchObject({
      state: 'blocked',
      reason_codes: [
        'feature_disabled',
        'capability_unsupported',
        'approval_unsupported',
        'user_input_unsupported',
        'timeout_budget_expired',
        'sandbox_lifecycle_missing',
        'sanitized_evidence_rejected',
      ],
      sanitized_fake_evidence: [],
      rejection_metadata: {
        reason_code: 'sanitized_evidence_rejected',
      },
    })
  })

  it('registers codex-app-server only through the explicit real-adapter inventory path', () => {
    const defaultInventory = buildRuntimeInventory({
      generatedAt,
      scope,
      featureFlagEnabled: true,
    })
    expect(defaultInventory.entries.map((entry) => entry.selected_manifest.manifest_id)).toEqual([
      'external_harness_fake',
      'paddock_owned_sandbox_fake',
    ])

    const codexInventory = buildCodexAppServerRuntimeInventory({
      generatedAt,
      scope,
      featureFlagEnabled: true,
      filters: {
        projectId: 10,
        taskId: 100,
        role: 'implementation',
        manifestId: 'codex-app-server',
        requestedCapability: 'launch',
      },
      assignments: [{ project_id: 10, role: 'implementation', agent_name: 'codex-app-server' }],
      task: { id: 100, workspace_id: 1, project_id: 10, status: 'assigned', stage_key: 'implementation' },
      lifecycles: [{
        id: 3,
        workspace_id: 1,
        task_id: 100,
        stage_key: 'implementation',
        owner: 'paddock',
        status: 'prepared',
        updated_at: generatedAt,
      }],
    })

    expect(codexInventory.entries).toHaveLength(1)
    expect(codexInventory.entries[0]).toMatchObject({
      state: 'eligible',
      selected_manifest: {
        manifest_id: 'codex-app-server',
        validation: { ok: true },
      },
      assignment: {
        status: 'assigned',
        role: 'implementation',
        agent_name: 'codex-app-server',
      },
      capability_resolution: {
        manifest_id: 'codex-app-server',
        requested_capability: 'launch',
        supported: true,
      },
      reason_codes: [],
    })
  })
})
