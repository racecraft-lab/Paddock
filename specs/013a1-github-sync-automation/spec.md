# Feature Specification: SPEC-013A1 - GitHub Sync Automation and Poller Lifecycle

**Feature Branch**: `013a1-github-sync-automation`
**Created**: 2026-05-23
**Status**: Draft
**Input**: User description: "GitHub issue sync automation and poller lifecycle for Mission Control, default-off and feature-flagged per Product Line/workspace, preserving manual sync while adding bounded automatic polling, durable lifecycle state, overlap control, owner semantics, backoff, pagination bounds, and rollback-safe disablement."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enable and Observe Automatic GitHub Polling (Priority: P1)

As a Mission Control operator, I can enable automatic GitHub issue polling for one Product Line/workspace and see whether it is enabled, running, delayed, disabled, successful, failed, or partially complete.

**Why this priority**: Automatic ingestion has no operator value unless it can be enabled safely and observed without relying on external cron state or hidden process behavior.

**Independent Test**: Can be fully tested by enabling polling for one Product Line/workspace with a controlled GitHub issue source, waiting for one scheduler-owned tick, and verifying that lifecycle state, last-run status, counters, and next action are visible while no unrelated Product Line/workspace starts polling.

**Acceptance Scenarios**:

1. **Given** automatic polling is disabled for a Product Line/workspace, **When** an operator enables it with a valid interval, **Then** the Product Line/workspace is marked enabled with its interval and the next eligible poll time.
2. **Given** polling is enabled and eligible, **When** the scheduler-owned lifecycle starts a tick, **Then** operators can observe the running status, run owner, run identifier, started time, and current scope.
3. **Given** a poll tick completes successfully, **When** the operator inspects sync status, **Then** the last completed time, last success cursor, success counters, and next eligible poll time reflect the completed run.

---

### User Story 2 - Preserve Manual Sync During Automation (Priority: P2)

As an operator or reviewer, I can run the existing manual GitHub sync as a fallback even when automatic polling exists, with clear behavior when another sync is already running for the same scope.

**Why this priority**: Operators need a recovery path for urgent syncs and investigations, and automation must not silently change or remove the established manual workflow.

**Independent Test**: Can be fully tested by enabling automatic polling, invoking the manual sync workflow for the same and different scopes, and verifying that same-scope overlaps are serialized or rejected with actionable status while independent scopes remain available.

**Acceptance Scenarios**:

1. **Given** an automatic sync is running for a Product Line/workspace/repo scope, **When** a manual sync is requested for the same scope, **Then** the manual request is either queued behind the active run or rejected with the active run details and retry guidance.
2. **Given** a manual sync is running for a Product Line/workspace/repo scope, **When** an automatic tick becomes eligible for the same scope, **Then** the automatic tick records a skipped-overlap result and does not ingest duplicate issues.
3. **Given** manual sync is requested for a non-overlapping scope, **When** another scope is running, **Then** the manual request can proceed independently without waiting for unrelated scopes.

---

### User Story 3 - Recover From Failures Without Losing Cursor Integrity (Priority: P3)

As a human reviewer, I can verify that failed or partially bounded sync attempts do not advance the last successful cursor and that the next retry is bounded, visible, and recoverable.

**Why this priority**: GitHub sync is only trustworthy if failures, backoff, and partial runs are explicit and cannot skip issues by incorrectly moving the success cursor.

**Independent Test**: Can be fully tested by forcing a sync failure after a known cursor, then forcing a bounded partial run, and verifying cursor preservation, last error, partial-run reason, backoff, and next retry state.

**Acceptance Scenarios**:

1. **Given** a Product Line/workspace has a recorded last success cursor, **When** the next automatic sync fails, **Then** the last success cursor remains unchanged and the last error, failed run time, failure counter, and next retry reason are recorded.
2. **Given** GitHub issue pages exceed configured page, issue, or tick-duration bounds, **When** an automatic tick reaches a bound, **Then** the run records a partial-run reason and resumes from the last successful cursor on the next eligible run.
3. **Given** a running sync lease expires before completion, **When** a later eligible run starts, **Then** stale lease recovery records the previous lease as stale and allows one replacement run to proceed.

---

### User Story 4 - Avoid Duplicate Ingestion for Shared Repositories (Priority: P4)

As a Mission Control operator managing multiple projects that reference one GitHub repository, I can rely on only the owning Product Line/workspace scope to poll that repository when area routing ownership applies.

**Why this priority**: Shared repositories are common in Product Line setups, and automatic polling must preserve ownership semantics before scheduler claim decisions depend on current GitHub-linked tasks.

**Independent Test**: Can be fully tested by configuring multiple Product Line/workspace project mappings to one repository, enabling polling, and verifying that only the designated owner polls while non-owner scopes record skipped owner/non-owner counts.

**Acceptance Scenarios**:

1. **Given** multiple projects share one GitHub repository and one scope is the sync owner, **When** automatic polling runs, **Then** only the owner scope polls and non-owner scopes do not ingest duplicate issues.
2. **Given** a non-owner scope is enabled for automatic polling, **When** its tick evaluates ownership, **Then** it records a skipped non-owner result with the affected repository and reason.
3. **Given** a repository has no applicable area routing owner, **When** polling evaluates eligible scopes, **Then** exactly one eligible scope polls for that repository or the run records a clear disabled or skipped reason.

### Edge Cases

- Automatic polling is feature-flagged off globally: enablement controls remain inactive and manual sync remains available.
- A Product Line/workspace disables polling while a tick is running: the active tick may finish or be marked stopped, and no future automatic tick starts until re-enabled.
- GitHub returns transient errors, rate limits, permission failures, or malformed issue data: the run records the failure category and applies bounded retry behavior without advancing the success cursor.
- A sync lease exists beyond its expiry: the next eligible run can recover the stale lease and record that recovery before starting.
- Backoff would exceed the allowed Product Line/workspace maximum: next retry is capped and the cap reason is visible.
- Polling reaches page, issue, or elapsed-time bounds before draining all available GitHub issues: the run is partial, records the stopping bound, and keeps enough state to retry safely.
- Manual and automatic sync requests arrive at nearly the same time for the same repository scope: only one run can own the scope, and the losing request receives or records a deterministic overlap result.
- Rollback or emergency disablement is applied after automatic polling has been used: manual sync continues to operate and existing GitHub-linked tasks remain readable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST keep automatic GitHub issue polling behind a global feature flag that defaults off.
- **FR-002**: System MUST allow automatic GitHub issue polling to be enabled and disabled per Product Line/workspace.
- **FR-003**: System MUST allow operators to configure a bounded polling interval per enabled Product Line/workspace.
- **FR-004**: System MUST run automatic polling as a first-class scheduler-owned lifecycle task or equivalent bounded scheduler responsibility, without requiring an external cron as the product contract.
- **FR-005**: System MUST NOT implement automatic polling as a process-wide singleton that prevents independent Product Line/workspace lifecycle ownership.
- **FR-006**: System MUST preserve the existing manual GitHub sync behavior as an independent fallback when automatic polling is disabled, delayed, failed, or enabled.
- **FR-007**: System MUST serialize or clearly reject overlapping manual and automatic sync attempts for the same Product Line/workspace/repository scope.
- **FR-008**: System MUST allow non-overlapping Product Line/workspace/repository scopes to sync independently when overlap control does not apply.
- **FR-009**: System MUST preserve SPEC-006 owner semantics for `(workspace_id, github_repo)` so that only the repository sync owner polls when area routing ownership applies.
- **FR-010**: System MUST record skipped owner and skipped non-owner outcomes when a scope does not poll because ownership rules select another scope.
- **FR-011**: System MUST track lifecycle control state separately from run history.
- **FR-012**: Lifecycle control state MUST include enablement, interval, current backoff, running or lease status, last started time, last completed time, last success cursor, last error, disabled reason, next retry time, next retry reason, aggregate counters, skipped owner count, skipped non-owner count, and latest partial-run reason.
- **FR-013**: Run history MUST preserve individual automatic and manual sync attempt outcomes, including run identity, scope, start time, completion time, result, failure reason, partial-run reason, and cursor effect.
- **FR-014**: System MUST NOT advance the last success cursor when a sync attempt fails.
- **FR-015**: System MUST advance the last success cursor only after a successful bounded sync outcome that is safe to resume from.
- **FR-016**: System MUST drain GitHub issue pages within explicit bounds for maximum pages, maximum issues, and maximum tick duration.
- **FR-017**: System MUST record partial-run state when page, issue, or tick-duration bounds stop a tick before all eligible issues are drained.
- **FR-018**: System MUST apply bounded backoff per Product Line/workspace after automatic sync failures and expose the next retry time and reason.
- **FR-019**: System MUST use durable overlap control with run owner, run identifier, expiry, release on completion, and stale lease recovery.
- **FR-020**: System MUST release active overlap control when a sync completes successfully, fails, is rejected, or is otherwise terminal.
- **FR-021**: System MUST let rollback or emergency configuration disable automatic polling without breaking manual sync.
- **FR-022**: System MUST NOT introduce task claim authority, task dispatch, launch behavior, Issue Remediation execution, harness lifecycle behavior, auto-merge, or automatic triage.
- **FR-023**: System MUST expose enough poller lifecycle state for reviewers to verify failures, backoff, duplicate-ingestion prevention, cursor preservation, and rollback-safe disablement.
- **FR-024**: System MUST avoid duplicate GitHub issue ingestion when multiple projects share one repository.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Reviewability Budget *(mandatory)*

- **Primary surface**: scheduler/runtime
- **Secondary surfaces, if any**: API, UI, schema/migration, docs/process
- **Projected reviewable LOC**: 700-1,200 excluding generated artifacts
- **Projected production files**: 8-14
- **Projected total files**: 14-22
- **Budget result**: warning accepted
- **Split decision**: This remains one spec because the lifecycle controls, overlap protection, cursor integrity, and observability form one reviewable safety boundary. Task claim authority, dispatch, execution, triage, and auto-merge remain explicit follow-up surfaces outside this spec.

### PR Review Packet Requirements *(mandatory)*

- PR description MUST include: what changed, why, non-goals, review order,
  scope budget, traceability, verification evidence, known gaps, and rollback
  or feature-flag notes.
- Traceability MUST map each major requirement or success criterion to changed
  files and verification evidence.
- Deferred work MUST name the follow-up spec or issue.

### Key Entities *(include if feature involves data)*

- **Poller Lifecycle Control**: The operator-facing control record for one Product Line/workspace polling scope, including enablement, interval, backoff, lease summary, cursor summary, disabled state, next retry, and aggregate counters.
- **Sync Run**: One manual or automatic GitHub issue sync attempt, including scope, run identity, owner, timing, terminal result, error or partial-run reason, and whether it changed the success cursor.
- **Repository Sync Scope**: The Product Line/workspace/repository combination considered for polling and overlap control.
- **Sync Ownership Decision**: The result of applying repository ownership rules to determine whether a scope may poll, must skip as non-owner, or must record a disabled or unresolved ownership state.
- **Sync Cursor**: The durable position from which future GitHub issue sync resumes after the last successful bounded run.
- **Partial Run State**: The recorded reason and resume context when a tick stops because page, issue, or duration bounds are reached.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can enable automatic polling for one Product Line/workspace, observe a completed poll, disable polling, and then run manual sync for the same scope in one verification session.
- **SC-002**: In failure testing, 100% of failed automatic sync attempts leave the prior last success cursor unchanged.
- **SC-003**: In bounded pagination testing, 100% of runs stopped by page, issue, or duration bounds record a partial-run reason visible to reviewers.
- **SC-004**: In shared-repository testing with multiple projects referencing one repository, automatic polling creates no duplicate ingestion for the same GitHub issue.
- **SC-005**: In overlap testing, 100% of same-scope manual and automatic sync races result in one owner and one deterministic serialized, rejected, or skipped outcome.
- **SC-006**: In stale lease testing, a later eligible run can recover an expired lease and records the recovery without requiring operator data repair.
- **SC-007**: With automatic polling disabled by flag or rollback control, manual sync remains usable for all previously supported scopes.

## Assumptions

- Operators already have permission to configure Product Line/workspace GitHub sync settings.
- Existing manual GitHub sync remains the compatibility baseline and is not redesigned by this spec.
- Existing GitHub issue ingestion behavior, issue identity rules, and SPEC-006 ownership semantics remain authoritative unless this spec explicitly constrains automatic polling.
- Polling intervals, page limits, issue limits, tick-duration limits, lease expiry, and maximum backoff values are configurable within bounded defaults selected during planning.
- GitHub-linked tasks must be current enough for future scheduler/control-plane specs, but this spec does not grant any task claim, dispatch, or execution authority.
- Automatic polling observability may be exposed through existing operator surfaces, new operator surfaces, or both, provided reviewers can verify the required lifecycle and run states.
- Rollback means disabling automatic polling behavior while preserving data readability and manual sync, not deleting historical run evidence.
