# Scheduler Runtime Checklist: SPEC-013C

**Purpose**: Validate that retry, release, and cancel requirements protect scheduler/runtime behavior before implementation.
**Created**: 2026-05-28
**Feature**: [spec.md](../spec.md)

## Runtime Safety

- [x] Retry acceptance is specified as readiness for a later scheduler attempt, not a synchronous launch.
- [x] Release clears active ownership without making the stage immediately retry-eligible.
- [x] Cancel blocks automatic pickup until a later explicit retry action succeeds.
- [x] Cancel is prohibited from moving the whole task to a terminal done or failed state.
- [x] Terminal task, GitHub issue, and GitHub PR states are defined as non-retryable.
- [x] Retry with active backoff respects the backoff unless a bounded override reason is supplied.
- [x] Retry backoff override records actor and reason and does not bypass governance eligibility.
- [x] Mutation requirements forbid direct successor selection, `advanceTaskChain`, `createTask`, and immediate task insertion.
- [x] Read-model requirements forbid scheduler, dispatch, GitHub sync, and claim mutation side effects.
- [x] Stale-state and conflict outcomes are specified for scheduler/operator races.
- [x] Feature-flag-off behavior is specified as unavailable without mutation.
- [x] UAT fixtures include stale/conflict, backoff-respected, backoff-override, flag-off, and read-model reflection cases.

## Result

Pass. No open gap markers remain for scheduler-runtime requirements.
