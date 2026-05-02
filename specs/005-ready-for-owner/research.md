# Research: SPEC-005 ready_for_owner State and Two-Step Terminal Event

## Decision: Centralize status vocabulary and transition guards in `src/lib/task-status.ts`

**Rationale**: The clarified spec requires every path that can write `done` to enforce the same PR merge gate and the same 409 body. Current code writes `done` in at least five places: `runAegisReviews`, `/api/quality-review`, bulk `PUT /api/tasks`, detail `PUT /api/tasks/[id]`, and GitHub pull reconciliation. A small helper avoids divergent checks and keeps reads separate from writes.

**Alternatives considered**:

- Inline checks in each route and scheduler path. Rejected because the conflict body, flag behavior, and PR-producing template lookup would drift.
- Add a large task lifecycle service. Rejected because SPEC-005 needs one narrow transition decision, not a broader state-machine rewrite.
- Put the guard in `task-dispatch.ts`. Rejected because API routes and GitHub sync already import task-dispatch for chain behavior; status vocabulary and API conflict shaping should not depend on scheduler code.

## Decision: Keep `ready_for_owner` in static read vocabulary while gating writes

**Rationale**: Rollback requires existing `ready_for_owner` rows to remain readable and visible even when `FEATURE_TWO_STEP_TERMINAL` is disabled. Static schemas, store types, status labels, task board grouping, filters, and messages therefore include the status unconditionally. New writes into `ready_for_owner`, and non-merge writes to `done` for PR-producing tasks while the flag is ON, are enforced by workspace-aware transition guards.

**Alternatives considered**:

- Hide or coerce `ready_for_owner` while flag OFF. Rejected because it would lose operator visibility during rollback.
- Reject `ready_for_owner` in Zod schemas universally. Rejected because it would break existing-row display and API reads.
- Allow manual `ready_for_owner` writes while flag OFF. Rejected because flag OFF must create no new two-step terminal behavior.

## Decision: Do not add `src/lib/notifications.ts`

**Rationale**: The current notification surface is already narrow and working: notification rows are created through `db_helpers.createNotification`, rendered in `src/components/panels/notifications-panel.tsx`, and delivered by `src/app/api/notifications/deliver/route.ts` through `formatNotificationMessage`. SPEC-005 needs one notification type, recipient fallback, and copy/rendering changes. A generic notification module would add abstraction without reducing meaningful duplication.

**Alternatives considered**:

- Add roadmap-named `src/lib/notifications.ts`. Rejected after inspecting current code because there is no existing module boundary to extend and the feature can use the current helper.
- Add ready-for-owner creation to `task-create.ts`. Rejected because this notification is a status-transition side effect, not task creation.
- Create notification rows directly in each route. Rejected because `db_helpers.createNotification` already broadcasts `notification.created`.

## Decision: Use existing nullable `workflow_templates.external_terminal_event`

**Rationale**: SPEC-001/SPEC-004 already added `external_terminal_event TEXT NULL`. SPEC-005 uses the canonical value `github_pr_merged` for PR-producing templates that require verified PR merge before `done`. This requires no migration, no enum constraint, no DB CHECK, and no terminal-event table.

**Alternatives considered**:

- Add a terminal-events table. Rejected by scope and unnecessary for one canonical value.
- Add a DB-level enum/CHECK. Rejected by the no-migration/no-CHECK constraints.
- Ignore `external_terminal_event` and use only `produces_pr`. Rejected because the roadmap and clarified decisions require the field to carry the external terminal event identity.

## Decision: Explicit PR identity is `github_repo + github_pr_number`

**Rationale**: `tasks.github_repo` and `tasks.github_pr_number` are the deterministic link from a Mission Control task to its terminal PR. Branch or PR metadata can help resolve a candidate only after it maps to exactly that identity. Issue closure alone is insufficient for PR-producing completion.

**Alternatives considered**:

- Infer PRs from GitHub issue timelines or closing references. Rejected by clarified scope and by determinism concerns.
- Treat closed issues as completion for every task. Rejected because PR-producing tasks must remain `ready_for_owner` without merged linked PR evidence.
- Accept any closed PR. Rejected because abandoned/closed-without-merge PRs are not terminal success.

## Decision: Add optional `pullFromGitHub(..., { webhookFixture })` seam

**Rationale**: Tests need deterministic merged PR and closed-issue-without-merged-PR evidence without changing production polling behavior. The optional parameter keeps existing production callsites unchanged and lets focused tests inject terminal evidence.

**Alternatives considered**:

- Mock `fetch` globally in every test. Rejected because it couples tests to GitHub API request order rather than terminal-event semantics.
- Add a production webhook endpoint in SPEC-005. Rejected as outside scope.
- Defer fixture seam to SPEC-009. Rejected because SPEC-005 owns P4-AC4 and P4-AC4a.

## Decision: Bulk updates preflight conflicts before side effects

**Rationale**: The conflict contract is side-effect-free. Bulk status updates can include many tasks, so the route must collect blocked ids before applying any update, activity, label sync, notification, or chain operation. The response body is the same uniform shape with all blocked task ids.

**Alternatives considered**:

- Partially update unblocked tasks and return failures for blocked tasks. Rejected because the acceptance contract requires side-effect-free blocked attempts.
- Stop on the first blocked task. Rejected because the uniform `task_ids` field is more useful when it reports every affected id in the batch.

## Decision: Chain advancement runs only after verified PR merge writes `done`

**Rationale**: SPEC-004 defines `advanceTaskChain` for terminal success. SPEC-005 makes `ready_for_owner` a pre-terminal waiting state. Downstream work must not start until the external PR merge event is verified and the task reaches `done`.

**Alternatives considered**:

- Run `advanceTaskChain` when entering `ready_for_owner`. Rejected because that starts downstream work before the human merge gate.
- Add a second pre-merge chain hook. Rejected as a broader state-machine change outside SPEC-005.

## Decision: Operator surfaces use teal `ready_for_owner` lane and `mc:ready-for-owner` label

**Rationale**: The clarified operator contract requires key `ready_for_owner`, label `Ready for Owner`, teal styling, lane order between `quality_review` and `done`, and GitHub label color `14b8a6` with description `Mission Control: ready for owner`. This preserves `awaiting_owner` as a separate early/manual-blocked state.

**Alternatives considered**:

- Reuse `awaiting_owner`. Rejected because it has a different meaning.
- Hide the lane while flag OFF. Rejected because existing rows must remain visible during rollback.
- Use generic status-change notification copy. Rejected because this is action-required owner merge work.
