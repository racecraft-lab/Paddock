# Data Integrity Checklist: SPEC-013C

**Purpose**: Validate persistence, transaction, rollback, and audit consistency requirements before implementation.
**Created**: 2026-05-28
**Feature**: [spec.md](../spec.md)

## Persistence And Races

- [x] Plan and data model identify that M79 must widen the existing `task_stage_claims.release_reason` `CHECK` constraint for operator reasons.
- [x] M79 keeps `task_stage_claims` rows, foreign keys, indexes, and active-claim uniqueness during the data-preserving rebuild.
- [x] M79 adds scoped idempotency replay storage keyed by actor, workspace, task, stage, and hashed idempotency key.
- [x] Raw idempotency keys are prohibited from persistence and response bodies.
- [x] Request bodies are represented by canonical hashes for replay comparison.
- [x] Only successful responses are cached for idempotency replay.
- [x] Idempotency entries have a 24-hour TTL and supporting cleanup/query indexes.
- [x] Mutations are required to execute in one SQLite transaction with compare-and-set predicates.
- [x] `already_applied` requires proof that the same action already produced the target state.
- [x] Successful mutations and authenticated task-visible semantic rejections write exactly one bounded task-scoped activity.
- [x] Unauthenticated, forbidden, invisible, malformed, and rate-limited requests do not write claim-control task audit rows.
- [x] Rollback is flag-first and the M79 rollback refuses to contract release reasons while operator-reason rows exist.
- [x] UAT cleanup records before/after counts for all affected tables including idempotency and activities.

## Result

Pass. No open gap markers remain for data-integrity requirements.
