import { resolveFlag } from '@/lib/feature-flags'
import type Database from 'better-sqlite3'

export interface AegisResolverResult {
  id?: number
  name: string
  config: string | null
  agent_config: string | null
  workspace_id?: number | null
  scope?: string | null
  status?: string | null
}

interface AegisAgentRow {
  id: number
  name: string
  config: string | null
  workspace_id: number | null
  scope: string | null
  status: string | null
}

function fallbackAegis(workspaceId?: number): AegisResolverResult {
  return {
    name: 'aegis',
    config: null,
    agent_config: null,
    workspace_id: workspaceId ?? null,
    scope: null,
  }
}

function workspaceFeatureFlags(db: Database.Database, workspaceId?: number): string | null {
  if (!workspaceId) return null
  try {
    const row = db.prepare('SELECT feature_flags FROM workspaces WHERE id = ?').get(workspaceId) as {
      feature_flags: string | null
    } | undefined
    return row?.feature_flags ?? null
  } catch {
    return null
  }
}

function findGlobalAegis(db: Database.Database, workspaceId?: number): AegisAgentRow | null {
  // Prefer the deployment-wide canonical global Aegis (workspace_id IS NULL).
  const canonical = (db.prepare(`
    SELECT id, name, config, workspace_id, scope, status
    FROM agents
    WHERE LOWER(name) = 'aegis' AND scope = 'global' AND workspace_id IS NULL
    ORDER BY id ASC
    LIMIT 1
  `).get() as AegisAgentRow | undefined) ?? null
  if (canonical) return canonical

  // M53 backfilled per-workspace Aegis rows to scope='global' across every workspace.
  // Restricting the fallback to the calling workspace's tenant prevents cross-tenant
  // routing (Finding F1). When a workspaces.tenant_id column is unavailable (older
  // test schemas), the query throws and we fall back to no-match.
  if (!workspaceId) return null
  try {
    return (db.prepare(`
      SELECT a.id, a.name, a.config, a.workspace_id, a.scope, a.status
      FROM agents a
      INNER JOIN workspaces w_target ON w_target.id = ?
      INNER JOIN workspaces w_agent ON w_agent.id = a.workspace_id
      WHERE LOWER(a.name) = 'aegis'
        AND a.scope = 'global'
        AND a.workspace_id IS NOT NULL
        AND w_agent.tenant_id = w_target.tenant_id
      ORDER BY a.id ASC
      LIMIT 1
    `).get(workspaceId) as AegisAgentRow | undefined) ?? null
  } catch {
    return null
  }
}

function findWorkspaceAegis(db: Database.Database, workspaceId?: number): AegisAgentRow | null {
  if (!workspaceId) return null
  return (db.prepare(`
    SELECT id, name, config, workspace_id, scope, status
    FROM agents
    WHERE LOWER(name) = 'aegis' AND workspace_id = ? AND scope = 'workspace'
    ORDER BY id ASC
    LIMIT 1
  `).get(workspaceId) as AegisAgentRow | undefined) ?? null
}

function toResolverResult(row: AegisAgentRow): AegisResolverResult {
  return {
    id: row.id,
    name: row.name,
    config: row.config,
    agent_config: row.config,
    workspace_id: row.workspace_id,
    scope: row.scope,
    status: row.status,
  }
}

function recordShadowAudit(
  db: Database.Database,
  workspaceId: number | undefined,
  globalAegis: AegisAgentRow,
  localAegis: AegisAgentRow | null
): void {
  if (!workspaceId || !localAegis) return

  const data = JSON.stringify({
    feature_flag: 'FEATURE_GLOBAL_AEGIS',
    global_agent_id: globalAegis.id,
    local_agent_id: localAegis.id,
    workspace_id: workspaceId,
  })

  // Single-statement insert with NOT EXISTS guard. Atomic under both single- and
  // multi-process Mission Control deployments (Finding F4) — replaces a prior
  // SELECT-then-INSERT pair that could race across concurrent workers sharing
  // the SQLite file.
  db.prepare(`
    INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
    SELECT ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM activities
      WHERE type = 'aegis_local_shadowed'
        AND entity_type = 'agent'
        AND entity_id = ?
        AND workspace_id = ?
        AND data = ?
    )
  `).run(
    'aegis_local_shadowed',
    'agent',
    localAegis.id,
    'system',
    `Global Aegis ${String(globalAegis.id)} shadows workspace Aegis ${String(localAegis.id)} for workspace ${String(workspaceId)}`,
    data,
    workspaceId,
    localAegis.id,
    workspaceId,
    data,
  )
}

export function hasGlobalAegisCandidate(db: Database.Database, workspaceId?: number): boolean {
  return findGlobalAegis(db, workspaceId) !== null
}

export function getAegis(db: Database.Database, workspaceId?: number): AegisResolverResult {
  const flags = workspaceFeatureFlags(db, workspaceId)
  const globalEnabled = resolveFlag('FEATURE_GLOBAL_AEGIS', { workspaceFlags: flags })
  const localAegis = findWorkspaceAegis(db, workspaceId)

  if (globalEnabled) {
    const globalAegis = findGlobalAegis(db, workspaceId)
    if (globalAegis) {
      recordShadowAudit(db, workspaceId, globalAegis, localAegis)
      return toResolverResult(globalAegis)
    }
    if (localAegis) return toResolverResult(localAegis)
    return fallbackAegis(workspaceId)
  }

  if (localAegis) return toResolverResult(localAegis)
  // Flag-off legacy fallback: only run the global lookup when the workspace
  // has no local Aegis row (Finding F5). Skips an unnecessary DB read on the
  // hot path for workspaces that already have a workspace-scoped Aegis.
  const globalAegis = findGlobalAegis(db, workspaceId)
  if (globalAegis) return toResolverResult(globalAegis)
  return fallbackAegis(workspaceId)
}
