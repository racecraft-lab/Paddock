# SPEC-008 Research — Phase 0 Output

**Feature**: Resource Governance and Cost Tracker Enforcement
**Date**: 2026-05-02
**Source authority**: `docs/ai/specs/SPEC-008-design-concept.md` Q1-Q73, peer-review-rounds 1-3, oracle adversarial rounds 1-4, 4 Clarify sessions (20 questions resolved)

This document consolidates research findings into a closed set of decisions (R-001..R-016) keyed to the design-concept Q-section families. **All NEEDS CLARIFICATION are resolved.** Decisions marked `[Clarified]` were resolved during the 4 Clarify sessions and have already been encoded into spec.md as inline FRs (FR-079a/b, FR-090a..FR-090m, FR-260a/b).

## R-001: Decision Precedence + Evaluator Hot Path [Q1, Q11, Q35]

**Decision**: Single deterministic evaluator function `resourcePolicyEvaluator(decisionInput)` with documented 7-tier precedence (hard breaker → blackout → hard budget → WIP → degraded class → soft alert → allow). Hot path reads from synchronous budget counters via single SQLite read transaction; no external calls.

**Rationale**: Q1 spec'd a deterministic, all-clear-or-fail-safe evaluator; Q11 set the latency budget at p95 < 15ms; Q35 chose atomic counter UPDATE with `WHERE counter_value = expected_old_value` over advisory locking for SQLite single-process semantics. Combined: a pure function over snapshotted state hits the latency target on a Ryzen 5900XT with 1k policies + 300k ledger rows.

**Alternatives considered**:

- *In-process advisory lock per agent*: Rejected — only meaningful for single-process; SPEC-008 already constrained to single-node, and the conditional UPDATE is simpler.
- *Async evaluator with deferred response*: Rejected — Q11/AC-Bench-1 mandates synchronous admission decision.
- *External rule engine (json-rules-engine, drools-js)*: Rejected per Q16 (no heavy DB/runtime deps); also dynamic-eval surface conflicts with Constitution Principle IX.

## R-002: Budget Ledger / Counter / Posted-Effect Separation [Q17, Q27, Q30, Q35]

**Decision**: Three-layer budget model:

1. `resource_budget_ledger` — append-only, source-of-truth deltas keyed to canonical event ids.
2. `resource_budget_counters` — precomputed `(policy_id, window_id, counter_value, version)` for O(1) admission.
3. `canonical_budget_effects` — posted-effect tracking per Q30 to dedup canonical-event → ledger application across rebuilds.

Counter rebuild (FR-058) is async + chunked + idempotent + verifies ledger sum = counter before atomic swap.

**Rationale**: Q17 set ledger as truth; Q27 separated counters for sub-25ms reads; Q30 introduced posted-effect to prevent double-counting on rebuild; Q35 atomic UPDATE pattern on counters. The three-way separation lets the reconciler write corrections without rewriting ledger history (Q26).

**Alternatives considered**:

- *Single counter table with running totals*: Rejected — drift detection requires a sum-of-ledger reference.
- *Materialized view*: Rejected — better-sqlite3 has no MATERIALIZED VIEW; manual implementation = posted-effect.

## R-003: Three SQLite Connections per Workload Class [Q29, FR-060]

**Decision**: `getDb({class: 'foreground'|'background'|'audit'})` returns one of three connections. Foreground busy_timeout=50ms (admission), background=5s (reconciler/rebuild/drift/reaper), audit=30s (verification + retention). Single-writer-multiple-reader semantics held via SQLite WAL.

**Rationale**: Q29 — busy_timeout amplifies tail latency; the foreground connection MUST give up fast and force the evaluator into its retry-up-to-3 path (FR-012) rather than block. Background + audit get longer windows so they don't lose work to spurious BUSY.

**Alternatives considered**:

- *Single connection with serial queue*: Rejected — admission serialization exceeds latency budget under load.
- *Separate database files per workload*: Rejected — referential integrity for ledger/counter cross-references.

## R-004: Reservation Atomicity + Race-Free Concurrent Grants [Q6, Q40, Q41, Q66]

**Decision**: `reserveAtomic(policy_id, amount)` runs inside `db.transaction(() => { ... })` performing: (a) atomic counter conditional UPDATE; (b) reservation row insert; (c) audit row insert. Returns 201 on rowcount=1 path; 409 with stable error body on rowcount=0 path. Reaper + task-completion + operator-revoke share single primitive `releaseReservation(id, reason)` (FR-063) which `UPDATE state='expired' WHERE id=? AND state='active'`-guards against double-release.

**Rationale**: Q6 + Q40 set race-free grant as NON-NEGOTIABLE; Q66 distributed responsibility across three release paths and a shared primitive prevents drift; Q41 stabilized the error envelope.

**Alternatives considered**:

- *Two-phase reservation with separate hold/commit*: Rejected — unnecessary complexity for single-node.
- *Optimistic UPDATE with retry*: Rejected — Q40 spec'd deterministic 409 (not retry-until-success).

## R-005: DST Handling + Window Materialization [Q2, Q46]

**Decision**: Window policies store IANA tz + cron-like rule; on policy edit AND on a daily 02:00 local-time job, materialize `window_instances(window_id, instance_start_utc, instance_end_utc, instance_local_label)` for the next 90 days. Materialization uses `Intl.DateTimeFormat` + Temporal-style local-time arithmetic; verified with property-based test asserting no double-fire / no skipped-fire on spring-forward and fall-back.

**Rationale**: Q2 picked operator local timezone; Q46 spec'd 90-day forward materialization to keep evaluator-time DST math out of hot path (admission reads materialized rows).

**Alternatives considered**:

- *Compute-on-demand cron*: Rejected — adds dependency (`cron-parser`) and DST edge cases re-emerge in hot path.
- *UTC-only with offset annotation*: Rejected — operator UX of "10pm CDT" matters more than implementation simplicity here.

## R-006: Multi-Source Telemetry Reconciler [Q18, Q24, Q26, Q34, Q39, Q52, Q67, Q73]

**Decision**: `raw_usage_events` is per-source append-only with `provenance` annotation. `canonical_usage_events` is the deduped/coalesced layer keyed on `(provider_request_id, provider_timestamp_ms)`. The reconciler runs as a batched background worker; when two sources produce the same key the canonical event carries `provenance='merged'` and `merge_sources[]`. Late-arriving raws (after canonical posted) enter `correction_ledger`. PII redaction happens at write time (raw + canonical) per Q67/Q73. Codex stdout↔rollout join confidence depends on Phase-0 spike `verify-codex-stdout-rollout-timestamp-parity.ts` (high vs medium per FR-082).

**Rationale**: Q18 spec'd two-layer; Q26 spec'd corrections via append, never overwrite; Q34 spec'd late-arriving repair; Q39/Q52 spec'd timestamp-parity precondition for Codex.

**Alternatives considered**:

- *Single-table with materialized dedup*: Rejected — auditability of per-source provenance + reproducibility of the reconciler require raw retention.
- *Treat all sources as canonical*: Rejected — duplicate-counting failure mode dominates the failure surface.

## R-007: OTLP Receiver Auth + Admission Control [Q16, Q47, Q68, FR-079a/b, FR-090e]

**Decision**: `POST /api/otlp/v1/{traces,metrics}` reuses MC's existing global API key infrastructure via `extractApiKeyFromHeaders` + `requireRole(req, 'operator')` from `src/lib/auth.ts:514-544/723-735`. otelcol-contrib gets a dedicated `agent_api_keys` row (NOT a new column — Constitution Principle XII) with `key_label='otelcol-contrib@<host>'`, ciphertext stored in 1Password. Per-IP token-bucket on 401: 10 fails / 60s → 429. 1 MiB payload cap → 413. Disk-pressure ladder per FR-090e (amber/red thresholds with operator-override env vars).

**Rationale**: Reuse beats invention; Principle XII forbids speculative `agent_api_keys.type` column. FR-079a/b were ratified during Clarify Session 4 with operator confirmation that single-host single-collector topology does not justify a dedicated key-type.

**Alternatives considered**:

- *New `agent_api_keys.type='otelcol_collector'` column*: Rejected per Principle XII.
- *Separate API key store for collector*: Rejected — operational complexity + drifting rotation.
- *mTLS instead of API key*: Rejected — collector + receiver are localhost-only; cert ops > value.

## R-008: otelcol-contrib Pinning + Cosign Verification [Q16, Q72, FR-090b]

**Decision**: Pin to `v0.108.0`; install via `scripts/install-otelcol.sh` which:

1. Downloads upstream `*_checksums.txt`.
2. `cosign verify-blob` against signing identity `https://github.com/open-telemetry/opentelemetry-collector-releases/.github/workflows/build-and-release.yaml@refs/tags/v<X>.<Y>.<Z>`.
3. SHA-256 verifies the binary tarball against the entry.
4. Inserts `governance_health_events(component='collector', state='healthy', metric_json={installed_version, checksum, signing_identity, installed_at})`.

Quarterly refresh + alert if installed > 180 days.

**Rationale**: Supply-chain hardening (Principle VI + FR-227) demands artifact authenticity. Q72 set the ladder; cosign is upstream's signing tool.

**Alternatives considered**:

- *Distro package (`apt install otelcol-contrib`)*: Rejected — distro lag + no upstream signature chain.
- *Container image*: Rejected — operator runs systemd, not container daemon, on HAL.

## R-009: Provider Account Model + Entitlement Detection [Q15, Q15.5, Q42, Q64, Q70, Q71]

**Decision**: New `provider_accounts(id, provider, account_type, billing_mode, entitlements_json, config_json_encrypted, tos_acknowledged_at, tos_version, automation_class, soft_deleted_at)` replaces the single-row `provider_subscriptions`. M63/M64a migrates existing rows. Encryption uses AES-256-GCM via sealed-secret fallback (no KMS in v1); rotation procedure documented at `docs/runbook/encryption-key-rotation.md`. Entitlement detection runs on three cadences (FR-134a): daily 00:15 UTC global; 6h for accounts with `expires_at - now < 24h`; on-admission inline re-detect on background connection with 50ms cap when `effective_at + 7d < now`.

**Rationale**: Q15 demanded account-level model; Q15.5 (peer-review consensus) added the three-cadence detection; Q42 re-affirmed token/request/session caps even at $0 marginal cost; Q70 spec'd encryption-at-rest; Q71 spec'd ToS surface flags.

**Alternatives considered**:

- *Keep `provider_subscriptions`, add fields*: Rejected — schema-impedance for billing_mode dispatch.
- *External KMS (AWS KMS, GCP KMS)*: Deferred to v2; sealed-secret fallback satisfies single-node.

## R-010: Aegis Starvation Prevention [Q5, Q20, Q42, Q53]

**Decision**: Aegis is subject to evaluator governance like other agents BUT with `aegis_emergency_reserve` policy type. Default mode is `soft_alert` (NOT hard block — Q42 peer-review correction). Reserve maintained per workspace; when policy stack would block all Aegis, critical-class Aegis dispatch may consume from reserve with `source='aegis_emergency'` ledger entry. Reserve replenishes on policy window roll. Blackout windows have higher precedence than reserve (FR-162). Aegis emergency-reserve badge has 4 states: inactive / engaged / cooling-down / disabled-by-flag.

**Rationale**: Q42 oracle review caught that hard-blocking Aegis is suicidal for review pipeline integrity; Q53 spec'd reserve sizing + escalation.

**Alternatives considered**:

- *No Aegis governance*: Rejected — Aegis can run away on its own budget without policy.
- *Hard-block default*: Rejected per peer-review-round-2.

## R-011: M64 Migration Decomposition [Q57, FR-260a/b]

**Decision**: M64 is split into 13 dependency-ordered sub-migrations M64a..M64m to keep individual migrations small, individually testable, and individually rollbackable. M64m runs `PRAGMA foreign_key_check` final guard. M65 promotes token pricing to DB (FR-260a). All 15 rollback files (`M63`, `M64a..M64m`, `M65`) ship with explicit reverse SQL.

**Order** (forward dependencies; data-model.md elaborates each):

```text
M63    resource_policies (extend M60), decisions, audit_chain, retention_policy
M64a   source_emission_capability registry (no FKs out; depended on by all sources)
M64b   raw_usage_events (FK → source_emission_capability)
M64c   canonical_usage_events (FK → raw_usage_events via merge_sources, weak ref)
M64d   canonical_budget_effects (FK → canonical_usage_events)
M64e   resource_budget_ledger (FK → canonical_usage_events optional)
M64f   resource_budget_counters (FK → resource_policies)
M64g   resource_reservations (FK → resource_policies, decisions)
M64h   resource_overrides (FK → resource_reservations, decisions)
M64i   reconciliation_batches
M64j   correction_ledger (FK → canonical_usage_events)
M64k   snapshots (FK → source_emission_capability)
M64l   provider_accounts + provider_entitlements (with migration of provider_subscriptions data)
M64m   ingest_rate_state + governance_health_events + window_instances + recovery_actions; final PRAGMA foreign_key_check
M65    token_pricing
```

**Rationale**: Q57 set 13 sub-migrations specifically because a single M64 monolith would (a) take too long under foreground load; (b) be unreviewable in PR; (c) leave intermediate state if it failed. Each sub-migration is rerun-safe.

**Alternatives considered**:

- *Single M64*: Rejected per Q57 rationale.
- *2 migrations (additive then constraint)*: Rejected — does not address PR reviewability.

## R-012: System Health Dashboard + One-Click Recovery [Q62, FR-090i]

**Decision**: System Health subview renders per-source pills (green/amber/red), collector freshness, breaker states, drift alerts, recent runbook links. One-click affordances follow the gesture matrix in FR-090i (single-click + checkbox / typed-phrase / EXCLUDED). Each successful recovery writes `recovery_action(operator_id, kind, target, ts, idempotency_key)` audit row. Affordance subset:

- `restart-collector`, `force-resume-hard-enforcement`, `manually-close-breaker`, `top-up-reserve`, `pause-aegis`, `force-local-mode`, `run-rebuild`, `mark-acknowledged`.
- Excluded: `update-parser` (code change), forensic/`broken` artifact mutations.

**Rationale**: Q62 mandated dashboard + one-click; FR-090i was clarified during Session 3 to lock the gesture matrix with explicit confirmation friction proportional to blast radius.

## R-013: Per-Failure-Mode Runbooks [Q61, FR-090l, FR-090m]

**Decision**: 10 runbook files at `docs/runbook/<slug>.md`, each with H2 sections in fixed order:

```text
## Symptom
## Severity
## Likely causes
## Diagnostic commands
## Recovery steps        # single-action copy-pastable fenced bash blocks ONLY
## Verification
## Escalation
```

Plus 2 specialty runbooks (`rotate-otelcol-api-key.md`, `ollama-proxy-port-collision.md`). Alert deep-links use `#recovery-steps` for general, `#<affordance-id>` (kebab-case Q62 label) for specific. Chaos test harness `pnpm test:chaos` runs each runbook's primary recovery against the matching simulated failure and asserts `## Verification` passes. Orphan detector `scripts/check-runbook-links.ts` flags alerts referencing non-existent runbook slugs.

**Rationale**: Q61 demanded runbooks; FR-090l/m clarified template + chaos-test enforcement.

## R-014: Phase-0 Verification Spike Scripts [FR-090a]

**Decision**: 4 scripts authored under `scripts/`:

| Script | Hypothesis | Verdict mechanism | Output |
|---|---|---|---|
| `verify-claude-code-otel-emission.ts` | `claude -p` (subprocess) emits OTel when `CLAUDE_CODE_ENABLE_TELEMETRY=1` | Spawn `claude -p`, run scripted prompt, observe stdout/UDP for OTel envelopes | `docs/ai/specs/spikes/claude-code-otel-emission.json` |
| `verify-claude-mcp-otel-emission.ts` | `claude mcp serve` ALSO emits OTel | Spawn `claude mcp serve` over stdio, run protocol round-trip, observe | `docs/ai/specs/spikes/claude-mcp-otel-emission.json` (expected verdict: `downgraded` per peer-review-round-1#214; transcript-replay becomes authoritative for that path) |
| `verify-codex-stdout-rollout-timestamp-parity.ts` | Codex stdout `turn.completed.usage.provider_timestamp_ms` matches rollout file's same field | Run Codex CLI, capture stdout JSON + rollout file, diff timestamps for ≥ N=20 turns | `docs/ai/specs/spikes/codex-stdout-rollout-timestamp.json` (Q52: high vs medium confidence) |
| `verify-copilot-events-ci.ts` | Copilot CLI in non-interactive mode writes `~/.copilot/events.jsonl` | Run Copilot CLI scripted, check file exists + has events | `docs/ai/specs/spikes/copilot-events-ci.json` |

Each evidence file: `{decision_q, hypothesis, sample_size_min, observed, verdict: 'confirmed'|'downgraded', downgrade_target?, captured_at}`. CI gate `tests/integration/spec-spike-gates.test.ts` fails closed if any `[VERIFY]`-tagged FR lacks evidence file with verdict matching FR-prescribed value.

**Rationale**: FR-090a (Clarify Session 2 / peer-review-round-1) made empirical verification a MUST before the corresponding adapters can be built. Constitution Principle IV (Test-First) demands the spike scripts run BEFORE Phase 5 implementation.

## R-015: Numeric Defaults Catalog [FR-090e + assorted]

| Knob | Default | Override env | Source FR/Q |
|---|---|---|---|
| Admission p95 ceiling | 25 ms | (compile-time benchmark gate) | FR-004, Q11 |
| Counter retry | 3 attempts, exp backoff | n/a | FR-012, Q35 |
| Foreground busy_timeout | 50 ms | n/a | Q29 |
| Background busy_timeout | 5 s | n/a | Q29 |
| Audit busy_timeout | 30 s | n/a | Q29 |
| Reservation TTL | 2 h | per-policy override | FR-063, Q66 |
| Reservation reaper cadence | 60 s | n/a | FR-064, Q66 |
| Drift detection cadence | 24 h | per-table override | FR-095, Q58 |
| Drift sample size | ≥ 100 per window | per-policy override | FR-108, Q58 |
| Drift auto-repair tier | ≤ 1% AND USD≤$0.50 / tokens≤10k / requests≤10 / sessions≤1 | `policy_config_json` | FR-057 |
| Drift hard-block tier | > 50% | n/a | FR-057 |
| Counter rebuild chunk | (Q49 default 10k rows) | configurable | FR-058 |
| Calibration milestone | 14 days observations | per-policy override | FR-041, Q33 |
| Activity throttle | `max_alerts_per_minute` | configurable | FR-194, Q7 |
| Late-event accept horizon | 168 h | configurable | FR-106, Q34 |
| Snapshot cadence | 5 min | per-source override | FR-112, Q19 |
| Backfill window cap | 168 h | configurable | FR-124, Q31 |
| Collector outage alert | `collector_outage_alert_seconds` | configurable | FR-129, Q48 |
| Retention `raw_usage_events` | 30 d | per-workspace override | FR-258, Q43 |
| Retention `canonical_usage_events` | 180 d | per-workspace override | FR-258 |
| Retention `budget_ledger` | 365 d | per-workspace override | FR-258 |
| Retention `snapshots` | 90 d | per-workspace override | FR-258 |
| Retention `decisions` | 90 d | per-workspace override | FR-258 |
| Retention `audit` | 365 d+ | per-workspace override | FR-258 |
| Disk amber | < 5 GB OR < 10% | `MC_INGEST_DISK_AMBER_BYTES`, `MC_INGEST_DISK_AMBER_PCT` | FR-090e |
| Disk red | < 2 GB OR < 5% | `MC_INGEST_DISK_RED_BYTES`, `MC_INGEST_DISK_RED_PCT` | FR-090e |
| Per-source steady_state events/min | per-source default | `MC_INGEST_RATE_<SOURCE>_STEADY` | FR-090e |
| Per-source burst | per-source default | `MC_INGEST_RATE_<SOURCE>_BURST` | FR-090e |
| Envelope size per source | native_otel/cli_stdout=8 KiB; gateway=16 KiB; transcript/manual=4 KiB; provider_quota=2 KiB | n/a | FR-090e |
| 401 rate limit | 10/60s per IP | n/a | FR-079a |
| Payload cap | 1 MiB | n/a | FR-079a |
| API rate limit | 60 req/min per session/key | configurable | FR-203, Q68 |
| Bulk-promote phrase | `PROMOTE TO SOFT` / `PROMOTE TO HARD` | n/a | FR-090h |
| Resume-hard-enforcement phrase | `RESUME HARD ENFORCEMENT` | n/a | FR-090i |
| Pause-Aegis phrase | `PAUSE AEGIS` | n/a | FR-090i |
| Reserve top-up cap | 100% of policy limit | n/a | FR-090i |
| Dispatch feed page size | 50 | configurable | FR-090j |
| Dispatch retention | 30 days (range 7-90) | `governance.json.retention.dispatch_log_days` | FR-090j |
| otelcol version refresh alarm | 180 days | n/a | FR-090b |

## R-016: Test Strategy Coverage Matrix [FR-221..240, FR-090a, FR-090m]

**Decision**: 6 test tiers with explicit gates per tier:

| Tier | Tool | Gate | FR/AC |
|---|---|---|---|
| Unit | Vitest | Per-file coverage; deterministic clock | FR-225, Principle IV |
| Integration | Vitest | REST × success/error; flag matrix | FR-220, FR-316..325 |
| Benchmark | Vitest bench | p50<5ms, p95<15ms, p99<25ms; +10% regression blocks | FR-222, AC-Bench-1 |
| Soak | Vitest long-run | 30 min @ 100/sec; p95<15ms; mem<+50MB | FR-224, AC-Soak-1 |
| Chaos | `pnpm test:chaos` | 10 runbook scenarios + 7 chaos categories | FR-090m, FR-223 |
| e2e (real Playwright) | Playwright | Docker-backed; visual manifest gate | FR-296..305, Principle XIV |
| Visual regression | Storybook + visual regression | Default/loading/error/empty/dense/disabled-by-flag | FR-306..315, Principle XIV |
| Spike-evidence | Vitest integration | All `[VERIFY]`-tagged FRs have evidence files | FR-090a |
| Supply-chain | CI script | License allow-list + lockfile audit | FR-227, FR-239, Principle VI |
| Byte-compat regression | Playwright | Flag-OFF snapshot diff = 0 | FR-238, FR-305, Principle I |

---

## Q-Family Coverage Map

For `/speckit.analyze` traceability:

- **R-001** ↔ Q1, Q11, Q35, Q5
- **R-002** ↔ Q17, Q27, Q30, Q35, Q49, Q26
- **R-003** ↔ Q29, Q60 (FR-060)
- **R-004** ↔ Q6, Q40, Q41, Q66, Q50
- **R-005** ↔ Q2, Q46
- **R-006** ↔ Q18, Q24, Q26, Q34, Q39, Q52, Q67, Q73
- **R-007** ↔ Q16, Q47, Q68
- **R-008** ↔ Q16, Q72
- **R-009** ↔ Q15, Q15.5, Q42, Q64, Q70, Q71
- **R-010** ↔ Q5, Q20, Q42, Q53
- **R-011** ↔ Q57
- **R-012** ↔ Q62
- **R-013** ↔ Q61
- **R-014** ↔ Phase-0 Spikes (peer-review-round-1#214/215)
- **R-015** ↔ Q11, Q35, Q47, Q66, Q58, Q33, Q7, Q34, Q19, Q31, Q43, Q48, Q68
- **R-016** ↔ Q14, Q11, Q46, Q55, Q72

**Q-numbers folded into FR families** (per spec.md Assumptions): Q3 → R-001/R-005 (policy schema in evaluator + windows); Q4 → R-001/R-002 (enforce_mode); Q7 → R-015 (throttling); Q8 → R-006 (OpenClaw adapter); Q9 → contracts (REST API); Q10 → plan.md UI section; Q12 → R-001/R-011 (policy versioning); Q13 → R-001 (breaker); Q21 → R-001 (breaker); Q22 → R-001 (priority_rank); Q23 → R-006 (source registry); Q25 → R-006 (Copilot tiered validation); Q28 → R-011 (migration test harness); Q31 → R-006 (backfill); Q32 → R-006 (freshness); Q36 → R-002 (drift); Q37 → R-006 (Copilot escalation ladder); Q38 → R-002 (window accounting); Q43 → R-015 (retention defaults); Q44 → contracts (decision row schema); Q45 → R-001/R-006 (self-obs); Q48 → R-006/R-007 (local health); Q51 → R-002 (partition); Q54 → contracts (diagnostic feed); Q55 → R-016 (chaos); Q56 → contracts (bulk-promote); Q58 → R-002 (drift sample); Q59 → R-001 (hard-disable); Q63 → R-002/R-015 (retention sweep); Q65 → R-001 (sanity bounds); Q67 → R-006 (PII); Q69 → R-001/R-016 (audit chain); Q70 → R-009; Q71 → R-009; Q73 → R-006 (logging redaction).

All 73 design-concept Q-numbers are covered. **Zero NEEDS CLARIFICATION remaining.**

---

## Phase-0 Verification Spike Authoring Plan

The spike scripts themselves are authored as part of Phase 5 (`/speckit.implement`) early tasks but BEFORE any adapter task can start. Their evidence files (`docs/ai/specs/spikes/*.json`) MUST exist with valid verdicts before `tests/integration/spec-spike-gates.test.ts` will pass; the gate runs as a precondition for advancing to adapter implementation tasks.

**Authored as P0-T0..P0-T3 in tasks.md** (operator notes: these are independently-runnable scripts that produce JSON evidence files; they do not commit code; their output gates downstream tasks).

---

**Research status**: Complete. 16 R-decisions cover all Q-families. 0 unresolved clarifications. Ready for Phase 1 design output (`data-model.md`, `contracts/`, `quickstart.md`).
