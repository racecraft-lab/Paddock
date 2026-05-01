# Phase 0 Research: Area-Label GitHub Sync

**Feature**: SPEC-006 — Area-Label GitHub Sync
**Date**: 2026-05-01

All `NEEDS CLARIFICATION` markers from the technical context are resolved below. Each topic records the chosen decision, its rationale, and the alternatives considered.

---

## R-001 SQLite UNIQUE constraint timing for sync-owner transfer

**Question**: Can the `is_repo_sync_owner` partial unique index be deferred so the transfer-owner transaction can `INSERT INTO new` and `UPDATE OLD SET=0` in either order?

**Decision**: **No — SQLite does not support `DEFERRABLE` on UNIQUE constraints (only on FOREIGN KEY). The transfer transaction MUST clear the previous owner first, set the new owner second, and write the activity row third, all inside a single `db.transaction(() => { ... })`.**

**Rationale**:

- SQLite documentation (`https://www.sqlite.org/lang_createtable.html`) explicitly states `DEFERRABLE INITIALLY DEFERRED` only applies to FOREIGN KEY clauses. UNIQUE indexes are checked at statement end, not at transaction commit.
- The partial unique index `idx_projects_one_sync_owner_per_repo ON projects(workspace_id, github_repo) WHERE is_repo_sync_owner=1` would fire immediately if a `SET is_repo_sync_owner=1` ran before clearing the prior owner.
- The clear-then-set order is functionally identical (the transaction is atomic) and works against current SQLite without any version pin or pragma.

**Alternatives considered**:

- **DEFERRABLE on the unique index** — not supported by SQLite. Rejected.
- **Drop and recreate the index inside the transaction** — would briefly leave the invariant unprotected and adds two DDL statements per transfer. Rejected for complexity.
- **Use a single UPDATE with a CASE expression** — only works if both rows are in the same UPDATE statement; messy with the activity-write requirement. Rejected for clarity.

**Implication for plan**: FR-037 already records the required ordering (clear → set → activity). A unit test (FR-049) MUST assert that set-first ordering raises a UNIQUE violation, locking in the rule against future regressions.

---

## R-002 Backfill resume mechanism

**Question**: How does `backfillAreaRouting(workspaceId)` resume after interruption without re-processing already-completed tasks?

**Decision**: **Use a per-task column `tasks.area_routing_backfilled_at TIMESTAMP NULL` plus a partial index `idx_tasks_area_routing_backfill_pending ON tasks(workspace_id) WHERE github_issue_number IS NOT NULL AND area_routing_backfilled_at IS NULL`. Set the column to `unixepoch()` inside each per-task transaction.**

**Rationale**:

- Activity-log lookup (`SELECT 1 FROM activities WHERE … data->>'source'='backfill' AND … LIMIT 1`) is O(activities) per task. On a workspace with N tasks and average M activities each, the resume scan is O(N·M) — unacceptable on large workspaces.
- A column-based predicate is O(remaining-tasks) thanks to the partial index — only NULL rows need scanning.
- The migration cost is one nullable TIMESTAMP column, additive and rerun-safe.
- Resolved in Clarify Session 1.

**Alternatives considered**:

- **Activity-log lookup** — rejected on performance grounds.
- **Workspace-scoped `last_backfilled_task_id` cursor** — fragile if tasks are inserted out of order; harder to reason about retry of a specific failed task.
- **In-memory list passed across resume runs** — does not survive process restart; trivially wrong.

**Implication for plan**: M62 adds the column AND the partial index. The backfill `SELECT` uses `WHERE ... AND area_routing_backfilled_at IS NULL` so resume is fast on workspaces with thousands of tasks.

---

## R-003 Static `AREA_LABEL_MAP` color palette

**Question**: What exact colors does the shipped `AREA_LABEL_MAP` use for the 12 default area labels?

**Decision**: **Tailwind 700-level shades for the three new hues that need WCAG AA contrast against white text on GitHub label backgrounds: `area:design = be185d` (pink-700), `area:frontend = 0e7490` (cyan-700), `area:ml = 6d28d9` (violet-700). Existing palette colors are reused for the other nine entries.**

Full table (already in `spec.md` FR-030):

| name | color | source |
|------|-------|--------|
| `area:qa` | `a855f7` | reused (purple-500) |
| `area:dev` | `3b82f6` | reused (blue-500) |
| `area:design` | `be185d` | pink-700 — new for AA contrast |
| `area:infra` | `64748b` | reused (slate-500) |
| `area:security` | `ef4444` | reused (red-500) |
| `area:docs` | `eab308` | reused (yellow-500) |
| `area:ops` | `f97316` | reused (orange-500) |
| `area:frontend` | `0e7490` | cyan-700 — new for AA contrast |
| `area:backend` | `6366f1` | reused (indigo-500) |
| `area:data` | `22c55e` | reused (green-500) |
| `area:ml` | `6d28d9` | violet-700 — new for AA contrast |
| `area:triage` | `6b7280` | reused (gray-500) |

**Rationale**:

- GitHub renders label text in white when the background is dark, black otherwise. The 700-level shades give 4.5:1 white-text contrast. The five 500-level reuses already pass.
- A snapshot test in `src/lib/__tests__/github-label-map.test.ts` guards accidental drift (FR-030 note).

**Alternatives considered**:

- **All 500-level** — three labels (`design`, `frontend`, `ml`) would fail AA contrast.
- **All 700-level** — too dark for the rest of the palette and visually inconsistent with existing `mc:*` and `priority:*` labels that ship at 500.
- **Operator-customizable colors** — out of scope (Article XII speculative generality).

**Implication for plan**: FR-030 already encodes the table. The snapshot test is an explicit task in `tasks.md`.

---

## R-004 Per-sync routing cache

**Question**: How does the inbound routing avoid N+1 lookups on workspaces with many issues per sync?

**Decision**: **Build the cache once per `pullFromGitHub` invocation via a non-exported helper `loadAreaRoutingCache(db, workspaceId): { areaToProjectId: Map<string, number>, triageProjectId: number | null }`.** The helper runs one `SELECT id, area_slug, is_triage_project FROM projects WHERE workspace_id=?` and folds the result into a Map plus a single triage project id.

**Rationale**:

- `Map<area_slug, project_id>` is O(1) lookup per issue.
- One `SELECT` per sync invocation is well within the existing SQL budget; the query covers all routing-relevant rows in the workspace.
- Cache lifetime equals the sync call so there is no staleness model to reason about — a transaction inserting a new project mid-sync would not corrupt routing because routing reads happen only inside the helper's snapshot.

**Alternatives considered**:

- **Per-issue lookup** — N+1, rejected on performance.
- **Long-lived process-wide cache with TTL** — invalidation complexity; rejected per Article XI (Keep It Simple).
- **Materialized view in SQLite** — overkill; SQLite's planner handles the index well.

**Implication for plan**: The helper is a function-level addition inside `src/lib/github-sync-engine.ts`. No new module.

---

## R-005 Label-provisioning failure throttling

**Question**: How are `initializeLabels` per-label failures recorded without spamming the activity log on rate-limit storms?

**Decision**: **Aggregate all per-label failures from a single `initializeLabels` invocation into one `kind='label_provisioning_failed'` activity. Throttle inserts to at most one per `(workspace_id, github_repo)` per 24 hours by querying for an existing row with `created_at > unixepoch() - 86400` before insert.**

**Rationale**:

- The most common failure mode is a single GitHub rate-limit (429) that affects every label in one call. Without throttling, a single rate-limit event would write N activity rows (one per label).
- A 24h window aligns with GitHub's primary rate-limit reset cadence.
- Aggregating the failed labels into one row preserves auditability without flooding the log.
- The `data` shape in FR-027a captures `failed_labels: string[]`, `error_count: number`, and a truncated `sample_error` (no auth headers, no PII).

**Alternatives considered**:

- **One activity per failed label** — log spam during rate-limit storms.
- **No activity at all (logger only)** — operator visibility regresses; SC-007 acceptance fails.
- **Operator-tunable throttle window** — speculative generality; deferred per Article XII.

**Implication for plan**: FR-027 and FR-027a already encode the rule. The throttle SELECT runs inside the `initializeLabels` failure path; the existing activity-write helper takes the new kind.

---

## R-006 `area_slug` regex

**Question**: What format constraint applies to `projects.area_slug`?

**Decision**: **`^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$` — RFC 1123 / Kubernetes DNS label style. 1–32 chars, lowercase alphanumeric start AND end, hyphens permitted in the interior only. Single-character slugs (e.g., `q`) allowed via the optional outer group.**

**Rationale**:

- Mirrors the well-known DNS-label / Kubernetes resource-name convention so operators encounter no surprises.
- Disallows leading/trailing hyphens, which render awkwardly on GitHub labels (`area:-foo`).
- Disallows uppercase to keep inbound parsing simple — labels lowercase before lookup.
- 32-char ceiling matches the existing constraint envelope for short slugs in the codebase.
- Consecutive interior hyphens (`a--b`) are permitted by the regex consistent with K8s; if operators report visual issues, a stricter rule can layer on later (Article XII — do not preemptively reject).

**Alternatives considered**:

- **`^[a-z0-9-]{1,32}$`** (looser, allowed leading/trailing hyphens) — was the spec-draft default but rejected once K8s precedent surfaced. Tightened in spec post-clarify.
- **Allow uppercase** — would force inbound parsing to lowercase before lookup anyway; cleaner to reject up-front at validation.
- **Require minimum 3 characters** — arbitrary; some workspaces legitimately want `qa`, `ml`, `q`.

**Implication for plan**: FR-034 already encodes the regex. Validation lives in the PUT handler; UI mirrors the same regex for inline feedback.

---

## R-007 `initializeLabels` non-destructive idempotency

**Question**: When a label already exists on the GitHub repo with a different color or description than the desired definition, what does `initializeLabels` do?

**Decision**: **Leave it alone. `initializeLabels` is non-destructive — it creates labels that do not exist and never modifies existing labels' color or description.**

**Rationale**:

- Operators may legitimately customize label colors. Overwriting them on every connect would be hostile.
- The existing `mc:*` and `priority:*` initialization already follows this rule; SPEC-006 stays consistent.
- FR-026 already encodes this.

**Alternatives considered**:

- **Force-update colors to match the static map** — rejected as hostile.
- **Operator opt-in flag for force-update** — speculative generality; deferred per Article XII.

**Implication for plan**: No change to the existing label-creation HTTP path; only the label-set source (static + workspace dynamic) changes.

---

## R-008 Migration id reconciliation with SPEC-004

**Question**: Both SPEC-004 and SPEC-006 reserve M62. What happens when one merges first?

**Decision**: **Per `docs/migrations/migration-id-reservations.md`, first-to-merge keeps M62; the second rebases to M63 and renames its rollback SQL accordingly. The migration body and runtime behavior are unchanged regardless of final id.**

**Rationale**:

- This is an existing project convention (Article VII Additive Migration Policy + the migration-id-reservations doc).
- FR-007 already encodes the rule.
- SPEC-004 and SPEC-006 do not share columns or indexes; the only conflict is the integer suffix.

**Alternatives considered**:

- **Coordinate via shared lock file** — overkill; resolved by rebase.
- **Pre-allocate M62 to SPEC-004 unconditionally** — distorts the "first-to-merge" rule and would block SPEC-006 even if SPEC-004 stalls.

**Implication for plan**: The migration body in M62 stays identical. If SPEC-004 lands first, SPEC-006's tasks include a rebase task that renumbers to M63 and renames `docs/migrations/rollback-M62.sql` to `rollback-M63.sql`.

---

## Summary

All Phase 0 questions are resolved. The Technical Context section in `plan.md` carries no `NEEDS CLARIFICATION` markers. Phase 1 (data-model, contracts, quickstart) proceeds.
