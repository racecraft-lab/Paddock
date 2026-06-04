import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RuntimeInventoryEvidence } from '@/components/agents/RuntimeInventoryEvidence'
import type { RuntimeInventoryEnvelope, RuntimeInventoryEntry } from '@/lib/harness-adapters/types'

const generatedAt = '2026-06-03T00:00:00.000Z'

function entry(overrides: Partial<RuntimeInventoryEntry> = {}): RuntimeInventoryEntry {
  return {
    id: 'runtime_inventory:paddock_owned_sandbox_fake',
    state: 'eligible',
    selected_manifest: {
      manifest_id: 'paddock_owned_sandbox_fake',
      display_name: 'Paddock-owned sandbox fake',
      validation: {
        ok: true,
        issues: [],
        diagnostics: {
          manifest_id: 'paddock_owned_sandbox_fake',
          manifest_sha256: '0123456789abcdef',
          issue_count: 0,
          truncated: false,
        },
      },
    },
    assignment: {
      status: 'assigned',
      project_id: '10',
      role: 'builder',
      agent_name: 'paddock_owned_sandbox_fake',
    },
    capability_resolution: {
      schema_version: 'capability_resolution.v1',
      manifest_id: 'paddock_owned_sandbox_fake',
      requested_capability: 'launch',
      supported: true,
      policy: {
        approval: 'not_evaluated',
        timeout: 'not_evaluated',
        user_input: 'not_evaluated',
      },
      reason_codes: [],
    },
    eligibility_gates: [],
    sandbox_lifecycle_refs: [{
      id: '77',
      owner: 'paddock',
      status: 'running',
      stage_key: 'issue_remediation',
      updated_at: generatedAt,
    }],
    sanitized_fake_evidence: [{
      schema_version: 'sanitized_fake_evidence.v1',
      kind: 'synthetic_summary',
      label: 'bounded lifecycle summary',
      ref: 'lifecycle-77',
      summary: 'safe synthetic evidence only',
    }],
    reason_codes: [],
    ...overrides,
  }
}

function envelope(overrides: Partial<RuntimeInventoryEnvelope> = {}): RuntimeInventoryEnvelope {
  const entries = overrides.entries ?? [entry()]
  return {
    schema_version: 'runtime_inventory.v1',
    generated_at: generatedAt,
    scope: {
      kind: 'productLine',
      workspace_id: '1',
      workspace_ids: ['1'],
    },
    feature_flag: {
      name: 'FEATURE_AGENT_RUNNER_SANDBOXES',
      enabled: true,
      source: 'workspace',
    },
    entries,
    summary: {
      total: entries.length,
      visible: entries.filter((item) => item.state === 'visible').length,
      unassigned: entries.filter((item) => item.state === 'unassigned').length,
      assigned: entries.filter((item) => item.state === 'assigned').length,
      eligible: entries.filter((item) => item.state === 'eligible').length,
      blocked: entries.filter((item) => item.state === 'blocked').length,
    },
    diagnostics: {
      truncated: false,
      warnings: [],
    },
    ...overrides,
  }
}

function expectPresent(element: Element | null): void {
  expect(element).not.toBeNull()
}

describe('RuntimeInventoryEvidence', () => {
  it('renders state labels, manifest, reasons, lifecycle refs, sanitized evidence, and diagnostics read-only', () => {
    render(<RuntimeInventoryEvidence
      inventory={envelope({
        entries: [
          entry(),
          entry({
            id: 'runtime_inventory:external_harness_fake',
            state: 'blocked',
            selected_manifest: {
              ...entry().selected_manifest,
              manifest_id: 'external_harness_fake',
              display_name: 'External harness fake',
            },
            assignment: { status: 'unassigned', project_id: null, role: 'builder', agent_name: null },
            capability_resolution: {
              ...entry().capability_resolution,
              manifest_id: 'external_harness_fake',
              supported: false,
              reason_codes: ['adapter_unassigned', 'capability_unsupported'],
            },
            sandbox_lifecycle_refs: [],
            sanitized_fake_evidence: [],
            rejection_metadata: {
              field_path: 'sanitized_fake_evidence[0].summary',
              evidence_kind: 'synthetic_summary',
              reason_code: 'sanitized_evidence_rejected',
            },
            reason_codes: ['adapter_unassigned', 'capability_unsupported'],
          }),
        ],
        diagnostics: { truncated: false, warnings: ['fake registry validation failed; invalid manifests are blocked'] },
      })}
      loading={false}
      error={null}
    />)

    const region = screen.getByRole('region', { name: /runtime inventory evidence/i })
    expectPresent(within(region).getByText(/generated: 2026-06-03/i))
    expectPresent(within(region).getByText(/feature flag: enabled/i))
    expectPresent(within(region).getByText(/state: eligible/i))
    expectPresent(within(region).getByText(/state: blocked/i))
    expectPresent(within(region).getByText(/manifest: paddock_owned_sandbox_fake/i))
    expectPresent(within(region).getByText(/manifest: external_harness_fake/i))
    expectPresent(within(region).getByText(/adapter_unassigned, capability_unsupported/i))
    expectPresent(within(region).getByText(/77:running/i))
    expectPresent(within(region).getByText(/synthetic_summary: bounded lifecycle summary/i))
    expect(within(region).getAllByRole('alert')).toHaveLength(2)
    expect(within(region).queryByRole('button')).toBeNull()
    expect(within(region).queryByRole('form')).toBeNull()
    expect(within(region).queryByRole('menu')).toBeNull()
  })

  it('renders loading, error, no-entry, flag-off, and rejected-evidence states with semantic labels', () => {
    const { rerender } = render(<RuntimeInventoryEvidence inventory={null} loading error={null} />)
    expectPresent(screen.getByRole('region', { name: /runtime inventory evidence/i }))
    expect(screen.getByRole('status').textContent).toMatch(/loading runtime inventory evidence/i)

    rerender(<RuntimeInventoryEvidence inventory={null} loading={false} error="authorization_denied" />)
    expect(screen.getByRole('alert').textContent).toMatch(/authorization_denied/i)

    rerender(<RuntimeInventoryEvidence inventory={envelope({ entries: [], summary: { total: 0, visible: 0, unassigned: 0, assigned: 0, eligible: 0, blocked: 0 } })} loading={false} error={null} />)
    expectPresent(screen.getByText(/no runtime inventory entries are visible/i))

    rerender(<RuntimeInventoryEvidence
      inventory={envelope({
        feature_flag: { name: 'FEATURE_AGENT_RUNNER_SANDBOXES', enabled: false, source: 'workspace' },
        entries: [entry({
          state: 'blocked',
          reason_codes: ['feature_disabled'],
          rejection_metadata: {
            field_path: 'sanitized_fake_evidence[0].summary',
            evidence_kind: 'synthetic_summary',
            reason_code: 'sanitized_evidence_rejected',
          },
        })],
        summary: { total: 1, visible: 0, unassigned: 0, assigned: 0, eligible: 0, blocked: 1 },
      })}
      loading={false}
      error={null}
    />)
    expectPresent(screen.getByText(/feature flag: disabled/i))
    expectPresent(screen.getByText(/feature_disabled/i))
    expect(screen.getByRole('alert').textContent).toMatch(/evidence rejected/i)
  })
})
