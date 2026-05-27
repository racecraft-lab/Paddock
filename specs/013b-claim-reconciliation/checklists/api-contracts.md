# API Contracts Checklist: SPEC-013B Claim and Reconciliation Authority

**Purpose**: Validate that SPEC-013B API-contract requirements are complete, clear, consistent, and measurable before implementation.
**Created**: 2026-05-27
**Domain**: api-contracts

## Requirement Completeness

- [x] CHK001 Are the task-scoped claim/reconciliation route path, method, auth role, workspace scoping, and path parameter requirements explicitly documented? [Completeness, Contract §GET `/api/tasks/{id}/claim-reconciliation`]
- [x] CHK002 Does the success response define a stable versioned envelope, generated timestamp, task identity, stage identity, GitHub truth fields, feature-flag state, eligibility state, active-claim state, claim history, latest decisions, attempt links, and diagnostics? [Completeness, Contract §Success Response]
- [x] CHK003 Are read-model states and reason categories fully enumerated for stale GitHub truth, governance block/defer, duplicate active claim, stale recovery, terminal reconciliation, missing linkage, not-claimable input, and flag-off legacy behavior? [Completeness, Contract §Read Model States And Reasons]
- [x] CHK004 Does the API contract specify the flag-off response shape and require no claim/reconciliation side effects when `FEATURE_TASK_CONTROL_PLANE=false`? [Completeness, Contract §Flag-Off Response]

## Requirement Clarity

- [x] CHK005 Are claim, attempt, activity, task, workspace, issue, and PR identifiers represented consistently as response strings with positive integer input validation for the task id? [Clarity, Contract §Parameters, Contract §Success Response]
- [x] CHK006 Are `active_claim = null`, empty history/decision arrays, and non-claimable eligibility states explicitly defined for tasks with no active claim or no SPEC-013B intake eligibility? [Clarity, Contract §Contract Rules]
- [x] CHK007 Are HTTP error responses separated from business deferral outcomes so stale truth, governance decisions, duplicates, stale recovery, and flag-off state remain represented in the 200 read model rather than ambiguous transport failures? [Clarity, Contract §Error Responses]

## Requirement Consistency

- [x] CHK008 Does the contract forbid POST, PATCH, DELETE, action URLs, manual release, retry, cancel, and primary-dashboard mutation affordances consistently with the spec and plan non-goals? [Consistency, Spec §FR-014, Plan §API]
- [x] CHK009 Does the API contract require preserving existing task-stage attempt evidence and existing GitHub sync API behavior without creating, mutating, or fetching GitHub sync state from the read route? [Consistency, Contract §Preservation And Read-Only Boundary, Contract §Contract Rules]
- [x] CHK010 Does the route registration requirement align across the contract, OpenAPI, and `/api/index` so API discovery stays consistent? [Consistency, Contract §Contract Rules]

## Acceptance Criteria Quality

- [x] CHK011 Are payload safety rules testable through explicit forbidden field classes, redaction flags, and response-sanitization expectations? [Acceptance Criteria, Spec §FR-018, Contract §Contract Rules]
- [x] CHK012 Are read-only route tests required for viewer/workspace authorization, versioned response shape, route registration, no mutation methods, and absence of action affordances? [Acceptance Criteria, Plan §Verification Plan]
- [x] CHK013 Are preservation tests required to prove the read route does not alter claim rows, stage-attempt evidence, task rows, activities, or GitHub sync lifecycle state while building the response? [Acceptance Criteria]

## Scenario Coverage

- [x] CHK014 Are primary, alternate, exception, recovery, and flag-off read-model scenarios covered without exposing manual write controls? [Coverage, Spec §User Stories 1-4]
- [x] CHK015 Are stale claim recovery and late stale-owner protection represented as auditable read-model outcomes without converting the read route into a release or retry control surface? [Coverage, Spec §FR-009]

## Verification Re-Run

- [x] CHK016 Does the updated API contract define a closed `eligibility.state` enum covering stale GitHub truth, governance block/defer, duplicate active claim, stale recovery, terminal reconciliation, missing linkage, not-claimable input, flag-off legacy behavior, and schema-unavailable state? [Completeness, Contract §Read Model States And Reasons]
- [x] CHK017 Does the updated API contract define a flag-off `200` response envelope with `flag_off_legacy`, null active claim, bounded read-only arrays, and no claim/reconciliation side effects? [Completeness, Contract §Flag-Off Response]
- [x] CHK018 Does the updated API contract separate transport errors from business deferral states so stale truth, governance, duplicate, recovery, terminal, and flag-off outcomes remain represented in the read model? [Clarity, Contract §Read Model States And Reasons, Contract §Error Responses]
- [x] CHK019 Does the updated API contract preserve existing task-stage attempt evidence and GitHub sync API behavior by forbidding read-route writes, live GitHub fetches, and sync control triggers? [Consistency, Contract §Preservation And Read-Only Boundary]
- [x] CHK020 Does the data model use the same flag-off legacy state vocabulary as the API contract and plan? [Consistency, Data Model §Claim Reconciliation Read Model, Contract §Flag-Off Response, Plan §API]
