# API Contract Quality Checklist: Pilot Evidence Surfaces

**Purpose**: Validate that SPEC-009E API contract requirements are complete, unambiguous, measurable, and bounded before task generation.
**Created**: 2026-05-20
**Feature**: [spec.md](../spec.md)
**Domain**: api-contracts

## Requirement Completeness

- [x] CHK001 Are the task evidence route name, HTTP method, and task-scoped path specified consistently across spec, plan, and OpenAPI contract? [Completeness, Spec §FR-001, Contract §paths./api/tasks/{id}/evidence]
- [x] CHK002 Are all required v1 response sections named in both functional requirements and the OpenAPI `TaskEvidenceResponse.required` list? [Completeness, Spec §FR-003, Contract §TaskEvidenceResponse]
- [x] CHK003 Are success responses required to include explicit negative domain states for local-only, non-pilot, partial-proof, stale, unavailable, and incomplete evidence rather than empty success bodies? [Completeness, Spec §FR-009, Spec §Edge Cases, Contract §responses.200]
- [x] CHK004 Are future-state deferral categories enumerated with owning spec families and a minimum cardinality that covers all seven deferred categories? [Completeness, Spec §FR-012, Spec §FR-013, Contract §DeferralEvidence]

## Requirement Clarity

- [x] CHK005 Is the response state vocabulary explicitly constrained to the approved snake_case values, with oversized and malformed evidence represented as warning reason codes instead of top-level states? [Clarity, Spec §FR-025, Contract §EvidenceState]
- [x] CHK006 Are the stored-source precedence rules for identity, packet, smoke, current stage, and archived UAT proof stated clearly enough to prevent live refresh or packet generation on `GET`? [Clarity, Spec §FR-026, Spec §FR-027]
- [x] CHK007 Are exact error payload codes mapped to each HTTP boundary case (`400`, `401`, `403`, masked `404`) rather than left as examples that an implementation could choose inconsistently? [Clarity, Spec §FR-019, Contract §ErrorResponse]
  - Evidence: FR-019 now defines exact `ErrorResponse.error` mappings for `401 unauthenticated`, `400 invalid_workspace_scope`, `403 forbidden_workspace_scope`, and masked `404 task_not_found`; the OpenAPI responses now reference per-status schemas with matching single-value `const` constraints.

## Requirement Consistency

- [x] CHK008 Do the spec, plan, data model, and OpenAPI contract consistently treat incomplete evidence as a `200` domain state instead of an HTTP error? [Consistency, Spec §FR-009, Plan §Summary, Data Model §Task Evidence Response, Contract §responses.200]
- [x] CHK009 Do the contract and data model consistently prevent artifact body content, storage URIs, object paths, signed URLs, raw secret values, parser internals, and actor identity from appearing in task evidence responses? [Consistency, Spec §FR-021, Spec §FR-028, Data Model §Task Evidence Response]
- [x] CHK010 Is disabled or unavailable artifact storage specified as a section-level task evidence warning with exact response fields/reason codes, without duplicating existing artifact read-route semantics? [Consistency, Spec §FR-020, Spec §FR-021, Contract §PacketArtifactsEvidence]
  - Evidence: FR-020 now requires `code: "section_unavailable"`, `section: "packet_artifacts"`, and `reason: "artifact_storage_disabled"` or `"artifact_storage_unavailable"` while preserving direct artifact route semantics; the OpenAPI contract now includes `packet_artifacts.unavailable_reason` and constrained warning `code`/`section`/`reason` fields.

## Acceptance Criteria Quality

- [x] CHK011 Are API-level success criteria measurable enough to verify that operators can distinguish stored proof, missing proof, and deferred categories for UAT tasks? [Acceptance Criteria, Spec §SC-001, Spec §SC-005]
- [x] CHK012 Are missing-proof states tied to specific reason lists so tests can objectively verify local-only and partial-proof task behavior? [Acceptance Criteria, Spec §SC-002, Contract §PilotEligibility, Contract §IdentityEvidence]

## Scenario And Edge Case Coverage

- [x] CHK013 Are route error scenarios for unauthenticated reads, malformed workspace scope, forbidden explicit workspace scope, masked missing tasks, and out-of-scope tasks all represented in requirements? [Coverage, Spec §FR-019, Contract §responses]
- [x] CHK014 Are artifact safety scenarios for redacted, quarantined, superseded, oversized, malformed, unsafe, and secret-bearing evidence covered without adding mutation or read-through controls? [Coverage, Spec §FR-028, Spec §Edge Cases]
- [x] CHK015 Are cleaned disposable UAT rows represented as archived proof with missing or unavailable live pointers rather than current Mission Control state? [Coverage, Spec §FR-030, Data Model §Source Map Entry]

## Read-Only And Scope Boundaries

- [x] CHK016 Are read-only guarantees stated for route, helper, and UI behavior, including no GitHub refresh, packet generation, smoke execution, sync trigger, activities write, artifact write, or pilot status mutation? [Scope, Spec §FR-014, Spec §FR-015, Plan §Summary]
- [x] CHK017 Are global Evidence pages, diagnostics dashboards, and action controls explicitly excluded from the route/UI contract? [Scope, Spec §FR-017, Spec §FR-024]
