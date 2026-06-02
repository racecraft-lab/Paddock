/**
 * SPEC-008 — Three named SQLite connections for the resource governance subsystem.
 *
 * Per FR-060, FR-331, FR-332, Q29 (design concept) — separate connections per
 * workload class so admission hot-path latency (FR-326: p95 < 15 ms) is not
 * starved by long-running background work (reconciler, drift detector,
 * retention sweep, hash-chain verification).
 *
 * | Connection | busy_timeout | Workloads |
 * |------------|-------------:|-----------|
 * | foreground | 50 ms        | admission UPDATE, override grants, evaluator reads |
 * | background | 5,000 ms     | reconciler, drift detector, reservation reaper, freshness |
 * | audit      | 30,000 ms    | hash-chain verifier, retention sweep, drift rebuild |
 *
 * All three connections share the same SQLite database file under WAL mode
 * so they cooperate as one writer + multiple readers (single-process
 * single-writer semantics — no cross-process locking, no replication).
 *
 * Connection lifetime: lazy-singleton per workload class until
 * `closeAllConnections()` resets all three. Tests use this to isolate
 * fixtures; production calls it on shutdown.
 *
 * @see specs/008-resource-governance/spec.md FR-060, FR-331, FR-332, FR-326
 * @see specs/008-resource-governance/data-model.md Q29
 * @see Constitution v1.4.1 Convention J — file added to tsconfig.spec-strict.json + eslint.config.mjs
 */

import { mkdirSync } from 'fs';
import { dirname } from 'path';
import Database from 'better-sqlite3';

const FOREGROUND_BUSY_TIMEOUT_MS = 50;
const BACKGROUND_BUSY_TIMEOUT_MS = 5_000;
const AUDIT_BUSY_TIMEOUT_MS = 30_000;
const SYNCHRONOUS_NORMAL = 1; // SQLite synchronous=NORMAL

let foregroundDb: Database.Database | null = null;
let backgroundDb: Database.Database | null = null;
let auditDb: Database.Database | null = null;

/**
 * Resolve the SQLite database path at the moment of connection creation.
 * Lazy resolution allows tests to set PADDOCK_DB_PATH per-test
 * and reset state via closeAllConnections().
 */
function resolveDbPath(): string {
  const explicit = process.env['PADDOCK_DB_PATH'];
  if (explicit) return explicit;
  const dataDir = process.env['PADDOCK_DATA_DIR'] ?? '.data';
  return `${dataDir}/paddock.db`;
}

/**
 * Apply WAL + synchronous=NORMAL + busy_timeout pragmas to a fresh
 * connection. Uses `pragma()` (the better-sqlite3 type-safe API), NOT
 * shell exec.
 */
function configureConnection(
  conn: Database.Database,
  busyTimeoutMs: number,
): void {
  conn.pragma('journal_mode = WAL');
  conn.pragma(`synchronous = ${SYNCHRONOUS_NORMAL.toString()}`);
  conn.pragma(`busy_timeout = ${busyTimeoutMs.toString()}`);
}

/**
 * Open a fresh connection at `dbPath` with the requested busy_timeout.
 * Caller is responsible for storing it in the appropriate singleton slot.
 */
function openConnection(busyTimeoutMs: number): Database.Database {
  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const conn = new Database(dbPath);
  configureConnection(conn, busyTimeoutMs);
  return conn;
}

/**
 * Foreground connection — admission hot-path. busy_timeout = 50 ms so a
 * single contention spike defers gracefully (FR-005a: defer with reason
 * `defer:db_busy` per FR-333).
 */
export function getForegroundDb(): Database.Database {
  foregroundDb ??= openConnection(FOREGROUND_BUSY_TIMEOUT_MS);
  return foregroundDb;
}

/**
 * Background connection — reconciler / drift detector / reservation reaper /
 * telemetry freshness tracker. busy_timeout = 5,000 ms so batched
 * transactions can wait through brief foreground writes.
 */
export function getBackgroundDb(): Database.Database {
  backgroundDb ??= openConnection(BACKGROUND_BUSY_TIMEOUT_MS);
  return backgroundDb;
}

/**
 * Audit connection — hash-chain verifier / retention sweep / drift counter
 * rebuild. busy_timeout = 30,000 ms so long-running integrity work tolerates
 * concurrent foreground + background writes without false-failures.
 */
export function getAuditDb(): Database.Database {
  auditDb ??= openConnection(AUDIT_BUSY_TIMEOUT_MS);
  return auditDb;
}

/**
 * Close all three connections. Idempotent — safe on double-call and safe
 * when no connection has been opened. Used by tests for fixture isolation
 * and by production shutdown handlers.
 */
export function closeAllConnections(): void {
  if (foregroundDb) {
    try {
      foregroundDb.close();
    } catch {
      // ignore — already closed
    }
    foregroundDb = null;
  }
  if (backgroundDb) {
    try {
      backgroundDb.close();
    } catch {
      // ignore
    }
    backgroundDb = null;
  }
  if (auditDb) {
    try {
      auditDb.close();
    } catch {
      // ignore
    }
    auditDb = null;
  }
}
