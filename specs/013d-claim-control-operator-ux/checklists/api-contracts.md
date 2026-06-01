# API Contracts Checklist: SPEC-013D Claim-Control Operator UX

**Purpose**: Requirements-quality checklist for consumed read fields, mutation body construction, idempotency, expected-state echoing, and response handling.
**Created**: 2026-05-30
**Feature**: `specs/013d-claim-control-operator-ux/spec.md`

**Note**: This checklist validates whether API contract requirements are complete, clear, consistent, measurable, and ready for implementation.

## Requirement Completeness

- [x] CHK001 Are the consumed `GET /api/tasks/[id]/claim-reconciliation` fields explicitly listed? [Completeness, Spec Clarifications Session 2]
- [x] CHK002 Are the consumed `claim_control` subfields explicitly listed for UI behavior? [Completeness, Spec Clarifications Session 2]
- [x] CHK003 Are `POST /api/tasks/[id]/claim-control` body fields and the `Idempotency-Key` header specified? [Completeness, Spec FR-009]
- [x] CHK004 Are success, replay, stale/conflict, validation, authorization, feature-flag-off, and network-failure response classes documented? [Completeness, Contract Response Handling]

## Requirement Clarity

- [x] CHK005 Is `available_actions[]` defined as the sole action list? [Clarity, Spec Clarifications Session 2, FR-002]
- [x] CHK006 Is the expected-state copy rule defined without allowing client recomputation? [Clarity, Spec Clarifications Session 2, Contract Mutation]
- [x] CHK007 Are default values for `override_backoff`, `override_reason`, `reason`, and `client_correlation_id` defined? [Clarity, Spec Clarifications Session 2]
- [x] CHK008 Are bounded reason requirements tied to action type? [Clarity, Spec FR-012, FR-013, FR-014]

## Requirement Consistency

- [x] CHK009 Do the UI contract requirements preserve SPEC-013C backend semantics without adding routes or changing response authority? [Consistency, Spec FR-020, FR-021]
- [x] CHK010 Do authorization requirements align between read-only visibility and operator/admin mutation authority? [Consistency, Spec FR-006, FR-007]
- [x] CHK011 Do idempotency requirements align between the UI lifecycle and backend replay behavior? [Consistency, Spec FR-010, Contract Mutation]
- [x] CHK012 Do raw diagnostic exclusion requirements align across receipts, fixtures, screenshots, and manifests? [Consistency, Spec FR-011, FR-018, FR-025]

## Acceptance Criteria Quality

- [x] CHK013 Are contract acceptance criteria measurable through component tests, route-client tests, and Playwright fixture evidence? [Acceptance Criteria, Plan Testing]
- [x] CHK014 Are no-client-recomputation requirements objectively reviewable through tests or static assertions? [Acceptance Criteria, Spec FR-002]
- [x] CHK015 Are refresh requirements tied to concrete route response classes? [Acceptance Criteria, Contract Response Handling]

## Scenario Coverage

- [x] CHK016 Are API requirements defined for absent read model, feature flag disabled, viewer/forbidden, stale expected state, replay, mismatch, and network failure scenarios? [Coverage, Spec Edge Cases]
- [x] CHK017 Are unsafe payload and raw secret exposure exclusions documented for all UI evidence outputs? [Coverage, Spec FR-018, FR-025]

## Result

All API contract requirements-quality checks pass. No API-contract checklist gaps remain.
