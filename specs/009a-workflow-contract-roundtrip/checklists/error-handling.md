# Error Handling Checklist: SPEC-009A Workflow Contract Format and Roundtrip

**Purpose**: Validate that SPEC-009A requirements define deterministic, fail-closed, and actionable error behavior for workflow contract import, export, diagnostics, and recovery.
**Created**: 2026-05-06
**Feature**: [spec.md](../spec.md)

**Note**: This checklist is generated from the Phase 4 `error-handling` prompt in `docs/ai/specs/SPEC-009A-workflow.md`.

## Fail-Closed Validation

- [ ] CHK001 Are invalid YAML syntax failures required to stop before any canonical model construction or runtime mutation? [Completeness, Spec FR-003, Spec FR-028]
- [ ] CHK002 Are invalid model fixture failures required to stop after typed canonical validation and before `workflow_templates` mutation? [Completeness, Spec FR-009, Spec FR-016]
- [ ] CHK003 Are parser, loader, canonicalization, schema validation, diff, storage, export, and recovery failure stages distinguishable in diagnostics? [Clarity, Spec FR-027, Contracts Diagnostics API]
- [ ] CHK004 Can fail-closed behavior be measured for both dry-run and apply paths without relying on operator interpretation? [Measurability, Spec SC-001, Spec SC-005]

## Actionable Diagnostics

- [ ] CHK005 Do unknown template variable failures include stable codes, paths, allowed namespace hints, and no mutation status? [Completeness, Spec FR-010, Spec FR-050]
- [ ] CHK006 Do invalid GitHub tracker identity failures identify the offending tracker field without invoking any GitHub sync behavior? [Scope, Spec FR-011, Spec FR-030]
- [ ] CHK007 Do invalid capability and adapter requirement failures include enough context for operators to repair the contract while remaining validation-only? [Clarity, Spec FR-012, Spec FR-035]
- [ ] CHK008 Do invalid governance, concurrency, retry, sandbox, prompt-version, routing-hash, and output-schema-hash failures have explicit diagnostic coverage? [Completeness, Spec FR-013, Spec FR-014, Spec FR-015]
- [ ] CHK009 Do hash mismatch diagnostics separate canonical object hash, routing-rule hash, and output-schema hash mismatches? [Clarity, Spec FR-041, Spec FR-042]
- [ ] CHK010 Are diagnostics details required to be redacted and truncated when they may contain prompt bodies, runtime data, or secret-like values? [Non-Functional, Spec FR-052]

## Deterministic CLI Outcomes

- [ ] CHK011 Are dry-run success, validation failure, storage failure, filesystem failure, usage/config failure, and unexpected failure mapped to deterministic exit codes? [Consistency, Contracts CLI Exit Codes]
- [ ] CHK012 Are apply-mode messages required to report validation status, diff summary, mutation status, diagnostics run ID, and last-known-good snapshot status? [Completeness, Spec FR-024, Spec FR-046]
- [ ] CHK013 Are export-mode failures required to distinguish read, canonicalization, hash, and write failures? [Clarity, Spec FR-025, Spec FR-026]
- [ ] CHK014 Are recovery-mode messages deterministic for no snapshot, dry-run diff, explicit apply, success, and rollback failure states? [Completeness, Spec FR-022, Spec FR-045]
- [ ] CHK015 Are operator-facing errors required to be stable enough for tests to assert codes and structured fields without matching prose exactly? [Testability, Contracts CLI Error Output]
- [ ] CHK016 Do CLI contracts avoid adding hidden mutation paths, implicit apply defaults, or interactive prompts that could change behavior between environments? [Regression Safety, Spec FR-038, Spec FR-039]

## Last-Known-Good Preservation

- [ ] CHK017 Are failed reload/import requirements explicit that the previous last-known-good runtime templates remain usable after validation failure? [Completeness, Spec FR-021, Spec FR-023]
- [ ] CHK018 Are failed apply requirements explicit that transaction rollback preserves previous runtime templates, diagnostics consistency, and snapshot state? [Consistency, Spec FR-019, Spec FR-039]
- [ ] CHK019 Are absent last-known-good recovery attempts required to fail with diagnostics instead of synthesizing or mutating runtime templates? [Clarity, Spec FR-022, Spec SC-006]
- [ ] CHK020 Can tests prove last-known-good preservation after invalid YAML, invalid model, storage failure, and hash mismatch cases? [Scenario Coverage, Quickstart Recover Last Known Good]

## Artifact Consistency

- [ ] CHK021 Do spec, plan, data model, CLI contract, diagnostics API contract, and quickstart agree that validation failures occur before mutation? [Consistency, Spec FR-016, Contracts Import]
- [ ] CHK022 Do quickstart and tasks coverage require fixtures for invalid YAML, unknown variables, invalid tracker identity, invalid capabilities, invalid governance, and hash mismatch? [Coverage, Workflow Phase 5 Required Coverage]
- [ ] CHK023 Are diagnostics persistence requirements sufficient to inspect historical failure runs and reruns without relying on transient terminal output? [Durability, Spec FR-046, Spec FR-047, Data Model Workflow Contract Run]
- [ ] CHK024 Are error-handling requirements bounded to SPEC-009A contract validation and roundtrip behavior without implementing SPEC-009B/C/D, SPEC-013A-C, or SPEC-014A-D runtime loops? [Scope, Spec FR-030, Plan Scope]
