# SPEC-012B UAT Runbook

Generated: 2026-06-07T05:24:54Z

SPEC-012B is process/tooling-only. UAT is local guard verification against checked-in fixtures and default no-fixture guardrails behavior; no HAL, browser, database, service, GitHub write, Paddock task creation, or live deployment validation is required.

## Environment

| Item | Value |
|------|-------|
| Branch | `012b-harness-gardening-guards` |
| Node | `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH` |
| Package manager | `pnpm` |
| Feature directory | `specs/012b-harness-gardening-guards` |

## UAT Steps

| Step | Command | Expected Result |
|------|---------|-----------------|
| 1 | `node scripts/spec-012b/check-scope-control.mjs --self-test` | Pass with 0 failures |
| 2 | `node scripts/spec-012b/check-scope-control.mjs` | Pass with 0 failures |
| 3 | `pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures/fresh --as-of 2026-06-06 --json` | Exit 0; 0 findings and 0 hard failures |
| 4 | `pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures/warning --as-of 2026-06-06 --json` | Exit 0; warning findings and 0 hard failures |
| 5 | `pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures --as-of 2026-06-06` | Exit 1 by design; hard fixture summary matches the review packet |
| 6 | `pnpm guardrails -- --suite harness-gardening` | Exit 0; default no-fixture report has 0 findings |
| 7 | `pnpm guardrails` | Exit 0; full guardrails pass |
| 8 | `pnpm knowledge:index:check` | Exit 0; repo knowledge index passes |
| 9 | `pnpm typecheck && pnpm lint && pnpm test` | Exit 0 under Node v22.22.2 |

## Pass Criteria

- Warning-only fixtures do not increase hard-failure exit status.
- Full fixture corpus hard failures are deterministic and documented.
- No runtime/live-mutation or archive cleanup mutation enters the diff.
- `pnpm knowledge:index:check` remains independent from SPEC-012B.

## Cleanup

No database, service, browser, HAL, GitHub, or Paddock cleanup is required.
