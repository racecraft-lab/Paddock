# Accessibility Requirements Quality Checklist: Pilot Evidence Surfaces

**Purpose**: Validate that SPEC-009E accessibility requirements are complete, measurable, and tied to real browser journey evidence for the task detail Evidence surface.
**Created**: 2026-05-20
**Feature**: [spec.md](../spec.md)
**Domain**: accessibility

## Requirement Completeness

- [x] CHK001 Are keyboard navigation requirements defined for reaching the Evidence section inside the existing task detail Details tab without requiring a new global navigation surface? [Accessibility, Spec §Session 2, Spec §FR-010, Spec §FR-024]
- [x] CHK002 Are keyboard requirements defined for every interactive reference inside the Evidence section, including GitHub and artifact links, while preserving read-only behavior? [Accessibility, Spec §Session 2, Spec §FR-014, Spec §FR-023]
- [x] CHK003 Are screen-reader labeling requirements complete for each evidence category operators must distinguish: eligibility, current stage, packet references, missing proof, warnings, and deferred sections? [Accessibility, Spec §FR-023, Spec §SC-006]
- [x] CHK004 Are async loading and route error updates required to be announced politely without blocking the rest of the Details tab? [Accessibility, Spec §Session 2, Spec §FR-022, Spec §FR-023]

## Requirement Clarity

- [x] CHK005 Is the alternate tab accessibility contract clear if Plan later proves a fourth modal tab necessary, including standard tab semantics, keyboard navigation, and labelled panels? [Clarity, Spec §Session 2]
- [x] CHK006 Are color-independent status requirements clear enough to prevent eligibility, incomplete, missing, stale, unavailable, and deferred states from being conveyed by color alone? [Clarity, Spec §FR-022, Spec §FR-023]
- [x] CHK007 Are overflow and reflow requirements explicit enough for long packet names, GitHub references, source-map pointers, warning reason codes, and deferred labels at narrow widths or high zoom? [Accessibility, Spec §FR-033, Spec §FR-034, Spec §SC-007, Plan §UI Journey Gate]

## Acceptance Criteria Quality

- [x] CHK008 Does the plan require real Playwright browser journey evidence using accessible labels rather than component-only or static markup checks? [Acceptance Criteria, Plan §UI Journey Gate, Constitution §XIV]
- [x] CHK009 Are screenshots required for loaded evidence, incomplete/not-eligible proof, and deferred categories, with responsive coverage if the touched task detail layout changes at narrow width? [Acceptance Criteria, Plan §UI Journey Gate]
- [x] CHK010 Are accessibility expectations tied to stored-evidence UI states rather than introducing refresh, retry, packet generation, sync, claim, sandbox, adapter, or harness controls? [Consistency, Spec §FR-014, Spec §FR-015, Spec §FR-024]

## Scenario Coverage

- [x] CHK011 Are local-only, partial-proof, stale/unavailable, route error, and deferred states required to remain understandable without relying on status-only colors? [Coverage, Spec §FR-009, Spec §FR-022, Spec §User Story 2]
- [x] CHK012 Are screen-reader and keyboard requirements scoped to the compact task-local Evidence section rather than a new global Evidence page or diagnostics dashboard? [Coverage, Spec §FR-017, Spec §FR-024]

## Notes

- Initial checklist found two requirements-writing gaps: section-specific screen-reader labels and explicit overflow/reflow handling for long evidence strings. Both gaps were remediated in `spec.md` and `plan.md`.

## Remediation Verification

- [x] CHK013 Does FR-023 now require visible labels plus screen-reader-accessible names or descriptions for eligibility, current stage, packet references, missing proof, warnings, and deferred sections? [Accessibility, Spec §FR-023, Spec §SC-006]
- [x] CHK014 Do FR-033, FR-034, and the UI Journey Gate now require full-text access and reflow/overflow evidence for long packet names, GitHub references, source-map pointers, warning reason codes, and deferred labels? [Accessibility, Spec §FR-033, Spec §FR-034, Spec §SC-007, Plan §UI Journey Gate]
