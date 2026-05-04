/**
 * SPEC-008 — CRUD validation surface for governance REST routes.
 *
 * Per FR-039, FR-045, FR-046, FR-179, FR-206, FR-210, FR-219e, FR-219f,
 * FR-219t, FR-219u. Each schema is a `.strict()` Zod object so unknown
 * keys are rejected (FR-210). Numeric refinements reject NaN/Infinity
 * (FR-219e); the prototype-pollution refinement walks the input tree and
 * rejects `__proto__`, `constructor`, `prototype` keys at any depth
 * (FR-219f). Regex inputs are linted by `safe-regex` so a ReDoS string is
 * rejected before it reaches the matcher (FR-219t). Sanity bounds clamp
 * WIP caps (1..10000), money amounts (0..1e15), TTLs (0..30d), and
 * cron / regex string lengths (≤64 chars) per FR-045 / FR-179.
 *
 * `ValidationError` is the typed error every parser throws on failure.
 * Its `issues[]` array carries `{ field_path, message, code }` per
 * FR-219u so the REST surface can format a structured 400 body.
 *
 * @see specs/008-resource-governance/spec.md FR-039, FR-045, FR-046,
 *   FR-179, FR-206, FR-210, FR-219e, FR-219f, FR-219t, FR-219u
 * @see specs/008-resource-governance/tasks.md T068
 */

import safeRegexUntyped from 'safe-regex';
import { z } from 'zod';

const safeRegex = safeRegexUntyped as (regex: RegExp) => boolean;

/** Sanity bounds (FR-045, FR-179). */
const WIP_MIN = 1;
const WIP_MAX = 10000;
const MONEY_MAX = 1e15;
const TTL_MAX_MS = 30 * 86400 * 1000; // 30 days
const CRON_MAX_LEN = 64;
const REGEX_MAX_LEN = 64;
const STRING_MAX_LEN = 256;

/** Forbidden prototype-pollution keys (FR-219f). */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Structured error issue per FR-219u. */
export interface ValidationIssue {
  field_path: string;
  message: string;
  code: string;
}

/** Typed validation error thrown by every `parse*Request` helper. */
export class ValidationError extends Error {
  public readonly issues: ValidationIssue[];

  public constructor(issues: ValidationIssue[]) {
    super(issues[0]?.message ?? 'validation_error');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

/**
 * Recursive guard: throws if any object key (at any depth) is a forbidden
 * prototype key. Operates BEFORE Zod parsing so we never feed a polluted
 * object into Zod's reflection layer.
 */
function assertNoPrototypePollution(value: unknown, path: string): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertNoPrototypePollution(value[i], `${path}[${i.toString()}]`);
    }
    return;
  }
  // Use Object.getOwnPropertyNames to also catch non-enumerable __proto__
  // and constructor declarations.
  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new ValidationError([
        {
          field_path: path === '' ? key : `${path}.${key}`,
          message: `forbidden key: ${key}`,
          code: 'prototype_pollution',
        },
      ]);
    }
    const child = (value as Record<string, unknown>)[key];
    assertNoPrototypePollution(child, path === '' ? key : `${path}.${key}`);
  }
}

/** Wrap a Zod number-refinement that rejects NaN / Infinity. */
const finiteNumber = z
  .number()
  .refine(Number.isFinite, { message: 'must be a finite number' });

/**
 * Cron string ≤ CRON_MAX_LEN chars; non-empty after trim. Format itself
 * is not validated here (the cron parser owns format checks); we just
 * cap the length and reject empty / pure whitespace.
 */
const cronString = z
  .string()
  .max(CRON_MAX_LEN, { message: `cron must be ≤ ${CRON_MAX_LEN.toString()} chars` })
  .refine((s) => s.trim().length > 0, { message: 'cron must be non-empty' });

/**
 * Regex string ≤ REGEX_MAX_LEN chars AND `safe-regex` lint-clean. The
 * lint runs against `new RegExp(input)` so an unparseable regex throws
 * a `SyntaxError` we map to a typed validation issue.
 */
const safeRegexString = z
  .string()
  .max(REGEX_MAX_LEN, { message: `regex must be ≤ ${REGEX_MAX_LEN.toString()} chars` })
  .refine(
    (s) => {
      let re: RegExp;
      try {
        re = new RegExp(s);
      } catch {
        return false;
      }
      return safeRegex(re);
    },
    {
      message: 'regex is unsafe (ReDoS) or unparseable',
    },
  );

/** Closed enums shared across schemas. */
const policyTypeEnum = z.enum([
  'wip_limit',
  'budget',
  'blackout',
  'degraded_window',
]);
const enforcementEnum = z.enum([
  'alert',
  'defer',
  'pause_new_work',
  'block_dispatch',
  'require_override',
]);
const enforceModeEnum = z.enum(['shadow', 'enforce']);
const limitKindEnum = z.enum([
  'wip',
  'usd',
  'token',
  'request',
  'session',
  'window',
]);
const overrideScopeKindEnum = z.enum([
  'facility',
  'workspace',
  'agent',
  'project',
  'task_status',
  'specific_task',
]);
const overrideUnitEnum = z.enum(['usd', 'token', 'request', 'session']);

/** Standard nullable integer id (1..2^53). */
const idInt = z.number().int().positive();

/**
 * Policy CRUD schema (any policy_type). Strict, additionalProperties=false.
 * Subtype-specific bounds (WIP cap_max, budget limit) layer on via
 * `parsePolicyRequest` / `parseBudgetRequest` so each subtype emits the
 * tightest possible error.
 */
export const policySchema = z
  .object({
    workspace_id: idInt.nullable().optional(),
    project_id: idInt.nullable().optional(),
    agent_id: idInt.nullable().optional(),
    policy_type: policyTypeEnum,
    limit_kind: limitKindEnum,
    limit_value: finiteNumber.optional(),
    enforcement: enforcementEnum,
    enforce_mode: enforceModeEnum.optional(),
    period: z.string().max(STRING_MAX_LEN).optional(),
    timezone: z.string().max(STRING_MAX_LEN).optional(),
    schedule_json: z.record(z.string(), z.unknown()).optional(),
    window_spec_json: z.string().max(8192).optional(),
    soft_threshold_pct: finiteNumber.min(0).max(100).optional(),
    hard_threshold_pct: finiteNumber.min(0).max(100).optional(),
    notes: z.string().max(2048).optional(),
  })
  .strict();

/** Budget = policy with `policy_type='budget'` + monetary bound. */
export const budgetSchema = policySchema
  .extend({
    policy_type: z.literal('budget'),
    limit_kind: z.enum(['usd', 'token', 'request', 'session']),
    limit_value: finiteNumber.min(0).max(MONEY_MAX),
  })
  .strict();

/** Blackout window schema. cron / regex are optional but bounded. */
export const blackoutWindowSchema = policySchema
  .extend({
    policy_type: z.literal('blackout'),
    limit_kind: z.literal('window'),
    cron: cronString.optional(),
    match_pattern: safeRegexString.optional(),
  })
  .strict();

/** Degraded window schema — same shape as blackout, different policy_type. */
export const degradedWindowSchema = policySchema
  .extend({
    policy_type: z.literal('degraded_window'),
    limit_kind: z.literal('window'),
    cron: cronString.optional(),
    match_pattern: safeRegexString.optional(),
  })
  .strict();

/**
 * `reason` field sanitization per FR-219c (T143).
 *
 * Rules:
 *   (a) Reject input containing C0/C1 control characters except `\t`
 *       and `\n`. Specifically rejects `\r` (CR enables header-injection
 *       patterns when a reason ever leaks into a Set-Cookie / log line).
 *   (b) Reject NUL bytes (`\x00`) — already covered by (a) since NUL is
 *       a C0 control char.
 *   (c) Reject non-UTF-8 byte sequences. The Zod input is already a
 *       JS string, which is well-formed UTF-16; the round-trip
 *       Buffer.from(s, 'utf8').toString('utf8') === s catches lone
 *       surrogates that would silently corrupt the audit row.
 *   (d) DOMPurify is intentionally NOT applied at this layer — the
 *       audit row stores the verbatim operator input. UI render-time
 *       purification is handled by the React component, not the writer.
 *
 * @see specs/008-resource-governance/spec.md FR-219c
 * @see specs/008-resource-governance/tasks.md T143
 */
export function isReasonClean(input: string): boolean {
  // Lone-surrogate / invalid UTF-16 detector — round-trip through
  // Buffer is the canonical idiom in Node.
  const utf8RoundTrip = Buffer.from(input, 'utf8').toString('utf8');
  if (utf8RoundTrip !== input) return false;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // Allow horizontal tab (0x09) and line feed (0x0A) only.
    if (code === 0x09 || code === 0x0a) continue;
    // C0 control range U+0000..U+001F.
    if (code < 0x20) return false;
    // DEL (U+007F) and C1 control range U+0080..U+009F.
    if (code >= 0x7f && code <= 0x9f) return false;
  }
  return true;
}

/** Zod refinement applied to the override-grant `reason` field. */
const overrideReasonString = z
  .string()
  .min(1)
  .max(2048)
  .refine(isReasonClean, {
    message:
      'reason contains invalid control characters or is not valid UTF-8',
  });

/** Override grant request (FR-171..185). */
export const overrideGrantSchema = z
  .object({
    scope_kind: overrideScopeKindEnum,
    scope_id: idInt.nullable().optional(),
    policy_id: idInt.nullable().optional(),
    granted_amount: finiteNumber.min(0).max(MONEY_MAX).optional(),
    granted_unit: overrideUnitEnum.optional(),
    reservation_id: idInt.nullable().optional(),
    reason: overrideReasonString,
    ttl_ms: z.number().int().min(0).max(TTL_MAX_MS),
    idempotency_key: z.string().min(1).max(STRING_MAX_LEN),
  })
  .strict();

/** Generic Zod-error → ValidationIssue mapper. */
function zodIssuesToValidation(err: z.ZodError): ValidationIssue[] {
  return err.issues.map((iss) => ({
    field_path: iss.path.join('.'),
    message: iss.message,
    code: iss.code,
  }));
}

/** Run a parser and translate its Zod failure into ValidationError. */
function runParser<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  assertNoPrototypePollution(input, '');
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = zodIssuesToValidation(result.error);
    if (issues.length === 0) {
      issues.push({
        field_path: '',
        message: `${label} validation failed`,
        code: 'invalid',
      });
    }
    throw new ValidationError(issues);
  }
  return result.data;
}

/** Apply WIP cap_max sanity bound (FR-045) atop policy parse. */
function assertWipBounds(parsed: { limit_value?: number | undefined }): void {
  if (parsed.limit_value === undefined) return;
  if (
    !Number.isInteger(parsed.limit_value) ||
    parsed.limit_value < WIP_MIN ||
    parsed.limit_value > WIP_MAX
  ) {
    throw new ValidationError([
      {
        field_path: 'limit_value',
        message: `wip cap_max must be an integer in [${WIP_MIN.toString()}..${WIP_MAX.toString()}]`,
        code: 'wip_out_of_range',
      },
    ]);
  }
}

/**
 * Parse a generic policy request (covers all four policy_type values).
 * Subtype-specific shape rules apply: WIP requires limit_value in
 * [1..10000]; budget requires limit_value in [0..1e15] and limit_kind in
 * the unit enum.
 */
export function parsePolicyRequest(input: unknown): z.infer<typeof policySchema> {
  const parsed = runParser(policySchema, input, 'policy');
  if (parsed.policy_type === 'wip_limit') {
    assertWipBounds(parsed);
  }
  return parsed;
}

/** Parse a budget request with monetary-bound enforcement. */
export function parseBudgetRequest(input: unknown): z.infer<typeof budgetSchema> {
  return runParser(budgetSchema, input, 'budget');
}

/** Parse a blackout-window request. */
export function parseBlackoutWindowRequest(
  input: unknown,
): z.infer<typeof blackoutWindowSchema> {
  return runParser(blackoutWindowSchema, input, 'blackout_window');
}

/** Parse a degraded-window request. */
export function parseDegradedWindowRequest(
  input: unknown,
): z.infer<typeof degradedWindowSchema> {
  return runParser(degradedWindowSchema, input, 'degraded_window');
}

/** Parse an operator override-grant request. */
export function parseOverrideGrantRequest(
  input: unknown,
): z.infer<typeof overrideGrantSchema> {
  return runParser(overrideGrantSchema, input, 'override_grant');
}
