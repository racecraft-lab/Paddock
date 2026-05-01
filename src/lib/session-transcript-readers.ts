import fs from 'node:fs'
import Database from 'better-sqlite3'
import { logger } from '@/lib/logger'
import { epochMsToIso, getOpenCodeDbCandidates } from '@/lib/opencode-sessions'

export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: string }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }

export type TranscriptMessage = {
  role: 'user' | 'assistant' | 'system'
  parts: MessageContentPart[]
  timestamp?: string
}

type HermesMessageRow = {
  role: string
  content: string | null
  tool_call_id: string | null
  tool_calls: string | null
  tool_name: string | null
  timestamp: number
}

function textPart(content: string | null, limit = 8000): MessageContentPart | null {
  const text = String(content || '').trim()
  if (!text) return null
  return { type: 'text', text: text.slice(0, limit) }
}

function pushMessage(
  list: TranscriptMessage[],
  role: TranscriptMessage['role'],
  parts: MessageContentPart[],
  timestamp?: string,
) {
  if (parts.length === 0) return
  list.push({ role, parts, timestamp })
}

function epochSecondsToISO(epoch: number | null | undefined): string | undefined {
  if (!epoch || !Number.isFinite(epoch) || epoch <= 0) return undefined
  return new Date(epoch * 1000).toISOString()
}

export function readOpenCodeTranscript(sessionId: string, limit: number): TranscriptMessage[] {
  for (const dbPath of getOpenCodeDbCandidates()) {
    if (!dbPath || !fs.existsSync(dbPath)) continue

    let db: Database.Database | null = null
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true })
      const hasMessage = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get('message')
      if (!hasMessage) continue

      const hasPart = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get('part')

      const rows = db.prepare(
        `SELECT id, data, time_created, time_updated
         FROM (
           SELECT id, data, time_created, time_updated
           FROM message
           WHERE session_id = ?
           ORDER BY COALESCE(time_updated, time_created) DESC
           LIMIT ?
         ) recent
         ORDER BY COALESCE(time_updated, time_created) ASC`
      ).all(sessionId, Math.max(1, limit * 4)) as Array<{ id: number; data: string | null; time_created: number | null; time_updated: number | null }>

      if (rows.length === 0) continue

      const messages: TranscriptMessage[] = []
      for (const row of rows) {
        if (!row.data) continue
        let parsed: any
        try {
          parsed = JSON.parse(row.data)
        } catch {
          continue
        }

        const timestamp = epochMsToIso(row.time_updated || row.time_created) || undefined
        const role = typeof parsed?.role === 'string' ? parsed.role : 'system'
        const parts: MessageContentPart[] = []

        if (hasPart && row.id) {
          const partRows = db.prepare(
            `SELECT data FROM part WHERE message_id = ? ORDER BY rowid ASC`
          ).all(row.id) as Array<{ data: string | null }>

          for (const pr of partRows) {
            if (!pr.data) continue
            let partParsed: any
            try { partParsed = JSON.parse(pr.data) } catch { continue }

            if (partParsed?.type === 'text' && typeof partParsed.text === 'string') {
              const part = textPart(partParsed.text)
              if (part) parts.push(part)
            } else if (partParsed?.type === 'tool' && typeof partParsed.tool === 'string') {
              const part = textPart(`[Tool: ${partParsed.tool}]`, 200)
              if (part) parts.push(part)
            }
          }
        }

        if (parts.length === 0 && typeof parsed?.content === 'string') {
          const part = textPart(parsed.content)
          if (part) parts.push(part)
        }

        if (parsed?.summary && typeof parsed.summary === 'object') {
          const summary = JSON.stringify(parsed.summary)
          const part = textPart(summary, 4000)
          if (part) parts.push(part)
        }

        if (parsed?.error && typeof parsed.error === 'object') {
          const detail = typeof parsed.error?.data?.message === 'string'
            ? parsed.error.data.message
            : typeof parsed.error?.name === 'string'
              ? parsed.error.name
              : JSON.stringify(parsed.error)
          const part = textPart(`Error: ${detail}`, 4000)
          if (part) parts.push(part)
        }

        if (parsed?.tokens && typeof parsed.tokens === 'object') {
          const total = parsed.tokens.total ?? (Number(parsed.tokens.input || 0) + Number(parsed.tokens.output || 0))
          const part = textPart(`Tokens: ${total}`, 200)
          if (part) parts.push(part)
        }

        if (parts.length === 0) continue

        if (role === 'assistant' || role === 'user' || role === 'system') {
          messages.push({ role, parts, timestamp })
        } else {
          messages.push({ role: 'system', parts, timestamp })
        }
      }

      if (messages.length > 0) {
        return messages.slice(-limit)
      }
    } catch (error) {
      logger.warn({ err: error, dbPath, sessionId }, 'Failed to read OpenCode transcript')
    } finally {
      try { db?.close() } catch { /* noop */ }
    }
  }

  return []
}

export function readHermesTranscriptFromDbPath(dbPath: string, sessionId: string, limit: number): TranscriptMessage[] {
  if (!dbPath || !fs.existsSync(dbPath)) return []

  let db: Database.Database | null = null
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true })

    const rows = db.prepare(`
      SELECT role, content, tool_call_id, tool_calls, tool_name, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `).all(sessionId, Math.max(1, limit * 4)) as HermesMessageRow[]

    const messages: TranscriptMessage[] = []

    for (const row of rows) {
      const timestamp = epochSecondsToISO(row.timestamp)
      const parts: MessageContentPart[] = []

      if (row.role === 'assistant' && row.tool_calls) {
        try {
          const toolCalls = JSON.parse(row.tool_calls) as Array<Record<string, unknown>>
          for (const call of toolCalls) {
            const fn = call.function
            const fnRecord = fn && typeof fn === 'object' ? fn as Record<string, unknown> : null
            const name = typeof fnRecord?.name === 'string'
              ? fnRecord.name
              : typeof call.tool_name === 'string'
                ? String(call.tool_name)
                : typeof row.tool_name === 'string'
                  ? row.tool_name
                  : 'tool'
            const id = typeof call.call_id === 'string'
              ? call.call_id
              : typeof call.id === 'string'
                ? call.id
                : ''
            const input = typeof fnRecord?.arguments === 'string'
              ? fnRecord.arguments
              : JSON.stringify(fnRecord?.arguments || {})
            parts.push({
              type: 'tool_use',
              id,
              name,
              input: String(input).slice(0, 4000),
            })
          }
        } catch {
          // Ignore malformed tool call payloads and fall back to text content if present.
        }
      }

      const text = textPart(row.content)
      if (text) parts.push(text)

      if (row.role === 'tool') {
        pushMessage(messages, 'system', [{
          type: 'tool_result',
          toolUseId: row.tool_call_id || '',
          content: String(row.content || '').trim().slice(0, 8000),
          isError: row.content?.includes('"success": false') || row.content?.includes('"error"'),
        }], timestamp)
        continue
      }

      if (row.role === 'assistant') {
        pushMessage(messages, 'assistant', parts, timestamp)
        continue
      }

      if (row.role === 'user') {
        pushMessage(messages, 'user', parts, timestamp)
      }
    }

    return messages.slice(-limit)
  } catch (error) {
    logger.warn({ err: error, dbPath, sessionId }, 'Failed to read Hermes transcript')
    return []
  } finally {
    try { db?.close() } catch { /* noop */ }
  }
}
