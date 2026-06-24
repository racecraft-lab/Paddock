# SPEC-011 PR Review Packet

## Summary

SPEC-011 adds a helper-only CrabTrap honeypot adapter behind
`FEATURE_CRABTRAP_HONEYPOT`. It validates Paddock-owned signed
`crabtrap_denial_summary.v1` fixtures and writes bounded
`activities.type='security_intrusion_detected'` evidence only after flag,
config, signature, freshness, replay, size, and unsafe-field checks pass.

## Non-Goals

- No runtime route, webhook receiver, admin poller, custom sender, OpenAPI
  contract, or API-parity ignore.
- No schema migration or rollback SQL.
- No scheduler, task-dispatch, task-chain, task terminal, GitHub mutation,
  notification fanout, successor selection, UI panel, dashboard, report, or
  default alert rule.
- No live CrabTrap Docker requirement, forked CrabTrap code, raw audit
  persistence, raw transcript capture, or raw sensitive request data storage.

## Review Order

1. Foundation and scope wiring: `src/lib/feature-flags.ts`,
   `scripts/check-guardrails.mjs`, `tsconfig.spec-strict.json`,
   `eslint.config.mjs`, and the RED fixture/test setup.
2. US1 no-op behavior: feature-disabled, missing-config, and invalid-config
   paths in `src/lib/crabtrap-adapter.ts`.
3. US2 bounded accepted evidence: signing, normalization, replay key, and one
   activity insert.
4. US3 rejection hardening: malformed, unsigned, invalid signature, stale,
   replayed, oversized, unsafe, unsupported, and activity-write-failed paths.
5. US4/polish evidence: this PR packet, UAT runbook, scope proof, and status
   ledgers.

## Scope Budget And Split Decision

- Reviewability task gate evidence:
  `specs/011-crabtrap-honeypot/.process/reviewability/tasks-gate.json`.
- Task gate result: size-only block with `reviewable_loc=1280`,
  `production_files=7`, `total_files=68`, and `primary_surface_count=6`.
- Atomicity route:
  `specs/011-crabtrap-honeypot/.process/reviewability/atomicity-route.json`
  records `one-navigable-PR`.
- Current feature diff from implementation base `c65bb02b..HEAD`: 31 files,
  4,506 insertions, 133 deletions.
- Current feature diff from merge-base `34d945d2..HEAD`: 53 files, 5,907
  insertions, 486 deletions, including SpecKit scaffold/preset artifacts.
- Split decision: no additional split was applied in this marker. The branch
  remains above nominal reviewability thresholds, but the existing
  reviewability block is size-only and was routed into marker execution with
  review order preserved. Parent review should treat review size as a known
  gap, not as evidence of forbidden runtime-surface drift.

## Traceability

| Task | Evidence |
|---|---|
| T022 | Fixture UAT and no-raw-persistence checklist updated in `uat-runbook.md` |
| T023 | PR review packet created here |
| T024 | Forbidden-surface diff and `rg` inspections recorded below |
| T025 | Final scope budget and split decision recorded above |
| T026 | Full fixture UAT matrix recorded in `uat-runbook.md` |
| T027 | Focused adapter verification recorded below |
| T028 | Guardrail run recorded below |
| T029 | Typecheck and lint recorded below |
| T030 | Unit and build runs recorded below |
| T031 | Packet finalized with non-goals, review order, scope, traceability, verification, gaps, and rollback notes |
| T032 | Roadmap and workflow status updated |

## Verification Evidence

| Command | Result | Notes |
|---|---|---|
| `direnv exec . pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts` | Pass | 1 test file, 15 tests |
| `direnv exec . pnpm guardrails` | Pass | 4 guardrail suites passed after tightening the SPEC-012B stale-status detector so ordinary historical prose containing "current SPEC-012B" is not treated as an active status pointer claim |
| `direnv exec . pnpm typecheck` | Pass | `tsc -b --pretty false` completed |
| `direnv exec . pnpm lint` | Pass | `eslint .` completed |
| `direnv exec . pnpm test` | Pass | 328 files passed, 3406 tests passed, 4 skipped, 84 todo |
| `direnv exec . pnpm build` | Pass | Next.js build compiled, type-checked, generated 145 static pages, and finalized routes |
| `git diff --check c65bb02b..HEAD` | Pass | No whitespace errors |

Additional focused verification:

- `direnv exec . pnpm vitest run src/lib/__tests__/feature-flags.test.ts src/lib/__tests__/feature-flag-service.test.ts src/lib/__tests__/product-line-seed.test.ts src/lib/__tests__/product-line-seed-cli.test.ts src/lib/__tests__/paddock-seed/evidence.test.ts`: pass, 5 files, 84 tests.
- `direnv exec . pnpm vitest run src/lib/__tests__/product-line-b-seed.test.ts`: pass, 1 file, 16 tests.
- `direnv exec . node --test scripts/spec-012b/__tests__/hard-status-evidence.test.mjs`: pass, 5 tests.

## Forbidden Surface Inspection

Commands:

```bash
git diff --name-only c65bb02b..HEAD -- src/app openapi.json src/components src/lib/migrations.ts docs/migrations src/lib/scheduler.ts src/lib/task-dispatch.ts src/lib/github.ts src/lib/github src/lib/notifications.ts src/lib/notifications src/lib/tasks.ts src/lib/task-terminal.ts src/lib/task-artifacts.ts src/lib/workflow-templates.ts src/lib/workflow-contracts
rg -n "CrabTrap|crabtrap|FEATURE_CRABTRAP_HONEYPOT|security_intrusion_detected" src/app src/components openapi.json src/lib/migrations.ts src/lib/scheduler.ts src/lib/task-dispatch.ts src/lib/github.ts src/lib/workflow-contracts
rg -n "successor|terminal|ready_for_owner|done|notification|webhook|dispatch|scheduler|OpenAPI|openapi|migration|route" src/lib/crabtrap-adapter.ts src/lib/__tests__/crabtrap-adapter.test.ts src/lib/__tests__/fixtures/crabtrap/crabtrap-fixtures.ts
```

Results:

- No changed files in route, webhook, OpenAPI, UI, migration, scheduler,
  dispatch, notification, GitHub, task terminal, successor-selection, or
  workflow-contract surfaces.
- No CrabTrap references in forbidden runtime/API/UI surfaces.
- No forbidden-surface keywords in the CrabTrap adapter, focused test, or
  fixture files.

## Fixture UAT And No-Raw Persistence

- Full matrix passed through focused Vitest: flag-off, config-missing,
  config-invalid, valid, malformed, unsigned, invalid-signature, stale,
  replayed, oversized, unsafe, unsupported-decision, unsupported-method, and
  activity-write-failed cases.
- Accepted evidence writes exactly one bounded `security_intrusion_detected`
  row with fixed actor `crabtrap-adapter`, workspace landing scope, safe
  reduced URL host/path fields, bounded counts/hashes, and adapter-derived
  `replay_key_hash`.
- Rejected/failed paths write zero activity rows except replay, where the first
  accepted row remains and the replay writes no duplicate.
- Assertions reject raw event identity, signing secret, raw URL markers, query
  markers, unsafe token string, and database error text from persisted or
  returned evidence.

## Known Gaps

- The PR remains above nominal reviewability thresholds; marker planning and
  review order are the mitigation for this branch.
- US4/polish checkpoint commit:
  `ef92a3d40b6a377a3fa4f21428cc82b1334a1cc3`.

## Rollback And Flag Notes

- Runtime behavior is guarded by `FEATURE_CRABTRAP_HONEYPOT`, which defaults
  off.
- Missing or invalid adapter config returns no-op and writes no activity.
- No migration exists, so rollback does not require schema reversal.
- Disabling or reverting the adapter leaves existing route, scheduler, dispatch,
  GitHub, notification, task terminal, successor-selection, UI, and OpenAPI
  surfaces unchanged.
