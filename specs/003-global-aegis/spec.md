# Feature Specification: Aegis Facility Singleton Refactor

**Feature Branch**: `[003-global-aegis]`  
**Created**: 2026-04-28  
**Status**: Draft  
**Input**: User description: "Create a specification for RC Factory Phase 2 in Mission Control.

Problem Statement

Mission Control currently resolves Aegis through workspace-keyed lookup paths even though SPEC-001 backfilled Aegis as a facility-wide global agent (`agents.scope='global'`) and later pipeline specs require Aegis to serve every Product Line consistently. The current `runAegisReviews` path declares `aegisAgentByWorkspace = new Map<number, ReviewAgentRecord>()` and looks up `LOWER(name)='aegis' AND workspace_id=?`, which prevents global-only Aegis rows from serving product-line review flows.

Users

- Facility operator: needs one global Aegis reviewer that can serve all Product Lines.
- Existing workspace-scoped install: needs compatibility when only local Aegis rows exist or when the new flag is OFF.
- Downstream spec executor: needs global Aegis behavior before task pipelines and Product Line A pilot work.

User Stories

- US1: As an existing operator, I can keep `FEATURE_GLOBAL_AEGIS` OFF and Aegis review behavior remains workspace-first.
- US2: As a facility operator, I can enable `FEATURE_GLOBAL_AEGIS` and have a single global Aegis row serve workspaces with no local Aegis.
- US3: As a maintainer, I can preserve legacy local Aegis fallback for compatibility during migration.
- US4: As an auditor, I can see an activity when a local Aegis row is shadowed by the global row under flag ON.
- US5: As a downstream spec executor, I can rely on Aegis completion gates using `quality_reviews.reviewer='aegis'`.

Functional Requirements

- Add `src/lib/aegis.ts` exporting `getAegis(db, workspace_id?)`.
- Route `FEATURE_GLOBAL_AEGIS` through `resolveFlag(name, ctx)`; do not add inline `process.env.FEATURE_GLOBAL_AEGIS` reads.
- With flag OFF, resolve workspace-scoped Aegis first, then global fallback.
- With flag ON, resolve global Aegis first, then workspace-scoped fallback.
- Match Aegis by `LOWER(name)='aegis'` and use `agents.scope='global'` for the facility singleton.
- Preserve legacy `agents.workspace_id` lookup for workspace-scoped rows.
- When flag ON and both global and workspace-scoped rows exist, return global and write an `activities` row documenting the shadowed local row.
- Refactor `runAegisReviews` and `resolveGatewayAgentIdForReviewAgent` integration so scheduler review dispatch uses `getAegis`.
- Remove or stop relying on the local `aegisAgentByWorkspace` map once all callsites are migrated.
- Sweep Aegis approval routes and UI references without changing review semantics.
- Preserve `quality_reviews.reviewer='aegis'` as the live gate signal; do not introduce `quality_reviews.agent_id` expectations.

Constraints

- Preserve current behavior with the flag OFF.
- New production module strict scope is `src/lib/aegis.ts`.
- Touch existing files only for Phase 2 Aegis resolver integration and tests.
- Do not implement SPEC-004 task pipeline behavior, SPEC-005 `ready_for_owner`, SPEC-006 area labels, SPEC-007 artifacts/dispositions, SPEC-008 governance, SPEC-009 pilot behavior, or SPEC-011 CrabTrap.
- Do not add schema migrations; SPEC-001 already created `agents.scope`.
- Use pnpm for verification.

Out of Scope

- Task-chain successor creation, `produces_pr`, or routing behavior.
- `ready_for_owner` task state and PR merge transition.
- Area-label routing and repo-level sync dedupe.
- Artifact store, disposition logging, resource governance, and pilot seeding.
- Changing quality review schema to store reviewer agent ids.
- Product-line skill/session/transcript ownership or multi-facility tenant modeling.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Workspace-First Compatibility (Priority: P1)

An existing operator keeps the global Aegis feature turned off and continues to receive the same workspace-first review behavior they have today.

**Why this priority**: This protects existing deployments from behavior changes while the feature is introduced.

**Independent Test**: Verify that a workspace with a local Aegis row still resolves that row when the global feature is off, and that review dispatch proceeds without any change to the live gate signal.

**Acceptance Scenarios**:

1. **Given** the global feature is off and a workspace has a local Aegis row, **When** review dispatch runs for that workspace, **Then** the local Aegis row is used.
2. **Given** the global feature is off and a workspace has no local Aegis row but a global Aegis row exists, **When** review dispatch runs, **Then** the global Aegis row is used as the fallback.

### User Story 2 - Facility-Wide Aegis (Priority: P2)

A facility operator enables the global Aegis feature and a single global reviewer serves workspaces that do not have their own local Aegis row.

**Why this priority**: This is the core facility-scope behavior the refactor is meant to unlock.

**Independent Test**: Verify that a workspace with no local Aegis row resolves the global Aegis row when the feature is on.

**Acceptance Scenarios**:

1. **Given** the global feature is on and a workspace has no local Aegis row, **When** review dispatch runs, **Then** the global Aegis row is used.
2. **Given** the global feature is on and multiple workspaces rely on Aegis, **When** each workspace reaches review dispatch, **Then** they all resolve the same global Aegis row.

### User Story 3 - Shadowed Local Visibility (Priority: P3)

A maintainer or auditor can see when a local Aegis row exists but is shadowed by the global row while the global feature is enabled.

**Why this priority**: This preserves traceability during migration and supports operational auditing.

**Independent Test**: Verify that when both local and global Aegis rows exist under the global feature, the global row is chosen and an activity record is created that identifies the shadowed local row.

**Acceptance Scenarios**:

1. **Given** the global feature is on and both local and global Aegis rows exist for a workspace, **When** review dispatch runs, **Then** the global row is used and an activity is recorded for the shadowed local row.
2. **Given** the global feature is on and only a local Aegis row exists, **When** review dispatch runs, **Then** the local row remains available as fallback.

### Edge Cases

- A workspace has no local Aegis row and no global Aegis row exists.
- A workspace has multiple local rows with the same Aegis name and only one global row exists.
- The global and local rows both exist but one is inactive or otherwise unavailable.
- The feature flag changes between review runs for the same workspace.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a shared Aegis resolver that returns the best available Aegis reviewer for an optional workspace context.
- **FR-002**: The system MUST respect the global Aegis feature flag when choosing between global and workspace-scoped Aegis records.
- **FR-003**: When the global feature is off, the system MUST prefer a workspace-scoped Aegis reviewer and fall back to a global reviewer only if no workspace-scoped reviewer is available.
- **FR-004**: When the global feature is on, the system MUST prefer a global Aegis reviewer and fall back to a workspace-scoped reviewer only if no global reviewer is available.
- **FR-005**: The system MUST identify Aegis records using the canonical Aegis name and the appropriate facility or workspace scope.
- **FR-006**: The system MUST preserve compatibility with existing workspace-scoped Aegis records during the transition period.
- **FR-007**: When the global feature is on and both scopes contain Aegis records for the same workspace, the system MUST return the global reviewer and record an activity that indicates the local reviewer was shadowed.
- **FR-008**: The system MUST route review dispatch through the shared Aegis resolver so scheduler-driven reviews use the same selection rules everywhere.
- **FR-009**: The system MUST keep the Aegis completion gate based on the reviewer name and MUST NOT require reviewer identifiers in the quality review gate.
- **FR-010**: The system MUST keep Aegis approval and display surfaces consistent with the resolver behavior without changing review semantics.

### Key Entities *(include if feature involves data)*

- **Aegis reviewer**: The reviewer identity used for facility and workspace review routing, including a global singleton form and legacy workspace-scoped form.
- **Feature flag**: The control that determines whether global-first or workspace-first resolution applies.
- **Activity record**: An audit entry describing when a local reviewer is shadowed by a global reviewer.
- **Quality review gate**: The completion check that continues to use the Aegis reviewer name as the live signal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a controlled validation run, 100% of workspaces with no local Aegis reviewer resolve to the global reviewer when the global feature is enabled.
- **SC-002**: In a controlled validation run, 100% of workspaces with a local Aegis reviewer continue to resolve that local reviewer when the global feature is disabled.
- **SC-003**: In a controlled migration run, every workspace with both local and global Aegis reviewers produces a shadowing activity when the global feature is enabled.
- **SC-004**: Review gate checks continue to succeed for existing Aegis workflows without requiring operators to change their quality review completion process.

## Assumptions

- The canonical Aegis name remains stable across existing deployments.
- Operators may have a mix of global and local Aegis records during migration.
- The global feature flag is intended to be toggled without requiring a schema change.
- Existing review workflows continue to treat the reviewer name as the user-visible gate signal.
