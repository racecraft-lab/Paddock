/**
 * SPEC-008 — Provider account CRUD module.
 *
 * Per FR-131, FR-132, FR-133, FR-136, FR-145 and tasks.md T116. Single
 * source of truth for read/write access to the `provider_accounts` table
 * created in M64 and extended by M65l + M67. Soft-delete via the
 * `deactivated_at` column preserves historical event linkage on
 * `provider_entitlements`, `provider_subscriptions` JSON detector
 * artifacts, and downstream `canonical_usage_events` so re-attribution
 * remains possible (FR-145).
 *
 * Optimistic concurrency:
 *   - Every row carries a monotonic `version` column (M67). `update` and
 *     `softDelete` accept an `expectedVersion` that MUST match the
 *     current row; mismatch throws `ProviderAccountConflictError` so
 *     callers can re-fetch and retry. This mirrors SPEC-008's pattern in
 *     `resource-policies.ts` (FR-049 etag/version).
 *   - The DB write happens inside `db.transaction(fn).immediate(args)` so
 *     SQLite reserves the writer slot up-front and the read+UPDATE pair
 *     is atomic against a competing writer (M65l contention is
 *     bounded by the foreground busy_timeout).
 *
 * Validation:
 *   - `provider` is one of the SPEC-008 declared provider tokens
 *     (`anthropic`, `openai`, `copilot`, `ollama`, `openclaw`). Any other
 *     value is rejected at the application layer (M64 schema does NOT
 *     enforce a CHECK).
 *   - `automation_class` (M65l) is one of `allowed | restricted |
 *     forbidden`. Enforced here because SQLite cannot retro-add CHECK
 *     constraints to a live column without a table rebuild (M67 commit
 *     message documents the gap).
 *   - `account_label` is non-empty after trim and matches the M64
 *     `UNIQUE(provider, account_label)` constraint (write fails on
 *     collision and is surfaced as `ProviderAccountConflictError`).
 *
 * @see specs/008-resource-governance/spec.md FR-131, FR-132, FR-133, FR-136, FR-145
 * @see specs/008-resource-governance/tasks.md T116
 * @see Constitution Convention J — `src/lib/provider-account*.ts` is in
 *      `tsconfig.spec-strict.json` and the strict-scope ESLint override.
 */

import type Database from 'better-sqlite3';

/**
 * SPEC-008 declared provider tokens. Any account create/update is
 * rejected if `provider` is outside this set.
 */
export const PROVIDER_TOKENS = ['anthropic', 'openai', 'copilot', 'ollama', 'openclaw'] as const;
export type ProviderToken = (typeof PROVIDER_TOKENS)[number];

/**
 * SPEC-008 billing-mode tokens recorded on `provider_accounts.billing_mode`.
 *   - `subscription_capped` — operator pays a flat subscription; marginal
 *     per-call USD is $0 but token/request/session caps still enforce.
 *   - `pay_per_use` — pay-per-call (Anthropic API metered, OpenAI metered).
 *   - `unknown` — billing mode not yet detected (entitlement detector
 *     resolves on next refresh per FR-134a).
 */
export const BILLING_MODES = ['subscription_capped', 'pay_per_use', 'unknown'] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

/**
 * Adapter activation policy classes (FR-219w).
 *   - `allowed` — adapter activates without operator gating.
 *   - `restricted` — adapter activates only with explicit operator
 *     acknowledgement of the runtime ToS doc.
 *   - `forbidden` — adapter activation hard-blocks. The adapter init()
 *     returns disabled with a stable reason code.
 */
export const AUTOMATION_CLASSES = ['allowed', 'restricted', 'forbidden'] as const;
export type AutomationClass = (typeof AUTOMATION_CLASSES)[number];

/**
 * Wire-shape returned by all read APIs. Mirrors the DB columns post-M67
 * with field-name normalisation (`config_json` → `config_json` is left
 * as-is to match the M64 column name; downstream code parses JSON if
 * needed). Plaintext config NEVER round-trips through this module —
 * `config_json` is the sealed envelope produced by
 * `provider-account-encryption.ts`.
 */
export interface ProviderAccountRow {
  id: number;
  provider: ProviderToken;
  account_label: string;
  billing_mode: BillingMode | null;
  config_json: string | null;
  entitlements_json: string | null;
  tos_acknowledged_at: string | null;
  automation_class: AutomationClass | null;
  governance_tos_acknowledgments_json: string | null;
  version: number;
  deactivated_at: string | null;
  created_at: string;
}

/** Filters accepted by `listProviderAccounts`. All filters are optional. */
export interface ListFilters {
  provider?: ProviderToken;
  billing_mode?: BillingMode;
  /** Default `false` — soft-deleted rows are excluded. */
  include_deactivated?: boolean;
}

/** Input shape for `createProviderAccount`. */
export interface CreateProviderAccountInput {
  provider: ProviderToken;
  account_label: string;
  billing_mode?: BillingMode;
  /**
   * The encrypted envelope produced by
   * `provider-account-encryption.ts#encryptConfig(provider, plaintext)`.
   * MUST be a base64-encoded sealed payload. This module does NOT accept
   * plaintext config — the FR-144 invariant is that plaintext never hits
   * the DB.
   */
  config_envelope?: string;
  entitlements_json?: string;
  automation_class?: AutomationClass;
  governance_tos_acknowledgments_json?: string;
}

/** Input shape for `updateProviderAccount`. All fields optional (patch). */
export interface UpdateProviderAccountPatch {
  account_label?: string;
  billing_mode?: BillingMode;
  config_envelope?: string;
  entitlements_json?: string;
  tos_acknowledged_at?: string | null;
  automation_class?: AutomationClass;
  governance_tos_acknowledgments_json?: string | null;
}

/**
 * Optimistic-concurrency conflict. Caller MUST re-fetch and retry; this
 * is the only error shape the write APIs surface for in-flight conflict.
 */
export class ProviderAccountConflictError extends Error {
  readonly id: number;
  readonly expectedVersion: number;
  readonly actualVersion: number | null;
  constructor(id: number, expectedVersion: number, actualVersion: number | null) {
    super(
      `provider_accounts row ${String(id)} expected version=${String(expectedVersion)}, ` +
        `got ${actualVersion === null ? 'deleted' : String(actualVersion)}`,
    );
    this.name = 'ProviderAccountConflictError';
    this.id = id;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/**
 * Validation error surfaced when an input fails enum / shape checks.
 * Distinct from optimistic-concurrency conflict so callers can branch
 * on the error class (4xx for validation vs. 409 for conflict).
 */
export class ProviderAccountValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`provider_accounts.${field}: ${message}`);
    this.name = 'ProviderAccountValidationError';
    this.field = field;
  }
}

function assertProvider(value: unknown): asserts value is ProviderToken {
  if (typeof value !== 'string' || !PROVIDER_TOKENS.includes(value as ProviderToken)) {
    throw new ProviderAccountValidationError('provider', `must be one of ${PROVIDER_TOKENS.join(',')}`);
  }
}

function assertBillingMode(value: unknown): asserts value is BillingMode {
  if (typeof value !== 'string' || !BILLING_MODES.includes(value as BillingMode)) {
    throw new ProviderAccountValidationError(
      'billing_mode',
      `must be one of ${BILLING_MODES.join(',')}`,
    );
  }
}

function assertAutomationClass(value: unknown): asserts value is AutomationClass {
  if (typeof value !== 'string' || !AUTOMATION_CLASSES.includes(value as AutomationClass)) {
    throw new ProviderAccountValidationError(
      'automation_class',
      `must be one of ${AUTOMATION_CLASSES.join(',')}`,
    );
  }
}

function assertNonEmptyLabel(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ProviderAccountValidationError('account_label', 'must be a non-empty string');
  }
}

interface RawProviderAccountRow {
  id: number;
  provider: string;
  account_label: string;
  billing_mode: string | null;
  config_json: string | null;
  entitlements_json: string | null;
  tos_acknowledged_at: string | null;
  automation_class: string | null;
  governance_tos_acknowledgments_json: string | null;
  version: number | null;
  deactivated_at: string | null;
  created_at: string;
}

function rowFromDb(raw: RawProviderAccountRow): ProviderAccountRow {
  return {
    id: raw.id,
    // We trust DB-resident provider tokens — provider is always one of
    // PROVIDER_TOKENS post-application-layer enforcement. Rows seeded
    // before this module was added may legitimately fall outside, but
    // the contract is application-write-mediated.
    provider: raw.provider as ProviderToken,
    account_label: raw.account_label,
    billing_mode: raw.billing_mode as BillingMode | null,
    config_json: raw.config_json,
    entitlements_json: raw.entitlements_json,
    tos_acknowledged_at: raw.tos_acknowledged_at,
    automation_class: raw.automation_class as AutomationClass | null,
    governance_tos_acknowledgments_json: raw.governance_tos_acknowledgments_json,
    version: raw.version ?? 1,
    deactivated_at: raw.deactivated_at,
    created_at: raw.created_at,
  };
}

const SELECT_COLUMNS = `id, provider, account_label, billing_mode, config_json,
  entitlements_json, tos_acknowledged_at, automation_class,
  governance_tos_acknowledgments_json, version, deactivated_at, created_at`;

/**
 * Create a new provider account. Plaintext config MUST be sealed by
 * `encryptConfig(provider, ...)` before being passed as
 * `config_envelope`; this module rejects unsealed input on the
 * application contract.
 */
export function createProviderAccount(
  db: Database.Database,
  input: CreateProviderAccountInput,
): ProviderAccountRow {
  assertProvider(input.provider);
  assertNonEmptyLabel(input.account_label);
  if (input.billing_mode !== undefined) assertBillingMode(input.billing_mode);
  if (input.automation_class !== undefined) assertAutomationClass(input.automation_class);
  const billingMode: BillingMode = input.billing_mode ?? 'unknown';
  const automationClass: AutomationClass = input.automation_class ?? 'restricted';

  const inserted = db.transaction((tx: {
    provider: ProviderToken;
    account_label: string;
    billing_mode: BillingMode;
    config_envelope: string | null;
    entitlements_json: string | null;
    automation_class: AutomationClass;
    governance_tos_acknowledgments_json: string | null;
  }) => {
    const stmt = db.prepare(
      `INSERT INTO provider_accounts
         (provider, account_label, billing_mode, config_json,
          entitlements_json, automation_class,
          governance_tos_acknowledgments_json, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       RETURNING ${SELECT_COLUMNS}`,
    );
    const row = stmt.get(
      tx.provider,
      tx.account_label,
      tx.billing_mode,
      tx.config_envelope,
      tx.entitlements_json,
      tx.automation_class,
      tx.governance_tos_acknowledgments_json,
    ) as RawProviderAccountRow | undefined;
    if (row === undefined) {
      throw new Error('createProviderAccount: RETURNING produced no row');
    }
    return row;
  }).immediate({
    provider: input.provider,
    account_label: input.account_label.trim(),
    billing_mode: billingMode,
    config_envelope: input.config_envelope ?? null,
    entitlements_json: input.entitlements_json ?? null,
    automation_class: automationClass,
    governance_tos_acknowledgments_json: input.governance_tos_acknowledgments_json ?? null,
  });
  return rowFromDb(inserted);
}

/** Read a single account by id. Returns null when the row is absent. */
export function getProviderAccount(
  db: Database.Database,
  id: number,
): ProviderAccountRow | null {
  const raw = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM provider_accounts WHERE id = ?`)
    .get(id) as RawProviderAccountRow | undefined;
  return raw === undefined ? null : rowFromDb(raw);
}

/**
 * List accounts. Default excludes soft-deleted rows; pass
 * `include_deactivated: true` to include them.
 */
export function listProviderAccounts(
  db: Database.Database,
  filters: ListFilters = {},
): ProviderAccountRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.include_deactivated !== true) {
    where.push('deactivated_at IS NULL');
    where.push('deleted_at IS NULL');
  }
  if (filters.provider !== undefined) {
    assertProvider(filters.provider);
    where.push('provider = ?');
    params.push(filters.provider);
  }
  if (filters.billing_mode !== undefined) {
    assertBillingMode(filters.billing_mode);
    where.push('billing_mode = ?');
    params.push(filters.billing_mode);
  }
  const whereClause = where.length === 0 ? '' : ` WHERE ${where.join(' AND ')}`;
  const rows = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM provider_accounts${whereClause} ORDER BY id ASC`)
    .all(...params) as RawProviderAccountRow[];
  return rows.map(rowFromDb);
}

/**
 * Optimistic-concurrency update. `expectedVersion` MUST match the
 * row's current `version`; mismatch throws
 * `ProviderAccountConflictError`. On success, `version` is bumped by 1.
 */
export function updateProviderAccount(
  db: Database.Database,
  id: number,
  patch: UpdateProviderAccountPatch,
  expectedVersion: number,
): ProviderAccountRow {
  if (patch.billing_mode !== undefined) assertBillingMode(patch.billing_mode);
  if (patch.automation_class !== undefined) assertAutomationClass(patch.automation_class);
  if (patch.account_label !== undefined) assertNonEmptyLabel(patch.account_label);

  const updated = db.transaction((tx: {
    id: number;
    expectedVersion: number;
    patch: UpdateProviderAccountPatch;
  }) => {
    const current = db
      .prepare(`SELECT version FROM provider_accounts WHERE id = ?`)
      .get(tx.id) as { version: number | null } | undefined;
    if (current === undefined) {
      throw new ProviderAccountConflictError(tx.id, tx.expectedVersion, null);
    }
    const actualVersion = current.version ?? 1;
    if (actualVersion !== tx.expectedVersion) {
      throw new ProviderAccountConflictError(tx.id, tx.expectedVersion, actualVersion);
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    if (tx.patch.account_label !== undefined) {
      sets.push('account_label = ?');
      params.push(tx.patch.account_label.trim());
    }
    if (tx.patch.billing_mode !== undefined) {
      sets.push('billing_mode = ?');
      params.push(tx.patch.billing_mode);
    }
    if (tx.patch.config_envelope !== undefined) {
      sets.push('config_json = ?');
      params.push(tx.patch.config_envelope);
    }
    if (tx.patch.entitlements_json !== undefined) {
      sets.push('entitlements_json = ?');
      params.push(tx.patch.entitlements_json);
    }
    if (tx.patch.tos_acknowledged_at !== undefined) {
      sets.push('tos_acknowledged_at = ?');
      params.push(tx.patch.tos_acknowledged_at);
    }
    if (tx.patch.automation_class !== undefined) {
      sets.push('automation_class = ?');
      params.push(tx.patch.automation_class);
    }
    if (tx.patch.governance_tos_acknowledgments_json !== undefined) {
      sets.push('governance_tos_acknowledgments_json = ?');
      params.push(tx.patch.governance_tos_acknowledgments_json);
    }
    sets.push('version = version + 1');
    const sql = `UPDATE provider_accounts SET ${sets.join(', ')}
                 WHERE id = ? AND version = ?
                 RETURNING ${SELECT_COLUMNS}`;
    params.push(tx.id, tx.expectedVersion);
    const row = db.prepare(sql).get(...params) as RawProviderAccountRow | undefined;
    if (row === undefined) {
      // Race lost between the SELECT and the UPDATE despite the immediate
      // tx — re-read and surface the actual version.
      const reread = db
        .prepare(`SELECT version FROM provider_accounts WHERE id = ?`)
        .get(tx.id) as { version: number | null } | undefined;
      throw new ProviderAccountConflictError(
        tx.id,
        tx.expectedVersion,
        reread === undefined ? null : reread.version ?? 1,
      );
    }
    return row;
  }).immediate({ id, expectedVersion, patch });
  return rowFromDb(updated);
}

/**
 * Soft-delete by stamping `deactivated_at`. Historical event linkage on
 * `provider_entitlements`, `canonical_usage_events`, and downstream
 * audit artifacts is preserved (the row is NOT removed). Throws
 * `ProviderAccountConflictError` if `expectedVersion` mismatches or the
 * row is already deactivated. (FR-145)
 */
export function softDeleteProviderAccount(
  db: Database.Database,
  id: number,
  expectedVersion: number,
): ProviderAccountRow {
  const updated = db.transaction((tx: {
    id: number;
    expectedVersion: number;
  }) => {
    const current = db
      .prepare(`SELECT version, deactivated_at FROM provider_accounts WHERE id = ?`)
      .get(tx.id) as { version: number | null; deactivated_at: string | null } | undefined;
    if (current === undefined) {
      throw new ProviderAccountConflictError(tx.id, tx.expectedVersion, null);
    }
    const actualVersion = current.version ?? 1;
    if (actualVersion !== tx.expectedVersion) {
      throw new ProviderAccountConflictError(tx.id, tx.expectedVersion, actualVersion);
    }
    if (current.deactivated_at !== null) {
      // Idempotent — re-deactivation is a no-op but version-stable so
      // the next caller's expectedVersion stays predictable.
      const row = db
        .prepare(`SELECT ${SELECT_COLUMNS} FROM provider_accounts WHERE id = ?`)
        .get(tx.id) as RawProviderAccountRow;
      return row;
    }
    const sql = `UPDATE provider_accounts
                 SET deactivated_at = CURRENT_TIMESTAMP, version = version + 1
                 WHERE id = ? AND version = ?
                 RETURNING ${SELECT_COLUMNS}`;
    const row = db.prepare(sql).get(tx.id, tx.expectedVersion) as RawProviderAccountRow | undefined;
    if (row === undefined) {
      const reread = db
        .prepare(`SELECT version FROM provider_accounts WHERE id = ?`)
        .get(tx.id) as { version: number | null } | undefined;
      throw new ProviderAccountConflictError(
        tx.id,
        tx.expectedVersion,
        reread === undefined ? null : reread.version ?? 1,
      );
    }
    return row;
  }).immediate({ id, expectedVersion });
  return rowFromDb(updated);
}
