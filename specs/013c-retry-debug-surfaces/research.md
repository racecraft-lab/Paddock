# Research: SPEC-013C - Retry/Backoff and Debug API Surfaces

## Decision: Use `POST /api/tasks/[id]/claim-control`

**Rationale**: The design concept selected a single action endpoint, and the existing read route `GET /api/tasks/[id]/claim-reconciliation` must stay read-only. A separate mutation route keeps auth, rate limiting, idempotency, validation, and audit in one place without mixing writes into the read model.

**Alternatives considered**:

- Separate `retry`, `release`, and `cancel` endpoints. Rejected because they duplicate validation/CAS/idempotency and risk divergent semantics.
- Extend the read route with `POST`. Rejected because SPEC-013B explicitly established the reconciliation route as read-only evidence.
- UI or CLI action surface. Rejected because SPEC-013D owns UI and SPEC-013C forbids CLI/MCP action surfaces.

## Decision: Add scoped claim-control idempotency storage

**Rationale**: Existing `activities` rows are audit truth but cannot return a stable successful HTTP response without rerunning side effects. Existing `governance_idempotency_keys` stores actor/key replay data for governance routes, but it is keyed only by actor/key, stores the raw idempotency key, and is named/owned by SPEC-008 governance. SPEC-013C needs a route/task/stage-scoped cache that stores hashes, successful response bodies, status, selected headers, and expiry.

**Alternatives considered**:

- Activities only. Rejected because same-key replay would need to reconstruct response bodies and could duplicate audit under races.
- Reuse `governance_idempotency_keys` directly. Rejected because actor/key-only scope can collide with unrelated routes and the table persists raw keys.
- Add a full operator-action ledger. Rejected as broader than needed; state truth remains in claims, attempts, and activities.

## Decision: Widen `task_stage_claims.release_reason` in M79

**Rationale**: SPEC-013B created `task_stage_claims.release_reason` with a SQLite `CHECK` constraint. SPEC-013C requires the claim history itself to preserve `operator_released`, `operator_cancelled`, and `operator_retry_requested`; storing those reasons only in task activities would leave claim history, read-model evidence, and operator audit semantics inconsistent. SQLite cannot alter a `CHECK` constraint in place, so M79 must perform a data-preserving table rebuild that keeps existing rows, indexes, foreign keys, and active-claim uniqueness while adding the three operator values.

**Alternatives considered**:

- Store operator reasons only in `activities`. Rejected because claim history would show a generic release reason while the audit row shows the operator reason.
- Reuse an existing SPEC-013B release reason for operator actions. Rejected because it loses the semantic distinction between scheduler/runtime outcomes and explicit operator control.
- Drop the `CHECK` constraint. Rejected because SPEC-013B intentionally models closed release reasons and tests should continue enforcing that invariant.

## Decision: Use transactional compare-and-set around existing claim and attempt evidence

**Rationale**: SPEC-013B already uses active claim uniqueness and `releaseTaskStageClaim` compare-and-set predicates over claim id, workspace, task, stage, run id, and active state. SPEC-013C should keep the same race boundary and add expected-state checks for retry-eligible non-active evidence.

**Alternatives considered**:

- Best-effort update based on current action only. Rejected because stale clients and scheduler ticks could both succeed.
- Scheduler-owned retry state. Rejected because SPEC-013C is an operator API/debug slice and must not absorb scheduler execution behavior.

## Decision: Store bounded task activities for audit, not raw diagnostics

**Rationale**: Existing claim and GitHub sync lifecycle code already uses positive allowlists and secret scanning before persistence. SPEC-013C has stricter user-facing audit requirements because mutation requests may include operator reasons and client metadata.

**Alternatives considered**:

- Persist request body snapshots. Rejected because raw request bodies could include tokens, prompts, transcripts, GitHub bodies, auth headers, or provider payloads.
- Minimal event without state/backoff/idempotency fields. Rejected because repeated-click, stale-state, and override decisions would be hard to reconstruct.

## Decision: Extend `task_claim_reconciliation.v1` backward-compatibly

**Rationale**: The existing read route is already task-scoped, viewer-authorized, side-effect-free, and used by SPEC-013B for claim evidence. Optional `claim_control` fields give SPEC-013D one backend source for eligibility, expected-state predicates, backoff, last operator action, and sanitized error state.

**Alternatives considered**:

- New debug read endpoint. Rejected because it creates a second source of truth.
- Mutation responses only. Rejected because SPEC-013D must render eligibility before action.
- Top-level breaking schema version. Rejected because optional fields preserve existing consumers.

## Decision: Keep UAT API-and-audit only

**Rationale**: The user explicitly split UI to SPEC-013D. Post-merge target UAT should exercise authenticated API calls, read-model evidence, audit payload safety, idempotency replay, stale/conflict behavior, flag-off rollback, and cleanup. Manual DB inspection supports row references and cleanup counts but is not the primary acceptance path.

**Alternatives considered**:

- Require task-detail UI UAT. Rejected because that belongs to SPEC-013D.
- Use only local unit fixtures. Rejected because acceptance requires target deployment proof after merge.
- Require manual DB inspection as primary proof. Rejected because operator API usability should be proven through the backend contract.
