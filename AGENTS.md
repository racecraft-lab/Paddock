# Paddock

Open-source dashboard for AI agent orchestration. Manage agent fleets, track tasks, monitor costs, and orchestrate workflows.

**Stack**: Next.js 16, React 19, TypeScript 5, SQLite (better-sqlite3), Tailwind CSS 3, Zustand, pnpm

## OpenClaw Node Deployment Notes

- These notes apply to operator-managed Paddock worktrees: `<live-worktree>` (live `main`) and `<dev-worktree>` (dev branch).
- Paddock should run from `racecraft-lab/Paddock` `main`.
- Active systemd unit: `paddock.service`
- Active startup wrapper: `~/.local/bin/mc-start.sh`
- The wrapper resolves runtime secrets from the operator's configured secret manager at startup.
- Active service worktree: `<live-worktree>` on `main`; `<dev-worktree>` is the development worktree on the active feature branch.
- OpenClaw is a separate deploy surface on the operator node. The gateway should run from `<openclaw-release-symlink>`, which should point at the clean tagged release tree, not from a Homebrew global package path.
- If you change startup assumptions, verify both:
  - `systemctl --user status --no-pager paddock.service`
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
- Workflow contract source: `docs/ai/workflows/paddock/workflow-contract.yaml`.
- Local checks: `pnpm knowledge:index:check`, `pnpm knowledge:index:smoke`,
  and `pnpm guardrails -- --suite repo-knowledge-index`.
- GitNexus refresh guidance stays in the GitNexus section below. `.gitnexus/`
  remains ignored local output and is not CI truth.

## Data Directory

Set `PADDOCK_DATA_DIR` env var to change the data location (defaults to `.data/`).
Database path: defaults to `<PADDOCK_DATA_DIR>/paddock.db`.

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`)
- **No AI attribution**: Never add `Co-Authored-By` or similar trailers to commits
- **Package manager**: pnpm only (no npm/yarn)
- **Icons**: No icon libraries -- use raw text/emoji in components
- **Standalone output**: `next.config.js` sets `output: 'standalone'`

## Agent Control Interfaces

Paddock provides three interfaces for autonomous agents:

### MCP Server (recommended for agents)
```bash
# Add to any Claude Code agent:
claude mcp add paddock -- node /path/to/Paddock/scripts/mc-mcp-server.cjs

# Environment config:
MC_URL=http://127.0.0.1:3000 MC_API_KEY=<key>
```
49 tools: agents, tasks, sessions, memory, soul, comments, tokens, skills, cron, status, runs, knowledge, and evals.
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
- SQLite via `better-sqlite3`, single-process, append-only ledger semantics; monthly partition tables; archive partitions written to `<PADDOCK_DATA_DIR>/archives/`. (008-resource-governance)
- TypeScript 5.7 strict in a Next.js 16 App Router / React 19 application + Next.js, React, Zustand, Tailwind CSS 3, `better-sqlite3`, existing direct `ajv@8.18.0`, exact direct `yaml@2.8.3` for SPEC-009A contract loading (009a-workflow-contract-roundtrip)
- SQLite via `better-sqlite3`; existing `workflow_templates` runtime projection plus additive generic diagnostics tables in migration `071_workflow_contract_diagnostics` (009a-workflow-contract-roundtrip)
- TypeScript 5.7 strict on Node >=22 with Next.js 16 App Router and React 19 + Existing Next.js/React/Zustand stack, `better-sqlite3`, SPEC-009A `src/lib/workflow-contracts/*`, existing feature-flag and governance modules; no new runtime dependency (009b-paddock-seed)
- SQLite through `better-sqlite3`; existing `workspaces`, `projects`, `project_agent_assignments`, `tasks`, `workflow_templates`, `resource_policies`, `resource_policy_events`, and workflow-contract diagnostics tables (009b-paddock-seed)
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
- TypeScript 5.7 strict on Node.js >=22 in the existing Next.js 16 / React 19 repository baseline + Existing Next.js/React/Zustand stack, `better-sqlite3`, direct `yaml@2.8.3`, existing workflow-contract tooling, existing feature-flag registry; no new runtime dependency (010a-generic-product-line-seeder)
- SQLite through `better-sqlite3`; existing `workspaces`, `projects`, `project_agent_assignments`, `workflow_templates`, `workflow_contract_*`, `resource_policies`, task/history/evidence/GitHub sync tables; no migration (010a-generic-product-line-seeder)
- TypeScript 5.7 strict on Node >=22 in Next.js 16 App Router / React 19 + Existing Next.js, React, Zustand where current task detail patterns require it, `better-sqlite3`, Tailwind CSS 3, Vitest, Playwright; no new runtime dependency (013a-run-state-spine)
- SQLite through `src/lib/migrations.ts`; additive migration `076_task_stage_attempts` plus manual rollback `docs/migrations/rollback-M76.sql` (013a-run-state-spine)
- TypeScript 5.7 strict on Node >=22 + Next.js 16 App Router, React 19, Zustand where the existing GitHub Sync panel needs app state, Tailwind CSS 3, `better-sqlite3`, existing GitHub helper modules, Vitest, Playwright, ESLint, pnpm (013a1-github-sync-automation)
- SQLite through `better-sqlite3`; additive M77 lifecycle tables through `src/lib/migrations.ts`; existing `github_syncs` remains the compatibility sync-history table (013a1-github-sync-automation)
- TypeScript 5.7 strict for new SPEC-013B modules on Node.js >=22. + Next.js 16 App Router, React 19, `better-sqlite3`, existing Zustand/Tailwind/Vitest stack, existing `resourcePolicyEvaluator`, existing GitHub sync lifecycle helpers, existing task-stage attempt helpers. No new runtime dependency. (013b-claim-reconciliation)
- SQLite through `better-sqlite3`; additive forward migration `078_task_stage_claims`; manual rollback at `docs/migrations/rollback-M78.sql`. (013b-claim-reconciliation)
- TypeScript 5.7 strict on Node.js >=22 + Next.js 16 App Router, React 19, `better-sqlite3`, existing feature-flag/auth/workspace helpers, existing `detectSecrets`, Node `crypto`; no new runtime dependency (013c-retry-debug-surfaces)
- SQLite through `better-sqlite3`; existing `tasks`, `workspaces`, `task_stage_attempts`, `task_stage_claims`, and `activities`; additive M79 idempotency replay table with manual rollback SQL (013c-retry-debug-surfaces)
- TypeScript 5.7 strict on Node.js >=22 + Next.js 16 App Router, React 19, existing task-detail panel patterns, Tailwind CSS 3, Vitest, Playwright, Storybook visual states; no new runtime dependency (013d-claim-control-operator-ux)
- SQLite through existing `better-sqlite3` task, claim, stage-attempt, idempotency, activity, and feature-flag rows only; no migration or backend semantic change (013d-claim-control-operator-ux)
- TypeScript 5.7 strict on Node >=22 in a Next.js 16 App Router / React 19 application + Existing Next.js/React stack, `better-sqlite3`, existing feature-flag helper, existing auth/workspace-scope helpers; no new runtime dependency (014a-sandbox-lifecycle-contract)
- SQLite through `src/lib/migrations.ts`; additive M80 `080_agent_sandbox_lifecycles`; rollback SQL at `docs/migrations/rollback-M80.sql` (014a-sandbox-lifecycle-contract)
- TypeScript 5.7 strict on Node >=22 + Next.js 16 App Router, React 19, Tailwind CSS 3, Zustand only where existing Agents panel patterns require it, `better-sqlite3` through existing read helpers, Vitest, Playwright; no new runtime dependency planned (014b-adapter-manifest-fakes)
- Checked-in typed fixture files plus derived runtime inventory; no SQLite manifest or inventory persistence and no migration. Existing SQLite state may be read through existing helpers for assignments, tasks, governance/capability decisions, and SPEC-014A lifecycle evidence. (014b-adapter-manifest-fakes)

## Recent Changes
- SPEC-013D HAL target UAT closeout (2026-06-02 CDT): manual target UAT passed on HAL against running Paddock `main` commit `3ed79e26a19e6d78033ca0e13fdab01bb8aca01a` using marker `SPEC-013D-HAL-UAT-20260603010815`. Retry, release, cancel, stale expected-state, active backoff, backoff override, and feature-flag-off outcomes were verified through the live service; `paddock.service` and `openclaw-gateway.service` remained active; cleanup counts were zero across disposable workspace/user/session/project/task/attempt/claim/idempotency/lifecycle/activity rows. HAL could not fast-forward before UAT because `git fetch origin` failed to resolve `github.com`; no promotion was attempted.
- Archive extension hygiene (2026-06-02): `.specify/memory/{spec,plan,changelog}.md` now carries provenance/recovery summaries for SPEC-013A1, SPEC-013B, SPEC-013C, and SPEC-014A. Source `spec.md` status headers are marked Completed. Active `specs/**` cleanup was not applied because the checkout is detached at current `origin/main` and the archive cleanup gate requires explicit `--apply-cleanup` on a safe base branch.
- SPEC-013D archive/status hygiene (2026-06-01): PR #65 merged to `main` as `50bf05e573f15b5aab5e53367444bef1d0b7baaf`. `.specify/memory/{spec,plan,changelog}.md`, the roadmap, workflow ledger, runbook, spec status, and this AGENTS map now record the claim-control operator UX archive. Cleanup removal of active `specs/**` folders was not applied from the post-merge hygiene branch because the archive cleanup gate requires an explicit safe-base cleanup run.
- Archive extension cleanup run (2026-05-22): `.specify/memory/{spec,plan,changelog}.md` now carries recovery/provenance summaries through SPEC-013A, including SPEC-009C3, SPEC-009C4, SPEC-009D, SPEC-009E, SPEC-009F, SPEC-010A, SPEC-012A, and SPEC-013A. Cleanup was applied after the clean-worktree gate; active completed folders were removed from `specs/**`, with raw artifact recovery commands recorded in `.specify/memory/changelog.md`.
- SPEC-010A and SPEC-013A UAT closeout (2026-05-22): Generic product-line seeder and run-state persistence spine are complete on `main`; SPEC-013A1 is the next unblocked P1 control-plane setup candidate, and SPEC-010B is unblocked subject to Product Line B preflight cleanup.
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

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read
`specs/014b-adapter-manifest-fakes/plan.md`.
<!-- SPECKIT END -->
