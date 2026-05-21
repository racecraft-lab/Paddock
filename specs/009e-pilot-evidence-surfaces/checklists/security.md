# Security Requirements Quality Checklist: Task Evidence Surfaces

**Purpose**: Validate that SPEC-009E requirements define safe, read-only evidence display without leaking restricted artifact content, unexpectedly activating stored links, or weakening task/workspace authorization.
**Created**: 2026-05-20
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [ ] CHK001 Are all restricted artifact states covered for safe evidence display, including redacted, quarantined, superseded, oversized, malformed, unsafe, secret-bearing, stale, and missing evidence? [Completeness, Spec §FR-028]
- [ ] CHK002 Are prohibited exposed fields explicitly named for restricted artifact evidence, including quarantined content, storage URIs, object paths, signed URLs, raw secret values, parser internals, and actor identity? [Completeness, Spec §FR-028]
- [x] CHK003 Are requirements defined to prevent stored Markdown/text evidence from becoming active links, raw HTML, script-capable markup, or navigation triggers unless the link comes from an allowlisted typed reference? [Resolved, Spec §FR-038, Plan §Stored Text And Link Rendering Constraints, Data Model §Task Evidence Response]
- [ ] CHK004 Are existing artifact masking, quarantine, redaction, and direct read-route boundaries preserved rather than redefined by the aggregate task evidence route? [Completeness, Spec §FR-020, Spec §FR-021, Spec §FR-028]
- [ ] CHK005 Are workspace/task authorization outcomes fully specified for unauthenticated, malformed scope, forbidden explicit scope, missing task, and out-of-scope task reads? [Completeness, Spec §FR-019]

## Requirement Clarity

- [ ] CHK006 Are the exact HTTP status codes and `ErrorResponse.error` values for task evidence auth and workspace-scope failures unambiguous? [Clarity, Spec §FR-019]
- [ ] CHK007 Is the distinction between safe artifact metadata, safe post-redaction preview, and forbidden raw artifact content defined clearly enough for implementation and review? [Clarity, Spec §FR-021, Spec §FR-028]
- [ ] CHK008 Are oversized and malformed evidence represented as warning reason codes rather than top-level evidence states? [Clarity, Spec §FR-025, Data Model §V1 Evidence State Model]
- [ ] CHK009 Is the client-side state authority boundary explicit enough to prevent UI inference, local override, cached fallback display, or coercion of unknown API states? [Clarity, Spec §FR-035, Spec §FR-037]

## Requirement Consistency

- [ ] CHK010 Do the route-level read-only requirements align with UI retry/reload behavior so user interaction cannot trigger refresh, repair, backfill, quarantine override, or artifact mutation? [Consistency, Spec §FR-014, Spec §FR-015, Spec §FR-036]
- [ ] CHK011 Do artifact-storage-disabled requirements preserve non-artifact evidence while keeping direct artifact-route `503 artifact_store_disabled` behavior unchanged? [Consistency, Spec §FR-020]
- [ ] CHK012 Do the spec and data model agree that every response section may use only the allowed v1 state values for that section? [Consistency, Spec §FR-035, Data Model §V1 Evidence State Model]

## Acceptance Criteria Quality

- [ ] CHK013 Do measurable outcomes require evidence that restricted artifact states never expose forbidden content or private storage pointers? [Acceptance Criteria, Spec §SC-004, Spec §SC-005]
- [ ] CHK014 Do UAT and Playwright requirements include a concrete path to exercise auth/scope errors or masked out-of-scope task behavior without leaking task existence? [Acceptance Criteria, Spec §FR-019, Plan §UI Journey Gate]
- [ ] CHK015 Do UI accessibility outcomes cover distinguishable warning, missing, unavailable, redacted, quarantined, and deferred states without relying on color alone? [Acceptance Criteria, Spec §FR-023, Spec §SC-006]

## Edge Case Coverage

- [ ] CHK016 Are conflict, stale, unavailable, and artifact-store-disabled edge cases defined as warnings or section states that preserve other readable evidence? [Coverage, Spec §Edge Cases, Spec §FR-020]
- [ ] CHK017 Are re-open, reload, and retry edge cases bounded to read-only `GET` behavior with no hidden write, refresh, or mutation side effects? [Coverage, Spec §Edge Cases, Spec §FR-036]
- [ ] CHK018 Are cleaned disposable UAT rows represented without claiming current live Mission Control state or exposing stale private row pointers as current proof? [Coverage, Spec §FR-030, Spec §FR-031]

## Verification Pass

- [x] CHK019 Does the remediated spec define stored evidence-derived strings as untrusted inert display text rather than Markdown, HTML, or navigation-capable content? [Completeness, Spec §FR-038]
- [x] CHK020 Does the remediated plan assign implementation and verification responsibility for inert stored-text rendering and typed-reference-only links? [Coverage, Plan §Stored Text And Link Rendering Constraints, Plan §State Management Verification]
- [x] CHK021 Does the remediated data model define active-link construction as limited to typed contract references after protocol and destination-family validation? [Clarity, Data Model §Task Evidence Response]
- [x] CHK022 Does the remediated OpenAPI contract warn clients not to activate stored strings and to link only from typed task evidence references? [Consistency, Contract §GET /api/tasks/{id}/evidence]
