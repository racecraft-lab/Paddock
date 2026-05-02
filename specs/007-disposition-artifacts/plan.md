# Implementation Plan: SPEC-007 Disposition Logging and Task Artifact Store

**Branch**: `007-disposition-artifacts` | **Date**: 2026-05-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-disposition-artifacts/spec.md`

## Summary

Add disposition logging for triage-template completions and a secret-scanned, content-addressed artifact handoff plane between agent sandboxes, gated by `FEATURE_DISPOSITION_LOGGING` and `FEATURE_TASK_ARTIFACTS`. Both flags default OFF and resolve through `resolveFlag(name, { workspaceId })` (SPEC-002). Both target tables (`task_dispositions` M057 and `task_artifacts` M058) plus the per-template `workflow_templates.allow_redacted_artifacts` column (M054) already exist from SPEC-001 — this spec adds zero migrations.

The technical approach:

- **Disposition path**: `runPostCommitDispositionInsert(db, parent, output, workspaceId)` runs after the `advanceTaskChain` IIFE returns at `src/lib/task-dispatch.ts:499` and BEFORE `runPostCommitSuccessorSync` (line 502), so the disposition row lands before any GitHub outbound network call. Validation failure writes `disposition='unknown'` + a `disposition_validation_failed` activity + a `secret_in_artifact`-class Aegis FAIL. INSERT failure is throttled with the SPEC-006 `label_provisioning_failed` precedent (`WHERE type=? AND entity_type='task' AND entity_id=? AND created_at >= unixepoch() - 60`).
- **Artifact publish/read path**: `src/lib/task-artifacts.ts` owns publish, read, quarantine/un-quarantine, hash-verify, orphan-repair, retention-sweep, the redaction/scan-status enum constants (`REDACTION_STATUSES`, `SECURITY_SCAN_STATUSES`), and the in-process p95 ring buffer. Inline content lands in either `task_artifacts.content_json` (for `inline_json`) or `task_artifacts.content_markdown` (for `inline_markdown`); file-backed publishes use `fs.link()` (NOT `fs.rename()`) for atomic temp→canonical promotion under `<DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/<sha256>.<ext>` with the temp file co-located in the same directory tree (Docker `read_only:true` rules out `/tmp`).
- **Detector**: `src/lib/secret-detector.ts` exports `detectSecrets(content, mime)` over a closed 17-family v1 ruleset stored as a typed `Rule[]` in `src/lib/secret-detector.rules.ts`; every rule passes `safe-regex` at module load.
- **Aegis hook**: a thin new `src/lib/aegis-review.ts` exports `AEGIS_FAILURE_REASONS` and `evaluateSpec007AegisSignals(taskId, db, reviewWindow)`. The pre-existing `runAegisReviews` in `task-dispatch.ts` calls into the helper but is NOT extracted, NOT in strict scope.
- **Successor handoff**: with flag ON, `advanceTaskChain` attaches `metadata.input_artifacts` (sibling of the SPEC-004-owned `metadata.task_pipeline` namespace) to the successor task's `metadata` JSON column. Flag OFF preserves the SPEC-004 baseline byte-compatibly.
- **UI surfaces (3)**: Dispositions tab in `audit-trail-panel.tsx`, "Last 7d triage totals" widget in `dashboard.tsx`, full `artifact-admin-panel.tsx`. All three carry real Playwright e2e coverage per Principle XIV.
- **APIs (3)**: `POST /api/task-artifacts`, `GET /api/task-artifacts/[id]`, `GET /api/dispositions`. Status codes governed by the spec's API Error Code Matrix; cursor pagination uses opaque base64url JSON `{triaged_at, id}` with response shape `{rows, next_cursor, has_more}` — a NEW MC convention.

## Technical Context

**Language/Version**: TypeScript 5.7 strict (existing project tsconfig)
**Primary Dependencies**: Next.js 16 App Router, React 19, `better-sqlite3`, Zustand, Tailwind 3, native `fetch`. Pre-existing strict-mode deps from SPEC-004 (`ajv@8.18.0`, `jsonpath-plus@10.4.0`, `safe-regex@2.1.1`) are reused for output-schema validation in the disposition validator. **No new runtime dependencies.**
**Storage**: SQLite via `better-sqlite3`. Single-process synchronous transactions through `db.transaction(() => { ... })()`. No new migrations — relies on pre-existing M054, M057, M058. WAL mode preserves snapshot-isolated reads during the supersede transaction.
**Filesystem**: Node `fs/promises` and `node:crypto` (sha256) for atomic write protocol; `node:path` for relative `storage_uri`. Storage root is `<DATA_DIR>/artifacts/...` (default `.data/artifacts/`).
**Testing**: Vitest unit + integration; Playwright e2e against the Docker production build with deterministic seed data; Argos visual diff for UI states.
**Target Platform**: Linux server (Docker production: `read_only: true` + named volume at `/app/.data`); local dev macOS/Linux.
**Project Type**: Web application (Next.js App Router single project; `src/app`, `src/components`, `src/lib`).
**Performance Goals**: p95 inline publish ≤ 200 ms; p95 ≤ 5 MiB file publish ≤ 1000 ms (Vitest budget — emits warning, not failure). Detector recall ≥ 0.95 on the wild corpus. Dashboard rollup query cached 15 s, polled 30 s.
**Constraints**:
- No DB migrations; M054/M057/M058 must match spec assumptions before the publish/read code relies on them.
- App-level enums (`REDACTION_STATUSES`, `SECURITY_SCAN_STATUSES`) — verified by an enums-snapshot test that EXPLAINs the live `task_artifacts` schema and confirms no DB CHECK exists on those columns. (M058 has a CHECK on `storage_kind` which is expected and unrelated.)
- Both feature flags resolve through `resolveFlag(name, { workspaceId })` at every site; CI grep guards against `process.env.FEATURE_*` reads.
- Atomic file write via `fs.link()` (POSIX EEXIST atomicity, NOT `fs.rename()` which silently overwrites); temp under `<DATA_DIR>/artifacts/.../tmp.*` (NEVER `/tmp` — `EXDEV` across filesystems on Docker).
- Throttle SQL pattern fixed: `WHERE type=? AND entity_type='task' AND entity_id=? AND created_at >= unixepoch() - 60` for `disposition_insert_failed` and `security_violation`; `artifact_quarantined_read_overridden` is NOT throttled (governance-boundary read per NIST SP 800-53 AU-2/3/12 reasoning in spec FR-065).
- Successor dispatch payload lives in `tasks.metadata.input_artifacts` — there is NO `tasks.input` column.
- p95 ring buffer is process-local (in-memory `Map<workspace_id, { publish: number[], read: number[] }>`, length 1024), no DB persistence; resets on process restart.

**Scale/Scope**: 9 functional-requirement groups (FR-001 through FR-100), 9 user stories (5 P1, 3 P2, 1 P3), 3 API endpoints, 3 UI surfaces, 17 detector rule families, 14 new `activities.type` values.

**Strict Scope**: 6 spec-owned files (per FR-100):
1. `src/lib/secret-detector.ts`
2. `src/lib/secret-detector.rules.ts`
3. `src/lib/__tests__/secret-detector.test.ts`
4. `src/lib/aegis-review.ts`
5. `src/lib/task-artifacts.ts`
6. `src/lib/__tests__/task-artifacts.enums.test.ts`

These six files are added to `tsconfig.spec-strict.json` `include` AND to the `specStrictFiles` array in `eslint.config.mjs`. The strict-scope grep test asserts that ONLY these 6 files (plus declared SPEC-007-touched files outside strict scope: `src/lib/task-dispatch.ts`, the 3 UI components, the 3 API route files, plus `tsconfig.spec-strict.json` and `eslint.config.mjs` themselves) appear in the diff against `main`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| I. Zero-Regression Contract | PASS | Both flags default OFF; flag-OFF preserves SPEC-004 dispatch byte-compatibly. Structural baseline at `src/lib/__tests__/__fixtures__/spec-004-dispatch-metadata-baseline.json`. EXPLAIN-QUERY-PLAN diff against `explain-query-plan-pre-m62.json`. |
| II. Upstream Compatibility | PASS | `upstream-divergent`. No upstream-owned column renames. New code is additive in new files (`src/lib/secret-detector*`, `src/lib/aegis-review.ts`, `src/lib/task-artifacts.ts`) plus narrow add-on to `src/lib/task-dispatch.ts:499-502`. UI components are MC-fork-only (`audit-trail-panel.tsx`, `dashboard.tsx`, `artifact-admin-panel.tsx`). |
| III. OpenClaw Adapter Isolation | N/A | No OpenClaw artifact reads in this spec. |
| IV. Test-First Development | PASS | Every new module ships its red test first: detector per-rule fixtures, enums-snapshot, atomic-write happy/crash, publishArtifact integration, Aegis hook integration, dispatch payload shape diff, contract tests for 3 endpoints, Playwright journeys for 3 UI surfaces. |
| V. Feature-Flag Resolution Discipline | PASS | Both flags resolve through `resolveFlag(name, { workspaceId })` at every site (publish, read, dispatch, advanceTaskChain post-commit). CI grep guards against `process.env.FEATURE_DISPOSITION_LOGGING` and `process.env.FEATURE_TASK_ARTIFACTS` direct reads in the diff. |
| VI. Dependency Supply-Chain Hygiene | PASS | No new runtime dependencies. `safe-regex` (already pinned per SPEC-004) is loaded at module-load time in `secret-detector.test.ts` to validate every rule. |
| VII. Additive Migration Policy | PASS | Zero new migrations. Plan cites live schema lines: M054 at `src/lib/migrations.ts:1500-1521` (`allow_redacted_artifacts BOOLEAN NOT NULL DEFAULT 0`), M057 at `migrations.ts:1549-1565` (`task_dispositions(id, task_id, disposition, reason, triaged_by_agent_id, triaged_at, workspace_id)`), M058 at `migrations.ts:1567-1599` (`task_artifacts` with `content_json JSON`, `content_markdown TEXT`, separate columns; `storage_kind` CHECK present; no CHECK on `redaction_status`/`security_scan_status`). |
| VIII. Successor Side-Effect Parity | PASS | Successor task creation continues through `createTask()` (SPEC-004 path) — SPEC-007 only attaches `metadata.input_artifacts` as a sibling of `metadata.task_pipeline`. No direct `INSERT INTO tasks` introduced. CI grep gate from SPEC-004 remains green. |
| IX. Safe Evaluation Discipline | PASS | The disposition validator uses the SPEC-004 `output-schema-validator.ts` (already constrained AJV profile, `safe-regex` patterns, hard caps). Detector rules: every regex passes `safe-regex` at test load. No `eval`, `Function`, `vm`, `with`, dynamic `require`. CI grep guards retained. |
| X. Observability and Auditability | PASS | New `activities.type` values (14): `disposition_validation_failed`, `disposition_insert_failed`, `security_violation`, `artifact_quarantined`, `artifact_unquarantined`, `artifact_deleted`, `artifact_archived`, `artifact_hash_verified`, `artifact_hash_verification_failed`, `artifact_repaired_orphan`, `artifact_previews_rebuilt`, `artifact_retention_swept`, `artifact_skipped_quarantined_in_dispatch`, `artifact_quarantined_read_overridden`. Every state-changing admin action writes one. The privileged-read audit (`artifact_quarantined_read_overridden`) is NEVER throttled (NIST SP 800-53 AU-2/3/12). Detector findings emit rule id, never the matched substring. |
| XI. Keep It Simple | PASS | Three modules with one responsibility each: detector (regex fan-out), aegis-review (two-signal helper), task-artifacts (publish/read/admin). No premature abstraction layers; `getInlineContent(row)` is the only read-side helper. Disposition insert is a single `try { INSERT ... } catch { activity }` block, not a state machine. |
| XII. Avoid Speculative Generality | PASS | Detector v1 is CLOSED — 17 rule families enumerated; v2 deferrals named explicitly so v2 has a target. No detector plugin API. No retention sweep cron — admin-triggered only. p95 ring buffer is process-local, not a metrics platform integration. |
| XIII. Defensive Boundaries, Trusting Interior | PASS | API boundaries (3 routes) catch and classify per the FR-300-series error matrix. Detector findings log rule id, never matched substring. Disposition INSERT failure is caught + activity row, never propagates. File-write `fs.link()` EEXIST/other-error branches handled per FR-022/FR-023. Trusted interior (`task-artifacts.ts` internal helpers) trusts type guarantees. |
| XIV. Real UI Journey Quality Gate | PASS | See Real UI Journey Plan section below — 3 Playwright spec files, Docker-backed run, screenshot states enumerated, Argos metadata gate, defect-remediation gate. |
| XV. Spec Artifact Provenance | PASS | Archive Sweep runs at autopilot startup before Phase 0; SPEC-007 itself is excluded from same-run archival. Recovery commands `git show <merge-sha>:specs/007-disposition-artifacts/spec.md` recorded post-merge. No committed UI screenshots — Argos owns visual review. |

### Real UI Journey Plan (Principle XIV)

SPEC-007 introduces three new user-facing UI surfaces. Each ships real Playwright e2e coverage against the running app, not `page.setContent()` fixtures:

- **Dispositions tab** (`src/components/panels/audit-trail-panel.tsx`):
  - Spec file: `tests/e2e/disposition-audit-tab.spec.ts`
  - Journey: load audit panel → switch to Dispositions tab → apply filters (workspace, disposition multi-select, date preset, agent dropdown, task_id numeric vs. substring) → page through cursor pagination → verify "Logging began on YYYY-MM-DD" banner appears with seeded earliest row.
  - Required screenshots: empty-state (no rows), filtered list, paginated 2nd page, banner visible.
- **"Last 7d triage totals" widget** (`src/components/dashboard/dashboard.tsx`):
  - Spec file: `tests/e2e/disposition-dashboard-widget.spec.ts`
  - Journey: render dashboard for workspace W with 7 days of seed dispositions → assert total + 7 stacked bars → insert a new disposition via API → wait one 30 s poll cycle → assert widget reflects the new total → empty-state for zero-disposition workspace.
  - Required screenshots: populated widget, empty-state, post-poll updated state.
- **Artifact admin panel** (`src/components/panels/artifact-admin-panel.tsx`):
  - Spec file: `tests/e2e/artifact-admin-panel.spec.ts`
  - Journey: admin loads panel → sees mixed-state artifacts (clean, redacted, file-backed PDF, quarantined, orphan) → quarantines artifact A → asserts 423 on `GET /api/task-artifacts/[A.id]` for non-admin → admin override read returns 200 + writes the (UNTHROTTLED) `artifact_quarantined_read_overridden` activity row → un-quarantine → run hash-verify with corrupted file → run repair-orphans → run retention-sweep with seeded retention policy → metrics tile shows "insufficient data" until ≥ 100 publishes → non-admin gets 403 on every destructive endpoint.
  - Required screenshots: full panel, quarantine flow with toast confirming activity row, hash-verify mismatch state, retention-sweep summary, metrics tile (both insufficient-data and populated states), responsive narrow layout.

**Docker-backed execution**: `pnpm test:e2e` boots `docker-compose -f docker-compose.yml -f docker-compose.hardened.yml up -d` with a disposable named volume at `/app/.data` and deterministic seed data emitted by `scripts/seed-spec-007.ts`. Local fallback uses `node .next/standalone/server.js` against a temporary `MISSION_CONTROL_DATA_DIR`.

**Argos metadata gate**: Each Playwright screenshot upload to Argos includes `test_identity`, `source_file`, and `spec:007-disposition-artifacts` tag. CI fails on empty Argos uploads or missing metadata.

**Defect-remediation gate**: Before opening or updating the PR, an agent reviews failing e2e output and screenshots. Visible UI defects (clipped controls, broken pagination, wrong activity-row text) MUST be fixed in the same PR, not deferred.

**Committed binary screenshots**: NONE. Argos/CI artifacts are the durable evidence path.

### Archive Sweep Plan (Principle XV)

- Archive Sweep runs at the start of `speckit-pro:autopilot` before Phase 0 for SPEC-007.
- Previously merged specs in scope for sweep: SPEC-001, SPEC-002, SPEC-002A, SPEC-003, SPEC-004, SPEC-006. SPEC-005 status pending; if it merges before SPEC-007's autopilot run, it joins the sweep set.
- SPEC-007 itself is EXCLUDED from same-run archival.
- Branch/worktree safety: SPEC-007 work happens in `.worktrees/007-disposition-artifacts/` with `branch=007-disposition-artifacts` from a clean cut of `main`. Cleanup runs only when worktree is clean and branch tracks `origin`. Otherwise: dry-run only.
- Provenance recorded: source paths, PR URL (TBD post-PR open), merge SHA (TBD post-merge), Argos build links for each Playwright spec, cleanup mode (`apply`/`dry-run`/`stop`), recovery commands of the form `git show <merge-sha>:specs/007-disposition-artifacts/spec.md`.
- Screenshot/evidence guard: no committed binary screenshots; `git diff --stat` against `main` shows zero `*.png`/`*.jpg`/`*.gif` additions outside test fixtures.

## Project Structure

### Documentation (this feature)

```text
specs/007-disposition-artifacts/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── post-task-artifacts.md
│   ├── get-task-artifact-by-id.md
│   └── get-dispositions.md
├── checklists/          # (existing) review-readiness checklist
├── spec.md              # (existing) feature specification
└── tasks.md             # Phase 2 output (/speckit.tasks command — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── app/
│   └── api/
│       ├── dispositions/route.ts           # NEW — GET /api/dispositions
│       └── task-artifacts/
│           ├── route.ts                    # NEW — POST /api/task-artifacts
│           └── [id]/route.ts               # NEW — GET /api/task-artifacts/[id]
├── components/
│   ├── dashboard/
│   │   └── dashboard.tsx                   # MOD — add "Last 7d triage totals" widget
│   └── panels/
│       ├── audit-trail-panel.tsx           # MOD — add Dispositions tab
│       └── artifact-admin-panel.tsx        # NEW — admin operations panel
└── lib/
    ├── aegis-review.ts                     # NEW (strict scope) — Spec-007 Aegis helper
    ├── secret-detector.ts                  # NEW (strict scope) — detectSecrets()
    ├── secret-detector.rules.ts            # NEW (strict scope) — Rule[]
    ├── task-artifacts.ts                   # NEW (strict scope) — publish/read/admin/p95
    ├── task-dispatch.ts                    # MOD (NOT strict scope) — post-commit insert hook + Aegis call
    └── __tests__/
        ├── __fixtures__/
        │   ├── spec-004-dispatch-metadata-baseline.json   # NEW — flag-OFF shape baseline
        │   ├── explain-query-plan-pre-m62.json            # REUSED from SPEC-004
        │   └── secrets/
        │       ├── wild-corpus.txt                        # NEW — ≥50 mixed lines, recall ≥ 0.95
        │       ├── aws-access-key-positive.txt
        │       ├── aws-access-key-negative.txt
        │       └── ... (one positive + one negative per rule, 17 rules × 2 = 34 fixtures)
        ├── secret-detector.test.ts                        # NEW (strict scope) — per-rule + recall
        ├── task-artifacts.enums.test.ts                   # NEW (strict scope) — enum + EXPLAIN snapshot
        ├── task-artifacts.test.ts                         # NEW — publish/read/admin integration
        ├── aegis-review.test.ts                           # NEW — two-signal hook unit
        ├── advance-task-chain-disposition.test.ts         # NEW — flag ON/OFF disposition path
        └── advance-task-chain-input-artifacts.test.ts     # NEW — successor dispatch payload diff

tests/e2e/
├── disposition-audit-tab.spec.ts           # NEW — Playwright journey
├── disposition-dashboard-widget.spec.ts    # NEW — Playwright journey
└── artifact-admin-panel.spec.ts            # NEW — Playwright journey

tsconfig.spec-strict.json                   # MOD — add 6 SPEC-007 files to `include`
eslint.config.mjs                           # MOD — add 6 SPEC-007 files to `specStrictFiles`
scripts/
└── seed-spec-007.ts                        # NEW — deterministic seed data for e2e
```

**Structure Decision**: Single Next.js project at the repo root (existing structure). New library modules in `src/lib/`, new UI in `src/components/{dashboard,panels}/`, new API routes in `src/app/api/`. No new top-level directories.

## Observability Notes

- **p95 ring buffer**: `src/lib/task-artifacts.ts` owns a process-local `Map<workspace_id, { publish: number[], read: number[] }>` of 1024-length number arrays. Each successful `publishArtifact` appends `Date.now() - start` to the publish ring; each successful `getArtifact` appends to the read ring. The admin panel reads via `getP95Latencies(workspaceId): { publish: number | 'insufficient_data', read: number | 'insufficient_data' }` — returns the literal string `'insufficient_data'` until the ring has ≥ 100 observations. **No DB persistence**; the buffer resets on process restart. Process-local is sufficient because the admin panel is a single-pane operator surface, not a fleet aggregator.
- **Throttle SQL** (FR-014, FR-032): exactly `WHERE type=? AND entity_type='task' AND entity_id=? AND created_at >= unixepoch() - 60`. Mirrors SPEC-006 `label_provisioning_failed` precedent at `src/lib/github-sync-engine.ts:200-209`. Indexed via `idx_activities_entity ON activities(entity_type, entity_id)` (existing, `migrations.ts:460`). The `artifact_quarantined_read_overridden` activity (FR-065) is NOT throttled — every override read produces exactly one row.
- **Dashboard rollup query** (FR-070-072): `SELECT date(triaged_at, 'unixepoch') AS day, disposition, COUNT(*) FROM task_dispositions WHERE workspace_id = ? AND triaged_at >= unixepoch() - 7*24*3600 GROUP BY day, disposition`. Cache key `(workspace_id, day_bucket)` lives in a process-local `Map`; invalidation hook fires inside `runPostCommitDispositionInsert` after a successful INSERT. Cache entries TTL 15 s. Client polls every 30 s.
- **Cursor pagination** (FR-051, FR-080): opaque base64url-encoded `JSON.stringify({ triaged_at: number, id: number })`. Server decodes and applies `WHERE (triaged_at, id) < (?, ?)`. Response shape `{ rows: Array<...>, next_cursor: string | null, has_more: boolean }` — NEW MC convention; deliberately diverges from `/api/activities` `{total, hasMore}` offset shape.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. Table omitted.
