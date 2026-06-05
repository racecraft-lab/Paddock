# SPEC-014C HAL UAT Report

## Status

| Field | Value |
| --- | --- |
| UAT marker | `SPEC-014C-HAL-UAT-20260605121830` |
| Report owner | Codex autopilot |
| HAL target commit | `43989ac856696abb2ea764fed409da268b87c9a8` on branch `014c-first-real-harness-adapter` |
| Report captured at | `2026-06-05T17:21:41Z` |
| Overall result | Passed |
| Completion decision | SPEC-014C Phase 7 target UAT passed for the PR branch. T042-T045 are complete. Final project status remains PR-open until review, merge, and normal post-merge promotion policy complete. |

This report is descriptor-only. It records marker-scoped service, launch, failure-fixture, and cleanup evidence without raw app-server protocol payloads, transcripts, prompts, provider/tool/MCP payloads, secrets, sandbox contents, storage URIs, original filenames, or host paths.

## Descriptor-Only Evidence Policy

Checked-in evidence may include target commit, service status, feature-flag scope, fixture marker, run/attempt/lifecycle/activity identifiers, status/outcome, reason code, phase, bounded protocol correlation identifiers, usage availability, safe artifact descriptors, and cleanup counts.

Checked-in evidence must not include raw app-server protocol payloads, transcripts, prompt bodies, provider/tool/MCP payloads, sandbox contents, storage URIs, original filenames, host paths, external URLs, secrets, or broad previews.

## HAL Target And Service Health

| Check | Expected evidence | Result | Descriptor-only evidence |
| --- | --- | --- | --- |
| Deployed commit | HAL Paddock commit matches the intended SPEC-014C test target | Passed | HAL branch fast-forwarded to `43989ac856696abb2ea764fed409da268b87c9a8` |
| Build | Target branch builds under the service Node 22 runtime | Passed | `pnpm build` passed on HAL before service restart |
| `paddock.service` | Active and serving the target commit | Passed | Service restarted and reported active |
| `openclaw-gateway.service` | Active or explicitly not required for this UAT path | Passed | Service remained active |
| `/login` | HTTP 200 on deployed target | Passed | HAL `/login` returned HTTP 200 |
| Authenticated `/api/status` | HTTP 200 with healthy status fields | Passed | Marker-scoped UAT auth probe returned HTTP 200 |
| Codex command resolution | `codex` resolves on HAL | Passed | HAL resolves Codex CLI and direct app-server listener |
| App-server transport | Real app-server handshake capability is available | Passed | Direct `codex app-server --listen stdio://` completed initialize/thread/turn flow |

## Real Codex App-Server Launch Gate

SPEC-014C acceptance requires one real Codex app-server launch on HAL. Local tests, CLI help, fake output, or deterministic fixture evidence alone is insufficient.

| Required real-launch item | Result | Descriptor-only evidence |
| --- | --- | --- |
| Marker-scoped disposable GitHub-linked assigned task created | Passed | UAT seeded disposable workspace `28` and tasks `133`-`143` under marker `SPEC-014C-HAL-UAT-20260605121830` |
| Current stage attempt and active claim established | Passed | Launch fixture established current attempt and active ownership before handoff |
| Paddock-owned sandbox lifecycle prepared | Passed | Paddock-owned lifecycle evidence was created and used for launch |
| Real `codex app-server --listen stdio://` subprocess launched from sandbox | Passed | Subprocess completed with `stdout_line_count=34`, `stderr_line_count=1`, and no raw output retained |
| Official handshake completed | Passed | Protocol summary includes `initialize` and `initialized` |
| Thread start completed | Passed | Protocol summary includes `thread/start` and `thread/started` |
| Turn start completed | Passed | Protocol summary includes `turn/start`, `turn/started`, and `turn/completed` |
| Protocol correlation identifiers captured | Passed | Session/thread id `019e98cb-cd35-7b62-bb59-35f2c7d3d1d5`; turn id `019e98cb-cda9-79a0-87f6-b0c06ff0e768` |
| Run, attempt, lifecycle, activity, usage, and artifact descriptors captured | Passed | Terminal run evidence recorded `status=completed`, `outcome=success`, `phase=terminal`, `reason_code=null`, `artifact_ref_count=1`, `redaction_applied=false`, `usage.source=none` |
| Terminal outcome recorded while ownership remained current | Passed | Launch handoff completed without stale-ownership or late-mutation evidence |

The single stderr line is recorded only as a count. It was treated as non-terminal diagnostic output; no raw stderr content is retained in this report.

## Deterministic Fixture Matrix

Deterministic fixtures cover failure modes only because they exercise the same adapter parser, failure mapper, claim/lifecycle handling, timeout path, and artifact/redaction path as live protocol events.

| Scenario | Method | Expected reason/outcome | Result | Descriptor-only evidence |
| --- | --- | --- | --- | --- |
| Unsupported user input | Deterministic fixture on HAL | `user_input_unsupported` | Passed | Shared parser/mapper returned blocked failure evidence |
| Unsupported approval request | Deterministic fixture on HAL | `approval_unsupported` | Passed | Shared parser/mapper returned blocked failure evidence |
| Unsupported tool/file request | Deterministic fixture on HAL | `tool_file_unsupported` | Passed | Shared parser/mapper returned blocked failure evidence |
| Unsupported capability request | Deterministic fixture on HAL | `capability_unsupported` | Passed | Shared capability validator rejected the request |
| Timeout budget expired | Deterministic fixture on HAL | `timeout_budget_expired` | Passed | Shared runner timeout path emitted terminal timeout evidence |
| Malformed protocol/output | Deterministic fixture on HAL | `malformed_protocol` | Passed | Shared protocol state machine rejected malformed output |
| Unsafe evidence rejected | Deterministic fixture on HAL | `unsafe_evidence_rejected` | Passed | Shared artifact-safety path rejected unsafe evidence |
| Allowed redaction | Deterministic fixture on HAL | Redacted safe descriptor emitted | Passed | Safe descriptor emitted with `redaction_applied=true` |
| Cleanup failure diagnostics | Deterministic fixture on HAL | `cleanup_failed` with phase | Passed | Cleanup-failure evidence preserved the terminal outcome |
| Feature-flag-off blocking | Workspace-scoped fixture on HAL | `feature_disabled` before launch | Passed | Admission blocked before adapter handoff |

## Workspace Feature Flag Scope

| Flag | Scope | Expected value for launch UAT | Flag-off verification |
| --- | --- | --- | --- |
| `FEATURE_TASK_CONTROL_PLANE` | Disposable workspace feature-flag JSON only | Enabled | Launch fixture used workspace scope only |
| `FEATURE_AGENT_RUNNER_SANDBOXES` | Disposable workspace feature-flag JSON only | Enabled | Separate flag-off fixture blocked before launch with `feature_disabled` |

No global or environment force-on behavior was used. No SPEC-014C-only feature flag was added.

## Cleanup Proof And Zero Residue

| Cleanup target | Expected proof | Result | Descriptor-only evidence |
| --- | --- | --- | --- |
| Disposable workspace row(s) | Marker-scoped count is zero after report capture | Passed | `workspaces=0` |
| Temporary operator user/session row(s) | Marker-scoped count is zero after report capture | Passed | `users=0`, `sessions=0` |
| Project, assignment, workflow template/stage row(s) | Marker-scoped count is zero after report capture | Passed | `projects=0`, `assignments=0`, `workflow_templates=0`, `workflow_stages=0` |
| GitHub-linked task, attempt, claim, run, lifecycle, artifact, activity row(s) | Marker-scoped count is zero after report capture | Passed | `tasks=0`, `attempts=0`, `claims=0`, `runs=0`, `lifecycles=0`, `artifacts=0`, `activities=0` |
| Sandbox directory/path residue | Marker-scoped count is zero after report capture | Passed | `sandbox_root_exists=false` |
| Artifact file/path residue | Marker-scoped count is zero after report capture | Passed | No marker-scoped artifact path residue |
| Cleanup failure exception | No unresolved `cleanup_failed` residue remains, or blocker is recorded | Passed | Cleanup fixture covered `cleanup_failed`; final marker residue counts are zero |

Cleanup deleted marker-scoped launch evidence rows after report capture, including the single run and single activity row created by the real launch. No disposable marker residue remains.

## Fake-Only Evidence Rejection

The final accepted HAL report includes one real Codex app-server handshake/thread/turn launch from a Paddock-owned sandbox plus deterministic failure fixtures through shared code paths. Fake-only or command-version-only evidence was not accepted as completion proof.

## Post-UAT UI/IA Follow-Up

HAL browser review of `/agents` after UAT confirmed that Workflow Contracts, Workflows/templates, Pipelines, Command, Fleet, and Agent Squad are currently stacked in the same page. Follow-up database checks found no SPEC-014C marker residue in HAL; the visible workflow rows are normal `workflow-contract` seed rows, not UAT cruft.

The UI/IA issue is tracked as pending SPEC-015A. SPEC-015A should move Workflow Contracts, Workflows/templates, and Pipelines to a first-class Workflows/Orchestration page; keep Fleet and direct Command behavior close to Agent Squad or Chat; normalize pipeline Product Line scoping and delete/run contracts; and verify the split through HAL browser UAT.

## Evidence Capture Log

| Timestamp | Actor | Action | Result | Descriptor-only reference |
| --- | --- | --- | --- | --- |
| `2026-06-05T05:21:27Z` | Codex autopilot | Ran focused SPEC-014C local cluster after persistence fix | Passed | 8 files / 89 tests |
| `2026-06-05T05:27:00Z` | Codex autopilot | Ran scope guard, typecheck, lint, and production build | Passed | Scope guard OK; typecheck OK; lint OK; build OK |
| `2026-06-05T14:47:29Z` | Codex autopilot | Rebased branch to current `origin/main` and reran local validation | Passed | Branch head `c44f8610`; focused cluster 8 files / 89 tests; scope guard OK; typecheck OK; lint OK; build OK |
| `2026-06-05T16:44:00Z` | Codex autopilot | Re-grounded transport behavior in official Codex app-server and CLI docs, then aligned adapter to direct stdio listener | Passed | `codex app-server --listen stdio://` selected for per-attempt launch; managed remote-control was not installed on HAL |
| `2026-06-05T17:03:00Z` | Codex autopilot | Pushed branch commit `43989ac856696abb2ea764fed409da268b87c9a8`, deployed PR branch to HAL, built, and restarted service | Passed | HAL branch target active; `paddock.service` and `openclaw-gateway.service` active; `/login` HTTP 200 |
| `2026-06-05T17:18:30Z` | Codex autopilot | Ran marker-scoped HAL UAT integration command | Passed | `tests/integration/spec-014c-hal-target-uat.test.ts` passed 1 test in 10.61s |
| `2026-06-05T17:21:41Z` | Codex autopilot | Reconciled report with descriptor-only launch, failure matrix, flag scope, and zero-residue evidence | Passed | Marker `SPEC-014C-HAL-UAT-20260605121830`; T042-T045 complete |
