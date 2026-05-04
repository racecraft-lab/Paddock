/**
 * SPEC-008 — Observability type domain.
 *
 * Single source of truth for the discriminated unions, enums, and record
 * shapes used by the observability/telemetry pipeline (raw ingest, dedupe,
 * canonicalization, snapshots, freshness, redaction, ingest admission,
 * throttle supervisor, self-obs metrics).
 *
 * Drawn directly from `specs/008-resource-governance/spec.md` and the
 * M65a..M65m schema (see src/lib/migrations.ts).
 *
 * Strict-scope mode (`exactOptionalPropertyTypes`,
 * `noUncheckedIndexedAccess`) is in force for this module.
 *
 * @see specs/008-resource-governance/spec.md FR-076..FR-127, FR-076..FR-090e1,
 *      FR-099..FR-100, FR-203, FR-249, FR-335..FR-339, FR-365, FR-386..FR-387
 * @see src/lib/migrations.ts M65a (source_emission_capability),
 *      M65b (raw_usage_events), M65c (canonical_usage_events),
 *      M65d (canonical_budget_effects), M65j (correction_ledger),
 *      M65k (resource_snapshots), M65m (governance final tables)
 */

// =============================================================================
// Source Emission Capability (M65a) — FR-076, FR-085, FR-087
// =============================================================================

/**
 * Closed set of enforcement-eligibility levels per FR-085.
 *
 * - `hard`: source can drive synchronous block decisions (e.g., native_otel,
 *   cli_stdout_json, gateway_otel).
 * - `soft`: source informs but never hard-blocks (e.g., transcript_replay).
 * - `advisory`: source is operator-grade only (e.g., manual_post,
 *   provider_quota).
 * - `reconciliation_only`: source is consumed only during reconciliation
 *   (default for sources without an explicit capability).
 */
export type EnforcementEligibility =
  | 'hard'
  | 'soft'
  | 'advisory'
  | 'reconciliation_only';

/**
 * Closed set of dedupe-confidence values per FR-082.
 *
 * - `high`: provider+request_id+timestamp triple all match across rows.
 * - `medium`: missing request_id but other fields align.
 * - `low`: heuristic join only.
 * - `singleton`: row has no peer; not part of a dedupe set.
 */
export type DedupeConfidence = 'high' | 'medium' | 'low' | 'singleton';

/** Persisted shape of one `source_emission_capability` row. */
export interface SourceCapabilityRow {
  source_id: string;
  display_name: string;
  enforcement_eligibility: EnforcementEligibility;
  dedupe_confidence_default: DedupeConfidence;
  expected_envelope_bytes: number;
  active: 0 | 1;
  created_at: string;
  updated_at: string;
}

/** Insert-shape (no DB-managed columns). */
export interface SourceCapabilityWrite {
  source_id: string;
  display_name: string;
  enforcement_eligibility: EnforcementEligibility;
  dedupe_confidence_default: DedupeConfidence;
  expected_envelope_bytes: number;
}

// =============================================================================
// Raw + Canonical Usage Events (M65b/M65c) — FR-091, FR-092, FR-102, FR-365
// =============================================================================

/**
 * Closed set of `raw_usage_events.reconcile_status` values per the M65b
 * CHECK constraint (data-model.md narrowed by orchestrator note).
 */
export type ReconcileStatus =
  | 'ok'
  | 'schema_broken'
  | 'schema_malicious'
  | 'quarantined';

/** One persisted `raw_usage_events` row (subset). */
export interface RawUsageEvent {
  id: number;
  source_id: string;
  workspace_id: number | null;
  agent_id: number | null;
  task_id: number | null;
  provider: string | null;
  provider_request_id: string | null;
  provider_timestamp_ms: number | null;
  session_id: string | null;
  generation_id: number | null;
  raw_attributes_json: string;
  parser_version: string;
  schema_version_observed: string | null;
  reconcile_status: ReconcileStatus;
  dedupe_confidence: DedupeConfidence;
  enforcement_eligibility: EnforcementEligibility;
  partition_month: string;
  ingested_at: string;
}

/**
 * Provenance of a canonical row per FR-091/FR-102/FR-107.
 *
 * - `single`: one raw row produced this canonical row.
 * - `merged`: multiple raw rows from different sources were dedup-coalesced.
 * - `corrected`: an applied correction restated this canonical row.
 */
export type CanonicalProvenance = 'single' | 'merged' | 'corrected';

/** One persisted `canonical_usage_events` row (subset). */
export interface CanonicalUsageEvent {
  id: number;
  workspace_id: number | null;
  agent_id: number | null;
  task_id: number | null;
  provider: string;
  provider_request_id: string | null;
  provider_timestamp_ms: number;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  cache_read_in: number;
  cache_creation_in: number;
  cost_usd: number;
  duration_ms: number | null;
  session_id: string | null;
  provenance: CanonicalProvenance;
  /** JSON-serialized array of contributing raw_usage_events.id values. */
  merge_sources_json: string | null;
  dedupe_confidence: DedupeConfidence;
  partition_month: string;
  emitted_at: string;
}

/**
 * Result of merging zero or more raw rows into a single canonical event.
 * Returned by `mergeRawEvents` and consumed by the canonical materializer.
 */
export interface MergedCanonical {
  canonical: Omit<CanonicalUsageEvent, 'id' | 'emitted_at'>;
  confidence: DedupeConfidence;
  /** Stable, sorted ascending. */
  merge_sources: number[];
}

// =============================================================================
// Canonical Budget Effects Lifecycle (M65d / Q30) — FR-093, FR-104
// =============================================================================

/**
 * Closed lifecycle for one `canonical_budget_effects` row.
 *
 * - `pending`: row inserted, no debit posted yet.
 * - `posted`: debit applied to the counter.
 * - `corrected`: a correction adjusted the amount; original row stays
 *   posted but a sibling row records the delta.
 * - `voided`: the original effect was reverted (reverted_at NOT NULL).
 */
export type PostedEffectState = 'pending' | 'posted' | 'corrected' | 'voided';

// =============================================================================
// Snapshots (M65k) — FR-111, FR-117, FR-121
// =============================================================================

/** Closed scope-kind set for resource snapshots. */
export type SnapshotScopeKind = 'facility' | 'workspace';

/** One `resource_snapshots` row (subset). */
export interface ResourceSnapshot {
  id: number;
  source_id: string;
  scope_kind: SnapshotScopeKind;
  scope_id: number | null;
  snapshot_at: string;
  cumulative_tokens_in: number;
  cumulative_tokens_out: number;
  cumulative_cost_usd: number;
  cumulative_requests: number;
  delta_from_prior: number | null;
  source_emission_fingerprint: string;
  partition_month: string;
  ingested_at: string;
}

// =============================================================================
// Ingest Rate Admission (M65m + governance.json) — FR-079, FR-089, FR-090e
// =============================================================================

/**
 * Closed set of admission decisions returned by `ingest-admission`.
 * Either `{admit: true}` or `{admit: false, reason}`.
 */
export type AdmissionDecision =
  | { admit: true }
  | { admit: false; reason: AdmissionRejectReason };

/** Closed set of admission-reject reasons. */
export type AdmissionRejectReason =
  | 'token_bucket_drained'
  | 'disk_pressure_red'
  | 'rate_limited'
  | 'admission_throttle'
  | 'quarantined';

/**
 * Closed set of ingest rate states (FR-090e/FR-090e1).
 * Persisted in `ingest_rate_state.state` (M65m CHECK narrows to the first
 * four; the additional `amber|red` states are computed views over the
 * same row + ingest_disk pressure).
 */
export type IngestRateStateValue =
  | 'healthy'
  | 'degraded'
  | 'disk_full_pause'
  | 'circuit_open'
  | 'rate_limited'
  | 'amber'
  | 'red';

// =============================================================================
// Throttle Supervisor (FR-335..FR-339)
// =============================================================================

/** Closed throttle-supervisor states. */
export type ThrottleState = 'idle' | 'throttling';

// =============================================================================
// Redaction (FR-099/FR-100/FR-254/FR-282)
// =============================================================================

/**
 * Result of one redaction pass.
 *
 * - `redacted`: the redacted text.
 * - `replacements`: total count of pattern matches replaced.
 */
export interface RedactionResult {
  redacted: string;
  replacements: number;
}

/** Configurable knobs for redaction. */
export interface RedactionOptions {
  /** Redact email addresses. Default: true. */
  emails?: boolean;
  /** Redact known API token shapes (sk-, ghp_). Default: true. */
  apiTokens?: boolean;
  /**
   * Redact freeform prompt content (any text matching configured prompt
   * patterns). Default: false — only enabled when caller passes it.
   */
  promptContent?: boolean;
  /**
   * Custom regex patterns to redact (in addition to the built-ins).
   * Caller is responsible for ReDoS safety of these patterns.
   */
  customPatterns?: readonly RegExp[];
}
