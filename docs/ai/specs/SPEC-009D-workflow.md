# SpecKit Workflow: SPEC-009D - Pilot Review Packet and Lifecycle Snapshot

**Template Version**: 1.0.0
**Created**: 2026-05-20
**Purpose**: Prepare and execute RC Factory Phase 8D by materializing a compact pilot review packet and lifecycle snapshot from existing Mission Control evidence.

---

## How To Use This Workflow

Run this workflow from the dedicated worktree on branch
`009d-pilot-review-lifecycle`:

```bash
$speckit-autopilot docs/ai/specs/SPEC-009D-workflow.md
```

This workflow was generated from the SpecKit Pro workflow template and enriched
by an interactive `$grill-me` setup session. The full Q&A log, Goals,
Non-goals, Open Questions, and design recommendations live at:

```text
docs/ai/specs/SPEC-009D-design-concept.md
```

SPEC-009D starts only after SPEC-009C4 is complete on `main` and after the HAL
target deployment/UAT closeout is recorded. D owns packet assembly and current
lifecycle derivation. It must not introduce a formal run-state model, automatic
GitHub polling, claim authority, retry controls, sandbox lifecycle, real runner
adapter, or a new evidence dashboard.

---

## Design Concept

Source-of-truth scoping decisions:

- Persist the pilot review packet through SPEC-007 task artifacts with source
  pointers, not through a new table.
- Assemble from stored Mission Control evidence first; do not require fresh
  GitHub API calls.
- Include explicit `deferred` or `not_available` fields for SPEC-013A/A1/B/C
  and SPEC-014A-D future state.
- Produce both JSON and Markdown packet artifacts.
- Anchor identity on the GitHub issue plus root task, including descendants and
  linked PR evidence.
- Reuse SPEC-007 redaction, previews, hashes, byte counts, source pointers, and
  security-scan state for oversized or sensitive evidence.
- Add an API only when an existing seam fits; do not build the SPEC-009E
  evidence dashboard early.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Complete | Generated `specs/009d-pilot-review-lifecycle/spec.md` with 14 FRs, 4 user stories, 10 acceptance scenarios, and no unresolved markers |
| Clarify | `$speckit-clarify` | Complete | Resolved artifact-only inspection seam, JSON/Markdown packet terms, source-map pointer shape, future-spec owner map, local-only exclusion, redaction, staleness, and cleaned C4 replay source rules |
| Plan | `$speckit-plan` | Complete | Produced architecture, data model, packet contract, and quickstart bounded to pure `src/lib` derivation plus existing task artifact seams |
| Checklist | `$speckit-checklist` | Complete | Ran targeted domains for API, data integrity, security/redaction, state management, and error handling; 2 gaps found and resolved |
| Tasks | `$speckit-tasks` | Complete | Generated 42 TDD-first tasks across setup, foundational tests, four user stories, and polish/verification |
| Analyze | `$speckit-analyze` | Complete | Resolved strict-scope drift so all SPEC-009D-owned TypeScript modules require explicit TypeScript and ESLint coverage |
| Implement | `$speckit-implement` | Complete | Implemented packet derivation, artifact publication, deferrals, local-only exclusion, strict-scope coverage, and verification evidence |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Prerequisites | Branch is `009d-pilot-review-lifecycle`; reviewability preset resolves; SPEC-009C4 closeout evidence exists; package manager is `pnpm`; no main checkout edits are made |
| G1 | After Specify | Requirements cover packet identity, source records, JSON and Markdown artifacts, redaction, source maps, deferred future fields, local-only exclusion, and current lifecycle derivation; no unresolved markers remain |
| G2 | After Clarify | API seam decision, packet field names, freshness policy, future-spec ownership, local-only exclusion, and artifact retention/redaction details are resolved |
| G3 | After Plan | Architecture reuses existing task, activity, notification, task artifact, quality review, governance, and GitHub sync records; no new table, poller, claim/run schema, sandbox, adapter, or evidence dashboard is introduced |
| G4 | After Checklist | All gaps in API contracts, data integrity, security/redaction, state management, and error handling are addressed or explicitly scoped out |
| G5 | After Tasks | Tasks are ordered TDD-first, independently reviewable, and include source-map, redaction, stale/missing evidence, and local-only negative cases |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; downstream artifacts match the Grill Me decisions and roadmap non-goals |
| G7 | After Implement | Focused tests, typecheck/lint/build as scope requires, packet evidence, smoke checklist update, roadmap/workflow updates, branch commit, and push are complete |

### Reviewability Gate

Setup reviewability gate result:

```json
{
  "mode": "setup",
  "status": "exception",
  "pass": true,
  "reviewable_loc": 8,
  "production_files": 25,
  "total_files": 0,
  "primary_surface_count": 7,
  "primary_surfaces": [
    "API",
    "UI",
    "harness/adapter",
    "or docs/process",
    "scheduler/runtime",
    "schema/migration",
    "seed/config"
  ],
  "transition_exception": true,
  "warnings": [
    "production files 25 exceeds warn threshold 6",
    "primary surfaces 7 exceeds warn threshold 1"
  ],
  "blockers": [
    "production files 25 exceeds block threshold 8",
    "more than one primary surface requires split or exception"
  ]
}
```

Decision: proceed under the roadmap transition exception, but keep the
implementation to one primary surface: pilot review packet assembly and current
lifecycle derivation from existing records. If tasks expand into new dashboard,
poller, claim/run, sandbox, adapter, or schema ownership, stop and split.

---

## Prerequisites

### Branch Guard

Before any phase, verify:

```bash
git rev-parse --abbrev-ref HEAD
```

Expected branch:

```text
009d-pilot-review-lifecycle
```

For prerequisite-backed SpecKit scripts on this non-standard branch, keep the
actual git branch unchanged and set a validator-compatible SpecKit alias plus
the explicit feature directory:

```bash
SPECIFY_FEATURE=009-pilot-review-lifecycle
SPECIFY_FEATURE_DIRECTORY=specs/009d-pilot-review-lifecycle
```

`SPECIFY_FEATURE` is only a script-validation alias. The actual branch guard
remains `git rev-parse --abbrev-ref HEAD` returning
`009d-pilot-review-lifecycle`.

### Dependency Evidence

- SPEC-007 is complete and owns task artifact storage, provenance, redaction,
  previews, hashes, and artifact APIs.
- SPEC-008 is complete and owns resource-governance evidence and policy events.
- SPEC-009C4 is complete after PR #52 merged to `main` as
  `ddc709f2f200a4ee4df51398d39ef42d85bd6e54`.
- HAL target deployment/UAT closeout is recorded in
  `docs/qa/pilot-smoke-checklist.md`, including target replay task `41`,
  issue #50, PR #51, duplicate sync, no successor child, cleanup, and retained
  sync rows `160`/`161`.

### Constitution Validation

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | New behavior is additive and must not change existing single-workspace behavior unless explicitly opted in by existing pilot data | Focused tests plus `pnpm test:all` when implementation touches runtime or UI |
| IV. Test-First Development | Production changes follow RED, GREEN, REFACTOR | Tasks must require failing tests before packet implementation |
| X. Observability and Auditability | Packet source records must remain traceable to tasks, activities, artifacts, governance, quality review, and GitHub sync evidence | JSON packet includes source-map pointers and Markdown summary names evidence sources |
| XIII. Defensive Boundaries | Missing, stale, redacted, oversized, or malformed evidence is structured and does not leak secrets | Error-handling tests cover missing rows, local-only lookalikes, and redacted artifacts |
| XVI. Reviewability | Scope remains a reviewable packet derivation slice under the transition exception | Re-run reviewability gate after tasks and before implementation |

**Constitution Check:** Pending until Specify and Plan confirm the final artifact shape.

### Project Structure Reference

```text
src/app/          Next.js App Router pages and API routes
src/components/   Shared UI panels and components
src/lib/          Core database, GitHub sync, task artifact, governance, and task lifecycle logic
docs/ai/specs/    Workflow and design concept artifacts
docs/qa/          Pilot smoke checklist and manual evidence
specs/            Active SpecKit-generated feature artifacts
```

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec ID | SPEC-009D |
| Name | Pilot Review Packet and Lifecycle Snapshot |
| Branch | `009d-pilot-review-lifecycle` |
| Dependencies | SPEC-007, SPEC-008, SPEC-009C4 |
| Enables | SPEC-009E, SPEC-013A |
| Priority | P1 |
| Tool surface | Not a tool-surface spec |

### Roadmap Scope

Materialize a compact pilot review packet and lifecycle snapshot from existing
task, activity, artifact, governance, scheduler, and `AgentRun` surfaces.
Unsupported fields are explicitly labeled as SPEC-013A-C/SPEC-014A-D follow-up
gaps, not silently inferred.

### Success Criteria Summary

- Operators can inspect one packet that names current stage, latest artifact or
  error, governance decision, Aegis/owner gate state, linked issue/PR, known
  duplicate-active-stage check, and unsupported run/sandbox fields deferred to
  later specs.
- Packet assembly uses existing source records only: task fields, activities,
  notifications, task artifacts, quality reviews, governance rows, GitHub sync
  state, and smoke checklist evidence.
- Packet output includes JSON plus Markdown and carries source-map pointers,
  redaction status, hashes, and compact previews rather than raw oversized or
  sensitive evidence.
- Local-only lookalike tasks without GitHub linkage do not count as pilot
  evidence.
- No new table, automatic GitHub polling, claim/run schema, sandbox lifecycle,
  adapter registry, or evidence dashboard ships in this spec.

---

## Phase 1: Specify

**When to run:** At the start of the feature specification. Focus on what and
why, not implementation details. Output: `specs/009d-pilot-review-lifecycle/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: Pilot Review Packet and Lifecycle Snapshot

### Problem Statement
Mission Control has now proven the self-hosting pilot through issue ingest,
triage handoff, remediation-to-owner, owner merge, and done reconciliation.
Operators still need one reviewable packet that summarizes the current pilot
lifecycle without terminal archaeology and without inventing future run-state,
claim-state, sandbox, adapter, or poller data.

### Users
- Mission Control operators reviewing the self-hosting pilot.
- PR reviewers who need a compact evidence packet.
- Future SPEC-009E and SPEC-013A implementers who need a baseline for evidence
  surfaces and durable run-state.

### User Stories
- As an operator, I can inspect one pilot packet that ties the GitHub issue,
  root task, lifecycle descendants, PR evidence, owner gate, Aegis decision,
  artifacts, governance evidence, latest error, and current stage together.
- As a reviewer, I can read a Markdown summary and inspect the underlying JSON
  packet without following terminal logs.
- As a future control-plane implementer, I can see which run, claim, retry,
  sync automation, sandbox, and adapter fields are intentionally deferred and
  which future spec owns each one.
- As an operator, I can distinguish the real pilot evidence from a local-only
  lookalike task with no GitHub linkage or sync proof.

### Constraints
- Use SPEC-007 task artifacts for persistence; do not add a review-packet table
  or schema migration.
- Use stored Mission Control evidence first; do not require fresh GitHub API
  calls for packet assembly.
- Publish JSON and Markdown packet artifacts with source-map pointers.
- Reuse SPEC-007 redaction and compact evidence behavior for secrets,
  oversized content, hashes, byte counts, previews, and security-scan state.
- Include explicit deferred or not-available fields naming SPEC-013A,
  SPEC-013A1, SPEC-013B, SPEC-013C, SPEC-014A, SPEC-014B, SPEC-014C, and
  SPEC-014D where applicable.
- Add an API only if an existing route or task-artifact seam fits cleanly; do
  not build the SPEC-009E evidence dashboard.
- Preserve existing single-workspace behavior and use `pnpm` only.

### Out of Scope
- New review-packet table, migration, or durable run-state schema.
- Automatic GitHub polling, webhook listener, or sync scheduler changes.
- Claim authority, retry controls, sandbox lifecycle, adapter registry, or real
  harness execution.
- New evidence dashboard or broad operator UI.
- Fresh GitHub calls as a packet assembly requirement.
```

### Specify Results

To fill after running the command:

| Metric | Value |
|--------|-------|
| Functional Requirements | 14 |
| User Stories | 4 |
| Acceptance Criteria | 10 |

### Files Generated

- [x] `specs/009d-pilot-review-lifecycle/spec.md`
- [x] `specs/009d-pilot-review-lifecycle/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify, to resolve details that would otherwise turn
into implementation drift. Maximum five targeted questions per session.

### Clarify Prompts

#### Session 1: Packet Contract and Source Map

```bash
$speckit-clarify

Focus on the packet contract for SPEC-009D:
- JSON and Markdown output shape.
- Source-map pointers to tasks, activities, notifications, task_artifacts,
  quality_reviews, resource_policy_events, GitHub issue/PR fields, and smoke
  checklist evidence.
- Required current-stage, latest artifact/error, governance, Aegis, owner-gate,
  duplicate-active-stage, and linked issue/PR fields.
- How local-only lookalikes are excluded.
```

#### Session 2: API Seam and Artifact Inspection

```bash
$speckit-clarify

Focus on the smallest operator inspection seam:
- Decide whether SPEC-009D needs an API route or can rely on task artifact
  read APIs.
- If an API is needed, keep it to an existing task or artifact route pattern.
- Do not design the SPEC-009E dashboard or eligibility evidence surface.
```

#### Session 3: Deferrals, Redaction, and Staleness

```bash
$speckit-clarify

Focus on bounded absence and safety:
- Exact field names for `deferred` or `not_available` future-state entries.
- Owning future specs for run-state, GitHub sync automation, claim authority,
  retry controls, sandbox lifecycle, adapter registry, and real harness runs.
- Redacted, quarantined, oversized, missing, malformed, or stale evidence
  behavior.
- No fresh GitHub API call requirement.
```

### Clarify Results

To fill after running clarify:

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Packet contract and source map | 5 | Accepted canonical JSON/Markdown artifact terms, RFC 6901-style source-map pointers, archived C4 replay source rules, local-only eligibility proof, and deterministic field precedence |
| 2 | API seam and artifact inspection | 4 | Accepted no new packet route by default; use existing task artifact publish/list/read APIs, artifact-type discovery, durable pilot candidate task ownership, and no new list filters unless Plan proves required |
| 3 | Deferrals, redaction, and staleness | 5 | Accepted explicit `deferrals.<field>` envelope, canonical SPEC-013/SPEC-014 owner map, packet-local `evidence_state` safety states, structural staleness only, and publication blockers limited to identity/sync proof, invalid JSON/schema, or unsafe storage/display conditions |

### Consensus Resolution Log

| Phase | Item | Round | Routed Categories | Outcome | Analysts Used |
|-------|------|-------|-------------------|---------|---------------|
| Clarify Session 1 | SPEC-009C4 cleaned target replay source evidence | 1 | codebase, spec | Accepted archived smoke-checklist evidence plus retained `github_syncs` rows for cleaned target replay evidence; live row pointers remain required for current active-state claims | codebase-analyst, spec-context-analyst |
| Clarify Session 3 | Safety states for redacted, quarantined, oversized, missing, malformed, superseded, and stale evidence | 1 | security | Accepted packet-local `evidence_state` values with metadata-only quarantined/unsafe evidence, no raw secret-bearing content, structural warnings, and fail-closed publication only for invalid/unsafe packets or failed candidate identity/sync proof | codebase-analyst, spec-context-analyst, domain-researcher |

---

## Phase 3: Plan

**When to run:** After the spec is finalized. Output:
`specs/009d-pilot-review-lifecycle/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Runtime: Node >=22 with Next.js 16 App Router and React 19.
- Language: TypeScript 5.7 strict.
- Database: SQLite through `better-sqlite3` with existing synchronous helpers.
- State/UI: Zustand and Tailwind CSS 3 only where an existing panel needs it.
- Artifacts: Existing SPEC-007 task artifact module and APIs.
- Governance: Existing SPEC-008 resource governance evidence and events.
- Testing: Vitest for packet derivation and route tests; Playwright only if a
  real UI journey changes.
- Package manager: pnpm only.

## Constraints
- Start from `docs/ai/specs/SPEC-009D-design-concept.md`.
- Reuse existing task, activity, notification, task artifact, quality review,
  governance, GitHub sync, and smoke checklist records.
- No new runtime dependency.
- No schema migration unless the spec proves an unavoidable additive need; the
  setup decision is no new review-packet table.
- No fresh GitHub API call requirement during packet assembly.
- No automatic polling, claim authority, retry UI, sandbox lifecycle, adapter
  registry, real harness execution, or evidence dashboard.
- Keep implementation reviewable under the transition exception; split if the
  plan crosses into SPEC-009E, SPEC-013A/A1/B/C, or SPEC-014A-D ownership.

## Architecture Notes
- Treat task artifact publication as the durable packet write path.
- Model the packet as JSON plus Markdown summary generated from the same source
  snapshot.
- Include source-map entries for each field so reviewers can trace values back
  to existing rows or smoke checklist evidence.
- Represent unavailable future state explicitly with owning future spec IDs.
- Prefer pure derivation functions in `src/lib/` plus focused route wrappers if
  an API seam is justified.
- Preserve redaction and preview semantics from SPEC-007; never inline raw
  secret or oversized evidence into the packet.
```

### Plan Results

To fill after running plan:

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Primary surface is pure `src/lib/pilot-review-packet.ts` derivation plus existing task artifact publish/read/list seams |
| `research.md` | Complete | Resolved stored-evidence-only assembly, JSON/Markdown artifacts, source maps, deferrals, local-only exclusion, redaction semantics, and no new packet route |
| `data-model.md` | Complete | Defines packet, artifact, owner task, source-map, deferral, evidence-state, and candidate/artifact transitions |
| `contracts/` | Complete | `contracts/pilot-review-packet.md` defines JSON/Markdown packet artifacts and existing task artifact inspection routes |
| `quickstart.md` | Complete | Defines TDD flow, focused verification, full verification, manual review evidence, and artifact inspection |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Validate both `spec.md` and `plan.md` together.

### Recommended Domains

| Domain | Why |
|--------|-----|
| api-contracts | Needed if an existing API seam exposes packet inspection or artifact reads |
| data-integrity | Packet values derive from multiple existing rows and must preserve source maps |
| security | Redaction, hashes, compact previews, and no raw secret leakage are central |
| state-management | Current-stage and lifecycle snapshot derivation must be deterministic |
| error-handling | Missing, stale, malformed, local-only, redacted, or oversized evidence must be structured |

### Checklist Prompts

#### 1. api-contracts Checklist

```bash
$speckit-checklist api-contracts

Focus on SPEC-009D requirements:
- Packet JSON and Markdown artifact shape.
- Optional API seam only if an existing task/artifact route pattern fits.
- Response behavior for missing, local-only, stale, or redacted evidence.
- Explicit deferred future-state fields with owning spec IDs.
```

#### 2. data-integrity Checklist

```bash
$speckit-checklist data-integrity

Focus on SPEC-009D requirements:
- Source-map pointers to tasks, activities, notifications, task_artifacts,
  quality_reviews, governance rows, GitHub issue/PR fields, and smoke evidence.
- Stable identity anchored on GitHub issue plus root task.
- Lifecycle descendants and duplicate-active-stage checks.
- No invented future run/sandbox/adapter values.
```

#### 3. security Checklist

```bash
$speckit-checklist security

Focus on SPEC-009D requirements:
- SPEC-007 redaction and security-scan status reuse.
- No raw secret or oversized evidence embedding.
- Hashes, byte counts, previews, and source pointers for sensitive artifacts.
- Safe Markdown generation from stored evidence.
```

#### 4. state-management Checklist

```bash
$speckit-checklist state-management

Focus on SPEC-009D requirements:
- Deterministic current-stage derivation from stored Mission Control records.
- Stored evidence first, no required fresh GitHub call.
- Explicit deferred/not_available states for SPEC-013A/A1/B/C and SPEC-014A-D.
- Stable behavior when sync rows are retained but disposable UAT tasks are cleaned.
```

#### 5. error-handling Checklist

```bash
$speckit-checklist error-handling

Focus on SPEC-009D requirements:
- Missing task, activity, artifact, notification, quality review, governance, or
  GitHub linkage evidence.
- Local-only lookalike exclusion.
- Malformed artifact metadata and quarantined/redacted artifacts.
- Structured packet warnings without crashing or leaking sensitive content.
```

### Checklist Results

To fill after running checklists:

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| api-contracts | 20 | 1 found / 1 resolved | Artifact route response semantics for missing, local-only/incomplete, stale, redacted, quarantined, and disabled-storage states |
| data-integrity | 20 | 0 | Source-map coverage, stable identity, lifecycle descendants, duplicate-active-stage evidence, and future-state deferrals validated |
| security | 21 | 1 found / 1 resolved | Added Markdown-output safety requirements for untrusted stored evidence, escaping/fencing, no raw HTML, and no active links from evidence text |
| state-management | 25 | 0 | Deterministic stage derivation, stored-evidence-only state, deferrals, cleaned-UAT evidence, and duplicate-active-stage boundaries validated |
| error-handling | 28 | 0 | Missing evidence, local-only exclusion, malformed metadata, quarantined/redacted artifacts, structured warnings, and no-leak/no-crash behavior validated |
| Total | 114 | 2 found / 2 resolved | api-contracts and security gaps remediated; no remaining `[Gap]` markers |

---

## Phase 5: Tasks

**When to run:** After checklists complete and all genuine gaps are addressed.
Output: `specs/009d-pilot-review-lifecycle/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure
- Use `docs/ai/specs/SPEC-009D-design-concept.md`, `spec.md`, and `plan.md`.
- Keep tasks small, testable, and ordered RED before GREEN.
- Organize by independently testable user stories.
- Mark parallel-safe tasks with [P] only when file ownership is disjoint.
- Every production change must have a preceding failing Vitest or route test.

## Required Coverage Themes
- Packet identity: GitHub issue plus root task, descendants, and PR evidence.
- Source-map derivation from tasks, activities, notifications, task_artifacts,
  quality_reviews, governance rows, GitHub sync state, and smoke checklist
  evidence.
- JSON plus Markdown artifact generation from one source snapshot.
- SPEC-007 redaction, compact previews, hashes, byte counts, and security-scan
  status.
- Explicit deferred/not_available fields for SPEC-013A/A1/B/C and SPEC-014A-D.
- Local-only lookalike exclusion.
- Missing, stale, malformed, redacted, quarantined, and oversized evidence.
- No fresh GitHub API call requirement.

## Constraints
- Do not add new dependencies.
- Do not add a review-packet table or migration unless Analyze proves the setup
  decision impossible.
- Do not implement SPEC-009E evidence dashboard, SPEC-013 control plane, or
  SPEC-014 runner/sandbox/adapter behavior.
- Use `pnpm` for every package command.
```

### Tasks Results

To fill after running tasks:

| Metric | Value |
|--------|-------|
| Total Tasks | 42 |
| Phases | 7 |
| Parallel Opportunities | 7 |
| User Stories Covered | 4 |

---

## Phase 6: Analyze

**When to run:** Always run after generating tasks and before implementation.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Constitution alignment: zero regression, TDD, auditability, defensive
   boundaries, and reviewability.
2. Drift from `docs/ai/specs/SPEC-009D-design-concept.md`, especially Q1-Q8.
3. Any accidental new table, migration, poller, claim/run schema, sandbox,
   adapter, or dashboard work.
4. Coverage gaps for JSON and Markdown artifacts, source maps, redaction,
   missing/stale evidence, local-only exclusion, and deferred future fields.
5. Task file paths against the actual Mission Control project structure.
```

### Analysis Results

To fill after running analyze:

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| A001 | CRITICAL | Plan/tasks named only `src/lib/pilot-review-packet.ts` for strict-scope coverage while tasks introduce three additional SPEC-009D-owned TypeScript test/fixture modules | Resolved by updating `plan.md` and `tasks.md` to require explicit strict TypeScript and ESLint entries for all four SPEC-009D-owned TypeScript files |

---

## Phase 7: Implement

**When to run:** After tasks are generated, analyzed, and all blocking findings
are resolved.

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD-First

For each task:
1. RED: Write a failing test for the expected packet behavior.
2. GREEN: Implement the smallest code needed to pass.
3. REFACTOR: Clean up while tests stay green.
4. VERIFY: Run focused tests and update evidence.

## Pre-Implementation Setup
1. Verify branch: `git rev-parse --abbrev-ref HEAD`.
2. Verify package manager from `pnpm-lock.yaml`.
3. Re-run the reviewability gate after tasks.
4. Run the existing focused baseline selected by Plan before editing shared
   task, artifact, governance, or API code.

## Implementation Notes
- Keep packet derivation pure where possible and isolate persistence through
  existing task artifact helpers.
- Keep API behavior, if any, as a thin wrapper around the packet derivation.
- Record smoke checklist evidence only for operator-visible packet inspection
  and C4 source-trail continuity.
- Update this workflow with phase results, verification commands, and final PR
  packet evidence before opening or updating the PR.
```

### Implementation Progress

To fill during implementation:

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| Setup | T001-T004 | Complete | Archive Sweep, scope, fixture, and artifact-surface evidence recorded |
| Foundation | T005-T007 | Complete | SPEC-009D constants, packet/source-map types, and contract tests added |
| User Story 1 | T008-T016 | Complete | Stored pilot identity, source maps, lifecycle/gates, warnings, and focused verification complete |
| User Story 2 | T017-T025 | Complete | Same-snapshot JSON/Markdown artifacts, SPEC-007 metadata compatibility, and safe Markdown rendering complete |
| User Story 3 | T026-T030 | Complete | Future SPEC-013/SPEC-014 fields are explicit deferrals only; no active capability shipped |
| User Story 4 | T031-T035 | Complete | Local-only lookalikes excluded and partial-proof packets marked incomplete |
| Polish and Verification | T036-T042 | Complete | Strict-scope entries, full verification, artifact seam evidence, smoke checklist note, and PR evidence recorded |

### Implementation Results

- Packet derivation lives in `src/lib/pilot-review-packet.ts` and uses stored Mission Control evidence only.
- JSON and Markdown packet artifacts publish through existing SPEC-007 task artifact behavior with `schema_version="spec-009d.packet.v1"`.
- No packet-specific route, dashboard, runtime dependency, migration, fresh GitHub call, polling, claim authority, retry control, sandbox lifecycle, adapter registry, or real harness execution was added.
- Build blockers resolved during verification: removed network-dependent Google font fetches, pinned Next/eslint-config-next to 16.1.6, moved route test reset helpers out of a Next route module, rebuilt `better-sqlite3`, and regenerated standalone output with the native binding present.
- Verification passed under Node 22.22.2: focused packet/artifact/disposition tests (20 tests), existing task-artifact seam tests (38 tests), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` (2907 passing tests), and `pnpm test:e2e` (646 passing tests).

---

## Post-Implementation Checklist

- [x] All tasks in `tasks.md` are complete.
- [x] Focused Vitest and route-adjacent tests pass.
- [x] `pnpm typecheck` passes.
- [x] `pnpm lint` passes.
- [x] `pnpm build` passes.
- [x] `pnpm test` passes when runtime behavior changes.
- [x] `pnpm test:e2e` passes; `pnpm test:all` was not rerun as a single wrapper after the blocker fix because its component commands were run directly and passed.
- [x] Playwright coverage is unchanged because SPEC-009D adds no UI journey.
- [x] `docs/qa/pilot-smoke-checklist.md` records packet verification evidence.
- [x] Roadmap and this workflow reflect final implementation status.
- [x] PR evidence includes review packet, scope budget, verification evidence,
  known gaps, and rollback or no-migration notes.

---

## Lessons Learned

### What Worked Well

- Keeping packet derivation in `src/lib` made the feature independently testable without a new route, dashboard, table, or live GitHub dependency.
- Explicit deferrals kept SPEC-013/SPEC-014 future ownership visible without shipping control-plane behavior early.

### Challenges Encountered

- The default shell used Node 26 while the repo is pinned to Node 22; final verification used the pinned Node 22 runtime.
- Next 16.2.6 hit a production-build prerender invariant; pinning to 16.1.6 restored stable builds.
- Standalone e2e initially failed because `better-sqlite3` was rebuilt after the standalone bundle was generated; a clean rebuild after native rebuild fixed the traced output.
- Sandboxed Turbopack builds can fail on local worker process creation, so production build verification was run outside the sandbox.

### Patterns To Reuse

- For native dependencies, rebuild native modules before generating standalone output and verify `require()` from `.next/standalone`.
- Keep test-only helpers out of Next route modules; route files should export only valid route fields.
- For packet/evidence features, publish through existing artifact seams first and add new API/UI only when a later spec proves the existing inspection path is insufficient.

---

Template based on SpecKit best practices and populated for Codex SpecKit Pro setup.
