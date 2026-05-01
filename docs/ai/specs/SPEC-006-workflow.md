# SpecKit Workflow: SPEC-006 — Area-Label GitHub Sync

**Template Version**: 1.0.0
**Created**: 2026-05-01
**Purpose**: Prepare and execute the RC Factory Phase 5 area-label routing and shared-repo sync ownership specification in autopilot.

---

## How to Use This Workflow

This workflow was generated from the SpecKit Pro workflow template for the dedicated branch `006-area-label-github-sync`, enriched by an interactive `/speckit-pro:grill-me` session that produced the design concept doc at `docs/ai/specs/SPEC-006-design-concept.md`. The Q&A log, Goals, Non-goals, and Open Questions in that doc are the source of truth for any decision captured during scoping.

Re-read the design concept doc before each phase if a prompt is ambiguous. The Specify and Clarify prompts below were populated directly from that interview.

Run the phases through `$speckit-autopilot` after reviewing the prompts:

```bash
$speckit-autopilot docs/ai/specs/SPEC-006-workflow.md
```

Autopilot must begin with Archive Sweep discovery before normal prerequisites. The sweep handles previously merged specs only (`SPEC-001`, `SPEC-002`, `SPEC-002A`, `SPEC-003`), excludes `SPEC-006` and `SPEC-004` (which is in flight in a parallel worktree), and must stay dry-run-only or stop unless the branch is clean and safe cleanup has been explicitly recorded.

Do not start downstream specs from this worktree. SPEC-006 stops after the feature-flagged area:* routing, repo-level sync ownership, triage project, area_slug column, label provisioning, auto-backfill on first flag-on, project settings UI, documentation refresh, verification, and roadmap bookkeeping are complete.

> **Note:** Grill Me is human-in-the-loop only. It is not part of the autopilot loop. Once the workflow file is populated and autopilot begins, clarifications happen via `/speckit.clarify` and the consensus protocol — never via grill-me.

---

## Design Concept

The full Q&A log, Goals, Non-goals, and Open Questions live at:

```text
docs/ai/specs/SPEC-006-design-concept.md
```

| Decision | Outcome |
|----------|---------|
| Q1 Sync ownership | `projects.is_repo_sync_owner` flag, partial unique index per `(workspace_id, github_repo)` |
| Q2 Owner election | Migration backfills oldest project (`MIN(projects.id)`); transfer via PUT API |
| Q3 Area slug source | New `projects.area_slug` column |
| Q4 Triage project | `projects.is_triage_project` flag, fail open if absent (route unresolvable to sync owner with activity) |
| Q5 Re-route semantics | Route on initial ingest only; no re-route on subsequent label changes |
| Q6 Outbound source | `area:<projects.area_slug>` if set, else omit |
| Q7 Label source of truth | Hybrid: static `AREA_LABEL_MAP` defaults + dynamic per-workspace augmentation |
| Q8 Existing-issue backfill | One-time backfill migration |
| Q9 Backfill trigger | Auto-run on first flag-on per workspace + initial sync poll bootstrap |
| Q10 Activity log | Two kinds: `area_routing_resolved` and `area_routing_unresolved` |
| Q11 API/UI surface | Extend existing `PUT /api/projects/[id]` and project settings panel |
| Q12 Lookup cache | Per-sync-call `Map<area_slug, project_id>` |
| Q13 `initializeLabels` timing | On connect + on `area_slug` change + on first sync poll after flag-on |
| Q14 Module boundaries | Keep in existing files; no new modules; strict scope N/A |
| Q15 Documentation | New `docs/github-sync.md` + `docs/feature-flags-runbook.md` update |
| Q16 Test strategy | Unit + integration + e2e for project settings UI |
| Q17 Backfill atomicity | Per-task transaction + final timestamp marker |

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Prerequisites + Archive Sweep | `$speckit-autopilot` startup | Complete | 2026-05-01T16:50Z dry-run evidence recorded; SPEC-001/002/002A/003 eligibleForArchive=true; SPEC-006 excluded; safeToApplyCleanup=false; no cleanup applied |
| Specify | `$speckit-specify` | Complete | 2026-05-01 generated specs/006-area-label-github-sync/spec.md (285 lines, 51 FRs, 7 user stories, 33 scenarios, 10 SCs) and checklists/requirements.md (36 lines); G1 passed with 0 markers; 2 consensus items deferred to Clarify session 1 (AREA_LABEL_MAP defaults [domain]; backfill resume mechanism [codebase]) |
| Clarify | `$speckit-clarify` | Complete | All 3 sessions complete 2026-05-01: S1 (Schema/Migration/Backfill) 5 questions; S2 (Lifecycle/Failure/Conflict) 5 questions, sync-owner re-election deferred per Constitution Article XII; S3 (API contracts/UX) 5 questions, hybrid 409 shape + visible-but-disabled UI + yellow triage banner + clear-then-set transfer ordering applied, backfill bookend kinds deferred; G2 marker scan clean throughout |
| Plan | `$speckit-plan` | Complete | 2026-05-01 generated 7 artifacts (1328 lines): plan.md, research.md (8 resolved topics R-001..R-008), data-model.md, quickstart.md, contracts/{projects-put,github-connect,activities-shapes}.md. Constitution check: 12 PASS / 3 N/A / 0 violations. G3 passed with 0 markers. |
| Checklist | `$speckit-checklist` | Complete | All 4 domains complete 2026-05-01: data-integrity (60 items, 9 gaps remediated), regression-safety (58 items, 15 gaps remediated, FR-052..056 added), error-handling (70 items, 14 gaps remediated, FR-027b added), api-contracts (75 items, 16 gaps remediated, FR-057..064 added). G4 marker scan clean throughout. No consensus escalations across all 4 domains. |
| Tasks | `$speckit-tasks` | Complete | 2026-05-01 generated tasks.md: 88 tasks across 10 phases, 51 [T-RED] tests, 53 [P] parallel markers, all 9 P5-ACs covered, all FR-001..064 referenced. G5 passed. |
| Analyze | `$speckit-analyze` | Complete | 2026-05-01 ran cross-artifact analyze: 7 findings (1C/3H/3M/0L). 5 substantive drift fixes applied (NOT NULL contradiction in data-model removed; throttle SQL `>=`; activity-kinds 3→4; P5-AC8/9 clarified as spec-internal; cache key alignment to slugToProjectId). 2 informational items confirmed non-issues. G6 passed: 0 CRITICAL/HIGH after remediation. No consensus escalation. |
| Implement | `$speckit-implement` | Complete | 2026-05-01 all user stories landed: T001-T007 (foundation: strict-scope guard, M62 migration with 4 nullable columns + 4 indexes + deterministic owner backfill, AREA_LABEL_MAP with 12 WCAG-AA-700 colors); T008-T019 (US1 flag-OFF parity, FR-052/053/054 wiring, EXPLAIN QUERY PLAN snapshots, writeAreaRoutingActivity helper); T020-T032 (US2 sync ownership: PUT validation, hybrid 409 shape, transfer_owner clear-then-set transaction with SQLite UNIQUE-immediate proof, validation precedence FR-057, 409 priority FR-058, idempotent re-assertion FR-059); T033-T037 (US3 triage project exclusivity + UI + no-triage banner); T038-T049 (US4 area routing: loadAreaRoutingCache, parseAreaLabels, resolveAreaRouting with all 4 reasons, FR-016/017 outbound emission); T050-T060 (US5 auto-backfill: per-task transactions, monotonic backfilled_at marker, first-flag-on bootstrap, idempotent resume); T061-T070 (US6 visible-but-disabled UI when flag OFF per FR-040a); T071-T076 (US7 label provisioning: ON-branch + FR-060 PUT-route trigger + FR-027a sanitization + FR-027b structured log + throttled label_provisioning_failed activity); T077-T088 (polish: docs/github-sync.md, runbook preflight, openapi.json snapshot test). Final verification: pnpm typecheck zero errors; pnpm lint zero errors; pnpm test 124 files / 1228 tests / 0 regressions vs baseline; strict-scope guard passes (no new TS/TSX modules). |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G0 | After Archive Sweep | Prior merged specs are archived or dry-run evidence is recorded; no `SPEC-006` cleanup occurs |
| G1 | After Specify | Requirements define flag-OFF parity, repo-level sync ownership, area:* routing (single/multi/none/no-match), triage project semantics, outbound emission, label provisioning, one-time auto-backfill, activity log shape, project settings API/UI, documentation refresh — with no unresolved markers |
| G2 | After Clarify | Ambiguities in backfill resumption mechanism, static AREA_LABEL_MAP contents, area_slug/is_triage_project conflict, sync-owner deletion lifecycle, `initializeLabels` rate-limit recovery, and migration ordering vs. SPEC-004 are resolved |
| G3 | After Plan | Constitution gates pass; strict scope stays N/A; dependencies, implementation seams, tests, and rollback strategy are concrete; M62/M63 ordering reconciled with SPEC-004 |
| G4 | After Checklist | All data-integrity, regression-safety, error-handling, and api-contracts gaps are resolved |
| G5 | After Tasks | P5-AC1 through P5-AC7 have task coverage and dependency order is implementable |
| G6 | After Analyze | No CRITICAL/HIGH findings; tasks do not drift into SPEC-004 (pipeline engine), SPEC-007 (artifacts), SPEC-008 (governance), or SPEC-009 (pilot) behavior |
| G7 | After Implement | Focused tests, typecheck, lint, build, e2e or justified subset, guardrail greps, docs status, and branch push are complete |

---

## Prerequisites

### Constitution Validation

Before starting any phase, verify alignment with `.specify/memory/constitution.md`, `docs/rc-factory-v1-prd.md`, and `docs/ai/rc-factory-technical-roadmap.md`.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| Spec execution order | `SPEC-001`, `SPEC-002`, `SPEC-002A` are complete on `main` before this worktree starts; SPEC-003 already complete on main; SPEC-004 in flight in a parallel worktree | Roadmap and `origin/main` show prior specs complete |
| Feature-flag default OFF | `FEATURE_AREA_LABEL_ROUTING=false` preserves current per-project sync behavior byte-for-byte | Focused poller and engine regression tests with flag OFF |
| Null-default safety | With flag ON, projects with NULL `area_slug` and workspaces with no `is_triage_project` continue to operate without thrash; legacy unique constraint `(workspace_id, github_repo, github_issue_number)` remains the inbound dedupe guardrail | Migration tests, integration tests with mixed flag/null states |
| Strict scope | All changes live in existing files: `src/lib/github-sync-engine.ts`, `src/lib/github-label-map.ts`, `src/lib/github-sync-poller.ts`, `src/lib/migrations.ts`, `src/app/api/projects/[id]/route.ts`, project settings TSX panel | Strict-scope grep: no new `github-area-routing*.ts`, no new admin panel TSX |
| Feature flag wiring | `FEATURE_AREA_LABEL_ROUTING` is read only via `resolveFlag(name, ctx)` from SPEC-002 with `{ workspaceId }` context | Guardrail grep for inline `process.env.FEATURE_AREA_LABEL_ROUTING` |
| Package manager | Use pnpm only | Lockfile is `pnpm-lock.yaml`; use `pnpm` commands |
| Archive Sweep | Archive discovery runs before Phase 0/prerequisites and excludes the current target | Archive report records candidates and `safeToApplyCleanup` state |

**Constitution Check:** Pending. Verify at Phase 1 start.

### Archive Sweep

SPEC-002A made Archive Sweep a required autopilot startup step. For this workflow:

- Previous merged candidates: `SPEC-001`, `SPEC-002`, `SPEC-002A`, `SPEC-003`.
- Current target excluded: `SPEC-006` / `specs/006-area-label-github-sync`.
- Co-active worktree to leave alone: `specs/004-task-pipeline-engine` (in flight in a parallel worktree); SPEC-004 is not yet merged and is not a sweep candidate.
- Cleanup policy: dry-run-only or stop unless a clean safe base branch records `safeToApplyCleanup=true`, archive success, merge/tree references, and recovery commands.
- No source spec folder is deleted silently by setup or by this workflow.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-006 |
| Name | Area-Label GitHub Sync |
| Branch | `006-area-label-github-sync` |
| Dependencies | SPEC-001 (Foundation Migrations), SPEC-002 (Product Line Switcher / `resolveFlag(name, ctx)`), SPEC-002A (Spec Archive process) |
| Coexists with | SPEC-004 (Task Pipeline Engine) — migration ordering reconciled at rebase |
| Enables | SPEC-009 (Product Line A Pilot end-to-end smoke) |
| Priority | P1 |
| Tool count / tool names | N/A; not a tool-surface spec |
| Tool metadata | `tools: []` |
| Strict Scope | N/A — only existing-file edits and one new docs file (`docs/github-sync.md`); no new TS/TSX modules |
| Status Authority | Roadmap + this workflow are execution-status authority |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` (Phase 5) |
| Feature flag | `FEATURE_AREA_LABEL_ROUTING` (`activationScope: 'productLineWorkspace'`, `defaultValue: false`, `requiresPreflight: true`, already registered in `src/lib/feature-flags.ts`) |

### Scope Summary

Implement RC Factory Phase 5:

- Add feature-flagged `area:*` label routing so a single product-line monorepo can serve multiple department kanbans (Dev, QA, Infra, Docs, etc.) without duplicate polling, with explicit per-`(workspace_id, github_repo)` sync ownership.
- Add three additive nullable columns on `projects` via M62 (or next available migration id, reconciled with SPEC-004's M62): `area_slug TEXT NULL`, `is_triage_project BOOLEAN DEFAULT 0`, `is_repo_sync_owner BOOLEAN DEFAULT 0`. Migration backfills `is_repo_sync_owner=1` for `MIN(projects.id)` per `(workspace_id, github_repo)` group with `github_sync_enabled=1`. Migration adds index on `(workspace_id, area_slug)` and partial unique indexes `(workspace_id, github_repo) WHERE is_repo_sync_owner=1` and `(workspace_id) WHERE is_triage_project=1`.
- Extend `src/lib/github-sync-poller.ts` to filter `WHERE is_repo_sync_owner=1` when `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })` is true; preserve current per-project polling behavior when the flag is OFF.
- Add inbound routing in `pullFromGitHub` (`src/lib/github-sync-engine.ts`): build a per-sync-call `Map<area_slug, project_id>` plus `triageProjectId` once at sync start; for each issue, parse `area:*` labels; if exactly one resolvable area, set `task.project_id = resolvedProjectId`; if zero/multi/no-match, route to triage project (or fall back to sync-owner project if no triage project is designated, recording `reason='no_triage'`). Record `area_routing_resolved` or `area_routing_unresolved` activity per task on first ingest only; do not re-route on subsequent label changes.
- Add outbound emission in `pushTaskToGitHub`: emit `area:<projects.area_slug>` alongside `mc:*` and `priority:*` only when `area_slug` is non-NULL. Triage project (if `area_slug='triage'`) emits `area:triage`. Projects without `area_slug` set emit no `area:*` label.
- Extend `initializeLabels(repo)` to `initializeLabels(repo: string, workspaceId?: number)`. When `workspaceId` is provided, also create the `area:*` defaults from `AREA_LABEL_MAP` plus any non-NULL `projects.area_slug` values for that workspace not already in the static map. Existing labels with different color/description are left alone (non-destructive idempotency). Call sites: existing `POST /api/github` connect path (extended with `workspaceId`); `PUT /api/projects/[id]` when `area_slug` or `is_triage_project` transitions to a new value; first sync poll after `FEATURE_AREA_LABEL_ROUTING` resolves true for a workspace (one-shot bootstrap, recorded in `workspaces.feature_flags JSON`). Subsequent polls do NOT re-run `initializeLabels`. GitHub API rate-limit / network errors are caught and logged; sync proceeds without aborting.
- Add static `AREA_LABEL_MAP` in `src/lib/github-label-map.ts` with curated defaults — the exact list is reconciled in Clarify session 1 from current operator practice and the existing palette. Provisional defaults: `qa`, `dev`, `design`, `infra`, `security`, `docs`, `ops`, `frontend`, `backend`, `data`, `ml`, `triage`. Add `areaLabelsForWorkspace(db, workspaceId)` returning the union of static defaults plus workspace-specific `area_slug` values. Export `ALL_AREA_LABEL_NAMES` covering the static defaults.
- Add automatic one-time backfill on first flag-on per workspace via a new function `backfillAreaRouting(db, workspaceId)` in `src/lib/github-sync-engine.ts`. The backfill runs from the sync-owner project's poller invocation when `workspaces.feature_flags JSON.area_label_routing_backfill_completed_at` is NULL. It iterates `tasks WHERE workspace_id=? AND github_issue_number IS NOT NULL` for repos owned by `is_repo_sync_owner=1` projects in that workspace, parses each task's stored GitHub labels, and re-routes per the same rules used for fresh ingest: single resolvable area → resolved project; multi/none/no-match → triage (or sync-owner fallback). Each task move is its own transaction (SELECT, resolve area, UPDATE `tasks.project_id`, INSERT activity with `source='backfill'`, COMMIT). Failures are logged per task and do NOT abort the run. The completion marker `workspaces.feature_flags.area_label_routing_backfill_completed_at` is set last; if interrupted, the next flag-on poll resumes idempotently — already-evaluated tasks are skipped via either `tasks.area_routing_backfilled_at TIMESTAMP NULL` (added by the same migration) OR by checking the activity log. The mechanism is reconciled in Clarify session 1.
- Add validation in `PUT /api/projects/[id]` for the three new fields: `area_slug` matches `^[a-z0-9-]{1,32}$` or is NULL; `(workspace_id, area_slug)` is unique when non-NULL; `is_triage_project=1` is exclusive per `workspace_id`; `is_repo_sync_owner=1` is exclusive per `(workspace_id, github_repo)` and rejects setting without `transfer_owner=true` if another project in the group already holds it (returns 409 with the existing owner id). On transitions of `area_slug` or `is_triage_project`, trigger `initializeLabels(repo, workspaceId)` for the workspace's repos that have `is_repo_sync_owner=1`.
- Extend the existing project settings TSX panel to expose the three optional fields with inline validation feedback for collisions. No new TSX modules.
- Add new `docs/github-sync.md` covering the full sync model: connect/disconnect, label initialization, polling, inbound issue handling, outbound task push, area:* routing, sync ownership election and transfer, triage project, area_slug, auto-backfill semantics, recovery, and rollback. Update `docs/feature-flags-runbook.md` to add the `FEATURE_AREA_LABEL_ROUTING` preflight checklist (verify `area_slug` set on at least one project, verify exactly one `is_repo_sync_owner=1` per `(workspace_id, github_repo)`, designate triage project if expected, confirm backfill expectations). Update `docs/orchestration.md` if it has a project-routing section.
- Test coverage:
  - Unit tests in `src/lib/__tests__/github-sync-engine.test.ts` (extended) and `src/lib/__tests__/github-label-map.test.ts` (new or extended) covering: `area:*` label parsing alongside `mc:*`/`priority:*`, single-match resolution, multi-label fallback to triage, no-label fallback to triage, no-match fallback to triage, no-triage fallback to sync owner with activity, `is_repo_sync_owner` gating in poller selection query, outbound emission with/without `area_slug`, `initializeLabels(repo, workspaceId)` non-destructive idempotency, per-sync cache correctness across many issues, `backfillAreaRouting` per-task transaction semantics, idempotent resume after partial backfill, AREA_LABEL_MAP snapshot.
  - Integration tests with the existing mocked GitHub client pattern: full `pullFromGitHub` cycle with mixed-label issue set; full `pushTaskToGitHub` cycle for tasks in `area_slug='qa'`, `area_slug='triage'`, and NULL-area-slug projects; auto-backfill on first flag-on for a workspace with pre-existing tasks.
  - Playwright e2e verifying `area_slug`, `is_triage_project`, `is_repo_sync_owner` editable in the project settings panel under Product Line scope, including validation feedback for collisions and the 409 transfer flow.

### Known Reference Surface

- `src/lib/github-sync-engine.ts` — `initializeLabels(repo)` extension, `pullFromGitHub` inbound routing addition, `pushTaskToGitHub` outbound area label addition, new `backfillAreaRouting(db, workspaceId)` function, per-sync `loadAreaRoutingCache(db, workspaceId)` helper.
- `src/lib/github-sync-poller.ts` — owner filter when flag resolves true; first-flag-on bootstrap that runs `initializeLabels` and `backfillAreaRouting` once per workspace.
- `src/lib/github-label-map.ts` — `AREA_LABEL_MAP`, `areaLabelsForWorkspace(db, workspaceId)`, `ALL_AREA_LABEL_NAMES`.
- `src/lib/migrations.ts` — adds `projects.area_slug TEXT NULL`, `projects.is_triage_project BOOLEAN DEFAULT 0`, `projects.is_repo_sync_owner BOOLEAN DEFAULT 0`, `tasks.area_routing_backfilled_at TIMESTAMP NULL` (if Clarify session 1 picks the column-based resume), index on `(workspace_id, area_slug)`, partial unique indexes for owner and triage flags, owner backfill SELECT/UPDATE.
- `docs/migrations/rollback-M62.sql` (or next migration id) — drops added columns, indexes.
- `src/lib/feature-flags.ts` — `FEATURE_AREA_LABEL_ROUTING` is already registered with `activationScope: 'productLineWorkspace'`. Use `resolveFlag(name, { workspaceId })`.
- `src/app/api/projects/[id]/route.ts` — extended PUT handler for the three new fields with validation; trigger `initializeLabels` on `area_slug`/`is_triage_project` transitions.
- `src/app/api/github/route.ts` — call site for `initializeLabels`; extended to pass `workspaceId`.
- Project settings TSX panel — extended with three optional fields (existing-file edit; the autopilot identifies the exact file in the Plan phase).
- `src/lib/__tests__/github-sync-engine.test.ts` and `src/lib/__tests__/github-label-map.test.ts` — extended/new test files.
- E2E test under `tests/e2e/` (existing pattern) for project settings UI flow.
- `docs/github-sync.md` (new) — primary sync documentation.
- `docs/feature-flags-runbook.md` — `FEATURE_AREA_LABEL_ROUTING` preflight checklist.
- `docs/orchestration.md` — pointer to `docs/github-sync.md` if it has a project-routing section.

### Success Criteria Summary

- [ ] P5-AC1: With `FEATURE_AREA_LABEL_ROUTING` OFF, GitHub sync behaves byte-identical to today: every project with `github_sync_enabled=1` polls its own repo, no `area:*` parsing on inbound, no `area:*` emission on outbound, no `is_repo_sync_owner` filter applied. New columns are nullable and irrelevant to runtime behavior.
- [ ] P5-AC2: With the flag ON, two or more projects sharing the same `(workspace_id, github_repo)` do not duplicate-poll or duplicate-ingest the same GitHub issue. Only the project with `is_repo_sync_owner=1` polls; other projects in the group passively receive routed tasks.
- [ ] P5-AC3: With the flag ON, new issues with exactly one resolvable `area:*` label route to the corresponding project. `area:qa` → project with `area_slug='qa'`; `area:dev` → project with `area_slug='dev'`; etc. An `area_routing_resolved` activity is recorded with `source='ingest'`.
- [ ] P5-AC4: With the flag ON, new issues with no `area:*` label route to the workspace's `is_triage_project=1` project (or sync-owner project if absent) with an `area_routing_unresolved` activity, `reason='no_label'`, and an `area:triage` tag tracked in MC. The activity is recorded with `source='ingest'`.
- [ ] P5-AC5: With the flag ON, new issues with multiple `area:*` labels route to triage (or sync-owner fallback) with an `area_routing_unresolved` activity, `reason='multi_label'`. Subsequent label changes on GitHub do NOT re-route the task between projects (no thrash). The decision is sticky to the initial ingest.
- [ ] P5-AC6: With the flag ON, `pushTaskToGitHub` emits `area:<projects.area_slug>` alongside `mc:*` and `priority:*` only when `area_slug` is non-NULL. Triage project (if `area_slug='triage'`) emits `area:triage`. Projects with NULL `area_slug` do not emit any `area:*` label.
- [ ] P5-AC7: `initializeLabels(repo, workspaceId)` is idempotent — repeated invocations on the same repo do not overwrite existing label color/description and do not duplicate labels. Rate-limit / network failures are caught, logged, and do not abort the calling sync. Re-invocation creates only missing labels.
- [ ] P5-AC8 (process): Auto-backfill runs once per workspace on first flag-on. Per-task transactions; partial-progress recovery via the resume mechanism resolved in Clarify session 1; completion marker set last in `workspaces.feature_flags JSON.area_label_routing_backfill_completed_at`; idempotent on rerun.
- [ ] P5-AC9 (process): `PUT /api/projects/[id]` accepts and validates `area_slug`, `is_triage_project`, `is_repo_sync_owner` with the rules listed above; project settings TSX panel exposes the three fields and surfaces validation errors; the 409 transfer flow for `is_repo_sync_owner` works.

---

## Phase 1: Specify

**When to run:** Start here. Output: `specs/006-area-label-github-sync/spec.md`.

**Existing branch guard:** This workflow already runs on `006-area-label-github-sync`. Before `$speckit-specify`, verify `git rev-parse --abbrev-ref HEAD` is `006-area-label-github-sync`, set `GIT_BRANCH_NAME=006-area-label-github-sync` and `SPECIFY_FEATURE_DIRECTORY=specs/006-area-label-github-sync` if the executor supports them, and skip or run the `before_specify` git feature hook only in existing-branch mode (`--allow-existing-branch`). If the executor would create or switch to another branch, stop before Specify.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-006 Area-Label GitHub Sync

Create a specification for RC Factory Phase 5 in Mission Control.

### Problem Statement

Mission Control's GitHub sync is currently project-driven: every project with `github_sync_enabled=1` polls its own `(workspace_id, github_repo)`. This works when each repo maps to one project, but breaks down when a single product-line monorepo serves multiple department kanbans (Dev, QA, Infra, Docs, etc.). Two independent failures arise:
1. Multiple projects polling the same repo can attempt to ingest the same issue, hitting the unique constraint `(workspace_id, github_repo, github_issue_number)` and producing inconsistent ownership.
2. There is no mechanism for a GitHub issue to declare which department it belongs to, so the project that ingests first claims it regardless of intent.

SPEC-001 added the workspace `feature_flags JSON` storage, the additive-migration pattern, and the workflow-template scope context. SPEC-002 added `resolveFlag(name, { workspaceId })` and Product Line scope. SPEC-002A established the additive-migration policy and archive sweep. SPEC-006 builds on those to add `area:*` label routing and explicit repo-level sync ownership.

`FEATURE_AREA_LABEL_ROUTING` is already registered in `src/lib/feature-flags.ts` with `activationScope: 'productLineWorkspace'`, `defaultValue: false`, `requiresPreflight: true`, `riskTier: 'high'`. With the flag OFF in a workspace, every behavior must be byte-identical to today.

### Users

- Existing operator: needs current per-project sync behavior preserved when `FEATURE_AREA_LABEL_ROUTING` is OFF.
- Product-line operator with a shared monorepo: needs department kanbans (Dev/QA/Infra/Docs) to receive only the issues labeled for their area, with one repo poller per workspace.
- Issue triager: needs unlabeled or ambiguously-labeled issues to land in a designated triage project with an audit trail rather than being silently routed to whichever project polled first.
- Downstream spec executor (SPEC-009 Product Line A pilot): needs area:* routing functional so the pilot's monorepo can fan out to multiple stages without operator hand-routing.

### User Stories

- US1: As an existing operator, I can leave `FEATURE_AREA_LABEL_ROUTING` OFF and observe no behavior change in inbound GitHub ingestion, outbound task push, label initialization, polling cadence, or activity log shape.
- US2: As a product-line operator, I can designate one project per `(workspace_id, github_repo)` as the sync owner so that only one poll happens per repo when multiple projects share it.
- US3: As an issue triager, I can rely on a designated `is_triage_project=1` project to receive issues with no `area:*` label, multiple `area:*` labels, or unresolvable `area:*` labels, with an audit-trail activity recording the routing decision.
- US4: As a department lead, I can label a project with `area_slug='qa'` and have GitHub issues with `area:qa` route to my project on initial ingest only, without the task moving between projects on subsequent label changes (no thrash).
- US5: As a workspace operator enabling the flag for the first time, I can see existing GitHub-synced tasks be re-evaluated and routed to the correct area projects (or triage) automatically, with a visible activity log per move and an idempotent completion marker.
- US6: As a security and rollout reviewer, I can verify the migration is additive only (nullable columns), the rollback is column drops + flag OFF, and `initializeLabels` failures (rate limit, network) do not abort sync.

### Functional Requirements

- Add `FEATURE_AREA_LABEL_ROUTING` runtime behavior through `resolveFlag(name, ctx)` only; do not add inline `process.env.FEATURE_AREA_LABEL_ROUTING` reads.
- Add migration M62 (or next available id, reconciled with SPEC-004's M62 at rebase time) to:
  - Add `projects.area_slug TEXT NULL`
  - Add `projects.is_triage_project BOOLEAN DEFAULT 0`
  - Add `projects.is_repo_sync_owner BOOLEAN DEFAULT 0`
  - Add `CREATE INDEX IF NOT EXISTS idx_projects_workspace_area_slug ON projects(workspace_id, area_slug)`
  - Add `CREATE UNIQUE INDEX idx_projects_one_sync_owner_per_repo ON projects(workspace_id, github_repo) WHERE is_repo_sync_owner=1`
  - Add `CREATE UNIQUE INDEX idx_projects_one_triage_per_workspace ON projects(workspace_id) WHERE is_triage_project=1`
  - Backfill `is_repo_sync_owner=1` for `MIN(projects.id)` per `(workspace_id, github_repo)` group with `github_sync_enabled=1`
  - Decide between `tasks.area_routing_backfilled_at TIMESTAMP NULL` for resume tracking vs. activity-log lookup — answered in Clarify session 1
- Provide `docs/migrations/rollback-M62.sql` (or matching migration id) that drops the columns and indexes.
- Extend `src/lib/github-sync-poller.ts` so that, when `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })` returns true for a workspace, the poller selects only projects with `is_repo_sync_owner=1` for that workspace's repos. When the flag is false, the existing per-project selection is unchanged. The poller also performs a one-shot bootstrap per workspace on first flag-on: invoke `initializeLabels(repo, workspaceId)` for each owned repo and run `backfillAreaRouting(db, workspaceId)` if the completion marker is unset.
- Extend `src/lib/github-sync-engine.ts`:
  - Add `loadAreaRoutingCache(db, workspaceId)` that returns `{ areaToProjectId: Map<string, number>, triageProjectId: number | null }` from a single query.
  - In `pullFromGitHub`, build the cache once per invocation, then for each issue: parse `area:*` labels (lowercase, prefix-stripped); compute `resolved`:
    - exactly one match in `areaToProjectId` → resolved to that project_id, `reason='single_match'`
    - zero `area:*` labels → resolved to `triageProjectId`, `reason='no_label'` (or sync-owner fallback if `triageProjectId === null`, `reason='no_triage'`)
    - multiple `area:*` labels (any count > 1, regardless of resolvability) → resolved to `triageProjectId` (or sync-owner fallback), `reason='multi_label'`
    - exactly one `area:*` label that does not match any `area_slug` → resolved to `triageProjectId` (or sync-owner fallback), `reason='no_match'`
  - On first ingest only (no existing task for `(workspace_id, github_repo, github_issue_number)`), set `task.project_id = resolved.project_id` and INSERT the corresponding activity (`area_routing_resolved` for `single_match`, `area_routing_unresolved` for the rest). On subsequent syncs of an existing task, do NOT change `task.project_id` regardless of label changes.
  - In `pushTaskToGitHub`, emit `area:<projects.area_slug>` alongside `mc:*`/`priority:*` only when the resolved project's `area_slug` is non-NULL.
  - Extend `initializeLabels(repo: string, workspaceId?: number)`. When `workspaceId` is provided, fetch `areaLabelsForWorkspace(db, workspaceId)` and call the GitHub create-label API for each label not already present. Existing labels with different color/description are not modified. Rate-limit / 4xx / network errors are caught per-label and logged; the function continues and returns even on partial failure.
  - Add `backfillAreaRouting(db, workspaceId)`. The function reads tasks with `workspace_id=? AND github_issue_number IS NOT NULL` for repos owned by `is_repo_sync_owner=1` projects in the workspace, parses each task's stored GitHub labels, and re-evaluates routing. Each task move is its own transaction (SELECT, resolve, UPDATE `tasks.project_id`, INSERT activity, COMMIT). Failures are caught and counted per-task. The completion marker is set last in `workspaces.feature_flags JSON.area_label_routing_backfill_completed_at`. Already-evaluated tasks are skipped via the resume mechanism resolved in Clarify session 1.
- Extend `src/lib/github-label-map.ts`:
  - Add `AREA_LABEL_MAP: Record<string, LabelDef>` covering curated defaults; the exact contents are reconciled in Clarify session 1.
  - Add `areaLabelsForWorkspace(db, workspaceId): LabelDef[]` returning the union of `AREA_LABEL_MAP` values plus `LabelDef`s synthesized from non-NULL `projects.area_slug` values not already in the static map.
  - Export `ALL_AREA_LABEL_NAMES` covering the static defaults only (parallel to `ALL_STATUS_LABEL_NAMES`).
- Extend `src/app/api/projects/[id]/route.ts` PUT handler:
  - Accept optional `area_slug`, `is_triage_project`, `is_repo_sync_owner`, `transfer_owner` fields.
  - Validate `area_slug` matches `^[a-z0-9-]{1,32}$` or is NULL.
  - Validate `(workspace_id, area_slug)` is unique when non-NULL (return 409 with the conflicting project id).
  - Validate `is_triage_project=1` is exclusive per `workspace_id` (return 409 with the existing triage project id; require explicit unset or transfer flow).
  - Validate `is_repo_sync_owner=1` is exclusive per `(workspace_id, github_repo)`. If another project already holds it, require `transfer_owner=true` in the request body to perform the swap (clear the previous owner and set the new owner) in one transaction. Without `transfer_owner=true`, return 409 with the existing owner id.
  - On transitions of `area_slug` or `is_triage_project` to a new value (or first-set), call `initializeLabels(repo, workspaceId)` for every repo owned by `is_repo_sync_owner=1` projects in that workspace.
  - Operator-only authorization remains as today.
- Extend the existing project settings TSX panel to expose the three optional fields (text input for `area_slug` with regex validation feedback, two checkboxes for the booleans). Surface 409 validation errors inline. No new TSX modules.
- Add `src/app/api/github/route.ts`'s existing `initializeLabels(repo)` call to also pass the resolved `workspaceId` so area labels are created on connect.
- Add new `docs/github-sync.md` covering: connect/disconnect, label initialization (mc/priority/area), per-project polling vs. owner-based polling, inbound issue handling (dedupe, area routing, triage, no-thrash on subsequent syncs), outbound task push (mc/priority/area), `is_repo_sync_owner` election and transfer, `is_triage_project` designation, `area_slug` configuration, auto-backfill on first flag-on, recovery procedures, and rollback (flip flag OFF; columns remain but ignored).
- Update `docs/feature-flags-runbook.md` with a `FEATURE_AREA_LABEL_ROUTING` preflight checklist.
- Update `docs/orchestration.md` if it has a project-routing section to point at the new doc.
- Activity log: `activities.kind='area_routing_resolved'` for single-match successes; `activities.kind='area_routing_unresolved'` for `no_label`, `multi_label`, `no_match`, `no_triage`. `activities.data` includes `area_labels: string[]`, `resolved_project_id: number | null`, `reason`, `source: 'ingest' | 'backfill'`, `github_issue_number`, `workspace_id`, `github_repo`.
- Tests: cover every P5-AC plus the listed unit/integration/e2e items. Coverage budget at G7: every P5-AC has at least one direct assertion.

### Constraints

- Use pnpm only.
- All changes live in existing files. No new TS/TSX modules. The only new file is `docs/github-sync.md`.
- Migration is additive only. No column drops, no destructive ALTERs. Rollback is column drops + index drops + flag OFF; the rollback SQL is committed alongside the migration.
- Migration id reconciliation with SPEC-004 happens at rebase time. If SPEC-004 ships first as M62, this spec uses M63 (or next available); the migration body is unchanged.
- Do not introduce a new `github-area-routing.ts` module, a `github-area-backfill.ts` module, or a new `area-routing-admin-panel.tsx` panel. Strict scope guardrails reject these paths.
- Do not change the legacy unique constraint `(workspace_id, github_repo, github_issue_number)`; it remains the inbound dedupe guardrail.
- Do not implement SPEC-004 task-pipeline behavior, SPEC-005 ready_for_owner state, SPEC-007 disposition / artifact behavior, SPEC-008 governance enforcement, SPEC-009 pilot seed behavior, SPEC-010 product-line-B onboarding, or SPEC-011 CrabTrap.
- Do not change Aegis review semantics — SPEC-003 owns that surface.
- Do not change existing `mc:*` or `priority:*` label generation.

### Out of Scope

- Multi-repo product-line sync (one repo per workspace assumption holds).
- Per-issue priority routing or per-issue assignee routing based on labels.
- Webhook-driven inbound sync (polling-based only, matching today's behavior).
- Custom label colors / palettes per workspace beyond the AREA_LABEL_MAP defaults.
- Operator-facing analytics dashboards for routing decisions (the activity log is the surface).
- Automatic ownership transfer on owner project deletion — operator must reassign explicitly. (Clarify session 2 may revisit this.)
- Re-routing tasks on subsequent GitHub label changes (route on initial ingest only).
- Backfill of repos that were never polled before flag-on (the existing constraint scopes backfill to tasks already in MC).
```

### Specify Results

Pending. Fill in after running.

| Metric | Value |
|--------|-------|
| Functional Requirements | |
| User Stories | |
| Acceptance Scenarios | |
| Acceptance Criteria | P5-AC1 through P5-AC9 |
| G1 Clarification Markers | |

### Files Generated

- [ ] `specs/006-area-label-github-sync/spec.md`
- [ ] `specs/006-area-label-github-sync/checklists/requirements.md`

### Traceability Markers

| Marker | Purpose |
|--------|---------|
| US1 | Flag-OFF byte-identical regression |
| US2 | Repo-level sync ownership |
| US3 | Triage project + activity audit |
| US4 | Area routing on initial ingest only |
| US5 | Auto-backfill on first flag-on |
| US6 | Migration safety + failure isolation |
| P5-AC1..P5-AC9 | Roadmap acceptance criteria |
| FR-FLAG | `FEATURE_AREA_LABEL_ROUTING` and `resolveFlag()` behavior |
| FR-MIGRATE | M62/M63 migration + rollback |
| FR-OWNER | `is_repo_sync_owner` election + transfer |
| FR-ROUTE | Inbound `area:*` resolution |
| FR-EMIT | Outbound `area:<area_slug>` emission |
| FR-LABEL | `initializeLabels` extension + `AREA_LABEL_MAP` |
| FR-BACKFILL | `backfillAreaRouting` + completion marker |
| FR-API | `PUT /api/projects/[id]` validation |
| FR-UI | Project settings TSX panel |
| FR-DOCS | `docs/github-sync.md` + runbook update |

---

## Phase 2: Clarify

**When to run:** After Specify if generated artifacts introduce ambiguity or drift. Sessions encode the design concept and roadmap decisions, not reopen already-decided scope without evidence. Reference the design concept doc at `docs/ai/specs/SPEC-006-design-concept.md` for the operator-confirmed positions; clarify only the questions in its Open Questions section unless the spec body introduces new ambiguity.

**Best Practice:** Maximum 5 targeted questions per Clarify session.

### Clarify Prompts

#### Session 1: Schema, Migration, and Backfill Resume

```bash
$speckit-clarify

Focus on schema-and-backfill correctness for SPEC-006:

- Open Question 1 (resume mechanism): Per-task transaction + completion marker is settled (design concept Q17). What is the per-task resume marker? Recommend `tasks.area_routing_backfilled_at TIMESTAMP NULL` (added in the same migration) over activity-log lookup. The column gives O(1) skip; the activity-log path is O(activities) per task and harder to test deterministically. Confirm the column adds and document the indexed lookup pattern.
- Open Question 7 (migration ordering vs. SPEC-004): SPEC-004 reserves M62 for the partial unique index `idx_tasks_one_successor_per_parent`. SPEC-006's migration adds three new `projects` columns and indexes plus the optional `tasks.area_routing_backfilled_at`. At rebase time, whichever spec lands first keeps M62; the other becomes M63. Confirm the rule and codify it in `docs/migrations/migration-id-reservations.md` (or equivalent) so future specs do not collide.
- Open Question 2 (static AREA_LABEL_MAP exact contents): Confirm the precise list and label colors. Recommend `qa, dev, design, infra, security, docs, ops, frontend, backend, data, ml, triage` with colors drawn from the existing palette in github-label-map.ts (priority and status colors). Each label has a one-line description. The list is a hard constant; new departments are added either via static-map updates (code change) or via setting `area_slug` on a project (dynamic augmentation).
- Open Question 8 (unique constraint after backfill): Backfill changes `tasks.project_id` but does not touch the unique constraint key `(workspace_id, github_repo, github_issue_number)`. Confirm no constraint violation can occur during backfill. Add an explicit integration test for the worst-case scenario: same-repo task moves between projects within a workspace.
- Validation rule for `area_slug`: confirm the regex `^[a-z0-9-]{1,32}$` (no leading/trailing hyphen, no double hyphen?). Recommend stricter `^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$` (1-32 chars, alphanumeric start and end, single hyphens allowed in the middle).
```

#### Session 2: Lifecycle, Failure Isolation, Conflict Semantics

```bash
$speckit-clarify

Focus on lifecycle correctness and failure isolation for SPEC-006:

- Open Question 4 (sync-owner deletion / disable): When the sync-owner project is deleted or has `github_sync_enabled` flipped to 0, what happens? Recommend automatic re-election to the next-oldest project with `github_sync_enabled=1` in the same `(workspace_id, github_repo)` group on the next poll cycle; if none exist, sync stops for that repo and an activity is recorded (`area_routing_unresolved` with `reason='no_owner'`, or a new `kind='sync_owner_lost'`). Reconcile with the partial unique index — the index does not prevent zero owners, only multiple. Define whether the re-election runs at deletion time (synchronously in the DELETE transaction) or lazily on next poll.
- Open Question 5 (initializeLabels rate-limit recovery): Q13 says failures are caught and logged with sync proceeding. Should the engine record an `area_routing_unresolved` activity with a `reason='label_provisioning_failed'` to make the failure visible? Recommend yes — record one activity per workspace per failure, throttled to one per 24 hours by checking the activity log before insert. This avoids log spam during sustained rate-limit windows while keeping the failure visible.
- Open Question 3 (`area_slug='triage'` vs `is_triage_project=0`): If a project has `area_slug='triage'` but `is_triage_project=0`, what is the routing semantics? Recommend `area:triage` always routes through `is_triage_project=1` regardless of `area_slug` matches; a non-triage project with `area_slug='triage'` is allowed but inert for inbound routing (operator footgun). Outbound from such a project would still emit `area:triage`. Alternative: reject `area_slug='triage'` on non-triage projects in PUT validation; harder DX but explicit.
- Open Question 6 (no `area_slug` outbound behavior): Confirm the design concept Q6 decision: projects with NULL `area_slug` and flag ON emit no `area:*` label outbound. Do NOT fall back to `mc:no-area`. Confirm this remains the position.
```

#### Session 3: API Contracts and UX Edge Cases

```bash
$speckit-clarify

Focus on API contract behavior and UX edge cases for SPEC-006:

- 409 conflict response shape: Confirm the response body for `is_repo_sync_owner` transfer rejection. Recommend `{ "error": "owner_conflict", "existing_owner_project_id": <id>, "existing_owner_project_slug": "<slug>", "hint": "Set transfer_owner=true to swap ownership in one transaction" }`. Same shape for `is_triage_project` and `area_slug` collisions, with the matching field names.
- transfer_owner atomicity: Confirm the transfer runs in one transaction: clear the previous owner's `is_repo_sync_owner=1` (or set 0), set the new owner's `is_repo_sync_owner=1`, INSERT activity `kind='sync_owner_transferred'` with old/new project ids and operator user. The partial unique index enforces no overlap mid-transaction (SQLite's default deferred-constraint behavior; verify in test).
- Project settings UI loading and disabled state: When `FEATURE_AREA_LABEL_ROUTING` is OFF for the workspace, are the three new fields visible? Recommend visible but disabled with a tooltip "Available after FEATURE_AREA_LABEL_ROUTING is enabled for this workspace" so operators can preview the UI before flag-on. Alternative: hidden until flag is ON.
- Empty state for no triage project on flag ON: When the workspace has no `is_triage_project=1` project, the project settings panel should surface a prominent banner suggesting designation. Recommend a yellow banner above the project list: "No triage project designated. Unresolvable issues will route to the sync-owner project until you designate one." Banner dismisses when any project is set as triage.
- Backfill progress visibility: Operators flipping the flag for a large workspace need feedback that the backfill is running. Recommend surfacing the auto-backfill in the activity log only (per-task activities) plus a single `kind='area_routing_backfill_started'` and `kind='area_routing_backfill_completed'` (with counts: moved-to-area, moved-to-triage, stayed) recorded by `backfillAreaRouting`. No SSE/UI progress bar in this spec.
```

### Clarify Results

Pending. Fill in after running.

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Schema + Migration + Backfill resume | | |
| 2 | Lifecycle + Failure Isolation | | |
| 3 | API Contracts + UX edge cases | | |

---

## Phase 3: Plan

**When to run:** After spec.md is finalized (G2 passed). Generates technical implementation blueprint. Output: `specs/006-area-label-github-sync/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack

- Backend: Next.js 16 App Router API routes (TypeScript 5 strict).
- Frontend: React 19 + TypeScript strict, Tailwind CSS 3, Zustand (existing patterns; no new state libraries).
- Database: SQLite via `better-sqlite3` (single-process; transactions are synchronous).
- HTTP: Native `fetch` for GitHub API (no new dependencies).
- Testing: vitest (unit), Playwright (e2e), existing mocked-GitHub-client harness.
- Package manager: pnpm.

## Architecture Notes

The design concept doc (`docs/ai/specs/SPEC-006-design-concept.md`) is the source of truth for these decisions. Quote the chosen Q answer when it drives a planning choice.

### Modules and seams

- All new logic lives in `src/lib/github-sync-engine.ts`, `src/lib/github-label-map.ts`, `src/lib/github-sync-poller.ts`, `src/lib/migrations.ts`, `src/app/api/projects/[id]/route.ts`, `src/app/api/github/route.ts`, and the existing project settings TSX panel. No new modules. Strict scope stays N/A. (Q14)
- `loadAreaRoutingCache(db, workspaceId)` is a non-exported helper inside `github-sync-engine.ts`. It returns `{ areaToProjectId: Map<string, number>, triageProjectId: number | null }`. Built once per `pullFromGitHub` invocation; lifetime = single sync call. (Q12)
- `backfillAreaRouting(db, workspaceId)` is exported from `github-sync-engine.ts`. Per-task transaction loop. Resume marker resolved in Clarify session 1 (recommended: `tasks.area_routing_backfilled_at TIMESTAMP NULL`). Completion marker `workspaces.feature_flags JSON.area_label_routing_backfill_completed_at` set last. (Q17)
- `areaLabelsForWorkspace(db, workspaceId)` is exported from `github-label-map.ts`. Returns union of `AREA_LABEL_MAP` static defaults plus dynamic per-workspace `area_slug` values. (Q7)

### Data model

- `projects.area_slug TEXT NULL` — index `(workspace_id, area_slug)`. NULL means project is not an area-routing target. (Q3)
- `projects.is_triage_project BOOLEAN DEFAULT 0` — partial unique index `(workspace_id) WHERE is_triage_project=1`. (Q4)
- `projects.is_repo_sync_owner BOOLEAN DEFAULT 0` — partial unique index `(workspace_id, github_repo) WHERE is_repo_sync_owner=1`. Migration backfills `MIN(projects.id)` per group with `github_sync_enabled=1`. (Q1, Q2)
- `tasks.area_routing_backfilled_at TIMESTAMP NULL` — added if Clarify session 1 confirms the column-based resume.
- `workspaces.feature_flags JSON.area_label_routing_backfill_completed_at` — completion marker set by `backfillAreaRouting`. (Q9, Q17)
- `activities.kind` ∈ { `area_routing_resolved`, `area_routing_unresolved` } with `data: { area_labels, resolved_project_id, reason, source, github_issue_number, workspace_id, github_repo }`. (Q10)

### Routing algorithm

Pseudocode (from design concept Q5 and the Specify FRs):

```ts
const cache = loadAreaRoutingCache(db, workspaceId)
for (const issue of fetchedIssues) {
  const areaLabels = issue.labels
    .filter(l => l.name.startsWith('area:'))
    .map(l => l.name.slice('area:'.length).toLowerCase())

  let resolvedProjectId: number | null
  let reason: 'single_match' | 'no_label' | 'multi_label' | 'no_match' | 'no_triage'

  if (areaLabels.length === 0) {
    resolvedProjectId = cache.triageProjectId ?? syncOwnerProjectId
    reason = cache.triageProjectId ? 'no_label' : 'no_triage'
  } else if (areaLabels.length > 1) {
    resolvedProjectId = cache.triageProjectId ?? syncOwnerProjectId
    reason = cache.triageProjectId ? 'multi_label' : 'no_triage'
  } else {
    const match = cache.areaToProjectId.get(areaLabels[0])
    if (match != null) {
      resolvedProjectId = match
      reason = 'single_match'
    } else {
      resolvedProjectId = cache.triageProjectId ?? syncOwnerProjectId
      reason = cache.triageProjectId ? 'no_match' : 'no_triage'
    }
  }

  const existing = findExistingTask(db, { workspace_id, github_repo, github_issue_number: issue.number })
  if (existing) {
    // No re-route; keep existing.project_id. Update other fields.
    updateExistingTask(db, existing, issue)
  } else {
    createTaskFromIssue(db, { ...issue, project_id: resolvedProjectId })
    insertRoutingActivity(db, {
      kind: reason === 'single_match' ? 'area_routing_resolved' : 'area_routing_unresolved',
      data: { area_labels: areaLabels, resolved_project_id: resolvedProjectId, reason, source: 'ingest', ... }
    })
  }
}
```

### Constitution gates

- Strict scope: no new TS/TSX modules. Verified via grep at G7.
- Flag wiring: `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })` only. No `process.env.FEATURE_AREA_LABEL_ROUTING` reads. Verified via grep.
- Migration safety: additive nullable columns + indexes + non-destructive backfill. Rollback SQL committed alongside.
- No upstream-divergent changes: roadmap marks SPEC-006 as `upstream-safe`. Avoid Mission-Control-only patterns where possible.

### Dependencies

- Direct runtime: none new. The migration reuses the existing `addColumnIfMissing` pattern (or equivalent). All HTTP is native `fetch`. No new pinned packages required (unlike SPEC-004's ajv/jsonpath-plus/safe-regex).
- Internal: `resolveFlag(name, ctx)` from SPEC-002, `workspaces.feature_flags JSON` from SPEC-001, additive-migration pattern from SPEC-001, `getAegis(db, workspace_id)` from SPEC-003 (only as upstream context — SPEC-006 does not call it).

### Testing strategy

(Q16) Unit + integration + e2e:

- Unit: `src/lib/__tests__/github-sync-engine.test.ts` (extended) and `src/lib/__tests__/github-label-map.test.ts` (extended/new).
- Integration: existing mocked-GitHub-client pattern; full inbound and outbound cycles.
- e2e: Playwright covering project settings UI under Product Line scope.

Coverage budget: every P5-AC has at least one direct assertion. Snapshot test of `AREA_LABEL_MAP` defaults to prevent accidental drift.

### Rollback strategy

- Flip `FEATURE_AREA_LABEL_ROUTING` OFF in the workspace's `feature_flags JSON`. Inbound stops parsing `area:*`, outbound stops emitting, poller falls back to per-project polling. No row migrations. Existing tasks untouched.
- The `area_label_routing_backfill_completed_at` marker is preserved; re-enabling does not re-run backfill. To force re-run, operator clears the marker manually.
- Full rollback: drop the three columns and four indexes via `docs/migrations/rollback-M62.sql` (or matching id). Optional `tasks.area_routing_backfilled_at` column also dropped if added.
```

### Plan Results

Pending. Fill in after running.

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | ⏳ | Technical context, execution flow |
| `research.md` | ⏳ | Decision rationales (cite design concept Q&A) |
| `data-model.md` | ⏳ | Schema additions and indexes |
| `contracts/` | ⏳ | `PUT /api/projects/[id]` extension contract |
| `quickstart.md` | ⏳ | Operator preflight: enabling area routing in a workspace |

---

## Phase 4: Domain Checklists

**When to run:** After `/speckit.plan` — validates spec AND plan together. Run for each domain in turn; resolve `[Gap]` items by editing spec/plan and re-running.

### Recommended Domains

Drawn from the design concept's risk surfaces (migration, backfill, owner uniqueness, error handling, regression safety, API validation):

#### 1. data-integrity Checklist

Why: Three new columns plus four new indexes plus a backfill that mutates many rows. Constraint integrity, idempotency, and rollback are the core risks.

```bash
$speckit-checklist data-integrity

Focus on SPEC-006 requirements:
- Migration adds nullable columns and partial unique indexes; rollback drops them cleanly with no data loss.
- Owner backfill (`MIN(projects.id)` per `(workspace_id, github_repo)` group with `github_sync_enabled=1`) is deterministic and rerun-safe.
- Partial unique indexes enforce one owner per `(workspace_id, github_repo)` and one triage per workspace; reject INSERTs/UPDATEs that violate.
- Auto-backfill (`backfillAreaRouting`) preserves the legacy unique constraint `(workspace_id, github_repo, github_issue_number)` while changing `tasks.project_id`.
- Per-task transactions plus completion marker recover correctly from interruption (server crash mid-batch) and produce no duplicate activity rows on resume.
- `tasks.area_routing_backfilled_at` (if added per Clarify session 1) is monotonic and never decreases.
- `workspaces.feature_flags JSON.area_label_routing_backfill_completed_at` is set atomically with the last task move.
- Activity-log shape (`kind`, `data`) matches the schema in the spec; no PII or secrets in `data`.
- Pay special attention to: race between owner deletion and the partial unique index allowing zero owners (SQLite enforces uniqueness, not presence).
```

#### 2. regression-safety Checklist

Why: P5-AC1 demands flag-OFF byte-identical behavior. The poller and engine must not regress when the flag is OFF, including no new queries, no new label parsing, no new emissions.

```bash
$speckit-checklist regression-safety

Focus on SPEC-006 requirements:
- Flag-OFF parity: poller iterates the same projects, ingestion writes the same task rows, outbound emits the same labels, no new activities are created, no new labels are provisioned on connect.
- Existing tests (`pnpm test`, `pnpm test:e2e`) pass unchanged with the flag OFF in test fixtures.
- The new columns are nullable; existing INSERT/UPDATE statements that don't include them continue to work.
- The new indexes do not impact existing query plans for non-area-routing queries (`EXPLAIN QUERY PLAN` snapshots).
- Owner backfill at migration time does not change runtime behavior with flag OFF (the column is read only when the flag is ON).
- `initializeLabels(repo)` (no `workspaceId`) call from existing code paths still creates only `mc:*` and `priority:*` labels.
- Pay special attention to: the github-sync-poller filter must be conditional on `resolveFlag(...)` evaluating per-row; mass-mode flag mismatch could silence polling for OFF workspaces.
```

#### 3. error-handling Checklist

Why: GitHub API rate limits, network partitions, and partial backfills must not corrupt state or abort the calling sync.

```bash
$speckit-checklist error-handling

Focus on SPEC-006 requirements:
- `initializeLabels(repo, workspaceId)` failures (rate limit, 4xx, network) are caught per-label, logged, and do not abort the calling sync.
- Per-label failure does not block creation of subsequent labels in the same call (best effort across the full set).
- An optional throttled activity records the failure (`area_routing_unresolved` with `reason='label_provisioning_failed'`, max one per workspace per 24h) per Clarify session 2.
- Backfill per-task failure isolates: the failed task is logged, counted, and the loop continues. The completion marker is set only after every task has been attempted (successful or failed).
- Re-running backfill after a partial failure is idempotent: already-backfilled tasks are skipped via the resume marker.
- `PUT /api/projects/[id]` validation errors return 409 with structured body; no partial state mutation occurs.
- `transfer_owner=true` swap is atomic: a crash mid-transaction leaves the previous owner intact, not zero owners.
- Pay special attention to: race between two operators calling `PUT /api/projects/[id]` with `is_repo_sync_owner=1` for different projects in the same group simultaneously — the partial unique index serializes; the loser's request returns 409 cleanly.
```

#### 4. api-contracts Checklist

Why: `PUT /api/projects/[id]` gains three new optional fields plus a `transfer_owner` modifier. Validation rules, response shapes, and authorization need verification.

```bash
$speckit-checklist api-contracts

Focus on SPEC-006 requirements:
- `PUT /api/projects/[id]` accepts optional `area_slug`, `is_triage_project`, `is_repo_sync_owner`, `transfer_owner`.
- `area_slug` validation regex is documented and enforced; invalid values return 400 with field-specific error.
- 409 responses for `(workspace_id, area_slug)` collision, `is_triage_project=1` collision, and `is_repo_sync_owner=1` collision use a stable response shape per Clarify session 3.
- Operator-only authorization is preserved (no new public surface).
- Backward compatibility: requests that omit the new fields behave identically to today.
- `POST /api/github` connect endpoint extended to pass `workspaceId` to `initializeLabels` without changing its public contract.
- OpenAPI spec (`openapi.json`) updated to document the new fields and 409 responses.
- Pay special attention to: `is_repo_sync_owner=1` set without `transfer_owner=true` when no existing owner exists — should succeed (first-time set), not 409.
```

### Checklist Results

Pending. Fill in after running.

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | | | |
| regression-safety | | | |
| error-handling | | | |
| api-contracts | | | |
| **Total** | | | |

---

## Phase 5: Tasks

**When to run:** After checklists complete (G4 passed). Output: `specs/006-area-label-github-sync/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure

- Small, testable chunks (1-2 hours each).
- Clear acceptance criteria referencing P5-AC1..P5-AC9 and FR-* markers.
- TDD: every implementation task has a paired `[T-RED]` test task that comes first.
- Mark parallel-safe tasks explicitly with `[P]`.
- Organize by user story / functional surface, not by technical layer.
- Reference the design concept doc (`docs/ai/specs/SPEC-006-design-concept.md`) for "why" context when generating test specifications.
- Use the design concept's Non-goals to bound task generation: flag any task that would create a new TS/TSX module, change the legacy unique constraint, or implement re-route on subsequent label changes.

## Implementation Phases

1. Foundation
   - M62/M63 migration (columns, indexes, owner backfill, optional `tasks.area_routing_backfilled_at`)
   - Rollback SQL (`docs/migrations/rollback-M62.sql` or matching id)
   - `AREA_LABEL_MAP` static defaults + `areaLabelsForWorkspace` + `ALL_AREA_LABEL_NAMES` exports
2. US2 (sync ownership)
   - Poller filter `WHERE is_repo_sync_owner=1` when flag resolves true
   - `PUT /api/projects/[id]` `is_repo_sync_owner` + `transfer_owner` flow
   - Project settings UI for owner field
3. US3 (triage project)
   - `is_triage_project` exclusivity validation
   - Project settings UI for triage flag
4. US4 (area routing on initial ingest)
   - `loadAreaRoutingCache(db, workspaceId)` helper
   - Inbound routing in `pullFromGitHub` (single/multi/none/no-match)
   - Activity log shape (`area_routing_resolved` + `area_routing_unresolved`)
   - Outbound emission in `pushTaskToGitHub`
   - `area_slug` validation in PUT endpoint
   - Project settings UI for area_slug field
5. US1 (flag-OFF parity)
   - Regression test pass with flag OFF
   - `EXPLAIN QUERY PLAN` snapshot tests for new indexes
6. US5 (auto-backfill)
   - `backfillAreaRouting(db, workspaceId)` per-task transaction loop
   - First-flag-on bootstrap in poller (initializeLabels + backfill)
   - Completion marker `workspaces.feature_flags JSON.area_label_routing_backfill_completed_at`
7. Label provisioning + initialization
   - `initializeLabels(repo, workspaceId?)` extension
   - Connect-time call from `POST /api/github`
   - PUT-time call on `area_slug` / `is_triage_project` change
   - Failure isolation (catch-and-log per label)
8. Documentation + e2e + verification
   - `docs/github-sync.md` new file
   - `docs/feature-flags-runbook.md` runbook update
   - `docs/orchestration.md` cross-reference (if applicable)
   - Playwright e2e for project settings UI
   - Strict-scope guardrail grep
   - Final `pnpm test`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`, `pnpm build` evidence

## Constraints

- Backend tests in `src/lib/__tests__/` (vitest).
- E2E tests in `tests/e2e/` (Playwright).
- All migrations in `src/lib/migrations.ts` using the existing `addColumnIfMissing` pattern.
- All TSX edits in existing files — no new TSX modules.
- No `task_templates` table, no new `github-area-routing*.ts` module.
- TDD enforced: every implementation task is preceded by its red-phase test.
```

### Tasks Results

Pending. Fill in after running.

| Metric | Value |
|--------|-------|
| Total Tasks | |
| Phases | 8 |
| Parallel Opportunities | |
| User Stories Covered | US1, US2, US3, US4, US5, US6 |

---

## Phase 6: Analyze

**When to run:** Always run after generating tasks to catch issues before implementation.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Constitution alignment — verify pnpm-only, strict scope (no new TS/TSX modules), additive migrations, flag wiring through `resolveFlag`.
2. Coverage gaps — every P5-AC1..P5-AC9 has at least one task; every FR has at least one task; every user story has a complete task chain.
3. Cross-artifact consistency — spec.md, plan.md, tasks.md, AND design concept doc agree on:
   - Module boundaries (no new modules)
   - Migration columns and indexes
   - Activity kinds and data shape
   - Routing algorithm (single/multi/none/no-match → resolved | triage | no_triage)
   - Re-route semantics (initial ingest only, no thrash)
   - Backfill semantics (per-task transactions, completion marker)
4. Drift detection: any artifact contradicting the design concept Q&A is wrong unless an explicit revision note is recorded.
5. Scope leakage: tasks must NOT implement SPEC-004 (task pipeline), SPEC-005 (ready_for_owner), SPEC-007 (artifacts), SPEC-008 (governance), or SPEC-009 (pilot seed).
```

### Analyze Severity Levels

| Severity | Meaning | Action Required |
|----------|---------|-----------------|
| `CRITICAL` | Blocks implementation, violates constitution, drifts from design concept | Must fix before G6 gate |
| `HIGH` | Significant gap, impacts quality | Should fix |
| `MEDIUM` | Improvement opportunity | Review and decide |
| `LOW` | Minor inconsistency | Note for future |

### Analysis Results

Pending. Fill in after running.

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| | | | |

---

## Phase 7: Implement

**When to run:** After tasks.md is generated and analyzed (G6 passed).

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD-First

For each task, follow this cycle:

1. RED: Write failing test defining expected behavior. Run the test and verify it FAILS for the right reason (not import error or skipped).
2. GREEN: Write the minimum code to make the test pass. Run the test and verify it PASSES.
3. REFACTOR: Clean up while tests still pass. Re-run to confirm.
4. VERIFY: Manual verification of acceptance criteria when behavior is observable (e.g., flag OFF parity, project settings UI flow).

### Pre-Implementation Setup

1. Confirm `git rev-parse --abbrev-ref HEAD` is `006-area-label-github-sync`.
2. `pnpm install` to ensure deps match the lockfile.
3. `pnpm typecheck` and `pnpm lint` baseline (capture warnings for delta comparison at G7).
4. `pnpm test` and `pnpm test:e2e` baseline (capture pass count for delta comparison).

### Implementation Notes

- Reference the design concept doc (`docs/ai/specs/SPEC-006-design-concept.md`) when implementing for the "why" behind decisions.
- Decisions captured in the design concept that aren't reflected in tasks.md should be surfaced as gaps in Phase 6 Analyze, not silently dropped during implementation.
- Use existing patterns: `addColumnIfMissing(db, table, column, sql)` for migrations; `resolveFlag(name, ctx)` for flag reads; `db.prepare(...).get(...)` for typed query results; `logger.error/.warn` from existing imports.
- Activity inserts use the existing activity helper (find the canonical insert path in `src/lib/github-sync-engine.ts` or `src/lib/activities.ts`).
- The transfer_owner flow uses `db.transaction(() => { ... })()`; partial unique indexes are enforced at COMMIT in better-sqlite3 (verify with the integration test).
- Use existing logger and error-classification patterns from `src/lib/github-sync-engine.ts` for `initializeLabels` failure isolation.

### Pre-Push Verification (G7)

- `pnpm typecheck` passes with zero new errors.
- `pnpm lint` passes with zero new errors (warnings tracked against baseline).
- `pnpm test` passes (vitest); coverage of P5-AC1..P5-AC9 verified via snapshot of test names.
- `pnpm test:e2e` passes (Playwright) including the new project settings UI flow.
- `pnpm build` succeeds (Next.js standalone output).
- Strict-scope guardrails: ripgrep for new module paths returns zero matches:
  - `rg --type ts 'github-area-routing'`
  - `rg --type ts 'github-area-backfill'`
  - `rg --type tsx 'area-routing-admin-panel'`
- Inline-flag guardrails: ripgrep for `process.env.FEATURE_AREA_LABEL_ROUTING` returns zero matches outside test fixtures.
- Spec evidence updated: `docs/ai/rc-factory-technical-roadmap.md` Progress Tracking marks SPEC-006 as `🔄 In Progress` (pre-implement) → `✅ Complete` (post-implement, after merge).
- Branch pushed to `origin/006-area-label-github-sync` with all SPEC-006 commits, before opening the PR.
```

### Implementation Progress

Pending. Fill in during execution.

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 1 - Foundation (migration, rollback, label map) | | | |
| 2 - US2 (sync ownership) | | | |
| 3 - US3 (triage project) | | | |
| 4 - US4 (area routing) | | | |
| 5 - US1 (flag-OFF parity) | | | |
| 6 - US5 (auto-backfill) | | | |
| 7 - Label provisioning | | | |
| 8 - Documentation + e2e + verification | | | |

---

## Post-Implementation Checklist

- [ ] All tasks marked complete in `tasks.md`.
- [ ] Linting passes: `pnpm lint` (warnings tracked against baseline).
- [ ] Type check passes: `pnpm typecheck`.
- [ ] Unit tests pass: `pnpm test`.
- [ ] Integration / e2e tests pass: `pnpm test:e2e`.
- [ ] Build succeeds: `pnpm build`.
- [ ] Strict-scope guardrails return zero matches.
- [ ] `docs/github-sync.md` published.
- [ ] `docs/feature-flags-runbook.md` updated for `FEATURE_AREA_LABEL_ROUTING`.
- [ ] `docs/orchestration.md` cross-reference added if applicable.
- [ ] Manual verification: flag-OFF byte parity, area routing single/multi/none/no-match, transfer_owner flow, auto-backfill on first flag-on, label provisioning idempotency.
- [ ] PR created and reviewed.
- [ ] Roadmap status updated to `✅ Complete` after merge.

---

## Lessons Learned

### What Worked Well

- (filled after retrospective)

### Challenges Encountered

- (filled after retrospective)

### Patterns to Reuse

- (filled after retrospective)

---

## Project Structure Reference

```
mission-control/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── github/route.ts                # initializeLabels call site
│   │   │   └── projects/[id]/route.ts         # PUT extension
│   │   └── ...
│   ├── components/
│   │   └── panels/                            # project settings TSX (existing-file edit)
│   ├── lib/
│   │   ├── feature-flags.ts                   # FEATURE_AREA_LABEL_ROUTING (already registered)
│   │   ├── github-label-map.ts                # AREA_LABEL_MAP, areaLabelsForWorkspace, ALL_AREA_LABEL_NAMES
│   │   ├── github-sync-engine.ts              # inbound routing, outbound emission, backfill, cache
│   │   ├── github-sync-poller.ts              # owner filter + first-flag-on bootstrap
│   │   ├── migrations.ts                      # M62/M63 migration
│   │   └── __tests__/
│   │       ├── github-sync-engine.test.ts     # extended
│   │       └── github-label-map.test.ts       # new or extended
│   └── types/
├── tests/
│   └── e2e/                                   # Playwright project settings UI flow
├── docs/
│   ├── github-sync.md                         # NEW
│   ├── feature-flags-runbook.md               # updated
│   ├── orchestration.md                       # cross-reference (if applicable)
│   ├── migrations/
│   │   └── rollback-M62.sql                   # NEW (or matching id)
│   └── ai/
│       ├── rc-factory-technical-roadmap.md    # status updates
│       └── specs/
│           ├── SPEC-006-workflow.md           # this file
│           └── SPEC-006-design-concept.md     # operator interview source of truth
└── specs/
    └── 006-area-label-github-sync/            # generated by /speckit.specify
        ├── spec.md
        ├── plan.md
        ├── data-model.md
        ├── contracts/
        ├── quickstart.md
        ├── tasks.md
        └── checklists/
            └── requirements.md
```

---

Generated by `/speckit-pro:setup SPEC-006` on 2026-05-01 with operator-confirmed design concept (18 questions answered).
