/**
 * SPEC-008 — PII redaction for telemetry payloads.
 *
 * Per FR-099 (email redaction), FR-100 (API token redaction),
 * FR-109/FR-226 (prompt content redaction), FR-254/FR-282 (sanitization
 * before persistence to telemetry tables).
 *
 * Pattern catalog:
 *   - Email: RFC-5322-lite — local-part allows `[\w._%+-]+`, domain
 *     allows `[\w.-]+\.[A-Za-z]{2,}`. Anchored with the global flag so
 *     every match is replaced.
 *   - Anthropic API token: `sk-` prefix + at least 32 word characters
 *     (FR-100 catalog). Provider-agnostic — the pattern is generic
 *     `sk-` + suffix.
 *   - GitHub PAT: `ghp_` prefix + at least 36 word characters.
 *   - Prompt content: heuristic — `user prompt:` followed by any text up
 *     to a sentence boundary or end of input. Off by default; opt-in
 *     because it would otherwise eat legitimate operator notes.
 *
 * Caller-supplied `customPatterns` are applied AFTER the built-ins, so
 * built-in tokens already replaced with `[REDACTED:*]` cannot be
 * double-matched by a custom pattern. This keeps replacement counts
 * accurate per pass.
 *
 * Replacement counts: every match contributes +1 regardless of pattern
 * (caller can distinguish via the `[REDACTED:<kind>]` marker if a
 * post-hoc breakdown is needed).
 *
 * @see specs/008-resource-governance/spec.md FR-099, FR-100, FR-109,
 *      FR-226, FR-254, FR-282
 * @see specs/008-resource-governance/tasks.md T087, T088
 * @see Constitution Convention J — strict-scope module
 */

import type { RedactionOptions, RedactionResult } from '@/types/observability';

const EMAIL_PATTERN = /[\w._%+-]+@[\w-]+(?:\.[\w-]+)+/g;
const SK_TOKEN_PATTERN = /sk-[\w-]{32,}/g;
const GHP_TOKEN_PATTERN = /ghp_[\w]{36,}/g;
// Prompt content: 'user prompt:' followed by any non-newline up to the
// first '.' or '?' or end of input. Fixed-width pattern so it never
// catastrophically backtracks (no nested quantifiers, no alternations
// over the same input slice).
const PROMPT_PATTERN = /user prompt:[^.\n?]*[.?]?/gi;

const REPLACEMENT_EMAIL = '[REDACTED:email]';
const REPLACEMENT_TOKEN = '[REDACTED:api_token]';
const REPLACEMENT_PROMPT = '[REDACTED:prompt]';
const REPLACEMENT_CUSTOM = '[REDACTED:custom]';

/**
 * Apply each enabled pattern category to `input` and return the redacted
 * string + total replacement count.
 */
export function redactPii(
  input: string,
  options: RedactionOptions = {},
): RedactionResult {
  const emailsOn = options.emails ?? true;
  const apiTokensOn = options.apiTokens ?? true;
  const promptContentOn = options.promptContent ?? false;
  const customPatterns = options.customPatterns ?? [];

  let redacted = input;
  let replacements = 0;

  if (emailsOn) {
    const before = redacted;
    redacted = redacted.replace(EMAIL_PATTERN, REPLACEMENT_EMAIL);
    replacements += countMatches(before, EMAIL_PATTERN);
  }

  if (apiTokensOn) {
    const beforeSk = redacted;
    redacted = redacted.replace(SK_TOKEN_PATTERN, REPLACEMENT_TOKEN);
    replacements += countMatches(beforeSk, SK_TOKEN_PATTERN);

    const beforeGhp = redacted;
    redacted = redacted.replace(GHP_TOKEN_PATTERN, REPLACEMENT_TOKEN);
    replacements += countMatches(beforeGhp, GHP_TOKEN_PATTERN);
  }

  if (promptContentOn) {
    const before = redacted;
    redacted = redacted.replace(PROMPT_PATTERN, REPLACEMENT_PROMPT);
    replacements += countMatches(before, PROMPT_PATTERN);
  }

  for (const pattern of customPatterns) {
    if (!pattern.global) {
      // Defensive: if caller supplied a non-global pattern, replace
      // only-first-match semantics differ from .matchAll. Force a one-time
      // replace and count once to keep numbers accurate.
      const before = redacted;
      redacted = redacted.replace(pattern, REPLACEMENT_CUSTOM);
      if (before !== redacted) replacements += 1;
      continue;
    }
    const before = redacted;
    redacted = redacted.replace(pattern, REPLACEMENT_CUSTOM);
    replacements += countMatches(before, pattern);
  }

  return { redacted, replacements };
}

/**
 * Count match occurrences of a global regex against a source string.
 * Resets `lastIndex` afterwards so reuse of a sticky/global regex is
 * safe (defensive — the function does NOT mutate the regex's state on
 * exit).
 */
function countMatches(source: string, pattern: RegExp): number {
  // matchAll requires a global flag; both built-in and caller-validated
  // custom patterns satisfy this branch when reached.
  if (!pattern.global) return 0;
  let count = 0;
  const iter = source.matchAll(pattern);
  while (!iter.next().done) {
    count += 1;
  }
  return count;
}
