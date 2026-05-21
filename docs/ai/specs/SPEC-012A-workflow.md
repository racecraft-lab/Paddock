# SpecKit Workflow: SPEC-012A - Repo Knowledge Index and AGENTS Map

**Template Version**: 1.0.0
**Created**: 2026-05-21
**Purpose**: Prepare and execute the RC Factory Phase 10A process/tooling spec that makes repository-local knowledge discoverable through a concise `AGENTS.md` map, a canonical machine-readable docs index, ownership/freshness metadata, and local/CI guards.

---

## How to Use This Workflow

1. Run `$speckit-autopilot docs/ai/specs/SPEC-012A-workflow.md` from the `012a-repo-knowledge-index` worktree.
2. Keep all generated spec artifacts under `specs/012a-repo-knowledge-index/`.
3. Preserve this workflow as the execution ledger. Do not run implementation directly from `main`.
4. This setup stops before autopilot; all phase rows below start as pending.

---

## Design Concept

This workflow file was enriched from a Grill Me interview run during `$speckit-setup`. The full Q&A log, Goals, Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-012A-design-concept.md
```

Re-read it before each phase if you need to disambiguate a prompt. The Design Concept doc is the source of truth for setup-time scoping decisions captured during the human interview.

> **Note:** Grill Me is human-in-the-loop only. It is not part of the autopilot loop. Once autopilot begins, clarifications happen via `/speckit.clarify` and the consensus protocol, never via grill-me.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Complete | Generated `specs/012a-repo-knowledge-index/spec.md` with 18 FRs, 4 user stories, 11 acceptance scenarios, 5 success criteria, and no unresolved markers; G1 passed |
| Clarify | `$speckit-clarify` | Complete | Resolved index/schema paths, required entries, metadata semantics, guard failure classes, stale status pointer detection, fresh-agent proxy behavior, GitNexus discoverability, and `pnpm guardrails`/Quality Gate integration; G2 passed |
| Plan | `$speckit-plan` | Complete | Planned JSON index/schema, Node built-in guard scripts, fresh-agent proxy, concise `AGENTS.md` map, package scripts, and `pnpm guardrails`/Quality Gate wiring; G3 passed |
| Checklist | `$speckit-checklist` | Complete | Completed data-integrity, integration, regression-safety, and error-handling checklists; resolved related spec ID pattern and stable finding-code gaps; G4 passed |
| Tasks | `$speckit-tasks` | Complete | Generated 32 TDD-first tasks across fixtures, index/schema/map, guard, fresh-agent proxy, package/CI wiring, and verification; G5 passed and task reviewability gate passed with scoped transition exception |
| Analyze | `$speckit-analyze` | Complete | Verified design concept/spec/plan/tasks/checklists agree on strict docs/process scope; marker count is 0, `git diff --check` is clean, and G6 passed with 0 CRITICAL/HIGH findings |
| Implement | `$speckit-implement` | Complete | Completed all 32 generated tasks; G7 passed with 32/32 tasks complete and 0 markers |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After setup | Branch is `012a-repo-knowledge-index`; design concept and workflow are committed; reviewability preset resolves; roadmap marks SPEC-012A `In Progress` on this branch only |
| G1 | After Specify | Requirements cover JSON index, concise `AGENTS.md` map, ownership/freshness metadata, repo-local link/staleness guards, GitNexus documentation boundary, and fresh-agent proxy verification; no `[NEEDS CLARIFICATION]` markers remain |
| G2 | After Clarify | Index schema, required docs, freshness/staleness thresholds, warning-vs-failure rules, and CI/local guard integration are resolved |
| G3 | After Plan | Architecture is process/tooling-only; no runtime source, migrations, UI, scheduler, runner, sync, sandbox, adapter, or generated `.gitnexus/` artifact is introduced |
| G4 | After Checklist | All `[Gap]` markers from required domains are addressed or explicitly out of scope |
| G5 | After Tasks | Tasks are reviewable, ordered, TDD-first where scripts/guards change, and do not drift into broad docs rewrites |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; design concept, spec, plan, and tasks agree on scope boundaries |
| G7 | During Implement | Focused tests/guards pass after each implementation slice; final verification proves docs index and fresh-agent proxy behavior |

---

## Prerequisites

### Constitution Validation

Before starting any workflow phase, verify alignment with `.specify/memory/constitution.md`:

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | Process/tooling changes do not affect runtime behavior | No runtime source, migrations, UI, scheduler, runner, or sync files are changed without a failing scope-guard discussion |
| II. Upstream Compatibility Discipline | Phase 10A is `upstream-safe` process/tooling | Roadmap and Plan classify output as docs/scripts only |
| IV. Test-First Development | Guard/script behavior starts with failing tests or fixtures | Tasks require RED tests for JSON index validation and fresh-agent proxy checks before implementation |
| XV. Spec Artifact Provenance | Setup artifacts and workflow evidence remain durable | Design concept, workflow, roadmap status, and later generated specs are tracked |
| XVI. Reviewability And Verification Debt Control | Scope remains reviewable and split decisions are recorded | Reviewability gate result below is preserved; tasks keep file ownership narrow |

**Constitution Check:** Specify and Plan verified process/tooling-only scope, archive evidence policy, reviewability budget declaration, no runtime/migration/UI behavior, no new runtime dependency, and TDD-first negative fixture coverage. Re-check after Implement confirms the final artifact shape.

### Reviewability Gate

Setup ran:

```bash
/Users/fredrickgabelmann/.codex/plugins/cache/racecraft-plugins-public/speckit-pro/1.11.1/skills/speckit-autopilot/scripts/reviewability-gate.sh setup docs/ai/rc-factory-technical-roadmap.md
```

Result:

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
    "harness/adapter",
    "or docs/process",
    "scheduler/runtime",
    "schema/migration",
    "seed/config",
    "UI"
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

Decision: setup may proceed under the roadmap's transition exception, but every downstream phase must keep the actual implementation to the SPEC-012A strict scope: docs index, `AGENTS.md` map updates, link/freshness checks, and CI/local guard scripts.

### Reviewability Preset

The setup command verified the generic reviewability preset resolution:

```bash
specify preset resolve spec-template
specify preset resolve plan-template
specify preset resolve tasks-template
```

Each command resolved to `.specify/presets/speckit-pro-reviewability/templates/`.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec ID | SPEC-012A |
| Name | Repo Knowledge Index and AGENTS Map |
| Branch | `012a-repo-knowledge-index` |
| Dependencies | SPEC-002A, SPEC-009A |
| Enables | SPEC-012B, SPEC-013A |
| Priority | P1 |
| Scope source | Phase 10A - Repo knowledge index and AGENTS map |
| Acceptance criteria source | Phase 10A Acceptance Criteria |
| Tool count / names | N/A - process/tooling spec |

### Roadmap Scope

Make repository-local knowledge discoverable without hiding operator context in a giant instruction file: concise `AGENTS.md` map, machine-readable docs index, ownership/freshness metadata, workflow/status pointers, and exact verification commands for durable docs.

### Strict Scope

Allowed:

- Repo-owned JSON docs index under `docs/ai/`.
- Concise root `AGENTS.md` Repo Knowledge Map section.
- Ownership/freshness metadata for canonical docs.
- Local/CI guard scripts for required metadata, repo-local links, stale status pointers, and fresh-agent proxy discovery.
- Documentation of GitNexus refresh commands and embedding environment.

Forbidden:

- Runtime source behavior changes.
- Database migrations or schema changes.
- UI changes.
- Scheduler, runner, claim, retry, GitHub sync, sandbox, or harness adapter behavior.
- Generated `.gitnexus/` artifacts in git.
- Broad docs rewrites or directory-wide nested `AGENTS.md` rollout.

### Design Concept Decisions

- Q1: canonical discovery surface is a repo-owned machine-readable docs index; `AGENTS.md` stays a concise map.
- Q2: first index format is JSON under `docs/ai/`.
- Q3: guard fails CI for canonical index and explicitly listed required docs only; external links and Obsidian wikilinks are warnings/informational unless repo-owned.
- Q4: root `AGENTS.md` gains a concise Repo Knowledge Map and does not duplicate the full index.
- Q5: required metadata per index entry is `path`, `purpose`, `owner`, `freshness`, `last_verified`, `related_specs`, and `verification_commands`.
- Q6: fresh-agent proof is a deterministic local smoke script over the JSON index.
- Q7: GitNexus `.gitnexus/` output is optional local operator tooling, not committed or required.
- Q8: runtime, migrations, UI, scheduler/runner/sync, harness adapters, generated index artifacts, broad docs rewrites, and nested `AGENTS.md` rollout are out of scope.

### Success Criteria Summary

- [x] Agents can start from repo-local docs and discover PRD, roadmap, workflow, runbook, ownership, and current status evidence.
- [x] Canonical docs index contains required metadata for each required entry.
- [x] Root `AGENTS.md` remains concise and points to the index and source-of-truth docs.
- [x] Local/CI guard fails on missing files, missing owner/freshness metadata, stale status pointers, or broken repo-local required links.
- [x] External URLs and Obsidian wikilinks do not hard-fail unless they claim a repo-owned fact.
- [x] GitNexus refresh instructions are discoverable, but `.gitnexus/` remains ignored and uncommitted.

---

## Phase 1: Specify

**When to run:** At the start of the feature specification. Focus on WHAT and WHY, not implementation details. Output: `specs/012a-repo-knowledge-index/spec.md`.

### Specify Prompt

```bash
/speckit.specify

## Feature: SPEC-012A - Repo Knowledge Index and AGENTS Map

### Problem Statement
Fresh agents need to discover Mission Control repo truth from checked-in artifacts instead of hidden operator context, memory, or a huge instruction file. The repo already has a PRD, technical roadmap, SpecKit workflow ledgers, QA checklist, rollback/runbook docs, and GitNexus instructions, but there is no canonical machine-readable map with ownership/freshness metadata and a guard that proves the map is current.

### Users
- Autonomous coding agents starting a new Mission Control spec or maintenance task.
- Human operators reviewing whether docs are current enough to drive autonomous work.
- Future SPEC-012B/SPEC-013 agents that need repo/process truth before building drift guards and run-state persistence.

### Required Behavior
- Add a repo-owned JSON docs index under `docs/ai/`.
- Keep `AGENTS.md` concise by adding a Repo Knowledge Map section that points to the JSON index, PRD, roadmap, workflow directory, QA checklist, rollback runbook, GitNexus instructions, and ownership/freshness guard.
- Require every canonical index entry to include `path`, `purpose`, `owner`, `freshness`, `last_verified`, `related_specs`, and `verification_commands`.
- Add local and CI-runnable guards that fail on missing required docs, missing required metadata, stale status pointers, or broken repo-local required links.
- Treat external URLs and Obsidian-style wikilinks as warnings/informational unless the referenced fact is repo-owned.
- Add a deterministic fresh-agent proxy smoke script that proves the index resolves the PRD, technical roadmap, active/pending workflow pointers, QA checklist, rollback runbook, `AGENTS.md`, and GitNexus instructions.
- Document the GitNexus refresh command and required embedding environment without committing or requiring `.gitnexus/`.

### Constraints
- Process/tooling spec only.
- No runtime source behavior changes.
- No migrations, UI, scheduler/runner behavior, automatic GitHub sync, sandbox lifecycle, harness adapters, generated `.gitnexus/` artifacts, broad docs rewrites, or directory-wide nested `AGENTS.md` rollout.
- Preserve SpecKit workflow files as execution ledgers and roadmap/PRD as durable intent.
- Use pnpm scripts and existing CI/guardrail style where possible.

### Source Inputs
- Roadmap section: `docs/ai/rc-factory-technical-roadmap.md#SPEC-012A`
- Design Concept: `docs/ai/specs/SPEC-012A-design-concept.md`
- Constitution: `.specify/memory/constitution.md`
- Existing repo instructions: `AGENTS.md`, `CLAUDE.md`
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 39 after Clarify expansion |
| User Stories | 4 |
| Acceptance Criteria | 11 |

### Files Generated

- [x] `specs/012a-repo-knowledge-index/spec.md`
- [x] `specs/012a-repo-knowledge-index/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify if any ambiguity remains. Maximum 5 targeted questions per Clarify session.

### Clarify Prompts

#### Session 1: Index Schema and Required Entries

```bash
/speckit.clarify

Focus on the SPEC-012A JSON docs index schema:
- Exact index filename/path under `docs/ai/`.
- Whether a JSON Schema file is required and where it lives.
- Required entry set for PRD, roadmap, workflow directory/current workflow pointers, QA checklist, rollback runbook, `AGENTS.md`, and GitNexus instructions.
- Exact semantics for `owner`, `freshness`, `last_verified`, `related_specs`, and `verification_commands`.
```

#### Session 2: Guard Failure Semantics

```bash
/speckit.clarify

Focus on SPEC-012A guard behavior:
- Which failures block CI versus warn locally.
- How stale status pointers are detected from roadmap/workflow/autopilot-state evidence.
- How repo-local Markdown links are validated.
- How external URLs and Obsidian-style wikilinks are reported without becoming noisy hard failures.
```

#### Session 3: Fresh-Agent Proxy and CI Integration

```bash
/speckit.clarify

Focus on fresh-agent discovery and integration:
- What the deterministic fresh-agent proxy script must prove.
- Whether the guard wires into `pnpm guardrails`, a new package script, CI quality gate, or all of the above.
- How to verify GitNexus instructions are discoverable without requiring `.gitnexus/`.
- How to keep `AGENTS.md` concise while still routing agents to source-of-truth artifacts.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Index schema and required entries | 5 | Accepted `docs/ai/repo-knowledge-index.json`, required JSON Schema at `docs/ai/repo-knowledge-index.schema.json`, minimum required discovery entries, single `AGENTS.md` entry covering both Repo Knowledge Map and GitNexus instructions, and structured metadata semantics for owner/freshness/last_verified/related_specs/verification_commands |
| 2 | Guard failure semantics | 4 | Accepted hard-fail classes for malformed/missing required index/schema/docs/metadata/status/link/spec-id failures, warning-only handling for external URLs/Obsidian wikilinks/optional links, roadmap-workflow-autopilot-state stale pointer comparison, and repo-local Markdown link normalization with outside-repo traversal rejection |
| 3 | Fresh-agent proxy and CI integration | 4 | Accepted fresh-agent proxy starts from `AGENTS.md` and resolves required targets through the canonical index; focused package scripts cover index validation and smoke checks; blocking validation wires into `pnpm guardrails` and therefore existing Quality Gate CI; GitNexus discoverability is verified from checked-in instructions without `.gitnexus/`; `AGENTS.md` stays link/map-only |

### Consensus Resolution Log

| Item | Round | Routed Categories | Outcome | Analysts Used |
|------|-------|-------------------|---------|---------------|
| Clarify Session 1 | N/A | N/A | No unresolved consensus items; parent accepted local repo evidence and setup decisions | N/A |
| Clarify Session 2 | N/A | N/A | No unresolved consensus items; parent accepted roadmap/workflow/package/CI guardrail evidence for guard failure semantics | N/A |
| Clarify Session 3 | N/A | N/A | No unresolved consensus items; parent accepted root-instruction, package-script, Quality Gate, and GitNexus guidance evidence for fresh-agent/CI integration | N/A |

---

## Phase 3: Plan

**When to run:** After spec is finalized. Output: `specs/012a-repo-knowledge-index/plan.md`.

### Plan Prompt

```bash
/speckit.plan

## Tech Stack
- Runtime baseline: Node.js >=22, Next.js 16 App Router, React 19, TypeScript 5.7 strict, SQLite via better-sqlite3.
- Package manager: pnpm from `pnpm-lock.yaml`.
- Existing docs/tooling surfaces: `AGENTS.md`, `CLAUDE.md`, `docs/rc-factory-v1-prd.md`, `docs/ai/rc-factory-technical-roadmap.md`, `docs/ai/specs/*-workflow.md`, `docs/qa/pilot-smoke-checklist.md`, rollback/runbook docs, package scripts, and GitHub Actions quality gate.
- GitNexus local tooling: documented via `direnv exec . gitnexus analyze --embeddings --skip-agents-md`; `.gitnexus/` stays ignored.

## Constraints
- Use `docs/ai/specs/SPEC-012A-design-concept.md` as the source of setup-time scoping decisions.
- Implement only docs index, `AGENTS.md` map updates, link/freshness checks, CI/local guard scripts, and package/CI wiring needed for those guards.
- No runtime source behavior, database migrations, UI, scheduler/runner behavior, automatic GitHub sync, sandbox lifecycle, harness adapters, generated `.gitnexus/` artifacts, broad docs rewrites, or nested `AGENTS.md` rollout.
- If Plan wants a new script, prefer small Node.js scripts using built-in modules unless current repo tooling already offers a better local parser.
- Preserve `AGENTS.md` as a concise map; do not duplicate the full JSON index in prose.

## Architecture Notes
- Q1/Q2 choose a repo-owned JSON index under `docs/ai/` as canonical.
- Q3 requires hard failures only for required repo-local docs and metadata, with warnings for external/Obsidian links unless repo-owned.
- Q5 requires `path`, `purpose`, `owner`, `freshness`, `last_verified`, `related_specs`, and `verification_commands` for every canonical entry.
- Q6 requires a deterministic fresh-agent proxy script over the JSON index.
- Q7 forbids committed or required `.gitnexus/` artifacts; document refresh instructions only.
- Q8 enforces the process/tooling-only boundary.

## Verification Strategy
- Add RED fixtures/tests for missing required metadata and missing required docs before implementing validation.
- Verify the fresh-agent proxy resolves PRD, roadmap, workflow/status pointers, QA checklist, rollback runbook, `AGENTS.md`, and GitNexus instructions.
- Run `pnpm typecheck`, `pnpm lint`, focused guard tests/scripts, and any package script/CI guard added by the spec.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | JSON index/schema, guard scripts, `AGENTS.md` map, CI/local wiring |
| `research.md` | Complete | Index schema, guard semantics, fresh-agent proxy decisions |
| `data-model.md` | Complete | Knowledge Index, Canonical Index Entry, Freshness Rule, Guard Finding, Status Pointer |
| `contracts/` | Complete | `contracts/repo-knowledge-index-contract.md` defines guard, smoke, and guardrails integration contracts |
| `quickstart.md` | Complete | Operator/fresh-agent verification path |

---

## Phase 4: Domain Checklists

**When to run:** After `/speckit.plan`; validate spec and plan together.

### Recommended Checklist Prompts

#### 1. data-integrity Checklist

Why: The canonical JSON index is structured data with required fields, status pointers, and freshness metadata. Requirement drift here makes agents trust stale source maps.

```bash
/speckit.checklist data-integrity

Focus on SPEC-012A requirements:
- Required JSON index fields: path, purpose, owner, freshness, last_verified, related_specs, verification_commands.
- Required canonical docs and workflow/status pointers.
- Freshness and stale-status semantics.
- Validation behavior for missing files, missing metadata, duplicate paths, and invalid related spec IDs.
- Pay special attention to: preventing stale roadmap/workflow status from passing as current truth.
```

#### 2. integration Checklist

Why: SPEC-012A connects docs, package scripts, CI quality gates, GitNexus instructions, and agent startup behavior without adding runtime behavior.

```bash
/speckit.checklist integration

Focus on SPEC-012A requirements:
- Integration with existing pnpm scripts and GitHub Actions quality gate.
- `AGENTS.md` map points to the JSON index and source-of-truth docs without duplication.
- GitNexus refresh instructions remain discoverable but optional.
- Fresh-agent proxy script resolves all required repo-local artifacts.
- Pay special attention to: not depending on ignored `.gitnexus/` state or local LM Studio availability in CI.
```

#### 3. regression-safety Checklist

Why: The main risk is scope drift into runtime changes, broad docs rewrites, or noisy CI failures.

```bash
/speckit.checklist regression-safety

Focus on SPEC-012A requirements:
- No runtime source, migrations, UI, scheduler/runner/sync, sandbox, or harness adapter changes.
- Root `AGENTS.md` remains concise.
- External URLs and Obsidian-style wikilinks are warnings/informational unless repo-owned.
- CI hard-fail scope is limited to canonical repo-local index and required docs.
- Pay special attention to: avoiding broad docs rewrites and nested AGENTS rollout.
```

#### 4. error-handling Checklist

Why: Guard failures must be actionable for future agents and not collapse unrelated warning classes into hard blockers.

```bash
/speckit.checklist error-handling

Focus on SPEC-012A requirements:
- Guard output distinguishes blocking failures from warnings.
- Missing file, missing metadata, stale status pointer, broken repo-local link, malformed JSON, and unknown spec ID failures have stable messages.
- External-link and Obsidian-link warnings remain visible without blocking CI.
- Fresh-agent proxy failures name the unresolved artifact and index entry.
- Pay special attention to: error messages that are precise enough for an autonomous remediation task.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | 8 | 1 resolved, 0 remaining | `spec.md`, `data-model.md` |
| integration | 6 | 0 remaining | `plan.md`, `contracts/repo-knowledge-index-contract.md` |
| regression-safety | 8 | 0 remaining | `spec.md`, `plan.md` |
| error-handling | 7 | 1 resolved, 0 remaining | `data-model.md`, `contracts/repo-knowledge-index-contract.md` |
| **Total** | 29 | 2 resolved, 0 remaining | G4 passed |

---

## Phase 5: Tasks

**When to run:** After checklists complete and all gaps are resolved. Output: `specs/012a-repo-knowledge-index/tasks.md`.

### Tasks Prompt

```bash
/speckit.tasks

## Inputs
- `specs/012a-repo-knowledge-index/spec.md`
- `specs/012a-repo-knowledge-index/plan.md`
- `docs/ai/specs/SPEC-012A-design-concept.md`
- `docs/ai/rc-factory-technical-roadmap.md#SPEC-012A`

## Task Structure
- Use TDD-first ordering for validation scripts and fresh-agent proxy behavior.
- Start with fixtures/tests for missing required metadata, missing docs, broken repo-local links, stale status pointers, and fresh-agent proxy failures.
- Then implement JSON index, validation script, `AGENTS.md` map, package/CI wiring, and quickstart/docs.
- Mark [P] only when file ownership is disjoint.
- Keep tasks small enough for review; do not create broad docs rewrite tasks.

## Required Coverage Themes
1. Canonical JSON docs index.
2. Required metadata and validation failures.
3. Concise `AGENTS.md` Repo Knowledge Map.
4. Fresh-agent proxy smoke script.
5. GitNexus instructions discoverability without `.gitnexus/` dependency.
6. CI/local guard wiring.
7. Scope guards proving no runtime/migration/UI/scheduler/sync/harness drift.

## Constraints
- Non-goals from the Design Concept are binding.
- Do not generate tasks for runtime source changes, migrations, UI, scheduler/runner behavior, automatic GitHub sync, sandbox lifecycle, harness adapters, generated `.gitnexus/` artifacts, broad docs rewrites, or nested `AGENTS.md` rollout.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | 32 |
| Phases | 6 implementation phases |
| Parallel Opportunities | 6 explicit `[P]` fixture tasks plus independent docs/map work |
| User Stories Covered | US1, US2, US3, US4 |

Reviewability tasks gate passed with a ratified transition exception. The exception is limited to the SPEC-012A docs/process deliverable: canonical index/schema files, concise root map, focused Node guard scripts, package scripts, guardrails wiring, fixtures, and verification evidence. It does not permit runtime behavior, migrations, UI, scheduler/runner behavior, GitHub sync automation, sandbox lifecycle, harness adapters, generated `.gitnexus/` artifacts, broad docs rewrites, or nested `AGENTS.md` rollout.

---

## Phase 6: Analyze

**When to run:** Always run after generating tasks.

### Analyze Prompt

```bash
/speckit.analyze

Analyze SPEC-012A across:
- `docs/ai/specs/SPEC-012A-design-concept.md`
- `specs/012a-repo-knowledge-index/spec.md`
- `specs/012a-repo-knowledge-index/plan.md`
- `specs/012a-repo-knowledge-index/tasks.md`

Focus on:
1. Constitution alignment and reviewability budget.
2. Drift between Goals, Non-goals, Q1-Q8 decisions, and generated artifacts.
3. Task coverage for JSON index metadata, guard failures, fresh-agent proxy, `AGENTS.md` map, GitNexus documentation boundary, and CI/local wiring.
4. Scope discipline: no runtime source, migrations, UI, scheduler/runner/sync, sandbox, harness adapter, generated `.gitnexus/`, broad docs rewrite, or nested AGENTS rollout.
5. Whether checklist gaps are fully reflected in spec/plan/tasks.
6. Whether error messages and guard outputs are actionable enough for future autonomous remediation.
```

### Analyze Severity Levels

| Severity | Meaning | Action Required |
|----------|---------|-----------------|
| CRITICAL | Blocks implementation or violates constitution/non-goals | Must fix before G6 |
| HIGH | Significant coverage or consistency gap | Must remediate before implementation |
| MEDIUM | Improvement or ambiguity | Review and decide |
| LOW | Minor wording or bookkeeping issue | Note or fix opportunistically |

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| None | N/A | No CRITICAL, HIGH, MEDIUM, or LOW findings from artifact analysis | No remediation required; G6 passed |

---

## Phase 7: Implement

**When to run:** After tasks.md is generated and analyzed with no unresolved CRITICAL/HIGH findings.

### Implement Prompt

```bash
/speckit.implement

Execute `specs/012a-repo-knowledge-index/tasks.md` in order.

## Approach: TDD First
1. RED: write failing tests/fixtures for docs-index validation and fresh-agent proxy behavior.
2. GREEN: implement the smallest docs/script/index changes to pass.
3. REFACTOR: keep `AGENTS.md` concise and guard scripts readable.
4. VERIFY: run focused guard commands, `pnpm typecheck`, `pnpm lint`, and any package/CI guard added by the spec.

## Pre-Implementation Setup
- Work from branch `012a-repo-knowledge-index`.
- Use pnpm.
- Read `docs/ai/specs/SPEC-012A-design-concept.md` before changing tasks.
- Confirm strict scope before touching any file outside docs index, `AGENTS.md`, scripts, package/CI guard wiring, or generated spec artifacts.

## Implementation Notes
- Prefer Node built-in modules for validation scripts unless Plan proves an existing repo dependency is the right parser.
- Do not commit `.gitnexus/`.
- Treat external URLs and Obsidian wikilinks as warning/informational unless the repo owns the fact.
- Keep CI output stable and actionable.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| Setup / RED fixtures | T001-T007 | Complete | Added mutation fixtures covering missing required entries, missing metadata, broken required links, stale status pointers, invalid related specs, and warning-only links |
| JSON index and validation guard | T008-T018 | Complete | Added canonical JSON index/schema plus Node built-in guard for schema shape, required entries, metadata, related specs, links, and status pointers |
| `AGENTS.md` map and GitNexus docs boundary | T010, T021 | Complete | Added concise Repo Knowledge Map and verified GitNexus command, `.envrc.local`, and ignored `.gitnexus/` guidance from checked-in instructions |
| Fresh-agent proxy and CI wiring | T019-T027 | Complete | Added fresh-agent proxy, package scripts, and `repo-knowledge-index` guardrail suite covered by existing Quality Gate `pnpm guardrails` step |
| Verification and status evidence | T028-T032 | Complete | Focused checks, typecheck, lint, and whitespace validation passed on 2026-05-21 |

### Implementation Verification Evidence

| Command | Result |
|---------|--------|
| `pnpm knowledge:index:check` | Pass: `[repo-knowledge-index] passed with 0 warning(s)` |
| `pnpm knowledge:index:smoke` | Pass: resolved 9 required targets from `AGENTS.md` through `docs/ai/repo-knowledge-index.json` |
| `direnv exec . pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/<fixture> --json` | Expected fixture behavior satisfied during UAT after accepting the pnpm argument separator; negative fixtures exit 1 with `fixture_expectations.ok=true`, warning-only fixture exits 0 |
| `pnpm guardrails -- --suite repo-knowledge-index` | Pass: `Repo knowledge index guard passed`; 1 suite passed |
| `direnv exec . pnpm guardrails` | Pass: all 3 guardrail suites passed, including `repo-knowledge-index` |
| `pnpm typecheck` | Pass |
| `pnpm lint` | Pass |
| `direnv exec . pnpm build` | Pass outside the Codex sandbox under Node v22.22.2 |
| `direnv exec . pnpm test:e2e` | Pass: 647 Playwright tests passed |
| `direnv exec . pnpm test src/lib/__tests__/task-chain-advancement.routing.test.ts` | Pass: 14/14 focused Vitest tests passed |
| `direnv exec . pnpm test` | Pass during UAT: 282 files passed, 33 skipped; 2934 tests passed, 3 skipped, 84 todo |
| `git diff --check` | Pass |

Fixture verification emitted expected codes: `required_entry_missing`,
`metadata_missing`, `required_link_broken`, `status_pointer_stale`,
`related_spec_invalid`, `external_link_warning`, and `wikilink_warning`.

Post-implementation code review also corrected the live status-pointer guard path so `pnpm knowledge:index:check` validates the actual SPEC-012A roadmap, workflow, and `autopilot-state.json` pointers in normal repo mode, not only fixture override mode.

---

## Post-Implementation Checklist

- [x] All generated tasks are marked complete in `specs/012a-repo-knowledge-index/tasks.md`.
- [x] `pnpm typecheck` passes.
- [x] `pnpm lint` passes.
- [x] Focused docs-index guard tests/scripts pass.
- [x] Fresh-agent proxy smoke passes.
- [x] Any package/CI guard added by this spec passes locally.
- [x] `pnpm build` passes outside the Codex sandbox.
- [x] `pnpm test:e2e` passes outside the Codex sandbox.
- [x] `git diff --check` passes.
- [x] Roadmap/workflow/status docs are updated in the spec branch.
- [x] Full `pnpm test` suite is green during UAT.
- [x] PR #56 merged to `main` as `a5e3fbece82fddec548b70763a703893ba409813` on 2026-05-21: https://github.com/racecraft-lab/mission-control/pull/56

### Post-Implementation Reviewability Evidence

The official diff gate command was run:

```bash
bash /Users/fredrickgabelmann/.codex/plugins/cache/racecraft-plugins-public/speckit-pro/1.11.1/skills/speckit-autopilot/scripts/reviewability-gate.sh diff origin/main...HEAD
```

It returned `status=block` with `transition_exception=false` even though the diff contains ratified transition-exception markers. The false negative is in the local gate script's exception detector (`grep -q` under `pipefail` can close the pipeline early before `git diff` exits). A temporary patched copy that preserves the same thresholds and uses non-quiet grep returned `status=exception`, `pass=true`, `reviewable_loc=3120`, `production_files=10`, `total_files=31`, and `primary_surface_count=6`. The exception remains limited to the SPEC-012A planned docs/process/script scope listed in this workflow.

### PR Check Evidence

PR #56 merged at https://github.com/racecraft-lab/mission-control/pull/56 as `a5e3fbece82fddec548b70763a703893ba409813` on 2026-05-21. The final remote check state passed CodeQL, `quality-gate`, `docker-ui-e2e / visual-review-report`, `visual-storybook / visual-review-report`, `visual-review-approval/playwright`, and `visual-review-approval/storybook`. The Quality Gate run passed guardrails, dependency audit, lint, typecheck, unit tests, build, and e2e in GitHub Actions. SPEC-012A changed docs/process/script/package surfaces only; no UI, Storybook, Docker, visual baseline, or e2e test files changed.

---

## Project Structure Reference

```text
AGENTS.md
CLAUDE.md
docs/
  ai/
    rc-factory-technical-roadmap.md
    specs/
      SPEC-012A-design-concept.md
      SPEC-012A-workflow.md
    workflows/
      mission-control/
  qa/
    pilot-smoke-checklist.md
  runbook/
  runbooks/
scripts/
specs/
  012a-repo-knowledge-index/
.specify/
  memory/constitution.md
  presets/speckit-pro-reviewability/
```

---

## Lessons Learned

### What Worked Well

- The concise `AGENTS.md` map plus machine-readable JSON index kept repo discovery centralized without turning root instructions into a long duplicate of every durable doc.
- Fixture-backed guard work caught the live status-pointer invocation gap during closeout, which was fixed before PR creation.
- UAT caught the documented pnpm fixture-command separator path; accepting literal `--` in the guard parser keeps quickstart commands executable as written.

### Challenges Encountered

- The worktree initially loaded Node v26.0.0, which cannot build the current `better-sqlite3` dependency. Running through `direnv exec .` restored the repo-pinned Node v22.22.2 toolchain.
- The documented negative fixture commands use pnpm's `--` separator; the guard parser must tolerate that separator before reading `--fixture`.

### Patterns to Reuse

- Keep future repo-discovery docs in `docs/ai/repo-knowledge-index.json` first, then expose only a short pointer map in `AGENTS.md`.
- Use `direnv exec .` for Mission Control validation in linked worktrees so native dependencies and GitNexus-related environment settings resolve through the repo-local toolchain.
