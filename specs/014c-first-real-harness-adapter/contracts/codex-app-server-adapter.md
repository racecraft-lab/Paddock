# Contract: Codex App-Server Adapter

## Purpose

Define the single SPEC-014C real harness adapter contract for Codex app-server. This is an internal Paddock adapter contract, not a new public API.

## Adapter Identity

- `adapterId`: `codex-app-server`
- `schemaVersion`: SPEC-014B-compatible manifest version
- `evidenceSchemaVersion`: `codex_app_server_run.v1`
- Primary surface: harness/adapter

## Manifest Contract

The manifest must declare:

- Launch support.
- Same-run continuation support only inside the same live thread/current claim attempt.
- Bounded timeout support.
- Required Paddock-owned sandbox lifecycle posture.
- Artifact publication support through existing task artifact safety path.
- Usage accounting from `thread/tokenUsage/updated` when available.
- Non-interactive unsupported-event behavior.
- Allowed capability packet for SPEC-014C.

The manifest must not declare:

- A second real adapter.
- OpenClaw-specific behavior.
- Live operator answer/approval UI.
- Auto-approval behavior.
- Raw transcript or protocol retention.
- Direct task terminal, GitHub, successor, auto-merge, or governance mutation authority.

## Launch Contract

Dispatch may call the adapter only after existing claim/reconciliation and governance checks establish active ownership.

Required launch inputs:

- `workspaceId`
- `taskId`
- `stageKey`
- `repository`
- `githubIssueTitle`
- `githubIssueBody`
- `githubIssueUrl`
- `workflowTemplateId`
- `stageInstructions`
- `assignmentRole`
- `claimId`
- `claimRunId`
- `attemptId`
- `manifestId`
- `capabilityPacket`
- `lifecycleId`
- `lifecycleRoot`
- `timeoutMs`

Launch command:

```text
codex app-server proxy
```

Process rules:

- Spawn without a shell.
- Set process `cwd` to the SPEC-014A lifecycle root.
- Use stdio for JSON-RPC protocol transport.
- Enforce manifest timeout.
- Terminate or cancel the subprocess on timeout, unsupported request, malformed protocol, unsafe evidence, cancellation, or stale ownership.
- If termination or cancellation fails after terminal classification, append bounded `cleanup_failed` evidence with `phase=subprocess_termination` and preserve the original run, attempt, claim, and reason evidence.

## Protocol Contract

Required sequence:

```text
ClientRequest initialize
Server response initialize
Client notification initialized
ClientRequest thread/start
Server response thread/start
ServerNotification thread/started
ClientRequest turn/start
Server response turn/start
ServerNotification turn/started
ServerNotification turn/completed
```

`ThreadStartParams` must include bounded values for:

- `cwd`
- `runtimeWorkspaceRoots`
- `approvalPolicy`
- `approvalsReviewer`
- `sandbox`
- `permissions`
- `experimentalRawEvents` only if required for protocol compatibility and never persisted raw

`TurnStartParams` must include:

- `threadId`
- `input`
- Optional overrides only when they reassert the same bounded cwd/runtime roots/sandbox/permission posture.

Terminal authority:

- `turn/completed.turn.status` determines terminal protocol status.
- `item/completed` agent messages are output evidence only.

Unsupported server requests:

- `item/tool/requestUserInput` and non-approval MCP elicitation map to `user_input_unsupported`.
- `item/commandExecution/requestApproval`, network approval contexts, experimental additional permission requests, legacy exec/apply-patch approvals, permission approvals, and approval-like MCP connector elicitations map to `approval_unsupported`.
- `item/fileChange/requestApproval`, dynamic tool calls, MCP tool calls, and unsupported file/tool access map to `tool_file_unsupported` or `capability_unsupported`.

Malformed protocol:

- Invalid JSON-RPC/JSONL.
- Response id mismatch.
- Duplicate response for the same client request id.
- Missing required thread/turn ids.
- Duplicate required lifecycle events.
- Duplicate terminal events.
- Impossible lifecycle ordering.
- Exit before valid handshake.

Unknown optional notifications may be ignored or recorded as bounded counts only if they do not corrupt the required flow.

## Input Contract

The adapter prompt/input may include bounded:

- GitHub issue title, body, and link.
- Workflow template and stage instructions.
- Task id and stage key.
- Assignment role.
- Repository/workspace identifier needed for handoff.
- Claim id and manifest id.
- Capability packet.
- Explicit handoff requirements.

The adapter prompt/input must not include:

- Raw database rows.
- Secrets.
- Full prior transcripts.
- Provider payloads.
- Tool payloads.
- Broad operator context.
- Unrelated task history.
- Host-global paths outside the lifecycle root.

## Output And Artifact Contract

Output is accepted only after structural safety validation.

Allowed output evidence:

- Bounded safe summary.
- Descriptor-only artifact references.
- Bounded output counts.
- Digest/hash/size metadata.
- Redaction/security scan status.

Forbidden output evidence:

- Raw transcript.
- Raw protocol payload.
- Provider/tool/MCP payload.
- Prompt body.
- Command or file-change details.
- Raw reasoning.
- Host path or unsafe URI.
- Secret value.
- Storage URI.
- Original filename.

Structurally unsafe output fails with `unsafe_evidence_rejected`. Secret-shaped values inside otherwise bounded safe summaries may be redacted, then the derivative must be revalidated.

## Failure Reason Codes

Blocked admission reason codes:

- `feature_disabled`
- `adapter_unassigned`
- `not_github_linked`
- `manifest_invalid`
- `manifest_mismatch`
- `missing_claim`
- `stale_claim`
- `missing_attempt`
- `governance_denied`
- `capability_unsupported`
- `sandbox_lifecycle_missing`
- `sandbox_lifecycle_not_paddock_owned`
- `sandbox_lifecycle_not_ready`
- `workspace_mismatch`
- `repository_mismatch`
- `authorization_denied`

Adapter attempt failure reason codes:

- `user_input_unsupported`
- `approval_unsupported`
- `tool_file_unsupported`
- `capability_unsupported`
- `timeout_budget_expired`
- `binary_unavailable`
- `malformed_protocol`
- `unsafe_evidence_rejected`
- `abandoned_by_claim_control`
- `cleanup_failed`

## Success Contract

Success requires:

- Official handshake completed.
- Thread and turn launched.
- `turn/completed.turn.status` maps to success.
- Safe output/evidence is accepted or safely absent.
- Run records `status=completed`, `outcome=success`.
- Final task-stage attempt records `succeeded`.
- Claim ownership is released with `launch_handoff_completed`.

The adapter must preserve `succeeded` as final attempt evidence.
