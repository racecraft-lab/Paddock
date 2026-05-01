# Feature Specification: Task Pipeline Engine and Declarative Routing

**Feature Branch**: `004-task-pipeline-engine`  
**Created**: 2026-05-01  
**Status**: Draft  
**Input**: User description: "SPEC-004 Task Pipeline Engine and Declarative Routing for RC Factory Phase 3 in Mission Control"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preserve Current Task Behavior (Priority: P1)

Existing Mission Control operators can leave task pipelines disabled and continue creating, syncing, completing, notifying, subscribing to, and auditing tasks with no behavior change.

**Why this priority**: The feature must be safely deployable behind a default-off flag without regressing the current single-task workflow.

**Independent Test**: Can be fully tested by running current task creation, completion, sync, notification, ticket-counter, subscription, and activity flows with `FEATURE_TASK_PIPELINES` disabled and comparing behavior against the pre-feature baseline.

**Acceptance Scenarios**:

1. **Given** task pipelines are disabled, **When** an operator completes a task that has workflow-template chain metadata, **Then** the task completes through the existing behavior and no successor task is created.
2. **Given** task pipelines are enabled, **When** a task is unbound from a workflow template or all chain fields are empty, **Then** completion behaves the same as the disabled-flag path.
3. **Given** current task creation sources are used, **When** tasks are created through API, GitHub ingestion, GitHub sync, recurring schedules, or pipeline successor creation, **Then** ticket allocation, activities, subscriptions, notifications, and outbound sync side effects remain source-appropriate and are not duplicated.

---

### User Story 2 - Configure Declarative Workflow Routing (Priority: P1)

Facility operators can configure workflow templates so a completed task deterministically creates the correct successor task from validated structured output, ordered routing rules, or a static next template.

**Why this priority**: RC Factory needs multi-stage workflows where operators, not agents, control successor routing.

**Independent Test**: Can be fully tested by creating and editing workflow templates in the running app, completing representative pipeline-bound tasks, and verifying successor creation, no-successor termination, and workflow-template read-back.

**Acceptance Scenarios**:

1. **Given** a workflow template has an output schema and routing rules, **When** a completed parent task has valid structured output matching a rule, **Then** exactly one successor task is created from the matching target template.
2. **Given** a workflow template has a static next template and no output schema, **When** a completed parent task reaches terminal success, **Then** the configured static successor is created.
3. **Given** routing rules are provided without an output schema, **When** an operator saves the workflow template, **Then** the save is rejected with an operator-visible validation error.
4. **Given** no routing rule matches and no static next template exists, **When** a pipeline-bound task reaches terminal success, **Then** the chain terminates normally and no successor is created.
5. **Given** the live editor deletes a workflow template by query parameter, **When** it calls the existing delete contract, **Then** deletion works without requiring a JSON request body.

---

### User Story 3 - Validate Agent Output Safely (Priority: P1)

Agent and scheduler maintainers can rely on structured output validation and routing evaluation that reject malformed, oversized, or unsafe input before it can influence task-chain routing.

**Why this priority**: Pipeline routing consumes agent-controlled data and must fail deterministically without unsafe evaluation primitives or unbounded synchronous work.

**Independent Test**: Can be fully tested with adversarial schema, output, and routing fixtures that cover malformed input, rejected schema features, rejected routing expressions, budget overruns, oversized inputs, and safe no-successor stalls.

**Acceptance Scenarios**:

1. **Given** a workflow template requires structured output, **When** the parent task has no structured output, **Then** the parent transitions to failed, an activity records `task_pipeline_output_missing`, and no successor is created.
2. **Given** a workflow template requires structured output, **When** the parent output fails validation, **Then** the parent transitions to failed, an activity records `task_pipeline_output_invalid`, and no successor is created.
3. **Given** a routing expression uses forbidden primitives, script/filter expressions, prototype-chain access, unsupported operators, unsafe patterns, or oversized values, **When** the evaluator processes the rule, **Then** chain advancement rejects or stalls deterministically with stable activity evidence and no successor.
4. **Given** routing evaluation exceeds the configured budget, **When** a terminal-success parent is advanced, **Then** the parent remains terminal-success, an activity records `task_pipeline_routing_budget_exceeded`, and no successor is created.

---

### User Story 4 - Recover Failed or Stalled Chains Explicitly (Priority: P2)

Operators can correct bad structured output, routing configuration, target templates, or assignee mappings and then explicitly retry chain advancement without ordinary task edits accidentally rerunning the chain.

**Why this priority**: Deterministic recovery is required for long-running pipelines without allowing implicit replay, duplicate successors, or untracked template drift.

**Independent Test**: Can be fully tested by forcing each retry-eligible failure and stall, attempting ordinary task edits, then using the operator-only retry action to verify eligibility, provenance checks, drift confirmation, idempotency, recovery activities, bounded responses, and side-effect-free conflicts.

**Acceptance Scenarios**:

1. **Given** a failed parent task has a latest eligible missing-output or invalid-output activity, **When** an operator retries with still-invalid output, **Then** the parent remains failed, no successor is created, and the retry records audited recovery without a hard retry cap.
2. **Given** a failed parent task has corrected valid output, **When** an operator retries and template provenance is current or confirmed, **Then** the parent is restored to terminal success before normal routing, and the retry either creates a successor, returns an existing successor, stalls, or terminates normally.
3. **Given** a terminal-success parent has a latest eligible advancement-stall activity, **When** an operator retries, **Then** the parent remains terminal-success throughout and the retry either creates a successor, returns an existing successor, remains stalled, or terminates the chain.
4. **Given** a retry is ineligible, missing required template provenance, or detects unconfirmed template drift, **When** the retry endpoint is called, **Then** it returns a side-effect-free conflict with a machine-readable rejection reason and writes no activity or retry attempt.
5. **Given** a chain has already been resolved by no-successor termination, **When** the same recovery is retried again, **Then** the request is rejected as not eligible until a new retry-eligible failure or stall exists.

---

### User Story 5 - Trace Pipeline Lineage for Downstream Specs (Priority: P2)

Downstream spec executors can trace pipeline chains through parent, root, chain, stage, workflow-template, and PR-producing metadata while treating task resolution as the temporary structured-output bridge.

**Why this priority**: SPEC-005, SPEC-007, SPEC-008, and SPEC-009 depend on reliable lineage and task-chain metadata, but SPEC-004 must not implement their downstream behavior.

**Independent Test**: Can be fully tested by advancing first-hop and later-hop chains, inspecting parent/root/chain/stage metadata, verifying one-successor-per-parent enforcement, and confirming downstream state, artifact, governance, area-routing, pilot, and CrabTrap behaviors are absent.

**Acceptance Scenarios**:

1. **Given** a parent task has no prior lineage, **When** it creates its first successor, **Then** the parent is initialized as the root stage and the successor inherits root and chain identity with the next chain stage.
2. **Given** a parent task already has a successor, **When** advancement or retry runs again for the same parent, **Then** no duplicate successor is created and the existing successor outcome is returned where applicable.
3. **Given** the target successor role has no matching assignment in the parent project, **When** advancement resolves the target template, **Then** the parent remains terminal-success, a missing-assignee stall activity is recorded, and no successor is created.
4. **Given** downstream-only states or artifacts are not part of SPEC-004, **When** the pipeline engine completes its work, **Then** it exposes only the lineage and metadata needed by later specs and does not implement later-spec transitions or artifact handoff.

### Edge Cases

- Feature flag OFF with populated chain metadata must never advance a chain.
- Feature flag ON with an unbound task or no advancement-driving chain metadata must preserve legacy task behavior; `output_schema`, non-empty `routing_rules`, or `next_template_slug` trigger pipeline advancement, while `slug`, `produces_pr`, `external_terminal_event`, or `allow_redacted_artifacts` alone do not.
- Missing, duplicate, cross-workspace, or explicitly disabled target templates must stall automated advancement without failing the terminal-success parent. `task_pipeline_target_disabled` is reserved for a live or future workflow-template state column and is not implemented by adding a disabled-template state in SPEC-004.
- Missing successor assignee mapping must stall automated advancement without creating a successor.
- Invalid output under an output schema must fail the parent and never create a successor.
- Missing output under an output schema must fail the parent and never create a successor.
- Routing-rule rejection or routing budget overrun must leave a terminal-success parent successful and create no successor.
- Retry must use only the latest eligible SPEC-004 failure or stall activity; older activities and caller-supplied activity ids are ignored.
- Retry conflicts must be side-effect-free and include one of the allowed rejection reasons.
- Repeated eligible retries must be audited with a monotonic per-parent retry attempt and must not corrupt state or create duplicate successors.
- Retry after no-successor chain termination must be rejected until a new retry-eligible failure or stall exists.
- Existing successor recovery must return an idempotent existing-successor outcome, not insert another task.
- One-successor-per-parent enforcement must tolerate multiple root tasks without a parent.
- Workflow-template routing rules without an output schema must be rejected, while static next-template routing without schema remains valid.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST gate task pipeline behavior through the existing feature-flag resolver and preserve current task behavior when task pipelines are disabled.
- **FR-002**: The system MUST preserve current task behavior when task pipelines are enabled but the task is unbound or the workflow template has no advancement-driving chain metadata. Only `output_schema`, non-empty `routing_rules`, or `next_template_slug` make a bound task eligible for advancement; `slug`, `produces_pr`, `external_terminal_event`, or `allow_redacted_artifacts` alone preserve the legacy path.
- **FR-003**: The system MUST treat workflow templates as the live task-chain template source and MUST NOT introduce or depend on a separate task-template table.
- **FR-004**: The system MUST provide one shared task creation capability used by API creation, GitHub ingestion, GitHub sync import, recurring task generation, and pipeline successor creation.
- **FR-005**: Shared task creation MUST preserve source-specific side effects through explicit source profiles plus per-effect options, including ticket allocation, activity recording, creator subscription, mention and assignee notifications, GitHub push when enabled, and gateway push when configured.
- **FR-006**: The system MUST validate structured task output against the parent workflow template's output schema before routing when a schema is present.
- **FR-007**: Structured output validation MUST reject malformed, oversized, unsupported, unsafe, or budget-exceeding schemas and outputs using the constrained Mission Control schema profile defined for SPEC-004.
- **FR-008**: The schema validator MUST enforce the SPEC-004 numeric bounds for output size, schema size, depth, keys, array length, string length, pattern length, validation budget, and validator cache size.
- **FR-009**: The schema validator MUST reject unsupported schema features, unsafe pattern constructs, custom executable extensions, data mutation/default insertion, type coercion, exhaustive error collection, format enforcement, remote/dynamic references, and async schemas.
- **FR-010**: The routing evaluator MUST support only the allowlisted boolean grammar for equality, inequality, membership, negated membership, conjunction, disjunction, negation, JSONPath operands, and literal string, number, boolean, or array right sides.
- **FR-011**: The routing evaluator MUST reject JSONPath filters or script expressions before traversal and MUST disable JavaScript execution during traversal.
- **FR-012**: The routing evaluator MUST enforce pre-validation caps for rule count, expression bytes, token count, boolean nesting depth, JSONPath bytes, JSONPath result count, and literal bytes before synchronous parse or traversal work.
- **FR-013**: The routing evaluator MUST enforce a per-rule evaluation budget and stall automated chain advancement when routing exceeds that budget.
- **FR-014**: The system MUST advance eligible pipeline-bound tasks at every live non-`done` to `done` transition, including Aegis review approval, operator quality-review approval, bulk task updates, and detail task updates.
- **FR-015**: Manual and API completions MUST remain allowed, but no live pipeline-bound terminal-success path may bypass shared chain advancement behavior.
- **FR-016**: Chain advancement MUST read structured output from the task resolution field as the temporary SPEC-004 bridge until a later spec owns canonical artifact handoff.
- **FR-017**: Chain advancement MUST evaluate ordered routing rules first, fall back to a static next-template slug when no rule resolves, and terminate normally when neither route resolves.
- **FR-018**: Missing structured output under an output schema MUST fail the parent task, record activity metadata with `reason_code='task_pipeline_output_missing'`, and create no successor.
- **FR-019**: Invalid structured output under an output schema MUST fail the parent task, record activity metadata with `reason_code='task_pipeline_output_invalid'`, and create no successor.
- **FR-020**: Routing expression rejection, routing budget overrun, missing target, duplicate target, cross-workspace target, and missing successor assignee MUST stall automated advancement, preserve the parent terminal-success state, record operator-visible activity metadata with the exact stable reason code for the stall class, and create no successor. Required stall reason-code literals are `task_pipeline_routing_expression_rejected`, `task_pipeline_routing_budget_exceeded`, `task_pipeline_target_missing`, `task_pipeline_target_duplicate`, `task_pipeline_target_cross_workspace`, and `task_pipeline_successor_assignee_missing`. The `task_pipeline_target_disabled` reason code is reserved and emitted only if the live workflow-template schema exposes an explicit enabled/disabled/status-style target state; SPEC-004 MUST NOT add such a state.
- **FR-021**: Successor creation MUST occur inside one transactional advancement operation covering parent lineage initialization, validation failure state/activity writes, stall activity writes, duplicate-successor guard checks, and successor insertion.
- **FR-022**: Successor creation MUST initialize first-hop parent lineage when absent, inherit root and chain identity, increment chain stage, inherit workspace and project, resolve assignment through the live `project_agent_assignments.agent_name` to `agents.name` relationship where `project_agent_assignments.project_id` is the parent project and `project_agent_assignments.role` equals the target workflow template's `agent_role`, set parent and workflow-template metadata, and call shared task creation exactly once. SPEC-004 MUST NOT invent, require, or depend on `project_agent_assignments.agent_id` or workflow-template `agent_id` fields for assignee resolution.
- **FR-022a**: When shared task creation is called from chain advancement, task inserts and internal database side effects MUST run inside the caller's transaction, while GitHub and gateway outbound pushes MUST execute only after the transaction commits successfully; outbound push failures MUST use the existing sync/error activity path and MUST NOT hold open or roll back the completed chain transaction.
- **FR-023**: The system MUST enforce one successor per non-null parent task and MUST provide rollback support for the database guard.
- **FR-024**: The system MUST record machine-readable chain metadata in activity data for all SPEC-004 validation failures, advancement stalls, and retry recoveries without storing secrets or duplicating full corrected output.
- **FR-025**: Operators MUST recover chains only through an operator-authorized retry action; ordinary task updates or re-marking a failed task done MUST NOT rerun chain advancement.
- **FR-026**: Retry for failed parents MUST be eligible only for missing-output or invalid-output failures, revalidate current output, leave the parent failed when validation still fails, and restore terminal success only after validation passes.
- **FR-027**: Retry for terminal-success parents MUST be eligible only for SPEC-004 advancement stalls, preserve terminal success throughout, and never convert the parent to failed.
- **FR-028**: Retry MUST select only the latest eligible SPEC-004 failure or stall activity for the parent task and MUST NOT accept an activity-id override or replay older failure/stall activities.
- **FR-029**: Retry MUST compare failure-time template hashes to current template hashes, fail closed when selected-activity provenance is missing, and require explicit drift confirmation before retrying across template drift. Hashes MUST use SHA-256 over canonical JSON for `output_schema` and `routing_rules`, and SHA-256 over a normalized string-or-null representation for `next_template_slug`, distinguishing null from empty values.
- **FR-030**: Retry conflict responses MUST be side-effect-free, write no activity, increment no retry attempt, leave task state and successors unchanged, and return one of `retry_not_eligible`, `retry_template_provenance_missing`, or `retry_template_drift_unconfirmed`.
- **FR-031**: Retry success responses MUST return normal task detail data plus a bounded `chain_retry` summary containing `recovery_class`, `retry_attempt`, `recovery_outcome`, `successor_task_id`, `chain_terminated`, and `idempotent_successor`, and MUST NOT expose full corrected output, parsed output, or routing traces.
- **FR-032**: Repeated eligible retries MUST remain allowed without a hard attempt cap while recording monotonic per-parent retry attempts shared across recovery classes and reason codes.
- **FR-033**: Existing-successor recovery MUST return an idempotent existing-successor outcome with the successor id and MUST NOT create a duplicate task.
- **FR-034**: Retry-resolved no-route/no-static-next outcomes MUST succeed as normal chain termination, record chain-termination recovery, create no successor, and make later repeat retries ineligible until a new eligible failure or stall exists.
- **FR-035**: Workflow-template create and update operations MUST validate, persist, and return `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, and `allow_redacted_artifacts`.
- **FR-036**: Workflow-template writes MUST preserve operator-only authorization and reject non-empty routing rules unless an output schema is present.
- **FR-037**: Workflow-template writes MUST allow static next-template chaining without an output schema.
- **FR-038**: Workflow-template deletion MUST continue to support the existing query-parameter contract and may retain JSON-body deletion only as backward-compatible behavior.
- **FR-039**: The operator UI MUST allow authorized operators to create, edit, read back, and delete workflow-template chain fields and surface validation failures.
- **FR-039a**: `/api/workflows` MUST resolve Product Line scope through `resolveWorkspaceScopeFromRequest` for workflow-template read, create, update, usage-tracking update, and delete operations. Workflow-template writes and deletes MUST require a concrete single-workspace/Product Line scope, reject Facility aggregate scope, reject unauthorized workspace ids, and avoid falling back to `auth.user.workspace_id` when explicit Product Line scope is active. The Workflows editor in `orchestration-bar.tsx` and related workflow-template UI consumers MUST call `/api/workflows` through `appendScopeToPath` for list, create, update, usage-tracking, and delete requests while preserving the query-parameter delete contract.
- **FR-040**: The system MUST add exact pinned direct runtime dependencies for the validator and routing safety libraries and MUST clear the current high-severity audit baseline before merge.
- **FR-041**: The quality gate MUST run SPEC-004 audit and static guardrails for dependency pins, validator AJV option construction, absence of direct `ajv-formats` dependency/import/registration, conservative pattern-subset enforcement, accepted-pattern adversarial fixtures, unsafe primitives in SPEC-004 strict-scope implementation modules, direct production task inserts, and downstream-scope drift. Unsafe primitive guardrails MUST cover `eval`, `Function`, `vm`, `vm2`, `with`, dynamic `require`, prototype-chain access, arithmetic operators, bitwise operators, and right-side regex routing values.
- **FR-042**: Documentation MUST describe feature-flagged declarative task chains and current lifecycle terminology before SPEC-004 is marked shipped.
- **FR-043**: SPEC-004 MUST NOT implement downstream behavior owned by SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009, or SPEC-011.

### Task Creation Source Behavior Matrix

| Source profile | Required defaults after migration |
|----------------|-----------------------------------|
| API task creation | Allocate project ticket, insert task, log `task_created`, subscribe creator, resolve mentions and reject unresolved mention tokens, subscribe and notify resolved mention recipients, subscribe and notify assignee, enqueue GitHub push when project sync is enabled and a repository exists, enqueue gateway push when configured, broadcast `task.created`, and return the parsed task. |
| GitHub issue import | Preserve duplicate detection and GitHub metadata, insert through shared creation, log import activity, broadcast `task.created`, and avoid creator/assignee subscriptions, mention validation failures, notifications, and outbound GitHub/GNAP pushes unless a caller explicitly opts in. |
| GitHub sync import | Preserve canonical GitHub columns and anti-ping-pong semantics, insert through shared creation, log sync-created activity against the created task id, and avoid broadcast, subscriptions, notifications, ticket allocation, and outbound pushes unless a caller explicitly opts in. |
| Recurring task spawn | Allocate project ticket when the template has a project, insert through shared creation inside the existing recurrence transaction, update template recurrence metadata atomically with child creation, log recurring-spawn activity, and avoid broadcast, subscriptions, notifications, and outbound pushes unless a caller explicitly opts in. |
| Pipeline successor creation | Run insert and internal database side effects inside the `advanceTaskChain` transaction, call shared creation exactly once, inherit lineage/workspace/project metadata, use source-profile defaults needed for successor parity, and defer GitHub/GNAP outbound pushes until after the outer transaction commits successfully. |

Shared task creation returns a bounded result suitable for all profiles: `taskId`, optional parsed `task`, created activity ids, notification ids, subscription recipients, and outbound sync intent/queued status. It must not expose raw database driver results as its public contract.

### Output Schema Validation Safety Profile

SPEC-004 treats workflow-template `output_schema` as untrusted operator-provided input and validates task `resolution` output through a constrained JSON Schema profile.

| Area | Clarified requirement |
|------|------------------------|
| Runtime dependencies | `ajv@8.18.0` and `safe-regex@2.1.1` are exact pinned direct runtime dependencies in `package.json` and `pnpm-lock.yaml`; transitive or dev-only availability is insufficient. |
| Dependency audit | SPEC-004 owns clearing the current high-severity `pnpm audit --audit-level high` baseline before merge and records passing audit evidence. |
| Numeric bounds | Output payload <= 262144 bytes; schema <= 65536 bytes; schema depth <= 16; object keys <= 256; array length <= 1024; string length <= 32768; pattern length <= 256; validation budget <= 50 ms; compiled-validator cache <= 256 entries. |
| Validator cache key | Compiled validators are cached by `(template_id, schema_sha256)` and evicted with LRU behavior at the 256-entry cap. |
| AJV safety profile | AJV runs in strict validating mode with schema validation enabled, `$data=false`, `validateFormats=false`, no data mutation, no default insertion, no type coercion, no additional-property removal, no exhaustive/all-errors collection, no async validation, no remote schema loading, and no custom formats or keywords. |
| Forbidden schema features | Remote `$ref`, `$dynamicRef`, `$dynamicAnchor`, custom keywords, custom formats, async schemas, `ajv-formats` direct dependency/import/registration, format enforcement, executable extensions, data mutation/default insertion, type coercion, exhaustive error collection, and `$data` are rejected. |
| Pattern safety | `pattern` and `patternProperties` require `safe-regex` approval and the conservative SPEC-004 subset: literals, anchors, character classes, and bounded quantifiers only. Nested quantifiers, backreferences, lookaround, unbounded wildcards, ambiguous alternation, and any pattern over the 256-byte cap are rejected. A `safe-regex` pass is necessary but not sufficient: every accepted pattern shape must also have positive, negative, and adversarial validation-time fixtures, including worst-case near-match and non-match strings within the 32768-byte string cap, and must stay within the 50 ms validation budget without uncaught exceptions. |
| Failure surface | Malformed schemas, unsupported schema features, over-cap schemas or outputs, unsafe patterns, validation budget overruns, AJV compile failures, and validation failures return bounded deterministic validation results. They MUST NOT leak uncaught exceptions, full task output, full parsed output, raw AJV internals, or stack traces into API responses or activity metadata. |

### Routing Rule Evaluation Safety Profile

SPEC-004 routing rules are evaluated through a small allowlisted parser before any JSONPath traversal. The evaluator must fail closed on unsupported syntax and never execute JavaScript from operator or agent-controlled input.

| Area | Clarified requirement |
|------|------------------------|
| Runtime dependency | `jsonpath-plus@10.4.0` is an exact pinned direct runtime dependency in `package.json` and `pnpm-lock.yaml`; transitive or dev-only availability is insufficient. |
| Parser strategy | Routing expressions use a hand-written recursive-descent parser for the SPEC-004 grammar; JSONPath-Plus is used only for bounded traversal of parser-approved operands. |
| Allowlisted operators | Equality `==`, inequality `!=`, membership `in`, negated membership `not in`, conjunction `&&`, disjunction `||`, and negation `!`. |
| Operand shape | Left-side operands are bounded JSONPath references into validated task output; right-side operands are literal string, number, boolean, or arrays of those literals. |
| JSONPath safety | JSONPath filters and script expressions are rejected before `JSONPath()`; traversal runs with JavaScript execution disabled via `eval: false` or `preventEval: true` for older supported APIs, with no callbacks or sandbox-provided execution hooks. |
| Forbidden primitives | `eval`, `Function`, `vm`, `vm2`, `with`, dynamic `require`, function calls, dynamic property/prototype access including `__proto__` and `constructor`, arithmetic operators, bitwise operators, right-side regex values, malformed JSONPath, unsupported operators, and oversized literal strings are rejected. |
| Pre-validation caps | `maxRoutingRules=64`, `maxRoutingExpressionBytes=8192`, `maxRoutingTokens=256`, `maxBooleanNestingDepth=16`, `maxJsonPathBytes=512`, `maxJsonPathResults=128`, and `maxLiteralBytes=32768` are enforced before synchronous parse or traversal work. |
| Budget behavior | `maxRuleEvalMs=10` budget overruns stall automated chain advancement, preserve the parent terminal-success state, write operator-visible activity with `data.reason_code='task_pipeline_routing_budget_exceeded'`, and create no successor. |
| Rejection behavior | Unsupported or unsafe routing syntax records `data.reason_code='task_pipeline_routing_expression_rejected'`, preserves terminal success, and creates no successor. |
| Failure surface | Malicious, malformed, oversized, unsupported, or budget-exceeding routing expressions return bounded deterministic rejection or stall outcomes. They MUST NOT leak uncaught exceptions, full parsed output, routing traces, stack traces, JSONPath internals, or evaluated intermediate values into API responses or activity metadata. |
| Normal no-successor behavior | If no routing rule matches and no `next_template_slug` resolves, chain advancement terminates normally with no successor rather than recording a failure or stall. |

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities *(include if feature involves data)*

- **Workflow Template**: Product Line/workspace-scoped operator-managed workflow definition that may include a unique slug, agent role, optional output schema, ordered routing rules, optional static next-template slug, PR-producing metadata, terminal-event metadata, and redacted-artifact allowance.
- **Task**: Unit of operator or agent work that may be bound to a workflow template, contain temporary structured output in its resolution, and carry chain lineage fields.
- **Task Chain**: A deterministic sequence of related tasks connected by root task, chain id, parent task, and chain stage; a bound task enters this path only when advancement-driving chain metadata is present.
- **Routing Rule**: Ordered declarative condition that evaluates validated structured output and resolves to a target workflow-template slug.
- **Structured Output**: Agent-produced task resolution data that is validated before routing and remains a temporary bridge until canonical artifact handoff is introduced later.
- **Successor Task**: The next task created from a completed pipeline-bound parent task after validation, routing, target, assignee, and duplicate-successor checks pass.
- **Chain Activity**: Operator-visible activity entry whose JSON data stores stable reason codes, non-secret chain context, retry recovery metadata, and template provenance hashes.
- **Retry Recovery**: Operator-authorized action that reprocesses the latest eligible validation failure or advancement stall with current task output and current workflow-template configuration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With task pipelines disabled, 100% of existing task creation, completion, sync, notification, subscription, ticket-counter, and activity regression checks continue to pass with no successor tasks created.
- **SC-002**: With task pipelines enabled and no advancement-driving chain metadata present, 100% of null-default regression checks match the disabled-flag behavior, including slug-only and downstream-metadata-only templates.
- **SC-003**: 100% of production task creation callsites use the shared task creation capability, with no direct production task inserts outside the shared path.
- **SC-004**: 100% of required task creation sources preserve their source-specific side effects after migration.
- **SC-005**: 100% of structured-output validator bound, forbidden-feature, conservative pattern-subset, accepted-pattern adversarial validation-time, malformed, oversized, budget, and valid fixtures produce deterministic accept/reject outcomes without uncaught exception leaks.
- **SC-006**: 100% of routing evaluator allowlist, forbidden-primitive, JSONPath safety, malformed, oversized, budget, cap, no-match, and valid fixtures produce deterministic route, rejection, stall, or normal termination outcomes without uncaught exception leaks.
- **SC-007**: Every live non-`done` to `done` transition for advancement-eligible pipeline-bound tasks either creates exactly one valid successor, terminates normally, fails validation, or records a deterministic advancement stall.
- **SC-008**: 100% of retry-eligible validation failures and advancement stalls support explicit operator retry without ordinary task edits rerunning advancement.
- **SC-009**: 100% of retry conflicts are side-effect-free and return one of the allowed machine-readable rejection reasons.
- **SC-010**: 100% of retry success responses include bounded `chain_retry` metadata with `recovery_class`, `retry_attempt`, `recovery_outcome`, `successor_task_id`, `chain_terminated`, and `idempotent_successor`, and exclude full corrected output, parsed output, and routing traces.
- **SC-011**: One-successor-per-parent enforcement prevents duplicate successors while allowing multiple tasks without parents.
- **SC-012**: Workflow-template UI and API checks cover scoped create, edit, read-back, validation rejection, static next-template chaining, usage tracking, and query-parameter delete behavior under operator authorization and Product Line scope enforcement.
- **SC-013**: The high-severity dependency audit passes before merge and CI runs SPEC-004 guardrails.
- **SC-014**: Documentation accurately describes declarative task chains and lifecycle terminology before the feature is marked shipped.

## Assumptions

- SPEC-001 schema fields on workflow templates and tasks are present in this branch; if live schema verification proves they are absent, SPEC-004 stops and reports the dependency mismatch rather than adding replacement lineage columns.
- SPEC-002 feature-flag resolution exists and is the only supported runtime flag access path for task pipelines.
- SPEC-003 global Aegis behavior exists and remains the review surface that can produce a terminal task success transition.
- Existing operator authorization remains the authorization model for workflow-template writes and retry recovery.
- Workflow-template reads and writes remain Product Line/workspace scoped; `/api/workflows` must use the existing Product Line scope resolver, and Facility aggregate scope is not a valid workflow-template mutation target.
- Task resolution is acceptable as the temporary structured-output bridge only for SPEC-004; canonical artifact handoff is reserved for a later spec.
- Pipeline successor assignment is resolved by the live `project_agent_assignments.agent_name` plus target `workflow_templates.agent_role` relationship, joined to `agents.name`; SPEC-004 must not assume or create `project_agent_assignments.agent_id` or workflow-template `agent_id` fields.
- SPEC-004 reserves `task_pipeline_target_disabled` as a stable forward-compatible reason code, but does not add a workflow-template enabled/disabled/status column or define a disabled-template state. In the current live schema, target-template disablement is evaluated only if a live or future `workflow_templates` column exposes that state; otherwise unresolved targets are classified as missing, duplicate, or cross-workspace as applicable.
- Retry provenance hashes use deterministic canonicalization: canonical JSON for `output_schema` and `routing_rules`, plus normalized string-or-null hashing for `next_template_slug`, so whitespace/key-order drift does not produce false template drift.
- The dependency audit baseline observed on 2026-04-30 is in scope for SPEC-004 remediation before merge.
- Static next-template routing without an output schema is intentionally valid for deterministic linear chains.
- Chain termination without successor is a valid success outcome when no routing rule and no static next template resolve.
- Downstream Product Line, artifact, governance, area-routing, pilot seed, and CrabTrap behaviors are intentionally out of scope.
