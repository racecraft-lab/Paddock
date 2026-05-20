# Implementation Plan: SPEC-009C4 - Owner Merge Gate and Done Reconciliation

**Branch**: `009c4-owner-merge-reconciliation` | **Date**: 2026-05-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/009c4-owner-merge-reconciliation/spec.md`

## Summary

SPEC-009C4 records the owner-only `G_PILOT_MERGE` checkpoint and proves that a linked PR-producing pilot task remains `ready_for_owner` until the operator manually merges the exact linked GitHub PR and runs the existing manual GitHub sync path. The implementation approach is narrow RED-first hardening around existing `pullFromGitHub` reconciliation, exact PR identity checks in `src/lib/github-sync-engine.ts`, `advanceTaskChain` only after verified `github_pr_merged` evidence, existing status/label/activity/notification surfaces, and text-only live smoke evidence in `docs/qa/pilot-smoke-checklist.md`.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22 with Next.js 16 App Router and React 19
**Primary Dependencies**: Next.js, React, Zustand where existing panels need it, Tailwind CSS 3, `better-sqlite3`, existing GitHub sync engine, native `fetch`, Vitest, ESLint, pnpm
**Storage**: SQLite through `better-sqlite3`; existing `tasks`, `activities`, `notifications`, `task_artifacts`, `quality_reviews`, workflow-template, label/status, and GitHub sync state only; no new schema
**Testing**: Vitest focused RED coverage first; Playwright only if an existing UI/smoke surface changes; `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` for full verification
**Target Platform**: Mission Control local/operator Next.js deployment and existing GitHub sync integration
**Project Type**: Web application with server-side API/library reconciliation paths
**Performance Goals**: Manual sync remains bounded by existing GitHub sync behavior; failed sync must produce failed-sync evidence with no terminal side effects; duplicate sync must be idempotent with no duplicate downstream launch, terminal activity, owner-action notification, reconciliation-required notification flood, or cleanup work
**Constraints**: Reuse `pullFromGitHub`, exact PR matching in `src/lib/github-sync-engine.ts`, and `advanceTaskChain` only after verified `github_pr_merged`; do not add polling, webhooks, scheduler lifecycle, claim/run state, sandbox lifecycle, harness adapters, packet persistence, lifecycle snapshot APIs, evidence UI, or new runtime dependencies
**Scale/Scope**: One pilot reconciliation flow, exact linked repo/issue/PR tuple, duplicate manual sync cases, negative closed/mismatched PR cases, GitHub sync failure handling, live UAT cleanup failure documentation, roadmap/status hygiene, and one fresh synthetic C4 live UAT PR
**Reviewability Budget**: Primary surface is GitHub sync reconciliation and smoke checklist evidence. Secondary surfaces are focused tests, label/status assertions, task-chain side effects, and roadmap/workflow docs. Budget target is below 400 reviewable LOC, no more than 6 production files, and no more than 15 total files. Automatic polling, claim/run state, sandboxing, adapters, packet UI, or packet persistence require split to future specs.
**Strict Scope**: Add new TS/TSX entries to `tsconfig.spec-strict.json` and `eslint.config.mjs` only if implementation creates new SPEC-009C4-owned modules. Expected plan is narrow hardening of existing modules plus tests/docs, so new module scope is N/A unless RED tests prove otherwise.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Zero-Regression Contract**: PASS. No new migration or default-on behavior is planned. Existing single-workspace behavior remains unchanged unless focused tests expose a current reconciliation gap.
- **II. Upstream Compatibility Discipline**: PASS. Scope reuses existing sync and task-chain seams and avoids destructive schema or upstream identifier changes. Classification: upstream-safe process/runtime hardening.
- **IV. Test-First Development**: PASS. Production behavior changes are conditional on focused RED Vitest coverage for exact PR matching, closed issue without merged PR, duplicate sync idempotency, label/status projection, activity/notification evidence, and duplicate-launch prevention.
- **V. Feature-Flag Resolution Discipline**: PASS. No new runtime feature flag is planned.
- **VI. Dependency Supply-Chain Hygiene**: PASS. No new runtime dependency is planned.
- **VII. Additive Migration Policy**: PASS. No migration is planned.
- **VIII. Successor Side-Effect Parity**: PASS. Any downstream launch must continue through existing task-chain helpers; C4 specifically verifies no duplicate launch after repeated manual sync.
- **X. Observability and Auditability**: PASS. C4 relies on existing task status, labels, activities, notifications, sync evidence, and smoke checklist text evidence.
- **XI/XII. Simplicity and No Speculative Generality**: PASS. The plan rejects packet schemas, lifecycle APIs, polling, adapters, and UI surfaces for C4.
- **XIII. Defensive Boundaries**: PASS. GitHub evidence remains an external trust boundary; transport/API sync failures must surface failed-sync evidence, and missing, unmerged, or mismatched PR evidence must surface reconciliation-required evidence without completing the task or emitting terminal side effects.
- **XIV. Real UI Journey Quality Gate**: PASS with condition. No new UI journey is planned. If implementation changes Task Board, GitHub Sync UI, smoke-checklist rendering, or another visible evidence surface, real Playwright coverage and screenshot evidence become required.
- **XV. Spec Artifact Provenance And Archive Sweep**: PASS. Archive sweep must run before Phase 0 in autopilot, consider only previously merged specs, and exclude `specs/009c4-owner-merge-reconciliation` from same-run cleanup. Unsafe or dirty contexts use dry-run or stop behavior.
- **XVI. Reviewability And Verification Debt Control**: PASS under roadmap transition exception. Primary surface is singular; secondary evidence is bounded. Split is mandatory for automatic polling, claim/run state, sandbox lifecycle, adapters, packet persistence, packet UI, or lifecycle snapshot API.

Post-design re-check: PASS. Phase 1 artifacts keep the same narrow surface, no new schema, no new dependency, no UI by default, no automated polling, and no packet implementation.

## Project Structure

### Documentation (this feature)

```text
specs/009c4-owner-merge-reconciliation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── manual-github-sync-reconciliation.md
└── tasks.md              # Generated later by /speckit.tasks, not this phase
```

### Source Code (repository root)

```text
src/lib/
├── github-sync-engine.ts          # Existing exact PR matching and reconciliation behavior
├── task-chain.ts                  # Existing advanceTaskChain gate after verified terminal event
└── __tests__/                     # Focused Vitest coverage for sync/reconciliation cases

src/app/api/github/sync/
└── route.ts                       # Existing manual sync API entrypoint, if tests expose route-level gap

docs/qa/
└── pilot-smoke-checklist.md       # Text-only live G_PILOT_MERGE evidence

docs/ai/
├── rc-factory-technical-roadmap.md
└── specs/SPEC-009C4-workflow.md
```

**Structure Decision**: Use the existing web application layout and existing GitHub sync/task-chain modules. Add or modify tests close to the library/API behavior they cover. Keep live UAT evidence in the existing smoke checklist.

## Phase 0: Research

Research is captured in [research.md](./research.md). All Technical Context unknowns are resolved by the provided stack, spec clarifications, and constitution constraints.

## Phase 1: Design And Contracts

Design entities and evidence relationships are captured in [data-model.md](./data-model.md). The manual sync/reconciliation contract is captured in [contracts/manual-github-sync-reconciliation.md](./contracts/manual-github-sync-reconciliation.md). Operator validation is captured in [quickstart.md](./quickstart.md).

## Review Packet Source

- **What changed**: Focused tests and any proven hardening for manual GitHub sync reconciliation from `ready_for_owner` to `done` after exact merged PR evidence.
- **Why**: C4 must prove the owner merge gate before SPEC-009D consumes evidence.
- **Non-goals**: Polling, webhooks, scheduler lifecycle, claim/run schema, sandbox lifecycle, harness adapters, packet table, lifecycle snapshot API, evidence UI, new terminal-done notification type, new migration, and new dependency.
- **Review order**: Spec/plan evidence, focused tests, GitHub sync reconciliation code if changed, task-chain/label/activity/notification assertions, smoke checklist.
- **Traceability**: FR-001..FR-020 and SC-001..SC-010 map to exact PR identity, negative cases, GitHub sync failure handling, duplicate sync idempotency, cleanup failure documentation, existing evidence sources, and fresh live smoke proof.
- **Verification**: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` when UI/smoke UI changes apply. Focused `pnpm test` filters should run first for RED/GREEN loops.
- **Rollback/flags**: No new flag or schema. Rollback is reverting focused code/tests/docs changes; manual sync remains the production trigger.

## Complexity Tracking

No constitution violations requiring justification.
