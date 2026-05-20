# Tasks: Pilot Review Packet and Lifecycle Snapshot

**Input**: Design documents from `/specs/009d-pilot-review-lifecycle/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/pilot-review-packet.md, quickstart.md
**Tests**: Required. SPEC-009D is TDD-first: every production change has a preceding failing Vitest or route-adjacent artifact test.

**Primary implementation surface**: `src/lib/pilot-review-packet.ts`
**Existing artifact surface**: `src/lib/task-artifacts.ts`, `src/app/api/task-artifacts/route.ts`, `src/app/api/task-artifacts/[id]/route.ts`

## Phase 1: Setup (Shared Evidence And Test Scaffolding)

**Purpose**: Establish implementation evidence, fixtures, and scope guardrails before production work.

- [ ] T001 Record Archive Sweep dry-run/startup evidence, current-target exclusion, cleanup safety, recovery-command evidence, and screenshot/evidence guard status in specs/009d-pilot-review-lifecycle/checklists/archive-sweep.md
- [ ] T002 [P] Add SPEC-009D packet fixture builders for tasks, descendants, activities, notifications, task artifacts, quality reviews, governance rows, GitHub sync rows, and smoke checklist references in src/lib/__tests__/pilot-review-packet.fixtures.ts
- [ ] T003 [P] Record no-new-dependency, no-migration, no-new-dashboard, no-fresh-GitHub-call, and no-SPEC-013/SPEC-014-capability scope checks in specs/009d-pilot-review-lifecycle/checklists/implementation-scope.md
- [ ] T004 [P] Record existing task-artifact read/list/publication seam verification for packet JSON and Markdown inspection in specs/009d-pilot-review-lifecycle/checklists/artifact-surface.md

---

## Phase 2: Foundational (Blocking Contract Tests)

**Purpose**: Create failing contract coverage that blocks all user-story implementation.

**CRITICAL**: No production packet implementation begins until these tests exist and fail for the missing module behavior.

- [ ] T005 [P] Add failing packet schema and source-map reference contract tests for `spec-009d.packet.v1` top-level keys and RFC 6901 pointer keys in src/lib/__tests__/pilot-review-packet.test.ts
- [ ] T006 [P] Add failing artifact metadata and same-snapshot publication contract tests for `pilot_review_packet_json` and `pilot_review_packet_markdown` in src/lib/__tests__/pilot-review-packet-artifacts.test.ts
- [ ] T007 Implement minimal exported SPEC-009D constants, packet types, source-map types, and safe Markdown escaping helpers in src/lib/pilot-review-packet.ts

**Checkpoint**: Packet contracts fail first, then the minimal type/constants layer satisfies only foundational compile needs.

---

## Phase 3: User Story 1 - Inspect One Pilot Lifecycle Packet (Priority: P1) MVP

**Goal**: Assemble one coherent packet tying the GitHub issue, root task, descendants, PR evidence, owner gate, Aegis decision, artifacts, governance evidence, latest error, and current stage to source-map pointers.

**Independent Test**: Build a packet from stored fixture rows and verify all lifecycle sections, source-map pointers, current stage, and zero fresh GitHub lookup dependency.

### Tests for User Story 1

- [ ] T008 [US1] Add failing candidate eligibility and packet identity test for stored `github_repo`, `github_issue_number`, `github_synced_at`, root task, lifecycle descendants, and PR evidence in src/lib/__tests__/pilot-review-packet.test.ts
- [ ] T009 [US1] Add failing source-map coverage test for tasks, activities, notifications, task_artifacts, quality_reviews, resource_policy_events, github_syncs, and smoke checklist evidence in src/lib/__tests__/pilot-review-packet.test.ts
- [ ] T010 [US1] Add failing lifecycle/gates test for current stage, latest terminal activity, latest error, owner gate, Aegis decision, governance evidence, duplicate-active-stage evidence, and cleaned replay evidence in src/lib/__tests__/pilot-review-packet.test.ts
- [ ] T011 [US1] Add failing missing, stale, malformed, and superseded evidence warning tests with explicit reasons and source pointers where possible in src/lib/__tests__/pilot-review-packet.test.ts

### Implementation for User Story 1

- [ ] T012 [US1] Implement stored pilot candidate proof selection, root task identity, lifecycle descendant aggregation, and PR evidence identity in src/lib/pilot-review-packet.ts
- [ ] T013 [US1] Implement deterministic source-map derivation for tasks, activities, notifications, task_artifacts, quality_reviews, resource_policy_events, github_syncs, and smoke checklist references in src/lib/pilot-review-packet.ts
- [ ] T014 [US1] Implement current stage, latest terminal activity, latest error, owner gate, Aegis decision, governance evidence, duplicate-active-stage evidence, and cleaned replay evidence derivation in src/lib/pilot-review-packet.ts
- [ ] T015 [US1] Implement structured missing, stale, malformed, and superseded evidence warnings without fresh GitHub API calls in src/lib/pilot-review-packet.ts
- [ ] T016 [US1] Run `pnpm test -- src/lib/__tests__/pilot-review-packet.test.ts` and record US1 verification status in specs/009d-pilot-review-lifecycle/checklists/implementation-scope.md

**Checkpoint**: User Story 1 is independently reviewable as a JSON packet object before artifact publication.

---

## Phase 4: User Story 2 - Review Markdown And JSON Evidence (Priority: P2)

**Goal**: Publish consistent JSON and Markdown artifacts from one snapshot while preserving SPEC-007 redaction, compact preview, hash, byte-count, and security-scan semantics.

**Independent Test**: Generate JSON and Markdown from the same packet and verify artifact metadata, consistency, source-map pointers, and safe evidence rendering.

### Tests for User Story 2

- [ ] T017 [US2] Add failing same-snapshot JSON and Markdown artifact publication test that verifies Markdown names the JSON artifact id or hash in src/lib/__tests__/pilot-review-packet-artifacts.test.ts
- [ ] T018 [US2] Add failing JSON/Markdown consistency test for lifecycle, gates, evidence, deferrals, warnings, and source-map pointer summaries in src/lib/__tests__/pilot-review-packet-artifacts.test.ts
- [ ] T019 [US2] Add failing SPEC-007 evidence metadata test for redacted, compact preview, sha256, byte_size, mime, security_scan_status, supersedes_artifact_id, quarantined, oversized, and binary unsafe-preview cases in src/lib/__tests__/pilot-review-packet-artifacts.test.ts
- [ ] T020 [US2] Add failing Markdown safety test that escapes stored evidence strings, emits no raw HTML, and creates active links only for generated source pointers, artifact ids/hashes, checklist anchors, and known GitHub issue/PR references in src/lib/__tests__/pilot-review-packet-artifacts.test.ts

### Implementation for User Story 2

- [ ] T021 [US2] Implement JSON packet serialization and artifact publication through existing `publishArtifact()` using `artifact_type="pilot_review_packet_json"` in src/lib/pilot-review-packet.ts
- [ ] T022 [US2] Implement deterministic Markdown summary generation from the same packet snapshot using `artifact_type="pilot_review_packet_markdown"` in src/lib/pilot-review-packet.ts
- [ ] T023 [US2] Implement packet-local evidence state normalization for available, redacted, quarantined, oversized, missing, malformed, superseded, and stale evidence without changing existing artifact enums in src/lib/pilot-review-packet.ts
- [ ] T024 [US2] Implement metadata-only quarantined evidence handling that omits raw content, preview text, storage URI, and actor identity in src/lib/pilot-review-packet.ts
- [ ] T025 [US2] Run `pnpm test -- src/lib/__tests__/pilot-review-packet-artifacts.test.ts` and record US2 verification status in specs/009d-pilot-review-lifecycle/checklists/artifact-surface.md

**Checkpoint**: JSON and Markdown artifacts agree on reviewer-visible lifecycle evidence and remain inspectable through existing task-artifact seams.

---

## Phase 5: User Story 3 - See Deferred Control-Plane Fields (Priority: P3)

**Goal**: Make future run, claim, retry, sync automation, sandbox, adapter, and harness fields explicitly deferred or not available with owning future specs.

**Independent Test**: Inspect the packet schema and artifacts for canonical deferrals naming SPEC-013A, SPEC-013A1, SPEC-013B, SPEC-013C, SPEC-014A, SPEC-014B, SPEC-014C, and SPEC-014D.

### Tests for User Story 3

- [ ] T026 [US3] Add failing deferral contract test for `run_state`, `github_sync_automation`, `claim_authority`, `retry_controls`, `sandbox_lifecycle`, `adapter_registry`, and `real_harness_execution` ownership in src/lib/__tests__/pilot-review-packet.test.ts
- [ ] T027 [US3] Add failing no-capability test proving SPEC-009D does not introduce durable run-state, claim authority, retry controls, sync automation, sandbox lifecycle, adapter registry, or real harness execution in src/lib/__tests__/pilot-review-packet.test.ts

### Implementation for User Story 3

- [ ] T028 [US3] Implement canonical deferral entries with `state`, `owner_specs`, `reason_code`, `reason`, and allowed empty source maps in src/lib/pilot-review-packet.ts
- [ ] T029 [US3] Implement packet output guards that keep future SPEC-013 and SPEC-014 fields descriptive only and prevent accidental active capability claims in src/lib/pilot-review-packet.ts
- [ ] T030 [US3] Run `pnpm test -- src/lib/__tests__/pilot-review-packet.test.ts` and record US3 verification status in specs/009d-pilot-review-lifecycle/checklists/implementation-scope.md

**Checkpoint**: Future control-plane absence is visible without expanding runtime scope.

---

## Phase 6: User Story 4 - Reject Local-Only Lookalike Evidence (Priority: P4)

**Goal**: Distinguish the real GitHub-linked pilot from local-only lookalikes or partial candidates with missing sync proof.

**Independent Test**: Attempt packet assembly against local-only and partial-proof candidates and verify they are ineligible or incomplete, not presented as the proven pilot.

### Tests for User Story 4

- [ ] T031 [US4] Add failing local-only lookalike exclusion test for candidates missing GitHub linkage or sync proof in src/lib/__tests__/pilot-review-packet.test.ts
- [ ] T032 [US4] Add failing partial-proof incomplete publication test for candidates missing linked PR evidence or checklist-backed issue/PR proof in src/lib/__tests__/pilot-review-packet-artifacts.test.ts

### Implementation for User Story 4

- [ ] T033 [US4] Implement `local_only_excluded` and `incomplete` candidate states with explicit missing-proof reasons and available source-map pointers in src/lib/pilot-review-packet.ts
- [ ] T034 [US4] Implement safe incomplete packet artifact generation that never claims pilot completion when required identity or sync proof is missing in src/lib/pilot-review-packet.ts
- [ ] T035 [US4] Run `pnpm test -- src/lib/__tests__/pilot-review-packet.test.ts src/lib/__tests__/pilot-review-packet-artifacts.test.ts` and record US4 verification status in specs/009d-pilot-review-lifecycle/checklists/artifact-surface.md

**Checkpoint**: Lookalike and partial candidates cannot be confused with the proven pilot packet.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Strict-scope integration, reviewer evidence, and full verification.

- [ ] T036 [P] Add `src/lib/pilot-review-packet.ts`, `src/lib/__tests__/pilot-review-packet.fixtures.ts`, `src/lib/__tests__/pilot-review-packet.test.ts`, and `src/lib/__tests__/pilot-review-packet-artifacts.test.ts` to strict TypeScript coverage in tsconfig.spec-strict.json using explicit file entries
- [ ] T037 [P] Add `src/lib/pilot-review-packet.ts`, `src/lib/__tests__/pilot-review-packet.fixtures.ts`, `src/lib/__tests__/pilot-review-packet.test.ts`, and `src/lib/__tests__/pilot-review-packet-artifacts.test.ts` to spec-owned ESLint coverage in eslint.config.mjs using explicit file entries
- [ ] T038 Run `pnpm test -- src/lib/__tests__/pilot-review-packet.test.ts src/lib/__tests__/pilot-review-packet-artifacts.test.ts` and record focused verification in specs/009d-pilot-review-lifecycle/checklists/implementation-scope.md
- [ ] T039 Run `pnpm typecheck` and `pnpm lint` and record verification in specs/009d-pilot-review-lifecycle/checklists/implementation-scope.md
- [ ] T040 Run `pnpm build`, `pnpm test`, and `pnpm test:e2e` as full verification and record any environment blockers in specs/009d-pilot-review-lifecycle/checklists/implementation-scope.md
- [ ] T041 Verify generated packet artifacts are discoverable through existing `GET /api/task-artifacts?artifact_type=pilot_review_packet_json`, `GET /api/task-artifacts?artifact_type=pilot_review_packet_markdown`, and `GET /api/task-artifacts/[id]` behavior without adding a packet-specific route in specs/009d-pilot-review-lifecycle/checklists/artifact-surface.md
- [ ] T042 Prepare PR review packet notes covering what changed, why, non-goals, review order, FR/SC traceability, verification evidence, rollback/flags, and explicit no migration/dependency/dashboard/polling/control-plane expansion confirmation in specs/009d-pilot-review-lifecycle/checklists/pr-evidence.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 fixture and evidence scaffolding.
- **Phase 3 US1**: Depends on Phase 2; delivers MVP packet derivation.
- **Phase 4 US2**: Depends on US1 packet object; adds artifact publication and Markdown.
- **Phase 5 US3**: Depends on Phase 2 and can proceed after US1 packet structure exists.
- **Phase 6 US4**: Depends on US1 candidate eligibility structure.
- **Phase 7 Polish**: Depends on selected user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2 and is the MVP.
- **US2 (P2)**: Depends on US1 because artifacts publish the assembled packet.
- **US3 (P3)**: Depends on the packet schema from Phase 2 and can run in parallel with later US1 implementation once the packet shape is stable.
- **US4 (P4)**: Depends on US1 candidate eligibility but remains independently testable through lookalike fixtures.

### TDD Order

- Write failing tests first: T005, T006, T008-T011, T017-T020, T026-T027, T031-T032.
- Implement only the smallest production changes needed to pass those tests.
- Run focused verification at each story checkpoint before moving to lower-priority work.

## Parallel Opportunities

- T002, T003, and T004 can run in parallel because they touch disjoint fixture/checklist files.
- T005 and T006 can run in parallel because they touch separate test files.
- T036 and T037 can run in parallel because they touch separate configuration files.
- After Phase 2, US3 test design can proceed while US1 implementation continues, but production edits to `src/lib/pilot-review-packet.ts` must be serialized.

## Parallel Example: Setup

```bash
Task: "Add SPEC-009D packet fixture builders in src/lib/__tests__/pilot-review-packet.fixtures.ts"
Task: "Record implementation scope checks in specs/009d-pilot-review-lifecycle/checklists/implementation-scope.md"
Task: "Record artifact seam verification in specs/009d-pilot-review-lifecycle/checklists/artifact-surface.md"
```

## Parallel Example: Foundational Tests

```bash
Task: "Add packet schema/source-map tests in src/lib/__tests__/pilot-review-packet.test.ts"
Task: "Add artifact metadata/same-snapshot tests in src/lib/__tests__/pilot-review-packet-artifacts.test.ts"
```

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1 evidence and fixture setup.
2. Complete Phase 2 failing contract tests and minimal type/constants layer.
3. Complete Phase 3 User Story 1.
4. Validate with `pnpm test -- src/lib/__tests__/pilot-review-packet.test.ts`.
5. Stop for review if the project wants MVP-only delivery before artifact publication.

### Incremental Delivery

1. US1: Assemble a packet object with source-map coverage.
2. US2: Persist JSON and Markdown artifacts from the same snapshot.
3. US3: Add explicit future-state deferrals.
4. US4: Harden candidate eligibility against local-only lookalikes.
5. Polish: strict-scope, full verification, and PR evidence.

### Format Validation

All task rows use the required checklist format: `- [ ] T### [P?] [US?] Description with file path`.
