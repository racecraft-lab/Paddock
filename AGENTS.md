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

## Active Technologies
- TypeScript 5 on Next.js 16 App Router with React 19 + Zustand, better-sqlite3, Tailwind CSS 3, Vitest, Playwright (002-product-line-switcher)
- SQLite plus localStorage for persisted Product Line scope (002-product-line-switcher)
- TypeScript 5 on Next.js 16 App Router with React 19 + Next.js, Zustand, better-sqlite3, Vitest, ESLint, pnpm (003-global-aegis)
- SQLite via `better-sqlite3` (003-global-aegis)
- TypeScript 5 on Next.js 16 App Router with React 19 + Next.js, React, Zustand, Tailwind CSS 3, better-sqlite3, Vitest, Playwright, exact pinned runtime dependencies `ajv@8.18.0`, `jsonpath-plus@10.4.0`, and `safe-regex@2.1.1` (004-task-pipeline-engine)
- SQLite via `better-sqlite3`; SPEC-001 task-chain columns and workflow-template fields are assumed present; SPEC-004 adds only M62's partial unique successor index and rollback SQL (004-task-pipeline-engine)
- TypeScript 5.7 strict (existing project tsconfig). + Next.js 16 App Router, React 19, `better-sqlite3`, Zustand, Tailwind 3, native `fetch` for GitHub API. No new runtime dependencies. (006-area-label-github-sync)
- SQLite via `better-sqlite3`. Single-process, synchronous transactions through `db.transaction(() => { ... })`. (006-area-label-github-sync)
- TypeScript 5.7 strict in a Next.js 16 App Router / React 19 application + Next.js, React, Zustand, `better-sqlite3`, Vitest, Playwright, ESLint, pnpm; no new runtime dependency planned (005-ready-for-owner)
- SQLite through `better-sqlite3`; existing `tasks.status`, `tasks.github_repo`, `tasks.github_pr_number`, `workflow_templates.produces_pr`, and nullable `workflow_templates.external_terminal_event` fields (005-ready-for-owner)

## Recent Changes
- 002-product-line-switcher: Added TypeScript 5 on Next.js 16 App Router with React 19 + Zustand, better-sqlite3, Tailwind CSS 3, Vitest, Playwright
