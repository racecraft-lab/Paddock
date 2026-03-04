import { NextRequest, NextResponse } from 'next/server'
import { getAllGatewaySessions } from '@/lib/sessions'
import { syncClaudeSessions } from '@/lib/claude-sessions'
import { scanCodexSessions } from '@/lib/codex-sessions'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const gatewaySessions = getAllGatewaySessions()

    // If gateway sessions exist, deduplicate and return those
    if (gatewaySessions.length > 0) {
      // Deduplicate by sessionId — OpenClaw tracks cron runs under the same
      // session ID as the parent session, causing duplicate React keys (#80).
      // Keep the most recently updated entry when duplicates exist.
      const sessionMap = new Map<string, (typeof gatewaySessions)[0]>()
      for (const s of gatewaySessions) {
        const id = s.sessionId || `${s.agent}:${s.key}`
        const existing = sessionMap.get(id)
        if (!existing || s.updatedAt > existing.updatedAt) {
          sessionMap.set(id, s)
        }
      }

      const sessions = Array.from(sessionMap.values()).map((s) => {
        const total = s.totalTokens || 0
        const context = s.contextTokens || 35000
        const pct = context > 0 ? Math.round((total / context) * 100) : 0
        return {
          id: s.sessionId || `${s.agent}:${s.key}`,
          key: s.key,
          agent: s.agent,
          kind: s.chatType || 'unknown',
          age: formatAge(s.updatedAt),
          model: s.model,
          tokens: `${formatTokens(total)}/${formatTokens(context)} (${pct}%)`,
          channel: s.channel,
          flags: [],
          active: s.active,
          startTime: s.updatedAt,
          lastActivity: s.updatedAt,
          source: 'gateway' as const,
        }
      })
      return NextResponse.json({ sessions })
    }

    // Fallback: sync and read local Claude + Codex sessions from disk/SQLite
    await syncClaudeSessions()
    const claudeSessions = getLocalClaudeSessions()
    const codexSessions = getLocalCodexSessions()
    const merged = mergeLocalSessions(claudeSessions, codexSessions)
    return NextResponse.json({ sessions: merged })
  } catch (error) {
    logger.error({ err: error }, 'Sessions API error')
    return NextResponse.json({ sessions: [] })
  }
}

/** Read Claude Code sessions from the local SQLite database */
function getLocalClaudeSessions() {
  try {
    const db = getDatabase()
    const rows = db.prepare(
      'SELECT * FROM claude_sessions ORDER BY last_message_at DESC LIMIT 50'
    ).all() as Array<Record<string, any>>

    return rows.map((s) => {
      const total = (s.input_tokens || 0) + (s.output_tokens || 0)
      const lastMsg = s.last_message_at ? new Date(s.last_message_at).getTime() : 0
      return {
        id: s.session_id,
        key: s.project_slug || s.session_id,
        agent: s.project_slug || 'local',
        kind: 'claude-code',
        age: formatAge(lastMsg),
        model: s.model || 'unknown',
        tokens: `${formatTokens(s.input_tokens || 0)}/${formatTokens(s.output_tokens || 0)}`,
        channel: 'local',
        flags: s.git_branch ? [s.git_branch] : [],
        active: s.is_active === 1,
        startTime: s.first_message_at ? new Date(s.first_message_at).getTime() : 0,
        lastActivity: lastMsg,
        source: 'local' as const,
        userMessages: s.user_messages || 0,
        assistantMessages: s.assistant_messages || 0,
        toolUses: s.tool_uses || 0,
        estimatedCost: s.estimated_cost || 0,
        lastUserPrompt: s.last_user_prompt || null,
        workingDir: s.project_path || null,
      }
    })
  } catch (err) {
    logger.warn({ err }, 'Failed to read local Claude sessions')
    return []
  }
}

function getLocalCodexSessions() {
  try {
    const rows = scanCodexSessions(100)

    return rows.map((s) => {
      const total = s.totalTokens || (s.inputTokens + s.outputTokens)
      const lastMsg = s.lastMessageAt ? new Date(s.lastMessageAt).getTime() : 0
      const firstMsg = s.firstMessageAt ? new Date(s.firstMessageAt).getTime() : 0
      return {
        id: s.sessionId,
        key: s.projectSlug || s.sessionId,
        agent: s.projectSlug || 'codex-local',
        kind: 'codex-cli',
        age: formatAge(lastMsg),
        model: s.model || 'codex',
        tokens: `${formatTokens(s.inputTokens || 0)}/${formatTokens(s.outputTokens || 0)}`,
        channel: 'local',
        flags: [],
        active: s.isActive,
        startTime: firstMsg,
        lastActivity: lastMsg,
        source: 'local' as const,
        userMessages: s.userMessages || 0,
        assistantMessages: s.assistantMessages || 0,
        toolUses: 0,
        estimatedCost: 0,
        lastUserPrompt: null,
        totalTokens: total,
        workingDir: s.projectPath || null,
      }
    })
  } catch (err) {
    logger.warn({ err }, 'Failed to read local Codex sessions')
    return []
  }
}

function mergeLocalSessions(
  claudeSessions: Array<Record<string, any>>,
  codexSessions: Array<Record<string, any>>,
) {
  const merged = [...claudeSessions, ...codexSessions]
  const deduped = new Map<string, Record<string, any>>()

  for (const session of merged) {
    const id = String(session?.id || '')
    if (!id) continue
    const existing = deduped.get(id)
    const currentActivity = Number(session?.lastActivity || 0)
    const existingActivity = Number(existing?.lastActivity || 0)
    if (!existing || currentActivity > existingActivity) deduped.set(id, session)
  }

  return Array.from(deduped.values())
    .sort((a, b) => Number(b?.lastActivity || 0) - Number(a?.lastActivity || 0))
    .slice(0, 100)
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function formatAge(timestamp: number): string {
  if (!timestamp) return '-'
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  return `${mins}m`
}

export const dynamic = 'force-dynamic'
