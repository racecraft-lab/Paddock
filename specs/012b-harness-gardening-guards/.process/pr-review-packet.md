# SPEC-012B PR Review Packet

## Summary

SPEC-012B adds offline harness-gardening drift guards for checked-in repo artifacts. The implementation emits deterministic JSON/Markdown reports with one non-mutating cleanup recommendation per stable finding.

## What Changed

- Added fixture-backed drift detection for stale workflow/status claims, missing evidence, stale feature-flag contradictions, strict-scope drift, broken repo-owned links, deterministic low-value test patterns, warning-only source-link classes, freshness-only staleness, and archive cleanup eligibility.
- Added stable finding IDs, deterministic sorting/dedupe, owner derivation, recommendation payloads, Paddock cleanup-task import drafts, and export-only GitHub issue drafts.
- Added `pnpm spec:012b:harness-gardening` and the focused `harness-gardening` guardrails suite while preserving `pnpm knowledge:index:check`.
- Added `check-scope-control.mjs` self-test/current-diff modes to guard the SPEC-012B process/tooling scope.

## Non-Goals

- No runtime product behavior, migrations, UI/API endpoints, scheduler, dispatch, claim/retry, sandbox, harness adapter, live GitHub write, live Paddock task creation, auto-merge, live service validation, or automatic `specs/**` cleanup.
- No subjective broad test-quality scoring.
- No replacement of SPEC-012A repo-knowledge validation.

## Review Order

1. `scripts/spec-012b/harness-gardening-report.mjs`
2. `scripts/spec-012b/harness-gardening-check.mjs`
3. `scripts/spec-012b/check-scope-control.mjs`
4. `scripts/spec-012b/__tests__/`
5. `scripts/spec-012b/fixtures/`
6. `package.json` and `scripts/check-guardrails.mjs`
7. `specs/012b-harness-gardening-guards/` and workflow ledgers

## Scope Budget

- Reviewability exception remains the ratified process/tooling exception from G5.
- Changed production behavior is limited to Node process tooling, package scripts, guardrails wiring, fixtures, and SpecKit/docs artifacts.
- Runtime source, migrations, UI/API, scheduler/dispatch, claim/retry, sandbox, harness adapter, and live-mutation paths remain out of scope.

## Traceability

- Tasks T001-T010: RED fixture tests.
- Tasks T011-T018: shared guard/report infrastructure.
- Tasks T019-T026: US1 hard drift detectors.
- Tasks T027-T036: US2 recommendations and guardrail wiring.
- Tasks T037-T044: US3 warning-only signals and static scope guard.
- Tasks T045-T055: discoverability, verification, and review packet closeout.

## Verification Evidence

- T045 discoverability: `docs/ai/repo-knowledge-index.json` already includes the SPEC-012B design concept, workflow ledger, generated spec folder, and report-artifact discoverability entries.
- T046 AGENTS pointers: `AGENTS.md` already points to the SPEC-012B workflow and generated artifacts without claiming final command success prematurely.
- T048 scope self-test: `node scripts/spec-012b/check-scope-control.mjs --self-test` passed with 12 changed files, 29 scanned entries, 0 failures, and all four self-test cases passed.
- T049 scope current-diff: 4 changed files, 99 scanned entries, 0 failures.
- T050 full fixture matrix: `pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures --as-of 2026-06-06` exited 1 as expected for hard fixtures, with 15 findings, 15 recommendations, 28 hard failures, 19 warnings, and 22 guard errors.
- T051 deterministic JSON: two `pnpm --silent spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures --as-of 2026-06-06 --json` runs matched byte-for-byte; both exited 1 as expected and produced 76,865 bytes with the same full-corpus summary.
- T052 focused suite: `pnpm guardrails -- --suite harness-gardening` passed with 1 suite and the default no-fixture report produced 0 findings and 0 hard failures.
- T053 compatibility: `pnpm guardrails` passed 4 suites; `pnpm knowledge:index:check` passed with 0 warnings; `pnpm guardrails -- --suite repo-knowledge-index` passed.
- T054 baseline checks under Node v22.22.2: `pnpm typecheck` passed; `pnpm lint` passed; `node --test scripts/spec-012b/__tests__/*.test.mjs` passed 37 tests; `pnpm test` passed 327 files / 3391 tests with 4 skipped and 84 todo; `git diff --check` passed before packet creation and will be rerun before commit.

## Known Gaps

- Full fixture runs intentionally fail because the corpus includes hard-drift and error fixtures.
- `pnpm install --frozen-lockfile` must run under Node v22.22.2 for `better-sqlite3`; Node v26 failed native rebuild.
- Archive cleanup remains recommendation-only; no source spec folders are removed in this PR.

## Rollback

- Revert the SPEC-012B commits to remove the focused guard command, guardrails suite, fixtures, and generated SpecKit artifacts.
- No database rollback, runtime flag rollback, service restart, or live data cleanup is required.
