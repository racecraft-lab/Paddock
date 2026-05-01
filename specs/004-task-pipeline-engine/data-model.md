# Data Model: Task Pipeline Engine and Declarative Routing

## Workflow Template

Product Line/workspace-scoped operator-managed workflow definition and live source for task-chain templates.

Fields used by SPEC-004:

- `id`: stable database identity.
- `workspace_id`: Product Line/workspace scope.
- `slug`: operator-visible unique slug within scope.
- `agent_role`: role used to resolve the successor assignee through project assignments.
- `output_schema`: nullable JSON Schema profile accepted by `output-schema-validator`.
- `routing_rules`: ordered nullable/empty array of routing rules.
- `next_template_slug`: nullable static fallback target slug.
- `produces_pr`: downstream metadata snapshot only in SPEC-004.
- `external_terminal_event`: downstream metadata snapshot only in SPEC-004.
- `allow_redacted_artifacts`: downstream metadata snapshot only in SPEC-004.

Validation rules:

- Create/update validates and persists all chain fields.
- Non-empty `routing_rules` require `output_schema`.
- `next_template_slug` is valid without `output_schema`.
- Writes/deletes require operator authorization and a concrete single Product Line/workspace scope.
- Facility aggregate scope and unauthorized workspace ids are rejected.
- Query-parameter delete remains supported.
- SPEC-004 does not add a workflow-template disabled/status state.

Relationships:

- Referenced by tasks through `workflow_template_id`.
- Referenced by routing/static targets through `slug` within the same workspace scope.
- Used to resolve successor assignee by matching the target template `agent_role` to `project_agent_assignments.role` for the parent project, then joining `project_agent_assignments.agent_name` to `agents.name`.

## Task

Unit of operator or agent work that may be bound to a workflow template and may participate in a task chain.

Fields used by SPEC-004:

- `id`: task identity.
- `workspace_id`: inherited and scoped workspace.
- `project_id`: inherited successor project.
- `status`: terminal success represented by transition to `done`.
- `resolution`: temporary structured-output bridge for SPEC-004.
- `workflow_template_id`: canonical binding to the parent template.
- `workflow_template_slug`: denormalized template snapshot.
- `parent_task_id`: parent task for successor lineage.
- `root_task_id`: root task for the chain.
- `chain_id`: stable chain identity.
- `chain_stage`: numeric stage in the chain.
- PR-producing and downstream metadata snapshots as provided by SPEC-001 fields.

Validation and state rules:

- Feature flag OFF never advances chains.
- Feature flag ON preserves legacy behavior when a task is unbound or bound to a template with no advancement-driving metadata.
- Advancement-driving metadata is `output_schema`, non-empty `routing_rules`, or `next_template_slug`.
- `slug`, `produces_pr`, `external_terminal_event`, and `allow_redacted_artifacts` alone do not trigger advancement.
- Missing output under a required schema fails the parent and records `task_pipeline_output_missing`.
- Invalid output under a required schema fails the parent and records `task_pipeline_output_invalid`.
- Routing rejection, routing timeout, missing/duplicate/cross-workspace target, and missing assignee preserve terminal success and record stall activity.
- Chain termination with no route and no static next template is a successful no-successor outcome.

Relationships:

- Parent to successor: one successor per non-null `parent_task_id`.
- Root tasks: multiple tasks may have NULL `parent_task_id`.
- Successor inherits workspace, project, root, chain identity, and increments `chain_stage`.

## Task Chain

Deterministic sequence of related tasks connected by root, chain, parent, and stage metadata.

Fields:

- `root_task_id`: first task in the chain.
- `chain_id`: stable chain identifier.
- `chain_stage`: stage number.
- `parent_task_id`: immediate predecessor.

State transitions:

1. Legacy task completes with no advancement when flag OFF, unbound, or no driving metadata.
2. First eligible parent initializes root/chain/stage metadata when successor creation succeeds.
3. Later eligible parent inherits existing root/chain and increments stage for successor.
4. Validation failure leaves no successor and may move the parent to failed.
5. Advancement stall leaves terminal success intact and writes retry-eligible activity.
6. Chain termination creates no successor and closes the retry path until a new eligible failure or stall exists.

Invariants:

- At most one successor per non-null parent task.
- Successor creation is transactional with parent lineage, activity writes, duplicate guard checks, and task insert.
- Outbound GitHub/GNAP pushes from successor creation occur only after transaction commit.

## Routing Rule

Ordered declarative condition that maps validated structured output to a target workflow-template slug.

Fields:

- `expression`: bounded boolean expression using the SPEC-004 grammar.
- `target_template_slug`: target workflow-template slug in the same workspace.
- Optional operator display metadata if already present in the workflow-template payload.

Validation rules:

- Rule count <=64.
- Expression bytes <=8192.
- Token count <=256.
- Boolean nesting depth <=16.
- JSONPath bytes <=512.
- JSONPath result count <=128.
- Literal bytes <=32768.
- Allowed operators: `==`, `!=`, `in`, `not in`, `&&`, `||`, `!`.
- Left operands are JSONPath references into validated output.
- Right operands are string, number, boolean, or arrays of those literals.
- JSONPath filters and script expressions are rejected before traversal.
- Prototype-chain access, function calls, arithmetic, bitwise operators, regex values, dynamic require, `eval`, `Function`, `vm`, `vm2`, and `with` are forbidden.

Evaluation outcomes:

- `matched`: target slug selected.
- `not_matched`: evaluator tries the next rule or fallback.
- `rejected`: automated advancement stalls with `task_pipeline_routing_expression_rejected`.
- `budget_exceeded`: automated advancement stalls with `task_pipeline_routing_budget_exceeded`.

## Structured Output

Agent-produced JSON data stored in `tasks.resolution` for SPEC-004 routing.

Validation rules:

- Output payload <=262144 bytes.
- Schema payload <=65536 bytes.
- Schema depth <=16.
- Object keys <=256.
- Array length <=1024.
- String length <=32768.
- Pattern length <=256.
- Validation budget <=50 ms.
- Compiled validator cache <=256 entries.
- Validator cache key is `(template_id, schema_sha256)`.

Forbidden schema features:

- Remote `$ref`, `$dynamicRef`, `$dynamicAnchor`.
- Custom keywords or formats.
- Async schemas.
- `ajv-formats` direct dependency, import, or registration.
- Format enforcement.
- Data mutation, default insertion, type coercion, property removal.
- Exhaustive/all-errors collection.
- `$data`.
- Unsafe patterns: nested quantifiers, backreferences, lookaround, unbounded wildcards, ambiguous alternation, and over-cap patterns.

## Successor Task

Task created after validation, routing, target resolution, assignee resolution, duplicate guard, and transaction checks pass.

Creation rules:

- Created by exactly one call to `createTask()`.
- Inherits workspace and project from parent.
- Resolves assignee from the target template `agent_role` and parent project assignment using the live join: `project_agent_assignments.project_id = parent.project_id`, `project_agent_assignments.role = target_workflow_template.agent_role`, and `agents.name = project_agent_assignments.agent_name`.
- MUST NOT depend on, invent, or document `project_agent_assignments.agent_id` or workflow-template `agent_id` fields.
- Stores parent/root/chain/stage metadata.
- Stores workflow-template identity and slug snapshot.
- Uses source-profile defaults for pipeline successor parity.
- Internal database side effects are inside the advancement transaction.
- Outbound sync intents execute after transaction commit and failure uses existing sync/error activity behavior.

## Chain Activity

Operator-visible audit row for validation failure, advancement stall, retry recovery, and chain termination.

Required data fields:

- `reason_code`: stable machine-readable reason.
- `parent_task_id`.
- `workflow_template_id`.
- `workflow_template_slug`.
- Template provenance hashes for `output_schema`, `routing_rules`, and `next_template_slug` where required.
- Retry metadata when applicable: `retry_attempt`, `previous_reason_code`, `recovery_class`, `recovery_outcome`.
- Bounded target/successor identifiers where applicable.

Data exclusions:

- No secrets.
- No full corrected output.
- No full parsed output.
- No routing traces.

Reason codes:

- `task_pipeline_output_missing`
- `task_pipeline_output_invalid`
- `task_pipeline_routing_expression_rejected`
- `task_pipeline_routing_budget_exceeded`
- `task_pipeline_target_missing`
- `task_pipeline_target_duplicate`
- `task_pipeline_target_cross_workspace`
- `task_pipeline_successor_assignee_missing`
- `task_pipeline_target_disabled` only if live schema exposes an explicit disabled/status target state.

## Retry Recovery

Operator-authorized action that reprocesses the latest eligible SPEC-004 failure or stall.

Eligibility:

- Failed parent: latest eligible activity is missing-output or invalid-output.
- Terminal-success parent: latest eligible activity is an advancement stall.
- Caller cannot override `activity_id`.
- Older eligible activities are ignored.
- Missing selected-activity template provenance is a side-effect-free conflict.
- Unconfirmed template drift is a side-effect-free conflict.
- Already terminated chains are ineligible until a new eligible failure or stall exists.

Conflict response reasons:

- `retry_not_eligible`
- `retry_template_provenance_missing`
- `retry_template_drift_unconfirmed`

Recovery outcomes:

- `output_still_invalid`
- `stall_persisted`
- `successor_created`
- `successor_already_exists`
- `chain_terminated`

Rules:

- Conflicts write no activity, increment no retry attempt, and leave task state/successors unchanged.
- Eligible attempts have no hard cap and increment a monotonic per-parent `retry_attempt` shared across recovery classes.
- Failed parents restore to terminal success only after current output validates.
- Terminal-success stalled parents remain terminal-success throughout.
- Success responses return normal task detail data plus bounded `chain_retry` summary fields: `recovery_class`, `retry_attempt`, `recovery_outcome`, `successor_task_id`, `chain_terminated`, and `idempotent_successor`.
