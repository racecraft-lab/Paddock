---
spec_id: SPEC-006
spec_name: Area-Label GitHub Sync
short_name: area-label-github-sync
phase: 5
priority: P1
feature_flag: FEATURE_AREA_LABEL_ROUTING
question_count: 18
status: draft
created_at: 2026-05-01
authority: Operator (interactive grill-me session)
---

# SPEC-006 — Area-Label GitHub Sync — Design Concept

## Context

Paddock's GitHub sync is currently project-driven: every project with `github_sync_enabled=1` polls its own `(workspace_id, github_repo)`. This works when each repo maps to one project, but breaks down when a single product-line monorepo serves multiple department kanbans (e.g., `racecraft/product-line-a` serving Dev, QA, Infra, and Docs projects). SPEC-006 introduces `area:*` label routing so a single repo can fan out to many projects, plus repo-level sync ownership so polling does not duplicate.

The feature is gated by `FEATURE_AREA_LABEL_ROUTING` (already registered, `activationScope: 'productLineWorkspace'`, `defaultValue: false`, `requiresPreflight: true`). With the flag OFF, behavior is byte-identical to today.

## Goals

1. **One owner per repo.** When 2+ projects share `(workspace_id, github_repo)`, only one polls — eliminating duplicate ingestion and unique-constraint thrash.
2. **Inbound area routing.** Issues with exactly one resolvable `area:<slug>` label route to the corresponding project; ambiguous or unresolvable issues route to the workspace's triage project (or sync-owner project if no triage project is designated).
3. **Outbound area emission.** Tasks in projects with `area_slug` set push their `area:<slug>` label alongside `mc:*` and `priority:*`.
4. **Idempotent label provisioning.** `area:*` labels are created on the GitHub repo on connect, on `area_slug` change, and on first sync after flag-on, without overwriting existing label color/description.
5. **Safe migration.** Existing tasks already synced under the legacy per-project model are re-evaluated by an automatic per-workspace backfill on first flag-on, with per-task transactions and a completion marker.
6. **No new top-level modules.** All logic lives in `src/lib/github-sync-engine.ts`, `src/lib/github-label-map.ts`, and `src/lib/migrations.ts`. Strict scope stays N/A.

## Non-Goals

- **No new admin panel.** Editing `area_slug`, `is_triage_project`, and `is_repo_sync_owner` happens via the existing project settings panel and `PUT /api/projects/[id]`. No `area-routing-admin-panel.tsx` module.
- **No new dedicated routing module.** No `src/lib/github-area-routing.ts` extraction. All logic in existing files.
- **No re-routing on label changes.** Once a task is ingested with a project_id, subsequent GitHub label changes do NOT move it between MC projects. "No thrash" means stable per-task project_id after initial assignment.
- **No external secret detector.** Label and slug data is not secret material; SPEC-007 owns the artifact secret detector.
- **No destructive schema change.** All migrations are additive nullable columns; rollback drops columns or sets flag OFF.
- **No multi-repo product-line sync.** This spec assumes one repo per product-line workspace (the monorepo case). Multi-repo product lines are a SPEC-009/010 concern.
- **No per-project rate limit shaping.** GitHub API call volume is governed by the existing sync engine's pacing; this spec does not alter it.

## Design Decisions (Q&A Log)

### Q1. Repo-level sync ownership model

**Question:** When 2+ projects share `(workspace_id, github_repo)`, only one should poll the repo. How is sync ownership modeled?

**Decision:** **`projects.is_repo_sync_owner` flag.**

Add `is_repo_sync_owner BOOLEAN DEFAULT 0` to `projects`. Elect one project per `(workspace_id, github_repo)` as the poll owner; non-owners receive routed tasks passively. Lightest touch on existing schema.

**Implication for plan:** Migration M62 adds the column. Poller (`github-sync-poller.ts`) gains a `WHERE is_repo_sync_owner=1` filter when `FEATURE_AREA_LABEL_ROUTING` resolves true for the workspace. Partial unique index `(workspace_id, github_repo) WHERE is_repo_sync_owner=1` enforces the invariant.

### Q2. Initial owner election + transfer

**Question:** How does the migration pick the initial owner, and how is ownership transferred later?

**Decision:** **Backfill oldest project, transfer via API.**

Migration sets `is_repo_sync_owner=1` for `MIN(projects.id)` per `(workspace_id, github_repo)` group with `github_sync_enabled=1`. Partial unique index enforces single owner. Transfer happens via `PUT /api/projects/[id]` with a transactional swap (clear old, set new) and validation.

**Implication for plan:** Migration includes the backfill SELECT/UPDATE. PUT endpoint validation rejects setting `is_repo_sync_owner=1` if another project in the same `(workspace_id, github_repo)` group already holds it (use 409 Conflict with `transfer_owner=true` to override).

### Q3. Area-slug source

**Question:** How does the system resolve `area:<x>` labels to a project?

**Decision:** **New `projects.area_slug` column.**

Add `projects.area_slug TEXT NULL` with index on `(workspace_id, area_slug)`. NULL means the project is not an area-routing target. Operators set it explicitly; project slug stays human-readable and decoupled from the compact area label (e.g., `slug='quality-assurance'` while `area_slug='qa'`).

**Implication for plan:** Migration M62 adds the column. Inbound routing queries `(workspace_id, area_slug=<x>)`. Outbound emits `area:<area_slug>`. Validation: `area_slug` must match `^[a-z0-9-]{1,32}$` and be unique within `(workspace_id, area_slug)`.

### Q4. Triage/inbox project model + missing-triage behavior

**Question:** How is the workspace's triage project identified, and what happens if the flag is ON but no triage project is set?

**Decision:** **`is_triage_project` flag, fail open if absent.**

Add `projects.is_triage_project BOOLEAN DEFAULT 0` with partial unique index `(workspace_id) WHERE is_triage_project=1`. Operator designates one per workspace. If absent, unresolvable issues route to the **sync-owner project** with an `area_routing_unresolved` activity recording `reason='no_triage'`. Migration leaves all = 0; operator opts in.

**Implication for plan:** Validation: only one `is_triage_project=1` per workspace. Activity log captures the missing-triage condition explicitly so operators can see what's being silently routed to the sync owner.

### Q5. Re-route semantics (anti-thrash)

**Question:** Once a task has `project_id`, do later GitHub label changes move it between MC projects? P5-AC5: 'do not thrash between departments.'

**Decision:** **Route on initial ingest only.**

`project_id` is set on first ingest based on `area:*` at that moment. Subsequent label changes on GitHub do NOT move the task between MC projects. Operator can manually re-assign via task detail UI. Strongest "no thrash" interpretation, simplest activity story.

**Implication for plan:** Inbound routing logic distinguishes "first ingest" (no existing task for `(workspace_id, github_repo, github_issue_number)`) from "subsequent sync" (task exists). Subsequent syncs update title/body/labels but never change `project_id`. Add explicit assertion in test: "task already exists ⇒ project_id unchanged regardless of area:* labels."

### Q6. Outbound `area:*` source

**Question:** When `pushTaskToGitHub` emits `area:*`, what's the source? Roadmap says `area:<project_slug>` but `area_slug` is decoupled.

**Decision:** **`area:<projects.area_slug>` if set, else omit.**

Outbound emits `area:<area_slug>` only when `area_slug` is non-NULL. Projects not opted into area routing don't get an `area:*` label. Symmetric with inbound. Triage project (if `area_slug='triage'`) emits `area:triage` on outbound. Roadmap text updated to read `area:<projects.area_slug>`.

**Implication for plan:** `pushTaskToGitHub` reads `area_slug` from the resolved project record (already loaded for the github_sync_enabled check). One-line addition to the outbound label list.

### Q7. Label-provisioning source of truth (hybrid)

**Question:** Static set in `github-label-map.ts` vs. dynamic per workspace from `area_slug` values?

**Decision:** **Hybrid: ship default set + augment dynamically.**

`github-label-map.ts` ships a static `AREA_LABEL_MAP` with common defaults: `qa`, `dev`, `design`, `infra`, `security`, `docs`, `ops`, `frontend`, `backend`, `data`, `ml`, `triage`. `initializeLabels(repo, workspaceId?)` creates these defaults plus any non-NULL `projects.area_slug` values for that workspace not already in the static map. Existing labels with different color/description are left alone (non-destructive idempotency).

**Implication for plan:** `AREA_LABEL_MAP` is a `Record<string, LabelDef>` (~12 entries). `areaLabelsForWorkspace(workspaceId)` queries `projects` and returns the union (defaults + workspace-specific). `ALL_AREA_LABEL_NAMES` exports the static defaults only (matches the typed-set pattern of existing exports). Snapshot test of the default map prevents accidental drift.

### Q8. Existing-issue backfill scope

**Question:** When the flag flips ON in a workspace, what happens to issues already synced under the legacy per-project model?

**Decision:** **One-time backfill migration.**

A backfill routine re-evaluates `area:*` labels on existing tasks within the workspace and moves them to the resolved project. Single-area resolves to that project; multi-area or unresolvable goes to triage (or sync-owner project if no triage); no `area:*` label stays where it is. Records an `area_routing_resolved` or `area_routing_unresolved` activity per moved task with `source: 'backfill'`.

**Implication for plan:** Backfill function in `github-sync-engine.ts` named `backfillAreaRouting(workspaceId)`. Operates only on tasks linked to GitHub issues (`tasks.github_issue_number IS NOT NULL`) for repos owned by `is_repo_sync_owner=1` projects in the workspace.

### Q9. Backfill trigger

**Question:** How is the backfill triggered?

**Decision:** **Auto-run on first flag-on per workspace.**

When `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })` resolves true for the first time for that workspace, the backfill runs once. Tracked via `workspaces.feature_flags JSON.area_label_routing_backfill_completed_at` timestamp. Subsequent flag toggles do not re-run. Idempotent guard: skip if timestamp set.

**Implication for plan:** Backfill is invoked from the poller's pre-loop check for that workspace, OR from a flag-resolution side-channel. Detail in plan-phase: where is the most reliable hook? Likely the sync-owner poller invocation. Activity log surfaces results.

### Q10. Activity log shape

**Question:** What activities should the routing system record?

**Decision:** **Two kinds: `area_routing_resolved` and `area_routing_unresolved`.**

```
activities.kind = 'area_routing_resolved'
activities.data = {
  area_labels: string[],
  resolved_project_id: number,
  reason: 'single_match',
  source: 'ingest' | 'backfill',
  github_issue_number: number,
  workspace_id: number,
  github_repo: string
}

activities.kind = 'area_routing_unresolved'
activities.data = {
  area_labels: string[],
  resolved_project_id: number | null,    // triage or sync-owner fallback
  reason: 'no_label' | 'multi_label' | 'no_match' | 'no_triage',
  source: 'ingest' | 'backfill',
  github_issue_number: number,
  workspace_id: number,
  github_repo: string
}
```

Recorded on initial ingest and during backfill. Not recorded on subsequent syncs of already-routed tasks (keeps log clean).

**Implication for plan:** Activity-write helper centralized in github-sync-engine.ts. Test fixtures cover all six `reason` codes.

### Q11. API + UI surface (strict scope)

**Question:** How do operators set `area_slug`, `is_triage_project`, `is_repo_sync_owner`?

**Decision:** **Extend existing `PUT /api/projects/[id]` and project settings UI.**

Add the three fields to the existing project update endpoint with validation. Extend the existing project settings panel (existing TSX file edit, no new module). Strict scope stays N/A.

**Implication for plan:** Validation rules:
- `area_slug` matches `^[a-z0-9-]{1,32}$` or is NULL
- `(workspace_id, area_slug)` unique when non-NULL
- `is_triage_project=1` exclusive per `workspace_id`
- `is_repo_sync_owner=1` exclusive per `(workspace_id, github_repo)` (transfer requires `transfer_owner=true` flag)

UI: project settings panel gains three optional fields with inline validation feedback.

### Q12. Lookup cache for inbound routing

**Question:** How do we avoid N+1 lookups when routing many issues in one sync?

**Decision:** **Per-sync-call Map cache.**

At the start of each `pullFromGitHub` invocation, run one query: `SELECT id, area_slug, is_triage_project FROM projects WHERE workspace_id=?` (ranges all routing-relevant rows). Build a `Map<area_slug, project_id>` and a single `triageProjectId: number | null`. The routing loop does in-memory lookups. Cache lifetime = single sync call. Always fresh, no staleness.

**Implication for plan:** Helper `loadAreaRoutingCache(workspaceId)` returns `{ areaToProjectId: Map, triageProjectId: number | null }`. Called once at sync start. Total of ~1 extra query per sync invocation.

### Q13. `initializeLabels` timing

**Question:** When should `initializeLabels` provision `area:*` labels on the repo?

**Decision:** **On connect + on `area_slug` change + on first sync poll after flag-on.**

Three trigger points:
1. **On connect** — extend existing call from `POST /api/github` to pass `workspaceId` so area labels get created when the repo is connected.
2. **On `area_slug` change** — `PUT /api/projects/[id]` re-runs `initializeLabels(repo, workspaceId)` for the workspace's repo when `area_slug` or `is_triage_project` transitions to a new value.
3. **On first sync poll after flag-on** — initial bootstrap before the auto-backfill runs (covers the case where the flag is enabled on a workspace whose repo was connected before SPEC-006 shipped).

After this initial bootstrap, subsequent polls do NOT re-run `initializeLabels`.

**Implication for plan:** `initializeLabels(repo: string, workspaceId?: number)` signature; when `workspaceId` is provided, also creates area labels (defaults + workspace-specific). Idempotent at GitHub level. Failure isolation: rate-limit/network errors are caught and logged; sync proceeds.

### Q14. Module boundaries (strict scope)

**Question:** Where does the new logic live?

**Decision:** **Keep in existing files.**

- `src/lib/github-sync-engine.ts` — inbound routing (~40 LOC), outbound emission (~10 LOC), backfill function (~50 LOC), per-sync cache helper (~10 LOC), `initializeLabels` extension (~15 LOC).
- `src/lib/github-label-map.ts` — `AREA_LABEL_MAP`, `areaLabelsForWorkspace`, `ALL_AREA_LABEL_NAMES` (~30 LOC).
- `src/lib/migrations.ts` — M62 adds `area_slug`, `is_triage_project`, `is_repo_sync_owner` + indexes + backfill of owner column.
- `src/app/api/projects/[id]/route.ts` — extended PUT handler.
- Project settings TSX panel — three new fields.

No new modules. Strict scope stays N/A.

**Implication for plan:** Total LOC budget: ~150 production + ~300 test. Files-touched list pinned.

### Q15. Documentation

**Question:** What docs to update?

**Decision:** **New `docs/github-sync.md` + flag runbook update.**

- New `docs/github-sync.md` — full sync model documentation: connect/disconnect, label initialization, polling, inbound issue handling, outbound task push, area:* routing, sync ownership, triage project, area_slug, backfill.
- Update `docs/feature-flags-runbook.md` to add `FEATURE_AREA_LABEL_ROUTING` preflight checklist (verify `area_slug` set on at least one project before flag-on, verify `is_repo_sync_owner` exactly one per `(workspace_id, github_repo)`, verify triage project designated if expected).
- Update `docs/orchestration.md` if it has a project-routing section (likely add a brief pointer to `docs/github-sync.md`).

**Implication for plan:** Tasks include the new doc file and runbook updates.

### Q16. Test strategy

**Question:** What test coverage for P5-AC1 through P5-AC7?

**Decision:** **Unit + integration + e2e for project settings UI.**

- **Unit tests** in `src/lib/__tests__/github-sync-engine.test.ts` (extended) and `src/lib/__tests__/github-label-map.test.ts` (new or extended) covering: label parsing (`area:*` + `mc:*` + `priority:*` mixed), area resolution paths (single match, multi label, no label, no match in lookup), `is_repo_sync_owner` gating in poller selection query, outbound emission with/without `area_slug`, backfill logic with idempotency check, per-sync cache correctness across multiple issues.
- **Integration tests** with mocked GitHub client: full `pullFromGitHub` cycle with mixed-label issue set; full `pushTaskToGitHub` cycle for a task in an `area_slug='qa'` project; `initializeLabels` with workspace context; auto-backfill on first flag-on.
- **Playwright e2e** verifying `area_slug`, `is_triage_project`, `is_repo_sync_owner` editable in the project settings panel with validation feedback for collisions.

**Implication for plan:** Tasks include test files. Coverage target: every P5-AC has at least one test asserting it directly.

### Q17. Backfill atomicity

**Question:** How does the auto-backfill handle interruption and failure isolation?

**Decision:** **Per-task transaction + final timestamp marker.**

Each task move is its own transaction:
1. SELECT task by id
2. Resolve area from current GitHub labels (already cached on the issue or re-derived from `tasks.github_labels` if stored)
3. UPDATE `tasks.project_id` (or leave if no change)
4. INSERT activity row (`area_routing_resolved` or `area_routing_unresolved`, `source='backfill'`)
5. COMMIT

Failures are caught per task, logged, counted, and do NOT abort the run. The completion marker `workspaces.feature_flags.area_label_routing_backfill_completed_at` is set last; if the backfill is interrupted, the next flag-on attempt resumes (idempotent: already-evaluated tasks are skipped via either a per-task `last_backfilled_at` field on `tasks` OR by checking the activity log for a recent `source='backfill'` row).

**Implication for plan:** Decide between `last_backfilled_at` column vs. activity-log lookup during clarify-phase consensus. Activity-log lookup avoids a new column but is O(activities) per task. A new nullable column `tasks.area_routing_backfilled_at` is cleaner if we accept a tiny migration cost.

## Open Questions (for /speckit.clarify)

The grill-me interview surfaced these questions that need either consensus resolution or explicit clarification before tasks are generated:

1. **Backfill resumption mechanism.** Per-task transaction + timestamp marker (Q17) needs: do we add `tasks.area_routing_backfilled_at TIMESTAMP NULL` (small migration, clean lookup) OR check the activity log for a recent `source='backfill'` row (no migration, O(activities) per task)? Recommend the column for predictable performance.

2. **Static default `AREA_LABEL_MAP` exact contents.** Q7 chose hybrid; the static defaults are listed as `qa, dev, design, infra, security, docs, ops, frontend, backend, data, ml, triage` — but the precise list (and label colors matching the existing palette) needs operator confirmation.

3. **Conflict between `area_slug='triage'` and `is_triage_project=0`.** If a project has `area_slug='triage'` set but `is_triage_project=0`, what's the routing semantics? Recommend: `area:triage` label always routes through the `is_triage_project=1` project; the slug `'triage'` on a non-triage project is allowed but inert for routing (operator footgun, but explicit validation rejection is also acceptable).

4. **Owner deletion / `github_sync_enabled` toggle.** When the sync-owner project is deleted or has `github_sync_enabled` flipped to 0, what happens? Recommend: trigger automatic re-election to the next-oldest project with `github_sync_enabled=1` in the same `(workspace_id, github_repo)` group; if none exist, sync stops for that repo and an activity is recorded.

5. **`initializeLabels` rate-limit recovery.** Q13 says failures are caught and logged with sync proceeding. Should the sync engine record an `area_routing_unresolved` activity with `reason='label_provisioning_failed'` to make the failure visible? Recommend yes.

6. **Outbound `area:*` for tasks already in a project without `area_slug` set when flag is ON.** Tasks in projects that have NULL `area_slug` and `FEATURE_AREA_LABEL_ROUTING` ON: do they emit no `area:*` (current Q6 decision) or fall back to `mc:no-area`? Recommend Q6 decision (no `area:*` emitted) — keeping the design symmetric.

7. **Migration ordering with SPEC-004.** SPEC-004 (Task Pipeline Engine) is in flight. Its migration number may collide with SPEC-006's M62. Need to confirm M62 → M63 reservation per merge order. Defer to autopilot rebase.

8. **Backward-compat for `(workspace_id, github_repo, github_issue_number)` unique constraint after backfill moves tasks.** Backfill changes `tasks.project_id` but not the unique constraint key. Confirm no constraint violation. Recommend explicit test.

## Acceptance Criteria Mapping

| ID | Roadmap Acceptance | Decision Coverage | Test |
|----|---------------------|--------------------|------|
| P5-AC1 | Flag OFF behaves as today | Q5 + Q11 (column adds are nullable; poller/engine read flag) | Unit + integration with flag OFF |
| P5-AC2 | Multi-project shared repo: no duplicate poll/ingest | Q1 + Q2 | Unit (poller filter), integration (two projects share repo) |
| P5-AC3 | `area:qa` → QA project, `area:dev` → Dev | Q3 + Q5 + Q12 | Integration with mocked issue set |
| P5-AC4 | No-label routes to triage with `area:triage` tag | Q4 + Q10 | Integration |
| P5-AC5 | Multi-label routes to triage, no thrash | Q4 + Q5 + Q10 | Integration |
| P5-AC6 | Outbound emits `area:<project_slug>` | Q6 | Integration |
| P5-AC7 | `initializeLabels` idempotent | Q7 + Q13 | Unit + integration |

## Risks and Rollback

- **Migration risk:** M62 adds three nullable columns + indexes. Additive only. Rollback: drop columns + indexes; flag stays OFF.
- **Backfill risk:** Per-task transactions isolate failures. Worst case: partial backfill, completion marker not set, retry on next flag-on. No data loss possible.
- **Sync-owner regression:** Wrong election could silence one workspace's polling. Mitigation: deterministic `MIN(projects.id)` rule, partial unique index, integration test with multiple projects sharing repo.
- **GitHub label rate limits:** `initializeLabels` could hit rate limits. Mitigation: failure isolation, best-effort, retry on next trigger point.
- **Strict scope drift:** Q14 keeps everything in existing files. Reviewer should grep for new `area-routing*.ts` modules and reject if introduced.

**Rollback:** Flip `FEATURE_AREA_LABEL_ROUTING` OFF in the workspace's `feature_flags JSON`. Inbound stops parsing `area:*`; outbound stops emitting `area:*`; poller falls back to per-project polling. Existing rows untouched. The completion marker remains so that re-enabling later does not re-run the backfill (operator can clear it manually if a fresh backfill is desired).

## Dependencies and Enables

- **Depends on:** SPEC-001 (Foundation Migrations: workspaces.feature_flags JSON, additive migration pattern), SPEC-002 (Product-Line Switcher: `resolveFlag(name, ctx)` with `workspaceId` context), SPEC-002A (Spec Archive — process only).
- **Enables:** SPEC-009 (Product Line A Pilot — relies on area:* routing for monorepo dispatch).
- **Coexists with:** SPEC-004 (Task Pipeline Engine) in flight — migration ordering must be reconciled at rebase time.

## Source

- Technical roadmap: `docs/ai/rc-factory-technical-roadmap.md` Phase 5.
- Existing code touched: `src/lib/github-sync-engine.ts`, `src/lib/github-label-map.ts`, `src/lib/github-sync-poller.ts`, `src/lib/feature-flags.ts`, `src/lib/migrations.ts`, `src/app/api/projects/[id]/route.ts`, project settings TSX panel.
- Operator interview: 2026-05-01, 18 questions, no escapes to Other beyond Q13's bootstrap-on-first-sync addition.
