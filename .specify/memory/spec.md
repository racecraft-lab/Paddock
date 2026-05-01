# Mission Control — Consolidated Feature Specification Memory

Auto-generated from Archive Sweep on 2026-04-28.
Revision: Archiving SPEC-001, SPEC-002, SPEC-002A after confirmed PR merges.
Revision 2026-05-01: Backfilling SPEC-003 (PR #20 merged 2026-04-30) — original
sweep silently no-op'd due to unwired /speckit.archive.run command (now fixed).

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

## Functional Requirements

### SPEC-001 FRs [Source: specs/001-foundation-migrations]

- **FR-001**: Add migration-only Phase 0 schema tail covering M53-M61 after the current migration `052`.
- **FR-002**: Every M53-M61 change must be additive and idempotent (PRAGMA guards, IF NOT EXISTS, null-only backfills).
- **FR-003**: Add `agents.scope` and backfill `scope='global'` for Aegis, Security Guardian, HAL via case-insensitive matching.
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
- M53-M61 backfill targets only agents named exactly Aegis, Security Guardian, HAL (case-insensitive).
- Aegis resolver: when both global and workspace-scoped Aegis rows exist under flag ON, return global and write at most one shadow-audit row per `(workspace_id, global_agent_id, local_agent_id)` tuple — repeated scheduler ticks never duplicate the row.
- Aegis resolver: when multiple rows match the same candidate scope (rare via M53 backfill or manual migration), choose the lowest database id deterministically; agent `status` is not a resolver filter.
- Aegis resolver: malformed workspace `feature_flags` JSON is treated as no override / default OFF — the resolver does not throw.
- Aegis resolver: when neither global nor workspace-scoped DB rows exist, return synthetic gateway `aegis` so scheduler loops keep running.
- M53 backfill scope leak: post-M53 rows have `workspace_id` set AND `scope='global'`. `findWorkspaceAegis` MUST include `AND scope = 'workspace'` or these rows appear in both local and global lookups (fixed in SPEC-003 resolver).

---

## Success Criteria (Key)

- SPEC-001: M53-M61 applied once on a migration-052 database without data loss; second run produces no duplicates; 35/35 tasks completed; rollback package covers all SQL-changing steps.
- SPEC-002: Flag-OFF preserves 100% of baseline snapshots; authorized users switch Facility/PL in one step; cross-tab convergence <1s when BroadcastChannel available; 56/56 tasks completed.
- SPEC-002A: Archive dry-run against SPEC-002 completes without deleting source files; speckit-pro 1.9.1 released with archive-aware behavior; archive extension installed at v1.1.0; 47/47 tasks completed.
- SPEC-003: P2-AC1 flag-off workspace-first preserved; P2-AC2 flag-on global-first served from `scope='global'`; P2-AC3 legacy fallback covered; P2-AC4 scheduler loop semantics unchanged (only resolver source); P2-AC5 unit coverage of global-only/workspace-only/legacy paths; P2-AC6 `quality_reviews.reviewer='aegis'` gate preserved; 21/21 tasks completed; 9 resolver-focused Vitest paths including M53-backfill regression; 533 Playwright tests pass; typecheck/lint/build green.
