# API Contracts Checklist: SPEC-014A

**Purpose**: Validate `sandbox_lifecycle.v1` read-model shape, authorization, parity documentation, and read side-effect guarantees.
**Created**: 2026-05-28
**Sources**: `spec.md`, `plan.md`, `contracts/sandbox-lifecycle-api.md`

## Route And Schema

- [x] CHK001 The planned read route is task-scoped: `GET /api/tasks/{id}/sandbox-lifecycles`.
- [x] CHK002 Lifecycle-specific filtering remains nested under task/workspace authorization; no global unscoped lifecycle route is allowed.
- [x] CHK003 Response schema version is `sandbox_lifecycle.v1`.
- [x] CHK004 Response includes feature flag evidence, task/workspace identity, lifecycle owner/status/key, bounded path evidence, linkage ids, recent events, and diagnostics.
- [x] CHK005 Response excludes absolute host paths, raw path fragments, prompts, tokens, auth headers, provider payloads, and raw session data.

## Authorization And Errors

- [x] CHK006 Route requires viewer auth and uses existing workspace-scope helpers before lifecycle lookup.
- [x] CHK007 Nonexistent, unauthorized, invalid-scope, and cross-workspace lifecycle reads have explicit expected behavior.
- [x] CHK008 Feature flag OFF still allows reads and reports disabled-state evidence.

## Parity And Side Effects

- [x] CHK009 API index and OpenAPI parity are required for the route.
- [x] CHK010 Route tests must prove GET does not mutate lifecycle/event, task, attempt, claim, or activity rows.

## Outcome

No API contract gaps found.
