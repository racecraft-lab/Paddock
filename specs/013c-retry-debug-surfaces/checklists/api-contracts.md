# API Contracts Checklist: SPEC-013C

**Purpose**: Validate request, response, idempotency, authorization, and read-model contract completeness before implementation.
**Created**: 2026-05-28
**Feature**: [spec.md](../spec.md)

## Mutation Contract

- [x] The mutation endpoint is a single `POST /api/tasks/[id]/claim-control` route.
- [x] The request requires `Idempotency-Key`, `action`, `stage_key`, and explicit expected-state predicates.
- [x] The allowed action vocabulary is closed to `retry`, `release`, and `cancel`.
- [x] Active-claim actions require matching claim id and claim run id predicates.
- [x] Non-active retry requires attempt evidence predicates.
- [x] Backoff override requires an explicit bounded override reason.
- [x] The success response envelope is named `task_claim_control.v1`.
- [x] The success response includes task, action, outcome, claim, attempt, backoff, available actions, audit, idempotency, correlation, and diagnostics sections.
- [x] Same-key same-body replay returns the original successful response without rerunning side effects.
- [x] Same-key different-body replay returns `idempotency_key_body_mismatch`.
- [x] Closed HTTP mapping covers success, replay, validation, unauthorized, flag-off, invisible target, stale state, conflict, rate limit, and sanitized unexpected failure cases.

## Read Contract

- [x] The existing `task_claim_reconciliation.v1` schema remains backward-compatible.
- [x] The optional `claim_control` read-model extension includes authorization, available actions, retry eligibility, backoff, expected state, last operator action, and sanitized error sections.
- [x] SPEC-013D is required to use the read model rather than recomputing eligibility client-side.

## Result

Pass. No open gap markers remain for API contract requirements.
