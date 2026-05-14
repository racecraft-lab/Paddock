# Feature Specification: GitHub Pilot Issue Ingest and Eligibility

**Feature Branch**: `009c1-pilot-issue-ingest`  
**Created**: 2026-05-14  
**Status**: Draft  
**Input**: User description: "Create SPEC-009C1 for the first Mission Control self-hosting pilot ingest slice. One eligible `racecraft-lab/mission-control` GitHub issue must enter Mission Control as exactly one GitHub-linked pilot root task through GitHub ingest/sync, with deterministic eligibility, duplicate prevention, local-only exclusion, no autonomous execution side effects, and a manual smoke checklist."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ingest One Eligible Pilot Issue (Priority: P1)

As the Mission Control operator, I need one eligible `racecraft-lab/mission-control` GitHub issue to enter Mission Control as a single GitHub-linked pilot root task so the self-hosting pilot proves GitHub issue tracker truth before autonomous work continues.

**Why this priority**: This is the core pilot gate. SPEC-009C2 cannot safely route triage work until SPEC-009C1 proves that GitHub is the source work item and Mission Control has only a synchronized task projection.

**Independent Test**: Can be fully tested with fixture-driven GitHub ingest/sync for a qualifying issue and by confirming exactly one root task records the GitHub repository, issue number, labels, and pilot eligibility evidence.

**Acceptance Scenarios**:

1. **Given** an open `racecraft-lab/mission-control` issue labeled `mc:inbox`, at least one `priority:*`, exactly one routable `area:*`, no linked PR, no terminal state, and no existing synced task, **When** GitHub ingest/sync runs for the issue, **Then** Mission Control records exactly one GitHub-linked pilot root task for that issue.
2. **Given** no safe live candidate exists, **When** the operator uses the explicit synthetic fallback path, **Then** the fallback finds or creates one open `[mc-pilot] synthetic e2e issue` labeled `mc:inbox`, `priority:medium`, and `area:dev`, and that issue can enter Mission Control only through GitHub ingest/sync.
3. **Given** the pilot root task is created, **When** the operator inspects the task evidence, **Then** the task identifies GitHub as tracker of record and records Mission Control task data as a local projection.

---

### User Story 2 - Reject Unsafe or Duplicate Pilot Candidates (Priority: P1)

As the Mission Control operator, I need duplicate and unsafe GitHub issues to be rejected from the pilot lane so the first self-hosting pilot remains deterministic and reviewable.

**Why this priority**: Duplicate or ambiguous intake would break the pilot's source-of-truth proof and could route the wrong work into later triage/remediation phases.

**Independent Test**: Can be fully tested with fixture-driven GitHub sync cases covering missing labels, ambiguous routing labels, linked PRs, terminal states, and already-synced issues.

**Acceptance Scenarios**:

1. **Given** an issue lacks `mc:inbox`, lacks every `priority:*`, has zero or multiple routable `area:*` labels, has a linked PR, has terminal state, or already has a synced Mission Control task, **When** eligibility is evaluated, **Then** the issue is not admitted to the pilot lane and the exclusion reason is inspectable in test or smoke evidence.
2. **Given** an eligible issue was already synced into one pilot root task, **When** GitHub ingest/sync runs again with unchanged issue identity, **Then** Mission Control still has exactly one pilot root task for that GitHub issue.
3. **Given** a non-`racecraft-lab/mission-control` issue has otherwise matching labels, **When** eligibility is evaluated, **Then** it is rejected because the pilot is limited to the Mission Control repository.

---

### User Story 3 - Keep Local-Only Tasks Out of the Pilot Lane (Priority: P2)

As the Mission Control operator, I need local-only Mission Control tasks to remain supported while being excluded from autonomous pilot intake so the web app cannot become a second source of pilot work that bypasses GitHub issue truth.

**Why this priority**: The PRD requires GitHub Issues to be the v1 tracker of record for Symphony-aligned work while preserving manual/local tasks for non-pilot work.

**Independent Test**: Can be fully tested by creating local-only tasks through existing local task creation paths and verifying none become eligible pilot root tasks.

**Acceptance Scenarios**:

1. **Given** a local-only task exists without GitHub repository and issue linkage, **When** pilot eligibility is evaluated, **Then** the task is not eligible for the pilot lane.
2. **Given** a local-only task resembles the pilot title or labels in local metadata, **When** pilot ingest/sync evidence is inspected, **Then** it still does not count as the pilot root task because it lacks GitHub tracker linkage.

---

### User Story 4 - Record Manual Live Smoke Evidence (Priority: P2)

As the Mission Control operator, I need a concise manual smoke checklist so a live or synthetic pilot issue can be verified without adding production evidence UI or mutating GitHub from normal app runtime.

**Why this priority**: SPEC-009C1 intentionally keeps live GitHub mutation operator-controlled and defers production evidence surfaces to SPEC-009E.

**Independent Test**: Can be fully tested by reviewing the generated smoke checklist for the required live evidence steps and by using fixture tests for automated coverage.

**Acceptance Scenarios**:

1. **Given** the implementation is ready for live validation, **When** the operator opens `docs/qa/pilot-smoke-checklist.md`, **Then** the checklist explains candidate selection, synthetic fallback, ingest/sync verification, duplicate prevention, local-only exclusion, side-effect checks, cleanup notes, and evidence to record.
2. **Given** the normal app runtime and automated tests run, **When** they exercise SPEC-009C1 behavior, **Then** they do not create, edit, or close live GitHub issues.

### Edge Cases

- No live issue is safe to use, so the explicit fallback path must reuse an existing open synthetic issue before creating a new one.
- A candidate has multiple `priority:*` labels; it remains eligible because the pilot only requires at least one priority label.
- A candidate has zero or multiple routable `area:*` labels; it is rejected because routing must be deterministic.
- A candidate has labels that look similar to required labels but do not match the required families; it is rejected.
- A previously synced issue is reopened or resynced; duplicate prevention still preserves one pilot root task for the GitHub issue.
- Current-schema side-effect checks must stay grounded in existing task, activity, run, artifact, assignment, and successor surfaces when present; they must not invent future run-state tables.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST treat GitHub Issues as the v1 tracker of record for this pilot and Mission Control tasks as synchronized local projections of GitHub work.
- **FR-002**: The system MUST admit a live pilot candidate only when it is an open `racecraft-lab/mission-control` issue labeled `mc:inbox`.
- **FR-003**: The system MUST require at least one `priority:*` label on a live pilot candidate.
- **FR-004**: The system MUST require exactly one routable `area:*` label on a live pilot candidate.
- **FR-005**: The system MUST reject a candidate that has an existing synced Mission Control task for the same GitHub repository and issue number.
- **FR-006**: The system MUST reject a candidate that has a linked PR or terminal issue state before pilot intake.
- **FR-007**: The system MUST create or identify the pilot root task only through GitHub ingest/sync, not through local-only task creation.
- **FR-008**: The system MUST represent the admitted pilot issue as exactly one GitHub-linked Mission Control root task with repository identity, issue number, issue labels, and pilot eligibility evidence.
- **FR-009**: The system MUST make repeated ingest/sync of the same GitHub issue idempotent so duplicate pilot root tasks are not created.
- **FR-010**: The system MUST keep local-only tasks supported for non-pilot work while excluding them from pilot runner intake and pilot source-of-truth evidence.
- **FR-011**: The system MUST provide an explicit operator/smoke fallback path that finds an existing open `[mc-pilot] synthetic e2e issue` first, otherwise creates one with `mc:inbox`, `priority:medium`, and `area:dev`.
- **FR-012**: Automated tests and normal app runtime MUST NOT mutate live GitHub issues; live GitHub selection or synthetic issue creation is allowed only through explicit operator smoke/script action.
- **FR-013**: The feature MUST NOT wire automatic GitHub sync cron, polling lifecycle, or ownerless runtime discovery; GitHub sync automation is deferred to SPEC-013A1.
- **FR-014**: The feature MUST NOT execute Issue Triage, Issue Remediation, successor creation, scheduler claim authority, dispatch, runner launch, sandbox lifecycle, harness adapter behavior, or auto-merge behavior.
- **FR-015**: The feature MUST prove, using current schema surfaces only, that admitted pilot ingest creates no claim, dispatch, remediation, runner, sandbox, pipeline successor, or autonomous execution side effects.
- **FR-016**: The feature MUST NOT add production pilot eligibility UI or a new production evidence API; durable operator-visible eligibility and evidence surfaces are deferred to SPEC-009E.
- **FR-017**: The feature MUST NOT change workflow-contract tracker-label semantics; executable pilot eligibility labels remain separate from workflow-template metadata unless a later contract spec changes that contract.
- **FR-018**: The feature MUST produce `docs/qa/pilot-smoke-checklist.md` for manual live smoke evidence, including candidate selection, synthetic fallback, duplicate prevention, local-only exclusion, side-effect checks, and cleanup instructions.

### Spec Evidence And Archive Policy

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Reviewability Budget *(mandatory)*

- **Primary surface**: seed/config
- **Secondary surfaces, if any**: docs/process and fixture-driven tests
- **Projected reviewable LOC**: 300-400 excluding generated or lock artifacts
- **Projected production files**: 3 or fewer
- **Projected total files**: 10 or fewer
- **Budget result**: within budget
- **Split decision**: This remains one spec because it proves only the ingest and eligibility gate. Automatic GitHub sync automation is split to SPEC-013A1, production eligibility/evidence surfaces are split to SPEC-009E, and pilot triage/remediation execution is split to SPEC-009C2 through SPEC-009C4.

### PR Review Packet Requirements *(mandatory)*

- PR description MUST include: what changed, why, non-goals, review order,
  scope budget, traceability, verification evidence, known gaps, and rollback
  or feature-flag notes.
- Traceability MUST map each major requirement or success criterion to changed
  files and verification evidence.
- Deferred work MUST name the follow-up spec or issue.

### Key Entities

- **Pilot GitHub Issue**: The source work item in `racecraft-lab/mission-control`; key attributes include repository identity, issue number, open/terminal state, labels, linked PR state, and whether a synced task already exists.
- **Pilot Root Task**: The single Mission Control task projection created by GitHub ingest/sync for the admitted pilot issue; key attributes include GitHub linkage, root-task identity, labels, eligibility evidence, and absence of autonomous execution state.
- **Eligibility Decision**: The admission or rejection result for a GitHub issue; key attributes include candidate identity, required-label checks, repository check, duplicate check, linked-PR/terminal-state checks, and rejection reason when ineligible.
- **Synthetic Fallback Issue**: The operator-controlled fallback GitHub issue titled `[mc-pilot] synthetic e2e issue`; key attributes include required labels, open state, reuse-before-create behavior, and cleanup instructions.
- **Pilot Smoke Evidence**: Manual live validation record captured through `docs/qa/pilot-smoke-checklist.md`; key attributes include issue URL/number, sync evidence, duplicate prevention evidence, local-only exclusion evidence, side-effect checks, and cleanup notes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Given one eligible live or synthetic `racecraft-lab/mission-control` issue, GitHub ingest/sync results in exactly one GitHub-linked Mission Control pilot root task for that issue.
- **SC-002**: Re-running ingest/sync for the same eligible issue leaves the count of pilot root tasks for that GitHub issue at one.
- **SC-003**: 100% of fixture-covered ineligible candidates are rejected with inspectable reasons, including missing `mc:inbox`, missing `priority:*`, zero or multiple routable `area:*`, linked PR, terminal state, duplicate synced task, and wrong repository.
- **SC-004**: 100% of local-only tasks created during validation remain outside the pilot lane and do not satisfy pilot source-of-truth evidence.
- **SC-005**: Pilot ingest validation records zero current-schema claim, dispatch, remediation, runner, sandbox, or successor side effects for the admitted pilot root task.
- **SC-006**: A fresh operator can complete the manual live smoke checklist in 30 minutes or less after credentials and a target deployment are available.

## Assumptions

- SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, and SPEC-009B are available as the completed substrate for this spec.
- `PILOT_MISSION_CONTROL_E2E` is the pilot activation scope for the admitted issue, but this spec does not broaden feature-flag semantics.
- Existing GitHub ingest/sync behavior and test seams can be exercised deterministically with fixtures.
- The first pilot issue must be in `racecraft-lab/mission-control`; other repositories are out of scope for SPEC-009C1.
- Local-only Mission Control tasks remain valid for manual and non-pilot work.
- Formal run-state, claim, dispatch, and harness lifecycle assertions belong to later SPEC-013 and SPEC-014 work; SPEC-009C1 proves absence only across current schema surfaces.
