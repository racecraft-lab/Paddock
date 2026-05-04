/**
 * SPEC-008 — GitHub Copilot CLI events.jsonl adapter (T099).
 *
 * Per FR-073 (Copilot CLI ingest), FR-083 (tiered schema validation),
 * FR-101 (schema_version_observed pinned to the actual schema tier).
 *
 * Reads `~/.copilot/events.jsonl` (or override) and emits one
 * `raw_usage_events` row per usage event. The schema tier is decided
 * per-event using `copilot-schema-versioning.applyFr090d1Fallback`,
 * with Ajv enforcing the per-tier shape (already in dependencies for
 * SPEC-004 output-schema validation).
 *
 * Tier outcomes:
 *   - T1: enforcement_eligibility='soft' (full field set, dedup-friendly)
 *   - T2: enforcement_eligibility='reconciliation_only' (partial)
 *   - T3: enforcement_eligibility='reconciliation_only' (legacy)
 *
 * Validation errors are recorded as `reconcile_status='schema_broken'`
 * raw rows so the reconciler can quarantine them downstream — the
 * adapter does not throw on a malformed event.
 *
 * Absent-safe: missing events.jsonl returns
 * `{ ok:true, processed:0, skipped:0, files:0 }`.
 *
 * @see specs/008-resource-governance/spec.md FR-073, FR-083, FR-101
 * @see specs/008-resource-governance/tasks.md T099
 * @see Constitution Convention J — strict-scope module
 */

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import {
  ensureSourceRegistered,
  insertRawUsageEvent,
  partitionMonthFromMs,
} from './_adapter-helpers';
import {
  applyFr090d1Fallback,
  type CopilotSchema,
  type CopilotSchemaTier,
} from './copilot-schema-versioning';
import type {
  DedupeConfidence,
  EnforcementEligibility,
  ReconcileStatus,
} from '@/types/observability';
import type Database from 'better-sqlite3';

/** Source id for Copilot CLI events. */
export const COPILOT_EVENTS_SOURCE_ID = 'copilot_events';

/** Parser-version tag stamped on every Copilot-derived raw row. */
export const COPILOT_PARSER_VERSION = 'copilot-events-v1';

/** Adapter options. */
export interface ReadOptions {
  /** Override events.jsonl path. Defaults to `~/.copilot/events.jsonl`. */
  eventsPath?: string;
  workspaceId?: number | null;
  agentId?: number | null;
  taskId?: number | null;
  maxRows?: number;
  /** Override Date.now for deterministic FR-090d1 age-threshold tests. */
  nowMs?: number;
}

/** Adapter result. */
export interface ReadResult {
  ok: true;
  processed: number;
  skipped: number;
  schema_broken: number;
  per_tier: Record<CopilotSchemaTier, number>;
}

/** Lazy Ajv setup. */
const ajv = new Ajv({ allErrors: false, removeAdditional: false });

const t1Schema = {
  type: 'object',
  required: ['provider', 'model', 'tokens_in', 'tokens_out', 'request_id', 'timestamp_ms'],
  properties: {
    provider: { type: 'string' },
    model: { type: 'string' },
    tokens_in: { type: 'number' },
    tokens_out: { type: 'number' },
    request_id: { type: 'string' },
    cost_usd: { type: 'number' },
    timestamp_ms: { type: 'number' },
    schema_version: { type: 'string' },
    latency_ms: { type: 'number' },
    session_id: { type: 'string' },
  },
} as const;

const t2Schema = {
  type: 'object',
  required: ['provider', 'model', 'tokens_in', 'tokens_out', 'timestamp_ms'],
  properties: {
    provider: { type: 'string' },
    model: { type: 'string' },
    tokens_in: { type: 'number' },
    tokens_out: { type: 'number' },
    premium_request_id: { type: 'string' },
    timestamp_ms: { type: 'number' },
    schema_version: { type: 'string' },
    session_id: { type: 'string' },
  },
} as const;

const t3Schema = {
  type: 'object',
  required: ['provider', 'model', 'prompt_tokens', 'completion_tokens', 'timestamp_ms'],
  properties: {
    provider: { type: 'string' },
    model: { type: 'string' },
    prompt_tokens: { type: 'number' },
    completion_tokens: { type: 'number' },
    timestamp_ms: { type: 'number' },
    schema_version: { type: 'string' },
    session_id: { type: 'string' },
  },
} as const;

const validators: Record<CopilotSchemaTier, ValidateFunction> = {
  T1: ajv.compile(t1Schema),
  T2: ajv.compile(t2Schema),
  T3: ajv.compile(t3Schema),
};

function tierToEligibility(tier: CopilotSchemaTier): EnforcementEligibility {
  return tier === 'T1' ? 'soft' : 'reconciliation_only';
}

function tierToConfidence(tier: CopilotSchemaTier): DedupeConfidence {
  return tier === 'T1' ? 'high' : tier === 'T2' ? 'medium' : 'low';
}

function defaultEventsPath(): string {
  return path.join(homedir(), '.copilot', 'events.jsonl');
}

/** Register the copilot_events source. Idempotent. */
export function registerCopilotEventsSource(db: Database.Database): void {
  ensureSourceRegistered(db, {
    source_id: COPILOT_EVENTS_SOURCE_ID,
    display_name: 'GitHub Copilot CLI events.jsonl',
    enforcement_eligibility: 'soft',
    dedupe_confidence_default: 'medium',
    expected_envelope_bytes: 2048,
  });
}

/**
 * Per-event evaluation outcome. Decoupled from disk I/O so callers
 * can drive the adapter from arbitrary event sources for tests.
 */
interface EvaluationOutcome {
  schema: CopilotSchema;
  reconcile_status: ReconcileStatus;
}

function evaluateEvent(
  event: Record<string, unknown>,
  nowMs: number,
): EvaluationOutcome {
  const observedVersion =
    typeof event['schema_version'] === 'string'
      ? (event['schema_version'])
      : null;
  const ts = typeof event['timestamp_ms'] === 'number' ? event['timestamp_ms'] : nowMs;

  const schema = applyFr090d1Fallback({
    observed_schema_version: observedVersion,
    observed_event_timestamp_ms: ts,
    now_ms: nowMs,
  });
  const validator = validators[schema.tier];
  const valid = validator(event);
  return {
    schema,
    reconcile_status: valid ? 'ok' : 'schema_broken',
  };
}

/**
 * Read every line of `~/.copilot/events.jsonl` and emit one
 * raw_usage_events row per parseable event. Schema-broken events are
 * still inserted (with `reconcile_status='schema_broken'`) so the
 * reconciler can quarantine them.
 *
 * Absent-safe — missing file returns
 * `{ok:true, processed:0, skipped:0, schema_broken:0, per_tier:{T1:0,T2:0,T3:0}}`.
 */
export async function readCopilotEvents(
  db: Database.Database,
  opts: ReadOptions = {},
): Promise<ReadResult> {
  const filePath = opts.eventsPath ?? defaultEventsPath();
  const maxRows = opts.maxRows ?? 10_000;
  const nowMs = opts.nowMs ?? Date.now();
  const per_tier: Record<CopilotSchemaTier, number> = { T1: 0, T2: 0, T3: 0 };
  let processed = 0;
  let skipped = 0;
  let schema_broken = 0;

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ok: true, processed: 0, skipped: 0, schema_broken: 0, per_tier };
    }
    throw err;
  }

  registerCopilotEventsSource(db);

  interface Buffered {
    event: Record<string, unknown>;
    outcome: EvaluationOutcome;
  }
  const rowsToInsert: Buffered[] = [];

  const lines = content.split('\n');
  for (const line of lines) {
    if (rowsToInsert.length >= maxRows) break;
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      skipped += 1;
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      skipped += 1;
      continue;
    }
    const event = parsed as Record<string, unknown>;
    const outcome = evaluateEvent(event, nowMs);
    rowsToInsert.push({ event, outcome });
  }

  const workspace_id = opts.workspaceId ?? null;
  const agent_id = opts.agentId ?? null;
  const task_id = opts.taskId ?? null;

  const tx = db.transaction((batch: readonly Buffered[]) => {
    for (const item of batch) {
      const e = item.event;
      const o = item.outcome;
      const tier = o.schema.tier;
      const ts = typeof e['timestamp_ms'] === 'number' ? (e['timestamp_ms']) : nowMs;
      const partition_month = partitionMonthFromMs(ts);
      const requestIdField = tier === 'T1' ? 'request_id' : tier === 'T2' ? 'premium_request_id' : null;
      const requestId =
        requestIdField !== null && typeof e[requestIdField] === 'string'
          ? (e[requestIdField])
          : null;
      const observedVersion =
        typeof e['schema_version'] === 'string' ? (e['schema_version']) : null;
      const sessionId = typeof e['session_id'] === 'string' ? (e['session_id']) : null;
      const provider = typeof e['provider'] === 'string' ? (e['provider']) : 'github';

      const raw_attributes_json = JSON.stringify({
        tier,
        provider,
        model: typeof e['model'] === 'string' ? e['model'] : null,
        tokens_in:
          tier === 'T3'
            ? (typeof e['prompt_tokens'] === 'number' ? e['prompt_tokens'] : 0)
            : (typeof e['tokens_in'] === 'number' ? e['tokens_in'] : 0),
        tokens_out:
          tier === 'T3'
            ? (typeof e['completion_tokens'] === 'number' ? e['completion_tokens'] : 0)
            : (typeof e['tokens_out'] === 'number' ? e['tokens_out'] : 0),
        cost_usd: typeof e['cost_usd'] === 'number' ? e['cost_usd'] : 0,
      });

      insertRawUsageEvent(db, {
        source_id: COPILOT_EVENTS_SOURCE_ID,
        workspace_id,
        agent_id,
        task_id,
        provider,
        provider_request_id: requestId,
        provider_timestamp_ms: ts,
        session_id: sessionId,
        generation_id: null,
        raw_attributes_json,
        parser_version: COPILOT_PARSER_VERSION,
        schema_version_observed: observedVersion,
        reconcile_status: o.reconcile_status,
        dedupe_confidence: tierToConfidence(tier),
        enforcement_eligibility: tierToEligibility(tier),
        partition_month,
      });
      processed += 1;
      per_tier[tier] += 1;
      if (o.reconcile_status === 'schema_broken') schema_broken += 1;
    }
  });
  tx.immediate(rowsToInsert);

  return { ok: true, processed, skipped, schema_broken, per_tier };
}
