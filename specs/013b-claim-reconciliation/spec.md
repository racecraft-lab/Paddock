# Feature Specification: SPEC-013B - Claim and Reconciliation Authority

**Feature Branch**: `013b-claim-reconciliation`
**Created**: 2026-05-27
**Status**: Draft
**Input**: User description: "Paddock needs claim and reconciliation authority that prevents duplicate scheduler dispatch for the same GitHub-linked task stage while preserving tracker truth, resource governance, SPEC-013A task-stage attempt evidence, and existing dispatch/successor-selection boundaries."

## Clarifications

### Session 2026-05-27

- Q: What exact active-claim persistence model should Plan adopt? → A: Add `task_stage_claims` with `id`, `workspace_id`, `task_id`, `stage_key`, `task_stage_attempt_id`, `claim_run_id`, `claim_state`, `lease_owner`, `lease_started_at`, `lease_expires_at`, `released_at`, `release_reason`, `released_by_run_id`, `stale_recovered_from_claim_id`, `metadata_json`, `created_at`, and `updated_at`; enforce `UNIQUE(task_stage_attempt_id)`.
- Q: What predicate should enforce one active claim per workspace, task, and stage? → A: Use a SQLite partial unique index on `(workspace_id, task_id, stage_key)` where `claim_state = 'active'`; stale recovery must transition the old claim out of `active` before a replacement claim is acquired.
- Q: What lease metadata and duration should active claims use? → A: Active claims store `claim_run_id`, `lease_owner`, `lease_started_at`, and `lease_expires_at`; the default launch-critical-section TTL is 300 seconds, capped at 600 seconds, and never represents long-running execution ownership.
- Q: What exact structural predicate admits a task into autonomous claim intake? → A: The task must be `assigned`, have an assignee, have a valid `github_repo` in canonical `owner/repo` form plus positive `github_issue_number`, and belong to the same workspace as an active sync-enabled repository owner for that GitHub repo; PR linkage may enrich terminal evidence but is not the primary intake key.
- Q: Which source and threshold define stale or unresolved GitHub truth before claim? → A: Use task-level `github_synced_at` plus SPEC-013A1 lifecycle health for the task's `(workspace_id, github_repo)` scope. Truth is stale when `github_synced_at` is missing or older than `min(max(2 * interval_seconds, 600), 3600)` seconds, using `interval_seconds=300` when no scope-specific value exists; unhealthy, unresolved, disabled, or stale-lease lifecycle state also defers claim.
- Q: Which GitHub terminal states prevent or release claims? → A: Closed issues and closed linked PRs are non-claimable; merged linked PR evidence releases active claims while allowing existing owner-gated completion paths to remain outside SPEC-013B.
- Q: Which local Paddock task states release active claims? → A: The terminal Paddock task states for SPEC-013B active-claim release are exactly `done` and `failed`. `awaiting_owner` and `ready_for_owner` are not terminal for claim release; owner handoff remains non-terminal, and only `github_pr_merged` terminal evidence can allow a later transition to `done`.
- Q: What closed `release_reason` values are persisted on `task_stage_claims`? → A: `launch_handoff_completed`, `dispatch_failed`, `task_terminal_done`, `task_terminal_failed`, `github_issue_terminal`, `github_pr_terminal`, `governance_blocked`, `governance_deferred`, `attempt_terminal_reconciled`, `stale_claim_recovered`, and `boundary_error_deferred`. These values are the only persisted reasons for release or recovery rows; active rows keep `release_reason = null`.
- Q: Where does dispatch invoke claim/reconciliation authority? → A: `dispatchAssignedTasks` calls the new authority inside its per-task loop before the legacy `in_progress` status mutation or launch handoff; flag-off execution bypasses the authority and preserves the existing flow.
- Q: How does governance participate in claim eligibility? → A: Evaluate governance before active claim acquisition. `allow` proceeds to claim with decision metadata; `block` and `defer` record reconciliation evidence without acquiring an active claim.
- Q: How does SPEC-013B preserve successor selection? → A: The claim module never calls `advanceTaskChain` or `createTask`; tests must assert no successor writes occur in claim, release, stale recovery, duplicate-prevention, or deferral paths.
- Q: What read-only evidence surface is allowed? → A: Add a viewer-scoped read route such as `GET /api/tasks/[id]/claim-reconciliation` returning a versioned `task_claim_reconciliation.v1` envelope and links to stage attempts/activities; expose no POST/PATCH/DELETE, action URLs, manual release, retry, cancel, or primary dashboard controls.
- Q: What evidence taxonomy and payload safety rules apply? → A: Use outcome-specific activities `task_stage_claim_acquired`, `task_stage_claim_duplicate_prevented`, `task_stage_claim_released`, `task_stage_claim_stale_recovered`, `task_stage_claim_governance_deferred`, `task_stage_claim_terminal_reconciled`, `task_stage_claim_stale_truth_deferred`, `task_stage_claim_boundary_deferred`, and `task_stage_claim_not_claimable`. Payloads use a positive allowlist of IDs, enums, timestamps, canonical GitHub repo/issue/PR identifiers, claim/attempt IDs, lease timing, governance ids/results, freshness timestamps/ages, correlation ids, redacted diagnostic categories, boundary error categories, and redaction flags; raw issue bodies, prompts, tokens, auth headers, raw provider responses, gateway/session payloads, secret-shaped strings, and matched secret substrings are rejected or redacted before persistence.
- Q: How do concurrent, retry, or transaction boundary failures affect scheduler ticks? → A: Expected claim races and retry conflicts are classified as duplicate-prevented or stale-owner-safe outcomes. SQLite busy/database errors, malformed claim inputs, governance evaluator failures, and unknown claim/release boundary exceptions fail closed for that task as `boundary_deferred`, record sanitized diagnostic categories only, do not acquire or release claims, do not bypass governance, and do not crash the rest of the scheduler tick.
- Q: What UAT evidence proves exactly one claim/launch path? → A: The UAT replay must record `uat_replay_id`, feature flag state, `workspace_id`, `task_id`, `stage_key`, GitHub repo/issue, concurrent `scheduler_tick_id[]`, claim attempt count, acquired claim id, duplicate-prevented activity ids, exactly one legacy `task_dispatched` or launch-handoff activity id, `attempt_id`, release activity id/reason, final active-claim count `0`, and source references for activity, claim, and attempt rows.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prevent duplicate stage launch (Priority: P1)

As an operator, I need concurrent scheduler ticks to produce at most one launch for the same GitHub-linked task stage so autonomous work is not duplicated.

**Why this priority**: Duplicate launch prevention is the core safety boundary that must exist before retry, debug, and harness execution work can build on top of scheduler dispatch.

**Independent Test**: Can be fully tested by running concurrent scheduler intake attempts against the same eligible GitHub issue-linked assigned task and verifying that exactly one launch handoff is admitted while all competing attempts record duplicate-prevention evidence.

**Acceptance Scenarios**:

1. **Given** one GitHub issue-linked task in `assigned` state and an eligible workflow stage, **When** two scheduler ticks evaluate the same stage concurrently, **Then** exactly one tick acquires the active stage claim and reaches the existing launch handoff.
2. **Given** an active claim already exists for a task and stage, **When** another scheduler tick evaluates that same task and stage before release, **Then** the second tick does not launch work and records a reconciliation outcome explaining the existing active claim.
3. **Given** the feature is disabled, **When** the existing dispatch loop evaluates assigned tasks, **Then** legacy dispatch behavior remains unchanged.

---

### User Story 2 - Reconcile tracker and governance truth before claim (Priority: P2)

As an operator, I need Paddock to compare local task state, GitHub tracker truth, workflow stage readiness, and governance readiness before acquiring an active claim so stale or blocked work does not launch.

**Why this priority**: Tracker truth and governance readiness must remain authoritative; a duplicate-prevention lock alone is not enough if it admits stale or gated work.

**Independent Test**: Can be fully tested by presenting eligible-looking assigned tasks with terminal GitHub state, stale GitHub evidence, missing issue linkage, and blocked/deferred governance readiness, then verifying no active claim is retained and each deferral has structured evidence.

**Acceptance Scenarios**:

1. **Given** an assigned task linked to a closed or otherwise terminal GitHub issue or pull request, **When** scheduler intake runs, **Then** Paddock does not launch the stage and records terminal reconciliation evidence.
2. **Given** an assigned task whose GitHub truth is missing, stale, or inconsistent, **When** scheduler intake runs, **Then** Paddock defers claim acquisition and records that fresh tracker truth is required before launch.
3. **Given** governance blocks or defers an otherwise eligible task, **When** scheduler intake runs, **Then** Paddock records the governance decision without leaving an active claim.

---

### User Story 3 - Persist auditable claim and release evidence (Priority: P3)

As a reviewer, I need active-claim, release, stale-recovery, and reconciliation-deferral decisions to be auditable through task-stage attempt evidence and structured activities so scheduler behavior can be reconstructed after the fact.

**Why this priority**: SPEC-013B must support review and future retry/debug surfaces without making transient scheduler decisions invisible or treating passive stage-attempt state as the active lock.

**Independent Test**: Can be fully tested by exercising successful claim, launch handoff release, terminal release, governance deferral, and stale recovery paths, then verifying each path produces task-stage lifecycle evidence and structured activity records tied to the same task and stage.

**Acceptance Scenarios**:

1. **Given** a scheduler tick acquires a stage claim, **When** the claim is acquired, **Then** the active claim is linked to the task-stage attempt evidence for that stage.
2. **Given** a launch handoff completes or the task/stage reaches a terminal or gated state, **When** reconciliation runs, **Then** the active claim is released or deferred and the release reason is recorded.
3. **Given** an active claim expires before launch handoff completes, **When** a later scheduler tick evaluates the same task and stage, **Then** Paddock performs bounded stale recovery and records recovery evidence before allowing any new launch decision.

---

### User Story 4 - Preserve dispatch and successor authority (Priority: P4)

As a future SPEC-013C or SPEC-014 implementer, I need SPEC-013B to protect the existing assigned-task launch boundary without introducing runner ownership, retry controls, sandbox lifecycle, or successor-selection behavior.

**Why this priority**: The claim authority should be a narrow coordination layer that future work can depend on without absorbing responsibilities reserved for retry/debug or harness execution specs.

**Independent Test**: Can be fully tested by verifying that SPEC-013B only admits GitHub issue-linked `assigned` tasks into claim intake, does not create claim intake for local-only or non-terminal arbitrary tasks, and leaves successor-selection outcomes unchanged.

**Acceptance Scenarios**:

1. **Given** a local-only, repo-only, or non-issue-linked task, **When** scheduler intake runs, **Then** SPEC-013B claim intake does not admit that task into autonomous launch and records a not-claimable reconciliation decision.
2. **Given** a task reaches a state where successor selection is required, **When** chain advancement occurs, **Then** the existing successor-selection authority remains responsible for choosing the next task.
3. **Given** a launch handoff has been protected by claim authority, **When** work continues after launch, **Then** SPEC-013B does not assume long-running runner, sandbox, harness, retry, cancel, or manual release ownership.

### Edge Cases

- Concurrent scheduler ticks evaluate the same GitHub-linked assigned task and stage at the same time.
- An active claim exists for the same task and stage but belongs to an expired launch handoff.
- GitHub issue truth is missing, stale, closed, merged, or inconsistent with Paddock task state.
- Governance changes from allow to block or defer while a task is otherwise eligible.
- A task becomes terminal before or during the launch handoff.
- The task is assigned but has no GitHub issue linkage, only repository metadata, or only local Paddock provenance.
- A stage attempt exists in passive lifecycle evidence but no active claim exists.
- The feature flag is disabled in an environment that already runs legacy dispatch.
- A same-stage stale claim is recovered while a late stale owner attempts to release or mutate the replacement claim.
- Claim evidence contains a non-allowlisted or secret-shaped payload field.
- Claim acquisition, release, governance evaluation, or retry reconciliation hits a SQLite constraint, busy/database error, malformed input, or unknown boundary exception while other scheduler tick work should continue.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Paddock MUST admit only tasks in `assigned` state with an assignee, valid `github_repo`, positive `github_issue_number`, and matching sync-enabled workspace/repository ownership into autonomous claim intake. A valid `github_repo` for SPEC-013B is a canonical GitHub full name in `owner/repo` form: owner matches `[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?`, repo matches `[A-Za-z0-9._-]{1,100}`, the value has exactly one slash, has no scheme/host/query/fragment/`.git` suffix, no whitespace or control characters, and no `.` or `..` path segment.
- **FR-002**: Paddock MUST exclude local-only tasks, repository-only tasks, arbitrary non-terminal tasks, and tasks without issue linkage from SPEC-013B claim intake.
- **FR-003**: Paddock MUST reconcile local task state, persisted GitHub tracker truth, workflow stage readiness, SPEC-013A1 lifecycle health, and governance readiness before active claim acquisition.
- **FR-004**: Paddock MUST perform reconciliation and active claim acquisition as one bounded decision so competing scheduler ticks cannot both pass the same eligibility boundary.
- **FR-005**: Paddock MUST enforce at most one active claim for each workspace, task, and workflow stage combination with a SQLite partial unique index over active claim rows.
- **FR-006**: Paddock MUST use `task_stage_claims` as database-backed active-claim authority rather than treating passive task-stage attempt status as the active claim lock.
- **FR-007**: Paddock MUST link each acquired active claim to the corresponding task-stage attempt evidence.
- **FR-008**: Paddock MUST release or defer active claims when the task reaches terminal Paddock state (`done` or `failed`), linked GitHub issue or PR truth is terminal or stale, governance blocks or defers launch, linked passive task-stage attempt lifecycle reaches `succeeded`, `failed`, `released`, or `cancelled`, or launch handoff completes. `awaiting_owner` and `ready_for_owner` MUST NOT be treated as terminal for active-claim release decisions. Task-stage attempt lifecycle status MUST remain passive evidence and MUST NOT enforce active-claim uniqueness. Release reasons MUST use the closed vocabulary `launch_handoff_completed`, `dispatch_failed`, `task_terminal_done`, `task_terminal_failed`, `github_issue_terminal`, `github_pr_terminal`, `governance_blocked`, `governance_deferred`, `attempt_terminal_reconciled`, `stale_claim_recovered`, and `boundary_error_deferred`.
- **FR-009**: Paddock MUST recover stale active claims after a bounded launch-critical-section lease expires, transition stale claims out of `active`, protect replacement claims from late stale-owner release, and record recovery evidence before a new launch decision can proceed.
- **FR-010**: Paddock MUST record structured activities for claim acquisition, duplicate-claim prevention, release, stale recovery, governance deferral, terminal reconciliation, stale-truth deferral, boundary-error deferral, and not-claimable intake exclusion using the outcome-specific activity taxonomy defined in Clarifications.
- **FR-011**: Paddock MUST record task-stage attempt lifecycle evidence for claim and release decisions that relate to a stage attempt, using existing stage-attempt statuses without making those statuses the active lock.
- **FR-012**: Paddock MUST preserve the existing assigned-task dispatch boundary and protect it with claim/reconciliation authority rather than replacing it with a runner or harness abstraction.
- **FR-013**: Paddock MUST preserve existing successor-selection authority and MUST NOT duplicate automatic triage, issue remediation execution, auto-merge, or task-chain advancement logic.
- **FR-014**: Paddock MUST expose read-only evidence sufficient for operators and reviewers to inspect claim state and reconciliation outcomes through a task-scoped `task_claim_reconciliation.v1` read model without adding manual retry, release, cancel, or primary dashboard controls.
- **FR-015**: Paddock MUST keep flag-off behavior equivalent to legacy dispatch behavior for environments where the task control plane is disabled.
- **FR-016**: Paddock MUST leave sandbox lifecycle, harness adapters, fake runners, real runners, long-running execution ownership, and external adapter behavior out of SPEC-013B.
- **FR-017**: If planning determines additive active-claim persistence is necessary, the persistence model MUST be rerun-safe and include rollback coverage before implementation is accepted.
- **FR-018**: Paddock MUST persist only positive-allowlisted claim/reconciliation evidence fields and MUST reject or redact raw free-form payloads, prompts, credentials, session data, raw provider responses, gateway/session payloads, and secret-shaped values before persistence or read-model exposure.
- **FR-019**: Paddock MUST prove flag-off parity with focused tests that assert legacy dispatch status transitions, activities, messages, and absence of claim/reconciliation side effects when `FEATURE_TASK_CONTROL_PLANE=false`.
- **FR-020**: Paddock MUST classify claim/reconciliation boundary failures before dispatch proceeds. SQLite constraint races map to duplicate-prevented evidence; stale-owner release retries map to stale-owner-safe no-ops; SQLite busy/database errors, malformed claim inputs, governance evaluator failures, and unknown claim/release exceptions map to fail-closed `boundary_deferred` evidence for that task. These outcomes MUST skip legacy launch, preserve the rest of the scheduler tick, avoid acquiring or releasing active claims unless a compare-and-set already succeeded, avoid bypassing governance, and expose only sanitized categories or hashes.

### Project Constraints

- SPEC-013B MUST remain gated by `FEATURE_TASK_CONTROL_PLANE` through `resolveFlag`.
- SPEC-013B MUST keep `src/lib/task-dispatch.ts` as the existing launch boundary and introduce only a narrow claim/reconciliation helper authority around that boundary.
- SPEC-013B MUST integrate inside the `dispatchAssignedTasks` per-task loop before the existing `in_progress` status mutation or launch handoff.
- SPEC-013B MUST preserve `advanceTaskChain` as successor-selection authority.
- SPEC-013B MUST NOT call `advanceTaskChain` or `createTask` from the claim/reconciliation authority.
- SPEC-013B MUST NOT use passive `task_stage_attempts.status = running` as the active claim lock.
- SPEC-013B MUST NOT perform live GitHub fetches inside the active-claim transaction.
- If an additive active-claim persistence model is planned, the plan MUST include rollback SQL and rerun-safe migration coverage.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities *(include if feature involves data)*

- **GitHub issue-linked task**: A Paddock task whose tracker identity includes a GitHub repository and issue number and whose local state is eligible for assigned-task dispatch.
- **Workflow stage**: The current workflow boundary for a task that can be claimed independently from other stages.
- **Active claim**: A launch-critical-section coordination record that prevents more than one scheduler tick from launching the same workspace, task, and stage at the same time.
- **Task stage claim**: The expected `task_stage_claims` persistence row that records active-claim ownership, lease metadata, release/recovery state, and linkage to one task-stage attempt.
- **Task-stage attempt**: Existing stage lifecycle evidence that active claims must reference but must not overload as the active lock.
- **Reconciliation decision**: The recorded outcome of comparing local task state, GitHub truth, workflow stage readiness, and governance readiness before launch.
- **Governance readiness**: The allow, block, or defer outcome that determines whether otherwise eligible autonomous work may launch.
- **Stale recovery event**: Evidence that an expired active claim was released or recovered before another launch decision proceeded.
- **GitHub truth freshness**: The claim-intake freshness rule requiring task-level `github_synced_at` plus healthy SPEC-013A1 lifecycle state for the task's workspace/repository scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a concurrent scheduler replay with at least two simultaneous ticks against the same eligible GitHub issue-linked task stage, exactly one launch handoff is admitted and zero duplicate launches occur.
- **SC-002**: 100% of blocked, deferred, terminal, stale, missing-linkage, and non-issue-linked intake cases avoid active launch and produce a recorded reconciliation decision.
- **SC-003**: 100% of acquired active claims have matching task-stage attempt evidence and structured activity evidence that identifies the task, stage, decision, and reason.
- **SC-004**: A stale active claim can be recovered by a later scheduler tick after the configured launch-critical-section lease expires, with recovery evidence recorded before any replacement launch decision.
- **SC-005**: With the task control plane disabled, existing assigned-task dispatch behavior remains unchanged in focused regression tests.
- **SC-006**: Post-merge HITL UAT demonstrates one GitHub issue-linked assigned task under concurrent scheduler ticks, exactly one claim/launch path, release on terminal or gated state, and no duplicate launch.
- **SC-007**: Claim/reconciliation read-model and activity payload tests prove that non-allowlisted, raw provider, prompt, credential, session, and secret-shaped values are rejected or redacted before persistence or exposure.
- **SC-008**: Boundary-failure tests prove SQLite constraint races, SQLite busy/database errors, malformed claim inputs, governance evaluator failures, and late stale-owner release retries do not crash scheduler ticks, do not bypass governance, do not leak raw diagnostics, and do not create duplicate launch paths.

## Assumptions

- The active claim boundary is one workflow stage for one GitHub issue-linked task, not the whole task and not the entire future runner execution.
- Reconciliation happens before claim acquisition inside one bounded decision path.
- The active claim lease covers only scheduler reconciliation and launch handoff; the default TTL is 300 seconds, the hard cap is 600 seconds, and long-running execution ownership belongs to later harness lifecycle work.
- Active claim persistence uses `task_stage_claims`; Plan owns the final migration id, rollback SQL, helper API shape, and exact read-model response fields.
- Read-only task-scoped API/debug evidence is sufficient for SPEC-013B; dedicated operator controls and primary dashboard changes are reserved for later specs.
- GitHub tracker truth is authoritative for autonomous intake, and stale tracker truth defers launch rather than terminally failing the task.
- Paddock task terminal states for SPEC-013B claim release are the existing task statuses `done` and `failed`; `review`, `quality_review`, `awaiting_owner`, `in_progress`, `assigned`, `inbox`, and `backlog` are non-terminal for claim release.
- GitHub truth is fresh for claim intake only when task-level `github_synced_at` is present and no older than `min(max(2 * interval_seconds, 600), 3600)` seconds for the task's `(workspace_id, github_repo)` lifecycle scope, using `interval_seconds=300` when no scope-specific value exists.
- Red/unresolved lifecycle health, disabled lifecycle state, stale sync lease evidence, ownership-unresolved state, terminal GitHub state, or missing issue projection defers claim acquisition with reconciliation evidence.
- External Symphony and harness context only informs agent-first orchestration boundaries; it does not add runner, sandbox, Linear, retry UI, or long-running execution behavior to this feature.
