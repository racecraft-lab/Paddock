# Implementation Plan: Product Line B Onboarding Smoke

**Branch**: `010b-product-line-b-smoke` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/010b-product-line-b-smoke/spec.md`

## Summary

SPEC-010B creates the smallest reviewable Product Line B onboarding smoke. The implementation reuses the SPEC-010A `seed:product-line` config/seeder path, adds a disabled-by-default `product-line-b` config, proves no-mutation preflight and Product Line A isolation, runs one local synthetic Paddock issue smoke without a required GitHub write, then disables Product Line B cleanly with structured evidence.

The plan avoids migrations and new dependencies because `workspaces.disabled_at` already exists in migration M74 and the project already has YAML parsing, SQLite helpers, workflow-contract import, scoped workspace APIs, Vitest, and Playwright.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node.js >=22; HAL service-compatible checks use `/usr/bin/node` v24.15.0  
**Primary Dependencies**: Next.js 16 App Router, React 19, Zustand where existing panels need it, Tailwind CSS 3, `better-sqlite3`, existing direct `yaml`, existing workflow-contract and product-line seed modules  
**Storage**: SQLite through `better-sqlite3`; no schema migration planned because `workspaces.disabled_at` exists in `src/lib/migrations.ts` M74  
**Testing**: Vitest for seeder/config/smoke evidence, Playwright only if dashboard/switcher assertions change, ESLint, `pnpm typecheck`, `pnpm build`  
**Target Platform**: Paddock Next.js web app plus operator CLI/script execution on local disposable DB and HAL-like targets  
**Project Type**: Web application with operator seed/smoke CLI support  
**Performance Goals**: Preflight under 15 operator minutes; full operator smoke checklist under 1 operator-hour excluding optional live GitHub UAT  
**Constraints**: No required live GitHub write, no scheduler/claim/retry/runner/sandbox/adapter/auto-merge behavior, no SPEC-014C-owned file edits, Product Line B disabled before and after smoke, Product Line A hashes unchanged except explicitly read-only inspection evidence  
**Scale/Scope**: One disabled Product Line B config, one synthetic issue-shaped smoke item, one retained evidence packet, Product Line A before/after isolation proof  
**Reviewability Budget**: Primary surface seed/config; secondary surfaces docs/process and narrow smoke evidence; projected 450-700 reviewable LOC; 4-6 production files; 8-12 total files; within budget  
**Strict Scope**: Add new TS/TSX implementation/test files to `tsconfig.spec-strict.json` and `eslint.config.mjs`: `scripts/spec-010b/product-line-b-smoke.ts`, `src/lib/__tests__/product-line-b-seed.test.ts`, `src/lib/__tests__/product-line-b-smoke.test.ts`, and `tests/product-line-b-dashboard-scope.spec.ts` only if dashboard assertions change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Plan Decision | Gate |
|-----------|---------------|------|
| I. Zero-Regression Contract | Product Line A remains the baseline; all Product Line B writes are slug/workspace-scoped and disabled-by-default. Verify with Product Line A scoped hashes plus API/dashboard checks. | Pass |
| II. Install Compatibility And Operational Impact | Reuse existing CLI, SQLite schema, standalone-compatible Node runtime, and HAL `/usr/bin/node` caveat. No new install requirement. | Pass |
| III. OpenClaw Adapter Isolation | Retained FocusEngine/OpenClaw identities are read-only inventory only and are never Product Line B ownership. | Pass |
| IV. Test-First Development | Tasks must start with RED Vitest coverage for config, disabled lifecycle, no-mutation preflight, smoke evidence, and Product Line A isolation. | Pass |
| V. Feature-Flag Resolution Discipline | Product Line B flags live in workspace `feature_flags`; no inline runtime `process.env.FEATURE_*` checks are planned. | Pass |
| VI. Dependency Supply-Chain Hygiene | No new runtime dependency. Existing `yaml` and Node APIs are sufficient. | Pass |
| VII. Additive Migration Policy | No migration. `workspaces.disabled_at` is already present through M74; implementation only reads/writes the existing column. | Pass |
| VIII. Successor Side-Effect Parity | Required smoke uses already-proven pilot subset and asserts no unintended successors, claims, dispatch, runners, or auto-merge. | Pass |
| X. Observability And Auditability | `spec-010b.smoke_evidence.v1` records preflight/apply/verify/enable/smoke/disable/cleanup/isolation/timing/redaction/scope evidence. | Pass |
| XI-XII. Simplicity And No Speculative Generality | Single product-line config plus a smoke orchestration script; no generalized lifecycle service unless tasks prove it is needed. | Pass |
| XIII. Defensive Boundaries | CLI/script boundaries return typed JSON envelopes with redacted errors and no raw secrets. | Pass |
| XIV. Real UI Journey Quality Gate | No new UI journey is planned. If dashboard/switcher assertions change, add real Playwright coverage against the running app. | Pass |
| XV. Archive Sweep | Preserve startup archive-sweep policy; current target `specs/010b-product-line-b-smoke` is excluded from same-run cleanup. | Pass |
| XVI. Reviewability And Verification Debt Control | One primary surface, file-disjoint from SPEC-014C, projected LOC/files inside accepted budget. | Pass |

## Phase 0: Research

Research complete in [research.md](./research.md). Key decisions:

- Use existing SPEC-010A seed/config modules and extend them narrowly for Product Line B disabled-by-default lifecycle.
- Avoid migration because M74 already provides `workspaces.disabled_at`.
- Keep `seed:product-line` modes unchanged as `preflight|apply|verify`.
- Implement enable/smoke/disable as SPEC-010B smoke lifecycle actions with structured evidence, not as new seeder modes.
- Treat runtime-inventory evidence as optional read-only support and stop before SPEC-014C-owned files.

## Phase 1: Design And Contracts

Design artifacts:

- [data-model.md](./data-model.md) defines Product Line B config, lifecycle state, synthetic issue, smoke evidence packet, isolation baseline, and cleanup proof entities.
- [contracts/seed-product-line-cli.md](./contracts/seed-product-line-cli.md) defines the reused seed CLI contract and required Product Line B assertions.
- [contracts/smoke-evidence.md](./contracts/smoke-evidence.md) defines `spec-010b.synthetic_issue.v1` and `spec-010b.smoke_evidence.v1`.
- [contracts/scoped-dashboard-evidence.md](./contracts/scoped-dashboard-evidence.md) defines SQL/API/dashboard evidence expectations.
- [quickstart.md](./quickstart.md) defines disposable and HAL UAT execution, including the service-compatible Node ABI caveat.

Post-design Constitution Check remains Pass. No unresolved clarification markers remain.

## Project Structure

### Documentation (this feature)

```text
specs/010b-product-line-b-smoke/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── scoped-dashboard-evidence.md
│   ├── seed-product-line-cli.md
│   └── smoke-evidence.md
└── tasks.md                 # Generated by speckit-tasks, not this phase
```

### Source Code (repository root)

```text
docs/ai/product-lines/
├── paddock.yaml
└── product-line-b.yaml       # New reviewed disabled Product Line B config

src/lib/product-line-seed/
├── types.ts                  # Narrow lifecycle/config typing if needed
├── schema.ts                 # Allow disabled_by_default config invariant
├── config.ts                 # Validate lifecycle and Product Line B safety
├── seed.ts                   # Apply/verify existing disabled_at invariant
└── evidence.ts               # Include disabled_at in scoped seed snapshots

scripts/spec-010b/
└── product-line-b-smoke.ts   # Enable, synthetic smoke, disable, cleanup proof

src/lib/__tests__/
├── product-line-b-seed.test.ts
└── product-line-b-smoke.test.ts

tests/
└── product-line-b-dashboard-scope.spec.ts  # Only if dashboard assertions change
```

**Structure Decision**: Keep implementation in the existing product-line seed boundary plus one SPEC-010B smoke script. Do not add API routes, scheduler hooks, adapter modules, runtime-inventory eligibility, or dashboard widgets unless tasks later prove an existing scoped read route cannot express required evidence.

## Implementation Approach

1. Add `docs/ai/product-lines/product-line-b.yaml` using `schema_version: product-line-seed-v1`, slug `product-line-b`, display `Product Line B`, agent prefix `plb-platform`, repo metadata `racecraft-lab/Paddock`, Paddock workflow-contract family/path/slugs, no repo sync owner, and smoke/runner/control-plane flags disabled or absent.
2. Extend product-line seed validation only as needed to express `disabled_by_default: true` on Product Line B while keeping `paddock.yaml` valid.
3. Extend seed apply/verify so a config with `disabled_by_default: true` writes and verifies non-null `workspaces.disabled_at`, without changing seed modes. Preserve the SPEC-010A existing-target contract: repeated `apply` on an already valid Product Line B target uses the explicit existing-target allowance path, does not duplicate config-owned rows, and records stable before/after seed snapshot hashes; repeated `verify` remains read-only.
4. Extend seed evidence snapshots to include `disabled_at` when the column exists, preserving older fixture compatibility.
5. Add a SPEC-010B smoke script that enables Product Line B only for the smoke window, writes one local synthetic issue-shaped fixture/evidence record, verifies no live GitHub mutation is required, disables Product Line B, and emits cleanup/isolation proof.
6. Use existing scoped read routes for evidence: `/api/workspaces/:id`, `/api/projects`, `/api/tasks`, `/api/agents`, `/api/github/sync`, and `/api/status?action=dashboard` with explicit Product Line A/B workspace scope.
7. Record optional runtime-inventory evidence only if current read-only APIs already expose it. Do not edit `src/lib/harness-adapters/**`, `src/app/api/agents/runtime-inventory/**`, `src/lib/task-dispatch.ts`, `src/lib/task-dispatch-codex-app-server.ts`, `scripts/spec-014c/**`, or SPEC-014C artifacts.

## State Management Contract

Product Line B state is fail-closed and evidence-driven:

- `product-line-b.yaml` is the source of truth for smoke-required `feature_flags.enabled[]` and disabled/pause `feature_flags.disabled_or_absent[]`; tasks must keep those arrays explicit and must not rely on implicit slug behavior or unchecked defaults.
- Smoke enablement may clear only the Product Line B workspace `disabled_at` value and may enable only the reviewed smoke-required Product Line B workspace flags for the current `run_id`.
- Smoke enablement must leave general sync and dispatch paused: all Product Line B projects keep `github_sync_enabled = 0` and `is_repo_sync_owner = 0`; `FEATURE_GITHUB_SYNC_AUTOMATION`, `FEATURE_TASK_CONTROL_PLANE`, and `FEATURE_AGENT_RUNNER_SANDBOXES` remain absent or false for Product Line B; no Product Line B task outside the run-id-bound synthetic smoke item may be in an assigned dispatch-eligible state.
- The smoke evidence packet must include `state_management.enabled_for_smoke_flags[]`, `state_management.disabled_or_absent_flags[]`, `state_management.github_sync_enabled_project_count`, `state_management.repo_sync_owner_project_count`, `state_management.dispatch_eligible_task_count`, and `state_management.smoke_eligible_item_count`.
- Final disablement must restore non-null Product Line B `disabled_at`, clear or explicitly set false every smoke-owned flag that was enabled for the run, and record zero for sync-owner, GitHub-sync-enabled, dispatch-eligible, and smoke-eligible Product Line B counts.

## Complexity Tracking

No Constitution violations require justification. The spec remains under the accepted reviewability budget and does not need a split exception.

## Verification Plan

- RED/GREEN Vitest for Product Line B config validation, `disabled_by_default` apply/verify, repeated apply/verify idempotency on an already valid target, no-mutation preflight, Product Line A snapshot parity, retained FocusEngine/OpenClaw inventory reporting, no repo sync owner, and no live GitHub mutation requirement.
- RED/GREEN Vitest for `spec-010b.synthetic_issue.v1` and `spec-010b.smoke_evidence.v1` validation, cleanup counters, redaction proof, and side-effect absence.
- RED/GREEN Vitest for state-management evidence: reviewed smoke flag arrays are explicit, enablement is run-id-scoped to one synthetic smoke item, Product Line B sync/dispatch pause counts stay zero, and final disablement clears smoke-owned flags.
- Focused CLI checks against a disposable DB:
  - `pnpm seed:product-line -- --config docs/ai/product-lines/product-line-b.yaml --db <db> --mode preflight --json`
  - `pnpm seed:product-line -- --config docs/ai/product-lines/product-line-b.yaml --db <db> --mode apply --json`
  - `pnpm seed:product-line -- --config docs/ai/product-lines/product-line-b.yaml --db <db> --mode verify --json`
- Smoke lifecycle script against a disposable DB: enable, synthetic issue, disable, cleanup proof.
- API/dashboard assertions only if touched: explicit `workspace_id` scope reaches `/api/status?action=dashboard`, and disabled Product Line B is absent from the normal switcher outside smoke enablement.
- Broader checks as scope requires: `pnpm typecheck`, `pnpm lint`, focused `pnpm test -- ...`, and `pnpm build`.
- HAL UAT uses `/usr/bin/node` v24.15.0 for service-compatible seed checks and records cleanup counts.

## Scope Boundaries

Non-goals enforced by this plan:

- No required GitHub issue create/edit/comment/close/delete.
- No Product Line A seed mutation or repo sync ownership takeover.
- No FocusEngine/OpenClaw identity reuse or automatic cleanup.
- No workflow language, scheduler, claim/retry, runner, sandbox lifecycle, adapter manifest, runtime-inventory eligibility, or auto-merge behavior.
- No dashboard redesign or include-disabled switcher mode.
- No committed binary screenshots unless a manifest-backed exception is created.

## PR Review Packet Source

The PR description must include:

- What changed: Product Line B config, disabled lifecycle seed invariant, synthetic smoke evidence, and focused tests/docs.
- Why: prove two-product-line onboarding and Product Line A isolation for future SPEC-012B gardening.
- Non-goals: live GitHub mutation, FocusEngine/OpenClaw reuse, adapter/runtime-inventory ownership, scheduler/claim/retry/runner/sandbox/auto-merge.
- Review order: config, seed lifecycle changes, smoke evidence contract/script, tests, docs/UAT.
- Scope budget: 450-700 reviewable LOC, 4-6 production files, 8-12 total files.
- Traceability: FR/SC mapped to changed files and evidence commands.
- Verification: focused Vitest, CLI disposable DB, optional Playwright/API checks, typecheck/lint/build as run.
- Known gaps: optional HAL live GitHub evidence is not required; runtime-inventory is supporting only.
- Rollback/flags: Product Line B final state disabled; no migration rollback needed.

## Gate Readiness

G3 is ready for validation: architecture reuses SPEC-010A seed tooling and existing Paddock APIs/tests; no migration, dependency, live GitHub mutation, or adapter work is required; SPEC-014C-owned files are explicitly excluded.
