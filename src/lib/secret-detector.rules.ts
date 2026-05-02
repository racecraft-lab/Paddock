/**
 * SPEC-007 secret-detector v1 rule set (FR-031).
 *
 * Foundation skeleton: rule list intentionally empty. The 17 rule families
 * (aws-access-key-id, github-pat-classic, anthropic-key, vault-hvs, npm-token,
 * gcp-sa-json-compound, etc.) are populated under US7 (Phase 6, T405) along
 * with their positive/negative fixtures and the wild-corpus recall gate.
 *
 * Every rule MUST pass `safe-regex` (FR-035). The Foundation T012 test runs
 * `safeRegex(rule.regex.source)` over this list so the gate is wired now —
 * even though the list is empty — and US7 cannot land an unsafe regex
 * without immediately failing CI.
 */

export interface Rule {
  /** Stable rule identifier used in `<REDACTED:{rule_id}>` substitution. */
  readonly name: string
  /** Match pattern. MUST pass `safeRegex(regex.source)` (FR-035). */
  readonly regex: RegExp
  /** Human-readable description of the secret family. */
  readonly description: string
}

export const rules: readonly Rule[] = Object.freeze([])
