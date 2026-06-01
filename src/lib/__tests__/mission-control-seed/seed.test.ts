import { describe, expect, it } from 'vitest'

import { resolveFlag } from '@/lib/feature-flags'
import { REQUIRED_WORKFLOW_SLUGS, ROLE_ASSIGNMENTS } from '@/lib/mission-control-seed/types'
import { applyMissionControlSeed, assertWorkflowContractReady } from '@/lib/mission-control-seed/seed'
import {
  makeMissionControlSeedDb,
  missionControlContractPath,
  tableColumns,
} from './test-db'

describe('mission-control product-line seed', () => {
  it('preserves Facility and creates exactly one Paddock Product Line workspace', () => {
    const db = makeMissionControlSeedDb()

    const result = applyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    expect(result.ok).toBe(true)
    expect(result.mutation_status).toBe('applied')
    expect(db.prepare("SELECT COUNT(*) as count FROM workspaces WHERE slug = 'facility'").get()).toEqual({ count: 1 })
    expect(db.prepare("SELECT id, slug, name FROM workspaces WHERE slug = 'mission-control'").get()).toMatchObject({
      slug: 'mission-control',
      name: 'Paddock',
    })
    expect(db.prepare("SELECT COUNT(*) as count FROM workspaces WHERE slug = 'mission-control'").get()).toEqual({ count: 1 })
  })

  it('uses the existing Facility tenant for the Paddock workspace', () => {
    const db = makeMissionControlSeedDb()
    db.prepare("UPDATE workspaces SET tenant_id = 42 WHERE slug = 'facility'").run()

    applyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    expect(db.prepare("SELECT tenant_id FROM workspaces WHERE slug = 'mission-control'").get()).toEqual({ tenant_id: 42 })
  })

  it('creates a missing Facility workspace under the first active tenant', () => {
    const db = makeMissionControlSeedDb()
    db.prepare("DELETE FROM workspaces WHERE slug = 'facility'").run()
    db.prepare('DELETE FROM tenants').run()
    db.prepare(`
      INSERT INTO tenants (id, slug, display_name, linux_user, status, openclaw_home, workspace_root)
      VALUES (2, 'pending', 'Pending', 'pending', 'pending', '/tmp/openclaw-pending', '/tmp/workspaces-pending')
    `).run()
    db.prepare(`
      INSERT INTO tenants (id, slug, display_name, linux_user, status, openclaw_home, workspace_root)
      VALUES (7, 'active', 'Active', 'active', 'active', '/tmp/openclaw-active', '/tmp/workspaces-active')
    `).run()

    applyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    expect(db.prepare("SELECT tenant_id FROM workspaces WHERE slug = 'facility'").get()).toEqual({ tenant_id: 7 })
    expect(db.prepare("SELECT tenant_id FROM workspaces WHERE slug = 'mission-control'").get()).toEqual({ tenant_id: 7 })
  })

  it('creates the six required departments and excludes product surfaces as departments', () => {
    const db = makeMissionControlSeedDb()

    applyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    const rows = db.prepare(`
      SELECT p.slug, p.name, p.ticket_prefix, p.area_slug, p.is_triage_project, p.is_repo_sync_owner, p.github_repo
      FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.slug = 'mission-control'
      ORDER BY p.slug
    `).all()
    expect(rows).toEqual([
      expect.objectContaining({ slug: 'customer-service', ticket_prefix: 'CS', area_slug: 'customer-service' }),
      expect.objectContaining({ slug: 'development', ticket_prefix: 'DEV', area_slug: 'dev' }),
      expect.objectContaining({ slug: 'devsecops', ticket_prefix: 'SEC', area_slug: 'devsecops' }),
      expect.objectContaining({ slug: 'finance', ticket_prefix: 'FIN', area_slug: 'finance' }),
      expect.objectContaining({ slug: 'marketing', ticket_prefix: 'MKT', area_slug: 'marketing' }),
      expect.objectContaining({
        slug: 'qa',
        ticket_prefix: 'QA',
        area_slug: 'qa',
        is_triage_project: 1,
        is_repo_sync_owner: 1,
        github_repo: 'racecraft-lab/Paddock',
      }),
    ])
    expect(rows.map((row) => (row as { slug: string }).slug)).not.toEqual(
      expect.arrayContaining(['triage', 'macos', 'ui', 'website', 'docs']),
    )
    expect(rows.filter((row) => (row as { is_triage_project: number }).is_triage_project === 1)).toHaveLength(1)
    expect(rows.filter((row) => (row as { is_repo_sync_owner: number }).is_repo_sync_owner === 1)).toHaveLength(1)
  })

  it('creates required project-scoped role assignments without a workspace_id dependency', () => {
    const db = makeMissionControlSeedDb()

    applyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    expect(tableColumns(db, 'project_agent_assignments')).not.toContain('workspace_id')
    const assignments = db.prepare(`
      SELECT paa.role, paa.agent_name
      FROM project_agent_assignments paa
      JOIN projects p ON p.id = paa.project_id
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.slug = 'mission-control'
      ORDER BY paa.role
    `).all()
    expect(assignments).toEqual(
      ROLE_ASSIGNMENTS
        .map((assignment) => ({ role: assignment.role, agent_name: assignment.agentName }))
        .sort((a, b) => a.role.localeCompare(b.role)),
    )
  })

  it('re-homes existing Paddock issue intake to QA while preserving GitHub sync metadata', () => {
    const db = makeMissionControlSeedDb()
    db.prepare(`
      INSERT INTO tasks (
        title, workspace_id, github_repo, github_issue_number, github_synced_at,
        github_branch, github_pr_number, github_pr_state, metadata, status,
        assigned_to, workflow_template_slug, parent_task_id, root_task_id,
        chain_id, chain_stage, dispatch_attempts
      )
      VALUES (
        'Existing issue', 1, 'racecraft-lab/Paddock', 42, 123456,
        'fix/thing', 77, 'open', '{"kept":true}', 'in_progress',
        'mission-control-platform-dev', 'old-template', 9, 9,
        'old-chain', 3, 2
      )
    `).run()

    applyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    const row = db.prepare(`
      SELECT t.workspace_id, t.project_id, t.github_repo, t.github_issue_number, t.github_synced_at,
        t.github_branch, t.github_pr_number, t.github_pr_state, t.metadata, t.status,
        t.assigned_to, t.workflow_template_slug, t.parent_task_id, t.root_task_id,
        t.chain_id, t.chain_stage, t.dispatch_attempts, p.slug as project_slug, w.slug as workspace_slug
      FROM tasks t
      JOIN workspaces w ON w.id = t.workspace_id
      JOIN projects p ON p.id = t.project_id
      WHERE t.github_issue_number = 42
    `).get()
    expect(row).toMatchObject({
      workspace_slug: 'mission-control',
      project_slug: 'qa',
      github_repo: 'racecraft-lab/Paddock',
      github_issue_number: 42,
      github_synced_at: 123456,
      github_branch: 'fix/thing',
      github_pr_number: 77,
      github_pr_state: 'open',
      metadata: '{"kept":true}',
      status: 'inbox',
      assigned_to: null,
      workflow_template_slug: null,
      parent_task_id: null,
      root_task_id: null,
      chain_id: null,
      chain_stage: null,
      dispatch_attempts: 0,
    })
    expect(db.prepare("SELECT COUNT(*) as count FROM tasks WHERE github_repo = 'racecraft-lab/Paddock'").get()).toEqual({ count: 1 })
  })

  it('requires the corrected repo-owned workflow contract and imports the nine required slugs', () => {
    const db = makeMissionControlSeedDb()

    expect(assertWorkflowContractReady(missionControlContractPath()).requiredSlugsPresent).toBe(true)
    applyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    const slugs = db.prepare(`
      SELECT wt.slug
      FROM workflow_templates wt
      JOIN workspaces w ON w.id = wt.workspace_id
      WHERE w.slug = 'mission-control' AND wt.created_by = 'workflow-contract' AND wt.enabled = 1
      ORDER BY wt.slug
    `).all().map((row) => (row as { slug: string }).slug)
    expect(slugs).toEqual([...REQUIRED_WORKFLOW_SLUGS].sort())
  })

  it('seeds canonical pilot flags and rejects persisted legacy pilot drift', () => {
    const db = makeMissionControlSeedDb()

    applyMissionControlSeed(db, { contractPath: missionControlContractPath() })

    const row = db.prepare("SELECT feature_flags FROM workspaces WHERE slug = 'mission-control'").get() as { feature_flags: string }
    const flags = JSON.parse(row.feature_flags) as Record<string, boolean>
    expect(flags.PILOT_MISSION_CONTROL_E2E).toBe(true)
    expect(flags.PILOT_PRODUCT_LINE_A_E2E).toBeUndefined()
    expect(resolveFlag('PILOT_MISSION_CONTROL_E2E', { env: {}, workspaceFlags: flags })).toBe(true)
    expect(resolveFlag('PILOT_PRODUCT_LINE_A_E2E', {
      env: { PILOT_PRODUCT_LINE_A_E2E: '1' },
      workspaceFlags: flags,
    })).toBe(false)
  })
})
