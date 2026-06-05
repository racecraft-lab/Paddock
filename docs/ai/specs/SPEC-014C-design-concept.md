---
spec_id: "SPEC-014C"
title: "First Real Harness Adapter Pilot"
mode: "setup"
date: "2026-06-04"
interview: "Grill Me"
question_count: 15
status: "complete"
stop_reason: "natural"
---

# Design Concept: SPEC-014C First Real Harness Adapter Pilot

Source roadmap: `docs/ai/rc-factory-technical-roadmap.md`, Phase 12C.

SPEC-014C proves the first real harness adapter path on top of the completed SPEC-014A sandbox lifecycle contract, SPEC-014B adapter manifest/runtime-inventory contract, and SPEC-013B through SPEC-013D claim-control path. The selected pilot is Codex app-server.

The design keeps the first real adapter reviewable: one adapter module, one smoke path, bounded run/debug evidence, sanitized artifact publication, lifecycle cleanup, and fail-closed unsupported capability behavior. Rich transcript retention and live operator intervention are real product needs, but they are split into future SPEC-014E and SPEC-014F so this first pilot does not become a broad runtime platform PR.

## Goals

- Launch one real Codex app-server adapter for an already-claimed GitHub-linked task stage.
- Use SPEC-014B manifest/runtime-inventory eligibility before launch.
- Use SPEC-014A Paddock-owned sandbox lifecycle evidence as the run cwd boundary.
- Create bounded run evidence through existing `AgentRun`, task-stage attempt, sandbox lifecycle, activity, and artifact surfaces.
- Publish only sanitized summaries and artifact descriptors through existing artifact/redaction behavior.
- Record bounded usage and failure summaries where Codex app-server exposes them.
- Fail closed on unsupported user-input, tool/file approval, capability, timeout, and unsafe evidence cases.
- Require HAL post-merge UAT with one real Codex app-server launch, not fake-only proof.

## Non-goals

- No second real adapter.
- No OpenClaw-specific behavior; SPEC-014D owns OpenClaw/external harness work.
- No local-only task intake, successor-template choice, Aegis bypass, owner-gate bypass, direct GitHub mutation, task terminal mutation, or auto-merge.
- No pre-running Paddock service daemon for Codex app-server.
- No host-global cwd or operator-environment cwd.
- No raw transcript/provider/tool payload persistence in SPEC-014C.
- No live operator prompt, answer, approval, or stop UI in SPEC-014C.
- No automatic safe-list approval of tool/file requests.
- No broad retention/replay/debug export policy; SPEC-014E owns that.

## Key Decisions

| Question | Decision |
|---|---|
| Q1 Adapter choice | Use Codex app-server first. OpenClaw-specific integration is deferred to SPEC-014D unless a narrow compatibility reference is needed. |
| Q2 Launch trigger | Use the existing dispatch path only. After SPEC-013B claim/reconciliation admits a GitHub-linked assigned stage, Paddock evaluates `runtime_inventory.v1`, selects the Codex app-server manifest, creates or uses SPEC-014A lifecycle evidence, and starts adapter handoff. No operator launch button or bypass route. |
| Q3 Launch vs resume | Implement `launch` as the required happy path. Support `resume` or `continue` only as bounded same-run continuation if Codex app-server exposes a session/thread id from first launch. Full cross-tick resume stays out of v1 unless implementation evidence proves it is already available without owning Paddock retry. |
| Q4 Process model | Spawn one `codex app-server` subprocess per admitted stage attempt using manifest-declared command and bounded stdio/protocol timeouts. No pre-running daemon or service requirement. |
| Q5 Turn input | Send a bounded task-stage prompt assembled from existing evidence: GitHub issue title/body/link, workflow template/stage instructions, task id/stage key, assignment role, repo/workspace path, claim id, manifest id, allowed capability packet, and explicit handoff requirements. Do not send raw DB rows, secrets, full prior transcripts, or broad operator context. |
| Q6 Persistence | Persist adapter-run evidence only: `AgentRun`/run packet, bounded usage/failure summaries, task artifact references or sanitized output summaries, lifecycle events, and activity evidence tied to claim/stage. Do not directly mark tasks done, auto-merge, choose successors, or mutate GitHub terminal state. |
| Q7 User-input requests | SPEC-014C fails closed when Codex app-server asks for live user input, recording `user_input_unsupported` evidence. The operator clarified that live operator answering is still desired; SPEC-014F is added as the future UI owner. |
| Q8 Artifact/output handling | Store only bounded sanitized summaries and artifact descriptors through existing artifact/redaction paths. Raw transcripts, provider payloads, and tool payloads stay out of Paddock artifacts. Unsafe content fails closed with evidence. |
| Q9 Retention roadmap gap | Add SPEC-014E for harness run evidence retention and transcript policy. It owns transcript/event retention, replay/debug exports, quarantine, retention, and opt-in raw capture policy. |
| Q10 Intervention UI roadmap gap | Add SPEC-014F for harness operator intervention UI. It owns live user-input/tool-approval prompts, pause/resume state, operator answer capture, deny/timeout behavior, and task-detail evidence integration. |
| Q11 Approval/tool/file requests | Run with a bounded non-interactive policy. Unsupported approval, tool, file, or capability requests fail closed with adapter evidence. Live approvals and operator responses belong to SPEC-014F. |
| Q12 Sandbox boundary | Use SPEC-014A Paddock-owned sandbox lifecycle only. Create/prepare lifecycle before launch, run Codex app-server with cwd inside the bounded lifecycle root, and record terminal/cleanup evidence. No service-wide daemon or host-global cwd. |
| Q13 Run contract | Success records `AgentRun`, task-stage attempt lifecycle, sandbox lifecycle, bounded usage summary, and sanitized artifact references. Failure records the same evidence with reason code and releases/deferes the claim through existing reconciliation. The adapter does not mutate task terminal state or GitHub. |
| Q14 Timeout/stop | Enforce manifest bounded runtime timeout. On expiry terminate the per-attempt subprocess, record `timeout_budget_expired`/failure evidence, mark attempt/run failed, and release the claim via existing reconciliation. No operator stop button in SPEC-014C. |
| Q15 UAT gate | Require one real Codex app-server launch on HAL for a disposable GitHub-linked assigned stage, plus feature-flag-off, unsupported user-input/tool/approval, timeout, artifact redaction, lifecycle cleanup, and zero-residue checks. If `codex app-server` is unavailable on HAL, UAT blocks rather than accepting fake-only proof. |

## Follow-up Specs Added During Setup

### SPEC-014E: Harness Run Evidence Retention and Transcript Policy

This is the future owner for richer harness evidence storage. It should define default-off raw capture, retention windows, redaction/quarantine, replay/debug exports, storage health, and operator audit controls. SPEC-014C must leave only bounded sanitized summaries and references.

### SPEC-014F: Harness Operator Intervention UI

This is the future owner for live user-input/tool-approval intervention. It should reuse SPEC-013D expected-state/idempotency patterns, expose intervention from the existing task/detail evidence experience, and support answer/deny/timeout without auto-answer behavior.

## Implementation Boundaries

- Adapter layer should extend the SPEC-014B `src/lib/harness-adapters/` contract rather than widening the older `src/lib/adapters/` framework adapter surface.
- Dispatch integration must remain after claim/reconciliation and governance eligibility, not before.
- Runtime inventory eligibility remains the preflight authority for manifest assignment, capabilities, policies, governance, tracker-linked task eligibility, and sandbox lifecycle evidence.
- Task-stage attempts and claims remain the control-plane source for active ownership, release, retry, and cancellation semantics.
- Existing task artifact publication and secret detection remain the only artifact path.
- Existing task detail/evidence surfaces are the operator visibility target for run debug; no dashboard or launch UI is added.

## External Context To Fetch During Specify And Plan

Retrieve current context on the day each phase runs and cite the sources in generated artifacts:

- OpenAI Harness Engineering: https://openai.com/index/harness-engineering/
- OpenAI Symphony announcement: https://openai.com/index/open-source-codex-orchestration-symphony/
- Symphony SPEC: https://github.com/openai/symphony/blob/main/SPEC.md
- Codex App Server docs: https://developers.openai.com/codex/app-server/

Use these sources only to ground launch/resume vocabulary, workspace cwd/sandbox posture, approval/user-input behavior, unsupported-capability handling, and validation profile decisions. Do not import Symphony's implementation stack, tracker assumptions, scheduler policy, or auto-merge behavior.

## Clarify Targets

- Exact `codex app-server` protocol event names and how launch, continuation, usage, and failure events map to Paddock's adapter contract.
- Whether same-run continuation has a stable Codex session/thread id and whether it can be supported without owning cross-tick resume.
- Stable SPEC-014C reason-code mapping for user-input, tool/file approval, timeout, unsafe evidence, protocol error, unavailable binary, and malformed event failures.
- Minimal sanitized artifact payload shape for Codex output summaries and artifact descriptors.
- Exact HAL UAT fixture shape for a disposable GitHub-linked assigned stage.
