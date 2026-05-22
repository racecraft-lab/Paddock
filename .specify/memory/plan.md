# Mission Control — Consolidated Implementation Plan Memory

Auto-generated from Archive Sweep on 2026-04-28.
Revision: Archiving SPEC-001, SPEC-002, SPEC-002A after confirmed PR merges.
Revision 2026-05-01: Backfilling SPEC-003 (PR #20 merged 2026-04-30) — original
sweep silently no-op'd due to unwired /speckit.archive.run command (now fixed).
Revision 2026-05-01 (later): Archiving SPEC-004 (PR #22 merged 2026-05-01) and
SPEC-006 (PR #21 merged 2026-05-01) under SPEC-007 autopilot Phase 0 sweep.
Revision 2026-05-02: SPEC-008 autopilot Phase 0 sweep re-confirmed prior
SPEC-004/006 archive after SPEC-007 cleanup landed on main.
Revision 2026-05-16: Applied archive cleanup on clean `main` through SPEC-009C2;
active `specs/**` was empty until later spec setup recreated completed sources.
Revision 2026-05-22: Ran archive extension workflow manually from `main` for
completed active specs SPEC-009C3, SPEC-009C4, SPEC-009D, SPEC-009E, SPEC-009F,
SPEC-010A, SPEC-012A, and SPEC-013A. Memory updated and cleanup applied after a
clean-worktree gate; active completed folders were removed from `specs/**`.

---

## Active Technologies

- **Language/Version**: TypeScript 5.7, Next.js 16 App Router, React 19, SQLite
- **Primary Dependencies**: `better-sqlite3`, Zustand (with persist middleware), Tailwind CSS 3, `jsonpath-plus`, `ajv`, `safe-regex`
- **Testing**: Vitest (unit), Playwright (e2e), `pnpm typecheck`, `pnpm lint`, Docker-backed Playwright for UI journeys
- **Package Manager**: pnpm only
- **Storage**: SQLite via `better-sqlite3`; migrations in `src/lib/migrations.ts` (authoritative); `src/lib/schema.sql` is reference-only
- **Target Platform**: Node.js ≥22, standalone Next.js (`output: 'standalone'`), OpenClaw node

---

## Project Structure

```text
src/
├── app/                            # Next.js App Router pages + API routes
│   └── api/
│       ├── tasks/                  # task routes (scope matrix: SPEC-002)
│       ├── projects/               # project routes (scope matrix)
│       ├── agents/                 # agent root/detail/subroutes (scope matrix)
│       ├── events/                 # SSE scope with PL filtering + Facility aggregation
│       ├── workspaces/             # workspace list + feature flag bootstrap
│       ├── chat/                   # DB-backed messages/conversations (scope matrix)
│       ├── quality-review/         # quality review (scope matrix)
│       ├── search/                 # cross-cutting scope matrix route
│       ├── activities/             # cross-cutting scope matrix route
│       ├── notifications/          # cross-cutting scope matrix route
│       └── system-monitor/         # cross-cutting scope matrix route
├── components/
│   └── layout/
│       └── workspace-switcher.tsx  # SPEC-002 new production module (strict scope)
├── lib/
│   ├── migrations.ts               # M1-M62; authoritative schema source (M62: SPEC-004 partial unique successor index OR SPEC-006 area-routing columns/indexes per rebase order)
│   ├── feature-flags.ts            # SPEC-002 new production module (resolveFlag)
│   ├── aegis.ts                    # SPEC-003 global Aegis resolver
│   ├── task-create.ts              # SPEC-004 shared task creation (api/github_import/github_sync/recurring/pipeline_successor profiles)
│   ├── output-schema-validator.ts  # SPEC-004 constrained AJV profile + safe-regex pattern guard
│   ├── routing-rule-evaluator.ts   # SPEC-004 allowlisted boolean grammar + bounded JSONPath traversal
│   ├── github-sync-engine.ts       # SPEC-006 area routing + backfill + sync-owner ownership (extended; not new)
│   ├── github-label-map.ts         # SPEC-006 AREA_LABEL_MAP + areaLabelsForWorkspace + ALL_AREA_LABEL_NAMES (extended; not new)
│   ├── github-sync-poller.ts       # SPEC-006 is_repo_sync_owner filter + first-poll bootstrap (extended; not new)
│   └── __tests__/
│       ├── migrations-phase0.test.ts  # SPEC-001 migration smoke/rerun/rollback harness
│       ├── feature-flags.test.ts      # SPEC-002 resolveFlag unit tests
│       ├── aegis.test.ts              # SPEC-003 getAegis unit tests (9 tests)
│       └── ...                        # SPEC-004 validator/evaluator/task-create/chain-engine tests; SPEC-006 area routing/backfill/owner-transfer tests
├── store/
│   ├── product-line-scope.test.ts  # SPEC-002 scope store tests
│   └── workspace-init.test.ts      # SPEC-002 bootstrapping/hydration tests
└── types/
    └── product-line.ts             # SPEC-002 new production module (discriminated scope)

docs/
├── ai/
│   ├── rc-factory-technical-roadmap.md  # spec index + acceptance criteria
│   └── specs/                           # workflow files + autopilot state
├── migrations/
│   ├── rollback-M53.sql through rollback-M61.sql  # SPEC-001 rollback artifacts
│   └── rollback-procedure.md                       # operator rollback runbook
└── rc-factory-v1-prd.md            # product requirements document

.specify/
├── extensions/
│   └── archive/                    # SPEC-002A: pinned racecraft-lab/spec-kit-archive v1.1.0
├── extensions.yml                  # archive extension registered; git/verify/review/cleanup hooks
├── memory/                         # this directory
└── scripts/bash/                   # check-prerequisites.sh, validate-gate.sh, etc.

specs/
└── (empty after 2026-05-22 archive cleanup; next active spec setup recreates specs/<feature>)

# Archived (cleanup applied):
# - 001-foundation-migrations    (SPEC-001, archived 2026-04-28)
# - 002-product-line-switcher    (SPEC-002, archived 2026-04-28)
# - 002a-spec-archive-evidence   (SPEC-002A, archived 2026-04-28)
# - 003-global-aegis             (SPEC-003, archived 2026-05-01)
# - 004-task-pipeline-engine     (SPEC-004, archived 2026-05-01 — PR #22 merge 20643d8)
# - 005-ready-for-owner          (SPEC-005, archived after PR #23 merge — landed on main 2026-05-02)
# - 006-area-label-github-sync   (SPEC-006, archived 2026-05-01 — PR #21 merge dbb6c75)
# - 007-disposition-artifacts    (SPEC-007, archived after PR #25 merge — landed on main 2026-05-02)
# - 008-resource-governance      (SPEC-008, archived after PR #26 merge — cleanup applied 2026-05-16)
# - 009a-workflow-contract-roundtrip (SPEC-009A, archived after PR #28 merge — cleanup applied 2026-05-16)
# - 009b-mission-control-seed    (SPEC-009B, archived after PR #30 merge — cleanup applied 2026-05-16)
# - 009c1-pilot-issue-ingest     (SPEC-009C1, archived after PR #34/#40 merge — cleanup applied 2026-05-16)
# - 009c2-triage-remediation-handoff (SPEC-009C2, archived after PR #43/#46 merge — cleanup applied 2026-05-16)
# - 009c3-remediation-ready-for-owner      (SPEC-009C3, PR #48, post-merge UAT — cleanup applied 2026-05-22)
# - 009c4-owner-merge-reconciliation       (SPEC-009C4, PR #52, target replay UAT — cleanup applied 2026-05-22)
# - 009d-pilot-review-lifecycle            (SPEC-009D, PR #54, packet UAT — cleanup applied 2026-05-22)
# - 009e-pilot-evidence-surfaces           (SPEC-009E, PR #55, evidence-surface UAT — cleanup applied 2026-05-22)
# - 009f-production-triage-routing         (SPEC-009F, PR #57, HITL closeout — cleanup applied 2026-05-22)
# - 010a-generic-product-line-seeder       (SPEC-010A, PR #59, post-merge UAT — cleanup applied 2026-05-22)
# - 012a-repo-knowledge-index              (SPEC-012A, PR #56, knowledge-index UAT — cleanup applied 2026-05-22)
# - 013a-run-state-spine                   (SPEC-013A, PR #58, post-merge UAT — cleanup applied 2026-05-22)
```

---

## SPEC-001 Plan Summary [Source: specs/001-foundation-migrations]

**Branch**: `001-foundation-migrations` | **Merged**: 2026-04-26 | **PR**: #15

### Migration Allocation

| Migration | Purpose | Status |
|-----------|---------|--------|
| M53 | `agents.scope` + global backfill for Aegis/Security Guardian/operator node | Complete |
| M54 | `workflow_templates` routing/artifact-policy metadata + slug partial unique index | Complete |
| M55 | `tasks` lineage fields (workflow_template binding, predecessor/root) | Complete |
| M56 | `workspaces.feature_flags` JSON storage (no runtime resolution) | Complete |
| M57 | `task_dispositions` table + lookup indexes | Complete |
| M58 | `task_artifacts` table + chronology/workspace indexes | Complete |
| M59 | `facility` workspace seed (live-tenant resolution, rerun-safe) | Complete |
| M60 | `resource_policies` table + policy-scope indexes | Complete |
| M61 | `resource_policy_events` table + audit indexes | Complete |

### Key Implementation Decisions

- Column additions use `PRAGMA table_info(...)` guards — SQLite has no `ADD COLUMN IF NOT EXISTS`
- Tables/indexes use `CREATE [UNIQUE] INDEX IF NOT EXISTS` with deterministic canonical names
- Facility seed uses `ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, id ASC` — never hardcodes tenant_id=1
- Rollback files are replay-safe; M59 rollback removes facility row only when confidently identified
- `src/lib/schema.sql` remains read-only reference; implementation authority is `src/lib/migrations.ts`
- No new production TS/TSX modules — strict scope is N/A; test-only file `migrations-phase0.test.ts`

### Rollback Files

`docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql` — reverse order M61→M53. Operator must snapshot database before applying. Column-backed rollbacks require SQLite column-rebuild pattern.

---

## SPEC-002 Plan Summary [Source: specs/002-product-line-switcher]

**Branch**: `002-product-line-switcher` | **Merged**: 2026-04-27 | **PR**: #16

### New Production Modules (Strict Scope)

| File | Purpose |
|------|---------|
| `src/lib/feature-flags.ts` | `resolveFlag(name, ctx)` — workspace JSON-first, env kill-switch, hard-default OFF |
| `src/types/product-line.ts` | Discriminated `Facility`/`ProductLine` scope types, `scopeKey` helpers, Zustand persist payload shape |
| `src/components/layout/workspace-switcher.tsx` | Listbox switcher with ARIA semantics, Facility + PL options, responsive layout |

### Key Implementation Decisions

- `resolveFlag` reads `workspaces.feature_flags JSON`; `process.env.FEATURE_X='0'` forces OFF; env '1' does NOT force ON (workspace JSON only)
- `PILOT_PRODUCT_LINE_A_E2E` exception: may be flipped via env
- Zustand key: `mc:active-workspace:v1` (Product Line scope only)
- `scopeKey` = tenant + Facility/PL mode; stale in-flight responses ignored when scopeKey changes
- REST: `workspace_scope=facility` for Facility; `workspace_id=<id>` for PL; omitted is flag-OFF legacy
- 400 for both params; 403 for unauthorized workspace; 400 for real facility row as PL id
- BroadcastChannel sync: same-tenant same-user only; non-crashing when unavailable
- `/api/events`: PL filtering + Facility aggregation; EventSource reconnects on scope change
- Mobile: `min-w-0`, bounded max widths, text truncation — header controls never pushed out at 320/375/390 px
- Switcher listbox: only `option` rows are focusable; loading/empty = `role="status"`; failure/unauthorized = `role="alert"`
- New strings in `messages/*.json`

### Deferred to Later Specs

- Aegis ownership semantics beyond global-agent visibility → SPEC-003
- Task pipelines, routing rules, `ready_for_owner`, area-label routing → SPEC-005+
- Product Line skill ownership, session/transcript-to-workspace mapping → later
- Tenant-routed gateway selection, multi-facility tenant modeling → V2-001

---

## SPEC-002A Plan Summary [Source: specs/002a-spec-archive-evidence]

**Branch**: `002a-spec-archive-evidence` | **Merged**: 2026-04-28 | **PRs**: #18, #19

### Archive Extension Pin

| Attribute | Value |
|-----------|-------|
| Extension | `racecraft-lab/spec-kit-archive` |
| Installed version | `1.1.0` |
| Location | `.specify/extensions/archive/` |
| Registry | `.specify/extensions/.registry` |
| extensions.yml entry | `installed: [archive]` |

### speckit-pro Plugin Release

| Attribute | Value |
|-----------|-------|
| Plugin | `racecraft-lab/racecraft-plugins-public` `speckit-pro` |
| Version | 1.9.1 |
| Fix | Archive Sweep runs actual cleanup on feature branches; dry-run reserved for main/protected branches |
| PRs | #23 (fix), #24 (release-please), #25 (changelog cleanup) |

### Archive Sweep Lifecycle

1. **Pre-flight**: Archive Sweep runs before Phase 0 of every autopilot run
2. **Feature branch**: `speckit.archive.run --sweep --current-target specs/###-current-feature` (applies)
3. **main/protected branch**: same command with `--dry-run` (dry-run only)
4. **Dirty worktree or unsafe branch**: dry-run or stop with guard message
5. **Current target**: always excluded from same-run archival; eligible only after its PR merges

### Evidence Policy

- Argos/CI provenance links are durable evidence (not committed screenshots)
- Recovery commands: `git show <merge-sha>:specs/<feature>/spec.md`
- Archive report records: source path, PR URL, merge commit, CI URL, Argos URL, cleanup mode, safeToApplyCleanup, dry-run evidence only flag
- Committed screenshots require explicit manifest-backed exception

---

## SPEC-003 Plan Summary [Source: specs/003-global-aegis]

**Branch**: `003-global-aegis` | **Merged**: 2026-04-30 | **PR**: #20

### New Production Module (Strict Scope)

| File | Purpose |
|------|---------|
| `src/lib/aegis.ts` | `getAegis(db, workspace_id?)` — single Aegis lookup path; flag-off workspace-first / flag-on global-first; lowest-id tie breaking; idempotent shadow-audit insertion; gateway fallback |

### Resolver Contract

- `getAegis(db, workspace_id?)` returns a `ReviewAgentRecord` shape: `{ id, name, config, agent_config, workspace_id, scope }`. `agent_config` mirrors `config` for DB-backed rows so gateway `openclawId` parsing and name fallback semantics are unchanged.
- Flag OFF: workspace-scoped row first (`LOWER(name)='aegis' AND workspace_id=? AND scope='workspace'`), then global fallback (`scope='global'`).
- Flag ON: global row first (`scope='global'`), then workspace-scoped fallback.
- Tie breaking within a candidate scope: lowest `agents.id`.
- No `agents.status` filtering — gateway invocation handles unavailable agents.
- No DB row in either scope → return synthetic gateway `{ id: 'aegis', name: 'aegis' }`.

### Shadow Audit (Flag ON Only)

- Insert `activities` row idempotently per `(workspace_id, global_agent_id, local_agent_id)` tuple
- `type='aegis_local_shadowed'`, `entity_type='agent'`, `entity_id=<local_agent_id>`, `actor='system'`, `workspace_id=<requested>`
- `data = { global_agent_id, local_agent_id, workspace_id, feature_flag: 'FEATURE_GLOBAL_AEGIS' }`
- Same-tuple subsequent calls are no-ops; no scheduler-tick spam

### Scheduler Integration

- `runAegisReviews` now calls `getAegis(db, task.workspace_id)` instead of consulting the workspace-keyed `aegisAgentByWorkspace` map
- `resolveGatewayAgentIdForReviewAgent` reads `config`/`agent_config` from the resolver row to compute the OpenClaw id, with malformed-config and `aegis`-name fallbacks unchanged
- Task selection, retry, dispatch inputs, quality-review writes, activity logging, and `review/quality_review/assigned/failed/done` transitions all preserved
- `aegisAgentByWorkspace` removed; `src/lib/scheduler.ts` continues to trigger `runAegisReviews()` rather than resolving Aegis directly
- `quality_reviews.reviewer='aegis'` (string match) remains the live gate signal — no `quality_reviews.agent_id` introduced

### Static Guardrails (Verified by `rg` Checks)

- No direct `agents` table queries by Aegis name/workspace/scope/config outside `src/lib/aegis.ts`
- No `aegisAgentByWorkspace` references remaining
- No `quality_reviews.agent_id` references in code or tests
- No inline `process.env.FEATURE_GLOBAL_AEGIS` reads outside `src/lib/feature-flags.ts`
- No drift into SPEC-004+ surfaces (`FEATURE_TASK_PIPELINES`, `ready_for_owner`, `FEATURE_AREA_LABEL_ROUTING`, artifact store, governance, pilot, product-line ownership, multi-facility, CrabTrap)

### Test Coverage

- `src/lib/__tests__/aegis.test.ts` — 9 paths including M53-backfill regression
- `src/lib/__tests__/feature-flags.test.ts` + `feature-flags-route.test.ts` — `FEATURE_GLOBAL_AEGIS` workspace-context evaluation, malformed JSON, env `0` kill switch, env `1` non-enablement, `FEATURE_WORKSPACE_SWITCHER` dependency/preflight
- `src/lib/__tests__/task-dispatch.test.ts` — `resolveGatewayAgentIdForReviewAgent` with DB-backed config, malformed-config fallback, gateway `aegis` fallback; `runAegisReviews` task selection / retry / dispatch / activity / status semantics under resolver source change
- Full Playwright: 533 tests pass; Argos metadata fixtures verified

### Deferred to Later Specs

- SPEC-004 task pipelines and successor side-effect parity
- SPEC-005 `ready_for_owner` task state and PR merge transitions
- SPEC-006 area-label routing and repo-level sync dedupe (this spec — current target)
- SPEC-007 artifact publishing and disposition logging
- SPEC-008 governance and resource policies
- SPEC-009 Product Line A pilot seed data
- SPEC-011 CrabTrap honeypot

---

## SPEC-004 Plan Summary [Source: specs/004-task-pipeline-engine]

**Branch**: `004-task-pipeline-engine` | **Merged**: 2026-05-01 | **PR**: #22

### New Production Modules (Strict Scope)

| File | Purpose |
|------|---------|
| `src/lib/task-create.ts` | Shared `createTask()` — single insert path; explicit source profiles for api/github_import/github_sync/recurring/pipeline_successor; bounded result type (taskId, optional task, activity ids, notification ids, subscription recipients, outbound sync intent) |
| `src/lib/output-schema-validator.ts` | Constrained AJV profile (no `$ref`/`$dynamicRef`/custom keywords/formats/`ajv-formats`/data mutation/coercion/exhaustive errors/async); `safe-regex` pattern guard with conservative subset (literals/anchors/character classes/bounded quantifiers); LRU validator cache keyed by `(template_id, schema_sha256)` |
| `src/lib/routing-rule-evaluator.ts` | Hand-written recursive-descent parser for the SPEC-004 grammar; allowlisted operators (`==`, `!=`, `in`, `not in`, `&&`, `||`, `!`); JSONPath operands left, literals right; `JSONPath()` traversal with `eval: false` / `preventEval: true`; rejects forbidden primitives before parse |
| `src/types/workflow-template.ts` | Shared type for chain-field shape used by `/api/workflows`, Workflows editor, and chain engine |

### Schema (Migration M62 SPEC-004 slot)

- Partial unique index on non-null `tasks.parent_task_id` enforces one-successor-per-parent while allowing multiple root tasks (parent_task_id NULL)
- Created only after a zero-duplicate preflight; rollback at `docs/migrations/rollback-M62.sql`
- No `task_templates` table — task-chain templates are domain alias over `workflow_templates`

### Pinned Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `ajv` | 8.18.0 | JSON Schema validator (constrained profile) |
| `jsonpath-plus` | 10.4.0 | Bounded JSONPath traversal (no callbacks, no eval) |
| `safe-regex` | 2.1.1 | Pattern complexity guard for `pattern`/`patternProperties` |

High-severity `pnpm audit --audit-level high` baseline cleared before merge.

### Numeric Bounds (SPEC-004 Safety Profile)

| Bound | Value |
|-------|-------|
| Output payload | ≤262144 B |
| Schema | ≤65536 B |
| Schema depth | ≤16 |
| Object keys | ≤256 |
| Array length | ≤1024 |
| String length | ≤32768 B |
| Pattern length | ≤256 B |
| Validation budget | ≤50 ms |
| Validator cache | ≤256 entries (LRU) |
| `maxRoutingRules` | 64 |
| `maxRoutingExpressionBytes` | 8192 |
| `maxRoutingTokens` | 256 |
| `maxBooleanNestingDepth` | 16 |
| `maxJsonPathBytes` | 512 |
| `maxJsonPathResults` | 128 |
| `maxLiteralBytes` | 32768 |
| `maxRuleEvalMs` | 10 |

### Stable Activity Reason Codes

`task_pipeline_output_missing` / `task_pipeline_output_invalid` / `task_pipeline_routing_expression_rejected` / `task_pipeline_routing_budget_exceeded` / `task_pipeline_target_missing` / `task_pipeline_target_duplicate` / `task_pipeline_target_cross_workspace` / `task_pipeline_successor_assignee_missing` / `task_pipeline_target_disabled` (reserved).

### Retry Provenance Hashing

- SHA-256 over canonical JSON for `output_schema` and `routing_rules`
- SHA-256 over normalized string-or-null for `next_template_slug` (distinguishes null from empty)
- Whitespace and key-order drift do NOT produce false template-drift conflicts

### `/api/workflows` Behavior

- Resolves Product Line scope through `resolveWorkspaceScopeFromRequest`
- Writes/deletes require concrete single-workspace/Product Line scope; reject Facility aggregate scope; reject unauthorized workspace ids
- Workflows editor in `orchestration-bar.tsx` uses `appendScopeToPath` for list/create/update/usage-tracking/delete; query-parameter delete contract preserved

### Static Guardrails (Verified by `rg` Checks / `pnpm guardrails`)

- No direct production `INSERT INTO tasks` outside `task-create.ts`
- No `eval` / `Function` / `vm` / `vm2` / `with` / dynamic `require` / prototype-chain access in SPEC-004 strict-scope modules
- No regex on right-side routing values
- No `ajv-formats` direct dependency/import/registration
- No drift into SPEC-005+ surfaces (`FEATURE_AREA_LABEL_ROUTING`, `ready_for_owner`, artifact store, governance, pilot, CrabTrap)

### CI Consolidation

- `pnpm guardrails` consolidates SPEC-004 audit + static guardrails
- Argos metadata verification consolidated into one script (Playwright + Storybook modes)
- Storybook screenshot artifact upload removed; Argos owns visual review; Playwright keeps short-lived traces/reports

---

## SPEC-006 Plan Summary [Source: specs/006-area-label-github-sync]

**Branch**: `006-area-label-github-sync` | **Merged**: 2026-05-01 | **PR**: #21

### Strict Scope (Existing Files Extended — No New Modules)

| File | Extension |
|------|-----------|
| `src/lib/github-sync-engine.ts` | Inbound area routing, `backfillAreaRouting(workspaceId)`, ingest activity emission |
| `src/lib/github-label-map.ts` | `AREA_LABEL_MAP` (12 curated names), `areaLabelsForWorkspace(db, workspaceId)`, `ALL_AREA_LABEL_NAMES` |
| `src/lib/github-sync-poller.ts` | `is_repo_sync_owner` filter, one-shot per-workspace bootstrap |
| `src/lib/migrations.ts` | M62 (or M63 per rebase) — area-routing columns + indexes |
| `src/app/api/projects/[id]/route.ts` | `area_slug` / `is_triage_project` / `is_repo_sync_owner` / `transfer_owner` PUT handling; 400-vs-409 ordering; atomic transfer |
| `src/app/api/github/route.ts` | `POST /api/github` connect handler invokes `initializeLabels(repo, workspaceId)` |
| `src/components/modals/project-manager-modal.tsx` | UI for the three new fields with inline validation, conflict messaging, transfer flow; flag-OFF disables fields |

### Schema (Migration M62 SPEC-006 slot — reconciled with SPEC-004 at rebase)

| Object | Definition |
|--------|------------|
| `projects.area_slug` | `TEXT NULL` |
| `projects.is_triage_project` | `BOOLEAN DEFAULT 0` |
| `projects.is_repo_sync_owner` | `BOOLEAN DEFAULT 0` |
| `tasks.area_routing_backfilled_at` | `TIMESTAMP NULL` (monotonic) |
| `idx_projects_workspace_area_slug` | non-unique on `(workspace_id, area_slug)` |
| `idx_projects_one_sync_owner_per_repo` | partial UNIQUE on `(workspace_id, github_repo) WHERE is_repo_sync_owner=1` |
| `idx_projects_one_triage_per_workspace` | partial UNIQUE on `(workspace_id) WHERE is_triage_project=1` |
| `idx_tasks_area_routing_backfill_pending` | partial on `(workspace_id) WHERE github_issue_number IS NOT NULL AND area_routing_backfilled_at IS NULL` |

Backfill on M62: for each `(workspace_id, github_repo)` group with ≥1 `github_sync_enabled=1` projects, set `is_repo_sync_owner=1` on lowest `projects.id`; deterministic and rerun-safe. Rollback at `docs/migrations/rollback-M62.sql` (or rebase-renamed `rollback-M63.sql`). Legacy unique `(workspace_id, github_repo, github_issue_number)` preserved.

### Routing Decision Map

| Decision | When | Action |
|----------|------|--------|
| `single_match` | exactly one `area:*` matches a project's `area_slug` | route to that project |
| `no_label` | zero `area:*` labels | triage; `no_triage` fallback to sync-owner if absent |
| `multi_label` | ≥2 `area:*` labels | triage; `no_triage` fallback to sync-owner |
| `no_match` | exactly one `area:*` not matching any project | triage; `no_triage` fallback to sync-owner |

First-ingest only — no re-route on subsequent label change (P5-AC5 no-thrash).

### Backfill Mechanics

- `backfillAreaRouting(workspaceId)` iterates `tasks WHERE workspace_id=? AND github_issue_number IS NOT NULL` for owned repos
- Per-task atomic transaction: SELECT → resolve → UPDATE `project_id`+`area_routing_backfilled_at` → INSERT activity → COMMIT
- Resume scan O(remaining) via `WHERE area_routing_backfilled_at IS NULL` predicate
- `tasks.area_routing_backfilled_at` set on every successful COMMIT (including no-move and triage-routed tasks)
- Failed per-task transaction rolls back atomically; resume scan retries on next bootstrap; NO upper failure threshold
- Workspace-level completion marker `workspaces.feature_flags.area_label_routing_backfill_completed_at` set ONLY when zero pending tasks remain
- Operator clearing the workspace marker re-triggers bootstrap; individual task markers stay (monotonic)

### Label Provisioning

- `initializeLabels(repo, workspaceId?)` triggers: connect (`POST /api/github`), `area_slug`/`is_triage_project` PUT transition, first-poll bootstrap
- Per-label catch-all (rate-limit / network / 4xx / 5xx / unknown) — never aborts caller
- Activity throttle: at most one `kind='label_provisioning_failed'` per `(workspace_id, github_repo)` per 24h with sanitized payload (no Authorization headers, no `gh[posru]_…` tokens, no API keys, no PII, ≤500 char `sample_error`)

### Structured Logging Contract (FR-027b)

All four SPEC-006 failure surfaces (`label_provisioning_failed`, `backfill_task_failed`, `sync_owner_transfer_activity_failed`, `project_put_validation_failed`) emit ONE shared JSON log shape via `console.error`: `event` / `workspace_id` / `github_repo` / `error_message` (sanitized) / `error_class`. Emission is always-on even when activity is throttled or transaction rolled back.

### PUT /api/projects/[id] Validation Order

1. 400 (format / regex / FR-040a flag-OFF rejection) — wins; no SELECT, no UPDATE
2. 409 (uniqueness conflict) — `area_slug_conflict` / `triage_conflict` / `owner_conflict`
3. UPDATE inside `db.transaction(() => { ... })`; UNIQUE-violation on race translates back to matching 409 (never leaks 500)
4. Sync-owner transfer (when `transfer_owner=true`): clear-first → set-first → activity-INSERT inside one transaction (SQLite UNIQUE indexes are immediate, not DEFERRABLE)

### Feature Flag

`FEATURE_AREA_LABEL_ROUTING` resolved via `resolveFlag(name, { workspaceId })`; flag OFF preserves byte-identical pre-SPEC-006 baseline.

### Outstanding Bookkeeping

- `specs/006-area-label-github-sync/tasks.md` shows 22/88 task checkboxes ticked while roadmap and `docs/ai/specs/SPEC-006-workflow.md` Phase 7 record Implement Complete with PR #21 merged. The roadmap and workflow tracker are the authoritative status sources for SPEC-006; the local `tasks.md` was not fully ticked off before PR merge. Documented here for traceability — not a regression.

---

## SPEC-005 Plan Summary [Source: specs/005-ready-for-owner]

**Branch**: `005-ready-for-owner` | **Merged**: 2026-05-02 | **PR**: #23

- Adds application-level `ready_for_owner` task status and shared terminal transition guard; no DB-level CHECK or migration.
- PR-producing workflow templates stop at owner action required; non-merge `done` attempts are side-effect-free until GitHub merge evidence is synced.
- `pullFromGitHub` reconciles linked merged PRs to `done`, applies `mc:ready-for-owner` labels, and emits notifications without duplicate side effects.
- UI adds a Kanban lane between quality review and done; flag-OFF paths block new writes while preserving read compatibility.

## SPEC-007 Plan Summary [Source: specs/007-disposition-artifacts]

**Branch**: `007-disposition-artifacts` | **Merged**: 2026-05-02 | **PR**: #25

- Reuses SPEC-001 tables `task_dispositions` and `task_artifacts`; no new migrations.
- Adds task disposition rollups, artifact publish/read/admin/health surfaces, and artifact-driven dispatch handoff.
- MC Secret Detector v1 centralizes redaction/rejection for AWS/GitHub/Google/Slack/Stripe/PEM/JWT/Bearer/OpenAI/Anthropic/generic secret patterns.
- Adds dashboard, audit, admin, OpenAPI, Storybook/visual metadata, and e2e seed support; retained checkbox drift in `tasks.md` is historical bookkeeping, not the completion authority.

## SPEC-008 Plan Summary [Source: specs/008-resource-governance]

**Branch**: `008-resource-governance` | **Merged**: 2026-05-04 | **PR**: #26

- Adds `FEATURE_RESOURCE_GOVERNANCE`-gated synchronous policy evaluation before autonomous work admission.
- Migrations M65a..m and M66 add partitioned resource/observability storage, rollback files, and archive partitions under `<MISSION_CONTROL_DATA_DIR>/archives/`.
- Cost Tracker Governance tab exposes Policies, Budgets, Windows, Overrides, Diagnostics, and System Health.
- `FEATURE_OPENCLAW_HEALTH_COSTS` is optional/fork-only and requires `FEATURE_RESOURCE_GOVERNANCE`; absent OpenClaw health files are safe when OFF.
- Feature-flag matrix, axe coverage, env-leak, and strict-scope guards preserve flag discipline and accessibility coverage.

## SPEC-009A Plan Summary [Source: specs/009a-workflow-contract-roundtrip]

**Branch**: `009a-workflow-contract-roundtrip` | **Merged**: 2026-05-07 | **PR**: #28

- Introduces repo-owned workflow contract YAML under `docs/ai/workflows/mission-control/`.
- `pnpm workflow-contract` supports import dry-run/apply, export, and recover through Node built-in TypeScript stripping with exact `yaml@2.8.2`.
- Migration M71 adds generic workflow-contract diagnostics and LKG snapshots; invalid reloads fail closed.
- Workflows diagnostics UI/API are read-only; governance/concurrency/retry/sandbox fields remain inert declarations for later specs.

## SPEC-009B Plan Summary [Source: specs/009b-mission-control-seed]

**Branch**: `009b-mission-control-seed` | **Merged**: 2026-05-08 | **PR**: #30

- Seeds Mission Control Product Line A, departments, project-agent assignments, GitHub repo routing, workflow families, feature flags, and advisory governance rows.
- Reuses SPEC-009A workflow-contract import/apply; does not duplicate YAML parsing or create pilot work.
- Preflight blocks unsafe FocusEngine/OpenClaw/GitHub automation residue before mutation and records redacted cleanup guidance.
- Future task-control-plane and sandbox-runner flags stay OFF.

## SPEC-009C1 Plan Summary [Source: specs/009c1-pilot-issue-ingest]

**Branch**: `009c1-pilot-issue-ingest` | **Merged**: 2026-05-14 | **PRs**: #34, #40

- Uses GitHub issue sync as tracker truth for one eligible pilot issue; local-only tasks are ineligible.
- Provides synthetic fallback tooling with explicit live-mutation opt-in and cleanup checklist.
- Current-schema absence assertions prove no claim, dispatch, remediation, runner, sandbox, or future run-state side effects.
- Post-merge routing fix keeps synced pilot issues in the intended hold state after ingest.

## SPEC-009C2 Plan Summary [Source: specs/009c2-triage-remediation-handoff]

**Branch**: `009c2-triage-remediation-handoff` | **Merged**: 2026-05-16 | **PRs**: #43, #46

- `ACTIONABLE_REMEDIATION` triage output creates exactly one remediation-planning successor with disposition, artifact, and activity evidence.
- Duplicate actionable retry is idempotent; negative outcomes exit without remediation successors; invalid output fails closed.
- Reuses workflow-contract, task-chain, disposition, artifact, and activity surfaces with no schema migration.
- Post-merge fix resolves successor assignees through project workspace; HAL smoke with synthetic issue #47 passed and cleanup was verified.

## SPEC-009C3 Plan Summary [Source: specs/009c3-remediation-ready-for-owner]

**Branch**: `009c3-remediation-ready-for-owner` | **Merged**: 2026-05-19 | **PR**: #48

- Drives actionable remediation through planning, dev, review, Aegis, and `ready_for_owner` using existing workflow-template, task-chain, disposition, artifact, quality-review, notification, and governance advisory surfaces.
- Adds readiness evidence and deterministic fixture PR identity without implementing owner merge reconciliation, claims, run tables, sandbox/adapter work, automatic polling, broad Product Line B cleanup, or dedicated evidence UI.
- Post-merge HAL UAT created draft PR #49, drove synthetic dev task `39` to `ready_for_owner`, verified five `spec-009c3.v1` artifacts plus Aegis approval and owner notification, then cleaned synthetic rows and retained the audit trail.

## SPEC-009C4 Plan Summary [Source: specs/009c4-owner-merge-reconciliation]

**Branch**: `009c4-owner-merge-reconciliation` | **Merged**: 2026-05-20 | **PR**: #52

- Extends existing GitHub sync/reconciliation paths so exact linked merged PR truth moves PR-producing work from `ready_for_owner` to `done`.
- Negative cases cover closed issue without merged PR, wrong repo/PR, supporting-only metadata, failed sync, local-only completion, and duplicate sync idempotency.
- Target replay on HAL inserted disposable task `41` linked to retained issue #50 / PR #51, reconciled it to `done`, proved duplicate sync no-op behavior, retained sync log rows, and removed the disposable task after evidence capture.

## SPEC-009D Plan Summary [Source: specs/009d-pilot-review-lifecycle]

**Branch**: `009d-pilot-review-lifecycle` | **Merged**: 2026-05-20 | **PR**: #54

- Adds `src/lib/pilot-review-packet.ts` and packet artifacts that derive from stored Mission Control evidence only.
- Publishes JSON and Markdown packet artifacts through existing task artifact storage; no packet-specific route, dashboard, fresh GitHub call, poller, claim authority, retry control, sandbox lifecycle, adapter registry, or real harness execution.
- UAT used retained issue #50 / PR #51 evidence to produce a proven packet, publish artifacts, inspect them via existing routes, and clean seeded rows after backup.

## SPEC-009E Plan Summary [Source: specs/009e-pilot-evidence-surfaces]

**Branch**: `009e-pilot-evidence-surfaces` | **Merged**: 2026-05-20 | **PR**: #55

- Adds generic stored-evidence-only `src/lib/task-evidence.ts`, authenticated read-only `GET /api/tasks/[id]/evidence`, and compact task detail Evidence UI.
- Represents proven, incomplete, local-only, partial, missing, warning, deferred, and cleaned-UAT proof states without GitHub refresh, packet generation, smoke execution, activity writes, artifact mutation, dispatch, runner, claim, sandbox, adapter, or harness behavior.
- UAT used retained issue #50 / PR #51 plus SPEC-009D packet/source-map proof, disposable browser carrier rows, Playwright evidence, and final cleanup counts of zero disposable tasks/evidence rows.

## SPEC-009F Plan Summary [Source: specs/009f-production-triage-routing]

**Branch**: `009f-production-triage-routing` | **Merged**: 2026-05-22 | **PR**: #57

- Adds typed production triage lane artifacts and task Evidence `triageRouting` display for six non-remediation outcomes: `NEEDS_SPEC`, needs-human, needs-specialist, duplicate, obsolete, and invalid.
- Keeps clean-exit Issue Triage terminal without remediation successors and without live GitHub mutation, claim/runner/sandbox/adapter paths, successor templates, or auto-merge behavior.
- Verification included focused routing/dispatch tests, SPEC-009F broader tests, API parity, scope guard, focused e2e UAT, build/typecheck/lint, full unit suite, full e2e suite, target deployment, and HITL replay of all six outcomes.

## SPEC-010A Plan Summary [Source: specs/010a-generic-product-line-seeder]

**Branch**: `010a-generic-product-line-seeder` | **Merged**: 2026-05-22 | **PR**: #59

- Generalizes Mission Control seed behavior into checked-in product-line YAML configs and a generic `seed:product-line` CLI with `preflight`, `apply`, and `verify` modes.
- Keeps `seed:mission-control` as compatibility wrapper; reuses existing `yaml@2.8.2`, workflow-contract import/apply tooling, feature-flag registry validation, resource policy rows, and existing seed tables with no migration.
- Post-merge UAT ran against a disposable copied DB and proved preflight/apply/verify/wrapper parity, existing-target refusal and reviewed re-apply, invalid reserved-flag no-mutation, redaction, Mission Control seed shape, zero Product Line B workspaces, zero tasks/runs, and no Product Line B/runtime/GitHub/SpecKit drift.

## SPEC-012A Plan Summary [Source: specs/012a-repo-knowledge-index]

**Branch**: `012a-repo-knowledge-index` | **Merged**: 2026-05-21 | **PR**: #56

- Adds `docs/ai/repo-knowledge-index.json`, `docs/ai/repo-knowledge-index.schema.json`, root Repo Knowledge Map updates, fixture-backed validator scripts, fresh-agent smoke, package scripts, and `pnpm guardrails -- --suite repo-knowledge-index`.
- Scope is docs/process/script/package only: no runtime behavior, migration, UI, scheduler/runner behavior, GitHub sync automation, sandbox lifecycle, harness adapter, generated `.gitnexus/` artifact, broad docs rewrite, or nested AGENTS rollout.
- UAT fixed pnpm literal `--` fixture parsing, then local verification and main checks passed.

## SPEC-013A Plan Summary [Source: specs/013a-run-state-spine]

**Branch**: `013a-run-state-spine` | **Merged**: 2026-05-22 | **PR**: #58

- Adds additive migration `076_task_stage_attempts`, rollback SQL, task-stage attempt helper/model behavior, read-only `GET /api/tasks/[id]/stage-attempts`, and compact task-detail Run state section.
- Lifecycle is observed state only; archive is non-destructive (`status='archived'`, `archived_at`, lifecycle event), and `FEATURE_TASK_CONTROL_PLANE=false` leaves legacy dispatch/runtime paths table-blind.
- Post-merge UAT rebuilt standalone output, passed focused Vitest, scope guard, task-pipeline guardrails, Playwright browser journey, M76 marker/table/index/FK checks, and cleanup counts of zero attempts/events/fixture tasks.

---

## Configuration and Routing

### Feature Flags (as of SPEC-013A)

| Flag | Default | Resolution |
|------|---------|------------|
| `FEATURE_WORKSPACE_SWITCHER` | OFF | `workspaces.feature_flags JSON` per workspace; env `0` forces OFF |
| `FEATURE_GLOBAL_AEGIS` | OFF | `workspaces.feature_flags JSON` per workspace; env `0` forces OFF |
| `FEATURE_TASK_PIPELINES` | OFF | `workspaces.feature_flags JSON` per workspace; env `0` forces OFF (SPEC-004) |
| `FEATURE_AREA_LABEL_ROUTING` | OFF | `workspaces.feature_flags JSON` per workspace; env `0` forces OFF (SPEC-006) |
| `FEATURE_RESOURCE_GOVERNANCE` | OFF | `workspaces.feature_flags JSON` per workspace; env `0` forces OFF (SPEC-008) |
| `FEATURE_OPENCLAW_HEALTH_COSTS` | OFF | Requires `FEATURE_RESOURCE_GOVERNANCE`; optional/fork-only, absent-safe (SPEC-008) |
| `PILOT_MISSION_CONTROL_E2E` | OFF | Canonical Product Line A pilot flag stored in workspace flags (SPEC-009B+) |
| `FEATURE_TASK_CONTROL_PLANE` | OFF | SPEC-013A debug/read path only; legacy runtime remains table-blind when OFF |

### Verification Commands

```bash
pnpm install       # install deps (pnpm only)
pnpm build         # standalone build
pnpm dev           # development server localhost:3000
pnpm test          # Vitest unit tests
pnpm test:e2e      # Playwright e2e
pnpm typecheck     # tsc -b --pretty false
pnpm lint          # ESLint
pnpm test:all      # lint + typecheck + test + build + e2e
```

### Strict Scope Files (tsconfig.spec-strict.json + eslint.config.mjs)

From SPEC-002:
- `src/components/layout/workspace-switcher.tsx`
- `src/types/product-line.ts`
- `src/lib/feature-flags.ts`

From SPEC-003:
- `src/lib/aegis.ts`
- `src/app/api/feature-flags/`

From SPEC-004:
- `src/lib/task-create.ts`
- `src/lib/output-schema-validator.ts`
- `src/lib/routing-rule-evaluator.ts`
- `src/types/workflow-template.ts`

From SPEC-006:
- (No new modules — strict scope is "no new TS/TSX modules under `src/`"; every implementation extended an existing file. Affected files: `src/lib/github-sync-engine.ts`, `src/lib/github-label-map.ts`, `src/lib/github-sync-poller.ts`, `src/lib/migrations.ts`, `src/app/api/projects/[id]/route.ts`, `src/app/api/github/route.ts`, `src/components/modals/project-manager-modal.tsx`.)

From SPEC-009A:
- `src/lib/workflow-contracts/`
- `scripts/workflow-contracts/workflow-contract-cli.ts`

From SPEC-009B:
- `src/lib/mission-control-seed/`
- `scripts/seed-mission-control-product-line.ts`

From SPEC-009E:
- `src/lib/task-evidence.ts`
- `src/app/api/tasks/[id]/evidence/route.ts`
- `src/components/panels/task-evidence-section.tsx`

From SPEC-009F:
- `src/lib/triage-routing-evidence.ts`
- `scripts/spec-009f/check-scope-guards.mjs`

From SPEC-010A:
- `src/lib/product-line-seed/`
- `scripts/seed-product-line.ts`
- `scripts/seed-mission-control-product-line.ts`

From SPEC-012A:
- `docs/ai/repo-knowledge-index.json`
- `docs/ai/repo-knowledge-index.schema.json`
- `scripts/spec-012a/`

From SPEC-013A:
- `src/lib/task-stage-attempts.ts`
- `src/app/api/tasks/[id]/stage-attempts/route.ts`
- `src/components/panels/task-stage-attempts-section.tsx`
- `scripts/spec-013a/check-run-state-scope-guards.mjs`

---

## Gotchas

- **`better-sqlite3` NODE_MODULE_VERSION**: Must rebuild when switching Node versions — `pnpm rebuild better-sqlite3`. The module compiled for v22 will fail on v24.
- **M53 backfill scope leak**: Without `AND scope = 'workspace'` in `findWorkspaceAegis`, post-M53 rows (workspace_id set, scope='global') appear in both local and global lookups. Fixed in SPEC-003.
- **Facility real row rejection**: The real `workspaces` row with `slug='facility'` must NOT be accepted as a Product Line workspace_id in REST, URL, or SSE setup.
- **`activeWorkspace = null` pre-init**: This is compatibility storage for Facility, not a "no-workspace" flag context. Flag resolution still uses authenticated tenant context.
- **resolveFlag env '1' does NOT force ON**: Only workspace JSON can opt a workspace in. `process.env.FEATURE_X='1'` is intentionally NOT an override (unlike `'0'` which forces OFF).
- **Archive cleanup gate**: Cleanup (folder removal) requires explicit `--apply-cleanup`, clean worktree, confirmed merge or tree reference, archive success/provenance, recovery commands, a safe base branch such as `main`, and no history rewrite or CI mutation dependency. Current-target specs are always excluded from same-run cleanup.
- **Archive command wiring**: `.specify/extensions/archive/commands/archive.md` is vendored but is NOT auto-published to `.claude/commands/`. The autopilot's Step -1 will silently no-op unless `.claude/commands/speckit.archive.run.md` exists. Wired during SPEC-006 backfill — same gap exists for `git/verify/doctor/cleanup/retrospective/review/verify-tasks` extension commands and may need wiring if/when their hooks are exercised.
- **AGENTS.md** is the agent knowledge file in this checkout. Update it for durable project conventions and recent changes.
- **SPEC-004 task creation**: Production code MUST go through `createTask()` in `src/lib/task-create.ts`. Direct `INSERT INTO tasks` in production code paths is blocked by `pnpm guardrails` (SPEC-004 static guardrail). Test fixtures may insert directly.
- **SPEC-004 retry latest-only**: The retry endpoint selects the LATEST eligible failure or stall activity for a parent task. Caller-supplied activity-id overrides are ignored; older activities cannot be replayed. This is intentional — replay of older activities would corrupt the per-parent retry-attempt counter and template-provenance hash check.
- **SPEC-004 deferred outbound push**: Pipeline-successor `createTask()` runs DB writes inside the chain transaction; GitHub/GNAP outbound pushes execute only AFTER commit. Outbound failures use the existing sync/error activity path and never roll back the chain.
- **SPEC-006 SQLite UNIQUE is immediate**: Partial unique indexes (`idx_projects_one_sync_owner_per_repo`, `idx_projects_one_triage_per_workspace`) are evaluated at statement end, NOT at COMMIT. Sync-owner transfer MUST clear-first then set-first; reverse order raises UNIQUE-violation immediately. Only FOREIGN KEY constraints support `DEFERRABLE INITIALLY DEFERRED` in SQLite.
- **SPEC-006 first-ingest only**: Subsequent label changes on GitHub do NOT move existing tasks. `tasks.project_id` is set on first ingest only (identified by absence of existing row for `(workspace_id, github_repo, github_issue_number)`). The activity log is silent on subsequent label changes — operators re-route manually via task UI.
- **SPEC-006 backfill marker monotonicity**: `tasks.area_routing_backfilled_at` is monotonic — once set non-NULL it is NEVER cleared by production code. Clearing the workspace-level `area_label_routing_backfill_completed_at` marker re-triggers bootstrap but does NOT clear individual task markers (so the resume scan finds zero pending tasks and the workspace marker is set without re-processing).
- **SPEC-006 PUT 400 wins over 409**: Format validation (`area_slug` regex, FR-040a flag-OFF rejection) MUST run BEFORE uniqueness check. When both apply, return 400. No SELECT-for-conflict and no UPDATE on the 400 path. UNIQUE-violation race translates back to matching 409 (never leaks 500).
- **SPEC-006 sync-owner lifecycle is preflight-visible, not auto-recovered**: If the sync-owner project is deleted/archived/`github_sync_enabled=0` for a `(workspace_id, github_repo)` group, polling stops cleanly. The `FEATURE_AREA_LABEL_ROUTING` preflight checklist requires verifying exactly one owner per repo group; ownership loss is an operator signal, not a runtime self-heal. Auto re-election deferred (Article XII).
- **M62 ordering reconciled**: SPEC-004 and SPEC-006 both shipped within the same week and both reserved M62. SPEC-004 merged first as PR #22 (kept M62); SPEC-006 (PR #21) reconciled at rebase time per `docs/migrations/migration-id-reservations.md`. Migration body is unchanged regardless of final id; only the numeric id, file name, and string references change.
- **SPEC-008 byte-compat**: Flag-OFF rendering of the cost-tracker panel MUST be byte-identical to the legacy panel (FR-305). The Governance tab is added only when `FEATURE_RESOURCE_GOVERNANCE` is ON; the legacy `LIMIT 3` clause for the cost summary is preserved (FR-238). The evaluator returns `allow:feature_flag_off` and short-circuits when the flag is OFF (FR-008). E2e regression at `tests/e2e/governance-flag-off-byte-compat.e2e.ts`.
- **SPEC-008 env override semantics**: `process.env.FEATURE_RESOURCE_GOVERNANCE='1'` does NOT force a flag ON (FR-323). Only `workspaces.feature_flags` JSON can opt a workspace in. `'0'` forces OFF (emergency rollback). The matrix harness (`src/lib/feature-flag-matrix.ts`) and integration test (`tests/integration/feature-flag-matrix.test.ts` FR-323 assertion) lock this in.
- **SPEC-008 enableRequires chain**: `FEATURE_OPENCLAW_HEALTH_COSTS` requires `FEATURE_RESOURCE_GOVERNANCE` (registry `enableRequires: ['FEATURE_RESOURCE_GOVERNANCE']`). The matrix harness's `buildScenarioFlags(flag, 'on-isolation')` walks the chain and auto-satisfies prerequisites. `assertEnableRequires` in the harness throws `InvalidFeatureFlagConfigurationError` when a prerequisite is OFF.
- **SPEC-008 axe-core fixture**: `tests/e2e/spec-008/governance-axe-shim.ts` exposes `axeAssert(page, stateLabel)`. The shim defers `@axe-core/playwright` import behind `SPEC_008_AXE_ENABLED=1` so local runs without the dep installed are no-ops. CI installs the dep and sets the env var. Static-source CI guard `scripts/spec-008/check-axe-coverage.mjs` scans every spec for `axeAssert(` calls and fails closed.
- **SPEC-008 strict-scope**: every `src/lib/resource-*.ts`, `src/lib/observability/**/*.ts`, `src/lib/feature-flag-matrix.ts`, `src/types/{resource-*,observability,provider-account,governance-api}.ts`, `src/components/governance/**/*.{ts,tsx}`, `src/app/api/{governance,resource-*,otlp}/**/*.ts` MUST appear in BOTH `tsconfig.spec-strict.json` `include` AND `eslint.config.mjs` `specStrictFiles`. Layer-1 family check + Layer-2 file check at `tests/integration/strict-scope-guard.test.ts`. The glob-to-regex translator handles `**/` as `(?:.*/)?` so files DIRECTLY in a globbed directory match.
- **SPEC-009E cleaned proof**: Retained issue #50 / PR #51 plus packet/source-map and smoke checklist references are durable proof after disposable UI carrier rows are cleaned. Do not present cleaned rows as current active Mission Control state.
- **SPEC-009F clean exits**: `NEEDS_SPEC`, needs-human, needs-specialist, duplicate, obsolete, and invalid outcomes are terminal recommendation/evidence lanes in v1; they must not create Issue Remediation successors or mutate GitHub automatically.
- **SPEC-010A existing targets**: Generic apply to an existing target requires explicit `--allow-existing`; unsafe configs must reject before writes and report stable no-mutation evidence.
- **SPEC-012A pnpm separator**: `pnpm knowledge:index:check -- --fixture ... --json` passes the literal separator through; the guard parser accepts it intentionally.
- **SPEC-013A runtime boundary**: `FEATURE_TASK_CONTROL_PLANE=false` keeps scheduler/dispatch/task-pipeline runtime table-blind. The task-stage attempt route/UI remains read-only debug inspection and exposes no claim/retry/release/cancel/launch controls.
- **Archive extension on main**: `.specify/scripts/bash/check-prerequisites.sh --json --paths-only` still rejects `main` as not a feature branch even though archive cleanup policy can allow reviewed main cleanups. The 2026-05-22 archive run therefore followed the vendored command contract manually and did not apply cleanup.
