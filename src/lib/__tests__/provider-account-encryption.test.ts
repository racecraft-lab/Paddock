/**
 * SPEC-008 — Provider account encryption round-trip + plaintext-never-persists tests.
 *
 * Per FR-144, FR-149 and tasks.md T118 (T-RED). The contract is:
 *
 *   - Plaintext config NEVER reaches `provider_accounts.config_json`. The
 *     write surface (`createProviderAccount`, `updateProviderAccount`)
 *     accepts only sealed envelopes; the encryption module is the only
 *     place where the plaintext lives in-process.
 *   - Round-trip MUST be lossless: decryptConfig(encryptConfig(p, c)) ==
 *     c (excluding the ciphertext nonce, which is fresh per encryption).
 *   - Decrypt under a wrong key MUST throw `ProviderConfigDecryptError`
 *     and increment the `decrypt_failure_total` self-obs counter.
 *
 * Test isolation:
 *   - `resetMetrics()` runs before each test so counter assertions are
 *     deterministic across the suite.
 *   - Each test sets `process.env.AUTH_SECRET` explicitly (and restores
 *     it in afterEach) so the KDF derivation is deterministic and
 *     independent of the host's secrets.
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ProviderConfigDecryptError,
  ProviderConfigSchemaError,
  decryptConfig,
  deriveKey,
  encryptConfig,
  rotateEnvelope,
} from '@/lib/provider-account-encryption';
import { createProviderAccount, getProviderAccount } from '@/lib/provider-accounts';
import { runMigrations } from '@/lib/migrations';
import { getMetricsSnapshot, resetMetrics } from '@/lib/observability/self-obs-metrics';

const PRIMARY_SECRET = 'test-secret-primary-do-not-use-in-prod-aaaaaaaaaaaa';
const ROTATED_SECRET = 'test-secret-rotated-do-not-use-in-prod-bbbbbbbbbbbb';

let priorAuthSecret: string | undefined;

beforeEach(() => {
  priorAuthSecret = process.env['AUTH_SECRET'];
  process.env['AUTH_SECRET'] = PRIMARY_SECRET;
  resetMetrics();
});

afterEach(() => {
  if (priorAuthSecret === undefined) delete process.env['AUTH_SECRET'];
  else process.env['AUTH_SECRET'] = priorAuthSecret;
});

describe('provider-account-encryption round-trip', () => {
  it('seals and unseals an anthropic config losslessly', () => {
    const original = {
      base_url: 'https://api.anthropic.com',
      _encrypted: { api_key: 'sk-ant-api03-FAKE-FAKE-FAKE-FAKE-FAKE-FAKE-FAKE' },
    };
    const envelope = encryptConfig('anthropic', original);
    expect(envelope).not.toContain('sk-ant-api03');
    const decoded = decryptConfig('anthropic', envelope);
    expect(decoded).toEqual(original);
  });

  it('seals and unseals openai config with org_id', () => {
    const original = {
      project: 'proj_abc123',
      _encrypted: { api_key: 'sk-FAKE-FAKE-FAKE-FAKE', org_id: 'org_FAKE' },
    };
    const envelope = encryptConfig('openai', original);
    expect(envelope).not.toContain('sk-FAKE');
    expect(envelope).not.toContain('org_FAKE');
    const decoded = decryptConfig('openai', envelope);
    expect(decoded).toEqual(original);
  });

  it('seals and unseals copilot config', () => {
    const original = {
      _encrypted: {
        session_token: 'ghu_FAKE_session_token',
        github_oauth_token: 'gho_FAKE_oauth_token',
      },
    };
    const envelope = encryptConfig('copilot', original);
    expect(envelope).not.toContain('ghu_FAKE');
    expect(envelope).not.toContain('gho_FAKE');
    const decoded = decryptConfig('copilot', envelope);
    expect(decoded).toEqual(original);
  });

  it('seals and unseals openclaw config', () => {
    const original = {
      gateway_url: 'https://openclaw.example.com',
      _encrypted: { gateway_token: 'oc_FAKE_gateway_token' },
    };
    const envelope = encryptConfig('openclaw', original);
    expect(envelope).not.toContain('oc_FAKE');
    const decoded = decryptConfig('openclaw', envelope);
    expect(decoded).toEqual(original);
  });

  it('produces a fresh nonce per encryption (envelopes differ)', () => {
    const original = {
      _encrypted: { api_key: 'sk-ant-api03-FAKE-FAKE-FAKE-FAKE-FAKE-FAKE' },
    };
    const e1 = encryptConfig('anthropic', original);
    const e2 = encryptConfig('anthropic', original);
    expect(e1).not.toEqual(e2);
    expect(decryptConfig('anthropic', e1)).toEqual(decryptConfig('anthropic', e2));
  });
});

describe('provider-account-encryption strict schemas', () => {
  it('rejects unknown top-level fields (FR-219u strict mode)', () => {
    const bad = {
      base_url: 'https://api.anthropic.com',
      _encrypted: { api_key: 'sk-ant-api03-FAKE' },
      extra_unknown_field: 'should not pass',
    };
    expect(() => encryptConfig('anthropic', bad)).toThrow(ProviderConfigSchemaError);
  });

  it('rejects unknown _encrypted.* fields', () => {
    const bad = {
      _encrypted: {
        api_key: 'sk-ant-api03-FAKE',
        unexpected_field: 'should not pass',
      },
    };
    expect(() => encryptConfig('anthropic', bad)).toThrow(ProviderConfigSchemaError);
  });

  it('rejects an empty _encrypted.api_key', () => {
    const bad = { _encrypted: { api_key: '' } };
    expect(() => encryptConfig('anthropic', bad)).toThrow(ProviderConfigSchemaError);
  });
});

describe('provider-account-encryption decrypt_failure metric (FR-149)', () => {
  it('increments decrypt_failure_total on bad-key decode', () => {
    const original = { _encrypted: { api_key: 'sk-ant-api03-FAKE' } };
    const envelope = encryptConfig('anthropic', original);
    // Re-derive key under a different secret — this is the bad-key path.
    const wrongKey = deriveKey(ROTATED_SECRET);
    let thrown: unknown = null;
    try {
      decryptConfig('anthropic', envelope, wrongKey);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ProviderConfigDecryptError);
    expect((thrown as ProviderConfigDecryptError).reason).toBe('bad_key');
    const snap = getMetricsSnapshot();
    const failure = snap.counters.find(
      (c) =>
        c.name === 'decrypt_failure_total' &&
        c.labels['provider'] === 'anthropic' &&
        c.labels['cause'] === 'bad_key',
    );
    expect(failure?.value).toBe(1);
  });

  it('increments decrypt_failure_total on truncated envelope', () => {
    let thrown: unknown = null;
    try {
      decryptConfig('anthropic', 'AQ==');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ProviderConfigDecryptError);
    expect((thrown as ProviderConfigDecryptError).reason).toBe('truncated');
    const snap = getMetricsSnapshot();
    const failure = snap.counters.find(
      (c) =>
        c.name === 'decrypt_failure_total' && c.labels['cause'] === 'truncated',
    );
    expect(failure?.value).toBe(1);
  });
});

describe('rotateEnvelope (T125 support)', () => {
  it('re-encrypts an envelope under a new key', () => {
    const original = { _encrypted: { api_key: 'sk-ant-api03-FAKE' } };
    const oldEnvelope = encryptConfig('anthropic', original);
    const oldKey = deriveKey(PRIMARY_SECRET);
    const newKey = deriveKey(ROTATED_SECRET);
    const newEnvelope = rotateEnvelope('anthropic', oldEnvelope, oldKey, newKey);
    // New envelope decodes under newKey but not oldKey
    expect(decryptConfig('anthropic', newEnvelope, newKey)).toEqual(original);
    expect(() => decryptConfig('anthropic', newEnvelope, oldKey)).toThrow(
      ProviderConfigDecryptError,
    );
  });
});

describe('plaintext-never-persists invariant (FR-144)', () => {
  it('createProviderAccount stores only the sealed envelope', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const original = {
      base_url: 'https://api.anthropic.com',
      _encrypted: { api_key: 'sk-ant-api03-FAKE-PLAINTEXT-MARKER' },
    };
    const envelope = encryptConfig('anthropic', original);
    const created = createProviderAccount(db, {
      provider: 'anthropic',
      account_label: 'primary',
      config_envelope: envelope,
    });
    // Read raw column directly — bypasses the rowFromDb mapper to assert
    // the on-disk bytes never contain the plaintext API key.
    const raw = db
      .prepare('SELECT config_json FROM provider_accounts WHERE id = ?')
      .get(created.id) as { config_json: string | null };
    expect(raw.config_json).toBe(envelope);
    expect(raw.config_json).not.toContain('FAKE-PLAINTEXT-MARKER');
    // And re-decrypt round-trip works for downstream readers.
    expect(getProviderAccount(db, created.id)?.config_json).toBe(envelope);
    expect(decryptConfig('anthropic', envelope)).toEqual(original);
    db.close();
  });
});
