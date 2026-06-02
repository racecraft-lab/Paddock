# Project Memory Changelog

Auto-generated from Archive Sweep on 2026-04-28.

---

## SPEC-001: Foundation Migrations

- **Feature**: RC Factory Phase 0 schema tail (M53-M61)
- **Branch**: `001-foundation-migrations`
- **Spec Path**: `specs/001-foundation-migrations/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/15
- **Merge Commit**: `85baf27c218617f412a4a74f9feae13948fc26cd`
- **Tree Reference**: `git show 85baf27c218617f412a4a74f9feae13948fc26cd:specs/001-foundation-migrations/spec.md`
- **CI URL**: N/A (local operator-node UAT accepted 2026-04-26)
- **Argos URL**: N/A (migration-only spec, no UI evidence)
- **Task Completion**: 35/35
- **Summary**: Appended migrations M53-M61 to `src/lib/migrations.ts` adding agent scope backfill (global for Aegis, Security Guardian, <operator-agent>), workflow-template routing metadata, task lineage fields, workspace feature-flag storage, task dispositions, task artifacts, facility workspace seed, resource policies, and resource policy events. All changes additive and rerun-safe. Paired with 9 rollback SQL files and rollback-procedure.md. No runtime behavior added.

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
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/16
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
  - https://github.com/racecraft-lab/Paddock/pull/18 (Merge: `daab0c11f8896b31c2d24ed0a53419814671c3b1`)
  - https://github.com/racecraft-lab/Paddock/pull/19 (Merge: `e161a70ed9d415afaec3d0c5fb6d7fb682e6d884`)
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
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/20
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
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/22
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
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/21
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

<!-- Adjacent sweep on SPEC-008 worktree (2026-05-02) -->
<!-- Branch: 008-resource-governance (feature branch — cleanup applies per SPEC-002A policy) -->
<!-- Sweep run: 2026-05-02 | archiveExtension: 1.1.0 | excludedCurrentSpec: specs/008-resource-governance -->
<!-- Backfill note: 008 worktree was forked from main pre-SPEC-007-merge, so specs/004 and specs/006 directories were still present at the time. After origin/main merge brought in SPEC-007's cleanup commits, both backfill entries above are reconciled to the canonical SPEC-007 record. Adjacent-addition resolved by keeping SPEC-007's canonical entry. -->


<!-- SPEC-008 — Resource Governance + Observability (branch 008-resource-governance) -->
<!-- Implementation complete 2026-05-02 -->
<!-- Phases 7.1-7.13 closed; Phase 7.14 Phase 6 Analyze remediation pending. -->
<!-- Two new flags: FEATURE_RESOURCE_GOVERNANCE (workspace, default OFF, no enableRequires), FEATURE_OPENCLAW_HEALTH_COSTS (workspace, default OFF, enableRequires FEATURE_RESOURCE_GOVERNANCE). -->
<!-- Migrations M65a..m + M66 additive + rerun-safe. -->
<!-- Cost Tracker Governance tab gated by FEATURE_RESOURCE_GOVERNANCE; flag-OFF preserves byte-compat per FR-305 / FR-238. -->
<!-- Constitution V matrix coverage: src/lib/feature-flag-matrix.ts harness + tests/integration/feature-flag-matrix.test.ts (47 tests) + tests/e2e/feature-flag-matrix.e2e.ts (9 flag rows OFF/ON). -->
<!-- CI guards added: scripts/spec-008/check-axe-coverage.mjs (FR-090n WCAG 2.1 AA), scripts/spec-008/check-feature-flag-env-leak.mjs (FR-019 / FR-325). -->
<!-- Verification evidence archived at docs/ai/specs/SPEC-008-verification-evidence.md. -->

---

<!-- Archive Sweep metadata -->
<!-- archiveMode: sweep | dryRun: false | applyCleanupRequested: true | safeToApplyCleanup: true -->
<!-- Branch: main (safe base branch) | Sweep run: 2026-05-16 | archiveExtension: 1.1.0 | excludedCurrentSpec: None -->
<!-- Cleanup command: speckit.archive.run --sweep --apply-cleanup -->

## SPEC-005: ready_for_owner State and Two-Step Terminal Event

- **Feature**: RC Factory Phase 4 — PR-producing work stops at `ready_for_owner` until human merge evidence arrives
- **Branch**: `005-ready-for-owner`
- **Spec Path**: `specs/005-ready-for-owner/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/23
- **Merge Commit**: `851571fe6bac29563e6bef8cb124d0b108791c73`
- **Tree Reference**: `git show b21d9f94f19d53813e3c1c5acc1ebd2b45b081c4:specs/005-ready-for-owner/spec.md`
- **CI URL**: N/A (local verification recorded in workflow)
- **Argos URL**: N/A
- **Task Completion**: 79/79
- **Summary**: Added application-level `ready_for_owner` vocabulary, owner-gate routing for PR-producing workflows, `mc:ready-for-owner` labeling, notifications, Kanban lane support, flag-off write blocking/read visibility, and explicit GitHub-merge reconciliation through `pullFromGitHub`.

**Recovery Commands**:
```text
git show b21d9f94f19d53813e3c1c5acc1ebd2b45b081c4:specs/005-ready-for-owner/spec.md
git show b21d9f94f19d53813e3c1c5acc1ebd2b45b081c4:specs/005-ready-for-owner/plan.md
git show b21d9f94f19d53813e3c1c5acc1ebd2b45b081c4:specs/005-ready-for-owner/tasks.md
```

---

## SPEC-007: Disposition Logging and Task Artifact Store

- **Feature**: RC Factory Phase 6 — durable dispositions, artifacts, redaction, and review evidence
- **Branch**: `007-disposition-artifacts`
- **Spec Path**: `specs/007-disposition-artifacts/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/25
- **Merge Commit**: `953f29bee7432450002dac00a4f88e7bb1fdd38a`
- **Tree Reference**: `git show b21d9f94f19d53813e3c1c5acc1ebd2b45b081c4:specs/007-disposition-artifacts/spec.md`
- **CI URL**: N/A (local verification recorded in workflow)
- **Argos URL**: N/A
- **Task Completion**: workflow records 1502/1502 project tests passing; retained `tasks.md` checkbox state is known stale branch bookkeeping
- **Summary**: Added disposition rollups, task artifact publish/read/admin/health surfaces, Paddock Secret Detector v1 redaction/rejection rules, dashboard/audit/admin UI surfaces, dispatch input artifact integration, OpenAPI updates, visual-review metadata support, and SPEC-007 e2e seed support.

**Recovery Commands**:
```text
git show b21d9f94f19d53813e3c1c5acc1ebd2b45b081c4:specs/007-disposition-artifacts/spec.md
git show b21d9f94f19d53813e3c1c5acc1ebd2b45b081c4:specs/007-disposition-artifacts/plan.md
git show b21d9f94f19d53813e3c1c5acc1ebd2b45b081c4:specs/007-disposition-artifacts/tasks.md
```

---

## SPEC-008: Resource Governance and Cost Tracker Enforcement

- **Feature**: RC Factory Phase 7 — feature-flagged resource policy evaluator and observability pipeline
- **Branch**: `008-resource-governance`
- **Spec Path**: `specs/008-resource-governance/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/26
- **Merge Commit**: `bd9a693937f9572fd8532484c084646e4fe8ff73`
- **Tree Reference**: `git show 6215d94677b35b5811d5de7205b3f5f7cd458ee9:specs/008-resource-governance/spec.md`
- **CI URL**: N/A (local verification and follow-up evidence recorded in workflow)
- **Argos URL**: N/A
- **Task Completion**: 385/385
- **Summary**: Added `FEATURE_RESOURCE_GOVERNANCE`-gated synchronous policy evaluation, append-only ledger semantics, telemetry ingestion/reconciliation, OTLP receiver, source-emission-capability registry, persistent circuit breaker, reservation reaper, Cost Tracker Governance subviews, feature-flag matrix harness, axe coverage guard, and env-leak guard.

**Recovery Commands**:
```text
git show 6215d94677b35b5811d5de7205b3f5f7cd458ee9:specs/008-resource-governance/spec.md
git show 6215d94677b35b5811d5de7205b3f5f7cd458ee9:specs/008-resource-governance/plan.md
git show 6215d94677b35b5811d5de7205b3f5f7cd458ee9:specs/008-resource-governance/tasks.md
```

---

## SPEC-009A: Workflow Contract Format and Roundtrip

- **Feature**: RC Factory Phase 8A — repo-owned workflow contracts with import/apply/export/recover tooling
- **Branch**: `009a-workflow-contract-roundtrip`
- **Spec Path**: `specs/009a-workflow-contract-roundtrip/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/28
- **Merge Commit**: `2b78970e78a9dcfaa6847ef683ad6ce570f0ce5f`
- **Tree Reference**: `git show 2b78970e78a9dcfaa6847ef683ad6ce570f0ce5f:specs/009a-workflow-contract-roundtrip/spec.md`
- **CI URL**: N/A (workflow records local and PR checks)
- **Argos URL**: N/A
- **Task Completion**: 65/65
- **Summary**: Added canonical YAML workflow contract files, `pnpm workflow-contract` import/apply/export/recover tooling, stable hash/parity checks, generic workflow-contract diagnostics tables and APIs, LKG snapshots, read-only Workflows diagnostics UI, OpenAPI/API-index parity, fail-closed validation fixtures, and Markdown review export.

**Recovery Commands**:
```text
git show 2b78970e78a9dcfaa6847ef683ad6ce570f0ce5f:specs/009a-workflow-contract-roundtrip/spec.md
git show 2b78970e78a9dcfaa6847ef683ad6ce570f0ce5f:specs/009a-workflow-contract-roundtrip/plan.md
git show 2b78970e78a9dcfaa6847ef683ad6ce570f0ce5f:specs/009a-workflow-contract-roundtrip/tasks.md
```

---

## SPEC-009B: Paddock Product-Line Seed and Flag Activation

- **Feature**: RC Factory Phase 8B — seed Paddock as Product Line A without dispatching work
- **Branch**: `009b-paddock-seed`
- **Spec Path**: `specs/009b-paddock-seed/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/30
- **Merge Commit**: `1d5c994c1e6e41e44cf16f39c0829d3e46bce004`
- **Tree Reference**: `git show 1d5c994c1e6e41e44cf16f39c0829d3e46bce004:specs/009b-paddock-seed/spec.md`
- **CI URL**: N/A (workflow records focused suites, build, e2e, and daemon-socket caveat)
- **Argos URL**: N/A
- **Task Completion**: 61/61
- **Summary**: Added Paddock-specific seed tooling and constants, Product Line A workspace/departments/assignments/repo routing, SPEC-009A workflow-contract import reuse, canonical `PILOT_PADDOCK_E2E` flag activation, advisory governance rows, blocked-preflight cleanup detection, redacted evidence, and zero-dispatch guardrails.

**Recovery Commands**:
```text
git show 1d5c994c1e6e41e44cf16f39c0829d3e46bce004:specs/009b-paddock-seed/spec.md
git show 1d5c994c1e6e41e44cf16f39c0829d3e46bce004:specs/009b-paddock-seed/plan.md
git show 1d5c994c1e6e41e44cf16f39c0829d3e46bce004:specs/009b-paddock-seed/tasks.md
```

---

## SPEC-009C1: GitHub Pilot Issue Ingest and Eligibility

- **Feature**: RC Factory Phase 8C1 — one GitHub issue enters the pilot as an eligible Paddock task
- **Branch**: `009c1-pilot-issue-ingest`
- **Spec Path**: `specs/009c1-pilot-issue-ingest/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/34
- **Merge Commit**: `7d544f3975d5d7e7241f83ecee629509760c064c`
- **Tree Reference**: `git show 7d544f3975d5d7e7241f83ecee629509760c064c:specs/009c1-pilot-issue-ingest/spec.md`
- **CI URL**: N/A (workflow records local and HAL smoke evidence)
- **Argos URL**: N/A
- **Task Completion**: 36/36
- **Summary**: Added pilot issue selection and synthetic fallback tooling, GitHub ingest/sync fixtures, eligibility guards, duplicate/local-only rejection proofs, current-schema side-effect absence assertions, smoke checklist setup, and a post-merge routing fix so synced pilot issues do not auto-route after ingest.

**Recovery Commands**:
```text
git show 7d544f3975d5d7e7241f83ecee629509760c064c:specs/009c1-pilot-issue-ingest/spec.md
git show 7d544f3975d5d7e7241f83ecee629509760c064c:specs/009c1-pilot-issue-ingest/plan.md
git show 7d544f3975d5d7e7241f83ecee629509760c064c:specs/009c1-pilot-issue-ingest/tasks.md
```

---

## SPEC-009C2: Triage-to-Remediation Plan Handoff

- **Feature**: RC Factory Phase 8C2 — Issue Triage hands actionable work to Issue Remediation planning
- **Branch**: `009c2-triage-remediation-handoff`
- **Spec Path**: `specs/009c2-triage-remediation-handoff/`
- **PR URLs**:
  - https://github.com/racecraft-lab/Paddock/pull/43 (Merge: `a63afdead9e4b58c6be7cfcda782a3f567538756`)
  - https://github.com/racecraft-lab/Paddock/pull/46 (post-merge fix, Merge: `19b2db9891fd4c4ca1286f952f10e190424e9c5c`)
- **Merge Commit**: `a63afdead9e4b58c6be7cfcda782a3f567538756` (implementation), post-merge fix `19b2db9891fd4c4ca1286f952f10e190424e9c5c`
- **Tree Reference**: `git show a63afdead9e4b58c6be7cfcda782a3f567538756:specs/009c2-triage-remediation-handoff/spec.md`
- **CI URL**: N/A (workflow records focused/full unit, typecheck, lint, build, and HAL smoke)
- **Argos URL**: N/A
- **Task Completion**: 21/21
- **Summary**: Added triage handoff logic from `ACTIONABLE_REMEDIATION` to exactly one remediation-planning successor, uppercase pilot disposition taxonomy, artifact evidence, duplicate-actionable idempotency, negative outcome exits, invalid-output fail-closed coverage, SPEC-007 lowercase compatibility, and HAL smoke cleanup evidence.

**Recovery Commands**:
```text
git show a63afdead9e4b58c6be7cfcda782a3f567538756:specs/009c2-triage-remediation-handoff/spec.md
git show a63afdead9e4b58c6be7cfcda782a3f567538756:specs/009c2-triage-remediation-handoff/plan.md
git show a63afdead9e4b58c6be7cfcda782a3f567538756:specs/009c2-triage-remediation-handoff/tasks.md
```

---

<!-- Archive extension manual execution metadata -->
<!-- archiveMode: single-feature batch | dryRun: false | applyCleanupRequested: true | safeToApplyCleanup: true -->
<!-- Branch: main | Run: 2026-05-22 | archiveExtension: 1.1.0 | prerequisite-script: blocked on main feature-branch guard; manual cleanup contract followed. -->
<!-- Cleanup command: git rm -r specs/009c3-remediation-ready-for-owner specs/009c4-owner-merge-reconciliation specs/009d-pilot-review-lifecycle specs/009e-pilot-evidence-surfaces specs/009f-production-triage-routing specs/010a-generic-product-line-seeder specs/012a-repo-knowledge-index specs/013a-run-state-spine -->
<!-- Cleanup gate: clean main worktree after temporarily stashing unrelated untracked .agents/.codex paths; no history rewrite. -->

## SPEC-009C3: Dev/Review/Aegis to Ready for Owner

- **Feature**: RC Factory Phase 8C3 — remediation chain reaches `ready_for_owner`
- **Branch**: `009c3-remediation-ready-for-owner`
- **Spec Path**: `specs/009c3-remediation-ready-for-owner/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/48
- **Merge Commit**: `ac7760a222a33b4cefe886afae605238f479eaa5`
- **Post-Merge Evidence Commit**: `13a104f658199bad24c5ea50ad9cbef85cf9e65b`
- **Tree Reference**: `git show ac7760a222a33b4cefe886afae605238f479eaa5:specs/009c3-remediation-ready-for-owner/spec.md`
- **CI URL**: N/A (workflow and roadmap record focused/full local verification plus HAL UAT)
- **Argos URL**: N/A (no UI/browser workflow changed)
- **Task Completion**: 70/70
- **Summary**: Added remediation planning -> dev -> review -> Aegis readiness evidence, `ready_for_owner` routing for PR-producing dev tasks, C3 artifact envelope validation, sanitized failure activities, advisory governance readiness checks, deterministic fixture PR identity, and scope guards proving no merge/done reconciliation, claim/run table, sandbox/adapter, poller, broad slug migration, or dedicated evidence UI entered the slice.

**Recovery Commands**:
```text
git show ac7760a222a33b4cefe886afae605238f479eaa5:specs/009c3-remediation-ready-for-owner/spec.md
git show ac7760a222a33b4cefe886afae605238f479eaa5:specs/009c3-remediation-ready-for-owner/plan.md
git show ac7760a222a33b4cefe886afae605238f479eaa5:specs/009c3-remediation-ready-for-owner/tasks.md
```

---

## SPEC-009C4: Owner Merge Gate and Done Reconciliation

- **Feature**: RC Factory Phase 8C4 — human merge gate reconciles `ready_for_owner` to `done`
- **Branch**: `009c4-owner-merge-reconciliation`
- **Spec Path**: `specs/009c4-owner-merge-reconciliation/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/52
- **Merge Commit**: `ddc709f2f200a4ee4df51398d39ef42d85bd6e54`
- **Post-Merge Evidence Commit**: `539b14b40e2664799b7b187e7302e8ff005e96fa`
- **Tree Reference**: `git show ddc709f2f200a4ee4df51398d39ef42d85bd6e54:specs/009c4-owner-merge-reconciliation/spec.md`
- **CI URL**: N/A (workflow and roadmap record local verification, full test suites, and target replay UAT)
- **Argos URL**: N/A
- **Task Completion**: 55/55
- **Summary**: Added exact merged-PR truth checks for linked PR-producing tasks, failed-sync no-terminal-side-effect handling, local-only done rejection, `mc:done` projection with stale ready-label removal, bounded terminal activity/notification assertions, duplicate-sync idempotency, live synthetic issue/PR UAT, target deployment replay, and cleanup evidence.

**Recovery Commands**:
```text
git show ddc709f2f200a4ee4df51398d39ef42d85bd6e54:specs/009c4-owner-merge-reconciliation/spec.md
git show ddc709f2f200a4ee4df51398d39ef42d85bd6e54:specs/009c4-owner-merge-reconciliation/plan.md
git show ddc709f2f200a4ee4df51398d39ef42d85bd6e54:specs/009c4-owner-merge-reconciliation/tasks.md
```

---

## SPEC-009D: Pilot Review Packet and Lifecycle Snapshot

- **Feature**: RC Factory Phase 8D — stored-evidence pilot review packet and lifecycle snapshot
- **Branch**: `009d-pilot-review-lifecycle`
- **Spec Path**: `specs/009d-pilot-review-lifecycle/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/54
- **Merge Commit**: `765264be667bd31d6266f606602a219312f72f23`
- **Tree Reference**: `git show 765264be667bd31d6266f606602a219312f72f23:specs/009d-pilot-review-lifecycle/spec.md`
- **CI URL**: N/A (workflow records main CI/CD checks and local verification)
- **Argos URL**: N/A
- **Task Completion**: 42/42
- **Summary**: Added stored-evidence-only packet derivation, JSON and Markdown artifact publication through the existing artifact store, packet-local evidence states, source-map pointers, SPEC-013/SPEC-014 deferrals, local-only and partial-proof exclusion, packet UAT against retained issue #50 / PR #51 evidence, and no migration, packet-specific route, dashboard, fresh GitHub call, poller, claim authority, retry control, sandbox lifecycle, adapter registry, or real harness execution.

**Recovery Commands**:
```text
git show 765264be667bd31d6266f606602a219312f72f23:specs/009d-pilot-review-lifecycle/spec.md
git show 765264be667bd31d6266f606602a219312f72f23:specs/009d-pilot-review-lifecycle/plan.md
git show 765264be667bd31d6266f606602a219312f72f23:specs/009d-pilot-review-lifecycle/tasks.md
```

---

## SPEC-009E: Pilot Eligibility and Evidence Surfaces

- **Feature**: RC Factory Phase 8E — read-only task-scoped pilot eligibility and evidence surfaces
- **Branch**: `009e-pilot-evidence-surfaces`
- **Spec Path**: `specs/009e-pilot-evidence-surfaces/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/55
- **Merge Commit**: `40507874b012abffe2356a66be36613c6dea5809`
- **Post-Merge Evidence Commit**: `f4921b852d1ea9e6fbc220f2838f957a9d1ef0d8`
- **Tree Reference**: `git show 40507874b012abffe2356a66be36613c6dea5809:specs/009e-pilot-evidence-surfaces/spec.md`
- **CI URL**: N/A (workflow records local verification and post-merge checks)
- **Argos URL**: N/A
- **Task Completion**: 59/59
- **Summary**: Added generic stored-evidence-only `task_evidence.v1` derivation, authenticated read-only `GET /api/tasks/[id]/evidence`, compact task detail Evidence UI, local-only and partial-proof states, safe metadata/source-map rendering, retained issue #50 / PR #51 UAT proof, disposable carrier cleanup, and explicit SPEC-013/SPEC-014 deferrals. No migration, new runtime dependency, write action, GitHub sync trigger, packet-generation action, global dashboard, runner, claim, sandbox, adapter, or harness behavior was added.

**Recovery Commands**:
```text
git show 40507874b012abffe2356a66be36613c6dea5809:specs/009e-pilot-evidence-surfaces/spec.md
git show 40507874b012abffe2356a66be36613c6dea5809:specs/009e-pilot-evidence-surfaces/plan.md
git show 40507874b012abffe2356a66be36613c6dea5809:specs/009e-pilot-evidence-surfaces/tasks.md
```

---

## SPEC-012A: Repo Knowledge Index and AGENTS Map

- **Feature**: RC Factory Phase 10A — canonical repo knowledge index and root AGENTS map
- **Branch**: `012a-repo-knowledge-index`
- **Spec Path**: `specs/012a-repo-knowledge-index/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/56
- **Merge Commit**: `a5e3fbece82fddec548b70763a703893ba409813`
- **Tree Reference**: `git show a5e3fbece82fddec548b70763a703893ba409813:specs/012a-repo-knowledge-index/spec.md`
- **CI URL**: N/A (workflow records Quality Gate and visual approval checks)
- **Argos URL**: N/A
- **Task Completion**: 32/32
- **Summary**: Added `docs/ai/repo-knowledge-index.json`, its schema, concise root repo knowledge map, fixture-backed validation, fresh-agent proxy smoke script, `knowledge:index:*` scripts, guardrail wiring, and status-pointer checks. No runtime source behavior, migration, UI, scheduler/runner behavior, GitHub sync automation, sandbox lifecycle, harness adapter, generated `.gitnexus/` artifact, broad docs rewrite, or nested `AGENTS.md` rollout was added.

**Recovery Commands**:
```text
git show a5e3fbece82fddec548b70763a703893ba409813:specs/012a-repo-knowledge-index/spec.md
git show a5e3fbece82fddec548b70763a703893ba409813:specs/012a-repo-knowledge-index/plan.md
git show a5e3fbece82fddec548b70763a703893ba409813:specs/012a-repo-knowledge-index/tasks.md
```

---

## SPEC-009F: Production Triage Outcome Routing

- **Feature**: RC Factory Phase 8F — production routing for non-remediation triage outcomes
- **Branch**: `009f-production-triage-routing`
- **Spec Path**: `specs/009f-production-triage-routing/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/57
- **Merge Commit**: `d396ed205b281d10a2b5cb95542209e816ebd95a`
- **Post-Merge Evidence Commit**: `6bc4f2a79d7af240b75ad22687310a754f1f587a`
- **Tree Reference**: `git show d396ed205b281d10a2b5cb95542209e816ebd95a:specs/009f-production-triage-routing/spec.md`
- **CI URL**: N/A (workflow records local verification, main checks, and HITL replay)
- **Argos URL**: N/A
- **Task Completion**: 55/55
- **Summary**: Added typed production triage lane artifacts for `NEEDS_SPEC`, needs-human, needs-specialist, duplicate, obsolete, and invalid outcomes; terminal Issue Triage completion without remediation successors; idempotent reruns; task Evidence `triageRouting` display; fixture/HITL UAT for all six outcomes; and guards proving no live GitHub mutation, successor template, claim/runner/sandbox/adapter path, or auto-merge behavior.

**Recovery Commands**:
```text
git show d396ed205b281d10a2b5cb95542209e816ebd95a:specs/009f-production-triage-routing/spec.md
git show d396ed205b281d10a2b5cb95542209e816ebd95a:specs/009f-production-triage-routing/plan.md
git show d396ed205b281d10a2b5cb95542209e816ebd95a:specs/009f-production-triage-routing/tasks.md
```

---

## SPEC-010A: Generic Product-Line Seeder

- **Feature**: RC Factory Phase 9A — reusable product-line seed tooling
- **Branch**: `010a-generic-product-line-seeder`
- **Spec Path**: `specs/010a-generic-product-line-seeder/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/59
- **Merge Commit**: `9be6b544b6006bd5de2524d22bc8059a21eed41c`
- **Post-Merge Evidence Commit**: `05fe404ab43ce026734b51ccc3d0e39830fac05f`
- **Tree Reference**: `git show 9be6b544b6006bd5de2524d22bc8059a21eed41c:specs/010a-generic-product-line-seeder/spec.md`
- **CI URL**: N/A (workflow records local verification and post-merge UAT)
- **Argos URL**: N/A
- **Task Completion**: 73/73
- **Summary**: Added checked-in product-line YAML config support, generic `seed:product-line` preflight/apply/verify modes, `seed:paddock` wrapper compatibility, fail-closed config validation, existing-target refusal and reviewed re-apply semantics, workflow-contract import reuse, feature-flag registry validation, advisory governance defaults, product-line-scoped assignments, redacted structured evidence, no-mutation failure proof, and static guards proving no Product Line B onboarding, GitHub mutation, dispatch, runner, sandbox, auto-merge, or SpecKit invocation drift.

**Recovery Commands**:
```text
git show 9be6b544b6006bd5de2524d22bc8059a21eed41c:specs/010a-generic-product-line-seeder/spec.md
git show 9be6b544b6006bd5de2524d22bc8059a21eed41c:specs/010a-generic-product-line-seeder/plan.md
git show 9be6b544b6006bd5de2524d22bc8059a21eed41c:specs/010a-generic-product-line-seeder/tasks.md
```

---

## SPEC-013A: Run-State Persistence Spine

- **Feature**: RC Factory Phase 11A — durable task-stage attempt inspection spine
- **Branch**: `013a-run-state-spine`
- **Spec Path**: `specs/013a-run-state-spine/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/58
- **Merge Commit**: `a3a79250bc0fa8ac79d36a787f8119d1add62678`
- **Post-Merge Evidence Commit**: `05fe404ab43ce026734b51ccc3d0e39830fac05f`
- **Tree Reference**: `git show a3a79250bc0fa8ac79d36a787f8119d1add62678:specs/013a-run-state-spine/spec.md`
- **CI URL**: N/A (workflow records full local/unit/e2e evidence and post-merge UAT)
- **Argos URL**: N/A
- **Task Completion**: 58/58
- **Summary**: Added additive migration `076_task_stage_attempts`, rollback SQL, task-stage attempt helper/model behavior, read-only `GET /api/tasks/[id]/stage-attempts`, compact task-detail Run state section, OpenAPI/API-index parity, route/component/e2e coverage, non-destructive archive semantics, flag-off runtime table-blind guardrails, and cleanup evidence. Claim authority, scheduler launch, retry policy, GitHub reconciliation, sandbox lifecycle, adapter registry, and auto-merge behavior remain deferred.

**Recovery Commands**:
```text
git show a3a79250bc0fa8ac79d36a787f8119d1add62678:specs/013a-run-state-spine/spec.md
git show a3a79250bc0fa8ac79d36a787f8119d1add62678:specs/013a-run-state-spine/plan.md
git show a3a79250bc0fa8ac79d36a787f8119d1add62678:specs/013a-run-state-spine/tasks.md
```

---

## SPEC-013D: Claim-Control Operator UX

- **Feature**: RC Factory Phase 11D — task-detail claim-control operator UX
- **Branch**: `013d-claim-control-operator-ux`
- **Spec Path**: `specs/013d-claim-control-operator-ux/`
- **PR URL**: https://github.com/racecraft-lab/Paddock/pull/65
- **Merge Commit**: `50bf05e573f15b5aab5e53367444bef1d0b7baaf`
- **Tree Reference**: `git show 50bf05e573f15b5aab5e53367444bef1d0b7baaf:specs/013d-claim-control-operator-ux/spec.md`
- **CI URL**: N/A (workflow records quality gate, Docker-backed Playwright, Storybook/Playwright visual review, and PR review remediation evidence)
- **Argos URL**: N/A (visual review used PR Pages Storybook/Playwright reports and approval gates)
- **Metadata Gates**: manual local UAT=pass; route-backed Playwright=pass; Docker-backed Playwright=pass; Storybook visual review=pass; Playwright visual review=pass; retrospective=pass
- **Task Completion**: 72/72
- **Summary**: Added the existing-task-detail `Claim control` section, bounded operator copy, SPEC-013C route-client integration, retry/release/cancel confirmations, release/cancel/backoff-override reason handling, in-memory same-submission idempotency retry after network failure, bounded success/error receipts, evidence/stage-attempt/task-list refreshes, Storybook states, route-backed Playwright fixture evidence, Docker-backed visual verification, and cleanup proof. No migration, backend retry/release/cancel semantics, scheduler launch, dashboard, sandbox lifecycle, adapter registry, direct GitHub mutation, successor selection, whole-task terminal mutation, or harness execution was added.
- **Archive Note**: Source spec cleanup was not applied during the 2026-06-01 post-merge hygiene branch because the cleanup gate requires explicit `--apply-cleanup` on a safe base branch. Recovery commands below preserve raw artifact access from the merge commit.

**Recovery Commands**:
```text
git show 50bf05e573f15b5aab5e53367444bef1d0b7baaf:specs/013d-claim-control-operator-ux/spec.md
git show 50bf05e573f15b5aab5e53367444bef1d0b7baaf:specs/013d-claim-control-operator-ux/plan.md
git show 50bf05e573f15b5aab5e53367444bef1d0b7baaf:specs/013d-claim-control-operator-ux/tasks.md
git show 50bf05e573f15b5aab5e53367444bef1d0b7baaf:specs/013d-claim-control-operator-ux/uat-runbook.md
git show 50bf05e573f15b5aab5e53367444bef1d0b7baaf:specs/013d-claim-control-operator-ux/retrospective.md
```
