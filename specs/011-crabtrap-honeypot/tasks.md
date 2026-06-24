# Tasks: SPEC-011 CrabTrap Honeypot Adapter

**Input**: Design documents from `specs/011-crabtrap-honeypot/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/crabtrap-denial-summary.v1.schema.json`, `quickstart.md`, `docs/ai/specs/.process/SPEC-011-design-concept.md`, and checklist results under `specs/011-crabtrap-honeypot/checklists/`.

**Tests**: Required. SPEC-011 is a production behavior change and must begin with failing focused Vitest coverage before implementation.

**Reviewability**: Plan remains within the approved reviewability budget: one primary surface (`harness/adapter`), two projected production files, 8-12 projected total files, and 250-400 projected reviewable LOC. If implementation expands beyond 400 reviewable LOC, 6 production files, 15 total files, or one primary surface, stop before implementation continues and record a split or ratified exception.

## Scope Notes

- In scope: `src/lib/crabtrap-adapter.ts`, `src/lib/feature-flags.ts`, focused Vitest tests and fixtures, strict-scope registration, guardrail allowlist/scope proof, fixture UAT evidence, PR packet, and roadmap/workflow status updates.
- Out of scope unless a later Clarify and Plan explicitly ratify it: route, webhook receiver, OpenAPI contract, UI panel, schema migration, scheduler/task-dispatch path, notification fanout, GitHub mutation, task terminal mutation, successor selection, raw audit persistence, and live CrabTrap Docker as a blocking completion gate.

## Phase 1: Setup (RED-First Test Baseline)

**Purpose**: Create the failing test and fixture surface before production implementation.

- [ ] T001 Create failing Vitest cases for flag-off, missing config, valid fixture, malformed fixture, invalid signature, stale/replayed event, oversized payload, unsafe fields, and activity write failure isolation in `src/lib/__tests__/crabtrap-adapter.test.ts`
- [ ] T002 [P] Add SPEC-011 fixture corpus for valid, malformed, unsigned, stale, replayed, oversized, unsafe, unsupported-decision, and unsupported-method cases in `src/lib/__tests__/fixtures/crabtrap/`
- [ ] T003 Run `pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts` and record the expected RED failure evidence in `specs/011-crabtrap-honeypot/.process/uat-runbook.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Register the disabled-by-default flag, strict scope, guardrails, and reviewability checkpoint before user-story implementation.

- [ ] T004 [P] Register `FEATURE_CRABTRAP_HONEYPOT` as a typed default-off flag in `src/lib/feature-flags.ts`
- [ ] T005 [P] Add `src/lib/crabtrap-adapter.ts` and `src/lib/__tests__/crabtrap-adapter.test.ts` to strict new-module scope in `tsconfig.spec-strict.json` and `eslint.config.mjs`
- [ ] T006 [P] Update SPEC-011 guardrail ownership/allowlist entries for the approved adapter, test, fixture, and UAT files in `scripts/check-guardrails.mjs`
- [ ] T007 Record the pre-implementation reviewability checkpoint and stop/split condition in `specs/011-crabtrap-honeypot/.process/uat-runbook.md`

**Checkpoint**: Foundation ready. User-story implementation can start only after RED test evidence and reviewability checkpoint are recorded.

---

## Phase 3: User Story 1 - Disabled And Absent Safe (Priority: P1)

**Goal**: CrabTrap intake is a no-op when the feature is disabled, config is missing/invalid, or CrabTrap runtime is absent.

**Independent Test**: Run the focused Vitest suite and confirm flag-off, missing-config, invalid-config, and CrabTrap-absent cases write zero `security_intrusion_detected` activity rows.

### Implementation for User Story 1

- [ ] T008 [US1] Implement exported adapter input, config, context, result, and closed failure-code types in `src/lib/crabtrap-adapter.ts`
- [ ] T009 [US1] Implement `resolveFlag('FEATURE_CRABTRAP_HONEYPOT', ctx)` gating and feature-disabled no-op behavior in `src/lib/crabtrap-adapter.ts`
- [ ] T010 [US1] Implement missing-config and invalid-config no-op validation without requiring any CrabTrap binary, service, route, or admin API in `src/lib/crabtrap-adapter.ts`
- [ ] T011 [US1] Run US1 focused assertions in `src/lib/__tests__/crabtrap-adapter.test.ts` and keep only the expected non-US1 failures remaining

**Checkpoint**: User Story 1 is independently testable with no CrabTrap runtime and zero activity writes.

---

## Phase 4: User Story 2 - Bounded Denial Evidence (Priority: P1)

**Goal**: A valid signed denial-summary fixture creates exactly one bounded `activities.type='security_intrusion_detected'` row.

**Independent Test**: Enable the flag and valid config, replay one fresh signed fixture, and verify exactly one activity row with fixed actor `crabtrap-adapter`, workspace/facility landing scope, approved bounded `data`, and no raw sensitive values.

### Implementation for User Story 2

- [ ] T012 [US2] Implement deterministic canonical JSON hashing, SHA-256 helpers, HMAC-SHA256 signing verification, and constant-time comparison in `src/lib/crabtrap-adapter.ts`
- [ ] T013 [US2] Implement strict `crabtrap_denial_summary.v1` normalization with allowed fields, lowercased host, parsed pathname, hash/count bounds, and approved context scope in `src/lib/crabtrap-adapter.ts`
- [ ] T014 [US2] Implement adapter-derived `data.replay_key_hash`, workspace/facility landing selection, existing-activity replay lookup, and exactly-one activity insert in `src/lib/crabtrap-adapter.ts`
- [ ] T015 [US2] Finalize valid signed fixture and expected bounded activity data assertions in `src/lib/__tests__/fixtures/crabtrap/`
- [ ] T016 [US2] Run US2 focused assertions in `src/lib/__tests__/crabtrap-adapter.test.ts` and confirm the valid signed fixture creates exactly one bounded activity row

**Checkpoint**: User Story 2 is independently testable with one valid signed fixture and no raw audit persistence.

---

## Phase 5: User Story 3 - Unsafe Or Invalid Payload Rejection (Priority: P1)

**Goal**: Malformed, unsigned, stale, replayed, oversized, unsupported, or unsafe fixtures are rejected before persistence with bounded diagnostics.

**Independent Test**: Replay the negative fixture matrix and verify each case returns the expected closed failure code and writes zero activity rows.

### Implementation for User Story 3

- [ ] T017 [US3] Implement pre-parse 16 KiB payload-size rejection, malformed JSON rejection, and strict unknown-field/schema validation in `src/lib/crabtrap-adapter.ts`
- [ ] T018 [US3] Implement missing signature, missing/invalid/stale timestamp, invalid signature, and first-match failure ordering in `src/lib/crabtrap-adapter.ts`
- [ ] T019 [US3] Implement unsafe-field and secret-like value rejection for raw URLs, headers, bodies, cookies, auth material, query secrets, provider payloads, raw actors, emails, raw secret hashes, and full audit rows in `src/lib/crabtrap-adapter.ts`
- [ ] T020 [US3] Implement unsupported decision/method rejection, replay-detected rejection, and activity-write-failed isolation without scheduler, dispatch, task, GitHub, notification, route, UI, or OpenAPI mutation in `src/lib/crabtrap-adapter.ts`
- [ ] T021 [US3] Run US3 negative fixture assertions in `src/lib/__tests__/crabtrap-adapter.test.ts` and confirm all rejection paths write zero activity rows

**Checkpoint**: User Story 3 is independently testable with the negative fixture matrix and bounded diagnostics only.

---

## Phase 6: User Story 4 - Scope Isolation Review (Priority: P2)

**Goal**: Reviewers can verify the slice stayed helper-only, reviewable, and isolated from forbidden product surfaces.

**Independent Test**: Inspect guardrail output, diff proof, UAT evidence, and PR packet traceability for no migration, route, OpenAPI, UI, scheduler/task-dispatch, notification, GitHub, task terminal, or successor-selection changes.

### Implementation for User Story 4

- [ ] T022 [P] [US4] Update fixture UAT evidence checklist and no-raw-persistence inspection steps in `specs/011-crabtrap-honeypot/.process/uat-runbook.md`
- [ ] T023 [P] [US4] Draft PR review packet skeleton with review order, scope budget, traceability, verification evidence, known gaps, and rollback/flag notes in `specs/011-crabtrap-honeypot/.process/pr-review-packet.md`
- [ ] T024 [US4] Run diff inspection for forbidden route, webhook, OpenAPI, UI, migration, scheduler, dispatch, notification, GitHub, task terminal, and successor-selection surfaces and record results in `specs/011-crabtrap-honeypot/.process/pr-review-packet.md`
- [ ] T025 [US4] Confirm final touched-file and reviewable-LOC scope remains within the accepted budget and record the split decision in `specs/011-crabtrap-honeypot/.process/pr-review-packet.md`

**Checkpoint**: Scope isolation is reviewable from guardrails, diff proof, UAT evidence, and the PR packet.

---

## Phase 7: Polish & Cross-Cutting Verification

**Purpose**: Complete fixture UAT, repository checks, review packet, and roadmap/workflow status updates.

- [ ] T026 Run the full fixture UAT matrix and record flag-off, config-missing, valid, malformed, unsigned, stale, replayed, oversized, unsafe, unsupported, and activity-write-failed evidence in `specs/011-crabtrap-honeypot/.process/uat-runbook.md`
- [ ] T027 Run `pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts` and record focused adapter verification in `specs/011-crabtrap-honeypot/.process/pr-review-packet.md`
- [ ] T028 Run `pnpm guardrails` and record guardrail/scope-control verification in `specs/011-crabtrap-honeypot/.process/pr-review-packet.md`
- [ ] T029 Run `pnpm typecheck` and `pnpm lint` and record TypeScript/lint verification in `specs/011-crabtrap-honeypot/.process/pr-review-packet.md`
- [ ] T030 Run `pnpm test` and `pnpm build` and record unit/build verification in `specs/011-crabtrap-honeypot/.process/pr-review-packet.md`
- [ ] T031 Finalize the PR packet with non-goals, review order, scope budget, traceability, verification evidence, known gaps, and rollback/feature-flag notes in `specs/011-crabtrap-honeypot/.process/pr-review-packet.md`
- [ ] T032 Update SPEC-011 roadmap and workflow status after verification in `docs/ai/rc-factory-technical-roadmap.md` and `docs/ai/specs/.process/SPEC-011-workflow.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies. Starts with failing Vitest tests and fixtures.
- **Phase 2**: Depends on Phase 1 RED evidence. Blocks implementation work.
- **Phase 3 (US1)**: Depends on Phase 2. Establishes disabled/default-safe behavior.
- **Phase 4 (US2)**: Depends on US1 gating/config behavior.
- **Phase 5 (US3)**: Depends on US2 normalization/signature/replay primitives.
- **Phase 6 (US4)**: Depends on implemented US1-US3 behavior.
- **Phase 7**: Depends on all selected user stories and scope evidence.

### User Story Dependencies

- **US1 (P1)**: MVP. Can complete after foundational tasks.
- **US2 (P1)**: Depends on US1 no-op and config gates.
- **US3 (P1)**: Depends on US2 parsing, signing, normalization, replay, and activity insertion primitives.
- **US4 (P2)**: Depends on final implementation and verification evidence.

### Parallel Opportunities

- T002 can run in parallel with T001 because fixtures live under `src/lib/__tests__/fixtures/crabtrap/` and tests live in `src/lib/__tests__/crabtrap-adapter.test.ts`.
- T004, T005, and T006 can run in parallel after Phase 1 because they touch `src/lib/feature-flags.ts`, strict-scope config files, and `scripts/check-guardrails.mjs` independently.
- T022 and T023 can run in parallel after US1-US3 because UAT evidence and PR packet skeleton files are separate.

---

## Parallel Example: Foundational Tasks

```text
Task: "Register FEATURE_CRABTRAP_HONEYPOT as a typed default-off flag in src/lib/feature-flags.ts"
Task: "Add src/lib/crabtrap-adapter.ts and src/lib/__tests__/crabtrap-adapter.test.ts to strict new-module scope in tsconfig.spec-strict.json and eslint.config.mjs"
Task: "Update SPEC-011 guardrail ownership/allowlist entries in scripts/check-guardrails.mjs"
```

---

## Implementation Strategy

### MVP First (US1)

1. Complete Phase 1 and confirm focused Vitest starts RED.
2. Complete Phase 2 and record reviewability scope.
3. Complete US1 only.
4. Stop and validate flag-off, missing-config, invalid-config, and absent-runtime no-op behavior.

### Incremental Delivery

1. US1: disabled/default-safe no-op behavior.
2. US2: one valid signed fixture creates exactly one bounded activity row.
3. US3: negative fixture matrix rejects before persistence.
4. US4: guardrail, no-raw-persistence, reviewability, and scope-control evidence.

### Final Verification

Run fixture UAT, focused Vitest, guardrails, typecheck, lint, unit tests, and build. Do not add or validate route, OpenAPI, UI, scheduler/task-dispatch, notification fanout, GitHub mutation, task terminal mutation, successor selection, schema migration, raw audit persistence, or live CrabTrap Docker as a SPEC-011 completion requirement.
