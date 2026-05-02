# Implementation Plan: SPEC-005 ready_for_owner State and Two-Step Terminal Event

**Branch**: `005-ready-for-owner` | **Date**: 2026-05-02 | **Spec**: `specs/005-ready-for-owner/spec.md`
**Input**: Feature specification from `/specs/005-ready-for-owner/spec.md`

## Summary

Add application-level `ready_for_owner` task status support for PR-producing workflow templates. When `FEATURE_TWO_STEP_TERMINAL` is enabled for a workspace, Aegis and operator approval paths route PR-producing tasks to `ready_for_owner` instead of `done`; every non-merge attempt to write `done` for those tasks returns the uniform transition conflict; GitHub reconciliation alone can move the explicitly linked PR task to `done` after verified merge evidence, at which point the existing SPEC-004 `advanceTaskChain` terminal-success path runs. The implementation stays additive and flag-gated, preserves existing `awaiting_owner` behavior, introduces no migration, and uses current notification, label, Kanban, validation, and GitHub sync surfaces.

## Technical Context

**Language/Version**: TypeScript 5.7 strict in a Next.js 16 App Router / React 19 application  
**Primary Dependencies**: Next.js, React, Zustand, `better-sqlite3`, Vitest, Playwright, ESLint, pnpm; no new runtime dependency planned  
**Storage**: SQLite through `better-sqlite3`; existing `tasks.status`, `tasks.github_repo`, `tasks.github_pr_number`, `workflow_templates.produces_pr`, and nullable `workflow_templates.external_terminal_event` fields  
**Testing**: Vitest for transition, route, GitHub sync, label, notification, and guard tests; Playwright for the real Kanban lane/operator journey; `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm test:e2e`  
**Target Platform**: Node >= 22, server-rendered Next.js web app with local SQLite persistence  
**Project Type**: Single web application with App Router API routes, React panels, and local background/sync helpers  
**Performance Goals**: Transition guard and GitHub reconciliation checks add only synchronous DB lookups already local to the update transaction; no extra network call is added outside GitHub sync's existing pull loop  
**Constraints**: No database migration, no DB task-status CHECK, no terminal-event table, no issue timeline PR inference, no force-complete override, no chain advancement at `ready_for_owner`, flag-off behavior preserved, existing `awaiting_owner` behavior preserved  
**Scale/Scope**: One workspace-scoped feature flag; all live paths that can write `done` are in scope: `runAegisReviews`, `/api/quality-review`, bulk `PUT /api/tasks`, detail `PUT /api/tasks/[id]`, and `pullFromGitHub`  
**Strict Scope**: Add `src/lib/task-status.ts` to `tsconfig.spec-strict.json` and `eslint.config.mjs`. Do not add `src/lib/notifications.ts`; current notification integration stays in `src/lib/db.ts`, `src/components/panels/notifications-panel.tsx`, and `src/app/api/notifications/deliver/route.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Plan Compliance |
|-----------|-----------------|
| Zero-regression contract | `FEATURE_TWO_STEP_TERMINAL` defaults OFF and is resolved per workspace through `resolveFlag`. Existing `ready_for_owner` rows remain readable, but new writes are blocked while OFF. |
| Upstream compatibility discipline | Classification remains `upstream-divergent` because task-status vocabulary changes, but the change is application-level and flag-gated with no schema migration. |
| Feature-flag resolution discipline | Every transition decision calls the shared status/transition helper with workspace context; no inline `process.env.FEATURE_TWO_STEP_TERMINAL` reads. |
| Additive migration policy | No migration, no status CHECK, no enum constraint, no terminal-event table. Existing nullable `external_terminal_event` stores `github_pr_merged`. |
| Successor side-effect parity | SPEC-004 `advanceTaskChain` is preserved and only runs after verified PR merge writes `done`; entering `ready_for_owner` never creates successors. |
| Observability and auditability | `ready_for_owner` entry writes activity and notification; closed issue without merged PR writes deduped `github_terminal_reconciliation_required` activity plus notification. |
| Keep it simple | One narrow status/transition helper centralizes the guard and conflict body. Notification code uses existing helper and delivery surfaces instead of adding a generic notification module. |
| Real UI journey quality gate | Kanban lane and notification rendering require Playwright coverage against the running app with seeded data for `quality_review`, `ready_for_owner`, and `done`. |
| Spec artifact provenance | SPEC-005 plan records Archive Sweep as already completed in workflow Phase 0 and makes no additional archive cleanup changes. |

**Pre-design gate result**: Pass. No violations require complexity tracking.

## Project Structure

### Documentation (this feature)

```text
specs/005-ready-for-owner/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- api-transitions.md
|   |-- github-terminal-event.md
|   `-- operator-surfaces.md
`-- tasks.md
```

### Source Code (repository root)

```text
src/
|-- lib/
|   |-- task-status.ts              # new shared status vocabulary and transition guard
|   |-- task-dispatch.ts            # Aegis branch to ready_for_owner or done
|   |-- github-sync-engine.ts       # merge evidence, reconciliation, label sync, fixture seam
|   |-- github-label-map.ts         # ready_for_owner label map
|   |-- validation.ts               # read vocabulary plus write guard integration
|   `-- db.ts                       # existing createNotification helper
|-- app/api/
|   |-- quality-review/route.ts     # approved-review status transition
|   |-- tasks/route.ts              # bulk transition guard
|   |-- tasks/[id]/route.ts         # detail transition guard
|   `-- notifications/deliver/route.ts
|-- components/panels/
|   |-- task-board-panel.tsx        # Kanban lane and status styling
|   `-- notifications-panel.tsx     # task_ready_for_owner rendering
|-- store/index.ts                  # task status union and counters
`-- index.ts                        # exported task status union

messages/
|-- *.json                          # Ready for Owner lane and notification copy

tests/
|-- e2e/                            # running-app Kanban and notification journey
`-- focused Vitest files beside touched route/lib surfaces
```

**Structure Decision**: Use the existing Next.js monorepo layout. Add only one new strict-scope module, `src/lib/task-status.ts`, because every done-writing path needs the same feature-flag-aware transition decision and conflict contract. Do not create a generic notification abstraction; SPEC-005 notification needs are narrow and fit existing `db_helpers.createNotification`, panel rendering, and delivery formatting.

## Implementation Design

### Shared Transition Boundary

- Add `src/lib/task-status.ts` exporting:
  - `TASK_STATUSES` including `ready_for_owner` for read/display/static vocabulary.
  - `READY_FOR_OWNER_STATUS = 'ready_for_owner'`.
  - `READY_FOR_OWNER_TERMINAL_EVENT = 'github_pr_merged'`.
  - `READY_FOR_OWNER_CONFLICT_REASON = 'ready_for_owner_pr_merge_required'`.
  - `transitionConflict(taskIds: number[])` returning `{ error: 'transition_conflict', reason: 'ready_for_owner_pr_merge_required', task_ids }`.
  - `resolveTaskTerminalTransition(input)` returning one of `allow_done`, `route_ready_for_owner`, `block_done`, or `allow_nonterminal`.
- The helper receives the current task row, optional workflow template fields, requested status, workspace id or workspace flags, and trigger source.
- The helper treats reads differently from writes: static schemas and stores accept `ready_for_owner`; write paths call the guard before mutating status.
- While flag OFF, new transitions into `ready_for_owner` are blocked or normalized, but existing rows are still selected and rendered.
- While flag ON, every non-GitHub-merge write to `done` for a PR-producing task is blocked or routed to `ready_for_owner`. The guard is not limited to `ready_for_owner -> done`; it covers any attempted `done` write for a PR-producing task unless the trigger is verified GitHub PR merge.

### Transition Sites

- `runAegisReviews` in `src/lib/task-dispatch.ts`:
  - Load `workflow_template.produces_pr` and `external_terminal_event` with the reviewable task.
  - If approved and flag ON with `produces_pr=true`, write `ready_for_owner`, log activity, create `task_ready_for_owner` notification, sync label, and do not call `advanceTaskChain`.
  - If approved and flag OFF or template is not PR-producing, preserve current write to `done` and existing `advanceTaskChain` behavior.
- `/api/quality-review`:
  - On approved review, call the same guard before the status update.
  - Route to `ready_for_owner`, allow `done`, or return the uniform 409 before side effects.
- Bulk `PUT /api/tasks`:
  - Preflight all tasks in the transaction before applying any update.
  - If any requested `done` write is blocked, throw a typed conflict carrying all affected ids and return the uniform 409 without partial updates.
- Detail `PUT /api/tasks/[id]`:
  - Guard `status='done'` and `status='ready_for_owner'` writes before the update statement.
  - Single-task conflicts return the same body with a one-item `task_ids`.
  - Ordinary failed-to-done updates do not bypass the merge gate.
- `pullFromGitHub`:
  - Add optional `opts?: { webhookFixture?: GitHubTerminalFixture }`.
  - Production callsites in `/api/github/sync` and `/api/github` pass no options.
  - Verified merge evidence is the only trigger that can write `done` for PR-producing `ready_for_owner` tasks and then call `advanceTaskChain` with trigger `github_pr_merged`.

### GitHub Terminal Event

- Use explicit task `github_repo + github_pr_number` identity. Do not inspect issue timelines or infer PRs from closing references.
- Accept merge evidence only when repo and PR number match and one of `merged=true`, `merged_at`, or `merge_commit_sha` is present.
- Closed issue without merged PR evidence leaves the task in `ready_for_owner`.
- Reconciliation writes one activity:
  - type `github_terminal_reconciliation_required`
  - `entity_type='task'`
  - `entity_id=<task id>`
  - actor `github-sync`
  - data `{ task_id, workspace_id, github_repo, github_issue_number, github_pr_number, reason: 'linked_issue_closed_without_merged_pr', source: 'github_sync' }`
- Deduplicate reconciliation for unchanged `{ task_id, github_issue_number, reason }` before writing activity or notification.

### Operator Surfaces

- Add `ready_for_owner` to:
  - `src/lib/github-label-map.ts` `TaskStatus`, `STATUS_LABEL_MAP`, `ALL_STATUS_LABEL_NAMES`, inverse mapping, and tests.
  - `src/lib/validation.ts` static read/write vocabulary, with transition guard enforcing flag-aware writes.
  - `src/store/index.ts`, `src/index.ts`, and task-count surfaces.
  - `src/components/panels/task-board-panel.tsx` status union, `STATUS_COLUMN_KEYS`, lane styling, status badge styling, filters/select controls, and grouping logic.
  - `messages/*.json` lane/copy keys, with English source copy `Ready for Owner`.
- Kanban lane uses key `ready_for_owner`, title `Ready for Owner`, teal styling, and appears between `quality_review` and `done`.
- `awaiting_owner` remains in its current lane position and keyword-detection behavior.
- Accessibility stays on existing task board and notification card patterns: the `ready_for_owner` column keeps a region accessible name that includes the lane title and count, task cards and unread notification actions remain keyboard reachable with visible focus indicators, and the owner-merge requirement is present in text (`Ready for Owner`, `Owner action required`, notification title/message/type) instead of relying on teal styling alone.
- GitHub label:
  - name `mc:ready-for-owner`
  - color `14b8a6`
  - description `Mission Control: ready for owner`
  - provisioned through existing `initializeLabels` and applied idempotently by existing status-label replacement behavior.
- Notification:
  - type `task_ready_for_owner`
  - normal title `Ready for owner merge`
  - reconciliation title `Owner merge reconciliation required`
  - message includes `Owner action required`
  - recipient is `assigned_to`, else `created_by`
  - rendering stays in `notifications-panel.tsx`; delivery copy extends `formatNotificationMessage` in `src/app/api/notifications/deliver/route.ts`.

### Status Hygiene Boundary

Phase 0 status-hygiene edits to roadmap, PRD, SPEC-004/SPEC-006 workflow status, and `autopilot-state.json` are separate from SPEC-005 runtime implementation. Plan and tasks must not reclassify those bookkeeping edits as runtime deliverables.

## Phase 0: Research

Research is captured in `specs/005-ready-for-owner/research.md`. All planning unknowns are resolved:

- Shared transition guard lives in new `src/lib/task-status.ts`.
- No generic `src/lib/notifications.ts` is added.
- `pullFromGitHub` gains an optional test-only fixture seam.
- Existing nullable `external_terminal_event` stores canonical `github_pr_merged`.
- `ready_for_owner` is static read vocabulary; writes are feature-flag/transition guarded.

## Phase 1: Design and Contracts

Design artifacts created:

- `specs/005-ready-for-owner/data-model.md`
- `specs/005-ready-for-owner/contracts/api-transitions.md`
- `specs/005-ready-for-owner/contracts/github-terminal-event.md`
- `specs/005-ready-for-owner/contracts/operator-surfaces.md`
- `specs/005-ready-for-owner/quickstart.md`

## Post-Design Constitution Check

**Result**: Pass.

| Principle | Post-Design Evidence |
|-----------|----------------------|
| No migration | Data model uses existing columns and existing notification/activity tables only. |
| Flag discipline | Every write path calls the shared guard with workspace context. |
| Side-effect safety | Blocked conflicts are preflighted before DB writes; bulk route returns all blocked ids without partial mutation. |
| Chain timing | `advanceTaskChain` runs only after verified PR merge writes `done`. |
| UI quality | Quickstart requires running-app Playwright coverage for lane placement and notification surfacing. |
| Cross-spec boundary | Contracts exclude artifact disposition, governance, pilot seed behavior, onboarding, and CrabTrap. |

## Complexity Tracking

No constitution violations or justified complexity exceptions.
