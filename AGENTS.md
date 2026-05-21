# Mission Control

Open-source dashboard for AI agent orchestration. Manage agent fleets, track tasks, monitor costs, and orchestrate workflows.

**Stack**: Next.js 16, React 19, TypeScript 5, SQLite (better-sqlite3), Tailwind CSS 3, Zustand, pnpm

## OpenClaw Node Deployment Notes

- These notes apply to operator-managed Mission Control worktrees: `<live-worktree>` (live `main`) and `<dev-worktree>` (dev branch).
- Mission Control should run from `racecraft-lab/mission-control` `main`.
- Active systemd unit: `mission-control.service`
- Active startup wrapper: `~/.local/bin/mc-start.sh`
- The wrapper resolves runtime secrets from the operator's configured secret manager at startup.
- Active service worktree: `<live-worktree>` on `main`; `<dev-worktree>` is the development worktree on the active feature branch.
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

Codex sandbox note: run `pnpm test` outside the sandbox. The suite uses local
runtime resources that can fail under sandboxed execution.

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

## Repo Knowledge Map

- Canonical machine-readable index: `docs/ai/repo-knowledge-index.json`
  with schema at `docs/ai/repo-knowledge-index.schema.json`.
- Durable intent: `docs/rc-factory-v1-prd.md` and
  `docs/ai/rc-factory-technical-roadmap.md`.
- Current SpecKit ledgers and status pointers: `docs/ai/specs/`,
  `docs/ai/specs/SPEC-012A-workflow.md`, and
  `docs/ai/specs/autopilot-state.json`.
- QA and recovery evidence: `docs/qa/pilot-smoke-checklist.md` and
  `docs/runbook/migration-rollback.md`.
- Workflow contract source: `docs/ai/workflows/mission-control/workflow-contract.yaml`.
- Local checks: `pnpm knowledge:index:check`, `pnpm knowledge:index:smoke`,
  and `pnpm guardrails -- --suite repo-knowledge-index`.
- GitNexus refresh guidance stays in the GitNexus section below. `.gitnexus/`
  remains ignored local output and is not CI truth.

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

## Active Technologies
- TypeScript 5 on Next.js 16 App Router with React 19 + Zustand, better-sqlite3, Tailwind CSS 3, Vitest, Playwright (002-product-line-switcher)
- SQLite plus localStorage for persisted Product Line scope (002-product-line-switcher)
- TypeScript 5 on Next.js 16 App Router with React 19 + Next.js, Zustand, better-sqlite3, Vitest, ESLint, pnpm (003-global-aegis)
- SQLite via `better-sqlite3` (003-global-aegis)
- TypeScript 5 on Next.js 16 App Router with React 19 + Next.js, React, Zustand, Tailwind CSS 3, better-sqlite3, Vitest, Playwright, exact pinned runtime dependencies `ajv@8.18.0`, `jsonpath-plus@10.4.0`, and `safe-regex@2.1.1` (004-task-pipeline-engine)
- SQLite via `better-sqlite3`; SPEC-001 task-chain columns and workflow-template fields are assumed present; SPEC-004 adds only M62's partial unique successor index and rollback SQL (004-task-pipeline-engine)
- TypeScript 5.7 strict in a Next.js 16 App Router / React 19 application + Next.js, React, Zustand, `better-sqlite3`, Vitest, Playwright, ESLint, pnpm; no new runtime dependency planned (005-ready-for-owner)
- SQLite through `better-sqlite3`; existing `tasks.status`, `tasks.github_repo`, `tasks.github_pr_number`, `workflow_templates.produces_pr`, and nullable `workflow_templates.external_terminal_event` fields (005-ready-for-owner)
- TypeScript 5.7 strict (existing project tsconfig). + Next.js 16 App Router, React 19, `better-sqlite3`, Zustand, Tailwind 3, native `fetch` for GitHub API. No new runtime dependencies. (006-area-label-github-sync)
- SQLite via `better-sqlite3`. Single-process, synchronous transactions through `db.transaction(() => { ... })`. (006-area-label-github-sync)
- TypeScript 5.7 strict (existing project tsconfig) + Next.js 16 App Router, React 19, `better-sqlite3`, Zustand, Tailwind 3, native `fetch`. Pre-existing strict-mode deps from SPEC-004 (`ajv@8.18.0`, `jsonpath-plus@10.4.0`, `safe-regex@2.1.1`) are reused for output-schema validation in the disposition validator. **No new runtime dependencies.** (007-disposition-artifacts)
- SQLite via `better-sqlite3`. Single-process synchronous transactions through `db.transaction(() => { ... })()`. No new migrations -- relies on pre-existing M054, M057, M058. WAL mode preserves snapshot-isolated reads during the supersede transaction. (007-disposition-artifacts)
- TypeScript 5.7 strict (existing `tsconfig.json`) + new entries in `tsconfig.spec-strict.json` for every SPEC-008-owned module (Constitution Convention J). (008-resource-governance)
- SQLite via `better-sqlite3`, single-process, append-only ledger semantics; monthly partition tables; archive partitions written to `<MISSION_CONTROL_DATA_DIR>/archives/`. (008-resource-governance)
- TypeScript 5.7 strict in a Next.js 16 App Router / React 19 application + Next.js, React, Zustand, Tailwind CSS 3, `better-sqlite3`, existing direct `ajv@8.18.0`, exact direct `yaml@2.8.2` for SPEC-009A contract loading (009a-workflow-contract-roundtrip)
- SQLite via `better-sqlite3`; existing `workflow_templates` runtime projection plus additive generic diagnostics tables in migration `071_workflow_contract_diagnostics` (009a-workflow-contract-roundtrip)
- TypeScript 5.7 strict on Node >=22 with Next.js 16 App Router and React 19 + Existing Next.js/React/Zustand stack, `better-sqlite3`, SPEC-009A `src/lib/workflow-contracts/*`, existing feature-flag and governance modules; no new runtime dependency (009b-mission-control-seed)
- SQLite through `better-sqlite3`; existing `workspaces`, `projects`, `project_agent_assignments`, `tasks`, `workflow_templates`, `resource_policies`, `resource_policy_events`, and workflow-contract diagnostics tables (009b-mission-control-seed)
- TypeScript 5.7 strict on Node >=22 + Next.js 16 App Router, React 19, Zustand where existing panels need it, `better-sqlite3`, Tailwind CSS 3, Vitest, Playwright only if an existing UI/smoke checklist path changes; no new runtime dependency planned (009c1-pilot-issue-ingest)
- SQLite through `better-sqlite3`; no schema migration planned (009c1-pilot-issue-ingest)
- TypeScript 5.7 strict on Node >=22 + Next.js 16 App Router, React 19, Zustand only where existing panels need it, `better-sqlite3`, existing AJV/routing-rule dependencies, Vitest; no new runtime dependency planned (009c2-triage-remediation-handoff)
- SQLite through `better-sqlite3`; existing `tasks`, `workflow_templates`, `task_dispositions`, `task_artifacts`, and `activities`; no schema migration planned (009c2-triage-remediation-handoff)
- TypeScript 5.7 strict on Node >=22 with Next.js 16 App Router and React 19 + Next.js, React, Zustand where existing panels need it, Tailwind CSS 3, `better-sqlite3`, existing workflow-contract tooling, existing AJV/routing dependencies; no new runtime dependency planned (009c3-remediation-ready-for-owner)
- SQLite through `better-sqlite3`, synchronous transactions; existing `tasks`, `workflow_templates`, `task_artifacts`, `quality_reviews`, `activities`, and resource-governance tables/surfaces (009c3-remediation-ready-for-owner)
- TypeScript 5.7 strict on Node >=22 with Next.js 16 App Router and React 19 + Next.js, React, Zustand where existing panels need it, Tailwind CSS 3, `better-sqlite3`, existing GitHub sync engine, native `fetch`, Vitest, ESLint, pnpm (009c4-owner-merge-reconciliation)
- SQLite through `better-sqlite3`; existing `tasks`, `activities`, `notifications`, `task_artifacts`, `quality_reviews`, workflow-template, label/status, and GitHub sync state only; no new schema (009c4-owner-merge-reconciliation)
- TypeScript 5.7 strict on Node >=22 with Next.js 16 App Router and React 19 + Existing Next.js, React, Zustand where existing panels need it, Tailwind CSS 3, `better-sqlite3`, SPEC-007 `src/lib/task-artifacts.ts`, existing GitHub sync/task/quality-review/governance modules; no new runtime dependency (009d-pilot-review-lifecycle)
- SQLite through existing `better-sqlite3` synchronous helpers; packet output persists through existing `task_artifacts` rows (009d-pilot-review-lifecycle)
- TypeScript 5.7 strict on Node >=22 + Next.js 16 App Router, React 19, Zustand where existing task detail panels need it, Tailwind CSS 3, `better-sqlite3`; no new runtime dependency (009e-pilot-evidence-surfaces)
- SQLite through existing `better-sqlite3` helpers; no migration and no rollback SQL planned (009e-pilot-evidence-surfaces)
- TypeScript 5.7 strict for the repository baseline; SPEC-012A-owned guard scripts use Node.js >=22 `.mjs` with built-in modules only + Next.js 16 App Router, React 19, better-sqlite3, Zustand, Tailwind CSS 3 remain unchanged; no new runtime dependency and no new parser dependency (012a-repo-knowledge-index)
- Checked-in JSON, JSON Schema, Markdown docs, and fixture files under `docs/ai/`, root `AGENTS.md`, `scripts/spec-012a/`, and `specs/012a-repo-knowledge-index/` (012a-repo-knowledge-index)
- TypeScript 5.7 strict in a Next.js 16 App Router / React 19 application on Node >=22 + Existing Next.js, React, Zustand where already used, `better-sqlite3`, Tailwind CSS 3, Vitest, Playwright; no new runtime dependency (009f-production-triage-routing)
- Existing SQLite tables through `better-sqlite3`: `tasks`, `workflow_templates`, `task_dispositions`, `task_artifacts`, `activities`, `projects`, `project_agent_assignments`, and `agents`; no migration (009f-production-triage-routing)

## Recent Changes
- Archive cleanup (2026-05-16): `.specify/memory/{spec,plan,changelog}.md` now carries recovery/provenance summaries through SPEC-009C2. Active completed folders were removed from `specs/**`; recover raw artifacts with the `git show <tree-ref>:specs/<feature>/...` commands recorded in `.specify/memory/changelog.md`.
- 009c2-triage-remediation-handoff: Completed Issue Triage to Issue Remediation handoff. `ACTIONABLE_REMEDIATION` creates exactly one remediation-planning successor with disposition/artifact/activity evidence; duplicate retries are idempotent; non-remediation outcomes do not enter remediation. PR #43 plus post-merge assignee fix PR #46 are merged and HAL live smoke passed.
- 009a-workflow-contract-roundtrip: Added repo-owned workflow contract YAML, operator `pnpm workflow-contract` import/apply/export/recover tooling through Node built-in TypeScript stripping, stable canonical/parity hashes, generic M71 workflow-contract diagnostics and LKG snapshots, read-only Workflows diagnostics UI/API, OpenAPI/API-index parity, fail-closed validation fixtures, and generated Markdown review export. SPEC-009A remains process-only: no seed, dispatch, scheduler, runner, harness, GitHub sync, or governance evaluator path is introduced.
- 008-resource-governance: Added `FEATURE_RESOURCE_GOVERNANCE`-gated synchronous resource policy evaluator and observability pipeline. Migrations M65a..m + M66 (additive). Cost Tracker Governance tab with Policies/Budgets/Windows/Overrides/Diagnostics/System Health subviews. Constitution V matrix harness at `src/lib/feature-flag-matrix.ts`. axe-core baked into Playwright fixture. CI guards `scripts/spec-008/check-axe-coverage.mjs` + `scripts/spec-008/check-feature-flag-env-leak.mjs`. Flag-OFF preserves cost-tracker byte-compat (FR-305 / FR-238).
- 002-product-line-switcher: Added TypeScript 5 on Next.js 16 App Router with React 19 + Zustand, better-sqlite3, Tailwind CSS 3, Vitest, Playwright

## GitNexus

- User-level Codex and Claude MCP configs register GitNexus with an absolute user-local Node binary path; do not add project-local MCP, skill, or hook installs.
- Keep the repo-root `.envrc` tracked and committed. Keep `.envrc.local` ignored and untracked; it must exist locally in the main checkout before being copied into linked worktrees.
- To create or refresh this repo index, run `direnv exec . gitnexus analyze --embeddings --skip-agents-md` from this repo root, outside the Codex sandbox, after the LM Studio embedding server is running.
- In linked worktrees, copy the ignored root `.envrc.local` into the worktree, run `direnv allow`, and use `direnv exec .` for GitNexus commands. GitNexus embeddings depend on `.envrc.local` values such as `GITNEXUS_EMBEDDING_URL`, `GITNEXUS_EMBEDDING_MODEL`, `GITNEXUS_EMBEDDING_DIMS`, and HTTP batching/concurrency settings; running `gitnexus analyze` outside direnv can silently use the wrong embedding configuration.
- GitNexus stores the generated local index under `.gitnexus/`, which is ignored.
