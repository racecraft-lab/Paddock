# SpecKit Workflow: SPEC-008 — Resource Governance and Cost Tracker Enforcement

**Template Version**: 1.0.0
**Created**: 2026-05-02
**Purpose**: Execute SPEC-008 via SpecKit autopilot. RC Factory Phase 7. Implements feature-flagged scheduler enforcement (resource_policies + resource_policy_events from M60/M61) with multi-source defense-in-depth telemetry ingestion across Claude Code, Codex CLI, Copilot CLI, Ollama, LM Studio, and OpenClaw gateway.

---

## Design Concept

This workflow file was enriched from a Grill Me interview run during `/speckit-pro:setup` followed by **9 background research agents** (5 stack/provider + 4 deep CLI telemetry), **2 advisor consultations**, **4 oracle adversarial review rounds**, **3 independent peer review rounds** (distributed-systems lens, SRE/operator lens, security/compliance lens), and direct ground-truth reading of `racecraft-lab/openclaw` and `racecraft-lab/mission-control` source on GitHub. **73 design decisions** captured (Q1-Q73) covering: evaluator precedence, window storage, WIP scope, budget shape, Aegis starvation prevention, override reservation atomicity, activity throttling, OpenClaw health adapter, REST API CRUD, UI placement, evaluator hot-path architecture, default seed migration, circuit breaker persistence, test strategy, billing-mode detection, multi-source ingestion architecture, budget ledger separation, raw+canonical two-layer telemetry model, snapshot delta computation, source emission registry, batched reconciler, Copilot schema validation, correction coalescing, precomputed budget counters, migration safety, foreground/background DB connection separation, posted-effect ledger lifecycle, backfill window state machine, incremental freshness, calibration data sufficiency, attach status repair workflow, atomic counter conditional update, drift verification sampling, tiered Copilot validation, reservation accounting across windows, Codex stdout↔rollout dedupe, atomic counter rebuild, input validation + threat model, Aegis soft-by-default, retention partitioning, dispatch diagnostic view, self-observability metrics, soak/DST/concurrent-edit ACs, raw ingest admission control, local health channel, async chunked rebuild, split reservation/release/consumption queries, monthly archive partitioning, Codex timestamp join verification, Aegis soft escalation, dispatch log indexing, soak test infrastructure, bulk policy promotion, M65 dependency-ordered migration, stratified drift sampling, hard enforcement disablement escalation, backup/DR procedure, per-failure runbooks, system health dashboard, retention default-on, provider_accounts soft-delete, threshold guardrails, breaker chronic alerts + reservation reaper.

The full design concept and Q&A log live at:

```text
docs/ai/specs/SPEC-008-design-concept.md
```

Three peer review documents capture independent critique:

```text
docs/ai/specs/SPEC-008-peer-review-round-1.md       # distributed-systems lens
docs/ai/specs/SPEC-008-peer-review-round-2.md       # SRE/operator lens
docs/ai/specs/SPEC-008-peer-review-round-3.md       # security/compliance lens (when complete)
```

Re-read these before each phase. They are the source of truth for any decision captured during scoping.

> **Note:** Grill Me is human-in-the-loop only. It is **not** part of the autopilot loop. Once this workflow file is populated and autopilot begins, clarifications happen via `/speckit.clarify` and the consensus protocol.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `/speckit.specify` | ✅ Complete | 325 FRs, 9 US, 0 clarifications, G1 ✅; spec.md 660 lines |
| Clarify | `/speckit.clarify` | ✅ Complete | 4 sessions × 5 questions = 20/20 resolved; G2 ✅; spec.md grew with FR-079a/b, FR-090a..090m (16 new FRs); 0 markers |
| Plan | `/speckit.plan` | ✅ Complete | plan.md (458L) + research.md (305L) + data-model.md (604L; 24 tables) + quickstart.md (397L) + 10 OpenAPI contracts; 15 migrations M64+M65a..m+M66; 100+ strict-scope files; G3 ✅ |
| Checklist | `/speckit.checklist` | ✅ Complete | 6 domains × 461 items, 102/133 gaps fixed by executors + 31 consensus-resolved (FR-361..395); spec.md grew to 942 lines, 467 FRs total; G4 ✅ |
| Tasks | `/speckit.tasks` | ✅ Complete | tasks.md 689L / 373 tasks / 16 phases / 228 parallel / 81 TDD-red / 5 verification spikes / G5 ✅ |
| Analyze | `/speckit.analyze` | ✅ Complete | 14 findings (1 CRITICAL pre-impl process / 3 HIGH coverage / 5 MEDIUM consistency / 5 LOW); remediation as Phase 14 tasks T374-T385 + AC-Drift-1..4 standardization; G6 ✅ |
| Implement | `/speckit.implement` | ✅ Complete | Implementation PR #26 merged to `main` as `bd9a693`. Resource evaluator, telemetry/observability pipeline, governance UI, feature-flag matrix, migrations, guardrails, docs, and verification evidence are recorded in `SPEC-008-summary.md` and `SPEC-008-verification-evidence.md`; operator-led soak/chaos/running-instance evidence remains non-blocking follow-up, not active implementation. |

**Status Legend:** ⏳ Pending | 🔄 In Progress | ✅ Complete | ⚠️ Blocked

### Phase Gates (SpecKit Best Practice)

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G1 | After Specify | All 8 user stories clear; no `[NEEDS CLARIFICATION]` markers; success criteria reference design-concept Q-numbers |
| G2 | After Clarify | All 4 session focus areas resolved; spec amendments traceable to consensus answers |
| G3 | After Plan | Architecture passes constitution gates; multi-source ingestion contract documented; no new heavy DB deps |
| G4 | After Checklist | All `[Gap]` markers addressed across 5 domains |
| G5 | After Tasks | Task coverage verified across 8 user stories; verification spikes (claude -p OTel, codex stdout-rollout dedupe) flagged early |
| G6 | After Analyze | No `CRITICAL` issues; calibration milestone tasks present |
| G7 | After Each Implementation Phase | Tests pass; benchmark p95 met; chaos tests for collector failure pass |

---

## Prerequisites

### Constitution Validation

Mission Control Constitution v1.4.1 — 15 principles + 11 autopilot conventions. SPEC-008-relevant principles mapped explicitly:

| Principle | Requirement | Verification | Status |
|-----------|-------------|--------------|--------|
| I. Zero-Regression Contract | FEATURE_RESOURCE_GOVERNANCE=OFF preserves byte-compat | `pnpm test:all` flag-OFF baseline | ⏳ Phase 0 |
| II. Install Compat | No SQL RENAME, no destructive migration, no broad legacy-core rewrites | `git diff` review at G3, G7 | ⏳ ongoing |
| III. OpenClaw Adapter Isolation | FEATURE_OPENCLAW_HEALTH_COSTS absent-safe; no v1 schema migration | Integration test with files absent | ⏳ Phase 12 |
| IV. Test-First (NON-NEGOTIABLE) | TDD red-green every production change | `pnpm test`; PR review | ⏳ ongoing |
| V. Feature-Flag Resolution | resolveFlag(name, ctx) only — no inline process.env | CI grep gate; FF matrix tests | ⏳ Phase 12C |
| VI. Supply-Chain Hygiene | New deps pinned in package.json + lockfile; pnpm audit clean | `pnpm audit`; lockfile diff | ⏳ G3 |
| VII. Additive Migration Policy | M64 + M65a..M65m append-only; rollback SQL each | `docs/migrations/rollback-M*.sql` | ⏳ Phase 1+impl |
| IX. Safe Evaluation | Untrusted-input safety: AJV constrained, no eval | Code review; CI grep | ⏳ G6 |
| X. Observability | resource_policy_events row + activity for every non-allow | TDD + integration | ⏳ ongoing |
| XIII. Defensive Boundaries | Try/catch at boundaries (HTTP, DB, child process); not interior | Code review at G6 | ⏳ ongoing |
| **XIV. Real UI Journey Quality Gate (NON-NEGOTIABLE)** | Real Playwright e2e against running app + Storybook/visual evidence; Visual manifest gate | `pnpm test:e2e`; `pnpm test:visual:storybook`; `pnpm test:e2e:visual-manifest`; `pnpm test:visual:manifest` | ⏳ Phase 12B |
| XV. Spec Artifact Provenance | Archive Sweep startup; provenance + recovery commands | Step -1 sweep report (✅ done) | ✅ Step -1 |
| Conv. G. Rollback Presence | Every migration → matching rollback-M<id>.sql | `validate-gate.sh` G7 | ⏳ G7 |
| Conv. J. Strict New-Module Scope | All new TS/TSX in tsconfig.spec-strict.json + eslint.config.mjs | tsconfig diff at G3 | ⏳ G3 |
| Conv. K. Archive Sweep | Sweep at startup; current-target excluded | ✅ Step -1 dry-run + provenance | ✅ Step -1 |

**Type Safety baseline (Phase 0):** `pnpm typecheck` — ✅ PASS (clean; 0 errors)
**Lint baseline (Phase 0):** `pnpm lint` — ✅ PASS (0 errors; 12 pre-existing warnings recorded as baseline)
**Unit-test baseline (Phase 0):** `pnpm test` — ⚠️ 1321/1323 PASS (99.85%); 2 pre-existing flakes in `src/lib/__tests__/gnap-sync.test.ts` (timeout under full-suite concurrency; 15/15 PASS in isolation). Recorded as baseline; SPEC-008 must not increase failure count.
**Build baseline (Phase 0):** `pnpm build` — deferred until Phase 13 (FULL_VERIFY)
**E2E baseline (Phase 0):** `pnpm test:e2e` — deferred until Phase 12B has populated journey specs

**Constitution Check:** ✅ Phase 0 baselines green (with documented gnap-sync flake). Cleared to enter Phase 1.

**Implementation Agent:** No `.claude/agents/*.md` directory in repo — no project-specific implementation agent. Falls back to bundled `phase-executor` for implement-phase tasks per autopilot detection rule 0.10. (CLAUDE.md does not name an alternate agent.)

### Archive Sweep

| Item | Behavior |
|---|---|
| Archive Sweep | Runs before Phase 0/prerequisites; excludes SPEC-008 from cleanup; expects SPEC-001/002/002A/003/004/006 as merged candidates (and SPEC-005, SPEC-007 if merged before SPEC-008 starts) |

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| **Spec ID** | SPEC-008 |
| **Name** | Resource Governance and Cost Tracker Enforcement |
| **Branch** | `008-resource-governance` |
| **Worktree** | `.worktrees/008-resource-governance/` |
| **Phase** | 7 |
| **Priority** | P2 |
| **Dependencies** | SPEC-001, SPEC-002, SPEC-002A, SPEC-004 (all merged) |
| **Enables** | SPEC-009 Pilot |
| **Status Authority** | Roadmap + this workflow are execution-status authority |
| **Source Roadmap** | `docs/ai/rc-factory-technical-roadmap.md` (Phase 7) |

### Scope Summary

Implement RC Factory Phase 7: extend the existing Cost Tracker into feature-flagged scheduler enforcement. The roadmap-line scope ("evaluator + 4 scheduler gates + Cost Tracker UI tab + budget audit + override path + OpenClaw health adapter") is significantly EXPANDED in this design concept due to the operator's explicit Option B choice in grill-me Q15.5 — v1 ships **live multi-source observability** across all subscription CLIs (Claude Code, Codex CLI, Copilot CLI, Ollama, LM Studio) plus OpenClaw gateway. This adds a multi-source ingestion layer, raw+canonical telemetry model, OTLP receiver, otelcol-contrib sidecar, 11+ new tables, and operator-facing scaffolding (backup/DR, runbooks, system health dashboard).

### Success Criteria Summary

Drawn from Phase 7 P7-AC1..AC12 in the roadmap, AUGMENTED with peer-review-derived ACs:

- [P7-AC1] FEATURE_RESOURCE_GOVERNANCE=false: existing scheduler behavior unchanged.
- [P7-AC2] Flag ON, no operator-promoted policies: evaluator returns allow; no blocking events.
- [P7-AC3] Agent WIP policy with limit_value=1 prevents second task dispatch and writes defer/block event.
- [P7-AC4] Project/status WIP policy enforces in_progress task count cap.
- [P7-AC5] Blackout window blocks new autonomous dispatch/chain advancement; running work checkpoints/completes.
- [P7-AC6] Degraded window allows only configured critical/local/approved-provider work.
- [P7-AC7] Soft budget threshold emits alert/activity, work continues.
- [P7-AC8] Hard budget threshold blocks/pauses new work, requires operator override.
- [P7-AC9] OpenAI subscription path enforces token/request/session budgets even at $0 estimated marginal cost.
- [P7-AC10] FEATURE_OPENCLAW_HEALTH_COSTS=false or files absent: existing Cost Tracker and scheduler behavior unchanged.
- [P7-AC11] Flag ON + valid OpenClaw health files: facility electricity/infra telemetry in Cost Tracker; blended totals available.
- [P7-AC12] Policy evaluation failure fails safe (defer + audit row + activity + notification + circuit breaker).
- [AC-Race-1] 5 concurrent override grants for last $1: exactly one returns 201, four return deterministic 409.
- [AC-Drift-1..3] Counter drift detection + auto-repair / operator-confirmed repair (per Q40).
- [AC-Aegis-1..6] Aegis starvation prevention paths exercised (per Q20, Q53).
- [AC-DR-1..4] Backup/restore RTO<30min, RPO<24h (per Q60).
- [AC-Retention-1..3] Monthly archive partitioning works at 50M-row scale (per Q51).
- [AC-Bench-1] Benchmark p50<5ms, p95<15ms, p99<25ms with 1k policies + 300K ledger rows + concurrent gates (per Q11/Q35).
- [AC-Soak-1] 30-min soak at 100 admission/sec + reconciler load: p95 stays <15ms; memory growth <50MB (per Q46).
- [AC-DST-1] Calendar windows handle DST transitions correctly (per Q46).
- [AC-UI-Playwright-1] 100% of new operator journeys have Playwright e2e specs; `pnpm test:e2e` green (per FR-296..305).
- [AC-UI-Visual-Playwright-1] Every Playwright spec emits visual snapshot metadata; `pnpm test:e2e:visual-manifest` passes (per FR-296..305).
- [AC-UI-Storybook-1] Every newly authored React component has a `*.stories.tsx` covering default/loading/error/empty/dense/disabled-by-flag states; `pnpm storybook` builds clean (per FR-306..315).
- [AC-UI-Visual-Storybook-1] visual snapshots green via `pnpm test:visual:storybook` and `pnpm test:visual:manifest` (per FR-306..315).
- [AC-FF-Matrix-1] All 9 feature flags exercised in unit/integration/e2e tests (OFF, ON, dependency-chain, all-on baseline) per FR-316..325.
- [AC-FF-Matrix-2] FEATURE_RESOURCE_GOVERNANCE=OFF: Governance tab hidden from Cost Tracker; legacy hard-coded LIMIT 3 + "3+ in_progress" capacity preserved byte-compat (P7-AC1 reinforced).
- [AC-FF-Matrix-3] `resolveFlag` env override semantics tested: env='0' forces OFF, env='1' does NOT force ON (CLAUDE.md pitfall guarded by automated test).
- [AC-FF-Matrix-4] enableRequires dependency chains tested: FEATURE_GLOBAL_AEGIS requires FEATURE_WORKSPACE_SWITCHER; FEATURE_TASK_PIPELINES requires FEATURE_GLOBAL_AEGIS; FEATURE_RESOURCE_GOVERNANCE + FEATURE_OPENCLAW_HEALTH_COSTS prerequisites enforced.

---

## Phase 1: Specify

**When to run:** Start of SPEC-008. Focus on **WHAT** and **WHY**.

### Specify Prompt

```bash
/speckit.specify

## Feature: SPEC-008 Resource Governance and Cost Tracker Enforcement

Create a specification for RC Factory Phase 7 in Mission Control. Consume the comprehensive design concept doc at `docs/ai/specs/SPEC-008-design-concept.md` (73 design decisions Q1-Q73) as the authoritative source for design choices. The spec should ENRICH the design concept with formal user stories, functional requirements, and acceptance criteria — NOT duplicate the design rationale. The spec MUST also reflect US9 (test-coverage user story) and FR-296..325 (UI/UX coverage + feature-flag matrix) added on 2026-05-02 to satisfy Constitution Principle XIV (Real UI Journey Quality Gate, NON-NEGOTIABLE) and Principle V (Feature-Flag Resolution Discipline).

### Problem Statement

Mission Control's resource_policies and resource_policy_events tables landed empty in SPEC-001 (M60/M61). Hard-coded LIMIT 3 and "3+ in_progress" capacity checks in the dispatcher are the only enforcement that exists today. Cost Tracker is observability-only with no enforcement. Operators have no way to:
- Set per-agent / per-project / per-workspace WIP limits
- Set blackout / degraded windows for blocking autonomous dispatch
- Enforce daily/monthly USD or token budgets
- Track usage from subscription CLIs (Claude Code Max 20x, ChatGPT Pro, Copilot Pro+, Ollama Pro) when those CLIs do not route through OpenClaw gateway
- Get fail-safe behavior when evaluator errors

### Users

- **Solo developer / small team** running Mission Control on a single Linux node
- **Operator** who configures policies and grants overrides
- **Aegis** (autonomous review agent) — subject of governance with starvation prevention
- **Future regulator / auditor** for compliance trail

### User Stories

- US1: As an operator, I configure WIP policies per agent/project/workspace so I can throttle autonomous work without editing code (Q3, Q4).
- US2: As an operator, I configure USD/token/request/session budgets with rolling and calendar windows so I can prevent runaway costs (Q4).
- US3: As an operator, I configure blackout/degraded windows in my local timezone (CDT) and mirror provider peak hours (Anthropic PT) so I align dispatch with cost-aware times (Q2).
- US4: As an operator, I grant temporary overrides on blocked decisions with budget reservations that don't permit unbounded spending (Q6, Q42).
- US5: As an operator, I see budget utilization, WIP, windows, and recent decisions in the Cost Tracker UI in real time (Q10, Q44, Q62).
- US6: As an operator, I see WHY a specific dispatch was deferred / blocked via the diagnostic view (Q44).
- US7: As an operator, I rely on multi-source defense-in-depth telemetry ingestion so my budgets are correct even when a single source is degraded (Q16, Q18, Q19).
- US8: As an operator, I recover from collector outages, schema breaks, drift detection, and DR scenarios via documented runbooks (Q60, Q61, Q62).
- US9 (test-coverage user story): As a maintainer, I have **100% test coverage for every new UI/UX journey** (Playwright e2e + Storybook visual snapshots) and **complete feature-flag-matrix activation testing** (every past + present feature flag in `src/lib/feature-flags.ts` exercised in unit/integration/e2e/Playwright/Storybook with the dependency graph honored, including OFF/ON pairs and required-prerequisite chains) so SPEC-008 cannot regress prior specs (SPEC-002 workspace switcher, SPEC-003 global Aegis, SPEC-004 pipelines, SPEC-006 area labels, plus FEATURE_TWO_STEP_TERMINAL, FEATURE_DISPOSITION_LOGGING, FEATURE_TASK_ARTIFACTS) and the SPEC-008 governance UX is verifiably correct.

### Functional Requirements

Reference design-concept Q-sections for each FR family:

- FR-001..030: Evaluator + decision precedence + scheduler gates (Q1, Q5, Q11, Q21, Q35)
- FR-031..050: Policy schema + seeded defaults + calibration (Q3, Q4, Q12, Q22, Q33, Q56, Q65)
- FR-051..070: Budget ledger + counters + reservations (Q6, Q17, Q27, Q38, Q40, Q49, Q50)
- FR-071..090: Multi-source ingestion + adapters (Q16, Q23, Q24, Q39, Q47, Q52, Q57)
- FR-091..110: Raw + canonical event model + reconciler (Q18, Q24, Q26, Q30, Q34, Q36, Q58)
- FR-111..130: Snapshot model + cumulative deltas + collector health (Q19, Q31, Q32, Q48)
- FR-131..150: Provider accounts + entitlements + billing-mode detection (Q15, Q42, Q64)
- FR-151..170: Aegis starvation prevention (Q5, Q20, Q42, Q53)
- FR-171..185: Override grants + atomic reservations + audit (Q6, Q9, Q41, Q66)
- FR-186..200: Cost Tracker UI extensions + diagnostic view + system health dashboard (Q10, Q44, Q54, Q62)
- FR-201..220: REST API surface + threat model + retry semantics (Q9, Q41)
- FR-221..240: Test strategy + benchmark CI gate + chaos tests (Q11, Q14, Q46, Q55)
- FR-241..260: Migrations M64/M65 + rollback + retention partitioning (Q12, Q28, Q43, Q51, Q57, Q63)
- FR-261..275: Backup/DR + runbooks + bulk policy promotion (Q60, Q61)
- FR-276..285: Self-observability + ingest admission control (Q45, Q47, Q48)
- FR-286..295: Concurrent-edit safety + DST handling + retention sweep (Q46, Q63, Q66)
- FR-296..305: **UI/UX coverage — Playwright e2e**: every new operator journey introduced by SPEC-008 (Cost Tracker → Governance tab landing/empty/populated/loading/error states, dispatch diagnostic feed pagination + filter, system health dashboard read-only and one-click recovery affordances, override grant happy-path + 409/422/423 error responses, blackout/degraded window create/edit/delete with ETag concurrency conflict, bulk policy promotion typed-confirmation flow, calibration milestone progression view, Aegis emergency-reserve indicator, telemetry health drilldown, FEATURE_RESOURCE_GOVERNANCE OFF byte-compat regression check) MUST have a Playwright spec under `tests/e2e/` AND emit visual snapshots via `@visualproviderprovider-neutral Playwright capture`. Coverage target: 100% of newly introduced operator paths; verified by `pnpm test:e2e:visual-manifest`.
- FR-306..315: **UI/UX coverage — Storybook visual regression**: every new React component or extended component (Governance tab subcomponents, system health card, diagnostic feed row, override grant form, window editor, budget utilization chart, WIP indicator panel, telemetry source health pill, breaker-open banner, Aegis emergency-reserve badge) MUST ship with a `*.stories.tsx` file rendering each meaningful state (default/loading/error/empty/dense data/disabled-by-flag) AND be captured by visual regression via `pnpm test:visual:storybook`. Storybook coverage target: 100% of newly authored components have stories; `pnpm test:visual:manifest` MUST pass.
- FR-316..325: **Feature-flag matrix activation tests**: SPEC-008's test suite MUST exercise the full feature-flag matrix declared in `src/lib/feature-flags.ts` (FEATURE_WORKSPACE_SWITCHER, FEATURE_GLOBAL_AEGIS, FEATURE_TASK_PIPELINES, FEATURE_TWO_STEP_TERMINAL, FEATURE_AREA_LABEL_ROUTING, FEATURE_DISPOSITION_LOGGING, FEATURE_TASK_ARTIFACTS, FEATURE_RESOURCE_GOVERNANCE, FEATURE_OPENCLAW_HEALTH_COSTS) at unit, integration, and e2e levels. The matrix MUST cover: (a) each flag OFF in isolation (legacy parity); (b) each flag ON in isolation where its `enableRequires` chain permits; (c) all flags ON together (production-fully-on baseline); (d) the documented `enableRequires` dependency chains (FEATURE_GLOBAL_AEGIS requires FEATURE_WORKSPACE_SWITCHER; FEATURE_TASK_PIPELINES requires FEATURE_GLOBAL_AEGIS; etc.); (e) the SPEC-008-specific gate matrix where FEATURE_RESOURCE_GOVERNANCE controls evaluator activation and FEATURE_OPENCLAW_HEALTH_COSTS controls health adapter activation; (f) one Playwright e2e per flag confirming the gated UI surface renders correctly under both OFF and ON, including the FEATURE_RESOURCE_GOVERNANCE=OFF byte-compat path that hides the Governance tab entirely; (g) `resolveFlag` env-override semantics ('0' forces OFF; '1' does NOT force ON) per CLAUDE.md pitfall.

### Constraints

- **No new heavy DB deps** (Postgres, ClickHouse, Redis, S3 prohibited per CLAUDE.md).
- **No SDK calls in v1** — operator preference, but data path may include OpenClaw-derived metered traffic; classify per event/account.
- **Sub-25ms p95 admission latency** on Ryzen 5900XT + 64GB RAM.
- **Single-process Node.js** with better-sqlite3.
- **Strict scope** enforced via tsconfig.spec-strict.json + ESLint.
- **Install compatibility** preserved when FEATURE_RESOURCE_GOVERNANCE=false.

### Out of Scope

- Tenant-aware gateway isolation (V2-001).
- Off-the-shelf observability stacks (Langfuse, Helicone, Phoenix, Lunary).
- LiteLLM Proxy for SDK-call enforcement (deferred to v2).
- @traceloop/node-server-sdk OpenLLMetry-JS auto-instrumentation (deferred to v2 when MC makes SDK calls).
- Web-UI scraping of provider quota dashboards.
- Retroactive task cancellation when budget exceeds mid-execution.
- Multi-region / multi-node deployment.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | **325** (FR-001..FR-325) |
| User Stories | **9** (US1..US9; US9 NON-NEGOTIABLE per Principle XIV) |
| Acceptance Scenarios (G/W/T) | **29** |
| Success Criteria (SC) | **18** |
| Edge Cases | **11** |
| Key Entities | **15** |
| AC count | 12 P7-AC + AC-Race-1 + AC-Drift-1..3 + AC-Aegis-1..6 + AC-DR-1..4 + AC-Retention-1..3 + AC-Bench-1 + AC-Soak-1 + AC-DST-1 + AC-UI-Playwright-1 + AC-UI-Visual-Playwright-1 + AC-UI-Storybook-1 + AC-UI-Visual-Storybook-1 + AC-FF-Matrix-1..4 |
| `[NEEDS CLARIFICATION]` markers | **0** |
| Q-number coverage | **100%** (Q1-Q73) |
| Principle XIV citations | 17 |
| Principle V citations | 17 |
| Principle I citations | 8 |
| Principle VII citations | 3 |
| **G1 status** | ✅ PASS |

### Files Generated

- [x] `specs/008-resource-governance/spec.md` (660 lines, 83 KB)
- [x] `specs/008-resource-governance/checklists/requirements.md` (69 lines)
- [x] `.specify/feature.json` updated (pointer → 008-resource-governance)

### Traceability Markers

Use `[Q<n>]` markers in spec.md to cross-reference design concept (e.g., `[Q17]` for budget ledger; `[Q42]` for Aegis soft default).

---

## Phase 2: Clarify (4 Sessions)

**Best Practice:** Maximum 5 targeted questions per session.

### Session 1: Ingestion Contracts and Verification Spikes

```bash
/speckit.clarify Focus on multi-source ingestion contracts:
- Verify `claude -p` (subprocess mode) emits `claude_code.*` OTel under CLAUDE_CODE_ENABLE_TELEMETRY=1 [Q16, [VERIFY]]
- Verify `claude mcp serve` OTel emission [Q16, [VERIFY]]
- Verify `codex exec --json` stdout `turn.completed.usage` events [Q23, Q39, [VERIFY]]
- Verify `codex` stdout↔rollout share identical `provider_timestamp_ms` (Q39 high-confidence join precondition) [Q52]
- Verify Copilot CLI in CI mode writes events.jsonl without TTY [Q25, [VERIFY]]
```

### Session 2: Evaluator and Reservation Semantics

```bash
/speckit.clarify Focus on enforcement semantics:
- token_pricing table promotion: DB table (M66) vs hot-reloadable JSON catalog [Open Q1]
- reservation cleanup: scheduler tick reaper vs task-completion handler vs idempotent expiry-based [Open Q2]
- Ollama proxy port: 11435 confirmed free; document fallback procedure if collision [Open Q3]
- Drift verification "operator-confirmed rebuild" vs "auto-repair under threshold": exact thresholds [Q36, Q40]
- Subscription tier renewal detection cadence: cron vs trigger-based [Open Q6]
```

### Session 3: Telemetry Trust Model

```bash
/speckit.clarify Focus on trust boundaries:
- otelcol-contrib version pinning + integrity checksum [Open Q4]
- MC API key provisioning for collector auth [Open Q5]
- Codex `provider_timestamp_ms` parity assumption: spike script (Q52) results inform whether Q39 stays high-confidence or downgrades to medium [Q39, Q52]
- Copilot 2026-06-01 AI Credits transition: schema-version field design, parser version-pinning strategy [Open Q7]
- Ingest admission control thresholds: per-source rate limits, burst limits, disk-free guardrail values [Q47]
```

### Session 4: UI / Operator Workflow

```bash
/speckit.clarify Focus on operator UX:
- Bulk policy promotion: typed-confirmation phrasing, multi-workspace selection UI [Q56]
- System health dashboard one-click recovery affordances: which require typed confirmation [Q62]
- Dispatch diagnostic feed pagination + retention (30 days per Q43; refine?) [Q44, Q54]
- Backup/DR operator runbook: backup destination defaults, off-node mirroring requirements [Q60]
- Per-failure-mode runbook page review: ensure each maps to operator-actionable steps [Q61]
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Ingestion verification | 5/5 (Q1-Q5) ✅ | FR-079a/b OTLP auth contract (3-of-3 consensus Option A); FR-071/FR-071b split for `claude mcp serve` transcript replay (low-med B); FR-082 Codex enforcement_eligibility downgrade contract; FR-083 Copilot schema_broken store-with-flag (high-conf A); FR-090a spike evidence file CI gate |
| 2 | Enforcement semantics | 5/5 (Q1-Q5) ✅ | FR-260a token_pricing M66 (DB table); FR-063/064 idempotent releaseReservation primitive (Q66); FR-260b Ollama proxy port resolution (env-config + 11435-11445 fallback); FR-057 drift tiers (1%/$0.50 floor / 50% hard-block); FR-134a entitlement detection cadence (daily cron + 6h near-expiry + 7d on-admission) |
| 3 | Trust model | 5/5 (Q1-Q5) ✅ | FR-090b otelcol-contrib v0.108.0 pin + cosign + quarterly refresh; FR-090c collector API key via dedicated agent_api_keys row + 1Password (no new schema); FR-090d Copilot parser version pin + AI Credits transition; FR-090e Q47 numerics ladder + bytes/sec defaults + env override; FR-090f/g collector config audit trail + filestorage WAL backup |
| 4 | Operator UX | 5/5 (Q1-Q5) ✅ | FR-090h bulk-promote phrases + single-workspace; FR-090i System Health gesture matrix (typed for irreversible); FR-090j dispatch feed cursor-pagination + SSE live-append; FR-090k backup local-default + off-node optional + GPG opt-in; FR-090l/m runbook page structure + chaos-test gate |

### Consensus Resolution Log

| Session/Domain | Item | Round | Routed Categories | Analysts Used | Outcome | Confidence |
|----------------|------|-------|-------------------|---------------|---------|------------|
| Session 1 / Q1 | Spike evidence file schema | Direct (executor) | [domain, codebase] | (executor recommendation accepted) | Applied: FR-090a CI gate | high |
| Session 1 / Q2 | Codex stdout↔rollout downgrade contract | Direct (executor) | [domain, codebase] | (executor recommendation accepted) | Applied: FR-082 amended | high |
| Session 1 / Q3 | OTLP receiver auth + rate-limit | Round 1 | [security, domain] | codebase + spec + domain (security forced full fan-out) | 3-of-3 Option A: reuse global x-api-key via requireRole; FR-079a/b applied | high |
| Session 1 / Q4 | Copilot T2-fail event handling | Round 1 | [domain] | domain | high-confidence A; FR-083 amended | high |
| Session 1 / Q5 | Claude `mcp serve` OTel emission | Round 1 | [domain] | domain | low-medium B (transcript replay authoritative); FR-071b added; spike will resolve at runtime via FR-090a | medium |
| Session 2 / Q1 | token_pricing promotion | Direct (executor) | [codebase, spec] | (executor; 8th-layer review accepted) | Applied: FR-260a (DB table M66, scope_kind+scope_id, facility default + workspace override) | high |
| Session 2 / Q2 | Reservation cleanup primitive | Direct (executor) | [codebase, spec] | (executor) | Applied: FR-063/FR-064 idempotent releaseReservation shared by reaper/completion/revoke | high |
| Session 2 / Q3 | Ollama proxy port collision | Direct (executor) | [codebase, domain] | (executor) | Applied: FR-260b env-configurable + 11435-11445 fallback + runtime-config.json | high |
| Session 2 / Q4 | Drift thresholds | Direct (executor) | [codebase, spec] | (executor) | Applied: FR-057 tiered (1%/$0.50 floor / 50% hard-block); policy_config_json overridable | high |
| Session 2 / Q5 | Renewal detection cadence | Direct (executor) | [domain] | (executor) | Applied: FR-134a hybrid (daily 00:15 UTC + 6h near-expiry + on-admission stale) | high |
| Session 3 / Q1 | otelcol-contrib pin | Direct (executor) | [domain, codebase] | (executor; cosign-verified upstream supply chain) | Applied: FR-090b v0.108.0 + cosign + quarterly refresh | medium |
| Session 3 / Q2 | Collector API key | Direct (executor) | [codebase, security] | (executor; security-flagged but evidence strong) | Applied: FR-090c dedicated agent_api_keys row + 1Password | high |
| Session 3 / Q3 | Copilot AI Credits parser | Direct (executor) | [domain, codebase] | (executor; pre-cutover speculative) | Applied: FR-090d config-version-first + payload-shape verify + parser_version column | medium |
| Session 3 / Q4 | Q47 numerics ladder | Direct (executor) | [domain, codebase] | (executor) | Applied: FR-090e amber/red ladder + bytes/sec + env override | high |
| Session 3 / Q5 | Collector bootstrap/config | Direct (executor) | [codebase, domain] | (executor) | Applied: FR-090f/g MC-managed config + audit trail + filestorage WAL backup | high |
| Session 4 / Q1 | Bulk-promote phrases + workspace scope | Direct (executor) | [spec, security] | (executor) | Applied: FR-090h `PROMOTE TO SOFT/HARD` exact + single-workspace + cross-ws 422 | high |
| Session 4 / Q2 | System Health gesture matrix | Direct (executor) | [spec, ambiguous] | (executor) | Applied: FR-090i per-affordance gesture matrix (typed for irreversible) | medium |
| Session 4 / Q3 | Dispatch feed pagination | Direct (executor) | [spec] | (executor) | Applied: FR-090j cursor pagination + SSE live-append + 7-90d retention range | high |
| Session 4 / Q4 | Backup destination + encryption | Direct (executor) | [spec, security] | (executor) | Applied: FR-090k local-default + off-node optional + GPG opt-in + System Health pill | medium |
| Session 4 / Q5 | Runbook structure + chaos-test | Direct (executor) | [spec, codebase] | (executor) | Applied: FR-090l/m page structure + anchor convention + chaos-test gate | high |

---

## Phase 3: Plan

```bash
/speckit.plan

## Tech Stack

- TypeScript 5.7 strict (existing project tsconfig + tsconfig.spec-strict.json for SPEC-008 modules)
- Next.js 16 App Router; Route Handlers for /api/otlp/v1/{traces,metrics}, /api/resource-{policies,policy-events,overrides}, /api/governance/{system-health,diagnostic,ingest/<source>/resume,system-health/rebuild,...}
- React 19 + Tailwind 3 for Cost Tracker → Governance tab + System Health dashboard
- better-sqlite3 (single-process synchronous transactions); separate Database connections per workload class (Q29: foreground/background/audit)
- @opentelemetry/otlp-transformer for OTLP/HTTP protobuf decode in MC OTLP receiver
- Zod for REST request validation (Q41)
- Native Node fs.watch + inotify for file-based ingestion adapters (Codex rollout, Claude Code transcript, Copilot events.jsonl, OpenClaw health)
- Vitest for unit + integration + benchmark + chaos tests
- Playwright for governance UI e2e (1-3 tests per Q14)
- otelcol-contrib (operator-managed systemd unit on the operator node; not in repo)

## Constraints

- No new heavy DB deps (forbidden by CLAUDE.md and Q16 rejected stacks list)
- No SDK call instrumentation in v1 (Q42)
- Sub-25ms p95 admission latency under realistic load (Q11, Q35)
- FEATURE_RESOURCE_GOVERNANCE=false preserves byte-compat (P7-AC1)
- All seeded defaults `enforce_mode='shadow'` (Q4)
- Aegis emergency reserve `enforce_mode='soft'` by default (Q42 — peer review correction)
- Strict-scope guard updated per Q-section file list

## Architecture Notes

Re-read `docs/ai/specs/SPEC-008-design-concept.md` Q1-Q66 for design rationale.

Key architectural separations:
- Synchronous budget ledger (resource_budget_ledger + resource_budget_counters) is admission-control source-of-truth (Q17, Q27, Q35)
- Eventually-consistent telemetry pipeline (raw_usage_events → canonical_usage_events via batched reconciler) writes correction entries to ledger (Q18, Q24, Q30)
- Posted-effect tracking (canonical_budget_effects) ensures dedup/repair lifecycle without ledger history rewrites (Q30)
- Foreground (50ms busy_timeout) / background (5s) / audit (30s) DB connections (Q29)
- Atomic counter conditional UPDATE (Q35) for admission; split reservation/release/consumption queries (Q50)
- Persistent circuit breaker with deterministic mode during migrations (Q21)
- Local health channel independent of OTel collector (Q48)
- Bounded ingest admission control with token-bucket per source (Q47)
- Monthly archive partitioning for raw_usage_events retention (Q51)
- M65 split into 13 dependency-ordered sub-migrations M65a..M65m (Q57)
- Async chunked counter rebuild jobs (Q49)
- Per-failure-mode runbook deliverables (Q61); System Health dashboard (Q62)

Plan-phase verification spikes (REQUIRED before tasks generation):
- `scripts/verify-claude-code-otel-emission.ts`: confirms `claude -p` emits OTel
- `scripts/verify-claude-mcp-otel-emission.ts`: confirms (or refutes) `claude mcp serve` emits OTel
- `scripts/verify-codex-stdout-rollout-timestamp-parity.ts`: Q52 high-vs-medium-confidence determination
- `scripts/verify-copilot-events-ci.ts`: confirms Copilot writes events.jsonl in non-interactive mode

## Success Criteria

12 P7-AC + 30+ augmented ACs (see Specification Context above). All ACs map to Q-numbers in design concept.

## Constitution Check

Run before G3: typecheck, lint, test, build all green. Strict scope diff matches expected file list. No new heavy DB deps.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | ⏳ | Architecture overview |
| `research.md` | ⏳ | Resolved topics R-001..R-020+ (one per major Q-section family) |
| `data-model.md` | ⏳ | 13+ new tables; foreign keys; index strategy |
| `contracts/` | ⏳ | OpenAPI for /api/resource-{policies,overrides,policy-events}, /api/otlp/v1/*, /api/governance/* |
| `quickstart.md` | ⏳ | Operator onboarding: collector setup, default policies, calibration |

---

## Phase 4: Domain Checklists

6 domains recommended based on spec scope (5 original + ui-coverage):

### 1. data-integrity Checklist

```bash
/speckit.checklist data-integrity

Focus on SPEC-008 requirements:
- M65a..M65m migration ordering, FK constraints, idempotency
- Append-only ledger: detect tampering, hash chain consideration
- Two-layer raw + canonical model dedup: same request_id never produces additive double-count
- Codex cumulative-to-delta with generation_id reset boundaries
- Reservation atomicity: BEGIN IMMEDIATE + atomic conditional UPDATE
- Counter drift detection + auto-repair vs manual rebuild
- Pay special attention to: race conditions in 5 concurrent override grants for last $1 (AC-Race-1)
```

### 2. error-handling Checklist

```bash
/speckit.checklist error-handling

Focus on SPEC-008 requirements:
- evaluator throws → defer (not block); audit row + activity + notification + circuit breaker
- ingest path: rate limit, payload oversize, schema_broken, schema_malicious, disk_full
- Copilot schema-broken with 0h..7d escalation ladder
- Backfill window failure: max_duration_seconds + manual retry
- Aegis: emergency reserve exhausted → local mode → deferred_no_fallback if LM Studio absent
- Counter rebuild contention: shadow_due_to_counter_rebuild during async rebuild
- Pay special attention to: every failure mode has a runbook page (Q61)
```

### 3. api-contracts Checklist

```bash
/speckit.checklist api-contracts

Focus on SPEC-008 requirements:
- POST /api/resource-overrides: 201/200/409/423/422 status codes with retryable: boolean
- /api/otlp/v1/{traces,metrics}: protobuf decode, auth, error responses
- Concurrent edit: ETag-based optimistic concurrency on /api/resource-policies PUT
- Bulk policy promotion: typed confirmation requirements
- All endpoints scope through resolveFlag(name, ctx); flag-OFF returns empty arrays
- /api/governance/system-health and /api/governance/diagnostic: read shapes
- Rate limiting on /api/resource-overrides: per-operator rate limit
- Pay special attention to: input validation (Zod) on all operator-supplied fields per Q41
```

### 4. performance Checklist

```bash
/speckit.checklist performance

Focus on SPEC-008 requirements:
- Admission p50<5ms, p95<15ms, p99<25ms via Q11/Q35 architecture
- Atomic counter conditional UPDATE pattern (Q35) — no SELECT-then-UPDATE
- Foreground busy_timeout=50ms; background workers throttle when admission p95>25ms
- Reconciler batched: bounded transactions; never block admission
- Backfill 12K rows/min throughput without blocking foreground
- Drift verification incremental + sampled
- Soak test: 30min sustained 100 admission/sec without regression
- Pay special attention to: AC-Bench-1 with 1k policies + 300K ledger rows
```

### 5. security Checklist

```bash
/speckit.checklist security

Focus on SPEC-008 requirements:
- Override grants: idempotency key, expires_at ≤24h, sanitized reason
- Threat model: schema_broken (Q25) vs schema_malicious (Q41)
- Quarantined raw events: oversized payloads, malicious shapes
- Auth: operator session OR Aegis service token; no header injection
- Audit log integrity: append-only convention + Q63 retention guards
- Per-operator override rate limit: prevent abuse
- License compliance: all deps Apache-2.0/MIT/BSD compatible
- Pay special attention to: provider_accounts.config_json validation (Zod schema; max 10KB; no prototype pollution)
- ToS compliance: copilot_internal/user usage; document review
```

### 6. ui-coverage Checklist

```bash
/speckit.checklist ui-coverage

Focus on SPEC-008 requirements:
- Every new operator UI journey has a Playwright e2e spec under tests/e2e/ (Governance tab states, dispatch diagnostic feed, system health dashboard, override grant happy + 409/422/423 paths, window CRUD with ETag conflict, bulk policy promotion typed-confirmation, calibration milestones, Aegis emergency-reserve indicator, telemetry health drilldown, FEATURE_RESOURCE_GOVERNANCE OFF regression)
- Every new React component has a `*.stories.tsx` covering default/loading/error/empty/dense/disabled-by-flag states
- visual snapshots emitted from BOTH Playwright provider-neutral capture AND Storybook (via Storycap + vitest.storybook.config.ts)
- `pnpm test:e2e:visual-manifest` and `pnpm test:visual:manifest` are wired into PR CI
- Feature-flag matrix coverage: every flag in FEATURE_FLAG_KEYS (FEATURE_WORKSPACE_SWITCHER, FEATURE_GLOBAL_AEGIS, FEATURE_TASK_PIPELINES, FEATURE_TWO_STEP_TERMINAL, FEATURE_AREA_LABEL_ROUTING, FEATURE_DISPOSITION_LOGGING, FEATURE_TASK_ARTIFACTS, FEATURE_RESOURCE_GOVERNANCE, FEATURE_OPENCLAW_HEALTH_COSTS) is exercised in OFF, ON, dependency-chain, and all-on configurations across unit / integration / e2e / Playwright / Storybook
- Storybook stories include flag-aware variants (default, OFF, ON) using a flag-mocking decorator
- Visual snapshot baseline approval flow documented for first PR (visual regression accept-baseline procedure)
- Accessibility coverage: axe-core run inside Playwright for each new journey; WCAG 2.1 AA failures block PR merge
- Pay special attention to: visual regression false-positive triage workflow; baseline rotation policy; GitHub Pages baseline publishing in CI
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | (target ~70) | | Q6, Q17, Q18, Q19, Q24, Q26, Q27, Q28, Q30, Q34, Q40, Q49, Q57 |
| error-handling | (target ~70) | | Q5, Q20, Q21, Q25, Q31, Q37, Q42, Q47, Q53, Q59 |
| api-contracts | (target ~75) | | Q9, Q41, Q44, Q46, Q54, Q56, Q62 |
| performance | (target ~60) | | Q11, Q24, Q29, Q35, Q43, Q46, Q51 |
| security | (target ~70) | | Q41, Q47, Q60, Q61 + peer-review-round-3 findings |
| ui-coverage | (target ~50) | | FR-296..325; AC-UI-*, AC-FF-* |
| **Total** | (target ~395) | | |

---

## Phase 5: Tasks

```bash
/speckit.tasks

## Task Structure

- Small, testable chunks (1-2 hours each for human; LLM agent will batch)
- Clear acceptance criteria referencing FR-xxx and Q-numbers
- Dependency ordering: foundation → user story 1 → user story 2 → polish → verification
- Mark parallel-safe tasks explicitly with [P]
- Mark TDD red phase tasks with [T-RED]
- Verification spikes go FIRST (before tasks that depend on their results)

## Implementation Phases

1. **Phase 0: Plan-phase verification spikes** — claude -p OTel, claude mcp serve OTel, codex stdout↔rollout timestamp parity, Copilot CI events.jsonl
2. **Phase 1: Foundation** — types, M64 + M65a..M65m migrations (13 sub-migrations), strict-scope guard, db connection pool helper, governance.json default config
3. **Phase 2: Budget ledger + counters** (US US1, US2 partial) — resource_budget_ledger, resource_budget_counters, atomic admission UPDATE, split reservation/release/consumption queries, drift verification job
4. **Phase 3: Raw + canonical telemetry** (US US7) — raw_usage_events, canonical_usage_events, canonical_usage_sources, snapshot model, batched reconciler, source emission registry
5. **Phase 4: Multi-source ingestion adapters** — OTLP receiver, codex-stdout-tail, codex-rollout-tail, claude-code-transcript-tail, copilot-events-ingester (with schema validation), openclaw-quota-bridge, openclaw-health-costs
6. **Phase 5: Provider accounts + entitlements + billing-mode detection** (US US7) — promote provider-subscriptions.ts to DB-backed; per-CLI detection priority; flat_rate skip in evaluator
7. **Phase 6: Aegis starvation prevention** (US US4 partial) — emergency reserve seed policy, getAegisFallbackCapabilities probe, degraded mode, break-glass override
8. **Phase 7: Override grants + reservation atomicity** (US US4) — resource_overrides table, atomic grant transaction, idempotency, HTTP status contract, reaper
9. **Phase 8: Circuit breaker + deterministic mode** — resource_governance_breaker, persistent state, restart safety, chronic alert
10. **Phase 9: Cost Tracker UI** (US US5, US6) — Governance tab, System Health dashboard, dispatch diagnostic view, telemetry health panel, bulk promotion flow
11. **Phase 10: Backup/DR + runbooks** (US US8) — backup-mc-db.sh script, post-restore counter rebuild, 10 runbook pages, retention sweep default-on
12. **Phase 11: Self-observability + ingest admission control** — governance_health_events, ingest_rate_state, quarantined_raw_events, mc.governance.* metrics
13. **Phase 12: Test coverage (backend)** — TDD red-green for all FRs, benchmark CI gate, chaos tests for collector failure, soak test, DST AC, concurrent-edit AC
14. **Phase 12B: UI/UX test coverage (Playwright + Storybook + visual regression)** (US US9) — for EVERY new operator journey introduced by SPEC-008: write a Playwright spec under `tests/e2e/SPEC-008-*` covering default/loading/error/empty/dense and FEATURE_RESOURCE_GOVERNANCE OFF/ON variants; emit visual snapshots via providerprovider-neutral Playwright capture. For EVERY new React component: write a `*.stories.tsx` covering default/loading/error/empty/dense/disabled-by-flag states; emit visual snapshots via Storycap. Wire CI to run `pnpm test:e2e:visual-manifest` and `pnpm test:visual:manifest`. Add axe-core a11y assertions to each Playwright spec (WCAG 2.1 AA). Document visual baseline approval procedure for the first PR. Mandatory paths: Cost Tracker → Governance tab (all states), dispatch diagnostic feed, system health dashboard, override grant happy + 409/422/423 paths, window CRUD with ETag conflict, bulk policy promotion typed-confirmation, calibration milestones view, Aegis emergency-reserve indicator, telemetry health drilldown, FEATURE_RESOURCE_GOVERNANCE OFF byte-compat regression.
15. **Phase 12C: Feature-flag matrix tests** (US US9) — implement a flag-matrix test harness that programmatically toggles each entry in `src/lib/feature-flags.ts FEATURE_FLAG_KEYS` (currently 9 flags: FEATURE_WORKSPACE_SWITCHER, FEATURE_GLOBAL_AEGIS, FEATURE_TASK_PIPELINES, FEATURE_TWO_STEP_TERMINAL, FEATURE_AREA_LABEL_ROUTING, FEATURE_DISPOSITION_LOGGING, FEATURE_TASK_ARTIFACTS, FEATURE_RESOURCE_GOVERNANCE, FEATURE_OPENCLAW_HEALTH_COSTS). Coverage matrix MUST exercise: (a) each flag OFF in isolation; (b) each flag ON in isolation where `enableRequires` permits; (c) all flags ON; (d) `enableRequires` dependency chains (FEATURE_GLOBAL_AEGIS→FEATURE_WORKSPACE_SWITCHER, FEATURE_TASK_PIPELINES→FEATURE_GLOBAL_AEGIS, plus SPEC-008 prerequisite chains); (e) `resolveFlag` env-override semantics ('0' forces OFF; '1' does NOT force ON); (f) one Playwright spec per flag confirming OFF/ON UI gating. Test layers: unit (resolveFlag), integration (each flag ON behavior), e2e (Playwright UI gating), Storybook (flag-aware story variants). At minimum 9 unit × 9 integration × 9 e2e + 1 all-on baseline + 1 all-off legacy parity baseline.
16. **Phase 13: Polish + verification + documentation** — docs/observability/* setup guides, docs/runbook/*, docs/feature-flags-runbook.md update (add FEATURE_RESOURCE_GOVERNANCE + FEATURE_OPENCLAW_HEALTH_COSTS rows + matrix-test reference), docs/orchestration.md cross-ref, FULL_VERIFY

## Constraints

- All new modules in src/lib/observability/ go to tsconfig.spec-strict.json
- All migrations idempotent; M65a..M65m in dependency order with PRAGMA foreign_key_check at end
- Backend tests in src/lib/__tests__/ + src/app/api/**/__tests__/
- Frontend components in src/components/panels/ (extend cost-tracker-panel.tsx; do not create new top-level panel)
- benchmark file dedicated: src/lib/__tests__/resource-governance-benchmark.test.ts
- Soak test in scripts/soak-test/ runs nightly on self-hosted runner
```

### Tasks Results

| Metric | Target |
|--------|-------|
| **Total Tasks** | ~340-420 (incl. ~50 verification spikes + benchmark + soak + chaos + ~60 UI Playwright/Storybook/visual regression + ~30 feature-flag matrix) |
| **Phases** | 16 |
| **Parallel Opportunities** | High in Phase 4 (4 adapters), Phase 9 (UI components), Phase 12 (backend tests), Phase 12B (UI tests), Phase 12C (FF matrix) |
| **User Stories Covered** | 9/9 |

---

## Phase 6: Analyze

```bash
/speckit.analyze

Focus on:
1. Constitution alignment — TypeScript strict in tsconfig.spec-strict.json, no new heavy DB deps, single-process SQLite preserved
2. Coverage gaps — every FR has tasks; every Q-number traceable; every AC has at least one verification task
3. Consistency between task file paths and actual project structure (src/lib/observability/, src/app/api/otlp/v1/, src/app/api/resource-*, src/app/api/governance/*)
4. Verify P1 user stories have complete task coverage; verify verification spikes are scheduled BEFORE dependent tasks
5. Cross-check design concept Q-numbers vs spec FRs vs plan vs tasks for drift
```

### Analyze Severity Levels

| Severity | Action |
|---|---|
| `CRITICAL` | Must fix before G6 |
| `HIGH` | Should fix |
| `MEDIUM` | Review and decide |
| `LOW` | Note for future |

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| (TBD after run) | | | |

---

## Phase 7: Implement

```bash
/speckit.implement

## Approach: TDD-First with Verification-Spike-First Ordering

For each task:

1. **VERIFY** (verification spikes only): run probe; document findings; downgrade Q39 to medium-confidence if Codex parity fails
2. **RED**: Write failing test defining expected behavior
3. **GREEN**: Implement minimum code to make test pass
4. **REFACTOR**: Clean up while tests still pass
5. **VERIFY**: Manual verification of acceptance criteria

### Pre-Implementation Setup

Before starting any task:
1. Ensure development environment is running: `pnpm dev`
2. Verify all tests pass before making changes: `pnpm test:all`
3. Verify on the right branch: `git rev-parse --abbrev-ref HEAD` should be `008-resource-governance`
4. Strict scope guard active: tsconfig.spec-strict.json present
5. Re-read design concept: `docs/ai/specs/SPEC-008-design-concept.md`

### Implementation Notes

- **better-sqlite3 transactions**: ALWAYS use `db.transaction(fn).immediate(args)` for write paths; never `db.transaction(fn)(args)` (deferred default)
- **Counter UPDATE pattern**: Q35 atomic conditional UPDATE; never SELECT-then-UPDATE
- **Reservation/release/consumption**: three separate queries per Q50; never signed amount with one query
- **Foreground vs background DB connections**: getForegroundDb() / getBackgroundDb() / getAuditDb() per Q29
- **ON CONFLICT DO NOTHING** for canonical_usage_sources idempotency (Q18) and freshness upserts (Q32)
- **Cumulative deltas**: per Q19 generation_id rules; new generation = new baseline; same generation negative delta = stream_corrupt
- **Codex high-confidence join**: subject to Q52 spike result; downgrade to medium if needed
- **PRAGMA settings**: WAL mode + busy_timeout per connection per Q29
- **Strict scope**: all new files in src/lib/observability/ must be in tsconfig.spec-strict.json BEFORE first commit
- **No SDK calls**: do not add Anthropic SDK or OpenAI SDK to package.json in v1
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 0 - Verification spikes | (TBD) | | |
| 1 - Foundation | (TBD) | | |
| 2 - Budget ledger + counters | (TBD) | | |
| 3 - Raw + canonical telemetry | (TBD) | | |
| 4 - Multi-source adapters | (TBD) | | |
| 5 - Provider accounts | (TBD) | | |
| 6 - Aegis starvation prevention | (TBD) | | |
| 7 - Override grants | (TBD) | | |
| 8 - Circuit breaker | (TBD) | | |
| 9 - Cost Tracker UI | (TBD) | | |
| 10 - Backup/DR + runbooks | (TBD) | | |
| 11 - Self-observability | (TBD) | | |
| 12 - Test coverage (backend) | (TBD) | | |
| 12B - UI/UX coverage (Playwright + Storybook + visual regression) | (TBD) | | US9; FR-296..315; AC-UI-* |
| 12C - Feature-flag matrix tests | (TBD) | | US9; FR-316..325; AC-FF-* |
| 13 - Polish + verification | (TBD) | | |

---

## Post-Implementation Checklist

- [ ] All tasks marked complete in tasks.md
- [ ] Linting passes: `pnpm lint`
- [ ] Typecheck passes: `pnpm typecheck`
- [ ] Tests pass: `pnpm test`
- [ ] e2e passes: `pnpm test:e2e`
- [ ] Build succeeds: `pnpm build`
- [ ] Storybook builds clean: `pnpm build-storybook`
- [ ] Storybook visual tests pass: `pnpm test:visual:storybook`
- [ ] Storybook visual manifest verified: `pnpm test:visual:manifest`
- [ ] Playwright visual manifest verified: `pnpm test:e2e:visual-manifest`
- [ ] 100% Playwright coverage of new operator journeys (audit script in `tests/e2e/SPEC-008-coverage-audit.ts` reports zero missing journeys)
- [ ] 100% Storybook coverage of new components (audit script reports zero missing stories)
- [ ] Feature-flag matrix tests green for all 9 flags (unit + integration + e2e + Storybook variants)
- [ ] Benchmark CI gate passes: `pnpm test:bench` (p50<5ms, p95<15ms, p99<25ms)
- [ ] Soak test passes (nightly on perf runner): `pnpm test:soak`
- [ ] All 10 runbook pages reviewed by operator
- [ ] Backup/DR procedure tested per AC-DR-1..4
- [ ] All M65a..M65m migrations rerun-safe; rollback SQL files present
- [ ] FEATURE_RESOURCE_GOVERNANCE=false: smoke test confirms byte-compat
- [ ] FEATURE_RESOURCE_GOVERNANCE=true with default policies: smoke test confirms no behavior change (all shadow)
- [ ] Cost Tracker UI Governance tab functional (manual + Playwright e2e)
- [ ] System Health dashboard functional
- [ ] Dispatch diagnostic view functional
- [ ] Calibration phase milestones documented
- [ ] PR created and reviewed
- [ ] Merged to main branch

---

## Lessons Learned

### What Worked Well

- (TBD post-implementation)

### Challenges Encountered

- (TBD)

### Patterns to Reuse

- (TBD)

---

## Project Structure Reference

```
.worktrees/008-resource-governance/
├── docs/
│   ├── ai/specs/
│   │   ├── SPEC-008-design-concept.md      # 66 design decisions Q1-Q66
│   │   ├── SPEC-008-workflow.md            # this file
│   │   ├── SPEC-008-peer-review-round-1.md # distributed-systems lens
│   │   ├── SPEC-008-peer-review-round-2.md # SRE/operator lens
│   │   ├── SPEC-008-peer-review-round-3.md # security/compliance lens
│   │   └── autopilot-state.json
│   ├── observability/                      # operator setup guides (NEW)
│   ├── runbook/                            # 10 per-failure-mode pages (NEW)
│   ├── feature-flags-runbook.md            # extended for FEATURE_RESOURCE_GOVERNANCE
│   └── migrations/                         # rollback SQL files M64 + M65a..M65m
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── resource-policies/route.ts          # NEW
│   │   │   ├── resource-policy-events/route.ts     # NEW
│   │   │   ├── resource-overrides/route.ts         # NEW
│   │   │   ├── otlp/v1/{traces,metrics}/route.ts   # NEW
│   │   │   ├── observe/copilot-session-end/route.ts # NEW
│   │   │   ├── governance/
│   │   │   │   ├── system-health/route.ts          # NEW
│   │   │   │   ├── diagnostic/route.ts             # NEW
│   │   │   │   └── ingest/[source]/resume/route.ts # NEW
│   │   │   ├── tokens/route.ts                     # extended
│   │   │   └── events/route.ts                     # extended for new event kinds
│   │   └── cost-tracker/page.tsx                   # extended (5th tab)
│   ├── components/panels/
│   │   ├── cost-tracker-panel.tsx                  # extended (Governance tab)
│   │   └── task-board-panel.tsx                    # extended (WIP indicators)
│   ├── lib/
│   │   ├── resource-governance.ts                  # NEW (evaluator)
│   │   ├── resource-budget-ledger.ts               # NEW
│   │   ├── resource-overrides.ts                   # NEW (atomic grants)
│   │   ├── resource-circuit-breaker.ts             # NEW (persistent)
│   │   ├── openclaw-health-costs.ts                # NEW
│   │   ├── provider-accounts.ts                    # NEW (extends provider-subscriptions.ts)
│   │   ├── db/connection-pool.ts                   # NEW (Q29)
│   │   ├── observability/
│   │   │   ├── index.ts
│   │   │   ├── codex-stdout-tail.ts
│   │   │   ├── codex-rollout-tail.ts
│   │   │   ├── claude-code-transcript-tail.ts
│   │   │   ├── copilot-events-ingester.ts
│   │   │   ├── openclaw-quota-bridge.ts
│   │   │   ├── ollama-response-capture.ts
│   │   │   ├── lmstudio-log-stream.ts
│   │   │   ├── gen-ai-attribute-mapper.ts
│   │   │   ├── usage-event-reconciler.ts
│   │   │   ├── snapshot-delta-computer.ts
│   │   │   ├── telemetry-freshness-tracker.ts
│   │   │   ├── price-catalog.ts
│   │   │   └── source-emission-registry.ts
│   │   ├── migrations.ts                           # extended (M64 + M65a..M65m)
│   │   ├── task-dispatch.ts                        # extended (4 evaluator gate sites)
│   │   ├── scheduler.ts                            # extended (Aegis emergency reserve check)
│   │   ├── sessions.ts                             # documentation update
│   │   └── token-pricing.ts                        # extended/replaced by price-catalog.ts
│   └── lib/__tests__/
│       ├── resource-governance-benchmark.test.ts   # CI gate
│       └── soak-test.test.ts                       # nightly
├── scripts/
│   ├── backup-mc-db.sh                             # NEW
│   ├── retention-sweep.ts                          # NEW
│   ├── raw-events-monthly-rollover.ts              # NEW
│   ├── verify-claude-code-otel-emission.ts         # spike
│   ├── verify-claude-mcp-otel-emission.ts          # spike
│   ├── verify-codex-stdout-rollout-timestamp-parity.ts  # spike
│   └── verify-copilot-events-ci.ts                 # spike
└── ~/.config/systemd/user/                         # operator-managed; not in repo
    └── otelcol-contrib.service                     # NEW
```

---

Template based on SpecKit best practices. SPEC-008 is operator-grilled, research-augmented, peer-reviewed (4 oracle adversarial + 3 peer review rounds, 60+ corrections), and ready for autopilot execution. Re-read the design concept doc before any phase that needs disambiguation.
