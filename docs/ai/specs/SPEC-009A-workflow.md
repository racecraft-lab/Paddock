# SpecKit Workflow: SPEC-009A - Workflow Contract Format and Roundtrip

**Template Version**: 1.0.0
**Created**: 2026-05-05
**Purpose**: Prepare and execute the RC Factory Phase 8A workflow contract roundtrip specification in autopilot.

---

## How to Use This Workflow

Run this workflow from the dedicated worktree on branch
`009a-workflow-contract-roundtrip`:

```bash
$speckit-autopilot docs/ai/specs/SPEC-009A-workflow.md
```

This workflow was generated from the SpecKit Pro workflow template and enriched
by an interactive `$speckit-pro:grill-me` session. The full Q&A log, Goals,
Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-009A-design-concept.md
```

Re-read the design concept before each phase if a prompt is ambiguous. The
Specify and Clarify prompts below were populated directly from the interview.

Do not start downstream specs from this worktree. SPEC-009A stops after the
repo-owned workflow contract format, import/export tooling, parity tests,
fail-closed validation, diagnostics surface, documentation, verification, and
roadmap bookkeeping are complete.

No product-line seed, GitHub issue pilot, claim loop, dispatch loop, runner
launch, sandbox lifecycle, auto-merge, or harness adapter work belongs in this
spec.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Prerequisites + Status Sync | `$speckit-autopilot` startup | Complete | Archive Sweep cleanup disabled safely; GitNexus rebuilt with skills + embeddings; dependencies installed; `pnpm typecheck` and `pnpm lint` passed |
| Specify | `$speckit-specify` | Complete | Generated base spec with 32 FRs, 6 user stories, 12 acceptance scenarios, 8 SCs; G1 PASS with 0 markers |
| Clarify | `$speckit-clarify` | Complete | Resolved validation package, YAML subset, hash envelope, export path, LKG recovery, diagnostics persistence, UI boundary, and cross-spec governance guardrails |
| Plan | `$speckit-plan` | Complete | Created plan, research, data model, CLI/schema/diagnostics contracts, quickstart, and Codex agent-context update; G3 PASS with 0 markers |
| Checklist | `$speckit-checklist` | Complete | Generated 4 focused domain checklists with 24 items each; 0 gaps; G4 PASS |
| Tasks | `$speckit-tasks` | Complete | Generated 65 dependency-ordered tasks across 9 phases with 25 parallel opportunities; G5 PASS |
| Analyze | `$speckit-analyze` | Complete | Resolved 6 task/design findings; G6 PASS with 0 critical/high markers |
| Implement | `$speckit-implement` | Complete | Shipped contract tooling, diagnostics, docs, tests, review remediation, final GitNexus rebuild, and status updates |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Prerequisites + Status Sync | Branch is `009a-workflow-contract-roundtrip`; stale SPEC-005/SPEC-008 status sync remains scoped; Archive Sweep state is recorded; no downstream spec artifacts are touched |
| G1 | After Specify | Requirements cover repo-owned YAML contracts, dry-run/apply import, Markdown export, canonical parity hashes, fail-closed invalid fixtures, last-known-good preservation, and diagnostics |
| G2 | After Clarify | Validation package, canonical hash envelope, diagnostics persistence, Markdown export path, and migration numbering are resolved |
| G3 | After Plan | Constitution gates pass; direct dependency policy is explicit; no runner/claim/pilot scope is introduced; migration and rollback are concrete if diagnostics persistence requires schema |
| G4 | After Checklist | All gaps in data integrity, error handling, security, and regression safety are resolved without widening into SPEC-009B/C/D, SPEC-013A-C, or SPEC-014A-D |
| G5 | After Tasks | Tasks cover every acceptance criterion, invalid fixture class, hash parity path, UI diagnostics path, and status/doc update |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; tasks do not couple governance enforcement to SPEC-009A |
| G7 | After Implement | Focused tests, typecheck, lint, build or justified subset, guardrail greps, docs status, roadmap update, and branch push are complete |

---

## Prerequisites

### Branch Guard

Before any phase, verify:

```bash
git rev-parse --abbrev-ref HEAD
```

Expected branch:

```text
009a-workflow-contract-roundtrip
```

If the executor would create or switch to another branch, stop before Specify.
If supported, set:

```bash
GIT_BRANCH_NAME=009a-workflow-contract-roundtrip
SPECIFY_FEATURE_DIRECTORY=specs/009a-workflow-contract-roundtrip
```

### Status Sync Cleanup

Setup performed a small status-sync cleanup before creating this workflow:

- `docs/ai/specs/SPEC-005-workflow.md` synced stale Implement status to Complete
  after PR #23 merged to `main` as `851571f`.
- `docs/ai/specs/SPEC-008-workflow.md` synced stale Implement status to Complete
  after PR #26 merged to `main` as `bd9a693`.
- `docs/ai/specs/autopilot-state.json` refreshed from stale active workflow
  state to the current SPEC-009A setup pointer.

Autopilot must preserve this cleanup. Do not re-open SPEC-005 or SPEC-008
implementation work from this branch.

### Archive Sweep

SPEC-002A made Archive Sweep a required autopilot startup step. For this
workflow:

- Prior merged candidates: SPEC-001, SPEC-002, SPEC-002A, SPEC-003, SPEC-004,
  SPEC-005, SPEC-006, SPEC-007, SPEC-008.
- Current target excluded: SPEC-009A / `specs/009a-workflow-contract-roundtrip`.
- Cleanup policy: dry-run-only or stop unless a clean safe base branch records
  `safeToApplyCleanup=true`, archive success, merge/tree references, and
  recovery commands.
- Do not delete source spec folders silently during setup or during this
  workflow.

### Archive Sweep Results

Executed during SPEC-009A autopilot startup on 2026-05-05.

| Field | Result |
|-------|--------|
| Archive extension | Installed and enabled: `archive` v1.1.0 from `.specify/extensions/archive/extension.yml`; registry source commit `08ee0e919a72ccb254758a2b6f51d58196490ea7` |
| Branch | `009a-workflow-contract-roundtrip` |
| Worktree | Feature/spec worktree |
| Worktree clean before cleanup? | No. Dirty state exists from requested GitNexus `--skills --embeddings` rebuild and `.envrc` propagation. |
| Current target | `specs/009a-workflow-contract-roundtrip` |
| Current target exclusion | Excluded. The directory has not been generated yet because Specify has not run. |
| Active completed spec dirs found | `specs/005-ready-for-owner`, `specs/007-disposition-artifacts`, `specs/008-resource-governance` |
| Archive memory evidence | `.specify/memory/changelog.md`, `.specify/memory/spec.md`, and `.specify/memory/plan.md` already record archive/status evidence for completed prior specs, including SPEC-005, SPEC-007, and SPEC-008. |
| Cleanup applied | No |
| `safeToApplyCleanup` | `false` |

**Cleanup decision:** No active `specs/**` directory was deleted, moved, or
otherwise cleaned up in this startup pass. Cleanup is disabled because the
worktree is not clean and this is a feature branch, so the safe cleanup gates
from the archive extension are not satisfied. Archive Sweep evidence is recorded
for traceability only.

### Constitution Validation

Before starting each phase, verify alignment with `.specify/memory/constitution.md`,
`docs/rc-factory-v1-prd.md`, and `docs/ai/rc-factory-technical-roadmap.md`.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| Repo-owned policy | Source-of-truth contracts live under `docs/ai/workflows/`; `workflow_templates` is the runtime projection | Spec/plan references and import/export tests |
| Feature-flag discipline | SPEC-009A does not add a new runtime flag; imported templates declare later flag dependencies as data | Static grep and spec review |
| Explicit operator action | Runtime rows change only when an operator runs explicit apply mode | Dry-run/apply tests and command docs |
| Fail-closed reload | Invalid contracts preserve last-known-good runtime templates and exit nonzero | Invalid fixture tests and transaction tests |
| Direct dependency policy | YAML parser, if added, is direct pinned runtime dependency; AJV remains existing direct pinned validator | `package.json`, `pnpm-lock.yaml`, guardrail test |
| Governance boundary | Governance, concurrency, retry, and sandbox fields are declarative only in SPEC-009A | Analyze prompt and strict-scope grep |
| Provider neutrality | Capabilities and adapter requirements are data; no provider is mandatory | Contract schema tests |
| Existing behavior preservation | Existing `workflow_templates` behavior is unchanged unless import command explicitly applies a contract | Regression tests |

**Constitution Check:** Complete for Phase 0 startup. Re-check after Specify,
Plan, Analyze, and Implement as artifacts become concrete.

### Phase 0 Results

Executed during SPEC-009A autopilot startup on 2026-05-05.

| Check | Result |
|-------|--------|
| SpecKit prerequisite script | PASS: `all_pass=true`; branch `009a-workflow-contract-roundtrip`; worktree detected; workflow file exists |
| Settings | No `.claude/speckit-pro.local.md`; using autopilot defaults |
| MCP availability | Non-blocking missing MCPs reported by script: `tavily-mcp`, `context7`, `RepoPrompt`; GitNexus MCP is available and was used separately |
| Command detection | PASS: package manager `pnpm`; build/typecheck/lint/test/e2e commands detected |
| Presets | None detected; enabled extensions read from `.specify/extensions/.registry` |
| Dependency install | `direnv exec . pnpm install --frozen-lockfile` PASS after sandboxed attempt failed on registry DNS; no lockfile/package edits |
| GitNexus index | Initial rebuild completed during startup; final Phase 9 rebuild superseded it and copied `.gitnexus/` to the primary checkout root so it is not stranded in this worktree |
| GitNexus stats | Final Phase 9 rebuild: 24,964 nodes; 39,377 edges; 647 clusters; 300 flows; 19,657 embeddings generated from a clean index |
| GitNexus ignore state | `.gitnexus/` is ignored by `.gitignore:71`; `.envrc.local` is ignored by `.gitignore:16`; neither is staged |
| Environment loader | `.envrc` copied from the prior governance worktree and primary checkout; loads `.envrc.local` via direnv for embedding config and adds `node_modules/.bin` |
| Typecheck | PASS: `direnv exec . pnpm typecheck` |
| Lint | PASS: `direnv exec . pnpm lint` |
| Impact check | GitNexus `detect_changes(scope=all)` reported low risk and no affected execution flows for current docs/skill changes |

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-009A |
| Name | Workflow Contract Format and Roundtrip |
| Branch | `009a-workflow-contract-roundtrip` |
| Dependencies | SPEC-002A, SPEC-004, SPEC-008 |
| Enables | SPEC-009B, SPEC-012A |
| Priority | P0 |
| Feature flag | None for SPEC-009A runtime; operator import/export tooling only |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |
| Primary source directory | `docs/ai/workflows/mission-control/` |
| Runtime projection | `workflow_templates` |
| Generated review artifact | Markdown export produced by tooling |
| Strict Scope | Contract files under `docs/ai/workflows/`, import/export tooling, focused parity tests, small validation helper, reusable diagnostics persistence/UI if required |

### Scope Summary

Define the repo-owned Mission Control workflow contract under
`docs/ai/workflows/`, import it into `workflow_templates`, export it back to
Markdown, and prove fail-closed validation for invalid YAML, template variables,
tracker identity, capability declarations, concurrency/retry fields, sandbox
fields, prompt versions, routing-rule hashes, output-schema hashes, and
feature-flag dependencies.

Do not implement product-line seed, autonomous dispatch, runner launch, harness
adapter, issue claim loop, retry loop, reconciliation loop, auto-merge, or live
pilot behavior.

### Setup Decisions From Design Concept

- YAML manifests under `docs/ai/workflows/` are canonical. Markdown export is a
  review artifact.
- Prompt bodies live in YAML block scalars, not separate canonical Markdown
  files.
- Import/export is operator-run tooling; no new SPEC-009A runtime feature flag.
- Import defaults to dry-run; apply mode is explicit and transactional.
- Upsert identity is workspace plus contract template slug; unrelated templates
  are preserved.
- Invalid YAML or invalid model/schema validation fails closed and preserves
  last-known-good `workflow_templates`.
- Roundtrip parity uses canonical hashes over parsed typed data, not formatting
  equality.
- Provider-specific fields are rejected or deferred; use `capabilities` and
  `adapter_requirements` data.
- GitHub Issues tracker identity v1 includes owner/name, selector labels,
  priority rules, area labels, and local-only non-pilot intake semantics.
- Template variables use explicit namespace allowlists and reject unknown
  variables.
- Successful apply records contract version, schema version, content hashes,
  last-known-good snapshot reference, and deterministic rollback command.
- Generic diagnostics storage/UI is allowed, but must not use SPEC-009A-specific
  names.
- The diagnostics UI belongs inside the existing Orchestration/Workflows admin
  surface and is not a workflow editor.
- SPEC-009A validates concurrency, retry, sandbox, and governance declarations
  as metadata only. Later specs enforce them.
- Use direct pinned YAML parser for loading if Plan confirms package choice;
  reuse existing direct pinned `ajv@8.18.0` strict profile for validation.

### Acceptance Criteria

- [P8A-AC1] Contract source files exist under
  `docs/ai/workflows/mission-control/` and define the minimal Mission Control
  workflow family: intake, planning, implementation, review, owner gate, and
  lifecycle metadata.
- [P8A-AC2] Import command supports dry-run and explicit apply mode. Dry-run
  produces a diff report and never mutates `workflow_templates`.
- [P8A-AC3] Apply mode is transactional, idempotent, keyed by workspace plus
  contract template slug, and preserves unrelated templates.
- [P8A-AC4] Invalid YAML fixtures fail closed before mutation with operator-
  visible validation evidence.
- [P8A-AC5] Invalid template variables, tracker identity, capabilities, adapter
  requirements, concurrency, retry, sandbox, prompt version, routing-rule hash,
  output-schema hash, and feature-flag dependency fixtures fail closed visibly.
- [P8A-AC6] Export command produces a Markdown review artifact from the runtime
  projection.
- [P8A-AC7] No-op import/export parity passes by comparing stable canonical
  hashes.
- [P8A-AC8] Successful apply records contract version, schema version, hashes,
  last-known-good snapshot reference, and rollback command.
- [P8A-AC9] Import diagnostics persist validation errors, diff summaries,
  last-known-good state, and artifact/report links in reusable storage and
  render in the existing Orchestration/Workflows admin surface.
- [P8A-AC10] Existing `workflow_templates` behavior is unchanged unless the
  operator explicitly runs the contract import command.

---

## Phase 1: Specify

**When to run:** After Prerequisites + Status Sync. Output:
`specs/009a-workflow-contract-roundtrip/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-009A Workflow Contract Format and Roundtrip

Create a specification for RC Factory Phase 8A in Mission Control.

### Problem Statement

Mission Control stores executable workflow templates in SQLite
`workflow_templates`, but the RC Factory PRD requires workflow policy to be
repo-owned and reviewable. Operators need a versioned contract under
`docs/ai/workflows/` that can seed/sync `workflow_templates`, roundtrip back to
a Markdown review artifact, and fail closed when the contract is invalid.

SPEC-009A is the process-only contract roundtrip slice. It must define the
contract format, import/export commands, validation rules, parity hashes,
last-known-good behavior, and diagnostics. It must not run the Mission Control
self-hosting pilot.

### Users

- Operator: wants workflow policy reviewed in git instead of hand-edited only in
  SQLite.
- SpecKit/autopilot executor: needs a stable contract shape to seed later
  product-line workflows without inventing runtime assumptions.
- Admin/reviewer: needs validation errors, diffs, hashes, and last-known-good
  state visible in a reusable diagnostics surface.
- Future harness/control-plane implementer: needs capabilities, adapter
  requirements, concurrency, retry, sandbox, and governance fields declared as
  data for later specs to enforce.

### User Stories

1. As an operator, I can run contract import in dry-run mode and inspect the
   exact template diff without mutating runtime data.
2. As an operator, I can apply a valid repo-owned contract transactionally and
   preserve unrelated workflow templates.
3. As an operator, I can export runtime workflow templates to Markdown and prove
   no-op roundtrip parity through stable hashes.
4. As an operator, I see invalid contract failures before mutation and can
   recover from the last-known-good snapshot.
5. As an admin, I can inspect reusable workflow-contract diagnostics in the
   existing Orchestration/Workflows surface.
6. As a future runtime implementer, I can rely on provider-neutral capabilities,
   adapter requirements, governance, concurrency, retry, and sandbox
   declarations without SPEC-009A launching work.

### Requirements

- Canonical source files are YAML manifests under
  `docs/ai/workflows/mission-control/`.
- Prompt bodies are YAML block scalars.
- Markdown export is generated review output, not canonical source.
- Use a direct pinned YAML parser for syntax/loading if Plan confirms package
  choice; reuse existing direct pinned `ajv@8.18.0` strict JSON Schema profile
  for model validation.
- Convert YAML into a typed canonical object model before import/export/hash.
- Reject unknown template variables outside explicit allowlist namespaces.
- Validate GitHub tracker identity v1, capabilities, adapter requirements,
  feature flags, governance declarations, concurrency/retry, sandbox, prompt
  version, routing-rule hash, and output-schema hash.
- Preserve last-known-good templates on failed reload.
- Existing `workflow_templates` behavior remains unchanged unless an operator
  explicitly runs import apply mode.

### Out of Scope

- Product-line seed and `PILOT_MISSION_CONTROL_E2E` activation.
- GitHub issue ingestion, claim/reconciliation, dispatch, retry/backoff,
  auto-merge, runner launch, sandbox lifecycle, or harness adapter work.
- Visual workflow editor.
- JSON-only authoring format.
- A second schema-validation stack.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 32 |
| Clarified Functional Requirements | 52 after Phase 2 |
| User Stories | 6 |
| Acceptance Criteria | 12 |
| Success Criteria | 8 |
| Quality Markers | 0 `[NEEDS CLARIFICATION]`, 0 `[Gap]` |
| Gate G1 | PASS - `validate-gate.sh G1 specs/009a-workflow-contract-roundtrip` reported `spec.md exists with 0 markers` |

### Files Generated

- [x] `specs/009a-workflow-contract-roundtrip/spec.md`
- [x] `specs/009a-workflow-contract-roundtrip/checklists/requirements.md`

---

## Phase 2: Clarify

**When to run:** After Specify. Resolve the design-concept Open Questions and
any spec markers before Plan.

### Clarify Session 1 - Contract Format and Validation Stack

```bash
$speckit-clarify

Focus on contract format and validation stack for SPEC-009A:
- Direct YAML parser package/version and dependency pin policy.
- Canonical YAML manifest shape and prompt block scalar rules.
- JSON Schema profile, AJV options, and unsupported schema features.
- TypeScript object model boundaries.
- Exact invalid YAML/model fixture classes.
```

### Clarify Session 2 - Import, Export, Hashes, and Recovery

```bash
$speckit-clarify

Focus on import/export semantics for SPEC-009A:
- Dry-run vs apply command behavior and exit codes.
- Transaction boundary and idempotent upsert identity.
- Canonical hash envelope and field list.
- Markdown export path and review artifact naming.
- Last-known-good snapshot reference and rollback command.
```

### Clarify Session 3 - Diagnostics, UI Boundary, and Cross-Spec Governance

```bash
$speckit-clarify

Focus on diagnostics and governance boundaries for SPEC-009A:
- Reusable import-run/validation persistence schema.
- Orchestration/Workflows diagnostics UI fields and filters.
- Validation-only handling of governance, concurrency, retry, sandbox, and
  adapter declarations.
- Explicit exclusions for SPEC-009B/C/D, SPEC-013A-C, and SPEC-014A-D.
- Operator-visible failure messages and artifact/report links.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Contract format and validation stack | 5 answered | Exact direct `yaml@2.8.2`; single-document YAML 1.2 mapping manifests; literal prompt block scalars only; reused AJV 8 strict profile; typed canonical model boundary with governance as inert data |
| 2 | Import/export/hashes/recovery | 6 answered | Dry-run default and explicit apply; one SQLite transaction for apply + diagnostics + LKG; workspace plus slug upsert identity; versioned SHA-256 hash envelope; default Markdown export path; operator-triggered LKG recovery |
| 3 | Diagnostics and governance boundary | 6 answered | Generic run/error/snapshot diagnostics tables; M71 + rollback-M71 after current-code M70 collision; read-only Workflow Contracts diagnostics; validation-only governance declarations; stable redacted failure messages |

Gate G2 evidence: `validate-gate.sh G2 specs/009a-workflow-contract-roundtrip`
reported PASS with 0 `[NEEDS CLARIFICATION]` markers. Marker scan found no
open spec markers; workflow `Pending` rows belong to future autopilot phases.

---

## Phase 3: Plan

**When to run:** After Clarify. Output: `plan.md`, `research.md`,
`data-model.md`, `contracts/`, and `quickstart.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- App: Next.js 16 App Router, React 19, TypeScript strict mode.
- Database: SQLite via `better-sqlite3`, synchronous transactions.
- Validation: existing direct pinned `ajv@8.18.0` constrained strict profile;
  exact direct `yaml@2.8.2` for SPEC-009A contract loading.
- Styling: Tailwind CSS 3.
- Package manager: pnpm only.
- Tests: Vitest for tooling/model/import/export; Playwright only if diagnostics
  UI needs browser verification.

## Constraints
- No product-line seed or pilot dispatch.
- No runtime feature flag introduced by SPEC-009A.
- No mandatory provider/harness dependency.
- Existing `workflow_templates` behavior unchanged unless import apply mode is
  explicitly run.
- If diagnostics persistence adds schema, migration and rollback must be
  additive and reusable; no SPEC-009A-specific table/column names.
- Do not import transitive dependencies. Any YAML parser must be direct pinned.
- Preserve existing AJV guardrail posture; do not introduce `ajv-formats` or a
  second schema validator for contract validation.

## Architecture Notes
- Keep canonical source under `docs/ai/workflows/mission-control/`.
- Parse YAML -> typed model -> schema validation -> canonical hash -> dry-run
  diff/apply/export.
- Make import apply transactional and preserve last-known-good.
- Store diagnostics generically for future contract imports.
- Keep governance/concurrency/retry/sandbox declarations as metadata for later
  specs to enforce.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Technical context, strict scope, constitution gates, and post-design check |
| `research.md` | Complete | Exact `yaml@2.8.2`, AJV strict profile, canonical hash, transaction, diagnostics, UI boundary decisions |
| `data-model.md` | Complete | Contract model, runtime projection, diff, hash, diagnostics run/error/snapshot entities |
| `contracts/` | Complete | CLI, YAML/canonical schema, and diagnostics API/UI contracts |
| `quickstart.md` | Complete | Operator import/export/recovery and fail-closed fixture workflow |

Gate G3 evidence: `validate-gate.sh G3 specs/009a-workflow-contract-roundtrip`
reported PASS with 0 unresolved markers. Scope checks in `plan.md` exclude
product-line seed, pilot dispatch, GitHub ingest/sync, scheduler dispatch,
retry execution, runner launch, sandbox lifecycle, harness adapters, and
governance enforcement.

---

## Phase 4: Domain Checklists

Run the following domains after Plan. Resolve every gap before Tasks.

### data-integrity Checklist

```bash
$speckit-checklist data-integrity

Focus on SPEC-009A requirements:
- Transactional apply and idempotent upsert keyed by workspace plus slug.
- Last-known-good snapshot reference and rollback command.
- Canonical hash envelope and no-op parity.
- Diagnostics persistence, migration, rollback, and re-run behavior.
- Preservation of unrelated `workflow_templates`.
```

### error-handling Checklist

```bash
$speckit-checklist error-handling

Focus on SPEC-009A requirements:
- Invalid YAML and invalid model fixtures fail closed before mutation.
- Unknown variables, invalid tracker identity, invalid capability requirements,
  invalid governance declarations, and hash mismatches produce actionable
  diagnostics.
- Dry-run/apply/export exit codes and operator-facing messages are deterministic.
- Failed reload preserves last-known-good runtime templates.
```

### security Checklist

```bash
$speckit-checklist security

Focus on SPEC-009A requirements:
- YAML parsing does not allow unsafe custom tags or arbitrary code execution.
- Schema validation rejects unsupported JSON Schema features and unsafe routing
  patterns using the existing constrained validator posture.
- Prompt/template variables use explicit allowlists and do not allow unbounded
  interpolation.
- Diagnostics and exported Markdown do not leak secrets from runtime data.
```

### regression-safety Checklist

```bash
$speckit-checklist regression-safety

Focus on SPEC-009A requirements:
- Existing workflow template creation/editing/dispatch behavior is unchanged
  unless import apply mode is explicitly run.
- Feature flags for later specs remain declarations, not SPEC-009A runtime
  behavior.
- No product-line seed, issue ingestion, claim loop, dispatch loop, runner
  launch, or harness adapter is introduced.
- Package/dependency changes stay direct, pinned, audited, and guarded.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | 24 | 0 | FR-016..FR-026, FR-039..FR-049 |
| error-handling | 24 | 0 | FR-010..FR-016, FR-021..FR-027, FR-038..FR-052 |
| security | 24 | 0 | FR-003..FR-015, FR-030..FR-035, FR-041..FR-052 |
| regression-safety | 24 | 0 | FR-016..FR-018, FR-030..FR-040, FR-045..FR-049 |

---

## Phase 5: Tasks

**When to run:** After all checklist gaps are resolved.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure
- Test-first tasks with RED/GREEN/REFACTOR evidence.
- Foundation first: typed model, parser wrapper, schema profile, fixtures.
- User-story grouping: dry-run import, apply import, export/parity, invalid
  fixtures, diagnostics UI, docs/status.
- Mark parallel-safe tasks with [P] only when file ownership is independent.
- Include explicit guardrail tasks for no pilot/runner/claim scope.

## Required Coverage
- Valid Mission Control contract fixture.
- Invalid YAML fixture.
- Unknown template variable fixture.
- Invalid tracker identity fixture.
- Invalid capability/adapter requirement fixture.
- Invalid concurrency/retry/sandbox/governance fixture.
- Hash mismatch fixture.
- Dry-run no-mutation test.
- Apply transaction/rollback test.
- Last-known-good preservation test.
- Markdown export parity test.
- Diagnostics persistence and UI rendering tests.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | 65 |
| Phases | 9 |
| Parallel Opportunities | 25 |
| User Stories Covered | US1, US2, US3, US4, US5, US6 |

---

## Phase 6: Analyze

**When to run:** Always run after Tasks.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Constitution alignment and direct dependency policy.
2. Whether every acceptance criterion has task coverage.
3. Whether invalid fixtures cover every fail-closed class.
4. Whether tasks drift into SPEC-009B/C/D seed/pilot work.
5. Whether tasks drift into SPEC-013A-C claim/reconciliation/retry enforcement.
6. Whether tasks drift into SPEC-014A-D sandbox/harness adapter execution.
7. Whether existing `workflow_templates` behavior is protected unless explicit
   import apply mode is run.
```

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| A-001 | High | Current code already uses M70, while SPEC-009A artifacts still reserved M70 | Rebased diagnostics schema, rollback, plan, research, checklists, and tasks to M71/rollback-M71 |
| A-002 | High | Planned TypeScript CLI script lacked an executable runner in current package wiring | Made `workflow-contract` script use Node built-in TypeScript type stripping and forbade adding `tsx`/`ts-node` |
| A-003 | Medium | Diagnostics API route tasks omitted OpenAPI/API-index parity coverage | Added `openapi.json`, `src/app/api/index/route.ts`, and `pnpm api:parity` coverage |
| A-004 | High | Dry-run task contradicted required reusable diagnostics persistence | Clarified dry-run mutates no templates/snapshots but persists diagnostics summary/diff records |
| A-005 | High | Invalid feature-flag dependency fixture coverage was implicit rather than explicit | Added feature-flag dependency validation fixture coverage to foundation and US4 tests |
| A-006 | High | Redaction/truncation was required but not test-covered at every operator-visible boundary | Added redaction/truncation coverage for CLI, Markdown export, diagnostics API, UI, and Playwright journey |

---

## Phase 7: Implement

**When to run:** After Analyze has no unresolved blocking findings.

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD-First

For each task:
1. RED: Write failing focused test or fixture.
2. GREEN: Implement the smallest scoped behavior.
3. REFACTOR: Keep parser/model/import/export boundaries clear.
4. VERIFY: Run focused tests and final quality gates.

## Pre-Implementation Setup

1. Verify branch is `009a-workflow-contract-roundtrip`.
2. Run baseline focused tests selected by Plan.
3. Confirm `pnpm-lock.yaml` is the package-manager authority.
4. Confirm no product-line seed/pilot/runner scope is present in tasks.

## Implementation Notes

- Prefer small modules for parser/model/schema/import/export boundaries.
- Keep YAML parser use behind one helper.
- Reuse existing AJV validation posture where possible.
- Use synchronous `better-sqlite3` transactions for apply.
- Keep diagnostics storage and UI names generic.
- Update `docs/ai/rc-factory-technical-roadmap.md` and this workflow status
  only after verification evidence exists.
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| Foundation | T001-T018 | Complete | Exact `yaml@2.8.2`, canonical fixture, M71/rollback-M71, strict workflow-contract library scope, parser/validator/hash/diff/diagnostics primitives |
| Import/apply | T019-T031 | Complete | Dry-run persists diagnostics without runtime mutation; explicit apply transactionally upserts owned templates, preserves unrelated rows, and writes LKG snapshot/recovery command |
| Export/parity | T032-T037 | Complete | Markdown review export generated at `docs/ai/workflows/mission-control/exports/workflow-contract.md`; import/export hash parity is `workflow-contract-hash-v1:sha256:2f0e9ef6e21ca80039c49bc6398bf8f7bd1493be454ff5d7e381391b4b8884da` |
| Diagnostics | T045-T051 | Complete | Read-only diagnostics API and Workflows `Contracts` tab show run status, diffs, hashes, source, recovery, and redacted errors without apply/edit/dispatch/governance controls |
| Polish/docs/status | T052-T065 | Complete | Future governance/concurrency/retry/sandbox declarations are inert data; roadmap/AGENTS/workflow updated; guardrail search clean |

### Implementation Evidence

| Check | Result |
|-------|--------|
| `direnv exec . pnpm workflow-contract import --file docs/ai/workflows/mission-control/workflow-contract.yaml --dry-run` | PASS; no template mutation, diagnostics run persisted |
| `direnv exec . pnpm workflow-contract import --file docs/ai/workflows/mission-control/workflow-contract.yaml --apply` | PASS; LKG snapshot and deterministic recovery command recorded |
| `direnv exec . pnpm workflow-contract export --workspace-id 1` | PASS; generated `docs/ai/workflows/mission-control/exports/workflow-contract.md` with stable parity hash |
| `direnv exec . pnpm workflow-contract recover --workspace-id 1 --dry-run` | PASS; LKG recovery dry-run reports `mutation_status: dry_run` |
| `direnv exec . pnpm exec vitest run src/lib/__tests__/workflow-contracts src/lib/__tests__/migrations-009a.test.ts src/app/api/workflow-contracts/diagnostics/route.test.ts src/components/panels/orchestration-bar.test.tsx` | PASS; 13 files, 47 tests |
| `direnv exec . pnpm test:e2e -- tests/e2e/workflow-contract-diagnostics.spec.ts` | PASS; 1 Chromium test |
| `direnv exec . pnpm api:parity` | PASS |
| `direnv exec . pnpm typecheck` | PASS |
| `direnv exec . pnpm lint` | PASS |
| `direnv exec . pnpm build` | PASS with network access for Next Google Fonts |
| `direnv exec . pnpm test` | PASS with sandbox escalation for daemon socket test; 268 files, 2771 tests |
| Guardrail grep over SPEC-009A implementation paths | PASS; no pilot seed, dispatch, runner, harness, scheduler, sandbox lifecycle, GitHub sync, or governance evaluator reference |
| `direnv exec . gitnexus analyze --force --skills --embeddings --skip-agents-md` | PASS with network access for embedding endpoint; clean rebuild completed in 4005.8s with 24,964 nodes, 39,377 edges, 647 clusters, 300 flows, and 20 generated skills; `.gitnexus/` copied to primary repo root |

---

## Post-Implementation Checklist

- [x] All tasks marked complete in `tasks.md`.
- [x] Focused Vitest suite passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm lint` passes.
- [x] `pnpm build` passes or a documented scoped substitute is approved.
- [x] Invalid fixture suite proves fail-closed behavior.
- [x] Dry-run/apply/export quickstart is verified.
- [x] Roadmap status updated.
- [x] Workflow status updated.
- [ ] Branch pushed.

---

## Project Structure Reference

```text
docs/ai/workflows/mission-control/        # Canonical SPEC-009A contract files
docs/ai/specs/SPEC-009A-design-concept.md # Setup Q&A and design decisions
docs/ai/specs/SPEC-009A-workflow.md       # This workflow
specs/009a-workflow-contract-roundtrip/   # Generated SpecKit artifacts
src/lib/                                  # Import/export/model helpers if Plan chooses this location
src/app/                                  # Diagnostics UI/API if Plan chooses runtime surface changes
docs/                                    # Operator docs and generated Markdown review artifacts
```
