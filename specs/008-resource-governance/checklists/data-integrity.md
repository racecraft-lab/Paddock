# Data Integrity Requirements Checklist — SPEC-008 Resource Governance

**Purpose**: Unit-test the data-integrity requirements (migrations, append-only ledger, dedup, cumulative-to-delta, atomic reservations, drift, audit chain) for completeness, clarity, consistency, measurability, and coverage.

**Created**: 2026-05-02
**Feature**: SPEC-008 Resource Governance and Cost Tracker Enforcement
**Domain**: data-integrity (Phase 4)
**Source artifacts**: `spec.md` (FR-051..FR-110, FR-090a..g, FR-241..FR-260a/b, FR-294), `plan.md`, `data-model.md`, design concept Q6/Q17/Q18/Q24/Q26/Q27/Q28/Q30/Q34/Q35/Q40/Q49/Q50/Q57/Q69, peer-review-rounds 1–3.

---

## Migration Ordering, FK Constraints, Idempotency (M63 + M64a..M64m + M65)

- [ ] CHK001 — Are the dependency relationships between M63, M64a..m, and M65 explicitly enumerated as a DAG with one edge per dependency, not just an ordered list? [Completeness, Spec §FR-255, data-model.md §M63..M64m]
- [ ] CHK002 — Is the ordering rationale for `M64a → M64b → M64c → M64d → M64e → M64f → M64g → M64h → M64i → M64j → M64k → M64l → M64m` documented per-step (which FK forces this step to follow the prior)? [Clarity, Spec §FR-085, FR-255]
- [ ] CHK003 — Does the spec define the migration runner's behavior when `PRAGMA foreign_key_check` returns a non-`ok` row mid-suite (abort, partial rollback, alerts)? [Completeness, data-model.md §"Final Migration-Suite PRAGMA"]
- [ ] CHK004 — Is the migration safety contract (parser validation, shadow-run, timing benchmark, rollback rehearsal) measurable with explicit pass criteria for each gate? [Measurability, Spec §FR-247]
- [ ] CHK005 — Are rerun-safety requirements quantified (every CREATE uses `IF NOT EXISTS`, every INSERT uses `OR IGNORE`, every ALTER guarded by version check)? [Clarity, Spec §FR-245]
- [ ] CHK006 — Are migrations forbidden from issuing destructive operations spelled out exhaustively (DROP COLUMN, DROP TABLE, RENAME COLUMN, etc.) or only "DROP COLUMN"? [Completeness, Spec §FR-245]
- [ ] CHK007 — Does the spec define expected behavior when M63 ALTERs encounter a column that was already added (e.g., from a partial prior run)? [Edge Case, Gap]
- [ ] CHK008 — Are FK constraint requirements stated for every cross-table reference shown in the FK graph, including the weak references called out (`merge_sources_json`, `source_event_id`)? [Completeness, data-model.md §"Foreign Key Graph"]
- [ ] CHK009 — Are the consequences of weak (non-FK) references documented (orphan-detection sweep, integrity-check cadence, what to do on dangling id)? [Completeness, Gap]
- [ ] CHK010 — Is the migration order requirement consistent between FR-085 ("source registry, raw, canonical, reconciler tables") and the data-model.md M64a..M64m enumeration (24 tables)? [Consistency, Spec §FR-085, data-model.md §"Per-Migration Schema Detail"]
- [ ] CHK011 — Are migration test-harness coverage requirements defined for every one of the 15 migration files individually, not just M63/M64 in aggregate? [Completeness, Spec §FR-256]
- [ ] CHK012 — Is the requirement to add new migrations to the existing migration test suite (FR-257) measurable (which test file? what asserts? what fixtures?)? [Measurability, Spec §FR-257]
- [ ] CHK013 — Does the spec define whether the `PRAGMA integrity_check` step runs once at end of M64m, once after M65, or after every sub-migration? [Clarity, Conflict, data-model.md §"Final Migration-Suite PRAGMA"]
- [ ] CHK014 — Are rollback ordering requirements specified (must rollbacks run in reverse migration order, are dependencies bidirectional)? [Gap, Spec §FR-243, FR-260]
- [ ] CHK015 — Is the rollback-rehearsal cadence quantified (per release, per migration, per CI run)? [Clarity, Spec §FR-244, FR-247]
- [ ] CHK016 — Are M65 token_pricing seed-data requirements (which models, which provider, which pricing source-of-truth) explicit and cite the source TS file? [Completeness, Spec §FR-260a, data-model.md §M65]
- [ ] CHK017 — Does the spec define handling of pre-existing `provider_subscriptions` rows during M64l migration (deduplication, error on conflict, audit trail)? [Edge Case, Spec §FR-143, data-model.md §M64l]
- [ ] CHK018 — Are migration timing benchmarks (FR-247(c)) given threshold values (e.g., M63 must complete < N seconds on 300k-row DB)? [Measurability, Gap]

## Append-Only Ledger + Tamper Detection + Hash Chain

- [ ] CHK019 — Is the cryptographic hash algorithm for `resource_decision_audit` (SHA-256, SHA-512, BLAKE2, etc.) explicitly specified? [Gap, Clarity, Spec §FR-176]
- [ ] CHK020 — Is the exact input-string formula for `curr_hash` defined (which columns, in what order, with what separators, what canonical encoding)? [Gap, Clarity, Spec §FR-176]
- [ ] CHK021 — Is the genesis-hash requirement (value of `prev_hash` for the first row) specified (zero-string, NULL, fixed sentinel, per-workspace seed)? [Gap, Spec §FR-176]
- [ ] CHK022 — Is the audit-chain integrity-verification cadence quantified (configurable cadence "is configurable" but no default given)? [Clarity, Spec §FR-176, FR-177]
- [ ] CHK023 — Does the spec define behavior when integrity verification finds a mismatch (alert only, freeze writes, continue, snapshot the chain)? [Completeness, Spec §FR-177]
- [ ] CHK024 — Are append-only enforcement mechanisms specified for `resource_decision_audit` and `resource_budget_ledger` (DB triggers prohibiting UPDATE/DELETE, application-layer convention, neither)? [Gap, Completeness]
- [ ] CHK025 — Are the consequences of detecting tampering documented in the runbook structure (FR-090l) or only "alert"? [Completeness, Gap]
- [ ] CHK026 — Is "every audit row contains a hash of the previous audit row's hash" unambiguous about whether `curr_hash` includes `prev_hash` as input or just stores it as a sibling column? [Clarity, Ambiguity, Spec §FR-176]
- [ ] CHK027 — Are partition-boundary semantics defined for the hash chain when `resource_decision_audit` is retention-swept (does the chain re-genesis after archival)? [Edge Case, Gap, Spec §FR-178, FR-249, FR-250]
- [ ] CHK028 — Does the spec specify whether audit-chain verification covers archived partitions or only live rows? [Coverage, Gap]
- [ ] CHK029 — Are tamper-evident requirements consistent between FR-030 (hard-enforce-disable audit), FR-158 (Aegis emergency-reserve), FR-176 (general audit chain), and FR-225 — same algorithm, same chain, or separate chains? [Consistency, Spec §FR-030, FR-158, FR-176]
- [ ] CHK030 — Are write-time invariants of the ledger documented (must `balance_after = previous_balance + delta`)? [Completeness, data-model.md §M64e]
- [ ] CHK031 — Is the requirement that `resource_budget_ledger` is "append-only" enforced at schema, application, or both — and is enforcement gap surfaced? [Clarity, Spec §FR-051, Gap]

## Two-Layer Raw + Canonical Dedup (request_id never produces additive double-count)

- [ ] CHK032 — Does the spec define the dedup key precisely as `(provider_request_id, provider_timestamp_ms)` for raw → canonical, or are additional discriminators (provider, session_id) required to avoid cross-provider collisions? [Clarity, Conflict, Spec §FR-092, data-model.md §M64c idx_canonical_dedup uses 3-column key]
- [ ] CHK033 — Are dedup behaviors specified when `provider_request_id` is NULL or empty (drop, hash a synthetic key, emit `dedupe_confidence='low'`)? [Edge Case, data-model.md §M64c, Gap]
- [ ] CHK034 — Are the conditions for `dedupe_confidence` values (`high`, `medium`, `low`) enumerated explicitly with input criteria for each? [Clarity, Spec §FR-082, data-model.md §M64c]
- [ ] CHK035 — Is the requirement "same `request_id` never produces additive double-count" testable as an explicit acceptance criterion with a fixture (two raw events, identical request_id, assert one canonical row, one ledger entry, one counter delta)? [Measurability, Gap, Spec §FR-091, FR-093]
- [ ] CHK036 — Does the spec define behavior when two raw events with identical `(request_id, timestamp_ms)` differ on field values (token counts, cost) — which wins, or do both contribute to a `merged` provenance row? [Edge Case, Gap, Spec §FR-102]
- [ ] CHK037 — Are `merge_sources_json` content requirements specified (must list every contributing raw_id, must be ordered, must cap length, must persist forever)? [Completeness, Spec §FR-102]
- [ ] CHK038 — Is the posted-effect dedup contract (a canonical event applied to a policy exactly once) testable end-to-end (two reconciler runs over the same window, assert `canonical_budget_effects` row count unchanged)? [Measurability, Spec §FR-093, FR-098]
- [ ] CHK039 — Are correction-ledger semantics specified for the case where a raw event arrives whose canonical event was already retention-swept? [Edge Case, Gap, Spec §FR-094, FR-106]
- [ ] CHK040 — Does the spec define whether `correction_ledger.applied = 1` writes are atomic with the inverse `resource_budget_ledger` correction entry (i.e., both inside one transaction)? [Clarity, Spec §FR-103, FR-104]
- [ ] CHK041 — Are dedup-rollback cascade requirements specified (when a duplicate is detected late, must counter, ledger, and posted-effect all roll back atomically)? [Completeness, Spec §FR-104, FR-062]
- [ ] CHK042 — Is "reconciler MUST be idempotent" measurable (re-running over identical raw window must produce byte-identical canonical rows, not just same row count)? [Measurability, Spec §FR-098]
- [ ] CHK043 — Are reconciler-batch overlap rules specified (can two batches overlap in time, must they be strictly sequential, what locks apply)? [Gap, Coverage, Spec §FR-097]

## Codex Cumulative-to-Delta with generation_id Reset Boundaries

- [ ] CHK044 — Is the term `generation_id` defined anywhere in the spec, plan, or data-model with respect to Codex CLI cumulative reporting? [Gap, Ambiguity, Spec §FR-072, FR-082]
- [ ] CHK045 — Are reset-boundary rules specified for cumulative-to-delta conversion (when does the running total reset — per session, per process restart, per generation_id rollover, per provider clock change)? [Gap, Clarity, Spec §FR-072, FR-082]
- [ ] CHK046 — Does the spec define how a backwards-going cumulative counter (delta < 0) is handled (drop, treat as reset, alarm, quarantine)? [Edge Case, Gap]
- [ ] CHK047 — Are Codex stdout↔rollout join confidence rules consistent between FR-072 (uses `provider_timestamp_ms`) and FR-082 (high vs medium join_confidence semantics)? [Consistency, Spec §FR-072, FR-082]
- [ ] CHK048 — Is the "downgraded to soft" branch for the Codex spike measurable (which spike outcome flips the registry row, what audit trail fires)? [Measurability, Spec §FR-082, FR-090a]
- [ ] CHK049 — Does the spec define behavior when Codex emits a cumulative value identical to the previous reading (zero delta, dedup, ignore)? [Edge Case, Gap]
- [ ] CHK050 — Are cumulative-to-delta requirements consistent with the snapshot model (FR-111 "snapshot row carries cumulative counter values + delta window")? [Consistency, Spec §FR-072, FR-111]

## Reservation Atomicity (BEGIN IMMEDIATE + atomic conditional UPDATE)

- [ ] CHK051 — Does the spec or plan explicitly require `BEGIN IMMEDIATE` (or equivalent SQLite write-locking transaction kind) for reservation grants, or only `db.transaction(() => { ... })`? [Gap, Clarity, Spec §FR-054, plan.md §"Atomic counter conditional UPDATE"]
- [ ] CHK052 — Is the conditional-UPDATE pattern specified with an exact SQL form (e.g., `UPDATE counters SET counter_value = counter_value - ?, version = version + 1 WHERE policy_id=? AND window_id=? AND counter_value >= ? AND version = ?`)? [Clarity, plan.md §"split UPDATE patterns", Spec §FR-053]
- [ ] CHK053 — Is the optimistic-lock primitive (`version` column on `resource_budget_counters`, data-model.md §M64f) referenced from the reservation-grant FRs to make the link explicit? [Traceability, Gap, Spec §FR-054, data-model.md §M64f]
- [ ] CHK054 — Are the three split-update paths (reserve, release, consume) defined with their exact `WHERE` clauses and rowcount-expected outcomes? [Completeness, Spec §FR-053, plan.md]
- [ ] CHK055 — Is the AC-Race-1 acceptance criterion measurable beyond "exactly one 201, four 409" (e.g., assertion on counter_value after race, on number of `resource_reservations` rows)? [Measurability, Spec §FR-055, FR-231]
- [ ] CHK056 — Does the spec define behavior when the conditional UPDATE returns rowcount=0 (immediate retry, return 409, escalate to reservation reaper)? [Clarity, Edge Case, Spec §FR-054, FR-055]
- [ ] CHK057 — Are the three connection types' busy_timeout values (foreground=50ms, background=5s, audit=30s per plan.md) reflected in the reservation FRs, or only in plan.md? [Consistency, Spec §FR-060, plan.md§ DB connections]
- [ ] CHK058 — Is concurrent-edit safety for `releaseReservation` (FR-294) measurable — what counter-state assertion proves no double-release happened? [Measurability, Spec §FR-063, FR-064, FR-294]
- [ ] CHK059 — Are the four reservation `state` transitions (`active → consumed | released | expired`) exhaustive — does the spec forbid all other transitions explicitly? [Completeness, data-model.md §M64g, Gap]
- [ ] CHK060 — Does the spec define which path "wins" if reaper expiry and operator-revoke fire within the same millisecond against the same reservation? [Edge Case, Spec §FR-294, Gap]
- [ ] CHK061 — Is the requirement that all three release paths (reaper, task-completion, operator-revoke) call `releaseReservation` measurable via static analysis (lint rule, test of imports)? [Measurability, Spec §FR-063, FR-064]
- [ ] CHK062 — Are the deterministic 409 error-body fields (`{"error","reason","remaining_usd"}`) specified consistently across FR-055, FR-180, US4 acceptance scenario 2? [Consistency, Spec §FR-055, FR-180]

## Counter Drift Detection + Auto-Repair vs Manual Rebuild

- [ ] CHK063 — Are the three drift tiers (auto-repair, operator-confirmed, hard-block) specified with non-overlapping numeric boundaries, or do edge values (exactly 1%, exactly $0.50) fall in multiple tiers? [Clarity, Edge Case, Spec §FR-057]
- [ ] CHK064 — Are the auto-repair-tier absolute floors (USD $0.50; tokens 10,000; requests 10; sessions 1) measurable per unit consistently? [Measurability, Spec §FR-057]
- [ ] CHK065 — Is the stratified-sample size formula specified (sample-fraction-of-total, fixed-N-per-source, scales-with-traffic)? [Clarity, Gap, Spec §FR-057, FR-095, FR-108]
- [ ] CHK066 — Does the spec define what "stratified across high-volume / low-volume sources" means with explicit volume thresholds? [Clarity, Spec §FR-096, Gap]
- [ ] CHK067 — Are the inputs to the drift comparison defined (counter `counter_value` vs sum-of-ledger-deltas in the same window vs sum-of-canonical-events × pricing) and which is the source of truth? [Clarity, Conflict, Spec §FR-067, FR-120]
- [ ] CHK068 — Is the "operator-confirmed tier" approval mechanism measurable (REST endpoint, UI button, idempotency key, what audit row fires)? [Completeness, Spec §FR-057]
- [ ] CHK069 — Is the rebuild-job atomic-swap requirement specified (FR-066) with an exact algorithm — shadow table → swap PK, write to a temp counter → atomic UPDATE into place, or DROP+RENAME? [Clarity, Spec §FR-066]
- [ ] CHK070 — Does the spec define `pending_rebuild_job_id` lifecycle (set on entry, cleared on completion, retained on failure for forensic, garbage-collected when job-id no longer references a live row)? [Completeness, data-model.md §M64f, Spec §FR-058]
- [ ] CHK071 — Is the `shadow_due_to_counter_rebuild` admission-fallback behavior measurable (does the evaluator emit a different decision row, what reason code, what dispatch effect)? [Measurability, Spec §FR-057]
- [ ] CHK072 — Are rebuild-resumability requirements specified — what gets persisted (cursor, batch index, partial counter), how is corruption detected on resume? [Completeness, Spec §FR-058, FR-059]
- [ ] CHK073 — Is the chunk-size policy for rebuild explicit (default value, configurable, max value) and are admission-latency assumptions documented (background connection cannot starve foreground)? [Clarity, Spec §FR-058, FR-060]
- [ ] CHK074 — Are drift-detection tests (FR-233) traceable to specific drift sizes (e.g., 0.5%, 5%, 75%) that map onto the three tiers? [Measurability, Traceability, Spec §FR-233]

## Concurrency: 5 Concurrent Override Grants for Last $1 (AC-Race-1)

- [ ] CHK075 — Is the AC-Race-1 setup specified deterministically (5 concurrent POSTs from same IP? same auth? same idempotency key? new session per request?)? [Clarity, Spec §FR-055, FR-231]
- [ ] CHK076 — Are the four 409 response bodies required to be byte-identical, or only same-shape with possibly differing `remaining_usd` values? [Clarity, Ambiguity, Spec §FR-055]
- [ ] CHK077 — Does the spec define the assertion that exactly one `resource_reservations` row was inserted (i.e., not just the HTTP code count) under AC-Race-1? [Measurability, Gap, Spec §FR-231]
- [ ] CHK078 — Is the assertion specified that the post-race `counter_value` equals 0 (not negative, not positive)? [Measurability, Gap]
- [ ] CHK079 — Are the assertions specified that post-race `resource_decision_audit` chain has exactly N+1 rows (or 1 row, depending on whether 409s audit) and the chain still validates? [Measurability, Gap, Spec §FR-176]
- [ ] CHK080 — Are concurrent-grant tests required to run against the production WAL+busy_timeout settings, or only the in-memory test DB? [Coverage, Gap, Spec §FR-231]

## Partitioning, Retention, and Archive Integrity

- [ ] CHK081 — Are partition-month assignment rules specified (must be derived from `ts`/`posted_at`/`ingest_ts` — which one) consistently across the 5 partitioned tables? [Consistency, data-model.md §"Partitioning Strategy", Spec §FR-249]
- [ ] CHK082 — Does the spec define atomicity of the retention-sweep INSERT-then-DELETE pair (must be one transaction, must be checksum-verified before DELETE)? [Completeness, data-model.md §"Partitioning Strategy", Spec §FR-252, FR-253]
- [ ] CHK083 — Are archive-file integrity checks (header schema version, row count, checksum) measurable on archive read? [Measurability, Spec §FR-252]
- [ ] CHK084 — Is the requirement that retention sweep "MUST NOT remove rows referenced by an active reservation or open override grant" testable for each of the 5 partitioned tables (which tables can be referenced by reservations/grants)? [Coverage, Spec §FR-259]

## Cross-Section Consistency, Ambiguity, Traceability

- [ ] CHK085 — Are FR-051..070 and the data-model.md M64e..M64h schemas referentially aligned (every FR field has a column, every column has an FR or is justified)? [Consistency, Spec §FR-051..070, data-model.md §M64e..h]
- [ ] CHK086 — Is "atomic" used consistently across FR-053/FR-054/FR-065/FR-173 — same SQLite primitive, same isolation, same error handling? [Consistency, Ambiguity]
- [ ] CHK087 — Does every data-integrity FR (FR-051..110, FR-241..260b, FR-294) cite at least one design-concept Q-number AND one acceptance-criterion or success-criterion ID? [Traceability, Spec §FR-051..]
- [ ] CHK088 — Are peer-review-rounds 1–3 findings on data-integrity (e.g., round 1#214 on telemetry-source registry, round 2#212 on backup, round 3#P0-3 on collector-config) reflected in the corresponding FR with explicit citation? [Traceability, Spec §FR-079a, FR-090k, FR-090f]

