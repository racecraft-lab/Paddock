# Mission Control CLI for Agent-Complete Operations (v1 scaffold)

This repository now includes a first-party CLI scaffold at:

- scripts/mc-cli.cjs

It is designed for autonomous/headless usage first:
- API key auth support
- profile persistence (~/.mission-control/profiles/*.json)
- stable JSON mode (`--json`)
- deterministic exit code categories
- command groups mapped to Mission Control API resources

## Quick start

1) Ensure Mission Control API is running.
2) Set environment variables or use profile flags:

- MC_URL=http://127.0.0.1:3000
- MC_API_KEY=your-key

3) Run commands:

node scripts/mc-cli.cjs agents list --json
node scripts/mc-cli.cjs tasks queue --agent Aegis --max-capacity 2 --json
node scripts/mc-cli.cjs sessions control --id <session-id> --action terminate

## Supported groups in scaffold

- auth: login, logout, whoami
- agents: list/get/create/update/delete/wake/diagnostics/heartbeat
- tasks: list/get/create/update/delete/queue
- sessions: list/control/continue
- connect: register/list/disconnect
- tokens: list/stats/by-agent
- skills: list/content/check/upsert/delete
- cron: list/create/update/pause/resume/remove/run
- events: watch (basic HTTP fallback)
- raw: generic request passthrough

## Exit code contract

- 0 success
- 2 usage error
- 3 auth error (401)
- 4 permission error (403)
- 5 network/timeout
- 6 server error (5xx)

## API contract parity gate

To detect drift between Next.js route handlers and openapi.json, use:

node scripts/check-api-contract-parity.mjs \
  --root . \
  --openapi openapi.json \
  --ignore-file scripts/api-contract-parity.ignore

Machine output:

node scripts/check-api-contract-parity.mjs --json

The checker scans `src/app/api/**/route.ts(x)`, derives operations (METHOD + /api/path), compares against OpenAPI operations, and exits non-zero on mismatch.

Baseline policy in this repo:
- `scripts/api-contract-parity.ignore` currently stores a temporary baseline of known drift.
- CI enforces no regressions beyond baseline.
- When you fix a mismatch, remove its line from ignore file in the same PR.
- Goal is monotonic burn-down to an empty ignore file.

## Next steps

- Promote scripts to package.json scripts (`mc`, `api:parity`).
- Add retry/backoff and SSE stream mode for `events watch`.
- Add richer pagination/filter UX and CSV export for reporting commands.
- Add integration tests that run the CLI against a test server fixture.
