# Implementation Plan: Triage-to-Remediation Plan Handoff

**Branch**: `009c2-triage-remediation-handoff` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/009c2-triage-remediation-handoff/spec.md`

## Summary

SPEC-009C2 converts a SPEC-009C1 eligible GitHub-linked pilot issue from Issue
Triage into Issue Remediation planning only when triage emits
`ACTIONABLE_REMEDIATION`. The implementation updates the repo-owned Mission
Control workflow contract, extends existing task-chain/disposition handling to
recognize the pilot taxonomy, and records durable task-scoped disposition,
artifact, and activity evidence. Negative outcomes terminate cleanly with
evidence and create no remediation-planning successor.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22  
**Primary Dependencies**: Next.js 16 App Router, React 19, Zustand,
`better-sqlite3`, existing `ajv@8.18.0`, `jsonpath-plus@10.4.0`, and
`safe-regex@2.1.1`; no new runtime dependency  
**Storage**: SQLite through `better-sqlite3`; existing `tasks`,
`workflow_templates`, `task_dispositions`, `task_artifacts`, and `activities`
tables  
**Testing**: Vitest for unit/integration coverage; Playwright only if an
existing UI smoke path changes  
**Target Platform**: Mission Control web app and local operator workflow  
**Project Type**: Web application with local SQLite control-plane state  
**Performance Goals**: No new background loop; handoff remains synchronous with
existing task-chain advancement cost  
**Constraints**: No schema migration, no live GitHub mutation in automated
tests, no automatic GitHub sync cron/poller, no claim/runner/sandbox/harness
work, and no production non-remediation routing lane  
**Scale/Scope**: One pilot repository (`racecraft-lab/mission-control`), one
eligible pilot issue, one Issue Triage task, one remediation-planning successor
for actionable output, fixture matrix for six negative dispositions plus invalid
output  
**Reviewability Budget**: Setup gate carries a transition exception. Primary
surface is Issue Triage task-chain handoff. Expected changes touch one workflow
contract, one dispatch/evidence module path, focused tests, and smoke docs.  
**Strict Scope**: No new production TS module is expected. If implementation
adds one, add it to `tsconfig.spec-strict.json` and `eslint.config.mjs` before
G7.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Zero-Regression Contract**: PASS. Existing task-chain and disposition
  behavior remains additive; no flag-off or legacy route behavior is removed.
- **II. Upstream Compatibility Discipline**: PASS. Scope is additive and
  workflow-contract driven; no upstream schema identifiers are renamed.
- **IV. Test-First Development**: PASS. Tasks must add failing Vitest coverage
  before production changes.
- **V. Feature-Flag Resolution Discipline**: PASS. Reuses existing
  `FEATURE_TASK_PIPELINES`, `FEATURE_DISPOSITION_LOGGING`,
  `FEATURE_TASK_ARTIFACTS`, and `PILOT_MISSION_CONTROL_E2E` boundaries; no new
  flag planned.
- **VII. Additive Migration Policy**: PASS. No schema migration planned.
- **VIII. Successor Side-Effect Parity**: PASS. Successor creation must continue
  through `advanceTaskChain` and `createTask({ source: 'pipeline_successor' })`.
- **IX. Safe Evaluation Discipline**: PASS. Routing remains handled by the
  existing safe routing-rule evaluator.
- **XIII. Secrets And Redaction**: PASS. Artifact evidence must use existing
  artifact publication/redaction behavior; tests must not require secrets.
- **XV. Spec Artifact Provenance And Archive Sweep**: PASS. Startup evidence is
  recorded in the workflow; current target is excluded from archive cleanup.
- **XVI. Reviewability And Verification Debt Control**: PASS with transition
  exception. SPEC-009F and SPEC-013A1 are recorded as future work so this branch
  does not widen.

## Project Structure

### Documentation (this feature)

```text
specs/009c2-triage-remediation-handoff/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── triage-handoff-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
docs/ai/workflows/mission-control/workflow-contract.yaml
docs/qa/pilot-smoke-checklist.md
src/lib/task-dispatch.ts
src/lib/task-artifacts.ts
src/lib/__tests__/task-dispatch.test.ts
src/lib/__tests__/task-chain-advancement.routing.test.ts
src/lib/__tests__/spec-007-disposition-dispatch.test.ts
src/lib/__tests__/workflow-contracts/importer.test.ts
```

**Structure Decision**: Keep implementation in existing backend/workflow
contract surfaces. Do not add UI routes, API endpoints, migrations, scheduler
hooks, or new background services.

## Phase 0 Research

See [research.md](./research.md). Key decisions:

- Use uppercase pilot taxonomy as the workflow output contract.
- Preserve SPEC-007 lowercase disposition compatibility by accepting both enum
  families where triage disposition logging detects schemas.
- Route only `ACTIONABLE_REMEDIATION` through workflow-contract routing rules.
- Use task-scoped disposition, artifact, and activity evidence anchored to the
  triage task.
- Keep manual GitHub mutation in smoke instructions only.

## Phase 1 Design

See:

- [data-model.md](./data-model.md)
- [contracts/triage-handoff-contract.md](./contracts/triage-handoff-contract.md)
- [quickstart.md](./quickstart.md)

## Implementation Strategy

1. Add RED tests for the workflow contract taxonomy/routing import parity.
2. Add RED tests proving `ACTIONABLE_REMEDIATION` creates exactly one
   `mission-control_remediation_plan` successor through `advanceTaskChain`.
3. Add RED tests proving repeated actionable processing returns the existing
   successor and creates no duplicate.
4. Add RED tests for each negative disposition and invalid output: no
   remediation successor, disposition/artifact/activity evidence present, and
   `NEEDS_SPEC` does not launch future lanes.
5. Update `workflow-contract.yaml` and existing dispatch/evidence helpers.
6. Update `docs/qa/pilot-smoke-checklist.md` with SPEC-009C2 synthetic issue
   steps and cleanup.
7. Run focused Vitest, then typecheck/lint/build according to touched surfaces.

## Post-Design Constitution Check

PASS. The design stays schema-free, avoids new runtime dependencies, preserves
existing task-chain side-effect parity, uses fixture-driven tests, and records
future routing/automation work without implementing it.

## Complexity Tracking

No constitution violations require a complexity exception beyond the already
recorded reviewability transition exception for the SPEC-009 family split.
