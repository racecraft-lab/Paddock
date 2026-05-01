# Implementation Plan: Task Pipeline Engine and Declarative Routing

**Branch**: `004-task-pipeline-engine` | **Date**: 2026-05-01 | **Spec**: `<repo>/.worktrees/004-task-pipeline-engine/specs/004-task-pipeline-engine/spec.md`
**Input**: Feature specification from `<repo>/.worktrees/004-task-pipeline-engine/specs/004-task-pipeline-engine/spec.md`

## Summary

SPEC-004 adds a feature-flagged task pipeline engine that advances completed workflow-template-bound tasks into exactly one declarative successor task when the bound template contains advancement-driving chain metadata. The implementation uses the live `workflow_templates` table as the template source, validates untrusted task resolution output with a constrained AJV profile, evaluates allowlisted routing rules with a safe parser plus bounded JSONPath traversal, creates successors through a shared `createTask()` path, and exposes explicit operator retry for eligible validation failures or advancement stalls.

The plan preserves flag-off and null-default task behavior, rejects routing rules without output schema at workflow-template write time, permits static `next_template_slug` without schema, and limits schema work to M62's partial unique successor index plus rollback SQL. If live schema verification during implementation proves SPEC-001 task-chain columns or workflow-template fields are absent, implementation stops and reports the dependency mismatch instead of adding replacement schema.

## Technical Context

**Language/Version**: TypeScript 5 on Next.js 16 App Router with React 19  
**Primary Dependencies**: Next.js, React, Zustand, Tailwind CSS 3, better-sqlite3, Vitest, Playwright, exact pinned runtime dependencies `ajv@8.18.0`, `jsonpath-plus@10.4.0`, and `safe-regex@2.1.1`  
**Storage**: SQLite via `better-sqlite3`; SPEC-001 task-chain columns and workflow-template fields are assumed present; SPEC-004 adds only M62's partial unique successor index and rollback SQL  
**Testing**: Vitest unit/route tests, Playwright running-app e2e, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm audit --audit-level high`, SPEC-004 static guardrails for validator configuration, dependency/import exclusions, unsafe primitives, pattern-subset enforcement, direct task inserts, and downstream-scope drift  
**Target Platform**: Node >=22 Mission Control web application, standalone Next.js output supported  
**Project Type**: Web application with App Router API routes, operator UI, local SQLite persistence, and background/sync task creation surfaces  
**Performance Goals**: Output validation budget <=50 ms; routing rule evaluation budget <=10 ms per rule; validation/routing input caps enforced before synchronous parse or traversal; one-successor-per-parent guard prevents duplicate successor work  
**Constraints**: Feature-flagged through `resolveFlag()`; flag default OFF; no `task_templates`; no downstream SPEC-005/006/007/008/009/011 behavior; no schema beyond M62 partial unique successor index; shared successor creation must be structurally side-effect-equivalent through `createTask()`; outbound GitHub/GNAP pushes from chain advancement run only after transaction commit  
**Scale/Scope**: Workflow templates scoped by Product Line/workspace; routing rules capped at 64; expression bytes capped at 8192; tokens capped at 256; JSONPath results capped at 128; validator cache capped at 256 compiled validators  
**Strict Scope**: New production modules to add to `tsconfig.spec-strict.json` and `eslint.config.mjs`: `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, `src/types/workflow-template.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Plan evidence |
|-----------|--------|---------------|
| I. Zero-Regression Contract | PASS | Pipeline behavior is flag-gated and null-default safe; flag OFF and unbound/no-driving-metadata paths preserve legacy behavior and receive regression tests. |
| II. Upstream Compatibility Discipline | PASS | Changes are additive and scoped; no upstream-owned renames; only M62 partial unique index is planned. |
| IV. Test-First Development | PASS | Verification strategy requires focused Vitest and Playwright coverage before implementation completion. |
| V. Feature-Flag Resolution Discipline | PASS | Runtime behavior uses `resolveFlag()` only; no inline `process.env.FEATURE_*` checks. |
| VI. Dependency Supply-Chain Hygiene | PASS | `ajv`, `jsonpath-plus`, and `safe-regex` are exact pinned direct runtime dependencies with lockfile and audit evidence. |
| VII. Additive Migration Policy | PASS | M62 is additive, forward-only, has rollback SQL, and includes preflight duplicate detection. |
| VIII. Successor Side-Effect Parity | PASS | All task creation callsites migrate to `createTask()`; production direct `INSERT INTO tasks` outside that module is prohibited by guardrails. |
| IX. Safe Evaluation Discipline | PASS | Validator and evaluator are new strict-scope modules with constrained profiles, forbidden primitive rejection, and budget/cap tests. |
| X. Observability and Auditability | PASS | Validation failures, routing stalls, retry recoveries, and chain termination write machine-readable activity metadata with stable reason codes. |
| XI. Keep It Simple | PASS | Uses three focused new lib modules plus one shared type module; downstream specs and speculative generalized workflow engines remain out of scope. |
| XII. Avoid Speculative Generality | PASS | `task_pipeline_target_disabled` is reserved only if live schema exposes a disabled/status state; downstream artifact/governance behavior is excluded. |
| XIII. Defensive Boundaries, Trusting Interior | PASS | HTTP writes, untrusted output, routing expressions, and outbound sync effects produce structured errors without leaking full output or routing traces. |
| XIV. Real UI Journey Quality Gate | PASS | Workflow-template chain-field create/edit/read/delete requires real running-app Playwright under operator auth; component-only tests are insufficient. |
| XV. Spec Artifact Provenance And Archive Sweep | PASS | Plan preserves Archive Sweep startup policy, current-target exclusion, dry-run/stop safety, recovery-command provenance, and screenshot evidence guardrails. |

Post-design re-check: PASS. Phase 0/1 artifacts preserve the same gate decisions, keep schema scope limited to M62, keep the UI journey under real Playwright, and define no unresolved clarifications.

## Project Structure

### Documentation (this feature)

```text
<repo>/.worktrees/004-task-pipeline-engine/specs/004-task-pipeline-engine/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-workflows.md
│   ├── task-chain-engine.md
│   └── task-create.md
└── tasks.md
```

### Source Code (repository root)

```text
<repo>/.worktrees/004-task-pipeline-engine/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.spec-strict.json
├── eslint.config.mjs
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── quality-review/route.ts
│   │       ├── tasks/route.ts
│   │       ├── tasks/[id]/route.ts
│   │       └── workflows/route.ts
│   ├── components/
│   │   └── orchestration-bar.tsx
│   ├── lib/
│   │   ├── feature-flags.ts
│   │   ├── migrations.ts
│   │   ├── output-schema-validator.ts
│   │   ├── routing-rule-evaluator.ts
│   │   ├── task-create.ts
│   │   ├── task-dispatch.ts
│   │   └── validation.ts
│   └── types/
│       └── workflow-template.ts
├── tests/
│   └── e2e/
├── docs/
│   ├── migrations/rollback-M62.sql
│   └── orchestration.md
└── scripts/
```

**Structure Decision**: Use the existing single Next.js application structure. SPEC-004 adds only the four strict-scope production modules named above, updates existing API/UI/task creation surfaces in place, adds M62 and rollback documentation, and expands focused Vitest/Playwright coverage around the live routes and UI flows.

## Complexity Tracking

No constitution violations require justification.

## Phase 0: Research

Research output: `<repo>/.worktrees/004-task-pipeline-engine/specs/004-task-pipeline-engine/research.md`

Resolved decisions:

- Use `workflow_templates` as the only task-chain template source.
- Use `workflow_template_id` as canonical task binding and `workflow_template_slug` as a denormalized snapshot.
- Read parent structured output from `tasks.resolution` only as the SPEC-004 temporary bridge.
- Implement shared task creation in `src/lib/task-create.ts` and migrate all required callsites to it.
- Validate output schema with constrained AJV plus safe-regex pattern screening.
- Evaluate routing with a hand-written parser and JSONPath-Plus traversal with JavaScript execution disabled.
- Use explicit operator retry with latest eligible activity selection, template provenance hashes, drift confirmation, and bounded response summaries.
- Enforce one successor per non-null parent with M62 partial unique index and rollback SQL.

## Phase 1: Design And Contracts

Design outputs:

- `<repo>/.worktrees/004-task-pipeline-engine/specs/004-task-pipeline-engine/data-model.md`
- `<repo>/.worktrees/004-task-pipeline-engine/specs/004-task-pipeline-engine/contracts/api-workflows.md`
- `<repo>/.worktrees/004-task-pipeline-engine/specs/004-task-pipeline-engine/contracts/task-chain-engine.md`
- `<repo>/.worktrees/004-task-pipeline-engine/specs/004-task-pipeline-engine/contracts/task-create.md`
- `<repo>/.worktrees/004-task-pipeline-engine/specs/004-task-pipeline-engine/quickstart.md`

Interface contracts cover `/api/workflows`, the terminal-success chain advancement and retry behavior, and the shared task creation helper surface. The UI contract is represented through `/api/workflows` plus the Playwright quickstart journey because `orchestration-bar.tsx` persists through that live API.

## Verification Strategy

Required checks:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm audit --audit-level high
```

Focused verification requirements:

- Vitest coverage for `createTask()` source profiles and every migrated callsite: API task creation, GitHub issue import, GitHub sync import, recurring spawn, and pipeline successor creation.
- Terminal-success advancement coverage for every live non-`done` to `done` route: Aegis/task dispatch approval, operator quality-review approval, bulk task status update, detail task status update, and detail retry action.
- Flag OFF, flag ON unbound/null-field, valid routing, static next-template without schema, routing-rules-without-schema rejection, missing output failure, invalid output failure, routing rejection, routing timeout, missing/duplicate/cross-workspace target, missing assignee, chain termination, existing successor idempotency, and transaction rollback at each write boundary.
- Retry coverage for failed parents and terminal-success stalled parents, including latest eligible activity selection, no activity override, missing provenance conflict, unconfirmed drift conflict, drift confirmation, repeated eligible retries with monotonic per-parent `retry_attempt`, bounded response bodies containing `recovery_class`, `retry_attempt`, `recovery_outcome`, `successor_task_id`, `chain_terminated`, and `idempotent_successor`, and all `chain_retry.recovery_outcome` values: `output_still_invalid`, `stall_persisted`, `successor_created`, `successor_already_exists`, and `chain_terminated`.
- Exact activity `data.reason_code` assertions for validation failures, routing expression rejection, routing budget exceeded, `task_pipeline_target_missing`, `task_pipeline_target_duplicate`, `task_pipeline_target_cross_workspace`, `task_pipeline_successor_assignee_missing`, and retry recovery metadata.
- Validator adversarial fixture coverage for schema/output size, nesting, object keys, array length, string length, pattern length, budget, cache eviction, unsupported schema features, unsafe regex, accepted `pattern`/`patternProperties` validation-time near-match and non-match cases, async/remote/dynamic/custom features, mutation/default/coercion/all-errors/format enforcement exclusions, malformed schemas, oversized outputs, and bounded no-exception failure responses.
- Routing evaluator adversarial fixture coverage for JSONPath filter/script rejection before traversal, disabled JavaScript execution, forbidden primitives, prototype-chain access, unsupported operators, regex right sides, malformed JSONPath, oversized literals/expressions, caps, budget stalls, valid routing, normal no-match termination, and bounded no-exception failure responses.
- M62 migration tests for duplicate preflight failure, partial unique index enforcement for non-null `parent_task_id`, multiple NULL `parent_task_id` allowance, and rollback SQL dropping the index.
- Dependency and static guardrails for exact pinned runtime dependencies, lockfile pins, no `ajv-formats`, validator AJV option construction, conservative pattern-subset enforcement, accepted-pattern adversarial fixture coverage, no unsafe primitives in SPEC-004 strict-scope implementation modules, no direct production `INSERT INTO tasks` outside `src/lib/task-create.ts`, no downstream-scope drift, and passing `pnpm audit --audit-level high`.
- Real running-app Playwright journey for workflow-template chain-field create/edit/read/delete under operator auth and Product Line scope, including validation rejection and query-parameter delete compatibility. Screenshots remain CI artifacts unless a manifest-backed exception is created.

SPEC-004 static guardrails must be concrete and CI-runnable:

- Dependency guardrail: inspect `package.json` and `pnpm-lock.yaml` for exact direct runtime pins `ajv@8.18.0`, `jsonpath-plus@10.4.0`, and `safe-regex@2.1.1`; fail on direct `ajv-formats` dependency, import, or registration in SPEC-004 production code.
- Validator guardrail: scan `src/lib/output-schema-validator.ts` for the required AJV safety options (`strict`, schema validation, `$data=false`, `validateFormats=false`, no mutation/default/coercion/all-errors behavior), conservative pattern-subset enforcement, and accepted-pattern adversarial fixtures.
- Evaluator guardrail: scan `src/lib/routing-rule-evaluator.ts` and any SPEC-004 chain-advancement helpers for forbidden unsafe primitives: `eval`, `Function`, `vm`, `vm2`, `with`, dynamic `require`, `__proto__`, `constructor`, arithmetic operators, bitwise operators, right-side regex values, JSONPath callbacks, and sandbox-provided execution hooks.
- Task-create and scope guardrails: scan production source for direct `INSERT INTO tasks` outside `src/lib/task-create.ts` and for downstream SPEC-005/006/007/008/009/011 state, artifact, governance, area-routing, pilot, or CrabTrap behavior.

## Gate-Relevant Evidence To Preserve

- `specs/004-task-pipeline-engine/checklists/requirements.md` shows G2 readiness with zero unresolved clarification markers.
- `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, and `contracts/*` contain no unresolved clarification markers.
- SPEC-004 scope keeps new production modules limited to `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, and `src/types/workflow-template.ts`.
- Schema scope is limited to M62 partial unique successor index and `docs/migrations/rollback-M62.sql`.
- Archive Sweep policy is preserved: prior merged specs only, current target excluded, unsafe or dirty cleanup dry-runs or stops, recovery commands retained.
