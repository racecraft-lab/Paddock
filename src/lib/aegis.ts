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

function findGlobalAegis(db: Database.Database): AegisAgentRow | null {
  return (db.prepare(`
    SELECT id, name, config, workspace_id, scope, status
    FROM agents
    WHERE LOWER(name) = 'aegis' AND scope = 'global'
    ORDER BY id ASC
    LIMIT 1
  `).get() as AegisAgentRow | undefined) ?? null
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
  const existing = db.prepare(`
    SELECT id
    FROM activities
    WHERE type = 'aegis_local_shadowed'
      AND entity_type = 'agent'
      AND entity_id = ?
      AND workspace_id = ?
      AND data = ?
    LIMIT 1
  `).get(localAegis.id, workspaceId, data)
  if (existing) return

  db.prepare(`
    INSERT INTO activities (type, entity_type, entity_id, actor, description, data, workspace_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'aegis_local_shadowed',
    'agent',
    localAegis.id,
    'system',
    `Global Aegis ${String(globalAegis.id)} shadows workspace Aegis ${String(localAegis.id)} for workspace ${String(workspaceId)}`,
    data,
    workspaceId,
  )
}

export function getAegis(db: Database.Database, workspaceId?: number): AegisResolverResult {
  const flags = workspaceFeatureFlags(db, workspaceId)
  const globalEnabled = resolveFlag('FEATURE_GLOBAL_AEGIS', { workspaceFlags: flags })
  const localAegis = findWorkspaceAegis(db, workspaceId)
  const globalAegis = findGlobalAegis(db)

  if (globalEnabled) {
    if (globalAegis) {
      recordShadowAudit(db, workspaceId, globalAegis, localAegis)
      return toResolverResult(globalAegis)
    }
    if (localAegis) return toResolverResult(localAegis)
    return fallbackAegis(workspaceId)
  }

  if (localAegis) return toResolverResult(localAegis)
  if (globalAegis) return toResolverResult(globalAegis)
  return fallbackAegis(workspaceId)
}
