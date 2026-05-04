# Error-Handling Requirements Quality Checklist

**Purpose**: Unit tests for the error-handling requirements in SPEC-008 (Resource Governance). Validates that every failure mode is documented with sufficient clarity, completeness, consistency, measurability, and runbook coverage.

**Created**: 2026-05-02
**Domain**: error-handling
**Audience**: PR reviewer + autopilot consensus
**Depth**: Standard / release-gate
**Source artifacts**: spec.md (FR-001..030, FR-079a/b, FR-083, FR-090d, FR-090e, FR-090l, FR-090m, FR-151..170, FR-261..275); design concept (Q5, Q20, Q21, Q25, Q31, Q37, Q42, Q47, Q53, Q59, Q61, Q66); peer reviews

---

## Evaluator Failure Path (FR-001..030)

- [ ] CHK001 - Are evaluator-throws-on-internal-exception requirements complete (defer decision + audit row + activity row + notification + circuit breaker tick)? [Completeness, Spec §FR-005]
- [ ] CHK002 - Is "fail safe" defined unambiguously so two implementers would produce the same set of side-effects on evaluator throw? [Clarity, Spec §FR-005]
- [ ] CHK003 - Are the four gate points (admission, chain advancement, periodic re-eval, override-grant validation) consistently subject to the same fail-safe contract? [Consistency, Spec §FR-003 §FR-005]
- [ ] CHK004 - Is the precedence rule that defer is preferred over block on internal exception explicitly stated and justified vs. FR-002 precedence? [Consistency, Spec §FR-002 §FR-005]
- [ ] CHK005 - Are notification target, channel, and severity defined for the on-throw notification? [Resolved → Spec §FR-005a]
- [ ] CHK006 - Is the breaker-tick semantics quantified (tick increment, threshold, window) for evaluator-internal-exception ticks vs. ingest ticks? [Clarity, Spec §FR-005 §FR-006]
- [ ] CHK007 - Are circuit-breaker open/half-open/closed transition thresholds specified with concrete numbers (failure count, time window, probe budget)? [Measurability, Spec §FR-006 §FR-028]
- [ ] CHK008 - Are breaker-state-persisted-to-database semantics defined for crash mid-write (durability, atomicity)? [Edge Case, Spec §FR-006]
- [ ] CHK009 - Is `breaker_open_max_seconds` quantified with a default value and override path? [Clarity, Spec §FR-022]
- [ ] CHK010 - Is the "deterministic mode for tests" interface documented (clock injection, counter injection, fixture format)? [Clarity, Spec §FR-007]
- [ ] CHK011 - Are evaluator-exception decision rows guaranteed to satisfy FR-009 schema (decision_id, policy_ids[], precedence_rank, reasons[], breaker_state, evaluation_snapshot_json)? [Consistency, Spec §FR-005 §FR-009]
- [ ] CHK012 - Is the retry policy on `counter_value` rowcount=0 quantified (3 retries, exponential backoff base/cap)? [Clarity, Spec §FR-012]
- [ ] CHK013 - Is `defer:retry_exhausted` decision row format documented (reason code shape, telemetry tag)? [Clarity, Spec §FR-012]
- [ ] CHK014 - Are decision rows for `defer:invalid_policy` documented with a clear distinction from `defer:retry_exhausted` and `defer` on internal throw? [Consistency, Spec §FR-026]
- [ ] CHK015 - Is the audit-chain hash-pointer requirement (FR-030) consistently applied to all defer-on-throw audit rows, not only hard-enforcement-disable rows? [Consistency, Spec §FR-005 §FR-030]
- [ ] CHK016 - Are "audit row + activity row + notification + circuit breaker" written atomically (single transaction) on evaluator throw? [Edge Case, Gap]
- [ ] CHK017 - Is the behavior on partial-write failure (e.g., audit row writes but notification fails) specified? [Edge Case, Gap]
- [ ] CHK018 - Is breaker-half-open probe-budget exhaustion behavior specified (back to open, escalate, alert)? [Coverage, Spec §FR-028]
- [ ] CHK019 - Are breaker state transitions consistent across foreground (admission) vs. background (reconciler) connections per FR-060? [Consistency, Spec §FR-006 §FR-060]
- [ ] CHK020 - Is the runbook link for `breaker open beyond threshold` referenced from FR-022 traceable to a concrete `docs/runbook/<slug>.md` filename? [Traceability, Spec §FR-022 §FR-264]

## Ingest Path: Rate Limit / Payload / Schema / Disk (FR-079, FR-079a/b, FR-083, FR-090d, FR-090e)

- [ ] CHK021 - Are HTTP status codes for each ingest failure mode defined unambiguously (401 auth, 413 oversize, 429 rate-limit, 503 disk_full)? [Clarity, Spec §FR-079a]
- [ ] CHK022 - Are response body shapes for each error mode normative (exact `{ "error": ..., ... }` JSON schema)? [Clarity, Spec §FR-079a]
- [ ] CHK023 - Is the `Retry-After` header specified for both 429 and 503 responses with computable values? [Completeness, Spec §FR-079b]
- [ ] CHK024 - Is the per-IP token-bucket on 401 (10 fail/60s) defined for behavior on bucket exhaustion (block duration, reset semantics)? [Clarity, Spec §FR-079a]
- [ ] CHK025 - Is the 1 MiB payload-oversize threshold consistent between FR-079a and the per-source admission control numerics in FR-090e? [Consistency, Spec §FR-079a §FR-090e]
- [ ] CHK026 - Is the secret-redaction rule for 401 responses (no echo of supplied key) testable with a concrete assertion (e.g., regex)? [Measurability, Spec §FR-079a]
- [ ] CHK027 - Is `disk_full_pause` recovery (resume condition, hysteresis, operator action) specified? [Resolved → Spec §FR-090e1]
- [ ] CHK028 - Are amber→red and red→amber disk-state transition hysteresis windows defined to prevent flapping? [Edge Case, Spec §FR-090e]
- [ ] CHK029 - Is the `circuit_open` recovery rule (drops <10/min sustained 5min) consistent across all six sources (native_otel, cli_stdout_json, gateway_otel, transcript_replay, manual_post, provider_quota)? [Consistency, Spec §FR-090e]
- [ ] CHK030 - Are `schema_broken` and `schema_malicious` defined as distinct `reconcile_status` values with separate handling paths? [Gap, Spec §FR-083]
- [ ] CHK031 - Is `schema_malicious` (e.g., adversarial / oversized-field / injection-attempt payload) documented as a separate failure class with a specific remediation contract? [Gap]
- [ ] CHK032 - Are validation-error response semantics for ingest (HTTP 422 vs 400 vs persist-as-schema_broken) consistently applied? [Consistency, Spec §FR-083 §FR-039]
- [ ] CHK033 - Is the rate-limited 429 response distinct in body and observability from per-source ingest token-bucket throttling vs. per-IP 401 throttling? [Clarity, Spec §FR-079a]
- [ ] CHK034 - Are envelope-size defaults (8/16/4/2 KiB per source) traceable to measurement evidence? [Traceability, Spec §FR-090e]
- [ ] CHK035 - Is the cascade rule (tmpfs DATA_DIR ≤1.5 GB free → all sources `disk_full_pause`) defined with a verifiable acceptance criterion in FR-090m chaos suite? [Measurability, Spec §FR-090e §FR-090m]
- [ ] CHK036 - Are admission-control counter increments (`events_dropped`, `parse_errors`, `dedupe_collisions`) explicitly emitted on each failure mode? [Coverage, Spec §FR-090]
- [ ] CHK037 - Is the operator-override env-var precedence vs. policy-config_json precedence specified for ingest numerics? [Conflict, Spec §FR-090e]

## Copilot Schema-Broken Escalation Ladder (FR-083, FR-090d, FR-101)

- [ ] CHK038 - Is the Copilot schema-broken escalation ladder duration documented as `0h..24h` (per FR-083) or `0h..7d` (per workflow input) — which is canonical? [Conflict, Spec §FR-083]
- [ ] CHK039 - Are each rung of the escalation ladder defined with a (time-from-trigger, action, audience) triple? [Gap, Spec §FR-083 §FR-101]
- [ ] CHK040 - Is the trigger threshold (5 distinct `(session_id, copilot_version)` tuples failing T2 within rolling 1h) testable with a deterministic fixture? [Measurability, Spec §FR-083]
- [ ] CHK041 - Are the operator-acknowledgement requirements before manual canonicalization of schema_broken rows specified (UI affordance, REST endpoint, role)? [Completeness, Spec §FR-083]
- [ ] CHK042 - Is the `governance_telemetry_schema_unsupported` activity-row idempotency key (`(session_id, copilot_version)` per 1h) consistent with the FR-083 trigger key? [Consistency, Spec §FR-090d §FR-083]
- [ ] CHK043 - Are `schema_broken` rows guaranteed to never contribute to enforcement under any race condition (e.g., concurrent T2 retry)? [Edge Case, Spec §FR-083]
- [ ] CHK044 - Is the T1-pass + T2-fail extraction precedence (T1 extract → T2 validate) preserved on parser version upgrades? [Edge Case, Spec §FR-083]
- [ ] CHK045 - Are the post-2026-06-01 AI-Credits schema and pre-cutover premium-request schema both covered with explicit shape mismatch handling? [Coverage, Spec §FR-090d]
- [ ] CHK046 - Is the `LATEST_KNOWN_VERSION` fallback behavior bounded (escalation if many unknown versions seen, alert threshold)? [Resolved → Spec §FR-090d1]
- [ ] CHK047 - Are T3 unattended sampled-validation failures distinguished from T2 strict-validation failures in alert audience and runbook routing? [Consistency, Spec §FR-101]

## Backfill Window Failure (FR-114, FR-118, FR-124, FR-261..275)

- [ ] CHK048 - Is `max_duration_seconds` per backfill window defined with a default and override mechanism? [Resolved → Spec §FR-114a]
- [ ] CHK049 - Is the manual-retry contract for a failed backfill window documented (REST endpoint, role, idempotency, side-effects on counters)? [Resolved → Spec §FR-114b]
- [ ] CHK050 - Are the `(window_start, window_end, status, attempts, last_error)` fields defined with normative types and value enums? [Clarity, Spec §FR-114]
- [ ] CHK051 - Is the maximum `attempts` count before manual-retry-only mode quantified? [Resolved → Spec §FR-114a]
- [ ] CHK052 - Is interruption-resume semantics (cursor persistence, dedupe on resume) consistent with reconciler dedupe contract? [Consistency, Spec §FR-118]
- [ ] CHK053 - Is `max_backfill_horizon_hours` (default 168 h) consistent with retention policy and audit chain coverage? [Consistency, Spec §FR-124]
- [ ] CHK054 - Are partial-backfill-failure scenarios (some events succeed, some fail within a window) addressed? [Edge Case, Gap]
- [ ] CHK055 - Is the runbook for backfill stall / reconciler stall traceable to a specific `docs/runbook/<slug>.md` filename? [Traceability, Spec §FR-264]

## Aegis Emergency Reserve / Local Mode / Deferred-No-Fallback (FR-151..170)

- [ ] CHK056 - Is the chain "emergency reserve exhausted → local mode → deferred_no_fallback if LM Studio absent" explicitly specified in spec FRs? [Gap]
- [ ] CHK057 - Is `deferred_no_fallback` documented as a defined evaluator decision outcome (or task disposition) with a normative reason code? [Gap]
- [ ] CHK058 - Is "local mode" defined for Aegis (which model, which adapter, latency budget, governance scope) when emergency reserve is depleted? [Gap, Spec §plan.md "Force local mode"]
- [ ] CHK059 - Is "LM Studio absent" detected and quantified (heartbeat staleness threshold, probe cadence) before Aegis falls to `deferred_no_fallback`? [Gap]
- [ ] CHK060 - Is the precedence among emergency reserve, blackout window, and local-mode admission documented (FR-162 says blackout > reserve)? [Consistency, Spec §FR-162]
- [ ] CHK061 - Are `inactive`, `engaged`, `cooling_down` states defined with transition triggers and timeouts? [Clarity, Spec §FR-156]
- [ ] CHK062 - Is reserve replenishment cadence on policy window roll consistent with replenishment-failure fail-safe (FR-168)? [Consistency, Spec §FR-157 §FR-168]
- [ ] CHK063 - Is the Aegis bypass-attempted-but-blocked event (FR-167) emitted for both blackout-blocks and breaker-blocks of reserve usage? [Coverage, Spec §FR-167]
- [ ] CHK064 - Is the soft-alert vs. hard-alert distinction quantified (FR-154 soft alert vs. FR-160 high-priority on depletion)? [Clarity, Spec §FR-154 §FR-160]
- [ ] CHK065 - Are AC-Aegis-1..6 paths each mapped to a runbook section in `docs/runbook/aegis-emergency-reserve-depletion.md`? [Traceability, Spec §FR-165 §FR-264]

## Counter Rebuild Contention (FR-057, FR-058, FR-059, FR-066)

- [ ] CHK066 - Is `shadow_due_to_counter_rebuild` defined as a decision-fall-through outcome with normative reason code and admission-side effects? [Clarity, Spec §FR-057]
- [ ] CHK067 - Is the async chunked rebuild's interaction with concurrent reservation/consume events specified (do they queue, defer, or shadow)? [Edge Case, Spec §FR-058 §FR-057]
- [ ] CHK068 - Is rebuild-resume-from-cursor behavior idempotent under crash-mid-chunk? [Edge Case, Spec §FR-059]
- [ ] CHK069 - Is the post-rebuild verification step (ledger sum == counter value) atomic with the swap-in step? [Consistency, Spec §FR-066]
- [ ] CHK070 - Are drift tier transitions (auto-repair → operator-confirmed → hard-block) defined with debounce/hysteresis to avoid oscillation? [Edge Case, Spec §FR-057]
- [ ] CHK071 - Is `pending_rebuild_job_id` lifecycle (assign, run, complete, fail-and-retry) documented? [Resolved → Spec §FR-058a]

## Runbook Coverage (Q61, FR-090l, FR-090m, FR-264..274)

- [ ] CHK072 - Does the spec enumerate one runbook page per failure mode covered by this checklist (collector outage, reconciler stall, counter drift, breaker stuck open, audit chain mismatch, emergency reserve depletion, source schema break, encryption key rotation, retention sweep failure, migration rollback)? [Coverage, Spec §FR-264]
- [ ] CHK073 - Is each error mode in the ingest path (rate_limit, payload_oversize, schema_broken, schema_malicious, disk_full) mapped to a runbook page? [Resolved → Spec §FR-264a]
- [ ] CHK074 - Is the Copilot 0h..24h escalation ladder runbook coverage explicit and traceable? [Traceability, Spec §FR-083 §FR-264]
- [ ] CHK075 - Is the backfill-window-failure runbook explicitly listed in FR-264 enumeration? [Resolved → Spec §FR-264a]
- [ ] CHK076 - Is the Aegis local-mode / deferred_no_fallback runbook coverage explicit? [Resolved → Spec §FR-264a (runbook coverage); CHK056-059 must still resolve the underlying chain semantics for consensus]
- [ ] CHK077 - Are runbook H2 sections (Symptom, Severity, Likely causes, Diagnostic commands, Recovery steps, Verification, Escalation) enforced by automation (not just convention)? [Measurability, Spec §FR-090l]
- [ ] CHK078 - Is the chaos-test harness `pnpm test:chaos` requirement that each runbook's primary recovery command runs against a simulated failure mode covering all 10 pages (or expanded set if new error modes are added)? [Coverage, Spec §FR-090m]
- [ ] CHK079 - Is the orphan-runbook detection rule (CI flags `runbook_slug` references without matching file) consistent with the new error modes added by this checklist? [Consistency, Spec §FR-090m §FR-274]
- [ ] CHK080 - Is "every failure mode has a runbook page" stated as a normative requirement (Q61) or only as enumeration in FR-264? [Clarity, Spec §FR-264]

## Cross-Cutting Quality

- [ ] CHK081 - Is a unified failure-mode taxonomy documented so identical failure conditions don't get inconsistent reason codes across evaluator/ingest/backfill/Aegis paths? [Consistency, Gap]
- [ ] CHK082 - Are alert priorities (soft, high, critical) defined uniformly across all error-handling FRs? [Consistency]
- [ ] CHK083 - Are activity-row idempotency keys defined for all "fire one alert per N condition" requirements (Q47 1h windows, FR-090d, FR-090e)? [Completeness]
- [ ] CHK084 - Is the byte-compat regression check (FR-238) extended to error paths (i.e., flag-OFF preserves legacy error behavior)? [Coverage, Spec §FR-238]
- [ ] CHK085 - Are operator-acknowledgement, operator-override, and operator-revoke flows for error states (drift, schema_broken, hard-enforcement-disable) consistent in REST contract (idempotency, rate-limit, audit)? [Consistency, Spec §FR-021 §FR-057 §FR-083]
- [ ] CHK086 - Is the threat-model coverage (FR-219) explicit for the new error modes (replay of 429/503 responses, enumeration via 401 error shapes)? [Coverage, Spec §FR-219]
- [ ] CHK087 - Are observability metrics emitted for every error mode (per-source `events_dropped`, breaker-state, drift-tier, schema_broken_count, reserve_depletion_count) traceable to FR-024/FR-090/FR-170? [Traceability, Spec §FR-024 §FR-090]
- [ ] CHK088 - Are all "MUST emit a high-priority alert" clauses (FR-022, FR-129, FR-160) consistent in payload schema (alert_id, runbook_slug, severity, ts)? [Consistency]
- [ ] CHK089 - Is "fail safe to soft-alert" (FR-168) defined uniformly with FR-005 evaluator-throws-defer fail-safe? [Consistency, Spec §FR-005 §FR-168]
- [ ] CHK090 - Is a requirement & error-code ID scheme established so each failure mode (e.g., `defer:retry_exhausted`, `disk_full_pause`, `schema_broken`) has a globally unique stable identifier? [Traceability, Gap]
