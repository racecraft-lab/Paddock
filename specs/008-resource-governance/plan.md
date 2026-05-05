# Implementation Plan: SPEC-008 Resource Governance and Cost Tracker Enforcement

**Branch**: `008-resource-governance` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-resource-governance/spec.md`
**Design authority**: `docs/ai/specs/SPEC-008-design-concept.md` (Q1-Q73), peer-review-rounds 1-3, oracle adversarial rounds 1-4

## Summary

Phase 7 of RC Factory replaces the dispatcher's hard-coded `LIMIT 3` and `3+ in_progress` constants with an operator-promoted, feature-flagged governance subsystem: WIP / budget / window / override policies evaluated through a synchronous policy evaluator on the admission hot path, fed by a multi-source telemetry pipeline (Claude Code OTel, Codex CLI, Copilot CLI, Ollama, LM Studio, OpenClaw gateway), reconciled into a canonical event ledger that drives a budget ledger and budget counters. A Cost Tracker → Governance tab + System Health dashboard gives operators policy authoring, real-time utilization, "why was this blocked?" diagnostics, override-grant authoring with race-free atomic reservations, and one-click recovery affordances for documented failure modes. Activation is gated by `FEATURE_RESOURCE_GOVERNANCE` resolved via `resolveFlag(name, ctx)`; flag OFF preserves byte-compatible legacy scheduler behavior.

Technical approach (per design-concept Q1-Q73 + workflow Architecture Notes):

- **Synchronous budget ledger** (`resource_budget_ledger` + `resource_budget_counters`) is admission-control source-of-truth (Q17, Q27, Q35).
- **Eventually-consistent telemetry pipeline** (`raw_usage_events` → `canonical_usage_events` via batched reconciler) writes correction entries to the ledger (Q18, Q24, Q30) — never overwriting history.
- **Posted-effect tracking** (`canonical_budget_effects`) ensures dedup/repair lifecycle without ledger history rewrites (Q30).
- **Three SQLite Database connections per workload class** (foreground busy_timeout=50ms, background=5s, audit=30s) prevent BUSY deadlocks (Q29).
- **Atomic counter conditional UPDATE** with `WHERE counter_value = expected_old_value` for admission; split reservation/release/consumption queries (Q35, Q50).
- **Persistent breaker** state in DB (not in-process); deterministic mode during migrations (Q21).
- **Local health channel** independent of OTel collector (Q48).
- **Bounded ingest admission control** with token-bucket per source + disk-pressure ladder (Q47, FR-090e).
- **Monthly archive partitioning** for `raw_usage_events` retention (Q51).
- **M65 split into 13 dependency-ordered sub-migrations** M65a..M65m + M66 token pricing (Q57, FR-260a).
- **Async chunked counter rebuild jobs** (Q49) — admission never paused.
- **Per-failure-mode runbooks** (Q61, FR-090l) + **System Health dashboard** with documented one-click gesture matrix (Q62, FR-090i).

## Technical Context

**Language/Version**: TypeScript 5.7 strict (existing `tsconfig.json`) + new entries in `tsconfig.spec-strict.json` for every SPEC-008-owned module (Constitution Convention J).
**Primary Dependencies**:

- Next.js 16 App Router (existing) — Route Handlers under `src/app/api/governance/*`, `src/app/api/resource-*`, `src/app/api/otlp/v1/*`.
- React 19 + Tailwind 3 (existing) — Cost Tracker → Governance tab + System Health dashboard.
- `better-sqlite3` (existing) — three Database connections per `Q29` workload class.
- `@opentelemetry/otlp-transformer` (NEW pinned dep) — OTLP/HTTP protobuf decode in MC OTLP receiver.
- `zod` (NEW pinned dep) — REST request validation per Q41 / FR-039 / FR-206.
- Native Node `fs.watch` + inotify (no new dep) — file-based ingestion adapters.
- `@visualproviderprovider-neutral Playwright capture` (existing) — Playwright visual snapshots; Storybook visual for component snapshots.
- `otelcol-contrib` v0.108.0 — operator-managed systemd unit on the operator node; **NOT** in repo (FR-090b).

**Storage**: SQLite via `better-sqlite3`, single-process, append-only ledger semantics; monthly partition tables; archive partitions written to `<MISSION_CONTROL_DATA_DIR>/archives/`.
**Testing**: Vitest (unit + integration + benchmark + chaos suites), Playwright e2e against running app (Constitution Principle XIV NON-NEGOTIABLE), Storybook visual regression.
**Target Platform**: Linux (self-hosted operator node — Ryzen 5900XT + 64GB RAM reference profile); single-process Node.js ≥22; multi-region/multi-node out of scope per spec.
**Project Type**: Web service + UI (Next.js full-stack monolith, in-place extension of `mission-control`).
**Performance Goals**: `p50<5ms, p95<15ms, p99<25ms` admission latency under 1k policies + 300k ledger rows + concurrent gates active (FR-004, AC-Bench-1). Soak: 30 min @ 100 admissions/sec p95 < 15 ms, memory growth < 50 MB (AC-Soak-1).
**Constraints**:

- No new heavy DB deps (Postgres, ClickHouse, Redis, S3 prohibited per CLAUDE.md and Q16 rejected stacks list).
- No SDK call instrumentation in v1 (Q42).
- `FEATURE_RESOURCE_GOVERNANCE=false` preserves byte-compat (P7-AC1, FR-008, FR-305, Constitution Principle I).
- All seeded defaults `enforce_mode='shadow'` (Q4); Aegis emergency reserve `enforce_mode='soft'` (Q42 peer-review correction).
- Strict-scope guard updated for every new TS/TSX file (Convention J).

**Scale/Scope**: ~344 FRs (FR-001..FR-325 plus inline FR-079a/b, FR-090a..FR-090m, FR-260a/b), 9 user stories, 14 entity types, 15 migrations (M64 + M65a..M65m + M66), ~10 runbooks (Q61), ≥10 new React components with mandatory Storybook coverage (FR-306..315), ≥10 new Playwright e2e specs (FR-296..305), feature-flag matrix runner exercising 9 flags × 7 scenarios.

**Strict Scope** (LOAD-BEARING — every entry below MUST be added to `tsconfig.spec-strict.json` AND `eslint.config.mjs` per Convention J; `tasks.md` will replicate):

```text
# Core evaluator + budget ledger + reservations
src/lib/resource-evaluator.ts
src/lib/resource-policy-loader.ts
src/lib/resource-policy-cache.ts
src/lib/resource-decision-writer.ts
src/lib/resource-budget-ledger.ts
src/lib/resource-budget-counters.ts
src/lib/resource-reservation.ts
src/lib/resource-reservation-reaper.ts
src/lib/resource-circuit-breaker.ts
src/lib/resource-breaker-clock.ts
src/lib/resource-window-evaluator.ts
src/lib/resource-window-materializer.ts
src/lib/resource-aegis-reserve.ts
src/lib/resource-override-grant.ts
src/lib/resource-precedence.ts
src/lib/resource-validation.ts
src/lib/resource-etag.ts
src/lib/resource-audit-chain.ts
src/lib/resource-retention.ts
src/lib/resource-drift-detector.ts
src/lib/resource-counter-rebuild.ts
src/lib/resource-db-connections.ts

# Token pricing (M66)
src/lib/token-pricing-resolver.ts

# Observability — OTLP receiver + ingest admission + self-obs
src/lib/observability/otlp-receiver.ts
src/lib/observability/otlp-decoder.ts
src/lib/observability/ingest-admission.ts
src/lib/observability/ingest-rate-state.ts
src/lib/observability/local-health-channel.ts
src/lib/observability/redaction.ts
src/lib/observability/self-obs-metrics.ts
src/lib/observability/snapshot-writer.ts
src/lib/observability/freshness-tracker.ts
src/lib/observability/collector-config-writer.ts

# Reconciler + canonical event pipeline
src/lib/observability/reconciler.ts
src/lib/observability/dedupe.ts
src/lib/observability/posted-effect.ts
src/lib/observability/canonical-events.ts
src/lib/observability/correction-ledger.ts
src/lib/observability/source-registry.ts

# Adapters (one file per source)
src/lib/observability/adapters/claude-code-otel.ts
src/lib/observability/adapters/claude-code-transcript.ts
src/lib/observability/adapters/codex-stdout.ts
src/lib/observability/adapters/codex-rollout.ts
src/lib/observability/adapters/copilot-events-jsonl.ts
src/lib/observability/adapters/copilot-schema-versioning.ts
src/lib/observability/adapters/ollama-log.ts
src/lib/observability/adapters/lm-studio-log.ts
src/lib/observability/adapters/openclaw-gateway.ts
src/lib/observability/adapters/manual-post.ts
src/lib/observability/adapters/provider-quota.ts

# Provider accounts + entitlements
src/lib/provider-accounts.ts
src/lib/provider-entitlement-detector.ts
src/lib/provider-account-encryption.ts

# Feature-flag matrix runner support
src/lib/feature-flag-matrix.ts

# Types
src/types/resource-policy.ts
src/types/resource-decision.ts
src/types/resource-budget.ts
src/types/resource-reservation.ts
src/types/resource-window.ts
src/types/resource-override.ts
src/types/observability.ts
src/types/provider-account.ts
src/types/governance-api.ts

# REST route handlers (operator surface)
src/app/api/governance/policies/route.ts
src/app/api/governance/policies/[id]/route.ts
src/app/api/governance/policies/[id]/promote/route.ts
src/app/api/governance/policies/bulk-promote/route.ts
src/app/api/governance/budgets/route.ts
src/app/api/governance/budgets/[id]/route.ts
src/app/api/governance/windows/route.ts
src/app/api/governance/windows/[id]/route.ts
src/app/api/governance/overrides/route.ts
src/app/api/governance/overrides/[id]/route.ts
src/app/api/governance/decisions/route.ts
src/app/api/governance/dispatch/route.ts
src/app/api/governance/audit/route.ts
src/app/api/governance/system-health/route.ts
src/app/api/governance/system-health/recovery/route.ts
src/app/api/governance/system-health/rebuild/route.ts
src/app/api/governance/diagnostic/route.ts
src/app/api/governance/ingest/[source]/resume/route.ts
src/app/api/governance/collector/config/route.ts
src/app/api/governance/policy-events/route.ts
src/app/api/resource-policies/route.ts
src/app/api/resource-policies/[id]/route.ts
src/app/api/resource-overrides/route.ts
src/app/api/resource-policy-events/route.ts
src/app/api/otlp/v1/traces/route.ts
src/app/api/otlp/v1/metrics/route.ts

# UI components (each MUST ship *.stories.tsx — FR-306..315)
src/components/governance/governance-tab.tsx
src/components/governance/policies-subview.tsx
src/components/governance/policy-row.tsx
src/components/governance/policy-editor.tsx
src/components/governance/budgets-subview.tsx
src/components/governance/budget-utilization-chart.tsx
src/components/governance/windows-subview.tsx
src/components/governance/window-editor.tsx
src/components/governance/overrides-subview.tsx
src/components/governance/override-grant-form.tsx
src/components/governance/diagnostics-subview.tsx
src/components/governance/diagnostic-feed.tsx
src/components/governance/diagnostic-feed-row.tsx
src/components/governance/system-health-subview.tsx
src/components/governance/system-health-card.tsx
src/components/governance/telemetry-source-health-pill.tsx
src/components/governance/breaker-open-banner.tsx
src/components/governance/aegis-emergency-reserve-badge.tsx
src/components/governance/wip-indicator-panel.tsx
src/components/governance/bulk-promote-modal.tsx
src/components/governance/incident-recovery-modal.tsx
src/components/governance/calibration-progress.tsx
src/components/governance/etag-conflict-toast.tsx
src/components/governance/feature-flag-disabled-shim.tsx

# Storybook stories (one per component above, plus state coverage states)
# Located alongside each component as <name>.stories.tsx — implicit but listed for tasks.md.
```

If a future task adds a TS/TSX file not on this list, the strict-scope check (`scripts/check-strict-scope.sh`) MUST fail until it is added. Marking this list LOAD-BEARING is intentional: any drift becomes a CRITICAL finding in `/speckit.analyze` (Constitution Convention J).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I — Zero-Regression Contract (NON-NEGOTIABLE)

- `FEATURE_RESOURCE_GOVERNANCE=false` preserves byte-compat (FR-008, FR-305). Playwright spec `tests/e2e/governance-flag-off-byte-compat.e2e.ts` asserts the Cost Tracker is byte-identical to pre-SPEC-008 baseline AND the legacy `LIMIT 3` + "3+ in_progress" capacity check is preserved. `pnpm test:all` snapshot diff = 0 against pre-change baseline with the flag OFF. **PASS**.

### Principle II — Upstream Compatibility Discipline (NON-NEGOTIABLE)

- All new code lives in NEW files under `src/lib/resource-*`, `src/lib/observability/*`, `src/components/governance/*`, `src/app/api/governance/*`, `src/app/api/resource-*`, `src/app/api/otlp/v1/*`. No edits to upstream-owned `src/app/layout.tsx`, `src/lib/auth.ts` (we *re-use* `extractApiKeyFromHeaders` and `requireRole` from auth.ts but DO NOT modify them — FR-079a). No SQL `RENAME` of upstream-owned identifiers. `provider_subscriptions` is preserved; new `provider_accounts` is additive (FR-131, FR-143). **PASS**.

### Principle III — OpenClaw Adapter Isolation

- `src/lib/observability/adapters/openclaw-gateway.ts` is gated by `FEATURE_OPENCLAW_HEALTH_COSTS` (FR-075). No-ops cleanly when `~/.openclaw/health/` is absent (FR-088 adapter-failure isolation). No schema migration is dedicated to OpenClaw — registry rows only. **PASS**.

### Principle IV — Test-First Development (NON-NEGOTIABLE)

- Red-green-refactor; every FR maps to at least one Vitest unit, integration, e2e, or Playwright test (FR-221..240). Phase-0 verification spike scripts (FR-090a) — `verify-claude-code-otel-emission.ts`, `verify-claude-mcp-otel-emission.ts`, `verify-codex-stdout-rollout-timestamp-parity.ts`, `verify-copilot-events-ci.ts` — produce evidence files at `docs/ai/specs/spikes/<spike>.json` with verdict before tasks generation; CI gate `tests/integration/spec-spike-gates.test.ts` fails closed. **PASS**.

### Principle V — Feature-Flag Resolution Discipline

- All flag checks route through `resolveFlag(name, ctx)` (FR-019, FR-325). CI grep blocks inline `process.env.FEATURE_*` in production code. `feature-flag-matrix.test.ts` exercises every flag × OFF/ON × dependency-chain × env-override (FR-316..325, AC-FF-Matrix-1..4). `process.env.FEATURE_RESOURCE_GOVERNANCE='1'` does NOT force ON; `'0'` forces OFF (verified per FR-323). **PASS**.

### Principle VI — Dependency Supply-Chain Hygiene

- New pinned deps: `@opentelemetry/otlp-transformer` (declared in `package.json`, present in `pnpm-lock.yaml`, imported directly only from `src/lib/observability/otlp-decoder.ts`), `zod` (REST validation only). No transitive imports. `pnpm audit` clean before merge. Supply-chain CI gate (FR-227, FR-239) regenerates lockfile audit on every PR. **PASS**.

### Principle VII / Convention G — Additive Migration Policy

- 15 migrations: M64 (FR-241), M65a..M65m (Q57, FR-242, FR-085), M66 (FR-260a). Each ships `docs/migrations/rollback-M<id>.sql` (FR-243). `M65m` runs final `PRAGMA foreign_key_check` and reports clean before commit. All migrations additive + rerun-safe (FR-245). Rollback test harness extends SPEC-001 pattern (FR-244, FR-256, FR-257). Listed in `docs/migrations/rollback-procedure.md`. **PASS**.

### Principle X — Observability and Auditability

- Every state-changing event → `activities` row + audit chain row (FR-040, FR-176, FR-184, FR-199, FR-217). Tamper-evident chain (FR-176, FR-225, FR-273). Secret-detector findings log rule id NOT matched substring (Constitution Principle XIII). Logging redaction module mandatory before stdout (FR-100, FR-282). **PASS**.

### Principle XII — Avoid Speculative Generality

- No new `agent_api_keys.type` column (FR-079b). otelcol-contrib reuses existing global API key infrastructure (FR-090c) — dedicated row, label-based identification only. No premature abstractions for non-existent providers. **PASS**.

### Principle XIII — Defensive Boundaries, Trusting Interior

- Every external boundary wrapped: OTLP receiver auth (FR-079a), all REST validation via Zod with typed envelopes (FR-206, FR-214), file-based adapter reads with try/catch + structured `activities` row, child-process exec wrapped (FR-090f systemctl proxy). Error envelopes follow `{error, reason, details?}` (FR-214). 401 response NEVER echoes API key (FR-079a explicit). **PASS**.

### Principle XIV — Real UI Journey Quality Gate (NON-NEGOTIABLE)

- **Real Playwright e2e** against running app (FR-296..305) — every operator journey covered: WIP policy authoring, budget enforcement, blackout windows, override grants (happy path + 409/412/422/423), Cost Tracker tab landing, diagnostic feed pagination/filter, telemetry health drilldown, Aegis starvation+reserve+escalation, system-health one-click recovery, byte-compat flag-OFF check, bulk-promote single-workspace + cross-workspace reject, dispatch feed cursor + SSE live-append. Spec files: `tests/e2e/governance-{wip-policy,budget,windows,override-grant,tab-landing,diagnostic-feed,telemetry-health,aegis-starvation,system-health-recovery,bulk-promote,dispatch-feed,flag-off-byte-compat}.e2e.ts`.
- **Docker-backed execution** via `scripts/e2e-docker.sh` (existing) with disposable data dir + deterministic seed data per `seed-e2e-workspace-switcher.cjs` pattern.
- **Screenshot artifacts** for human-in-the-loop review covering before/during/after/responsive states (FR-296..305).
- **Visual manifest gates**: `pnpm test:e2e:visual-manifest` AND `pnpm test:visual:manifest` MUST pass (FR-229, AC-UI-Visual-Playwright-1, AC-UI-Visual-Storybook-1). Non-visual e2e runs MUST NOT upload empty visual builds.
- **Storybook coverage** — every newly authored UI component (FR-306..315) ships `*.stories.tsx` covering default / loading / error / empty / dense data / disabled-by-flag states.
- **Defect-remediation gate**: failing e2e output + screenshots reviewed before PR update; known UI journey bugs fixed before PR is opened/marked ready.
- **System Health gesture matrix** (FR-090i) — explicitly enumerated:
  - `Restart collector`: single-click + checkbox confirm
  - `Force resume hard enforcement`: typed phrase `RESUME HARD ENFORCEMENT`
  - `Manually close breaker`: single-click + checkbox confirm
  - `Top up reserve` (Aegis): single-click + checkbox confirm; delta capped at 100% of policy limit
  - `Pause Aegis`: typed phrase `PAUSE AEGIS`
  - `Force local mode` (Aegis): single-click + checkbox confirm
  - `Run rebuild` (drift): single-click + checkbox confirm
  - `Mark acknowledged`: single-click (non-state-changing)
  - `Update parser`: EXCLUDED from one-click — opens runbook only
  - Operations that mutate forensic/`broken` artifacts: EXCLUDED

**PASS**.

### Principle XV — Spec Artifact Provenance and Archive Sweep (NON-NEGOTIABLE)

- Archive Sweep already ran for previously merged specs (SPEC-001..006, SPEC-002A, SPEC-003) before Phase 0; current target SPEC-008 is excluded from same-run archival per `.specify/extensions.yml` `before_plan` hook policy. Generated screenshots are visual regression/CI artifacts only — `.gitignore` excludes `playwright-report/**` and `test-results/**`. `scripts/verify-spec-evidence-screenshots.mjs` runs in CI to flag any committed binary screenshot without a manifest-backed exception. **PASS**.

### Convention J — Strict new-module scope

- Every new TS/TSX file enumerated above is added to `tsconfig.spec-strict.json` AND `eslint.config.mjs` as part of `tasks.md`. **PASS**.

**Constitution Check: 9/9 NON-NEGOTIABLE principles PASS, 7/7 supporting principles PASS, 0 unjustified violations. PROCEED to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/008-resource-governance/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output — R-001..R-N keyed to Q-section families
├── data-model.md        # Phase 1 output — 14 entities, 15 migrations
├── quickstart.md        # Phase 1 output — operator onboarding
├── contracts/           # Phase 1 output — 10 OpenAPI files
│   ├── governance-policies.openapi.yaml
│   ├── governance-budgets.openapi.yaml
│   ├── governance-windows.openapi.yaml
│   ├── governance-overrides.openapi.yaml
│   ├── governance-decisions.openapi.yaml
│   ├── governance-system-health.openapi.yaml
│   ├── governance-collector.openapi.yaml
│   ├── governance-audit.openapi.yaml
│   ├── otlp-receiver.openapi.yaml
│   └── agent-api-keys-extension.openapi.yaml
├── checklists/          # /speckit.checklist output
└── tasks.md             # /speckit.tasks output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/lib/
├── resource-evaluator.ts            # Hot-path evaluator (FR-001..030)
├── resource-policy-loader.ts        # Policy cache + ETag/version lookups
├── resource-budget-ledger.ts        # Append-only ledger writer (FR-051..070)
├── resource-budget-counters.ts      # Atomic counter UPDATE w/ Q35
├── resource-reservation.ts          # Atomic reservation (FR-054..065)
├── resource-reservation-reaper.ts   # Reaper job (FR-064)
├── resource-circuit-breaker.ts      # Persistent breaker (FR-006, Q21)
├── resource-window-evaluator.ts     # Window precedence
├── resource-window-materializer.ts  # 90-day forward instances + DST
├── resource-aegis-reserve.ts        # Aegis emergency reserve (FR-151..170)
├── resource-override-grant.ts       # Override creation (FR-171..185)
├── resource-precedence.ts           # Decision precedence (FR-002)
├── resource-validation.ts           # Zod schemas + sanity bounds
├── resource-etag.ts                 # ETag/If-Match logic (FR-038, FR-205)
├── resource-audit-chain.ts          # Tamper-evident hash chain (FR-176)
├── resource-retention.ts            # Sweep + partition rotation (FR-248..260)
├── resource-drift-detector.ts       # Stratified sample + auto-repair (FR-057)
├── resource-counter-rebuild.ts      # Async chunked rebuild (FR-058)
├── resource-db-connections.ts       # 3-connection pool (Q29, FR-060)
├── token-pricing-resolver.ts        # M66 facility/workspace pricing
└── observability/
    ├── otlp-receiver.ts             # POST /api/otlp/v1/{traces,metrics} core
    ├── otlp-decoder.ts              # @opentelemetry/otlp-transformer wrapper
    ├── ingest-admission.ts          # Token-bucket per source (FR-079, Q47)
    ├── ingest-rate-state.ts         # State machine (FR-090e)
    ├── local-health-channel.ts      # OTel-independent (Q48)
    ├── redaction.ts                 # PII redaction (FR-099, FR-100)
    ├── self-obs-metrics.ts          # Local metrics (FR-276..285)
    ├── snapshot-writer.ts           # Cumulative deltas (FR-111..130)
    ├── freshness-tracker.ts         # Q32 incremental freshness
    ├── collector-config-writer.ts   # FR-090f config audit trail
    ├── reconciler.ts                # Batched dedupe+coalesce (FR-077, FR-091..110)
    ├── dedupe.ts                    # Per Q39 / Q52 join logic
    ├── posted-effect.ts             # Q30 lifecycle (FR-093)
    ├── canonical-events.ts          # Canonical event materializer
    ├── correction-ledger.ts         # FR-103 correction coalescing
    ├── source-registry.ts           # Source emission capability registry
    └── adapters/                    # One file per source (FR-071..076)
        ├── claude-code-otel.ts
        ├── claude-code-transcript.ts        # FR-071a verdict-downgraded path
        ├── codex-stdout.ts
        ├── codex-rollout.ts
        ├── copilot-events-jsonl.ts
        ├── copilot-schema-versioning.ts     # FR-090d parser_version map
        ├── ollama-log.ts
        ├── lm-studio-log.ts
        ├── openclaw-gateway.ts              # FEATURE_OPENCLAW_HEALTH_COSTS gated
        ├── manual-post.ts                   # /api/tokens POST path
        └── provider-quota.ts                # Coarse % remaining

src/app/api/
├── governance/
│   ├── policies/                # CRUD + bulk-promote (FR-201, FR-090h)
│   ├── budgets/
│   ├── windows/
│   ├── overrides/               # 409/412/422/423 envelopes (FR-180)
│   ├── decisions/
│   ├── dispatch/                # Cursor pagination + SSE (FR-090j)
│   ├── audit/
│   ├── system-health/           # GET + recovery + rebuild
│   ├── diagnostic/
│   ├── ingest/[source]/resume/  # Per-source breaker reset
│   ├── collector/config/        # FR-090f audit trail
│   └── policy-events/
├── resource-policies/           # Convenience aliases retained
├── resource-overrides/
├── resource-policy-events/
└── otlp/v1/
    ├── traces/
    └── metrics/

src/components/governance/      # See Strict Scope list above
src/types/                      # See Strict Scope list above

scripts/
├── verify-claude-code-otel-emission.ts        # FR-090a Phase-0 spike
├── verify-claude-mcp-otel-emission.ts         # FR-090a Phase-0 spike
├── verify-codex-stdout-rollout-timestamp-parity.ts  # FR-090a Phase-0 spike
├── verify-copilot-events-ci.ts                # FR-090a Phase-0 spike
├── install-otelcol.sh                         # FR-090b cosign-verified install
└── check-runbook-links.ts                     # FR-090m orphan detection

docs/
├── migrations/
│   ├── rollback-M64.sql           # FR-243
│   ├── rollback-M65a.sql .. rollback-M65m.sql  # 13 files
│   └── rollback-M66.sql
├── runbook/                       # 10 runbook pages per Q61 / FR-090l
│   ├── collector-outage.md
│   ├── reconciler-stall.md
│   ├── counter-drift.md
│   ├── breaker-stuck-open.md
│   ├── audit-chain-mismatch.md
│   ├── aegis-emergency-reserve-depletion.md
│   ├── source-schema-break.md
│   ├── encryption-key-rotation.md
│   ├── retention-sweep-failure.md
│   ├── migration-rollback.md
│   ├── rotate-otelcol-api-key.md  # FR-090c
│   └── ollama-proxy-port-collision.md  # FR-260b
└── ai/specs/spikes/               # FR-090a evidence files (created by spikes)

tests/
├── e2e/                           # FR-296..305 Playwright specs
├── integration/
│   ├── feature-flag-matrix.test.ts   # FR-316..325 / AC-FF-Matrix-1..4
│   └── spec-spike-gates.test.ts      # FR-090a CI gate
└── chaos/                         # FR-090m chaos-test harness
```

**Structure Decision**: Single Next.js full-stack monolith extension. All new code lives in clearly-namespaced new directories (`src/lib/resource-*`, `src/lib/observability/*`, `src/app/api/governance/*`, `src/components/governance/*`) for upstream-compat (Principle II) and strict-scope discipline (Convention J). No new top-level packages or workspaces.

## Phase Sequencing

This `/speckit.plan` invocation produces:

- **Phase 0** → `research.md` (R-001..R-N resolving Q-section families; verification spike scripts authored in `scripts/`).
- **Phase 1** → `data-model.md`, `contracts/*.openapi.yaml`, `quickstart.md`, agent-context update.

Subsequent phases (NOT this command):

- **Phase 2** (`/speckit.checklist`) → `checklists/operator-readiness.md` covering operator UX questions.
- **Phase 3** (`/speckit.tasks`) → `tasks.md` with dependency-ordered tasks; verification spikes MUST run + emit evidence files BEFORE tasks generation declares Phase 5 ready.
- **Phase 4** (`/speckit.analyze`) → cross-artifact consistency check.
- **Phase 5** (`/speckit.implement`) → executes `tasks.md`.

## Validation Strategy

Per FR-221..240 + Constitution Principle XIV:

1. **Unit tests** (Vitest) — every new module has `__tests__/<name>.test.ts`. Determinism tests (FR-225) for the evaluator under injected clock.
2. **Integration tests** — REST × success/error pairs (FR-220), feature-flag matrix (FR-316..325), reservation race (FR-231) ≥ 5 concurrent attempts → exactly one 201, N-1 deterministic 409 with stable error body.
3. **Benchmark CI gate** (FR-222) — `src/lib/__tests__/resource-governance-benchmark.test.ts` asserts `p50<5ms, p95<15ms, p99<25ms` on reference hardware. Regression > 10% blocks PR.
4. **Soak test** (FR-224) — 30 min @ 100 admissions/sec; p95 < 15 ms, memory growth < 50 MB.
5. **Chaos test harness** (FR-090m, `pnpm test:chaos`) — 10 runbook scenarios + reservation race + DST transition + concurrent operator edit + counter drift injection. Each runbook's primary recovery command runs against a simulated failure mode and asserts the `## Verification` step passes.
6. **DST tests** (FR-232, FR-289..290) — spring-forward + fall-back across all supported IANA timezones.
7. **Drift tests** (FR-233) — auto-repair tier (≤ 1% AND ≤ floor) + operator-confirmed tier + hard-block tier.
8. **DR rehearsal** (FR-235) — RTO < 30 min, RPO < 24 h verified per quarter.
9. **Retention tests** (FR-236) — monthly partition archival + recovery at 50M-row scale.
10. **Playwright e2e** against running app (FR-296..305) — Constitution Principle XIV; Docker-backed via `scripts/e2e-docker.sh`.
11. **Storybook visual regression** (FR-306..315) — every component covers default/loading/error/empty/dense/disabled-by-flag.
12. **Visual manifest gate** (FR-228, FR-229) — `pnpm test:e2e:visual-manifest` + Storybook variant.
13. **Spike-evidence CI gate** (FR-090a) — `tests/integration/spec-spike-gates.test.ts` fails closed if any `[VERIFY]`-tagged FR lacks an evidence file with verdict matching FR-prescribed value.
14. **Byte-compat regression** (FR-238, FR-305) — flag OFF baseline snapshot diff = 0.
15. **Supply-chain CI** (FR-227, FR-239) — license allow-list + lockfile audit on every PR.

## Complexity Tracking

> No unjustified complexity. All architectural separations (3 DB connections, ledger ↔ counter split, raw ↔ canonical event split, posted-effect ledger, 13 sub-migrations, foreground/background workload separation) trace to specific design-concept Q-numbers AND specific peer-review findings. The plan adds NO speculative generality (Principle XII): each module exists to satisfy a named FR. The strict-scope file list is the audit trail.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

---

**Plan status**: Phase 0 + Phase 1 complete. `research.md`, `data-model.md`, `contracts/*`, `quickstart.md` produced in same `/speckit.plan` invocation. Ready for `/speckit.checklist` and `/speckit.tasks` after spike-evidence files are produced.
