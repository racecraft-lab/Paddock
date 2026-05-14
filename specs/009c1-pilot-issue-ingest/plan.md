# Implementation Plan: GitHub Pilot Issue Ingest and Eligibility

**Branch**: `009c1-pilot-issue-ingest` | **Date**: 2026-05-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009c1-pilot-issue-ingest/spec.md`

**Setup note**: `.specify/scripts/bash/setup-plan.sh --json` was run from the feature worktree. The current branch name is intentionally `009c1-pilot-issue-ingest`; the script's numeric branch validator required `SPECIFY_FEATURE_DIRECTORY=specs/009c1-pilot-issue-ingest` and a temporary valid `SPECIFY_FEATURE` value to copy the template without changing git branches.

## Summary

SPEC-009C1 proves the first self-hosting pilot intake gate: one eligible `racecraft-lab/mission-control` GitHub issue enters Mission Control as exactly one GitHub-linked root task through existing GitHub ingest/sync, while duplicate, ambiguous, unsafe, and local-only candidates remain outside the pilot lane. The implementation should add a small backend eligibility/evidence layer around existing sync seams, fixture-driven tests, an explicit operator smoke script path for live/synthetic issue selection, and a manual smoke checklist. It must not add automatic polling, production UI/API evidence surfaces, triage/remediation execution, runner/sandbox lifecycle, or workflow-contract tracker-label semantic changes.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22
**Primary Dependencies**: Next.js 16 App Router, React 19, Zustand where existing panels need it, `better-sqlite3`, Tailwind CSS 3, Vitest, Playwright only if an existing UI/smoke checklist path changes; no new runtime dependency planned
**Storage**: SQLite through `better-sqlite3`; no schema migration planned
**Testing**: Vitest unit/integration tests with fixture or mocked GitHub clients; Playwright only if existing UI behavior changes; manual smoke checklist for live GitHub validation
**Target Platform**: Mission Control web service/operator worktree on Node >=22
**Project Type**: Next.js web application with backend sync logic and operator scripts
**Performance Goals**: Pilot candidate selection and idempotency checks remain bounded to the operator-triggered candidate set; no background scheduler or poller load is introduced
**Constraints**: Deterministic fixtures; CI must not require `GITHUB_TOKEN` or mutate live GitHub; live synthetic issue creation requires explicit mutation opt-in; exactly one GitHub-linked root task is the success proof
**Scale/Scope**: One pilot repository (`racecraft-lab/mission-control`), one admitted pilot issue, fixture matrix for rejection reasons and idempotent resync
**Reviewability Budget**: Primary surface `seed/config`; secondary surfaces `docs/process` and fixture-driven tests; 300-400 reviewable LOC excluding generated/lock artifacts; 3 or fewer production files; 10 or fewer total files; within budget
**Strict Scope**: Add every new SPEC-009C1-owned TypeScript file to `tsconfig.spec-strict.json` and `eslint.config.mjs`; expected candidates are a pilot eligibility helper under `src/lib/**` and an operator script under `scripts/**` if TypeScript-owned by the project

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Zero-Regression Contract**: PASS. New behavior is fixture/operator-triggered and must preserve existing GitHub sync and local task creation behavior. No automatic runtime path is introduced.
- **II. Upstream Compatibility Discipline**: PASS. Scope is additive and fork-pilot specific but disabled from background runtime. No upstream-owned rename or destructive migration is planned.
- **IV. Test-First Development**: PASS. Implementation tasks must start with failing Vitest coverage for eligibility, duplicate prevention, local-only exclusion, synthetic fallback mock behavior, and side-effect absence.
- **V. Feature-Flag Resolution Discipline**: PASS. `PILOT_MISSION_CONTROL_E2E` remains the pilot activation scope; no new feature flag is planned.
- **VII. Additive Migration Policy**: PASS. No schema migration is introduced. Current-schema assertions must use existing `tasks`, `runs`, `task_dispositions`, `task_artifacts`, and `activities` surfaces plus table-if-exists guards for future claim/runner/sandbox tables.
- **VIII. Successor Side-Effect Parity**: PASS. Pilot task creation remains through existing GitHub ingest/sync and `src/lib/task-create.ts`; direct production `INSERT INTO tasks` remains prohibited.
- **X. Observability and Auditability**: PASS. The plan records inspectable eligibility decisions in tests/operator evidence without adding durable production evidence API/UI.
- **XI/XII. Simplicity and No Speculative Generality**: PASS. Eligibility remains a small deterministic gate, not a general runner intake framework.
- **XIV. Real UI Journey Quality Gate**: N/A. No production UI journey is planned; Playwright is required only if an existing UI/smoke checklist path changes.
- **XV. Spec Artifact Provenance And Archive Sweep**: PASS. No archive cleanup is implemented in this plan. If autopilot wraps this work, archive sweep remains before Phase 0 and excludes the current spec.
- **XVI. Reviewability And Verification Debt Control**: PASS. One primary surface, projected 300-400 LOC, <=3 production files, <=10 total files. No split exception required.

## Project Structure

### Documentation (this feature)

```text
specs/009c1-pilot-issue-ingest/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── pilot-ingest-contract.md
└── checklists/
```

### Source Code (repository root)

```text
src/lib/
├── github-sync-engine.ts              # reuse existing inbound sync seam
├── github-label-map.ts                # reuse existing mc/priority/area label semantics
├── task-create.ts                     # preserve task creation side effects
└── pilot-issue-eligibility.ts         # planned small helper if implementation needs a new module

src/lib/__tests__/
└── pilot-issue-eligibility.test.ts    # planned fixture/mocked-client coverage

scripts/
└── pilot-issue-smoke.ts|mjs           # planned explicit operator smoke path, no CI live mutation

docs/
├── github-sync.md                     # update existing sync behavior docs if needed
├── qa/pilot-smoke-checklist.md        # manual live smoke evidence checklist
└── ai/rc-factory-technical-roadmap.md # record deferred SPEC-013A1, SPEC-009E, SPEC-009C2+ boundaries
```

**Structure Decision**: Keep implementation in the existing GitHub sync/library layer and operator scripts. Do not add a production UI, production evidence endpoint, scheduler, cron, claim, runner, sandbox, or harness adapter surface.

## Phase 0: Research Summary

See [research.md](./research.md). Decisions resolve to: reuse existing GitHub sync/task creation seams, keep eligibility deterministic and fixture-compatible, keep synthetic fallback explicit and opt-in, assert side-effect absence through current-schema surfaces, and defer automated polling/evidence UI/execution pipeline work to later specs.

## Phase 1: Design Summary

See [data-model.md](./data-model.md), [quickstart.md](./quickstart.md), and [contracts/pilot-ingest-contract.md](./contracts/pilot-ingest-contract.md).

The design introduces no migration. It defines pilot entities as projections over existing GitHub issue data, Mission Control task rows, eligibility decisions, synthetic fallback issue handling, and manual smoke evidence.

## Post-Design Constitution Check

- **Schema/migration**: PASS. No migration is introduced; current-schema checks remain table/column guarded where needed.
- **Runtime side effects**: PASS. No automatic sync poller, cron, scheduler, claim, dispatch, runner, sandbox, triage, remediation, or harness integration is planned.
- **Workflow-contract boundary**: PASS. Tracker labels in `docs/ai/workflows/mission-control/workflow-contract.yaml` remain metadata, not executable pilot eligibility filters.
- **Reviewability**: PASS. Planned changes stay within the declared budget and defer larger surfaces by named future specs.

## Complexity Tracking

No constitution violations require justification.
