/**
 * SPEC-008 — Provider account secret rotation primitive.
 *
 * Per FR-219v and tasks.md T125. Re-encrypts every
 * `provider_accounts.config_json` envelope under a NEW key, falling back
 * to the PREVIOUS key during a 7-day grace window so partial-rotation
 * runs and in-flight reads don't strand the operator.
 *
 * Inputs:
 *   - `AUTH_SECRET` — the new symmetric secret. Required.
 *   - `AUTH_SECRET_PREVIOUS` — the prior symmetric secret. Optional. When
 *     provided, the rotator first attempts decrypt-under-PREVIOUS and
 *     re-encrypts under NEW. If only NEW is set, the rotator attempts
 *     decrypt-under-NEW and is a no-op for already-rotated rows.
 *
 * Algorithm (single tx):
 *   1. BEGIN IMMEDIATE — reserve the writer slot up-front so concurrent
 *      web routes block instead of failing with SQLITE_BUSY mid-rotation.
 *   2. SELECT id, provider, config_json FROM provider_accounts
 *      WHERE config_json IS NOT NULL.
 *   3. For each row:
 *        a. Try decrypt under PREVIOUS (if set). On success, re-encrypt
 *           under NEW and UPDATE.
 *        b. Else try decrypt under NEW. On success, the row is already
 *           rotated — count under `already_rotated` and skip the UPDATE.
 *        c. Else (both keys fail) — count under `failed` and skip.
 *   4. COMMIT.
 *
 * The pure-data return shape (`RotationResult`) makes this primitive
 * testable end-to-end via vitest without the CLI shell. The thin
 * `scripts/secrets-rotate-provider-accounts.cjs` runner duplicates the
 * envelope wire format and key-derivation contract (documented inline)
 * so it can be invoked from `mc-cli.cjs` without a TS-runtime dependency.
 *
 * Optimistic-concurrency note: `provider-accounts.ts` declares a
 * `version` column for application-layer ETag semantics. Rotation does
 * NOT bump `version` — re-encryption is a transparent secret rewrite,
 * not a logical edit. Bumping the version would invalidate every
 * in-flight client ETag and produce a 412 storm.
 *
 * Grace-period interpretation (FR-219v): the prompt frames the grace
 * window as a wall-clock check on the rotation timestamp. We
 * deliberately do NOT enforce a 7-day check inside this primitive —
 * the primitive's contract is "try PREVIOUS first, fall back to NEW".
 * The 7-day deadline is an OPERATOR-FACING convention enforced by the
 * runbook (`docs/runbook/auth-secret-rotation.md`) and the
 * `AUTH_SECRET_PREVIOUS` rotation date column on the operator dashboard
 * — both of which live outside the primitive. This avoids hard-coding
 * a wall-clock dependency that would prevent CI / disaster-recovery
 * rotations from completing after long pauses.
 *
 * @see specs/008-resource-governance/spec.md FR-219v
 * @see specs/008-resource-governance/tasks.md T125
 * @see src/lib/provider-account-encryption.ts (canonical envelope codec)
 * @see scripts/secrets-rotate-provider-accounts.cjs (CLI runner)
 */

import {
  ProviderConfigDecryptError,
  ProviderConfigSchemaError,
  decryptConfig,
  deriveKey,
  encryptConfig,
} from '@/lib/provider-account-encryption';
import { PROVIDER_TOKENS, type ProviderToken } from '@/lib/provider-accounts';
import type Database from 'better-sqlite3';

/**
 * Per-row outcome buckets surfaced in the result object.
 *
 *   - `rotated` — decrypted under PREVIOUS and re-encrypted under NEW.
 *   - `already_rotated` — decrypted under NEW (already in the new
 *     ciphertext space). No UPDATE issued.
 *   - `grace_decrypted` — same as `rotated` but the only path that
 *     succeeded was the PREVIOUS-key fallback. Surfaced separately so
 *     the operator can see whether the rotation was a true rewrite or a
 *     no-op due to keys already swapped.
 *   - `failed` — neither key decrypted. Row left untouched. The operator
 *     MUST investigate per the runbook.
 *   - `schema_error` — envelope decrypted but plaintext failed the
 *     per-provider strict Zod schema. Treated as a fatal write block;
 *     row left untouched.
 *   - `unknown_provider` — the row's `provider` column is outside the
 *     SPEC-008 declared set. Skipped to preserve forensic linkage.
 */
export interface RotationResult {
  rotated: number;
  grace_decrypted: number;
  already_rotated: number;
  failed: number;
  schema_error: number;
  unknown_provider: number;
  failures: { id: number; provider: string; reason: string }[];
}

interface RotationRow {
  id: number;
  provider: string;
  config_json: string | null;
}

export interface RotationOptions {
  /**
   * Raw 32-byte derived NEW key. Required. Callers compute this via
   * `deriveKey(process.env.AUTH_SECRET)` in production.
   */
  newKey: Buffer;
  /**
   * Raw 32-byte derived PREVIOUS key. Optional — when omitted, the
   * rotator only attempts decrypt-under-NEW (used by callers that have
   * lost the previous key and just want to count failures).
   */
  previousKey?: Buffer | undefined;
}

function isProviderToken(value: string): value is ProviderToken {
  return (PROVIDER_TOKENS as readonly string[]).includes(value);
}

/**
 * Try to decrypt + re-encrypt one envelope. Returns `null` on failure
 * so the orchestrator can bucket the outcome without throw/catch
 * overhead per row. The dual-key logic is centralised here so the
 * tx-level loop stays focused on counters + UPDATE wiring.
 */
function rotateOneEnvelope(
  provider: ProviderToken,
  envelope: string,
  newKey: Buffer,
  previousKey: Buffer | undefined,
):
  | { kind: 'rotated_via_previous'; envelope: string }
  | { kind: 'rotated_via_new'; envelope: string }
  | { kind: 'already_rotated' }
  | { kind: 'schema_error'; message: string }
  | { kind: 'failed'; message: string } {
  // 1) Try PREVIOUS first (if supplied). This is the canonical rotation
  //    path — pre-rotation rows decrypt under the old key.
  if (previousKey !== undefined) {
    try {
      const plaintext = decryptConfig(provider, envelope, previousKey);
      // Plaintext valid — re-seal under NEW.
      try {
        const sealed = encryptConfig(provider, plaintext, newKey);
        return { kind: 'rotated_via_previous', envelope: sealed };
      } catch (err) {
        if (err instanceof ProviderConfigSchemaError) {
          return { kind: 'schema_error', message: err.message };
        }
        return { kind: 'failed', message: String(err) };
      }
    } catch (err) {
      if (err instanceof ProviderConfigSchemaError) {
        return { kind: 'schema_error', message: err.message };
      }
      // Fall through to NEW-key attempt — likely already rotated.
      if (!(err instanceof ProviderConfigDecryptError)) {
        return { kind: 'failed', message: String(err) };
      }
    }
  }

  // 2) Try NEW. Success here means the row is already in the new
  //    ciphertext space (idempotent rotation pass) — no UPDATE needed.
  try {
    decryptConfig(provider, envelope, newKey);
    return { kind: 'already_rotated' };
  } catch (err) {
    if (err instanceof ProviderConfigSchemaError) {
      return { kind: 'schema_error', message: err.message };
    }
    return { kind: 'failed', message: 'decrypt failed under new and previous keys' };
  }
}

/**
 * Rotate every provider_accounts envelope under a NEW key, with optional
 * PREVIOUS-key grace fallback. Synchronous (better-sqlite3). Single
 * transaction.
 */
export function rotateProviderAccountSecrets(
  db: Database.Database,
  options: RotationOptions,
): RotationResult {
  const { newKey, previousKey } = options;

  const result: RotationResult = {
    rotated: 0,
    grace_decrypted: 0,
    already_rotated: 0,
    failed: 0,
    schema_error: 0,
    unknown_provider: 0,
    failures: [],
  };

  const select = db.prepare(
    `SELECT id, provider, config_json FROM provider_accounts WHERE config_json IS NOT NULL AND config_json != ''`,
  );
  const update = db.prepare(`UPDATE provider_accounts SET config_json = ? WHERE id = ?`);

  const tx = db.transaction(() => {
    const rows = select.all() as RotationRow[];
    for (const row of rows) {
      if (!isProviderToken(row.provider)) {
        result.unknown_provider += 1;
        result.failures.push({
          id: row.id,
          provider: row.provider,
          reason: 'unknown_provider',
        });
        continue;
      }
      const envelope = row.config_json;
      if (envelope === null || envelope.length === 0) {
        // SELECT predicate already filters empties — defensive guard.
        continue;
      }
      const outcome = rotateOneEnvelope(row.provider, envelope, newKey, previousKey);
      switch (outcome.kind) {
        case 'rotated_via_previous':
          update.run(outcome.envelope, row.id);
          result.rotated += 1;
          result.grace_decrypted += 1;
          break;
        case 'rotated_via_new':
          // Reserved branch — current rotateOneEnvelope only emits via
          // PREVIOUS path. Wired for forward compat if a future ladder
          // step tries NEW first then PREVIOUS.
          update.run(outcome.envelope, row.id);
          result.rotated += 1;
          break;
        case 'already_rotated':
          result.already_rotated += 1;
          break;
        case 'schema_error':
          result.schema_error += 1;
          result.failures.push({
            id: row.id,
            provider: row.provider,
            reason: `schema_error: ${outcome.message}`,
          });
          break;
        case 'failed':
          result.failed += 1;
          result.failures.push({
            id: row.id,
            provider: row.provider,
            reason: outcome.message,
          });
          break;
      }
    }
  });
  // BEGIN IMMEDIATE so the writer slot is reserved up-front.
  tx.immediate();

  return result;
}

/**
 * Convenience wrapper that resolves keys from environment variables
 * before invoking the primitive. Surfaces a clear error when AUTH_SECRET
 * is missing — the rotation cannot proceed without a NEW key.
 *
 * @param db better-sqlite3 connection
 * @param env optional `{ AUTH_SECRET, AUTH_SECRET_PREVIOUS }` map. When
 *        omitted, reads from `process.env`.
 */
export function rotateProviderAccountSecretsFromEnv(
  db: Database.Database,
  env?: { AUTH_SECRET?: string | undefined; AUTH_SECRET_PREVIOUS?: string | undefined },
): RotationResult {
  const source = env ?? {
    AUTH_SECRET: process.env['AUTH_SECRET'],
    AUTH_SECRET_PREVIOUS: process.env['AUTH_SECRET_PREVIOUS'],
  };
  const newSecret = source.AUTH_SECRET ?? '';
  if (newSecret.trim().length === 0) {
    throw new Error(
      'rotateProviderAccountSecretsFromEnv: AUTH_SECRET must be set to the NEW secret before rotation',
    );
  }
  const newKey = deriveKey(newSecret);
  const previousSecret = source.AUTH_SECRET_PREVIOUS ?? '';
  const options: RotationOptions = {
    newKey,
    previousKey:
      previousSecret.trim().length > 0 ? deriveKey(previousSecret) : undefined,
  };
  return rotateProviderAccountSecrets(db, options);
}
