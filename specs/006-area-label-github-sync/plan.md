# Implementation Plan: Area-Label GitHub Sync

**Branch**: `006-area-label-github-sync` | **Date**: 2026-05-01 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `/specs/006-area-label-github-sync/spec.md`
**Design Concept**: [`docs/ai/specs/SPEC-006-design-concept.md`](../../docs/ai/specs/SPEC-006-design-concept.md)

## Summary

Add `area:*` GitHub label routing and repo-level sync ownership to Mission Control's GitHub sync engine so a single product-line monorepo can fan out to many department projects without duplicate ingestion. Inbound issues route to the project whose `projects.area_slug` matches the issue's single `area:*` label; ambiguous issues land in the workspace's triage project. Outbound pushes emit `area:<area_slug>` alongside existing `mc:*` and `priority:*` labels. One project per `(workspace_id, github_repo)` is elected as the sync owner so only it polls the repo. The feature is gated by `FEATURE_AREA_LABEL_ROUTING` (per-workspace JSON) and ships with a one-shot per-workspace auto-backfill on first flag-on. With the flag OFF, behavior is byte-identical to today.

Technical approach: extend three existing `src/lib/` files plus migrations, the project PUT route, the connect handler, and the existing project settings panel. No new TS/TSX modules. Migration M62 (or M63 after SPEC-004 rebase) adds four nullable columns and four indexes additively, with a `docs/migrations/rollback-M62.sql` companion. All routing is workspace-scoped through `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })`.

## Technical Context

**Language/Version**: TypeScript 5.7 strict (existing project tsconfig).
**Primary Dependencies**: Next.js 16 App Router, React 19, `better-sqlite3`, Zustand, Tailwind 3, native `fetch` for GitHub API. No new runtime dependencies.
**Storage**: SQLite via `better-sqlite3`. Single-process, synchronous transactions through `db.transaction(() => { ... })`.
**Testing**: Vitest (unit/integration with mocked GitHub client harness already present), Playwright (e2e against the running app).
**Target Platform**: Standalone Next.js build (`output: 'standalone'`), Node ≥22 LTS.
**Project Type**: Web application (single Next.js app, single SQLite DB).
**Performance Goals**: Per-sync routing cache built once per `pullFromGitHub` invocation (one extra `SELECT id, area_slug, is_triage_project FROM projects WHERE workspace_id=?` per call). Backfill is per-task transaction loop; partial unique index keeps resume scan O(remaining-tasks) on large workspaces.
**Constraints**: Zero-regression contract (Constitution Article I) — flag-OFF state must be byte-identical to pre-SPEC-006 baseline. SQLite UNIQUE constraints are immediate (no `DEFERRABLE`) so the sync-owner transfer transaction MUST clear-then-set, not set-then-clear.
**Scale/Scope**: Workspaces with ≤4 projects per repo, ≤32 area slugs per workspace, ≤thousands of GitHub-synced tasks per workspace at backfill time. No upper bound enforced; backfill is idempotent and resumable.
**Strict Scope**: **N/A** — SPEC-006 introduces no new TS/TSX modules. All production logic extends existing files (`src/lib/github-sync-engine.ts`, `src/lib/github-label-map.ts`, `src/lib/github-sync-poller.ts`, `src/lib/migrations.ts`, `src/app/api/projects/[id]/route.ts`, `src/app/api/github/route.ts`, and the existing project settings TSX panel — exact file pinned in tasks). Per Constitution Article J this maps to strict-scope `N/A`. Reviewer guard: `git diff origin/main...HEAD --name-only --diff-filter=A | grep -E '^src/.*\.(ts|tsx)$'` MUST return empty at G7.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.4.0.

| Article | Status | Evidence |
|---------|--------|----------|
| I. Zero-Regression Contract (NON-NEGOTIABLE) | PASS | Flag-OFF path preserves existing poller SQL, outbound label set, label initialization, and activity log shape (FR-002, US1-AC1..4, SC-001). All new columns are NULLable / DEFAULT 0; existing rows behave as before. Byte-compat snapshot guarded by US1 integration tests. |
| II. Upstream Compatibility Discipline (NON-NEGOTIABLE) | PASS | Classification: **upstream-safe**. Migration is additive; no RENAME of upstream-owned columns; no destructive changes; no edits to upstream-owned files (`src/app/layout.tsx`, `src/lib/auth.ts`). All extensions append to existing files in additive ways. |
| III. OpenClaw Adapter Isolation | N/A | SPEC-006 does not read OpenClaw artifacts. |
| IV. Test-First Development (NON-NEGOTIABLE) | PASS | TDD cycle planned per FR-048 through FR-051: each acceptance criterion has at least one assertion before implementation. Unit + integration + Playwright e2e all planned. `pnpm typecheck` and `pnpm lint` MUST stay clean. UI changes inherit Article XIV (covered below). |
| V. Feature-Flag Resolution Discipline | PASS | Single helper `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })` is the only entry point (FR-001). No `process.env.FEATURE_AREA_LABEL_ROUTING` reads in production code paths. CI grep enforced. |
| VI. Dependency Supply-Chain Hygiene | PASS | Zero new runtime dependencies. Native `fetch` for GitHub API; no new packages added to `package.json`. |
| VII. Additive Migration Policy | PASS | M62 (or M63 after rebase) adds four NULLable columns + four indexes; companion `docs/migrations/rollback-M62.sql` drops them idempotently (FR-006). Listed in `docs/migrations/rollback-procedure.md`. Migration runner stays forward-only. |
| VIII. Successor Side-Effect Parity (Structural Enforcement) | N/A | SPEC-006 does not create tasks via direct `INSERT`. Routing only updates existing `tasks.project_id` and inserts `activities` rows. No `INSERT INTO tasks` outside `src/lib/task-create.ts`. |
| IX. Safe Evaluation Discipline | N/A | SPEC-006 does not run untrusted expression evaluation or schema validation. Label parsing is a hand-written `lowercase + slice(5)` over a fixed `area:` prefix. |
| X. Observability and Auditability | PASS | Every routing decision writes one `activities` row (FR-042..044). Sync-owner transfers write one `kind='sync_owner_transferred'` row. Label-provisioning failures write one throttled `kind='label_provisioning_failed'` row per `(workspace_id, github_repo)` per 24h with no leaked auth headers (FR-027, FR-027a). |
| XI. Keep It Simple | PASS | Per-sync `Map<area_slug, project_id>` cache + per-task transaction loop + four NULLable columns. No new modules, no new dependencies, no new admin panels. Cache lifetime = single sync call (no staleness model). |
| XII. Avoid Speculative Generality | PASS | Sync-owner re-election (Q-Open-4), backfill bookend activity kinds, and `kind='sync_owner_lost'` are explicitly **deferred** — no current consumer in SPEC-006. Operator preflight (FR-046) covers ownership invariant verification. |
| XIII. Defensive Boundaries, Trusting Interior | PASS | GitHub API failures during `initializeLabels` are caught per-label and aggregated into one throttled activity (FR-027, FR-027a). Per-task backfill failures are isolated by transaction (FR-021, US5-AC4). 409 Conflict responses include structured `error` codes plus actionable `existing_*_project_*` fields (FR-035..037). |
| XIV. Real UI Journey Quality Gate (NON-NEGOTIABLE) | PASS — see UI gate section below | Playwright e2e journey planned (FR-051) — boots real app, drives existing project settings panel, asserts inline 409 handling and transfer-owner flow. |
| XV. Spec Artifact Provenance And Archive Sweep (NON-NEGOTIABLE) | PASS — see Archive section below | Archive Sweep ran before Phase 0 against previously merged specs (SPEC-001, SPEC-002, SPEC-002A, SPEC-003); SPEC-006 itself is excluded from same-run archival. |

### UI gate (Article XIV)

SPEC-006's only UI change is three new fields on the existing project settings panel (FR-040) plus a yellow missing-triage banner (FR-040b). Per Article XIV the plan defines:

- **Real Playwright e2e journey** (FR-051): boots Mission Control via the existing test runner, signs in through the supported auth seam, seeds a workspace with two projects sharing one `github_repo`, opens the project settings panel, drives the new `area_slug` text input + `is_triage_project` checkbox + `is_repo_sync_owner` checkbox, and asserts:
  - Inline 400 on bad regex (no API call).
  - Inline 409 on `area_slug` collision identifying conflicting project by slug.
  - Inline 409 on `is_triage_project` collision identifying existing triage project.
  - Inline 409 on `is_repo_sync_owner` collision with a working transfer-owner action.
  - Visible-but-disabled state when `FEATURE_AREA_LABEL_ROUTING` is OFF (FR-040a).
  - Yellow banner appears when flag is ON and no triage project exists, disappears when one is set (FR-040b).
- **Docker-backed execution where available**: Playwright runs against the existing Docker production build with a disposable data directory seeded by the test setup. Local fallback uses `pnpm dev`.
- **Screenshots**: Required before/during/after states (panel pre-edit, inline 409 visible, transfer-owner action confirmed). Mobile/narrow layout is NOT part of acceptance criteria so no responsive screenshots required. Screenshots are CI artifacts; binary commits forbidden absent a manifest exception.
- **Argos metadata gate**: If the e2e run uploads to Argos, the build metadata MUST include test identity, source location, and `spec:006-area-label-github-sync` tag. Non-visual runs MUST NOT upload empty Argos builds.
- **Defect-remediation gate**: failing e2e screenshots reviewed before PR update; UI bugs blocking the change MUST be fixed before the PR is opened.

### Archive Sweep gate (Article XV)

- **Archive Sweep ran before Phase 0** for SPEC-006 (recorded in autopilot pre-flight). It considered only previously merged specs: SPEC-001, SPEC-002, SPEC-002A, SPEC-003.
- **Current target excluded**: `specs/006-area-label-github-sync/` is excluded from the same run; it becomes eligible only after PR merge in a later autopilot run.
- **Branch/worktree safety**: SPEC-006 runs from `.worktrees/006-area-label-github-sync/` on branch `006-area-label-github-sync`. Cleanup MUST NOT be mixed into this feature branch — the sweep operates dry-run only on this worktree.
- **Provenance fields** to record before any post-merge cleanup of SPEC-006 itself: source paths under `specs/006-area-label-github-sync/`, PR URL, merge commit SHA, CI/Argos links for the FR-051 Playwright run, cleanup mode (`dry-run` until merged), safe-to-apply state, and recovery commands of the form `git show <merge-sha>:specs/006-area-label-github-sync/spec.md`.
- **Screenshot/evidence guard**: `git diff --name-only --diff-filter=A origin/main...HEAD | grep -E '\.(png|jpg|jpeg|gif|webp)$'` MUST return empty unless a manifest-backed exception lands in the same diff. The FR-051 e2e screenshots stay in CI/Argos; none are committed.
- **Archive extension pin**: `.specify/extensions/archive/` (v1.1.0) and `.specify/extensions.yml` already pinned by SPEC-002A; no version change in SPEC-006.

**No constitution violations to justify. Complexity Tracking section below stays empty.**

## Project Structure

### Documentation (this feature)

```text
specs/006-area-label-github-sync/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output (this run)
├── data-model.md        # Phase 1 output (this run)
├── quickstart.md        # Phase 1 output (this run)
├── contracts/           # Phase 1 output (this run)
│   ├── projects-put.md           # PUT /api/projects/[id] contract
│   ├── github-connect.md         # POST /api/github contract delta
│   └── activities-shapes.md      # New activity kinds and data shapes
├── spec.md              # Authored Phase 1 (already complete)
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

SPEC-006 extends existing files only. No new modules.

```text
src/lib/
├── github-sync-engine.ts          # extended: pullFromGitHub routing, pushTaskToGitHub area emission, backfillAreaRouting, loadAreaRoutingCache (helper)
├── github-label-map.ts            # extended: AREA_LABEL_MAP, areaLabelsForWorkspace, ALL_AREA_LABEL_NAMES
├── github-sync-poller.ts          # extended: is_repo_sync_owner filter when flag ON, bootstrap hook
├── migrations.ts                  # extended: M62 (or M63) — four NULLable columns + four indexes + sync-owner backfill
└── __tests__/
    ├── github-sync-engine.test.ts # extended unit tests
    ├── github-label-map.test.ts   # extended (or new) — AREA_LABEL_MAP snapshot
    └── github-sync-integration.test.ts # extended integration tests with mocked GitHub client

src/app/api/
├── projects/[id]/route.ts         # extended: PUT accepts area_slug, is_triage_project, is_repo_sync_owner, transfer_owner
└── github/route.ts                # extended: pass workspaceId to initializeLabels on connect

src/components/
└── (existing project settings panel — exact file pinned in tasks.md)  # extended: three fields + flag-gated disabled state + missing-triage banner

docs/
├── github-sync.md                 # NEW: full sync model docs (FR-045)
├── feature-flags-runbook.md       # extended: FEATURE_AREA_LABEL_ROUTING preflight (FR-046)
├── orchestration.md               # extended: pointer to docs/github-sync.md if a routing section exists (FR-047)
└── migrations/
    ├── rollback-M62.sql           # NEW (or rollback-M63.sql after rebase) — drops four columns + four indexes (FR-006)
    ├── migration-id-reservations.md # extended: mark M62/M63 winner
    └── rollback-procedure.md      # extended: append M62 row

tests/e2e/
└── (extended) project-settings-area-routing.spec.ts # NEW Playwright spec for FR-051 — but NOT a new src/ TSX module (e2e specs are not strict-scope)
```

**Structure Decision**: Single Next.js project (existing layout). All new logic extends existing files; no new top-level directories. The `tests/e2e/` Playwright spec is a test fixture, not a strict-scope production module — it does not affect Article J's "N/A" classification.

## Phase 0: Outline & Research

See [`research.md`](./research.md). All technical-context unknowns are resolved (no `NEEDS CLARIFICATION` markers remain). Topics covered:

1. **SQLite UNIQUE constraint timing** — confirms partial unique indexes are immediate, not deferrable; transfer-owner MUST clear-then-set.
2. **Backfill resume mechanism** — `tasks.area_routing_backfilled_at IS NULL` predicate vs. activity-log lookup; column wins on O(remaining-tasks) scan and was resolved in Clarify Session 1.
3. **Static `AREA_LABEL_MAP` color palette** — Tailwind 700-level shades for `design`/`frontend`/`ml` (`be185d`, `0e7490`, `6d28d9`) chosen for WCAG AA 4.5:1 contrast against white text.
4. **Per-sync cache strategy** — single `SELECT … FROM projects WHERE workspace_id=?` at start of `pullFromGitHub`; `Map<area_slug, project_id>` + `triageProjectId: number | null`.
5. **Label-provisioning failure throttling** — one `kind='label_provisioning_failed'` activity per `(workspace_id, github_repo)` per 24h; query existing activity row before insert.
6. **`area_slug` regex** — `^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$` (RFC 1123 / K8s DNS label style); allows single-character slugs via the optional outer group.

## Phase 1: Design & Contracts

### Data model

See [`data-model.md`](./data-model.md). Summary:

- **`projects`** gains three NULLable columns: `area_slug TEXT NULL`, `is_triage_project BOOLEAN DEFAULT 0`, `is_repo_sync_owner BOOLEAN DEFAULT 0`.
- **`tasks`** gains one NULLable column: `area_routing_backfilled_at TIMESTAMP NULL`.
- **`workspaces.feature_flags JSON`** gains one runtime key: `area_label_routing_backfill_completed_at` (set after backfill completes; idempotent guard).
- Four indexes: `idx_projects_workspace_area_slug` (non-unique), `idx_projects_one_sync_owner_per_repo` (partial unique on `is_repo_sync_owner=1`), `idx_projects_one_triage_per_workspace` (partial unique on `is_triage_project=1`), `idx_tasks_area_routing_backfill_pending` (partial on `github_issue_number IS NOT NULL AND area_routing_backfilled_at IS NULL`).
- Three new `activities.kind` values: `area_routing_resolved`, `area_routing_unresolved`, `label_provisioning_failed`. One additional kind for transfer audits: `sync_owner_transferred`.

### Contracts

See [`contracts/`](./contracts/) for three documents covering all FR-033 through FR-039 surfaces:

1. **`contracts/projects-put.md`** — `PUT /api/projects/[id]` extended request/response shape, validation rules, all three 409 hybrid response shapes (FR-035, FR-036, FR-037), atomic transfer transaction order (clear → set → activity).
2. **`contracts/github-connect.md`** — `POST /api/github` delta: pass resolved `workspaceId` to `initializeLabels` so flag-ON workspaces provision area labels on connect (FR-039).
3. **`contracts/activities-shapes.md`** — exact `activities.data` JSON shapes for `area_routing_resolved`, `area_routing_unresolved`, `label_provisioning_failed`, and `sync_owner_transferred` (FR-027a, FR-042, FR-043).

### Quickstart

See [`quickstart.md`](./quickstart.md). Walks an operator through:

1. Verify migration applied; verify rollback file present.
2. Set `area_slug` on three department projects via the project settings UI.
3. Designate one as `is_triage_project`.
4. Verify exactly one `is_repo_sync_owner=1` per `(workspace_id, github_repo)` (preflight).
5. Enable `FEATURE_AREA_LABEL_ROUTING` in `workspaces.feature_flags`.
6. Trigger a sync; confirm backfill ran once and completion marker set.
7. Verify outbound `area:*` emission and inbound routing.
8. Rollback procedure: flip flag OFF (instant); full schema rollback via SQL (operator-managed).

### Routing algorithm (cross-reference)

The inbound routing pseudocode is canonical in `spec.md` FR-009 through FR-015 plus `docs/ai/specs/SPEC-006-design-concept.md` Q5. This plan does NOT duplicate it. Key invariants reaffirmed here for the implementation:

- **First-ingest only** — no `task.project_id` change on subsequent syncs (FR-015, US4-AC2/3).
- **Triage authority is the flag** — `is_triage_project=1`. `area_slug='triage'` on a non-triage project is a regular routing target, never the unresolvable destination (FR-014).
- **Cache lifetime = one `pullFromGitHub` call** — built by non-exported `loadAreaRoutingCache(db, workspaceId)` helper.
- **Outbound emission is symmetric with inbound** — `area:<area_slug>` only when `area_slug` is non-NULL AND flag is ON (FR-016, FR-017).

### Agent context update

`.specify/scripts/bash/update-agent-context.sh` invoked after Phase 1 — see Phase 0 closing block in this run.

## Post-design Constitution re-check

Re-evaluated after Phase 0/1 completion. **No new violations.** All gates remain PASS. Strict-scope check holds: data model and contracts add zero new TS/TSX modules; the e2e Playwright spec is a test fixture, not a production module.

## Complexity Tracking

> **No Constitution Check violations. This section intentionally left empty.**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (none)     | (none)                              |
