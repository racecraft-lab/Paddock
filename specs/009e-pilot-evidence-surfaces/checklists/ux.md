# UX Requirements Quality Checklist: Pilot Evidence Surfaces

**Purpose**: Validate that SPEC-009E UX requirements are complete, unambiguous, measurable, accessible, and bounded to the compact task detail Evidence section.
**Created**: 2026-05-20
**Feature**: [spec.md](../spec.md)
**Domain**: ux

## Requirement Completeness

- [x] CHK001 Are the Evidence section placement requirements complete enough to keep the surface inside the existing task detail Details tab unless a tab is explicitly justified? [Completeness, Spec §Session 2, Spec §FR-010, Plan §Structure Decision]
- [x] CHK002 Are visibility requirements defined for every opened task, including GitHub-linked, pilot-relevant, local-only, incomplete, non-pilot, and no-stored-evidence tasks? [Completeness, Spec §Session 2, Spec §FR-011, Spec §User Story 2]
- [x] CHK003 Are the operator-facing evidence categories required for UAT explicitly listed, including eligibility, GitHub issue/PR identity, packet JSON/Markdown references, smoke/checklist proof, stage, warnings, source-map pointers, and all seven deferrals? [Completeness, Spec §Session 4, Spec §FR-016, Spec §SC-004]
- [x] CHK004 Are route loading, no-stored-evidence, route error, missing-proof, stale/unavailable, and deferred UI states all required without adding refreshes or writes? [Completeness, Spec §FR-022, Spec §Edge Cases]

## Requirement Clarity

- [x] CHK005 Is the compact-density requirement clear enough to distinguish full evidence for pilot-relevant tasks from one-line explanations for local-only or no-evidence tasks? [Clarity, Spec §Session 2, Spec §FR-011]
- [x] CHK006 Are missing-proof and not-eligible explanations required to name specific absent proof categories instead of using generic failure or success language? [Clarity, Spec §FR-008, Spec §FR-009, Spec §SC-002]
- [x] CHK007 Are stale, unavailable, cleaned-UAT, redacted, quarantined, superseded, malformed, oversized, unsafe, and secret-bearing evidence states described as safe metadata/warning displays rather than raw content or proof-positive states? [Clarity, Spec §FR-028, Spec §FR-030, Data Model §Review Packet Reference]
- [x] CHK008 Is the future-state deferral copy requirement clear enough to prevent operators from interpreting run state, sync automation, claim authority, retry controls, sandbox lifecycle, adapter registry, or real harness execution as current SPEC-009E capabilities? [Clarity, Spec §FR-012, Spec §FR-013, Spec §User Story 3]

## Requirement Consistency

- [x] CHK009 Do the spec, plan, and quickstart consistently keep the Evidence UI task-local and reject a global Evidence page, diagnostics dashboard, or standalone navigation surface? [Consistency, Spec §FR-017, Spec §FR-024, Plan §Constraints, Quickstart §UI UAT]
- [x] CHK010 Do the spec and plan consistently describe Evidence viewing as read-only, with no GitHub refresh, packet generation, sync, smoke execution, retry, claim, sandbox, adapter, harness, task, activity, or artifact mutation? [Consistency, Spec §FR-014, Spec §FR-015, Plan §Summary]
- [x] CHK011 Are task-local stage and archived proof requirements consistent with the source hierarchy, so current task/activity rows win for live stage while retained issue #50 / PR #51 and packet/source-map references remain archived proof when disposable rows were cleaned? [Consistency, Spec §Session 3, Spec §Session 4, Spec §FR-026, Spec §FR-030]

## Acceptance Criteria Quality

- [x] CHK012 Can the under-30-seconds operator comprehension outcome be objectively evaluated from the task detail journey without terminal output or unrelated records? [Acceptance Criteria, Spec §SC-001, Spec §User Story 1]
- [x] CHK013 Are negative-state success criteria measurable across tested local-only and partial-proof tasks by requiring at least one specific missing proof reason? [Acceptance Criteria, Spec §SC-002]
- [x] CHK014 Are deferred-category success criteria measurable by requiring all seven named deferrals and by excluding controls for those capabilities? [Acceptance Criteria, Spec §SC-003]
- [x] CHK015 Is UAT evidence quality measurable through at least one browser journey backed by retained issue #50 / PR #51 evidence and screenshots of the operator-facing UI? [Acceptance Criteria, Spec §SC-004, Plan §UI Journey Gate]

## Accessibility And Status Semantics

- [x] CHK016 Are accessibility requirements specified for the compact Details section, including a labelled section, heading, text labels that do not depend on color alone, keyboard-reachable links, accessible names, and polite async status/error announcements? [Accessibility, Spec §Session 2, Spec §FR-023]
- [x] CHK017 Are route loading and error messages specified as labelled, non-mutating status/error states inside the Evidence section without blocking the rest of Details? [Accessibility, Spec §FR-022, Spec §Edge Cases]
- [x] CHK018 If Plan later proves a tab necessary, are standard tab semantics, keyboard navigation, and labelled panels already specified as the alternate accessibility contract? [Accessibility, Spec §Session 2]

## Scenario And Edge Case Coverage

- [x] CHK019 Are primary pilot evidence, partial proof, local-only/no-evidence, stale/unavailable, cleaned-UAT, conflicting-source, and deferred future-state scenarios all represented in requirements or edge cases? [Coverage, Spec §User Stories, Spec §Edge Cases]
- [x] CHK020 Are safe-reference requirements defined for GitHub and artifact links so references are inspectable by operators without exposing prohibited artifact internals? [Coverage, Spec §FR-021, Spec §FR-028]
- [x] CHK021 Are responsive or narrow-layout screenshot requirements covered if the touched task detail layout changes at narrow width? [Coverage, Plan §UI Journey Gate]

## Dependencies And Assumptions

- [x] CHK022 Are the UX requirements traceable to stored Mission Control evidence rather than runtime parsing of the smoke checklist or live external systems? [Dependency, Spec §FR-026, Spec §FR-029, Research §Derive evidence from stored rows only]
- [x] CHK023 Are UAT fixture cleanup expectations documented when a disposable carrier task is required for screenshots? [Dependency, Spec §FR-031, Quickstart §Disposable UAT Carrier Cleanup]

## Notes

- Validation passed against `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, the existing task detail Details tab structure in `src/components/panels/task-board-panel.tsx`, Mission Control Constitution Principles XIV and XVI, and W3C WCAG/WAI-ARIA guidance for color-independent status text and polite status announcements.
