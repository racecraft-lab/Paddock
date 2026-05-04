#!/usr/bin/env node
/*
 * SPEC-008 — `pnpm mc secrets rotate --provider-accounts` runner.
 *
 * Per FR-219v and tasks.md T125. Re-encrypts every
 * `provider_accounts.config_json` envelope under the NEW
 * `AUTH_SECRET`, falling back to `AUTH_SECRET_PREVIOUS` on decrypt
 * failure (the 7-day grace window — see runbook
 * docs/runbook/auth-secret-rotation.md for the operator-facing time
 * bound).
 *
 * Why a CJS runner instead of importing src/lib/provider-account-rotation.ts:
 *   - mc-cli.cjs is a thin REST proxy that runs under Node CommonJS.
 *     The TS rotation primitive uses TypeScript-only path aliases
 *     (`@/lib/...`) and named ES exports that aren't directly
 *     consumable from CJS without `tsx` (not in deps), `ts-node`
 *     (not in deps), or a build step.
 *   - The envelope wire format is intentionally trivial and stable
 *     (1-byte version || 12-byte iv || 16-byte tag || N-byte
 *     ciphertext, base64-encoded). It is documented in
 *     src/lib/provider-account-encryption.ts and is the contract this
 *     runner duplicates verbatim. Any change to the envelope codec
 *     MUST update both files in lockstep — the TS test suite at
 *     src/lib/__tests__/provider-account-rotation.test.ts is the
 *     ground-truth suite for the rotation algorithm.
 *
 * Inputs (env):
 *   - AUTH_SECRET — required, the NEW symmetric secret.
 *   - AUTH_SECRET_PREVIOUS — optional, the prior secret. Pre-rotation
 *     rows decrypt under this key; rows without a fallback path are
 *     reported as `failed` so the operator can investigate per the
 *     runbook.
 *   - MISSION_CONTROL_DATA_DIR — optional, defaults to `.data/`.
 *   - MISSION_CONTROL_DB_PATH — optional, overrides default DB path.
 *
 * Output: a JSON summary on stdout describing
 *   { rotated, grace_decrypted, already_rotated, failed,
 *     schema_error, unknown_provider, failures: [...] }.
 * Exit code 0 when failed === 0 && schema_error === 0; 1 otherwise.
 *
 * @see specs/008-resource-governance/spec.md FR-219v
 * @see specs/008-resource-governance/tasks.md T125
 * @see src/lib/provider-account-encryption.ts (canonical envelope codec)
 * @see src/lib/provider-account-rotation.ts (TS primitive + tests)
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createCipheriv, createDecipheriv, randomBytes, scryptSync } = require('node:crypto');
const Database = require('better-sqlite3');

// Envelope wire format constants — keep in lockstep with
// src/lib/provider-account-encryption.ts.
const ENVELOPE_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const KDF_SALT = 'spec-008.provider-accounts';
const SCRYPT_COST = 16384;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const PROVIDER_TOKENS = ['anthropic', 'openai', 'copilot', 'ollama', 'openclaw'];

function deriveKey(secret) {
  const trimmed = (secret || '').trim();
  if (trimmed.length === 0) {
    throw new Error(
      'secrets-rotate: AUTH_SECRET must be set to encrypt or decrypt provider configs',
    );
  }
  return scryptSync(trimmed, KDF_SALT, KEY_LENGTH, {
    N: SCRYPT_COST,
    maxmem: SCRYPT_MAXMEM,
  });
}

function unpackEnvelope(b64) {
  const raw = Buffer.from(b64, 'base64');
  if (raw.length < 1 + IV_LENGTH + TAG_LENGTH + 1) {
    return null; // truncated
  }
  const version = raw.readUInt8(0);
  if (version !== ENVELOPE_VERSION) {
    return null;
  }
  let offset = 1;
  const iv = raw.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const tag = raw.subarray(offset, offset + TAG_LENGTH);
  offset += TAG_LENGTH;
  const ciphertext = raw.subarray(offset);
  return { version, iv, tag, ciphertext };
}

function packEnvelope(env) {
  const out = Buffer.alloc(1 + env.iv.length + env.tag.length + env.ciphertext.length);
  let offset = 0;
  out.writeUInt8(env.version, offset);
  offset += 1;
  env.iv.copy(out, offset);
  offset += env.iv.length;
  env.tag.copy(out, offset);
  offset += env.tag.length;
  env.ciphertext.copy(out, offset);
  return out.toString('base64');
}

/**
 * Try to decrypt `b64` under `key` and return the plaintext object, or
 * `null` if decryption fails (bad key / tampered tag / malformed
 * envelope / non-JSON plaintext).
 */
function tryDecrypt(b64, key) {
  const env = unpackEnvelope(b64);
  if (env === null) return null;
  let plaintext;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, env.iv);
    decipher.setAuthTag(env.tag);
    plaintext = Buffer.concat([decipher.update(env.ciphertext), decipher.final()]);
  } catch {
    return null;
  }
  try {
    return JSON.parse(plaintext.toString('utf8'));
  } catch {
    return null;
  }
}

function encrypt(plaintext, key) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const buf = Buffer.from(JSON.stringify(plaintext), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return packEnvelope({ version: ENVELOPE_VERSION, iv, tag, ciphertext });
}

function resolveDbPath() {
  if (process.env.MISSION_CONTROL_DB_PATH) {
    return process.env.MISSION_CONTROL_DB_PATH;
  }
  const dataDir = process.env.MISSION_CONTROL_DATA_DIR || path.join(process.cwd(), '.data');
  return path.join(dataDir, 'mission-control.db');
}

function rotate(db, newKey, previousKey) {
  const result = {
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
    const rows = select.all();
    for (const row of rows) {
      if (!PROVIDER_TOKENS.includes(row.provider)) {
        result.unknown_provider += 1;
        result.failures.push({
          id: row.id,
          provider: row.provider,
          reason: 'unknown_provider',
        });
        continue;
      }
      const envelope = row.config_json;
      if (!envelope) continue;

      // Try PREVIOUS first if supplied (canonical rotation path).
      let plaintext = null;
      let viaPrevious = false;
      if (previousKey) {
        plaintext = tryDecrypt(envelope, previousKey);
        if (plaintext !== null) viaPrevious = true;
      }
      if (plaintext === null) {
        // Already rotated? Try NEW.
        plaintext = tryDecrypt(envelope, newKey);
        if (plaintext !== null) {
          result.already_rotated += 1;
          continue;
        }
        result.failed += 1;
        result.failures.push({
          id: row.id,
          provider: row.provider,
          reason: 'decrypt failed under new and previous keys',
        });
        continue;
      }
      // Re-seal under NEW.
      let sealed;
      try {
        sealed = encrypt(plaintext, newKey);
      } catch (err) {
        result.failed += 1;
        result.failures.push({
          id: row.id,
          provider: row.provider,
          reason: `re-encrypt failed: ${(err && err.message) || String(err)}`,
        });
        continue;
      }
      update.run(sealed, row.id);
      result.rotated += 1;
      if (viaPrevious) result.grace_decrypted += 1;
    }
  });
  tx.immediate();
  return result;
}

function main() {
  const newSecret = process.env.AUTH_SECRET;
  if (!newSecret || newSecret.trim().length === 0) {
    process.stderr.write(
      'secrets-rotate: AUTH_SECRET must be set to the NEW secret before rotation.\n',
    );
    process.exit(2);
  }
  const previousSecret = process.env.AUTH_SECRET_PREVIOUS;
  const newKey = deriveKey(newSecret);
  const previousKey =
    previousSecret && previousSecret.trim().length > 0 ? deriveKey(previousSecret) : null;

  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`secrets-rotate: DB not found at ${dbPath}\n`);
    process.exit(2);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  let result;
  try {
    result = rotate(db, newKey, previousKey);
  } finally {
    db.close();
  }

  process.stdout.write(JSON.stringify({ ok: result.failed === 0 && result.schema_error === 0, ...result }, null, 2) + '\n');
  process.exit(result.failed === 0 && result.schema_error === 0 ? 0 : 1);
}

main();
