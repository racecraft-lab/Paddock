/**
 * SPEC-008 — Ingest rate state machine with hysteresis.
 *
 * Per FR-090e (per-source-path FSM), FR-090e1 (hysteresis dwell —
 * configurable in governance.json `throttle.dwell_seconds`).
 *
 * Schema reality (M65m):
 *   `ingest_rate_state` is keyed by `source_path` (TEXT PRIMARY KEY)
 *   with `state` CHECK ('accepting','rate_limited','circuit_open',
 *   'disk_full_pause') — only four persisted values.
 *
 * Documented surface (`src/types/observability.ts` IngestRateStateValue):
 *   The full surface allows seven states: `healthy | degraded |
 *   disk_full_pause | circuit_open | rate_limited | amber | red`. The
 *   `healthy | degraded | amber | red` quartet is COMPUTED as a derived
 *   view over the persisted state combined with disk-pressure signals
 *   (governance.json `ingest_disk.amber_*` / `red_*` thresholds).
 *
 * This module is concerned with the persisted FSM only:
 *   `accepting → rate_limited → circuit_open → disk_full_pause`
 *   (and inverses, gated by the dwell window).
 *
 * The `healthy/degraded/amber/red` overlay belongs to the dashboard
 * computation in T091 (ingest-admission) where the disk-pressure
 * inputs are read.
 *
 * Hysteresis (FR-090e1):
 *   - State transitions write `last_state_change_at = now`. Subsequent
 *     transition requests within `dwell_ms` are rejected (callable but
 *     no-op so the caller can poll without retrying transitions).
 *
 * @see specs/008-resource-governance/spec.md FR-090e, FR-090e1
 * @see src/lib/migrations.ts (065m_governance_final_tables —
 *      ingest_rate_state)
 * @see specs/008-resource-governance/tasks.md T090
 * @see Constitution Convention J — strict-scope module
 */

import type Database from 'better-sqlite3';

/**
 * The four persisted FSM states. Computed states (`healthy`,
 * `degraded`, `amber`, `red`) are out of scope for this module.
 */
export type PersistedIngestState =
  | 'accepting'
  | 'rate_limited'
  | 'circuit_open'
  | 'disk_full_pause';

/** Default dwell window per governance.json `throttle.dwell_seconds`. */
export const DEFAULT_INGEST_DWELL_MS = 120_000;

/**
 * Allowed transitions in the FSM. The schema does not enforce these —
 * the application enforces them at write-time so a bug in the caller
 * cannot leave a row in an unreachable state.
 */
const ALLOWED_INGEST_TRANSITIONS: Record<
  PersistedIngestState,
  readonly PersistedIngestState[]
> = {
  accepting: ['rate_limited', 'circuit_open', 'disk_full_pause'],
  rate_limited: ['accepting', 'circuit_open', 'disk_full_pause'],
  circuit_open: ['accepting', 'rate_limited'],
  // Disk pressure is recoverable — once disk frees, state goes back to
  // 'accepting'. We do NOT allow disk_full_pause → rate_limited /
  // circuit_open directly; those would re-acquire after passing through
  // 'accepting'.
  disk_full_pause: ['accepting'],
};

/** Optional clock injection. */
export interface IngestStateClock {
  now(): number;
}

const DEFAULT_CLOCK: IngestStateClock = { now: () => Date.now() };

/** Configuration for one transition / read call. */
export interface IngestStateConfig {
  dwell_ms?: number;
  clock?: IngestStateClock;
}

/** Result of `transitionIngestRateState`. */
export type TransitionIngestResult =
  | { transitioned: true; from: PersistedIngestState; to: PersistedIngestState }
  | { transitioned: false; reason: 'dwell_active' | 'not_allowed' | 'no_change'; current: PersistedIngestState };

/** Persisted row shape (subset). */
interface PersistedRow {
  source_path: string;
  state: PersistedIngestState;
  consecutive_drops: number;
  last_drop_at: string | null;
  last_state_change_at: string;
}

function readRow(
  db: Database.Database,
  source_path: string,
): PersistedRow | null {
  const row = db
    .prepare(
      `SELECT source_path, state, consecutive_drops, last_drop_at,
              last_state_change_at
         FROM ingest_rate_state
        WHERE source_path = ?`,
    )
    .get(source_path) as
    | {
        source_path?: string;
        state?: string;
        consecutive_drops?: number;
        last_drop_at?: string | null;
        last_state_change_at?: string;
      }
    | undefined;
  if (row === undefined) return null;
  return {
    source_path: row.source_path ?? '',
    state: narrowState(row.state ?? 'accepting'),
    consecutive_drops: row.consecutive_drops ?? 0,
    last_drop_at: row.last_drop_at ?? null,
    last_state_change_at: row.last_state_change_at ?? '',
  };
}

function narrowState(s: string): PersistedIngestState {
  if (
    s === 'accepting'
    || s === 'rate_limited'
    || s === 'circuit_open'
    || s === 'disk_full_pause'
  ) {
    return s;
  }
  return 'accepting';
}

/**
 * Read the persisted state for a `source_path`. Lazy-creates the row in
 * `'accepting'` on first call so the caller never has to bootstrap.
 */
export function getIngestRateState(
  db: Database.Database,
  source_path: string,
  config: IngestStateConfig = {},
): PersistedIngestState {
  const existing = readRow(db, source_path);
  if (existing !== null) return existing.state;

  const clock = config.clock ?? DEFAULT_CLOCK;
  const now_iso = new Date(clock.now()).toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO ingest_rate_state
       (source_path, state, consecutive_drops, last_state_change_at)
     VALUES (?, 'accepting', 0, ?)`,
  ).run(source_path, now_iso);
  return 'accepting';
}

/** True when `from → to` is allowed by the FSM. */
export function isAllowedIngestTransition(
  from: PersistedIngestState,
  to: PersistedIngestState,
): boolean {
  return ALLOWED_INGEST_TRANSITIONS[from].includes(to);
}

/**
 * Attempt to transition the row for `source_path` from `fromState` to
 * `toState`. Writes the transition only when:
 *   - The actual current state == fromState (optimistic-lock semantics),
 *   - `from → to` is in ALLOWED_INGEST_TRANSITIONS,
 *   - The dwell window has elapsed since `last_state_change_at`.
 *
 * Returns a discriminated result — never throws on a benign mismatch
 * (caller is expected to poll). Throws only when the SQL write fails.
 */
export function transitionIngestRateState(
  db: Database.Database,
  source_path: string,
  fromState: PersistedIngestState,
  toState: PersistedIngestState,
  reason: string,
  config: IngestStateConfig = {},
): TransitionIngestResult {
  const dwell_ms = config.dwell_ms ?? DEFAULT_INGEST_DWELL_MS;
  const clock = config.clock ?? DEFAULT_CLOCK;
  const now_ms = clock.now();

  // Lazy-init: ensure a row exists.
  getIngestRateState(db, source_path, config);
  const current = readRow(db, source_path);
  if (current === null) {
    throw new Error(
      `ingest-rate-state: row not found for source_path=${source_path} after lazy-init`,
    );
  }

  if (current.state !== fromState) {
    return { transitioned: false, reason: 'not_allowed', current: current.state };
  }
  if (fromState === toState) {
    return { transitioned: false, reason: 'no_change', current: current.state };
  }
  if (!isAllowedIngestTransition(fromState, toState)) {
    return { transitioned: false, reason: 'not_allowed', current: current.state };
  }
  // Hysteresis check
  const last_change_ms = Date.parse(current.last_state_change_at);
  if (Number.isFinite(last_change_ms) && now_ms - last_change_ms < dwell_ms) {
    return { transitioned: false, reason: 'dwell_active', current: current.state };
  }

  const now_iso = new Date(now_ms).toISOString();
  const reasonNote = JSON.stringify({ reason });
  db.prepare(
    `UPDATE ingest_rate_state
        SET state = ?,
            last_state_change_at = ?,
            metadata_json = ?
      WHERE source_path = ?
        AND state = ?`,
  ).run(toState, now_iso, reasonNote, source_path, fromState);

  return { transitioned: true, from: fromState, to: toState };
}

/**
 * Increment the drop counter for `source_path`. Used by the admission
 * controller (T091) when a request is rejected. Idempotent on row
 * absence (lazy-creates the row).
 */
export function recordIngestDrop(
  db: Database.Database,
  source_path: string,
  config: IngestStateConfig = {},
): void {
  getIngestRateState(db, source_path, config);
  const clock = config.clock ?? DEFAULT_CLOCK;
  const now_iso = new Date(clock.now()).toISOString();
  db.prepare(
    `UPDATE ingest_rate_state
        SET consecutive_drops = consecutive_drops + 1,
            last_drop_at = ?
      WHERE source_path = ?`,
  ).run(now_iso, source_path);
}

/** Reset the drop counter on `source_path`. */
export function resetIngestDrops(
  db: Database.Database,
  source_path: string,
): void {
  db.prepare(
    `UPDATE ingest_rate_state
        SET consecutive_drops = 0
      WHERE source_path = ?`,
  ).run(source_path);
}
