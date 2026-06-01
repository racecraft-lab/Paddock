# Feature Specification: SPEC-014A - Sandbox Ownership and Lifecycle Contract

**Feature Branch**: `014a-sandbox-lifecycle-contract`  
**Created**: 2026-05-28  
**Status**: Draft  
**Input**: User description: "Paddock has claim/reconciliation authority from SPEC-013B but needs an explicit sandbox ownership and lifecycle contract for execution contexts before any real harness adapter can launch work."

## External Source Context

The following current external sources were consulted on 2026-05-28:

- OpenAI Harness Engineering article (Feb 11, 2026): https://openai.com/index/harness-engineering/
- OpenAI Symphony announcement (Apr 27, 2026): https://openai.com/index/open-source-codex-orchestration-symphony/
- OpenAI Symphony README: https://github.com/openai/symphony
- OpenAI Symphony SPEC: https://github.com/openai/symphony/blob/main/SPEC.md

These sources inform only the SPEC-014A vocabulary and safety posture: isolated work contexts, legible lifecycle evidence, bounded cleanup, operator-visible state, and repository-local records as the durable source of truth. SPEC-014A does not import Symphony's runner, polling, dispatch, Linear, client, or token-accounting algorithms.
The Symphony announcement and repository are used only as boundary context for issue-tracker control planes, dedicated workspaces, decoupled execution evidence, deterministic workspace lifecycle, and restart/reconciliation/observability lessons.

## Clarifications

### Session 2026-05-28

- Q: What schema shape should Plan use for `agent_sandbox_lifecycles` and `agent_sandbox_lifecycle_events`? -> A: Model them after the existing task-stage attempt/event pattern: `agent_sandbox_lifecycles` owns the current projection with `id`, `workspace_id`, `task_id`, `stage_key`, `sandbox_attempt_key`, optional `task_stage_attempt_id`, optional `task_stage_claim_id`, `owner`, `sandbox_key`, `root_id`, `sanitized_relative_path`, optional `handle_id`, `status`, lifecycle timestamps, and safe `metadata_json`; `agent_sandbox_lifecycle_events` owns append-only evidence with `id`, `lifecycle_id`, repeated workspace/task/stage/key fields for scoped lookup, `event_type`, `status`, `reason_code`, `observed_at`, actor fields, and safe `metadata_json`.
- Q: Which indexes are required for schema planning? -> A: Plan must include a uniqueness guard for `(workspace_id, sandbox_key)`, task/status lookup on `(workspace_id, task_id, stage_key, status, updated_at DESC)`, partial lookup indexes for non-null `task_stage_attempt_id` and `task_stage_claim_id`, and event ordering indexes on `(lifecycle_id, observed_at ASC, id ASC)` plus `(workspace_id, task_id, stage_key, observed_at ASC, id ASC)`.
- Q: Should the lifecycle read API be task-scoped, lifecycle-scoped, or both? -> A: Both read shapes are required, but every lifecycle-specific read must remain nested under task/workspace authorization rather than exposing an unscoped global lifecycle route.
- Q: How are optional attempt and claim links represented without becoming locks? -> A: Store nullable evidence links only; `task_stage_claims` remains the active claim authority, `task_stage_attempts` remains passive run evidence, and lifecycle rows must never enforce active-work uniqueness beyond their own deterministic sandbox key.
- Q: What path evidence may be persisted? -> A: Persist only `root_id`, `sandbox_key`, `sanitized_relative_path`, owner, handle id, linkage ids, timestamps, and redacted reason metadata; absolute host roots, raw input fragments, provider payloads, prompts, tokens, and raw session data are forbidden.
- Q: What slug and segment rules define safe sandbox keys? -> A: Each key segment must be normalized once, then validated against a narrow printable ASCII allowlist; separators, dot segments, Windows device names, control characters, bidirectional/zero-width characters, absolute-path syntax, overlong segments, and duplicate normalized values fail closed instead of being silently repaired.
- Q: What lifecycle transition graph is canonical? -> A: `create` inserts `created` or reuses a matching nonterminal lifecycle; `prepare` moves `created -> prepared`; `mark_running` moves `prepared -> running`; `mark_terminal` moves `prepared|running -> terminal`; `cleanup` moves `terminal -> cleanup_pending -> cleaned_up|cleanup_failed`; rollback after partial create or prepare failure records `rolled_back`.
- Q: How should cleanup evidence behave? -> A: Successful cleanup or rollback removes fake physical artifacts only; lifecycle rows and events remain durable, and stale `cleanup_pending` or `cleanup_failed` rows stay inspectable without an auto-reaper in SPEC-014A.
- Q: What does flag-off mean for reads and writes? -> A: With `FEATURE_AGENT_RUNNER_SANDBOXES` OFF, every mutation path returns disabled evidence before inserting rows/events or touching fake artifacts; reads still return `sandbox_lifecycle.v1` with flag-disabled evidence and any previously persisted authorized lifecycle rows.
- Q: What auth and documentation contract applies to the read API? -> A: Match existing task evidence and claim-reconciliation routes: authenticated viewer access, workspace/task scope filtering, no cross-workspace leakage, and route parity in both the API index and OpenAPI before implementation is complete.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Inspectable Sandboxes For Already-Claimed Work (Priority: P1)

As Paddock, I need every execution context to receive a deterministic sandbox identity, a bounded filesystem location, and durable lifecycle evidence before later adapter specs can attach real execution.

**Why this priority**: This is the minimum safety boundary for launching any future runner. Without it, work can be claimed but cannot be tied to a reviewable, cleanup-safe execution context.

**Independent Test**: Enable the sandbox feature for a disposable workspace, create fake `mission_control`, `openclaw`, and `external_harness` lifecycles for already-claimed task stages, and verify each lifecycle has the expected key shape, owner, sanitized path evidence, current status, and append-only events without launching a real harness.

**Acceptance Scenarios**:

1. **Given** the feature is enabled for a workspace with an eligible task stage, **When** a fake Paddock owner creates and prepares a sandbox, **Then** the lifecycle is stored with owner `mission_control`, the deterministic sandbox key, sanitized relative path evidence, and `created` then `prepared` events.
2. **Given** the same workspace and task stage, **When** fake OpenClaw and external-harness owners exercise the lifecycle vocabulary, **Then** they use the same statuses and event semantics while retaining their distinct owner values.
3. **Given** a lifecycle reaches `running` and then `terminal`, **When** the read model is queried, **Then** it returns the current status, owner, safe path evidence, linkage ids, and recent events without exposing host-sensitive absolute paths or raw payloads.

---

### User Story 2 - Block All Mutations When The Feature Is Disabled (Priority: P1)

As an operator, I need `FEATURE_AGENT_RUNNER_SANDBOXES` to be hard-off by default so existing dispatch/runtime behavior remains unchanged until the workspace explicitly opts in.

**Why this priority**: The zero-regression contract requires disabled sandbox behavior to create no new lifecycle state and to leave existing deployments unchanged.

**Independent Test**: With the feature disabled, attempt create, prepare, running, terminal, and cleanup mutations, then verify no lifecycle rows or events are inserted and the read API reports disabled-state evidence.

**Acceptance Scenarios**:

1. **Given** the feature is disabled for a workspace, **When** any lifecycle mutation is requested, **Then** the request is blocked with structured disabled-state evidence and creates no lifecycle rows or events.
2. **Given** lifecycle rows already exist from a previous enabled run, **When** the feature is disabled and the read model is queried, **Then** reads remain available and include evidence that mutation paths are disabled.
3. **Given** the feature is disabled globally or by workspace policy, **When** fake owner code is invoked, **Then** it cannot create artifacts, advance statuses, or append lifecycle events.

---

### User Story 3 - Reject Unsafe Sandbox Keys And Paths (Priority: P1)

As a reviewer, I need path and key validation to fail closed so future harnesses cannot escape configured roots or persist unsafe path evidence.

**Why this priority**: Bounded path safety is the core risk in any sandbox lifecycle contract, and it must be proven before real execution exists.

**Independent Test**: Run an adversarial corpus through the sandbox key/path helper covering traversal, absolute paths, symlink-like segments, unsafe Unicode/control characters, reserved names, duplicate normalized keys, overlong segments, and root escape after normalization.

**Acceptance Scenarios**:

1. **Given** a valid workspace/task/stage/attempt/owner input, **When** the bounded helper resolves a sandbox path, **Then** the result stays under the configured sandbox root and returns only sanitized relative evidence for persistence.
2. **Given** any traversal, absolute path, symlink-like segment, unsafe Unicode/control character, reserved name, duplicate normalized key, overlong segment, or normalization escape attempt, **When** the helper validates it, **Then** validation fails closed with field-level evidence and no lifecycle mutation occurs.
3. **Given** two different inputs normalize to the same sandbox key or path evidence, **When** creation is requested, **Then** the conflict is rejected rather than silently reusing or overwriting another lifecycle.

---

### User Story 4 - Make Duplicate Creates And Cleanup Reviewable (Priority: P2)

As Paddock, I need retries and cleanup to be deterministic, idempotent where safe, and audit-preserving so partial failures do not leave ambiguous state.

**Why this priority**: Agent and harness work will be retried. Duplicate creation, rollback, cleanup failure, and retained audit evidence must be understood before real execution can depend on the contract.

**Independent Test**: Create the same deterministic lifecycle twice while nonterminal, then attempt conflicting owner/path inputs, successful cleanup, rollback after partial creation, and cleanup failure paths.

**Acceptance Scenarios**:

1. **Given** a nonterminal lifecycle already exists for a deterministic key with matching owner/path evidence, **When** create is requested again, **Then** the existing lifecycle is returned and a `create_reused` event is appended.
2. **Given** a lifecycle already exists for a deterministic key, **When** create is requested with conflicting owner or bounded path inputs, **Then** the request fails closed with validation evidence and does not mutate the existing lifecycle.
3. **Given** fake artifacts exist for a lifecycle, **When** cleanup or rollback succeeds, **Then** physical fake artifacts are removed while lifecycle rows remain durable with `cleaned_up` or `rolled_back` evidence.
4. **Given** cleanup fails, **When** the failure is recorded, **Then** the lifecycle status becomes `cleanup_failed` with safe reason metadata and the row remains inspectable.

---

### User Story 5 - Expose Read-Only Lifecycle Evidence For Future Runtime Inventory (Priority: P3)

As a future runtime-inventory surface, I need a read-only `sandbox_lifecycle.v1` model that can reference sandbox lifecycle evidence without adding operator controls in SPEC-014A.

**Why this priority**: SPEC-014B owns the first operator-visible runtime inventory integration, but it needs a stable read model from SPEC-014A.

**Independent Test**: Query the lifecycle read API for task-scoped or lifecycle-scoped evidence and verify workspace authorization, disabled-state evidence, OpenAPI/API-index parity, and no UI/control behavior.

**Acceptance Scenarios**:

1. **Given** an authenticated caller with access to the workspace/task, **When** the read API is queried, **Then** it returns `sandbox_lifecycle.v1` evidence for the requested lifecycle or task scope.
2. **Given** a caller lacks access to a workspace, **When** the read API is queried, **Then** no cross-workspace lifecycle data is returned.
3. **Given** any new lifecycle read route is added, **When** documentation parity checks run, **Then** API index and OpenAPI entries describe the route and response shape.
4. **Given** SPEC-014A is implemented, **When** the operator looks for lifecycle UI controls, **Then** no runtime inventory UI, lifecycle controls, retry controls, or adapter registry behavior has been added by this spec.

### Edge Cases

- Feature disabled before, during, or after a fake lifecycle attempt.
- Duplicate deterministic key with identical inputs while the lifecycle is nonterminal.
- Duplicate deterministic key with conflicting owner, root, or sanitized relative path evidence.
- Lifecycle creation partially succeeds and a later fake hook fails.
- Cleanup succeeds after a terminal lifecycle.
- Cleanup fails after fake artifacts were created.
- Stale `cleanup_pending` rows exist after a failed or interrupted cleanup.
- Product-line slugs, stage keys, owner values, or path-like fragments contain traversal, absolute paths, reserved names, unsafe Unicode/control characters, symlink-like segments, overlong segments, or collision-prone normalized values.
- Read API is requested for a lifecycle that exists in another workspace.
- Existing single-workspace deployments run with the feature disabled.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST add durable lifecycle state for sandbox ownership using the narrow schema pair `agent_sandbox_lifecycles` and `agent_sandbox_lifecycle_events`.
- **FR-002**: System MUST treat `agent_sandbox_lifecycles` as the current lifecycle-state record and `agent_sandbox_lifecycle_events` as append-only lifecycle audit evidence.
- **FR-003**: System MUST restrict sandbox owners to the closed enum `mission_control`, `openclaw`, and `external_harness`.
- **FR-004**: System MUST reject any owner value outside the closed owner enum with validation evidence.
- **FR-005**: System MUST construct sandbox keys using the stable ID-based shape `workspace/<workspace_id>/product-line/<product_line_slug>/task/<task_id>/stage/<stage_key>/attempt/<attempt_id>/owner/<owner>`.
- **FR-006**: System MUST treat IDs in the sandbox key as authoritative and product-line/stage readability text as sanitized readability only.
- **FR-007**: System MUST default sandbox filesystem roots to `<MISSION_CONTROL_DATA_DIR>/sandboxes`.
- **FR-008**: System MAY support reviewed per-workspace sandbox root configuration, but only through the same bounded path validation rules.
- **FR-009**: System MUST provide a bounded path helper that rejects traversal segments, absolute paths, symlink-like segments, unsafe Unicode, control characters, reserved names, duplicate normalized keys, overlong segments, and root escape after normalization.
- **FR-010**: System MUST persist only safe path evidence: sandbox key, owner, root identifier, sanitized relative path, lifecycle ids, linkage ids, timestamps, handle id when present, and redacted reason codes.
- **FR-011**: System MUST NOT persist host-sensitive absolute paths, raw user path fragments, raw prompts, tokens, provider payloads, or session payloads in lifecycle rows or events.
- **FR-012**: System MUST expose lifecycle hooks named `create`, `prepare`, `mark_running`, `mark_terminal`, and `cleanup`.
- **FR-013**: System MUST use only the closed coarse lifecycle statuses `created`, `prepared`, `running`, `terminal`, `cleanup_pending`, `cleaned_up`, `rolled_back`, and `cleanup_failed`.
- **FR-014**: System MUST store detailed lifecycle reasons in append-only events rather than expanding the coarse status enum.
- **FR-015**: System MUST link each lifecycle to `workspace_id`, `task_id`, and `stage_key`.
- **FR-016**: System MUST support optional linkage to `task_stage_attempt_id` and `task_stage_claim_id`.
- **FR-017**: System MUST NOT treat sandbox ownership as claim authority or use sandbox lifecycle rows as the active claim lock.
- **FR-018**: System MUST keep SPEC-013B claim/reconciliation authority as the source of truth for whether work may execute.
- **FR-019**: System MUST make lifecycle creation idempotent for the same deterministic key while the existing lifecycle is nonterminal and all owner/path evidence matches.
- **FR-020**: System MUST append a safe `create_reused` event when duplicate nonterminal creation reuses an existing lifecycle.
- **FR-021**: System MUST reject duplicate create attempts with conflicting owner, root, or bounded path evidence and MUST NOT mutate the existing lifecycle on conflict.
- **FR-022**: System MUST mark partially created lifecycles as `rolled_back` when compensating cleanup succeeds after a later hook failure.
- **FR-023**: System MUST mark lifecycle state as `cleanup_failed` when cleanup itself fails and MUST preserve safe failure evidence for inspection.
- **FR-024**: System MUST remove physical fake artifacts on successful cleanup or rollback.
- **FR-025**: System MUST retain lifecycle rows and lifecycle event rows as durable audit evidence after cleanup or rollback.
- **FR-026**: System MUST leave stale `cleanup_pending` rows inspectable and MUST NOT add automatic stale cleanup reaping in SPEC-014A.
- **FR-027**: System MUST resolve `FEATURE_AGENT_RUNNER_SANDBOXES` through the repository feature-flag helper and default it OFF.
- **FR-028**: System MUST block create, prepare, running, terminal, cleanup, and rollback mutations when `FEATURE_AGENT_RUNNER_SANDBOXES` is OFF.
- **FR-029**: System MUST create no lifecycle rows and no lifecycle event rows for disabled mutation attempts.
- **FR-030**: System MUST keep lifecycle reads available when the feature is OFF and include disabled-state evidence in the read response.
- **FR-031**: System MUST provide production-code fake lifecycle owner implementations behind `FEATURE_AGENT_RUNNER_SANDBOXES`.
- **FR-032**: System MUST prove through tests that fake lifecycle owners cannot launch, resume, stop, or communicate with a real harness.
- **FR-033**: System MUST expose a read-only `sandbox_lifecycle.v1` API returning disabled-state evidence, current status, owner, sanitized path evidence, linkage ids, and recent events.
- **FR-034**: System MUST enforce authenticated workspace/task scope for lifecycle reads and MUST prevent cross-workspace lifecycle disclosure.
- **FR-035**: System MUST update API index and OpenAPI documentation for any added lifecycle read route.
- **FR-036**: System MUST include tests or guardrails proving API index/OpenAPI parity for any added route.
- **FR-037**: System MUST include manual UAT that runs a fake enabled lifecycle, inspects read API evidence, disables the flag, and verifies mutation blocks plus disabled read evidence.
- **FR-038**: System MUST keep operator UI, runtime inventory UI, lifecycle controls, retry/release/cancel/debug controls, adapter manifests, fake adapter registry, real harness launch/resume/stop, token accounting, tracker truth, successor selection, governance policy changes, and auto-merge out of SPEC-014A.
- **FR-039**: System MUST preserve SPEC-014B as the first operator-visible runtime-inventory integration point for read-only sandbox lifecycle references produced by SPEC-014A.
- **FR-040**: System MUST classify boundary failures as structured validation or lifecycle errors with actionable field/reason evidence and without leaking unsafe payloads.

### Spec Evidence And Archive Policy

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities

- **Sandbox Lifecycle**: Durable current-state record for one deterministic sandbox key, owner, workspace/task/stage linkage, optional attempt/claim linkage, status, root identifier, sanitized relative path evidence, and timestamps.
- **Sandbox Lifecycle Event**: Append-only audit record for lifecycle transitions, validation failures, idempotent reuse, cleanup, rollback, and safe reason metadata.
- **Sandbox Owner**: Closed ownership value identifying whether Paddock, OpenClaw, or an external harness owns the execution context.
- **Sandbox Key**: Stable ID-based identity string that ties workspace, product line, task, stage, attempt, and owner together while keeping slugs sanitized and non-authoritative.
- **Sandbox Path Evidence**: Persisted bounded-root evidence that proves where the sandbox would live without exposing host-sensitive absolute paths or raw path fragments.
- **Fake Lifecycle Owner**: Production-code fake implementation that exercises lifecycle hooks and artifacts under the feature flag without launching a real harness.
- **Sandbox Lifecycle Read Model**: Read-only `sandbox_lifecycle.v1` representation for current status, owner, safe path evidence, disabled-state evidence, linkage, and recent events.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of valid fake lifecycle creates for `mission_control`, `openclaw`, and `external_harness` produce deterministic sandbox keys matching the specified shape.
- **SC-002**: 100% of adversarial path cases in the required corpus fail closed with no lifecycle row, no lifecycle event, and field-level validation evidence.
- **SC-003**: 100% of flag-OFF mutation attempts across create, prepare, running, terminal, and cleanup paths create zero lifecycle rows and zero lifecycle events.
- **SC-004**: 100% of lifecycle read responses omit host-sensitive absolute paths, raw user path fragments, raw prompts, tokens, provider payloads, and session payloads.
- **SC-005**: Duplicate create attempts for an existing nonterminal lifecycle with matching evidence return the same lifecycle and append exactly one reuse event per retry.
- **SC-006**: Duplicate create attempts with conflicting owner, root, or path evidence fail closed without changing the existing lifecycle status or events.
- **SC-007**: Successful cleanup or rollback removes physical fake artifacts while preserving durable lifecycle and event records for later review.
- **SC-008**: Cleanup failure leaves an inspectable `cleanup_failed` lifecycle with safe reason metadata.
- **SC-009**: Any added lifecycle read route has matching API index and OpenAPI coverage before implementation is considered complete.
- **SC-010**: Manual UAT demonstrates enabled fake lifecycle creation/inspection/cleanup and disabled mutation blocking in a disposable workspace.

## Assumptions

- SPEC-013B claim/reconciliation authority is already merged and remains the gate for work eligibility.
- `FEATURE_AGENT_RUNNER_SANDBOXES` is hard-default OFF and can be enabled only through the repository's existing workspace feature-flag path.
- The exact lifecycle read route shape is a planning decision, but every route must return `sandbox_lifecycle.v1`, enforce workspace/task scope, and update API documentation parity.
- The exact migration id is verified during Plan against the live migration file; roadmap setup expects the next id to be M80 unless the live schema has changed.
- The bounded path helper may be implemented as production code because later adapter specs need the same contract, but SPEC-014A proves it only through fake owners.
- Existing dispatch, scheduler, governance, successor selection, tracker truth, GitHub sync, and owner merge behavior remain unchanged by this spec.
- SPEC-014B will provide first operator-visible runtime inventory integration for read-only sandbox lifecycle references; SPEC-014A provides only the read model and API support.
