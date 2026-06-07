# SpecKit Workflow: SPEC-012B — Harness-Gardening Drift Guards

**Template Version**: 1.0.0
**Created**: 2026-06-06
**Purpose**: Prepare RC Factory Phase 10B for autonomous SpecKit execution by adding deterministic repo-artifact drift guards that emit one narrow cleanup recommendation per finding after SPEC-010B proved real two-product-line behavior.

---

## How to Use This Workflow

1. Run `$speckit-autopilot docs/ai/specs/.process/SPEC-012B-workflow.md` from the `012b-harness-gardening-guards` worktree.
2. Keep CONTRACT artifacts under `specs/012b-harness-gardening-guards/`.
3. Keep scaffold/process exhaust artifacts under `.process/` paths.
4. Preserve this workflow as the execution ledger. Do not run implementation directly from `main`.
5. This setup stops before autopilot; all phase rows below start as pending.

---

## Design Concept

This workflow file was enriched from a Grill Me interview run during `$speckit-scaffold-spec`. The full Q&A log, Goals, Non-goals, and Open Questions live at:

```text
docs/ai/specs/.process/SPEC-012B-design-concept.md
```

Re-read it before each phase if you need to disambiguate a prompt. The Specify and Clarify prompts below were populated from that interview, so the Design Concept doc is the source of truth for setup-time scoping decisions captured during the human interview.

> **Note:** Grill Me is human-in-the-loop only. It is not part of the autopilot loop. Once autopilot begins, clarifications happen via `/speckit-clarify` and the consensus protocol, never via grill-me.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Scaffold | `$speckit-scaffold-spec SPEC-012B` | Complete | Branch, worktree, reviewability preset, design concept, workflow, and roadmap setup status created |
| Specify | `$speckit-specify` | Complete | Generated `spec.md` and requirements checklist; G1 passed with 0 clarification markers |
| Clarify | `$speckit-clarify` | Complete | Five sessions resolved schema, taxonomy, thresholds, ownership, fixtures, dedupe, scope, cleanup, and guardrails boundaries; G2 passed |
| Plan | `$speckit-plan` | Pending | Plan repo-artifact-only guard scripts, fixture corpus, package/guardrail wiring, and no-runtime boundary |
| Checklist | `$speckit-checklist` | Pending | Suggested domains: data-integrity, docs-integrity, guardrail-integration, error-handling, testing-strategy, scope-control |
| Tasks | `$speckit-tasks` | Pending | Generate TDD-first tasks for fixture RED tests, schemas, guard implementation, package scripts, docs, and verification |
| Analyze | `$speckit-analyze` | Pending | Check drift between roadmap, Design Concept, spec, plan, tasks, and external-context gates |
| Implement | `$speckit-implement` | Pending | Execute only after G1-G6 pass and scope ownership is still process/tooling only |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After scaffold | Branch is `012b-harness-gardening-guards`; design concept and workflow are committed; reviewability preset resolves; roadmap marks SPEC-012B `In Progress` on this branch only |
| G1 | After Specify | Requirements cover the roadmap drift classes, recommendation-only default behavior, repo-artifact-only truth, owner metadata, hard/warning policy, and no runtime mutation; no unresolved `[NEEDS CLARIFICATION]` markers remain |
| G2 | After Clarify | Recommendation schema, failure taxonomy, freshness thresholds, fixture corpus, dedupe identity, and package command names are closed or explicitly deferred |
| G3 | After Plan | Architecture is process/tooling-only: guard scripts, fixtures, recommendation schema/template, docs/checklist updates, package/guardrail wiring, and tests; no runtime source behavior, migration, UI, scheduler, dispatch, harness adapter, live GitHub write, or auto task creation |
| G4 | After Checklist | All `[Gap]` findings from required domains are remediated without widening into runtime/live-state inspection |
| G5 | After Tasks | Tasks are ordered, reviewable, TDD-first for guard behavior, and keep `specs/**` cleanup recommendation-only |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; design concept, roadmap, spec, plan, tasks, fixtures, and workflow agree on repo-artifact-only guard execution |
| G7 | During Implement | Focused guard fixtures, JSON output checks, package scripts, guardrails suite, knowledge-index compatibility, and docs verification all pass |

---

## Prerequisites

### Constitution Validation

Before starting any workflow phase, verify alignment with `.specify/memory/constitution.md`:

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| I. Zero-Regression Contract | Process/tooling changes must not affect runtime behavior or flag-off app behavior | Static scope review confirms no runtime source, migrations, UI, scheduler, dispatch, sandbox, adapter, or harness behavior unless a phase explicitly blocks |
| II. Install Compatibility And Operational Impact Discipline | SPEC-012B is process/tooling only and must not change existing installs | Plan and tasks classify changes as docs/scripts/fixtures/package wiring only |
| IV. Test-First Development | Guard behavior changes start with failing fixture tests | Tasks require RED tests for each supported drift class before implementation |
| V. Feature-Flag Resolution Discipline | Guard reads checked-in feature-flag docs/metadata only; no runtime inline flag checks are added | Static search and guardrails prove no runtime `process.env.FEATURE_*` behavior entered v1 |
| XV. Spec Artifact Provenance | Design concept, workflow, recommendation reports, and fixture evidence remain durable | `.process` artifact paths and fixture/report paths are recorded |
| XVI. Reviewability And Verification Debt Control | Scope remains reviewable, split decisions are explicit, and drift findings create narrow remediation work | Reviewability gate result below is preserved; recommendation schema emits one cleanup task payload per stable finding |

**Constitution Check:** Verified for G1 on 2026-06-06; scope remains process/tooling-only and no runtime behavior, migrations, UI, scheduler, dispatch, sandbox, adapter, or harness behavior entered the Specify artifact.

### Reviewability Gate

Setup ran:

```bash
/Users/fredrickgabelmann/.codex/plugins/cache/racecraft-plugins-public/speckit-pro/2.7.0/skills/speckit-autopilot/scripts/reviewability-gate.sh setup docs/ai/rc-factory-technical-roadmap.md
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

Decision: setup may proceed under the existing transition exception, but every downstream phase must keep actual implementation to SPEC-012B strict scope: guard scripts, fixtures, cleanup recommendation schema/template, docs/checklist updates, package/guardrail wiring, and tests only.

### Reviewability Preset

The setup command refreshed the generic reviewability preset and verified template resolution:

```bash
specify preset resolve spec-template
specify preset resolve plan-template
specify preset resolve tasks-template
```

Each command resolved to `.specify/presets/speckit-pro-reviewability/templates/`.

### External Context Gate

Before Specify or Plan, fetch current primary-source context and record retrieval evidence in the relevant phase results:

- OpenAI Harness Engineering article
- OpenAI Symphony announcement and SPEC

Use the external context only to validate vocabulary and safety posture. The v1 guard taxonomy and execution path must remain repo-artifact-only, per Design Concept Q8.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec ID | SPEC-012B |
| Name | Harness-Gardening Drift Guards |
| Branch | `012b-harness-gardening-guards` |
| Feature directory | `specs/012b-harness-gardening-guards` |
| Dependencies | SPEC-010B, SPEC-012A |
| Enables | Later cleanup specs |
| Priority | P1 |
| Scope source | Phase 10B - Harness-gardening drift guards |
| Acceptance criteria source | Phase 10B Acceptance Criteria |
| Tool count / names | N/A - process/tooling spec |

### Roadmap Scope

Add narrow cleanup-task generation and drift checks after two product lines exist: stale PRD/roadmap/workflow claims, missing evidence, stale feature-flag status, low-value tests, strict-scope drift, and broken source-of-truth links.

### Strict Scope

Allowed:

- Guard scripts and deterministic JSON/Markdown report generation.
- Checked-in fresh/stale fixture corpus, including reduced historical drift patterns.
- Cleanup recommendation schema/template with canonical Paddock cleanup-task payloads and optional GitHub issue export fields.
- Package scripts and `pnpm guardrails` suite wiring.
- Documentation, checklist, and repo-knowledge updates required for discoverability.
- Tests for each supported drift class, warning/failure policy, stable dedupe IDs, owner derivation, and `specs/**` cleanup recommendations.

Forbidden:

- Runtime product behavior.
- Database migrations.
- UI or API endpoints.
- Scheduler, dispatch, task-chain, claim, retry, sandbox, harness adapter, or auto-merge behavior.
- Live GitHub writes or Paddock task creation.
- Live HAL, GitHub, deployment, DB, or service validation in default guard execution.
- Automatic removal of `specs/**` source folders.
- Subjective broad test-quality scoring.

### Design Concept Decisions

- Q1: Guard output is recommendation-only by default; no live Paddock or GitHub mutation.
- Q2: V1 supports exactly the roadmap drift classes.
- Q3: Guard output is deterministic JSON plus local/CI report artifacts.
- Q4: CI fails only on hard repo-owned drift; lower-confidence cleanup signals warn.
- Q5: Each finding emits one canonical Paddock cleanup-task payload, plus optional GitHub issue export fields.
- Q6: Sources of truth are checked-in repo artifacts only.
- Q7: Dedupe uses stable IDs from `drift_class + source_path + anchor + owner`.
- Q8: Fresh external-context retrieval is a workflow gate, but the guard remains repo-artifact-only.
- Q9: Fixture corpus uses small synthetic docs/JSON plus reduced historical drift examples.
- Q10: Strict scope is scripts, fixtures, schema/template, docs/checklists, package wiring, and tests.
- Q11: Owner metadata comes from `docs/ai/repo-knowledge-index.json`, then roadmap/spec family conventions, with `owner: unknown` as warning.
- Q12: Add a focused guard command and wire it into `pnpm guardrails`; do not replace `pnpm knowledge:index:check`.
- Q13: Low-value test detection is deterministic only.
- Q14: Detect `specs/**` cleanup eligibility, but never remove folders.
- Q15: Stale evidence uses repo-owned metadata and configurable thresholds.

### Success Criteria Summary

- [ ] A guard can detect every supported drift class from checked-in fixture inputs.
- [ ] Every finding has a stable deterministic ID and deterministic sort order.
- [ ] Every finding emits one narrow cleanup recommendation with owner metadata and a canonical Paddock cleanup-task payload.
- [ ] Optional GitHub issue export fields are present without live GitHub mutation.
- [ ] Hard repo-owned drift fails CI; lower-confidence signals produce warnings and recommendations.
- [ ] Guard output can be produced as JSON for automation and as a local/CI report for review.
- [ ] `pnpm guardrails` includes the focused SPEC-012B suite without replacing `pnpm knowledge:index:check`.
- [ ] `specs/**` cleanup is recommendation-only and preserves the archive extension `--apply-cleanup` safe-base gate.

---

## Phase 1: Specify

**When to run:** At the start of the feature specification. Focus on WHAT and WHY, not implementation details. Output: `specs/012b-harness-gardening-guards/spec.md`.

### Specify Prompt

```bash
/speckit-specify

## Feature: SPEC-012B - Harness-Gardening Drift Guards

### Problem Statement
Paddock now has repo-local knowledge truth from SPEC-012A and real two-product-line behavior from SPEC-010B. The repo still depends on humans noticing stale PRD, roadmap, workflow, feature-flag, evidence, strict-scope, source-link, and low-value-test drift. SPEC-012B must turn these recurring drift patterns into deterministic guard findings and narrow cleanup recommendations so future specs repair one precise issue at a time instead of broad rewrites.

### Users
- Autonomous coding agents that need deterministic drift findings before starting or closing out a spec.
- Human operators reviewing whether repo-owned docs, evidence, and guard metadata are current enough to drive autonomous work.
- Future cleanup-spec implementers that need canonical Paddock cleanup-task payloads and optional GitHub issue exports without live mutation in v1.

### Required Behavior
- Add a repo-artifact-only harness-gardening guard for these v1 drift classes: stale PRD/roadmap/workflow claims, missing evidence, stale feature-flag status, low-value tests, strict-scope drift, and broken source-of-truth links.
- Use checked-in repo artifacts as truth: PRD, roadmap, workflow ledgers, `.specify/memory`, specs, repo knowledge index, package scripts, guardrail config, and fixtures.
- Emit deterministic JSON and a local/CI report containing one narrow cleanup recommendation per stable finding.
- Define stable finding IDs from `drift_class + source_path + anchor + owner`; sort deterministically and dedupe to one active recommendation per stable ID.
- Each finding must include owner metadata derived from `docs/ai/repo-knowledge-index.json` when possible, then roadmap/spec family conventions; missing owner is a warning.
- Each finding must include a canonical Paddock cleanup-task payload and optional GitHub issue export fields.
- Fail CI only for high-confidence repo-owned hard drift: broken required links, stale status pointers, strict-scope drift, or missing required evidence.
- Emit warnings and recommendations for lower-confidence cleanup signals such as deterministic low-value test patterns.
- Add configurable guard constants for repo-owned evidence staleness thresholds based on `last_verified`, workflow closeout dates, status pointers, and explicit evidence markers.
- Add a checked-in fixture corpus with small synthetic fresh/stale docs and JSON plus reduced historical drift patterns.
- Add a focused package command and wire the focused suite into `pnpm guardrails` without replacing `pnpm knowledge:index:check`.
- Detect `specs/**` cleanup eligibility as a recommendation only; never remove folders and never bypass archive `--apply-cleanup` safe-base gating.
- Before Specify or Plan, retrieve current OpenAI Harness Engineering and Symphony sources and record retrieval evidence, but do not make external fetching part of default guard execution.

### Constraints
- Process/tooling spec only.
- No runtime product behavior, migrations, UI, API endpoint, scheduler, dispatch, claim/retry, sandbox, harness adapter, live GitHub write, live Paddock task creation, or auto-merge.
- No live HAL/GitHub/deployment/database/service validation in v1 unless represented by checked-in evidence.
- No subjective broad test-quality scoring.
- Preserve SPEC-012A as the owner of `pnpm knowledge:index:check`; SPEC-012B adds a focused guardrail suite.
- Design Concept source of truth: `docs/ai/specs/.process/SPEC-012B-design-concept.md`.

### Acceptance Criteria
Use the Phase 10B roadmap acceptance criteria plus the Success Criteria Summary in this workflow.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 18 |
| User Stories | 3 |
| Acceptance Criteria | 9 |

### Files Generated

- [x] `specs/012b-harness-gardening-guards/spec.md`
- [x] `specs/012b-harness-gardening-guards/checklists/requirements.md`

### G1 Validation

- `validate-gate.sh G1 specs/012b-harness-gardening-guards`: pass.
- `count-markers.sh all specs/012b-harness-gardening-guards`: 0 gaps, 0 clarifications, 0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW.
- External-context evidence recorded in `spec.md`: Harness Engineering article, Symphony announcement, and Symphony SPEC retrieved on 2026-06-06.

---

## Phase 2: Clarify

**When to run:** After Specify if any ambiguity remains. Use targeted sessions and do not reopen the settled Grill Me decisions unless a contradiction is found.

### Clarify Prompts

#### Session 1: Recommendation Schema And Outputs

```bash
/speckit-clarify

Focus on SPEC-012B recommendation schema and outputs:
- Define `harness_gardening_recommendation.v1` fields.
- Define the canonical Paddock cleanup-task payload shape.
- Define optional GitHub issue export fields without live GitHub mutation.
- Define JSON output and local/CI report paths.
- Preserve one recommendation per stable finding ID.
```

#### Session 2: Drift Taxonomy And Failure Policy

```bash
/speckit-clarify

Focus on SPEC-012B drift classes and CI policy:
- For stale PRD/roadmap/workflow claims, missing evidence, stale feature-flag status, low-value tests, strict-scope drift, and broken source-of-truth links, classify hard failure versus warning.
- Identify exact repo-owned signals for hard drift.
- Keep lower-confidence cleanup signals advisory.
- Define sanitized error categories for unreadable/malformed fixture or repo artifacts.
```

#### Session 3: Evidence Freshness And Owner Metadata

```bash
/speckit-clarify

Focus on evidence freshness and ownership:
- Define configurable thresholds for `last_verified`, workflow closeout dates, status pointers, and explicit evidence markers.
- Define owner derivation order from `docs/ai/repo-knowledge-index.json`, roadmap/spec family conventions, and `owner: unknown` warning fallback.
- Define how stale or missing owner metadata affects CI outcome.
```

#### Session 4: Fixtures, Dedupe, And Historical Patterns

```bash
/speckit-clarify

Focus on fixture strategy and dedupe:
- Define the fixture directory layout.
- Select reduced historical drift patterns to encode without depending on the live repo as the primary oracle.
- Define stable finding ID components: drift class, source path, anchor, owner.
- Define deterministic sort order and duplicate suppression.
```

#### Session 5: Scope Control And Archive Cleanup Boundary

```bash
/speckit-clarify

Focus on scope boundaries:
- Confirm no runtime behavior, migrations, UI, API endpoint, scheduler, dispatch, harness adapter, live GitHub write, live Paddock task creation, or auto-merge enters SPEC-012B.
- Define `specs/**` cleanup eligibility recommendations without deletion.
- Preserve archive extension `--apply-cleanup` safe-base gating.
- Confirm `pnpm guardrails` integration does not replace `pnpm knowledge:index:check`.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Recommendation schema and outputs | 5 | Accepted deterministic recommendation envelope, non-mutating Paddock cleanup-task import draft, export-only GitHub issue draft, report paths, and normalized stable finding IDs |
| 2 | Drift taxonomy and failure policy | 5 | Accepted hard/warning severity matrix, explicit repo-owned hard signals, stale feature-flag contradiction policy, warning-only cleanup signals, and sanitized diagnostics enum |
| 3 | Evidence freshness and owner metadata | 5 | Accepted freshness threshold override/default policy, `--as-of` determinism, status-pointer authority, owner derivation order, unknown-owner warning fallback, and closed evidence marker set |
| 4 | Fixtures, dedupe, and historical patterns | 5 | Accepted SPEC-012B fixture layout, reduced historical drift fixture set, stable finding tuple normalization, deterministic sort/dedupe rules, and no cross-run persistence in v1 |
| 5 | Scope control and archive cleanup boundary | 5 | Accepted process/tooling-only scope, `specs/**` cleanup as recommendation-only, archive `--apply-cleanup` gate preservation, guardrails integration without replacing SPEC-012A, and offline repo-artifact-only guard execution |

### Consensus Resolution Log

| Phase Item | Round | Routed Categories | Outcome | Analysts Used |
|------------|-------|-------------------|---------|---------------|
| Clarify Session 1 Q3 GitHub issue export fields | 1 | security, domain | Export-only create-issue draft accepted with fixed `export_only: true` and `live_mutation: false`; `repository` is an export target, optional GitHub fields are proposed metadata only, and v1 performs no GitHub/Paddock mutation | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 2 Q5 sanitized diagnostics | 1 | security | Closed `harness_gardening_error_code.v1` enum accepted; required inputs, fixture expectation mismatches, and unsafe fixture paths fail CI; optional detector inputs warn with `detector_status: "skipped_detector"` and reports omit raw contents, absolute paths, stack traces, env values, tokens, and secrets | codebase-analyst, spec-context-analyst, domain-researcher |
| Clarify Session 3 Q1 freshness thresholds | 1 | spec, codebase | Explicit `freshness.stale_after_days` overrides defaults; absent thresholds use 2-day status pointers, 7-day active workflow evidence, 30-day execution/QA/contract/operator/rollback docs, and 45-day durable intent; `--as-of` required for deterministic tests and freshness-only staleness warns only | codebase-analyst, spec-context-analyst |

### G2 Validation

- `validate-gate.sh G2 specs/012b-harness-gardening-guards`: pass.
- `count-markers.sh all specs/012b-harness-gardening-guards`: 0 gaps, 0 clarifications, 0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW.

---

## Phase 3: Plan

**When to run:** After spec is finalized. Output: `specs/012b-harness-gardening-guards/plan.md`.

### Plan Prompt

```bash
/speckit-plan

## Tech Stack
- Language/runtime: Node.js >=22 scripts using built-in modules where practical.
- Repository baseline: Next.js 16 App Router, React 19, TypeScript 5.7 strict, SQLite via better-sqlite3, Tailwind CSS 3, Vitest, Playwright, pnpm.
- Expected implementation surface: repo guard scripts, JSON schemas/fixtures, package scripts, guardrail wiring, docs/checklist updates, and tests.
- Storage: checked-in JSON/Markdown fixture and report artifacts only; no SQLite migration or runtime persistence.
- Testing: fixture-backed Vitest or Node test coverage, package-script checks, `pnpm guardrails`, `pnpm knowledge:index:check`, and `git diff --check`.

## External Context Gate
- Fetch current OpenAI Harness Engineering and Symphony primary sources before finalizing Plan.
- Record retrieval date, URLs, and how the sources affect vocabulary or safety posture.
- Do not import live fetching into the default v1 guard execution path.

## Constraints
- Process/tooling-only implementation.
- Repo-artifact-only guard truth.
- Recommendation-only default behavior.
- No runtime source behavior, migrations, UI, API endpoint, scheduler, dispatch, claim/retry, sandbox, harness adapter, live GitHub write, live Paddock task creation, or auto-merge.
- No automatic `specs/**` cleanup.
- Low-value test detection must use explicit deterministic patterns only.

## Architecture Notes
- Treat `docs/ai/specs/.process/SPEC-012B-design-concept.md` as the setup decision source of truth.
- Reuse SPEC-012A patterns for repo knowledge validation, fixture-driven checks, warning/failure classes, and package command discoverability.
- Add a focused harness-gardening guard command and wire it into `pnpm guardrails` as a separate suite.
- Define a stable recommendation schema that can support a future explicit apply mode without adding mutation in v1.
- Use stable finding IDs derived from `drift_class + source_path + anchor + owner`.
- Derive owner metadata from `docs/ai/repo-knowledge-index.json` first, then roadmap/spec family conventions.
- Keep generated/local reports under deterministic process/report paths and keep CONTRACT artifacts under `specs/012b-harness-gardening-guards/`.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Pending | Technical context, constitution gates, strict scope, and guard architecture |
| `research.md` | Pending | External-context retrieval evidence plus decisions for schema, fixtures, thresholds, and command integration |
| `data-model.md` | Pending | Finding, recommendation, owner, severity, and report entities |
| `contracts/` | Pending | JSON recommendation/report schema and CLI output contract |
| `quickstart.md` | Pending | Local guard run, fixture run, CI/guardrails run, and report review flow |

---

## Phase 4: Domain Checklists

**When to run:** After `/speckit-plan`; validate spec and plan together. Run focused domains and remediate all `[Gap]` markers before tasks.

### Checklist Domain Suggestions

```bash
/speckit-checklist data-integrity
/speckit-checklist docs-integrity
/speckit-checklist guardrail-integration
/speckit-checklist error-handling
/speckit-checklist testing-strategy
/speckit-checklist scope-control
```

### Checklist Results

| Domain | Status | Findings | Notes |
|--------|--------|----------|-------|
| data-integrity | Pending | Pending | Finding IDs, dedupe, severity, and owner metadata |
| docs-integrity | Pending | Pending | PRD/roadmap/workflow/source-link/evidence drift |
| guardrail-integration | Pending | Pending | Package scripts, `pnpm guardrails`, and `knowledge:index` compatibility |
| error-handling | Pending | Pending | Malformed repo artifacts, missing metadata, unknown owner, and warning/failure handling |
| testing-strategy | Pending | Pending | Fixture corpus, historical patterns, and low-value test determinism |
| scope-control | Pending | Pending | No runtime/live mutation and archive cleanup boundary |

---

## Phase 5: Tasks

**When to run:** After checklists pass. Output: `specs/012b-harness-gardening-guards/tasks.md`.

### Tasks Prompt

```bash
/speckit-tasks

Generate dependency-ordered, TDD-first tasks for SPEC-012B using:
- `docs/ai/specs/.process/SPEC-012B-design-concept.md`
- `docs/ai/specs/.process/SPEC-012B-workflow.md`
- `specs/012b-harness-gardening-guards/spec.md`
- `specs/012b-harness-gardening-guards/plan.md`
- `specs/012b-harness-gardening-guards/research.md`
- `specs/012b-harness-gardening-guards/data-model.md`
- `specs/012b-harness-gardening-guards/contracts/`
- completed checklists

Required task properties:
- Start with RED fixture tests for each supported drift class.
- Include tests for hard failure versus warning policy.
- Include tests for stable finding IDs, deterministic sort, dedupe, owner derivation, and JSON schema validation.
- Include tests that `specs/**` cleanup is recommendation-only and never deletes source folders.
- Include package-script and `pnpm guardrails` integration tasks.
- Include compatibility checks with `pnpm knowledge:index:check`.
- Include static/scope guard tasks proving no runtime behavior, migrations, UI, API endpoint, scheduler, dispatch, claim/retry, sandbox, harness adapter, live GitHub write, live Paddock task creation, or auto-merge behavior.
- Keep low-value test detection deterministic and fixture-backed only.
```

### Task Coverage Expectations

| Area | Required Coverage |
|------|-------------------|
| Drift classes | Stale PRD/roadmap/workflow claims, missing evidence, stale feature-flag status, low-value tests, strict-scope drift, broken source-of-truth links |
| Outputs | JSON output, local/CI report, Paddock cleanup-task payload, optional GitHub issue export fields |
| Policy | Hard failure versus warning, unknown owner warning, malformed artifact errors |
| Dedupe | Stable IDs, deterministic sorting, one recommendation per stable finding |
| Scope | Repo-artifact-only guard, no runtime/live mutation, archive cleanup recommendation-only |
| Integration | Focused command, `pnpm guardrails`, `pnpm knowledge:index:check` compatibility |

### Task Results

| Item | Status | Evidence |
|------|--------|----------|
| Task list | Pending | Pending |
| Task ordering | Pending | Pending |
| Reviewability | Pending | Pending |

---

## Phase 6: Analyze

**When to run:** After Tasks, before Implement.

### Analyze Prompt

```bash
/speckit-analyze

Analyze SPEC-012B across:
- `docs/ai/specs/.process/SPEC-012B-design-concept.md`
- `docs/ai/specs/.process/SPEC-012B-workflow.md`
- `docs/ai/rc-factory-technical-roadmap.md`
- `docs/ai/repo-knowledge-index.json`
- `.specify/memory/{spec,plan,changelog}.md`
- `specs/012b-harness-gardening-guards/spec.md`
- `specs/012b-harness-gardening-guards/plan.md`
- `specs/012b-harness-gardening-guards/tasks.md`
- generated research, data model, contracts, quickstart, and checklists

Focus on:
1. Drift from Grill Me decisions Q1-Q15.
2. Any task or requirement that creates live Paddock tasks, writes GitHub issues, modifies runtime behavior, adds migrations, adds UI/API endpoints, scheduler integration, dispatch changes, harness adapter work, live-state checks, or auto-merge behavior.
3. Any missing coverage for one of the roadmap drift classes.
4. Any hard/warning policy that makes subjective low-value-test scoring a CI blocker.
5. Any missing stable finding ID, owner metadata, dedupe, deterministic sorting, or one-recommendation-per-finding guarantee.
6. Any `specs/**` cleanup behavior that removes folders or bypasses archive `--apply-cleanup`.
7. Any replacement of `pnpm knowledge:index:check` rather than focused guardrails integration.
8. Any failure to record fresh external-context retrieval evidence before Specify/Plan.
9. Any workflow or generated artifact path that ignores `.process` scaffold placement.

G6 passes only with zero CRITICAL/HIGH findings after remediation.
```

### Analyze Results

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | Pending | Pending |
| HIGH | Pending | Pending |
| MEDIUM | Pending | Pending |
| LOW | Pending | Pending |

---

## Phase 7: Implement

**When to run:** After G6 passes and tasks are approved.

### Implement Prompt

```bash
/speckit-implement

Implement SPEC-012B from `specs/012b-harness-gardening-guards/tasks.md`.

Before editing:
- Re-read `docs/ai/specs/.process/SPEC-012B-design-concept.md`.
- Re-read `specs/012b-harness-gardening-guards/plan.md`.
- Confirm tasks are TDD-first and fixture-backed.
- Confirm no task asks for runtime product behavior, migrations, UI/API endpoints, scheduler, dispatch, claim/retry, sandbox, harness adapter, live GitHub write, live Paddock task creation, auto-merge, or automatic `specs/**` cleanup.

During implementation:
- Write RED tests first for every production guard behavior change.
- Keep guard execution repo-artifact-only.
- Keep live external/HAL/GitHub state out of the default guard.
- Preserve `pnpm knowledge:index:check`.
- Wire the focused suite into `pnpm guardrails`.
- Emit deterministic JSON and local/CI report evidence.
```

### Expected Verification

- Focused fixture tests for SPEC-012B guard behavior.
- JSON schema/output validation for recommendations.
- `pnpm knowledge:index:check`.
- `pnpm guardrails -- --suite repo-knowledge-index`.
- New focused guardrails suite command for SPEC-012B.
- Full `pnpm guardrails` if scope changes guardrail wiring.
- `pnpm typecheck` and `pnpm lint` if TypeScript/config changes.
- `git diff --check`.
- Scope/static checks proving no forbidden runtime/live-mutation surfaces.

### Implement Progress

| Area | Status | Evidence |
|------|--------|----------|
| Fixture RED tests | Pending | Pending |
| Recommendation schema and output | Pending | Pending |
| Drift detectors | Pending | Pending |
| Package and guardrails integration | Pending | Pending |
| Docs and discoverability | Pending | Pending |
| Final verification | Pending | Pending |

---

## Closeout Requirements

- Update this workflow with final phase results and evidence.
- Update `docs/ai/rc-factory-technical-roadmap.md` only after implementation evidence is complete and file ownership is clear.
- Update `.specify/memory/{spec,plan,changelog}.md` after merge/archive closeout.
- Do not apply archive cleanup or remove `specs/**` unless a later explicit safe-base `--apply-cleanup` run is requested and passes the archive gate.
- Push the branch and prepare a PR with the deterministic fixture matrix, guardrail wiring, hard/warning policy, and no-runtime-scope evidence.
