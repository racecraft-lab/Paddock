# Research: SPEC-014C First Real Harness Adapter Pilot

## Scope

This research resolves the planning questions for one Codex app-server adapter path behind SPEC-014B. It uses the SPEC-014C design concept, the clarified spec, local Codex app-server protocol evidence, and parent-refreshed external context from 2026-06-05.

External citations applied:

- OpenAI Harness Engineering: https://openai.com/index/harness-engineering/
- OpenAI Symphony announcement: https://openai.com/index/open-source-codex-orchestration-symphony/
- Symphony SPEC: https://github.com/openai/symphony/blob/main/SPEC.md
- Codex App Server docs: https://developers.openai.com/codex/app-server/
- Codex non-interactive mode: https://developers.openai.com/codex/noninteractive
- NIST conformance discussion: https://www.nist.gov/itl/ssd/information-systems-group/what-thing-called-conformance
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

## Decision: Use Codex App-Server Proxy As The Per-Attempt Transport

Use `codex app-server proxy` as the per-attempt stdio transport subprocess. Spawn without a shell and with process `cwd` set to the SPEC-014A lifecycle root. Send the official app-server v2 JSON-RPC protocol over stdio.

Rationale:

- Parent evidence shows local `codex-cli 0.133.0` supports `daemon`, `proxy`, `generate-ts`, and `generate-json-schema`, with no `serve` command.
- Planning checked `codex app-server daemon --help` and `codex app-server proxy --help`; `proxy` is the stdio transport to the app-server control socket.
- A proxy subprocess gives Paddock one bounded process to supervise per admitted stage attempt while avoiding a Paddock-managed durable app-server service.

Alternatives considered:

- `codex app-server serve`: rejected because the local CLI has no `serve` command.
- Managing `codex app-server daemon start` from dispatch: rejected for SPEC-014C because it widens operational ownership. HAL preflight may verify the daemon/proxy surface, but adapter code fails closed if proxy cannot connect.
- Shelling through a generic command string: rejected because subprocess launch should use argv without a shell.

## Decision: Use Official V2 Lifecycle Events As Authority

Handshake is `initialize` response plus client `initialized`. Launch evidence is `thread/start`, `turn/start`, and `turn/started`. Terminal authority is `turn/completed.turn.status`. `item/completed` with an agent message is output evidence only. Timeout is Paddock-owned synthetic `timeout_budget_expired`.

Rationale:

- Parent-generated protocol evidence lists `ClientRequest` methods `initialize`, `thread/start`, `turn/start`, `turn/steer`, and `turn/interrupt`.
- `ServerNotification` includes `thread/started`, `turn/started`, `turn/completed`, `thread/tokenUsage/updated`, `item/completed`, and `error`.
- Lifecycle authority must not be inferred from output text.

Alternatives considered:

- Treating final agent message as terminal state: rejected because it conflates output evidence with lifecycle authority.
- Cross-tick `thread/resume`: rejected for SPEC-014C; same-run continuation is allowed only while the live thread/current claim attempt remains active.

## Decision: Existing Storage Surfaces Carry Descriptor Evidence

Use descriptor-only `codex_app_server_run.v1` metadata through existing run, task-stage attempt, sandbox lifecycle, activity, usage/failure, and artifact-reference surfaces. Do not add a persistence table.

Rationale:

- The clarified spec requires no raw transcript, protocol payload, prompt body, provider payload, tool payload, host path, or storage URI retention.
- Existing surfaces are sufficient for ids, lifecycle phase, status/outcome, reason codes, safe counts, usage availability, bounded protocol correlation ids, and safe artifact references.
- Avoiding a table keeps SPEC-014C inside the one-adapter proof and leaves retention policy to SPEC-014E.

Alternatives considered:

- New `codex_app_server_runs` table: rejected because descriptor evidence can be carried by existing surfaces and a table would introduce schema-heavy retention work.
- Raw transcript/event store: rejected as SPEC-014E scope and a security expansion.

## Decision: No New Runtime Dependency

Implement protocol framing, subprocess control, timeout, hashing, bounded schema checks, and error mapping using Node built-ins and existing Paddock helpers.

Rationale:

- JSON-RPC over stdio does not require a runtime package for the SPEC-014C protocol subset.
- Existing artifact, secret detection, runtime-inventory, run, attempt, claim, and lifecycle helpers already provide the durable behavior.
- The constitution requires pinned runtime dependencies only when necessary.

Alternatives considered:

- Add a JSON-RPC package: rejected because the adapter needs a small, typed subset and can parse line/frame messages through built-in stream handling.
- Add a schema validator: rejected for runtime because the evidence envelope can be validated through explicit TypeScript guards. The checked-in JSON schema is a contract artifact.

## Decision: Fail Closed For Unsupported Requests

Map unsupported live user input, MCP elicitation, command/file/permission approvals, dynamic tool calls, MCP tool calls, unsupported file/tool access, and capability mismatches to bounded SPEC-014C reason codes.

Rationale:

- The spec selects non-interactive adapter behavior for the first real path.
- Codex non-interactive guidance and the app-server protocol shape both require explicit handling for requests the caller cannot satisfy.
- Live answer/approval UI belongs to SPEC-014F.

Alternatives considered:

- Auto-deny all requests and continue: rejected because some requests indicate unsupported capability and should fail the attempt.
- Auto-approve safe-looking requests: rejected because SPEC-014C has no live approval policy or UI.

## Decision: Hard-Reject Structurally Unsafe Evidence Before Redaction

Reject raw transcripts, provider payloads, tool/MCP payloads, prompt bodies, command/file-change details, host paths, unsafe URIs, raw reasoning, and raw protocol payloads before redaction. Redact only secret-shaped values inside otherwise bounded safe summaries, then revalidate the derivative.

Rationale:

- OWASP logging guidance supports minimizing sensitive log/evidence content and categorizing safe diagnostics.
- The clarified artifact contract permits only descriptor fields and optional bounded safe summaries.
- This preserves operator debug value without retaining high-risk payload classes.

Alternatives considered:

- Redact any unsafe structure after capture: rejected because storing or previewing unsafe structures before redaction violates the spec boundary.
- Drop all output always: rejected because operators need bounded safe evidence when available.

## Decision: Preserve Successful Attempt As `succeeded`

On success, record `run.status=completed`, `run.outcome=success`, final task-stage attempt status `succeeded`, then release ownership with `launch_handoff_completed`.

Rationale:

- Clarification explicitly requires the final attempt evidence to remain `succeeded`.
- A later generic `released` event as the final attempt state would be retry-eligible evidence and would misrepresent success.

Alternatives considered:

- Reuse generic launch handoff release as final lifecycle state: rejected unless implementation adapts it so `succeeded` remains the final attempt evidence.

## Decision: Claim-Control And Stale Recovery Win

Before continuation or terminal writes, re-prove active ownership and expected state. If ownership changed, terminate the subprocess and write only bounded abandoned evidence when safe, without overwriting newer state.

Rationale:

- SPEC-013B/C/D claim and operator control semantics remain authority.
- Late mutation would risk corrupting retry, release, cancellation, or claim-control evidence.

Alternatives considered:

- Let adapter finish and write terminal evidence regardless of ownership: rejected because it violates claim-control authority.

## Decision: HAL UAT Requires One Real Launch

Completion requires a HAL marker-scoped disposable fixture and one real Codex app-server handshake/thread/turn launch from the Paddock-owned sandbox. Negative failure fixtures may be deterministic only if they exercise the same parser, failure mapper, lifecycle, timeout, and artifact/redaction code.

Rationale:

- SPEC-014C is the first real harness proof. Fake-only evidence cannot validate the real launch seam.
- NIST conformance framing supports using concrete protocol evidence against the claimed contract rather than relying on name/version alone.

Alternatives considered:

- `codex --version` only: rejected because version does not prove app-server launch.
- Fake app-server only: rejected by clarification and UAT gate.
