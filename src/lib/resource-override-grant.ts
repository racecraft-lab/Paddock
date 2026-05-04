/**
 * SPEC-008 — Atomic override-grant write transaction (T138).
 *
 * Per FR-171, FR-172, FR-173, FR-174, FR-175, FR-184, FR-219b, FR-368.
 *
 * Surface:
 *   - `grantOverride(input, db?)` — synchronous; runs the full grant
 *     inside `db.transaction(fn).immediate(args)` so the writer holds
 *     the SQLite RESERVED lock from the first INSERT through the audit
 *     append. On UNIQUE(idempotency_key, actor) collision the loser
 *     returns `code='duplicate_idempotency_key'` (NOT a thrown SQLite
 *     error). On out-of-bound TTL the writer rejects pre-tx with
 *     `code='invalid_ttl'`.
 *
 * TTL policy (FR-219b): 60_000 ≤ ttl_ms ≤ 24h (86_400_000 ms).
 *   - Below 60s: insufficient operator review window. Reject.
 *   - Above 24h: violates "short-lived grant" intent. Reject.
 *
 * Audit chain (FR-184 / FR-368): each accepted grant appends one row to
 * the unified `recovery_action` chain (kind='override_grant'). The chain
 * uses the shared `chainHash(prev_hash, content)` primitive from
 * `resource-audit-chain.ts` so every governance audit chain shares the
 * SHA-256-over-JCS algorithm. The previous row is the
 * `recovery_action.row_hash` with the highest id; an empty chain seeds
 * from `GENESIS_PREV_HASH`.
 *
 * @see specs/008-resource-governance/spec.md FR-171, FR-172, FR-173,
 *      FR-174, FR-175, FR-184, FR-219b, FR-368
 * @see specs/008-resource-governance/tasks.md T138, T148
 * @see Constitution Convention J — strict-scope (`src/lib/resource-*.ts`)
 */

import { getForegroundDb } from '@/lib/db/connection-pool';
import {
  chainHash,
  GENESIS_PREV_HASH,
} from '@/lib/resource-audit-chain';
import {
  isGrantsDisabled,
  recordAnomaly,
} from '@/lib/resource-override-anomaly-guard';
import type Database from 'better-sqlite3';

/** TTL bounds (FR-219b). */
export const OVERRIDE_TTL_MIN_MS = 60_000;
export const OVERRIDE_TTL_MAX_MS = 24 * 60 * 60 * 1000;

/**
 * Closed scope-kind set; mirrors the `resource_overrides.scope_kind`
 * CHECK constraint (M65h) and the `overrideScopeKindEnum` Zod enum in
 * `resource-validation.ts`.
 */
export type OverrideScopeKind =
  | 'facility'
  | 'workspace'
  | 'agent'
  | 'project'
  | 'task_status'
  | 'specific_task';

/**
 * Closed budget-unit set; mirrors `resource_overrides.granted_unit`
 * CHECK and `overrideUnitEnum`.
 */
export type OverrideUnit = 'usd' | 'token' | 'request' | 'session';

/** Input shape for one grant attempt. */
export interface OverrideGrantInput {
  scope_kind: OverrideScopeKind;
  scope_id: number | null;
  policy_id: number | null;
  granted_amount: number | null;
  granted_unit: OverrideUnit | null;
  reservation_id: number | null;
  reason: string;
  ttl_ms: number;
  idempotency_key: string;
  actor: string;
}

/** Successful grant. */
export interface OverrideGrantOk {
  ok: true;
  override_id: number;
  expires_at: string;
  /** SHA-256 hex of the appended audit chain row. */
  audit_row_hash: string;
}

/** Failure envelope; `code` distinguishes the failure class. */
export interface OverrideGrantErr {
  ok: false;
  code:
    | 'duplicate_idempotency_key'
    | 'invalid_ttl'
    | 'policy_not_found'
    | 'rate_limited'
    | 'governance_grants_disabled';
  detail?: string;
}

export type OverrideGrantResult = OverrideGrantOk | OverrideGrantErr;

/** Shape of the most-recent recovery_action row (for chain prev_hash). */
interface ChainTailRow {
  row_hash: string;
}

/**
 * Read the most-recent `recovery_action.row_hash` so the new entry
 * chains correctly. Empty chain returns the genesis seed.
 */
function readChainPrevHash(db: Database.Database): string {
  const tail = db
    .prepare(
      `SELECT row_hash FROM recovery_action ORDER BY id DESC LIMIT 1`,
    )
    .get() as ChainTailRow | undefined;
  if (tail === undefined) return GENESIS_PREV_HASH;
  return tail.row_hash;
}

/**
 * Build the canonical content shape that flows into the chain hash. Keys
 * are alphabetised by `canonicalizeJcs` automatically; we just collect
 * the relevant content columns. NULL is rendered as JSON null.
 */
function buildChainContent(args: {
  override_id: number;
  input: OverrideGrantInput;
  granted_at: string;
  expires_at: string;
}): Record<string, unknown> {
  return {
    actor: args.input.actor,
    expires_at: args.expires_at,
    granted_amount: args.input.granted_amount,
    granted_at: args.granted_at,
    granted_unit: args.input.granted_unit,
    idempotency_key: args.input.idempotency_key,
    kind: 'override_grant',
    override_id: args.override_id,
    policy_id: args.input.policy_id,
    reason: args.input.reason,
    reservation_id: args.input.reservation_id,
    scope_id: args.input.scope_id,
    scope_kind: args.input.scope_kind,
  };
}

/**
 * Sentinel error that escapes the transaction with a typed envelope. Not
 * exported; callers see only `OverrideGrantResult`.
 */
class OverrideFailure extends Error {
  public readonly payload: OverrideGrantErr;
  constructor(payload: OverrideGrantErr) {
    super(`resource-override-grant: ${payload.code}`);
    this.name = 'OverrideFailure';
    this.payload = payload;
  }
}

/**
 * Detect a SQLite UNIQUE-constraint violation on the
 * `idempotency_key` index. better-sqlite3 surfaces these as
 * `SqliteError` with `.code = 'SQLITE_CONSTRAINT_UNIQUE'` and the
 * `.message` mentions the violated index.
 */
function isUniqueViolation(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  if (typeof e.code !== 'string') return false;
  return (
    e.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    e.code === 'SQLITE_CONSTRAINT'
  ) && typeof e.message === 'string' && /idempotency_key|UNIQUE/i.test(e.message);
}

/**
 * Atomic override grant. Returns `{ok:true, override_id, expires_at,
 * audit_row_hash}` on success or a typed `{ok:false, code, detail?}`
 * envelope on failure.
 *
 * Atomicity contract (FR-173, FR-174):
 *   - The override INSERT and the recovery_action audit append commit
 *     together inside `db.transaction(...).immediate(args)`. Partial
 *     commit is impossible.
 *
 * TTL contract (FR-219b):
 *   - 60s floor and 24h ceiling. Out-of-bound TTLs are rejected before
 *     any state mutation.
 */
export function grantOverride(
  input: OverrideGrantInput,
  dbArg?: Database.Database,
): OverrideGrantResult {
  // FR-219b TTL guard. Rejected BEFORE any tx so no audit row is appended.
  if (
    !Number.isFinite(input.ttl_ms) ||
    input.ttl_ms < OVERRIDE_TTL_MIN_MS ||
    input.ttl_ms > OVERRIDE_TTL_MAX_MS
  ) {
    return {
      ok: false,
      code: 'invalid_ttl',
      detail: `ttl_ms must be in [${String(OVERRIDE_TTL_MIN_MS)}..${String(OVERRIDE_TTL_MAX_MS)}]`,
    };
  }

  const db = dbArg ?? getForegroundDb();

  const tx = db.transaction((args: OverrideGrantInput): OverrideGrantOk => {
    // FR-219d gate: reject early when the actor's grant capability has
    // been auto-disabled (3+ defer:anomaly grants in 60min) and not yet
    // re-enabled by an admin. The check runs INSIDE the transaction so
    // a concurrent re-enable cannot race against an in-flight grant.
    if (isGrantsDisabled(args.actor, db)) {
      throw new OverrideFailure({
        ok: false,
        code: 'governance_grants_disabled',
        detail:
          'actor grant capability is currently disabled by override-anomaly auto-disable',
      });
    }

    const granted_at = new Date().toISOString();
    const expires_at = new Date(Date.now() + args.ttl_ms).toISOString();

    // 1. INSERT the override row (M65h).
    //    UNIQUE(idempotency_key, actor) is the dedup mechanism.
    const insert = db.prepare(
      `INSERT INTO resource_overrides
         (scope_kind, scope_id, policy_id, granted_amount, granted_unit,
          reservation_id, reason, actor, idempotency_key,
          granted_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertResult = insert.run(
      args.scope_kind,
      args.scope_id,
      args.policy_id,
      args.granted_amount,
      args.granted_unit,
      args.reservation_id,
      args.reason,
      args.actor,
      args.idempotency_key,
      granted_at,
      expires_at,
    );
    const override_id = Number(insertResult.lastInsertRowid);

    // 2. Append the audit-chain entry into recovery_action (FR-184 / FR-368).
    const prev_hash = readChainPrevHash(db);
    const content = buildChainContent({
      override_id,
      input: args,
      granted_at,
      expires_at,
    });
    const row_hash = chainHash(prev_hash, content);
    db.prepare(
      `INSERT INTO recovery_action
         (kind, actor, scope_kind, scope_id, payload_json,
          prev_hash, row_hash, taken_at)
       VALUES ('override_grant', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      args.actor,
      args.scope_kind,
      args.scope_id,
      JSON.stringify(content),
      prev_hash,
      row_hash,
      granted_at,
    );

    // FR-219d trigger: when this grant's reason carries the
    // `defer:anomaly` discriminator, increment the actor's anomaly
    // counter inside the same tx. `recordAnomaly` returns true when
    // the threshold tripped a fresh disable; the disable + audit row
    // are committed together with this grant.
    if (args.reason.includes('defer:anomaly')) {
      recordAnomaly(args.actor, db);
    }

    return {
      ok: true,
      override_id,
      expires_at,
      audit_row_hash: row_hash,
    };
  });

  try {
    return tx.immediate(input);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        code: 'duplicate_idempotency_key',
        detail: 'an override grant with this idempotency_key already exists for this actor',
      };
    }
    if (err instanceof OverrideFailure) {
      return err.payload;
    }
    throw err;
  }
}
