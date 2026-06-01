# SPEC-008 — Resource Governance + Observability — Retrospective

**Spec**: 008-resource-governance
**Branch**: `008-resource-governance`
**Status**: implementation complete; verification pending operator-led
soak / chaos / e2e runs (T367-T369).

## What shipped

Synchronous resource policy evaluator gating dispatch admission, with
an append-only ledger / dedupe / canonical telemetry pipeline and a
Cost Tracker Governance tab that lets operators author policies,
budgets, windows, and overrides without breaking the legacy admission
path when the feature flag is OFF.

### Key surfaces

- **Evaluator**: `src/lib/resource-evaluator.ts` —
  `resourcePolicyEvaluator(decisionInput)` returns
  `{decision, reason, …}` per FR-001 / FR-005. Synchronous; reads via
  one snapshot + atomic conditional UPDATE.
- **Telemetry**: `src/lib/observability/**` — OTLP receiver,
  six source adapters, dedupe, canonical materializer, reconciler,
  snapshot writer, freshness tracker, ingest admission, redaction.
- **Migrations**: M65a..m + M66 — additive, rerun-safe, all rollback
  files at `docs/migrations/rollback-M65{a..m}.sql` +
  `docs/migrations/rollback-M66.sql`.
- **Cost Tracker UI**: `src/components/governance/**` — tab adds when
  `FEATURE_RESOURCE_GOVERNANCE` is ON; six subviews (Policies,
  Budgets, Windows, Overrides, Diagnostics, System Health) with axe-
  assert + visual snapshots on every state.
- **Feature-flag matrix**: `src/lib/feature-flag-matrix.ts` runner +
  `tests/integration/feature-flag-matrix.test.ts` (47 tests) +
  `tests/e2e/feature-flag-matrix.e2e.ts` (9 flag rows × OFF/ON).

### Two new flags

| Flag | Default | enableRequires | OFF behavior |
| --- | --- | --- | --- |
| `FEATURE_RESOURCE_GOVERNANCE` | OFF | none | Cost Tracker byte-compat (FR-305) |
| `FEATURE_OPENCLAW_HEALTH_COSTS` | OFF | `FEATURE_RESOURCE_GOVERNANCE` | OpenClaw card hidden |

Per FR-323, `process.env.FEATURE_X='1'` does NOT force ON for SPEC-008
flags; only `workspaces.feature_flags` JSON can opt in.
`process.env.FEATURE_X='0'` forces OFF (emergency rollback).

## Constitution V matrix coverage

Every flag is exercised across four scenarios (off-isolation, on-
isolation auto-satisfying enableRequires, all-on baseline, all-off
legacy parity). The harness fails closed on uncovered combinations.

CI guards:

- `scripts/spec-008/check-axe-coverage.mjs` — every governance
  Playwright spec MUST contain `axeAssert(` calls per FR-090n.
- `scripts/spec-008/check-feature-flag-env-leak.mjs` — any
  `process.env.FEATURE_*` outside `src/lib/feature-flags.ts` is a
  configuration leak (FR-019 / FR-325).
- `tests/integration/strict-scope-guard.test.ts` — every committed
  SPEC-008 TS/TSX file MUST appear in both `tsconfig.spec-strict.json`
  and `eslint.config.mjs` (Convention J).

## What was NOT delivered in this branch

- T367 30-minute soak run @ 100 admissions/sec — requires running
  Paddock instance + bench harness; deferred to operator.
- T368 chaos runs across every runbook's `## Verification` step —
  same: requires running infra; documented as runbook procedure.
- T363 full Playwright e2e — specs are present (T284-T297, 14 files)
  but skip-guarded on the `/api/admin/spec-008/seed-fixture` endpoint
  that the Phase-9 UI fixtures depend on; those endpoints are the
  one remaining seam between code + a running instance.
- Phase 0 spike-evidence JSON (T001-T004) — pre-existing baseline.
  Spike scripts are in place; running them is operator-gated because
  each requires a real CLI subprocess + a running collector.

These are explicitly tracked in `tasks.md` under their respective
`T*` rows; none of them block the merge gate (Phase-7 was the merge
gate, and Phase-7 is 100% closed).

## Verification commands

```bash
pnpm typecheck                                          # T361
pnpm lint                                               # T360
pnpm vitest run                                         # T362
pnpm vitest run tests/integration/strict-scope-guard.test.ts
pnpm vitest run tests/integration/feature-flag-matrix.test.ts \
                tests/integration/feature-flag-matrix-coverage.test.ts
node scripts/spec-008/check-axe-coverage.mjs           # T319
node scripts/spec-008/check-feature-flag-env-leak.mjs  # T353
```

Last-known status (commit hash recorded in `SPEC-008-verification-evidence.md`):

- `pnpm typecheck`: PASS.
- `pnpm lint`: 0 SPEC-008-authored errors; 16 pre-existing warnings
  unchanged.
- `pnpm vitest run`: 2584 passed / 5 failed / 1 skipped / 86 todo.
  The 5 failures are the documented baseline (4 spike-evidence files
  + 1 SPEC-007 cross-spec test).
- `pnpm vitest run tests/integration/strict-scope-guard.test.ts`:
  331 / 331 PASS.
- Feature-flag matrix: 47 / 47 PASS.
- axe coverage: 14 specs OK.
- env-leak guard: OK.

## Recovery

To rollback SPEC-008 from a deployed instance:

1. Set `FEATURE_RESOURCE_GOVERNANCE='0'` in the deployment env (forces
   OFF for every workspace immediately).
2. (Optional) Roll back migrations in reverse order per
   `docs/migrations/rollback-procedure.md` (M66 → M65m → … → M65a).

The byte-compat invariant (FR-305 / FR-238) means step 1 alone is
sufficient to restore legacy admission behavior; step 2 only when
the schema additions are themselves a problem.

## See also

- `specs/008-resource-governance/spec.md` — full functional requirements.
- `specs/008-resource-governance/plan.md` — original plan + strict scope.
- `specs/008-resource-governance/quickstart.md` — operator zero-to-decision.
- `specs/008-resource-governance/tasks.md` — task-level progress.
- `docs/feature-flags-runbook.md` — flag activation + matrix reference.
- `docs/orchestration.md` — evaluator integration in dispatch.
- `docs/observability/setup.md` — OTLP receiver + adapter activation.
- `docs/observability/troubleshooting.md` — common ingest issues.
- `docs/operator-guides/visual-baseline-approval.md` — visual review.
- `docs/runbook/visual-flake-quarantine.md` — flaky-spec lifecycle.
