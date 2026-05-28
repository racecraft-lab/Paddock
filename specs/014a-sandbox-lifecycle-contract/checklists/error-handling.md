# Error Handling Checklist: SPEC-014A

**Purpose**: Validate rollback, cleanup failure, disabled mutation, fake-owner, and validation error behavior.
**Created**: 2026-05-28
**Sources**: `spec.md`, `plan.md`, `data-model.md`, `quickstart.md`

## Lifecycle Failures

- [x] CHK001 Partial create/prepare failure triggers best-effort compensating cleanup.
- [x] CHK002 Successful compensating cleanup records `rolled_back` with append-only event evidence.
- [x] CHK003 Cleanup failure records `cleanup_failed` with safe reason metadata and leaves the lifecycle inspectable.
- [x] CHK004 `cleanup_pending` interruption remains inspectable and is not auto-reaped in SPEC-014A.
- [x] CHK005 Terminal duplicate create attempts require a new deterministic attempt key rather than mutating terminal lifecycle evidence.

## Disabled And Validation Failures

- [x] CHK006 Flag-off mutation attempts return disabled evidence before creating rows/events or fake artifacts.
- [x] CHK007 Unsafe key/path validation failures fail closed with field-level reason codes and no lifecycle mutation.
- [x] CHK008 Conflicting duplicate create evidence fails closed without modifying existing rows/events.

## Fake Owner Boundaries

- [x] CHK009 Fake owners fail closed on unsupported owner, unsafe path, missing linkage, or bounded-root errors without switching harnesses.
- [x] CHK010 Failure evidence is actionable for operators and reviewers but does not leak host-sensitive paths, secrets, prompts, tokens, provider payloads, or raw session data.

## Outcome

No error-handling gaps found.
