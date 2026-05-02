# Mission Control

Open-source dashboard for AI agent orchestration. Manage agent fleets, track tasks, monitor costs, and orchestrate workflows.

**Stack**: Next.js 16, React 19, TypeScript 5, SQLite (better-sqlite3), Tailwind CSS 3, Zustand, pnpm

## OpenClaw Node Deployment Notes

- These notes apply to OpenClaw node Mission Control worktrees: `<live-worktree>` (live `main`) and `<dev-worktree>` (dev branch).
- Mission Control should run from `racecraft-lab/mission-control` `main`.
- Active systemd unit: `mission-control.service`
- Active startup wrapper: `~/.local/bin/mc-start.sh`
- The wrapper resolves `AUTH_PASS`, `API_KEY`, `AUTH_SECRET`, `OPENCLAW_GATEWAY_TOKEN`, and `GITHUB_TOKEN` from 1Password at startup.
- Active service worktree: `<live-worktree>` on `main`; `<dev-worktree>` is the dev worktree on `<feature-branch>`.
- OpenClaw is a separate deploy surface on the operator node. The gateway should run from `<openclaw-release-symlink>`, which should point at the clean tagged release tree, not from a Homebrew global package path.
- If you change startup assumptions, verify both:
  - `systemctl --user status --no-pager mission-control.service`
  - `systemctl --user status --no-pager openclaw-gateway.service`

## Prerequisites

- Node.js >= 22 (LTS recommended; 24.x also supported)
- pnpm (`corepack enable` to auto-install)

## Setup

```bash
pnpm install
pnpm build
```

Secrets (AUTH_SECRET, API_KEY) auto-generate on first run if not set.
Visit `http://localhost:3000/setup` to create an admin account, or set `AUTH_USER`/`AUTH_PASS` in `.env` for headless/CI seeding.

## Run

```bash
pnpm dev              # development (localhost:3000)
pnpm start            # production
node .next/standalone/server.js   # standalone mode (after build)
```

## Docker

```bash
docker compose up                 # zero-config
bash install.sh --docker          # full guided setup
```

Production hardening: `docker compose -f docker-compose.yml -f docker-compose.hardened.yml up -d`

## Tests

```bash
pnpm test             # unit tests (vitest)
pnpm test:e2e         # end-to-end (playwright)
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm test:all         # lint + typecheck + test + build + e2e
```

## Key Directories

```
src/app/          Next.js pages + API routes (App Router)
src/components/   UI panels and shared components
src/lib/          Core logic, database, utilities
.data/            SQLite database + runtime state (gitignored)
scripts/          Install, deploy, diagnostics scripts
docs/             Documentation and guides
```

Path alias: `@/*` maps to `./src/*`

## Data Directory

Set `MISSION_CONTROL_DATA_DIR` env var to change the data location (defaults to `.data/`).
Database path: defaults to `<MISSION_CONTROL_DATA_DIR>/mission-control.db`.

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`)
- **No AI attribution**: Never add `Co-Authored-By` or similar trailers to commits
- **Package manager**: pnpm only (no npm/yarn)
- **Icons**: No icon libraries -- use raw text/emoji in components
- **Standalone output**: `next.config.js` sets `output: 'standalone'`

## Agent Control Interfaces

Mission Control provides three interfaces for autonomous agents:

### MCP Server (recommended for agents)
```bash
# Add to any Claude Code agent:
claude mcp add mission-control -- node /path/to/mission-control/scripts/mc-mcp-server.cjs

# Environment config:
MC_URL=http://127.0.0.1:3000 MC_API_KEY=<key>
```
35 tools: agents, tasks, sessions, memory, soul, comments, tokens, skills, cron, status.
See `docs/cli-agent-control.md` for full tool list.

### CLI
```bash
pnpm mc agents list --json
pnpm mc tasks queue --agent Aegis --max-capacity 2 --json
pnpm mc events watch --types agent,task
```

### REST API
OpenAPI spec: `openapi.json`. Interactive docs at `/docs` when running.

## Common Pitfalls

- **Standalone mode**: Use `node .next/standalone/server.js`, not `pnpm start` (which requires full `node_modules`)
- **better-sqlite3**: Native addon -- needs rebuild when switching Node versions (`pnpm rebuild better-sqlite3`)
- **AUTH_PASS with `#`**: Quote it (`AUTH_PASS="my#pass"`) or use `AUTH_PASS_B64` (base64-encoded)
- **Gateway optional**: Set `NEXT_PUBLIC_GATEWAY_OPTIONAL=true` for standalone deployments without gateway connectivity
- **`resolveFlag` env override**: `process.env.FEATURE_X='1'` does NOT force a flag ON — only `workspaces.feature_flags` JSON can opt a workspace in. `'0'` forces OFF.
- **M53 backfill scope leak**: Post-M53 rows have `workspace_id` set AND `scope='global'`. `findWorkspaceAegis` must include `AND scope = 'workspace'` or these rows appear in both local and global lookups (fixed in SPEC-003).
- **Facility real row**: The `workspaces` row with `slug='facility'` is NOT a valid Product Line workspace_id. REST/URL/SSE must reject it with 400.

## Recent Changes
- 007-disposition-artifacts: Added TypeScript 5.7 strict (existing project tsconfig) + Next.js 16 App Router, React 19, `better-sqlite3`, Zustand, Tailwind 3, native `fetch`. Pre-existing strict-mode deps from SPEC-004 (`ajv@8.18.0`, `jsonpath-plus@10.4.0`, `safe-regex@2.1.1`) are reused for output-schema validation in the disposition validator. **No new runtime dependencies.**
- 006-area-label-github-sync: Added TypeScript 5.7 strict (existing project tsconfig). + Next.js 16 App Router, React 19, `better-sqlite3`, Zustand, Tailwind 3, native `fetch` for GitHub API. No new runtime dependencies.

### SPEC-001 — Foundation Migrations (PR #15, merged 2026-04-26)
Added migrations M53-M61 to `src/lib/migrations.ts`: agent scope backfill (`scope='global'` for Aegis, Security Guardian, HAL), workflow-template routing metadata, task lineage fields, workspace feature-flag storage (`feature_flags JSON`), task dispositions, task artifacts, facility workspace seed, resource policies, resource policy events. All changes additive and rerun-safe. 9 rollback SQL files at `docs/migrations/rollback-M53.sql` through `rollback-M61.sql` plus `docs/migrations/rollback-procedure.md`. No runtime behavior added. Test harness at `src/lib/__tests__/migrations-phase0.test.ts` (35/35 tasks complete).

### SPEC-002 — Product Line Switcher (PR #16, merged 2026-04-27)
Added `FEATURE_WORKSPACE_SWITCHER`-gated workspace switcher. New production modules: `src/lib/feature-flags.ts` (`resolveFlag(name, ctx)`), `src/types/product-line.ts` (discriminated Facility/ProductLine scope, scopeKey), `src/components/layout/workspace-switcher.tsx` (ARIA listbox, responsive header). Zustand persistence key `mc:active-workspace:v1`. BroadcastChannel cross-tab sync. REST/SSE scope matrix with explicit Facility/PL authorization. `/api/events` scoped. Flag-OFF behavior preserved byte-compatible (56/56 tasks complete).

### SPEC-002A — Spec Archive and Evidence Retention (PRs #18 #19, merged 2026-04-28)
Established archive evidence policy (provenance-first, no committed screenshots by default). Installed `racecraft-lab/spec-kit-archive` v1.1.0 at `.specify/extensions/archive/`. Archive Sweep lifecycle defined: autopilot pre-flight, feature-branch applies cleanup, main/protected branches dry-run only, unsafe/dirty worktrees stop. Released `speckit-pro` 1.9.1 with corrected Archive Sweep behavior. Recovery commands use `git show <merge-sha>:specs/<feature>/spec.md` (47/47 tasks complete).

### SPEC-003 — Aegis Facility Singleton Refactor (PR #20, merged 2026-04-30)
Introduced `src/lib/aegis.ts` exporting `getAegis(db, workspace_id?)` as the single Aegis lookup path. `FEATURE_GLOBAL_AEGIS` routed through `resolveFlag(name, ctx)` against requested-task/review workspace context. Flag OFF preserves workspace-first/global-fallback compatibility; flag ON prefers the global singleton (`agents.scope='global'` + `LOWER(name)='aegis'`). Lowest-id tie breaking; no `agents.status` filtering. Idempotent `aegis_local_shadowed` activity row written once per `(workspace_id, global_agent_id, local_agent_id)` tuple. `runAegisReviews` and `resolveGatewayAgentIdForReviewAgent` source the reviewer through `getAegis` while preserving task selection, retry, dispatch, quality-review, activity, and status-transition semantics. Removed `aegisAgentByWorkspace` map. Preserved `quality_reviews.reviewer='aegis'` as the live gate signal — no `quality_reviews.agent_id` introduced. Strict scope: `src/lib/aegis.ts` added to `tsconfig.spec-strict.json` and `eslint.config.mjs`. No schema migrations (21/21 tasks complete).

### SPEC-004 — Task Pipeline Engine and Declarative Routing (PR #22, merged 2026-05-01)
Added `FEATURE_TASK_PIPELINES`-gated declarative task pipeline engine. New strict-scope production modules: `src/lib/task-create.ts` (shared `createTask()` covering api/github_import/github_sync/recurring/pipeline_successor source profiles), `src/lib/output-schema-validator.ts` (constrained AJV profile, `safe-regex` patterns, hard caps on size/depth/budget), `src/lib/routing-rule-evaluator.ts` (allowlisted boolean grammar `==`/`!=`/`in`/`not in`/`&&`/`||`/`!` with bounded JSONPath traversal, no `eval`/`Function`/`vm`), and `src/types/workflow-template.ts`. Migration M62: partial unique successor index on non-null `tasks.parent_task_id` (one-successor-per-parent). Workflow-template chain fields (`slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, `allow_redacted_artifacts`) wired into `/api/workflows` with Product Line scope enforcement and the Workflows editor in `orchestration-bar.tsx`. `advanceTaskChain` runs inside one transaction with deferred outbound GitHub/GNAP push; explicit operator retry endpoint with SHA-256 template-provenance hash check (canonical JSON for output_schema/routing_rules, normalized string-or-null for next_template_slug); side-effect-free retry conflicts (`retry_not_eligible` / `retry_template_provenance_missing` / `retry_template_drift_unconfirmed`); bounded `chain_retry` summary excludes raw output and routing traces. Stable activity reason codes for every failure/stall class. Pinned runtime deps: `ajv@8.18.0`, `jsonpath-plus@10.4.0`, `safe-regex@2.1.1`. Consolidated CI guardrails behind `pnpm guardrails`; Storybook screenshot artifact upload removed (Argos owns visual review) (88/88 tasks complete).

### SPEC-006 — Area-Label GitHub Sync (PR #21, merged 2026-05-01)
Added `FEATURE_AREA_LABEL_ROUTING`-gated multi-department routing for shared GitHub monorepos. Migration M62/M63: four nullable columns (`projects.area_slug`, `projects.is_triage_project`, `projects.is_repo_sync_owner`, `tasks.area_routing_backfilled_at`) + four indexes including partial unique `idx_projects_one_sync_owner_per_repo` and `idx_projects_one_triage_per_workspace`. Single sync owner per `(workspace_id, github_repo)` (lowest `projects.id` among `github_sync_enabled=1`). Inbound: `area:*` parsed → `single_match` (project by `area_slug`), `no_label` / `multi_label` / `no_match` (triage) or `no_triage` (sync-owner fallback). First-ingest only — no re-route on subsequent label change. Outbound: `area:<slug>` emitted alongside `mc:*`/`priority:*`. `backfillAreaRouting(workspaceId)` runs once per workspace on first flag-on (per-task transactions, monotonic `tasks.area_routing_backfilled_at` resume marker, workspace-level completion marker `area_label_routing_backfill_completed_at` set last). `initializeLabels(repo, workspaceId)` triggered on connect / `area_slug`/`is_triage_project` PUT transition / first-poll bootstrap; failures throttled to one `label_provisioning_failed` activity per `(workspace_id, github_repo)` per 24h with sanitized payload. `PUT /api/projects/[id]` 400 (format) wins over 409; conflict shapes `area_slug_conflict` / `triage_conflict` / `owner_conflict`; sync-owner transfer is atomic clear-then-set inside one transaction (SQLite UNIQUE indexes are immediate). Static `AREA_LABEL_MAP` covers 12 curated names. Strict scope: NO new TS/TSX modules — every implementation extended an existing file. Roadmap and `docs/ai/specs/SPEC-006-workflow.md` Phase 7 record Implement Complete; the local `tasks.md` tracker shows 22/88 ticked (pre-merge tracking drift documented in changelog Outstanding Items).

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

## Active Technologies
- TypeScript 5.7 strict (existing project tsconfig). + Next.js 16 App Router, React 19, `better-sqlite3`, Zustand, Tailwind 3, native `fetch` for GitHub API. No new runtime dependencies. (006-area-label-github-sync)
- TypeScript 5.7 strict (existing project tsconfig) + Next.js 16 App Router, React 19, `better-sqlite3`, Zustand, Tailwind 3, native `fetch`. Pre-existing strict-mode deps from SPEC-004 (`ajv@8.18.0`, `jsonpath-plus@10.4.0`, `safe-regex@2.1.1`) are reused for output-schema validation in the disposition validator. **No new runtime dependencies.** (007-disposition-artifacts)
- SQLite via `better-sqlite3`. Single-process synchronous transactions through `db.transaction(() => { ... })()`. No new migrations — relies on pre-existing M054, M057, M058. WAL mode preserves snapshot-isolated reads during the supersede transaction. (007-disposition-artifacts)
