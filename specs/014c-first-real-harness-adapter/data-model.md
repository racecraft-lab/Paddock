# Data Model: SPEC-014C First Real Harness Adapter Pilot

## Storage Decision

No new schema migration is planned. These entities are runtime and evidence contracts mapped onto existing Paddock rows: runs, task-stage attempts, task-stage claims, sandbox lifecycles, activities, usage/failure summaries, and task artifact references.

## Entity: Codex App-Server Adapter Manifest

Represents the single real adapter admitted by SPEC-014C.

Fields:

- `adapterId`: stable id for Codex app-server.
- `schemaVersion`: manifest schema version from SPEC-014B.
- `command`: argv contract for `codex app-server proxy`.
- `supportsLaunch`: true.
- `supportsContinuation`: true only for same live thread/current claim attempt.
- `timeoutMs`: bounded manifest timeout.
- `sandboxPosture`: Paddock-owned SPEC-014A lifecycle root required.
- `capabilities`: allowed non-interactive capabilities for this adapter.
- `artifactPolicy`: publish only through existing artifact safety path.
- `usagePolicy`: prefer token usage notifications, otherwise partial/unavailable.
- `unsupportedRequestPolicy`: fail closed.

Validation rules:

- Exactly one Codex app-server real adapter manifest is created for SPEC-014C.
- The manifest must be absent-safe and feature-flag gated.
- The manifest must not declare live intervention, auto-approval, raw transcript retention, OpenClaw behavior, or a second adapter.

## Entity: Runtime Inventory Eligibility Decision

Represents the pre-launch decision for an already claimed stage.

Fields:

- `workspaceId`
- `taskId`
- `stageKey`
- `repository`
- `assignmentId`
- `manifestId`
- `claimId`
- `claimRunId`
- `attemptId`
- `lifecycleId`
- `featureFlags`
- `governanceDecision`
- `capabilityPacket`
- `status`: `eligible` or `blocked`
- `reasonCode`: bounded ineligible reason when blocked

Validation rules:

- Eligible only when task is GitHub-linked, assigned, governed as allowed, claimed, current, and matched to the Codex manifest.
- `FEATURE_TASK_CONTROL_PLANE` and `FEATURE_AGENT_RUNNER_SANDBOXES` must be enabled through workspace-scoped JSON for HAL UAT.
- Feature flag OFF, stale claim, unassigned stage, manifest mismatch, missing lifecycle, lifecycle not Paddock-owned, governance denial, or capability mismatch blocks launch.

## Entity: Claimed Stage Attempt

Represents the unit of work that may be launched.

Fields:

- `taskId`
- `stageKey`
- `attemptId`
- `claimId`
- `claimRunId`
- `workspaceId`
- `repository`
- `status`
- `runId`
- `manifestId`
- `lifecycleId`

State transitions:

```text
current claimed attempt
  -> launched evidence
  -> succeeded                 # success only
  -> failed                    # timeout, unsupported request, malformed protocol, unsafe evidence, unavailable binary
  -> no adapter write          # when claim-control/stale recovery wins before terminal evidence
```

Validation rules:

- The adapter must re-prove current active ownership before continuation or terminal writes.
- Success must preserve final attempt status `succeeded`; a later retry-eligible release state must not become final attempt evidence.
- When claim-control or stale recovery wins, abandoned evidence is recorded only through bounded run/activity metadata when safe; the adapter must not invent an `abandoned` task-stage attempt status.
- Adapter code must not mark the task terminal or mutate GitHub.

## Entity: Paddock-Owned Sandbox Lifecycle

Represents the SPEC-014A bounded cwd/runtime root for the adapter.

Fields:

- `lifecycleId`
- `workspaceId`
- `taskId`
- `stageKey`
- `attemptId`
- `rootDescriptor`
- `state`: existing SPEC-014A lifecycle status, including `prepared`, `running`, `terminal`, `cleanup_pending`, `cleaned_up`, and `cleanup_failed`
- `cleanupStatus`

State transitions:

```text
prepared
  -> running
  -> terminal -> cleanup_pending -> cleaned_up
  -> cleanup_failed
```

Validation rules:

- Subprocess process `cwd`, `ThreadStartParams.cwd`, and runtime workspace roots must be bounded to the lifecycle root.
- Host-global or operator-environment cwd is invalid.
- Adapter completion, failure, and timeout are recorded in run/attempt/failure evidence; sandbox lifecycle uses the coarse SPEC-014A `terminal` state before cleanup.
- Cleanup failure is recorded as `cleanup_failed` and left inspectable instead of hidden.

## Entity: Codex App-Server Protocol Session

Represents bounded protocol correlation for one live adapter attempt.

Fields:

- `threadId`
- `threadSessionId`
- `turnIds`
- `handshakeCompleted`
- `turnStarted`
- `terminalStatus`
- `usageAvailability`

Required flow:

```text
initialize response
initialized notification
thread/start response
thread/started notification
turn/start response
turn/started notification
turn/completed notification
```

Validation rules:

- Missing required thread/turn ids, response id mismatch, duplicate terminal events, invalid JSON-RPC/JSONL, or impossible ordering maps to `malformed_protocol`.
- `item/completed` agent messages are output evidence only.
- Same-run continuation is allowed only while the same live process, thread, claim, and attempt remain current.

## Entity: Adapter Run Evidence

Descriptor-only `codex_app_server_run.v1` metadata written through existing evidence surfaces.

Fields:

- `schemaVersion`
- `adapterId`
- `runId`
- `workspaceId`
- `taskId`
- `stageKey`
- `attemptId`
- `claimId`
- `claimRunId`
- `manifestId`
- `lifecycleId`
- `status`
- `outcome`
- `phase`
- `reasonCode`
- `protocol`
- `usage`
- `artifactRefs`
- `failure`
- `safety`
- `timestamps`

Validation rules:

- No raw transcript, protocol payload, prompt body, provider payload, tool payload, command/file-change detail, raw reasoning, host path, storage URI, external URL, original filename, or secret is allowed.
- Bounded safe summaries must pass length, non-empty, schema, redaction, and artifact policy checks.
- Structurally unsafe output maps to `unsafe_evidence_rejected`.

## Entity: Safe Artifact Reference

Represents descriptor-only artifact output.

Allowed fields:

- `artifactId`
- `artifactType`
- `schemaVersion`
- `mimeType`
- `byteSize`
- `itemCount`
- `sha256`
- `redactionStatus`
- `securityScanStatus`
- `producedAt`
- `safeSummary`
- `safeLabel`

Forbidden fields:

- Storage URI.
- Raw content.
- Preview text.
- Original filename.
- Cwd, sandbox, or host paths.
- External URLs.
- Provider/tool/MCP payloads.
- Transcripts.
- Prompt bodies.
- Command/file-change contents.

## Entity: Failure Summary

Bounded failure packet for operator-visible diagnostics.

Fields:

- `reasonCode`: `user_input_unsupported`, `approval_unsupported`, `tool_file_unsupported`, `capability_unsupported`, `timeout_budget_expired`, `binary_unavailable`, `malformed_protocol`, `unsafe_evidence_rejected`, `abandoned_by_claim_control`, `cleanup_failed`
- `phase`
- `safeDiagnosticCategory`
- `relatedIds`
- `counts`
- `rejectedFieldPaths`
- `safeHash`
- `safeSize`
- `runErrorLabel`

Validation rules:

- Failure summaries must not contain raw protocol excerpts, provider/tool payloads, command details, file-change contents, secrets, or host paths.
- Timeout uses run `status=timeout`, run `outcome=failed`, attempt `failed`, claim release `dispatch_failed`, and reason `timeout_budget_expired`.

## Entity: HAL UAT Fixture

Marker-scoped disposable target deployment fixture for completion.

Fields:

- `marker`
- `workspaceId`
- `operatorUserId`
- `sessionId`
- `projectId`
- `workflowTemplateId`
- `stageKey`
- `assignmentId`
- `taskId`
- `githubRepo`
- `githubIssue`
- `syncEvidenceId`
- `attemptId`
- `claimId`
- `lifecycleId`
- `runId`
- `artifactRefs`
- `cleanupProof`

Validation rules:

- One real Codex app-server handshake/thread/turn launch is mandatory.
- Deterministic negative fixtures are valid only when they exercise the same target parser, failure mapper, timeout, lifecycle, and artifact/redaction code.
- Completion blocks unless marker-scoped DB rows, sandbox paths, and artifact paths have zero residue after report capture.
