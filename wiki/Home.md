# Mission Control Wiki

Last reviewed: 2026-03-05

Mission Control is an open-source dashboard for orchestrating AI agents: agents, tasks, costs, workflows, and gateway connectivity in one place.

## Start Here

- Product overview: [README](../README.md)
- Local + production setup: [docs/deployment.md](../docs/deployment.md)
- Direct CLI integration (without gateway): [docs/cli-integration.md](../docs/cli-integration.md)
- Security policy: [SECURITY.md](../SECURITY.md)
- Contribution guide: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Release history: [CHANGELOG.md](../CHANGELOG.md)

## Quick Start (5 Minutes)

```bash
git clone https://github.com/builderz-labs/mission-control.git
cd mission-control
pnpm install
cp .env.example .env
pnpm dev
```

Then open `http://localhost:3000` and sign in with the seeded `AUTH_USER`/`AUTH_PASS` values from your environment.

## Core Concepts

- Agent: A worker connected to Mission Control that executes tasks and reports status/usage.
- Task: A unit of work tracked across workflow columns (`inbox -> done`) with comments and ownership.
- Gateway: Real-time connection layer (OpenClaw and compatible providers) for session/event streaming.
- Workspace/Tenant: Isolated environment for multi-client operations, managed via `/api/super/*` endpoints.

## Recommended Wiki Structure

- `Home` (this page)
- `Getting-Started` - install, auth, first login, and initial checks
- `Architecture` - runtime model, data flow, and component map
- `Operations-Runbook` - backups, upgrades, troubleshooting, incident steps
- `API-Guide` - endpoint groups, auth patterns, and examples
- `Security-Model` - auth, RBAC, API keys, host/network controls
- `Integrations` - webhooks, GitHub sync, direct CLI, multi-gateway setup
- `FAQ` - common operator/admin questions

## Notes For Maintainers

- Keep wiki pages aligned with shipped behavior in the same PR when features change.
- Add a `Last reviewed` line to each operational page.
- Prefer linking to source-of-truth docs in this repo when possible.
