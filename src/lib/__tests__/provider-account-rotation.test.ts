/**
 * SPEC-008 — Provider account secret rotation tests.
 *
 * Per FR-219v and tasks.md T125. Asserts the rotation primitive:
 *
 *   1. Rotates every pre-rotation envelope under the NEW key.
 *   2. Tolerates already-rotated rows (idempotent re-runs).
 *   3. Counts grace_decrypted separately from rotated when the only
 *      successful key path was the PREVIOUS-key fallback.
 *   4. Surfaces failed rows without aborting the rest of the rotation.
 *   5. Runs in one tx — partial failure leaves DB consistent.
 *
 * Test isolation: `process.env.AUTH_SECRET` is restored in afterEach so
 * the encryption module's deriveKey() default-path is deterministic.
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptConfig,
  deriveKey,
  encryptConfig,
} from '@/lib/provider-account-encryption';
import { runMigrations } from '@/lib/migrations';
import {
  rotateProviderAccountSecrets,
  rotateProviderAccountSecretsFromEnv,
} from '@/lib/provider-account-rotation';

const PRIMARY_SECRET = 'rotation-test-primary-do-not-use-aaaaaaaaaaaaaaa';
const ROTATED_SECRET = 'rotation-test-rotated-do-not-use-bbbbbbbbbbbbbbb';
const FUTURE_SECRET = 'rotation-test-future-do-not-use-cccccccccccccccc';

let priorAuthSecret: string | undefined;
let priorAuthSecretPrevious: string | undefined;

beforeEach(() => {
  priorAuthSecret = process.env['AUTH_SECRET'];
  priorAuthSecretPrevious = process.env['AUTH_SECRET_PREVIOUS'];
  process.env['AUTH_SECRET'] = PRIMARY_SECRET;
  delete process.env['AUTH_SECRET_PREVIOUS'];
});

afterEach(() => {
  if (priorAuthSecret === undefined) delete process.env['AUTH_SECRET'];
  else process.env['AUTH_SECRET'] = priorAuthSecret;
  if (priorAuthSecretPrevious === undefined) delete process.env['AUTH_SECRET_PREVIOUS'];
  else process.env['AUTH_SECRET_PREVIOUS'] = priorAuthSecretPrevious;
});

interface SeedRow {
  provider: string;
  account_label: string;
  envelope: string | null;
}

function seedAccounts(db: Database.Database, rows: SeedRow[]): number[] {
  const insert = db.prepare(
    `INSERT INTO provider_accounts (provider, account_label, billing_mode, config_json) VALUES (?, ?, 'unknown', ?)`,
  );
  const ids: number[] = [];
  for (const r of rows) {
    const result = insert.run(r.provider, r.account_label, r.envelope);
    ids.push(Number(result.lastInsertRowid));
  }
  return ids;
}

function newDb(): Database.Database {
  const db = new Database(':memory:');
  // production parity for write-tx semantics
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  runMigrations(db);
  return db;
}

describe('rotateProviderAccountSecrets — happy path', () => {
  it('rotates every pre-rotation envelope under the NEW key', () => {
    const db = newDb();
    const previousKey = deriveKey(PRIMARY_SECRET);
    const newKey = deriveKey(ROTATED_SECRET);

    // Seed three accounts encrypted under PRIMARY_SECRET.
    const env1 = encryptConfig(
      'anthropic',
      { _encrypted: { api_key: 'sk-ant-api03-account-1' } },
      previousKey,
    );
    const env2 = encryptConfig(
      'openai',
      { _encrypted: { api_key: 'sk-account-2' } },
      previousKey,
    );
    const env3 = encryptConfig(
      'copilot',
      { _encrypted: { session_token: 'ghu_session_3' } },
      previousKey,
    );
    const ids = seedAccounts(db, [
      { provider: 'anthropic', account_label: 'a', envelope: env1 },
      { provider: 'openai', account_label: 'b', envelope: env2 },
      { provider: 'copilot', account_label: 'c', envelope: env3 },
    ]);

    const result = rotateProviderAccountSecrets(db, { newKey, previousKey });

    expect(result.rotated).toBe(3);
    expect(result.grace_decrypted).toBe(3);
    expect(result.already_rotated).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.failures).toEqual([]);

    // Each row should now decrypt under newKey, not previousKey.
    for (const id of ids) {
      const row = db
        .prepare(`SELECT provider, config_json FROM provider_accounts WHERE id = ?`)
        .get(id) as { provider: string; config_json: string };
      expect(row.config_json).toBeTypeOf('string');
      // Round-trip under NEW succeeds.
      expect(() =>
        decryptConfig(row.provider as 'anthropic', row.config_json, newKey),
      ).not.toThrow();
    }
  });

  it('is idempotent — running rotation a second time is a no-op (already_rotated)', () => {
    const db = newDb();
    const previousKey = deriveKey(PRIMARY_SECRET);
    const newKey = deriveKey(ROTATED_SECRET);

    const envelope = encryptConfig(
      'anthropic',
      { _encrypted: { api_key: 'sk-ant-api03-rerun' } },
      previousKey,
    );
    seedAccounts(db, [{ provider: 'anthropic', account_label: 'a', envelope }]);

    const first = rotateProviderAccountSecrets(db, { newKey, previousKey });
    expect(first.rotated).toBe(1);
    expect(first.already_rotated).toBe(0);

    const second = rotateProviderAccountSecrets(db, { newKey, previousKey });
    expect(second.rotated).toBe(0);
    expect(second.already_rotated).toBe(1);
    expect(second.failed).toBe(0);
  });

  it('handles a mixed batch (already-rotated + pre-rotation in one pass)', () => {
    const db = newDb();
    const previousKey = deriveKey(PRIMARY_SECRET);
    const newKey = deriveKey(ROTATED_SECRET);

    const oldEnv = encryptConfig(
      'anthropic',
      { _encrypted: { api_key: 'sk-ant-api03-old' } },
      previousKey,
    );
    const newEnv = encryptConfig(
      'anthropic',
      { _encrypted: { api_key: 'sk-ant-api03-new' } },
      newKey,
    );
    seedAccounts(db, [
      { provider: 'anthropic', account_label: 'pre-rotation', envelope: oldEnv },
      { provider: 'anthropic', account_label: 'already-rotated', envelope: newEnv },
    ]);

    const result = rotateProviderAccountSecrets(db, { newKey, previousKey });
    expect(result.rotated).toBe(1);
    expect(result.already_rotated).toBe(1);
    expect(result.failed).toBe(0);
  });
});

describe('rotateProviderAccountSecrets — grace fallback (FR-219v)', () => {
  it('counts grace_decrypted equal to rotated when previous key was needed', () => {
    const db = newDb();
    const previousKey = deriveKey(PRIMARY_SECRET);
    const newKey = deriveKey(ROTATED_SECRET);

    const envelope = encryptConfig(
      'openai',
      { _encrypted: { api_key: 'sk-grace-test' } },
      previousKey,
    );
    seedAccounts(db, [{ provider: 'openai', account_label: 'g', envelope }]);

    const result = rotateProviderAccountSecrets(db, { newKey, previousKey });
    expect(result.rotated).toBe(1);
    // grace_decrypted is the count of rows that ONLY succeeded via PREVIOUS.
    // Per the primitive's algorithm every rotated row goes through the
    // PREVIOUS path, so grace_decrypted == rotated for the happy case.
    expect(result.grace_decrypted).toBe(1);
  });

  it('reports failed when neither key decrypts (corrupted envelope)', () => {
    const db = newDb();
    const previousKey = deriveKey(PRIMARY_SECRET);
    const newKey = deriveKey(ROTATED_SECRET);

    // Envelope sealed under a third secret unknown to either key.
    const orphanKey = deriveKey(FUTURE_SECRET);
    const envelope = encryptConfig(
      'anthropic',
      { _encrypted: { api_key: 'sk-orphan' } },
      orphanKey,
    );
    seedAccounts(db, [
      { provider: 'anthropic', account_label: 'orphan', envelope },
    ]);

    const result = rotateProviderAccountSecrets(db, { newKey, previousKey });
    expect(result.rotated).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.provider).toBe('anthropic');

    // Row was NOT updated.
    const after = db
      .prepare(`SELECT config_json FROM provider_accounts LIMIT 1`)
      .get() as { config_json: string };
    expect(after.config_json).toBe(envelope);
  });
});

describe('rotateProviderAccountSecrets — edge cases', () => {
  it('skips rows with NULL config_json', () => {
    const db = newDb();
    const previousKey = deriveKey(PRIMARY_SECRET);
    const newKey = deriveKey(ROTATED_SECRET);

    seedAccounts(db, [
      { provider: 'ollama', account_label: 'no-config', envelope: null },
    ]);

    const result = rotateProviderAccountSecrets(db, { newKey, previousKey });
    expect(result.rotated).toBe(0);
    expect(result.already_rotated).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('counts unknown_provider rows separately and does not abort batch', () => {
    const db = newDb();
    const previousKey = deriveKey(PRIMARY_SECRET);
    const newKey = deriveKey(ROTATED_SECRET);

    // Bypass application-layer enum guard by inserting via raw SQL.
    db.prepare(
      `INSERT INTO provider_accounts (provider, account_label, billing_mode, config_json) VALUES ('legacy_provider_x', 'orphan', 'unknown', 'AQ==')`,
    ).run();
    const goodEnv = encryptConfig(
      'anthropic',
      { _encrypted: { api_key: 'sk-good' } },
      previousKey,
    );
    seedAccounts(db, [{ provider: 'anthropic', account_label: 'g', envelope: goodEnv }]);

    const result = rotateProviderAccountSecrets(db, { newKey, previousKey });
    expect(result.unknown_provider).toBe(1);
    expect(result.rotated).toBe(1);
    expect(result.failures.some((f) => f.reason === 'unknown_provider')).toBe(true);
  });

  it('runs without a previous key — no-op for already-rotated rows', () => {
    const db = newDb();
    const newKey = deriveKey(ROTATED_SECRET);
    const newEnv = encryptConfig(
      'openclaw',
      { gateway_url: 'https://gw.example.com', _encrypted: { gateway_token: 'tok' } },
      newKey,
    );
    seedAccounts(db, [{ provider: 'openclaw', account_label: 'g', envelope: newEnv }]);

    const result = rotateProviderAccountSecrets(db, { newKey });
    expect(result.rotated).toBe(0);
    expect(result.already_rotated).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('runs without a previous key — counts pre-rotation rows as failed', () => {
    const db = newDb();
    const previousKey = deriveKey(PRIMARY_SECRET);
    const newKey = deriveKey(ROTATED_SECRET);

    const oldEnv = encryptConfig(
      'anthropic',
      { _encrypted: { api_key: 'sk-pre-rotation' } },
      previousKey,
    );
    seedAccounts(db, [{ provider: 'anthropic', account_label: 'pre', envelope: oldEnv }]);

    // No previousKey supplied — rotator can only attempt NEW.
    const result = rotateProviderAccountSecrets(db, { newKey });
    expect(result.rotated).toBe(0);
    expect(result.already_rotated).toBe(0);
    expect(result.failed).toBe(1);
  });
});

describe('rotateProviderAccountSecretsFromEnv', () => {
  it('reads keys from process.env by default', () => {
    const db = newDb();
    const previousKey = deriveKey(PRIMARY_SECRET);
    const envelope = encryptConfig(
      'anthropic',
      { _encrypted: { api_key: 'sk-env-test' } },
      previousKey,
    );
    seedAccounts(db, [{ provider: 'anthropic', account_label: 'env', envelope }]);

    process.env['AUTH_SECRET'] = ROTATED_SECRET;
    process.env['AUTH_SECRET_PREVIOUS'] = PRIMARY_SECRET;

    const result = rotateProviderAccountSecretsFromEnv(db);
    expect(result.rotated).toBe(1);
  });

  it('throws when AUTH_SECRET is not set', () => {
    const db = newDb();
    delete process.env['AUTH_SECRET'];
    expect(() => rotateProviderAccountSecretsFromEnv(db)).toThrow(/AUTH_SECRET must be set/);
  });

  it('accepts an explicit env override (test injection)', () => {
    const db = newDb();
    const previousKey = deriveKey(PRIMARY_SECRET);
    const envelope = encryptConfig(
      'openai',
      { _encrypted: { api_key: 'sk-injected' } },
      previousKey,
    );
    seedAccounts(db, [{ provider: 'openai', account_label: 'inj', envelope }]);

    const result = rotateProviderAccountSecretsFromEnv(db, {
      AUTH_SECRET: ROTATED_SECRET,
      AUTH_SECRET_PREVIOUS: PRIMARY_SECRET,
    });
    expect(result.rotated).toBe(1);
  });
});
