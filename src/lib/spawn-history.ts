/**
 * Spawn History — durable persistence for agent spawn events.
 *
 * Replaces log-scraping fallback with DB-backed spawn tracking.
 * Every agent session spawn (claude-code, codex-cli, hermes) is recorded
 * with status, duration, and error details for diagnostics and attribution.
 */

import { getDatabase } from '@/lib/db'

export interface SpawnRecord {
  id: number
  agent_id: number | null
  agent_name: string
  spawn_type: string
  session_id: string | null
  trigger: string | null
  status: string
  exit_code: number | null
  error: string | null
  duration_ms: number | null
  workspace_id: number
  created_at: number
  finished_at: number | null
}

export function recordSpawnStart(input: {
  agentName: string
  agentId?: number
  spawnType?: string
  sessionId?: string
  trigger?: string
  workspaceId?: number
}): number {
  const db = getDatabase()
  const result = db.prepare(`
    INSERT INTO spawn_history (agent_name, agent_id, spawn_type, session_id, trigger, status, workspace_id)
    VALUES (?, ?, ?, ?, ?, 'started', ?)
  `).run(
    input.agentName,
    input.agentId ?? null,
    input.spawnType ?? 'claude-code',
    input.sessionId ?? null,
    input.trigger ?? null,
    input.workspaceId ?? 1,
  )
  return result.lastInsertRowid as number
}

export function recordSpawnFinish(id: number, input: {
  status: 'completed' | 'failed' | 'terminated'
  exitCode?: number
  error?: string
  durationMs?: number
}): void {
  const db = getDatabase()
  db.prepare(`
    UPDATE spawn_history
    SET status = ?, exit_code = ?, error = ?, duration_ms = ?, finished_at = unixepoch()
    WHERE id = ?
  `).run(
    input.status,
    input.exitCode ?? null,
    input.error ?? null,
    input.durationMs ?? null,
    id,
  )
}

export function getSpawnHistory(agentName: string, opts?: {
  hours?: number
  limit?: number
  workspaceId?: number
}): SpawnRecord[] {
  const db = getDatabase()
  const hours = opts?.hours ?? 24
  const limit = opts?.limit ?? 50
  const since = Math.floor(Date.now() / 1000) - hours * 3600

  return db.prepare(`
    SELECT * FROM spawn_history
    WHERE agent_name = ? AND workspace_id = ? AND created_at > ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(agentName, opts?.workspaceId ?? 1, since, limit) as SpawnRecord[]
}

export function getSpawnStats(opts?: {
  hours?: number
  workspaceId?: number
}): {
  total: number
  completed: number
  failed: number
  avgDurationMs: number
  byAgent: Array<{ agent_name: string; count: number; failures: number }>
} {
  const db = getDatabase()
  const hours = opts?.hours ?? 24
  const since = Math.floor(Date.now() / 1000) - hours * 3600
  const wsId = opts?.workspaceId ?? 1

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      AVG(duration_ms) as avg_duration
    FROM spawn_history
    WHERE workspace_id = ? AND created_at > ?
  `).get(wsId, since) as any

  const byAgent = db.prepare(`
    SELECT
      agent_name,
      COUNT(*) as count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures
    FROM spawn_history
    WHERE workspace_id = ? AND created_at > ?
    GROUP BY agent_name
    ORDER BY count DESC
  `).all(wsId, since) as any[]

  return {
    total: totals?.total ?? 0,
    completed: totals?.completed ?? 0,
    failed: totals?.failed ?? 0,
    avgDurationMs: Math.round(totals?.avg_duration ?? 0),
    byAgent: byAgent.map((row: any) => ({
      agent_name: row.agent_name,
      count: row.count,
      failures: row.failures,
    })),
  }
}
