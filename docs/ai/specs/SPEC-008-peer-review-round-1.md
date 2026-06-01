---
review_id: SPEC-008-peer-review-round-1
reviewer: senior-distributed-systems-architect (independent)
target: SPEC-008-design-concept.md
review_date: 2026-05-02
status: fix-and-ship (with three blocking items)
---

# SPEC-008 Resource Governance — Independent Peer Review (Round 1)

## Executive Summary

This is the most rigorously specified piece of work I have seen come through SpecKit on this project, and it gets the hard parts right: the raw-vs-canonical-vs-ledger split, the precomputed counters, the snapshot/generation_id model, the Aegis emergency lane, the persistent breaker. I would recommend **fix-and-ship**, not a rewrite — but there are three substantive issues (counter↔ledger drift remediation, schema-malicious input handling, and the WIP counter `consumed_wip` semantic) that are still hand-waved and will bite in production. Several other observability and operator-UX gaps are real but tractable in `/speckit.plan`.

The work is not ready for `/speckit.specify` until items A, B, C in the Final Verdict are tightened. Everything else is a Plan-phase concern.

---

## 1. Distributed-Systems Sanity (Single Process, but Many Interleavings)

The doc is accurate that `BEGIN IMMEDIATE` + `busy_timeout=5000` + WAL gives serialized writes. But the system is more interleaved than a single-process framing implies, and several places assume ordering that isn't there.

**Findings:**

- **Q27 counter↔ledger atomicity is asserted but the failure of one path is not specified.** The doc says "Counter maintenance UPDATE is atomic with ledger inserts inside same transaction." That's correct *for writes that go through the documented path*. But the periodic verification job (Q27, "every 1h") admits that drift can happen — and gives no mechanism for *what causes drift in a single transaction*. The honest answer is: drift happens when (a) a code path inserts a ledger row without bumping counters, (b) a counter row gets pruned but a backfill correction lands later for that pruned window, or (c) a half-failed migration leaves counters inconsistent. The doc should enumerate the drift causes; otherwise the "operator-confirmed rebuild" is a black box.
- **Q24 reconciler runs every 5s with `BATCH_SIZE=100`. Q26 emits coalesced corrections.** Fine. But the reconciler transaction (`tx.immediate()`) competes with admission control transactions for the global write lock. With four scheduler ticks (Q11) plus reservations plus reconciler plus correction coalescing plus snapshot delta computer, the lock contention story isn't characterized. Q11 benchmark is `concurrentBudgetWrites: 100` — that's the right shape, but the doc never connects "100 concurrent writes" to the realistic mix of reconciler+admission+correction+counter-prune. **Recommendation**: add a "writer interference" test to the Q11 benchmark with the actual mix of concurrent writers, not just synthetic counter writes.
- **Q19 cumulative-to-delta uses `provider_timestamp` for ordering**, but two snapshots with the same `provider_timestamp` and no `snapshot_seq` (Codex rollout JSONL has timestamps with second precision, sometimes coarser) collapse to non-deterministic ordering by `id`. The doc says "if neither sequence nor provider timestamp is available, mark untrusted_cumulative" — but doesn't address the partial case where timestamps collide. **Recommendation**: add a tiebreak rule (`raw_hash` lexicographic, or `id` ascending) and an AC test for same-timestamp snapshots.
- **Q20 mechanism 1 lazy refill is racy in a way the doc handwaves.** "Counter refresh is atomic — read counter, if `window_start < today_utc_start`, INSERT a new counter row for today." Two concurrent admissions both observe stale counter, both compute "need to insert"; the second hits the UNIQUE constraint and... what? The doc doesn't say. **Recommendation**: make the refill an `INSERT ... ON CONFLICT DO NOTHING` followed by a re-read inside the same `IMMEDIATE` transaction; document the contract.
- **Snapshot ingestion is keyed by `(source, session_id, generation_id, raw_hash)`**, so the *same* cumulative snapshot received twice is idempotent. Good. But: a snapshot with the same `raw_hash` that arrives from *two different sources* (Codex stdout AND rollout JSONL for the same turn) — both are stored under their own `source` partition. The reconciler then has to match them. The doc handles this via Q18 high-confidence join on `request_id` or `prompt_id` — but Codex rollout `token_count` events do not always carry a `request_id`. What ties stdout `--json` `turn.completed.usage` to the rollout `token_count` event for the *same turn*? The doc does not say. **This is a real ambiguity.** The honest answer is the rollout filename UUID + turn ordinal, but it needs to be specified.

**Remediation**: extend Q18 with the explicit Codex stdout↔rollout join key (likely `(rollout_filename_uuid, turn_index)` or session_id+sequence). Without this the dedupe story between two trusted Codex sources collapses to `medium`-confidence "exact token match within session" — which works most of the time but loses the case where the operator runs a turn that happens to have identical token counts as another turn in the same session.

---

## 2. Failure-Mode Taxonomy

Per component:

**Evaluator**: doc handles eval errors → `defer`, latency breach → breaker open, `SQLITE_BUSY` → 423/`shadow_global`. Missing: **policy semantic errors** (operator writes a malformed `enforce_mode='hrad'` typo or invalid IANA tz). Q1 says "first non-allow result" but doesn't specify what happens when policy parse fails — is it skipped, or does it block the whole eval? Recommend: bad policies are quarantined (mark `policy_invalid=1`), excluded from evaluation, and surfaced as `governance_policy_invalid` activities. **The doc has no mechanism for invalid policy rows.**

**Ledger**: append-only, OK. Failure: disk full mid-insert → transaction aborts (good), but the `IMMEDIATE` lock holder for >5s blocks every other admission. The 423 retry path handles this, but the doc does not specify a max-retry-then-fail-open vs fail-closed policy at the *application* level. Q21 deterministic mode covers global cases but admission-call-level retry exhaustion isn't specified.

**Reservation grant**: well-handled (Q6 5-status contract).

**Reconciler**: the doc covers schema_broken, low_confidence_review. Missing: **what if `processGroup` itself throws** mid-batch? The transaction rolls back, raw rows stay `pending`, `reconcile_attempts` increments — but the failure mode for a "permanently un-reconcilable" raw event is not spec'd. After N attempts, does it move to a poison queue? Recommend adding `reconcile_status='reconciliation_poisoned'` after `reconcile_attempts >= 5` with operator-visible activity.

**OTel collector**: the doc covers `otelcol-contrib` failure → `state='failed'` → backfill on restart. Missing: **what if the collector restarts with corrupt `filestorage` WAL?** The OTel collector contrib filestorage extension is robust but not bulletproof; the doc should state that on filestorage corruption the collector will lose pre-corruption events, MC will discover this via observed_at gap, and should fire `governance_telemetry_gap_detected`.

**Per-source adapters**: covered well in Q23 + Q25 for Copilot. But **Codex stdout adapter**: what if the child process crashes mid-stream? The stdout-tail process accumulates a partial JSON record; the doc doesn't say whether partial records are rejected (good) or speculatively parsed (bad).

**Circuit breaker**: covered. Missing: what happens when the breaker table itself is locked? "DB-lock during breaker check" → uses cached state? Re-derives from last-known? **The breaker has no failure mode for "I can't read my own state."** Recommend: in-memory mirror updated on every transition, used as fallback when read fails.

**Governance UI**: doc enumerates UI states but no handling for "evaluator returns inconsistent decisions across two SSE clients" (which can't happen given single process, but the *displayed* state can be stale). Minor.

---

## 3. Data Lifecycle and Retention

**This is the weakest section of the doc and a real production risk.**

The doc adds 11 tables. Estimated growth on the operator's self-hosted node with realistic usage:

| Table | Rows/day estimate | After 1y | After 3y |
|---|---|---|---|
| `raw_usage_events` | 5K-50K (multi-source dedup) | 1.8M-18M | 5M-55M |
| `canonical_usage_events` | 1K-10K | 365K-3.6M | 1M-11M |
| `canonical_usage_sources` | ~3× canonical | ~10M | ~30M |
| `usage_snapshots` | 5K-50K | similar | similar |
| `resource_budget_ledger` | with coalescing, ~2K-5K | ~1M-1.8M | ~3M-5.5M |
| `resource_policy_events` | ~500-2K | ~180K-730K | ~540K-2M |

**At 3 years of single-operator usage, the SQLite DB pushes 100M+ rows across the new tables.** Better-sqlite3 handles this, but:

1. **No retention policy is specified.** `raw_usage_events` is append-only forever. The doc says "operator manually run scripts/backfill-canonical-usage-events.ts" — but says nothing about pruning. SQLite with WAL on a Ryzen 5900XT will not be the bottleneck, but the disk-cost-per-query for ad-hoc operator queries will degrade.
2. **`canonical_usage_sources` (3×) joins for audit drilldown become slow.** The doc has no covering index on `canonical_usage_sources(canonical_event_id, source)` for the audit case "show me every raw event that contributed to this canonical event."
3. **No archival/snapshot story.** What if the operator wants to export/archive 2024 events? The doc has zero affordance for this.
4. **`resource_budget_counters` window pruning IS specified (Q27)** — good. But `usage_snapshots` has none. Snapshots accumulate forever, indexed by (source, session_id, generation_id) — and Codex rotates rollout files daily, so generation_ids monotonically increase forever.

**Remediation** (Plan-phase, not blocker):
- Add a Q29 (or amend Q27): retention policy. Default: keep 90 days of `raw_usage_events`, 1 year of `canonical_usage_events`, forever of ledger debits, 7 days of low-confidence reconciliation candidates after operator review.
- Add a `governance-vacuum` scheduled job (daily) that prunes by retention policy and emits `governance_retention_pruned` activity.
- Specify `PRAGMA auto_vacuum=INCREMENTAL` and a periodic `PRAGMA incremental_vacuum(N)` to reclaim space; without this, even after DELETE, file size doesn't shrink.
- For audit drilldown, add `CREATE INDEX idx_canonical_sources_for_audit ON canonical_usage_sources(canonical_event_id)`.

---

## 4. Operator UX During Incidents

I imagine I'm the operator at 3am. Paddock says "tasks aren't being dispatched." Walk the diagnostic flow:

The doc specifies a Cost Tracker → Governance tab with telemetry health panel showing per-source freshness states. Good. But **the doc does not specify a single integrated "why is dispatch blocked?" view**. The operator needs to determine whether:

- (a) breaker is open (Q21 — visible? Where? `governance_breaker_state` SSE event exists, but is there a panel?),
- (b) one specific policy is `enforce_mode=hard` and exhausted,
- (c) collector is `failed` and authoritative source for an account is `shadow_due_to_stale_telemetry`,
- (d) a backfill is in progress and admission is degraded,
- (e) the deterministic_mode is active because of a long migration,
- (f) Aegis is in `deferred_no_fallback` and blocking review-gate,
- (g) every override quota for the day is consumed.

Currently each of these is exposed somewhere (activity feed, freshness panel, breaker state). **There is no "Governance Status" overview that answers "is my system healthy yes/no, and if not what's wrong."**

**Remediation** (Plan-phase): add a `GET /api/resource-governance/health` endpoint returning a single object with all 7 conditions and their states; add an "incident triage" header card to the Governance tab. This is a half-day of implementation but saves hours per incident.

The CLI also needs `pnpm mc governance status --json` returning the same. Without this the operator's first move at 3am is to grep activity logs, which is exactly what we're trying to avoid.

---

## 5. Schema Migration in Production

Q28 covers preflight + idempotent CREATE + half-failure AC + reapply AC. This is good. But:

- **In-progress task semantics during M64a..M64k are not addressed.** The doc says "migration runner wraps each migration in `db.transaction.immediate()`." That serializes writes for the duration of each step. If the operator has tasks running through `dispatch`, those API calls return 423 (`busy_timeout` exhaustion) for the duration. The doc does not say:
  - whether MC pauses the scheduler during migration,
  - whether the Next.js routes return 503 vs 423 vs hang,
  - whether existing in-flight tasks (already dispatched, not yet reported) "race" the migration in the sense of writing `token_usage` rows.
- **`token_usage` reads during M64**: the doc says no backfill in M64; lazy on first read. But the existing `token_usage` table and the new `canonical_usage_events` table coexist post-migration. The Q4 `/api/tokens` route extension is mentioned but the read path during the migration window itself is unaddressed: does the route return stale reads, error, or wait?
- **Total migration time is uncharacterized.** 11 sub-migrations × N indexes each. On a populated DB, `CREATE INDEX` on a 300K-row hypothetical existing table takes ~seconds. M64 is creating *new* tables, so this is probably <1s, but there's no benchmark.

**Remediation** (Plan-phase): add a "migration window" runbook section: scheduler is paused, in-flight tasks complete using legacy code path, new dispatches return 503 "migration in progress, retry," API_KEY-authed health probe stays alive, expected p95 migration duration is documented and benchmarked.

---

## 6. Test Coverage Gaps

The doc's "180-250 tests" target covers the explicit ACs. Gaps I see:

- **Chaos test for collector restart while ingestion is mid-batch** — Q19 AC-1 covers kill, AC-2 covers 6h restart. Missing: kill *during* a backfill's correction-coalesce transaction. Does the next-restart's reconciler resume from `reconcile_status='reconciling'`? The doc has no `reconciling`-state-recovery AC.
- **Race test: 5 concurrent override grants for last $1** — AC exists in Q6. Good. But missing: concurrent override-grant + auto-expiry firing on the *same* override row. Two writers, both want to mutate `state`. Specify outcome.
- **Stale telemetry test where authoritative source is stale but non-authoritative source claims fresh data with substantially different totals.** Q19 says "hard enforcement degrades to shadow." But the non-authoritative source's data is still flowing. Test: does the ledger correction path emit corrections from the non-authoritative source while degraded? The doc is silent.
- **Wrong-version Copilot test** — AC-3 in Q19 covers it. Good.
- **Time-travel/window boundary test** — AC-Aegis-5 covers UTC midnight crossing. Good. Missing: DST transition for a calendar window in workspace TZ. `Intl.DateTimeFormat` handles this, but a fall-back DST night adds an extra hour of "today" — does the calendar window cover 25 hours? The doc doesn't say.
- **Multi-workspace isolation** — emergency reserve is per-workspace (Q20). Good. Missing: explicit AC that workspace A's exhausted reserve cannot influence workspace B's eval, and workspace A's stale telemetry cannot trip workspace B's breaker.
- **Counter↔ledger drift test** — Q27 mentions periodic verification. No AC says what happens when verification *fails*. Need: AC with deliberately-injected drift, verify alert fires, verify operator-confirmed rebuild path works.
- **Schema-malicious test** — see lens 11.

**Remediation**: add a "chaos & race" subsection to Q14 enumerating these explicitly. Without them the test count is misleadingly comprehensive.

---

## 7. Observability of the Governance System Itself

Q19 covers source freshness. Q21 covers breaker state. But **MC's evaluator and reconciler themselves emit no metrics.** The operator can see:

- `resource_policy_events` (decisions) — yes
- `governance_drift_observed` activities — yes
- `governance_breaker_state` SSE events — yes
- `telemetry_freshness_changed` events — yes

The operator cannot see, without grepping logs:

- evaluator p50/p95/p99 latency (the benchmark gates it in CI; no production metric)
- reservation grant rate (admits/sec, denials/sec)
- policy decision distribution (% allow/defer/block/override per workspace)
- reconciler throughput (raw rows reconciled/sec)
- counter↔ledger drift magnitude over time
- emergency reserve consumption rate

**Remediation**: Add Q29 — "Governance self-observability." Every 60s, write a `governance_self_metrics` row (or similar) summarizing the prior minute. Surface in the Governance tab as a "system health" sparkline. Operator can see "evaluator is slow" *before* the breaker opens. This is one table + one scheduled job + a panel widget; not large, but the doc gives it zero treatment.

Also missing: the doc enumerates SSE event types but does not enumerate **which conditions trigger which `governance_*` activity event**. There's a partial list across Q19/Q20/Q21/Q27, but no single registry. Plan-phase needs this to enforce log-event consistency.

---

## 8. Concurrent Operator Actions

The doc covers concurrent override grants (Q6 AC) but not these scenarios:

- **Two operators editing the same policy** — no optimistic concurrency control specified. Last-writer-wins silently is the de facto behavior. Recommend: `policy.version` integer, increment on update, 409 on stale write.
- **Operator promoting WIP policy to `hard` while another operator grants an override against the prior `soft` interpretation** — the override is granted under one regime, the policy changes regime mid-flight. The doc has no consistency story. Recommend: override grants include `policy_version_at_grant`; promotion to `hard` does not invalidate prior overrides (they grandfather under `soft` until expiry), but new overrides must be re-evaluated under `hard`.
- **Operator manually canceling a reservation while auto-expiry is firing** — Q6 state machine has both `cancelled` and `expired` transitions but the race is unspecified. With `IMMEDIATE` only one wins; the loser's UPDATE is a no-op against an already-non-`active` row. Recommend: explicit AC + idempotent UPDATE returning "already-terminal" without error.
- **Operator break-glass during deterministic_mode** — Q21 puts MC in `shadow_global` or `defer_global`. Q20 break-glass requires operator session token. During `defer_global`, scheduler defers everything; operator break-glass should still work because override grant is *its own* code path, but: does break-glass *clear* deterministic mode for that workspace? The doc doesn't say. Recommend: break-glass during deterministic_mode is allowed but does NOT clear deterministic_mode; it grants for its window only.

**Remediation**: add a "Concurrent operator actions" subsection to Q6 or new Q30 covering these four cases.

---

## 9. The Q23 Source Emission Registry — Edge Cases

The registry is a good design pattern. Edge cases:

- **A Codex `mcp-server` that emits both OTel logs AND writes rollout JSONL.** The doc table treats these as separate sources (`gateway_otel` for OTel, `transcript_replay` for JSONL). Reconciler joins by `request_id` if present. But Codex `mcp-server` does NOT emit metrics (per the source-of-truth table at line 43) — only logs/traces. The doc should clarify: in the registry, `cli_stdout_json` is `codex exec --json` only; `codex mcp-server` emits OTel-traces-only and is a *different* source row.
- **Adapter falls between modes when version detection fails**: the doc handles `schema_broken` for Copilot. But: Copilot v0.0.422 (known) and v1.0.0 (unknown future) — the adapter's behavior is "warn; attempt parse with latest known schema; if fails, schema_broken." That assumes graceful degradation in the JSON shape. **In practice, GitHub may rev the schema in incompatible ways with no version bump in `~/.copilot/config.json`.** The doc should add a *content sniff* check: even if the version says 0.0.422 but the payload doesn't match, mark `schema_broken`.
- **Dedupe across stdout + rollout for Codex**: as raised in lens 1, no specified join key beyond `(session_id, exact-token-match)`. This is the biggest single ambiguity in the registry.

**Remediation**: extend Q23 with explicit (cli, command-mode) tuples: `('codex', 'exec_json')`, `('codex', 'mcp_server')`, `('codex', 'rollout_jsonl')` and what they each emit. Currently Q23's `cli` column is too coarse.

---

## 10. Performance Under Sustained Load (Not Just Benchmark)

Q11 benchmark is 10K calls. Q27 benchmark is 10K admission calls against a 300K-row ledger. Both are spike tests, not soak tests.

Sustained 100 admissions/sec for 30 minutes → 180K admission transactions, 180K counter UPDATEs, plus reconciler running every 5s = 360 reconciler invocations, each batching 100 raw events = 36K reconcile transactions. Plus 1K policies evaluated against, plus correction coalescing.

The doc commits to no soak test. V8 heap fragmentation, cache invalidation patterns under real workload, SQLite WAL checkpoint pressure under sustained writes — none of these are characterized.

**Realistic risks**:
- Better-sqlite3 prepared-statement cache fills if policies are frequently rebuilt (cache footprint Q11 says ~70KB; this is for hot policies but doesn't bound total).
- WAL checkpoint pauses under sustained write load can spike p99 latency to >100ms periodically (every ~1000 page writes by default). The doc doesn't tune `wal_autocheckpoint`.
- The SSE event stream from 10 concurrent governance UI tabs × 5 event types/sec × keepalive = manageable, but unbenchmarked.

**Remediation**: add a 30-minute soak benchmark to CI (or a nightly job, not per-PR). Tune `wal_autocheckpoint` explicitly (recommend `PRAGMA wal_autocheckpoint=2000`).

---

## 11. Security

This is not addressed in the doc and it should be.

- **`reason` text in override grants is stored verbatim** and later rendered in UI activity feeds. **Is it sanitized?** The doc shows `reason TEXT NOT NULL` — no validation, no length limit. An operator can paste `<script>` and the Cost Tracker UI must escape it. Recommend: enforce 1KB max length + UTF-8 validation; UI must render via React's default text-escaping.
- **`provider_accounts.config_json TEXT NOT NULL DEFAULT '{}'`**: the doc says nothing about validating this is parseable JSON before INSERT. SQLite does not enforce JSON validity in TEXT columns. Recommend: app-layer schema validation, OR `CHECK (json_valid(config_json))` constraint.
- **`~/.copilot/config.json` parse**: if the file is malicious (deeply nested, billion-laughs), the JSON parser may DoS MC. Recommend: `JSON.parse` inside a try/catch with input size cap (e.g., 1MB), and a depth limit (custom reviver).
- **OTLP receiver auth** is described as "API_KEY header" but the doc does not specify what happens on auth failure rate-limiting (an attacker spamming bad keys can fill logs). Recommend: 401 on bad auth + per-IP rate limit (already a Next.js middleware concern, but call it out).
- **Schema-broken vs schema-malicious**: Q25 handles "schema_broken" (missing required fields). It does NOT handle "schema-malicious" (well-formed JSON Schema-conformant payload, but with adversarial values: `tokens.input = -2147483648` to overflow, or `requests.cost = Infinity`). Q25's JSON schema has `minimum: 0` for input/output — good — but `requests.cost` has `minimum: 0` and no `maximum`, so a `Number.MAX_SAFE_INTEGER` cost is valid-per-schema but breaks every downstream calculation. Recommend: add `maximum` constraints, and reject NaN/Infinity at the JSON parse layer.
- **`canonical_usage_sources` JSON arrays of `contributing_raw_event_ids`**: stored as TEXT, rendered in audit drilldown. If an attacker can write arbitrary `raw_attributes_json` (via the manual POST `/api/tokens` route), can they inject content that breaks the audit UI? The manual POST is operator-role gated (good), but the threat model assumes operator is honest; if the operator's session token leaks, this is a vector.

**Remediation**: add Q31 — "Input validation and threat model." Enumerate the trusted/untrusted boundaries, the validation point per ingestion adapter, and the maximum payload size per source. This is a serious gap for a production system.

---

## 12. What I'd Disagree With Most Strongly

**The choice to ship Aegis governance as `shadow`-only in v1 (Q20 final paragraph + Q5).**

The argument for shadow-only is "calibration" + "safety" — operators promote per workspace after observing 7 days of drift. I think this is the wrong default for Aegis specifically.

Aegis is the *quality gate*. The reason the operator wants governance is to prevent runaway costs from any agent — but Aegis runs frequently, often per-task, and is the most-observable of all agents because every task review touches it. Shipping Aegis governance in shadow means:

1. The most-frequently-invoked agent's budget signal is *informational only* during calibration.
2. The emergency reserve mechanism (Q20 Mech 1), the LM Studio fallback (Mech 2), and the break-glass (Mech 3) are all *wired but inert* in v1. They've never been exercised in production. When the operator finally promotes Aegis policies to `soft`, all three mechanisms fire for the first time — at the moment they are most needed.
3. Calibration data from a shadow-only Aegis is *biased low*: Aegis runs whatever the dispatcher gives it. There's no "would have been deferred" signal because the policy didn't actually defer.

I would argue the inverse: **Aegis should ship at `soft` enforcement for the emergency reserve mechanism only**, with `hard` reserved for explicit operator promotion. `soft` means the reserve is consumed, the LM Studio fallback is exercised, the break-glass is documented in the operator's muscle memory — but no review is *blocked*; just notified. This actually exercises the safety mechanisms before the operator depends on them.

The doc's compromise — wire it but make it inert — gives you the schema cost without the testing benefit. I'd take this back to the operator and argue for `soft`-by-default for Aegis with the same 7-day calibration observation period; if drift is acceptable, promote to `hard`. If not, revert to shadow.

---

## 13. What the Doc Gets Unusually Right

**The two-layer raw / canonical / ledger separation (Q17 + Q18) and the precomputed counters (Q27).**

Most observability systems conflate "what the source said" with "what we believe to be the truth" with "what we're enforcing against." Even mature commercial vendors (Langfuse, Helicone) bake the ingested-event into the cost table directly and try to dedupe at write time. The result is: corrections are rewrites, audit is lossy, late-arriving events corrupt prior aggregates.

This doc gets it right: `raw_usage_events` is **what the source said**, append-only, never edited. `canonical_usage_events` + `canonical_usage_sources` is **what we believe**, computed from raw, idempotent, with explicit precedence. `resource_budget_ledger` is **what we're enforcing against**, append-only, with `correction` entries that name the canonical event that motivated them. `resource_budget_counters` is **the read-optimized projection**, with documented drift detection.

Each layer can fail independently. Each layer is testable independently. The audit story (raw → canonical → ledger → counter) is fully traceable. Late-arriving events do not rewrite history; they emit corrections. The 1h drift verification gives a known-good consistency check.

This is the design pattern of a serious financial ledger system applied to LLM cost tracking. It's the right architecture, and most teams don't get here on the first design pass — much less on the second adversarial review pass. **This is the kind of decision I'd be proud to defend in front of an architecture board.**

---

## Final Verdict

**Ready for `/speckit.specify`?** Not quite. Three blocking items:

### Blocker A: Codex stdout↔rollout dedupe join key (Lens 1, Lens 9)

The Q18 high-confidence join works for Anthropic (`request_id`) and Claude Code (`prompt_id`). It does not specify a high-confidence join key tying Codex stdout `--json` events to Codex rollout JSONL events for the same turn. Without it, the dedupe between two trusted Codex sources falls back to "exact token match in same session" which is medium-confidence and breaks when two turns happen to have identical token counts. **Fix**: extend Q18 with the explicit Codex stdout↔rollout high-confidence join (likely `(session_id, turn_index)` based on rollout file structure). Verify with a probe spike before specify.

### Blocker B: Counter↔ledger drift root-cause and remediation (Lens 1, Lens 6)

Q27 says "periodic verification job recomputes counters from ledger SUM aggregate and compares; discrepancy emits `governance_counter_drift` alert. Plan-phase decides whether discrepancies trigger automatic counter rebuild or operator-confirmed rebuild." Pushing this to Plan-phase is exactly the kind of hand-wave that becomes a 3am incident. **Fix**: enumerate the drift causes (half-failed migration, pruned-then-corrected windows, code paths that bypass counter update), specify the rebuild path (atomic recompute under IMMEDIATE for one scope), and add an AC test with deliberately-injected drift. This is a Q27 amendment, not a new spec.

### Blocker C: Schema-malicious input handling and security boundary (Lens 11)

Q25 covers schema_broken (missing fields). It does not cover schema-malicious (valid-per-schema but adversarial: -MAX_INT tokens, Infinity costs, billion-laughs config). `provider_accounts.config_json` has no validation. Override `reason` text has no length limit or sanitization contract. The doc has no documented input validation and threat model. **Fix**: add Q31 with the trust boundary, max payload sizes, JSON validity constraints (`CHECK (json_valid(...))`), numeric bounds (maximums on all integer/float fields), and rate-limited auth-failure response on the OTLP receiver.

### Non-blocking but should-fix in Plan

- Retention policy (Lens 3) — add Q29.
- Governance health endpoint + CLI status (Lens 4) — Plan task, not spec change.
- Soak test + WAL autocheckpoint tuning (Lens 10) — Plan task.
- Self-observability metrics (Lens 7) — add Q29 or Q32.
- Concurrent operator-edit protection (Lens 8) — Plan task with `policy.version` field.
- DST transition AC for calendar windows (Lens 6) — add to Q14.
- Aegis ships at `soft` for emergency reserve (Lens 12) — operator decision; raise it.

### Bottom line

Of the 30+ design questions in this doc, 27 are answered well, 3 are hand-waved (the blockers above), and the architecture (raw/canonical/ledger/counter) is unusually good. The 29-fix adversarial-review track record is doing real work — most of the easy mistakes are gone. The remaining issues are the kind that survive adversarial review because they hide behind plausible language ("operator-confirmed rebuild," "tolerated unknown fields," "calibration before hard").

Fix A, B, C in the spec. Accept the rest as Plan-phase work. Ship it.

— Senior Distributed-Systems Architect, Independent Review (no skin in the game on prior rounds)
