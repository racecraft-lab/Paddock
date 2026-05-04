/**
 * SPEC-008 — Provider account ToS surface lifecycle.
 *
 * Per FR-139, FR-146, FR-147, FR-219w, FR-219y and tasks.md T121.
 *
 * Three concerns wired together:
 *
 *   1. Acknowledgement state machine on
 *      `provider_accounts.governance_tos_acknowledgments_json`. The
 *      operator UI surfaces the runtime ToS doc (per-adapter
 *      considerations from `provider-tos-considerations.md`) and
 *      records each acknowledgement as `{ ack_version,
 *      acknowledged_at, acknowledged_by }`. The runtime ToS doc has
 *      its own monotonic `currentRuntimeAckVersion` constant; bumping
 *      this constant causes any account whose latest ack is below the
 *      new version to enter a 7-day grace banner state until the
 *      operator re-acknowledges. Past the grace deadline the
 *      activation gate hard-blocks the adapter.
 *   2. Adapter activation gate (FR-219w). When
 *      `automation_class='forbidden'` the gate returns
 *      `{ active: false, reason: 'automation_class_forbidden' }`. The
 *      adapter's init() is expected to short-circuit on this shape and
 *      record a stable disable-reason code so log readers can audit.
 *   3. Re-prompt banner state. The operator UI consumes
 *      `evaluateBannerState(account, nowMs)` which returns one of
 *      `'none' | 'reack_required' | 'reack_grace_expired'`.
 *
 * Storage shape (`governance_tos_acknowledgments_json`): a JSON object
 *
 *   {
 *     "current_ack_version": 1,
 *     "acknowledged_at": "2026-05-02T00:00:00.000Z",
 *     "acknowledged_by": "operator@example.com",
 *     "history": [ { "ack_version", "acknowledged_at", "acknowledged_by" } ]
 *   }
 *
 * `history` is append-only; every re-acknowledgement records the prior
 * top-level snapshot so audit trails can replay the lifecycle.
 *
 * @see specs/008-resource-governance/spec.md FR-139, FR-146, FR-147, FR-219w, FR-219y
 * @see specs/008-resource-governance/tasks.md T121
 * @see Constitution Convention J — `src/lib/provider-account*.ts` is in
 *      `tsconfig.spec-strict.json` and the strict-scope ESLint override.
 */

import { z } from 'zod';
import {
  getProviderAccount,
  updateProviderAccount,
  type AutomationClass,
  type ProviderAccountRow,
} from '@/lib/provider-accounts';
import type Database from 'better-sqlite3';

/**
 * Monotonic ToS document version. Bump this when the runtime ToS
 * considerations doc materially changes; every account with a
 * `current_ack_version` below the new value enters the re-ack banner
 * state until re-acknowledged or the 7-day grace deadline elapses.
 *
 * Today: 1. The first SPEC-008-shipped runtime ToS doc lives at
 * `docs/observability/provider-tos-considerations.md` (T122).
 */
export const CURRENT_RUNTIME_ACK_VERSION = 1;

/** 7-day grace per FR-147 once a re-ack is required. */
export const REACK_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

const AcknowledgementSchema = z
  .object({
    ack_version: z.number().int().nonnegative(),
    acknowledged_at: z.string(),
    acknowledged_by: z.string().min(1),
  })
  .strict();

const AckRecordSchema = z
  .object({
    current_ack_version: z.number().int().nonnegative(),
    acknowledged_at: z.string(),
    acknowledged_by: z.string().min(1),
    history: z.array(AcknowledgementSchema),
  })
  .strict();

export type Acknowledgement = z.infer<typeof AcknowledgementSchema>;
export type AckRecord = z.infer<typeof AckRecordSchema>;

/**
 * Banner state surfaced to the operator UI.
 *   - `none` — current ack matches CURRENT_RUNTIME_ACK_VERSION; no banner.
 *   - `reack_required` — ack is stale but still inside the 7-day grace.
 *     UI shows a re-ack banner; adapter remains active.
 *   - `reack_grace_expired` — past the 7-day grace. Adapter activation
 *     hard-blocks until the operator re-acknowledges.
 *   - `never_acked` — no acknowledgement on file. Adapter cannot run.
 */
export type BannerState =
  | 'none'
  | 'reack_required'
  | 'reack_grace_expired'
  | 'never_acked';

/**
 * Adapter activation result returned by `evaluateAdapterActivation`. A
 * `false` `active` MUST short-circuit the adapter's init() with a
 * stable reason code. Reason codes are namespaced
 * `automation_class_*` and `tos_*` so log readers can categorise.
 */
export interface AdapterActivation {
  active: boolean;
  reason:
    | 'allowed'
    | 'restricted_pending_ack'
    | 'automation_class_forbidden'
    | 'tos_never_acked'
    | 'tos_grace_expired';
  banner_state: BannerState;
  /** ms-since-epoch at which the grace expires; undefined when not in grace. */
  grace_expires_at_ms?: number;
}

/**
 * Decode the JSON column into a typed AckRecord, or null when absent /
 * malformed (malformed JSON is treated as never-acked rather than
 * thrown — operator-supplied corruption must not crash the gate).
 */
export function decodeAckRecord(json: string | null): AckRecord | null {
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const result = AckRecordSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data;
}

/**
 * Compute the operator-facing banner state for an account given the
 * current runtime ack version. Pure function — no DB access.
 */
export function evaluateBannerState(
  account: ProviderAccountRow,
  nowMs: number = Date.now(),
  runtimeVersion: number = CURRENT_RUNTIME_ACK_VERSION,
): { banner: BannerState; grace_expires_at_ms?: number } {
  const record = decodeAckRecord(account.governance_tos_acknowledgments_json);
  if (record === null) return { banner: 'never_acked' };
  if (record.current_ack_version >= runtimeVersion) return { banner: 'none' };
  // Stale: compute grace deadline from the existing ack timestamp.
  const ackedMs = Date.parse(record.acknowledged_at);
  if (Number.isNaN(ackedMs)) {
    // Bad timestamp — treat as never-acked so the operator must re-ack
    // explicitly and the adapter does not silently activate.
    return { banner: 'never_acked' };
  }
  const graceExpiresMs = ackedMs + REACK_GRACE_MS;
  if (nowMs <= graceExpiresMs) {
    return { banner: 'reack_required', grace_expires_at_ms: graceExpiresMs };
  }
  return { banner: 'reack_grace_expired', grace_expires_at_ms: graceExpiresMs };
}

/**
 * Adapter activation gate (FR-219w). Combines the
 * `automation_class` hard-block with the ToS banner state to produce a
 * single deterministic activation decision. Adapters MUST consult this
 * gate during init() and disable themselves when `active === false`.
 *
 * Decision matrix:
 *   - automation_class='forbidden' → active=false, reason=automation_class_forbidden
 *   - never_acked → active=false, reason=tos_never_acked
 *   - reack_grace_expired → active=false, reason=tos_grace_expired
 *   - reack_required (within grace) → active=true, reason=restricted_pending_ack
 *   - none (acked + automation_class!=forbidden) → active=true, reason=allowed
 */
export function evaluateAdapterActivation(
  account: ProviderAccountRow,
  nowMs: number = Date.now(),
  runtimeVersion: number = CURRENT_RUNTIME_ACK_VERSION,
): AdapterActivation {
  // FR-219w — automation_class='forbidden' is the strongest gate. It
  // wins over ToS state because the operator has affirmatively
  // forbidden adapter activation regardless of the banner.
  if (account.automation_class === 'forbidden') {
    return {
      active: false,
      reason: 'automation_class_forbidden',
      banner_state: 'none',
    };
  }
  const { banner, grace_expires_at_ms } = evaluateBannerState(
    account,
    nowMs,
    runtimeVersion,
  );
  switch (banner) {
    case 'never_acked':
      return { active: false, reason: 'tos_never_acked', banner_state: banner };
    case 'reack_grace_expired': {
      const out: AdapterActivation = {
        active: false,
        reason: 'tos_grace_expired',
        banner_state: banner,
      };
      if (grace_expires_at_ms !== undefined) {
        out.grace_expires_at_ms = grace_expires_at_ms;
      }
      return out;
    }
    case 'reack_required': {
      const out: AdapterActivation = {
        active: true,
        reason: 'restricted_pending_ack',
        banner_state: banner,
      };
      if (grace_expires_at_ms !== undefined) {
        out.grace_expires_at_ms = grace_expires_at_ms;
      }
      return out;
    }
    case 'none':
      return { active: true, reason: 'allowed', banner_state: banner };
    default: {
      // exhaustiveness guard
      const _never: never = banner;
      void _never;
      return {
        active: false,
        reason: 'tos_never_acked',
        banner_state: 'never_acked',
      };
    }
  }
}

/**
 * Record an operator acknowledgement of the runtime ToS doc. Bumps
 * `current_ack_version` to the runtime version, stamps timestamp +
 * actor, and pushes the prior snapshot onto `history`. Uses the
 * `provider-accounts` optimistic-concurrency surface so concurrent
 * UI clicks can't double-write.
 */
export function recordAcknowledgement(
  db: Database.Database,
  args: {
    account_id: number;
    acknowledged_by: string;
    expectedVersion: number;
    runtimeVersion?: number;
    nowIso?: string;
  },
): ProviderAccountRow {
  const runtimeVersion = args.runtimeVersion ?? CURRENT_RUNTIME_ACK_VERSION;
  const nowIso = args.nowIso ?? new Date().toISOString();
  const account = getProviderAccount(db, args.account_id);
  if (account === null) {
    throw new Error(`recordAcknowledgement: account ${String(args.account_id)} not found`);
  }
  const prior = decodeAckRecord(account.governance_tos_acknowledgments_json);
  const history: Acknowledgement[] = prior?.history ?? [];
  if (prior !== null) {
    history.push({
      ack_version: prior.current_ack_version,
      acknowledged_at: prior.acknowledged_at,
      acknowledged_by: prior.acknowledged_by,
    });
  }
  const next: AckRecord = {
    current_ack_version: runtimeVersion,
    acknowledged_at: nowIso,
    acknowledged_by: args.acknowledged_by,
    history,
  };
  return updateProviderAccount(
    db,
    args.account_id,
    { governance_tos_acknowledgments_json: JSON.stringify(next) },
    args.expectedVersion,
  );
}

/**
 * Helper exported for testing / operator tooling: programmatically set
 * the `automation_class` column. Production callers go through the
 * Settings UI / REST endpoint; this helper exists so the SPEC-008
 * test fixtures can flip the column without re-validating the entire
 * Zod schema.
 */
export function setAutomationClass(
  db: Database.Database,
  account_id: number,
  automation_class: AutomationClass,
  expectedVersion: number,
): ProviderAccountRow {
  return updateProviderAccount(db, account_id, { automation_class }, expectedVersion);
}
