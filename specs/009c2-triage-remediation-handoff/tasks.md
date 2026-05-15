# Tasks: Triage-to-Remediation Plan Handoff

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/triage-handoff-contract.md`, `quickstart.md`,
`docs/ai/specs/SPEC-009C2-design-concept.md`

**Prerequisites**: Specify, Clarify, Plan, and focused checklists complete.

**TDD rule**: Every production behavior change starts with a failing Vitest test.
Automated tests must not mutate live GitHub.

## Phase 1: RED Tests

- [ ] T001 Add failing workflow-contract importer coverage for the
  `mission-control_issue_triage` pilot disposition enum and routing rule in
  `src/lib/__tests__/workflow-contracts/importer.test.ts`
- [ ] T002 Add failing `advanceTaskChain` coverage that
  `ACTIONABLE_REMEDIATION` creates exactly one
  `mission-control_remediation_plan` successor through existing routing in
  `src/lib/__tests__/task-chain-advancement.routing.test.ts`
- [ ] T003 Add failing duplicate-actionable coverage proving a repeated handoff
  returns `successor_exists` and leaves one child successor in
  `src/lib/__tests__/task-chain-advancement.routing.test.ts`
- [ ] T004 Add failing negative-disposition matrix coverage for `DUPLICATE`,
  `OBSOLETE`, `INVALID`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, and `NEEDS_SPEC`
  with zero remediation successors and evidence in
  `src/lib/__tests__/task-chain-advancement.routing.test.ts`
- [ ] T005 Add failing invalid-output coverage proving missing/malformed/unknown
  pilot dispositions fail closed without successor creation in
  `src/lib/__tests__/task-chain-output-validation.test.ts`
- [ ] T006 Add failing compatibility coverage that existing SPEC-007 lowercase
  disposition schemas still log valid dispositions in
  `src/lib/__tests__/spec-007-disposition-dispatch.test.ts`

## Phase 2: Workflow Contract And Runtime Implementation

- [ ] T007 Update `docs/ai/workflows/mission-control/workflow-contract.yaml` so
  `mission-control_issue_triage` emits the pilot `disposition` taxonomy and
  routes only `ACTIONABLE_REMEDIATION` to `mission-control_remediation_plan`
- [ ] T008 Extend `src/lib/task-dispatch.ts` disposition schema detection and
  validation to accept the pilot taxonomy without breaking SPEC-007 values
- [ ] T009 Implement task-scoped pilot triage artifact evidence using existing
  `publishArtifact` behavior and `artifact_type='triage_outcome'`
- [ ] T010 Implement task-scoped activity evidence for valid pilot triage
  outcomes without counting unrelated pipeline entities
- [ ] T011 Ensure duplicate actionable handoff attempts preserve the existing
  remediation successor and do not create duplicate pilot evidence rows

## Phase 3: Documentation And Smoke Evidence

- [ ] T012 Update `docs/qa/pilot-smoke-checklist.md` with SPEC-009C2 fresh
  synthetic issue creation, actionable handoff, negative fixture checks, and
  cleanup steps
- [ ] T013 Update `docs/ai/rc-factory-technical-roadmap.md` status/evidence
  wording for SPEC-009C2 branch progress while preserving SPEC-009F and
  SPEC-013A1 future boundaries
- [ ] T014 Update `docs/ai/specs/SPEC-009C2-workflow.md` implementation
  progress and verification-evidence tables

## Phase 4: Verification

- [ ] T015 Run focused Vitest coverage:
  `pnpm test src/lib/__tests__/task-chain-advancement.routing.test.ts src/lib/__tests__/task-chain-output-validation.test.ts src/lib/__tests__/spec-007-disposition-dispatch.test.ts src/lib/__tests__/workflow-contracts/importer.test.ts`
- [ ] T016 Run `pnpm typecheck`
- [ ] T017 Run `pnpm lint`
- [ ] T018 Run `pnpm build`
- [ ] T019 Run the G7 gate script and reviewability diff gate
- [ ] T020 Record manual synthetic smoke as operator-owned pending evidence if
  live GitHub mutation is not run in this automated pass

## Dependencies

- T001-T006 must fail before T007-T011 production changes.
- T007 must precede T001 green verification.
- T008-T011 must precede T002-T006 green verification.
- T012-T014 follow code changes.
- T015-T020 run after implementation and documentation updates.

## Parallel Opportunities

- T001 and T012 may be prepared independently after Plan.
- T002-T005 share routing fixtures and should be implemented serially.
- T006 can run in parallel with pilot-specific routing tests because it guards
  legacy compatibility.
- T013 and T014 can be updated after verification evidence is known.

## Coverage Map

- US1 / SC-001 / SC-002: T002, T003, T007, T008, T011, T015
- US2 / SC-003 / SC-005: T004, T005, T008, T009, T010, T015
- US3 / SC-006 / SC-007: T001, T007, T015
- US4 / SC-008: T012, T020
- Scope guardrails / SC-009 / SC-010: T013, T014, T016-T019
