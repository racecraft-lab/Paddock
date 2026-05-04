# Performance Requirements Quality Checklist: SPEC-008 Resource Governance

**Purpose**: Validate performance requirements quality (completeness, clarity, consistency, measurability) for the admission hot path (Q11/Q35), foreground/background DB connection split (Q29), reconciler / drift / backfill subsystems (Q24, Q36, Q43, Q46, Q51), and the AC-Bench-1 / AC-Soak-1 gates.
**Created**: 2026-05-02
**Feature**: [spec.md](../spec.md)
**Domain**: performance
**Source artifacts**: spec.md (FR-001..030, FR-051..070, FR-090e, FR-091..130, FR-221..240, FR-241..260, FR-276..285, AC-Bench-1, AC-Soak-1, SC-004, SC-014, SC-016), plan.md (Performance Goals, three-DB-connection design), research.md (Q11/Q29/Q35/Q49 narratives), design concept Q11/Q24/Q29/Q35/Q43/Q46/Q51.

> **Reminder**: Items below test the **requirements writing**, not the implementation. They ask "is the requirement clear / complete / measurable / consistent?" — never "does the system meet the target?".

## Admission-Latency Targets (Q11 / Q35)

- [ ] CHK001 - Are admission latency targets quantified with specific p50/p95/p99 thresholds rather than qualitative phrases ("fast", "low latency")? [Clarity, Spec §FR-004, §FR-222, §SC-004]
- [ ] CHK002 - Is the reference hardware profile for the latency targets explicitly named (CPU model, RAM size, storage class) so benchmarks are reproducible? [Measurability, Spec §FR-004]
- [ ] CHK003 - Is the dataset shape for AC-Bench-1 specified (1k policies, 300k ledger rows) consistently across spec, plan, and research? [Consistency, Spec §FR-004 / §FR-222 / §SC-004]
- [ ] CHK004 - Are the four scheduler gate points (initial admission, chain advancement, periodic re-eval, override-grant validation) all required to meet the same latency targets, or is per-gate variance permitted? [Clarity, Spec §FR-003 / §FR-004]
- [x] CHK005 - Is "concurrent gates active" defined with a concurrency level (number of parallel admissions) for the AC-Bench-1 fixture? [Clarity, Resolved §FR-327]
- [ ] CHK006 - Are admission-latency requirements consistent between FR-004, FR-222, AC-Bench-1, and SC-004 (no divergent thresholds)? [Consistency, Spec §FR-004 / §FR-222 / §AC-Bench-1 / §SC-004]
- [ ] CHK007 - Does the spec define the regression-tolerance numeric (>10% blocks PR) and is the baseline measurement source documented? [Clarity, Spec §FR-222]
- [x] CHK008 - Is the cold-start vs warm-cache distinction specified for the latency benchmark (does the cache-refresh path in FR-050 count toward p99)? [Coverage, Resolved §FR-329]
- [ ] CHK009 - Is "evaluator latency" defined with specific start/stop boundaries (function entry → return, or includes audit-row write)? [Clarity, Ambiguity, Spec §FR-009 / §FR-016]
- [x] CHK010 - Are latency requirements specified for the dry_run shadow-write path (FR-018) so dry_run does not regress hot-path? [Coverage, Resolved §FR-330]

## Atomic Counter Conditional UPDATE (Q35)

- [ ] CHK011 - Is the atomic-counter UPDATE pattern explicitly required to use `WHERE counter_value = expected_old_value` (no SELECT-then-UPDATE)? [Clarity, Spec §FR-012]
- [ ] CHK012 - Is the retry policy quantified (retry count = 3, backoff strategy = exponential) and is the backoff base/cap defined? [Clarity, Spec §FR-012]
- [ ] CHK013 - Is the failure outcome on retry exhaustion specified (defer:retry_exhausted decision row written) and consistent with FR-005 fail-safe behavior? [Consistency, Spec §FR-005 / §FR-012]
- [ ] CHK014 - Are split UPDATE paths (`reserve`, `release`, `consume`) defined as separate primitives, with each path's atomicity requirement made explicit? [Completeness, Spec §FR-053]
- [ ] CHK015 - Are reservation-grant atomicity requirements (decrement + reservation row + audit row in single transaction) specified for FR-054 with the exact transaction boundary? [Clarity, Spec §FR-054]
- [x] CHK016 - Is the rowcount=0 contract documented as the canonical signal for contention (vs SQLite BUSY) so retry logic is unambiguous? [Clarity, Resolved §FR-333]
- [ ] CHK017 - Are concurrent reservation outcomes ("exactly one 201 + N-1 deterministic 409") quantified and consistent between FR-055, FR-174, FR-231, AC-Race-1? [Consistency, Spec §FR-055 / §FR-174 / §FR-231]
- [ ] CHK018 - Is the cross-window debit requirement (rolling-1h reservation also debits calendar-daily on consume) specified with the exact ordering and atomicity guarantees? [Clarity, Spec §FR-056]
- [ ] CHK019 - Is the `releaseReservation(id, reason)` primitive's idempotency contract specified (state-guard `WHERE state='active'` + decrement only on rowcount=1)? [Completeness, Spec §FR-063]
- [x] CHK020 - Does the spec define whether evaluator state-input reads (FR-025) and the conditional UPDATE happen in the same SQLite transaction or separate ones, and on which connection? [Clarity, Resolved §FR-334]

## Foreground / Background Connection Split (Q29)

- [ ] CHK021 - Is `busy_timeout=50ms` for the foreground (admission) connection explicitly required and traceable to a Q-number? [Clarity, Plan §Performance Goals, Q29]
- [x] CHK022 - Are background-connection `busy_timeout=5s` and audit-connection `busy_timeout=30s` documented in the spec (not only in plan/research)? [Completeness, Resolved §FR-331]
- [ ] CHK023 - Is the rule "long-running maintenance jobs MUST NOT block hot-path admission" stated as an enforceable non-functional requirement rather than implementation guidance? [Clarity, Spec §FR-011 / §FR-060]
- [x] CHK024 - Are the workload classes assigned to each of the three connections (foreground = evaluator/reservation; background = reconciler/rebuild/drift/reaper; audit = verification/retention) enumerated in the spec? [Completeness, Resolved §FR-331]
- [x] CHK025 - Is the SQLite journal/WAL mode requirement explicit, and are the implications for single-writer/multi-reader concurrency stated? [Completeness, Resolved §FR-331]
- [ ] CHK026 - Are the BUSY-deadlock prevention requirements measurable (e.g., zero observed BUSY errors on hot path under AC-Bench-1 fixture)? [Measurability, Spec §FR-060]
- [ ] CHK027 - Is the on-admission inline re-detect path (FR-134a) consistent with the foreground 50ms cap, and is "50ms cap" defined with the same semantics as the admission p99? [Consistency, Spec §FR-134a]

## Background-Worker Throttling on Admission Pressure

- [x] CHK028 - Is the throttle rule "background workers throttle when admission p95>25ms" documented in the spec with a measurable signal source (which metric, sampled over what window)? [Completeness, Resolved §FR-335]
- [x] CHK029 - Is the throttling action specified (pause batches / extend sleep / shrink chunk size) and quantified per worker class (reconciler, drift detector, counter rebuild, reaper)? [Clarity, Resolved §FR-336]
- [x] CHK030 - Is the throttle hysteresis defined (resume threshold, dwell time) so workers don't oscillate? [Edge Case, Resolved §FR-337]
- [x] CHK031 - Are throttle requirements consistent with FR-011 (background MUST NOT block hot-path) — does throttling only apply when background work is itself the cause of regression? [Consistency, Resolved §FR-338]
- [x] CHK032 - Is there a self-observability metric required for "throttle engaged / disengaged" events (parallel to FR-277 latency histograms)? [Coverage, Resolved §FR-338]

## Reconciler Performance (Q24)

- [ ] CHK033 - Is "batched background worker with bounded backfill window" specified with a numeric batch size or a configurable knob name? [Clarity, Spec §FR-077]
- [x] CHK034 - Is the reconciler's transaction boundary bounded (max rows per transaction, max wall-clock per transaction) so it never holds the writer lock long enough to starve admission? [Completeness, Resolved §FR-339]
- [ ] CHK035 - Are per-batch self-obs metrics (`events_in`, `events_deduped`, `events_corrected`, `latency_ms`) quantified with target ranges for healthy vs degraded operation? [Measurability, Spec §FR-105]
- [ ] CHK036 - Is reconciler idempotency (re-run produces identical canonical output) testable with a deterministic fixture? [Measurability, Spec §FR-098]
- [ ] CHK037 - Are recovery semantics specified for reconciler-restart-mid-batch (FR-223 chaos case) with measurable progress-loss bounds? [Coverage, Spec §FR-223]
- [x] CHK038 - Is the maximum permissible reconciler lag (`freshness_ms`) defined per source class so SC-016 soak ("reconciler load") is unambiguous? [Clarity, Resolved §FR-341]

## Backfill Throughput

- [x] CHK039 - Is the "12K rows/min backfill throughput" target documented in the spec or plan with a corresponding FR or SC, or is it only stated in the workflow prompt? [Completeness, Resolved §FR-342]
- [ ] CHK040 - Is the backfill horizon `max_backfill_horizon_hours` (default 168 h) consistent with the throughput target so worst-case backlog clears within a stated time? [Consistency, Spec §FR-124]
- [x] CHK041 - Is "without blocking foreground" defined with a measurable bound (e.g., admission p95 stays <15ms during active backfill)? [Measurability, Resolved §FR-343]
- [ ] CHK042 - Are backfill state transitions (`pending → running → completed` per window) and persistence-on-restart requirements specified with resume-from-cursor semantics? [Completeness, Spec §FR-078 / §FR-118]
- [x] CHK043 - Is the chunk/batch size for backfill (analogous to counter rebuild's `chunk_size_rows`) parameterized and documented? [Clarity, Resolved §FR-343]
- [ ] CHK044 - Are interruption-recovery requirements (FR-118) testable with measurable progress-preservation guarantees? [Measurability, Spec §FR-118]

## Drift Verification (Q36 / Q58)

- [ ] CHK045 - Is "incremental + sampled, never full scan" required as a non-functional constraint (drift detection MUST NOT do a full scan)? [Clarity, Spec §FR-095]
- [ ] CHK046 - Is the stratified-sampling requirement quantified (min sample size = 100 per `min_sample_per_window`, plus stratification rule across high/low-volume sources)? [Completeness, Spec §FR-096 / §FR-108]
- [ ] CHK047 - Are drift tiers (auto-repair / operator-confirmed / hard-block) defined with exact numeric thresholds (≤1% AND ≤floor; >1% OR >floor; >50%) and consistent across FR-057 and AC-Drift-1..4? [Consistency, Spec §FR-057]
- [ ] CHK048 - Is the drift detection cadence (default daily) configurable, and is the configuration knob name documented? [Clarity, Spec §FR-095 / §SC-014]
- [ ] CHK049 - Are drift verification runtime/latency requirements specified so drift work cannot block admission (must run on background connection per FR-060)? [Consistency, Spec §FR-060 / §FR-095]
- [ ] CHK050 - Is the auto-repair tier's "idempotent reconcile-from-ledger" requirement testable with a deterministic fixture (parallel to FR-098 reconciler idempotency)? [Measurability, Spec §FR-057]

## Soak / Endurance (AC-Soak-1)

- [ ] CHK051 - Is the soak workload quantified with all four parameters (duration=30 min, admission rate=100/sec, reconciler load present, p95<15ms target, memory growth <50MB)? [Completeness, Spec §FR-224 / §AC-Soak-1 / §SC-016]
- [ ] CHK052 - Is "memory growth < 50 MB" defined with the measurement method (RSS delta? heap-only? sampled at what cadence?) so the assertion is unambiguous? [Clarity, Ambiguity, Spec §FR-224]
- [x] CHK053 - Is "reconciler load" during soak quantified (events/sec ingested, raw-event size distribution) so the test fixture is reproducible? [Clarity, Resolved §FR-350]
- [x] CHK054 - Are soak-test failure modes specified beyond p95 and memory (e.g., zero unhandled exceptions, zero BUSY-on-foreground, zero retry-exhaustion defers)? [Coverage, Resolved §FR-350]
- [x] CHK055 - Is the soak test consistent with AC-Bench-1 dataset shape (does soak run against 1k policies + 300k ledger rows, or a different fixture)? [Consistency, Resolved §FR-350]

## Ingest Admission Control / Rate Limiting (Q47)

- [ ] CHK056 - Are per-source bytes/sec budget defaults consistently specified (envelope sizes 8/16/4/2 KiB) and is the formula (`steady_state_events_per_min × avg_envelope_bytes`) reproducible? [Completeness, Spec §FR-090e]
- [ ] CHK057 - Are the disk-pressure ladder thresholds (amber 5 GB / 10%; red 2 GB / 5%) and the 60s probe cache documented with override env-var names? [Completeness, Spec §FR-090e]
- [ ] CHK058 - Is the `circuit_open` recovery condition (drops <10/min sustained for 5min) measurable with named metrics (FR-278 events/sec, bytes/sec)? [Measurability, Spec §FR-090e / §FR-278]
- [ ] CHK059 - Are the AC numerics (6000-event burst → quarantine after 100 drops; tmpfs 1.5 GB free → cascade pause) consistent with the steady-state per-source budgets? [Consistency, Spec §FR-090e]
- [ ] CHK060 - Are admission-control surplus-shedding semantics (FR-279) consistent with the disk-pressure ladder (does `disk_full_pause` shed all sources or only the offending source)? [Consistency, Spec §FR-090e / §FR-279]

## Counter Rebuild (Q49) and Cache Refresh

- [ ] CHK061 - Is "async chunked rebuild that does not pause admission" stated as a measurable NFR (admission stays within p95 budget while rebuild active)? [Measurability, Spec §FR-058]
- [ ] CHK062 - Is the post-rebuild verification requirement (ledger sum equals counter value before swap) specified with the exact swap atomicity boundary? [Clarity, Spec §FR-066]
- [ ] CHK063 - Is the policy-cache refresh requirement on FR-050 ("next evaluator call sees new version") quantified with a maximum staleness window? [Clarity, Spec §FR-050]
- [x] CHK064 - Is the `chunk_size_rows` parameter for FR-058 documented with a default value and an operator-tunable range? [Clarity, Resolved §FR-347]

## Retention / Partitioning Performance (Q43 / Q51)

- [x] CHK065 - Are retention-sweep performance requirements specified so the nightly sweep (FR-250) cannot block admission? [Coverage, Resolved §FR-353]
- [x] CHK066 - Is the monthly partition design's read-path performance impact on AC-Bench-1 specified (does the 300k-ledger-row fixture cross partition boundaries)? [Consistency, Resolved §FR-327]
- [x] CHK067 - Is the 50M-row retention test (FR-236, AC-Retention-1..3) consistent with partition sweep targets (sweep duration bound, archive write throughput)? [Measurability, Resolved §FR-353]

## Self-Observability for Performance (Q45)

- [ ] CHK068 - Is the evaluator latency histogram requirement (FR-016, FR-196, FR-277) specified with a fixed bucket schema (so dashboards and CI gates compare apples-to-apples)? [Clarity, Spec §FR-016 / §FR-277]
- [ ] CHK069 - Are reconciler latency, drift detection counters, and reservation reaper counters quantified with target ranges for healthy operation? [Measurability, Spec §FR-277]
- [ ] CHK070 - Is the activity/notification throttle (FR-285) specified so suppressed-alert metrics cannot themselves degrade hot-path performance? [Consistency, Spec §FR-285]

## Edge Cases & Degradation

- [x] CHK071 - Are degradation requirements specified for "1k policies + 300k ledger rows" boundary stress (e.g., 2k policies, 1M ledger rows) so SC-004 limits are intentional rather than implicit ceilings? [Edge Case, Resolved §FR-352]
- [x] CHK072 - Are requirements defined for sustained admission-rate bursts above 100/sec (e.g., 200/sec or 500/sec spikes) and the expected graceful-degradation behavior? [Edge Case, Resolved §FR-351]
- [x] CHK073 - Is breaker-half-open admission probing (FR-028) specified with a probe-budget that bounds tail latency during recovery? [Coverage, Resolved §FR-356]
- [x] CHK074 - Are cold-start performance requirements defined (first admission after process restart, with empty caches)? [Edge Case, Resolved §FR-329]
- [x] CHK075 - Are requirements specified for performance under `dry_run_decisions` shadow-write load (does dry_run double the write rate)? [Edge Case, Resolved §FR-330]

## Traceability

- [ ] CHK076 - Does every performance NFR cite at least one Q-number AND one AC/SC identifier so the benchmark gate has unambiguous coverage? [Traceability]
- [x] CHK077 - Is there a single canonical home for "admission latency targets" that downstream FRs/ACs/SCs reference (vs duplicated thresholds that can drift)? [Consistency, Resolved §FR-326 / §FR-360]
