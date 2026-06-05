# Implementation Plan: SPEC-014C First Real Harness Adapter Pilot

**Branch**: `014c-first-real-harness-adapter` | **Date**: 2026-06-05 | **Spec**: `specs/014c-first-real-harness-adapter/spec.md`
**Input**: Feature specification from `specs/014c-first-real-harness-adapter/spec.md`, including all four clarification sessions.

## Summary

SPEC-014C adds exactly one real harness adapter: Codex app-server behind the SPEC-014B runtime-inventory registry. The adapter is admitted only after SPEC-013B/C/D claim ownership and governance are current, runs from a SPEC-014A Paddock-owned sandbox lifecycle root, records descriptor-only `codex_app_server_run.v1` evidence through existing run/attempt/lifecycle/activity/usage/failure/artifact-reference surfaces, and fails closed for unsupported user input, approvals, tools/files, capability requests, malformed protocol, timeout, unavailable binary, and unsafe evidence.

The implementation remains bounded to the harness-adapter primary surface plus narrow dispatch/evidence integration. SPEC-014E owns richer transcript/event retention and SPEC-014F owns live operator intervention UI.

External context refreshed by parent on 2026-06-05 and applied only for launch/resume vocabulary, workspace/sandbox posture, non-interactive behavior, conformance framing, and logging/evidence safety:

- OpenAI Harness Engineering: https://openai.com/index/harness-engineering/
- OpenAI Symphony announcement: https://openai.com/index/open-source-codex-orchestration-symphony/
- Symphony SPEC: https://github.com/openai/symphony/blob/main/SPEC.md
- Codex App Server docs: https://developers.openai.com/codex/app-server/
- Codex non-interactive mode: https://developers.openai.com/codex/noninteractive
- NIST conformance discussion: https://www.nist.gov/itl/ssd/information-systems-group/what-thing-called-conformance
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

Local Codex protocol evidence supplied by the parent and verified during planning:

- `codex --version` returned `codex-cli 0.133.0`.
- `codex app-server --help` exposes `daemon`, `proxy`, `generate-ts`, and `generate-json-schema`; no `serve` command exists.
- `codex app-server generate-ts --out /tmp/spec-014c-codex-app-server-schema/ts --experimental` succeeded.
- `codex app-server daemon --help` and `codex app-server proxy --help` were checked during Plan.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22  
**Primary Dependencies**: Existing Next.js 16 App Router, React 19, Zustand where already used, `better-sqlite3`, Tailwind CSS 3, Vitest, ESLint, pnpm, Node built-in `child_process`, stream, timer, crypto, and filesystem APIs  
**Storage**: Existing SQLite surfaces through `better-sqlite3`: runs, task-stage attempts, task-stage claims, sandbox lifecycles, task artifacts, activities, usage/failure summaries where already represented; no new table planned  
**Testing**: Vitest for adapter protocol, failure mapping, runtime-inventory eligibility, dispatch seam, lifecycle ordering, artifact safety, scope guard, and static no-mutation checks; Playwright only if an existing evidence UI is changed, which Plan does not require  
**Target Platform**: Paddock server runtime on Node >=22, including HAL deployment for UAT  
**Project Type**: Next.js web application with server-side runtime/adapter integration  
**Performance Goals**: One admitted adapter attempt starts at most one `codex app-server proxy` transport subprocess; prompt and evidence envelopes are bounded; manifest timeout is enforced; usage extraction is O(event count) over the live protocol stream  
**Constraints**: No second adapter, no OpenClaw-specific behavior, no new launch route/button, no live intervention UI, no transcript-retention platform, no direct task terminal mutation, no direct GitHub mutation, no successor selection, no auto-merge, no raw transcript/protocol/provider/tool/prompt payload retention  
**Scale/Scope**: One adapter manifest and one adapter implementation; 6 production modules planned, focused tests, generated plan artifacts, HAL UAT/report packet later in implementation  
**Runtime Dependency Decision**: No new runtime dependency is required. JSON-RPC framing, subprocess control, timeout handling, hashing, and bounded schema checks can be implemented with Node built-ins and existing project helpers.  
**Schema Migration Decision**: No schema migration is required. Existing run, attempt, claim, sandbox lifecycle, activity, usage/failure, and artifact-reference surfaces can carry descriptor-only `codex_app_server_run.v1` metadata.  
**Reviewability Budget**: Primary surface is `harness/adapter`; secondary surface is narrow dispatch/evidence integration. Planned production files: 6. Planned total files: 16-18 including tests, contracts, quickstart, UAT/report packet placeholders later. Projected production LOC is within the spec budget only if tasks keep the adapter and dispatch seam narrow.  
**Strict Scope**: Add each new spec-owned TS/TSX module to `tsconfig.spec-strict.json` and `eslint.config.mjs`:

- `src/lib/harness-adapters/codex-app-server/manifest.ts`
- `src/lib/harness-adapters/codex-app-server/input.ts`
- `src/lib/harness-adapters/codex-app-server/protocol.ts`
- `src/lib/harness-adapters/codex-app-server/evidence.ts`
- `src/lib/harness-adapters/codex-app-server/runner.ts`
- `src/lib/task-dispatch-codex-app-server.ts`

## Architecture Decisions

### Adapter Location

Add Codex app-server under the stricter SPEC-014B harness-adapter layer, not the older framework-adapter layer. The manifest advertises launch support, bounded timeout support, Paddock-owned sandbox posture, artifact publication support, token/runtime accounting where available, and non-interactive fail-closed behavior.

### Transport Command

Use `codex app-server proxy` as the per-attempt stdio transport subprocess. Local help shows `daemon` is for local daemon management and `proxy` proxies stdio bytes to the app-server control socket. SPEC-014C does not introduce a Paddock-managed durable daemon or service.

The child process is spawned without a shell, with process `cwd` set to the prepared SPEC-014A lifecycle root. The adapter sends official app-server v2 JSON-RPC messages over stdio:

- Handshake: client `initialize`, server response, client `initialized`.
- Launch evidence: `thread/start`, `turn/start`, and `turn/started`.
- Terminal authority: `turn/completed.turn.status`.
- Output evidence: `item/completed` agent message only after safety validation.
- Usage: prefer `thread/tokenUsage/updated`; otherwise record partial or unavailable usage.

`ThreadStartParams` and `TurnStartParams` must carry bounded `cwd`, `runtimeWorkspaceRoots`, sandbox, approval, approvals-reviewer, and permission posture values matching the lifecycle root and admitted manifest. Same-run continuation is allowed only inside the same live thread/current claim attempt; no cross-tick `thread/resume` ownership is implemented.

### Dispatch Integration

Integrate after existing claim/reconciliation ownership and governance decisions. The adapter preflight rechecks:

- Workspace, task, stage key, repo, assignment, and GitHub-link identity.
- Active claim id, claim run id, linked attempt id, and nonterminal/current attempt.
- Runtime-inventory manifest, capability packet, assignment, governance, feature flag, and lifecycle posture.
- Paddock-owned lifecycle prepared/running state.

If any condition fails, dispatch records bounded ineligible/blocked evidence and does not launch. If ownership changes during preparation or execution, existing claim-control/stale recovery wins; the adapter terminates the subprocess and avoids late claim, attempt, task terminal, GitHub, successor, or governance mutation.

### Evidence And Artifacts

All evidence is descriptor-only `codex_app_server_run.v1` metadata through existing surfaces. Safe artifact references may include id/ref, type/kind, schema version, MIME/media type, byte size/count, digest, redaction/security status, timestamp, and optional bounded safe summary/digest/sanitized label. They must exclude storage URI, raw content, preview text, original filename, cwd/sandbox/host paths, external URLs, provider/tool/MCP payloads, transcripts, prompt bodies, command/file-change details, raw reasoning, and raw protocol payloads.

Structurally unsafe output is hard-rejected before redaction. Secret-shaped values may be redacted only inside an otherwise bounded safe summary, and the redacted derivative must still pass schema, length, non-empty, and artifact policy checks.

### Terminal Mapping

| Adapter outcome | Run evidence | Attempt evidence | Claim release | Reason evidence |
|---|---|---|---|---|
| Successful app-server turn | `status=completed`, `outcome=success` | final `succeeded` | `launch_handoff_completed` | Safe `codex_app_server_run.v1` summary |
| Timeout | `status=timeout`, `outcome=failed` | `failed` | `dispatch_failed` | `timeout_budget_expired` |
| Binary unavailable | `status=failed`, `outcome=failed` | `failed` | `dispatch_failed` | `binary_unavailable` |
| Malformed protocol | `status=failed`, `outcome=failed` | `failed` | `dispatch_failed` | `malformed_protocol` |
| User input/MCP elicitation | `status=failed`, `outcome=failed` | `failed` | `dispatch_failed` | `user_input_unsupported` |
| Approval/permission request | `status=failed`, `outcome=failed` | `failed` | `dispatch_failed` | `approval_unsupported` |
| Tool/file/MCP tool request | `status=failed`, `outcome=failed` | `failed` | `dispatch_failed` | `tool_file_unsupported` |
| Capability outside manifest | `status=failed`, `outcome=failed` | `failed` | `dispatch_failed` | `capability_unsupported` |
| Unsafe evidence | `status=failed`, `outcome=failed` | `failed` | `dispatch_failed` | `unsafe_evidence_rejected` |
| Claim-control/stale recovery wins | bounded abandoned evidence only when safe | do not overwrite newer state | existing authority wins | `abandoned_by_claim_control` |
| Cleanup failure after terminal write | terminal outcome preserved with cleanup evidence | terminal outcome preserved | terminal release preserved | `cleanup_failed` |

### Scope Guard

Tasks must include a diff/path-scoped static guard and runtime tests proving SPEC-014C-owned files do not introduce:

- A second real adapter or OpenClaw-specific behavior.
- Launch/stop/operator prompt UI, live answer capture, or approval UI.
- Transcript retention, replay/debug export, raw-capture policy, or protocol transcript storage.
- Direct task terminal updates, successor selection, `createTask`, `advanceTaskChain`, direct GitHub mutation, `syncTaskOutbound`, auto-merge, Aegis/owner-gate bypass, or governance mutation.

## Constitution Check

*GATE: Passed before Phase 0 research. Re-checked after Phase 1 design: passed.*

| Principle | Plan Result |
|---|---|
| I. Zero-Regression Contract | Pass. New behavior is behind existing workspace-scoped `FEATURE_AGENT_RUNNER_SANDBOXES` plus existing control-plane flag context. Flag OFF blocks launch and preserves legacy dispatch behavior. |
| II. Install Compatibility And Operational Impact | Pass. Classified as optional-adapter. No destructive schema or compatibility rename. Absent Codex binary fails closed with bounded evidence. |
| III. OpenClaw Adapter Isolation | Pass. No OpenClaw-specific behavior is added. SPEC-014D owns that surface. |
| IV. Test-First Development | Pass. Tasks must start with failing Vitest tests for manifest, protocol, failure, timeout, artifact safety, claim/lifecycle, dispatch, and scope guards. |
| V. Feature-Flag Resolution Discipline | Pass. Use existing `resolveFlag` path. No SPEC-014C-only flag and no env force-on behavior. |
| VI. Dependency Supply-Chain Hygiene | Pass. No new runtime dependency. |
| VII. Additive Migration Policy | Pass. No migration planned. |
| VIII. Successor Side-Effect Parity | Pass. Adapter must not call `createTask` or choose successors. |
| IX. Safe Evaluation Discipline | Pass. Protocol and artifact evidence are untrusted boundary inputs and map to typed results with bounded diagnostics. |
| X. Observability and Auditability | Pass. Run, attempt, lifecycle, activity, usage, failure, and artifact-reference evidence record state changes without raw payload leakage. |
| XI. Keep It Simple | Pass. One adapter, one dispatch seam, existing storage surfaces. |
| XII. Avoid Speculative Generality | Pass. No generic adapter platform, retention policy, or live intervention framework is added. |
| XIII. Defensive Boundaries | Pass. Subprocess, JSON-RPC, artifact output, timeout, and cleanup paths are classified into structured failure codes. |
| XIV. Real UI Journey Quality Gate | N/A unless implementation changes existing UI. Plan expects no new UI. |
| XV. Spec Artifact Provenance And Archive Sweep | Pass. Current target is excluded from archive cleanup. Generated evidence remains under `specs/014c-first-real-harness-adapter/` and descriptor-level only. |
| XVI. Reviewability And Verification Debt Control | Pass with bounded plan. One primary surface, narrow secondary integration, no split required unless tasks exceed 8 production files, 25 total files, a second primary surface, or a schema/UI/retention platform. |

## Project Structure

### Documentation

```text
specs/014c-first-real-harness-adapter/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── codex-app-server-adapter.md
│   ├── codex-app-server-dispatch-evidence.md
│   └── codex_app_server_run.v1.schema.json
├── uat-report.md              # created during implementation closeout
├── pr-review-packet.md        # created during implementation closeout
└── tasks.md                   # created by $speckit-tasks, not this phase
```

### Source Code

```text
src/lib/harness-adapters/
├── codex-app-server/
│   ├── manifest.ts
│   ├── input.ts
│   ├── protocol.ts
│   ├── evidence.ts
│   └── runner.ts
├── evidence.ts                # existing SPEC-014B evidence helper, extended narrowly if needed
├── runtime-inventory.ts       # existing SPEC-014B eligibility helper, extended narrowly if needed
└── types.ts                   # existing contract types, extended narrowly if needed

src/lib/
├── task-dispatch.ts           # existing dispatch seam, minimal callout only
└── task-dispatch-codex-app-server.ts

src/lib/harness-adapters/__tests__/
├── codex-app-server-manifest.test.ts
├── codex-app-server-protocol.test.ts
├── codex-app-server-evidence.test.ts
├── codex-app-server-runner.test.ts
└── codex-app-server-artifact-safety.test.ts

src/lib/__tests__/
└── task-dispatch-codex-app-server.test.ts

scripts/spec-014c/
└── check-scope-guard.mjs
```

**Structure Decision**: Use a dedicated `src/lib/harness-adapters/codex-app-server/` module group for adapter internals and one narrow dispatch integration module. Do not add UI directories, route handlers, migrations, broad scheduler modules, or OpenClaw adapter files for SPEC-014C.

## Phase 0 Research Summary

Research is recorded in `specs/014c-first-real-harness-adapter/research.md`.

Resolved decisions:

- Use `codex app-server proxy` as the per-attempt stdio transport subprocess.
- Use official app-server v2 initialize/thread/turn/terminal protocol events from generated schema evidence.
- Store descriptor-only `codex_app_server_run.v1` evidence through existing Paddock surfaces.
- Use existing artifact publication and secret/redaction helpers; structurally unsafe output fails before redaction.
- No schema migration and no new runtime dependency are justified.
- G3 split guard passes because retention and live intervention remain assigned to SPEC-014E/F.

## Phase 1 Design And Contracts Summary

Design outputs:

- `data-model.md` defines non-migration entities, validation rules, and state transitions.
- `contracts/codex-app-server-adapter.md` defines manifest, launch, protocol, input, and failure contracts.
- `contracts/codex-app-server-dispatch-evidence.md` defines dispatch gating and evidence-write ordering.
- `contracts/codex_app_server_run.v1.schema.json` defines the descriptor-only evidence envelope.
- `quickstart.md` records local and HAL validation commands.

## G3 Gate Result

**Status**: Pass.

G3 approval criteria are satisfied by this plan:

- Reuses SPEC-014A sandbox lifecycle before and after launch.
- Reuses SPEC-014B harness-adapter manifest, runtime-inventory, and evidence safety surfaces.
- Reuses SPEC-013B/C/D claim ownership, retry, stale recovery, and claim-control authority.
- Adds exactly one real adapter, Codex app-server.
- Adds no live intervention UI, transcript-retention policy, auto-merge behavior, task terminal mutation, direct GitHub mutation, successor selection, governance mutation, or second adapter.

## Complexity Tracking

No constitution violations require justification. If tasks reveal a required schema platform, second adapter, UI intervention surface, transcript-retention system, broad scheduler rewrite, or more than 8 production files / 25 total files, SPEC-014C must stop and record a split decision before implementation.
