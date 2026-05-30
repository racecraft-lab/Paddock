# State Management Checklist: SPEC-013C

**Purpose**: Validate action, outcome, claim, attempt, and read-model state semantics before implementation.
**Created**: 2026-05-28
**Feature**: [spec.md](../spec.md)

## State Vocabulary

- [x] Release, cancel, and retry eligibility rules are separately defined.
- [x] Operator release reasons are closed to `operator_released`, `operator_cancelled`, and `operator_retry_requested`.
- [x] Closed mutation outcomes are defined for success, backoff-active, released, cancelled, already-applied, stale, conflict, ineligible, flag-off, unauthorized, and validation cases.
- [x] Release updates the active claim to released with `operator_released`.
- [x] Cancel updates an active claim to released with `operator_cancelled` when a claim exists.
- [x] Retry of an active claim releases it with `operator_retry_requested`.
- [x] Cancel appends or records attempt lifecycle state as cancelled without changing whole-task terminal state.
- [x] Release appends or records attempt lifecycle state as released without creating retry readiness.
- [x] Retry-eligible evidence includes failed, stuck, stale, deferred, cancelled, and dispatch-failure cases.
- [x] Terminal task and tracker states are explicitly non-retryable.
- [x] Prior cancel blocks are cleared only after a successful retry-ready transition.
- [x] Read-model `expected_state` echoes the predicates required for a future mutation.
- [x] Last operator action and sanitized error state are represented in the read model for SPEC-013D.

## Result

Pass. No open gap markers remain for state-management requirements.
