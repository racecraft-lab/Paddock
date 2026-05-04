import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { resolveFlag } from '@/lib/feature-flags'
import { logger } from '@/lib/logger'
import {
  resolveWorkspaceScopeFromRequest,
  workspaceScopeError,
  workspaceScopePredicate,
} from '@/lib/workspaces'

/**
 * SPEC-007 — GET /api/dispositions/rollup (US4, FR-070 / FR-071 / FR-072 / FR-139)
 *
 * Powers the dashboard "Last 7d triage totals" widget. Returns per-day counts
 * grouped by disposition value plus a 7-day grand total for the requesting
 * workspace. Days are zero-filled — exactly 7 entries (today + 6 days back),
 * regardless of which days actually have rows. `'unknown'` is its own segment.
 *
 * Cache: process-local Map keyed on `(workspace_id, day_bucket)` with a 15s TTL.
 * The widget polls every 30s, so worst-case visible lag is one TTL window.
 * Cache invalidation on disposition INSERT (T211 / T905) is intentionally
 * deferred — the TTL is the freshness floor for v1.
 *
 * Error precedence mirrors `/api/dispositions/route.ts`:
 *   503 disposition_logging_disabled  (flag OFF, BEFORE auth)
 *   401 (unauthenticated)
 *   403 (workspace forbidden)
 *   400 workspace_id_required
 */

interface DayBucket {
  date: string // YYYY-MM-DD (UTC)
  total: number
  by_disposition: Record<string, number>
}

interface RollupBody {
  days: DayBucket[]
  total: number
}

interface CacheEntry {
  body: RollupBody
  expiresAt: number // ms epoch
}

// Process-local. One entry per (workspace_id, day_bucket) tuple. Day-bucket is
// the UTC YYYY-MM-DD of "today" at request time so the cache naturally falls
// off the next calendar day.
const rollupCache = new Map<string, CacheEntry>()
const TTL_MS = 15_000

function nowSeconds(): number {
  const fixedNow =
    process.env.MISSION_CONTROL_TEST_MODE === '1'
      ? process.env.MC_SPEC_007_FIXED_NOW
      : undefined
  if (fixedNow) {
    const parsed = Date.parse(fixedNow)
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed / 1000)
    }
  }
  return Math.floor(Date.now() / 1000)
}

function cacheKey(workspaceId: number, dayBucket: string): string {
  return `${String(workspaceId)}:${dayBucket}`
}

/** Test-only escape hatch — clears the in-memory cache. */
export function __resetRollupCacheForTests(): void {
  rollupCache.clear()
}

function readQueryWorkspaceFlags(
  db: ReturnType<typeof getDatabase>,
  workspaceId: number | null,
): string | null {
  if (workspaceId === null) return null
  try {
    const row = db.prepare(
      'SELECT feature_flags FROM workspaces WHERE id = ? LIMIT 1',
    ).get(workspaceId) as { feature_flags: string | null } | undefined
    return row?.feature_flags ?? null
  } catch {
    return null
  }
}

/** UTC YYYY-MM-DD for the given unix-epoch (seconds). */
function utcDateString(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${String(y)}-${m}-${day}`
}

/**
 * Build the 7 day buckets ending today (UTC). Ordered oldest → newest so the
 * widget renders left-to-right as a calendar week.
 */
function buildEmptyDays(nowSeconds: number): DayBucket[] {
  const days: DayBucket[] = []
  for (let i = 6; i >= 0; i -= 1) {
    days.push({
      date: utcDateString(nowSeconds - i * 24 * 3600),
      total: 0,
      by_disposition: {},
    })
  }
  return days
}

interface RollupRow {
  day: string
  disposition: string
  count: number
}

function queryRollup(
  db: ReturnType<typeof getDatabase>,
  acceptedScope: Awaited<ReturnType<typeof resolveWorkspaceScopeFromRequest>>,
  nowSeconds: number,
): RollupBody {
  const days = buildEmptyDays(nowSeconds)
  // Inclusive lower bound — today minus 6 full days at midnight UTC. Use the
  // earliest day-bucket date string to floor.
  const oldest = days[0]
  if (!oldest) {
    return { days, total: 0 }
  }
  const sinceEpoch = Math.floor(Date.parse(`${oldest.date}T00:00:00Z`) / 1000)

  const wsPred = workspaceScopePredicate(acceptedScope, 'workspace_id')
  const params: Array<string | number> = [...wsPred.params, sinceEpoch]
  const sql = `
    SELECT date(triaged_at, 'unixepoch') AS day,
           disposition,
           COUNT(*) AS count
    FROM task_dispositions
    WHERE ${wsPred.sql} AND triaged_at >= ?
    GROUP BY day, disposition
  `
  const rows = db.prepare(sql).all(...params) as RollupRow[]

  // Index by day for O(1) merge.
  const dayIndex = new Map<string, DayBucket>()
  for (const d of days) dayIndex.set(d.date, d)

  let grandTotal = 0
  for (const row of rows) {
    const bucket = dayIndex.get(row.day)
    if (!bucket) continue // Out-of-window (e.g. the boundary day) — ignore.
    bucket.by_disposition[row.disposition] =
      (bucket.by_disposition[row.disposition] ?? 0) + row.count
    bucket.total += row.count
    grandTotal += row.count
  }

  return { days, total: grandTotal }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDatabase()
    const { searchParams } = new URL(request.url)

    // ── 1. Pre-auth flag check (parity with /api/dispositions). ────────
    const queryWorkspaceIdRaw = searchParams.get('workspace_id')
    let queryWorkspaceId: number | null = null
    if (queryWorkspaceIdRaw !== null && /^\d+$/.test(queryWorkspaceIdRaw)) {
      const parsed = Number(queryWorkspaceIdRaw)
      if (Number.isSafeInteger(parsed) && parsed > 0) {
        queryWorkspaceId = parsed
      }
    }
    if (queryWorkspaceId !== null) {
      const flags = readQueryWorkspaceFlags(db, queryWorkspaceId)
      const flagOn = resolveFlag('FEATURE_DISPOSITION_LOGGING', { workspaceFlags: flags })
      if (!flagOn) {
        return NextResponse.json(
          { error: 'disposition_logging_disabled' },
          { status: 503 },
        )
      }
    }

    // ── 2. Auth. ───────────────────────────────────────────────────────
    const auth = requireRole(request, 'viewer')
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    // ── 3. Scope. ──────────────────────────────────────────────────────
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)

    // ── 4. Post-auth flag check fallback (no workspace_id in query). ───
    if (queryWorkspaceId === null) {
      const fallbackFlags = readQueryWorkspaceFlags(db, auth.user.workspace_id ?? null)
      const flagOn = resolveFlag('FEATURE_DISPOSITION_LOGGING', { workspaceFlags: fallbackFlags })
      if (!flagOn) {
        return NextResponse.json(
          { error: 'disposition_logging_disabled' },
          { status: 503 },
        )
      }
    }

    // Non-Facility callers must pass workspace_id explicitly.
    if (acceptedScope.kind !== 'facility' && queryWorkspaceIdRaw === null) {
      return NextResponse.json(
        { error: 'workspace_id_required' },
        { status: 400 },
      )
    }

    // ── 5. Cache lookup. ───────────────────────────────────────────────
    const currentNowSeconds = nowSeconds()
    const dayBucket = utcDateString(currentNowSeconds)
    // Cache is per-scope. Use the scope's workspaceId for productLine (single
    // workspace) and a stable sentinel for facility. Sentinel is the joined
    // workspace ids — unique per facility membership and also per-day.
    const cacheScopeKey =
      acceptedScope.kind === 'facility'
        ? `facility:${acceptedScope.workspaceIds.slice().sort((a, b) => a - b).join(',')}`
        : `pl:${String(acceptedScope.workspaceId)}`
    const key = cacheKey(0, `${cacheScopeKey}:${dayBucket}`)

    const nowMs = Date.now()
    const cached = rollupCache.get(key)
    if (cached && cached.expiresAt > nowMs) {
      return NextResponse.json(cached.body)
    }

    // ── 6. Compute and cache. ──────────────────────────────────────────
    const body = queryRollup(db, acceptedScope, currentNowSeconds)
    rollupCache.set(key, { body, expiresAt: nowMs + TTL_MS })

    return NextResponse.json(body)
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) {
      return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    }
    logger.error({ err: error }, 'GET /api/dispositions/rollup error')
    return NextResponse.json(
      { error: 'Failed to fetch disposition rollup' },
      { status: 500 },
    )
  }
}
