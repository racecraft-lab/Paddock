# Feature Specification: SPEC-013A Run-State Persistence Spine

**Feature Branch**: `013a-run-state-spine`  
**Created**: 2026-05-22  
**Status**: Completed
**Input**: User description: "/speckit.specify SPEC-013A - Run-State Persistence Spine"

## Clarifications

### Session 2026-05-22 - Schema Identity And Lifecycle

- Q: Where should attempt identity, current projection, and lifecycle history live? A: Use two additive tables: `task_stage_attempts` for attempt identity/current projection and `task_stage_attempt_events` for append-only observed lifecycle history.
- Q: Which attempt identity fields are required? A: Require `workspace_id`, `task_id`, non-null `stage_key`, `attempt_number`, `status`, `created_at`, `updated_at`, nullable `started_at`, `completed_at`, `archived_at`, nullable `run_id`, and optional `workflow_template_id` / `workflow_template_slug` copied from the task context when the attempt is created.
- Q: Which lifecycle states belong in SPEC-013A? A: Keep exactly `created`, `running`, `succeeded`, `failed`, `released`, `cancelled`, and `archived`; do not add claim, retry, timeout, or blocked vocabulary in this slice.
- Q: Which uniqueness/index behavior supports inspection without implementing SPEC-013B claim authority? A: Use uniqueness only for attempt number per task-stage, specifically `workspace_id`, `task_id`, `stage_key`, and `attempt_number`; add non-unique inspection indexes for task, status, optional `run_id`, and lifecycle ordering; do not add one-active-attempt uniqueness.
- Q: What write boundary is allowed? A: SPEC-013A permits only explicit debug, fixture, or test-support writes for creating representative attempts, appending/updating observed lifecycle state, and non-destructively archiving attempts. Any runtime debug write API must require a human-admin session, while operator-facing inspection remains authenticated and read-only. These writes must not select work, claim work, prevent duplicate launch, dispatch, call the scheduler, reconcile GitHub/task state, retry/backoff, launch harnesses, manage sandboxes, or mutate review-packet behavior.

### Session 2026-05-22 - Flag-Off Runtime Isolation And Debug Reads

- Q: Which runtime paths must ignore attempt rows when `FEATURE_TASK_CONTROL_PLANE=false`? A: Existing scheduler, dispatch, task-chain advancement, Aegis review, GitHub sync/poller, runtime runs, pilot review packet, and existing task evidence routes remain table-blind to `task_stage_attempts` and `task_stage_attempt_events`; only a dedicated debug inspection surface may read attempt data.
- Q: What exactly does flag-off debug inspection show? A: A compact read-only attempt list with task/workspace/stage identity, attempt number, status, created/updated/started/completed/archived timestamps, workflow template id/slug when present, optional `run_id` link state (`none`, `linked`, `missing/unavailable`), and recent lifecycle summary. It shows archived attempts distinctly and exposes no claim, retry, release, cancel, scheduler, or launch controls.
- Q: What auth and workspace masking rules apply? A: Reads require authenticated viewer-or-higher semantics and existing workspace-scope masking: malformed scope returns `400`, forbidden explicit scope returns `403`, and nonexistent/out-of-scope tasks both return masked `404 task_not_found`. Debug writes require a verified human-admin context that rejects global API-key and agent API-key callers; Plan must confirm whether trusted proxy-auth human admins count as human-admin context.
- Q: Should `FEATURE_TASK_CONTROL_PLANE` enter the typed flag registry now? A: Yes. SPEC-013A adds the typed default-off registry entry so implementation can use `resolveFlag` without string casts or inline environment reads; admin enablement and safe ON behavior remain later-spec decisions.
- Q: What static guardrails are required? A: Add SPEC-013A guardrails that block inline `process.env.FEATURE_TASK_CONTROL_PLANE` reads outside the flag registry, and block named runtime/evidence/packet paths from importing attempt helpers or directly referencing attempt table names. Allow attempt table strings only in migrations, rollback SQL, debug route/helper, fixtures, and tests.

### Session 2026-05-22 - Runs Relationship And Archive Semantics

- Q: Should `task_stage_attempts.run_id` use a foreign key to `runs.id`? A: Use a soft nullable text reference with app-level lookup, not a database foreign key, so attempts remain inspectable when a linked run is missing/unavailable and rollback is not constrained by `runs` foreign-key behavior.
- Q: Which runtime-run fields should attempt inspection reference rather than duplicate? A: Store only the durable `run_id` link on the attempt. At read time, expose a compact run summary such as run id, status, started/ended timestamps, agent name, runtime, git branch/commit, and error state when available; do not copy steps, cost, eval, provenance, tags, or full run metadata into attempt rows.
- Q: How should archive state work? A: Archiving sets `status='archived'`, sets `archived_at`, appends an `archived` lifecycle event, and keeps archived attempts queryable in task-detail/debug inspection by default with a distinct archived marker.
- Q: What rollback behavior is required? A: Provide idempotent rollback SQL that drops `task_stage_attempt_events` before `task_stage_attempts`, deletes only the SPEC-013A migration marker, includes or instructs `PRAGMA foreign_key_check`, and warns operators that rollback removes attempt history unless backed up/exported first.
- Q: Should trusted proxy-auth admin users count as the human-admin context for debug writes? A: Yes, when auth resolution yields a real trusted proxy-auth or session-cookie admin with a normal positive persisted user identity. Global API-key callers, agent API-key callers, and requests carrying agent identity never satisfy the human-admin debug-write guard.

### Session 2026-05-22 - API/UI Surface And SPEC-013B Boundary

- Q: What read-only route exposes task-stage attempts? A: Use a dedicated task-scoped route, `GET /api/tasks/[id]/stage-attempts`, and keep existing task Evidence routes table-blind to attempt tables.
- Q: Where does the UI render attempt inspection? A: Add a separate compact read-only `Run state` / `Stage attempts` section in the existing task detail Details tab near Evidence, backed by the dedicated attempt route. Do not add a global dashboard, modal control center, or controls inside the Evidence component.
- Q: Is a write/debug endpoint allowed outside tests? A: Plan may select at most one spec-scoped fixture/UAT endpoint, such as `POST /api/admin/spec-013a/attempt-fixtures`, for representative create/event/archive actions only. It must be human-admin-only, mutation/rate limited, CSRF-protected when cookie auth can authorize it, structured-audited with actor/request/row/outcome details, unavailable outside fixture/UAT need unless explicitly reviewed, and it must never mutate task status, scheduler, dispatch, run launch, GitHub sync, retry, sandbox, or review-packet state.
- Q: How should SPEC-013A encode prohibitions against later control-plane behavior? A: Encode the boundary as contract language and guardrails. SPEC-013A must not add claim tokens, active-owner fields, one-active-attempt enforcement, duplicate-launch prevention, work selection, scheduler calls, GitHub/task reconciliation, retry/backoff controls, release/cancel action controls, sandbox lifecycle, harness adapters, auto-merge behavior, or UI action controls. The allowed `released` and `cancelled` lifecycle values are passive observed states only.
- Q: What response envelope should the read route return? A: Use a `task_stage_attempts.v1` envelope with `task`, ordered `attempts`, and `warnings`. Each attempt includes identity, timestamps, status, archive evidence, workflow template context, `run_link.state` (`none`, `linked`, `missing_unavailable`), optional compact `run_summary`, and bounded recent lifecycle entries. Order attempts by `stage_key` then latest attempt number; order lifecycle snippets chronologically.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect Task-Stage Attempt State (Priority: P1)

As an operator, I need to inspect whether a task-stage attempt exists for a task, what lifecycle state it is in, whether it has been archived, and whether it links to a concrete runtime run, so I can debug control-plane readiness from durable Mission Control evidence rather than terminal history.

**Why this priority**: This is the minimum valuable slice. Without durable, inspectable attempt state, later task-control-plane work has no reviewable substrate.

**Independent Test**: Seed or create representative task-stage attempts, then verify an authenticated operator can inspect each attempt's task identity, workflow/stage identity, attempt number, lifecycle history summary, current state, archive status, and optional run linkage without relying on scheduler or harness execution.

**Acceptance Scenarios**:

1. **Given** a task-stage attempt exists without a linked runtime run, **When** an authenticated operator opens the task debug inspection surface, **Then** the attempt is visible with task identity, workflow/stage identity, attempt number, current lifecycle state, and no required runtime-run link.
2. **Given** a task-stage attempt has a linked runtime run, **When** an authenticated operator inspects the attempt, **Then** the runtime run relationship is visible without duplicating the runtime run's full execution details.
3. **Given** multiple attempts exist for the same task and stage, **When** an authenticated operator inspects the task, **Then** attempts are distinguishable by attempt number and lifecycle history.

---

### User Story 2 - Archive Attempts Non-Destructively (Priority: P2)

As an operator, I need attempts to be archived without deletion or relocation, so historical debugging evidence remains available while archived attempts are clearly distinguishable from active or recent attempts.

**Why this priority**: Archive behavior is part of the core persistence spine and must be proven before later control-plane specs rely on attempt history.

**Independent Test**: Archive a representative attempt and verify the attempt row remains inspectable, includes archived state or archived timestamp evidence, and is excluded from active-style summaries without being physically deleted, exported, or moved.

**Acceptance Scenarios**:

1. **Given** a task-stage attempt is archived, **When** an authenticated operator inspects the task, **Then** the attempt remains present with clear archive evidence and its prior lifecycle context.
2. **Given** archived and non-archived attempts exist for a task, **When** an operator reviews the compact task debug section, **Then** the archived attempt is visually or structurally distinguishable from non-archived attempts.

---

### User Story 3 - Prove Flag-Off Runtime Safety (Priority: P3)

As a reviewer or future implementer, I need `FEATURE_TASK_CONTROL_PLANE=false` behavior to ignore run-state rows at runtime while still permitting read-only inspection, so Mission Control can land the persistence spine without prematurely changing dispatch, scheduler, task-chain, GitHub sync, or review-packet behavior.

**Why this priority**: Runtime safety is required for incremental rollout and for proving SPEC-013A does not smuggle in claim authority or scheduler behavior.

**Independent Test**: With the task-control-plane flag disabled and representative attempts present, verify existing task, dispatch, task-chain, GitHub sync, and review-packet flows behave as they did before while authenticated read-only inspection still shows the attempt records.

**Acceptance Scenarios**:

1. **Given** `FEATURE_TASK_CONTROL_PLANE=false` and task-stage attempts exist, **When** existing scheduler, dispatch, GitHub sync, task-chain, and review packet flows run, **Then** those flows ignore the attempt records and preserve existing behavior.
2. **Given** `FEATURE_TASK_CONTROL_PLANE=false` and task-stage attempts exist, **When** an authenticated operator uses the debug inspection surface, **Then** the attempts remain visible for UAT and review evidence.

### Edge Cases

- Attempts may exist before any runtime run is created and therefore must not require a runtime-run link.
- A runtime run may be absent, deleted by pre-existing retention behavior, or unavailable; the task-stage attempt must remain inspectable with the link shown as missing or unavailable.
- Multiple attempts can exist for the same task-stage identity and must remain ordered and distinguishable by attempt number and lifecycle timing.
- Archived attempts must not be physically deleted, exported-and-deleted, or moved to a separate archive table in this slice.
- Unknown, malformed, or future lifecycle states must fail closed for writes and render safely for read-only inspection.
- Stored projection fields may contain valid lifecycle vocabulary while disagreeing with latest valid lifecycle events; read inspection must surface this as warning-only projection drift with no hidden repair, mutation, synthesized lifecycle event, or runtime/control-plane side effect.
- Feature-flag-off operation must not block debug reads, but must not affect scheduler, dispatch, claim, retry, GitHub sync, task-chain, or review-packet behavior.
- Nonexistent and out-of-scope task IDs must not leak task existence through distinguishable read responses.
- Debug write routes must reject API-key and agent-key callers even if those callers otherwise carry admin-like permissions.
- Rolling back SPEC-013A persistence removes attempt history unless the operator backs it up or exports it before rollback.
- `released` and `cancelled` are passive observed lifecycle states only and must not create release/cancel UI controls.
- Runtime fixture endpoints, if present, must be intentionally unavailable outside fixture/UAT use unless security review explicitly accepts production reachability.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST maintain dedicated additive `task_stage_attempts` and `task_stage_attempt_events` persistence separate from runtime run metadata.
- **FR-002**: System MUST represent one append-only attempt per task-stage execution.
- **FR-003**: Each attempt MUST be keyed or identifiable by `workspace_id`, `task_id`, non-null `stage_key`, `attempt_number`, current lifecycle state, lifecycle history, archive status, and optional runtime-run linkage, with optional workflow-template id/slug context captured from the task when available.
- **FR-004**: System MUST allow an attempt to exist before a concrete runtime run exists.
- **FR-005**: System MUST preserve optional linkage from a task-stage attempt to an existing runtime run as a soft nullable `run_id` text reference without a database foreign key and without duplicating runtime-run execution fields as the authoritative source of run details.
- **FR-006**: System MUST record lifecycle as append-only observed state history plus current-state projection columns on the attempt record.
- **FR-007**: System MUST use exactly the lifecycle vocabulary `created`, `running`, `succeeded`, `failed`, `released`, `cancelled`, and `archived` for this slice.
- **FR-008**: System MUST treat archive as non-destructive attempt state, timestamp evidence, and lifecycle event evidence; attempts MUST NOT be physically deleted, moved to archive tables, or exported-and-deleted by SPEC-013A behavior.
- **FR-009**: System MUST provide authenticated read-only operator inspection of task-stage attempts, including lifecycle history summary, current state, archive evidence, optional workflow-template context, and optional runtime-run linkage.
- **FR-010**: System MUST keep read-only debug inspection available when `FEATURE_TASK_CONTROL_PLANE=false`, showing compact attempt identity, timestamps, status, archive evidence, optional run link state, and recent lifecycle summary without action controls.
- **FR-011**: With `FEATURE_TASK_CONTROL_PLANE=false`, existing scheduler, dispatch, task-chain advancement, Aegis review, GitHub sync/poller, runtime runs, pilot review packet, and existing task evidence behavior MUST ignore task-stage-attempt rows.
- **FR-012**: System MUST NOT introduce claim authority, duplicate-launch prevention, scheduler launch, automatic GitHub sync, terminal reconciliation, retry/backoff controls, sandbox lifecycle, harness adapters, full dashboard, or auto-merge behavior in SPEC-013A.
- **FR-013**: System MUST include idempotent rollback SQL for additive persistence changes, dropping event/history tables before parent attempt tables and documenting operator data-loss/backup expectations.
- **FR-014**: System MUST explain in reviewer-facing evidence why existing runtime runs and runtime-run metadata are insufficient as the sole durable task-stage-attempt model.
- **FR-015**: System MUST constrain uniqueness to attempt number per task-stage, not one-active-attempt enforcement or duplicate-launch prevention.
- **FR-016**: System MUST apply existing workspace-scope masking to attempt reads, including masked `404 task_not_found` responses for nonexistent and out-of-scope tasks.
- **FR-017**: System MUST restrict any runtime debug write API for representative attempt create/update/archive behavior to a verified human-admin context that excludes global API-key callers, agent API-key callers, and requests carrying agent identity; trusted proxy-auth human admins count only when resolved as real positive-id admins.
- **FR-018**: System MUST add `FEATURE_TASK_CONTROL_PLANE` to the typed feature-flag registry as default-off and MUST use `resolveFlag` for checks instead of inline environment reads or string casts.
- **FR-019**: System MUST include static guardrails that prevent named runtime/evidence/packet paths from importing attempt helpers or directly referencing attempt tables; preserve the task-creation parity guard by failing on direct production `INSERT INTO tasks` outside `src/lib/task-create.ts`; and prevent SPEC-013A attempt inspection, helper, fixture, or UAT paths from creating successor tasks or bypassing `createTask()`.
- **FR-020**: System MUST expose read-only attempt inspection through a dedicated task-scoped route shaped as `GET /api/tasks/[id]/stage-attempts`, while existing task Evidence routes remain table-blind to attempt tables.
- **FR-021**: System MUST render attempt inspection as a separate compact read-only task-detail section near Evidence, not as a global dashboard, modal control center, or action surface.
- **FR-022**: System MAY expose at most one spec-scoped fixture/UAT endpoint for representative create/event/archive actions, and that endpoint MUST be human-admin-only, mutation/rate limited, CSRF-protected when cookie auth can authorize it, structured-audited, and inert with respect to runtime control-plane state.
- **FR-023**: System MUST NOT add schema columns, response fields, UI controls, helper names, imports, route names, code paths, or guard bypasses that imply claim ownership or locking, launch authority, retry/backoff authority, release/cancel authority, scheduler integration, GitHub reconciliation or mutation, sandbox lifecycle, harness adapter execution, or auto-merge behavior. Static guardrails MUST catch accidental SPEC-013B/014 drift vocabulary and code paths across production source, migrations, API contracts, helpers, routes, and UI surfaces, with explicit allowlists only for SPEC-013A-approved tests, fixtures, migrations, rollback SQL, and read-only debug inspection.
- **FR-024**: System MUST provide reviewer-facing migration evidence that migration `076_task_stage_attempts` is additive and rerun-safe by applying it twice against a representative database and recording live schema inspection for the attempt tables, attempt uniqueness, non-unique inspection indexes, lifecycle foreign key, `schema_migrations` marker, and foreign-key health.
- **FR-025**: The dedicated attempt-read route MUST define exact API contract behavior for visible tasks with zero attempts, active attempts, archived attempts, linked runtime runs, missing/unavailable runtime runs, and invalid stored attempt or lifecycle state. Visible tasks with zero attempts MUST return `200` with the `task_stage_attempts.v1` envelope, `attempts: []`, and no mutation or hidden repair behavior.
- **FR-026**: The dedicated attempt-read route MUST be represented in reviewer-facing API documentation/index artifacts, including `openapi.json` and the local API index route, as a generic task-scoped read-only route suitable for later SPEC-013B/C reuse without claim, retry, release, cancel, launch, scheduler, GitHub, sandbox, harness, or auto-merge vocabulary.
- **FR-027**: The dedicated attempt-read route MUST detect valid-but-stale current-state projection drift when `task_stage_attempts.status`, `updated_at`, `started_at`, `completed_at`, or `archived_at` disagrees with the lifecycle history implied by valid `task_stage_attempt_events` rows. The route MUST return the stored projection fields with `projection_drift` warnings that identify the drifted field and expected lifecycle-derived value, and MUST NOT repair rows, mutate lifecycle history, synthesize events, call scheduler/runtime paths, or expose retry, release, cancel, claim, or launch controls.
- **FR-028**: The task-detail `Run state` / `Stage attempts` section MUST communicate loading, visible-task/no-attempts, route error, active attempt, archived attempt, missing/unavailable run link, invalid stored state, and projection-drift warning states with visible text or structural labels, not by color alone. Loading and non-error progress text MUST be exposed as a status message; route errors MUST be exposed as an alert; the section MUST be a named region that remains readable when color, badge hue, or iconography is unavailable.
- **FR-029**: The task-detail run-state section MUST preserve existing task-detail density by using compact labels, bounded lifecycle snippets, and wrapping or breaking long stage keys, workflow-template slugs, run ids, warning codes, and lifecycle messages without horizontal overflow or marketing/dashboard-style layout. Runtime-run references MAY render as allowlisted read-only links with descriptive accessible names or as inert text, but MUST NOT use command verbs, buttons, forms, menus, disabled placeholder controls, or labels that imply claim, retry, release, cancel, launch, scheduler, GitHub, sandbox, harness, or auto-merge authority.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities *(include if feature involves data)*

- **Task-Stage Attempt (`task_stage_attempts`)**: A durable record of one observed task-stage execution attempt. Key attributes include workspace identity, task identity, stage identity, attempt number, current lifecycle state, archive evidence, creation/update timing, optional workflow-template context, and optional runtime-run linkage.
- **Attempt Lifecycle Entry (`task_stage_attempt_events`)**: An append-only observed lifecycle state entry for a task-stage attempt. It records the state, timing, and reviewable context needed to reconstruct how the attempt reached its current projection.
- **Current State Projection**: The compact current view of an attempt stored on the attempt record and derived from lifecycle history for operator inspection and future control-plane consumers.
- **Runtime Run Link**: A soft optional `run_id` text relationship from a task-stage attempt to an existing runtime run. It preserves continuity with current runtime execution records without making the runtime run mandatory or blocking inspection when the run is missing.
- **Archive Evidence**: Non-destructive evidence that an attempt is archived, represented by `status='archived'`, `archived_at`, and an `archived` lifecycle entry while preserving the original attempt and lifecycle context.
- **Attempt Inspection Envelope**: The read contract for `task_stage_attempts.v1`, containing task identity, ordered attempt summaries, bounded lifecycle snippets, optional run link summary, warnings, and no action controls.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In UAT fixtures, 100% of representative task-stage attempts can be inspected by an authenticated operator with task identity, workflow/stage identity, attempt number, current state, archive evidence, lifecycle summary, and optional runtime-run linkage visible.
- **SC-002**: With the task-control-plane flag disabled, existing scheduler, dispatch, GitHub sync, task-chain, and review-packet checks complete with no behavior changes attributable to task-stage-attempt rows.
- **SC-003**: 100% of archived representative attempts remain inspectable after archive action and are not physically deleted, moved to a separate archive table, or exported-and-deleted.
- **SC-004**: Reviewer evidence demonstrates at least one attempt without a runtime-run link and at least one attempt with a runtime-run link, proving the relationship is optional.
- **SC-005**: Reviewer evidence identifies no claim authority, duplicate-launch prevention, scheduler launch, retry/backoff controls, sandbox lifecycle, harness adapter, automatic GitHub sync, terminal reconciliation, full dashboard, or auto-merge behavior added by this slice.
- **SC-006**: Static guardrails fail if `FEATURE_TASK_CONTROL_PLANE` is read inline; if scheduler, dispatch, task-chain, Aegis, GitHub sync, runtime-run, pilot review packet, or existing task evidence paths directly reference task-stage-attempt persistence; if production source performs direct `INSERT INTO tasks` outside `src/lib/task-create.ts`; or if schema fields, response fields, helper/function names, imports, route names, UI controls, or code paths introduce SPEC-013B/014 drift for claim/retry/release/cancel authority, scheduler launch, GitHub reconciliation or mutation, sandbox lifecycle, harness adapters, or auto-merge behavior.
- **SC-007**: Migration rollback evidence shows child-first table removal, SPEC-013A migration-marker cleanup, foreign-key check guidance, and an operator warning that rollback removes attempt history unless backed up or exported.
- **SC-008**: API/UI contract evidence shows the dedicated read route and compact task-detail section expose attempt state without claim, retry, release, cancel, launch, scheduler, GitHub, sandbox, harness, or auto-merge controls.
- **SC-009**: Any fixture/UAT write endpoint evidence shows human-admin-only access, API-key/agent-key rejection, mutation/rate limiting, CSRF coverage when cookie-authenticated, structured audit output, and no mutation outside attempt/event/audit rows.
- **SC-010**: Migration verification evidence includes zero duplicate objects after a second migration run, `PRAGMA table_xinfo` output for both SPEC-013A tables, `PRAGMA index_list` / `PRAGMA index_xinfo` output proving the allowed uniqueness and inspection indexes, `PRAGMA foreign_key_check` returning no violations, and the single `076_task_stage_attempts` marker in `schema_migrations`.
- **SC-011**: API contract evidence demonstrates `GET /api/tasks/[id]/stage-attempts` returns the same `task_stage_attempts.v1` envelope for no attempts, active attempts, archived attempts, linked runs, missing/unavailable runs, and invalid stored states, and that `openapi.json` plus the local API index describe the route as read-only viewer-authenticated task inspection.
- **SC-012**: API/helper evidence demonstrates that valid-but-stale projection drift returns `projection_drift` warnings for status and timestamp mismatches, leaves stored rows unchanged after inspection, and ignores invalid lifecycle entries when deriving expected projection values.
- **SC-013**: UI accessibility evidence demonstrates the compact task-detail run-state section has accessible named-region, status, alert, non-color-only, text-fit, and read-only/no-control coverage for loading, no attempts, active attempt, archived attempt, linked run, missing/unavailable run, route error, invalid-state warning, and projection-drift warning states across desktop and narrow responsive layouts.

## Assumptions

- The selected model is a dedicated additive task-stage-attempt spine rather than reuse-only runtime-run metadata.
- Runtime runs remain the source of truth for runtime execution details; task-stage attempts are the source of truth for task-stage attempt identity, lifecycle, archive status, and pre-run visibility.
- The lifecycle vocabulary is exactly `created`, `running`, `succeeded`, `failed`, `released`, `cancelled`, and `archived` for SPEC-013A.
- Read-only inspection is authenticated and compact, located near existing task detail or debug evidence surfaces if planning confirms that placement.
- Any write path used to create, append/update observed lifecycle state, or archive representative attempts is explicit debug, fixture, or test-support behavior only and does not select work, claim work, enforce duplicate prevention, launch execution, retry, reconcile, or mutate review-packet behavior.
- A runtime debug write API, if Plan includes one, uses a human-admin session guard rather than generic admin-role/API-key authority.
- Trusted proxy-auth human admins count as human-admin context for debug writes only when auth resolution yields a real positive-id admin and no API-key or agent identity; API-key and agent-key callers are never sufficient.
- Attempt read payloads may include a compact runtime-run summary resolved at read time, but attempts do not persist run execution snapshots.
- The read API response envelope is versioned as `task_stage_attempts.v1` and does not reuse the task evidence envelope.
- Inspection-support indexes may optimize task, status, optional `run_id`, and lifecycle ordering, but SPEC-013A does not create one-active-attempt uniqueness.
- Any fixture/UAT endpoint route name is finalized in Plan; the spec requires the boundary and controls, not a specific route path beyond being spec-scoped and separate from the read route.
- Later specs own GitHub sync automation, claim/reconciliation authority, retry controls, scheduler launch, sandbox lifecycle, harness adapters, and richer dashboards.
- Existing task detail and Evidence-section UI patterns are the density and accessibility precedent for the run-state section: named regions, small labels, visible status/error text, bounded token lists, safe links, and wrapping identifiers take precedence over introducing a new dashboard-style surface.
