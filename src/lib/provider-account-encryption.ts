/**
 * SPEC-008 — Provider account config encryption envelope.
 *
 * Per FR-137, FR-138, FR-144, FR-219u, FR-219t, FR-219v and tasks.md
 * T117/T118/T125. Sealed envelope around the per-provider config blob
 * stored on `provider_accounts.config_json` so plaintext credentials
 * (API keys, session tokens, org ids) NEVER hit the SQLite file.
 *
 * Algorithm:
 *   - libsodium secretbox is the spec-target. Today the project does
 *     NOT depend on `libsodium`, `sodium-native`, `@stablelib/nacl`, or
 *     `tweetnacl` (verified via `package.json` grep). This module
 *     ships an AES-256-GCM stub backed by `node:crypto` so the
 *     application contract (sealed-only writes, decrypt-on-read,
 *     plaintext never persists) is enforceable today; swapping to
 *     libsodium is a transparent module-internal upgrade later. The
 *     `TODO(libsodium)` markers below are the upgrade hooks.
 *   - Key derivation: scryptSync(AUTH_SECRET, 'spec-008.provider-accounts', 32).
 *     The salt is a fixed scope-tag — secrets are scoped by the value
 *     of `AUTH_SECRET`, not by per-row salt — so rotation (T125) is a
 *     full re-encrypt of every account under the new key.
 *   - Envelope shape (base64): version(1) || iv(12) || tag(16) ||
 *     ciphertext(N) — matches NIST SP 800-38D AES-GCM, prefixed with
 *     a one-byte version tag (currently `1`) so a future libsodium
 *     swap can multiplex envelopes during a grace window.
 *
 * Per-provider strict Zod schemas (FR-219u) enumerate the
 * `_encrypted.*` fields each provider expects. Plaintext config that
 * does NOT match the strict schema is rejected before encryption — so
 * a typo in field name surfaces at write time, not on decrypt.
 *
 * Audit: a `decrypt_failure` self-obs metric increments on bad-key /
 * tampered-envelope decode. Callers MUST treat decrypt failure as a
 * fatal disposition (no fallback to plaintext, no silent skip).
 *
 * @see specs/008-resource-governance/spec.md FR-137, FR-138, FR-144, FR-149
 * @see specs/008-resource-governance/tasks.md T117, T118, T125
 * @see Constitution Convention J — `src/lib/provider-account*.ts` is in
 *      `tsconfig.spec-strict.json` and the strict-scope ESLint override.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { z } from 'zod';
import { incrementMetric } from '@/lib/observability/self-obs-metrics';
import { PROVIDER_TOKENS, type ProviderToken } from '@/lib/provider-accounts';

const ENVELOPE_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const KDF_SALT = 'spec-008.provider-accounts';
// scrypt cost: 16384 (N=2^14) is OWASP-recommended for interactive
// derivation; matches the ProviderAccount module write-path budget.
const SCRYPT_COST = 16384;
// scrypt maxmem must exceed the 128 * N * r * p memory bound to avoid
// "memory limit exceeded" runtime errors; 128 MiB is comfortably above
// the cost above.
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

// =============================================================================
// Per-provider strict Zod schemas (FR-219u). Each schema enumerates the
// _encrypted.* fields that provider expects. Strict mode rejects
// unknown keys so a typo surfaces at write time.
// =============================================================================

const AnthropicConfigSchema = z
  .object({
    base_url: z.url().optional(),
    organization: z.string().optional(),
    _encrypted: z
      .object({
        api_key: z.string().min(1),
      })
      .strict(),
  })
  .strict();

const OpenAIConfigSchema = z
  .object({
    base_url: z.url().optional(),
    project: z.string().optional(),
    _encrypted: z
      .object({
        api_key: z.string().min(1),
        org_id: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

const CopilotConfigSchema = z
  .object({
    install_path: z.string().optional(),
    _encrypted: z
      .object({
        session_token: z.string().min(1),
        github_oauth_token: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

const OllamaConfigSchema = z
  .object({
    base_url: z.url().optional(),
    model_namespace: z.string().optional(),
    _encrypted: z
      .object({
        // Local Ollama may not require credentials; the strict schema
        // enumerates the optional bearer the operator might supply.
        bearer_token: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

const OpenClawConfigSchema = z
  .object({
    gateway_url: z.url(),
    _encrypted: z
      .object({
        gateway_token: z.string().min(1),
      })
      .strict(),
  })
  .strict();

/** Per-provider strict Zod schema map (FR-219u). */
export const PROVIDER_CONFIG_SCHEMAS = {
  anthropic: AnthropicConfigSchema,
  openai: OpenAIConfigSchema,
  copilot: CopilotConfigSchema,
  ollama: OllamaConfigSchema,
  openclaw: OpenClawConfigSchema,
} as const satisfies Record<ProviderToken, z.ZodType>;

/**
 * Discriminated union of plaintext config shapes per provider.
 * `encryptConfig(provider, config)` narrows on the provider param so
 * the caller can pass a typed object.
 */
export type ProviderConfig = {
  [K in ProviderToken]: z.infer<(typeof PROVIDER_CONFIG_SCHEMAS)[K]>;
}[ProviderToken];

// =============================================================================
// Errors
// =============================================================================

/**
 * Thrown when plaintext config does not match the per-provider strict
 * schema. Indicates a programming error or operator-supplied payload
 * with the wrong shape; callers should surface as 400.
 */
export class ProviderConfigSchemaError extends Error {
  readonly provider: ProviderToken;
  readonly issues: z.core.$ZodIssue[];
  constructor(provider: ProviderToken, issues: z.core.$ZodIssue[]) {
    super(
      `provider config for "${provider}" failed strict schema: ` +
        issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
    this.name = 'ProviderConfigSchemaError';
    this.provider = provider;
    this.issues = issues;
  }
}

/**
 * Thrown when an envelope cannot be decrypted (wrong key, truncated,
 * tampered tag, version mismatch). Bumps the `decrypt_failure`
 * self-obs metric on construction so the Prometheus exporter records
 * the bad-key event regardless of whether the caller logs it.
 */
export type ProviderConfigDecryptCause = 'bad_key' | 'truncated' | 'version_mismatch' | 'malformed';

export class ProviderConfigDecryptError extends Error {
  readonly provider: ProviderToken;
  readonly reason: ProviderConfigDecryptCause;
  constructor(provider: ProviderToken, reason: ProviderConfigDecryptCause) {
    super(`provider config decrypt failed for "${provider}": ${reason}`);
    this.name = 'ProviderConfigDecryptError';
    this.provider = provider;
    this.reason = reason;
    incrementMetric('decrypt_failure_total', { provider, cause: reason });
  }
}

// =============================================================================
// Key derivation
// =============================================================================

/**
 * Resolve the raw symmetric key from `AUTH_SECRET`. Tests may opt into
 * a per-test key by setting `AUTH_SECRET` in the test fixture; rotation
 * (T125) supplies `AUTH_SECRET_PREVIOUS` for the grace-period decrypt.
 *
 * @internal exported for the rotation helper only.
 */
export function deriveKey(secret: string | undefined): Buffer {
  const trimmed = (secret ?? '').trim();
  if (trimmed.length === 0) {
    throw new Error(
      'provider-account-encryption: AUTH_SECRET must be set to encrypt or decrypt provider configs',
    );
  }
  // TODO(libsodium): replace scryptSync KDF with crypto_pwhash once
  // libsodium is on the dependency list. The output buffer is a
  // direct drop-in (32 bytes for AES-256 / secretbox).
  return scryptSync(trimmed, KDF_SALT, KEY_LENGTH, {
    N: SCRYPT_COST,
    maxmem: SCRYPT_MAXMEM,
  });
}

// =============================================================================
// Envelope codec (AES-256-GCM stub; libsodium secretbox replacement TBD)
// =============================================================================

interface SealedEnvelope {
  /** Envelope schema version. Currently always 1. */
  version: number;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

function packEnvelope(env: SealedEnvelope): string {
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

function unpackEnvelope(provider: ProviderToken, b64: string): SealedEnvelope {
  let raw: Buffer;
  try {
    raw = Buffer.from(b64, 'base64');
  } catch {
    throw new ProviderConfigDecryptError(provider, 'malformed');
  }
  // Minimum envelope: 1 (version) + 12 (iv) + 16 (tag) + 1 (ct) = 30
  if (raw.length < 1 + IV_LENGTH + TAG_LENGTH + 1) {
    throw new ProviderConfigDecryptError(provider, 'truncated');
  }
  const version = raw.readUInt8(0);
  if (version !== ENVELOPE_VERSION) {
    throw new ProviderConfigDecryptError(provider, 'version_mismatch');
  }
  let offset = 1;
  const iv = raw.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const tag = raw.subarray(offset, offset + TAG_LENGTH);
  offset += TAG_LENGTH;
  const ciphertext = raw.subarray(offset);
  return { version, iv, tag, ciphertext };
}

// =============================================================================
// Public API: encrypt / decrypt
// =============================================================================

function validate<P extends ProviderToken>(
  provider: P,
  config: unknown,
): z.infer<(typeof PROVIDER_CONFIG_SCHEMAS)[P]> {
  if (!PROVIDER_TOKENS.includes(provider)) {
    throw new ProviderConfigSchemaError(provider, [
      {
        code: 'custom',
        path: ['provider'],
        message: `unknown provider "${provider}"`,
        input: provider,
      } satisfies z.core.$ZodIssue,
    ]);
  }
  const schema = PROVIDER_CONFIG_SCHEMAS[provider];
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    throw new ProviderConfigSchemaError(provider, parsed.error.issues);
  }
  return parsed.data as z.infer<(typeof PROVIDER_CONFIG_SCHEMAS)[P]>;
}

/**
 * Seal a per-provider config blob into a base64 envelope suitable for
 * persistence on `provider_accounts.config_json`. The plaintext
 * `_encrypted.*` keys are validated against the strict schema before
 * encryption, then the entire object is JSON-encoded and AES-GCM
 * sealed under the AUTH_SECRET-derived key.
 *
 * @param provider one of the SPEC-008 provider tokens
 * @param config plaintext config (must match the provider's strict schema)
 * @param keyOverride optional key bytes (rotation helper); production
 *        callers omit this to use AUTH_SECRET.
 * @returns base64 envelope string
 */
export function encryptConfig(
  provider: ProviderToken,
  config: unknown,
  keyOverride?: Buffer,
): string {
  const validated = validate(provider, config);
  const key = keyOverride ?? deriveKey(process.env['AUTH_SECRET']);
  const iv = randomBytes(IV_LENGTH);
  // TODO(libsodium): replace AES-GCM with crypto_secretbox_easy once
  // libsodium is on deps. The envelope tag layout (version|iv|tag|ct)
  // becomes (version|nonce|secretbox_output) — same wire shape, single
  // codec swap.
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(validated), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return packEnvelope({ version: ENVELOPE_VERSION, iv, tag, ciphertext });
}

/**
 * Unseal a base64 envelope produced by `encryptConfig`. Returns the
 * original plaintext config object (validated against the strict
 * schema after decode). Throws `ProviderConfigDecryptError` on bad
 * key / tampered envelope and bumps the `decrypt_failure_total`
 * self-obs metric.
 *
 * @param keyOverride optional key bytes (rotation grace-period). When
 *        omitted, derives from `AUTH_SECRET`.
 */
export function decryptConfig<P extends ProviderToken>(
  provider: P,
  envelope: string,
  keyOverride?: Buffer,
): z.infer<(typeof PROVIDER_CONFIG_SCHEMAS)[P]> {
  const env = unpackEnvelope(provider, envelope);
  const key = keyOverride ?? deriveKey(process.env['AUTH_SECRET']);
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, env.iv);
    decipher.setAuthTag(env.tag);
    plaintext = Buffer.concat([decipher.update(env.ciphertext), decipher.final()]);
  } catch {
    throw new ProviderConfigDecryptError(provider, 'bad_key');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new ProviderConfigDecryptError(provider, 'malformed');
  }
  return validate(provider, parsed);
}

/**
 * Re-encrypt an envelope under a new key (rotation support, T125).
 * Reads the envelope under the previous key, validates against the
 * strict schema, and re-seals under the new key. Both keys are
 * raw 32-byte Buffers as returned by `deriveKey()`.
 */
export function rotateEnvelope(
  provider: ProviderToken,
  envelope: string,
  previousKey: Buffer,
  newKey: Buffer,
): string {
  const plaintext = decryptConfig(provider, envelope, previousKey);
  return encryptConfig(provider, plaintext, newKey);
}
