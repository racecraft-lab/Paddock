# Feature Specification: SPEC-014C First Real Harness Adapter Pilot

**Feature Branch**: `014c-first-real-harness-adapter`  
**Created**: 2026-06-04  
**Status**: Draft  
**Input**: User description: "Implement the first real harness adapter path behind the SPEC-014B registry. The selected adapter is Codex app-server."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admit and launch a claimed stage (Priority: P1)

As Paddock, I can admit only an already-claimed, GitHub-linked, assigned stage through runtime-inventory eligibility and launch Codex app-server inside a bounded Paddock-owned sandbox.

**Why this priority**: This is the first proof that the completed claim, reconciliation, sandbox lifecycle, and adapter manifest contracts can drive a real harness instead of fake inventory only.

**Independent Test**: Can be fully tested by preparing a disposable GitHub-linked assigned stage with an active claim, enabling the runner flag, selecting the Codex app-server manifest through runtime inventory, and observing one bounded launch attempt with run, attempt, lifecycle, activity, and safe evidence records.

**Acceptance Scenarios**:

1. **Given** an already-claimed GitHub-linked assigned stage that passes governance, assignment, manifest, task, runtime-inventory, and sandbox lifecycle eligibility, **When** dispatch reaches the real harness adapter path, **Then** Paddock launches exactly one Codex app-server attempt for that claimed stage and records the launch evidence.
2. **Given** a task or assignment that is not claimed, not GitHub-linked, not assigned, denied by governance, missing a matching manifest, or missing valid lifecycle preparation, **When** dispatch evaluates adapter eligibility, **Then** Paddock does not launch Codex app-server and records a clear ineligible reason without changing task terminal state or GitHub state.
3. **Given** the runner feature flag is OFF, **When** an otherwise eligible claimed stage reaches dispatch, **Then** Paddock blocks launch, records flag-off evidence, and leaves existing dispatch, claim, and retry behavior compatible.

---

### User Story 2 - Inspect safe run evidence (Priority: P2)

As an operator, I can inspect whether the claimed stage launched, failed, timed out, or published safe evidence without seeing raw transcripts, secrets, provider payloads, tool payloads, or broad prompt bodies.

**Why this priority**: Operators need enough evidence to trust and debug the real adapter path, while Paddock must keep artifacts and evidence safe for review and production use.

**Independent Test**: Can be fully tested by running one successful or controlled-failure adapter attempt and inspecting the existing run, attempt, lifecycle, activity, artifact, usage, and failure summary surfaces for bounded safe evidence.

**Acceptance Scenarios**:

1. **Given** a Codex app-server attempt produces a safe result, **When** Paddock publishes evidence, **Then** the operator can inspect bounded summaries, artifact references, lifecycle state, usage details when available, and failure status if applicable.
2. **Given** Codex app-server emits output that contains unsafe payloads, secrets, raw transcripts, host paths, provider payloads, tool payloads, or broad prompt bodies, **When** Paddock evaluates the evidence, **Then** unsafe evidence is rejected or redacted through the existing artifact safety path and the run records an unsafe evidence reason.
3. **Given** usage events are unavailable or partial, **When** the attempt ends, **Then** Paddock records that usage was unavailable or partially available rather than inventing metrics.

---

### User Story 3 - Fail closed on unsupported runtime events (Priority: P3)

As Paddock, I can fail closed when Codex app-server requests unsupported live user input, tool approval, file approval, or a capability outside the adapter manifest.

**Why this priority**: SPEC-014C intentionally proves a non-interactive first real adapter path. Live intervention and richer retained transcripts are delegated to later specs so this PR stays reviewable.

**Independent Test**: Can be fully tested with controlled protocol fixtures or a HAL UAT fixture that triggers unsupported user-input, tool/file approval, unsupported capability, unavailable binary, malformed protocol, timeout, and unsafe evidence cases.

**Acceptance Scenarios**:

1. **Given** Codex app-server requests live user input, **When** SPEC-014C receives the request, **Then** Paddock fails the attempt with `user_input_unsupported`, records safe failure evidence, and does not auto-answer.
2. **Given** Codex app-server requests tool approval, file approval, or a capability not admitted by the manifest and capability packet, **When** SPEC-014C receives the request, **Then** Paddock fails the attempt with the matching unsupported reason code and does not auto-approve.
3. **Given** Codex app-server is unavailable, exceeds the manifest timeout, emits malformed protocol events, or produces unsafe evidence, **When** the attempt ends or is terminated, **Then** Paddock records the matching failure reason and leaves task terminal state and GitHub state unchanged.

---

### User Story 4 - Review a bounded adapter PR (Priority: P4)

As a reviewer, I can see that SPEC-014C owns only the first Codex app-server adapter proof and that transcript retention and live intervention are deferred to SPEC-014E and SPEC-014F.

**Why this priority**: The first real harness adapter can easily expand into a broad runtime platform. The spec must keep the implementation reviewable and make follow-on boundaries explicit.

**Independent Test**: Can be fully tested by reviewing the PR packet traceability, non-goals, scope budget, HAL UAT evidence, and static scope guard showing no second adapter, OpenClaw behavior, transcript-retention platform, live intervention UI, direct GitHub mutation, task terminal mutation, successor selection, auto-merge, or governance mutation.

**Acceptance Scenarios**:

1. **Given** the PR review packet is prepared, **When** a reviewer checks scope and traceability, **Then** each major requirement maps to changed files and verification evidence, and deferred work names SPEC-014E or SPEC-014F where applicable.
2. **Given** implementation planning discovers a second primary surface, schema-heavy retention system, live intervention UI, second real adapter, or broad scheduler rewrite is required, **When** the scope budget is evaluated, **Then** SPEC-014C stops and records a split decision before implementation.

### Edge Cases

- Feature flag OFF blocks launch even when the claim, assignment, manifest, governance, and lifecycle are otherwise eligible.
- Runtime inventory has a Codex app-server manifest, but the task assignment is unassigned or bound to a different manifest.
- The claimed stage is not GitHub-linked, has a stale claim, has no stage attempt, or no longer belongs to the expected workspace or repository.
- Governance allows the task generally, but denies the specific harness capability or sandbox posture.
- Sandbox lifecycle creation or preparation fails before launch.
- Codex app-server binary is unavailable or reports a version/protocol shape that cannot be safely handled.
- The subprocess exits before initialization, hangs past the manifest timeout, or cannot be terminated cleanly.
- The protocol stream includes unknown, malformed, duplicated, or out-of-order events.
- Codex app-server asks for live user input, tool approval, file approval, shell access outside the sandbox, or a capability outside the manifest packet.
- Output includes raw transcripts, provider payloads, tool payloads, prompt bodies, secrets, host paths, or unsafe evidence.
- Artifact publication fails after the run has produced a safe summary.
- Usage events are absent, partial, duplicated, or malformed.
- Retry, release, cancellation, or stale-claim recovery happens through existing claim-control behavior while the adapter path is preparing or running.
- A successful adapter attempt releases active ownership but must not become retry-eligible merely because ownership was released.
- Claim-control or stale recovery changes the active claim after the adapter starts but before it writes terminal evidence.
- The subprocess cannot be terminated cleanly after timeout, unsupported request, cancellation, or stale ownership loss.
- Sandbox lifecycle cleanup fails after terminal evidence is recorded.
- HAL has Paddock deployed but does not have an available Codex app-server binary; UAT blocks instead of accepting fake-only proof.

## Clarifications

### Session 2026-06-04 - Codex App-Server Protocol

- Q: Which Codex app-server lifecycle is authoritative for launch and terminal state? -> A: Use the official app-server v2 protocol. Handshake is `initialize` response plus client `initialized` notification; launch evidence is `thread/start` plus `turn/start` response and `turn/started`; terminal state is `turn/completed.turn.status`; `item/completed` with an agent message is output evidence, not lifecycle authority. Paddock-owned timeouts map to synthetic `timeout_budget_expired`.
- Q: Is same-run continuation in scope? -> A: Yes, only within the same live Codex thread owned by the current claimed stage attempt. Store opaque `thread.id`, `thread.sessionId`, and `turn.id` values as bounded metadata; allow another `turn/start` only while the adapter subprocess/live thread remains active and the claim/attempt is current. Do not implement cross-tick `thread/resume` ownership in SPEC-014C.
- Q: Which usage signal is authoritative? -> A: Prefer `thread/tokenUsage/updated`; otherwise record final-turn usage only when reliable totals are available. Record partial or unavailable usage instead of inferring metrics from text length.
- Q: How are unsupported user-input, approval, tool, and file requests handled? -> A: Fail closed. Map `item/tool/requestUserInput` or non-approval MCP elicitation to `user_input_unsupported`; map `item/commandExecution/requestApproval`, legacy exec/apply-patch approvals, network approval contexts, experimental additional permission requests, permission requests, and approval-like MCP connector elicitations to `approval_unsupported`; map `item/fileChange/requestApproval`, dynamic tool calls, MCP tool calls, and unsupported tool/file access to `tool_file_unsupported` or `capability_unsupported` by payload. Send deny/cancel responses only when needed to unblock protocol shutdown.
- Q: How are unavailable binary and malformed protocol failures detected? -> A: `binary_unavailable` means command lookup/spawn failure or process exit before a valid handshake. `malformed_protocol` means invalid JSON-RPC/JSONL, response id mismatch, duplicate response for the same client request id, missing required thread/turn fields, duplicate required lifecycle events, duplicate terminal events, or impossible ordering. Unknown optional notifications may be recorded as bounded extra evidence only if they do not corrupt the required flow.

### Session 2026-06-04 - Evidence, Artifacts, And Redaction

- Q: What is the minimal run evidence envelope? -> A: Use descriptor-only `codex_app_server_run.v1` metadata carried by existing run, attempt, lifecycle, activity, usage, failure, and artifact-reference surfaces. It records ids, reason codes, lifecycle phase, status/outcome, safe counts, usage availability, and bounded protocol correlation ids, but no raw protocol payloads, transcripts, new persistence table, or broad previews.
- Q: Which artifact-reference fields are safe for SPEC-014C run evidence? -> A: Safe references are descriptor-only: artifact id/ref, artifact type/kind, schema version, MIME/media type, byte size/count, SHA-256 or equivalent digest, redaction status, security scan status, produced/created timestamp, and optional bounded safe summary/digest/sanitized label. They exclude storage URI, raw content, preview text, original filename, cwd/sandbox/host paths, external URLs, provider/tool/MCP payloads, transcripts, and prompt bodies.
- Q: Which final-output content is structurally unsafe? -> A: Raw transcripts, provider payloads, tool or MCP payloads, prompt bodies, host paths, unsafe URIs, command/file-change details, raw reasoning, and raw protocol payloads are hard-rejected before redaction. Secret-shaped values may be redacted only when they appear inside an otherwise bounded safe summary, and the redacted derivative must still pass schema, length, non-empty, and artifact policy checks.
- Q: What happens when final output is unsafe? -> A: If the Codex terminal state is otherwise complete and only a secret-shaped value was redacted from a bounded safe summary, Paddock may publish the redacted derivative and record the adapter run as completed with partial/redaction evidence. If artifact policy rejects the derivative, redaction empties the summary, or structurally unsafe content appears, the adapter run and stage attempt fail with `unsafe_evidence_rejected`.
- Q: What failure evidence is operator-visible? -> A: Failure summaries include only the closed reason code, phase, safe diagnostic category, counts, related ids, rejected field paths, safe hash/size where available, and a short safe `run.error` label. They do not include raw protocol excerpts, provider/tool payloads, command details, or file-change contents.

### Session 2026-06-04 - Claim, Timeout, And Lifecycle Semantics

- Q: What is the successful adapter terminal state? -> A: A successful Codex app-server attempt records `run.status=completed`, `run.outcome=success`, and final task-stage attempt status `succeeded`; ownership is released with existing claim semantics using `launch_handoff_completed`. Implementation MUST preserve the successful attempt as `succeeded` and MUST NOT leave a later `released` attempt event as the final lifecycle state, because `released` is retry-eligible evidence.
- Q: Which claim release reason is used for adapter failures? -> A: Adapter failure, unavailable binary, malformed protocol, unsupported user input/approval/tool/file/capability, unsafe evidence, and other SPEC-014C adapter failures release active ownership with existing `dispatch_failed`; the precise SPEC-014C reason code is stored in bounded run, attempt, lifecycle, activity, and failure-summary evidence.
- Q: How is timeout represented? -> A: Manifest timeout records `run.status=timeout`, `run.outcome=failed`, task-stage attempt status `failed`, claim release reason `dispatch_failed`, and failure reason `timeout_budget_expired`. `timeout_budget_expired` is not a claim release reason.
- Q: What happens if operator claim-control or stale-claim recovery wins while the adapter is preparing or running? -> A: Existing claim-control and stale recovery authority wins. Before continuation or terminal writes, the adapter must re-prove the same workspace, task, stage, active claim id, claim run id, linked attempt id, nonterminal/current attempt, Paddock-owned prepared/running lifecycle, and current manifest/capability/assignment/governance/runtime-inventory posture as needed. If ownership is gone or expected state changed, the adapter terminates the subprocess, records bounded adapter-abandoned evidence only when it can do so without overwriting newer state, and must not write late claim, attempt, task-terminal, GitHub, successor, or governance changes.
- Q: How is cleanup ordered and evidenced? -> A: The adapter first records terminal run/attempt/failure evidence while ownership is still current, terminates or cancels the subprocess, marks the sandbox lifecycle terminal, then requests lifecycle cleanup. If subprocess termination or cancellation fails, Paddock appends `cleanup_failed` evidence with `phase=subprocess_termination` while preserving the original terminal outcome and reason. If filesystem/lifecycle cleanup fails, Paddock records `cleanup_failed` with `phase=lifecycle_cleanup` and leaves the lifecycle inspectable rather than hiding or retry-looping the failure.
- Q: What scope guard proves no task terminal or GitHub mutation? -> A: SPEC-014C uses a diff/path-scoped static guard plus runtime tests around the adapter/dispatch seam to block direct task terminal updates, `syncTaskOutbound`, `advanceTaskChain`, `createTask`, direct GitHub mutation, auto-merge, governance mutation, second adapter behavior, OpenClaw-specific behavior, live intervention UI, and transcript-retention platform code in SPEC-014C-owned files. Existing legacy dispatch code remains allowed.

### Session 2026-06-04 - UAT And Deployment

- Q: What HAL UAT fixture shape is required? -> A: Use a marker-scoped disposable product-line workspace with a temporary operator user/session, project, workflow template/stage, project-agent assignment to the Codex app-server manifest, assigned GitHub-linked task, healthy GitHub sync lifecycle evidence, current task-stage attempt, active claim, Paddock-owned sandbox lifecycle, run/artifact/activity evidence, and cleanup for every marker-scoped DB row plus sandbox/artifact file after report capture.
- Q: What feature-flag scope is valid for HAL UAT? -> A: Enable `FEATURE_TASK_CONTROL_PLANE` and `FEATURE_AGENT_RUNNER_SANDBOXES` only through the disposable workspace feature-flag JSON for the UAT scope. Verify the same fixture blocks when the runner flag is false. Do not rely on global or environment force-on behavior, and do not add a SPEC-014C-only flag.
- Q: What Codex app-server availability preflight must pass? -> A: HAL UAT counts only if `codex` resolves on HAL and a real `codex app-server` subprocess completes the official handshake plus one live thread/turn launch from the Paddock-owned sandbox. `codex --version` alone is insufficient. Fake app-server evidence cannot substitute for the real-launch gate.
- Q: How are UAT failure modes covered? -> A: HAL UAT must include one real Codex app-server launch for a disposable GitHub-linked assigned stage. Unsupported user-input/tool/approval, timeout, malformed protocol/output, unsafe evidence rejection, and allowed redaction may use deterministic protocol/adapter fixtures on HAL only when those fixtures exercise the same adapter parser, failure mapper, claim/lifecycle handling, timeout path, and artifact/redaction path as live protocol events. Fake-only proof is insufficient for SPEC-014C completion.
- Q: What evidence is required for completion? -> A: Completion requires `uat-report.md`, `pr-review-packet.md`, updated roadmap/workflow/autopilot status, traceability from the real launch plus each failure fixture, service/deployed-commit/flag-scope evidence, and zero marker residue across disposable DB rows plus sandbox/artifact paths after report capture. Durable checked-in evidence is descriptor-level and redacted; live HAL disposable rows/artifacts are cleaned rather than preserved. If cleanup fails, record residue or `cleanup_failed` and do not mark Complete until remediated or explicitly deferred.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Paddock MUST provide exactly one real harness adapter manifest for Codex app-server in SPEC-014C.
- **FR-002**: Paddock MUST provide exactly one Codex app-server adapter path for SPEC-014C and MUST NOT add a second real adapter or OpenClaw-specific behavior.
- **FR-003**: Paddock MUST evaluate the real adapter path only from the existing dispatch trigger after SPEC-013B claim/reconciliation ownership is established and governance allows the stage.
- **FR-004**: Paddock MUST admit only stages that are already claimed, GitHub-linked, assigned to an eligible harness manifest, within the expected workspace/repository, and allowed by runtime-inventory eligibility.
- **FR-005**: Paddock MUST block launch when the runner feature flag is OFF or when manifest, assignment, task, governance, claim, or lifecycle eligibility fails.
- **FR-006**: Paddock MUST create or prepare Paddock-owned SPEC-014A sandbox lifecycle evidence before launching Codex app-server.
- **FR-007**: Paddock MUST run the Codex app-server attempt from the prepared bounded lifecycle root, not from a host-global or operator-environment working directory.
- **FR-008**: Paddock MUST start one Codex app-server subprocess per admitted stage attempt, complete the `initialize`/`initialized` handshake, then create a thread and start a turn through the official app-server protocol.
- **FR-009**: Paddock MUST terminate and clean up the subprocess when the timeout expires, then record `run.status=timeout`, failed attempt status, `timeout_budget_expired`, and cleanup evidence.
- **FR-010**: Paddock MUST assemble a bounded task-stage input from GitHub issue title, body, and link; workflow template and stage instructions; task id and stage key; assignment role; repository/workspace path; claim id; manifest id; capability packet; and explicit handoff requirements.
- **FR-011**: Paddock MUST NOT include raw database rows, secrets, full prior transcripts, provider payloads, tool payloads, broad operator context, or unrelated task history in the task-stage input or persisted evidence.
- **FR-012**: Paddock MUST record adapter evidence through existing run, task-stage attempt, sandbox lifecycle, activity, usage summary, failure summary, and safe artifact reference surfaces using descriptor-only `codex_app_server_run.v1` metadata, including bounded `thread.id`, `thread.sessionId`, and `turn.id` correlation metadata when available; a successful adapter attempt MUST end with task-stage attempt status `succeeded`.
- **FR-013**: Paddock MUST prefer `thread/tokenUsage/updated` for usage summaries, MUST use final-turn usage only when reliable totals are available, and MUST explicitly record unavailable or partial usage when reliable usage data is not present.
- **FR-014**: Paddock MUST publish output artifacts only through the existing task artifact and redaction path, and SPEC-014C run evidence MUST expose only descriptor fields for any artifact reference.
- **FR-015**: Paddock MUST reject structurally unsafe artifact or evidence content before redaction, and MUST redact only secret-shaped values inside otherwise bounded safe summaries before they become operator-visible.
- **FR-016**: Paddock MUST fail closed with `user_input_unsupported` when Codex app-server requests live user input or MCP elicitation.
- **FR-017**: Paddock MUST fail closed with `approval_unsupported` or `tool_file_unsupported` when Codex app-server requests command approval, file-change approval, permission escalation, dynamic tool execution, MCP tool execution, or file/tool access that SPEC-014C cannot safely handle.
- **FR-018**: Paddock MUST fail closed with `capability_unsupported` when Codex app-server asks for a capability outside the admitted manifest/capability packet.
- **FR-019**: Paddock MUST fail closed with `timeout_budget_expired`, `binary_unavailable`, `malformed_protocol`, or `unsafe_evidence_rejected` for timeout, command lookup/spawn failure, exit before valid handshake, malformed event/protocol, structurally unsafe output, artifact policy rejection, or redaction that cannot produce a safe non-empty derivative.
- **FR-020**: Paddock MUST leave task terminal state, successor selection, direct GitHub state, auto-merge behavior, Aegis/owner gates, and governance policy unchanged from this adapter path.
- **FR-021**: Paddock MUST release, defer, abort, or preserve claims only through existing claim/reconciliation and claim-control semantics; successful ownership release uses `launch_handoff_completed`, adapter failures and timeouts use `dispatch_failed`, and SPEC-014C reason codes live in bounded evidence rather than claim release reasons.
- **FR-022**: Paddock MUST provide operator-visible evidence that distinguishes launched, completed, failed, timed out, blocked, unsafe, unavailable-binary, abandoned-by-claim-control, and cleanup-failed outcomes.
- **FR-023**: Paddock MUST require HAL UAT with one real Codex app-server launch for a marker-scoped disposable GitHub-linked assigned stage with workspace-scoped `FEATURE_TASK_CONTROL_PLANE` and `FEATURE_AGENT_RUNNER_SANDBOXES` enabled.
- **FR-024**: Paddock MUST block SPEC-014C completion if HAL cannot resolve `codex`, complete a real app-server handshake/thread/turn launch from the Paddock-owned sandbox, or clean disposable UAT residue after evidence capture.
- **FR-025**: Paddock MUST include scope guards and review packet traceability proving SPEC-014E owns richer transcript/event retention and SPEC-014F owns live operator intervention.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.
- SPEC-014C must create or update PR review evidence under `specs/014c-first-real-harness-adapter/` so reviewers can trace requirements, verification, HAL UAT, and follow-up ownership.
- SPEC-014C must retain only descriptor-level checked-in UAT evidence and cleanup proof; live HAL disposable rows, sandbox directories, and artifact files are not durable evidence and must be cleaned unless an explicit retained-evidence exception is recorded.

### Reviewability Budget *(mandatory)*

- **Primary surface**: harness/adapter
- **Secondary surfaces, if any**: narrow dispatch/evidence integration only; no new dashboard, live intervention UI, retention platform, broad scheduler rewrite, or schema-heavy run platform
- **Projected reviewable LOC**: 700-1,100 before tests and generated evidence
- **Projected production files**: 6-8
- **Projected total files**: 12-18 including focused tests, spec artifacts, UAT report, and PR review packet
- **Budget result**: within budget only if Plan confirms one adapter plus narrow dispatch/evidence changes; split required if a second primary surface is needed
- **Split decision**: SPEC-014C remains one spec because it proves one Codex app-server adapter. Rich transcript/event retention belongs to SPEC-014E, and live user-input/tool-approval intervention belongs to SPEC-014F.

### PR Review Packet Requirements *(mandatory)*

- PR description MUST include: what changed, why, non-goals, review order, scope budget, traceability, verification evidence, known gaps, and rollback or feature-flag notes.
- Traceability MUST map each major requirement or success criterion to changed files and verification evidence.
- Deferred work MUST name the follow-up spec or issue.
- The PR review packet MUST include the HAL real-launch UAT result and MUST state that fake-only evidence is insufficient for SPEC-014C completion.
- The PR review packet MUST cite the source design concept: `docs/ai/specs/SPEC-014C-design-concept.md`.

### Key Entities *(include if feature involves data)*

- **Codex App-Server Adapter Manifest**: The admitted real harness definition for SPEC-014C, including launch support, bounded timeout, sandbox posture, supported capabilities, usage/failure summary behavior, and non-interactive unsupported-event policy.
- **Codex App-Server Protocol Event**: A bounded JSON-RPC request, response, notification, or server request from the official app-server protocol. Required lifecycle events are the handshake, `thread/start`, `turn/start`, `turn/started`, `turn/completed`, and safe output/usage evidence.
- **Runtime Inventory Eligibility Decision**: The pre-launch decision that combines manifest, assignment, task, governance, capability, feature flag, and lifecycle eligibility for a claimed stage.
- **Claimed Stage Attempt**: The already-owned unit of work that may be launched by the adapter, tied to task id, stage key, claim id, assignment role, workspace, repository, and handoff requirements.
- **Paddock-Owned Sandbox Lifecycle**: The bounded workspace/cwd evidence created or prepared before launch and finalized or cleaned up after the attempt.
- **Adapter Run Evidence**: The operator-visible run, attempt, lifecycle, activity, usage, failure, and artifact-reference summary generated by the Codex app-server attempt. SPEC-014C uses descriptor-only `codex_app_server_run.v1` metadata and does not add raw transcript or protocol retention.
- **Safe Artifact Reference**: A redacted or sanitized descriptor published through the existing artifact safety path, never a storage URI, raw content, preview text, original filename, transcript, provider payload, tool payload, prompt body, secret, unsafe URI, or unsafe host-path leak.
- **Failure Summary**: The bounded failure packet that records one of the approved SPEC-014C reason codes plus safe diagnostic category, phase, counts, related ids, rejected field paths, and safe hash/size where available.
- **HAL UAT Fixture**: A marker-scoped disposable workspace, operator session, project, workflow stage, assignment, GitHub-linked task, healthy sync evidence, stage attempt, active claim, and Paddock-owned sandbox lifecycle used to prove one real Codex app-server launch plus deterministic failure fixtures, artifact safety, lifecycle cleanup, and zero-residue cleanup on the target deployment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of eligible disposable claimed-stage UAT attempts launch exactly one real Codex app-server run from the Paddock-owned sandbox and produce run, attempt, lifecycle, activity, and safe evidence summaries visible to an operator.
- **SC-002**: 100% of ineligible launch cases tested for flag OFF, missing assignment, non-GitHub-linked task, governance denial, manifest mismatch, and lifecycle failure are blocked before launch with a specific reason.
- **SC-003**: 100% of tested unsupported user-input, approval, tool/file, unsupported capability, timeout, unavailable binary, malformed protocol, and unsafe evidence cases fail closed with the expected reason code; HAL failure-mode UAT may use deterministic fixtures only when they exercise the same parser, failure mapper, lifecycle, timeout, and artifact/redaction code as live protocol events.
- **SC-004**: 0 tested SPEC-014C adapter paths directly mutate task terminal state, successor selection, GitHub state, Aegis/owner gates, auto-merge behavior, or governance policy.
- **SC-005**: 0 raw transcripts, provider payloads, tool payloads, prompt bodies, secrets, or unsafe host paths are published in operator-visible artifacts or evidence during validation.
- **SC-006**: Operators can determine launched, completed, failed, timed out, blocked, unsafe, unavailable-binary, abandoned-by-claim-control, and cleanup-failed outcomes from the recorded evidence without reading raw transcripts.
- **SC-007**: HAL UAT records one real Codex app-server handshake/thread/turn launch, deterministic failure fixture evidence, lifecycle cleanup, and zero disposable-row plus sandbox/artifact path residue before SPEC-014C can be accepted.
- **SC-008**: The PR review packet maps every P1-P3 user story and every failure category to verification evidence, with deferred retention/intervention work explicitly assigned to SPEC-014E or SPEC-014F.

## Assumptions

- Codex app-server remains the selected first real adapter; choosing a different first adapter would require an explicit scope revision before planning.
- Existing claim/reconciliation, retry/debug, claim-control, runtime-inventory, sandbox lifecycle, artifact, run, attempt, and activity surfaces can carry bounded SPEC-014C evidence unless Plan proves otherwise.
- Existing artifact safety and secret/redaction behavior is the default publication path for all operator-visible output.
- Exact descriptor field names for artifact MIME/size/count and adapter evidence status are finalized in Plan/contracts, but the descriptor-only safety boundary is fixed by this spec.
- Same-run continuation is optional and remains in scope only inside the same live Codex thread while the adapter subprocess is active and the claim/attempt is current. Cross-tick `thread/resume` ownership is out of SPEC-014C.
- If Codex app-server asks for live user input or approval, SPEC-014C records failure rather than pausing for operator intervention.
- Each continuation turn must reassert or verify the bounded cwd, runtime workspace roots, sandbox, and approval posture before sending additional input.
- Task-stage attempts remain passive evidence. Active claim rows remain the ownership authority, and retry eligibility must not be inferred from claim release state alone.
- The run model supports a distinct `timeout` status, while task-stage attempts represent timeout as `failed` with `timeout_budget_expired` evidence.
- HAL must have an available Codex app-server binary for acceptance; if unavailable, UAT blocks instead of accepting fake-only validation.
- HAL UAT fixture data is disposable. Checked-in UAT artifacts retain redacted descriptor evidence and cleanup proof, not raw live rows, raw app-server payloads, or sandbox contents.
- No UI surface is expected unless Plan proves existing evidence surfaces cannot show the required summaries.
- No schema migration is expected unless Plan proves existing run, attempt, claim, lifecycle, artifact, and activity records cannot store bounded evidence.

### External Context Applied

- OpenAI Harness Engineering, retrieved 2026-06-04: https://openai.com/index/harness-engineering/
- OpenAI Symphony announcement, retrieved 2026-06-04: https://openai.com/index/open-source-codex-orchestration-symphony/
- Symphony SPEC, retrieved 2026-06-04: https://github.com/openai/symphony/blob/main/SPEC.md
- Codex App Server docs, retrieved 2026-06-04: https://developers.openai.com/codex/app-server/

These sources are applied only for launch/resume vocabulary, workspace cwd and sandbox posture, approval/user-input behavior, unsupported-capability handling, and validation profile decisions. SPEC-014C does not import Symphony's implementation stack, tracker assumptions, scheduler policy, Linear assumptions, or auto-merge behavior.
