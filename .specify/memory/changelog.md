# Project Memory Changelog

Auto-generated from Archive Sweep on 2026-04-28.

---

## SPEC-001: Foundation Migrations

- **Feature**: RC Factory Phase 0 schema tail (M53-M61)
- **Branch**: `001-foundation-migrations`
- **Spec Path**: `specs/001-foundation-migrations/`
- **PR URL**: https://github.com/racecraft-lab/mission-control/pull/15
- **Merge Commit**: `85baf27c218617f412a4a74f9feae13948fc26cd`
- **Tree Reference**: `git show 85baf27c218617f412a4a74f9feae13948fc26cd:specs/001-foundation-migrations/spec.md`
- **CI URL**: N/A (local HAL UAT accepted 2026-04-26)
- **Argos URL**: N/A (migration-only spec, no UI evidence)
- **Task Completion**: 35/35
- **Summary**: Appended migrations M53-M61 to `src/lib/migrations.ts` adding agent scope backfill (global for Aegis, Security Guardian, HAL), workflow-template routing metadata, task lineage fields, workspace feature-flag storage, task dispositions, task artifacts, facility workspace seed, resource policies, and resource policy events. All changes additive and rerun-safe. Paired with 9 rollback SQL files and rollback-procedure.md. No runtime behavior added.

**Recovery Commands**:
```text
git show 85baf27c218617f412a4a74f9feae13948fc26cd:specs/001-foundation-migrations/spec.md
git show 85baf27c218617f412a4a74f9feae13948fc26cd:specs/001-foundation-migrations/plan.md
git show 85baf27c218617f412a4a74f9feae13948fc26cd:specs/001-foundation-migrations/tasks.md
```

---

## SPEC-002: Product Line Switcher and activeWorkspace Scoping

- **Feature**: RC Factory Phase 1 — feature-flagged workspace switcher
- **Branch**: `002-product-line-switcher`
- **Spec Path**: `specs/002-product-line-switcher/`
- **PR URL**: https://github.com/racecraft-lab/mission-control/pull/16
- **Merge Commit**: `65f2e7ce0f99991760f0236e605c7daf8f44d770`
- **Tree Reference**: `git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/spec.md`
- **CI URL**: N/A (local verification)
- **Argos URL**: N/A (Argos build referenced in quickstart.md; generated screenshots not committed)
- **Task Completion**: 56/56
- **Summary**: Added `FEATURE_WORKSPACE_SWITCHER`-gated Product Line switcher. New production modules: `src/lib/feature-flags.ts` (resolveFlag), `src/types/product-line.ts` (discriminated scope types, scopeKey), `src/components/layout/workspace-switcher.tsx` (listbox, ARIA semantics, Facility/Product Line modes). Zustand persistence key `mc:active-workspace:v1`. Cross-tab BroadcastChannel sync. REST/SSE scope matrix with `workspace_scope=facility` / `workspace_id=<id>` contracts. Rejections: 400 for conflicting params or real facility row as PL id, 403 for unauthorized. `/api/events` scoped with reconnect on scope change. Baseline flag-OFF behavior preserved byte-compatible.

**Recovery Commands**:
```text
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/spec.md
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/plan.md
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/tasks.md
```

---

## SPEC-002A: Spec Archive and Evidence Retention

- **Feature**: Archive policy, evidence retention, speckit-pro 1.9.1 release
- **Branch**: `002a-spec-archive-evidence`
- **Spec Path**: `specs/002a-spec-archive-evidence/`
- **PR URLs**:
  - https://github.com/racecraft-lab/mission-control/pull/18 (Merge: `daab0c11f8896b31c2d24ed0a53419814671c3b1`)
  - https://github.com/racecraft-lab/mission-control/pull/19 (Merge: `e161a70ed9d415afaec3d0c5fb6d7fb682e6d884`)
- **Merge Commit**: `e161a70ed9d415afaec3d0c5fb6d7fb682e6d884` (latest)
- **Tree Reference**: `git show e161a70ed9d415afaec3d0c5fb6d7fb682e6d884:specs/002a-spec-archive-evidence/spec.md`
- **CI URL**: N/A
- **Argos URL**: N/A (evidence-policy spec; no UI journey)
- **Task Completion**: 47/47
- **Summary**: Established archive evidence policy (provenance-first, no committed screenshots by default). Installed `racecraft-lab/spec-kit-archive` archive extension v1.1.0 at `.specify/extensions/archive/`. Defined Archive Sweep lifecycle: autopilot pre-flight archives previously merged specs, excludes current target, dry-runs on unsafe branches/dirty worktrees. Released `speckit-pro` 1.9.1 (fix: archive sweep runs actual cleanup on feature branches instead of always dry-running). Argos/CI provenance links preferred over committed screenshots. Recovery-command format: `git show <merge-sha>:specs/<feature>/spec.md`.

**Recovery Commands**:
```text
git show e161a70ed9d415afaec3d0c5fb6d7fb682e6d884:specs/002a-spec-archive-evidence/spec.md
git show e161a70ed9d415afaec3d0c5fb6d7fb682e6d884:specs/002a-spec-archive-evidence/plan.md
git show e161a70ed9d415afaec3d0c5fb6d7fb682e6d884:specs/002a-spec-archive-evidence/tasks.md
```

---

## SPEC-003: Aegis Facility Singleton Refactor

- **Feature**: RC Factory Phase 2 — feature-flagged global Aegis resolver
- **Branch**: `003-global-aegis`
- **Spec Path**: `specs/003-global-aegis/`
- **PR URL**: https://github.com/racecraft-lab/mission-control/pull/20
- **Merge Commit**: `85d102f0e4941cc51d20534fa1d0fec787c8ad56`
- **Tree Reference**: `git show 85d102f0e4941cc51d20534fa1d0fec787c8ad56:specs/003-global-aegis/spec.md`
- **CI URL**: N/A (local verification — Vitest, Playwright, Argos metadata, typecheck, lint, build all green per retrospective)
- **Argos URL**: N/A (resolver-only spec; no new UI journey, only display-state coverage on existing surfaces)
- **Task Completion**: 21/21
- **Summary**: Introduced `src/lib/aegis.ts` exporting `getAegis(db, workspace_id?)` as the single Aegis lookup path. Routed `FEATURE_GLOBAL_AEGIS` through `resolveFlag(name, ctx)` evaluated against the requested-task/review workspace context. Flag OFF preserves workspace-first/global-fallback compatibility; flag ON prefers the global singleton with workspace fallback. Lowest-id tie breaking, no `agents.status` filtering. Idempotent `aegis_local_shadowed` activity row written once per `(workspace_id, global_agent_id, local_agent_id)` tuple under flag ON. Refactored `runAegisReviews` and `resolveGatewayAgentIdForReviewAgent` to source the reviewer through `getAegis` while preserving task selection, retry, dispatch, quality-review, activity, and `review/quality_review/assigned/failed/done` transition semantics. Removed `aegisAgentByWorkspace` map. Preserved `quality_reviews.reviewer='aegis'` as the live gate signal — no `quality_reviews.agent_id` introduced. Gateway fallback to agent id/name `aegis` retained when no DB-backed row exists. Strict scope: `src/lib/aegis.ts` added to `tsconfig.spec-strict.json` and `eslint.config.mjs`. No schema migrations.

**Recovery Commands**:
```text
git show 85d102f0e4941cc51d20534fa1d0fec787c8ad56:specs/003-global-aegis/spec.md
git show 85d102f0e4941cc51d20534fa1d0fec787c8ad56:specs/003-global-aegis/plan.md
git show 85d102f0e4941cc51d20534fa1d0fec787c8ad56:specs/003-global-aegis/tasks.md
```

---

<!-- Archive Sweep metadata -->
<!-- archiveMode: sweep | dryRun: false | applyCleanupRequested: true | safeToApplyCleanup: true -->
<!-- Branch: 006-area-label-github-sync (feature branch — cleanup applies per SPEC-002A policy) -->
<!-- Sweep run: 2026-05-01 | archiveExtension: 1.1.0 | excludedCurrentSpec: specs/006-area-label-github-sync -->
<!-- Backfill note: SPEC-006 autopilot Step -1 silently no-op'd because /speckit.archive.run was not wired into .claude/commands/. Wiring fixed and sweep re-run manually 2026-05-01 to backfill SPEC-003. -->

---

## SPEC-004: Task Pipeline Engine and Declarative Routing

- **Feature**: RC Factory Phase 3 — feature-flagged declarative task chains
- **Branch**: `004-task-pipeline-engine`
- **Spec Path**: `specs/004-task-pipeline-engine/`
- **PR URL**: https://github.com/racecraft-lab/mission-control/pull/22
- **Merge Commit**: `20643d81fc76b66fb6227300e178622066ac268e`
- **Tree Reference**: `git show 20643d81fc76b66fb6227300e178622066ac268e:specs/004-task-pipeline-engine/spec.md`
- **CI URL**: N/A (local verification — Vitest, Playwright, typecheck, lint, build, audit baseline cleared)
- **Argos URL**: N/A (engine + workflow-template UI; UI evidence via Playwright running-app)
- **Task Completion**: 88/88
- **Summary**: Added `FEATURE_TASK_PIPELINES`-gated declarative task pipeline engine. New strict-scope production modules: `src/lib/task-create.ts` (shared `createTask()` covering API, GitHub-import, GitHub-sync, recurring, and pipeline-successor profiles), `src/lib/output-schema-validator.ts` (constrained AJV profile, `safe-regex` patterns, hard caps on size/depth/budget), `src/lib/routing-rule-evaluator.ts` (allowlisted boolean grammar with bounded JSONPath traversal, no `eval`/`Function`/`vm`), and `src/types/workflow-template.ts`. Migration M62: partial unique successor index on non-null `tasks.parent_task_id`. Workflow-template fields (`slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, `allow_redacted_artifacts`) wired into `/api/workflows` (Product Line scope-aware) and the Workflows editor. `advanceTaskChain` runs inside a single transaction with deferred outbound GitHub/GNAP push; one-successor-per-parent enforced; explicit operator retry endpoint with template-provenance hash check (SHA-256 over canonical JSON). Stable activity reason codes for every failure/stall class; `chain_retry` summary excludes raw output and routing traces. Pinned runtime deps: `ajv@8.18.0`, `jsonpath-plus@10.4.0`, `safe-regex@2.1.1`. Consolidated CI guardrails behind `pnpm guardrails`. Storybook screenshot upload removed (Argos owns visual review).

**Recovery Commands**:
```text
git show 20643d81fc76b66fb6227300e178622066ac268e:specs/004-task-pipeline-engine/spec.md
git show 20643d81fc76b66fb6227300e178622066ac268e:specs/004-task-pipeline-engine/plan.md
git show 20643d81fc76b66fb6227300e178622066ac268e:specs/004-task-pipeline-engine/tasks.md
```

---

## SPEC-006: Area-Label GitHub Sync

- **Feature**: RC Factory Phase 5 — `area:*` GitHub label routing + repo-level sync ownership for shared monorepos
- **Branch**: `006-area-label-github-sync`
- **Spec Path**: `specs/006-area-label-github-sync/`
- **PR URL**: https://github.com/racecraft-lab/mission-control/pull/21
- **Merge Commit**: `dbb6c758f7f2796b06659fc70b52d16b13efee30`
- **Tree Reference**: `git show dbb6c758f7f2796b06659fc70b52d16b13efee30:specs/006-area-label-github-sync/spec.md`
- **CI URL**: N/A (local verification — focused Vitest, Playwright running-app journeys, typecheck, lint, build all green per workflow file Phase 7)
- **Argos URL**: N/A (project settings UI extends existing surface; visual review via Playwright running-app)
- **Task Completion**: Roadmap and SPEC-006 workflow file (`docs/ai/specs/SPEC-006-workflow.md`) record Implement phase Complete with implementation commits including `5f92f17` and PR #21 merged. The branch-local `specs/006-area-label-github-sync/tasks.md` file shows 22 of 88 task checkboxes ticked (pre-merge tracking drift documented in roadmap "stale pre-merge wording" note); the roadmap and workflow tracker are the authoritative status sources for SPEC-006 completion. Outstanding bookkeeping is captured in Outstanding Items.
- **Summary**: Added `FEATURE_AREA_LABEL_ROUTING`-gated multi-department routing for shared GitHub monorepos. Migration M62: four nullable columns (`projects.area_slug`, `projects.is_triage_project`, `projects.is_repo_sync_owner`, `tasks.area_routing_backfilled_at`) plus four indexes — including partial unique indexes `idx_projects_one_sync_owner_per_repo` and `idx_projects_one_triage_per_workspace`. Single sync owner per `(workspace_id, github_repo)` elected by lowest `projects.id` (only `github_sync_enabled=1` projects considered). Inbound: `area:*` parsed → resolves to project by `area_slug` (`single_match`), triage project (`no_label` / `multi_label` / `no_match`), or sync-owner fallback (`no_triage`). First-ingest only — no re-route on label change (P5-AC5 no-thrash guarantee). Outbound: `area:<slug>` emitted alongside `mc:*`/`priority:*` when project has non-NULL `area_slug`. `backfillAreaRouting(workspaceId)` runs once per workspace on first flag-on (per-task transactions, monotonic `tasks.area_routing_backfilled_at` resume marker, workspace-level `area_label_routing_backfill_completed_at` completion marker set last). `initializeLabels(repo, workspaceId)` triggered on connect, on `area_slug`/`is_triage_project` transition, and once per workspace bootstrap; failures throttled to one `label_provisioning_failed` activity per `(workspace_id, github_repo)` per 24h with sanitized payload. `PUT /api/projects/[id]` accepts `area_slug`, `is_triage_project`, `is_repo_sync_owner`, `transfer_owner`; 409 conflict shapes `area_slug_conflict` / `triage_conflict` / `owner_conflict`; sync-owner transfer is atomic clear-then-set (SQLite UNIQUE indexes are immediate, not DEFERRABLE). Static `AREA_LABEL_MAP` covers 12 curated area names. Project Manager modal extends existing surface; flag-OFF disables fields with explanatory tooltip.

**Recovery Commands**:
```text
git show dbb6c758f7f2796b06659fc70b52d16b13efee30:specs/006-area-label-github-sync/spec.md
git show dbb6c758f7f2796b06659fc70b52d16b13efee30:specs/006-area-label-github-sync/plan.md
git show dbb6c758f7f2796b06659fc70b52d16b13efee30:specs/006-area-label-github-sync/tasks.md
```

---

<!-- Archive Sweep metadata -->
<!-- archiveMode: sweep | dryRun: false | applyCleanupRequested: true | safeToApplyCleanup: true -->
<!-- Branch: 007-disposition-artifacts (feature branch — cleanup applies per SPEC-002A policy) -->
<!-- Sweep run: 2026-05-01 | archiveExtension: 1.1.0 | excludedCurrentSpec: specs/007-disposition-artifacts -->
<!-- Backfilled SPEC-004 (PR #22) and SPEC-006 (PR #21); both merged on main but 005-ready-for-owner worktree never executed Phase 0 archive sweep, leaving residual specs/004 and specs/006 directories that this run cleans up. -->
