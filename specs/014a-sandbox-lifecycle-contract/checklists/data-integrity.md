# Data Integrity Checklist: SPEC-014A

**Purpose**: Validate lifecycle persistence, indexes, rollback, idempotency, and audit retention before tasks are generated.
**Created**: 2026-05-28
**Sources**: `spec.md`, `plan.md`, `data-model.md`

## Schema And Migration

- [x] CHK001 M80 migration id is grounded in live `src/lib/migrations.ts` evidence showing M79 `079_task_claim_control` is the latest migration.
- [x] CHK002 `agent_sandbox_lifecycles` current-state columns are specified with required linkage, owner, key, root, relative path, status, timestamps, and safe metadata fields.
- [x] CHK003 `agent_sandbox_lifecycle_events` append-only columns are specified with lifecycle id, denormalized scope fields, event type, status, reason code, observed time, actor fields, and safe metadata.
- [x] CHK004 Required uniqueness and lookup indexes are specified for sandbox keys, task/status reads, optional attempt/claim lookup, and event ordering.
- [x] CHK005 Rollback SQL is required and ordered to drop event indexes/tables before lifecycle indexes/tables and remove `080_agent_sandbox_lifecycles`.

## Lifecycle Integrity

- [x] CHK006 Duplicate create with matching nonterminal evidence is idempotent and appends `create_reused`.
- [x] CHK007 Duplicate create with conflicting owner, root, or path evidence fails closed without mutating the existing lifecycle.
- [x] CHK008 Cleanup, rollback, and cleanup failure preserve durable lifecycle/event rows after fake artifact removal attempts.
- [x] CHK009 Stale `cleanup_pending` rows remain inspectable and no auto-reaper is planned in SPEC-014A.
- [x] CHK010 Optional attempt and claim links are evidence-only and cannot become active locks.
- [x] CHK011 Flag-off mutation attempts insert zero lifecycle rows and zero event rows.
- [x] CHK012 Read-route tests must snapshot row counts before and after GET to prove side-effect-free reads.

## Outcome

No data-integrity gaps found.
