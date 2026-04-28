# SpecKit Workflow: SPEC-002A - Spec Archive and Evidence Retention

**Template Version**: 1.0.0
**Created**: 2026-04-28
**Purpose**: Prepare and execute the RC Factory Phase 1A process/tooling specification in Codex.

---

## How to Use This Workflow

This workflow was generated from the SpecKit Pro workflow template for the dedicated branch `002a-spec-archive-evidence`.

Run the remaining phases through `$speckit-autopilot` unless a human explicitly pauses the run:

```bash
$speckit-autopilot docs/ai/specs/SPEC-002A-workflow.md
```

Do not start SPEC-003 or later feature specs from this worktree. SPEC-002A stops after the archive/evidence policy, local and CI guards, workflow/constitution updates, validation, and roadmap bookkeeping are complete.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Complete | Existing `specs/002a-spec-archive-evidence/spec.md` is present with no unresolved clarification placeholders; rerun only if roadmap drift is found |
| Clarify | `$speckit-clarify` | Pending | Validate archive-extension adoption, screenshot retention limits, CI/local guard semantics, and post-merge cleanup boundaries |
| Plan | `$speckit-plan` | Pending | Generate implementation plan, update research as needed, define archive/manifest/guard architecture |
| Checklist | `$speckit-checklist` | Pending | Existing requirements checklist passed; run evidence-retention, ci-guard, supply-chain, and workflow-governance checklists after plan |
| Tasks | `$speckit-tasks` | Pending | Generate dependency-ordered tasks for policy docs, guard tests, CI wiring, and archive dry-run validation |
| Analyze | `$speckit-analyze` | Pending | Verify artifacts do not delete source specs silently, weaken UI evidence gates, or leave adoption decisions unresolved |
| Implement | `$speckit-implement` | Pending | Execute tasks with focused tests and full verification before PR creation |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Open File Hygiene

Applies to every remaining Clarify, Plan, Checklist, Tasks, Analyze, Implement, and Post step:

- Use bounded `rg` and targeted file reads instead of broad repository scans unless the step explicitly requires discovery.
- Do not leave subagents, dev servers, Playwright servers, MCP helper processes, or long-running shell sessions open after a step returns.
- If a step starts helper processes, close them before returning and report anything that could not be closed.
- If `Too many open files` appears, pause the phase, close stale helpers, and restart from the latest generated artifact state.

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G1 | After Specify | SPEC-002A scope covers archive decision, evidence traceability, screenshot policy, CI/local guard behavior, no silent cleanup, and no unresolved `[NEEDS CLARIFICATION]` markers |
| G2 | After Clarify | Adoption path, manifest format, retention limits, PR evidence requirements, and cleanup boundaries are explicit enough for planning |
| G3 | After Plan | Constitution gates pass; plan identifies exact files, scripts, workflows, guard fixtures, and archive dry-run approach |
| G4 | After Checklist | All evidence-retention, ci-guard, supply-chain, and workflow-governance gaps are resolved |
| G5 | After Tasks | P1A-AC1 through P1A-AC7 have task coverage and tasks are dependency-ordered |
| G6 | After Analyze | No CRITICAL/HIGH findings; generated tasks do not drift into SPEC-003 runtime behavior |
| G7 | After Implement | Archive dry-run, screenshot guard positive/negative paths, docs/template updates, and full repo verification pass |

---

## Prerequisites

### Constitution Validation

Before starting any remaining phase, verify alignment with `.specify/memory/constitution.md` and the current roadmap.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| Zero-regression contract | SPEC-002A is process/tooling only and must not change Mission Control runtime behavior | Focused tests for any new scripts plus `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`; run e2e only if touched workflow code requires it |
| Real UI Journey Quality Gate | Human screenshot review remains mandatory for UI journey changes; SPEC-002A may reduce committed binaries but must not weaken review evidence | Guard and docs require PR-accessible Argos, CI artifact, or curated manifest evidence for UI journey specs |
| Archive/evidence discipline | Durable memory, source spec artifacts, ephemeral CI artifacts, and permanent curated evidence are distinct classes | Constitution, workflow docs, and generated spec artifacts define the classes and enforcement path |
| No silent destructive cleanup | Source spec folders and screenshots are never deleted or moved automatically by post-merge CI | Archive command dry-run reports cleanup recommendations; cleanup must be an explicit reviewed change |
| Supply-chain hygiene | `spec-kit-archive` is not adopted blindly; any extension integration is pinned and license-reviewed | Research records repository URL, license, pinned tag or commit, install mode, and any local modifications |
| Package manager | Use pnpm for repo verification | Lockfile is `pnpm-lock.yaml`; use `pnpm` commands only |

**Constitution Check:** Pending for Plan. Baseline source artifacts exist: `specs/002a-spec-archive-evidence/spec.md`, `research.md`, `checklists/requirements.md`, and this workflow.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-002A |
| Name | Spec Archive and Evidence Retention |
| Branch | `002a-spec-archive-evidence` |
| Dependencies | SPEC-002 |
| Enables | SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009, SPEC-010 |
| Priority | P1 |
| Tool count / tool names | N/A; this is a process/tooling spec |
| Tool metadata | `tools: []` |
| Strict Scope | `.specify` archive integration and hooks, SpecKit workflow docs/templates, screenshot/evidence manifest conventions, CI/local guards for `specs/**/screenshots`, and PR evidence guidance. No runtime product feature behavior ships in this spec. |
| Status Authority | Roadmap + this workflow are execution-status authority; PRD phase tables are durable summary notes only |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |

### Scope Summary

Implement the RC Factory Phase 1A archive/evidence policy:

- Validate `stn1slv/spec-kit-archive` against this repo's SpecKit tooling and record whether Mission Control adopts, vendors, forks, or rejects it.
- If adopted, pin a release tag or commit and preserve repository URL, license, version, and local modification metadata.
- Provide a local and CI-safe archive dry-run path against `specs/002-product-line-switcher`.
- Produce an archive report that preserves source paths, PR URL, CI run URL, merge commit, screenshot evidence, conflicts, and durable memory recommendations.
- Define artifact classes: source-of-truth spec artifacts, durable memory summaries, ephemeral CI artifacts, and permanent curated evidence exceptions.
- Define a screenshot/evidence manifest convention for UI journey evidence, including hashes, artifact names, CI/PR links, and source spec paths.
- Add a local and CI guard for committed screenshots under `specs/**/screenshots`, including failure for oversized or unmanifested fixtures and pass behavior for approved evidence or artifact-bundle-only paths.
- Update the constitution and workflow guidance so future specs inherit the archive/evidence policy.
- Preserve the Real UI Journey Quality Gate and block known UI journey defects from being hidden by archive cleanup.
- Do not delete or move existing spec folders automatically; any cleanup is an explicit reviewed change.

### Success Criteria Summary

- [ ] P1A-AC1: `specs/002a-spec-archive-evidence/spec.md`, research, requirements checklist, and workflow are present and contain no unresolved clarification placeholders.
- [ ] P1A-AC2: The implementation records an evidence-backed adoption decision for `spec-kit-archive`, including repository URL, license, pinned version/commit, and local modifications if any.
- [ ] P1A-AC3: An archive dry-run against `specs/002-product-line-switcher` completes without deleting or moving source spec files and reports durable memory changes plus screenshot evidence.
- [ ] P1A-AC4: CI and a local command fail on an intentionally oversized or unmanifested committed screenshot fixture and name the offending path.
- [ ] P1A-AC5: CI and a local command pass for approved SPEC-002 evidence or for an artifact-bundle-only path.
- [ ] P1A-AC6: The constitution and workflow docs state that committed screenshots are exceptions, ephemeral CI artifacts require PR-accessible links during review, and durable memory must retain enough provenance for later audit.
- [ ] P1A-AC7: Cleanup of spec folders or screenshots is never performed silently by post-merge CI; any cleanup is proposed as an explicit reviewed change.

---

## Phase 1: Specify

**When to run:** Already complete unless the roadmap has drifted. Output: `specs/002a-spec-archive-evidence/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-002A Spec Archive and Evidence Retention

Create or reconcile the specification for RC Factory Phase 1A in Mission Control.

### Problem Statement

SPEC-002 introduced real UI journey evidence and long-lived SpecKit artifacts. Before SPEC-003 and later feature specs generate more evidence, Mission Control needs a repository policy that preserves durable implementation knowledge, keeps screenshot review evidence auditable, and prevents unbounded committed binary growth under `specs/`.

### Users

- Maintainer: needs durable post-merge memory that summarizes what shipped without keeping every generated artifact forever.
- Reviewer: needs PR-accessible screenshot or visual-review evidence for UI journeys.
- Future SpecKit executor: needs workflow and constitution guidance before starting SPEC-003 or later specs.
- Operator/auditor: needs enough provenance to trace a future claim back to PR, CI, commit, and source spec artifacts.

### User Stories

- US1: As a maintainer, I can dry-run an archive flow against `specs/002-product-line-switcher` and see exactly what durable memory and evidence records would be produced.
- US2: As a reviewer, I can inspect screenshot evidence through Argos, CI artifacts, PR links, or curated manifest-backed images without requiring every generated screenshot to stay committed.
- US3: As a future SpecKit executor, I can start SPEC-003 with clear archive/evidence policy, screenshot retention limits, and post-merge cleanup boundaries.

### Functional Requirements

- Evaluate `stn1slv/spec-kit-archive` as the default archival mechanism and document adopt/vendor/fork/reject.
- If adopted, pin a tag or commit and record upstream URL, license, version, install mode, and local modifications.
- Preserve traceability from durable memory to source spec path, PR URL, merge commit, CI run, and screenshot evidence.
- Never delete or move source feature spec files automatically.
- Define artifact classes for source-of-truth spec files, durable memory summaries, ephemeral CI artifacts, and permanent curated evidence.
- Define committed screenshot count and size limits under `specs/**/screenshots`.
- Add CI and local guard behavior for oversized or unmanifested committed screenshots.
- Require PR evidence links for new or changed UI journeys covered by Playwright.
- Preserve Storybook + Argos as preferred visual-review surfaces when applicable.
- Update constitution and workflow docs/templates with the archive/evidence policy.
- Provide local and CI-runnable verification for the archive guard and any adopted archive command.
- Stop for human decision on constitution conflicts, requirement collisions, or destructive cleanup decisions.
- Keep durable memory sufficient for future reviewers to understand what shipped, how it was validated, and where original artifacts lived.

### Constraints

- Process/tooling only: no runtime Mission Control product behavior ships in SPEC-002A.
- Do not weaken the Real UI Journey Quality Gate.
- Do not rewrite git history.
- Do not rely on post-merge CI silently mutating `main`.
- Keep committed screenshots as explicit, small, manifest-backed exceptions.
- Use `pnpm` for verification.

### Out of Scope

- Implementing SPEC-003 Aegis refactor or any later runtime feature spec.
- Deleting or moving existing SPEC-002 source spec files automatically.
- Treating GitHub Actions artifact retention as the only durable historical record.
- Replacing human screenshot review with a purely textual archive summary.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 15 |
| User Stories | 3 |
| Acceptance Criteria | 7 P1A criteria from roadmap |

### Files Generated

- [x] `specs/002a-spec-archive-evidence/spec.md`
- [x] `specs/002a-spec-archive-evidence/research.md`
- [x] `specs/002a-spec-archive-evidence/checklists/requirements.md`

### Traceability Markers

| Marker | Purpose |
|--------|---------|
| US1 | Archive completed spec knowledge |
| US2 | Keep human screenshot review without repository bloat |
| US3 | Enforce archive policy before later specs start |
| FR-001..FR-015 | SPEC-002A functional requirements |
| P1A-AC1..P1A-AC7 | Roadmap acceptance criteria |

---

## Phase 2: Clarify

**When to run:** Start autopilot here unless Specify drift is found. Use a maximum of five targeted questions per session and encode answers back into the spec.

### Clarify Prompts

#### Session 1: Archive Extension and Supply Chain

```bash
$speckit-clarify

Focus on the `spec-kit-archive` adoption decision:
- Whether Mission Control should install, vendor, fork, or reject `stn1slv/spec-kit-archive`.
- What tag or commit must be pinned if adopted.
- How MIT license metadata and local modifications are recorded.
- Whether the archive command can run non-interactively in local and CI dry-run mode.
- What fallback path is required if the extension is incompatible or unavailable.
```

#### Session 2: Evidence Classes and Screenshot Retention

```bash
$speckit-clarify

Focus on archive/evidence classes:
- Source-of-truth spec artifacts versus durable memory summaries.
- Ephemeral CI artifacts versus permanent curated evidence exceptions.
- Screenshot count, size, hash, and manifest requirements under `specs/**/screenshots`.
- How Argos, Storybook, Playwright artifacts, PR links, and CI links satisfy human review evidence.
- How sensitive screenshots are redacted, excluded, or approved.
```

#### Session 3: Guard, Workflow, and Cleanup Boundaries

```bash
$speckit-clarify

Focus on enforcement and lifecycle boundaries:
- Local and CI commands for screenshot/evidence guards.
- Negative fixture behavior for oversized or unmanifested screenshots.
- Required future workflow-template and constitution text.
- PR evidence requirements before updating or merging UI journey specs.
- Explicit reviewed cleanup path after merge, with no silent deletion or history rewrite.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Archive extension and supply chain | Pending | Pending |
| 2 | Evidence classes and screenshot retention | Pending | Pending |
| 3 | Guard, workflow, and cleanup boundaries | Pending | Pending |

---

## Phase 3: Plan

**When to run:** After Clarify. Output: `specs/002a-spec-archive-evidence/plan.md` plus any supporting artifacts.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack

- App/runtime: Next.js 16, React 19, TypeScript 5, SQLite via better-sqlite3.
- Tooling: pnpm, Vitest, Playwright, GitHub Actions, SpecKit extensions under `.specify/extensions/`, project skills under `.agents/skills/`.
- Existing evidence exemplar: `specs/002-product-line-switcher` and PR #16 evidence recorded in `docs/ai/specs/SPEC-002-workflow.md`.
- Visual review surfaces: Argos Storybook, Argos Playwright visual builds, Docker-backed UI e2e artifacts, and PR evidence links.

## Constraints

- Process/tooling spec only; no runtime feature behavior.
- Keep source spec folders in place unless a later reviewed cleanup change is explicitly approved.
- Committed screenshots are exceptions and must be manifest-backed.
- Preserve the Real UI Journey Quality Gate.
- If network access is required to inspect or install `spec-kit-archive`, document the pinned result and provide a CI-safe fallback.
- Use `pnpm` commands only.

## Architecture Notes

- Prefer a small repository-native guard script plus CI workflow/check step over broad ad hoc shell logic.
- Locate durable archive policy in constitution and workflow/template docs, not only in a one-off SPEC-002A note.
- The guard should support both pass and fail fixtures so P1A-AC4 and P1A-AC5 are testable.
- The archive dry-run against `specs/002-product-line-switcher` must not delete or move source files.
- Any manifest format should be stable enough for future audits and easy to diff in PR review.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Pending | Technical context, execution flow, file layout |
| `research.md` | Draft exists | Must be refreshed if live extension evidence changes |
| `data-model.md` | Pending | Archive report, evidence manifest, policy entities if useful |
| `contracts/` | Pending | CLI/guard command contracts if useful |
| `quickstart.md` | Pending | Local verification and archive dry-run commands |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Run multiple checklist domains and resolve all gaps.

### Recommended Domains

| Domain | Why It Applies |
|---|---|
| `evidence-retention` | Core spec risk is preserving durable evidence without keeping every artifact forever |
| `ci-guard` | Acceptance requires local and CI guards with positive and negative behavior |
| `supply-chain` | Adoption of `spec-kit-archive` requires pinning, license review, and fallback behavior |
| `workflow-governance` | Constitution and future workflow docs/templates must inherit the policy |

### Checklist Prompts

#### 1. Evidence Retention Checklist

```bash
$speckit-checklist evidence-retention

Focus on SPEC-002A requirements:
- Artifact class definitions and durable memory provenance.
- Evidence manifest fields for screenshots, artifact bundles, PR URLs, CI runs, hashes, and source paths.
- Permanent curated evidence exceptions and sensitive screenshot handling.
- Dry-run behavior against `specs/002-product-line-switcher`.
- Pay special attention to auditability after branch deletion or artifact expiration.
```

#### 2. CI Guard Checklist

```bash
$speckit-checklist ci-guard

Focus on SPEC-002A requirements:
- Local and CI-runnable guard commands.
- Oversized and unmanifested screenshot failure fixtures.
- Pass behavior for approved SPEC-002 evidence or artifact-bundle-only paths.
- Clear error messages naming offending paths.
- Pay special attention to avoiding silent post-merge cleanup or history rewriting.
```

#### 3. Supply Chain Checklist

```bash
$speckit-checklist supply-chain

Focus on SPEC-002A requirements:
- `spec-kit-archive` repository URL, license, pinned tag or commit, install mode, and local modifications.
- Non-interactive dry-run compatibility with current SpecKit tooling.
- Vendored or fallback path if network access or upstream behavior is unsuitable.
- Hook behavior through `.specify/extensions.yml` if adopted.
- Pay special attention to not making an unpinned remote extension a CI dependency.
```

#### 4. Workflow Governance Checklist

```bash
$speckit-checklist workflow-governance

Focus on SPEC-002A requirements:
- Constitution updates for archive/evidence retention discipline.
- Workflow/template updates for future UI journey specs.
- PR evidence requirements and known-defect blocking behavior.
- Cleanup as explicit reviewed change.
- Pay special attention to preserving the Real UI Journey Quality Gate.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| requirements | Complete | 0 | Existing checklist |
| evidence-retention | Pending | Pending | Pending |
| ci-guard | Pending | Pending | Pending |
| supply-chain | Pending | Pending | Pending |
| workflow-governance | Pending | Pending | Pending |

---

## Phase 5: Tasks

**When to run:** After checklists complete with all gaps resolved. Output: `specs/002a-spec-archive-evidence/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure

- Small, testable chunks with clear acceptance criteria referencing P1A-AC1 through P1A-AC7.
- Dependency ordering: research/adoption decision -> policy model -> guard fixtures -> local command -> CI wiring -> docs/templates -> archive dry-run -> final validation.
- Mark parallel-safe documentation, fixture, and test tasks explicitly with [P] when they do not touch the same files.
- Keep tasks organized by user story and acceptance evidence, not by broad technical layer.

## Implementation Phases

1. Foundation: confirm extension decision, define evidence manifest/policy model, and identify exact file ownership.
2. Guard Red Tests: add negative and positive fixtures before implementing guard logic.
3. Guard and Archive Path: implement local command, CI wiring, and archive dry-run/report path.
4. Policy Docs: update constitution, workflow/template guidance, PR evidence guidance, and quickstart.
5. Validation: run guard pass/fail checks, dry-run archive against SPEC-002, and full repo verification.

## Constraints

- Do not delete or move `specs/002-product-line-switcher` source files.
- Do not implement SPEC-003 runtime behavior.
- Do not introduce unpinned extension or dependency behavior.
- Use `pnpm` for scripts and verification.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | Pending |
| Phases | Pending |
| Parallel Opportunities | Pending |
| User Stories Covered | Pending |

---

## Phase 6: Analyze

**When to run:** Always run after Tasks and before implementation.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Constitution alignment: preserve Zero-Regression, Real UI Journey Quality Gate, supply-chain hygiene, and no silent destructive cleanup.
2. Coverage gaps: ensure P1A-AC1 through P1A-AC7 have concrete tasks and evidence.
3. Consistency: check roadmap, spec, plan, checklists, tasks, workflow, constitution, and PRD terminology.
4. File-path truthfulness: verify generated task paths exist or will be created by named tasks.
5. Guard validity: prove both fail and pass paths are testable, not only documented.
6. Scope control: ensure tasks do not drift into SPEC-003+ runtime work.
```

### Analyze Severity Levels

| Severity | Meaning | Action Required |
|----------|---------|-----------------|
| CRITICAL | Blocks implementation, violates constitution, or risks silent data loss | Must fix before G6 |
| HIGH | Significant gap affecting acceptance evidence or guard correctness | Should fix before implementation |
| MEDIUM | Improvement opportunity or traceability weakness | Review and decide |
| LOW | Minor wording or organization issue | Note or patch if cheap |

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| Pending | Pending | Pending | Pending |

---

## Phase 7: Implement

**When to run:** After tasks are generated and Analyze has no unresolved CRITICAL/HIGH findings.

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD-First

For each task, follow this cycle:

1. RED: Write failing guard/script/test fixture for the expected policy behavior.
2. GREEN: Implement the minimum code or docs needed to satisfy the task.
3. REFACTOR: Simplify while tests still pass.
4. VERIFY: Record evidence against P1A-AC1 through P1A-AC7.

### Pre-Implementation Setup

1. Verify branch: `git rev-parse --abbrev-ref HEAD` returns `002a-spec-archive-evidence`.
2. Verify package manager from lockfile: `pnpm-lock.yaml` is present, so use `pnpm`.
3. Run baseline checks appropriate to touched files before implementation.
4. Confirm `specs/002-product-line-switcher` remains available as the archive dry-run source.

### Implementation Notes

- Keep guard logic small and repository-native.
- Prefer structured manifests or clear markdown tables over implicit filename conventions.
- Record `spec-kit-archive` adoption evidence in `research.md` and durable docs.
- Add fixtures proving the guard fails for unbounded committed screenshots and passes for approved evidence.
- Update constitution/workflow/template docs so future specs inherit the policy.
- Keep cleanup recommendations explicit and reviewed; never make CI mutate `main` after merge.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| Foundation | Pending | Pending | Pending |
| Guard Red Tests | Pending | Pending | Pending |
| Guard and Archive Path | Pending | Pending | Pending |
| Policy Docs | Pending | Pending | Pending |
| Validation | Pending | Pending | Pending |

---

## Post-Implementation Checklist

- [ ] All generated tasks are marked complete in `specs/002a-spec-archive-evidence/tasks.md`.
- [ ] Acceptance evidence is recorded for P1A-AC1 through P1A-AC7.
- [ ] `spec-kit-archive` adoption decision is evidence-backed and pinned or explicitly rejected.
- [ ] Archive dry-run against `specs/002-product-line-switcher` passes without deleting or moving source files.
- [ ] Screenshot/evidence guard fails on oversized or unmanifested fixture and names the offending path.
- [ ] Screenshot/evidence guard passes for approved evidence or artifact-bundle-only path.
- [ ] Constitution and workflow/template docs include the archive/evidence policy.
- [ ] PR evidence guidance preserves human screenshot review and known-defect blocking.
- [ ] `pnpm typecheck` passes or environment-specific failure is documented with evidence.
- [ ] `pnpm lint` passes or environment-specific failure is documented with evidence.
- [ ] `pnpm test` passes or environment-specific failure is documented with evidence.
- [ ] `pnpm build` passes or environment-specific failure is documented with evidence.
- [ ] E2E verification is run if implementation touches Playwright workflows or UI journey commands.
- [ ] `git diff --check` passes.
- [ ] Roadmap and PRD status are updated before PR creation.
- [ ] Branch is pushed for review.

---

## Project Structure Reference

```
docs/ai/rc-factory-technical-roadmap.md
docs/ai/specs/SPEC-002A-workflow.md
docs/rc-factory-v1-prd.md
.specify/memory/constitution.md
.specify/templates/
.specify/extensions/
.agents/skills/
specs/002-product-line-switcher/
specs/002a-spec-archive-evidence/
.github/workflows/
.github/pull_request_template.md
scripts/
tests/
```

---

Template source: `speckit-pro/1.8.0/skills/speckit-coach/templates/workflow-template.md`.
