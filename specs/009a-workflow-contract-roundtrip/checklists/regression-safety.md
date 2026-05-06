# Regression Safety Checklist: SPEC-009A Workflow Contract Format and Roundtrip

**Purpose**: Validate that SPEC-009A requirements protect existing workflow behavior, keep later-spec fields declarative, avoid pilot/runtime scope creep, and keep dependency changes direct and guarded.
**Created**: 2026-05-06
**Feature**: [spec.md](../spec.md)

**Note**: This checklist is generated from the Phase 4 `regression-safety` prompt in `docs/ai/specs/SPEC-009A-workflow.md`.

## Existing Workflow Behavior

- [ ] CHK001 Are existing workflow template creation, editing, listing, and dispatch behaviors unchanged unless an operator explicitly runs import apply mode? [Regression Safety, Spec FR-018, Spec FR-038]
- [ ] CHK002 Are dry-run imports required to compute validation and diffs without mutating `workflow_templates`, diagnostics, snapshots, or unrelated runtime state? [Completeness, Spec FR-016, Spec FR-024]
- [ ] CHK003 Are apply mutations limited to contract-owned templates identified by workspace plus slug? [Scope, Spec FR-017, Spec FR-040]
- [ ] CHK004 Are unrelated `workflow_templates` preserved across apply, failed apply, export, and recovery flows? [Regression Safety, Spec FR-018, Spec SC-002]
- [ ] CHK005 Are no-op repeated imports measured by canonical hashes rather than by incidental Markdown or database ordering? [Measurability, Spec FR-026, Spec SC-004]
- [ ] CHK006 Are diagnostics and UI additions read-only and separated from existing edit/apply/dispatch controls? [Regression Safety, Spec FR-047, Contracts Diagnostics API]

## Later-Spec Declarations

- [ ] CHK007 Are product-line feature flags stored as declarations without activating product-line seed behavior in SPEC-009A? [Scope, Spec FR-033, Spec FR-034]
- [ ] CHK008 Are governance fields declared as inert data without invoking the SPEC-008 resource-governance evaluator? [Scope, Spec FR-013, Plan Out Of Scope]
- [ ] CHK009 Are concurrency, retry, and sandbox fields validated structurally without implementing scheduler, retry engine, or sandbox lifecycle behavior? [Scope, Spec FR-014, Spec FR-030]
- [ ] CHK010 Are capability and adapter requirements validated for contract shape without launching harness adapters or control-plane workers? [Scope, Spec FR-012, Spec FR-035]
- [ ] CHK011 Are GitHub tracker declarations validated structurally without issue ingestion, claim reconciliation, retry enforcement, auto-merge, or PR sync? [Scope, Spec FR-011, Spec FR-030]
- [ ] CHK012 Are prompt version, routing-rule hash, and output-schema hash checks validation-only and not coupled to the SPEC-009A implementation branch? [Durability, Spec FR-015, Research Hash Envelope]

## Scope Guardrails

- [ ] CHK013 Does every artifact explicitly exclude product-line seed, `PILOT_MISSION_CONTROL_E2E`, dispatch loops, runner launch, sandbox lifecycle, and harness adapter work? [Scope, Spec Out Of Scope, Plan Scope]
- [ ] CHK014 Do tasks and quickstart expectations require guardrail tests or assertions for no pilot, no runner, no claim loop, and no harness execution paths? [Coverage, Workflow Phase 5 Required Coverage]
- [ ] CHK015 Are migration requirements additive and limited to generic workflow-contract diagnostics tables and rollback SQL? [Regression Safety, Spec FR-049, Plan Constitution Check]
- [ ] CHK016 Are runtime data changes transactional so failed apply cannot leave partial template, diagnostics, or snapshot state? [Regression Safety, Spec FR-019, Spec FR-039]
- [ ] CHK017 Are last-known-good recovery flows operator-triggered and dry-run-first rather than automatic mutation on validation failure? [Regression Safety, Spec FR-022, Spec FR-045]
- [ ] CHK018 Are Workflows/Orchestration UI requirements limited to diagnostics visibility rather than a visual workflow editor or runtime override surface? [Scope, Spec FR-047, Spec Out Of Scope]

## Dependency And Test Guarding

- [ ] CHK019 Is the YAML parser dependency direct, exact-pinned, and limited to syntax/loading responsibilities? [Dependency Policy, Spec FR-032, Research YAML Parser]
- [ ] CHK020 Does the plan reuse existing `ajv@8.18.0` instead of adding a second schema-validation stack? [Dependency Policy, Spec FR-007, Plan Technical Context]
- [ ] CHK021 Are dependency changes expected to update lockfile and package metadata without introducing unreviewed runtime packages? [Dependency Policy, Workflow Phase 4 Prompt]
- [ ] CHK022 Are tests required to cover dry-run no-mutation, apply transaction/rollback, last-known-good preservation, export parity, diagnostics persistence, and UI rendering? [Coverage, Workflow Phase 5 Required Coverage]
- [ ] CHK023 Are existing workflow-template tests protected from behavior changes caused by the new import/export code path? [Regression Safety, Quickstart Verify Implementation]
- [ ] CHK024 Are regression-safety requirements reusable beyond SPEC-009A and expressed as capability/contract behavior rather than spec-specific branching or hardcoded spec IDs? [Durability, User Governance Direction, Plan Scope]
