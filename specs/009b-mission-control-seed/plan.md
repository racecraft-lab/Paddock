# Implementation Plan: Mission Control Product-Line Seed and Flag Activation

**Branch**: `009b-mission-control-seed` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009b-mission-control-seed/spec.md`

## Summary

SPEC-009B seeds Mission Control as Product Line A without launching pilot work. The implementation reuses the existing `workspaces` Product Line model, `projects` department model, `project_agent_assignments` project-scoped assignment contract, SPEC-009A workflow-contract importer, `workspaces.feature_flags` JSON, and SPEC-008 `resource_policies` rows. A Mission-Control-specific seed command performs a non-mutating preflight first, blocks on non-Mission-Control residue with redacted `mutation_status: "not_mutated"` evidence, applies idempotent seed rows in transactions, corrects the repo-owned workflow contract narrowly before import, and emits durable verification evidence proving idempotency and zero dispatch.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22 with Next.js 16 App Router and React 19  
**Primary Dependencies**: Existing Next.js/React/Zustand stack, `better-sqlite3`, SPEC-009A `src/lib/workflow-contracts/*`, existing feature-flag and governance modules; no new runtime dependency  
**Storage**: SQLite through `better-sqlite3`; existing `workspaces`, `projects`, `project_agent_assignments`, `tasks`, `workflow_templates`, `resource_policies`, `resource_policy_events`, and workflow-contract diagnostics tables  
**Testing**: Vitest for seed/preflight/idempotency/redaction/governance/non-dispatch guardrails; focused static grep checks; no required Playwright journey unless implementation adds a UI surface  
**Target Platform**: Local/operator Mission Control deployment and CI on Node >=22 with pnpm  
**Project Type**: Next.js web application plus operator seed CLI/script  
**Performance Goals**: Seed and verification complete synchronously on a local SQLite target in operator time; preflight residue scans are bounded by indexed workspace/project/task/repo columns and do not perform network cleanup  
**Constraints**: Additive only; no new Product Line table; no `project_agent_assignments.workspace_id`; no destructive cleanup; no synthetic issue creation or ingestion; no claim/dispatch/scheduler/runner/sandbox state; no generic Product Line B seeder; raw credentials never appear in logs/evidence  
**Scale/Scope**: One Mission Control Product Line, six departments, six required role assignments, nine required workflow-template slugs, canonical pilot plus Phase 1-7 flags, three governance policy identities, and existing Mission Control issue-intake projections only  
**Strict Scope**: Add SPEC-009B-owned TS files to `tsconfig.spec-strict.json` and `eslint.config.mjs`: `src/lib/mission-control-seed/types.ts`, `src/lib/mission-control-seed/redaction.ts`, `src/lib/mission-control-seed/preflight.ts`, `src/lib/mission-control-seed/seed.ts`, `src/lib/mission-control-seed/evidence.ts`, and `scripts/seed-mission-control-product-line.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Plan Compliance |
|-----------|-----------------|
| I. Zero-Regression Contract | Seed is operator-invoked and Mission-Control-scoped; unrelated workspaces/settings are preserved. Future flags stay off. Verification includes no-dispatch and flag-scope assertions. |
| II. Upstream Compatibility Discipline | Reuses `workspaces`/`projects` and existing columns. No renames, destructive migrations, or upstream-owned identifier rewrites. Classification: fork rollout only. |
| III. OpenClaw Adapter Isolation | OpenClaw/gateway/FocusEngine state is detected as external residue and documented for operator cleanup; seed adds no OpenClaw schema or automatic cleanup path. |
| IV. Test-First Development | Tasks must start with failing Vitest coverage for clean seed, rerun idempotency, blocked preflight, redaction, workflow import, governance allow behavior, and forbidden side effects. |
| V. Feature-Flag Resolution Discipline | Canonical registry/runtime/runbook key is `PILOT_MISSION_CONTROL_E2E`; legacy `PILOT_PRODUCT_LINE_A_E2E` is normalized as compatibility drift, not persisted as a second workspace pilot flag. |
| VI. Dependency Supply-Chain Hygiene | No new runtime dependency. Existing direct dependencies (`better-sqlite3`, `yaml`, `ajv`) are reused through existing modules. |
| VII. Additive Migration Policy | No new migration is planned. Existing additive M56, M60, M63, M64+, and M71 surfaces are reused. |
| VIII. Successor Side-Effect Parity | SPEC-009B creates zero pilot tasks and zero successor records; no direct `INSERT INTO tasks` for new work is needed. Preserved GitHub issue tasks are re-homed only by updating existing rows. |
| IX. Safe Evaluation Discipline | Workflow import uses SPEC-009A validated canonical model. Seed does not introduce new expression evaluation. |
| X. Observability and Auditability | Seed output and checklist evidence include redacted preflight/seed/evidence summaries and workflow-contract diagnostics run ids. No hidden terminal-only proof. |
| XI. Keep It Simple | One Mission-Control-specific seed boundary and one operator script; no generic seeder abstraction. |
| XII. Avoid Speculative Generality | Product Line B, generic reusable seed config, runner, sandbox, harness, and pilot smoke are excluded. |
| XIII. Defensive Boundaries | File reads, DB open, preflight scans, workflow contract load/import, and external evidence parsing return structured, redacted results. Trusted internal helpers remain typed and direct. |
| XIV. Real UI Journey Quality Gate | No new UI journey is planned. If implementation adds UI/runbook panels, Plan requires real Playwright coverage before ready. |
| XV. Spec Artifact Provenance And Archive Sweep | Archive Sweep evidence from workflow startup is retained; current target `specs/009b-mission-control-seed` remains excluded from cleanup. |

**Initial Gate Result**: Pass. Architecture reuses existing SQLite schema and SPEC-009A workflow-contract library, with no destructive cleanup or Product Line table addition.

## Project Structure

### Documentation (this feature)

```text
specs/009b-mission-control-seed/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── seed-cli.md
│   └── seed-evidence.md
└── tasks.md                 # Created by /speckit.tasks, not this phase
```

### Source Code (repository root)

```text
docs/
├── ai/workflows/mission-control/
│   ├── workflow-contract.yaml              # Narrow FR-K2 slug correction
│   └── exports/workflow-contract.md        # Regenerated review export if contract changes
├── feature-flags-runbook.md                # Canonical pilot flag wording
└── runbooks/
    └── mission-control-seed-predeploy.md   # Backup/export-first cleanup checklist

scripts/
└── seed-mission-control-product-line.ts    # Operator seed/evidence entrypoint

src/
└── lib/
    ├── feature-flags.ts                    # Canonical pilot flag registry update
    ├── mission-control-seed/
    │   ├── types.ts
    │   ├── redaction.ts
    │   ├── preflight.ts
    │   ├── seed.ts
    │   └── evidence.ts
    └── __tests__/
        └── mission-control-seed/
            ├── preflight.test.ts
            ├── seed.test.ts
            ├── evidence.test.ts
            └── guardrails.test.ts
```

**Structure Decision**: Use a small `src/lib/mission-control-seed/` library for testable seed/preflight/evidence logic, a Node type-stripping script in `scripts/` for operator execution, repo-owned workflow-contract YAML for runtime workflow policy, and docs/runbook updates for pre-deploy cleanup evidence. Do not touch scheduler, runner, sandbox, harness, or generic seeder paths except static guardrail tests.

## Phase 0: Research

Research is captured in [research.md](./research.md). All planning questions are resolved; no unresolved clarification markers remain.

## Phase 1: Design and Contracts

Design artifacts:

- [data-model.md](./data-model.md): seeded row identities, idempotency keys, validation rules, and state transitions.
- [contracts/seed-cli.md](./contracts/seed-cli.md): operator command, options, exit behavior, and JSON result contract.
- [contracts/seed-evidence.md](./contracts/seed-evidence.md): redacted preflight/seed/idempotency/non-dispatch evidence contract.
- [quickstart.md](./quickstart.md): setup, focused verification, and operator cleanup/evidence commands.

## Implementation Approach

1. Correct `docs/ai/workflows/mission-control/workflow-contract.yaml` narrowly from stale `intake` / `implementation` aliases and `builderz-labs/mission-control` tracker identity to the required `racecraft-lab/mission-control` Mission Control slugs before import readiness.
2. Add canonical `PILOT_MISSION_CONTROL_E2E` to the flag registry/resolver exception path and runbook text; treat `PILOT_PRODUCT_LINE_A_E2E` as legacy drift that may be reported but must not be written as a second workspace flag.
3. Implement preflight scans that detect non-Mission-Control projects, linked tasks, GitHub repo config, cron issue-sync state, OpenClaw/gateway agents, and operator-supplied `ssh hall` evidence. If residue exists, return a blocked result before mutation with redacted summaries and backup/export-first cleanup checklist references.
4. In one seed transaction after preflight passes, upsert `workspaces.slug='mission-control'`, preserve `facility`, upsert six department projects, assign QA as triage and repo sync owner, upsert six role assignments through `project_id` + `agent_name` + `role`, re-home existing `racecraft-lab/mission-control` issue tasks to QA triage/intake, update workspace flags, and upsert governance policy rows.
5. Load the corrected workflow contract with `loadWorkflowContractFromFile()`, override `workspace_id` to the actual `mission-control` workspace id, assert the nine required slugs, and call `importWorkflowContract(db, contract, { mode: 'apply', sourcePath })`.
6. Emit seed evidence that can be replayed by tests and operators: clean seed result, rerun idempotency counts, blocked preflight snapshots, redaction proof, required slugs/flags/governance identities, preserved issue-intake counts, and zero forbidden dispatch/pilot state.

## Validation Plan

Focused checks for implementation:

```bash
pnpm exec vitest run src/lib/__tests__/mission-control-seed
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Full repository verification remains:

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

Specific required assertions:

- Seed twice and assert stable counts for one `mission-control` Product Line, preserved `facility`, six departments, six role assignments, required workflow slugs, canonical flags, governance policy identities, and preserved Mission Control issue-intake records.
- Blocked preflight returns `mutation_status: "not_mutated"` and leaves non-Mission-Control project/task/sync/cron/gateway evidence unchanged.
- Governance evidence shows daily token/USD budget rows are enabled with `enforcement='alert'`, WIP visibility row is evaluator-inactive, and normal pilot intake is not deferred or blocked.
- Guardrails prove zero new pilot tasks, zero workflow-chain successor records, zero per-agent seed tasks, no synthetic GitHub issue, no claim/dispatch/scheduler launch, no runner/sandbox lifecycle, and no auto-merge/post-merge reconciliation.
- Static grep confirms no new inline `process.env.FEATURE_*` runtime checks outside `src/lib/feature-flags.ts` and no forbidden runner/sandbox/control-plane scope references in SPEC-009B-owned seed code.

## Complexity Tracking

No Constitution violations are planned.

## Post-Design Constitution Re-Check

Pass. The design remains Mission-Control-specific, additive, preflight-first, idempotent, and non-dispatching. It reuses the existing SQLite schema and SPEC-009A importer instead of adding runtime workflow policy or cleanup abstractions.
