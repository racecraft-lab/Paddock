# Implementation Plan: SPEC-009C3 - Dev/Review/Aegis to Ready for Owner

**Branch**: `009c3-remediation-ready-for-owner` | **Date**: 2026-05-16 | **Spec**: `specs/009c3-remediation-ready-for-owner/spec.md`
**Input**: Feature specification from `/specs/009c3-remediation-ready-for-owner/spec.md`

## Summary

Execute the Mission Control Issue Remediation chain from remediation planning
through dev implementation, review, Aegis approval, and the existing
`ready_for_owner` gate. The implementation approach is to keep the
`mission-control_dev_implementation` task as the PR owner and readiness
subject, reuse `advanceTaskChain`, `createTask`, `task_artifacts`,
`quality_reviews`, `task-status` guards, and current governance evidence
surfaces, and add only the narrow stage evidence and loop semantics needed for
review `fix`, Aegis `rejected`, Aegis `approved`, and fixture-linked PR
readiness proof.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22 with Next.js 16 App Router and React 19
**Primary Dependencies**: Next.js, React, Zustand where existing panels need it, Tailwind CSS 3, `better-sqlite3`, existing workflow-contract tooling, existing AJV/routing dependencies; no new runtime dependency planned
**Storage**: SQLite through `better-sqlite3`, synchronous transactions; existing `tasks`, `workflow_templates`, `task_artifacts`, `quality_reviews`, `activities`, and resource-governance tables/surfaces. SPEC-009C3 review, Aegis, governance, retry, artifact-publish failure, and readiness activities must preserve the PR-producing dev task's `workspace_id` and bounded root/dev task context.
**Testing**: Vitest for task-chain/artifact/quality-review/governance readiness tests, including artifact publish/supersede failures and side-effect-free blocked readiness; Playwright only if an existing ready-for-owner/operator surface changes; `pnpm typecheck`, `pnpm lint`, `pnpm build`
**Target Platform**: Mission Control web application and local operator runtime on Node >=22
**Project Type**: Next.js web application with API routes, scheduler/runtime task-chain logic, SQLite persistence, and operator documentation
**Performance Goals**: Readiness evaluation remains synchronous and bounded to the current task/workspace chain; no polling loop, runner, or long-running control-plane process is introduced
**Constraints**: Preserve workflow slugs; do not add claim/run/control-plane schema, sandbox lifecycle, automatic GitHub sync polling, merge reconciliation, or dedicated evidence UI; automated validation must not mutate live GitHub PRs
**Scale/Scope**: One pilot Issue Remediation chain path from SPEC-009C2 successor through PR-producing dev task `ready_for_owner`; existing non-pilot task-chain behavior remains compatible
**Reviewability Budget**: Primary surface is scheduler/runtime task-chain execution. Secondary surfaces are workflow contract copy/fields, quality-review API, task-artifact evidence, governance evidence checks, and docs/smoke. The roadmap transition exception permits the slice, but implementation must split anything that introduces formal run-state, claim authority, harness/sandbox adapters, automatic pollers, merge reconciliation, or dedicated evidence UI.
**Strict Scope**: Any new SPEC-009C3-owned TS/TSX modules must be added to `tsconfig.spec-strict.json` and `eslint.config.mjs`. If implementation modifies only existing modules plus docs/contracts, strict scope is N/A.

### State-Management Decision

SPEC-009C3 keeps the existing workflow slugs and stored
`mission-control_review.next_template_slug` value for seeded-contract
compatibility, but C3 review outcomes are guarded before that static fallback
can create a successor. For C3 review outputs tied to the PR-producing
`mission-control_dev_implementation` task:

- review `fix` records the failed verdict and terminates or blocks that
  advancement attempt before any `mission-control_owner_review`,
  `mission-control_aegis`, or `ready_for_owner` side effect can be created;
- review `pass` records the passing verdict on or linked/superseded onto the
  PR-producing dev task and makes that dev task eligible for the existing
  Aegis quality-review/readiness gate without creating or requiring a
  `mission-control_owner_review` successor in SPEC-009C3;
- missing dev-task identity, wrong workspace, missing required evidence, or an
  unsupported verdict fails closed and must not fall through to the static
  `next_template_slug`.
- required artifact publish or supersede failure records bounded failure
  activity on the PR-producing dev task's workspace and blocks readiness until
  the required artifact is successfully present;
- every readiness-blocking condition is evaluated before owner-ready side
  effects, so blocked attempts create no `ready_for_owner` status write,
  owner-ready notification, `task_ready_for_owner` activity, outbound
  ready-for-owner sync, Aegis/owner-review successor, or owner packet.

This is a scheduler/runtime task-chain guard over the C3 pilot path, not a
slug migration and not a new control-plane, claim, run-state, owner-review,
merge, or evidence-UI surface.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Pre-Phase 0 Gate Result**: PASS with transition-exception tracking.

- **I. Zero-Regression Contract**: Pass. The plan is additive to the pilot remediation path and must preserve existing non-pilot behavior when feature/workflow conditions are absent.
- **II. Upstream Compatibility Discipline**: Pass. No destructive migration or upstream identifier rename is planned; workflow slugs remain stable.
- **IV. Test-First Development**: Pass. Tasks must write RED Vitest coverage before production changes for review `fix`, Aegis `rejected`, Aegis `approved`, evidence requirements, governance blockers, deterministic PR identity, and ready-for-owner transition.
- **V. Feature-Flag Resolution Discipline**: Pass. No new flag is planned. Existing pilot and governance flags are reused where current surfaces require them.
- **VI. Dependency Supply-Chain Hygiene**: Pass. No new runtime dependency is planned.
- **VII. Additive Migration Policy**: Pass. No schema migration is planned.
- **VIII. Successor Side-Effect Parity**: Pass. Successors must continue to use `createTask`; no direct production `INSERT INTO tasks` path is planned.
- **X. Observability and Auditability**: Pass. Stage evidence uses `task_artifacts`, Aegis proof uses `quality_reviews`, and loop/block outcomes create durable activity/artifact evidence scoped to the PR-producing dev task's workspace.
- **XIV. Real UI Journey Quality Gate**: Conditional. No dedicated UI is planned. If an existing Task Board, PR link, Aegis badge/status, or owner notification surface changes, focused real Playwright coverage and screenshots are required.
- **XV. Spec Artifact Provenance And Archive Sweep**: Pass. Workflow startup records Archive Sweep discovery, current-target exclusion, and no cleanup mixed into this branch.
- **XVI. Reviewability And Verification Debt Control**: Pass by transition exception. Primary surface remains scheduler/runtime task-chain execution; secondary surfaces are explicitly bounded.

### Archive, Evidence, And Reviewability Requirements

- Archive Sweep remains a startup step before Phase 0 and excludes the current target `specs/009c3-remediation-ready-for-owner`.
- Cleanup of completed specs is out of scope for this phase branch unless separately reviewed with archive success and recovery commands.
- Generated screenshots remain CI/Argos artifacts unless a manifest-backed exception is introduced; none is planned.
- PR review packet source: plan, data model, contracts, quickstart, tasks, and implementation PR body must state what changed, why, non-goals, review order, scope budget, traceability, verification, known gaps, and rollback/flag notes.

For user-facing UI changes, the generated plan MUST also define:

- Real Playwright e2e journeys against the running app; mocked `page.setContent()`
  fixtures do not satisfy acceptance for new UI behavior.
- Docker-backed execution using the existing repository Docker build and
  deterministic seed data when Docker is available.
- Screenshot artifacts for human-in-the-loop review covering important
  before, during, after, and responsive states.
- If Playwright or Storybook screenshots are uploaded to Argos, CI metadata
  gates that verify Argos screenshot metadata includes test/story identity,
  source location, and spec-scoped tags; non-visual e2e runs must not upload
  empty Argos builds.
- A defect-remediation gate: failing e2e output and screenshots are reviewed
  before PR update, and known UI journey bugs are fixed before the PR is
  opened, updated, or marked ready.

For all specs that touch SpecKit artifacts, evidence retention, or UI evidence
policy, the generated plan MUST also define:

- Archive Sweep startup behavior before Phase 0, including previously merged
  spec discovery and current-target exclusion.
- The branch/worktree safety decision: apply cleanup only from a safe reviewed
  context; otherwise dry-run or stop.
- The provenance fields needed before cleanup: source paths, PR URL, merge
  commit or tree reference, CI/Argos links when relevant, cleanup mode,
  safe-to-apply state, and `git show` recovery commands.
- The screenshot/evidence guard commands and whether committed generated
  screenshots are absent or covered by a manifest-backed exception.

For all specs, the generated plan MUST also define:

- The primary review surface and any secondary surfaces.
- Whether the spec stays within the reviewability budget from the project
  constitution: warn above 400 reviewable LOC, 6 production files, 15 total
  files, or more than one primary surface; block above 800 reviewable LOC,
  8 production files, 25 total files, or more than one primary surface unless a
  ratified split exception exists.
- The exact split decision when the budget is exceeded, including follow-up
  spec IDs or issue IDs for deferred work.
- The PR review packet source: what changed, why, non-goals, review order,
  scope budget, traceability, verification, known gaps, and rollback/flags.

**Post-Phase 1 Gate Result**: PASS. The design artifacts keep the same primary
surface, define contracts over existing persistence/API surfaces, and leave
SPEC-009C4/D/E, SPEC-013, and SPEC-014 work deferred.

## Project Structure

### Documentation (this feature)

```text
specs/009c3-remediation-ready-for-owner/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── remediation-readiness-contract.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
docs/ai/workflows/mission-control/workflow-contract.yaml
docs/qa/pilot-smoke-checklist.md
docs/ai/rc-factory-technical-roadmap.md
src/app/api/quality-review/
src/lib/task-dispatch.ts
src/lib/task-artifacts.ts
src/lib/task-create.ts
src/lib/task-status.ts
src/lib/feature-flags.ts
src/lib/workflow-contracts/
src/lib/__tests__/
src/app/api/quality-review/__tests__/
tests/ or e2e/             # only if existing UI/operator surfaces change
tsconfig.spec-strict.json  # only if new TS/TSX modules are introduced
eslint.config.mjs          # only if new TS/TSX modules are introduced
```

**Structure Decision**: Use the existing single Next.js application structure.
Production work stays in existing task-chain, artifact, quality-review,
workflow-contract, status, and governance modules unless implementation proves a
small helper module is needed. No new app, service, runner, database subsystem,
or dedicated UI subtree is planned.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Reviewability transition exception | SPEC-009C3 is part of the roadmap transition that spans task-chain execution plus evidence/review/governance surfaces | Splitting before C3 would leave the pilot unable to prove the remediation chain reaches `ready_for_owner`; any formal run-state, claim, sandbox, adapter, poller, merge, or evidence-UI work is still split to later specs |
