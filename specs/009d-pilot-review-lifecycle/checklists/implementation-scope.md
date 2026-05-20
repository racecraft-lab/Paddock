# Implementation Scope Evidence

Task: T003

Sources checked:
- `specs/009d-pilot-review-lifecycle/spec.md`
- `specs/009d-pilot-review-lifecycle/plan.md`
- `specs/009d-pilot-review-lifecycle/research.md`
- `specs/009d-pilot-review-lifecycle/quickstart.md`
- `docs/ai/specs/SPEC-009D-workflow.md`
- `docs/ai/specs/autopilot-state.json`

## Scope Guardrail Summary

| Guardrail | Status | Evidence |
| --- | --- | --- |
| No new runtime dependency | Pass | `plan.md` states primary dependencies are the existing stack and `no new runtime dependency`; `quickstart.md` names `pnpm` only and requires no GitHub token for packet assembly tests. |
| No schema migration | Pass | `spec.md` FR-007 requires no new review-packet table or schema migration; `plan.md` records `schema_migration: false`. |
| No new dashboard | Pass | `spec.md` FR-011 avoids broad operator UI/dashboard scope; `research.md` rejects a full evidence dashboard as SPEC-009E or later. |
| No fresh GitHub call | Pass | `spec.md` FR-001 and SC-004 require stored Mission Control evidence only; `research.md` rejects live GitHub refresh during assembly. |
| No SPEC-013/SPEC-014 capability | Pass | `spec.md` FR-014 forbids polling, durable run-state, claim authority, retry controls, sandbox lifecycle, adapter registry, and real harness execution; future fields are deferrals only. |

## Required Negative-Scope Statements

- No new runtime dependency is required for SPEC-009D.
- No migration or review-packet table is part of SPEC-009D.
- No new dashboard or task-detail UI is part of SPEC-009D.
- No fresh GitHub call is required during packet assembly.
- No SPEC-013/SPEC-014 capability ships in SPEC-009D.

## Positive Scope

SPEC-009D is bounded to:

- Pure packet derivation in `src/lib/pilot-review-packet.ts`.
- Focused Vitest coverage and fixture builders.
- Publication of JSON and Markdown packet artifacts through existing task artifact behavior.
- Explicit deferred or not-available entries naming future owning specs:
  - `run_state`: SPEC-013A
  - `github_sync_automation`: SPEC-013A1
  - `claim_authority`: SPEC-013B
  - `retry_controls`: SPEC-013C
  - `sandbox_lifecycle`: SPEC-014A
  - `adapter_registry`: SPEC-014B
  - `real_harness_execution`: SPEC-014C and SPEC-014D

## Verification Evidence

- T016 US1 focused verification: passed through `pnpm exec vitest run src/lib/__tests__/pilot-review-packet.test.ts src/lib/__tests__/pilot-review-packet-artifacts.test.ts src/app/api/dispositions/__tests__/rollup.test.ts`; result was 3 passed files and 20 passed tests.
- T030 US3 no-capability verification: passed in the same focused packet suite; deferral ownership and no-capability guards are asserted in `pilot-review-packet.test.ts`.
- T038 focused packet/artifact verification: passed through the focused 3-file Vitest run above.
- T039 typecheck/lint verification: `pnpm typecheck` passed and `pnpm lint` passed under Node 22.
- T040 full verification: `pnpm build` passed under Node 22 outside the sandbox, `pnpm test` passed with 277 passed files / 2907 passed tests / 33 skipped files / 3 skipped tests / 84 todo tests, and `pnpm test:e2e` passed with 646 Playwright tests.

## Build Blocker Resolution

- The default shell was using Node v26.0.0, while this repo is pinned to Node 22. Final verification used `/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin` first in `PATH`.
- Initial `pnpm build` exposed a Next 16.2.6 prerender invariant after removing network-dependent Google font fetches. Pinning `next` and `eslint-config-next` to 16.1.6 restored production build stability.
- Next route validation exposed an invalid non-route export from `src/app/api/dispositions/rollup/route.ts`; cache reset helpers were moved to `src/lib/disposition-rollup-cache.ts`.
- A sandboxed Turbopack rebuild failed with `Operation not permitted` while creating/binding a local worker process. The same `pnpm build` passed outside the sandbox.
- The first e2e run failed because `.next/standalone` was generated before `better-sqlite3` had a rebuilt native binding. After `pnpm rebuild better-sqlite3` and a clean standalone rebuild, `.next/standalone` contained `better_sqlite3.node`, `require('better-sqlite3')` succeeded from `.next/standalone`, and `pnpm test:e2e` passed.
- `CI=true pnpm install --lockfile-only --frozen-lockfile --ignore-scripts` passed after the Next pin, confirming `package.json` and `pnpm-lock.yaml` remain aligned.

## Status

T003, T016, T030, T038, T039, and T040 evidence recorded. Production scope remains bounded to packet derivation plus the minimal build-blocker fixes needed for verification.
