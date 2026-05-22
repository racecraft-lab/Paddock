# Research: SPEC-013A Run-State Persistence Spine

## Dedicated Attempt Tables

**Decision**: Add `task_stage_attempts` and `task_stage_attempt_events` in migration `076_task_stage_attempts`.

**Rationale**: Existing `runs` rows describe runtime execution after a run exists. SPEC-013A needs durable task-stage identity before a runtime run, queryable archive state, one attempt number per task-stage execution, and lifecycle history that remains inspectable when `FEATURE_TASK_CONTROL_PLANE=false`. Storing this only in `AgentRun.metadata` would make archive/query semantics weak and would couple future task-stage control-plane state to runtime-run retention.

**Alternatives considered**:
- Reuse `runs` only: rejected because attempts can exist before a run and archive state should survive missing/unavailable runs.
- Metadata-only model: rejected because task/stage/attempt lookup, uniqueness, and rollback/audit evidence would be fragile.
- One mutable current-stage row: rejected because it implies current ownership/claim semantics that belong to SPEC-013B.

## Lifecycle Projection

**Decision**: Store append-only observed lifecycle entries and duplicate the current projection on `task_stage_attempts`.

**Rationale**: The event table preserves reviewable history; projection columns keep the read route simple and bounded. Projection updates are passive observations only and do not enforce state transitions.

**Alternatives considered**:
- Event log only: rejected because task detail would need heavier reconstruction for every read.
- Enforceable state machine: rejected because claim/reconciliation authority is out of scope.

## Projection Drift Handling

**Decision**: Treat valid-but-stale projection drift as warning-only read evidence. Writes append the lifecycle event and update the stored projection in one transaction; reads derive an expected projection from valid lifecycle history, return stored projection fields, and emit `projection_drift` warnings when stored values disagree.

**Rationale**: The lifecycle event history is the audit source for reconstructing expected state, while stored projection columns are a bounded read model for task-detail inspection. Warning-only drift handling keeps the read route honest without turning SPEC-013A into a repair engine or later control-plane authority.

**Alternatives considered**:
- Trust projection columns only: rejected because stale-but-valid projections would hide state drift from reviewer evidence.
- Rebuild and return derived state only: rejected because it would mask stored projection drift and weaken UAT/debug evidence.
- Repair drift during reads: rejected because hidden mutation belongs outside a read-only inspection route and could create control-plane side effects.

## Status Vocabulary

**Decision**: Use exactly `created`, `running`, `succeeded`, `failed`, `released`, `cancelled`, and `archived`.

**Rationale**: This matches clarified scope and avoids smuggling claim, retry, timeout, blocked, or scheduler vocabulary into this slice. Unknown states fail closed on writes and render safely on reads.

**Alternatives considered**:
- Add claim/retry/timeout states now: rejected as SPEC-013B/C scope.
- Free-form states: rejected because fail-closed validation and UI badges need a bounded enum.

## Optional Runtime Run Link

**Decision**: Store nullable `run_id TEXT` without a database foreign key and resolve compact run summaries at read time.

**Rationale**: A soft link keeps attempts inspectable if a run is absent, deleted by existing retention behavior, unavailable, or not yet created. `runs` remains the source for runtime details such as status, started/ended timestamps, agent name, runtime, git branch/commit, and error state.

**Alternatives considered**:
- Required `run_id`: rejected because created attempts can precede runtime execution.
- Foreign key to `runs.id`: rejected because rollback/retention behavior should not block attempt inspection.
- Copy run details into attempts: rejected because it creates drift against `src/lib/runs.ts`.

## Read Route Shape

**Decision**: Add dedicated `GET /api/tasks/[id]/stage-attempts` returning `task_stage_attempts.v1`.

**Rationale**: The existing task evidence route remains table-blind by requirement. A dedicated route can reuse existing auth/workspace masking patterns while keeping the evidence envelope unchanged.

**Alternatives considered**:
- Extend `GET /api/tasks/[id]/evidence`: rejected because SPEC-013A requires table-blind existing evidence behavior.
- Global dashboard route: rejected as too broad before claim/reconciliation exists.

## Fixture And UAT Writes

**Decision**: Do not add a runtime fixture/UAT write endpoint in SPEC-013A.

**Rationale**: Test and UAT fixtures can create representative attempt rows in disposable data directories through helper-level or SQL seed setup. Avoiding a route removes CSRF, mutation rate-limit, and production reachability risk while satisfying the read-focused operator inspection goal.

**Alternatives considered**:
- `POST /api/admin/spec-013a/attempt-fixtures`: allowed by the spec, but rejected for this plan because it expands auth/rate-limit/audit scope without being required for inspection.
- Production debug writes: rejected because they risk becoming accidental control-plane authority.

## Feature Flag Behavior

**Decision**: Add `FEATURE_TASK_CONTROL_PLANE` to the typed registry with default `false`; all checks use `resolveFlag`.

**Rationale**: This satisfies the constitution and lets later specs opt in safely. SPEC-013A read inspection remains available while runtime paths ignore attempt rows with the flag off.

**Alternatives considered**:
- Inline env read: rejected by Constitution Principle V and guardrail requirements.
- Hide reads when flag is off: rejected because UAT must prove the data is inspectable and ignored safely.

## Static Guardrails

**Decision**: Add a SPEC-013A guard script that forbids attempt-table imports/strings in runtime/evidence/packet paths and forbids inline `FEATURE_TASK_CONTROL_PLANE` env reads outside the registry.

**Rationale**: The riskiest regression is accidental coupling of the new tables to dispatch, scheduler, task-chain, GitHub sync, runtime runs, pilot review packets, or existing evidence. Static checks make the boundary reviewable and repeatable.

**Alternatives considered**:
- Manual review only: rejected because the boundary is central to flag-off safety.
- Broad grep over all source: rejected because migrations, rollback SQL, helper, route, fixtures, and tests intentionally reference the tables.
