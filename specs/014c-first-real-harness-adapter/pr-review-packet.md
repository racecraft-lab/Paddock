# SPEC-014C PR Review Packet

Status: US1 RED/GREEN tasks T010-T019, US2 RED/GREEN tasks T020-T026, US3 RED/GREEN tasks T027-T035, US4 guard/status tasks T036-T041, and local polish tasks T046-T049 are complete. HAL UAT tasks T042-T045 are blocked by missing deployed SPEC-014C target commit; HAL SSH and Codex app-server command preflight are now available. SPEC-014C cannot be accepted until merge/promotion and target UAT pass.

## Source Design Citation

- Source design concept: `docs/ai/specs/SPEC-014C-design-concept.md`
- Feature spec: `specs/014c-first-real-harness-adapter/spec.md`
- Implementation plan: `specs/014c-first-real-harness-adapter/plan.md`

Design basis: SPEC-014C proves one Codex app-server harness adapter on top of SPEC-014A sandbox lifecycles, SPEC-014B runtime inventory, and SPEC-013B through SPEC-013D claim control. Rich transcript/event retention is deferred to SPEC-014E. Live operator intervention is deferred to SPEC-014F.

## Scope Budget

| Budget item | SPEC-014C limit | T001 status |
|---|---:|---|
| Primary surface | `harness/adapter` | Scaffolded |
| Secondary surface | Narrow dispatch/evidence integration only | Scaffolded |
| Planned production files | 6-8 | Actual scoped code/config scan covers 12 files; added files stay inside the one-adapter plus narrow dispatch/evidence surface |
| Planned total files | 12-18 including tests, spec artifacts, UAT report, and this packet | Current diff has 51 changed files including generated SpecKit checklists, tests, contracts, docs, and status ledgers |
| Projected reviewable LOC | 700-1,100 before tests and generated evidence | Exceeded by test/process artifacts; production behavior remains bounded by scope guard and focused tests |
| Split trigger | Second primary surface, second real adapter, schema-heavy retention, live intervention UI, broad scheduler rewrite | No split trigger fired; SPEC-014D/E/F ownership remains deferred |

Scope guard: SPEC-014C must not add a second adapter, OpenClaw-specific behavior, transcript-retention platform, live intervention UI, direct GitHub mutation, task terminal mutation, successor selection, auto-merge, or governance mutation.

## Review Order

1. Review scope guard and deferred SPEC-014E/SPEC-014F boundaries.
2. Review Codex app-server manifest and SPEC-014B runtime-inventory eligibility.
3. Review dispatch entry point after claim/reconciliation, governance, assignment, and lifecycle preflight.
4. Review adapter protocol handling for handshake, thread start, turn start, terminal status, timeout, and subprocess cleanup.
5. Review fail-closed mappings for unsupported user input, approval, tool/file, capability, binary, malformed protocol, timeout, and unsafe evidence.
6. Review descriptor-only evidence, artifact safety, redaction, and no raw transcript/provider/tool/prompt retention.
7. Review task-stage attempt, claim release, sandbox lifecycle, activity, usage, and failure evidence.
8. Review HAL UAT evidence, including one real Codex app-server launch and zero disposable residue.
9. Review final status updates, rollback or feature-flag notes, and PR description alignment.

## RED/GREEN Evidence Table

| Task | Expected RED before implementation | GREEN verification | Evidence status |
|---|---|---|---|
| T001 review packet scaffold | N/A for docs scaffold; artifact did not exist before T001 | `pr-review-packet.md` exists and contains required scaffold sections | Added by T001 |
| T006-T007 shared fixtures | Temporary contract test failed because fixture builder exports were absent | `pnpm test src/lib/harness-adapters/__tests__/codex-app-server-fixtures-contract.test.ts`, focused compile/import checks, and corrected import smoke passed | Added by T006-T007 |
| T008-T009 static scope guard | `node scripts/spec-014c/check-scope-guard.mjs` failed before implementation with `MODULE_NOT_FOUND` | `node scripts/spec-014c/check-scope-guard.mjs --self-test` and `node scripts/spec-014c/check-scope-guard.mjs` pass | Added by T008-T009 |
| T012 runner launch RED | Runner launch tests fail until `src/lib/harness-adapters/codex-app-server/runner` implements importable `launchCodexAppServerAttempt` and enforces no-shell spawn, lifecycle-root cwd, bounded runtime roots, launch protocol order, and one subprocess per admitted attempt | Not implemented by T012; RED-only task | RED verified by T012 |
| T013 input minimization RED | Input minimization tests fail until `src/lib/harness-adapters/codex-app-server/input` implements importable `buildCodexAppServerTurnInput` and limits task-stage input to bounded GitHub/stage/task/assignment/repository/claim/manifest/capability/handoff fields while excluding forbidden raw rows, secrets, transcripts, provider/tool payloads, broad context, unrelated history, and host paths | Not implemented by T013; RED-only task | RED verified by T013 |
| T010 Codex app-server manifest RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-manifest.test.ts` failed before production `codex-app-server/manifest.ts` exists: 5 tests failed with `AssertionError: expected undefined to be defined` at `loadManifestModule` | Not implemented by T010; RED-only task | RED verified by T010 |
| T011 dispatch admission RED | `direnv exec . pnpm test src/lib/__tests__/task-dispatch-codex-app-server.test.ts` failed before production `task-dispatch-codex-app-server.ts` exists: 9 tests failed with `AssertionError: expected Error: src/lib/task-dispatch-codex-app-server.ts is not implemented yet ... to be undefined` at `evaluateAdmission` | Not implemented by T011; RED-only task | RED verified by T011 |
| T014-T019 US1 implementation | Combined US1 command failed before implementation: 3 files failed, 19 tests failed across missing manifest, runner, input, and dispatch admission modules | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/validation.test.ts src/lib/harness-adapters/__tests__/runtime-inventory.test.ts src/lib/harness-adapters/__tests__/codex-app-server-manifest.test.ts src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts src/lib/__tests__/task-dispatch-codex-app-server.test.ts` passed: 5 files, 30 tests | GREEN verified by T014-T019 |
| T020/T022 evidence, usage, and activity RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-evidence.test.ts` failed before production `codex-app-server/evidence.ts` exists: 7 tests failed with `AssertionError: expected Error: src/lib/harness-adapters/codex-app-server/evidence.ts is not implemented yet ... to be undefined` at `evidenceFunction` | Not implemented by T020/T022; RED-only tasks | RED verified by T020/T022 |
| T021 artifact safety RED | Artifact safety tests fail until `src/lib/harness-adapters/codex-app-server/evidence.ts` implements importable `buildCodexAppServerEvidenceArtifacts` and enforces safe summaries, descriptor-only artifact references, structural unsafe rejection, allowed secret redaction, artifact policy rejection, redaction-empty rejection, and forbidden host path/storage URI/original filename/raw transcript/prompt/provider/tool/MCP payload exclusion | Not implemented by T021; RED-only task | RED verified by T021 |
| T023-T026 US2 implementation | Combined US2 command failed before implementation because `codex-app-server/evidence.ts` was missing | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts src/lib/__tests__/task-dispatch-codex-app-server.test.ts src/lib/harness-adapters/__tests__/codex-app-server-evidence.test.ts src/lib/harness-adapters/__tests__/codex-app-server-artifact-safety.test.ts` passed: 4 files, 40 tests. `pnpm typecheck`, `pnpm lint`, and scope guard also passed. | GREEN verified by T023-T026 |
| T029 fail-closed runner RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts` failed with 5 assertion failures for timeout evidence, binary unavailable classification, subprocess termination cleanup evidence, lifecycle cleanup evidence, and preserved terminal outcome metadata | Not implemented by T029; RED-only task | RED verified by T029 |
| T030 ownership re-proof RED | `direnv exec . pnpm test src/lib/__tests__/task-dispatch-codex-app-server.test.ts` failed because `evaluateCodexAppServerOwnershipReproof` is not exported yet | Not implemented by T030; RED-only task | RED verified by T030 |
| Dispatch seam | Covered by T018 admission evaluator plus T019 source callout assertion and candidate filtering | Focused US1 command, full typecheck, full lint, and scope guard passed with a narrow `task-dispatch.ts` callout and no direct terminal/GitHub/successor/governance mutation in the callout | GREEN verified by T018-T019 |
| T027 protocol state-machine RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-protocol.test.ts` failed before production `codex-app-server/protocol.ts` exists: 10 state-machine tests failed with `AssertionError: expected Error: src/lib/harness-adapters/codex-app-server/protocol.ts is not implemented yet ... to be undefined` | Not implemented by T027; RED-only task | RED verified by T027 |
| T028 unsupported request mapping RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-protocol.test.ts` failed before production `codex-app-server/protocol.ts` exists: 9 unsupported-request mapping tests failed with the same import assertion | Not implemented by T028; RED-only task | RED verified by T028 |
| T031-T035 US3 implementation | US3 RED commands failed before implementation because `protocol.ts`, runner failure mapping, and ownership re-proof were incomplete | Combined US1-US3 command passed: 8 files, 86 tests. `pnpm typecheck`, `pnpm lint`, and scope guard also passed. | GREEN verified by T031-T035 |
| Supplemental live stdio transport | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts` failed after adding live child-process stdio coverage: expected written client messages `initialize`, `initialized`, `thread/start`, `turn/start`, got `[]` | Runner now exchanges initialize/thread/turn JSON-RPC lines through child stdin/stdout when no fixture protocol is injected. Focused cluster passed 8 files / 88 tests; typecheck/lint/scope guard passed. | GREEN verified before HAL UAT |
| Timeout and unavailable binary failures | T029 RED tests added for manifest timeout, binary unavailable, subprocess termination failure, lifecycle cleanup failure, and preserved terminal outcome metadata | T033 implementation GREEN in combined US1-US3 focused command | GREEN verified by T033 |
| Evidence and artifact safety | T020-T022 RED tests added and failed on missing evidence builders | Descriptor-only evidence builders, safe artifact filtering/redaction, runner evidence/activity descriptors, and admission activity payloads are implemented | GREEN verified by T023-T026 |
| T036 static guard RED | `direnv exec . node scripts/spec-014c/check-scope-guard.mjs --self-test` failed after adding unimplemented generic allowlist coverage: expected 19 findings, got 18 | Not implemented by T036; RED-only task | RED verified by T036 |
| T037 runtime no-mutation RED | `direnv exec . pnpm test src/lib/__tests__/task-dispatch-codex-app-server.test.ts` failed after expanding forbidden mutation categories: 8 ownership tests failed because production still returned `github_sync` instead of task creation, direct GitHub mutation, outbound sync, auto-merge, and Aegis/owner gate bypass | Not implemented by T037; RED-only task | RED verified by T037 |
| T038 static guard implementation | T036 self-test failed until generic path allowlist, task-creation, Aegis/owner-gate, and behavior/content rules were completed | `direnv exec . node scripts/spec-014c/check-scope-guard.mjs --self-test` passed with 23 findings; current-diff scope guard passed with 51 changed files and 12 scanned code/config files | GREEN verified by T038 |
| No forbidden mutations | T037 runtime tests failed until forbidden late mutations enumerated task terminal state, successor selection, task creation, direct GitHub mutation, outbound sync, auto-merge, Aegis/owner gate bypass, governance mutation, claim/attempt/lifecycle writes | `direnv exec . pnpm test src/lib/__tests__/task-dispatch-codex-app-server.test.ts` passed: 1 file, 20 tests. `pnpm typecheck` and `pnpm lint` also passed. | GREEN verified by T037 |
| Dispatch evidence persistence | RED failed on missing `persistCodexAppServerDispatchEvidence` export | `direnv exec . pnpm test src/lib/__tests__/task-dispatch-codex-app-server.test.ts` passed: 1 file, 21 tests; focused cluster passed 8 files / 89 tests | GREEN verified before HAL UAT |
| HAL real-launch UAT | Target requires merged/promoted commit plus authenticated HAL access | Blocked: no deployed SPEC-014C target commit; HAL SSH and Codex app-server command preflight are restored | Blocked in `uat-report.md` |
| HAL cleanup and zero residue | Target requires marker-scoped fixture creation, cleanup, and residue checks | Blocked: no HAL fixture rows/files created; target residue check deferred until target deployment | Blocked in `uat-report.md` |

## Scope Guard Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T009 initial RED/not-yet-implemented | `node scripts/spec-014c/check-scope-guard.mjs` | Exit 1 | `Error: Cannot find module '.../scripts/spec-014c/check-scope-guard.mjs'`; `code: 'MODULE_NOT_FOUND'` |
| T008 self-test GREEN | `node scripts/spec-014c/check-scope-guard.mjs --self-test` | Exit 0 | `SPEC-014C scope guard self-test: OK (15 findings across 13 forbidden fixture(s), docs/process non-goals allowed)` |
| T009 current-diff GREEN | `node scripts/spec-014c/check-scope-guard.mjs` | Exit 0 | `SPEC-014C scope guard: OK (32 changed file(s), 2 code/config file(s) scanned)` |
| T008 targeted lint | `pnpm exec eslint scripts/spec-014c/check-scope-guard.mjs` | Exit 0 | No output |
| T014-T019 current-diff GREEN | `direnv exec . node scripts/spec-014c/check-scope-guard.mjs` | Exit 0 | `SPEC-014C scope guard: OK (46 changed file(s), 9 code/config file(s) scanned)` |
| T036 static guard RED | `direnv exec . node scripts/spec-014c/check-scope-guard.mjs --self-test` | Exit 1 | `SPEC-014C scope guard self-test expected 19 findings, got 18`; missing generic allowlist coverage for `src/lib/workflow-contracts/codex-app-server-sync.ts` |
| T038 self-test GREEN | `direnv exec . node scripts/spec-014c/check-scope-guard.mjs --self-test` | Exit 0 | `SPEC-014C scope guard self-test: OK (23 findings across 16 forbidden fixture(s), docs/process non-goals allowed)` |
| T038 current-diff GREEN | `direnv exec . node scripts/spec-014c/check-scope-guard.mjs` | Exit 0 | `SPEC-014C scope guard: OK (51 changed file(s), 12 code/config file(s) scanned)` |

Guard coverage: changed-path and added-line scanning now rejects changes outside SPEC-014C-owned implementation/test/script/process paths plus second adapter paths, OpenClaw implementation, live intervention UI, transcript retention behavior, direct task terminal mutation, direct GitHub mutation, outbound sync, governance mutation, successor/task creation, auto-merge, Aegis/owner gate bypass, and broad scheduler rewrites. `specs/**`, `docs/**`, `.specify/**`, and markdown/process artifacts are intentionally excluded from content scanning so explicit non-goal references remain allowed.

## Fixture Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T006-T007 temporary contract RED | `pnpm test src/lib/harness-adapters/__tests__/codex-app-server-fixtures-contract.test.ts` | Failed before fixture implementation | Real assertion failure: expected missing builder export to be a function |
| T006-T007 temporary contract GREEN | `pnpm test src/lib/harness-adapters/__tests__/codex-app-server-fixtures-contract.test.ts` | Passed after fixture implementation | Temporary contract test removed after GREEN to keep final scope to the requested fixture helper |
| T006-T007 fixture compile | `pnpm exec tsc --noEmit ... src/lib/harness-adapters/__tests__/codex-app-server-fixtures.ts` | Passed | No TypeScript compile output |
| T006-T007 fixture import | `direnv exec . node --experimental-strip-types -e "import('./src/lib/harness-adapters/__tests__/codex-app-server-fixtures.ts')..."` | Passed | `fixtures import ok` |

Fixture coverage: deterministic protocol sequence, unsupported requests, token usage, subprocess results, lifecycle/claim/attempt ids, blocked admission reasons, terminal mapping cases, safe artifact descriptors, unsafe outputs, and run evidence are available for later RED tests.

## T010 Manifest RED Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T010 manifest RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-manifest.test.ts` | Exit 1; 5 manifest tests failed | Real assertion failure: `AssertionError: expected undefined to be defined` at `loadManifestModule`, proving `src/lib/harness-adapters/codex-app-server/manifest.ts` is not implemented yet |

Manifest RED coverage: exactly one `codex-app-server` real adapter export, launch support, same-run continuation support, manifest timeout, Paddock-owned sandbox posture, allowed non-interactive capability packet, and explicit SPEC-014E/SPEC-014F non-goals.

## T011 Dispatch Admission RED Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T011 dispatch admission RED | `direnv exec . pnpm test src/lib/__tests__/task-dispatch-codex-app-server.test.ts` | Exit 1; 9 dispatch admission tests failed | Real assertion failure: `AssertionError: expected Error: src/lib/task-dispatch-codex-app-server.ts is not implemented yet ... to be undefined` at `evaluateAdmission`, proving `src/lib/task-dispatch-codex-app-server.ts` is not implemented yet |

Dispatch admission RED coverage: eligible claimed GitHub-linked assigned governed lifecycle-ready launch plus blocked `feature_disabled`, `adapter_unassigned`, `not_github_linked`, `governance_denied`, `manifest_mismatch`, `sandbox_lifecycle_not_ready`, `workspace_mismatch`, and `repository_mismatch` cases.

## T012-T013 Runner And Input RED Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T012 runner launch RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts` | Exit 1; 3 runner launch tests failed | Real assertion failure: `Codex app-server runner module must be implemented and importable`; `ERR_MODULE_NOT_FOUND` for `/src/lib/harness-adapters/codex-app-server/runner` |
| T013 input minimization RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts` | Exit 1; 2 input minimization tests failed | Real assertion failure: `Codex app-server input module must be implemented and importable`; `ERR_MODULE_NOT_FOUND` for `/src/lib/harness-adapters/codex-app-server/input` |

Full RED summary: Vitest reported `src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts (5 tests | 5 failed)`, with failures covering no-shell subprocess launch, lifecycle-root cwd/runtime roots, launch protocol ordering, bounded allowed input fields, and forbidden input exclusion.

## T014-T019 US1 GREEN Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T014-T019 focused US1 GREEN | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/validation.test.ts src/lib/harness-adapters/__tests__/runtime-inventory.test.ts src/lib/harness-adapters/__tests__/codex-app-server-manifest.test.ts src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts src/lib/__tests__/task-dispatch-codex-app-server.test.ts` | Exit 0 | `Test Files  5 passed (5)`; `Tests  30 passed (30)` |
| T014-T019 scope guard GREEN | `direnv exec . node scripts/spec-014c/check-scope-guard.mjs` | Exit 0 | `SPEC-014C scope guard: OK (46 changed file(s), 9 code/config file(s) scanned)` |
| T014-T019 typecheck GREEN | `direnv exec . pnpm typecheck` | Exit 0 | `tsc -b --pretty false` completed with no diagnostics |
| T014-T019 lint GREEN | `direnv exec . pnpm lint` | Exit 0 | `eslint .` completed with no diagnostics |

Implementation notes: T014 added the exported Codex app-server manifest, runtime-inventory-compatible manifest, registry, allowed capability packet, and explicit non-goals. T015 added explicit opt-in Codex runtime-inventory registration while preserving the default two-entry fake inventory. T016 added bounded turn-input assembly that drops forbidden raw rows, secrets, provider/tool payload markers, broad context, unrelated history, and host paths. T017 added deterministic no-shell launch construction, lifecycle-root cwd/runtime roots, JSON-RPC launch message construction, and in-flight duplicate prevention. T018 added the dispatch admission evaluator with blocked reason evidence and DB-backed admission input construction from workspace flags, assignment, claim, attempt, lifecycle, and runtime inventory. T019 wired `dispatchAssignedTasks` to call the seam only for Codex app-server candidates before legacy gateway dispatch.

## T020/T022 Evidence Usage Activity RED Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T020/T022 evidence RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-evidence.test.ts` | Exit 1; 7 evidence tests failed | Real assertion failure: `AssertionError: expected Error: src/lib/harness-adapters/codex-app-server/evidence.ts is not implemented yet ... to be undefined` at `evidenceFunction`, proving `src/lib/harness-adapters/codex-app-server/evidence.ts` is not implemented yet |

Evidence RED coverage: completed `codex_app_server_run.v1` status/outcome/phase, usage, safety booleans, bounded protocol correlation ids, safe artifact refs, failure summaries, blocked-before-launch id omissions, preferred `thread/tokenUsage/updated`, reliable final-turn fallback, partial and unavailable usage, bounded activity payload fields, and no inferred token metrics.

## T021 Artifact Safety RED Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T021 artifact safety RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-artifact-safety.test.ts` | Exit 1; 17 artifact-safety tests failed | Real assertion failure: `Codex app-server evidence module must be implemented and importable`; `ERR_MODULE_NOT_FOUND` for `/src/lib/harness-adapters/codex-app-server/evidence` |

Artifact safety RED coverage: safe summaries, descriptor-only artifact references, structurally unsafe artifact content, allowed secret redaction, artifact publication policy rejection, redaction-empty rejection, unsafe host paths, storage URIs, external URLs, original filenames, raw transcripts, raw protocol payloads, prompt bodies, provider payloads, tool payloads, and MCP payloads.

## T023-T026 US2 GREEN Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T023-T026 focused US2 GREEN | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts src/lib/__tests__/task-dispatch-codex-app-server.test.ts src/lib/harness-adapters/__tests__/codex-app-server-evidence.test.ts src/lib/harness-adapters/__tests__/codex-app-server-artifact-safety.test.ts` | Exit 0 | `Test Files  4 passed (4)`; `Tests  40 passed (40)` |
| T023-T026 typecheck GREEN | `direnv exec . pnpm typecheck` | Exit 0 | `tsc -b --pretty false` completed with no diagnostics |
| T023-T026 lint GREEN | `direnv exec . pnpm lint` | Exit 0 | `eslint .` completed with no diagnostics |
| T023-T026 scope guard GREEN | `direnv exec . node scripts/spec-014c/check-scope-guard.mjs` | Exit 0 | `SPEC-014C scope guard: OK (49 changed file(s), 10 code/config file(s) scanned)` |

Implementation notes: T023 added `codex_app_server_run.v1` descriptor-only evidence builders, blocked-before-launch id omission support, failure summaries, safety flags, protocol correlation summaries, usage summaries, and activity payload builders. T024 added safe summary and descriptor-only artifact-reference filtering with structural unsafe rejection, allowed secret redaction, artifact publication policy rejection, and redaction-empty rejection. T025 extended runner launch results with terminal run evidence, activity payloads, and artifact-safety descriptors without retaining raw protocol, prompt, provider, tool, MCP, host-path, storage URI, or secret content. T026 extended dispatch decisions with schema-shaped blocked/launched admission evidence plus operator-visible activity payloads while preserving the narrow seam and legacy dispatch fallback.

## T027-T028 US3 Protocol RED Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T027/T028 protocol RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-protocol.test.ts` | Exit 1; 1 protocol test file failed | `Test Files  1 failed (1)`; `Tests  19 failed (19)`; real assertion failure: `expected Error: src/lib/harness-adapters/codex-app-server/protocol.ts is not implemented yet ... to be undefined` at `protocolFunction`, proving production `protocol.ts` is absent |

T027 RED coverage: invalid JSONL/JSON-RPC message shapes, response id mismatch, duplicate response, missing thread id, missing turn id, duplicate lifecycle event, duplicate terminal event, impossible ordering, unknown optional notification counts, and exit before handshake.

T028 RED coverage: `user_input_unsupported`, `approval_unsupported`, `tool_file_unsupported`, and `capability_unsupported` mapping across live user input, non-approval MCP elicitation, approval-like connector elicitation, command approval, file approval, permission escalation, dynamic tool call, MCP tool call, and manifest capability mismatch. The tests assert cancel responses and bounded diagnostics without raw request payload or lifecycle-root retention.

## T029 US3 RED Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T029 fail-closed runner RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts` | Exit 1; 5 runner tests failed, 5 existing tests passed | Real assertion failures: timeout currently remains `status=launched`; ENOENT spawn currently rejects instead of classifying `binary_unavailable`; subprocess and lifecycle cleanup evidence are `undefined`; preserved terminal outcome metadata is `undefined` |

RED coverage: manifest timeout termination, unavailable Codex binary spawn failure, subprocess termination cleanup failure, lifecycle cleanup failure, and preservation of original run/attempt/claim/reason outcome when cleanup fails.

## T030 US3 Ownership RED Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T030 ownership re-proof RED | `direnv exec . pnpm test src/lib/__tests__/task-dispatch-codex-app-server.test.ts` | Exit 1; 8 ownership re-proof tests failed, 11 existing dispatch tests passed | Real assertion failure: `AssertionError: expected undefined to deeply equal Any<Function>` at `evaluateOwnershipReproof`, proving `evaluateCodexAppServerOwnershipReproof` is not implemented yet |

RED coverage: before launch, same live-thread continuation, terminal evidence write, claim release, Paddock lifecycle terminal marking, stale claim-control authority winning, bounded abandoned evidence after ownership loss, and no late claim/attempt/task/GitHub/successor/governance/lifecycle mutation after ownership loss.

## T031-T035 US3 GREEN Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T031-T035 focused US1-US3 GREEN | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/validation.test.ts src/lib/harness-adapters/__tests__/runtime-inventory.test.ts src/lib/harness-adapters/__tests__/codex-app-server-manifest.test.ts src/lib/harness-adapters/__tests__/codex-app-server-protocol.test.ts src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts src/lib/harness-adapters/__tests__/codex-app-server-evidence.test.ts src/lib/harness-adapters/__tests__/codex-app-server-artifact-safety.test.ts src/lib/__tests__/task-dispatch-codex-app-server.test.ts` | Exit 0 | `Test Files  8 passed (8)`; `Tests  86 passed (86)` |
| T031-T035 typecheck GREEN | `direnv exec . pnpm typecheck` | Exit 0 | `tsc -b --pretty false` completed with no diagnostics |
| T031-T035 lint GREEN | `direnv exec . pnpm lint` | Exit 0 | `eslint .` completed with no diagnostics |
| T031-T035 scope guard GREEN | `direnv exec . node scripts/spec-014c/check-scope-guard.mjs` | Exit 0 | `SPEC-014C scope guard: OK (51 changed file(s), 11 code/config file(s) scanned)` |

Implementation notes: T031 added `protocol.ts` with bounded JSON-RPC/JSONL parsing, required response-id validation, duplicate response detection, required thread/turn id checks, duplicate lifecycle/terminal event checks, impossible-ordering detection, bounded unknown optional notification counts, and no raw protocol payload retention. T032 added unsupported request mapping for live user input, non-approval MCP elicitation, approval-like connector elicitation, command approval, file approval, permission escalation, dynamic tool calls, MCP tool calls, and unsupported capabilities, returning cancel-only protocol responses. T033 extended runner evidence for manifest timeout, `binary_unavailable`, subprocess termination cleanup failure, lifecycle cleanup failure, and preserved terminal outcome metadata. T034 added ownership re-proof before launch, same-thread continuation, terminal evidence write, claim release, and lifecycle terminal marking. T035 added bounded abandoned evidence when claim-control or stale recovery wins while forbidding late claim, attempt, task-terminal, GitHub, successor, governance, and lifecycle-terminal mutations.

## Supplemental Live Transport RED/GREEN Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| Live stdio RED | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts` | Exit 1 | `Tests  1 failed | 10 passed (11)`; live child-process test expected client messages `initialize`, `initialized`, `thread/start`, `turn/start`, but production wrote `[]` |
| Live stdio GREEN | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts` | Exit 0 | `Test Files  1 passed (1)`; `Tests  11 passed (11)` |
| Focused SPEC-014C cluster GREEN | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/validation.test.ts src/lib/harness-adapters/__tests__/runtime-inventory.test.ts src/lib/harness-adapters/__tests__/codex-app-server-manifest.test.ts src/lib/harness-adapters/__tests__/codex-app-server-protocol.test.ts src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts src/lib/harness-adapters/__tests__/codex-app-server-evidence.test.ts src/lib/harness-adapters/__tests__/codex-app-server-artifact-safety.test.ts src/lib/__tests__/task-dispatch-codex-app-server.test.ts` | Exit 0 | `Test Files  8 passed (8)`; `Tests  88 passed (88)` |
| Supplemental typecheck/lint/scope GREEN | `direnv exec . pnpm typecheck`; `direnv exec . pnpm lint`; `direnv exec . node scripts/spec-014c/check-scope-guard.mjs` | Exit 0 | TypeScript and ESLint completed with no diagnostics; scope guard `OK (51 changed file(s), 12 code/config file(s) scanned)` |

Implementation notes: the runner now uses injected protocol sequences only for deterministic fixtures. When the dispatch seam passes an empty sequence, it writes the bounded `initialize`, `initialized`, `thread/start`, and `turn/start` JSON-RPC messages to the spawned `codex app-server proxy` stdin, reads JSONL stdout responses/notifications through the same protocol parser, maps unsupported server requests to cancel responses, enforces timeout with subprocess termination, and builds evidence from the observed protocol sequence.

## Dispatch Persistence RED/GREEN Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| Persistence RED | `direnv exec . pnpm test src/lib/__tests__/task-dispatch-codex-app-server.test.ts` | Exit 1 | `Tests  1 failed | 20 passed (21)`; failure proved `persistCodexAppServerDispatchEvidence` was missing |
| Persistence GREEN | `direnv exec . pnpm test src/lib/__tests__/task-dispatch-codex-app-server.test.ts` | Exit 0 | `Test Files  1 passed (1)`; `Tests  21 passed (21)` |
| Focused SPEC-014C cluster after persistence | `direnv exec . pnpm test src/lib/harness-adapters/__tests__/validation.test.ts src/lib/harness-adapters/__tests__/runtime-inventory.test.ts src/lib/harness-adapters/__tests__/codex-app-server-manifest.test.ts src/lib/harness-adapters/__tests__/codex-app-server-protocol.test.ts src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts src/lib/harness-adapters/__tests__/codex-app-server-evidence.test.ts src/lib/harness-adapters/__tests__/codex-app-server-artifact-safety.test.ts src/lib/__tests__/task-dispatch-codex-app-server.test.ts` | Exit 0 | `Test Files  8 passed (8)`; `Tests  89 passed (89)` |

Implementation notes: successful adapter handoff now persists descriptor-only run metadata in the existing `runs` table, appends terminal task-stage attempt evidence through the existing attempt helper, and records bounded `codex_app_server_*` activity payloads. Blocked admission evidence is also recorded before returning the blocked result. No task terminal state, GitHub mutation, successor selection, auto-merge, governance mutation, new table, or raw transcript/protocol retention was added.

## T036-T038 US4 Guard RED/GREEN Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T036 static allowlist RED | `direnv exec . node scripts/spec-014c/check-scope-guard.mjs --self-test` | Exit 1 | `SPEC-014C scope guard self-test expected 19 findings, got 18`; missing generic changed-path allowlist coverage for `src/lib/workflow-contracts/codex-app-server-sync.ts` |
| T037 runtime no-mutation RED | `direnv exec . pnpm test src/lib/__tests__/task-dispatch-codex-app-server.test.ts` | Exit 1 | `Test Files  1 failed (1)`; `Tests  8 failed | 12 passed (20)`; failures showed production returned `github_sync` and omitted `task_creation`, `direct_github_mutation`, `outbound_sync`, `auto_merge`, and `aegis_owner_gate_bypass` |
| T037 runtime no-mutation GREEN | `direnv exec . pnpm test src/lib/__tests__/task-dispatch-codex-app-server.test.ts` | Exit 0 | `Test Files  1 passed (1)`; `Tests  20 passed (20)` |
| T038 static guard GREEN | `direnv exec . node scripts/spec-014c/check-scope-guard.mjs --self-test` and `direnv exec . node scripts/spec-014c/check-scope-guard.mjs` | Exit 0 | Self-test `OK (23 findings across 16 forbidden fixture(s), docs/process non-goals allowed)`; current diff `OK (51 changed file(s), 12 code/config file(s) scanned)` |
| T036-T038 typecheck GREEN | `direnv exec . pnpm typecheck` | Exit 0 | `tsc -b --pretty false` completed with no diagnostics |
| T036-T038 lint GREEN | `direnv exec . pnpm lint` | Exit 0 | `eslint .` completed with no diagnostics |

Implementation notes: T038 completed the changed-path allowlist for SPEC-014C-owned adapter, dispatch, evidence, guard, UAT/review/spec metadata, and focused test files; added task-creation and Aegis/owner-gate static fixtures; narrowed auto-merge detection so descriptor labels are allowed but behavior remains forbidden. T037 expanded runtime ownership evidence from a broad `github_sync` bucket to explicit no-mutation categories: task creation, direct GitHub mutation, outbound sync, auto-merge, Aegis/owner gate bypass, governance mutation, task terminal state, successor selection, and claim/attempt/lifecycle writes.

## Local Polish And G7 Evidence

| Task | Command | Result | Output |
|---|---|---|---|
| T046 focused validation | Focused SPEC-014C cluster from quickstart | Exit 0 | `Test Files  8 passed (8)`; `Tests  89 passed (89)` |
| T047 scope guard | `direnv exec . node scripts/spec-014c/check-scope-guard.mjs` | Exit 0 | `SPEC-014C scope guard: OK (51 changed file(s), 12 code/config file(s) scanned)` |
| T047 typecheck | `direnv exec . pnpm typecheck` | Exit 0 | `tsc -b --pretty false` completed with no diagnostics |
| T047 lint | `direnv exec . pnpm lint` | Exit 0 | `eslint .` completed with no diagnostics |
| T047 build | `direnv exec . pnpm build` outside the sandbox after sandboxed Turbopack hit a process/port restriction | Exit 0 | Next.js 16.2.6 production build compiled, ran TypeScript, generated 145 static pages, and finalized route output |
| T048 artifact scan | `rg -n "NEEDS[[:space:]]+CLARIFICATION|\\bcritical\\b|raw transcript|raw protocol|provider payload|tool payload|prompt body|host path|storage URI|fake-only|TBD|Placeholder|placeholder|remaining placeholders|HAL UAT has not been run|Final PR description" ...` | Reviewed | Remaining hits are policy/non-goal language or the intentional blocked HAL UAT status recorded in `uat-report.md`; stale placeholders were removed from this packet |
| T049 reconciliation | Tasks, UAT report, workflow, roadmap, autopilot state, and review packet reconciled | Complete | T042-T045 remain open; T046-T049 are complete; SPEC-014C remains In Progress/blocked on merged target deployment and target UAT |

## Traceability Matrix

| Area | Changed files | RED/GREEN evidence | HAL/UAT status | Review notes |
|---|---|---|---|---|
| P1 admission and launch | `src/lib/harness-adapters/codex-app-server/manifest.ts`, `input.ts`, `runner.ts`; `src/lib/harness-adapters/runtime-inventory.ts`; `src/lib/task-dispatch-codex-app-server.ts`; `src/lib/task-dispatch.ts` | T010-T013 RED; T014-T019 GREEN; supplemental live stdio RED/GREEN | Blocked on merged HAL target deployment | One adapter only; launch after claim/reconciliation/governance/lifecycle eligibility; no shell; lifecycle-root cwd |
| P2 descriptor-only run evidence | `src/lib/harness-adapters/codex-app-server/evidence.ts`, `runner.ts`, `src/lib/task-dispatch-codex-app-server.ts`; schema/contract artifacts | T020-T022 RED; T023-T026 GREEN; persistence RED/GREEN; focused cluster 8 files / 89 tests | Blocked on merged HAL target deployment | Existing `runs`, attempt events, and activities now persist descriptor-only evidence; no raw transcript/protocol/provider/tool/MCP/prompt/host-path retention |
| P3 fail-closed runtime handling | `src/lib/harness-adapters/codex-app-server/protocol.ts`, `runner.ts`, `src/lib/task-dispatch-codex-app-server.ts` | T027-T030 RED; T031-T035 GREEN; focused cluster 8 files / 89 tests | Local fixture matrix GREEN; HAL fixture matrix blocked | Covers user input, approval, tool/file, capability, timeout, binary unavailable, malformed protocol, unsafe evidence, abandoned ownership, and cleanup failure |
| P4 reviewability and no-mutation guard | `scripts/spec-014c/check-scope-guard.mjs`, dispatch tests, review/workflow/roadmap/uat artifacts | T036/T037 RED; T038 GREEN; typecheck/lint/build/scope GREEN | HAL status recorded as blocked | Static and runtime guards cover task terminal state, successor selection, task creation, direct GitHub mutation, outbound sync, auto-merge, Aegis/owner gate bypass, governance mutation, OpenClaw behavior, retention, and live intervention |
| Rollback and flag story | Existing `FEATURE_AGENT_RUNNER_SANDBOXES` and `FEATURE_TASK_CONTROL_PLANE`; no migration; no new runtime dependency | Feature flag-off admission test and guard evidence GREEN | Workspace-scoped flag-off HAL verification blocked | Disable `FEATURE_AGENT_RUNNER_SANDBOXES` to block launch before adapter handoff; no rollback SQL needed |
| Deferred ownership | Review packet, spec, plan, workflow, roadmap | Analyze and guard evidence GREEN | N/A | SPEC-014E owns richer transcript/event retention; SPEC-014F owns live intervention UI; SPEC-014D owns OpenClaw/external adapter |
| HAL real launch | `specs/014c-first-real-harness-adapter/uat-report.md` | Local live stdio path GREEN; HAL SSH/Codex command preflight GREEN; target launch blocked | Blocked | Fake-only or version-only proof is insufficient; target requires merged/promoted deployment plus real launch |
| Cleanup proof | `specs/014c-first-real-harness-adapter/uat-report.md` | Local cleanup failure classification GREEN; no HAL fixture created | Blocked | T045 must prove zero marker-scoped DB/sandbox/artifact residue after target fixture execution |

## Archive Sweep Evidence

| Check | Evidence |
|---|---|
| Archive extension available | `docs/ai/specs/autopilot-state.json` records `archive_extension_installed: true` |
| Current target exclusion | Current target is `specs/014c-first-real-harness-adapter`; archive sweep excluded that target from cleanup |
| Cleanup safety | `safeToApplyCleanup: false`; active branch is a feature worktree, so no active `specs/**` cleanup was applied |
| Raw artifact recovery | Current SPEC-014C artifacts remain live in the feature branch. After merge, recover checked-in artifacts with `git show <merge-or-feature-ref>:specs/014c-first-real-harness-adapter/<artifact>` and workflow state with `git show <merge-or-feature-ref>:docs/ai/specs/SPEC-014C-workflow.md` |
| T003 verification | Parent/root checkout status was checked after scaffold workers reported transient wrong-target patches; no stray root artifacts remained |

## Deferred: SPEC-014E

SPEC-014E owns richer harness run evidence retention and transcript policy. SPEC-014C must not build raw transcript/event storage, replay/debug exports, quarantine policy, retention windows, or opt-in raw capture.

Review check: any SPEC-014C implementation that needs schema-heavy retention or raw transcript/provider/tool payload persistence must stop and split to SPEC-014E.

## Deferred: SPEC-014F

SPEC-014F owns harness operator intervention UI. SPEC-014C must fail closed for live user input, command approval, file approval, tool requests, MCP elicitation, permission escalation, and operator stop/answer flows instead of adding a live intervention UI.

Review check: any SPEC-014C implementation that needs operator prompts, approval handling, pause/resume UI, answer capture, deny controls, or intervention evidence surfaces must stop and split to SPEC-014F.

## Known Gaps Until Target UAT

- Archive sweep evidence is recorded, but no archive cleanup was applied from this feature branch.
- HAL UAT is blocked because SPEC-014C is not merged/promoted to a target commit; HAL SSH and Codex app-server command preflight are restored.
- T042-T045 remain open: deployed commit/service evidence, one real Codex app-server target launch, HAL failure matrix, workspace-scoped flag proof, and zero-residue cleanup proof are not captured.
- Local implementation, persistence, fail-closed fixtures, no-mutation guards, G7 validation, workflow status, roadmap status, and autopilot status are reconciled.
