---
title: SPEC-008 Resource Governance — Independent Peer Review (Round 2, SRE/Operator Lens)
spec_id: SPEC-008
review_round: 2
reviewer_persona: Senior SRE / Operator (12-month on-call horizon)
reviewed_at: 2026-05-02
inputs:
  - SPEC-008-design-concept.md (post round-3 oracle + round-1 peer review, Q1..Q46)
  - SPEC-008-peer-review-round-1.md (correctness/distributed-systems lens)
verdict: not-ready (small set of spec-level gaps; otherwise plan-phase fixable)
---

# SPEC-008 Resource Governance — Independent Peer Review (Round 2)

## Framing

This is a runbook-and-on-call review, not another correctness review. Round 1 closed the distributed-systems and data-correctness gaps; Q39–Q46 are responses to that round and credited where they apply. The lens here is: "I have to keep this running for 12 months on the operator node, alone. What breaks, what wakes me up, and is the doc detailed enough that I won't be guessing at 3am?"

I do not re-litigate items addressed by Q39–Q46. Where the doc covers something, I cite the Q and spend the words on what's still missing.

---

## 1. Runbook Content for the Major Failure Modes

The doc enumerates the failure modes — collector down (Q19), breaker open (Q21), `schema_broken` (Q25), `schema_malicious` (Q41), `drift_detected` (Q40), Aegis exhausted (Q20), backfill stuck (Q31). The shipped current equivalents are under `docs/runbook/`, with collector outage anchored at `docs/runbook/collector-outage.md`.

What an on-call operator needs is a per-failure runbook entry anchored to the activity event that fires, naming diagnostic command, recovery command, and verification step. Of the seven failure modes, only collector-failure has a named runbook. The other six emit notifications but no runbook page is cited.

The most dangerous gap: **`deferred_no_fallback` (Q20 Mechanism 2) has no runbook entry**. Aegis enters this when frontier budget is exhausted *and* LM Studio is unavailable. The doc says "operator must install LM Studio, increase emergency reserve, or use break-glass." That is correct — and 3am is the literal worst time to install LM Studio for the first time. The shipped current equivalents are `docs/runbook/aegis-deferred-no-fallback.md`, `docs/runbook/aegis-local-mode-fallback.md`, and `docs/runbook/aegis-emergency-reserve-depletion.md`.

`schema_malicious` (Q41) declares "source disabled until operator confirms" with no documented confirm procedure — SQL UPDATE? REST call? UI button? Unspecified.

**Action items:**

- Name a runbook `.md` for each of the seven failure modes (in `docs/observability/runbooks/`).
- Document the explicit re-enable path for `schema_broken` and `schema_malicious` (Q37 only describes the auto-disable side).
- Add a concrete LM Studio preflight to the Aegis fallback runbooks. Aegis fallback depends on LM Studio being pre-installed.

---

## 2. Logging and Audit Completeness

Strong on this dimension. Q23 capability registry, Q26 coalesced corrections with `coalesced_canonical_event_ids`, Q30 `canonical_budget_effects` durably tracking posted state, Q32 `reconciliation_batches` table, Q34 `canonical_usage_sources.attach_status` history with `attached_by_batch_id`/`detached_by_batch_id` — all of this lets the operator drill back from a ledger row → batch → canonical events → raw events → original source. That is genuinely good audit hygiene.

Two correlation gaps remain:

1. **`request_id` propagation through the dispatch path.** The doc commits to capturing `request_id` and `prompt_id` in `canonical_usage_events` (Q18) but does not say the same identifiers flow from the scheduler gate decision → admission ledger row → reservation override row. If operator says "task #12345 was deferred 3h ago, why?", they can pull the `resource_policy_event` (the audit row), but can they pull the `override_id` chain that *would have* allowed it? Q44's diagnostic UI assumes yes; the schema doesn't enforce it. Recommend adding `request_id` / `prompt_id` columns (nullable) to `resource_policy_events` so the audit row is self-contained.

2. **Ledger entries for `kind='debit'` from telemetry don't carry the dispatch's `task_id`.** Q17's ledger has `scope_kind='task', scope_id=<task_id>` so this is implied, but the explicit `task_id` column is missing. Reading SPEC-001 M58 (task lineage), parent_task_id chains exist; ledger doesn't reference them. For "why was this dispatch deferred" reconstruction, the parent chain matters when budgets propagate up.

The state-transition coverage is good — Q21 breaker, Q31 backfill state, Q20 Aegis modes, Q34 attach status all log every transition. No silent transitions found.

---

## 3. Deployment / Upgrade Story

M64 is split into M64a..M64k (11 idempotent steps per Q28). Each migration is wrapped in `BEGIN IMMEDIATE`, uses `CREATE TABLE IF NOT EXISTS`, and has a paired rollback. Half-failure AC (`SQLITE_FULL` mid-M64h) and reapply AC are documented. Good.

**The doc does not say how `FEATURE_RESOURCE_GOVERNANCE` is flipped on for the first time.** Per project CLAUDE.md, env vars don't force flag-on; only the `workspaces.feature_flags` JSON does. Phase 3 (Q22) is therefore an UPDATE to a JSON column — operator-error-prone, with no documented dry-run procedure ("flag on 60s, observe drift activity, flag off if anything alarming") and no flag-toggle REST endpoint.

**Downgrade is incomplete.** Rollback drops tables, but does not address: (a) in-flight `active` reservations when migration rolls back; (b) `token_usage` rows created by new code post-flip — do they revert cleanly, or does flag-off-then-rollback leave `token_usage` inconsistent? Q28 says no backfill on upgrade — the inverse direction is silent.

**Flag-off-after-Phase-4:** if hard enforcement fails operationally and the operator falls back to legacy `LIMIT 3`, the ledger/counters keep accumulating dormant data; the retention sweep itself is new code introduced by this spec. Worth an explicit AC: retention sweep continues running on dormant data when flag is OFF.

---

## 4. Backup and Restore

**Largest single gap in the document.** Searching for "backup" returns zero hits.

The system is a single SQLite file. Q43's growth estimate (~10 GB at 3 years) is conservative — `raw_usage_events` alone at 945M rows × ~100 bytes is ~95 GB. The doc does not address:

- **Backup cadence and destination.** Mechanism (`sqlite3 .backup` or C API), location, encryption-at-rest, off-node policy.
- **Restore procedure.** Exact sequence when the SQLite file is corrupted or the operator node's disk fails.
- **Counter rebuild after restore.** Restoring a 6h-stale snapshot keeps ledger/effects/counters internally coherent, but post-snapshot `raw_usage_events` will be re-ingested if collector buffered them. Q19's UNIQUE on `(source, source_event_id)` *should* prevent double-counting — needs an explicit AC.
- **In-flight reservations across restore.** A reservation `consumed` in real time but `active` in the backup will be expired by Q6's reaper, releasing budget that was actually spent. Drift verifier (Q36) catches it hourly; in that hour, the workspace can over-spend.
- **WAL file at restore.** A `cp` of `.db` without `.db-wal` loses the most recent transactions. Runbook MUST mandate `sqlite3 .backup`, never `cp`.

Recommend adding a `Q47 — Backup, restore, and DR` section with these items.

---

## 5. Capacity Planning

The doc covers single-workspace performance well (Q11 benchmark, Q27 counter math, Q35 priority hierarchy). It does NOT cover multi-workspace scaling explicitly. Q11 says "1k+ policies, concurrent gates" and Q27's benchmark "seeds 300K-row ledger + 1k policies + 10 workspaces." So 10 workspaces is implicitly tested. Beyond 10, the doc is silent.

Per-workspace overhead is unstated. From the schemas:
- Each workspace adds: ~1 `resource_governance_breaker` row per component (4), ~8 seeded `resource_policies` rows (Q4), ~1 `aegis_emergency_reserve` policy, N `provider_accounts` (operator-driven, ~5), N `provider_entitlements` (~5).
- Per-day-per-workspace: ~600 raw events/min × 1440 min = 864K raw rows. After dedup, ~150K canonical. Counter rotation creates new rows daily.

That is workspace 1. Workspace 2 doubles raw event throughput if the operator is also running 5 CLIs there. The benchmark's 10-workspace seed assumes much lower per-workspace activity than the single-operator node profile.

**Action item:** add an explicit "scaling envelope" subsection. State that v1 supports N=10 workspaces with the per-workspace event rate capped at 600 events/min. State the breakpoint where the operator should evaluate sharding (Q43 mentions 500M rows in `raw_usage_events`; tie that to the workspace count).

---

## 6. "Why is enforcement degraded" UX

Q44 is good *per task*. Q10 mentions the Governance tab includes a "telemetry health panel (per-source freshness + stale state per Q19)." That is the workspace-level view. But the doc does not describe its content nor its recovery affordances.

The UI states at Q19 (`enforced` / `partial` / `shadow_due_to_stale_telemetry` / `untrusted`) plus Q31's `shadow_due_to_backfill` plus Q21's breaker `open` plus Q20's `deferred_no_fallback` plus Q41's `schema_malicious` plus Q40's pending counter rebuild — that is **seven distinct degraded states**, each surfaced through different mechanisms. No single screen lists all of them with a one-click recovery action.

Operator at 3am: "Is governance working in workspace facility?" There should be ONE answer. Today the operator must look at four panels — telemetry health, breaker state, Aegis dashboard, schema validation status — to assemble that answer.

**Action item:** Q44 should be extended (or a new Q47/Q48) to specify a workspace-level "Governance Health" dashboard sub-section showing all seven states with per-state recovery affordances (e.g., "Run drift repair", "Restart collector", "Re-enable schema-broken source"). Each affordance maps 1:1 to a runbook entry from §1 above.

---

## 7. Time-Bombs and Accumulating Debt

**Retention sweep default-on?** Q43 lists per-table retention defaults but does not say whether the daily `scripts/retention-sweep.ts` job runs by default or requires operator opt-in. Reading the implication: it's a script, not a scheduled job in the Paddock scheduler. The doc must explicitly state: (a) is it added to Paddock's scheduler? (b) what flag controls it? (c) what is the default? **If the operator never configures retention, do tables grow unbounded?** Today's answer reads as "yes," which is a 2-year time-bomb for the on-call operator. Make it default-on, with a flag to disable.

**Backfill stuck.** Q31 has `status='failed'` for backfill windows but no documented recovery procedure. What if a backfill remains in `running` for 7 days because the source is permanently broken? Is there a max-time after which it auto-transitions to `failed`? The doc does not say. Recommend: backfill window has `max_duration_seconds` (e.g., 24h); past that → auto-`failed`; operator gets escalation per Q37 pattern.

**Reservation reaper.** State transitions in Q6: `active` → `expired` happens via "scheduler tick after `expires_at` passes." But what if the scheduler tick is itself blocked (long migration, breaker open, deterministic-mode-defer)? Reservations sit `active` past `expires_at`. Q35's priority order has admission as P1 but reservation expiry is not in the list. Recommend: "reservation expiry sweep" added as P3 (above reconciliation) so it's not starved.

**Breaker `restart_count`.** Q21 explicitly says "restart does NOT clear it. `restart_count` increments so operator can see 'this breaker has survived N restarts'." Yes — but **there is no alert threshold**. If `restart_count` reaches 50, the operator should be paged. Recommend: alert at `restart_count >= 5` (one work week of Paddock restarts is normal for Paddock development; >5 indicates the breaker is the actual bug).

**Workspace `feature_flags` JSON growth.** Each new flag adds a key. If `feature_flags` accumulates dead keys from removed features, no cleanup is documented. Low priority but worth noting.

---

## 8. Operator Mistakes

Q41 covers the input-validation surface well but missed three operator-error scenarios.

**(a) Manual SQL ledger edits.** Q40 calls this "forbidden but possible." Q41's threat model has no detector. There is no hash chain on ledger rows. There is no periodic reconciliation that flags out-of-band changes. The drift verifier (Q36) compares counters to ledger, but ledger-vs-canonical-effects drift would not trip it (both are forged equivalently).

Recommend: add a `previous_row_hash` column to `resource_budget_ledger` (SHA-256 of prior row content) at INSERT time. Periodic verifier walks the chain. This is one new column and a periodic job — cheap, and it makes the audit trail tamper-evident, which is the only compliance argument the system can make to itself.

**(b) `provider_accounts` row deletion with referential children.** Q15's schema declares `provider_account_id INTEGER REFERENCES provider_accounts(id)` on `canonical_usage_events`, `resource_budget_ledger`, `provider_entitlements`, `resource_overrides`, `canonical_budget_effects`, `telemetry_source_freshness`. **None of these declare an `ON DELETE` clause.** SQLite default is `NO ACTION` → deletion fails if children reference it. That's actually safe-ish, but the doc should be explicit:

- `provider_accounts` is soft-delete only (add `deleted_at INTEGER`); never hard-deleted.
- UI prevents hard-delete with "this account has 1.2M historical events; soft-delete only" message.

**(c) Hard policy with `threshold=0`.** Q41 numeric validation allows `threshold ≥ 0`. A policy with `threshold=0` and `enforce_mode='hard'` blocks every dispatch immediately. There is no sanity check — Q33's promotion criteria require operator confirmation to promote to hard, but the operator could *create* a hard-mode policy with threshold=0 directly via PUT. Recommend: hard policies require `threshold > 0` (REST validator); promotion to hard is gated by both Q33 criteria *and* a non-zero threshold.

---

## 9. Multi-tenancy / Role Separation

`granted_by_kind` enum is `'operator'|'agent_aegis'`, `granted_by_id` is a free-form text. That is sufficient for audit but not for v2 RBAC. If v2 introduces named operators (admin/auditor/read-only), the schema is forward-compatible — `granted_by_id` carries any opaque ID. Good.

What v1 does NOT lock out: the doc has no `actor_role` column on REST audit logs. If "operator" later splits into "auditor" (read-only) vs "admin" (write), retroactive attribution will be impossible. Adding an `actor_role TEXT NULL` column to audit-write paths costs nothing and unblocks v2.

Single-paragraph lens; no other concerns.

---

## 10. Cross-System Invariants

The doc names invariants but does not always commit to verifying them.

- **counters.consumed_cost_usd = SUM(canonical_budget_effects.posted_cost_usd) for same scope+window:** True by construction (Q30 atomicity). Drift verifier (Q36) checks counter-vs-ledger; **it does NOT check counter-vs-effects**. Recommend extending Q36 to a triangular check (ledger ↔ counters ↔ effects).

- **Every `resource_overrides.state='consumed'` has matching ledger debit:** Q6 says match by `task_id + cost ≤ reserved`. If `task_id` is malformed and the match never fires, the reservation `expires` (releasing budget) AND a debit fires for the same usage event later — consumed twice. Need an invariant verifier or a uniqueness constraint preventing double-debit per `(canonical_event_id, scope)`.

- **`canonical_budget_effects` UNIQUE(canonical_event_id, scope)** at Q30 covers the canonical-event side. Reservation side is uncovered.

- **Sum of active reservations = counter `reserved_*`:** Implied by Q35's atomic UPDATE; should be added to the drift verifier.

Recommend a single "invariants reference" appendix listing each invariant, its enforcement (schema/job), and its test. ~6-8 invariants total; naming them explicitly makes them auditable.

---

## 11. Performance Regressions Over Time

Q11 benchmark is one-shot. Q27 benchmark seeds 300K ledger rows. Q46 soak test is 30 minutes nightly. **No commitment exists to recurring benchmarks against a 6-month-aged DB.**

The concern is not synthetic: better-sqlite3 indexed lookups stay sub-10µs even at billion-row scale, but `idx_canonical_workspace_observed` and `idx_canonical_request_id` are partial indexes; their query planner choice can degrade if statistics aren't refreshed. SQLite's `ANALYZE` is not mentioned in the doc. Without periodic `ANALYZE`, the query plan after 6 months may be different from launch.

**Action items:**

- Q11 benchmark CI gate must include an "aged DB" variant (seed 300K + replay 90 days of synthetic traffic). Run weekly, not per-PR.
- Add `PRAGMA optimize` or scheduled `ANALYZE` to Paddock startup OR to the daily retention sweep.
- Capture `mc.governance.admission.duration_ms` p95 (Q45) over a rolling 24h window as an SLO target; alert if SLO budget exhausted.

---

## 12. What's Missing Entirely

Several major operational concerns are not addressed at all by the spec:

- **Backup / restore / DR (§4 above).** Largest gap.
- **SQLite WAL corruption recovery.** What does the operator do if `paddock.db-wal` is corrupted on disk? `.recover` procedure documented?
- **Single-node-failure recovery.** The operator node is one machine. If the operator node dies, Paddock is down. Out of scope, but the doc could explicitly note "recovery is restore-from-backup; ~RTO 30min depending on backup size."
- **Audit-log retention requirements for compliance.** Q43 keeps ledger 5 years. Is that contractually required? Operationally chosen? Either way, it should be tied to a stated requirement so v2 doesn't accidentally shorten it.
- **Rate limiting on REST endpoints.** `/api/resource-overrides`, `/api/resource-policies` — no rate limit declared. Single operator means low actual exposure; but if the API key leaks, an attacker can DoS via thousands of invalid POSTs that all return 422. Doc should declare per-IP-per-route rate limits (or "deferred to gateway-layer rate limiting" with a pointer).
- **Hash-chained ledger for tamper-evidence (§8 above).**
- **Retention sweep default-on guarantee (§7 above).**

Of these, backup/restore and rate limiting are the only ones I'd consider P0. The rest are P1.

---

## 13. Would I Take This On Call?

**Honest answer: not yet.** The spec is unusually thorough — three rounds of oracle review and one peer review have removed nearly every correctness footgun I would normally flag. Q39–Q46 are evidence the authors are taking the operator perspective seriously.

The remaining gaps are operational, not architectural. I cannot be on call confidently without:

1. A documented backup and restore procedure with RTO/RPO commitments.
2. A workspace-level "Governance Health" dashboard showing the seven degraded states with one-click recovery affordances.
3. The seven runbook entries (one per failure mode), each anchored to its activity event, naming the diagnostic + recovery + verification commands.

**The single biggest confidence-multiplier:** writing the *workspace-level governance health dashboard* (§6) and the *seven runbook entries* (§1) BEFORE flag-on. Once those exist, the existing self-observability metrics (Q45) and per-task diagnostic (Q44) become navigable rather than overwhelming.

---

## P0 Blockers (must address before `/speckit.specify`)

1. **Backup, restore, and disaster recovery procedure (§4).** Currently absent. Add as `Q47 — Backup and DR`. Specify cadence, mechanism (`sqlite3 .backup`, NOT `cp`), restore procedure, post-restore counter-rebuild AC, and dedup behavior on collector replay. This is foundational; without it, the system cannot be operated for 12 months.
2. **Per-failure-mode runbook deliverables (§1).** Seven `.md` files in `docs/observability/runbooks/` (one each: collector-down, breaker-open, schema-broken, schema-malicious, drift-detected, aegis-no-fallback, backfill-failed). Each must name the activity event, diagnostic command, recovery command, and verification step. The Strict Scope section currently names only `collector-failure-runbook.md`.
3. **Workspace-level "Governance Health" dashboard (§6).** Specify the single screen that surfaces all seven degraded states (telemetry per-source, backfill, breaker, Aegis, schema, drift, retention sweep status) with per-state recovery affordances. Today only per-task (Q44) exists.

## P1 Should-Fix (plan-phase resolvable)

1. **Retention sweep default-on guarantee (§7).** State explicitly: retention sweep is registered with Paddock scheduler at flag-on; default ENABLED; opt-out via `workspace.feature_flags.governance_retention_disabled=true`. Operator-never-configures-retention must NOT result in unbounded growth.
2. **`provider_accounts` soft-delete semantics (§8).** Add `deleted_at INTEGER` column; UI prevents hard-delete; `ON DELETE` semantics for child tables explicitly stated as `NO ACTION` (deletion blocked while children exist).
3. **Hard policy `threshold=0` sanity guardrail (§8).** REST validator rejects `enforce_mode='hard' AND threshold=0`. Promotion-to-hard UI also blocks it.
4. **Breaker `restart_count` alert threshold (§7).** Add notification rule: `restart_count >= 5` emits `governance_breaker_persistent` at warning level; >= 20 escalates to critical.
5. **Reservation reaper priority + max-duration backfill (§7).** Add reservation-expiry-sweep to Q35 priority list (above reconciliation). Add `telemetry_backfill_windows.max_duration_seconds` (24h default); past that → auto-`failed`.

## Nice-to-have (deferable to v1.1)

- Hash-chained ledger for tamper-evident audit (`previous_row_hash` column on `resource_budget_ledger`).
- Aged-DB benchmark CI variant + scheduled `ANALYZE`.
- Triangular invariant verifier (counters ↔ ledger ↔ canonical_budget_effects).
- `actor_role` audit column for v2 RBAC forward-compat.
- REST endpoint rate limits.

## Final Verdict

**Not ready for `/speckit.specify`** — but only just. The three P0 items are operational scaffolding, not architectural changes. They can be added as Q47/Q48/Q49 sections in this same design concept doc and would not perturb any of the 28 prior decisions. After those three sections land, this is the most thoroughly reviewed spec I have seen in this project.

The five P1s are plan-phase fixable. The nice-to-haves can ride into v1.1.

The spec authors should know: round-1 peer review and rounds 1–3 of oracle review have done their job. The system, *as designed*, is sound. What remains is operator-facing — and that is exactly the right kind of gap to surface late, before the runbook is written, rather than after the on-call rotation starts.
