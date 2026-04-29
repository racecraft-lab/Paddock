# Mission Control

Open-source dashboard for AI agent orchestration. Manage agent fleets, track tasks, monitor costs, and orchestrate workflows.

**Stack**: Next.js 16, React 19, TypeScript 5, SQLite (better-sqlite3), Tailwind CSS 3, Zustand, pnpm

## OpenClaw Node Deployment Notes

- These notes apply to OpenClaw node Mission Control worktrees: `~/mission-control-sync` (live `main`) and `~/mission-control` (dev branch).
- Mission Control should run from `racecraft-lab/mission-control` `main`.
- Active systemd unit: `mission-control.service`
- Active startup wrapper: `~/.local/bin/mc-start.sh`
- The wrapper resolves `AUTH_PASS`, `API_KEY`, `AUTH_SECRET`, `OPENCLAW_GATEWAY_TOKEN`, and `GITHUB_TOKEN` from 1Password at startup.
- Active service worktree: `~/mission-control-sync` on `main`; `~/mission-control` is the dev worktree on `codex/openclaw-nodes-fallback`.
- OpenClaw is a separate deploy surface on the operator node. The gateway should run from `~/openclaw-release-current`, which should point at the clean tagged release tree, not from a Homebrew global package path.
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

### SPEC-001 — Foundation Migrations (PR #15, merged 2026-04-26)
Added migrations M53-M61 to `src/lib/migrations.ts`: agent scope backfill (`scope='global'` for Aegis, Security Guardian, HAL), workflow-template routing metadata, task lineage fields, workspace feature-flag storage (`feature_flags JSON`), task dispositions, task artifacts, facility workspace seed, resource policies, resource policy events. All changes additive and rerun-safe. 9 rollback SQL files at `docs/migrations/rollback-M53.sql` through `rollback-M61.sql` plus `docs/migrations/rollback-procedure.md`. No runtime behavior added. Test harness at `src/lib/__tests__/migrations-phase0.test.ts` (35/35 tasks complete).

### SPEC-002 — Product Line Switcher (PR #16, merged 2026-04-27)
Added `FEATURE_WORKSPACE_SWITCHER`-gated workspace switcher. New production modules: `src/lib/feature-flags.ts` (`resolveFlag(name, ctx)`), `src/types/product-line.ts` (discriminated Facility/ProductLine scope, scopeKey), `src/components/layout/workspace-switcher.tsx` (ARIA listbox, responsive header). Zustand persistence key `mc:active-workspace:v1`. BroadcastChannel cross-tab sync. REST/SSE scope matrix with explicit Facility/PL authorization. `/api/events` scoped. Flag-OFF behavior preserved byte-compatible (56/56 tasks complete).

### SPEC-002A — Spec Archive and Evidence Retention (PRs #18 #19, merged 2026-04-28)
Established archive evidence policy (provenance-first, no committed screenshots by default). Installed `racecraft-lab/spec-kit-archive` v1.1.0 at `.specify/extensions/archive/`. Archive Sweep lifecycle defined: autopilot pre-flight, feature-branch applies cleanup, main/protected branches dry-run only, unsafe/dirty worktrees stop. Released `speckit-pro` 1.9.1 with corrected Archive Sweep behavior. Recovery commands use `git show <merge-sha>:specs/<feature>/spec.md` (47/47 tasks complete).

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
