/**
 * SPEC-007 secret-detector v1 rule set (FR-031).
 *
 * Closed, bounded list of 17 rule families sourced from gitleaks v8.18.0
 * patterns plus Paddock additions. NO transitive gitleaks pulls — the v1 ruleset
 * is exactly the families enumerated in FR-031 (1..17). New families MUST
 * land in a future v2 spec.
 *
 * Every rule MUST pass `safe-regex` validation (FR-035). The module-load
 * assertion below runs `safeRegex(rule.regex)` over every entry and throws
 * at module init on any pattern with star-height > 1 or other ReDoS
 * vectors. This is a defense-in-depth check; CI also asserts the same
 * invariant via `secret-detector.test.ts` (T402) and via the foundation
 * smoke test (T012 in `task-artifacts.enums.test.ts`).
 *
 * Each rule has the `g` flag so `String.prototype.replaceAll` substitutes
 * every match (FR-030 redaction). Multi-line patterns also carry the `m`
 * flag where line anchors (`^`/`$`) are used.
 *
 * Per-rule positive AND negative fixtures live at
 * `src/lib/__tests__/__fixtures__/secrets/<rule>-positive.txt` and
 * `<rule>-negative.txt`.
 */

import safeRegex from 'safe-regex'

export interface Rule {
  /** Stable rule identifier used in `<REDACTED:{rule_id}>` substitution. */
  readonly name: string
  /** Match pattern. MUST pass `safeRegex(regex)` (FR-035). MUST carry `g`. */
  readonly regex: RegExp
  /** Human-readable description of the secret family. */
  readonly description: string
}

// ---------------------------------------------------------------------------
// FR-031 v1 ruleset (closed list, 17 families). Order is informational only;
// the detector iterates the array sequentially and merges all findings.
// ---------------------------------------------------------------------------

export const rules: readonly Rule[] = Object.freeze([
  // 1. AWS access key id (gitleaks: aws-access-token; AKIA + ASIA STS).
  {
    name: 'aws-access-key-id',
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    description: 'AWS access key id (AKIA prefix; ASIA for STS sessions).',
  },
  // 2. AWS secret access key — anchored to AWS-context heuristic to avoid
  //    false positives on arbitrary 40-char base64-ish blobs. Requires an
  //    `aws_secret_access_key` / `AWS_SECRET_ACCESS_KEY` co-occurrence.
  {
    name: 'aws-secret-access-key',
    regex:
      /\b(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\b\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}["']?/g,
    description: 'AWS secret access key (40-char base64-ish + AWS context).',
  },
  // 3. GitHub PATs classic — gitleaks pattern (`ghp_…`, `ghu_…`).
  {
    name: 'github-pat-classic',
    regex: /\b(?:ghp|ghu)_[A-Za-z0-9]{36,}\b/g,
    description: 'GitHub Personal Access Token (classic ghp_/ghu_).',
  },
  // 4. GitHub fine-grained PAT (`github_pat_…`).
  {
    name: 'github-pat-fine-grained',
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    description: 'GitHub fine-grained Personal Access Token.',
  },
  // 5. GitHub OAuth / refresh / server tokens.
  {
    name: 'github-oauth-tokens',
    regex: /\b(?:gho|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
    description: 'GitHub OAuth / server / refresh token.',
  },
  // 6. Google API key (`AIza…`, 35 url-safe chars).
  {
    name: 'google-api-key',
    regex: /\bAIza[0-9A-Za-z_\-]{35}\b/g,
    description: 'Google API key (AIza prefix).',
  },
  // 7. Google Cloud service-account JSON compound — promoted from v2 deferral
  //    per Clarify Session 1 consensus. Looks for `"type": "service_account"`
  //    near a `"private_key"` PEM block in the same JSON object.
  {
    name: 'gcp-sa-json-compound',
    regex:
      /"type"\s*:\s*"service_account"[\s\S]{0,500}?"private_key"\s*:\s*"-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    description:
      'Google Cloud service-account JSON (type=service_account + private_key PEM compound).',
  },
  // 8. Slack tokens (xoxb / xoxp / xoxa / xoxr).
  {
    name: 'slack-tokens',
    regex: /\bxox[bpar]-[A-Za-z0-9]{10,}-[A-Za-z0-9\-]{10,}\b/g,
    description: 'Slack token (bot/user/workspace/refresh).',
  },
  // 9. Stripe live keys (sk_live_, pk_live_).
  {
    name: 'stripe-keys',
    regex: /\b(?:sk|pk)_live_[A-Za-z0-9]{24,}\b/g,
    description: 'Stripe live secret/publishable key.',
  },
  // 10. PEM private key headers (PRIVATE KEY, RSA, EC, OPENSSH).
  {
    name: 'pem-private-keys',
    regex:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g,
    description: 'PEM private key header (RSA/EC/DSA/OPENSSH/ENCRYPTED).',
  },
  // 11. Generic env-style assignments (case-insensitive). `m` flag so `^`/`$`
  //     match per-line; entropy is approximated by minimum length 16.
  {
    name: 'generic-env-secret',
    regex:
      /^[ \t]*(?:password|api[_-]?key|token|secret)[ \t]*=[ \t]*["']?[A-Za-z0-9/+=._\-]{16,}["']?[ \t]*$/gim,
    description: 'Generic env-style secret assignment.',
  },
  // 12. JWT — three url-safe base64 segments separated by dots.
  {
    name: 'jwt',
    regex: /\beyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
    description: 'JSON Web Token (header.payload.signature).',
  },
  // 13. Authorization Bearer header. JS RegExp does not support inline `(?i)`,
  //     so the `i` flag is set on the literal.
  {
    name: 'authz-bearer',
    regex: /authorization:\s*bearer\s+[A-Za-z0-9._\-]{20,}/gi,
    description: 'Authorization: Bearer <token> header.',
  },
  // 14. Anthropic API key (sk-ant-api03 / sid01 prefix).
  {
    name: 'anthropic-key',
    regex: /\bsk-ant-(?:api03|sid01)-[A-Za-z0-9_\-]{93,}\b/g,
    description: 'Anthropic API key (sk-ant-api03/sid01).',
  },
  // 15. OpenAI API key (sk- or sk-proj-).
  {
    name: 'openai-key',
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_\-]{40,}\b/g,
    description: 'OpenAI API key (sk- / sk-proj-).',
  },
  // 16. HashiCorp Vault service token — promoted from v2 deferral per
  //     Clarify Session 1 consensus.
  {
    name: 'vault-hvs',
    regex: /\bhvs\.[A-Za-z0-9_\-]{20,}\b/g,
    description: 'HashiCorp Vault service token (hvs. prefix).',
  },
  // 17. npm access token — promoted from v2 deferral per Clarify Session 1
  //     consensus. Exactly 36 url-safe chars after `npm_` prefix.
  {
    name: 'npm-token',
    regex: /\bnpm_[A-Za-z0-9]{36}\b/g,
    description: 'npm access token (npm_ prefix, 36 chars).',
  },
])

// ---------------------------------------------------------------------------
// Module-load assertion: every rule's compiled regex MUST pass `safe-regex`
// (FR-035). Throwing here is intentional — a bad pattern bricks the module
// import and CI fails immediately. CI also exercises this via T012 and T402.
// ---------------------------------------------------------------------------

for (const rule of rules) {
  if (!safeRegex(rule.regex)) {
    throw new Error(
      `secret-detector.rules: rule '${rule.name}' failed safe-regex validation (FR-035).`,
    )
  }
}
