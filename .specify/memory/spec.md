# Mission Control — Consolidated Feature Specification Memory

Auto-generated from Archive Sweep on 2026-04-28.
Revision: Archiving SPEC-001, SPEC-002, SPEC-002A after confirmed PR merges.
Revision 2026-05-01: Backfilling SPEC-003 (PR #20 merged 2026-04-30) — original
sweep silently no-op'd due to unwired /speckit.archive.run command (now fixed).
Revision 2026-05-01 (later): Archiving SPEC-004 (PR #22 merged 2026-05-01) and
SPEC-006 (PR #21 merged 2026-05-01) under SPEC-007 autopilot Phase 0 sweep.
Revision 2026-05-02: SPEC-008 autopilot Phase 0 sweep re-confirmed SPEC-004
and SPEC-006 archive after SPEC-007 cleanup landed on main.

---

## User Stories

### SPEC-001: Foundation Migrations [Source: specs/001-foundation-migrations]

**US1 — Apply Phase 0 Schema Safely (P1)**  
As a facility operator, I can apply M53-M61 to an existing production-shape Mission Control database so the install gains Phase 0 schema surfaces without changing current runtime behavior.

**US2 — Re-run Migrations Without Side Effects (P1)**  
As an operator, I can re-run the Phase 0 migration set safely so repeat execution does not duplicate schema objects, seed data, or state changes.

**US3 — Roll Back Manually with Checked-In Guidance (P2)**  
As a maintainer or operator, I can manually reverse each SQL-changing M53-M61 step using checked-in reverse SQL and a rollback runbook.

**US4 — Hand Off Stable Schema Surfaces to Later Specs (P3)**  
As a downstream spec executor, I can depend on Phase 0 schema surfaces being present while all new runtime behavior remains OFF or unimplemented.

---

### SPEC-002: Product Line Switcher [Source: specs/002-product-line-switcher]

**US1 — Preserve Existing Single-Workspace Behavior (P1)**  
As an existing user, I can run Mission Control with the workspace switcher disabled and see the same behavior, baseline test coverage, and snapshots I see today.

**US2 — Switch Between Facility and Product Line Views (P1)**  
As a facility operator or department lead, I can switch between the Facility aggregate view and authorized Product Line workspaces while staying in the same tenant.

**US3 — Keep Scope Synchronized Across Tabs (P2)**  
As a multi-tab operator, I can change Product Line context in one tab and have other open tabs converge on the same selection.

**US4 — Protect Tenant and Workspace Data Boundaries (P2)**  
As a tenant admin, I cannot use workspace-scoping requests to access another tenant's data or bypass authorized scope rules.

---

### SPEC-002A: Spec Archive and Evidence Retention [Source: specs/002a-spec-archive-evidence]

**US1 — Archive Completed Spec Knowledge Safely (P1)**  
A maintainer can archive a completed feature spec after merge so the durable record preserves requirements, implementation evidence, PR links, CI links, and recovery commands without requiring generated screenshot content in source control.

**US2 — Preserve Argos and CI Provenance Instead of Screenshot Retention (P1)**  
A reviewer can trace UI evidence through Argos and CI artifacts while the repository keeps provenance metadata and manifest links instead of archiving generated screenshot content.

**US3 — Prepare Archive Sweep Behavior for Future Autopilot Runs (P1)**  
A SpecKit executor can start autopilot with an Archive Sweep that processes only previously merged specs, excludes the current target spec, and stops or runs dry-run only when the branch or worktree is unsafe for cleanup.

---

### SPEC-003: Aegis Facility Singleton Refactor [Source: specs/003-global-aegis]

**US1 — Workspace-First Compatibility (P1)**  
As an existing operator, I can keep `FEATURE_GLOBAL_AEGIS` OFF and Aegis review behavior remains workspace-first.

**US2 — Facility-Wide Aegis (P2)**  
As a facility operator, I can enable `FEATURE_GLOBAL_AEGIS` and have a single global Aegis row serve workspaces with no local Aegis.

**US3 — Legacy Local Aegis Compatibility (P3)**  
As a maintainer, I can preserve legacy local Aegis fallback for compatibility during migration.

**US4 — Shadow Audit Visibility (P3)**  
As an auditor, I can see an idempotent `aegis_local_shadowed` activity when a local Aegis row is shadowed by the global row under flag ON.

**US5 — Stable Review Gate For Downstream Specs (P1)**  
As a downstream spec executor, I can rely on Aegis completion gates using `quality_reviews.reviewer='aegis'`.

---

### SPEC-004: Task Pipeline Engine and Declarative Routing [Source: specs/004-task-pipeline-engine]

**US1 — Preserve Current Task Behavior (P1)**  
Existing operators leave task pipelines disabled and continue creating, syncing, completing, notifying, subscribing to, and auditing tasks with no behavior change.

**US2 — Configure Declarative Workflow Routing (P1)**  
Facility operators configure workflow templates so a completed task deterministically creates the correct successor task from validated structured output, ordered routing rules, or a static next template.

**US3 — Validate Agent Output Safely (P1)**  
Agent and scheduler maintainers rely on structured output validation and routing evaluation that reject malformed, oversized, or unsafe input before it can influence task-chain routing — fail closed with no `eval`/`Function`/`vm`, bounded budgets, and stable activity reason codes.

**US4 — Recover Failed or Stalled Chains Explicitly (P2)**  
Operators correct bad output, routing configuration, target templates, or assignee mappings and explicitly retry chain advancement without ordinary task edits accidentally rerunning the chain.

**US5 — Trace Pipeline Lineage for Downstream Specs (P2)**  
Downstream spec executors trace pipeline chains through parent, root, chain, stage, workflow-template, and PR-producing metadata while treating task resolution as the temporary structured-output bridge.

---

### SPEC-006: Area-Label GitHub Sync [Source: specs/006-area-label-github-sync]

**US1 — Flag-OFF Parity Preserved (P1)**  
With `FEATURE_AREA_LABEL_ROUTING` unset, every observable behavior of GitHub sync — inbound issue ingestion, outbound push, label initialization, polling cadence, and activity log shape — remains byte-identical to the prior release.

**US2 — Single Owner Polls a Shared Monorepo (P1)**  
With the flag enabled, exactly one project per `(workspace_id, github_repo)` is elected as `is_repo_sync_owner=1` (lowest `projects.id` among `github_sync_enabled=1` projects); duplicate-ingest collisions disappear.

**US3 — Triage Project Absorbs Ambiguous Issues (P1)**  
Issues with no/multiple/no-match `area:*` labels route to the workspace's `is_triage_project=1` project (or sync-owner fallback if absent) with `area_routing_unresolved` activities recording the reason code.

**US4 — Department Issues Route on Initial Ingest Only (P1)**  
First-ingest area resolution writes one `area_routing_resolved` activity. Subsequent label changes on GitHub do NOT move existing tasks between projects — operators re-route manually via task UI (no-thrash guarantee, P5-AC5).

**US5 — First-Time Enable Backfills Existing Tasks (P2)**  
On first sync poll after flag-on, `backfillAreaRouting(workspaceId)` re-evaluates every existing GitHub-synced task using stored labels (per-task transactions, idempotent resume via `tasks.area_routing_backfilled_at`, completion marker `workspaces.feature_flags.area_label_routing_backfill_completed_at` set last).

**US6 — Operators Configure Routing via Existing Surfaces (P2)**  
Project settings panel exposes `area_slug`, `is_triage_project`, `is_repo_sync_owner` with inline validation, 409 conflict shapes for slug/triage/owner duplicates, and atomic clear-then-set transfer for sync-owner swaps.

**US7 — Migration Is Additive, Reversible, Label-Init Failures Isolated (P2)**  
M62 adds only nullable columns and indexes; `rollback-M62.sql` cleanly drops everything new; `initializeLabels` per-label failures (rate-limit, network, 4xx, 5xx, unknown) are caught, logged, and never abort the larger sync run.

---

## Functional Requirements

### SPEC-001 FRs [Source: specs/001-foundation-migrations]

- **FR-001**: Add migration-only Phase 0 schema tail covering M53-M61 after the current migration `052`.
- **FR-002**: Every M53-M61 change must be additive and idempotent (PRAGMA guards, IF NOT EXISTS, null-only backfills).
- **FR-003**: Add `agents.scope` and backfill `scope='global'` for Aegis, Security Guardian, <operator-agent> via case-insensitive matching.
- **FR-004**: Preserve `agents.workspace_path`; do not add `sandbox_path` or rename the column.
- **FR-005**: Extend `workflow_templates` with routing/artifact-policy metadata and a partial unique index on `(workspace_id, slug)` WHERE slug IS NOT NULL.
- **FR-006**: Add workflow-template binding and lineage fields on `tasks` for downstream chaining.
- **FR-007**: Preserve `tasks.status` as application-level validation only; no database CHECK expansion.
- **FR-008**: Add `workspaces.feature_flags` as persistent JSON storage; no runtime resolution in SPEC-001.
- **FR-009**: Treat `workspaces.name` as the live workspace display field.
- **FR-010**: Add queryable `task_dispositions` surface with downstream lookup indexes.
- **FR-011**: Add queryable `task_artifacts` surface with task/workspace chronology indexes.
- **FR-012**: Seed exactly one `facility` workspace using `ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, id ASC`; leave existing row unchanged on rerun.
- **FR-013**: Add queryable `resource_policies` and `resource_policy_events` surfaces.
- **FR-014**: No UI, config, TypeScript type, Zod, API, CLI, scheduler, or non-migration product-surface work in SPEC-001.
- **FR-015**: One checked-in rollback SQL file per SQL-changing migration or seed (M53-M61); replay-safe when already reversed.
- **FR-016**: Manual rollback procedure with snapshot-first requirement, reverse-order M61-M53, SQLite column-rebuild guidance.
- **FR-017**: Existing automated verification passes unchanged after migration set is applied.

### SPEC-002 FRs [Source: specs/002-product-line-switcher]

- **FR-001**: Preserve current behavior when workspace switcher is disabled.
- **FR-002**: Expose Product Line switcher only when `FEATURE_WORKSPACE_SWITCHER` resolves from authenticated tenant/facility context via `/api/workspaces`.
- **FR-003**: Treat Facility as the canonical user-facing aggregate; keep it distinct from any real workspace record.
- **FR-004**: Render exactly one synthetic Facility option; suppress real `workspaces.slug='facility'` from aggregate selection.
- **FR-005**: Maintain Product Line scope separately from tenant administration context.
- **FR-006**: `setActiveProductLine(productLine | null, options)` is the required public transition API for every Facility/Product Line change.
- **FR-007**: Persist only the Product Line scope slice with Zustand key `mc:active-workspace:v1`; validate or clear stale/malformed/wrong-tenant/unauthorized/real-facility ids after `/api/workspaces`.
- **FR-008**: Synchronize Product Line scope across open tabs for same signed-in tenant/user; ignore cross-tenant messages; continue non-crashing when BroadcastChannel unavailable.
- **FR-009**: Clear incompatible activeProject/selected task/agent/project/conversation/modal/filter/draft when scope changes unless keyed by new `scopeKey`.
- **FR-010**: Scope supported data surfaces to selected Facility or Product Line without cross-context leaks.
- **FR-011**: Reject with explicit status codes: 400 for conflicting `workspace_id` + `workspace_scope=facility`, 403 for unauthorized id, 400 for real facility row as PL workspace_id.
- **FR-012**: Skills and local/gateway sessions/transcripts remain Facility/global; excluded from PL counts.
- **FR-013**: Runtime scope is discriminated Facility/ProductLine state even when `activeWorkspace = null` is the compatibility storage for Facility.
- **FR-014**: First load starts in Facility only after auth/workspace initialization; `activeWorkspace = null` pre-init does not widen access.
- **FR-015**: `workspace_scope=facility` for Facility REST/URL/SSE; `workspace_id=<id>` for PL; omitted scope is legacy-only when flag OFF.
- **FR-016**: Global agents appear across PL views; mutations target by id when global/local names collide.
- **FR-017**: Product Line scope matrix: task routes, project routes, agent root/detail/subroutes, quality-review, DB-backed chat, search, activities, notifications, dashboard/status/audit/live-feed, system-monitor, events.
- **FR-018**: Every matrix route authorizes explicit scope server-side or by resource-id join back to caller's tenant/workspace.
- **FR-019**: `/api/events` authorizes SSE scope before subscribing; PL filtering and Facility aggregation; requires `workspace_id` on scoped events; drops missing/mismatched PL events; reconnects EventSource on scope change; whitelisted global events only without workspace scope.
- **FR-020**: Header uses Facility/Product Line terminology; no "Workspace" label in new header/switcher.
- **FR-021**: Desktop switcher in left header context cluster; mobile compact trigger visible at 320/375/390 px in fixed `h-14` header using `min-w-0`, bounded max widths, text truncation.
- **FR-022**: Existing design patterns; no icon library; no card-like wrapper; visual distinction through selected value and existing muted/border/background states.
- **FR-023**: Listbox exposes only selectable Facility/PL rows as focusable `option` rows with `aria-selected`; roving focus or `aria-activedescendant`; Arrow/Home/End/Enter/Space/Escape/outside-click; loading/empty as `role="status"`, failure/unauthorized/error as `role="alert"`.
- **FR-024**: New strings localized through `messages/*.json` including Facility, Product Line, loading, empty, error, aria-label strings.

### SPEC-002A FRs [Source: specs/002a-spec-archive-evidence]

- **FR-001**: Evaluate and record `racecraft-lab/spec-kit-archive` as archive extension.
- **FR-002**: Validate fork for Racecraft-specific behavior (Argos/CI provenance, dry-run/apply separation, gated cleanup, recovery commands).
- **FR-003**: Pin archive extension to specific tag/commit; record in `.specify/extensions.yml`, `.specify/extensions/.registry`, vendored `extension.yml`.
- **FR-004**: Archive policy MUST preserve Argos/CI provenance links, not committed screenshots by default.
- **FR-005**: Traceability from durable records to source path, PR URL, merge commit, CI run, recovery commands.
- **FR-006**: Completed spec folders remain in active source control until archive succeeds with merge/tree references and recovery commands.
- **FR-007**: Archive process MUST NOT archive the current target spec in the same autopilot run.
- **FR-008**: Archive Sweep runs at start of autopilot for previously merged specs; excludes current target.
- **FR-009**: Archive Sweep stops or dry-runs when base branch is unsafe or worktree is not clean.
- **FR-010**: Dry-run and apply separation; cleanup is explicit and reviewable.
- **FR-011**: Install/vendor archive extension from pinned `racecraft-lab/spec-kit-archive` fork tag/commit.
- **FR-012**: `speckit-pro` plugin updated and released with archive-aware behavior (autopilot Archive Sweep, coach guidance, status surfaces archive state).
- **FR-013**: Local Codex marketplace and installed plugin refreshed to released archive-aware version.
- **FR-014**: Argos/CI provenance is source of truth for UI evidence retention; generated screenshots not required by default.
- **FR-015**: Evidence that future spec archival can identify merge/tree references and recovery commands.
- **FR-016**: Local and CI guard or negative fixture showing committed screenshots are not required by default.
- **FR-017**: Archive Sweep output records eligible previously merged specs, excluded current target, cleanup mode, archive extension installed state, safe-to-apply cleanup state.
- **FR-018**: Missing evidence, failing metadata gates, visible UI defects, broken journeys block PR readiness even without committed screenshots.
- **FR-019**: Future UI runs carry forward SPEC-002 Argos metadata gate and no-empty-build behavior.
- **FR-020**: Archive cleanup MUST NOT rewrite git history or depend on post-merge CI mutating main.
- **FR-021**: Dry-run evidence for SPEC-001 and SPEC-002 does not authorize active cleanup unless a later apply-mode run on a clean safe branch records full archive success.

### SPEC-003 FRs [Source: specs/003-global-aegis]

- **FR-001**: Add `src/lib/aegis.ts` exporting `getAegis(db, workspace_id?)` as the single Aegis lookup path.
- **FR-002**: Route `FEATURE_GLOBAL_AEGIS` through `resolveFlag(name, ctx)`; no inline `process.env.FEATURE_GLOBAL_AEGIS` reads outside `src/lib/feature-flags.ts`.
- **FR-003**: Evaluate `FEATURE_GLOBAL_AEGIS` against the requested-task or review workspace context when a workspace exists; `process.env.FEATURE_GLOBAL_AEGIS='1'` does NOT force ON.
- **FR-004**: With flag OFF, resolve workspace-scoped Aegis first, then global fallback.
- **FR-005**: With flag ON, resolve global Aegis first, then workspace-scoped fallback.
- **FR-006**: Match Aegis by `LOWER(name)='aegis'` and use `agents.scope='global'` for the facility singleton.
- **FR-007**: Preserve legacy `agents.workspace_id` lookup for workspace-scoped rows.
- **FR-008**: When multiple Aegis rows match the same candidate scope, choose the row with the lowest database id for deterministic compatibility.
- **FR-009**: Resolver selection MUST NOT filter by `agents.status`; gateway invocation and review failure handling remain responsible for unavailable agents.
- **FR-010**: When flag ON and both global and workspace-scoped rows exist, return global and idempotently record one structured `activities` row per `(workspace_id, global_agent_id, local_agent_id)` tuple with `type='aegis_local_shadowed'`, `entity_type='agent'`, `entity_id=<local_agent_id>`, `actor='system'`, requested `workspace_id`, deterministic description, and JSON `data` containing `global_agent_id`, `local_agent_id`, `workspace_id`, and `feature_flag='FEATURE_GLOBAL_AEGIS'`.
- **FR-011**: Refactor `runAegisReviews` and `resolveGatewayAgentIdForReviewAgent` so scheduler review dispatch uses `getAegis` while preserving task selection, retry, status transitions, and gateway invocation semantics.
- **FR-012**: Preserve existing gateway routing behavior that reads configured OpenClaw ids and session-key-derived routing; SPEC-003 MUST NOT rewrite the gateway dispatch contract.
- **FR-013**: Remove or stop relying on the local `aegisAgentByWorkspace` map once all callsites are migrated.
- **FR-014**: Sweep task routes, validation defaults, scheduler hooks, task-board Aegis display, and chat Aegis role surfaces without changing review semantics.
- **FR-015**: Preserve `quality_reviews.reviewer='aegis'` as the live gate signal; do NOT introduce `quality_reviews.agent_id` expectations in code or tests.
- **FR-016**: Existing UI surfaces may display Aegis review state, but MUST NOT gain new task pipeline behavior or `ready_for_owner` semantics.
- **FR-017**: When no global or workspace-scoped Aegis database row exists, preserve current gateway fallback by returning agent id/name `aegis` and ensure scheduler loops continue without a resolver crash.
- **FR-018**: Treat malformed workspace `feature_flags` JSON as no override / default OFF.
- **FR-019**: Preserve `FEATURE_GLOBAL_AEGIS` registry dependency on `FEATURE_WORKSPACE_SWITCHER` for enablement and preflight checks.
- **FR-020**: New production module strict scope is `src/lib/aegis.ts` only; add to `tsconfig.spec-strict.json` and `eslint.config.mjs` strict-scope lists.
- **FR-021**: No schema migrations; SPEC-001 already created `agents.scope`.

### SPEC-004 FRs [Source: specs/004-task-pipeline-engine]

- **FR-001**: Gate task pipeline behavior through the existing feature-flag resolver (`FEATURE_TASK_PIPELINES`); preserve current task behavior when disabled.
- **FR-002**: Preserve current task behavior when enabled but unbound or no advancement-driving chain metadata; only `output_schema`, non-empty `routing_rules`, or `next_template_slug` make a bound task eligible.
- **FR-003**: Treat workflow templates as the live task-chain template source; do NOT introduce a separate `task_templates` table.
- **FR-004**: Provide one shared task creation capability used by API, GitHub ingestion, GitHub sync import, recurring task generation, and pipeline successor creation.
- **FR-005**: Shared task creation preserves source-specific side effects through explicit source profiles (ticket allocation, activity, subscription, mention/assignee notifications, GitHub push, gateway push, broadcast).
- **FR-006..FR-009**: Validate structured task output against the parent template's `output_schema` using SPEC-004 constrained AJV profile (no `$ref`/`$dynamicRef`/custom keywords/formats/`ajv-formats`/data mutation/coercion/exhaustive errors/async).
- **FR-008**: Enforce numeric bounds — output ≤262144 B, schema ≤65536 B, depth ≤16, keys ≤256, array ≤1024, string ≤32768 B, pattern ≤256 B, validation budget ≤50 ms, validator cache ≤256 entries.
- **FR-010..FR-013**: Routing evaluator supports only allowlisted boolean grammar (`==`, `!=`, `in`, `not in`, `&&`, `||`, `!`); JSONPath operands left, literals (string/number/boolean/array) right; reject filters/scripts; pre-validation caps `maxRoutingRules=64`, `maxRoutingExpressionBytes=8192`, `maxRoutingTokens=256`, `maxBooleanNestingDepth=16`, `maxJsonPathBytes=512`, `maxJsonPathResults=128`, `maxLiteralBytes=32768`; per-rule budget `maxRuleEvalMs=10`.
- **FR-014..FR-017**: Advance eligible pipeline-bound tasks at every live non-`done`→`done` transition (Aegis approval, operator approval, bulk update, detail update); read structured output from `tasks.resolution`; routing rules first, then static `next_template_slug`, else terminate normally.
- **FR-018..FR-020**: Stable activity reason codes — `task_pipeline_output_missing`, `task_pipeline_output_invalid`, `task_pipeline_routing_expression_rejected`, `task_pipeline_routing_budget_exceeded`, `task_pipeline_target_missing`, `task_pipeline_target_duplicate`, `task_pipeline_target_cross_workspace`, `task_pipeline_successor_assignee_missing`. `task_pipeline_target_disabled` is reserved.
- **FR-021..FR-023**: Successor creation runs in one transaction (parent lineage init, validation/stall writes, duplicate-successor guard, successor insert); GitHub/GNAP outbound pushes deferred until after commit; one-successor-per-parent enforced via M62 partial unique index on non-null `tasks.parent_task_id`.
- **FR-022**: Successor assignment via live `project_agent_assignments.agent_name` ↔ `agents.name` join; SPEC-004 MUST NOT assume `project_agent_assignments.agent_id` or `workflow_templates.agent_id`.
- **FR-024..FR-034**: Operator-only retry endpoint; eligible only for missing-output / invalid-output failures or SPEC-004 advancement stalls; latest eligible activity only; SHA-256 over canonical JSON for `output_schema`/`routing_rules` and normalized string-or-null for `next_template_slug` for template-provenance hashing; conflict reasons `retry_not_eligible` / `retry_template_provenance_missing` / `retry_template_drift_unconfirmed` are side-effect-free; retry success returns bounded `chain_retry` summary excluding raw output and routing traces; existing-successor recovery is idempotent.
- **FR-035..FR-039a**: `/api/workflows` writes/persists/returns `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, `allow_redacted_artifacts`; reject non-empty routing rules without an output schema; allow static next-template chaining without schema; query-parameter delete preserved; Workflows editor in `orchestration-bar.tsx` uses `appendScopeToPath`; Product Line scope required for writes/deletes (Facility aggregate scope rejected).
- **FR-040..FR-043**: Pinned direct runtime deps `ajv@8.18.0`, `jsonpath-plus@10.4.0`, `safe-regex@2.1.1`; high-severity audit baseline cleared before merge; static guardrails for unsafe primitives (`eval`, `Function`, `vm`, `vm2`, `with`, dynamic `require`, prototype-chain, arithmetic/bitwise, regex on right-side); no direct production task inserts outside `task-create.ts`; documentation describes declarative chains and lifecycle; SPEC-004 MUST NOT implement SPEC-005/006/007/008/009/011 behavior.

### SPEC-006 FRs [Source: specs/006-area-label-github-sync]

- **FR-001..FR-002**: Gate every new code path through `resolveFlag('FEATURE_AREA_LABEL_ROUTING', { workspaceId })`; flag-OFF preserves byte-identical pre-SPEC-006 baseline (no `area:*` outbound, no `is_repo_sync_owner` filter, no `area_routing_*` activities).
- **FR-003..FR-008**: Migration M62 (or M63 if SPEC-004 wins ordering) adds `projects.area_slug TEXT NULL`, `projects.is_triage_project BOOLEAN DEFAULT 0`, `projects.is_repo_sync_owner BOOLEAN DEFAULT 0`, `tasks.area_routing_backfilled_at TIMESTAMP NULL` via `addColumnIfMissing()`. Indexes: `idx_projects_workspace_area_slug`, partial unique `idx_projects_one_sync_owner_per_repo` (`WHERE is_repo_sync_owner=1`), partial unique `idx_projects_one_triage_per_workspace` (`WHERE is_triage_project=1`), partial `idx_tasks_area_routing_backfill_pending`. Backfill: lowest `projects.id` per `(workspace_id, github_repo)` group with `github_sync_enabled=1` becomes owner (deterministic, rerun-safe). `rollback-M62.sql` drops all four columns and four indexes. Legacy unique `(workspace_id, github_repo, github_issue_number)` preserved.
- **FR-009..FR-015**: Inbound — build per-call routing cache (slug→project_id, triageProjectId); parse `area:*` labels (lowercase, prefix-strip, ignore empty); resolve `single_match` / `no_label` / `multi_label` / `no_match`; route to triage or sync-owner fallback (`reason='no_triage'`); first-ingest only — never re-route on subsequent label change; never write new `area_routing_*` activity for existing tasks.
- **FR-016..FR-017**: Outbound — emit `area:<projects.area_slug>` alongside `mc:*`/`priority:*` when project has non-NULL `area_slug`; otherwise no `area:*` label.
- **FR-018..FR-019**: Flag-ON poller selects only `is_repo_sync_owner=1` projects; one-shot per-workspace bootstrap on first flag-on invokes `initializeLabels(repo, workspaceId)` per owned repo and `backfillAreaRouting(workspaceId)` if completion marker unset.
- **FR-020..FR-024**: `backfillAreaRouting` iterates `tasks WHERE workspace_id=? AND github_issue_number IS NOT NULL` for owned repos; per-task atomic transaction (SELECT, resolve, UPDATE `project_id`+`area_routing_backfilled_at`, INSERT activity, COMMIT); `tasks.area_routing_backfilled_at` is monotonic — never cleared by production code; completion marker `workspaces.feature_flags.area_label_routing_backfill_completed_at` set ONLY after `WHERE area_routing_backfilled_at IS NULL` returns zero rows; resume scan O(remaining-tasks) via the `IS NULL` predicate; activities use `data.source='backfill'`.
- **FR-025..FR-029**: `initializeLabels(repo, workspaceId?)` accepts optional `workspaceId`; emits union of static `AREA_LABEL_MAP` defaults + per-workspace `area_slug` synthesized labels; never modifies existing labels with different color/description; per-label catch-all (rate-limit, network, 4xx, 5xx, unknown) — never aborts caller; partial failures aggregated into at most one `kind='label_provisioning_failed'` activity per `(workspace_id, github_repo)` per 24h with sanitized payload (no Authorization headers, no `gh[posru]_…` tokens, no API keys, no PII, ≤500 char `sample_error`); triggers — connect, `area_slug`/`is_triage_project` PUT transition, first-poll bootstrap.
- **FR-027b**: All four SPEC-006 failure surfaces emit one structured log line per event with stable `event` / `workspace_id` / `github_repo` / `error_message` / `error_class` payload — single shared shape; logging always-on even when activity is throttled or transaction rolled back.
- **FR-030..FR-032**: Static `AREA_LABEL_MAP` covers 12 curated names (qa/dev/design/infra/security/docs/ops/frontend/backend/data/ml/triage) with WCAG AA-compliant colors; snapshot-tested. `areaLabelsForWorkspace(db, workspaceId)` returns static + dynamic union. `ALL_AREA_LABEL_NAMES` exports static defaults.
- **FR-033..FR-039**: `PUT /api/projects/[id]` accepts `area_slug` / `is_triage_project` / `is_repo_sync_owner` / `transfer_owner`. `area_slug` matches `^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$` (RFC 1123 / K8s DNS-label style). 400 (format) wins over 409 (conflict). 409 conflict shapes: `area_slug_conflict`, `triage_conflict`, `owner_conflict` (with `hint` for transfer). Atomic sync-owner transfer is clear-first then set-first then activity-INSERT inside one `db.transaction(() => { ... })` — SQLite UNIQUE indexes are immediate (DEFERRABLE only on FK). `POST /api/github` connect handler passes `workspaceId` to `initializeLabels`.

---

## Key Entities

### SPEC-001 Entities [Source: specs/001-foundation-migrations]

| Entity | Description |
|--------|-------------|
| Agent Scope | `agents.scope` column discriminating `global` from workspace-bound agents |
| Workflow Template Routing Metadata | Columns on `workflow_templates` for slug, routing rules, output expectations, successors, PR production, terminal events, artifact-redaction policy |
| Task Lineage Record | `tasks` fields identifying which workflow template a task came from and predecessor/root chain |
| Workspace Feature Flag Set | `workspaces.feature_flags` JSON column for per-workspace flag storage |
| Task Disposition | `task_dispositions` table for explicit handoff/resolution outcome records |
| Task Artifact | `task_artifacts` table for producer metadata, MIME, SHA-256, preview, redaction status |
| Facility Workspace | Seeded `workspaces` row keyed by `slug='facility'`; resolved from live tenant rows |
| Resource Policy | `resource_policies` table for governance rules |
| Resource Policy Event | `resource_policy_events` table for audit records of policy decisions |

### SPEC-002 Entities [Source: specs/002-product-line-switcher]

| Entity | Description |
|--------|-------------|
| Tenant | Authenticated account and data boundary; stable while PL scope changes |
| Facility | Canonical user-facing aggregate view; stored as `activeWorkspace = null` after auth/workspace init |
| Product Line Workspace | Authorized non-Facility workspace; real `workspaces.slug='facility'` row is NOT a valid PL workspace |
| Active Product Line Scope | Discriminated runtime selection state (Facility/ProductLine modes) |
| Scope Key | Request/cache ownership key derived from tenant + Facility/PL mode |
| Workspace Flags | Per-workspace feature settings from `/api/workspaces` controlling switcher availability |

### SPEC-002A Entities [Source: specs/002a-spec-archive-evidence]

| Entity | Description |
|--------|-------------|
| Archive Policy | Repository rule set for evidence preservation, artifact retention, and cleanup permissions |
| Archive Report | Output of archive dry-run/apply including source refs, merge/tree refs, evidence links, recovery commands |
| Archive Sweep | Autopilot pre-flight step processing previously merged specs before the current target |
| Evidence Provenance | Argos/CI metadata, PR references, and links that reconstruct review history without committed screenshots |
| Pinned Archive Extension | `racecraft-lab/spec-kit-archive` fork v1.1.0 at `.specify/extensions/archive/` |

### SPEC-003 Entities [Source: specs/003-global-aegis]

| Entity | Description |
|--------|-------------|
| Aegis Resolver | `getAegis(db, workspace_id?)` — single Aegis lookup path returning a `ReviewAgentRecord` shape with `id`, `name`, `config`, `agent_config`, `workspace_id`, `scope` |
| Global Aegis Singleton | `agents` row with `LOWER(name)='aegis'` and `scope='global'`; serves all workspaces under flag ON |
| Workspace-Scoped Aegis | Legacy `agents` row with `LOWER(name)='aegis'` and `workspace_id=<id>`; preferred under flag OFF |
| Shadow Audit Activity | `activities` row with `type='aegis_local_shadowed'`, idempotent per `(workspace_id, global_agent_id, local_agent_id)` tuple |
| Aegis Gateway Fallback | Synthetic `{ id: 'aegis', name: 'aegis' }` returned when no DB-backed row exists; preserves scheduler loop continuity |
| Review Gate Signal | `quality_reviews.reviewer='aegis'` (string match); SPEC-003 does NOT introduce `quality_reviews.agent_id` |

### SPEC-004 Entities [Source: specs/004-task-pipeline-engine]

| Entity | Description |
|--------|-------------|
| Workflow Template | Live operator-managed template (Product Line / workspace scoped); chain fields `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, `allow_redacted_artifacts` |
| Task Chain | Deterministic sequence keyed by parent_task_id, root_task_id, chain_id, chain_stage; bound task enters chain only with advancement-driving metadata |
| Routing Rule | Ordered declarative condition over validated structured output resolving to a target template `slug` |
| Structured Output | Agent-produced `tasks.resolution` data; SPEC-004 temporary bridge until canonical artifact handoff (later spec) |
| Successor Task | Next task created from terminal-success parent after validation/routing/target/assignee/duplicate-successor checks pass |
| Chain Activity | Operator-visible `activities` row with stable `reason_code`, non-secret chain context, retry recovery metadata, template-provenance hashes |
| Retry Recovery | Operator-authorized action that reprocesses the latest eligible failure or stall with current output and current template configuration |
| Shared Task Creator | `createTask()` in `src/lib/task-create.ts` — single insert path with explicit source profiles (api/github_import/github_sync/recurring/pipeline_successor) |

### SPEC-006 Entities [Source: specs/006-area-label-github-sync]

| Entity | Description |
|--------|-------------|
| Area Slug | `projects.area_slug` (nullable, `^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$`); unique per `(workspace_id, area_slug)` when non-NULL |
| Triage Project | `projects.is_triage_project=1`; exclusive per `workspace_id` via partial unique index; absorbs `no_label`/`multi_label`/`no_match` issues |
| Sync-Owner Project | `projects.is_repo_sync_owner=1`; exclusive per `(workspace_id, github_repo)` via partial unique index; only project that polls GitHub for that repo |
| Routing Decision | `single_match` / `no_label` / `multi_label` / `no_match` / `no_triage` — written to `area_routing_resolved` or `area_routing_unresolved` activities with `source='ingest'`/`'backfill'` |
| Backfill Resume Marker | `tasks.area_routing_backfilled_at` (Unix-epoch, monotonic, never cleared); resume scan filters `WHERE area_routing_backfilled_at IS NULL` |
| Backfill Completion Marker | `workspaces.feature_flags.area_label_routing_backfill_completed_at`; set last only when zero pending tasks remain |
| Static Label Map | `AREA_LABEL_MAP` in `src/lib/github-label-map.ts` — 12 curated default area labels with WCAG AA colors |
| Label Provisioning Activity | `kind='label_provisioning_failed'`; throttled at most one per `(workspace_id, github_repo)` per 24h; sanitized `data` (no tokens/PII) |
| Sync-Owner Transfer Activity | `kind='sync_owner_transferred'` written inside the atomic clear-then-set transaction with `previous_owner_project_id` / `new_owner_project_id` / `actor_user_id` |

---

## Edge Cases (Consolidated)

- A database may already contain some Phase 0 columns/indexes from a partial rollout; migration set must remain safe to re-run.
- Agent names for global-scope backfill may differ by letter case; backfill must use case-insensitive matching.
- The `facility` workspace seed must not create duplicates if a `facility` row already exists.
- If `activeWorkspace = null` before auth/workspace initialization, it must NOT widen access or act as a no-workspace flag context.
- If persisted Product Line scope is stale, malformed, wrong-version, wrong-tenant, unauthorized, or the real facility row — clear it before scoped data renders.
- Cross-tab scope changes for different tenant/user are silently ignored.
- If BroadcastChannel is unavailable, continue non-crashing; manual-reload convergence.
- Mobile viewports (320/375/390 px): compact switcher trigger must not push search/notifications/language/theme/account controls out of view.
- Generated screenshots are CI-only artifacts by default; Argos/CI provenance links are the durable evidence.
- Archive Sweep on a dirty worktree or unsafe branch: dry-run only or stop with clear guard message.
- Current target spec is never archived in the same autopilot run; eligible only after its PR merges.
- M53-M61 backfill targets only agents named exactly Aegis, Security Guardian, <operator-agent> (case-insensitive).
- Aegis resolver: when both global and workspace-scoped Aegis rows exist under flag ON, return global and write at most one shadow-audit row per `(workspace_id, global_agent_id, local_agent_id)` tuple — repeated scheduler ticks never duplicate the row.
- Aegis resolver: when multiple rows match the same candidate scope (rare via M53 backfill or manual migration), choose the lowest database id deterministically; agent `status` is not a resolver filter.
- Aegis resolver: malformed workspace `feature_flags` JSON is treated as no override / default OFF — the resolver does not throw.
- Aegis resolver: when neither global nor workspace-scoped DB rows exist, return synthetic gateway `aegis` so scheduler loops keep running.
- M53 backfill scope leak: post-M53 rows have `workspace_id` set AND `scope='global'`. `findWorkspaceAegis` MUST include `AND scope = 'workspace'` or these rows appear in both local and global lookups (fixed in SPEC-003 resolver).
- SPEC-004 task pipelines: flag OFF with populated chain metadata MUST NEVER advance a chain; advancement-driving metadata is only `output_schema`, non-empty `routing_rules`, or `next_template_slug` (slug/produces_pr/external_terminal_event/allow_redacted_artifacts alone keep legacy path).
- SPEC-004 retry: latest eligible failure or stall activity only; older activities and caller-supplied activity ids are ignored; retry conflicts are side-effect-free (no activity written, no retry-attempt incremented, no state mutation).
- SPEC-004 successor side effects: insert and internal DB writes inside the caller's transaction; outbound GitHub/GNAP push deferred until after commit; outbound failures use existing sync/error activity path and never roll back the chain transaction.
- SPEC-004 reserved: `task_pipeline_target_disabled` reason code is reserved for a future workflow-template enabled/disabled column; SPEC-004 MUST NOT add such a column.
- SPEC-006 first-ingest only: subsequent label changes on GitHub MUST NOT move existing tasks (no-thrash); operators re-route manually via task UI; no `area_routing_*` activity is written on existing tasks during subsequent syncs.
- SPEC-006 sync-owner transfer: SQLite UNIQUE indexes are immediate; clear-then-set ordering is REQUIRED — set-first violates `idx_projects_one_sync_owner_per_repo` immediately at statement end.
- SPEC-006 PUT validation order: 400 (format / regex / FR-040a flag-OFF rejection) MUST be evaluated and returned BEFORE any uniqueness check; 400 wins over 409 when both apply; no SELECT-for-conflict and no UPDATE on the 400 path.
- SPEC-006 backfill marker: `tasks.area_routing_backfilled_at` is monotonic — once set non-NULL it is NEVER cleared by production code; clearing the workspace-level `area_label_routing_backfill_completed_at` marker re-triggers bootstrap but does NOT clear individual task markers.
- SPEC-006 backfill failure threshold: NO upper failure-count threshold terminates the run early; every eligible task is attempted on every bootstrap cycle; persistent failures surface via per-event `event='backfill_task_failed'` structured logs (FR-027b) — that is the operator-intervention signal.
- SPEC-006 sync-owner lifecycle (deletion, archive, `github_sync_enabled=0`): out of scope; ownership lost is preflight-visible (`FEATURE_AREA_LABEL_ROUTING` preflight checklist FR-046), not auto-recovered; auto re-election deferred (Article XII).
- SPEC-006 `area_slug='triage'` on non-triage project: allowed and treated as regular routing target for `area:triage`-labeled issues; triage authority is `is_triage_project=1` flag, not the slug string.
- SPEC-006 migration ordering with SPEC-004: first-to-merge keeps M62; second rebases to M63 and renames its rollback SQL accordingly; reconciled at rebase time. (Both shipped in the same week; SPEC-004 merged first as PR #22 then SPEC-006 PR #21 reconciled at rebase.)

---

## Success Criteria (Key)

- SPEC-001: M53-M61 applied once on a migration-052 database without data loss; second run produces no duplicates; 35/35 tasks completed; rollback package covers all SQL-changing steps.
- SPEC-002: Flag-OFF preserves 100% of baseline snapshots; authorized users switch Facility/PL in one step; cross-tab convergence <1s when BroadcastChannel available; 56/56 tasks completed.
- SPEC-002A: Archive dry-run against SPEC-002 completes without deleting source files; speckit-pro 1.9.1 released with archive-aware behavior; archive extension installed at v1.1.0; 47/47 tasks completed.
- SPEC-003: P2-AC1 flag-off workspace-first preserved; P2-AC2 flag-on global-first served from `scope='global'`; P2-AC3 legacy fallback covered; P2-AC4 scheduler loop semantics unchanged (only resolver source); P2-AC5 unit coverage of global-only/workspace-only/legacy paths; P2-AC6 `quality_reviews.reviewer='aegis'` gate preserved; 21/21 tasks completed; 9 resolver-focused Vitest paths including M53-backfill regression; 533 Playwright tests pass; typecheck/lint/build green.
- SPEC-004: Flag-OFF and null-default regression preserved; 100% of production task creation callsites use `createTask()`; deterministic accept/reject for validator and routing fixtures; one-successor-per-parent enforced via M62 partial unique index; retry side-effect-free conflicts; `chain_retry` summary excludes raw output and routing traces; high-severity audit baseline cleared; 88/88 tasks completed (per workflow file Implement phase Complete and tasks.md count).
- SPEC-006: Flag-OFF byte-identical to pre-SPEC-006 baseline (poller selection SQL and outbound label set unchanged); single sync owner per `(workspace_id, github_repo)` enforced via partial unique index; first-ingest-only routing (no thrash on subsequent label change); backfill is idempotent and resumable via monotonic `tasks.area_routing_backfilled_at`; completion marker set only when zero pending tasks; per-label and per-task failures isolated and logged with stable structured-log shape (FR-027b); roadmap and `docs/ai/specs/SPEC-006-workflow.md` record Implement phase Complete; PR #21 merged 2026-05-01.
- SPEC-008: Flag-OFF preserves cost-tracker byte-compat (FR-305 / FR-238); flag-ON activates synchronous resource policy evaluator on dispatch admission with append-only ledger, dedupe + canonical telemetry pipeline, OTLP receiver, source-emission-capability registry, drift detector, persistent circuit breaker, reservation reaper, Cost Tracker Governance tab (Policies/Budgets/Windows/Overrides/Diagnostics/System Health). `FEATURE_OPENCLAW_HEALTH_COSTS` adds the OpenClaw health adapter as a source. Constitution V matrix harness (`src/lib/feature-flag-matrix.ts`) covers 9 flags × 4 scenarios. axe-core baked into Playwright fixture (`tests/e2e/spec-008/governance-axe-shim.ts`). CI guards `scripts/spec-008/check-axe-coverage.mjs` + `scripts/spec-008/check-feature-flag-env-leak.mjs`. Strict-scope guard at `tests/integration/strict-scope-guard.test.ts` (331/331 pass). Migrations M65a..m + M66 additive + rerun-safe; rollback files at `docs/migrations/rollback-M65{a..m}.sql` + `docs/migrations/rollback-M66.sql`. Implementation 100% complete; e2e/soak/chaos verification operator-gated per `docs/ai/specs/SPEC-008-verification-evidence.md`.
