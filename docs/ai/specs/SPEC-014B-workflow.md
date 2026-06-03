# SpecKit Workflow: SPEC-014B - Harness Adapter Manifest and Fake Registry

**Template Version**: 1.0.0
**Created**: 2026-06-03
**Purpose**: Execute the SpecKit workflow for SPEC-014B from a human-reviewed Design Concept.

---

## Design Concept

This workflow was enriched from a `$grill-me` interview run during `$speckit-scaffold-spec`.
The full Q&A log, Goals, Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-014B-design-concept.md
```

Re-read the Design Concept before each phase. It is the source of truth for scoping decisions captured during setup. If a generated artifact contradicts it, treat the generated artifact as wrong unless it records an explicit revision.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Archive Sweep | `$speckit-archive-run` | Complete | Dry-run completed in `014b-adapter-manifest-fakes`: five completed specs already archived, no new archive work, cleanup disabled |
| Specify | `$speckit-specify` | Complete | Generated and clarified `specs/014b-adapter-manifest-fakes/spec.md` with 56 FRs, 5 stories, 15 acceptance scenarios, and no clarification markers |
| Clarify | `$speckit-clarify` | In Progress | Resolving API path, reason-code enum, gate packet, and policy vocabulary details |
| Plan | `$speckit-plan` | Complete | Generated plan, research, data model, runtime inventory API contract, and quickstart with no migration or real harness execution |
| Checklist | `$speckit-checklist` | In Progress | Running domains: api-contracts, ux, security, data-integrity, error-handling, state-management |
| Tasks | `$speckit-tasks` | Pending | Generate dependency-ordered TDD tasks with reviewability budget |
| Analyze | `$speckit-analyze` | Pending | Cross-check spec, plan, tasks, and design concept for drift |
| Implement | `$speckit-implement` | Pending | Execute tasks only after gates pass; do not run real harnesses |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G1 | After Specify | Stories and requirements are clear; no unresolved `[NEEDS CLARIFICATION]` markers |
| G2 | After Clarify | Runtime inventory, policy, reason-code, and API decisions are recorded in `spec.md` |
| G3 | After Plan | Constitution gates pass; no migration is planned unless explicitly justified; API and read-model contracts are approved |
| G4 | After Checklist | All `[Gap]` markers are resolved or explicitly scoped out |
| G5 | After Tasks | Tasks are small, ordered, TDD-ready, and keep real execution plus mutation controls deferred |
| G6 | After Analyze | No CRITICAL findings; reviewability warning is accepted only for the harness-adapter contract slice |
| G7 | After Implement | Focused tests, static scope guards, local verification, and manual UI/API UAT are complete |

---

## Prerequisites

### Branch and Worktree

- Branch: `014b-adapter-manifest-fakes`
- Worktree: `.worktrees/014b-adapter-manifest-fakes`
- Remote branch: `origin/014b-adapter-manifest-fakes`
- Base evidence: SPEC-014A is complete and merged; SPEC-014B is unblocked for fake adapter registry and runtime inventory work.
- Plugin surface: use SpecKit Pro 2.6.1 from `racecraft-lab/racecraft-plugins-public`; do not use stale `speckit-pro` 2.5.0 cache paths.

### Constitution Validation

Before every phase, verify these Paddock constitution constraints:

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | Existing `/api/agents`, framework adapters, task dispatch, claim controls, and sandbox lifecycle behavior remain compatible | Focused route/component tests and static no-drift guards |
| V. Feature-Flag Resolution Discipline | Runtime eligibility uses `FEATURE_AGENT_RUNNER_SANDBOXES` through existing `resolveFlag` behavior | Focused tests and grep for direct runtime `process.env.FEATURE_` checks |
| VII. Additive Migration Policy | No manifest or inventory migration unless Plan proves persistence is unavoidable | Migration guard tests and `src/lib/migrations.ts` static check |
| X. Observability and Auditability | Unsupported capability and policy failures emit stable, sanitized evidence | Reason-code tests and review-packet assertions |
| XIII. Defensive Boundaries | No raw transcript, provider payload, host path, secret-like value, or unsafe event body is exposed | Sanitization tests and UI/API payload assertions |
| XVI. Reviewability | Keep one primary surface: harness-adapter contract plus narrow read-only Agents integration | Reviewability gate and scope guard tests |

### Reviewability Setup Gate

Setup gate result against `docs/ai/rc-factory-technical-roadmap.md` using SpecKit Pro 2.6.1:

- `status: exception`
- `pass: true`
- `transition_exception: true`
- warnings: production-file and primary-surface thresholds exceeded by roadmap-level projection
- blockers listed by heuristic: production files at block threshold and more than one primary surface
- accepted split decision: SPEC-014B may proceed only for one contract slice: typed manifest, fake registry, capability-resolution packet, derived runtime-inventory model, read-only Agents integration, and tests. Real adapters, scheduler dispatch, lifecycle controls, and mutation UI stay deferred.

### External Current-Source Requirement

Before Specify and again before Plan, fetch current external context and cite it in generated artifacts:

- OpenAI Harness Engineering article: `https://openai.com/index/harness-engineering/`
- OpenAI Symphony announcement: `https://openai.com/index/open-source-codex-orchestration-symphony/`
- OpenAI Symphony SPEC: `https://github.com/openai/symphony/blob/main/SPEC.md`

Use these sources only for repo knowledge, validation, workspace-safety, orchestration-state, and status-legibility lessons. Do not import Symphony runner/client algorithms into SPEC-014B.

---

## Specification Context

| Field | Value |
|-------|-------|
| Spec ID | SPEC-014B |
| Name | Harness Adapter Manifest and Fake Registry |
| Branch | `014b-adapter-manifest-fakes` |
| Dependencies | SPEC-014A |
| Enables | SPEC-014C, SPEC-014D |
| Priority | P1 |
| Tool count | N/A |
| Tool names | `[]` |
| Primary review surface | harness/adapter contract plus narrow read-only API/UI integration |

### Roadmap Scope

Define the typed harness adapter manifest and registry for launch/resume/stop capability declaration, transcript/event read capability declaration, token/runtime accounting declaration, artifact publication declaration, sandbox posture, MCP/skills/plugins/memory exposure, provider/account constraints, approval policy, timeout policy, user-input policy, and runtime-inventory state. Prove the contract with at least two fake adapters.

### Human Decisions From Design Concept

- Existing Agents surface owns runtime inventory visibility.
- Fake manifests are checked-in typed fixtures with validation.
- Fake adapter postures are `paddock` and `external_harness`.
- Eligibility requires all gates: feature flag, project-role assignment, adapter capability support, governance allow, tracker-linked task eligibility, and SPEC-014A sandbox lifecycle evidence.
- Runtime inventory is derived, not persisted.
- Unsupported capabilities fail closed with stable evidence; no stall, fallback, or silent adapter switch.
- Evidence uses sanitized metadata only.
- API is a dedicated read-only runtime-inventory route; existing `/api/agents` remains compatible.
- UI is read-only: badges, selected manifest, eligibility reasons, lifecycle references, and sanitized fake evidence.
- Approval, timeout, and user-input policies are declared in manifests and fail closed when unsupported or expired.

### Existing Harness Baseline

SPEC-014B is not a greenfield harness-support spec. Reuse these current Paddock surfaces as baseline context during Specify, Clarify, and Plan:

- `src/lib/adapters/adapter.ts`, `src/lib/adapters/index.ts`, and `src/app/api/adapters/route.ts` for the existing narrow framework-adapter contract.
- `src/lib/task-dispatch.ts`, `src/lib/openclaw-gateway.ts`, and `src/lib/command.ts` for current OpenClaw gateway dispatch, targeted session dispatch, and direct Claude fallback boundaries.
- `src/app/api/sessions/route.ts`, `src/lib/sessions.ts`, `src/lib/claude-sessions.ts`, `src/lib/codex-sessions.ts`, `src/lib/hermes-sessions.ts`, and `src/lib/opencode-sessions.ts` for current runtime/session observation.
- `src/lib/agent-runtimes.ts`, `src/lib/agent-sync.ts`, `src/lib/local-agent-sync.ts`, and `src/lib/runs.ts` for runtime detection, OpenClaw/local agent inventory, and run/evidence storage.

The implementation should formalize these scattered assumptions into a manifest-driven capability, eligibility, and read-only inventory contract. It should not duplicate these integrations or imply OpenClaw/framework/session support is absent.

### Success Criteria Summary

- Two fake adapters exercise the same typed manifest contract.
- Runtime inventory can show `visible` and `unassigned` adapters without making them dispatchable.
- `assigned`, `eligible`, and `blocked` are derived from explicit gates, not inferred from visibility alone.
- Unsupported capabilities and policy mismatches fail closed with stable reason-code evidence.
- Review packets can cite selected adapter manifest and eligibility evidence.
- Existing framework adapters, task dispatch, claim/retry controls, and sandbox lifecycle semantics are not widened.

---

## Phase 1: Specify

**When to run:** Start the feature specification. Focus on what and why, not implementation.

### Specify Prompt

```text
$speckit-specify

Feature: SPEC-014B - Harness Adapter Manifest and Fake Registry
GIT_BRANCH_NAME=014b-adapter-manifest-fakes
SPECIFY_FEATURE_DIRECTORY=specs/014b-adapter-manifest-fakes

Source artifacts:
- docs/ai/rc-factory-technical-roadmap.md, SPEC-014B section
- docs/ai/specs/SPEC-014B-design-concept.md
- .specify/memory/constitution.md
- specs/014a-sandbox-lifecycle-contract/spec.md
- docs/ai/specs/SPEC-014A-design-concept.md
- specs/013d-claim-control-operator-ux/spec.md
- src/lib/adapters/adapter.ts
- src/app/api/adapters/route.ts
- src/lib/task-dispatch.ts
- src/lib/openclaw-gateway.ts
- src/app/api/sessions/route.ts
- src/lib/agent-runtimes.ts
- src/lib/agent-sync.ts
- src/lib/local-agent-sync.ts
- src/lib/runs.ts
- current OpenAI Harness Engineering article
- current OpenAI Symphony announcement and SPEC.md

Problem statement:
Paddock already has harness-adjacent support through framework adapters, OpenClaw gateway dispatch, session scanners for OpenClaw/Claude/Codex/Hermes/OpenCode, runtime detection, OpenClaw/local agent sync, and an AgentRun spine. It also has sandbox lifecycle read evidence from SPEC-014A, claim/reconciliation authority from SPEC-013B, retry/debug authority from SPEC-013C, and task-detail operator controls from SPEC-013D. The remaining gap is a typed harness adapter manifest and fake registry that make launch, resume, stop, transcript, artifact, sandbox, tool/MCP, approval, timeout, user-input, token/runtime, and eligibility assumptions explicit before any new real harness adapter can launch or continue work. The fake registry must prove that runtime inventory is not Codex-specific, that visibility is not eligibility, and that unsupported capabilities fail closed instead of stalling or switching harnesses.

Specify requirements for:
- A new stricter harness adapter contract layer separate from the existing `src/lib/adapters` framework-adapter contract.
- Reuse of existing framework-adapter, OpenClaw gateway, runtime/session observation, agent sync, and AgentRun surfaces as inputs or compatibility boundaries; do not duplicate them.
- Checked-in typed fake manifest fixtures plus validation; do not require SQLite persistence for manifests or runtime inventory.
- Two fake adapter postures: Paddock-owned sandbox and external-harness fake.
- Manifest-declared capabilities for launch, resume, stop, transcript/event read, token/runtime accounting, artifact publication, sandbox posture, MCP exposure, skills, plugins, memory, provider/account constraints, approval policy, timeout policy, and user-input policy.
- Runtime inventory state model: `visible`, `unassigned`, `assigned`, `eligible`, and `blocked`.
- Dedicated read-only runtime inventory API, recommended default `GET /api/agents/runtime-inventory`, returning `runtime_inventory.v1`.
- Existing Agents surface read-only integration: state badges, selected manifest, eligibility reasons, lifecycle references, and sanitized fake evidence.
- Eligibility requiring all gates: `FEATURE_AGENT_RUNNER_SANDBOXES`, explicit project-role assignment, adapter capability support, governance allow, tracker-linked task eligibility, and SPEC-014A sandbox lifecycle evidence.
- Unsupported capability and unsupported/expired policy behavior: fail closed with stable reason-code evidence; no stall, fallback adapter, GitHub mutation, tracker truth mutation, or silent switching.
- Sanitized fake evidence only: bounded synthetic summaries, counters, event refs, lifecycle refs, and artifact descriptors; no raw transcript, provider payload, host path, prompt body, token payload, or secret-like data.
- Tests and static scope guards proving no real Codex, Claude, OpenClaw, Hermes, OpenCode, gateway, external process, scheduler dispatch, migration, claim-control mutation, retry semantic, lifecycle control, successor selection, governance mutation, or auto-merge behavior is added.

Out of scope:
- Real harness execution, launch/resume/stop side effects, provider API calls, real token accounting, real transcript fetch, assignment controls, lifecycle controls, retry/release/cancel/debug controls, scheduler launch, task successor behavior, GitHub mutation, governance policy mutation, auto-merge, and new dashboard navigation.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 56 |
| User Stories | 5 |
| Acceptance Criteria | 15 acceptance scenarios |

### Files Generated

- `specs/014b-adapter-manifest-fakes/spec.md`
- `specs/014b-adapter-manifest-fakes/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify if any requirement can be interpreted multiple ways. Maximum 5 targeted questions per session.

### Clarify Prompts

#### Session 1: API and Runtime Inventory Contract

```text
$speckit-clarify

Focus on SPEC-014B API and runtime inventory contract:
- Confirm the runtime inventory route path and `runtime_inventory.v1` envelope.
- Confirm whether the route is task-scoped, project-scoped, workspace-scoped, or supports query filters.
- Confirm the exact fields for state, selected manifest, capability evidence, gate evidence, SPEC-014A lifecycle references, and sanitized fake evidence.
- Preserve `/api/agents` response compatibility.
```

#### Session 2: Reason Codes and Fail-Closed Semantics

```text
$speckit-clarify

Focus on SPEC-014B fail-closed behavior:
- Finalize stable reason codes for capability unsupported, feature disabled, unassigned, governance denied, task ineligible, lifecycle missing, approval unsupported, user-input unsupported, timeout expired, and unsafe evidence rejected.
- Confirm which failures appear as `blocked` inventory versus failed attempt/review-packet evidence.
- Ensure no automatic adapter fallback or silent harness switch is allowed.
```

#### Session 3: Manifest and Policy Vocabulary

```text
$speckit-clarify

Focus on SPEC-014B manifest vocabulary:
- Finalize typed manifest fields for launch/resume/stop declarations, transcript/event read, token/runtime accounting, artifact publication, sandbox posture, MCP/skills/plugins/memory exposure, provider/account constraints, approval policy, timeout policy, and user-input policy.
- Confirm typed fixture names for the Paddock-owned and external-harness fake adapters.
- Confirm validation failure payloads and safe metadata boundaries.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | API and runtime inventory contract | 5 | Dedicated `GET /api/agents/runtime-inventory` route, allowlisted filters, task-scoped eligibility, `runtime_inventory.v1` envelope fields, `/api/agents` compatibility, and closed sanitized evidence allowlist recorded in `spec.md` |
| 2 | Reason codes and fail-closed semantics | 5 | Closed twelve-code enum, boundary mapping from internal terms, blocked-inventory-only fake failures, deterministic reason ordering, no fallback/silent switch, and `sanitized_evidence_rejected` surfacing recorded in `spec.md` |
| 3 | Manifest and policy vocabulary | 5 | Closed `harness_adapter_manifest.v1` shape, uniform capability support objects, synthetic-only provider/account policy fields, fake fixture ids, and bounded `harness_manifest_validation.v1` payload recorded in `spec.md` |

### Consensus Resolution Log

| Phase | Item | Round | Routed Categories | Outcome | Analysts Used |
|-------|------|-------|-------------------|---------|---------------|
| Clarify Session 1 | Q1 runtime inventory route, scope, filters, and task-scoped eligibility | 1 | `[codebase, spec, security]` | Accepted dedicated read-only `GET /api/agents/runtime-inventory`; allowlisted filters; full `eligible` requires caller-visible `task_id`; `/api/agents` remains compatible | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 1 | Q5 sanitized fake evidence allowlist and rejection behavior | 1 | `[security]` | Accepted closed `sanitized_fake_evidence.v1` allowlist and fail-closed `sanitized_evidence_rejected` behavior with bounded reason metadata only | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 2 | Q1 closed reason-code enum | 1 | `[codebase, spec]` | Accepted the twelve-code SPEC-014B enum and boundary normalization of internal source terms into public adapter reason codes | codebase-analyst, spec-context-analyst |
| Clarify Session 2 | Q5 `sanitized_evidence_rejected` surfacing | 1 | `[security]` | Accepted entry-level `state=blocked` plus bounded rejection metadata for authorized evaluations; request scope/filter errors remain top-level `400`/`403`/`422` before entries | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 3 | Q1 top-level manifest shape | 1 | `[security, codebase, spec]` | Accepted closed `harness_adapter_manifest.v1` grouped TypeScript fixture contract in the new harness-adapter layer, separate from `src/lib/adapters` | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 3 | Q2 capability support declarations | 1 | `[security, spec]` | Accepted required closed support objects for every capability/declaration; missing fields are `manifest_invalid`, unsupported support is explicit | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 3 | Q3 policy and provider/account constraints | 1 | `[security, spec]` | Accepted synthetic-only provider/account constraints plus explicit approval, timeout, and user-input policy declarations | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 3 | Q5 manifest validation payload | 1 | `[security, codebase, domain]` | Accepted bounded `harness_manifest_validation.v1` issue-list payload with capped diagnostics and no raw values, schema excerpts, prompts, tokens, credentials, host paths, or provider/tool payloads | codebase-analyst, spec-context-analyst, domain-researcher |
| Checklist api-contracts | Gap 2 unauthenticated and read-only viewer route access | 1 | `[security]` | Accepted viewer-or-higher read baseline, `401` before inventory derivation, bounded `403` for unauthorized resource filters without existence leakage, and no partial entries on request failures | codebase-analyst, spec-context-analyst, domain-researcher |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Generates technical implementation blueprint.

### Plan Prompt

```text
$speckit-plan

Use SpecKit Pro 2.6.1 and the `speckit-pro-reviewability` preset.

Tech stack:
- TypeScript 5.7 strict on Node >=22
- Next.js 16 App Router, React 19, Tailwind CSS 3, Zustand where existing Agents panel patterns require it
- SQLite through existing `better-sqlite3` helpers only if reading existing state; no new migration planned
- Vitest and focused UI tests; Playwright only if final UAT needs browser proof
- No new runtime dependency unless Plan proves an unavoidable need

Architecture constraints:
- Create a new stricter harness adapter layer, recommended default `src/lib/harness-adapters/`, separate from `src/lib/adapters`.
- Keep manifests as checked-in typed fixtures and validators.
- Build a derived runtime-inventory read model from manifests, registry visibility, project-agent assignments, feature flag state, governance/capability checks, tracker-linked task eligibility, and SPEC-014A sandbox lifecycle read evidence.
- Add a dedicated read-only API, recommended default `GET /api/agents/runtime-inventory`, returning `runtime_inventory.v1`.
- Extend the existing Agents surface only with read-only evidence. Do not add launch, assignment, retry, release, cancel, lifecycle, or scheduler controls.
- Preserve existing `/api/agents`, `/api/adapters`, task dispatch, claim reconciliation, claim control, sandbox lifecycle, GitHub sync, governance policy, and project assignment mutation behavior.
- Do not add a migration for manifests or inventory unless Plan records why derived state is impossible and proposes a split.

Evidence and safety:
- Sanitized fake evidence only: bounded summaries, counters, event refs, lifecycle refs, and artifact descriptors.
- No raw transcripts, prompt bodies, provider payloads, host paths, token payloads, secret-like strings, or unsafe external event bodies.
- Unsupported capability and unsupported/expired policy requirements fail closed with stable reason-code evidence.
- Static guards must prove no real Codex, Claude, OpenClaw, Hermes, OpenCode, gateway, external process, scheduler launch, successor selection, GitHub mutation, governance mutation, or auto-merge path is introduced.

Plan outputs must include:
- `research.md` for decisions and alternatives.
- `data-model.md` for typed manifest, fake registry, runtime inventory entry, eligibility packet, policy declaration, reason codes, and sanitized evidence shapes.
- `contracts/runtime-inventory-api.md` for the read-only route and error envelope.
- `quickstart.md` with flag-off, fake registry, runtime inventory, unsupported capability, sanitized evidence, and Agents UI UAT.
- Reviewability budget and explicit split boundary.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Technical context, constitution gates, scope, and reviewability WARN |
| `research.md` | Complete | 9 decision rationales |
| `data-model.md` | Complete | Manifest, registry, inventory, evidence, validation, and reason-code types |
| `contracts/` | Complete | `runtime-inventory-api.md` |
| `quickstart.md` | Complete | Local and manual UAT flow |

---

## Phase 4: Domain Checklists

**When to run:** After `$speckit-plan`.

### Recommended Checklist Domains

Run these domains unless Plan records why one is inapplicable:

```text
$speckit-checklist api-contracts
$speckit-checklist ux
$speckit-checklist security
$speckit-checklist data-integrity
$speckit-checklist error-handling
$speckit-checklist state-management
```

Checklist focus:
- API contracts: dedicated route, `runtime_inventory.v1`, auth/scope behavior, compatibility with `/api/agents`.
- UX: existing Agents surface, read-only evidence, responsive state badges/details, no mutation controls.
- Security: sanitized payloads, no host paths/secrets/raw transcripts/provider payloads, fail-closed validation.
- Data integrity: derived-state consistency, no migration, stable reason-code enum, fixture validation.
- Error handling: unsupported capability/policy behavior, disabled flag, blocked gates, deterministic failures.
- State management: visibility versus assignment versus eligibility, lifecycle reference freshness, no dispatchability from visibility alone.

### Checklist Results

| Domain | Status | Gaps | Notes |
|--------|--------|------|-------|
| api-contracts | Complete | 4 found, 4 remediated | Added explicit `/api/agents` compatibility, auth/scope behavior, assignment-role filter source, and closed requested-capability vocabulary; consensus accepted security-sensitive auth handling |
| ux | Complete | 4 found, 4 remediated | Added existing-surface placement, visible text labels, loading/error/empty/flag-off state requirements, responsive layout, keyboard/screen-reader constraints, and bounded UI UAT proof |
| security | Complete | 1 found, 1 remediated | Added plain-text-only evidence/diagnostic handling, secret-shaped value rejection before exposure, and no raw HTML/Markdown rendering requirement |
| data-integrity | Complete | 4 found, 4 remediated | Added fake-registry identity invariants, deterministic ordering, unique entry ids, summary-count consistency, request-local derivation, and stale/cross-scope evidence restrictions |
| error-handling | Complete | 3 found, 3 remediated | Added request-level error precedence, distinction between entry-level blocked outcomes and request errors, and bounded `500 runtime_inventory_unavailable` behavior |
| state-management | Complete | 3 found, 3 remediated | Added SPEC-014A lifecycle status eligibility mapping, client-side eligibility inference prohibition, and stale eligible refresh behavior |

### Checklist Gate Results

| Gate | Status | Evidence |
|------|--------|----------|
| G4 | Passed | 2.6.1 `validate-gate.sh G4 specs/014b-adapter-manifest-fakes` returned `pass=true`, `reason=0 [Gap] markers` |

---

## Phase 5: Tasks

**When to run:** After Plan and checklists pass.

### Tasks Prompt

```text
$speckit-tasks

Generate dependency-ordered, TDD-first tasks for SPEC-014B using:
- specs/014b-adapter-manifest-fakes/spec.md
- specs/014b-adapter-manifest-fakes/plan.md
- specs/014b-adapter-manifest-fakes/research.md
- specs/014b-adapter-manifest-fakes/data-model.md
- specs/014b-adapter-manifest-fakes/contracts/runtime-inventory-api.md
- docs/ai/specs/SPEC-014B-design-concept.md

Task requirements:
- Start every behavioral slice with failing Vitest/component/route tests.
- Keep task groups reviewable and file-disjoint where possible.
- Add static scope guard tasks proving no migration, no real harness execution, no scheduler dispatch, no claim-control/retry semantic change, no lifecycle-control mutation, no GitHub mutation, no governance mutation, no successor selection, and no auto-merge path.
- Include focused UI tests for the Agents read-only runtime inventory evidence.
- Include API tests for auth/scope, `runtime_inventory.v1`, compatibility, disabled flag, blocked states, unsupported capabilities, and sanitized payloads.
- Include manifest validator and fake registry tests for both fake postures.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | Pending |
| Parallel Tasks | Pending |
| Test Tasks | Pending |
| Implementation Tasks | Pending |

---

## Phase 6: Analyze

**When to run:** After Tasks, before Implement.

### Analyze Prompt

```text
$speckit-analyze

Analyze SPEC-014B artifacts for cross-artifact consistency and scope drift:
- docs/ai/specs/SPEC-014B-design-concept.md
- docs/ai/specs/SPEC-014B-workflow.md
- specs/014b-adapter-manifest-fakes/spec.md
- specs/014b-adapter-manifest-fakes/plan.md
- specs/014b-adapter-manifest-fakes/tasks.md
- all generated contracts, checklists, and quickstart files

Flag any drift where generated artifacts:
- Persist manifests/inventory without a recorded migration exception.
- Widen `src/lib/adapters` instead of adding a stricter harness adapter layer.
- Make visible inventory dispatchable without all eligibility gates.
- Add launch/resume/stop side effects or real Codex/Claude/OpenClaw/Hermes/OpenCode behavior.
- Add assignment, retry, release, cancel, lifecycle, scheduler, GitHub, governance, successor, or auto-merge mutations.
- Expose raw transcripts, host paths, provider payloads, prompts, token payloads, or secret-like data.
- Omit unsupported capability or policy fail-closed behavior.
```

### Analyze Results

| Finding Level | Count | Notes |
|---------------|-------|-------|
| CRITICAL | Pending | |
| WARNING | Pending | |
| INFO | Pending | |

---

## Phase 7: Implement

**When to run:** After Analyze has no CRITICAL findings and warnings are accepted or fixed.

### Implement Prompt

```text
$speckit-implement

Execute SPEC-014B tasks from `specs/014b-adapter-manifest-fakes/tasks.md`.

Implementation rules:
- Follow TDD: red, green, refactor for each task.
- Keep changes inside the planned harness-adapter, read-only API, and existing Agents UI evidence surfaces.
- Do not add migrations, dependencies, real harness calls, process execution, scheduler dispatch, assignment controls, lifecycle controls, retry controls, GitHub mutations, governance mutations, successor selection, or auto-merge.
- Preserve existing `/api/agents`, `/api/adapters`, task dispatch, claim reconciliation/control, and sandbox lifecycle behavior.
- Run focused tests continuously and full verification before closeout.
```

### Required Verification

At minimum before reporting completion:

```text
pnpm typecheck
pnpm lint
pnpm test -- src/lib/__tests__/harness-adapter-manifest.test.ts
pnpm test -- src/lib/__tests__/harness-runtime-inventory.test.ts
pnpm test -- src/app/api/agents/runtime-inventory/__tests__/route.test.ts
pnpm test -- src/components/panels/__tests__/agent-runtime-inventory.test.tsx
pnpm test
```

If UI changed materially, run a browser/manual UAT path that proves:

- flag OFF shows disabled/blocked evidence without enabling dispatchability
- two fake adapters appear with correct states
- an unassigned visible fake is not eligible
- assignment plus all gates can produce eligible state in controlled fixture
- unsupported capability produces stable fail-closed evidence
- no launch/mutation controls are visible
- payloads are sanitized

---

## Closeout

Setup is complete when:

- `docs/ai/specs/SPEC-014B-design-concept.md` exists.
- `docs/ai/specs/SPEC-014B-workflow.md` exists.
- Roadmap status for SPEC-014B is `In Progress`.
- The workflow contains no placeholder tokens.
- The branch is committed and pushed to `origin/014b-adapter-manifest-fakes`.
- The active SpecKit Pro cache is 2.6.1 and no `speckit-pro` 2.5.0 cache remnants remain.

Next operator step:

```text
$speckit-autopilot docs/ai/specs/SPEC-014B-workflow.md
```
