# API Contracts — Requirements Quality Checklist

**Purpose:** Unit tests for the SPEC-008 API contract requirements (POST /api/resource-overrides, OTLP receiver, ETag concurrency, bulk promotion, governance read shapes, rate limiting, Zod validation).

**Created:** 2026-05-02
**Feature:** 008-resource-governance
**Domain:** api-contracts
**Target item count:** ~75 (testing requirement quality, not implementation)

Sources audited: `spec.md` (FR-079a/b, FR-090h/i/j/k, FR-180, FR-201..220, FR-186..200), `plan.md`, 10 OpenAPI files in `contracts/`, design concept Q9, Q41, Q44, Q46, Q54, Q56, Q62, Q68.

---

## 1. Endpoint Surface — Completeness

- [ ] CHK001 - Is the `/api/resource-overrides` endpoint (referenced in `plan.md:160` and the Phase 4 prompt) explicitly defined in an OpenAPI contract? [Gap, plan.md §src/app/api/resource-overrides/route.ts]
- [ ] CHK002 - Are the requirements consistent between `/api/resource-overrides` (plan.md, prompt) and `/api/governance/overrides` (contracts/governance-overrides.openapi.yaml) — i.e., is one the canonical path? [Conflict, Spec §FR-201]
- [ ] CHK003 - Is the `/api/governance/diagnostic` read endpoint (plan.md:154) specified in an OpenAPI contract, or is it the same surface as `/api/governance/dispatch` (governance-decisions.openapi.yaml) or `/api/governance/decisions`? [Conflict, Gap, Spec §FR-090j]
- [ ] CHK004 - Are all endpoints in FR-201 (`/policies`, `/policies/{id}/promote`, `/policies/bulk-promote`, `/budgets`, `/windows`, `/overrides`, `/decisions`, `/health`, `/audit`) covered by exactly one OpenAPI file each? [Completeness, Spec §FR-201]
- [ ] CHK005 - Is the path `/api/governance/health` (FR-201) the same resource as `/api/governance/system-health` (governance-system-health.openapi.yaml)? [Conflict, Spec §FR-201]
- [ ] CHK006 - Does the spec define which endpoints are state-changing vs read-only for FR-204 CSRF and FR-217 audit-row scoping? [Completeness, Spec §FR-204, §FR-217]
- [ ] CHK007 - Are HTTP method × path combinations (GET/POST/PUT/DELETE) enumerated for every governance endpoint? [Completeness, Spec §FR-201]
- [ ] CHK008 - Is the OpenAPI publication target documented (single `openapi.json` per FR-213) consistent with the 10 separate per-domain YAML files in `contracts/`? [Consistency, Spec §FR-213]

## 2. Status Code Contract — POST /api/(governance|resource)-overrides

- [ ] CHK009 - Are all five required status codes (201, 200, 409, 423, 422) for POST overrides explicitly enumerated in the OpenAPI contract? [Completeness, Spec §FR-180, §FR-207]
- [ ] CHK010 - Is the 200 response semantics (idempotent retry hit per FR-209) distinguished from 201 (first-create) in the requirements? [Clarity, Spec §FR-209]
- [ ] CHK011 - Is the 412 status (stale ETag per FR-180) included in the prompt's "201/200/409/423/422" list, or is its omission intentional? [Conflict, Spec §FR-180]
- [ ] CHK012 - Is the `retryable: boolean` field in error envelopes specified anywhere in the spec, plan, or OpenAPI ErrorEnvelope schemas? [Gap, Spec §FR-214]
- [ ] CHK013 - Is the mapping between status codes and `retryable: true|false` defined per error class (e.g., 409 reservation_unavailable → retryable=true; 422 validation_failed → retryable=false)? [Gap]
- [ ] CHK014 - Are stable error codes for each rejection path (`reservation_unavailable`, `etag_stale`, `validation_failed`, `policy_locked`) documented as enum values? [Completeness, Spec §FR-180]
- [ ] CHK015 - Is the response body shape for 201 success (override + reservation_id + remaining_budget_snapshot) defined consistently with `data-model.md` reservation row semantics? [Consistency, Contract §governance-overrides]
- [ ] CHK016 - Are 423 vs 409 disambiguation criteria precisely defined (lock vs concurrency loss), so a client can reason about retry strategy? [Clarity, Spec §FR-207]

## 3. OTLP Receiver — POST /api/otlp/v1/{traces,metrics}

- [ ] CHK017 - Are protobuf decode failure semantics (malformed payload, partial body, schema mismatch) defined with a status code (400 vs 422)? [Gap, Spec §FR-079a]
- [ ] CHK018 - Is the protobuf schema version (OTLP/HTTP 1.10.0) pinned in the contract along with version-skew handling requirements? [Clarity, Contract §otlp-receiver]
- [ ] CHK019 - Is the response body content type for 200 success (`application/x-protobuf` ExportTraceServiceResponse) defined for both `/traces` and `/metrics`? [Completeness, Contract §otlp-receiver]
- [ ] CHK020 - Are partial-success semantics (per OTLP spec — `partial_success` field) addressed in requirements? [Gap, Spec §FR-079a]
- [ ] CHK021 - Is the 401 body shape `{ "error": "Authentication required" }` consistent with the project-standard `{error, reason, details?}` envelope (FR-214)? [Consistency, Spec §FR-079a, §FR-214]
- [ ] CHK022 - Are auth header precedence rules defined when both `x-api-key` and `Authorization: Bearer` are supplied? [Gap, Spec §FR-079a]
- [ ] CHK023 - Is the 1 MiB payload-cap measurement boundary (compressed vs decompressed; gzip-encoded body handling) defined? [Clarity, Spec §FR-079a]
- [ ] CHK024 - Are gzip / Content-Encoding requirements specified for OTLP/HTTP per spec compliance? [Gap, Spec §FR-079a]
- [ ] CHK025 - Is the `Retry-After` header value contract (seconds vs ms; absolute vs delta) explicitly aligned with OTLP/HTTP 1.10.0 §"Failures and Retries"? [Clarity, Spec §FR-079b]
- [ ] CHK026 - Are 429 vs 503 differentiation rules (rate-limit vs disk_full_pause) precisely defined for client retry decisions? [Clarity, Spec §FR-079a]
- [ ] CHK027 - Is the per-IP token-bucket scope on 401 (10 fails / 60s / source IP) consistent across both `/traces` and `/metrics` endpoints, or does each endpoint have an independent bucket? [Ambiguity, Spec §FR-079a]
- [ ] CHK028 - Is the per-source ingest token-bucket (1000/min steady, 5000/30s burst native_otel) per FR-079a specified for both `/traces` and `/metrics` or only one? [Completeness, Spec §FR-079a, §FR-090e]
- [ ] CHK029 - Are 4xx-other status codes (400 malformed, 405 method-not-allowed, 415 unsupported media type) specified for OTLP receiver? [Coverage, Gap]

## 4. Concurrent Edit / ETag Optimistic Concurrency — PUT /api/resource-policies

- [ ] CHK030 - Is the canonical PUT path `/api/governance/policies/{id}` (governance-policies.openapi.yaml) consistent with the prompt's `/api/resource-policies` (`/api/resource-*` per FR-218)? [Conflict, Spec §FR-218]
- [ ] CHK031 - Is the `If-Match` request header marked `required: true` for PUT and explicitly required by the FR (not just by the OpenAPI contract)? [Completeness, Spec §FR-205]
- [ ] CHK032 - Is the ETag generation algorithm (hash of which fields, weak vs strong) documented so two clients see a deterministic value? [Clarity, Spec §FR-205]
- [ ] CHK033 - Is the response 412 body field set required to include the current server ETag so the client can refresh+retry? [Gap, Spec §FR-207]
- [ ] CHK034 - Are budgets and windows resources also specified to require If-Match per FR-205? [Completeness, Spec §FR-205]
- [ ] CHK035 - Are ETag header semantics (where ETag is returned: only on 200/201, also on 412?) defined? [Clarity, Contract §governance-policies]
- [ ] CHK036 - Is the relationship between FR-180's `412 etag_stale` and FR-207's `412` documented as the same path (no duplication or contradiction)? [Consistency, Spec §FR-180, §FR-207]
- [ ] CHK037 - Are concurrent-edit conflict-resolution UX requirements (FR-288 "refresh and retry" with diff view) tied to a specific 412 error envelope shape so the UI can render the diff? [Gap, Spec §FR-288]
- [ ] CHK038 - Is the version field on Policy (FR-038) correlated explicitly with the ETag header semantics? [Clarity, Spec §FR-038, §FR-205]

## 5. Bulk Policy Promotion — Typed Confirmation

- [ ] CHK039 - Is the typed-confirmation phrase enum `{PROMOTE TO SOFT, PROMOTE TO HARD}` explicitly required to be case-sensitive exact-match in both spec and OpenAPI? [Completeness, Spec §FR-090h]
- [ ] CHK040 - Is the cross-workspace-bulk-forbidden 422 error code (`cross_workspace_bulk_forbidden`) listed as a stable error code alongside the others in FR-180? [Consistency, Spec §FR-090h, §FR-180]
- [ ] CHK041 - Is the `target_enforce_mode` enum `[soft, hard]` consistent with the confirmation phrase enum (i.e., `PROMOTE TO SOFT` ↔ `soft`)? [Consistency, Contract §governance-policies]
- [ ] CHK042 - Is partial-failure semantics for bulk-promote defined (all-or-nothing transaction vs per-policy result list)? [Gap, Spec §FR-090h]
- [ ] CHK043 - Is the 200 response shape `{affected_policy_ids, audit_id}` sufficient when some policy IDs may have been silently skipped, or does the spec require an explicit per-id result? [Clarity, Spec §FR-090h]
- [ ] CHK044 - Is the `maxItems: 500` upper bound on `policy_ids` justified in requirements (e.g., per-row audit emit cost, transaction size)? [Gap, Contract §governance-policies]
- [ ] CHK045 - Is `Idempotency-Key` requirement for bulk-promote consistent with the single-audit-row guarantee in FR-044/FR-090h? [Consistency, Spec §FR-044]

## 6. Feature-Flag Gating — `resolveFlag(name, ctx)` & flag-OFF behavior

- [ ] CHK046 - Is the per-endpoint flag-OFF response contract (the prompt's "empty arrays") explicitly defined in spec, or only the byte-compat scheduler behavior (FR-008)? [Gap, Spec §FR-008, §FR-186]
- [ ] CHK047 - For GET endpoints (list policies, list overrides, list decisions, list audit), is "empty arrays when FEATURE_RESOURCE_GOVERNANCE=false" specified, or do they 404? [Ambiguity, Gap]
- [ ] CHK048 - For POST/PUT/DELETE endpoints (mutations), is the flag-OFF response contract defined (404 vs 503 vs hidden behind UI)? [Gap, Spec §FR-193]
- [ ] CHK049 - Is the workspace context (`ctx`) source for `resolveFlag` per request defined consistently (header, session, body)? [Clarity, Spec §FR-008, §FR-019]
- [ ] CHK050 - Is the requirement that every `/api/governance/*`, `/api/resource-*`, `/api/otlp/v1/*` route call `resolveFlag(name, ctx)` (no inline `process.env.FEATURE_*`) explicitly stated for API routes? [Completeness, Spec §FR-019, §FR-325]
- [ ] CHK051 - Is OTLP receiver flag-OFF behavior defined (silently 503? 404? always-on if `FEATURE_OPENCLAW_HEALTH_COSTS` independently controls it)? [Ambiguity, Spec §FR-075, §FR-079a]

## 7. Read Shapes — System Health & Diagnostic

- [ ] CHK052 - Is the `/api/governance/system-health` GET response shape (`SystemHealth` schema) covering every status pill required by FR-191 (collector freshness, breaker states, drift alerts, recent runbook links)? [Completeness, Spec §FR-191]
- [ ] CHK053 - Are the recovery-runbook-link fields in the SystemHealth response schema (URLs to `docs/runbook/<slug>.md`) specified? [Gap, Spec §FR-191, §FR-090l]
- [ ] CHK054 - Is the cursor pagination shape (`cursor` + `limit` + `next_cursor`) for diagnostic feed (FR-090j) specified consistently in the OpenAPI contract for `/dispatch` or `/diagnostic`? [Completeness, Spec §FR-090j]
- [ ] CHK055 - Is the SSE `dispatch_decision` event payload schema (FR-090j live updates) defined alongside the GET response? [Gap, Spec §FR-090j]
- [ ] CHK056 - Are filter parameters (`agent`, `reason`, `time_range`, `policy_id` per FR-189) enumerated as query parameters in the diagnostic endpoint OpenAPI? [Completeness, Spec §FR-189]
- [ ] CHK057 - Is the evaluator-latency-histogram surface (FR-196) defined as a schema (buckets, units) in the diagnostic read endpoint? [Gap, Spec §FR-196]
- [ ] CHK058 - Is the read-only nature of `/system-health`, `/decisions`, `/audit`, `/dispatch` enforced via OpenAPI (only GET methods, no POST/PUT/DELETE)? [Consistency, Spec §FR-201]

## 8. Rate Limiting

- [ ] CHK059 - Is a per-operator rate limit specifically on `/api/resource-overrides` (per the prompt) defined separately from FR-203's general 60 req/min default? [Gap, Spec §FR-203]
- [ ] CHK060 - Is the rate-limit dimension (per-session vs per-API-key vs per-IP vs per-operator-id) precisely defined for state-changing endpoints? [Clarity, Spec §FR-203]
- [ ] CHK061 - Is the operator-vs-agent traffic separation (FR-216) tied to specific buckets, identifiers, or tokens? [Clarity, Spec §FR-216]
- [ ] CHK062 - Is the 429 `Retry-After` header schema (seconds vs ms) consistent across REST endpoints (FR-203) and OTLP receiver (FR-079b)? [Consistency, Spec §FR-203, §FR-079b]
- [ ] CHK063 - Is rate-limit observability (counters, alerts) specified? [Gap, Spec §FR-203]
- [ ] CHK064 - Is the rate-limit configuration storage (env var, workspace setting, table) defined? [Clarity, Spec §FR-203]

## 9. Input Validation (Zod / additionalProperties)

- [ ] CHK065 - Is FR-206's "field-level pointer JSON bodies" defined with a concrete pointer format (RFC 6901 JSON Pointer? Zod issue tree? `{path: [...], message}`)? [Clarity, Spec §FR-206]
- [ ] CHK066 - Is `additionalProperties=false` on every operator-supplied request body enforced uniformly across all 10 OpenAPI files (per FR-210)? [Consistency, Spec §FR-210]
- [ ] CHK067 - Are all operator-supplied fields (per Q41) covered by Zod schemas with explicit min/max bounds, enums, and format constraints? [Completeness, Spec §FR-206, Q41]
- [ ] CHK068 - Are unknown-field rejection error envelopes (FR-210) shape-distinct from value-out-of-range errors so a client can present different UX? [Gap, Spec §FR-206]
- [ ] CHK069 - Are sensitive fields (justification, confirmation_phrase, target API endpoints) length-bounded explicitly to prevent DoS via large bodies? [Coverage, Spec §FR-206]
- [ ] CHK070 - Is the body shape for an `Idempotency-Key` collision (different body, same key) defined (409? 422? specific error code)? [Gap, Spec §FR-209]

## 10. Cross-Cutting Requirements (Auth, Audit, Threat Model)

- [ ] CHK071 - Is operator authentication (FR-202) defined uniformly for browser sessions vs API-key-only callers across all governance endpoints? [Consistency, Spec §FR-202, §FR-204]
- [ ] CHK072 - Is the CSRF requirement (FR-204) explicitly tagged per-endpoint in the OpenAPI contracts (security scheme metadata)? [Completeness, Spec §FR-204]
- [ ] CHK073 - Is the cross-workspace 403 contract (FR-211) distinguishable from the 404-not-found case to avoid enumeration leaks (per FR-219)? [Clarity, Spec §FR-211, §FR-219]
- [ ] CHK074 - Is the `governance_api_request` activity row schema (FR-217) defined so audit-write requirements are traceable? [Gap, Spec §FR-217]
- [ ] CHK075 - Is the threat-model coverage for replay/enumeration/DoS/authz-bypass/CSRF (FR-219) explicitly mapped to specific endpoint × status-code defenses? [Completeness, Spec §FR-219]
- [ ] CHK076 - Are integration-test pairs (success/error) for every endpoint × status code (FR-220) enumerable from the OpenAPI contracts (i.e., is each documented response code testable)? [Measurability, Spec §FR-220]
- [ ] CHK077 - Is the requirement that every API-route module is added to `tsconfig.spec-strict.json` and `eslint.config.mjs` (FR-218, Convention J) auditable from the OpenAPI surface? [Traceability, Spec §FR-218]

---

**Total items:** 77
**Quality dimensions covered:** Completeness, Clarity, Consistency, Conflict, Coverage, Gap, Ambiguity, Measurability, Traceability
**Traceability rate:** 100% (every item references a Spec §, Contract §, or marker)

---

## Remediation Log (Loop 1, 2026-05-02)

The 21 [Gap]-marked items above were addressed in this remediation pass via amendments to `spec.md` and `contracts/*.openapi.yaml`. Each entry maps the original CHK to the new artifact text.

- CHK001 → unchanged status: `[spec]` consensus needed. `/api/resource-overrides` (agent-driven) and `/api/governance/overrides` (operator-driven) are BOTH intentional surfaces per FR-201a (new). The OpenAPI contract `governance-overrides.openapi.yaml` documents the operator path; an agent-path contract `resource-overrides.openapi.yaml` is NOT yet authored — this remains a tasks.md item, not a spec gap. Resolution: spec gap closed (FR-201a clarifies intent); contract gap deferred to Phase 5 tasks.
- CHK002 → resolved: FR-201a added to spec.md disambiguates the two path families (operator vs agent) and explicitly requires shared schemas + separate rate-limit buckets.
- CHK003 → resolved: FR-189a added to spec.md clarifies `/api/governance/diagnostic` is a UI-aggregator over `/decisions` + `/dispatch` + `/policy-events`. SSE channel is `/diagnostic/stream`.
- CHK012, CHK013 → resolved: FR-214a added; ErrorEnvelope schemas in `governance-policies`, `governance-overrides`, `governance-budgets`, `governance-windows`, `governance-collector`, `governance-system-health`, `otlp-receiver` now require `retryable: boolean` with explicit per-status-code classification.
- CHK017 → resolved: FR-079c added; otlp-receiver.openapi.yaml now documents 400 protobuf_decode_failed.
- CHK020 → resolved: FR-079c added; OTLP `partial_success` semantics specified per OTLP/HTTP 1.10.0.
- CHK022 → already resolved: FR-219j (existing) requires HTTP 400 `auth_header_conflict` when both `x-api-key` AND `Authorization` are supplied. (Note: FR-079c was drafted with a softer "prefer Authorization" rule but FR-219j's hard-reject takes precedence per Constitution Principle XIII Defensive Boundaries — recommend follow-up to reconcile in Phase 6 analyze.)
- CHK024 → resolved: FR-079c added; gzip Content-Encoding handling specified, decompressed-body 1 MiB cap defined.
- CHK029 → resolved: FR-079c added; otlp-receiver.openapi.yaml now lists 400, 405 (with Allow header), 415 explicitly.
- CHK033 → resolved: FR-205a added; 412 body now MUST include `details: { current_etag, current_version }`.
- CHK037 → resolved: FR-205a + FR-214a together provide the 412 body shape needed for the FR-288 diff affordance.
- CHK042 → resolved: FR-090h-i added; bulk-promote partial-failure is all-or-nothing with HTTP 409 `bulk_promote_partial_failure` and `failed_policy_ids` + `reasons` map.
- CHK044 → resolved: FR-090h-ii added; the maxItems: 500 cap is justified by SQLite txn budget, audit-row size budget, and operator-cognition budget.
- CHK046, CHK047, CHK048 → resolved: FR-208a added; per-endpoint flag-OFF behavior fully specified (GET lists return empty arrays + 200; singletons + mutations return 404 `feature_disabled`; OTLP gated by FEATURE_OPENCLAW_HEALTH_COSTS independently with 503 `feature_disabled`).
- CHK053 → resolved: FR-191a added; SystemHealth schema now includes `runbook_links[]` and `recovery_affordances[]`. governance-system-health.openapi.yaml updated.
- CHK055 → resolved: FR-189a specifies `/api/governance/diagnostic/stream` SSE channel multiplexing `decision`, `dispatch_decision`, `policy_event` event types.
- CHK057 → resolved: FR-196a added; histogram shape with explicit `buckets_ms`, `counts`, `total`, `p50_ms`, `p95_ms`, `p99_ms` fields and 5-minute rolling window.
- CHK059 → resolved: FR-203a added; per-operator override-grant rate limit of 10/min specified, distinct from FR-203's 60/min general bucket.
- CHK063 → resolved: FR-203b added; rate-limit observability counters (`governance.api.rate_limited{bucket}`, `governance.api.requests{bucket, status_class}`) and configuration source defined.
- CHK068 → resolved: FR-206a added; unknown-field rejections emit `code: "unrecognized_keys"` with `details.keys[]` distinct from value-out-of-range issues.
- CHK070 → already resolved: FR-219a (existing) defines Idempotency-Key collision semantics. FR-219a says different body returns HTTP 422 `idempotency_key_body_mismatch`; my FR-209a draft proposed HTTP 409 `idempotency_key_conflict`. Reconciliation: FR-219a (422) takes precedence as the existing spec authority; this is a Phase 6 analyze opportunity (Stripe convention is 409, but spec already chose 422 for consistency with other client-error envelope patterns).
- CHK074 → resolved: FR-217a added; `governance_api_request` schema fully specified with all fields including `actor_kind`, `path_family`, `request_hash`, `response_retryable`, `idempotency_key`, retention per FR-219p.

**Reconciliation note:** During remediation I drafted some FRs (FR-209a) that overlap or conflict with already-existing FR-219a/FR-219j. Those drafted FRs were NOT inserted; the existing FR-219* series takes precedence and is authoritative. This is flagged for Phase 6 (analyze) reconciliation rather than treated as a fresh gap.

**Files modified in this remediation:**
- specs/008-resource-governance/spec.md (added FR-201a, FR-203a, FR-203b, FR-205a, FR-206a, FR-208a, FR-214a, FR-217a, FR-079c, FR-189a, FR-191a, FR-196a, FR-090h-i, FR-090h-ii — 14 new sub-FRs)
- specs/008-resource-governance/contracts/governance-policies.openapi.yaml (ErrorEnvelope: + retryable, + retry_after_ms; details body shapes documented)
- specs/008-resource-governance/contracts/governance-overrides.openapi.yaml (ErrorEnvelope: + retryable)
- specs/008-resource-governance/contracts/governance-budgets.openapi.yaml (ErrorEnvelope: + retryable)
- specs/008-resource-governance/contracts/governance-windows.openapi.yaml (ErrorEnvelope: + retryable)
- specs/008-resource-governance/contracts/governance-collector.openapi.yaml (ErrorEnvelope: + retryable)
- specs/008-resource-governance/contracts/governance-system-health.openapi.yaml (SystemHealth: + runbook_links, + recovery_affordances; ErrorEnvelope: + retryable)
- specs/008-resource-governance/contracts/otlp-receiver.openapi.yaml (added 400, 405, 415 responses; ErrorEnvelope: + retryable; updated 503 description)

**Gaps closed:** 19 of 21 (CHK001 partial — spec resolved, contract file deferred to Phase 5; CHK022, CHK070 already resolved by existing FR-219j/FR-219a; consensus needed on minor reconciliation between drafted FR-209a and existing FR-219a)

