# Mission Control — Consolidated Implementation Plan Memory

Auto-generated from Archive Sweep on 2026-04-28.
Revision: Archiving SPEC-001, SPEC-002, SPEC-002A after confirmed PR merges.
Revision 2026-05-01: Backfilling SPEC-003 (PR #20 merged 2026-04-30) — original
sweep silently no-op'd due to unwired /speckit.archive.run command (now fixed).

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
│   ├── migrations.ts               # M1-M61; authoritative schema source
│   ├── feature-flags.ts            # SPEC-002 new production module (resolveFlag)
│   ├── aegis.ts                    # SPEC-003 global Aegis resolver (in progress)
│   └── __tests__/
│       ├── migrations-phase0.test.ts  # SPEC-001 migration smoke/rerun/rollback harness
│       ├── feature-flags.test.ts      # SPEC-002 resolveFlag unit tests
│       └── aegis.test.ts              # SPEC-003 getAegis unit tests (9 tests)
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
└── 006-area-label-github-sync/     # SPEC-006: In progress (current target)

# Archived (cleanup applied 2026-05-01 backfill sweep):
# - 001-foundation-migrations    (SPEC-001, archived 2026-04-28)
# - 002-product-line-switcher    (SPEC-002, archived 2026-04-28)
# - 002a-spec-archive-evidence   (SPEC-002A, archived 2026-04-28)
# - 003-global-aegis             (SPEC-003, archived 2026-05-01)
```

---

## SPEC-001 Plan Summary [Source: specs/001-foundation-migrations]

**Branch**: `001-foundation-migrations` | **Merged**: 2026-04-26 | **PR**: #15

### Migration Allocation

| Migration | Purpose | Status |
|-----------|---------|--------|
| M53 | `agents.scope` + global backfill for Aegis/Security Guardian/HAL | Complete |
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

## Configuration and Routing

### Feature Flags (as of SPEC-002)

| Flag | Default | Resolution |
|------|---------|------------|
| `FEATURE_WORKSPACE_SWITCHER` | OFF | `workspaces.feature_flags JSON` per workspace; env `0` forces OFF |
| `FEATURE_GLOBAL_AEGIS` | OFF | `workspaces.feature_flags JSON` per workspace; env `0` forces OFF |
| `PILOT_PRODUCT_LINE_A_E2E` | OFF | May be flipped via env (operator-temporary) |

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

---

## Gotchas

- **`better-sqlite3` NODE_MODULE_VERSION**: Must rebuild when switching Node versions — `pnpm rebuild better-sqlite3`. The module compiled for v22 will fail on v24.
- **M53 backfill scope leak**: Without `AND scope = 'workspace'` in `findWorkspaceAegis`, post-M53 rows (workspace_id set, scope='global') appear in both local and global lookups. Fixed in SPEC-003.
- **Facility real row rejection**: The real `workspaces` row with `slug='facility'` must NOT be accepted as a Product Line workspace_id in REST, URL, or SSE setup.
- **`activeWorkspace = null` pre-init**: This is compatibility storage for Facility, not a "no-workspace" flag context. Flag resolution still uses authenticated tenant context.
- **resolveFlag env '1' does NOT force ON**: Only workspace JSON can opt a workspace in. `process.env.FEATURE_X='1'` is intentionally NOT an override (unlike `'0'` which forces OFF).
- **Archive cleanup gate**: Cleanup (folder removal) requires `--apply-cleanup`, clean worktree, confirmed merge, and recovery commands. Per SPEC-002A's revised policy (`speckit-pro` 1.9.1), feature-branch worktrees CAN apply cleanup for previously merged specs (excluding the current target); `main` and protected branches stay dry-run only. Pre-1.9.1 docs that say "feature branches always have `safeToApplyCleanup=false`" are stale.
- **Archive command wiring**: `.specify/extensions/archive/commands/archive.md` is vendored but is NOT auto-published to `.claude/commands/`. The autopilot's Step -1 will silently no-op unless `.claude/commands/speckit.archive.run.md` exists. Wired during SPEC-006 backfill — same gap exists for `git/verify/doctor/cleanup/retrospective/review/verify-tasks` extension commands and may need wiring if/when their hooks are exercised.
- **CLAUDE.md** is the agent knowledge file (GEMINI.md and AGENTS.md not present); update this file for agent conventions.
