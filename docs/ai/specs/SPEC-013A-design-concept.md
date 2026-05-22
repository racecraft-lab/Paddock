---
topic: "SPEC-013A run-state persistence spine"
slug: "spec-013a-run-state-spine"
date: "2026-05-22"
mode: "setup"
spec_id: "SPEC-013A"
source_input:
  type: "topic"
  ref: "docs/ai/rc-factory-technical-roadmap.md Phase 11A - Run-state persistence spine"
question_count: 8
stop_reason: "natural"
---

# Design Concept: SPEC-013A Run-State Persistence Spine

> **Source:** docs/ai/rc-factory-technical-roadmap.md Phase 11A - Run-state persistence spine
> **Date:** 2026-05-22
> **Questions asked:** 8
> **Stop reason:** natural

## Goals

- Add the first durable run-state spine for task-stage attempts so later control-plane specs can reason about work attempts from repository truth instead of terminal history.
- Represent one append-only attempt per task-stage execution with enough identity to inspect, archive, and later attach to a concrete `runs` row.
- Provide a current-state projection over append-only attempt lifecycle history without enforcing claims or dispatch decisions in this spec.
- Keep `FEATURE_TASK_CONTROL_PLANE=false` harmless for existing runtime behavior while still allowing authenticated read-only inspection for operator UAT.
- Give `SPEC-013A1` and `SPEC-013B` a clear persistence substrate without pulling GitHub sync automation, claim authority, retry policy, scheduler launch, sandbox lifecycle, or harness adapters into `SPEC-013A`.

## Non-goals

- Reusing only existing `runs` / `AgentRun.metadata` as the durable model - rejected in Q1.
- Metadata-only modeling with no schema - rejected in Q1 because queryability and archive semantics would be too weak.
- Mutable current-stage rows as the primary model - rejected in Q2 because it risks smuggling claim authority into this spec.
- Enforceable claim or run-state transitions - rejected in Q3 and Q8; `SPEC-013B` owns enforcement.
- Hiding all run-state inspection when `FEATURE_TASK_CONTROL_PLANE=false` - rejected in Q4 because the UAT gate must prove the data is represented, inspectable, archived, and ignored safely.
- A full control-plane dashboard - rejected in Q5 as too broad before claim/reconciliation exists.
- Physical deletion, archive-table moves, or file export for archived attempts - rejected in Q6; archive is non-destructive in v1.
- Required `run_id` linkage - rejected in Q7 because attempts must exist before a harness run exists.
- Work selection, duplicate-launch prevention, GitHub/task terminal reconciliation, scheduler calls, retry policy, sandbox lifecycle, harness adapters, or auto-merge behavior - explicitly out of scope per Q8 and the roadmap strict scope.

## Design Tree (Q&A log)

### Q1. Should SPEC-013A default to reusing the existing `runs` / `AgentRun.metadata` spine before introducing any new run-state table?

**Branch:** Data model and schema ownership

**Recommended answer:** Reuse first. Use typed helpers and read-only debug output over existing run records, and add schema only if Clarify proves `runs` cannot represent task-stage attempt identity, archive state, and flag-off ignore behavior.
> This was grounded in the roadmap's instruction to reuse or extend `src/lib/runs.ts` and `AgentRun.metadata` where possible before adding schema. It would have minimized fork pressure.

**Alternatives offered:**
- New table from the start: clearer modeling at the cost of more fork pressure.
- Metadata only: avoids migration but weakens queryability and archival guarantees.

**User's answer:** B - create a dedicated additive task-stage-attempt table from the start.

---

### Q2. What should the new run-state table's primary identity represent?

**Branch:** Attempt identity

**Recommended answer:** One append-only attempt per task-stage execution. Key it around `task_id`, workflow/stage identity, `attempt_number`, and optional linked `run_id`, so SPEC-013A records observable attempts without enforcing exclusive ownership yet.
> Append-only attempt identity preserves auditability and leaves claim exclusivity for `SPEC-013B`.

**Alternatives offered:**
- One mutable row per current task-stage: easier current-state querying but risks claim/reconciliation drift.
- One row per harness process/run only: aligns with runtime execution but does not represent pre-launch task-stage state.

**User's answer:** A - one append-only attempt per task-stage execution.

---

### Q3. Should SPEC-013A define the attempt lifecycle as an observed state log, or as an enforceable state machine?

**Branch:** Lifecycle semantics

**Recommended answer:** Observed state log plus current-state projection. Record bounded lifecycle states like `created`, `running`, `succeeded`, `failed`, `released`, `cancelled`, and `archived`, but do not make those states block dispatch or enforce claims until `SPEC-013B`.
> This satisfies inspection and archive needs while keeping enforcement out of the current spec.

**Alternatives offered:**
- Enforceable state machine now: stronger guarantees but crosses into claim/reconciliation behavior.
- Event log only, no current-state projection: most append-only but weak for debug surfaces.

**User's answer:** A - observed state log with a current-state projection, not enforcement.

---

### Q4. What should `FEATURE_TASK_CONTROL_PLANE=false` do for SPEC-013A data?

**Branch:** Feature-flag behavior

**Recommended answer:** Ignore it at runtime but keep it visible in read-only debug surfaces. Legacy dispatch remains unchanged, while operators can inspect seeded or fixture attempts and verify the spine is harmless with the flag off.
> The roadmap definition of done requires attempt state to be represented, inspected, archived, and ignored safely with the flag off.

**Alternatives offered:**
- Hide all run-state surfaces when the flag is off: safer exposure, weaker UAT proof.
- Block writes but allow reads: useful later, but mixes modeling with runtime policy too early.

**User's answer:** A - flag off ignores runtime behavior but keeps read-only debug inspection available.

---

### Q5. Which read-only debug surface should setup steer SPEC-013A toward?

**Branch:** Operator inspection surface

**Recommended answer:** Minimal authenticated API plus compact existing task-detail/debug panel section. This proves inspectability without creating a new global control-plane dashboard.
> The existing task evidence route and task detail panel give a nearby pattern from `SPEC-009E`; a global dashboard should wait until claim/reconciliation creates live operational state.

**Alternatives offered:**
- API only: smaller implementation but weaker operator validation.
- Full control-plane dashboard: useful later but too broad for this slice.

**User's answer:** A - minimal authenticated API plus compact existing task-detail/debug panel section.

---

### Q6. How should archived attempt state work in this first spec?

**Branch:** Archival and retention

**Recommended answer:** Use a non-destructive archived terminal state or timestamp on attempts, with no physical deletion or partitioning. It satisfies "archived" while preserving audit evidence and keeping cleanup/storage policy for later specs.
> This follows the constitution's auditability and additive migration bias.

**Alternatives offered:**
- Move archived attempts to an archive table: cleaner active queries, more schema complexity.
- Export archive files and delete DB rows: weakens auditability and recovery.

**User's answer:** A - archived attempts stay in the database with a non-destructive archived terminal state/timestamp.

---

### Q7. How should the new attempt table relate to existing `runs` / `AgentRun` rows?

**Branch:** Existing run-spine relationship

**Recommended answer:** Optional `run_id` link to `runs.id`. Attempts can exist before a harness run exists, and later specs can attach a concrete run when execution starts.
> This preserves the roadmap's instruction to reuse the existing run spine while allowing attempt records to represent pre-run states.

**Alternatives offered:**
- Required `run_id`: cleaner relational model but blocks planned/created attempts.
- Duplicate relevant run fields into the attempt table: simpler reads but creates drift against `src/lib/runs.ts`.

**User's answer:** A - optional `run_id` link to `runs.id`.

**Post-Clarify/Plan resolution:** The setup answer records the intended optional runtime-run relationship, not a database foreign-key requirement. Later SPEC-013A Clarify and Plan refined this to `task_stage_attempts.run_id` as a nullable `TEXT` soft reference with app-level lookup, no database foreign key to `runs.id`, and no duplicated runtime-run execution fields. See `specs/013a-run-state-spine/spec.md` FR-005, `specs/013a-run-state-spine/research.md` "Optional Runtime Run Link", `specs/013a-run-state-spine/data-model.md`, and `specs/013a-run-state-spine/plan.md` Implementation Boundaries.

---

### Q8. What should be the strict boundary between SPEC-013A and SPEC-013B?

**Branch:** Cross-spec boundary

**Recommended answer:** SPEC-013A may create, update, inspect, and archive attempt records through test fixtures or explicit debug APIs only; it must not select work, claim work, prevent duplicate launch, reconcile GitHub/task terminal state, or call the scheduler.
> This keeps SPEC-013A as the persistence spine and leaves actual claim/reconciliation authority to SPEC-013B.

**Alternatives offered:**
- Add a soft claim token but do not enforce it: gives SPEC-013B a head start, but ownership becomes ambiguous.
- Enforce one active attempt per task-stage: useful later, but effectively starts claim authority now.

**User's answer:** A - model/debug only, with no work selection, claim enforcement, duplicate-launch prevention, scheduler call, or GitHub reconciliation.

## Setup-Time Open Questions - Resolved After Clarify/Plan

These questions were intentionally deferred at setup time and are no longer active after SPEC-013A Clarify, Plan, Checklist, and Tasks.

- **Schema names, migration number, indexes, and rollback SQL:** Resolved as two additive tables, `task_stage_attempts` and `task_stage_attempt_events`, in migration `076_task_stage_attempts`, with idempotent rollback SQL at `docs/migrations/rollback-M76.sql`. Uniqueness is limited to `(workspace_id, task_id, stage_key, attempt_number)` with non-unique inspection indexes and no one-active-attempt or claim-authority constraint.
- **Lifecycle enum and projection shape:** Resolved as append-only observed lifecycle events plus current projection columns. The lifecycle vocabulary is exactly `created`, `running`, `succeeded`, `failed`, `released`, `cancelled`, and `archived`; valid projection drift is warning-only read evidence with no hidden repair or control-plane side effect.
- **API route and UI placement:** Resolved as dedicated read-only `GET /api/tasks/[id]/stage-attempts` returning the `task_stage_attempts.v1` envelope, plus a compact read-only `Run state` / `Stage attempts` section in the existing task detail surface near Evidence. Existing task Evidence routes remain table-blind.
- **Write boundary:** Resolved by Plan as no runtime fixture/UAT write endpoint for SPEC-013A. Representative rows are created through tests or deterministic disposable UAT seed setup only; no claim, dispatch, scheduler, retry, GitHub reconciliation, sandbox, harness, or auto-merge behavior is introduced.

## Recommended Next Step

Run setup completion and then execute:

```bash
$speckit-autopilot docs/ai/specs/SPEC-013A-workflow.md
```
