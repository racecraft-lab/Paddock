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
- Evaluate `FEATURE_GLOBAL_AEGIS` using the requested task or review workspace feature flags when a workspace exists; `process.env.FEATURE_GLOBAL_AEGIS='1'` must not force the flag on.
- With flag OFF, resolve workspace-scoped Aegis first, then global fallback.
- With flag ON, resolve global Aegis first, then workspace-scoped fallback.
- Match Aegis by `LOWER(name)='aegis'` and use `agents.scope='global'` for the facility singleton.
- Preserve legacy `agents.workspace_id` lookup for workspace-scoped rows.
- If multiple Aegis rows match the same candidate scope, choose the row with the lowest database id for deterministic compatibility.
- Resolver selection must not filter by `agents.status`; gateway invocation and review failure handling remain responsible for unavailable agents.
- When flag ON and both global and workspace-scoped rows exist, return global and idempotently record one structured `activities` row per requested workspace id, global Aegis id, and local Aegis id tuple using type `aegis_local_shadowed`, entity type `agent`, entity id set to the local Aegis row id, actor `system`, workspace id set to the requested workspace, and data containing the global agent id, local agent id, requested workspace id, and feature flag.
- Refactor `runAegisReviews` and `resolveGatewayAgentIdForReviewAgent` integration so scheduler review dispatch uses `getAegis` while preserving the existing task selection, retry, status transition, and gateway invocation semantics.
- Preserve existing gateway routing behavior that reads configured OpenClaw ids and session-key-derived routing; SPEC-003 must not rewrite the gateway dispatch contract.
- Remove or stop relying on the local `aegisAgentByWorkspace` map once all callsites are migrated.
- Sweep task routes, validation defaults, scheduler hooks, task-board Aegis display, and chat Aegis role surfaces without changing review semantics.
- Preserve `quality_reviews.reviewer='aegis'` as the live gate signal; do not introduce `quality_reviews.agent_id` expectations in code or tests.
- Existing UI surfaces may display Aegis review state, but must not gain new task pipeline behavior or `ready_for_owner` semantics.
- If no global or workspace-scoped Aegis database row exists, preserve current gateway fallback by returning agent id/name `aegis` and ensure scheduler loops continue without a resolver crash.

Constraints

- Preserve current behavior with the flag OFF.
- New production module strict scope is `src/lib/aegis.ts`.
- Touch existing files only for Phase 2 Aegis resolver integration and tests.
- Do not implement SPEC-004 task pipeline behavior, SPEC-005 `ready_for_owner`, SPEC-006 area labels, SPEC-007 artifact publishing/dispositions, SPEC-008 governance, SPEC-009 pilot behavior or seed data, or SPEC-011 CrabTrap.
- Do not add schema migrations; SPEC-001 already created `agents.scope`.
- Use pnpm for verification.

Out of Scope

- Task-chain successor creation, `produces_pr`, or routing behavior.
- `ready_for_owner` task state and PR merge transition.
- Area-label routing and repo-level sync dedupe.
- Artifact publishing, disposition logging, resource governance, and pilot seed data.
- Changing quality review schema to store reviewer agent ids.
- UI or API behavior that introduces task pipeline or `ready_for_owner` semantics.
- Product-line skill/session/transcript ownership or multi-facility tenant modeling.

## Clarifications

### Session 2026-04-28

- Q: Which context evaluates `FEATURE_GLOBAL_AEGIS`? → A: Requested task/review workspace context.
- Q: What happens when no Aegis row exists? → A: Fall back to gateway `aegis`.
- Q: What identifies shadowed local Aegis rows? → A: Structured `aegis_local_shadowed` activity.
- Q: Which duplicate same-scope Aegis row wins? → A: Lowest database id wins.
- Q: Does agent status affect resolver choice? → A: No status filtering.
- Q: What `runAegisReviews` behavior may change? → A: Resolver source only.
- Q: How should Aegis gateway routing behave? → A: Preserve openclawId/session-key routing.
- Q: What identifies Aegis approval gates? → A: `quality_reviews.reviewer='aegis'`.
- Q: May SPEC-003 require `quality_reviews.agent_id`? → A: No.
- Q: What UI behavior is allowed? → A: Display review state only.
- Q: What exact row shape records a shadowed local Aegis? → A: `activities` row with `type='aegis_local_shadowed'`, `entity_type='agent'`, `entity_id=<local_agent_id>`, `actor='system'`, requested `workspace_id`, deterministic description, and JSON `data` containing `global_agent_id`, `local_agent_id`, `workspace_id`, and `feature_flag='FEATURE_GLOBAL_AEGIS'`.
- Q: How is shadow-activity spam prevented? → A: Insert at most one row for the same requested workspace id, global Aegis id, and local Aegis id; skip insertion when a matching row already exists.
- Q: Which Aegis references are in the sweep? → A: Task routes, validation defaults, scheduler hooks, task-board Aegis display, and chat Aegis role surfaces.
- Q: Which downstream behaviors remain out of scope? → A: Task pipelines, `ready_for_owner`, area labels, artifact publishing, governance, pilot seed data, and CrabTrap.

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

1. **Given** the global feature is on and both local and global Aegis rows exist for a workspace, **When** review dispatch runs, **Then** the global row is used and one `aegis_local_shadowed` activity identifies the shadowed local row.
2. **Given** the global feature is on and only a local Aegis row exists, **When** review dispatch runs, **Then** the local row remains available as fallback.
3. **Given** repeated scheduler ticks resolve the same requested workspace id, global Aegis id, and local Aegis id, **When** the shadow audit row already exists, **Then** no additional `aegis_local_shadowed` activity is inserted for that tuple.

### Edge Cases

- A workspace has no local Aegis row and no global Aegis row exists; review dispatch falls back to gateway agent id/name `aegis` and must not crash scheduler loops.
- A workspace has multiple local rows with the same Aegis name and only one global row exists; same-scope duplicates resolve by lowest database id before cross-scope fallback rules apply.
- The global and local rows both exist but one is inactive or otherwise unavailable; `agents.status` does not change resolver precedence, and downstream gateway/review failure handling owns unavailable-agent outcomes.
- The feature flag changes between review runs for the same workspace.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a shared Aegis resolver that returns the best available Aegis reviewer for an optional workspace context.
- **FR-002**: The system MUST respect the global Aegis feature flag when choosing between global and workspace-scoped Aegis records.
- **FR-003**: When the global feature is off, the system MUST prefer a workspace-scoped Aegis reviewer and fall back to a global reviewer only if no workspace-scoped reviewer is available.
- **FR-004**: When the global feature is on, the system MUST prefer a global Aegis reviewer and fall back to a workspace-scoped reviewer only if no global reviewer is available.
- **FR-005**: The system MUST identify Aegis records using the canonical Aegis name and the appropriate facility or workspace scope.
- **FR-006**: The system MUST preserve compatibility with existing workspace-scoped Aegis records during the transition period.
- **FR-007**: When the global feature is on and both scopes contain Aegis records for the same workspace, the system MUST return the global reviewer and record an idempotent `activities` row with `type='aegis_local_shadowed'`, `entity_type='agent'`, `entity_id` set to the local Aegis row id, `actor='system'`, `workspace_id` set to the requested workspace id, a deterministic description, and JSON `data` containing `global_agent_id`, `local_agent_id`, `workspace_id`, and `feature_flag='FEATURE_GLOBAL_AEGIS'`; before inserting, the system MUST skip the write when a matching row already exists for the same requested workspace id, global Aegis id, and local Aegis id.
- **FR-008**: The system MUST route review dispatch through the shared Aegis resolver so scheduler-driven reviews use the same selection rules everywhere, without changing `runAegisReviews` task selection, retry, quality review insert/update, or `review`/`quality_review`/`assigned`/`failed`/`done` transition semantics.
- **FR-009**: The system MUST keep the Aegis completion gate based on `quality_reviews.reviewer='aegis'` and MUST NOT require reviewer identifiers in the quality review gate, code, or tests.
- **FR-010**: The system MUST sweep task routes, validation defaults, scheduler hooks, task-board Aegis display, and chat Aegis role surfaces for Aegis references and keep those surfaces consistent with resolver behavior without changing review semantics; UI surfaces may display existing Aegis review state but MUST NOT add task pipeline or `ready_for_owner` behavior.
- **FR-011**: The system MUST evaluate `FEATURE_GLOBAL_AEGIS` with the requested task or review workspace context when that context exists, and MUST NOT treat `process.env.FEATURE_GLOBAL_AEGIS='1'` as an enablement path.
- **FR-012**: If multiple Aegis records match the same candidate scope, the system MUST select the lowest database id and then apply the configured cross-scope precedence.
- **FR-013**: The resolver MUST NOT filter candidates by `agents.status`; unavailable-agent outcomes remain in gateway invocation and review failure handling.
- **FR-014**: If no global or workspace-scoped Aegis row exists, the system MUST preserve the current gateway fallback to agent id/name `aegis` and MUST NOT crash scheduler review loops.
- **FR-015**: The system MUST preserve existing Aegis gateway routing behavior, including configured OpenClaw id and session-key-derived routing behavior, and MUST NOT introduce a broad gateway contract rewrite.

### Key Entities *(include if feature involves data)*

- **Aegis reviewer**: The reviewer identity used for facility and workspace review routing, including a global singleton form and legacy workspace-scoped form.
- **Feature flag**: The control that determines whether global-first or workspace-first resolution applies.
- **Activity record**: An audit entry in `activities` with `type='aegis_local_shadowed'`, `entity_type='agent'`, `entity_id` equal to the shadowed local Aegis row id, `actor='system'`, requested `workspace_id`, a deterministic description, and JSON `data` containing `global_agent_id`, `local_agent_id`, `workspace_id`, and `feature_flag='FEATURE_GLOBAL_AEGIS'`; at most one row may exist per requested workspace id, global Aegis id, and local Aegis id tuple.
- **Quality review gate**: The completion check that continues to use the Aegis reviewer name as the live signal.
- **Gateway fallback**: The no-row compatibility path that invokes the gateway agent id/name `aegis` when no database-backed Aegis reviewer can be resolved.
- **Gateway routing**: The existing OpenClaw dispatch contract that derives the target from configured OpenClaw ids, stored session keys, or established fallbacks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a controlled validation run, 100% of workspaces with no local Aegis reviewer resolve to the global reviewer when the global feature is enabled.
- **SC-002**: In a controlled validation run, 100% of workspaces with a local Aegis reviewer continue to resolve that local reviewer when the global feature is disabled.
- **SC-003**: In a controlled migration run, every workspace with both local and global Aegis reviewers produces exactly one `aegis_local_shadowed` activity for each requested workspace id, global Aegis id, and local Aegis id tuple when the global feature is enabled, and repeated scheduler ticks for the same tuple do not create additional rows.
- **SC-004**: Review gate checks continue to succeed for existing Aegis workflows without requiring operators to change their quality review completion process.
- **SC-005**: In a no-row validation run, scheduler review dispatch attempts the gateway `aegis` fallback and reports normal review success/failure without throwing a resolver exception.
- **SC-006**: Regression tests prove `runAegisReviews` still selects the same review tasks, preserves retry counts and rejection handling, and performs the same status transitions except for the resolver source.
- **SC-007**: Regression tests prove Aegis gateway routing still honors configured `openclawId` and established session-key fallback behavior without requiring a gateway contract change.
- **SC-008**: Grep or schema validation shows SPEC-003 production code and tests do not require `quality_reviews.agent_id`.
- **SC-009**: Grep or focused tests prove the Aegis reference sweep covers task routes, validation defaults, scheduler hooks, task-board Aegis display, and chat Aegis role surfaces without adding task pipeline, `ready_for_owner`, area-label, artifact-publishing, governance, pilot-seed-data, or CrabTrap behavior.

## Assumptions

- The canonical Aegis name remains stable across existing deployments.
- Operators may have a mix of global and local Aegis records during migration.
- The global feature flag is intended to be toggled without requiring a schema change.
- `FEATURE_GLOBAL_AEGIS` follows the shared feature-flag contract: workspace JSON may opt in, environment `0` may force off, and environment `1` does not force on.
- Existing review workflows continue to treat the reviewer name as the user-visible gate signal.
