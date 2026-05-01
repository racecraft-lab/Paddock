# Contract: Task Chain Advancement And Retry

## Advancement Trigger

Chain advancement runs only when all conditions are true:

- `FEATURE_TASK_PIPELINES` is enabled through `resolveFlag()`.
- The task transitions from a non-`done` status to `done`.
- The task is bound to a workflow template.
- The bound workflow template has advancement-driving metadata: `output_schema`, non-empty `routing_rules`, or `next_template_slug`.

No advancement runs when the flag is off, the task is unbound, or the template has only non-driving metadata such as `slug`, `produces_pr`, `external_terminal_event`, or `allow_redacted_artifacts`.

Live terminal-success callsites:

- `src/lib/task-dispatch.ts`
- `src/app/api/quality-review/route.ts`
- `src/app/api/tasks/route.ts`
- `src/app/api/tasks/[id]/route.ts`
- Detail retry action in `src/app/api/tasks/[id]/route.ts`

`src/lib/scheduler.ts` is inspected or changed only if implementation evidence proves it is part of a live terminal-success completion path.

## Advancement Outcomes

```ts
type ChainAdvancementOutcome =
  | { status: "not_eligible" }
  | { status: "validation_failed"; reason_code: "task_pipeline_output_missing" | "task_pipeline_output_invalid" }
  | {
      status: "stalled";
      reason_code:
        | "task_pipeline_routing_expression_rejected"
        | "task_pipeline_routing_budget_exceeded"
        | "task_pipeline_target_missing"
        | "task_pipeline_target_duplicate"
        | "task_pipeline_target_cross_workspace"
        | "task_pipeline_successor_assignee_missing"
        | "task_pipeline_target_disabled";
    }
  | { status: "successor_created"; successor_task_id: number }
  | { status: "successor_already_exists"; successor_task_id: number }
  | { status: "chain_terminated" };
```

Rules:

- Missing output under a schema fails the parent and records `task_pipeline_output_missing`.
- Invalid output under a schema fails the parent and records `task_pipeline_output_invalid`.
- Routing expression rejection records `task_pipeline_routing_expression_rejected` and preserves terminal success.
- Routing budget overrun records `task_pipeline_routing_budget_exceeded` and preserves terminal success.
- Missing target records `task_pipeline_target_missing` and preserves terminal success.
- Duplicate target records `task_pipeline_target_duplicate` and preserves terminal success.
- Cross-workspace target records `task_pipeline_target_cross_workspace` and preserves terminal success.
- Missing successor assignee records `task_pipeline_successor_assignee_missing` and preserves terminal success.
- `task_pipeline_target_disabled` is reserved and emitted only if a live workflow-template enabled/disabled/status state exists; SPEC-004 does not add that state.
- No matching rule and no static `next_template_slug` terminates normally with no successor.
- Existing successor returns an idempotent existing-successor outcome.

## Assignee Resolution Contract

Successor assignee resolution uses the live project-assignment schema:

```sql
SELECT a.name
FROM project_agent_assignments paa
JOIN agents a ON a.name = paa.agent_name
WHERE paa.project_id = :parent_project_id
  AND paa.role = :target_workflow_template_agent_role
LIMIT 1
```

The contract depends on `project_agent_assignments.agent_name` and the target workflow template's `agent_role`. It MUST NOT assume, require, or invent `project_agent_assignments.agent_id` or workflow-template `agent_id` fields.

## Transaction Boundary

One transactional advancement operation covers:

- Parent lineage initialization.
- Validation failure state and activity writes.
- Stall activity writes.
- Duplicate-successor guard checks.
- Successor insert through `createTask()`.

Outbound GitHub and gateway pushes queued by successor creation execute only after the transaction commits successfully. Outbound failures use existing sync/error activity behavior and do not roll back the chain transaction.

## Retry Request

Endpoint shape remains within the task detail route implementation:

```ts
type RetryChainAdvancementRequest = {
  action: "retry_chain_advancement";
  confirm_template_drift?: boolean;
};
```

The request must not accept or honor an `activity_id` override.

## Retry Conflict Response

```ts
type RetryConflictResponse = {
  error: "retry_conflict";
  retry_rejection_reason:
    | "retry_not_eligible"
    | "retry_template_provenance_missing"
    | "retry_template_drift_unconfirmed";
};
```

Conflict responses are HTTP 409, write no activity, increment no retry attempt, and do not mutate task state or successors.

## Retry Success Response

Retry success returns normal task detail data plus bounded chain-retry summary:

```ts
type ChainRetrySummary = {
  recovery_class: "output_validation_failure" | "advancement_stall";
  recovery_outcome:
    | "output_still_invalid"
    | "stall_persisted"
    | "successor_created"
    | "successor_already_exists"
      | "chain_terminated";
  retry_attempt: number;
  previous_reason_code: string;
  successor_task_id: number | null;
  chain_terminated: boolean;
  idempotent_successor: boolean;
};
```

`successor_already_exists` responses include the existing successor id, `chain_terminated=false`, and `idempotent_successor=true`. `chain_terminated` responses use `successor_task_id=null`, `chain_terminated=true`, and `idempotent_successor=false`. The response must exclude full corrected output, full parsed output, and routing traces.

## Provenance

Retry activities compare failure-time and current hashes:

- `output_schema`: SHA-256 over canonical JSON.
- `routing_rules`: SHA-256 over canonical JSON.
- `next_template_slug`: SHA-256 over normalized string-or-null representation, distinguishing null from empty string.

Missing provenance fails closed with `retry_template_provenance_missing`.
Unconfirmed drift fails closed with `retry_template_drift_unconfirmed`.
