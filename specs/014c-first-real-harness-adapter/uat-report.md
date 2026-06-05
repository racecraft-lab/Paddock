# SPEC-014C HAL UAT Report

## Status

| Field | Value |
| --- | --- |
| UAT marker | `SPEC-014C-HAL-UAT-BLOCKED-20260605144729` |
| Report owner | Codex autopilot |
| HAL target commit | Blocked: branch target `c44f8610` is not merged/promoted to HAL `main`; HAL live Paddock remains at `e7921a6f0e1e0a2a8042e9366be6a17beeb1e58b` |
| Report captured at | `2026-06-05T14:47:29Z` |
| Overall result | Blocked |
| Completion decision | SPEC-014C remains incomplete; T042-T045 stay open until target deployment, real launch, failure fixtures, and cleanup proof are captured on HAL |

This report is descriptor-only. No target HAL fixture rows, sandbox directories, or artifact files were created during this blocked attempt.

## Descriptor-Only Evidence Policy

Checked-in evidence may include target commit, service status, feature-flag scope, fixture marker, run/attempt/lifecycle/activity identifiers, status/outcome, reason code, phase, bounded protocol correlation identifiers, usage counts, and safe artifact descriptors.

Checked-in evidence must not include raw app-server protocol payloads, transcripts, prompt bodies, provider/tool/MCP payloads, sandbox contents, storage URIs, original filenames, host paths, external URLs, secrets, or broad previews.

## HAL Target And Service Health

| Check | Expected evidence | Result | Descriptor-only evidence |
| --- | --- | --- | --- |
| Deployed commit | HAL Paddock commit matches the intended SPEC-014C test target | Blocked | Rebased branch head is `c44f8610`; HAL live Paddock remains on `main` at `e7921a6f0e1e0a2a8042e9366be6a17beeb1e58b`; no merged/promoted SPEC-014C target exists |
| `paddock.service` | Active and serving the target commit | Partial | Service is active on HAL, but it is not serving the SPEC-014C target commit |
| `openclaw-gateway.service` | Active or explicitly not required for this UAT path | Passed | Service is active on HAL |
| `/login` | HTTP 200 on deployed target | Partial | HAL `/login` returned HTTP 200 on the current live service, not on a SPEC-014C target deployment |
| Authenticated `/api/status` | HTTP 200 with healthy status fields | Deferred | Authenticated target status remains deferred until the SPEC-014C target is deployed; a non-target auth probe returned 401 and was not counted as target evidence |
| Codex command resolution | `codex` resolves on HAL | Passed | HAL resolves `codex` and reports `codex-cli 0.136.0` |
| App-server preflight | Real app-server handshake capability is available | Passed | HAL `codex app-server --help` exposes `daemon`, `proxy`, `generate-ts`, and `generate-json-schema`; `codex app-server proxy --help` is available |

HAL access is restored. `ssh -o ConnectTimeout=10 hal hostname` returned `HAL`. No target mutation was attempted because the roadmap requires merging through GitHub before promoting merged `main` on the operator node.

## Real Codex App-Server Launch Gate

SPEC-014C cannot be accepted without one real Codex app-server launch on HAL. Local tests, CLI help, fake output, or deterministic fixture evidence alone is insufficient.

| Required real-launch item | Result | Descriptor-only evidence |
| --- | --- | --- |
| Marker-scoped disposable GitHub-linked assigned task created | Blocked | No target fixture created |
| Current stage attempt and active claim established | Blocked | No target fixture created |
| Paddock-owned sandbox lifecycle prepared | Blocked | No target fixture created |
| Real `codex app-server` subprocess launched from sandbox | Blocked | No target subprocess launched |
| Official handshake completed | Blocked | No target protocol exchange captured |
| Thread start completed | Blocked | No target protocol exchange captured |
| Turn start completed | Blocked | No target protocol exchange captured |
| Run, attempt, lifecycle, activity, usage, and artifact descriptors captured | Blocked | Local persistence path is GREEN; no HAL descriptors captured |
| Terminal outcome recorded while ownership remained current | Blocked | No target terminal outcome captured |

Blocking cause: SPEC-014C is not merged/promoted to a deployed target commit. HAL SSH, service-health inspection, and Codex app-server command preflight are available.

## Deterministic Fixture Matrix

Deterministic fixtures may cover failure modes only when they exercise the same adapter parser, failure mapper, claim/lifecycle handling, timeout path, and artifact/redaction path as live protocol events. Local coverage is green; HAL execution is blocked.

| Scenario | Method | Expected reason/outcome | Shared path proof | Result | Descriptor-only evidence |
| --- | --- | --- | --- | --- | --- |
| Unsupported user input | Deterministic fixture | `user_input_unsupported` | Local protocol mapper and runner tests use shared code | Local green, HAL blocked | Focused cluster passed 8 files / 89 tests |
| Unsupported approval request | Deterministic fixture | `approval_unsupported` | Local protocol mapper and runner tests use shared code | Local green, HAL blocked | Focused cluster passed 8 files / 89 tests |
| Unsupported tool/file request | Deterministic fixture | `tool_file_unsupported` | Local protocol mapper and runner tests use shared code | Local green, HAL blocked | Focused cluster passed 8 files / 89 tests |
| Unsupported capability request | Deterministic fixture | `capability_unsupported` | Local protocol mapper and dispatch tests use shared code | Local green, HAL blocked | Focused cluster passed 8 files / 89 tests |
| Timeout budget expired | Deterministic fixture | `timeout_budget_expired` | Local runner timeout path uses shared evidence builder | Local green, HAL blocked | Focused cluster passed 8 files / 89 tests |
| Binary unavailable fail-closed path | Deterministic fixture or preflight blocker | `binary_unavailable` | Local runner spawn-failure path uses shared evidence builder | Local green, HAL blocked | Focused cluster passed 8 files / 89 tests |
| Malformed protocol/output | Deterministic fixture | `malformed_protocol` | Local parser/state-machine tests use shared parser | Local green, HAL blocked | Focused cluster passed 8 files / 89 tests |
| Unsafe evidence rejected | Deterministic fixture | `unsafe_evidence_rejected` | Local artifact-safety tests use shared redaction/rejection path | Local green, HAL blocked | Focused cluster passed 8 files / 89 tests |
| Allowed redaction | Deterministic fixture | Redacted safe descriptor emitted | Local artifact-safety tests use shared redaction path | Local green, HAL blocked | Focused cluster passed 8 files / 89 tests |
| Cleanup failure diagnostics | Deterministic fixture | `cleanup_failed` with phase | Local runner cleanup path preserves terminal outcome | Local green, HAL blocked | Focused cluster passed 8 files / 89 tests |
| Feature-flag-off blocking | Workspace-scoped fixture | Admission blocked before launch | Local dispatch admission uses workspace feature flags | Local green, HAL blocked | Focused dispatch suite passed 1 file / 21 tests |

## Workspace Feature Flag Scope

| Flag | Scope | Expected value for launch UAT | Flag-off verification |
| --- | --- | --- | --- |
| `FEATURE_TASK_CONTROL_PLANE` | Disposable workspace feature-flag JSON only | Enabled | Local admission path covers flag-off blocking; HAL flag scope not verified |
| `FEATURE_AGENT_RUNNER_SANDBOXES` | Disposable workspace feature-flag JSON only | Enabled | Local admission path covers flag-off blocking; HAL flag scope not verified |

No global or environment force-on behavior was used. No SPEC-014C-only feature flag was added.

## Cleanup Proof And Zero Residue

| Cleanup target | Expected proof | Result | Descriptor-only evidence |
| --- | --- | --- | --- |
| Disposable workspace row(s) | Marker-scoped count is zero after report capture | Blocked | No HAL fixture created; target residue check deferred until target deployment |
| Temporary operator user/session row(s) | Marker-scoped count is zero after report capture | Blocked | No HAL fixture created; target residue check deferred until target deployment |
| Project, assignment, workflow template/stage row(s) | Marker-scoped count is zero after report capture | Blocked | No HAL fixture created; target residue check deferred until target deployment |
| GitHub-linked task, attempt, claim, run, lifecycle, artifact, activity row(s) | Marker-scoped count is zero after report capture | Blocked | No HAL fixture created; target residue check deferred until target deployment |
| Sandbox directory/path residue | Marker-scoped count is zero after report capture | Blocked | No HAL fixture created; target residue check deferred until target deployment |
| Artifact file/path residue | Marker-scoped count is zero after report capture | Blocked | No HAL fixture created; target residue check deferred until target deployment |
| Cleanup failure exception | No unresolved `cleanup_failed` residue remains, or blocker is recorded | Blocked | No HAL fixture created; cleanup proof remains pending |

## Fake-Only Evidence Is Insufficient

Local deterministic evidence does not satisfy SPEC-014C completion. The final accepted report must include:

- One real HAL Codex app-server handshake/thread/turn launch from a Paddock-owned sandbox.
- Deterministic failure fixtures only for allowed failure coverage and only through the same parser, mapper, lifecycle, timeout, and artifact/redaction paths as live protocol events.
- Service/deployed-commit health, workspace-scoped flag evidence, and zero-residue cleanup proof.

## Blockers And Deferred Evidence

| Blocker or deferred item | Status | Required resolution before completion |
| --- | --- | --- |
| SPEC-014C commit not deployed to HAL | Active blocker | Merge/promote a SPEC-014C target commit before HAL UAT |
| HAL SSH authentication unavailable from this session | Resolved | `ssh -o ConnectTimeout=10 hal hostname` returned `HAL` |
| Real Codex app-server availability on HAL | Resolved preflight | `codex`, `codex app-server`, and `codex app-server proxy` resolve on HAL |
| Real launch handshake/thread/turn incomplete | Deferred | Capture successful real launch on HAL |
| Deterministic fixture path on HAL | Deferred | Re-run failure matrix on HAL through shared parser/mapper/lifecycle/timeout/redaction paths |
| Marker-scoped residue proof | Deferred | Clean fixture rows/files and record zero marker residue on HAL |

## Evidence Capture Log

| Timestamp | Actor | Action | Result | Descriptor-only reference |
| --- | --- | --- | --- | --- |
| `2026-06-05T05:21:27Z` | Codex autopilot | Ran focused SPEC-014C local cluster after persistence fix | Passed | 8 files / 89 tests |
| `2026-06-05T05:26:50Z` | Codex autopilot | Ran focused dispatch persistence suite | Passed | 1 file / 21 tests |
| `2026-06-05T05:27:00Z` | Codex autopilot | Ran scope guard, typecheck, lint, and production build | Passed | Scope guard OK; typecheck OK; lint OK; escalated build OK |
| `2026-06-05T05:29:00Z` | Codex autopilot | Probed HAL SSH for target UAT | Blocked | Public-key authentication failed because 1Password SSH agent was unavailable |
| `2026-06-05T14:47:29Z` | Codex autopilot | Rebased branch to current `origin/main` and reran local validation | Passed | Branch head `c44f8610`; focused cluster 8 files / 89 tests; scope guard OK; typecheck OK; lint OK; escalated build OK |
| `2026-06-05T14:47:29Z` | Codex autopilot | Re-probed HAL service and Codex app-server availability | Partial | SSH restored; services active; HAL Codex CLI/app-server preflight passed; target deployment still blocked pending merge/promote |
