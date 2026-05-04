# Security Checklist: SPEC-008 Resource Governance and Cost Tracker Enforcement

**Purpose**: Validate the QUALITY of security requirements written into spec.md / plan.md (NOT the implementation). Each item asks "is the requirement well-written, complete, unambiguous, measurable, consistent?" — this is a requirements unit-test suite, not a verification suite.

**Created**: 2026-05-02
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md)
**Domain**: security
**Sources surveyed**: spec.md (FR-079a/b, FR-090b/c, FR-090h, FR-201..220, FR-261..275); plan.md (security & supply-chain sections); design concept Q25, Q41, Q47, Q60, Q61, Q63, Q67, Q68, Q69, Q70, Q71, Q72, Q73; peer-review-round-3 (security/compliance).

---

## Override Grant Security (idempotency, TTL, sanitized reason)

- [ ] CHK001 - Are override-grant `Idempotency-Key` header semantics specified for all replay scenarios (same key + same body, same key + different body, key reuse after success, key reuse after failure)? [Completeness, Spec §FR-209, Q41]
- [x] CHK002 - Is the `Idempotency-Key` retention window (how long the server remembers a key) defined with a specific time bound? [Resolved, Spec §FR-219a]
- [ ] CHK003 - Is the upper bound on `expires_at` (`granted_at + 24h`) consistently expressed across spec.md (FR-179), Q41 table, and Q65 sanity guardrails? [Consistency, Spec §FR-179, Q41, Q65]
- [x] CHK004 - Is the lower bound on override TTL (minimum duration; preventing 0-second grants) specified? [Resolved, Spec §FR-219b]
- [ ] CHK005 - Are sanitization requirements for `resource_overrides.reason` quantified (length 1..500, DOMPurify on display, verbatim at rest) without ambiguity about which surface applies? [Clarity, Q41]
- [x] CHK006 - Are the sanitizer's escape semantics defined for control characters, null bytes, and non-UTF-8 bytes in `reason`? [Resolved, Spec §FR-219c]
- [ ] CHK007 - Is the per-operator override-grant rate limit (5/min, 100/day) consistently stated between Q68 and the FR-203 default 60 req/min text? [Consistency, Spec §FR-203, Q68]
- [ ] CHK008 - Is the override-anomaly threshold (>20 grants in 10min → alert; >30/h → auto-disable) measurable with a specific clock source and dedupe rule? [Measurability, Q68]
- [x] CHK009 - Is the auto-disable recovery path (how an operator regains grant capability after a 30-anomaly auto-disable) documented in requirements? [Resolved, Spec §FR-219d]
- [ ] CHK010 - Are the `force=true` audit-tagging requirements (FR-`forced=true`) consistent between Q65 sanity guardrails and the audit-row schema in FR-184? [Consistency, Q65, Spec §FR-184]
- [ ] CHK011 - Are sanity bounds on `reserved_estimated_cost_usd` (>50% daily budget triggers force) measurable for multi-currency or non-USD scopes? [Coverage, Q41, Q65]

## Threat Model — schema_broken vs schema_malicious

- [ ] CHK012 - Is the boundary between `schema_broken` (Q25) and `schema_malicious` (Q41) defined with non-overlapping detection criteria? [Clarity, Q25, Q41]
- [ ] CHK013 - Are the `schema_malicious` triggers (numeric out of bounds, deep nesting, oversized strings, prototype pollution, invalid UTF-8) each quantified with specific thresholds (depth limit, string length, numeric ceiling)? [Measurability, Q41]
- [x] CHK014 - Is the JSON depth limit for incoming payloads defined to prevent stack-exhaustion DoS? [Resolved, Spec §FR-219e]
- [ ] CHK015 - Are prototype-pollution defenses specified for both `provider_accounts.config_json` and `resource_policies.policy_config_json` (key-allowlist, `__proto__`/`constructor`/`prototype` rejection)? [Completeness, Q41]
- [ ] CHK016 - Is the source-disable side effect on `schema_malicious` ("source disabled until operator confirms") consistent with `ingest_rate_state.state` transitions in Q47? [Consistency, Q41, Q47]
- [ ] CHK017 - Are replay-attack detection requirements (UNIQUE on `source, source_event_id`; `governance_replay_detected`) consistent with idempotency-key semantics for REST POSTs? [Consistency, Q41, Spec §FR-209]
- [ ] CHK018 - Is the threat-model coverage list in FR-219 (replay, enumeration, DoS, authz bypass, CSRF) explicitly mapped to mitigations in Q41/Q47/Q68? [Traceability, Spec §FR-219]
- [x] CHK019 - Are 404-vs-403 disambiguation rules specified with examples to prevent enumeration leaks? [Resolved, Spec §FR-219g]
- [ ] CHK020 - Is the response surface for `schema_malicious` specified to ensure it never echoes attacker payloads (no `payload_excerpt` to operator UI)? [Completeness, Q41, Q67]

## Quarantined Raw Events (oversized + malicious shapes)

- [ ] CHK021 - Are the `quarantined_raw_events.reason` enum values (`rate_limit`, `disk_full`, `schema_malicious`, `oversized`) exhaustive for every drop path in Q47? [Completeness, Q47]
- [ ] CHK022 - Is the `payload_excerpt` 1KB cap consistent with Q67 redaction (which says `payload_excerpt` is replaced by structured metadata)? [Conflict, Q47, Q67]
- [ ] CHK023 - Is the 100KB oversized-payload threshold consistent with the 1MiB OTLP receiver cap in FR-079a? [Consistency, Spec §FR-079a, Q47]
- [x] CHK024 - Are operator review/clear/promote/discard requirements for quarantined events specified? [Resolved, Spec §FR-219h]
- [x] CHK025 - Is the retention policy for `quarantined_raw_events` specified in Q43 / Q63 retention defaults? [Resolved, Spec §FR-219i]
- [ ] CHK026 - Are quarantine notifications (alert delivery, deduplication, severity) consistent with FR-194/FR-195 throttle rules? [Consistency, Spec §FR-194, Q47]

## Authentication & Authorization

- [x] CHK027 - Is the OTLP receiver auth contract (FR-079a) explicit that header injection (e.g., setting both `x-api-key` and `Authorization`, conflicting tokens) is rejected? [Resolved, Spec §FR-219j]
- [ ] CHK028 - Is the order of evaluation (auth → CSRF → Zod → rate-limit → handler) in Q68 consistent across every governance route, including OTLP, REST CRUD, and read-only endpoints? [Consistency, Q68, Spec §FR-079a, FR-202]
- [ ] CHK029 - Is the operator-vs-Aegis-service-token distinction (Q68 actor classes) enforced by requirements at every state-changing endpoint, with explicit AC? [Coverage, Q68, Spec §FR-211]
- [ ] CHK030 - Is the Aegis service-token format (`aegis-<workspace_id>-<token>`) workspace-bound check measurable in tests (AC-Auth-4)? [Measurability, Q68]
- [ ] CHK031 - Are the 401 response-body redaction requirements (no echoed key fragments, no key prefix, no length leak) specified for ALL auth-failure paths, not just OTLP? [Coverage, Spec §FR-079a, Q68]
- [x] CHK032 - Is the per-IP 401 rate limit (10/60s/IP) specified for REST endpoints in addition to OTLP, or is OTLP the only auth surface with per-IP limiting? [Resolved, Spec §FR-219k]
- [ ] CHK033 - Is the CSRF token rotation cadence (every 30 days) consistent with session lifetime requirements? [Consistency, Q68]
- [ ] CHK034 - Are CSRF requirements explicit about which methods bypass CSRF (GET only) and how OPTIONS / HEAD / TRACE are handled? [Clarity, Spec §FR-204, Q68]
- [x] CHK035 - Is the cross-workspace 403 enforcement (FR-211) explicit that workspace_id is derived server-side from the auth claim, never from request body or query string? [Resolved, Spec §FR-219l]
- [ ] CHK036 - Are viewer-class permissions explicit about which read endpoints are exposed and which are hidden (e.g., does viewer see audit chain rows)? [Coverage, Q68]

## Audit Log Integrity (append-only + hash chain)

- [ ] CHK037 - Is the append-only constraint on `resource_budget_ledger` enforced by both DB-level convention and application-level check (no UPDATE permitted)? [Completeness, Spec §FR-010, FR-051, Q69]
- [ ] CHK038 - Is the hash-chain canonicalization (`canonicalizeForHash`) specified field-by-field to prevent ambiguous-encoding tamper bypass? [Clarity, Q69]
- [x] CHK039 - Are hash-chain genesis-row semantics (`prev_id IS NULL`, `row_hash` of empty-prev) defined? [Resolved, Spec §FR-219m]
- [x] CHK040 - Is the daily 04:30 UTC chain-walk verification job's behavior on partial walk (interrupted job, restart) specified? [Resolved, Spec §FR-219n]
- [ ] CHK041 - Are tamper-detection alert requirements (FR-177) explicit about the affected row range, severity, and operator escalation path? [Completeness, Spec §FR-177, Q69]
- [ ] CHK042 - Is the audit-log retention guard (FR-178: ≥1y; Q63: 1825 days; Q69: 5y) consistently expressed across all three sources? [Conflict, Spec §FR-178, Q63, Q69]
- [ ] CHK043 - Is FR-259 (retention sweep MUST NOT remove rows referenced by an active reservation or open override grant) consistent with Q69's chain-walk preservation guarantees? [Consistency, Spec §FR-259, Q69]
- [ ] CHK044 - Are `canonical_audit_summary` denormalization requirements (Q69) explicit about which fields are preserved and which are dropped to prevent silent audit gaps? [Completeness, Q69]
- [ ] CHK045 - Is the post-restore audit-chain replay requirement (FR-273) explicit about behavior when chain mismatch is detected (block re-enable? alert + continue? rollback?)? [Clarity, Spec §FR-273]
- [x] CHK046 - Are recovery_action audit rows (FR-199) required to participate in the same hash chain as ledger rows, or are they a separate chain? [Resolved, Spec §FR-219o]
- [ ] CHK047 - Is the typed-confirmation phrase (FR-184, FR-090h: `PROMOTE TO SOFT`/`PROMOTE TO HARD`) recorded verbatim in the audit row, with case-sensitivity and whitespace handling specified? [Clarity, Spec §FR-090h, FR-184]

## Per-Operator Override Rate Limit (abuse prevention)

- [ ] CHK048 - Is the per-actor token-bucket persistence requirement ("60s persistence to DB for cross-restart") explicit about whether buckets reset, drain, or resume on restart? [Clarity, Q68]
- [ ] CHK049 - Are rate-limit responses (429 + `Retry-After`) consistent across Q68, FR-203, and FR-079a? [Consistency, Q68, Spec §FR-203, FR-079a]
- [ ] CHK050 - Are operator-vs-agent traffic separation requirements (FR-216) measurable (separate buckets? weighted shares? hard reservation?)? [Measurability, Spec §FR-216]
- [ ] CHK051 - Is rate-limit bypass behavior for high-priority alerts (FR-195) defined to prevent accidental amplification of malicious traffic? [Coverage, Spec §FR-195]

## License Compliance + Supply Chain

- [ ] CHK052 - Is the license allow-list (FR-227, FR-239, Q72) consistently expressed (MIT, Apache-2.0, BSD-2/3, ISC, Unlicense) and the deny-list (AGPL, SSPL, Commons Clause, Elastic-2.0) explicit? [Consistency, Spec §FR-227, Q72]
- [ ] CHK053 - Is the GPL-* "warning vs reject" posture in Q72 unambiguous (does CI fail or just warn)? [Ambiguity, Q72]
- [ ] CHK054 - Are license-CI-gate requirements explicit about transitive dependencies, optional deps, dev deps, and bundled binaries? [Coverage, Spec §FR-239, Q72]
- [ ] CHK055 - Is the `otelcol-contrib` pinning chain (version + SHA-256 + cosign signing identity) specified completely in FR-090b, with quarterly refresh cadence? [Completeness, Spec §FR-090b, Q72]
- [x] CHK056 - Is the `J-Bax/copilot-token-tracker` "schema-only / not a runtime dep" boundary auditable (e.g., a CI check forbidding it from `package.json`)? [Resolved, Spec §FR-219s]

## provider_accounts.config_json Validation

- [ ] CHK057 - Is the 10KB max size for `provider_accounts.config_json` (Q41) consistent with the encryption envelope overhead from Q70 (libsodium secretbox + base64)? [Consistency, Q41, Q70]
- [ ] CHK058 - Are Zod-schema requirements explicit per provider (Anthropic, OpenAI, Copilot, Ollama, OpenClaw) with `additionalProperties=false`? [Completeness, Q41, Spec §FR-210]
- [ ] CHK059 - Are prototype-pollution defenses for `config_json` measurable (e.g., parse with `Object.create(null)` reviver; reject `__proto__`/`constructor`/`prototype` keys)? [Measurability, Q41]
- [x] CHK060 - Is the cleartext/`_encrypted` key boundary (Q70) explicit about which fields per provider belong on each side? [Resolved, Spec §FR-219u]
- [x] CHK061 - Are key-derivation requirements (Q70: SHA-256 of `AUTH_SECRET`) specified to handle `AUTH_SECRET` rotation and re-encryption migration? [Resolved, Spec §FR-219v]
- [ ] CHK062 - Is the `<encrypted>` placeholder redaction in REST GET responses (Q70) consistent with FR-073 / FR-100 / Q73 logging redaction patterns? [Consistency, Q70, Q73]
- [x] CHK063 - Are encryption-failure semantics (decrypt error → reject? redact? alert?) specified? [Resolved, Spec §FR-219v]

## ToS Compliance (copilot_internal/user, undocumented surfaces)

- [ ] CHK064 - Is the default-disabled posture for `copilot_internal/user` polling (Q71) consistent with FR-263 backup encryption + FR-090d Copilot CLI parser semantics (which read local files only)? [Consistency, Q71, Spec §FR-090d]
- [x] CHK065 - Are operator ToS-acknowledgment requirements (`governance_tos_acknowledgments_json`) specified with retention, revocation, and re-prompt cadence? [Resolved, Spec §FR-219w]
- [ ] CHK066 - Is the typed-confirmation field for ToS opt-in defined with the same case-sensitivity rules as FR-090h? [Consistency, Q71, Spec §FR-090h]
- [x] CHK067 - Is `docs/observability/provider-tos-considerations.md` (Q71 deliverable) referenced in the spec as a required deliverable, with structure equivalent to FR-090l runbook H2 schema? [Resolved, Spec §FR-219x]
- [ ] CHK068 - Are fallback-when-surface-breaks behaviors specified per surface (degrade to no-data? mark `untrusted`? halt enforcement?)? [Coverage, Q71]
- [x] CHK069 - Is the user-agent / header policy for any ToS-flagged surface specified (no spoofing of VS-Code identifiers without operator consent)? [Resolved, Spec §FR-219y]

## PII / Content Redaction (Q67, Q73)

- [ ] CHK070 - Is the SAFE_ATTRIBUTE_KEYS allowlist in Q67 cross-referenced from spec.md as a NORMATIVE requirement (not just design-concept guidance)? [Traceability, Q67]
- [ ] CHK071 - Are journal/stderr redaction patterns (Q73) explicit about precedence when multiple patterns match (longest match? first match? all replaced?)? [Clarity, Q73]
- [ ] CHK072 - Is `governance_health_events.detail` redaction-on-write (Q73) consistent with `payload_excerpt` quarantine field semantics (Q47)? [Consistency, Q47, Q67, Q73]
- [ ] CHK073 - Is `OTEL_LOG_USER_PROMPTS=1` handling specified to ensure prompt content never reaches `raw_attributes_json`, `payload_excerpt`, or stderr? [Coverage, Q67]
- [ ] CHK074 - Are `MC_LOG_REDACT=false` opt-out semantics specified with explicit operator UI banner + audit row when toggled? [Completeness, Q73]

## Threat-Model Cross-Cutting

- [x] CHK075 - Is timing-attack resistance (constant-time comparison for API keys, CSRF tokens, hash-chain row_hash) specified in requirements? [Resolved, Spec §FR-219z]
- [ ] CHK076 - Are HTTP method restrictions per endpoint specified (e.g., POST-only for grants; PUT-only for ETag updates)? [Coverage, Spec §FR-201..220]
- [ ] CHK077 - Are dependency-pinning requirements (FR-227) explicit about lockfile integrity (e.g., `pnpm install --frozen-lockfile` in CI)? [Completeness, Spec §FR-227]
