---
spec_id: SPEC-008
spec_name: Resource Governance and Cost Tracker Enforcement
short_name: resource-governance
phase: 7
priority: P2
feature_flag: FEATURE_RESOURCE_GOVERNANCE
secondary_feature_flags:
  - FEATURE_OPENCLAW_HEALTH_COSTS
  - FEATURE_MULTI_SOURCE_INGESTION
question_count: 73
status: draft
created_at: 2026-05-02
authority: Operator (interactive grill-me session) + research-augmented (9 background research agents) + advisor-validated (2 advisor calls) + ground-truthed against OpenClaw + MC source on GitHub + 4 RepoPrompt oracle adversarial review rounds + 3 independent peer reviews (distributed-systems, SRE/operator, security/compliance lenses) + 60+ correctness corrections applied across all rounds
implementation_authority: SpecKit autopilot via speckit-pro plugin (single spec; LLM-agent execution; not human-engineering days)
---

# SPEC-008 — Resource Governance and Cost Tracker Enforcement — Design Concept

## Context

Paddock's `resource_policies` and `resource_policy_events` tables landed empty in SPEC-001 (M60/M61). Phase 7 turns the existing best-effort Cost Tracker into a feature-flagged scheduler enforcement layer. Hard-coded `LIMIT 3` and "3+ in_progress" capacity checks in the dispatcher are the only enforcement that exists today.

### Source-of-truth inventory (ground-truthed against `racecraft-lab/openclaw` + `racecraft-lab/Paddock`)

**OpenClaw is three distinct telemetry sources, not one:**

- **A1 — Gateway-mediated OTel** (`docs/gateway/opentelemetry.md`). Real-time. Activates only when chats route through `openclaw-gateway`. Emits standard OTel GenAI semconv (`gen_ai.client.token.usage`, `gen_ai.client.operation.duration`) AND OpenClaw-prefixed (`openclaw.tokens`, `openclaw.cost.usd`, `openclaw.run.duration_ms`, `openclaw.context.tokens`, `openclaw.model_call.*`, `openclaw.queue.*`, `openclaw.session.*`) over OTLP/HTTP (protobuf, http/protobuf only — gRPC ignored).
- **A2 — Transcript-replay** (`src/infra/session-cost-usage.ts`). Post-hoc parse of CLI rollout/transcript files. 30s cache, 256-entry bound, in-flight request coalescing.
- **A3 — Provider-quota fetchers** (`src/infra/provider-usage.fetch.{claude,codex,gemini,minimax,zai}.ts`, `extensions/github-copilot/usage.ts`). Coarse `% remaining` windows from each provider's quota endpoint. **OpenClaw's Copilot adapter polls `https://api.github.com/copilot_internal/user` (undocumented `_internal` endpoint with VS-Code-spoofed headers — see Q19 below for why this is advisory-only).**

**Paddock's existing ingestion is also three:**

- **B1 — `getAllGatewaySessions()`** (`src/lib/sessions.ts`). Reads ONLY `OPENCLAW_STATE_DIR/agents/<agent>/sessions/sessions.json` — OpenClaw's aggregate session blob. Does NOT read raw rollouts. 30s cache. **Critical caveat (per oracle review): this stream may include API-key-billed (metered) Anthropic/OpenAI traffic if any agent is configured for metered access via OpenClaw — the "no SDK calls in v1" claim is operator preference, NOT enforced by the data path.**
- **B2 — `/api/tokens` POST** (`src/app/api/tokens/route.ts`). Manual operator-role writes to `tokens.json` + DB `token_usage` table.
- **B3 — DB `token_usage` heartbeat rows** (`loadTokenDataFromDb`). Workspace-scoped via M023 + task-attributed via M025. Schema: `id, model, session_id, input_tokens, output_tokens, task_id, workspace_id, created_at` + later additions `cost_usd`, `agent_name`.

**Native CLI telemetry — three independent sources, with materially different fidelity:**

| CLI | Native OTel? | Rollout/log file | Per-turn fidelity | Cost USD on flat-rate? |
|---|---|---|---|---|
| **Claude Code** (Claude Max 20x) | ✅ `CLAUDE_CODE_ENABLE_TELEMETRY=1` emits 8 metrics + 13+ event types in `claude_code.*` namespace | `~/.claude/projects/<urlenc-cwd>/sessions/<uuid>.jsonl` (per-turn `assistant.message.usage`) | ✅ events stream is per-API-request with `request_id` + `prompt.id` | ✅ `claude_code.cost.usage` emitted (Anthropic-priced × tokens) — same number on Max 20x and metered API |
| **OpenAI Codex** (ChatGPT Pro) | ✅ logs+traces (token counts on spans); ❌ NO metrics in `codex exec` or `codex mcp-server` (only interactive `codex` wires metrics) | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (`token_count` events with `total_token_usage` + `last_token_usage` + `rate_limits.plan_type`) | ✅ `codex exec --json` emits `turn.completed.usage` to stdout in real time | ❌ Codex doesn't emit USD; MC must compute from price catalog |
| **GitHub Copilot CLI** (Copilot Pro+) | ❌ NO native OTel (issues #2471, #1911 open) | `~/.copilot/session-state/<sid>/events.jsonl` `session.shutdown.modelMetrics.*` (reverse-engineered schema; `J-Bax/copilot-token-tracker` is canonical reference) | ◐ events.jsonl flushed at session shutdown (not per-turn). `copilot -p --format json` does NOT include token data (issues #1152, #2052 open) | ❌ Premium-request units, switching to "AI Credits" 2026-06-01 |
| Ollama Cloud | ❌ no OTel (issue #9254 PoC) | `~/.ollama/logs/server.log` (no token counts in logs) | Token counts in HTTP response body (`prompt_eval_count`, `eval_count`) | n/a |
| LM Studio (local GPU) | ❌ no OTel | Logs at `~/.lmstudio/` (Linux post-0.3.6) or `~/.cache/lm-studio/server-logs/` (pre-0.3.6) | OpenAI-compat `/v1/chat/completions` returns `usage:{prompt_tokens, completion_tokens, total_tokens}`; v0 REST adds tokens/sec + TTFT; `lms log stream --json --stats` is NDJSON firehose | Local energy cost only (via OpenClaw health adapter) |

The operator runs all five surfaces on the operator node (Ryzen 5900XT, 64GB RAM, Ubuntu 24.04). v1 operator preference is subscription CLIs (Claude Max 20x, ChatGPT Pro, Ollama Pro, Copilot Pro+, LM Studio local), but telemetry **may include metered API usage** from OpenClaw — SPEC-008 must classify billing mode per event/account, not assume all provider usage is subscription-covered.

The feature is gated by `FEATURE_RESOURCE_GOVERNANCE` (workspace-scoped, default OFF). With the flag OFF, behavior is byte-identical to today including the legacy hard-coded `LIMIT 3`. `FEATURE_OPENCLAW_HEALTH_COSTS` is an operator-specific optional second flag for the electricity adapter (no v1 schema migration; absent-safe). `FEATURE_MULTI_SOURCE_INGESTION` is a third flag gating the new ingestion adapters so they ship dark behind the governance flag.

## Architectural Corrections from Adversarial Review

This design concept underwent **multiple adversarial peer review rounds** by RepoPrompt's oracle plus independent peer review. **29 correctness fixes** applied across two remediation rounds (14 round-1 + 15 round-2); one scope-split recommendation was rejected because SPEC-008 is implemented by an LLM agent (SpecKit autopilot) in a single spec, not by human-engineering weeks. Round-2 corrections are documented in their own table below the round-1 table.

### Round-2 corrections summary

| # | Round-2 oracle finding | Resolution |
|---|---|---|
| 16 | Q6 transaction syntax wrong (`db.transaction(fn).immediate(args)` is the actual API) | Q6 — corrected pseudocode + busy_timeout + 5-status HTTP contract + 5-concurrent-grant AC |
| 17 | Q18 dedupe could double-count via additive UPDATE | Q18 — `canonical_usage_sources` join table; non-additive; authoritative source picked by precedence; idempotent INSERT ON CONFLICT DO NOTHING |
| 18 | Medium-confidence dedupe 1% tolerance wrong | Q18 — EXACT token match required for medium confidence; 1% rejected |
| 19 | Q19 cumulative-to-delta lacked session boundary | Q19 — `generation_id` required per source; counter resets handled; per-source derivation rules |
| 20 | Source emission semantics not enumerated | Q23 — `UsageEmissionMode` registry with per-adapter `emission_mode`, `ordering_key`, `reset_boundary`, `dedupe_key`, `enforcement_eligibility`, `schema_version` |
| 21 | Collector freshness incoherent across sources for same provider | Q19 — degrade by `(source_path, provider_account_id, enforcement_metric)` not provider; UI states `enforced`/`partial`/`shadow_due_to_stale_telemetry`/`untrusted` |
| 22 | Backfill flooding risk after collector downtime | Q24 — bounded chunks (1000 rows/tick), correction coalescing, `state='backfill_in_progress'` UI indicator |
| 23 | Ledger O(n) SUM defeats sub-25ms p95 | Q27 — `resource_budget_counters` precomputed; admission reads counters O(1); ledger remains audit |
| 24 | Aegis reserve underspecified | Q20 — per-workspace scope, UTC reset, in-flight rules, `getAegisFallbackCapabilities()` LM Studio probe, `deferred_no_fallback` state, 4-break-glass-per-day soft limit |
| 25 | Migration risk hand-waved | Q28 — preflight checks, idempotent CREATE TABLE IF NOT EXISTS, half-failure AC, 11-step M64 split (M64a..M64k), reapply AC |
| 26 | Reconciler-on-every-insert too chatty | Q24 — batched worker pattern with `reconcile_status` queue; runs every 5s with batch_size=100 |
| 27 | `[VERIFY]` for `claude -p` is foundational | Q23 emission registry requires capability declaration; v1 plan ships pre-spec spike |
| 28 | Copilot schema break-detection contract | Q25 — JSON schema per pinned version; `schema_broken` state; AI Credits 2026-06-01 future schema versioned |
| 29 | Retry semantics conflated different failure types | Q6 — explicit 201/200/409/423/422 status codes with `retryable: boolean` |
| 30 | Correction ledger noise from 1-row-per-event | Q26 — coalesced corrections per `(workspace, scope, account, window, batch)` tuple; `coalesced_event_count` + `coalesced_canonical_event_ids` provenance |

### Round-1 corrections summary

| # | Oracle finding | Resolution in this doc |
|---|---|---|
| 1 | Scope is too large for 3 weeks; split into 008A/B/C/D | **Rejected** — LLM autopilot execution is not bounded by human-engineering weeks. Single comprehensive spec with phased rollout (Q22 Rollout Posture). |
| 2 | Enforcement and telemetry conflated; need separate budget ledger | Q17 — `resource_budget_ledger` is the synchronous source-of-truth for admission control; telemetry is eventually-consistent and writes corrections. |
| 3 | Reservation model race-prone | Q6 (revised) — reservations committed atomically with `BEGIN IMMEDIATE` + explicit states + idempotency key. |
| 4 | Single-table dedup hand-wavy | Q18 — two-layer model: `raw_usage_events` (append-only per source) + `canonical_usage_events` (stable identity); ±30s heuristic suggests candidates only, never authoritative. |
| 5 | Cumulative-to-delta non-deterministic | Q19 — `usage_snapshots` table with explicit `snapshot_seq` + `provider_timestamp` + `raw_hash`; sort by provider time; "untrusted cumulative" flag if neither available. |
| 6 | Shadow/hard contradiction in Q4 seeded defaults | Q4 (revised) — ALL seeded defaults are `enforce_mode='shadow'` including WIP. Operator promotes to soft/hard explicitly. |
| 7 | Aegis "block→defer" doesn't prevent starvation | Q20 — system-reserved Aegis emergency budget lane; degraded local-only mode; operator break-glass override; v1 ships Aegis governance as shadow-only with promotion path. |
| 8 | Circuit breaker resets on restart unsafe | Q21 — `resource_governance_breaker` table persists state; deterministic mode (global shadow OR global defer) during migration/DB lock errors. |
| 9 | 5% reconciliation drift invented | Q18 + Q22 — per-source thresholds, calibration milestone before hard enforcement; until calibration, drift fires diagnostics not budget blocks. |
| 10 | `UNIQUE(workspace_id, provider)` wrong | Q15 (revised) — replace with `provider_accounts` + `provider_entitlements`; usage events reference `provider_account_id` when known. |
| 11 | "No SDK calls v1" contradicted by data path | Context section reworded — operator preference, not enforced. Billing mode classified per event/account. |
| 12 | Collector failure semantics undefined | Q19 — collector health tracked per source; stale data → that source's enforcement degrades to shadow; backfill on restart. |
| 13 | `copilot_internal/user` can't be enforcement foundation | Q15 — Copilot subscription detection is advisory; operator-configured limits are the enforcement floor. |
| 14 | Sub-25ms p95 claim under-benchmarked | Q11 (revised) — full-path benchmark (1k+ policies, concurrent gates, WAL load, cold/idle), p95 + p99 both gated. |
| 15 | Several [VERIFY]s belong pre-spec | Critical [VERIFY]s promoted out of Open Questions; remainder explicitly bounded as Plan-phase Codex/Claude probe scripts. |

## Goals

1. **Enforce, don't just observe.** Replace hard-coded `LIMIT 3` and "3+ in_progress" with policy-evaluated decisions returning `allow | defer | block | override_required`. Four scheduler gate sites: `autoRouteInboxTasks`, `dispatchAssignedTasks`, `advanceTaskChain`, `runAegisReviews`. **Synchronous admission control reads the budget ledger only**, not eventually-consistent telemetry.
2. **Sub-25ms p95 evaluator on the operator node** under realistic load (1k+ policies, concurrent gates, SQLite WAL writes, cold/idle resume). Layered cache + single indexed-SQL hot path; vitest benchmark gates p50<5ms, p95<15ms, p99<25ms regressions in CI.
3. **Two-layer telemetry model**: append-only `raw_usage_events` per source + normalized `canonical_usage_events` with stable identity. Reconciler is best-effort and never blocks admission control.
4. **Defense-in-depth ingestion across 6 source kinds** without source elimination — each fills blind spots the others have. Tier-1 RT push (native CLI OTel + Codex stdout `--json`), Tier-2 advisory (gateway OTel + transcript replay), Tier-3 audit (manual + provider quota pre-flight).
5. **Fail-safe by construction.** Evaluator errors return `defer` (not `block`); circuit breaker persists state in DB; deterministic mode during migration/lock errors.
6. **Atomic reservations.** `BEGIN IMMEDIATE` transaction; state machine (`active|consumed|released|expired|cancelled`); idempotency key per grant; ledger entries are append-only.
7. **Aegis is starvation-proof.** System-reserved emergency budget lane; degraded local-only fallback; operator break-glass override; v1 ships Aegis governance as `shadow` only.
8. **Subscription-aware enforcement at the account level**, not the provider level. `provider_accounts` + `provider_entitlements` model multiple billing relationships per workspace per provider.
9. **Shadow-mode rollout discipline.** ALL seeded defaults ship with `enforce_mode='shadow'` including WIP; operator promotes to `soft` → `hard` per workspace. Calibration phase precedes any hard enforcement.
10. **Collector resilience semantics.** Per-source freshness tracked; stale → that source's enforcement degrades to shadow; backfill on restart; UI exposes "telemetry stale" state.

## Non-Goals

- **No SDK-call instrumentation in v1.** v1 operator preference is subscription CLIs only. `@traceloop/node-server-sdk` deferred to v2.
- **No off-the-shelf Postgres/ClickHouse stack.** Langfuse v3, Helicone, Lunary all require ClickHouse + Postgres + Redis + S3, ~16 GiB RAM. CLAUDE.md forbids new heavy DB deps.
- **No LiteLLM Proxy in v1.** Cannot intercept Claude Code stdio sessions, Codex CLI subprocess calls, or Copilot CLI sessions.
- **No web-UI scraping.** ChatGPT Pro `wham/usage` and Anthropic plan-usage bars are not stable surfaces.
- **No tenant-aware gateway isolation.** V2-001 work, not SPEC-008.
- **No retroactive task cancellation.** Already-dispatched tasks complete; gate blocks NEW dispatch only.
- **No persistent breaker state cleared by simple restart** — see Q21.
- **No source elimination.** Each of the 6 source kinds preserved; reconciliation joins via `request_id`/`prompt.id`/`raw_hash`, never by ±30s alone.
- **No `copilot_internal/user` as enforcement floor** — advisory only; operator-configured limits are authoritative for hard enforcement of Copilot.

## Design Decisions (Q&A Log)

### Q1 — Evaluator decision precedence when multiple policies match

**Decision:** **Most-restrictive wins, fixed precedence.** Order: `block > override_required > defer > allow`. First non-allow result is the binding decision; further non-allow matches still write `resource_policy_events` rows for audit but do not change the decision.

### Q2 — Window storage shape and timezone source

**Decision:** **UTC storage + IANA-named-TZ for display and recurring expansion.** One-shot windows: `start_utc_ms` + `end_utc_ms`. Recurring windows: `local_start_hhmm` + `local_end_hhmm` + `recurrence_tz` (IANA), expanded to UTC each evaluator tick using `Intl.DateTimeFormat`.

### Q3 — WIP policy scope dimensions

**Decision:** **Agent + Project + Workspace.** Three policy kinds: `wip_agent`, `wip_project`, `wip_workspace`. Status filter defaults to `in_progress`. Replaces hard-coded `LIMIT 3` with a flag-gated default policy.

### Q4 — Budget reset shape (rolling vs calendar) + per-policy `enforce_mode` (CORRECTED)

**Decision:** **Hybrid + per-policy `enforce_mode` + ALL seeded defaults shadow-mode.** Budget policies declare:

```jsonc
{
  "metric": "tokens" | "requests" | "sessions" | "usd_estimated" | "wip",
  "window_kind": "rolling" | "calendar" | null,    // null for WIP
  "window_seconds": 86400,
  "window_unit": "day" | "week" | "month",
  "tz": "America/Chicago",
  "threshold": 25.00,
  "enforce_mode": "shadow" | "soft" | "hard"
}
```

`shadow` = log only, no defer/block. `soft` = activity+notification, allow. `hard` = block + require operator override.

**Seeded defaults** (research-derived; ALL initially `enforce_mode='shadow'` to satisfy "flag-on changes nothing" guarantee — operator must explicitly promote to soft/hard):

| Policy | Seeded value | Initial enforce_mode |
|---|---|---|
| WIP per agent | 1 in_progress | **shadow** |
| WIP per project | 3 in_progress | **shadow** |
| WIP per workspace | 8 in_progress | **shadow** |
| Daily USD (rolling 24h) | $25 / $50 thresholds | **shadow** (both) |
| Monthly USD (calendar, workspace TZ) | $500 | **shadow** |
| Daily tokens (rolling 24h) | 50M / 200M | **shadow** (both) |
| Daily requests (rolling 24h) | 5,000 / 15,000 | **shadow** (both) |
| Daily sessions (rolling 24h) | 50 / 200 | **shadow** (both) |

Acceptance criterion: enabling `FEATURE_RESOURCE_GOVERNANCE` does NOT block any task dispatch unless the operator explicitly promotes a default to `soft` or `hard`. The legacy hard-coded `LIMIT 3` becomes a fallback only when `FEATURE_RESOURCE_GOVERNANCE=false`.

### Q5 — Aegis as a governance subject (REVISED — see Q20 for starvation prevention)

**Decision:** **Aegis is governable, but `block` collapses to `defer` at the `runAegisReviews` call site, AND v1 ships Aegis governance as shadow-only.** See Q20 for the system-reserved budget lane preventing infinite-defer starvation.

### Q6 — Override grant authority + accounting (RACE-FREE RESERVATIONS)

**Decision:** **Operator AND Aegis can grant; reservations are atomic ledger entries with explicit state machine and idempotency keys.**

```sql
CREATE TABLE resource_overrides (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
  override_id TEXT NOT NULL UNIQUE,                  -- UUID, idempotency key
  granted_by_kind TEXT NOT NULL,                     -- 'operator'|'agent_aegis'
  granted_by_id TEXT NOT NULL,                       -- user_id or agent_id
  target_policy_id INTEGER,                          -- NULL = blanket override for scope
  scope_kind TEXT NOT NULL,                          -- 'task'|'agent'|'project'|'workspace'
  scope_id TEXT NOT NULL,
  reason TEXT NOT NULL,                              -- required, free-text audit
  reserved_estimated_cost_usd REAL NOT NULL DEFAULT 0,
  reserved_input_tokens INTEGER NOT NULL DEFAULT 0,
  reserved_output_tokens INTEGER NOT NULL DEFAULT 0,
  reserved_requests INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'active',              -- 'active'|'consumed'|'released'|'expired'|'cancelled'
  granted_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,                       -- max +24h, default +1h
  consumed_at INTEGER,
  released_at INTEGER,
  CHECK (state IN ('active','consumed','released','expired','cancelled'))
);
CREATE INDEX idx_overrides_active ON resource_overrides(workspace_id, scope_kind, scope_id, state) WHERE state = 'active';
CREATE INDEX idx_overrides_expiry ON resource_overrides(state, expires_at) WHERE state = 'active';
```

**Atomic grant procedure** (in `src/lib/resource-governance.ts`):

```ts
// CORRECT better-sqlite3 immediate-transaction API:
const reserveBudgetTx = db.transaction((grant: OverrideGrant) => {
  // Idempotent: if override_id already exists, return existing
  const existing = selectOverrideById.get(grant.override_id);
  if (existing) return existing;
  // Read consumed + reserved counters for scope INSIDE the IMMEDIATE transaction
  // (uses the precomputed counters from Q27, NOT the O(n) ledger SUM)
  const counters = selectBudgetCounters.get(grant.workspace_id, grant.scope_kind, grant.scope_id, grant.window_kind, grant.window_start);
  const remaining = (grant.threshold ?? Infinity) - (counters.consumed_cost_usd + counters.reserved_cost_usd);
  if (remaining < grant.reserved_estimated_cost_usd) {
    throw new InsufficientBudgetError({ remaining, requested: grant.reserved_estimated_cost_usd });
  }
  // Insert override row + matching ledger reservation row + update counters atomically
  insertOverride.run({...grant, state: 'active'});
  insertLedgerReservation.run({override_id: grant.override_id, ...});
  updateBudgetCounters.run({
    workspace_id: grant.workspace_id, scope_kind: grant.scope_kind, scope_id: grant.scope_id,
    delta_reserved_cost_usd: grant.reserved_estimated_cost_usd, ...
  });
  return selectOverrideById.get(grant.override_id);
});
// Invocation MUST use .immediate(args) to acquire BEGIN IMMEDIATE write lock:
const result = reserveBudgetTx.immediate(grant);
```

**SQLite settings required:**
- `PRAGMA journal_mode=WAL` (already enabled in MC)
- `PRAGMA busy_timeout=5000` (5s — bounded retry for `SQLITE_BUSY` while another writer holds the lock)
- `PRAGMA synchronous=NORMAL` (default in better-sqlite3 distributions; preserves WAL durability while allowing OS-page-cache buffering)

**HTTP contract for `POST /api/resource-overrides`:**

| Status | Meaning | Retryable |
|---|---|---|
| `201 Created` | Reservation created | n/a |
| `200 OK` | Idempotent replay (`override_id` already existed; same grant returned) | n/a |
| `409 Conflict` | Insufficient budget; body includes `{remaining, requested, scope}` | NO — operator must request smaller reservation or wait |
| `423 Locked` | Governance temporarily locked (DB busy beyond `busy_timeout`, OR deterministic-mode active per Q21) | YES with bounded backoff |
| `422 Unprocessable Entity` | Invalid override request (malformed body, expired signature, invalid scope) | NO |

Response always includes `retryable: boolean`. Idempotency key is `override_id` (UUID v4); replays are detected by exact match on this column (UNIQUE constraint enforced).

**Race acceptance criterion**: 5 concurrent override grants for the last $1 of budget. EXACTLY one returns 201; the other four return deterministic 409 with consistent `remaining=0`. Verified by vitest under `pnpm test` with concurrent `Promise.all` invocations against a real SQLite DB.

**Retry semantics**: clients retry ONLY on `423`. Bounded backoff (50ms, 200ms, 1s, give up). Never retry `409`/`422`/`201`/`200`.

State transitions:
- `active` → `consumed`: when matching usage event arrives that closes out the reservation (matched by `task_id` + cost ≤ reserved)
- `active` → `released`: voluntary release on task completion with unused reservation
- `active` → `expired`: scheduler tick after `expires_at` passes; releases unused reservation
- `active` → `cancelled`: operator manually cancels

Release writes a ledger entry (NOT a row mutation) so the ledger remains append-only.

### Q7 — Activity/notification throttling

**Decision:** **Per `(policy_id, scope_kind, scope_id)` tuple, 5-min cooldown** (mirrors SPEC-006's `label_provisioning_failed` pattern). Audit rows always written; activity+notification at most once per 5min per tuple, with suppressed-count attached.

### Q8 — OpenClaw health adapter polling cadence

**Decision:** **Lazy on-read + 30s in-memory cache + tail-read JSONL.** Adapter invoked on demand. `stat()` each file; if absent, return empty. Read `current-rate.json` + `cost.json` fully. Tail-read last N=100 lines of `readings.jsonl` with bounded-byte readback.

**Ground-truthed sample on the operator node**: `current-rate.json = {"rate": 0.1029, "timestamp": "2026-05-02T03:00:58.273240", "source": "NBU Rate Breakdown Page"}`; `cost.json` has nested `monthly.<YYYY-MM>.{total_hours, total_kwh, total_variable_cost, total_fixed_cost, total_cost, days.<YYYY-MM-DD>...}`; `readings.jsonl` is 30-min hardware telemetry (CPU temps, fan RPM, per-core MHz, util_by_core, PSU input/output W/V/A, log sink sizes).

### Q9 — REST API CRUD level

**Decision:** **Policies = full CRUD; Events = read + override-grant POST.** Audit append-only. Override grants validated against operator session OR Aegis service token. Read endpoints scoped through `resolveFlag(name, ctx)` so flag-OFF returns empty arrays.

### Q10 — Cost Tracker UI placement and read model

**Decision:** **New 5th "Governance" tab on `cost-tracker-panel.tsx`** (current tabs: Overview, Agents, Sessions, Tasks). Five sections: budget gauges, WIP-by-scope table, window timeline (operator's TZ), recent decisions, **telemetry health panel** (per-source freshness + stale state per Q19). Live updates via `/api/events` SSE extended with `resource_policy_event` + `governance_window_state` + `telemetry_freshness_changed`.

### Q11 — Evaluator hot-path architecture (REVISED — realistic benchmark)

**Decision:** **Layered architecture with full-path benchmark gating.** Three layers (in-memory caches → single indexed SQL read → async cold path). Vitest benchmark gates p50<5ms, p95<15ms, p99<25ms.

**Realistic benchmark methodology** (replaces token-bucket microbench):

```ts
// resource-governance-benchmark.test.ts
describe('evaluator full-path under load', () => {
  beforeAll(() => seed1kPoliciesAcross10Workspaces());
  it('p95 < 15ms with concurrent scheduler gates + WAL writes', async () => {
    await runConcurrentLoad({
      evaluatorCalls: 10_000,
      concurrentSchedulerTicks: 4,
      concurrentBudgetWrites: 100,    // simulates ledger writes during eval
      coldStartFraction: 0.1,          // 10% start with empty caches
      idleResumeMs: 5_000,             // some calls after 5s idle
    });
    expect(metrics.p50).toBeLessThan(5);
    expect(metrics.p95).toBeLessThan(15);
    expect(metrics.p99).toBeLessThan(25);
  });
});
```

**Behavior when budget exceeded**: evaluator does NOT skip dispatch on its own slowness. If a single call exceeds 100ms, it still returns its decision; if cumulative concurrent latency degrades scheduler tick by >50%, the circuit breaker (Q21) opens with reason `latency_breach`.

**Hardware ceiling math**: Better-sqlite3 ≈6µs/PK lookup; in-memory token bucket 2M+ ops/sec single key, 1µs p99. Cache footprint ~70KB. **64GB plentiful — 128GB upgrade NOT needed.**

### Q12 — Default policy seeding mechanism

**Decision:** **Idempotent additive seed migration M63 with `enforce_mode='shadow'` for ALL defaults.** (M62 is taken by SPEC-006's `062_area_label_routing_sync_owner_triage`.) Migration `063_resource_governance_default_policies` inserts only if no row exists for `(workspace_id, policy_kind, scope_kind)` (HAVING-NOT-EXISTS). All seeded rows shadow-mode. Rollback at `docs/migrations/rollback-M63.sql` deletes by `seeded_by='SPEC-008'` marker.

### Q13 — Circuit breaker state persistence (REVISED — persistent + deterministic mode)

See Q21 for the full revised model.

### Q14 — Test strategy

**Decision:** **TDD red-green + strict-scope guard + full-path benchmark CI gate + integration + 1–3 Playwright e2e + chaos tests for collector failure (Q19).** Test count target: ~180–250 tests across 12 ACs + ~70 unit edge cases + ~50 ingestion adapter tests + chaos tests + e2e.

### Q15 — Account-level billing model (REVISED — replaces single-row provider_subscriptions)

**Decision:** **Two tables — `provider_accounts` + `provider_entitlements` — supersede the single-row `provider_subscriptions` UNIQUE(workspace_id, provider) model.** Multiple accounts per provider per workspace are normal (e.g., Claude Max 20x AND Anthropic API key for the same workspace).

```sql
CREATE TABLE provider_accounts (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
  provider TEXT NOT NULL,                         -- 'anthropic'|'openai'|'github'|'ollama'|'lmstudio'
  account_label TEXT NOT NULL,                    -- 'claude_max_20x_personal'|'anthropic_api_team'|'chatgpt_pro_solo'
  billing_mode TEXT NOT NULL,                     -- 'subscription'|'metered'|'local'|'unknown'
  detection_source TEXT NOT NULL,                 -- 'auto:claude_credentials'|'auto:claude_auth_cli'|'auto:codex_oauth'|'auto:codex_rate_limits_plan_type'|'auto:ollama_cloud_models'|'auto:copilot_internal_user'|'manual'|'env'
  detected_at INTEGER NOT NULL,
  active_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  expires_at INTEGER,
  config_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(workspace_id, provider, account_label)
);

CREATE TABLE provider_entitlements (
  id INTEGER PRIMARY KEY,
  provider_account_id INTEGER NOT NULL REFERENCES provider_accounts(id),
  subscription_tier TEXT,                         -- 'claude_max_20x'|'chatgpt_pro'|'ollama_pro'|'copilot_pro_plus'|'metered_api'|null
  quota_window_kind TEXT,                         -- 'rolling_5h'|'rolling_7d'|'monthly_calendar'|null
  quota_limit_tokens INTEGER,
  quota_limit_requests INTEGER,
  quota_limit_usd REAL,
  effective_at INTEGER NOT NULL,
  expires_at INTEGER,
  source TEXT NOT NULL                            -- 'auto'|'manual'
);

CREATE INDEX idx_provider_accounts_workspace ON provider_accounts(workspace_id, provider);
CREATE INDEX idx_provider_entitlements_account ON provider_entitlements(provider_account_id, effective_at);
```

Usage events reference `provider_account_id` when known (resolved via `(provider, model_origin_attribute, auth_signal)`). When unknown, events carry `provider_account_id=NULL` with `billing_mode='unknown'` — they are NOT silently collapsed to a single account row.

**Per-CLI detection priority** (highest signal first):
1. **Claude Code → `claude_max_20x`** account: `~/.claude/.credentials.json.claudeAiOauth.subscriptionType` (1.x) OR `claude auth status` JSON (2.x). **Already implemented in `src/lib/provider-subscriptions.ts`** — extend to write `provider_accounts` rows.
2. **Codex CLI → `chatgpt_pro`** account: `rate_limits.plan_type` field in `token_count` rollout events (richest: `"free"|"go"|"plus"|"pro"|"prolite"|"team"|"business"|"enterprise"|"edu"`). Fallback: `~/.codex/auth.json.auth_mode === "chatgpt"`.
3. **Codex CLI → `metered_api`** account: `OPENAI_API_KEY` set OR `auth.json` carries API key → SEPARATE account row with `billing_mode='metered'`.
4. **Ollama → `ollama_pro`** account: `OLLAMA_API_KEY` + any `:cloud`-suffixed model in use; otherwise `flat_rate_local`.
5. **GitHub Copilot → `copilot_pro_plus`** account: `copilot_plan` from OpenClaw's `copilot_internal/user` poll (**advisory-only**: see Q15.5 below). Operator-configured limits in `provider_entitlements` are the ENFORCEMENT floor; the polled snapshot is informational.
6. **LM Studio → `flat_rate_local`** always.

**Q15.5 — Copilot endpoint reliability**: `copilot_internal/user` is an undocumented `_internal` endpoint with VS-Code-spoofed headers. Hard enforcement on Copilot MUST NOT depend on it — it can break any week. Operator manually configures Copilot quota limits in `provider_entitlements`; polled `percent_remaining` is shown in UI as advisory and triggers `governance_copilot_endpoint_unavailable` notification when scrape fails 3x consecutively.

**Evaluator behavior** (USD budget skip): When evaluating a USD budget, look up the matched `provider_account` for the context's `(provider, model)`; if `billing_mode='subscription'`, the USD policy returns `allow` with `reason='subscription_billing:<account_label>'`. Audit row always written. Raw-usage budgets (tokens/requests/sessions) and WIP policies still evaluate.

### Q16 — Stack adoption strategy + multi-source ingestion (REVISED — see Q17, Q18, Q19)

**Decision:** **Multi-source defense-in-depth ingestion against MC's own SQLite, with explicit separation between (a) the synchronous budget ledger, (b) raw_usage_events per source, and (c) canonical_usage_events.** No heavy off-the-shelf stack. No `@traceloop/node-server-sdk` in v1.

See Q17 (ledger), Q18 (raw + canonical), Q19 (snapshots + collector health) for the structural pieces.

**v1 inbound channels** (all six normalize via the per-source adapter into `raw_usage_events` rows, then the reconciler promotes to `canonical_usage_events` and emits ledger corrections):

1. **`otelcol-contrib`** as a `--user` systemd unit on the operator node. Receives OTLP/HTTP (protobuf) on `127.0.0.1:4318`. `filestorage` extension provides on-disk WAL. `batch` + `attributes` processors. Forwards to MC's OTLP receiver.
2. **MC OTLP receiver** at `src/app/api/otlp/v1/{traces,metrics}/route.ts`. Decodes `application/x-protobuf` via `@opentelemetry/otlp-transformer`. Auth via API_KEY header. Writes `raw_usage_events` rows with `source='gateway_otel'` or `source='native_otel'` based on resource attrs.
3. **Codex stdout `--json` parser** (`src/lib/observability/codex-stdout-tail.ts`) when MC spawns `codex exec --json`. Captures `turn.completed.usage` events. Sub-second RT. Source: `cli_stdout_json`.
4. **Codex rollout JSONL tail** — `inotify` on `~/.codex/sessions/YYYY/MM/DD/`. Parses `event_msg.payload.type='token_count'` events. **`cached_input_tokens` is a SUBSET of `input_tokens` (don't add); `reasoning_output_tokens` is a SUBSET of `output_tokens` (don't add); `total_token_usage` is CUMULATIVE → see Q19 snapshot model**. Source: `transcript_replay`.
5. **Claude Code transcript replay** — fs.watch on `~/.claude/projects/<urlenc-cwd>/sessions/`. Parses assistant records with `message.usage.{input_tokens, output_tokens, cache_read_input_tokens, cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}}`. Source: `transcript_replay`.
6. **GitHub Copilot CLI events.jsonl ingester** — fs.watch on `~/.copilot/session-state/*/events.jsonl`. Parses `session.shutdown.modelMetrics.*`. Schema reverse-engineered (`J-Bax/copilot-token-tracker` reference). Pin against `@github/copilot >= 0.0.422`. Source: `transcript_replay`.
7. **Copilot CLI sessionEnd hook** — `~/.copilot/hooks/sessionEnd.json` POSTs session-id to `/api/observe/copilot-session-end`; route re-reads `events.jsonl` for that session.
8. **Provider-quota fetchers** — MC's `openclaw-quota-bridge.ts` calls OpenClaw's gateway HTTP API for `% remaining` snapshots. Used as **pre-flight ceiling check** (refuse to dispatch new work if remaining < threshold). Source: `provider_quota`.
9. **Ollama HTTP-response capture** (only if MC ever calls Ollama directly — flag-gated). Source: `cli_stdout_json` (response-derived).
10. **LM Studio log stream** — `lms log stream --json --stats` child process, NDJSON parse. Source: `cli_stdout_json`.
11. **OpenClaw health adapter** — already in original scope per Q8.
12. **Manual POST `/api/tokens`** preserved. Source: `manual_post`.

### Q17 — Budget ledger as the synchronous source-of-truth (NEW — oracle finding #2)

**Decision:** **Separate `resource_budget_ledger` (synchronous, append-only) from `raw_usage_events` (eventually-consistent telemetry).** Scheduler gates evaluate against the ledger only. Telemetry creates `correction` ledger entries asynchronously.

```sql
CREATE TABLE resource_budget_ledger (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
  scope_kind TEXT NOT NULL,                       -- 'agent'|'project'|'workspace'|'task'
  scope_id TEXT NOT NULL,
  provider_account_id INTEGER REFERENCES provider_accounts(id),
  model TEXT,
  amount_tokens INTEGER NOT NULL DEFAULT 0,
  amount_cost_usd REAL NOT NULL DEFAULT 0,
  amount_requests INTEGER NOT NULL DEFAULT 0,
  amount_sessions INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,                             -- 'debit'|'reservation'|'release'|'correction'
  source_event_id TEXT,                           -- canonical_usage_events.id or override_id
  source_kind TEXT NOT NULL,                      -- 'admission'|'reservation_grant'|'reservation_release'|'telemetry_correction'|'manual'
  reason TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  CHECK (kind IN ('debit','reservation','release','correction'))
);
CREATE INDEX idx_ledger_workspace_scope_created ON resource_budget_ledger(workspace_id, scope_kind, scope_id, created_at);
CREATE INDEX idx_ledger_window_aggregate ON resource_budget_ledger(workspace_id, created_at);
```

**Synchronous admission flow** at each scheduler gate (uses precomputed counters from Q27, NOT the ledger SUM aggregate which is O(n)):

```ts
const admissionTx = db.transaction((req) => {
  // PRAGMA busy_timeout=5000 already set globally
  // Indexed lookup against resource_budget_counters (Q27); O(1) per scope
  const counters = selectCountersByScope.get(req.workspace_id, req.scope_kind, req.scope_id, req.window_kind, req.window_start);
  const remaining = (req.threshold ?? Infinity) - (counters.consumed_cost_usd + counters.reserved_cost_usd);
  const decision = computeDecision(remaining, req.estimated_cost_usd, req.policies);
  if (decision === 'allow') {
    // Insert ledger reservation + update counters atomically
    insertLedgerReservation.run({...req, kind: 'reservation', source_kind: 'admission'});
    updateBudgetCounters.run({...req, delta_reserved_cost_usd: req.estimated_cost_usd});
  }
  return decision;
});
const decision = admissionTx.immediate(req);  // BEGIN IMMEDIATE write lock
```

**Telemetry correction flow** (asynchronous, runs on every `canonical_usage_events` insert):

```ts
// After reconciler promotes raw → canonical
const correction = canonical.amount - matchingReservationAmount;
if (Math.abs(correction) > 0) {
  insertLedger({
    kind: 'correction',
    amount_cost_usd: correction,
    source_event_id: canonical.id,
    reason: `telemetry_correction:${canonical.source}`,
  });
}
```

This decoupling means: evaluator decisions are **deterministic** (bounded by ledger reads inside a single transaction), telemetry can be late/duplicate/missing without breaking admission control, and post-hoc reconciliation surfaces drift as `correction` entries that operators can audit.

### Q18 — Two-layer raw + canonical telemetry model (NEW — oracle finding #4)

**Decision:** **Append-only `raw_usage_events` per source + normalized `canonical_usage_events` with stable identity.** ±30s heuristic suggests join candidates only; never authoritative.

```sql
CREATE TABLE raw_usage_events (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,                           -- 'native_otel'|'cli_stdout_json'|'gateway_otel'|'transcript_replay'|'manual_post'|'provider_quota'
  source_event_id TEXT NOT NULL,                  -- source-specific unique id (request_id, prompt.id, session.shutdown id, raw_hash)
  cli TEXT,                                       -- 'claude_code'|'codex'|'copilot'|'ollama'|'lmstudio'|'openclaw_gateway'|null
  workspace_id INTEGER,
  raw_attributes_json TEXT NOT NULL,              -- verbatim per-source payload
  ingested_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  observed_at INTEGER NOT NULL,                   -- when source claims event happened
  UNIQUE(source, source_event_id)
);
CREATE INDEX idx_raw_workspace_observed ON raw_usage_events(workspace_id, observed_at);

CREATE TABLE canonical_usage_events (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  cli TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id INTEGER REFERENCES provider_accounts(id),
  model TEXT NOT NULL,
  session_id TEXT,
  request_id TEXT,                                -- canonical join key when present (Anthropic req_011..., Codex turn id)
  prompt_id TEXT,                                 -- Claude Code prompt.id
  parent_request_id TEXT,                         -- multi-call prompts / retries
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL,
  cost_provenance TEXT,                           -- 'native_cli_usd'|'gateway_otel'|'mc_pricing_calc'
  duration_ms INTEGER,
  ttft_ms INTEGER,
  task_id INTEGER,
  agent_id INTEGER,
  dedupe_confidence TEXT NOT NULL,                -- 'high'|'medium'|'low'|'singleton'
  dedupe_reason TEXT,                             -- 'request_id_match'|'prompt_id_match'|'raw_hash_match'|'time_window_only'|'singleton'
  contributing_raw_event_ids TEXT,                -- JSON array of raw_usage_events.id
  observed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000)
);
CREATE INDEX idx_canonical_workspace_observed ON canonical_usage_events(workspace_id, observed_at);
CREATE INDEX idx_canonical_request_id ON canonical_usage_events(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_canonical_prompt_id ON canonical_usage_events(prompt_id) WHERE prompt_id IS NOT NULL;
```

**Reconciler logic** (`src/lib/observability/usage-event-reconciler.ts`) — **NON-ADDITIVE: canonical row represents ONE provider call; raw rows are evidence, not summands**:

```sql
CREATE TABLE canonical_usage_sources (
  id INTEGER PRIMARY KEY,
  canonical_event_id INTEGER NOT NULL REFERENCES canonical_usage_events(id),
  raw_event_id INTEGER NOT NULL REFERENCES raw_usage_events(id),
  source TEXT NOT NULL,
  confidence TEXT NOT NULL,                    -- 'high'|'medium'|'low'
  is_authoritative INTEGER NOT NULL DEFAULT 0, -- 1 = used to compute canonical totals
  UNIQUE(raw_event_id),
  UNIQUE(canonical_event_id, source, raw_event_id)
);
CREATE INDEX idx_canonical_sources_canonical ON canonical_usage_sources(canonical_event_id);
```

Reconciler runs in batched worker (see Q24); per raw event:

1. **High-confidence join**: same `request_id` (Anthropic) OR same `prompt_id` (Claude Code) OR same `raw_hash` (SHA-256 of canonicalized provider-request payload) → `INSERT INTO canonical_usage_sources ON CONFLICT(raw_event_id) DO NOTHING`. If a canonical row already exists for that join key, this raw event is registered as additional evidence; canonical totals are NOT incremented. Otherwise create canonical row with this raw event as the FIRST source.
2. **Medium-confidence join**: same `(workspace_id, cli, provider_account_id, model, session_id)` AND **EXACT** match on input/output/cache token tuple (replaces the prior 1% tolerance — provider returns canonical counts; non-exact match is a separate call). Confidence `medium`, `dedupe_reason='exact_token_session_match'`.
3. **Low-confidence candidate**: same `(workspace_id, cli, provider_account_id, model, session_id)` within ±30s AND no other signals → create SEPARATE canonical row with `dedupe_confidence='low'`. Surface in operator UI for manual reconciliation. Low-confidence rows DO NOT contribute to enforcement ledger automatically.
4. **Singleton**: no match → standalone canonical row, `dedupe_confidence='singleton'`.

**Canonical totals computation** (idempotent, runs after every source attachment):

Given the set of `canonical_usage_sources` for a canonical row, pick the authoritative source by precedence:

| Priority | Source | Reason |
|---|---|---|
| 1 | `native_otel` (Claude Code) | CLI reads Anthropic API response directly; sees auxiliary calls |
| 2 | `cli_stdout_json` (Codex `turn.completed.usage`) | Sub-second; explicit per-turn counts |
| 3 | `transcript_replay` (Codex rollout `last_token_usage`) | Reliable per-turn snapshot |
| 4 | `transcript_replay` (Claude Code `assistant.message.usage`) | Per-turn record |
| 5 | `transcript_replay` (Copilot `events.jsonl session.shutdown`) | Cumulative-at-shutdown only |
| 6 | `gateway_otel` (OpenClaw) | Wire-level view; may miss CLI auxiliary calls |
| 7 | `manual_post` | Explicit operator override |

The authoritative source's tokens become the canonical totals. Non-authoritative sources' values are stored in `canonical_usage_sources` rows for audit/cross-check but do NOT affect canonical totals or the budget ledger.

**`UPDATE` is idempotent**: re-running the reconciler on the same raw rows produces identical canonical totals. The `ON CONFLICT(raw_event_id) DO NOTHING` guard in `canonical_usage_sources` prevents double-attachment.

**Cost USD provenance order**: native `claude_code.cost.usage` > `openclaw.cost.usd` (A1) > MC `price-catalog.ts` calc. Per-row `cost_provenance` recorded.

**Per-source drift thresholds** (replaces invented 5% global):

| Source pair | Acceptable drift | Action if exceeded |
|---|---|---|
| native_otel vs gateway_otel (same `request_id`) | ±2% | Diagnostic alert; do not auto-correct |
| native_otel vs transcript_replay (Claude Code) | ±5% | Diagnostic alert |
| Codex stdout vs Codex rollout (same session) | ±1% | Diagnostic; rollout authoritative for cumulative |
| Native CLI vs OpenClaw gateway (different totals) | up to 50% legitimate | NO alert (auxiliary calls, compaction, retries) |
| Provider quota delta vs cumulative ledger | calibrate per provider | Tracked but never blocks |

**Calibration milestone**: For 7 days after first hard policy promotion, all drift fires `governance_drift_observed` activities only; no `block` decisions originate from drift. After 7 days operator reviews observed thresholds and either ratifies them or extends calibration.

### Q19 — Snapshot model + collector health semantics (NEW — oracle findings #5, #12)

**Decision:** **Cumulative reports (Codex `total_token_usage`, OpenClaw aggregates) are stored as `usage_snapshots`, not events.** Deltas computed deterministically by sorting on provider timestamp. If neither sequence nor provider timestamp is available, mark "untrusted cumulative" and DO NOT enforce hard limits from that source.

```sql
CREATE TABLE usage_snapshots (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  session_id TEXT NOT NULL,
  generation_id TEXT NOT NULL,                    -- distinguishes counter resets within same session_id (e.g., file-rotation, CLI restart, new conversation)
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  snapshot_seq INTEGER,                           -- explicit sequence if source provides
  provider_timestamp INTEGER,                     -- source-claimed event time
  observed_at INTEGER NOT NULL,                   -- when MC saw it
  input_tokens_total INTEGER NOT NULL,
  output_tokens_total INTEGER NOT NULL,
  cache_read_total INTEGER NOT NULL DEFAULT 0,
  cache_creation_total INTEGER NOT NULL DEFAULT 0,
  reasoning_total INTEGER NOT NULL DEFAULT 0,
  raw_hash TEXT NOT NULL,                         -- SHA-256 of canonicalized payload, dedup
  trust_level TEXT NOT NULL,                      -- 'trusted'|'untrusted_cumulative'|'stream_corrupt'
  UNIQUE(source, session_id, generation_id, raw_hash)
);
CREATE INDEX idx_snapshots_session_gen_seq ON usage_snapshots(source, session_id, generation_id, provider_timestamp, snapshot_seq);
```

**Generation ID derivation per source** (so counter resets are detected, not corrupted):

| Source | `generation_id` derivation |
|---|---|
| Codex rollout JSONL | `<rollout_filename_uuid>` (filename uniquely identifies a Codex session; new file = new generation) |
| Claude Code transcript | `<session_uuid>` (Claude Code session UUID; new session = new file) |
| Copilot `events.jsonl` | `<session_id>` from `~/.copilot/session-state/<sid>/` directory name |
| OpenClaw aggregate session blob | `<openclaw_session_key>` from sessions.json keys |
| `provider_quota` polled snapshots | `<workspace_id>:<provider>:<quota_window_start_ms>` |

**Delta computation procedure (revised, source-specific):**

1. New snapshot ingested (idempotent on `(source, session_id, generation_id, raw_hash)`).
2. Sort same `(source, session_id, generation_id)` snapshots by `provider_timestamp` if non-null, else by `snapshot_seq` if non-null, else mark `trust_level='untrusted_cumulative'` (no enforcement from this stream).
3. For trusted snapshots within the same generation: `delta = current.total - previous.total`.
   - If `delta < 0` AND `generation_id` changed: this is a counter reset (new session/file). Start a new baseline; first snapshot in the new generation produces no delta (or pairs with a known prior generation baseline if explicitly chained).
   - If `delta < 0` within the same generation: counter went backwards (rewrite, corruption). Mark stream `trust_level='stream_corrupt'` and emit `governance_snapshot_anomaly` activity. Do NOT generate negative ledger entry.
4. **Terminal-cumulative-snapshot** sources (Copilot `session.shutdown`): only one trusted delta per session — `total tokens consumed in entire session`. No mid-session deltas.
5. Trusted deltas write `canonical_usage_events` rows AND `resource_budget_ledger` correction entries (coalesced per Q26).
6. `untrusted_cumulative` and `stream_corrupt` snapshots are stored for audit but never enforced from.

**Collector health semantics — degraded by `(source_path, provider_account_id)` not by provider:**

```sql
CREATE TABLE telemetry_source_freshness (
  source_path TEXT NOT NULL,                       -- 'native_otel:claude_code:claude_max_20x_personal'
  source TEXT NOT NULL,                            -- enum
  cli TEXT,
  provider_account_id INTEGER REFERENCES provider_accounts(id),
  last_ingest_at INTEGER NOT NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'fresh',              -- 'fresh'|'stale'|'failed'|'schema_broken'|'backfill_in_progress'
  PRIMARY KEY (source_path)
);
```

- Scheduled tick (every 60s) updates `last_ingest_at` per `source_path` from `MAX(raw_usage_events.ingested_at) WHERE source = ? AND provider_account_id = ?`.
- Per-source staleness threshold: `native_otel` 60s, `gateway_otel` 60s, `cli_stdout_json` 30s, `transcript_replay` 300s, `provider_quota` 1800s.
- **Authoritative-source-aware degradation**: each `(provider_account_id, enforcement_metric)` tuple has a designated authoritative source per Q18 precedence. If the authoritative source is stale, hard enforcement on that account+metric degrades to `shadow`. If a non-authoritative source is stale, enforcement remains active but UI shows "telemetry coverage degraded" advisory.
- If collector `otelcol-contrib` health probe (`/health` on collector) fails 3x consecutively: collector marked `failed`. All OTel-fed `source_path` rows transition to `state='failed'`.
- On collector restart: enter `state='backfill_in_progress'` per Q24 bounded backfill protocol. Hard enforcement on backfill-dependent paths stays in `shadow` until backfill completes. After successful catch-up, state → `fresh`.

**UI states** exposed in Cost Tracker Governance tab:

| State | Meaning | Operator action |
|---|---|---|
| `enforced` | All authoritative sources fresh; full hard enforcement | none |
| `partial` | Non-authoritative source stale; authoritative fresh | optional: investigate stale source |
| `shadow_due_to_stale_telemetry` | Authoritative source stale; this account+metric degraded to shadow | investigate; restart collector or check source |
| `untrusted` | Source schema broken (Q25) or backfill lag exceeds threshold | manual operator confirmation required to resume hard enforcement |

**Acceptance criteria**:

1. Kill `otelcol-contrib` mid-traffic; verify deterministic transition: no double-counting, no lost enforcement decisions, no oscillation. Hard enforcement on OTel-dependent accounts cleanly degrades to `shadow_due_to_stale_telemetry` within 60s.
2. Restart `otelcol-contrib` after 6h downtime; verify bounded-backfill protocol (Q24) completes without flooding ledger with thousands of correction rows. Verify operator UI shows `backfill_in_progress` indicator.
3. Inject corrupt `events.jsonl` from a future Copilot CLI version; verify `state='schema_broken'` per Q25; verify `governance_telemetry_schema_unsupported` notification fires.

### Q20 — Aegis starvation prevention (NEW — oracle finding #7; revised after round-2)

**Decision:** **Three-mechanism defense, fully specified.** Aegis can always make forward progress unless the operator explicitly disables all paths.

#### Mechanism 1: System-reserved emergency budget lane

- **Scope**: PER-WORKSPACE (not global). Each workspace gets its own seeded `aegis_emergency_reserve` policy. Multi-workspace deployments cannot starve each other.
- **Seeded values** (operator-overrideable per workspace): `usd_daily=$5`, `tokens_daily=50K`, `requests_daily=20`.
- **Reset boundary**: UTC calendar day (00:00 UTC). Workspace TZ explicitly NOT used for Aegis reserve to avoid "midnight in three timezones" race conditions. UI displays in operator's selected display TZ but the boundary is UTC.
- **In-flight task crossing midnight UTC**: the reservation created from the OLD day's reserve continues to consume the OLD ledger entries. New dispatches after 00:00 UTC consume the NEW day's reserve. Continuation of an in-flight task does NOT require new admission until the next dispatch decision. This is enforced by reservation rows carrying their `granted_at` and matching against the day-bucket counter active at that time.
- **Tracked in dedicated ledger scope**: `scope_kind='aegis_emergency'`, `scope_id=workspace_id`. NO other agent can consume from this scope.
- **Refill**: lazy on first read after UTC day boundary (no scheduled job needed). Counter refresh is atomic — read counter, if `window_start < today_utc_start`, INSERT a new counter row for today.

#### Mechanism 2: Degraded local-only fallback

- **Capability check first** (`getAegisFallbackCapabilities()`):
  ```ts
  function getAegisFallbackCapabilities(): {
    lmStudioAvailable: boolean;
    localModel: string | null;
    supportsReviewType: (reviewType: string) => boolean;
  }
  ```
- LM Studio availability detected by probe: `GET http://127.0.0.1:1234/v1/models` (default port). If 200 + non-empty model list, available. Cached 60s.
- **If `lmStudioAvailable=false`** (operator hasn't installed LM Studio): Aegis enters `deferred_no_fallback` state, NOT degraded mode. Activity + critical notification fired: `governance_aegis_no_fallback`. Operator must either install LM Studio, increase emergency reserve, or use break-glass override.
- **If `lmStudioAvailable=true` but the review type requires frontier-model judgment** (e.g., complex code review, security audit): Aegis filters those reviews out of the queue and processes only review types in the local-supported set (e.g., simple lint pass, format check). The skipped reviews remain queued and resume when frontier budget is restored.
- The `runAegisReviews` function accepts `degraded_mode: 'frontier'|'local_only'|'deferred_no_fallback'` and routes accordingly.

#### Mechanism 3: Operator break-glass override

- `POST /api/resource-overrides` with body `{kind: 'aegis_break_glass', workspace_id, reason: <required>, duration_minutes: <≤60>}`.
- Requires operator session token (NOT Aegis service token — humans only for break-glass).
- Bypasses ALL governance for the specified duration. Audit row + critical notification fired (`governance_break_glass_active`).
- Auto-expires; operator can extend by re-invoking.
- Limit: max 4 break-glass invocations per workspace per UTC day to prevent abuse. Exceeding logs warning but does NOT block (operator override is the most-trusted path).

#### v1 default: shadow-only Aegis governance

All Aegis-related policies ship with `enforce_mode='shadow'` in v1. Aegis dispatches LOG decisions but never `block`/`defer`. The emergency reserve and degraded mode are wired but inert until the operator explicitly promotes Aegis policies to `soft` or `hard` after 7-day calibration.

#### Acceptance criteria

- AC-Aegis-1: Workspace exhausted → Aegis dispatch consumes from `aegis_emergency_reserve` scope; main scope unaffected.
- AC-Aegis-2: Both exhausted, `lmStudioAvailable=true` → Aegis enters `local_only` mode; supported review types complete; unsupported types remain queued.
- AC-Aegis-3: Both exhausted, `lmStudioAvailable=false` → Aegis enters `deferred_no_fallback`; `governance_aegis_no_fallback` notification fires.
- AC-Aegis-4: Break-glass override active → Aegis bypasses governance for duration; auto-expires.
- AC-Aegis-5: In-flight task crossing UTC midnight → reservation consumed against OLD day; new dispatches admit against NEW day.
- AC-Aegis-6: 5+ break-glass invocations in same UTC day → warning logged; not blocked.

### Q21 — Persistent circuit breaker + deterministic mode (NEW — oracle finding #8)

**Decision:** **Breaker state persists in DB; deterministic governance mode during migration/lock errors.**

```sql
CREATE TABLE resource_governance_breaker (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL,                  -- nullable for global breaker
  component TEXT NOT NULL,                        -- 'evaluator'|'reconciler'|'collector'|'global'
  state TEXT NOT NULL DEFAULT 'closed',           -- 'closed'|'open'|'half_open'
  opened_at INTEGER,
  closed_at INTEGER,
  reason TEXT,
  last_error TEXT,
  consecutive_error_count INTEGER NOT NULL DEFAULT 0,
  restart_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(workspace_id, component)
);
```

State transitions:
- `closed` → `open`: >5 errors/min for the component. Records `opened_at`, `reason`, `last_error`. Operator notification fired.
- `open` → `half_open`: 5min after `opened_at` OR manual operator action via API.
- `half_open` → `closed`: next evaluation succeeds.
- `half_open` → `open`: next evaluation fails.

**Deterministic-mode behavior** during DB-lock/migration scenarios:

When MC detects an active migration (`migrations.in_progress=1`) OR receives `SQLITE_BUSY`/`SQLITE_LOCKED` 3x within 100ms, governance enters one of two deterministic modes (operator-configured global default in `workspace.feature_flags.governance_deterministic_mode`):

- **`shadow_global`** (default): all evaluator calls return `allow` with `reason='deterministic_shadow_during_migration'`. Activity rows still written. Pure observability mode.
- **`defer_global`**: all evaluator calls return `defer`. Scheduler retries on next tick. Safer but stops dispatch entirely during long migrations.

**Restart safety**: on MC startup, the breaker state is read from DB. If `state='open'`, breaker stays open until `half_open` window passes naturally — restart does NOT clear it. `restart_count` increments so operator can see "this breaker has survived N restarts" and investigate root cause.

## Strict Scope (Updated for v1)

All files added to `tsconfig.spec-strict.json` and the ESLint strict config:

**Core governance + ledger (corrected scope):**
- `src/lib/resource-governance.ts` (new — evaluator + atomic ledger reads)
- `src/lib/resource-budget-ledger.ts` (new — append-only ledger writer)
- `src/lib/resource-overrides.ts` (new — atomic reservation grant/release with state machine)
- `src/lib/resource-circuit-breaker.ts` (new — persistent breaker state)
- `src/app/api/resource-policies/route.ts` (new)
- `src/app/api/resource-policy-events/route.ts` (new)
- `src/app/api/resource-overrides/route.ts` (new)
- `src/lib/openclaw-health-costs.ts` (new)

**Multi-source ingestion layer (Option B, two-layer):**
- `src/lib/observability/index.ts` (new)
- `src/app/api/otlp/v1/traces/route.ts` (new)
- `src/app/api/otlp/v1/metrics/route.ts` (new)
- `src/app/api/observe/copilot-session-end/route.ts` (new)
- `src/lib/observability/codex-stdout-tail.ts` (new)
- `src/lib/observability/codex-rollout-tail.ts` (new — uses Q19 snapshot model)
- `src/lib/observability/claude-code-transcript-tail.ts` (new)
- `src/lib/observability/copilot-events-ingester.ts` (new)
- `src/lib/observability/openclaw-quota-bridge.ts` (new — advisory-only ceiling check)
- `src/lib/observability/ollama-response-capture.ts` (new — only if direct Ollama in v1)
- `src/lib/observability/lmstudio-log-stream.ts` (new — may defer to v1.1)
- `src/lib/observability/gen-ai-attribute-mapper.ts` (new)
- `src/lib/observability/usage-event-reconciler.ts` (new — two-layer raw → canonical)
- `src/lib/observability/snapshot-delta-computer.ts` (new — Q19)
- `src/lib/observability/telemetry-freshness-tracker.ts` (new — Q19)
- `src/lib/observability/price-catalog.ts` (new — extends/replaces `src/lib/token-pricing.ts`)
- `src/lib/provider-accounts.ts` (new — extends `src/lib/provider-subscriptions.ts`)

**Touched (in PR; not strict-scope-pinned):**
- `src/lib/migrations.ts` — add M63 (default policies), M64 (`provider_accounts` + `provider_entitlements` + `resource_overrides` + `resource_budget_ledger` + `raw_usage_events` + `canonical_usage_events` + `usage_snapshots` + `telemetry_source_freshness` + `resource_governance_breaker`)
- `src/lib/task-dispatch.ts` — wire evaluator into 4 gate sites; reads ledger
- `src/lib/scheduler.ts` — wire evaluator + Aegis emergency reserve check
- `src/components/panels/cost-tracker-panel.tsx` — add 5th "Governance" tab + telemetry health panel
- `src/components/panels/task-board-panel.tsx` — WIP indicators
- `src/app/api/tokens/route.ts` — extend to read from `canonical_usage_events`; preserve backward compat for `token_usage`
- `src/app/api/events/route.ts` — emit `resource_policy_event` + `governance_window_state` + `telemetry_freshness_changed` + `governance_breaker_state` + `governance_drift_observed`
- `src/lib/sessions.ts` — documentation update

**New systemd unit on the operator node** (operator-managed, not in repo):
- `~/.config/systemd/user/otelcol-contrib.service` — documented in `docs/observability/otel-collector-setup.md`

**Documentation deliverables:**
- `docs/observability/{otel-collector-setup,claude-code-telemetry-setup,codex-cli-telemetry-setup,copilot-cli-telemetry-setup,ingestion-tier-reference,calibration-protocol,collector-failure-runbook}.md`
- `docs/feature-flags-runbook.md` update
- `docs/orchestration.md` cross-reference
- `docs/migrations/rollback-M63.sql`, `rollback-M64.sql`, `rollback-M65.sql`

## Q22 — Rollout Posture (phased; calibration before hard enforcement)

1. **Phase 1 — schema + ingestion (autopilot rounds 1-2).** All M63/M64 migrations; OTLP receiver + `otelcol-contrib` setup; multi-source adapters; `provider_accounts`/`provider_entitlements`; price catalog; raw + canonical telemetry pipeline. `FEATURE_RESOURCE_GOVERNANCE=false`. Pure ingestion + audit. Reconciler running in shadow.
2. **Phase 2 — evaluator + ledger + UI (autopilot rounds 3-4).** `evaluateResourceGovernance` + `resource_budget_ledger` + atomic reservations + persistent circuit breaker; Governance tab + telemetry health panel; full-path benchmark CI gate. `FEATURE_RESOURCE_GOVERNANCE=false`. Evaluator runs in pure-shadow no-op mode.
3. **Phase 3 — calibration (autopilot round 5).** Flip `FEATURE_RESOURCE_GOVERNANCE=true` for facility workspace. ALL policies remain `shadow`. 7-day observation window: drift thresholds calibrated per source; Aegis emergency reserve sizing validated; operator reviews `governance_drift_observed` activities. NO `block`/`defer` decisions issued.
4. **Phase 4 — soft enforcement promotion (operator action).** Operator promotes individual policies to `soft` per workspace. Activities + notifications fire; no dispatch blocked.
5. **Phase 5 — hard enforcement promotion (operator action, post-calibration).** Operator promotes to `hard` per workspace, per policy. AC: every promotion requires explicit operator confirmation in UI.

### Q23 — Source emission capability registry (NEW — round-2 oracle finding #5)

**Decision:** **Every ingestion adapter declares its emission capabilities in a typed registry.** No adapter enters hard enforcement until its capabilities are explicitly known.

```ts
type UsageEmissionMode =
  | 'delta_event'                  // each event is a per-call delta (Claude Code claude_code.token.usage)
  | 'cumulative_snapshot'           // mid-stream cumulative counter (Codex token_count events)
  | 'terminal_cumulative_snapshot'  // single cumulative emit at session end (Copilot session.shutdown)
  | 'aggregate_session_blob'        // OpenClaw aggregate sessions.json
  | 'unknown';

interface SourceCapability {
  source: 'native_otel' | 'cli_stdout_json' | 'gateway_otel' | 'transcript_replay' | 'manual_post' | 'provider_quota';
  cli: string;
  emission_mode: UsageEmissionMode;
  ordering_key: 'request_id' | 'prompt_id' | 'provider_timestamp' | 'snapshot_seq' | 'observed_at';
  reset_boundary: 'session_id' | 'generation_id' | 'file_rotation' | 'process_restart' | 'never';
  dedupe_key: 'request_id' | 'prompt_id' | 'raw_hash' | 'session_id+generation_id';
  enforcement_eligibility: 'hard' | 'soft' | 'shadow' | 'reconciliation_only';
  schema_version: string;            // semver of the parser; incremented on schema-break
  schema_validator: (raw: unknown) => 'valid' | 'unsupported_version' | 'schema_broken';
}
```

Per-source capabilities (v1 baseline):

| Adapter | emission_mode | ordering_key | reset_boundary | enforcement_eligibility |
|---|---|---|---|---|
| Claude Code native OTel | delta_event | request_id | never | hard (after Q23 verify spike) |
| Claude Code transcript replay | delta_event | observed_at | session_id (file uuid) | soft (cross-check) |
| Codex stdout `--json` | delta_event | provider_timestamp | session_id | hard |
| Codex rollout JSONL | cumulative_snapshot | provider_timestamp | generation_id | reconciliation_only (cumulative; gen tracking required per Q19) |
| Copilot events.jsonl | terminal_cumulative_snapshot | observed_at | session_id | soft (post-shutdown only) |
| OpenClaw gateway OTel | delta_event | request_id (when gateway-mediated) | never | hard for gateway-mediated; advisory otherwise |
| OpenClaw aggregate session blob | aggregate_session_blob | observed_at | openclaw_session_key | reconciliation_only |
| Provider quota fetcher | cumulative_snapshot | provider_timestamp | quota_window_start | advisory only (pre-flight ceiling check) |
| Manual POST `/api/tokens` | delta_event | observed_at | never | hard (operator-trusted) |

`enforcement_eligibility` gates whether the source can write `kind='debit'` or only `kind='correction'` ledger entries.

### Q24 — Reconciler batched worker pattern + bounded backfill (NEW — round-2 oracle findings #7, #11)

**Decision:** **Reconciler is a batched worker, NOT inline-on-every-insert. Backfill is bounded with rate limits and correction coalescing.**

```sql
ALTER TABLE raw_usage_events ADD COLUMN reconcile_status TEXT NOT NULL DEFAULT 'pending';  -- 'pending'|'reconciling'|'reconciled'|'low_confidence_review'|'schema_broken'
ALTER TABLE raw_usage_events ADD COLUMN reconcile_after INTEGER;
ALTER TABLE raw_usage_events ADD COLUMN reconcile_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE raw_usage_events ADD COLUMN reconcile_last_error TEXT;
CREATE INDEX idx_raw_reconcile_pending ON raw_usage_events(reconcile_status, reconcile_after) WHERE reconcile_status = 'pending';
```

**Worker loop** (runs every 5s in MC's existing scheduler):

```ts
const batch = db.prepare(`
  SELECT * FROM raw_usage_events
  WHERE reconcile_status = 'pending' AND (reconcile_after IS NULL OR reconcile_after <= ?)
  ORDER BY observed_at ASC
  LIMIT ?
`).all(Date.now(), BATCH_SIZE);  // BATCH_SIZE=100

// Group by likely join key (request_id, prompt_id, raw_hash)
const groups = groupByJoinKey(batch);

// Reconcile each group as a set, emit coalesced corrections
for (const group of groups) {
  const tx = db.transaction(() => {
    // Process group: dedupe, attach to canonical, compute corrections
    const corrections = processGroup(group);
    // Coalesce corrections per (workspace, scope, provider_account, window) per Q26
    const coalesced = coalesceCorrections(corrections);
    insertLedgerCorrections(coalesced);
    markReconciled(group);
  });
  tx.immediate();
}
```

**Bounded backfill protocol** (collector recovery after downtime):

- Detection: collector restarts after >5min downtime → `state='backfill_in_progress'`.
- Backfill happens in chunks: max 1000 raw rows per scheduler tick (5s = ~12K rows/min throughput).
- During backfill: hard enforcement on backfill-dependent paths stays in `shadow_due_to_stale_telemetry`.
- Correction coalescing during backfill: collapse all corrections for the same `(workspace, scope, provider_account, window_kind, window_start)` into a single ledger row per scheduler tick.
- Backfill completion: when backlog `< 100` raw rows AND no new failures in 60s, transition state → `fresh`.
- UI exposes "Backfill in progress: X events / Y total, ETA Zm" indicator.

**Reconciliation throughput acceptance**: 600 raw rows/min sustained input + 6h backfill of 36K events → no scheduler tick exceeds 200ms; admission control p95 latency NOT degraded; ledger corrections coalesced to ≤200 rows for the full backfill (vs 36K naive).

### Q25 — Copilot schema validation contract (NEW — round-2 oracle finding #13)

**Decision:** **Adapter ships JSON schema per known Copilot CLI version; unknown fields tolerated; missing required fields mark source `schema_broken`; explicit handling for the 2026-06-01 AI Credits transition.**

```ts
const COPILOT_SCHEMAS: Record<string, JSONSchema> = {
  '0.0.422': {
    type: 'object',
    required: ['type', 'modelMetrics'],
    properties: {
      type: { const: 'session.shutdown' },
      modelMetrics: {
        type: 'object',
        patternProperties: {
          '^[a-z0-9-]+$': {
            type: 'object',
            required: ['tokens', 'requests'],
            properties: {
              tokens: {
                type: 'object',
                required: ['input', 'output'],
                properties: {
                  input: { type: 'integer', minimum: 0 },
                  output: { type: 'integer', minimum: 0 },
                  cache_read: { type: 'integer', minimum: 0 },
                  cache_write: { type: 'integer', minimum: 0 },
                },
              },
              requests: {
                type: 'object',
                required: ['count', 'cost'],
                properties: {
                  count: { type: 'integer', minimum: 0 },
                  cost: { type: 'number', minimum: 0 },  // pre-2026-06-01: premium request units
                },
              },
            },
          },
        },
      },
    },
  },
  // 2026-06-01 AI Credits transition: replace `requests.cost` (premium units) with `requests.credits` (token-based)
  '0.1.0': {
    // ...future schema; flagged in roadmap
  },
};
```

**Adapter behavior**:

1. On parse, run JSON schema validator against pinned version.
2. **Valid**: extract fields, write `raw_usage_events`.
3. **Unknown fields present**: log info, ingest with what's parseable.
4. **Required fields missing**: mark `state='schema_broken'`, emit `governance_telemetry_schema_unsupported` notification, do NOT enforce from this source.
5. **Unknown Copilot version detected** (via `~/.copilot/config.json` version string): warn; attempt parse with latest known schema; if fails, mark `schema_broken`.

**Schema-break detection contract**: every PR that touches `copilot-events-ingester.ts` must include a fixture test for at least the pinned version. CI test fixture set includes "known good" Copilot session.shutdown payloads from versions 0.0.422 (pre-AI-Credits) and (when available) post-AI-Credits.

**Operator UI**: Cost Tracker → Governance tab → telemetry health panel shows "Copilot CLI: schema unsupported (version 1.2.3 detected; supported up to 0.0.999); enforcement degraded". Provides "Manual cost limit" input as fallback (uses `provider_entitlements` operator-configured limits per Q15.5).

### Q26 — Correction ledger coalescing (NEW — round-2 oracle finding #15)

**Decision:** **Reconciler emits at most ONE correction ledger entry per `(workspace_id, scope_kind, scope_id, provider_account_id, window_kind, window_start, reconciliation_batch_id)` tuple, even when reconciling N raw events.**

```sql
ALTER TABLE resource_budget_ledger ADD COLUMN reconciliation_batch_id INTEGER;
ALTER TABLE resource_budget_ledger ADD COLUMN coalesced_event_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE resource_budget_ledger ADD COLUMN coalesced_canonical_event_ids TEXT;  -- JSON array of canonical_usage_events.id contributing
CREATE INDEX idx_ledger_recon_batch ON resource_budget_ledger(reconciliation_batch_id) WHERE reconciliation_batch_id IS NOT NULL;
```

Reconciliation worker (Q24) groups corrections per scope+window+batch and inserts ONE ledger row with the coalesced delta. Detailed evidence stays in `canonical_usage_events` and `canonical_usage_sources` tables — auditable on demand without bloating the ledger.

**Provenance**: each coalesced ledger row has `source_kind='telemetry_correction_coalesced'` and `coalesced_canonical_event_ids` lists every canonical row that contributed. Operator audit drilldown joins from ledger row → canonical events → raw events.

### Q27 — Precomputed budget counters for sub-25ms admission (NEW — round-2 oracle finding #8)

**Decision:** **Maintain a `resource_budget_counters` table updated atomically with each ledger insert; admission reads from counters (O(1) per scope), not from ledger SUM aggregate (O(n)).**

```sql
CREATE TABLE resource_budget_counters (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  scope_kind TEXT NOT NULL,                       -- 'agent'|'project'|'workspace'|'task'|'aegis_emergency'
  scope_id TEXT NOT NULL,
  provider_account_id INTEGER REFERENCES provider_accounts(id),  -- NULL for non-account-scoped (e.g., WIP)
  window_kind TEXT NOT NULL,                      -- 'rolling'|'calendar'|'wip'
  window_start INTEGER NOT NULL,                  -- unixepoch ms; for rolling, the window start time; for calendar, the boundary; for wip, 0
  consumed_cost_usd REAL NOT NULL DEFAULT 0,
  reserved_cost_usd REAL NOT NULL DEFAULT 0,
  consumed_tokens INTEGER NOT NULL DEFAULT 0,
  reserved_tokens INTEGER NOT NULL DEFAULT 0,
  consumed_requests INTEGER NOT NULL DEFAULT 0,
  consumed_sessions INTEGER NOT NULL DEFAULT 0,
  consumed_wip INTEGER NOT NULL DEFAULT 0,        -- for WIP windows: count of in_progress tasks
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
  UNIQUE(workspace_id, scope_kind, scope_id, COALESCE(provider_account_id, -1), window_kind, window_start)
);
CREATE INDEX idx_counters_admission_lookup ON resource_budget_counters(workspace_id, scope_kind, scope_id, window_kind, window_start);
```

**Counter maintenance** (atomic with ledger inserts inside same transaction):

- `INSERT INTO resource_budget_ledger (kind='debit', amount_cost_usd=X, ...)` → `UPDATE resource_budget_counters SET consumed_cost_usd = consumed_cost_usd + X, updated_at=NOW() WHERE ...`.
- `INSERT INTO resource_budget_ledger (kind='reservation', ...)` → bumps `reserved_*`.
- `INSERT INTO resource_budget_ledger (kind='release', ...)` → reduces `reserved_*`, increases `consumed_*` (when reservation closed via debit), or reduces `reserved_*` only (when reservation released without consumption).
- `INSERT INTO resource_budget_ledger (kind='correction', ...)` → adjusts `consumed_*` accordingly.

**Window rotation**:

- **Rolling window**: counters are valid as long as `window_start ≥ now - window_seconds`. A scheduler tick every 60s prunes counter rows where `window_start < now - max_rolling_window` (e.g., 30 days for monthly rolling).
- **Calendar window**: at boundary, INSERT a new counter row for the new window. Old counter row remains as historical record.
- **WIP window**: no rotation; counters are always current.

**Reconciliation between ledger and counters**: a periodic verification job (every 1h) recomputes counters from ledger SUM aggregate and compares; discrepancy emits `governance_counter_drift` alert. Plan-phase decides whether discrepancies trigger automatic counter rebuild or operator-confirmed rebuild.

**Performance acceptance**:

- Admission control reads ONE counter row by indexed lookup → ~6µs.
- Counter maintenance UPDATE is one indexed row → ~6µs.
- p95 admission target preserved at <15ms even with seeded 300K-row ledger because admission never scans the ledger directly.
- Benchmark test seeds DB with 300K ledger rows + 1k policies + 10 workspaces, runs 10K concurrent admission calls; asserts p95<15ms, p99<25ms.

### Q28 — Migration safety + rollback contract (NEW — round-2 oracle finding #10)

**Decision:** **Each new migration (M63, M64) is wrapped in an explicit transaction with preflight checks, idempotent creation, and a half-failure acceptance criterion.**

- Migration runner wraps each migration in `db.transaction(() => { ... }).immediate()`.
- DDL statements use `CREATE TABLE IF NOT EXISTS` for idempotency on rerun.
- M63 (default policies) uses `INSERT ... WHERE NOT EXISTS` pattern (rerun-safe).
- M64 (8 new tables: `provider_accounts`, `provider_entitlements`, `resource_overrides`, `resource_budget_ledger`, `resource_budget_counters`, `raw_usage_events`, `canonical_usage_events`, `canonical_usage_sources`, `usage_snapshots`, `telemetry_source_freshness`, `resource_governance_breaker`) — actually 11 tables — is split into 11 individual migration steps M64a..M64k each idempotent.
- No backfill of existing `token_usage` rows in M64 — backfill happens lazily on first read OR via a separate one-shot script (`scripts/backfill-canonical-usage-events.ts`) operator runs after migration.

**Half-failure AC**: simulate `SQLITE_FULL` mid-M64h (the canonical_usage_events table creation); MC startup detects partial state, refuses to proceed, logs explicit `migration_half_failed` activity, operator manually inspects `migrations_log` table and either retries or rolls back. Rollback SQL files at `docs/migrations/rollback-M63.sql`, `rollback-M64a.sql` ... `rollback-M64k.sql` each only drop what their respective migration created.

**Reapply AC**: after a partial M64 + rollback, re-running M64 must succeed without errors. Verified by integration test that injects a fault, runs rollback, then re-runs M64.

### Q29 — Foreground / background DB connection separation (NEW — round-3 oracle finding #2)

**Decision:** **Separate `better-sqlite3` Database connections per workload class with per-connection `busy_timeout`.** Foreground (admission, override grant, ledger debit) fails fast; background (reconciler, backfill, drift verification) backs off.

```ts
// src/lib/db/connection-pool.ts (new helper, single-process Node)
export function getForegroundDb(): Database.Database;  // busy_timeout=50ms; admission path
export function getBackgroundDb(): Database.Database;  // busy_timeout=5000ms; reconciler/backfill
export function getAuditDb(): Database.Database;       // busy_timeout=30000ms; drift verification
```

All three connections open the same SQLite file in WAL mode. SQLite handles cross-connection locking; the connection-level `busy_timeout` controls how long each workload waits before returning `SQLITE_BUSY`. Foreground returns 423 within 50ms; background retries with bounded exponential backoff (50ms, 200ms, 1s, 5s, give up); audit waits longer.

**Adaptive throttling**: a runtime metric `governance_admission_p95_ms` (sampled every 30s). If p95 > 25ms for 2 consecutive samples, reconciler/backfill workers PAUSE until p95 returns to <15ms. Operator notified via `governance_throttle_active` activity. Prevents the runaway-contention failure mode.

### Q30 — Posted-effect ledger lifecycle (NEW — round-3 oracle finding #5)

**Decision:** **`canonical_budget_effects` durably tracks the budget effect a canonical event has posted to each scope.** Reconciler computes desired-effect minus posted-effect and emits only the delta. Reattachment / dedupe correction = posted effect goes to zero, reversal correction emitted.

```sql
CREATE TABLE canonical_budget_effects (
  id INTEGER PRIMARY KEY,
  canonical_event_id INTEGER NOT NULL REFERENCES canonical_usage_events(id),
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  provider_account_id INTEGER REFERENCES provider_accounts(id),
  posted_cost_usd REAL NOT NULL DEFAULT 0,
  posted_tokens INTEGER NOT NULL DEFAULT 0,
  posted_requests INTEGER NOT NULL DEFAULT 0,
  last_reconciliation_batch_id INTEGER NOT NULL REFERENCES reconciliation_batches(id),
  effective_window_start INTEGER NOT NULL,         -- which counter window this effect targets
  UNIQUE(canonical_event_id, scope_kind, scope_id)
);
CREATE INDEX idx_effects_canonical ON canonical_budget_effects(canonical_event_id);
CREATE INDEX idx_effects_scope ON canonical_budget_effects(scope_kind, scope_id, effective_window_start);
```

Reconciler logic per canonical event:

```ts
const desired = computeDesiredEffect(canonicalEvent);  // from authoritative source
const posted = selectPostedEffect.get(canonicalEvent.id, scope);
const delta = {
  cost_usd: desired.cost_usd - posted.posted_cost_usd,
  tokens: desired.tokens - posted.posted_tokens,
};
if (delta.cost_usd !== 0 || delta.tokens !== 0) {
  insertLedgerCorrection({...delta, source_kind: 'telemetry_correction'});
  upsertPostedEffect({...desired, last_reconciliation_batch_id});
  updateCounters({...delta});
}
```

If a canonical event is later reclassified as a duplicate of another, the reconciler:
- sets desired = 0 for the duplicate
- emits a reversal correction (negative delta)
- attaches the duplicate's raw events to the surviving canonical event
- updates `posted_effect` on the surviving canonical with new authoritative totals if changed

Batch IDs are AUDIT GROUPING ONLY — they don't gate dedup or correction lifecycle. Dedup lifecycle is entirely captured by the `(canonical_event_id, scope)` posted-effect rows.

### Q31 — Backfill window state machine (NEW — round-3 oracle finding #6)

**Decision:** **`telemetry_backfill_windows` table tracks per-source backfill state. During `running` or `finalizing`, hard enforcement on backfill-dependent paths is `shadow_due_to_backfill`.**

```sql
CREATE TABLE telemetry_backfill_windows (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  source_path TEXT NOT NULL,
  workspace_id INTEGER,
  provider_account_id INTEGER REFERENCES provider_accounts(id),
  window_start INTEGER NOT NULL,                  -- earliest event timestamp being backfilled
  window_end INTEGER NOT NULL,                    -- latest event timestamp at backfill start
  status TEXT NOT NULL,                           -- 'pending'|'running'|'finalizing'|'complete'|'failed'
  events_total INTEGER,
  events_processed INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  last_processed_event_id INTEGER,
  last_error TEXT
);
CREATE INDEX idx_backfill_active ON telemetry_backfill_windows(status, source_path) WHERE status IN ('pending','running','finalizing');
```

State machine:
- `pending` → `running`: backfill worker claims the window
- `running` → `finalizing`: all events ingested, counters being finalized
- `finalizing` → `complete`: counter finalization committed, source returns to `fresh`
- any → `failed`: error; operator manual intervention required

**Admission behavior during backfill**:
- For each `(provider_account_id, source_path, window)` overlapping an active backfill window: hard enforcement is downgraded to `shadow_due_to_backfill`. Admission returns `allow` with `reason='backfill_shadow:<source_path>'` when the policy depends on that backfill source.
- Admission against scopes WITHOUT pending backfill remains in normal mode.
- During backfill, ledger corrections write to ledger as normal, but counters are marked `pending_finalization` (a flag in `resource_budget_counters`); counter values are advisory.
- Finalization phase: a single transaction reconciles canonical event totals against backfilled raw events, computes the final correction delta, updates counter to authoritative value, removes `pending_finalization` flag.

### Q32 — Incremental freshness + reconciliation batches table (NEW — round-3 oracle findings #10, #15)

**Decision:** **Freshness updated on raw event INSERT (not via O(n) scan); reconciliation batches stored in dedicated table.**

```sql
-- ALTER TABLE telemetry_source_freshness already defined in Q19
-- INSERT trigger pattern (in adapter code, not SQL trigger):
const insertRawTx = db.transaction((event) => {
  insertRawUsageEvent.run(event);
  // Atomically update freshness for this source_path
  upsertFreshness.run({
    source_path: event.source_path,
    last_ingest_at: event.ingested_at,
    consecutive_failures: 0,
    state: 'fresh',
  });
});

-- Sample of upsertFreshness:
INSERT INTO telemetry_source_freshness (source_path, source, cli, provider_account_id, last_ingest_at, state)
VALUES (:source_path, :source, :cli, :provider_account_id, :last_ingest_at, 'fresh')
ON CONFLICT(source_path) DO UPDATE SET
  last_ingest_at = MAX(last_ingest_at, excluded.last_ingest_at),
  consecutive_failures = 0,
  state = 'fresh';

-- Scheduler tick (60s) ONLY checks staleness; never aggregates over raw_usage_events:
UPDATE telemetry_source_freshness
SET state = 'stale'
WHERE state = 'fresh'
  AND last_ingest_at < (unixepoch()*1000) - :stale_threshold_ms;
```

**`reconciliation_batches` table**:

```sql
CREATE TABLE reconciliation_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  worker_id TEXT NOT NULL,                        -- e.g., 'reconciler-1' or 'backfill-worker-3'
  reason TEXT NOT NULL,                           -- 'scheduled'|'backfill'|'manual_repair'|'drift_repair'
  status TEXT NOT NULL,                           -- 'running'|'completed'|'failed'
  events_processed INTEGER NOT NULL DEFAULT 0,
  corrections_emitted INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX idx_recon_batches_status ON reconciliation_batches(status, started_at);
```

Each reconciler invocation:
1. INSERT a row → `id` becomes `reconciliation_batch_id`
2. Process events; tag every `canonical_usage_sources`, `canonical_budget_effects`, `resource_budget_ledger` correction with this batch_id
3. UPDATE row to `completed` or `failed`

Audit drilldown: ledger correction → batch_id → batch row → all canonical events updated in that batch.

### Q33 — Calibration data sufficiency (NEW — round-3 oracle finding #13)

**Decision:** **Promotion from shadow to soft requires data-sufficiency criteria, not just elapsed time.**

Criteria for promoting a policy from `shadow` to `soft`:

| Criterion | Threshold |
|---|---|
| Minimum elapsed observation time | 7 days (calendar) |
| Minimum active usage days within window | 5 of 7 |
| Minimum events seen for the policy's metric | 100 (e.g., 100 admission decisions for a per-agent WIP policy) |
| Excluded periods | Backfill windows; collector failure windows; operator-flagged "non-typical" periods |
| Drift statistic | p95 drift between authoritative and reconciled sources < the source-specific threshold (Q18) |
| Operator confirmation | Required — operator clicks "promote to soft" in UI; sees observed thresholds; confirms or extends calibration |

Promotion from `soft` to `hard` requires:

| Criterion | Threshold |
|---|---|
| Time in `soft` mode | ≥7 days (additional) |
| Soft alerts triggered without operator override | ≥3 alerts (proves the policy fires when it should) |
| Operator confirmation | Required |
| Aegis emergency reserve healthy | Reserve hasn't been exhausted in past 7 days for this workspace |

UI exposes calibration progress per policy with these criteria as a checklist. Operator cannot promote until all checked.

### Q34 — Attach status repair workflow (NEW — round-3 oracle finding #12)

**Decision:** **`canonical_usage_sources.attach_status` enum supports detach + reattach for misattribution repair.**

```sql
ALTER TABLE canonical_usage_sources ADD COLUMN attach_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE canonical_usage_sources ADD COLUMN attached_by_batch_id INTEGER REFERENCES reconciliation_batches(id);
ALTER TABLE canonical_usage_sources ADD COLUMN detached_by_batch_id INTEGER REFERENCES reconciliation_batches(id);
ALTER TABLE canonical_usage_sources ADD COLUMN detach_reason TEXT;
-- Drop the simple UNIQUE(raw_event_id); replace with partial unique:
DROP INDEX idx_canonical_sources_raw_unique;  -- if exists
CREATE UNIQUE INDEX idx_canonical_sources_active_raw ON canonical_usage_sources(raw_event_id) WHERE attach_status = 'active';
```

Repair workflow (manual operator action via UI or API):

1. Operator (or reconciler with new evidence) determines raw event X was misattached to canonical Y; should attach to canonical Z.
2. Open `BEGIN IMMEDIATE` transaction:
   - UPDATE old row: `SET attach_status='detached', detached_by_batch_id=?, detach_reason='reattributed_to_canonical_<Z>'`
   - INSERT new row with `attach_status='active'`, `attached_by_batch_id=?`
   - Run reconciler logic for both canonical Y and Z to recompute desired-effect (Q30); emit reversal + new corrections.
3. Audit trail: `canonical_usage_sources` row history preserved (no DELETE).

`canonical_usage_sources` is no longer a hot table — it's an audit/repair surface. Reconciler uses `WHERE attach_status='active'` filter.

### Q35 — Background workload priority + atomic counter conditional update (NEW — round-3 oracle findings #1, #3, #16)

**Decision:** **Strict priority order; admission uses atomic conditional UPDATE not SELECT-then-UPDATE.**

**Priority hierarchy** (each can pause if higher-priority workload sees latency degradation):

1. Foreground admission gate (read counter, decide, reserve)
2. Override grant
3. Reservation release / consumption
4. Raw event ingest + freshness update
5. Reconciliation worker
6. Backfill worker
7. Drift verification

Each non-foreground worker exits its scheduler tick early when `governance_admission_p95_ms > 25` for the prior 30s window. Implementation: a shared in-memory metric updated by admission timing.

**Atomic conditional admission UPDATE** (Q27 revised — replaces SELECT-then-UPDATE):

```sql
-- Single atomic conditional UPDATE; commits in one indexed write
UPDATE resource_budget_counters
SET reserved_cost_usd = reserved_cost_usd + :amount,
    updated_at = :now
WHERE id = :counter_id
  AND consumed_cost_usd + reserved_cost_usd + :amount <= :limit;
```

In Node:

```ts
const result = updateStmt.run({counter_id, amount, limit, now});
if (result.changes === 0) {
  // Either counter not found OR limit exceeded
  // Differentiate by re-reading the counter (read-only path; no contention)
  const c = readStmt.get(counter_id);
  if (!c) throw new CounterNotFoundError();
  throw new InsufficientBudgetError({remaining: c.threshold - c.consumed - c.reserved});
}
// reservation succeeded; insert ledger entry in same transaction
```

This pattern is one indexed UPDATE — sub-millisecond on Ryzen 5900XT — with no read-modify-write race window. Combined with foreground `busy_timeout=50ms`, admission p95 stays <15ms even under reconciler contention.

### Q36 — Drift verification: incremental + sampled, never full scan (NEW — round-3 oracle finding #4)

**Decision:** **Drift verification is incremental against `last_verified_ledger_id`, runs on `getAuditDb()` connection (lowest priority), and samples scopes when full coverage exceeds budget.**

```sql
CREATE TABLE drift_verification_state (
  id INTEGER PRIMARY KEY,                         -- always 1
  last_verified_ledger_id INTEGER NOT NULL DEFAULT 0,
  last_verified_at INTEGER NOT NULL,
  verification_method TEXT NOT NULL DEFAULT 'incremental_sampled'
);
INSERT INTO drift_verification_state (id, last_verified_ledger_id, last_verified_at) VALUES (1, 0, 0);
```

Verification job (runs hourly on audit connection):

```sql
-- Pick a sample of scopes that had ledger activity since last verification
SELECT DISTINCT workspace_id, scope_kind, scope_id, window_kind, window_start
FROM resource_budget_ledger
WHERE id > :last_verified_ledger_id
ORDER BY RANDOM()
LIMIT 50;
```

For each sampled scope, recompute counter values from ledger entries SINCE `last_verified_ledger_id` and compare to current counter row. Discrepancy → emit `governance_counter_drift` with details + scope-specific repair recommendation.

**Full verification**: only operator-triggered ("Run full drift check now" button); runs on audit connection; can take minutes; produces detailed report.

**Per-tick budget**: max 5 seconds total wall-clock per scheduler tick for drift work; pauses if exceeded.

### Q37 — Tiered Copilot schema validation + unattended policy (NEW — round-3 oracle findings #11, #14)

**Decision:** **Schema validation runs in tiers based on ingestion phase; `governance_telemetry_schema_unsupported` has unattended escalation.**

**Tiered validation**:

| Tier | When | Cost |
|---|---|---|
| **Required-field guard** | Every event ingest | <0.1ms (key existence check) |
| **Full schema validation** | First event per `(session_id, copilot_version)` | 1-3ms (full JSON schema) |
| **Sampled full validation** | 1% of subsequent events | 1-3ms × 0.01 = amortized ~0.03ms |
| **On schema_broken trigger** | Required-field guard fails | Full validation runs to confirm; mark source schema_broken if confirmed |

**Unattended escalation policy** when source enters `schema_broken`:

| Time elapsed | Action |
|---|---|
| 0min | Activity row + notification fired (`governance_telemetry_schema_unsupported`) |
| 1h | Repeat notification (escalation level 1) |
| 6h | Repeat notification + dashboard banner (escalation level 2) |
| 24h | Auto-action: hard enforcement permanently disabled for this `(provider_account_id, source_path)` until operator confirms; falls back to operator-configured `provider_entitlements` quota (Q15.5 advisory pattern); operator-configurable global "fail closed" mode can override this default |

`workspace.feature_flags.governance_schema_break_default_mode` ∈ `{advisory, fail_closed}`. Default `advisory` (less aggressive), can be flipped to `fail_closed` per workspace for higher-risk environments.

### Q38 — Reservation accounting across counter windows (NEW — round-3 oracle finding #8)

**Decision:** **Reservations carry their target counter window explicitly; release entries decrement the ORIGINAL window's counter regardless of when release happens.**

```sql
ALTER TABLE resource_overrides ADD COLUMN reserved_counter_id INTEGER REFERENCES resource_budget_counters(id);
ALTER TABLE resource_overrides ADD COLUMN reserved_window_start INTEGER;
-- Same on resource_budget_ledger:
ALTER TABLE resource_budget_ledger ADD COLUMN reservation_id INTEGER REFERENCES resource_overrides(id);
ALTER TABLE resource_budget_ledger ADD COLUMN effective_window_start INTEGER;
```

Reservation grant flow:
1. Resolve target counter row → record `counter_id` + `window_start` on the override and reservation ledger entry.
2. Increment counter's `reserved_*`.

Release flow (on task completion or expiry):
1. Look up the original `reserved_counter_id` and `reserved_window_start` from the override row.
2. Decrement THAT counter's `reserved_*` (not the current-day's counter).
3. If the task consumed less than reserved, the unused portion is released to the ORIGINAL counter window.
4. If the actual consumption exceeded the reservation (over-spend), the over-spend creates a NEW debit on the CURRENT counter window (so the over-spend hits today's budget, not yesterday's already-closed window).

This ensures atomic accounting: old windows close cleanly; over-spends impact current windows; UTC midnight rollover preserves correctness without ambiguity.

### Q39 — Codex stdout↔rollout dedupe join (NEW — peer review blocker A)

**Decision:** **Add a Codex-specific high-confidence join key.** Codex's two trusted sources (`cli_stdout_json` from `codex exec --json` and `transcript_replay` from rollout JSONL) emit token data for the same provider call but lack a shared `request_id`. The peer reviewer flagged this would fall back to medium-confidence which is too coarse.

**Codex high-confidence join rule** (extend Q18 dedup ladder):

```ts
// In addition to: same request_id (Anthropic) | same prompt_id (Claude Code) | same raw_hash
// Codex-specific high-confidence join:
if (a.cli === 'codex' && b.cli === 'codex' &&
    a.session_id === b.session_id &&
    a.provider_timestamp_ms === b.provider_timestamp_ms &&  // Codex emits identical turn timestamp on stdout + rollout
    a.input_tokens === b.input_tokens &&
    a.output_tokens === b.output_tokens &&
    a.cache_read_input_tokens === b.cache_read_input_tokens &&
    a.reasoning_output_tokens === b.reasoning_output_tokens) {
  return { confidence: 'high', dedupe_reason: 'codex_session_timestamp_token_tuple' };
}
```

This is high-confidence because:
- `session_id` is the rollout filename UUID, unique per Codex session.
- `provider_timestamp_ms` (from `turn.completed.at` in stdout / `event_msg.payload.timestamp` in rollout) is identical for the same turn — Codex writes the same nanosecond timestamp to both surfaces.
- All four token-count fields are exact matches (Codex emits canonical counts; partial copies don't happen).

If any of the 4 fields differ, the events are different turns within the same session. Falls back to medium then low confidence per the existing Q18 ladder.

**Authoritative source precedence** (Q18 table) updated for Codex: `cli_stdout_json` is authoritative when present (sub-second RT); `transcript_replay` (rollout) is authoritative when stdout source absent. They never both contribute additively — the high-confidence join ensures one canonical row.

### Q40 — Counter↔ledger atomic rebuild path (NEW — peer review blocker B)

**Decision:** **Counter rebuild is a documented operator action with explicit ACs.**

Drift detection (Q36) emits `governance_counter_drift` with details. Operator response options:

1. **Auto-repair** (when drift < threshold AND last `governance_counter_drift` resolved cleanly): system runs incremental rebuild on audit connection.
2. **Manual rebuild via API**: `POST /api/resource-budget-counters/rebuild` with body `{workspace_id, scope_kind, scope_id, window_kind, window_start}`. Operator session required.

Rebuild procedure (single transaction on audit connection, with `BEGIN IMMEDIATE`):

```sql
BEGIN IMMEDIATE;
-- Recompute counter from authoritative sources:
WITH ledger_total AS (
  SELECT
    COALESCE(SUM(CASE kind WHEN 'release' THEN -amount_cost_usd ELSE amount_cost_usd END), 0) AS cost_usd,
    COALESCE(SUM(CASE kind WHEN 'release' THEN -amount_tokens ELSE amount_tokens END), 0) AS tokens
  FROM resource_budget_ledger
  WHERE workspace_id=:w AND scope_kind=:sk AND scope_id=:si AND created_at >= :ws
),
posted_total AS (
  -- Sum desired effects from canonical_budget_effects (authoritative)
  SELECT
    COALESCE(SUM(posted_cost_usd), 0) AS cost_usd,
    COALESCE(SUM(posted_tokens), 0) AS tokens
  FROM canonical_budget_effects
  WHERE scope_kind=:sk AND scope_id=:si AND effective_window_start=:ws
)
UPDATE resource_budget_counters
SET consumed_cost_usd = (SELECT cost_usd FROM posted_total),
    consumed_tokens = (SELECT tokens FROM posted_total),
    updated_at = :now,
    last_rebuild_at = :now,
    last_rebuild_reason = :reason
WHERE workspace_id=:w AND scope_kind=:sk AND scope_id=:si AND window_kind=:wk AND window_start=:ws;

-- Audit row for the rebuild operation
INSERT INTO governance_counter_rebuild_log (workspace_id, scope_kind, scope_id, ledger_total_cost_usd, posted_total_cost_usd, prior_counter_cost_usd, new_counter_cost_usd, reason, operator_id, performed_at)
VALUES (...);
COMMIT;
```

Required schema additions:

```sql
ALTER TABLE resource_budget_counters ADD COLUMN last_rebuild_at INTEGER;
ALTER TABLE resource_budget_counters ADD COLUMN last_rebuild_reason TEXT;

CREATE TABLE governance_counter_rebuild_log (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  ledger_total_cost_usd REAL,
  posted_total_cost_usd REAL,
  prior_counter_cost_usd REAL NOT NULL,
  new_counter_cost_usd REAL NOT NULL,
  delta_cost_usd REAL NOT NULL,
  reason TEXT NOT NULL,                            -- 'auto_repair'|'manual_operator'|'drift_detection'
  operator_id TEXT,
  performed_at INTEGER NOT NULL
);
```

**Drift root-cause enumeration**:

| Cause | Frequency | Auto-repair? |
|---|---|---|
| Backfill correction lag | Every backfill | Yes — counter pending_finalization clears when finalize completes |
| Crash mid-transaction | Rare | Yes if crash recovery restores from WAL; manual if WAL corrupted |
| Concurrent counter UPDATE missed by atomic-conditional pattern | Should be impossible per Q35; if observed, indicates pattern bug | No — operator-confirmed rebuild + bug filing |
| Schema migration partial-completion | Rare | No — operator-confirmed |
| Operator manual ledger edit (out-of-band) | Forbidden but possible | No — operator-confirmed |

**Acceptance criteria**:

- AC-Drift-1: Inject 5% drift via direct counter UPDATE; verify hourly drift verification detects it; verify `governance_counter_drift` activity fires; verify auto-repair restores counter to ledger-derived value.
- AC-Drift-2: Inject 50% drift; verify auto-repair refuses (above threshold); verify operator-confirmation path works.
- AC-Drift-3: Concurrent rebuild + admission; verify rebuild's `BEGIN IMMEDIATE` serializes correctly; admission waits or returns `423`; no double-counting.

### Q41 — Input validation + threat model (NEW — peer review blocker C)

**Decision:** **All operator-supplied text fields are length-bounded; all JSON fields are JSON-Schema validated; numeric fields have explicit min/max; all REST routes apply Zod validators.**

**Field-level constraints** (Zod schemas in `src/lib/observability/validation/`):

| Field | Constraint |
|---|---|
| `resource_overrides.reason` | TEXT, length 1..500; sanitized via `DOMPurify.sanitize` for any UI display; stored verbatim for audit |
| `resource_overrides.reserved_*` numeric fields | INTEGER ≥0, ≤10^12 (rejects nonsense values); REAL ≥0, ≤10^9 (rejects $999B reserves) |
| `resource_overrides.expires_at` | INTEGER, `granted_at < expires_at <= granted_at + 24h` |
| `provider_accounts.config_json` | JSON schema validated per provider; max 10KB; rejected if contains keys outside the schema |
| `resource_policies.policy_config_json` | JSON schema validated per policy_kind; max 5KB |
| `provider_entitlements.quota_limit_*` | INTEGER ≥0, ≤10^12; REAL ≥0, ≤10^9 |
| `resource_budget_ledger.amount_*` | INTEGER ≥-10^12 ≤10^12 (releases can be negative); REAL ≥-10^9 ≤10^9 |
| Copilot `events.jsonl` parsed fields | All token counts INTEGER ≥0 ≤10^12; reject if NaN or Infinity in JSON |

**Threat model — distinct from `schema_broken`**:

| Threat | Detection | Response |
|---|---|---|
| `schema_broken` (Q25) | Required fields missing OR types wrong (well-formed but unsupported version) | `state='schema_broken'`; advisory enforcement; alert escalation per Q37 |
| `schema_malicious` | Numeric fields out of bounds (e.g., 10^18 tokens), structural anomalies (deeply nested JSON, oversized strings, prototype pollution attempts), invalid UTF-8 | `state='schema_malicious'`; **all events from this source rejected, not stored**; critical security alert; source disabled until operator confirms |
| `replay_attack` | Same `(source, source_event_id)` ingested with different content | `UNIQUE` constraint rejects duplicate-id-different-content; logged as `governance_replay_detected`; operator notified |
| Operator-supplied SQL injection in `reason` | Parameterized queries (better-sqlite3 prepared statements always parameterize) | Zero risk via parameterized queries; defense-in-depth Zod validation |
| XSS in audit/UI display | Sanitization on render (DOMPurify) | UI never directly renders user-supplied text without sanitization |

**Request validation middleware** (in `src/lib/middleware/governance-validation.ts`):

- Every POST / PUT to `/api/resource-overrides`, `/api/resource-policies`, `/api/resource-policy-events` runs through Zod validators before reaching the handler.
- Rejected requests return `422 Unprocessable Entity` with field-level error details.
- Validation errors logged at `info` (operator typo) or `warn` (potentially malicious) level based on heuristics.

### Q42 — Aegis governance default mode (REVISED — peer review substantive disagreement)

**Decision (revised after peer review):** **Aegis emergency reserve ships as `soft` by default, not `shadow`.** The peer reviewer correctly observed that wiring safety mechanisms but leaving them inert means LM Studio fallback and break-glass paths aren't exercised until they're load-bearing — too late to discover they don't work.

**Revised v1 Aegis posture**:

- Aegis WIP/budget policies: **`shadow`** (matches other workspace policies; no behavior change)
- Aegis emergency reserve: **`soft`** (alerts fire when emergency reserve exceeds soft threshold $4/day at 80% of $5 cap; no `block`)
- Aegis hard fallback: ON (always fires on emergency-reserve hard exhaustion, leading to local-only mode; this exercises LM Studio path)
- Break-glass override path: **active** (operator can invoke; tested via integration test that simulates exhaustion)

This means:
- Day 1 of governance: Aegis behaves as today (no enforcement on dispatch).
- When Aegis runs out of frontier budget, it AUTOMATICALLY falls back to local-only mode via the safety path. Operator gets notification. The fallback is exercised continuously (not just in failure scenarios).
- Operator can promote Aegis WIP/budget policies to `soft`/`hard` per Q33 calibration criteria when ready.

### Q43 — Data lifecycle, retention, and partitioning (NEW — peer review non-blocking gap)

**Decision:** **Per-table retention policies with operator-tunable thresholds; periodic vacuum; no SQLite partitioning needed for v1 scale.**

**Estimated growth** (v1 single-operator, 5 active CLIs, ~600 raw rows/min sustained):

| Table | 1y rows | 3y rows | Retention | Action |
|---|---|---|---|---|
| `raw_usage_events` | ~315M | ~945M | 90 days default; operator-configurable | Roll old rows to compressed archive table OR delete after retention |
| `canonical_usage_events` | ~50M (post-dedup) | ~150M | 1 year default | Same |
| `canonical_usage_sources` | ~150M | ~450M | Tied to canonical retention | Cascade |
| `usage_snapshots` | ~50M | ~150M | 90 days | Delete |
| `resource_budget_ledger` | ~2M (post-coalesce) | ~6M | 5 years (financial audit) | Keep |
| `resource_budget_counters` | ~100K | ~300K | Permanent (counters are current-state) | Vacuum periodically |
| `resource_policies` | ~100 | ~500 | Permanent | None |
| `resource_policy_events` | ~5M | ~15M | 1 year | Delete |
| `resource_overrides` | ~50K | ~150K | 1 year | Delete |
| `canonical_budget_effects` | ~50M | ~150M | Tied to canonical retention | Cascade |
| `telemetry_source_freshness` | ~50 | ~50 | Permanent | None |
| `telemetry_backfill_windows` | ~1K | ~3K | 90 days | Delete |
| `reconciliation_batches` | ~3M | ~9M | 90 days | Delete |
| `resource_governance_breaker` | ~10 | ~50 | Permanent | None |
| `governance_counter_rebuild_log` | ~1K | ~3K | Permanent | None |
| `drift_verification_state` | 1 | 1 | Permanent | None |

**Retention enforcement**: a daily job (`scripts/retention-sweep.ts`) runs DELETE in bounded chunks (max 10K rows/run, max 60s wall-clock); skipped during backfill. SQLite VACUUM monthly during low-traffic window (configurable; default 04:00 UTC Sunday).

**Partitioning**: NOT needed for v1. SQLite handles single-file billion-row scale fine for sequential reads; if `raw_usage_events` exceeds ~500M rows the operator should evaluate sharding to a separate file (deferred to v2).

### Q44 — Diagnostic / "why is dispatch blocked?" health view (NEW — peer review non-blocking gap)

**Decision:** **Cost Tracker → Governance tab → 6th sub-section: "Dispatch Diagnostic" exposes why a specific dispatch decision was made.**

Operator selects a recent dispatch attempt (or pastes task_id); UI shows:

```
Task #12345 (agent: claude-code, project: racecraft-mc, workspace: facility)
Decision: deferred (5min ago)
Reason: WIP policy `wip_workspace_facility` exceeded threshold (8 of 8 in_progress)

Contributing context:
✓ Workspace USD budget: $7.20 of $25 daily (29%)
✓ Daily token budget: 12M of 200M (6%)
✗ Workspace WIP: 8 of 8 in_progress (BLOCKED)
✓ Aegis emergency reserve: $0 of $5 used (100% available)
✓ All telemetry sources fresh
✓ Circuit breaker closed

Suggested actions:
- Wait for an in-progress task to complete
- Promote a low-priority task to "blocking" status
- Increase wip_workspace_facility threshold (currently 8) via /api/resource-policies
- Grant override (1h) via /api/resource-overrides
```

REST surface: `GET /api/governance/diagnostic?task_id=X` returns the same data as JSON.

### Q45 — Self-observability metrics for the governance system (NEW — peer review non-blocking gap)

**Decision:** **Governance subsystem emits OTel-style metrics about itself**, exported via the same `otelcol-contrib` collector.

Metrics emitted from `src/lib/resource-governance.ts`:

| Metric | Type | Attributes |
|---|---|---|
| `mc.governance.admission.duration_ms` | histogram | `decision`, `policy_kind`, `scope_kind` |
| `mc.governance.admission.decision_count` | counter | `decision`, `policy_kind` |
| `mc.governance.reservation.granted_count` | counter | `granted_by_kind`, `scope_kind` |
| `mc.governance.reservation.denied_count` | counter | `reason` (`insufficient_budget`, `db_busy`, `invalid`) |
| `mc.governance.reconciler.batch_duration_ms` | histogram | `reason` |
| `mc.governance.reconciler.events_processed` | counter | `source` |
| `mc.governance.reconciler.corrections_emitted` | counter | `scope_kind` |
| `mc.governance.backfill.events_remaining` | gauge | `source_path` |
| `mc.governance.breaker.state_transitions` | counter | `component`, `to_state` |
| `mc.governance.drift.detected_count` | counter | `scope_kind` |
| `mc.governance.drift.repair_count` | counter | `repair_kind` |
| `mc.governance.aegis_emergency.reserve_consumed_pct` | gauge | `workspace_id` |

Operator dashboards consume these in Grafana / etc. Internal alerting rules:

- `admission.duration_ms p95 > 25` for 5min → operator paged
- `breaker.state_transitions{to_state=open}` → operator paged
- `aegis_emergency.reserve_consumed_pct > 80` → operator notified
- `drift.detected_count` rate > 1/hour → operator notified

### Q46 — Soak test + DST + concurrent operator edit ACs (NEW — peer review non-blocking gaps)

**Decision:** **Three additional test suite categories.**

**Soak test** (`pnpm test:soak`, runs nightly in CI on a dedicated VM):

- 30-minute sustained load: 100 admission/sec, 50 raw events/sec, 1 reservation/sec, 10 reconciler batches/min.
- Asserts: p95 admission stays <15ms; memory growth <50MB; no V8 heap fragmentation alerts.
- Fails build if regression vs prior soak baseline >10%.

**DST transition AC**:

- Synthetic `vi.useFakeTimers()` advance from 2026-03-08 01:30 CST → 03:00 CDT (US DST start) and 2026-11-01 02:30 CDT → 01:00 CST (US DST end).
- Calendar window with `tz='America/Chicago'`: verify policy boundaries shift correctly at DST.
- Recurring degraded window (e.g., daily 22:00-05:00 CDT): verify the window expands correctly across DST transition (longer window in fall, shorter in spring).
- UTC-based scopes (Aegis emergency reserve): verify NOT affected by DST (UTC midnight is stable).

**Concurrent operator edit AC**:

- Two operators POST `/api/resource-policies/123` PUT simultaneously with different bodies.
- Use `If-Match: <etag>` ETag-based optimistic concurrency. Each policy row carries `version INTEGER`. PUT must include `If-Match: <current_version>`. Mismatch → `409 Conflict` with current state.
- Concurrent override grants for the same workspace: Q6 atomic transaction handles correctly (one succeeds, others get 409 InsufficientBudget).
- Concurrent operator promotes policy to hard while Aegis emergency reserve refills: serializes via `BEGIN IMMEDIATE`; no race condition possible.

### Q47 — Raw ingest admission control + emergency circuit (NEW — round-4 oracle finding #1)

**Decision:** **Every raw event ingest path enforces per-source and per-account rate limits + disk-free guardrails. A buggy adapter or adversarial process cannot fill SQLite or saturate I/O.**

```sql
CREATE TABLE ingest_rate_state (
  source_path TEXT PRIMARY KEY,
  events_in_window INTEGER NOT NULL DEFAULT 0,
  window_start_ms INTEGER NOT NULL,
  consecutive_drops INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'accepting',         -- 'accepting'|'rate_limited'|'circuit_open'|'disk_full_pause'
  state_changed_at INTEGER NOT NULL
);

CREATE TABLE quarantined_raw_events (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  source_path TEXT NOT NULL,
  reason TEXT NOT NULL,                            -- 'rate_limit'|'disk_full'|'schema_malicious'|'oversized'
  payload_bytes INTEGER NOT NULL,
  payload_excerpt TEXT,                            -- first 1KB of rejected payload for debugging
  rejected_at INTEGER NOT NULL
);
CREATE INDEX idx_quarantine_recent ON quarantined_raw_events(rejected_at DESC);
```

**Per-source rate limits** (token-bucket pattern):

| Source | Steady-state limit | Burst limit |
|---|---|---|
| `native_otel` (per `provider_account_id`) | 1000 events/min | 5000 events/30s |
| `cli_stdout_json` (per process) | 500 events/min | 2000 events/30s |
| `gateway_otel` | 5000 events/min | 20000 events/30s |
| `transcript_replay` | 2000 events/min | 10000 events/30s |
| `manual_post` | 100 events/min | 500 events/30s |
| `provider_quota` | 60 events/hour | 600 events/hour |

**Ingest admission flow** (before INSERT to `raw_usage_events`):

1. Lookup `ingest_rate_state` for `source_path`. If `state != 'accepting'`, drop event → quarantine.
2. Token bucket check: if rate exceeded, increment `consecutive_drops`. If `consecutive_drops > 100`, transition `state='rate_limited'` for 5min cooldown. Quarantine the event with `reason='rate_limit'`.
3. Disk-free check (cached 60s): if free space <1GB, transition all sources to `disk_full_pause`. Operator alert critical.
4. Payload size check: if `JSON.stringify(payload).length > 100KB`, quarantine with `reason='oversized'`.
5. If all checks pass: INSERT raw event + atomic freshness update.

**Recovery from `circuit_open`**: scheduler tick (60s) checks each source's drop rate; if drops <10/min for 5min, transitions back to `accepting`. Operator can force-resume via `POST /api/governance/ingest/<source_path>/resume`.

### Q48 — Local health channel independent of OTel (NEW — round-4 oracle finding #4)

**Decision:** **Paddock writes its own health events directly to SQLite at `governance_health_events`; UI reads from DB; the OTel collector is observable EVEN WHEN it's down because the local channel doesn't depend on it.**

```sql
CREATE TABLE governance_health_events (
  id INTEGER PRIMARY KEY,
  component TEXT NOT NULL,                         -- 'evaluator'|'reconciler'|'collector'|'breaker'|'ingest'|'aegis'
  state TEXT NOT NULL,                             -- 'healthy'|'degraded'|'failed'
  detail TEXT,                                     -- human-readable summary
  metric_json TEXT,                                -- structured metrics for dashboards
  detected_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX idx_health_active ON governance_health_events(component, detected_at DESC) WHERE resolved_at IS NULL;
```

**Health check writers** (run via dedicated 30s scheduler tick on the `getBackgroundDb()` connection):

```ts
// Collector liveness — does NOT use OTel; checks last_ingest_at directly
const collectorHealth = checkCollectorLiveness();  // GET /health on otelcol-contrib + check last raw_otel_events ingest
if (!collectorHealth.alive && lastKnown !== 'failed') {
  insertHealthEvent('collector', 'failed', `No /health response for ${minutes}m; last ingest ${ago}m ago`);
}

// Evaluator health
const recentBreakerOpens = countBreakerTransitionsInWindow('open', 5 * 60_000);
if (recentBreakerOpens > 3) insertHealthEvent('evaluator', 'degraded', '...');

// Ingest backlog
const backlog = countPendingRawEvents();
if (backlog > 10_000) insertHealthEvent('ingest', 'degraded', `Ingest backlog: ${backlog}`);
```

**Operator UI** (`/api/governance/health` route + Cost Tracker → Governance tab → "System Health" section):

- Shows ALL active health events (resolved_at IS NULL) grouped by component
- Each row: component, state, detail, detected ago, [Acknowledge] / [Resolve] buttons
- Persistent banner at top of UI when ANY component is `failed` or 3+ are `degraded`
- Stderr/journal logging mirrors all health events — operator can `journalctl -u paddock.service` to see them WITHOUT the UI

**Critical property**: this health channel uses ONLY SQLite + Node stderr. It works even when:
- OTel collector is down
- Network is partitioned
- The governance UI itself is broken (operator sees journal logs)
- Other monitoring infra is down

### Q49 — Async chunked counter rebuild job (NEW — round-4 oracle finding #5)

**Decision:** **Manual rebuild is NEVER synchronous. Operator request creates a `governance_rebuild_jobs` row; a background worker processes it in chunks; UI polls the job status.**

```sql
CREATE TABLE governance_rebuild_jobs (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  window_kind TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued',            -- 'queued'|'running'|'blocked_busy'|'failed'|'complete'
  reason TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  ledger_chunks_processed INTEGER NOT NULL DEFAULT 0,
  total_chunks INTEGER,
  error TEXT
);
CREATE INDEX idx_rebuild_queued ON governance_rebuild_jobs(state) WHERE state = 'queued';
```

**Worker** (runs every 30s on audit connection):

1. Claim oldest queued job atomically (UPDATE WHERE state='queued' RETURNING id).
2. Compute total ledger chunks for the scope (e.g., 1000 ledger rows per chunk; total 10 chunks for 10K rows).
3. For each chunk: read on audit connection (busy_timeout=30s), accumulate into running totals.
4. Between chunks: yield to event loop; check foreground `governance_admission_p95_ms` metric; if degraded, pause until restored.
5. After all chunks processed: write final counter UPDATE in single transaction; mark job `complete`.

**Affected scope's enforcement** during rebuild:

- Counter row carries `pending_rebuild_job_id`. While set, that scope's enforcement transitions to `shadow_due_to_counter_rebuild` (admission returns `allow` with reason).
- Other scopes unaffected.

**UI**: rebuild progress shown as `chunks_processed / total_chunks` with ETA. Operator can cancel (sets state=`failed`).

### Q50 — Counter UPDATE pattern: split reservation/release/consumption (NEW — round-4 oracle finding #2)

**Decision:** **Three separate atomic UPDATE patterns; never use signed `amount` with one query for both reservation and release.**

```sql
-- Reservation (positive amount only):
UPDATE resource_budget_counters
SET reserved_cost_usd = reserved_cost_usd + :amount,
    updated_at = :now
WHERE id = :counter_id
  AND consumed_cost_usd + reserved_cost_usd + :amount <= :limit;

-- Release (positive release_amount; reduces reserved):
UPDATE resource_budget_counters
SET reserved_cost_usd = reserved_cost_usd - :release_amount,
    updated_at = :now
WHERE id = :counter_id
  AND reserved_cost_usd >= :release_amount;

-- Consumption (positive amounts; converts reservation to consumption):
UPDATE resource_budget_counters
SET reserved_cost_usd = reserved_cost_usd - :reserved_amount,
    consumed_cost_usd = consumed_cost_usd + :actual_amount,
    updated_at = :now
WHERE id = :counter_id
  AND reserved_cost_usd >= :reserved_amount;
```

Each path checks `result.changes === 1`; failure means either counter not found OR pre-condition violated (over-release, over-reserve). Reservation IDs track remaining releasable amount per `resource_overrides.id`. Anonymous negative ledger entries are FORBIDDEN by Zod validation at the API boundary.

### Q51 — Time-bucket partitioning for raw_usage_events retention (NEW — round-4 oracle finding #3)

**Decision:** **Partition `raw_usage_events` by month using monthly attached SQLite databases; whole-partition drop is O(1); the 10K-row sweep model is rejected as untenable.**

**Approach**: store recent (current + last 2 months) raw events in the main `mc.db` file's `raw_usage_events` table. Older events are migrated to monthly archive files at `<PADDOCK_DATA_DIR>/archives/raw-events-<YYYY-MM>.db`. Each archive file is structurally identical (same schema, attached via `ATTACH DATABASE`). Reconciliation worker reads across both via `UNION ALL`.

```ts
// scripts/raw-events-monthly-rollover.ts (runs first day of each month, low traffic UTC)
const oldMonth = priorMonth();
const archivePath = `${dataDir}/archives/raw-events-${oldMonth}.db`;
// Create new archive DB, attach, INSERT INTO archive SELECT FROM main WHERE observed_at < cutoff
// Then DELETE FROM main WHERE observed_at < cutoff
// Both in single transaction
```

**Retention enforcement at archive level**: archives older than 90 days (default) → renamed to `<archive>.expired-<YYYY-MM-DD>.db` and after 7-day grace period → deleted. Operator can configure retention up to 5 years per workspace (via `provider_entitlements.retention_days`).

**Acceptance criteria**:

- AC-Retention-1: Insert 50M rows simulating 90 days; verify monthly rollover produces a 50M-row archive file. Verify main `raw_usage_events` is empty for the rolled-over month.
- AC-Retention-2: Verify reconciler queries spanning archive + main return correct results via `UNION ALL`.
- AC-Retention-3: Verify whole-partition drop completes in <1 second for any size archive.

`canonical_usage_events` and `resource_budget_ledger` are NOT partitioned in v1 — they grow much slower (post-dedup canonical, post-coalesce ledger). Re-evaluate at v2 if growth exceeds projections.

### Q52 — Codex timestamp join verified-or-downgraded (NEW — round-4 oracle finding #6)

**Decision:** **The Q39 Codex high-confidence join is contingent on a Plan-phase verification spike. If Codex stdout and rollout do NOT share identical `provider_timestamp_ms`, the join falls back to medium-confidence with EXACT token match still required.**

Plan-phase spike script (`scripts/verify-codex-timestamp-parity.ts`):

```ts
// Run codex exec --json with stdout captured
// Parse rollout JSONL for the same session
// For each turn, compare:
//   stdout: turn.completed.at
//   rollout: event_msg.payload.timestamp where payload.type='token_count'
// Assert exact match (or document the divergence)
```

If verified identical: Q39 stays as written.

If divergent: Q39 amended to:

```ts
// Codex medium-confidence join (replaces high-confidence claim):
if (a.cli === 'codex' && b.cli === 'codex' &&
    a.session_id === b.session_id &&
    Math.abs(a.provider_timestamp_ms - b.provider_timestamp_ms) < 100 &&  // 100ms tolerance
    a.input_tokens === b.input_tokens &&
    a.output_tokens === b.output_tokens) {
  return { confidence: 'medium', dedupe_reason: 'codex_session_close_timestamp_token_match' };
}
```

This still works — exact token match remains the strong signal — but operator must accept that Codex correlations are "high-medium" rather than "high".

### Q53 — Aegis soft alert: actionable runbook + escalation (REVISED — round-4 oracle finding #7)

**Decision:** **`soft` enforcement on Aegis emergency reserve has explicit escalation; ambiguity removed.**

When Aegis emergency reserve consumed crosses 80% threshold ($4 of $5):

1. **Immediate** (0min): activity row + operator notification with content:
   ```
   ⚠️ Aegis Emergency Reserve at 80%
   Workspace: facility
   Consumed: $4.20 of $5.00 daily ($0.80 remaining)
   Projected exhaustion at current burn rate: ~2h
   Affected: Aegis dispatches in workspace `facility`
   Actions:
     [Increase reserve] — opens settings, edits aegis_emergency_reserve to higher daily limit
     [Force local-only mode] — Aegis falls back to LM Studio immediately
     [Pause Aegis] — Aegis dispatches block until manually resumed
     [Acknowledge — continue at risk] — alert silenced for 1h; system continues until 100%
   Runbook: docs/runbook/aegis-soft-exhaustion.md
   ```

2. **At 100% (hard exhaustion)**: Aegis automatically falls back to local-only mode (Q20 Mechanism 2). Notification "Aegis Emergency Reserve EXHAUSTED — local-only mode active" fires. THIS IS HARD enforcement at the soft layer — clearly labeled.

3. **If LM Studio unavailable at hard exhaustion**: Aegis enters `deferred_no_fallback`; critical operator alert.

4. **At UTC midnight reset**: reserve refills; system returns to normal mode; "Aegis Emergency Reserve refilled" info notification.

This makes the Q42 "soft" labeling honest: alerts are advisory; automatic fallback is real but signaled.

### Q54 — Dispatch diagnostic UI + activity feed (REVISED — round-4 oracle finding #8)

**Decision:** **Q44 diagnostic view extended with paginated dispatch activity feed and indexed lookup.**

```sql
-- New table to store dispatch decisions for the diagnostic UI
CREATE TABLE governance_dispatch_log (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  task_id INTEGER,
  agent_id INTEGER,
  decision TEXT NOT NULL,                          -- 'allow'|'defer'|'block'|'override_required'
  decision_reason TEXT,
  policy_id INTEGER,
  scope_kind TEXT,
  scope_id TEXT,
  contributing_context_json TEXT NOT NULL,         -- snapshot of counter values, breaker state, etc.
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_dispatch_log_workspace_recent ON governance_dispatch_log(workspace_id, created_at DESC);
CREATE INDEX idx_dispatch_log_task ON governance_dispatch_log(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_dispatch_log_decision_recent ON governance_dispatch_log(decision, created_at DESC);
```

UI features:
- Recent dispatches feed: paginated by `created_at DESC`, default 50 per page, infinite scroll.
- Filters: workspace, decision (default: `defer`/`block` first), agent, policy, time range.
- Search by `task_id`, `dispatch_id`, `agent_id`.
- Default view: latest 20 non-`allow` decisions across all workspaces.
- Deep-link from task activity panel: "Why was this task deferred?" → opens diagnostic view for that task's dispatch decisions.
- Retention: `governance_dispatch_log` retained 30 days (Q43 retention sweep).

### Q55 — Soak test infrastructure (REVISED — round-4 oracle finding #9)

**Decision:** **Soak test runs on a self-hosted GitHub runner that mirrors the operator node's CPU class; correctness soak runs in CI; performance certification only on operator-node-class.**

Two-tier test split:

| Test | Where | Frequency | Asserts |
|---|---|---|---|
| Correctness soak | GitHub Actions standard runner | On every PR | No memory leaks; functional behavior unchanged under sustained load |
| Performance certification | Self-hosted runner with Ryzen-class CPU + NVMe | Nightly cron + on release | p50<5ms, p95<15ms, p99<25ms admission; all KPIs from Q11 benchmark |

Self-hosted runner spec (operator-provisioned):
- CPU: Ryzen 5/7 5xxx/7xxx series (8C+ recommended; mirrors the operator node)
- RAM: 32GB minimum
- Disk: NVMe SSD with ≥100GB free
- OS: Ubuntu 24.04
- Tagged `mc-perf-runner` in repo workflow `runs-on`

Documented in `docs/observability/perf-runner-setup.md` so any operator can stand one up. CI workflow file uses fallback: if `mc-perf-runner` unavailable, performance test is `skipped` and a warning posted to PR — does NOT block merge but flags a regression risk.

### Q56 — Bulk policy promotion workflow (REVISED — round-4 oracle finding #10)

**Decision:** **Operator can promote N policies at once via filtered selection; typed confirmation required; audit row per promoted policy.**

UI flow:
1. Cost Tracker → Governance tab → Policies sub-section.
2. Filter: `enforce_mode='shadow' AND calibration_complete=true`.
3. Multi-select checkboxes per row.
4. "Promote selected to soft" button → confirmation modal showing:
   - List of policies being promoted
   - Calibration data per policy (p50/p95/p99 drift, sample count)
   - Typed confirmation field: operator types "PROMOTE TO SOFT" exactly
5. On confirm: `POST /api/resource-policies/bulk-promote` with array of policy IDs + target mode + typed confirmation; transaction updates all policies and writes audit rows.

`Promote selected to hard` requires same flow + additional check: each selected policy has been in `soft` for ≥7 days with ≥3 alerts triggered (Q33 criteria).

### Q57 — M64 dependency-ordered migration (REVISED — round-4 oracle finding #11)

**Decision:** **M64 sub-migrations explicitly ordered with documented dependencies + `PRAGMA foreign_key_check` at end.**

Migration order (M64a..M64m, 13 sub-migrations after Q47-Q56 additions):

| Step | Table | Depends on |
|---|---|---|
| M64a | `provider_accounts` | none |
| M64b | `provider_entitlements` | M64a (FK) |
| M64c | `resource_budget_counters` | M64a (FK), `workspaces` (existing) |
| M64d | `resource_overrides` | M64a (FK), `workspaces` (existing) |
| M64e | `resource_budget_ledger` | M64d (FK reservation_id), M64a (FK) |
| M64f | `raw_usage_events` | M64a (FK) |
| M64g | `canonical_usage_events` | M64a (FK) |
| M64h | `canonical_usage_sources` | M64g (FK), M64f (FK) |
| M64i | `usage_snapshots` | none |
| M64j | `telemetry_source_freshness` | M64a (FK nullable) |
| M64k | `resource_governance_breaker` | none |
| M64l | `canonical_budget_effects` | M64g (FK), M64a (FK) |
| M64m | `telemetry_backfill_windows`, `reconciliation_batches`, `governance_counter_rebuild_log`, `drift_verification_state`, `ingest_rate_state`, `quarantined_raw_events`, `governance_health_events`, `governance_rebuild_jobs`, `governance_dispatch_log` | various; all flat or self-contained |

Migration runner:
1. Each sub-migration in its own `db.transaction(() => {...}).immediate()`.
2. Idempotent `CREATE TABLE IF NOT EXISTS`.
3. After M64m: run `PRAGMA foreign_key_check;` — if any violations, transaction aborts and migration fails.
4. Each sub-migration logs to `migrations_log` table with state (`started`, `completed`, `failed`).

**Rollback**: `docs/migrations/rollback-M64a.sql` ... `rollback-M64m.sql` each only DROP what their corresponding migration created.

### Q58 — Stratified drift sampling + minimum cadence (REVISED — round-4 oracle finding #13)

**Decision:** **Q36 random sampling replaced with stratified sampling: every active counter is verified at least once per 30 days; recently-changed counters get higher priority.**

```ts
// Sampling strategy in drift verification job:
const sample = db.prepare(`
  SELECT * FROM resource_budget_counters
  WHERE workspace_id IN (SELECT id FROM workspaces WHERE active=1)
  ORDER BY
    CASE WHEN last_verified_at IS NULL THEN 0 ELSE 1 END,    -- never-verified first
    last_verified_at ASC,                                     -- oldest first
    updated_at DESC                                           -- recent activity tiebreaker
  LIMIT 50
`).all();
```

ALTER:
```sql
ALTER TABLE resource_budget_counters ADD COLUMN last_verified_at INTEGER;
```

Update on each verification: `UPDATE resource_budget_counters SET last_verified_at = ? WHERE id = ?`. Guarantees full coverage in ~6h (50/h × 24h = 1200 verifications/day; even with 10K active counters, every counter checked weekly minimum).

### Q59 — Hard enforcement disablement escalation (REVISED — round-4 oracle finding #14)

**Decision:** **Q37 escalation extended; never silently disabled forever; operator vacation scenario explicitly handled.**

| Time | Action |
|---|---|
| 0h | Source stale warning + activity row |
| 1h | Dashboard banner |
| 6h | Repeat alert (escalation 1) |
| 24h | Hard enforcement disabled for affected `(provider_account_id, source_path)` ONLY; `state='enforcement_disabled_pending_operator'` + critical notification |
| 48h | High-severity alert via journal + UI banner ("HARD ENFORCEMENT DISABLED for X days") |
| 7d | Auto-enter `conservative_manual_cap` mode: hard enforcement RESUMES using `provider_entitlements.quota_limit_*` operator-configured values (or 0 if unset = block all by default for that source/account) |
| Always visible | UI shows "Enforcement disabled for X days; auto-resume at 7d in <safe mode>" prominently |

The 7d auto-resume to conservative mode prevents indefinite silent abandonment. Operator on vacation returns to find the system protecting itself rather than running unbounded.

### Q60 — Backup, restore, and DR procedure (NEW — peer #2 P0 #1)

**Decision:** **Daily SQLite backup via `sqlite3 .backup` (NOT `cp` — handles WAL correctly), automated restore-validation procedure, and explicit RTO/RPO commitments.**

**Backup procedure**:

```bash
# scripts/backup-mc-db.sh (runs from cron daily, configurable; default 03:00 UTC)
DEST="${PADDOCK_BACKUP_DIR:-/var/backups/paddock}/mc-$(date -u +%Y%m%d-%H%M%S).db"
mkdir -p "$(dirname "$DEST")"
sqlite3 "${PADDOCK_DATA_DIR}/paddock.db" ".backup '$DEST'"
gzip "$DEST"
# Retain 30 daily, 12 monthly, 5 yearly (operator-tunable)
# Mirror to off-node storage if MC_BACKUP_REMOTE_RSYNC_PATH set
```

`sqlite3 .backup` properly checkpoints WAL before snapshot — `cp` of the .db file alone is corrupt-prone if writers are active.

**Backup includes**:
- `paddock.db` (the main file)
- `archives/raw-events-*.db` (Q51 monthly archives)

**Backup excludes**:
- `paddock.db-wal` and `paddock.db-shm` — these are checkpointed into the main file by `.backup` command

**Restore procedure** (`docs/runbook/disaster-recovery.md`):

1. Stop `paddock.service` (`systemctl --user stop paddock.service`).
2. Move existing `paddock.db` to `paddock.db.broken` (do not delete; for forensic if needed).
3. Decompress backup: `gunzip -c <backup>.gz > paddock.db`.
4. Verify integrity: `sqlite3 paddock.db "PRAGMA integrity_check;"` → must return `ok`.
5. Start `paddock.service`.
6. **Post-restore counter rebuild**: governance enters `recovering_from_backup` state automatically (detected by checking `(now - max(updated_at) from resource_budget_counters) > 60s`). Triggers full counter rebuild via Q49 async job.
7. **In-flight reservations** (`state='active'` rows in `resource_overrides` from before backup): these are preserved by the backup; if their `expires_at` has now passed (because backup is hours/days old), the next scheduler tick auto-expires them.
8. **Telemetry gap**: any events ingested AFTER the backup snapshot are lost; operator can replay from filestorage WAL of `otelcol-contrib` (per Q31 backfill protocol).

**RTO / RPO commitments**:

| Metric | Commitment | Notes |
|---|---|---|
| RPO (Recovery Point Objective) | 24h max data loss | Daily backup cadence; operator can configure hourly for tighter RPO |
| RTO (Recovery Time Objective) | <30 minutes for restore + counter rebuild | Includes integrity check + service restart + post-restore rebuild |
| Backup verification | Weekly automated restore to a temp directory, integrity check, compare row counts to source | Detects backup corruption before disaster |

**Acceptance criteria**:

- AC-DR-1: simulate disk failure (`rm paddock.db`); verify restore procedure produces functional MC within RTO.
- AC-DR-2: simulate backup corruption; verify weekly verification detects it; verify operator notified.
- AC-DR-3: post-restore: verify counters reconciled correctly via Q49 rebuild; verify in-flight reservations handled correctly.
- AC-DR-4: SQLite file >5GB: verify backup completes in <5min on operator-node-class hardware.

### Q61 — Per-failure-mode runbook deliverables (NEW — peer #2 P0 #2)

**Decision:** **Each documented failure mode has a corresponding runbook page; runbook pages are part of the v1 deliverable.**

| Failure mode | Runbook | Operator action checklist |
|---|---|---|
| Collector down | `docs/runbook/collector-failure.md` | Check journal logs; restart service; verify backfill protocol; check filestorage WAL not corrupted |
| Breaker open | `docs/runbook/breaker-open.md` | Identify component; review last_error; investigate root cause; manual close via API; bug-file if recurring |
| `schema_broken` | `docs/runbook/schema-broken.md` | Check Copilot version; review parser fixture; downgrade or update parser; manually configure quota until resolved |
| `schema_malicious` | `docs/runbook/schema-malicious.md` | CRITICAL — review quarantined events; investigate source; rotate credentials if compromise suspected; do NOT re-enable until verified |
| `drift_detected` | `docs/runbook/drift-detected.md` | Review drift magnitude; check recent backfill or migration; run manual rebuild if confirmed real drift |
| `aegis_no_fallback` | `docs/runbook/aegis-no-fallback.md` | Install LM Studio OR increase emergency reserve OR use break-glass override |
| `backfill_failed` | `docs/runbook/backfill-failed.md` | Review error in `telemetry_backfill_windows.last_error`; manual retry OR mark window failed and accept data loss |
| `enforcement_disabled_pending_operator` | `docs/runbook/enforcement-disabled.md` | Review why source went stale; restore source or accept conservative cap mode |
| `governance_counter_drift` | `docs/runbook/counter-drift.md` | See `drift_detected` |
| `governance_replay_detected` | `docs/runbook/replay-detected.md` | Review replay payload; investigate source; rotate auth tokens if external |

Each runbook page includes:
- Symptom (what UI/log shows)
- Severity (info / warning / critical)
- Likely causes (numbered)
- Diagnostic commands (CLI / API)
- Recovery steps (numbered, copy-pastable)
- Verification steps
- Escalation criteria

Runbooks are TESTED: a chaos test simulates each failure mode and verifies the runbook procedure restores normal operation.

### Q62 — Workspace Governance Health dashboard (NEW — peer #2 P0 #3)

**Decision:** **Cost Tracker → Governance tab → 7th sub-section: "System Health" — single screen showing ALL degraded paths with one-click recovery affordances.**

UI layout:

```
SYSTEM HEALTH (workspace: facility)

╭────────────────────────────────────────────────────────────╮
│ 🟢 Evaluator             healthy        p95 8ms           │
│ 🟢 Reconciler            healthy        backlog 12 events │
│ 🟡 Collector             degraded       last ingest 4m ago │ [Investigate] [Restart] [View logs]
│ 🟢 Ingest                healthy        rate 45 events/min │
│ 🟢 Aegis Reserve         healthy        $1.20 of $5.00    │
│ 🟢 Circuit Breaker       closed         no recent opens    │
│ 🟢 Drift Detection       healthy        last verified 22m  │
╰────────────────────────────────────────────────────────────╯

ACTIVE INCIDENTS

🟡 Collector source `native_otel:claude_code:claude_max_20x_personal` stale 4m ago
   Threshold: 60s. Affected enforcement: hard policies on workspace `facility` for Claude Code.
   Current state: shadow_due_to_stale_telemetry
   [View runbook] [Restart collector] [Mark acknowledged] [Force resume hard enforcement]

[ no other active incidents ]

POLICIES IN SHADOW

  wip_workspace_facility (calibrating, day 3 of 7)        [View calibration] [Promote when ready]
  daily_usd_facility_25 (calibrating, day 3 of 7)        [View calibration]
  ... (5 more)
```

REST: `GET /api/governance/system-health?workspace_id=X` returns the same JSON for programmatic access.

**One-click recovery affordances** per incident type:

| Incident | Affordance | Backend action |
|---|---|---|
| Collector down | [Restart collector] | `systemctl --user restart otelcol-contrib.service` via authenticated proxy endpoint |
| Source stale | [Force resume hard enforcement] | Updates `telemetry_source_freshness.state='fresh'` (operator override) |
| Breaker open | [Manually close] | UPDATE `resource_governance_breaker.state='closed'` |
| Aegis exhausted | [Top up reserve] [Force local mode] [Pause Aegis] | Per Q53 actions |
| Schema broken | [View parser logs] [Update parser] | Opens log viewer / triggers parser update |
| Drift detected | [Run rebuild] | Triggers Q49 async rebuild job |

### Q63 — Retention sweep default-ON (REVISED — peer #2 P1 #1)

**Decision:** **Retention sweep is ENABLED BY DEFAULT on first MC startup after SPEC-008 lands; operator must explicitly opt-out via config.**

Default config (in `PADDOCK_DATA_DIR/.config/governance.json`, auto-created on first run):

```json
{
  "retention": {
    "enabled": true,
    "raw_events_days": 90,
    "canonical_events_days": 365,
    "policy_events_days": 365,
    "dispatch_log_days": 30,
    "audit_log_days": 1825,
    "rollover_window": "Sunday 04:00 UTC"
  }
}
```

Disabling requires explicit operator action: `governance.json.retention.enabled=false` AND a banner appears in UI: "⚠️ Retention disabled — DB will grow unbounded. Re-enable in settings or expect storage exhaustion within 6 months."

### Q64 — `provider_accounts` soft-delete + ON DELETE semantics (REVISED — peer #2 P1 #2)

**Decision:** **`provider_accounts` rows are soft-deleted (`deleted_at` timestamp); FOREIGN KEYs use `ON DELETE NO ACTION` (DB rejects hard delete if referenced).**

```sql
ALTER TABLE provider_accounts ADD COLUMN deleted_at INTEGER;
CREATE INDEX idx_accounts_active ON provider_accounts(workspace_id, provider) WHERE deleted_at IS NULL;
-- FK definitions on canonical_usage_events, resource_overrides, resource_budget_ledger, etc:
-- FOREIGN KEY (provider_account_id) REFERENCES provider_accounts(id) ON DELETE NO ACTION
```

Operator UI: clicking "delete provider account" triggers soft-delete (`UPDATE provider_accounts SET deleted_at=NOW() WHERE id=?`). Active queries filter `WHERE deleted_at IS NULL`. Historical canonical_usage_events / ledger entries retain reference to the soft-deleted row for audit. UI shows "deleted" badge.

Hard delete only via direct SQL (operator footgun). The `ON DELETE NO ACTION` ensures even direct SQL DELETE is rejected if FKs reference the row.

### Q65 — Hard policy threshold sanity guardrails (REVISED — peer #2 P1 #3)

**Decision:** **`POST /api/resource-policies` rejects threshold values that would cause obvious misconfiguration; operator must use `force=true` flag to override.**

Rejection rules:

| Field | Rejection condition | Message |
|---|---|---|
| `threshold` for USD/tokens/requests | `threshold == 0` | "Threshold of 0 blocks ALL dispatches; use force=true to confirm" |
| `threshold` for WIP | `threshold < 1` | "WIP threshold of 0 prevents any work; use force=true to confirm" |
| `enforce_mode='hard'` | First promotion to hard with `threshold == 0` | "Promoting to hard with threshold 0 will halt all work; use force=true" |
| `expires_at` | `expires_at - granted_at > 24*3600*1000` | "Override duration exceeds 24h max" |
| `reserved_estimated_cost_usd` | `> 0.5 × workspace_daily_budget_usd` | "Reservation exceeds 50% of daily budget; use force=true to confirm" |

`force=true` parameter required AND audit row tagged `forced=true` for these cases. Operator UI shows confirmation modal.

### Q66 — Breaker restart_count alert + reservation reaper (REVISED — peer #2 P1 #4 + #5)

**Decision:** **Breaker `restart_count > 10` fires `governance_breaker_chronic` alert. Reservation reaper runs every minute on background connection.**

```sql
-- Breaker chronic detection runs in 60s scheduler tick:
SELECT * FROM resource_governance_breaker
WHERE state = 'open' AND restart_count > 10;
-- For each row, fire `governance_breaker_chronic` activity (deduplicated per breaker_id per day)
```

Reservation reaper (every 60s, background connection):

```sql
-- Mark expired reservations
UPDATE resource_overrides
SET state = 'expired',
    released_at = unixepoch()*1000
WHERE state = 'active'
  AND expires_at < unixepoch()*1000;

-- For each newly-expired, decrement counter via Q50 release pattern + insert ledger release entry
```

Backfill window also has `max_duration_seconds`:

```sql
ALTER TABLE telemetry_backfill_windows ADD COLUMN max_duration_seconds INTEGER NOT NULL DEFAULT 86400;  -- 24h max
-- If running > max_duration_seconds, transition to 'failed' + critical alert
```

### Q67 — PII / prompt-content redaction layer (NEW — peer #3 P0 #1)

**Decision:** **Default-deny attribute allowlist on all ingested payloads; explicit `governance_capture_content` opt-in flag per workspace; `payload_excerpt` quarantine field replaced with structured metadata; journal mirroring redacted.**

The peer reviewer correctly identified that `raw_attributes_json` (Q18), `quarantined_raw_events.payload_excerpt` (Q47), and journal/stderr health logging (Q48) all could leak prompt content, response text, tool inputs, and tool outputs to operator-visible surfaces and downstream log shippers. Particularly when `OTEL_LOG_USER_PROMPTS=1` is set on the Claude Code spawn env (per Anthropic's docs), the OTel logs include `prompt` field verbatim.

**Default-deny allowlist** in `src/lib/observability/attribute-allowlist.ts`:

```ts
const SAFE_ATTRIBUTE_KEYS = new Set<string>([
  // OTel GenAI semconv (numeric/identifier only)
  'gen_ai.system', 'gen_ai.provider.name', 'gen_ai.operation.name',
  'gen_ai.request.model', 'gen_ai.response.model', 'gen_ai.response.id',
  'gen_ai.response.finish_reasons',
  'gen_ai.usage.input_tokens', 'gen_ai.usage.output_tokens',
  'gen_ai.usage.cache_creation.input_tokens', 'gen_ai.usage.cache_read.input_tokens',
  'gen_ai.usage.reasoning.output_tokens',
  // Claude Code namespace (identifiers + counts only)
  'session.id', 'prompt.id', 'request_id', 'event.sequence',
  'duration_ms', 'cache_read_tokens', 'cache_creation_tokens',
  'input_tokens', 'output_tokens', 'cost_usd',
  'model', 'speed', 'effort', 'query_source',
  'tool_name', 'tool_use_id', 'success', 'error_type',
  // OpenClaw + service identifiers
  'service.name', 'service.version', 'os.type', 'os.version', 'host.arch',
  'openclaw.tokens', 'openclaw.cost.usd', 'openclaw.run.duration_ms',
  'openclaw.context.tokens', 'openclaw.provider', 'openclaw.model',
  'openclaw.channel', 'openclaw.agent',
  // Codex namespace
  'codex.api_request', 'codex.tool_call', 'codex.tool_result',
  'auth.env_openai_api_key_present',  // boolean only
  // MC custom
  'mc.billing.mode', 'mc.billing.subscription', 'mc.billing.provider',
  'mc.workspace_id', 'mc.task_id', 'mc.agent_id',
]);

const FORBIDDEN_PATTERNS = [
  /^claude_code\.api_(request|response)_body$/,    // raw bodies
  /\bprompt\b/i, /\bcompletion\b/i, /\bmessage\b/i, /\bcontent\b/i,
  /\bquery\b/i, /\binstructions?\b/i, /\bsystem.prompt\b/i,
  /\btool.input(s)?\b/i, /\btool.output(s)?\b/i,
];

export function sanitizeAttributes(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (SAFE_ATTRIBUTE_KEYS.has(k)) { out[k] = v; continue; }
    if (FORBIDDEN_PATTERNS.some(re => re.test(k))) continue;  // drop
    // Unknown keys: keep ONLY if value is numeric/boolean/short-string-id
    if (typeof v === 'number' || typeof v === 'boolean') { out[k] = v; continue; }
    if (typeof v === 'string' && v.length <= 64 && /^[a-zA-Z0-9_:.\-]+$/.test(v)) { out[k] = v; continue; }
    // Drop everything else by default
  }
  return out;
}
```

All ingestion adapters MUST run `sanitizeAttributes()` before writing `raw_attributes_json`. Adapter unit tests assert sanitization is applied.

**`governance_capture_content` opt-in flag** (per workspace):

```sql
ALTER TABLE workspaces ADD COLUMN governance_capture_content_json TEXT NOT NULL DEFAULT '{}';
-- Schema for governance_capture_content_json:
-- {
--   "input_messages": false,
--   "output_messages": false,
--   "tool_inputs": false,
--   "tool_outputs": false,
--   "system_prompt": false
-- }
```

When operator sets any to `true`: ALSO requires UI confirmation modal with explicit warning ("This will capture prompt/response text into Paddock's database. Captured content is visible to anyone with operator access. Confirm by typing 'CAPTURE CONTENT'."). Audit row written. Operator can disable any time; future ingested events go back to redacted.

When ANY capture flag is true, the captured fields go into a SEPARATE table:

```sql
CREATE TABLE governance_captured_content (
  id INTEGER PRIMARY KEY,
  raw_event_id INTEGER NOT NULL REFERENCES raw_usage_events(id),
  content_kind TEXT NOT NULL,                      -- 'input_messages'|'output_messages'|'tool_inputs'|'tool_outputs'|'system_prompt'
  content_text TEXT NOT NULL,
  captured_at INTEGER NOT NULL
);
CREATE INDEX idx_captured_raw ON governance_captured_content(raw_event_id);
```

This keeps captured content explicitly segregated from the lower-trust `raw_usage_events` table. Retention for `governance_captured_content`: 30 days default (operator-tunable; minimum 1 day).

**`quarantined_raw_events.payload_excerpt` replaced** with structured metadata:

```sql
ALTER TABLE quarantined_raw_events DROP COLUMN payload_excerpt;
ALTER TABLE quarantined_raw_events ADD COLUMN payload_metadata_json TEXT NOT NULL DEFAULT '{}';
-- Stores: {"size_bytes": 12345, "top_level_keys": ["foo","bar"], "type_signatures": {...}, "violation_field": "tokens.input", "violation_value_type": "string"}
-- Never the actual content
```

**Journal/stderr redaction**: `governance_health_events.detail` field stripped of any matching prompt patterns before mirroring to journal. `src/lib/logger.ts` patched to apply redaction in production mode.

**OTel collector config**: `diagnostics.otel.captureContent.*` MUST be `false` in the operator's `governance.json` unless workspace-level capture flag is explicitly enabled.

**Acceptance criteria**:
- AC-PII-1: Inject Claude Code OTel event with `prompt` and `claude_code.api_request_body` attributes; verify both stripped from `raw_usage_events.raw_attributes_json`.
- AC-PII-2: Operator enables `input_messages` capture; verify content goes to `governance_captured_content` only; verify `raw_usage_events.raw_attributes_json` still redacted.
- AC-PII-3: Quarantined event with prompt content; verify only structural metadata stored, not content.

### Q68 — REST authorization model + per-actor rate limits + CSRF (NEW — peer #3 P0 #2)

**Decision:** **Three actor classes with explicit auth-before-parsing order; per-actor token buckets; CSRF on cookie-based auth; override-anomaly detection.**

**Actor classes**:

| Class | Auth mechanism | Permissions |
|---|---|---|
| `operator` | Bearer token (HTTP `Authorization: Bearer <jwt>`) OR session cookie + CSRF token | Full CRUD on policies, overrides, accounts, entitlements; system health actions |
| `agent_aegis` | Service token (`Authorization: Bearer aegis-<workspace_id>-<token>`) bound to specific workspace_id | Grant overrides only on its own workspace; read-only otherwise |
| `viewer` | Read-only token | GET on /api/governance/system-health, /api/governance/diagnostic; no writes |

**Auth flow** (middleware in `src/lib/middleware/governance-auth.ts`):

```ts
// Order is critical: auth BEFORE Zod parsing BEFORE handler
export async function authMiddleware(req: NextRequest, requiredClass: ActorClass[]): Promise<AuthContext | NextResponse> {
  // Step 1: extract auth header / cookie
  const token = extractBearerToken(req) ?? extractSessionCookie(req);
  if (!token) return new NextResponse(null, { status: 401 });
  // Step 2: validate token signature + expiry (does NOT touch request body)
  const claim = await verifyToken(token);
  if (!claim) return new NextResponse(null, { status: 401 });
  // Step 3: check actor class authorization
  if (!requiredClass.includes(claim.actorClass)) return new NextResponse(null, { status: 403 });
  // Step 4: CSRF check on cookie auth + non-GET methods
  if (claim.authKind === 'session' && req.method !== 'GET') {
    const csrf = req.headers.get('X-CSRF-Token');
    if (csrf !== claim.csrfToken) return new NextResponse(null, { status: 403 });
  }
  // Step 5: per-actor rate limit
  const rateLimitDecision = checkActorRateLimit(claim.actorId, req.method, req.url);
  if (!rateLimitDecision.allowed) {
    return new NextResponse(JSON.stringify({error: 'rate_limit', retry_after_ms: rateLimitDecision.retryAfter}), {
      status: 429, headers: {'Retry-After': String(Math.ceil(rateLimitDecision.retryAfter/1000))}
    });
  }
  return claim;
}
```

**Per-actor rate limits** (token-bucket per actor_id, in-memory + 60s persistence to DB for cross-restart):

| Actor class | Rate limit |
|---|---|
| operator | 60 writes/min, 600 reads/min, 5 override grants/min, 100 override grants/day |
| agent_aegis | 30 override grants/min, 500 override grants/day |
| viewer | 0 writes, 600 reads/min |

**Override-anomaly detection**: scheduled tick (every 60s) on the audit connection:

```sql
SELECT granted_by_id, COUNT(*) AS grants
FROM resource_overrides
WHERE granted_at > unixepoch()*1000 - 600000  -- last 10 minutes
GROUP BY granted_by_id
HAVING grants > 20;
```

If any actor has granted >20 overrides in 10 minutes: emit `governance_override_anomaly_detected` activity + critical notification. Likely scenarios: compromised account, runaway script. Operator must investigate; auto-disable that actor's grant capability after 30 anomalies in 1h.

**CSRF token**: generated per-session, rotated every 30 days. Stored as part of session cookie; client must echo via `X-CSRF-Token` header on writes.

**Acceptance criteria**:
- AC-Auth-1: 5 different actor classes (valid operator, valid aegis, valid viewer, expired token, no token) hit POST /api/resource-overrides; only operator + aegis succeed; others get correct 401/403.
- AC-Auth-2: Cookie-auth POST without CSRF → 403; with valid CSRF → succeeds.
- AC-Auth-3: Operator hits rate limit → 429 with Retry-After; verifier behavior preserved.
- AC-Auth-4: Aegis token bound to workspace 1 attempts override on workspace 2 → 403.
- AC-Auth-5: 25 override grants in 10min from one operator → `governance_override_anomaly_detected` fires.

### Q69 — Audit-log tamper-evidence + retention chain integrity (NEW — peer #3 P0 #3)

**Decision:** **Hash-chain on `resource_budget_ledger` + canonical_audit_summary table to preserve drilldown across retention boundaries.**

**Hash chain on ledger**:

```sql
ALTER TABLE resource_budget_ledger ADD COLUMN prev_id INTEGER;
ALTER TABLE resource_budget_ledger ADD COLUMN row_hash TEXT;
CREATE INDEX idx_ledger_hash_chain ON resource_budget_ledger(prev_id);
```

On every ledger insert (inside the same admission/grant/release transaction):

```ts
const prevRow = db.prepare('SELECT id, row_hash FROM resource_budget_ledger ORDER BY id DESC LIMIT 1').get();
const rowContent = canonicalizeForHash({
  workspace_id, scope_kind, scope_id, provider_account_id, model,
  amount_tokens, amount_cost_usd, amount_requests, kind,
  source_event_id, source_kind, reason, created_at,
});
const rowHash = sha256(prevRow?.row_hash + '|' + rowContent);
insertLedger.run({...rowContent, prev_id: prevRow?.id ?? null, row_hash: rowHash});
```

**Chain-walk verification job** (runs on audit connection daily 04:30 UTC, low-priority):

```ts
// Walk hash chain from genesis (prev_id IS NULL) forward
// At each row, recompute row_hash and compare to stored row_hash
// First mismatch = tamper detected; emit governance_audit_tamper_detected critical alert
```

If verification detects tamper: critical operator alert. Operator investigates whether out-of-band SQL UPDATE/DELETE happened, or whether a bug in the chain logic exists.

**Retention chain integrity**: aligning canonical retention with ledger retention.

```sql
-- Q43 revised retention defaults:
{
  "retention": {
    "raw_events_days": 90,
    "canonical_events_days": 1825,           // CHANGED from 365 → 1825 to match ledger
    "policy_events_days": 1825,
    "dispatch_log_days": 30,
    "audit_log_days": 1825,                  // ledger
    "captured_content_days": 30
  }
}
```

This ensures every `resource_budget_ledger` row keeps its `canonical_event_id` reference resolvable for the full 5-year audit window. `canonical_usage_sources` and `raw_usage_events` are summarized into a denormalized audit table before being archived/dropped:

```sql
CREATE TABLE canonical_audit_summary (
  canonical_event_id INTEGER PRIMARY KEY REFERENCES canonical_usage_events(id),
  workspace_id INTEGER NOT NULL,
  provider_account_id INTEGER REFERENCES provider_accounts(id),
  cli TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  session_id TEXT,
  request_id TEXT,
  prompt_id TEXT,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_creation_tokens INTEGER NOT NULL,
  reasoning_output_tokens INTEGER NOT NULL,
  estimated_cost_usd REAL,
  cost_provenance TEXT,
  contributing_source_count INTEGER NOT NULL,      -- denormalized count
  authoritative_source TEXT NOT NULL,              -- denormalized
  observed_at INTEGER NOT NULL,
  archived_at INTEGER NOT NULL                     -- when canonical was archived/sources purged
);
CREATE INDEX idx_audit_summary_observed ON canonical_audit_summary(observed_at);
CREATE INDEX idx_audit_summary_workspace ON canonical_audit_summary(workspace_id);
```

When `canonical_usage_events` row is about to be dropped (retention sweep), the row's data is FIRST denormalized into `canonical_audit_summary` (contributing source count from `canonical_usage_sources`, authoritative source identified per Q18 precedence). The summary row keeps the audit drilldown viable: operator can answer "which call produced this $X spend in May 2026?" by joining `resource_budget_ledger` → `canonical_audit_summary` even after raw events have been archived.

**Acceptance criteria**:
- AC-Audit-1: Insert 1000 ledger rows; verify hash chain forms correctly; chain-walk passes.
- AC-Audit-2: Direct SQL UPDATE on row 500's amount; chain-walk detects tamper at row 500.
- AC-Audit-3: Retention sweep drops 90-day-old canonical events; verify `canonical_audit_summary` rows created; verify ledger drilldown to summary works.
- AC-Audit-4: Year-2 audit query: "all USD spent on workspace X in March 2026" produces complete result from ledger + summary even though raw events were archived months ago.

### Q70 — Secret encryption at rest in `provider_accounts.config_json` (NEW — peer #3 P1 #1)

**Decision:** **Sensitive fields in `config_json` encrypted with libsodium secretbox; encryption key derived from MC's existing `AUTH_SECRET`; REST responses redact encrypted fields by default.**

```sql
-- provider_accounts.config_json structure now distinguishes encrypted vs cleartext:
-- {
--   "subscription_id": "sub_xxx",         // cleartext: identifiers, non-secret config
--   "_encrypted": {
--     "api_key": "<base64 ciphertext>",   // encrypted: API keys, OAuth tokens
--     "refresh_token": "<base64 ciphertext>"
--   }
-- }
```

Encryption helper (`src/lib/observability/secret-encryption.ts`):

```ts
import { secretbox, randomBytes } from 'tweetnacl';
import { decodeUTF8, encodeBase64, decodeBase64, encodeUTF8 } from 'tweetnacl-util';

const KEY = deriveKeyFromAuthSecret(process.env.AUTH_SECRET); // 32-byte SHA-256 derivation

export function encryptSecret(plaintext: string): string {
  const nonce = randomBytes(secretbox.nonceLength);
  const message = decodeUTF8(plaintext);
  const ciphertext = secretbox(message, nonce, KEY);
  return encodeBase64(new Uint8Array([...nonce, ...ciphertext]));  // nonce prefixed
}

export function decryptSecret(encrypted: string): string {
  const combined = decodeBase64(encrypted);
  const nonce = combined.subarray(0, secretbox.nonceLength);
  const ciphertext = combined.subarray(secretbox.nonceLength);
  const decrypted = secretbox.open(ciphertext, nonce, KEY);
  if (!decrypted) throw new Error('Decryption failed');
  return encodeUTF8(decrypted);
}
```

REST endpoint redaction (`/api/provider-accounts` GET): the `_encrypted` keys are replaced with `"<encrypted>"` placeholder strings. Operator-only `/api/provider-accounts/<id>/secret` endpoint with separate auth + audit row to retrieve plaintext.

`tweetnacl` and `tweetnacl-util` are minimal MIT-licensed deps (~10KB combined); no new heavy crypto deps.

### Q71 — Provider ToS surface flag matrix (NEW — peer #3 P1 #2)

**Decision:** **Reverse-engineered or undocumented telemetry surfaces are flag-gated and disabled by default; operator must explicitly enable per workspace with ToS acknowledgment.**

```sql
ALTER TABLE workspaces ADD COLUMN governance_tos_acknowledgments_json TEXT NOT NULL DEFAULT '{}';
```

ToS surface flag matrix:

| Surface | Default | ToS notes | Risk if violated |
|---|---|---|---|
| Anthropic Claude Code OTel emission | `enabled` | Anthropic explicitly sanctioned via official monitoring docs | None |
| Anthropic `~/.claude/projects/*/sessions/*.jsonl` reads | `enabled` | Local files; no ToS issue | None |
| OpenAI Codex CLI rollout JSONL reads | `enabled` | Local files; ccusage reads same | None |
| OpenAI `/v1/organization/usage/completions` | `disabled` | Requires admin API key; org-only | Low |
| GitHub Copilot CLI events.jsonl reads | `enabled` | Local files | None |
| GitHub Copilot `copilot_internal/user` polling | **`disabled`** | Undocumented `_internal` endpoint; VS-Code-spoofed headers; could violate GitHub ToS | Medium — GitHub could break or block |
| ChatGPT `wham/usage` polling | **`disabled`** | Undocumented; OAuth-protected; not third-party | High — explicit workaround |
| Anthropic plan-usage UI scraping | **`disabled`** | Web scraping; against ToS | High |

When operator enables a surface marked default-disabled, UI shows: "Enabling this surface depends on undocumented or reverse-engineered behavior that may violate provider Terms of Service. Paddock captures only quota metadata, not content. Continue at your own risk." + typed confirmation field. Acknowledgment recorded in `governance_tos_acknowledgments_json`.

**Documentation deliverable** (`docs/observability/provider-tos-considerations.md`): per-surface explanation of legality / risk / fallback if surface breaks.

### Q72 — Supply-chain pinning + license CI gate (NEW — peer #3 P1 #3, #5)

**Decision:** **All external binaries pinned with version + checksum + signing key; license check in CI rejects AGPL/SSPL.**

**`otelcol-contrib` pinning** (`docs/observability/otel-collector-setup.md` + `scripts/install-otelcol.sh`):

```bash
# Pinned values (operator-tunable but defaults are fixed per release):
OTELCOL_VERSION=0.108.0
OTELCOL_SHA256=<sha-256 of binary>
OTELCOL_SIGNING_KEY=<github fingerprint>
OTELCOL_DOWNLOAD_URL="https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${OTELCOL_VERSION}/otelcol-contrib_${OTELCOL_VERSION}_linux_amd64.tar.gz"
```

Install script:
1. Download binary from GitHub releases
2. Verify SHA-256 checksum
3. Verify GPG signature against pinned key
4. Install to `/usr/local/bin/otelcol-contrib`
5. Audit row in `governance_health_events` recording version installed

**`J-Bax/copilot-token-tracker` schema-only posture**:

`src/lib/observability/copilot-events-ingester.ts` does NOT depend on `J-Bax/copilot-token-tracker` as a runtime npm dep. It uses the schema documentation from that repo as REFERENCE only and ships its own parser. Comment in source code documents the reference + license consideration.

**License compatibility CI gate** (`scripts/check-licenses.sh`):

```bash
# Scans node_modules and package.json for incompatible licenses
# Rejects: AGPL-*, SSPL-*, Commons Clause variants, Elastic-2.0
# Warnings on: GPL-* (Paddock is MIT/Apache-2.0; GPL deps would be incompatible)
# Allowed: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Unlicense
```

CI workflow `.github/workflows/license-check.yml` runs on every PR; fails if incompatible license detected. Initial v1 dependencies audited:

| Dep | License | Compatible? |
|---|---|---|
| @opentelemetry/otlp-transformer | Apache-2.0 | Yes |
| tweetnacl + tweetnacl-util | MIT | Yes |
| All existing MC deps | MIT/Apache-2.0/BSD | Yes |
| `J-Bax/copilot-token-tracker` | MIT (per repo) | Reference-only; not a runtime dep |
| `otelcol-contrib` | Apache-2.0 | Operator-managed binary; not in node_modules |

### Q73 — Logging redaction module (NEW — peer #3 P1 #4)

**Decision:** **Centralized redaction in `src/lib/logger.ts` strips potentially-sensitive content from journal/stderr output.**

```ts
const REDACT_PATTERNS = [
  /Authorization: Bearer [\w.-]+/gi,
  /api[_-]key=[\w.-]+/gi,
  /sk-[\w]{20,}/g,                    // OpenAI/Anthropic key prefixes
  /ghp_[\w]{36,}/g,                   // GitHub PAT
  /\bprompt\b[\s:=]+\S{50,}/gi,        // long prompt-like fields
  /\bcontent\b[\s:=]+\S{100,}/gi,
];

export function redactForLog(input: string): string {
  let out = input;
  for (const re of REDACT_PATTERNS) {
    out = out.replace(re, '[REDACTED]');
  }
  return out;
}
```

All logger calls go through redaction in production mode (enabled by `NODE_ENV=production`). Operator can opt-out via `MC_LOG_REDACT=false` for debugging — UI banner warns when off.

`governance_health_events.detail` field: redacted on write, not just on display, so even DB-direct queries don't leak.

## Open Questions (resolve in `/speckit.clarify`)

Critical items moved to **resolve-now** (resolved in this doc, not deferred):

- ~~Cumulative-vs-delta ordering~~ → Q19 (snapshot model with explicit sequence + provider_timestamp + raw_hash; "untrusted cumulative" flag)
- ~~Source deduplication identity~~ → Q18 (raw + canonical two-layer; ±30s only suggests candidates; `dedupe_confidence` enum)
- ~~Subscription vs metered account model~~ → Q15 (`provider_accounts` + `provider_entitlements`)
- ~~Hard/shadow default behavior~~ → Q4 (ALL defaults shadow; explicit operator promotion)
- ~~Collector failure semantics~~ → Q19 (per-source freshness + degraded mode + chaos AC)
- ~~Aegis starvation~~ → Q20 (emergency reserve + degraded mode + break-glass)
- ~~Copilot endpoint reliability~~ → Q15.5 (advisory-only)
- ~~Reservation atomicity~~ → Q6 (BEGIN IMMEDIATE + state machine + idempotency key)
- ~~Persistent breaker~~ → Q21
- ~~Drift threshold provenance~~ → Q18 (per-source thresholds + 7-day calibration milestone)

Items still requiring **`/speckit.clarify`** resolution:

1. **`token_pricing` table promotion vs JSON catalog**: code-only is current state; Plan must decide whether to promote to DB table (M65) or ship hot-reloadable JSON. Tradeoff: DB enables per-workspace overrides; JSON simpler.
2. **Ollama proxy port**: 11435 currently free on the operator node (ground-truthed). Plan must check at install.
3. **OpenClaw gateway HTTP API for the quota bridge**: Plan reads `racecraft-lab/openclaw:src/gateway/server-methods/usage.ts` to determine the HTTP method/path/auth.
4. **otelcol-contrib version pinning**: `v0.108.x` minimum for `filestorage` extension. Mirror `.specify/extensions/archive/RACECRAFT-PIN.md`.
5. **MC API key provisioning for collector → MC OTLP receiver**: per CLAUDE.md, secrets resolved from 1Password at startup. Plan documents rotation.
6. **Subscription tier renewal detection**: Periodic re-detection cron? Subscription expiry trigger?
7. **GitHub Copilot 2026-06-01 billing change** (premium-request units → "AI Credits"): Plan adds schema-version field + version-pinned parse logic.

`[VERIFY]` items requiring Plan-phase probe scripts:

- **`[VERIFY]` `claude -p` OTel emission** under `CLAUDE_CODE_ENABLE_TELEMETRY=1`. Probe: spawn `claude -p` and tail collector output.
- **`[VERIFY]` `claude mcp serve` OTel emission** — docs silent.
- **`[VERIFY]` `codex exec --json` token availability** — gap-analyst confirms; deep-research confirms; Plan still probes once before relying.
- **`[VERIFY]` `copilot CLI` in CI** — does `events.jsonl` get written without TTY?

## References (Research Provenance)

This design concept was enriched by 9 background research agents on 2026-05-02 (5 stack/provider + 4 deep CLI telemetry: Claude Code, Codex CLI, Copilot CLI, cross-source gap analysis) plus 2 advisor consultations + 1 adversarial RepoPrompt oracle review (14 corrections applied) + direct ground-truth reading of `racecraft-lab/openclaw` and `racecraft-lab/Paddock` source on GitHub plus operator node filesystem (OpenClaw health files, ports, services).

**Anthropic / Claude Code:** [Monitoring (OTel)](https://code.claude.com/docs/en/monitoring-usage) · [Cost docs](https://code.claude.com/docs/en/costs) · [Hooks](https://code.claude.com/docs/en/hooks) · [Claude directory](https://code.claude.com/docs/en/claude-directory) · [Claude Code Analytics API](https://platform.claude.com/docs/en/api/claude-code-analytics-api) · [Pro/Max plan](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan) · [Rate limits](https://platform.claude.com/docs/en/api/rate-limits) · [ColeMurray/claude-code-otel](https://github.com/ColeMurray/claude-code-otel) · [Anthropic claude-code-monitoring-guide](https://github.com/anthropics/claude-code-monitoring-guide)

**OpenAI / Codex CLI:** [Reference](https://developers.openai.com/codex/cli/reference) · [Advanced config](https://developers.openai.com/codex/config-advanced) · [Auth](https://developers.openai.com/codex/auth) · [Non-interactive `--json`](https://developers.openai.com/codex/noninteractive) · [openai/codex repo](https://github.com/openai/codex) · [PR #4525](https://github.com/openai/codex/pull/4525) · [PR #19308](https://github.com/openai/codex/pull/19308) · [PR #7268](https://github.com/openai/codex/pull/7268) · [ccusage Codex guide](https://ccusage.com/guide/codex/)

**GitHub Copilot CLI:** [github/copilot-cli](https://github.com/github/copilot-cli) · [GA 2026-02-25](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/) · [Config dir](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference) · [Hooks reference](https://docs.github.com/en/copilot/reference/hooks-configuration) · [Issue #2471 OTel](https://github.com/github/copilot-cli/issues/2471) · [J-Bax/copilot-token-tracker](https://github.com/J-Bax/copilot-token-tracker) · [AI Credits 2026-06-01](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)

**OpenClaw + MC source:** [racecraft-lab/openclaw — usage-tracking](https://github.com/racecraft-lab/openclaw/blob/main/docs/concepts/usage-tracking.md) · [api-usage-costs](https://github.com/racecraft-lab/openclaw/blob/main/docs/reference/api-usage-costs.md) · [opentelemetry export](https://github.com/racecraft-lab/openclaw/blob/main/docs/gateway/opentelemetry.md) · [server-methods/usage.ts](https://github.com/racecraft-lab/openclaw/blob/main/src/gateway/server-methods/usage.ts) · [provider-usage.fetch.claude.ts](https://github.com/racecraft-lab/openclaw/blob/main/src/infra/provider-usage.fetch.claude.ts) · [provider-usage.fetch.codex.ts](https://github.com/racecraft-lab/openclaw/blob/main/src/infra/provider-usage.fetch.codex.ts) · [extensions/github-copilot/usage.ts](https://github.com/racecraft-lab/openclaw/blob/main/extensions/github-copilot/usage.ts)

**OpenTelemetry GenAI:** [Attribute registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/) · [Metrics](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/) · [Collector](https://opentelemetry.io/docs/collector/) · [filestorage extension](https://pkg.go.dev/github.com/open-telemetry/opentelemetry-collector-contrib/extension/storage/filestorage)

**Performance / SQLite:** [WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3) · [perf docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) · [Token bucket Node.js benchmarks](https://dev.to/iwtxokhtd83/building-a-high-performance-rate-limiter-for-nodejs-architecture-algorithms-and-benchmarks-2jl5) · [SQLite WAL (Fly.io)](https://fly.io/blog/sqlite-internals-wal/)

**Rejected stacks:** [Langfuse self-hosting](https://langfuse.com/self-hosting) · [Helicone self-host](https://docs.helicone.ai/getting-started/self-host/overview) · [LiteLLM proxy](https://docs.litellm.ai/docs/proxy/users) · [Phoenix](https://github.com/Arize-ai/phoenix) · [PostHog comparison](https://posthog.com/blog/best-open-source-llm-observability-tools)

**Cost reference points:** [Claude Code daily cost (Faros)](https://www.faros.ai/blog/claude-code-token-limits) · [Branch8](https://branch8.com/posts/claude-code-token-limits-cost-optimization-apac-teams) · [Opus 4.7 Finout](https://www.finout.io/blog/claude-opus-4.7-pricing-the-real-cost-story-behind-the-unchanged-price-tag) · [Atlassian Kanban WIP](https://www.atlassian.com/agile/kanban/wip-limits) · [LiteLLM Agent Iteration Budgets](https://docs.litellm.ai/docs/a2a_iteration_budgets)
