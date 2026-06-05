# Tasks: SPEC-014C First Real Harness Adapter Pilot

**Input**: Design documents from `specs/014c-first-real-harness-adapter/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and `checklists/`
**Tests**: Required. SPEC-014C is TDD-first by constitution and by phase prompt. Every user-story phase starts with RED tests or guards, then implementation tasks that must capture GREEN command evidence in `specs/014c-first-real-harness-adapter/pr-review-packet.md`.
**Scope boundary**: Exactly one Codex app-server adapter plus narrow dispatch/evidence integration. Do not add a second adapter, UI/live intervention, transcript retention platform, broad scheduler rewrite, schema migration, direct task terminal/GitHub/governance mutation, or OpenClaw behavior.

## Phase 1: Setup

**Purpose**: Establish review evidence scaffolds, strict-scope tracking, and archive/evidence guardrails before implementation.

- [x] T001 Create the initial review packet scaffold with source design citation, scope budget, review order, RED/GREEN evidence table, and deferred SPEC-014E/SPEC-014F sections in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T002 Create the HAL UAT report scaffold with descriptor-only evidence, real-launch gate, deterministic fixture matrix, service health, flag scope, cleanup proof, and fake-only insufficiency sections in `specs/014c-first-real-harness-adapter/uat-report.md`
- [x] T003 [P] Record Archive Sweep dry-run/current-target-exclusion and recovery-command evidence for SPEC-014C in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T004 [P] Add SPEC-014C-owned source modules to strict TypeScript coverage in `tsconfig.spec-strict.json`
- [x] T005 [P] Add SPEC-014C-owned source, test, and guard files to lint coverage in `eslint.config.mjs`

---

## Phase 2: Foundational

**Purpose**: Create shared fixtures and scope checks that block all user-story implementation.

- [x] T006 [P] Create deterministic Codex app-server protocol, subprocess, lifecycle, claim, usage, and unsafe-output fixture builders in `src/lib/harness-adapters/__tests__/codex-app-server-fixtures.ts`
- [x] T007 [P] Create shared SPEC-014C reason-code and terminal-mapping fixture data for blocked, failed, timeout, abandoned, and cleanup-failed cases in `src/lib/harness-adapters/__tests__/codex-app-server-fixtures.ts`
- [x] T008 Create the initial static scope guard with forbidden pattern coverage for second adapters, OpenClaw, UI/live intervention, transcript retention, direct task/GitHub/governance mutation, successor selection, auto-merge, and broad scheduler rewrites in `scripts/spec-014c/check-scope-guard.mjs`
- [x] T009 Run `node scripts/spec-014c/check-scope-guard.mjs` and record initial RED guard evidence or explicit not-yet-implemented status in `specs/014c-first-real-harness-adapter/pr-review-packet.md`

**Checkpoint**: Shared fixtures and guard scaffolds exist before user-story RED tests.

---

## Phase 3: User Story 1 - Admit And Launch A Claimed Stage (Priority: P1)

**Goal**: Admit only an already-claimed, GitHub-linked, assigned, governance-allowed stage through runtime inventory and launch exactly one Codex app-server subprocess from the Paddock-owned sandbox.

**Independent Test**: A disposable eligible claimed stage launches one bounded `codex app-server --listen stdio://` attempt and records run, attempt, lifecycle, activity, and safe evidence; ineligible cases block before launch with specific reason codes.

### Tests for User Story 1

- [x] T010 [P] [US1] Create RED manifest tests for exactly one `codex-app-server` real adapter, timeout, launch support, sandbox posture, allowed capability packet, and explicit non-goals in `src/lib/harness-adapters/__tests__/codex-app-server-manifest.test.ts`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T011 [P] [US1] Create RED dispatch admission tests for eligible claimed/GitHub-linked/assigned/governed/lifecycle-ready launch and blocked flag-off, unassigned, non-GitHub-linked, governance-denied, manifest-mismatch, lifecycle-failure, workspace-mismatch, and repository-mismatch cases in `src/lib/__tests__/task-dispatch-codex-app-server.test.ts`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T012 [P] [US1] Create RED runner launch tests for no-shell spawn, process `cwd` under lifecycle root, bounded runtime workspace roots, initialize/initialized/thread/start/turn/start/turn/started sequence, and exactly one subprocess per admitted attempt in `src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T013 [P] [US1] Create RED input minimization tests for bounded GitHub issue, workflow stage, task/stage, assignment, repository, claim, manifest, capability, and handoff fields plus forbidden raw rows, secrets, transcripts, provider/tool payloads, broad context, unrelated history, and host paths in `src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`

### Implementation for User Story 1

- [x] T014 [US1] Implement the Codex app-server manifest and exported manifest identity in `src/lib/harness-adapters/codex-app-server/manifest.ts` until `pnpm vitest run src/lib/harness-adapters/__tests__/codex-app-server-manifest.test.ts` is GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T015 [US1] Register only the Codex app-server manifest through the existing runtime inventory path in `src/lib/harness-adapters/runtime-inventory.ts` until manifest and admission tests stay GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T016 [US1] Implement bounded task-stage input assembly and forbidden-field rejection in `src/lib/harness-adapters/codex-app-server/input.ts` until input minimization tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T017 [US1] Implement the launch runner for `codex app-server --listen stdio://`, no-shell subprocess construction, lifecycle-root cwd, official handshake/thread/turn launch, and duplicate-launch prevention in `src/lib/harness-adapters/codex-app-server/runner.ts` until runner launch tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T018 [US1] Implement the narrow dispatch admission seam, blocked reason evidence, feature-flag blocking, and adapter invocation handoff in `src/lib/task-dispatch-codex-app-server.ts` until dispatch admission tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T019 [US1] Wire the existing dispatch trigger to call the SPEC-014C dispatch seam without adding routes, manual controls, scheduler rewrites, task terminal writes, GitHub writes, successor selection, or governance mutation in `src/lib/task-dispatch.ts` until dispatch admission tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`

**Checkpoint**: US1 can launch one eligible real adapter attempt and block all tested ineligible cases without direct terminal, GitHub, successor, or governance mutation.

---

## Phase 4: User Story 2 - Inspect Safe Run Evidence (Priority: P2)

**Goal**: Publish descriptor-only run, attempt, lifecycle, activity, usage, failure, and artifact-reference evidence without raw transcripts, secrets, provider/tool payloads, broad prompts, host paths, storage URIs, or unsafe content.

**Independent Test**: A successful or controlled-failure attempt produces bounded operator-visible evidence, usage availability, safe artifact descriptors, and explicit unsafe/redacted outcomes.

### Tests for User Story 2

- [x] T020 [P] [US2] Create RED evidence-schema tests for `codex_app_server_run.v1` status, outcome, phase, reason, usage, safety booleans, protocol correlation ids, artifact refs, failure summaries, and blocked-before-launch id omissions in `src/lib/harness-adapters/__tests__/codex-app-server-evidence.test.ts`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T021 [P] [US2] Create RED artifact safety tests for safe summaries, descriptor-only artifact references, structural unsafe rejection, allowed secret redaction, artifact policy rejection, redaction-empty rejection, unsafe host paths, storage URIs, original filenames, raw transcripts, prompt bodies, and provider/tool/MCP payloads in `src/lib/harness-adapters/__tests__/codex-app-server-artifact-safety.test.ts`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T022 [P] [US2] Create RED usage and activity evidence tests for preferred `thread/tokenUsage/updated`, reliable final-turn fallback, partial/unavailable usage, bounded activity payload fields, and no inferred token metrics in `src/lib/harness-adapters/__tests__/codex-app-server-evidence.test.ts`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`

### Implementation for User Story 2

- [x] T023 [US2] Implement descriptor-only run evidence builders, blocked evidence, failure summaries, usage summaries, safety flags, and schema guards in `src/lib/harness-adapters/codex-app-server/evidence.ts` until evidence-schema tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T024 [US2] Implement safe artifact descriptor creation through the existing task-artifact/redaction path in `src/lib/harness-adapters/codex-app-server/evidence.ts` until artifact safety tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T025 [US2] Integrate launched, completed, failed, timeout, unsafe, unavailable-binary, abandoned, cleanup-failed, usage, failure, activity, and artifact-reference evidence publication in `src/lib/harness-adapters/codex-app-server/runner.ts` until evidence and runner tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T026 [US2] Extend blocked-before-launch and operator-visible admission evidence in `src/lib/task-dispatch-codex-app-server.ts` until dispatch evidence tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`

**Checkpoint**: US2 exposes every required operator outcome through safe descriptor evidence and publishes no forbidden payload class.

---

## Phase 5: User Story 3 - Fail Closed On Unsupported Runtime Events (Priority: P3)

**Goal**: Fail closed for unsupported live input, approval, tool/file, capability, binary, malformed protocol, timeout, unsafe evidence, stale ownership, and cleanup failure cases while preserving existing claim-control authority.

**Independent Test**: Deterministic protocol and runner fixtures exercise each failure class through the same parser, failure mapper, lifecycle, timeout, and artifact/redaction paths as live app-server events.

### Tests for User Story 3

- [x] T027 [P] [US3] Create RED protocol state-machine tests for invalid JSON-RPC/JSONL, response id mismatch, duplicate response, missing thread/turn ids, duplicate lifecycle events, duplicate terminal events, impossible ordering, unknown optional notification counts, and exit before handshake in `src/lib/harness-adapters/__tests__/codex-app-server-protocol.test.ts`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T028 [P] [US3] Create RED unsupported-request mapping tests for `user_input_unsupported`, `approval_unsupported`, `tool_file_unsupported`, and `capability_unsupported` across user input, MCP elicitation, command approval, file approval, permission escalation, dynamic tools, MCP tools, and manifest capability mismatch in `src/lib/harness-adapters/__tests__/codex-app-server-protocol.test.ts`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T029 [P] [US3] Create RED timeout, binary unavailable, subprocess termination failure, lifecycle cleanup failure, and preserved-terminal-outcome tests in `src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T030 [P] [US3] Create RED ownership re-proof tests for before launch, continuation, terminal evidence write, claim release, lifecycle terminal marking, stale claim-control win, abandoned evidence, and no late mutation in `src/lib/__tests__/task-dispatch-codex-app-server.test.ts`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`

### Implementation for User Story 3

- [x] T031 [US3] Implement the Codex app-server JSON-RPC protocol state machine, lifecycle authority, bounded notification counts, and malformed-protocol classification in `src/lib/harness-adapters/codex-app-server/protocol.ts` until protocol state-machine tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T032 [US3] Implement unsupported user-input, approval, tool/file, MCP, permission, and capability request classification in `src/lib/harness-adapters/codex-app-server/protocol.ts` until unsupported-request tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T033 [US3] Implement manifest timeout, binary-unavailable detection, subprocess cancel/terminate handling, and appended `cleanup_failed` evidence in `src/lib/harness-adapters/codex-app-server/runner.ts` until timeout and cleanup tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T034 [US3] Implement ownership re-proof before launch, continuation, terminal evidence write, claim release, and lifecycle terminal marking in `src/lib/task-dispatch-codex-app-server.ts` until ownership tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T035 [US3] Implement safe abandoned-by-claim-control behavior that terminates the subprocess and avoids late claim, attempt, task terminal, GitHub, successor, or governance writes in `src/lib/harness-adapters/codex-app-server/runner.ts` until ownership and runner tests are GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`

**Checkpoint**: US3 fail-closed paths are typed, bounded, observable, and do not override claim-control or stale-recovery authority.

---

## Phase 6: User Story 4 - Review A Bounded Adapter PR (Priority: P4)

**Goal**: Prove the PR owns only one adapter and narrow dispatch/evidence integration, with complete traceability, HAL UAT evidence, and deferred retention/intervention ownership.

**Independent Test**: Scope guard, no-mutation guard, review packet, UAT report, workflow status, and verification evidence show no second adapter, UI/live intervention, transcript retention platform, broad scheduler rewrite, migration, direct GitHub/task/governance mutation, or OpenClaw behavior.

### Tests and Guards for User Story 4

- [x] T036 [P] [US4] Create RED static no-mutation and scope-guard checks for SPEC-014C-owned files in `scripts/spec-014c/check-scope-guard.mjs`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T037 [P] [US4] Create RED runtime no-mutation assertions around task terminal state, successor selection, task creation, direct GitHub mutation, outbound sync, auto-merge, Aegis/owner gate bypass, and governance mutation in `src/lib/__tests__/task-dispatch-codex-app-server.test.ts`; record RED output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`

### Implementation for User Story 4

- [x] T038 [US4] Implement the static scope guard allowlist and forbidden-pattern enforcement for adapter, dispatch, evidence, script, UAT, and review-packet files in `scripts/spec-014c/check-scope-guard.mjs` until `node scripts/spec-014c/check-scope-guard.mjs` is GREEN and record GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T039 [US4] Complete the PR review packet traceability matrix mapping P1-P3 stories, every failure category, changed files, RED/GREEN tests, HAL UAT evidence, rollback/flag notes, non-goals, and SPEC-014E/SPEC-014F deferred ownership in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T040 [US4] Update the SPEC-014C workflow ledger with Phase 5 tasks status, implementation verification evidence, HAL UAT dependency, and no-split scope status in `docs/ai/specs/SPEC-014C-workflow.md`
- [x] T041 [US4] Update roadmap and autopilot status with SPEC-014C implementation/UAT readiness and next blocked/unblocked state in `docs/ai/rc-factory-technical-roadmap.md` and `docs/ai/specs/autopilot-state.json`
- [x] T042 [US4] Execute HAL UAT preflight for deployed commit, `paddock.service`, `openclaw-gateway.service`, real `codex app-server --listen stdio://` availability, and workspace-scoped feature flags; record descriptor-only results in `specs/014c-first-real-harness-adapter/uat-report.md`
- [x] T043 [US4] Execute HAL UAT real launch for one marker-scoped disposable GitHub-linked assigned claimed stage with real handshake/thread/turn evidence from the Paddock-owned sandbox; record descriptor-only run, attempt, lifecycle, activity, usage, artifact, and cleanup results in `specs/014c-first-real-harness-adapter/uat-report.md`
- [x] T044 [US4] Execute HAL UAT deterministic failure fixtures for unsupported user input, approval/tool/file/capability, timeout, malformed protocol/output, unsafe evidence rejection, allowed redaction, cleanup failure, and feature-flag-off blocking through the same parser/mapper/lifecycle/timeout/redaction paths; record descriptor-only results in `specs/014c-first-real-harness-adapter/uat-report.md`
- [x] T045 [US4] Verify zero marker-scoped DB row, sandbox path, and artifact path residue after HAL report capture, or record the unresolved cleanup blocker without marking SPEC-014C complete in `specs/014c-first-real-harness-adapter/uat-report.md`

**Checkpoint**: US4 is complete only when the guard, PR packet, workflow/status docs, and HAL UAT report prove the bounded adapter scope and completion gates.

---

## Phase 7: Polish And Cross-Cutting Validation

**Purpose**: Run focused validation, verify markers, and prepare the artifact set for G7 implementation closeout without expanding scope.

- [x] T046 Run focused Vitest validation commands from `specs/014c-first-real-harness-adapter/quickstart.md` and append GREEN or blocker results to `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T047 Run `node scripts/spec-014c/check-scope-guard.mjs`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`, then append command results and any blocker to `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T048 [P] Scan SPEC-014C artifacts for unresolved clarification, gap, critical, raw transcript, raw protocol, provider payload, tool payload, prompt body, host path, storage URI, and fake-only acceptance language in `specs/014c-first-real-harness-adapter/pr-review-packet.md`
- [x] T049 Reconcile task completion evidence, UAT status, workflow status, roadmap/autopilot state, and PR review packet traceability before G7 in `specs/014c-first-real-harness-adapter/pr-review-packet.md`

---

## Dependencies And Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies. Creates evidence scaffolds and strict-scope wiring.
- **Phase 2 Foundational**: Depends on Phase 1. Blocks all user-story implementation.
- **Phase 3 US1**: Depends on Phase 2. MVP adapter admission and launch.
- **Phase 4 US2**: Depends on Phase 2 and can start after US1 test scaffolds exist, but final GREEN evidence depends on US1 runner/evidence integration.
- **Phase 5 US3**: Depends on Phase 2 and can write RED tests in parallel with US1/US2, but final GREEN evidence depends on protocol/runner/dispatch integration.
- **Phase 6 US4**: Guard RED tasks can start after Phase 2; HAL/report closeout depends on US1-US3 implementation.
- **Phase 7 Polish**: Depends on selected user stories and HAL UAT/report tasks.

### User Story Dependencies

- **US1 (P1)**: Required MVP. Delivers single-adapter manifest, admission, launch, and blocked-before-launch behavior.
- **US2 (P2)**: Builds on US1 launch and blocked evidence to publish safe descriptor-only operator evidence.
- **US3 (P3)**: Builds on US1 runner and US2 evidence to classify fail-closed protocol, timeout, ownership, cleanup, and unsafe-output paths.
- **US4 (P4)**: Builds on US1-US3 for PR traceability and HAL UAT closeout; guard tasks can run earlier.

### RED/GREEN Order

- Write all tests or guards for a story first and capture RED command output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`.
- Implement only the smallest source change needed for those tests.
- Re-run the named focused command and capture GREEN output in `specs/014c-first-real-harness-adapter/pr-review-packet.md`.
- Do not mark a story checkpoint complete until its independent test criteria are met.

---

## Parallel Opportunities

- T003, T004, and T005 can run in parallel after T001-T002 are understood.
- T006 and T007 can run in parallel because they share a test helper but cover independent fixture families; coordinate final writes to `src/lib/harness-adapters/__tests__/codex-app-server-fixtures.ts`.
- US1 RED tests T010-T013 can run in parallel.
- US2 RED tests T020-T022 can run in parallel.
- US3 RED tests T027-T030 can run in parallel.
- US4 guard RED tasks T036-T037 can run in parallel after Phase 2.
- Final scans T048 can run in parallel with validation result collection once implementation commands finish.

## Parallel Example: US1 RED Tests

```bash
pnpm vitest run src/lib/harness-adapters/__tests__/codex-app-server-manifest.test.ts
pnpm vitest run src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts
pnpm vitest run src/lib/__tests__/task-dispatch-codex-app-server.test.ts
```

## Parallel Example: US2 RED Tests

```bash
pnpm vitest run src/lib/harness-adapters/__tests__/codex-app-server-evidence.test.ts
pnpm vitest run src/lib/harness-adapters/__tests__/codex-app-server-artifact-safety.test.ts
```

## Parallel Example: US3 RED Tests

```bash
pnpm vitest run src/lib/harness-adapters/__tests__/codex-app-server-protocol.test.ts
pnpm vitest run src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts
pnpm vitest run src/lib/__tests__/task-dispatch-codex-app-server.test.ts
```

---

## Implementation Strategy

### MVP First: US1 Only

1. Complete Phase 1 and Phase 2.
2. Write US1 RED tests T010-T013 and capture RED evidence.
3. Implement T014-T019 until focused US1 commands are GREEN.
4. Stop and validate one eligible launch plus blocked admission cases before adding evidence and failure breadth.

### Incremental Delivery

1. Add US1 for admission and launch.
2. Add US2 for safe evidence and artifact safety.
3. Add US3 for fail-closed protocol, timeout, ownership, and cleanup paths.
4. Add US4 for scope guard, PR packet, workflow/status updates, HAL UAT, and zero-residue proof.

### Split Triggers

Stop and record a split decision instead of implementing if the work requires any of the following:

- A second real adapter or OpenClaw-specific behavior.
- UI/live intervention, approval UI, or operator prompt capture.
- Transcript retention, raw protocol retention, replay/debug export, or a schema-heavy run platform.
- Broad scheduler rewrite, new launch route/button, direct task terminal mutation, direct GitHub mutation, successor selection, auto-merge, or governance mutation.
- A schema migration, new runtime dependency, more than 8 production files, more than 25 total files, or more than one primary surface without a ratified exception.
