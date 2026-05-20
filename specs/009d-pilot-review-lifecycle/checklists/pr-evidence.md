# PR Evidence: SPEC-009D Pilot Review Packet

Task: T042

## What Changed

- Added `src/lib/pilot-review-packet.ts` for stored-evidence-only packet derivation, Markdown rendering, and JSON/Markdown artifact publication.
- Added SPEC-009D fixture and Vitest coverage for packet schema, source maps, evidence warnings, artifact publication, Markdown safety, deferrals, and local-only exclusion.
- Added explicit SPEC-009D TypeScript and ESLint strict-scope entries.
- Kept packet persistence and inspection on existing SPEC-007 task artifact seams.

## Why

SPEC-009D gives operators and reviewers one compact lifecycle packet for the self-hosting pilot without terminal archaeology and without inventing future control-plane state.

## Non-Goals

- No schema migration or review-packet table.
- No new runtime dependency.
- No new dashboard or packet-specific route.
- No fresh GitHub API call during packet assembly.
- No polling, durable run-state, claim authority, retry controls, sandbox lifecycle, adapter registry, or real harness execution.

## Review Order

1. `src/lib/__tests__/pilot-review-packet.fixtures.ts`
2. `src/lib/__tests__/pilot-review-packet.test.ts`
3. `src/lib/__tests__/pilot-review-packet-artifacts.test.ts`
4. `src/lib/pilot-review-packet.ts`
5. `tsconfig.spec-strict.json` and `eslint.config.mjs`
6. Build-blocker fixes in `src/app/layout.tsx`, `src/app/globals.css`, `src/app/api/dispositions/rollup/route.ts`, `src/lib/disposition-rollup-cache.ts`, `package.json`, and `pnpm-lock.yaml`

## FR/SC Traceability

- FR-001/SC-001: Packet identity, lifecycle, gates, and evidence derive from stored rows and smoke evidence.
- FR-002/FR-003/SC-002: JSON and Markdown artifacts share one snapshot and source-map pointers.
- FR-004/FR-005/SC-003: SPEC-007 redaction, quarantined, oversized, stale, malformed, superseded, and missing evidence states are normalized without leaking raw unsafe content.
- FR-006/SC-004: No fresh GitHub call is required for packet assembly.
- FR-007/FR-011/FR-014: No migration, dashboard, route expansion, or SPEC-013/SPEC-014 capability was added.
- FR-012/SC-005: Local-only and partial-proof candidates cannot be presented as the proven pilot.
- SC-006: Future-state gaps are explicit deferrals with owning future specs.

## Verification

- `pnpm exec vitest run src/lib/__tests__/pilot-review-packet.test.ts src/lib/__tests__/pilot-review-packet-artifacts.test.ts src/app/api/dispositions/__tests__/rollup.test.ts`: 3 files, 20 tests passed.
- `pnpm exec vitest run src/lib/__tests__/task-artifacts-publish.test.ts src/app/api/task-artifacts/__tests__/admin-actions.test.ts`: 2 files, 38 tests passed.
- SPEC-009D UAT on 2026-05-20: disposable DB `/private/tmp/mc-spec009d-uat-20260520-uat1/mission-control.db` seeded stored issue #50 / PR #51 evidence; packet state `proven`, current stage `done`, 15 source-map pointers; real artifact store published JSON artifact `2` and Markdown artifact `3`; existing `/api/task-artifacts` routes returned both artifacts; cleanup removed seeded rows after backup.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed under Node 22 outside the sandbox.
- `pnpm test`: 277 files passed, 2907 tests passed, 33 files skipped, 3 tests skipped, 84 todo.
- `pnpm test:e2e`: 646 Playwright tests passed.
- `CI=true pnpm install --lockfile-only --frozen-lockfile --ignore-scripts`: passed.

## Rollback And Flags

- Rollback is standard git revert of the SPEC-009D packet module, tests, strict-scope entries, docs, and build-blocker fixes.
- No feature flag, migration rollback, data repair, or operator runtime migration is required.
- Packet artifact generation is additive and uses existing task artifact storage behavior.

## Reviewability Exception

- Split or exception rationale: transition exception. The gate counts generated SpecKit docs, the lockfile pin, and existing build-blocker repairs as multiple surfaces, but the implemented SPEC-009D feature surface remains the planned packet derivation module plus focused tests and evidence artifacts.

## Build Blocker Notes

- Final verification used Node 22.22.2, matching repo pins.
- Next was pinned to 16.1.6 to avoid the 16.2.6 prerender invariant encountered during production builds.
- Google font fetches were removed from `next/font/google` usage so production builds do not depend on external font downloads.
- Disposition rollup test reset helpers were moved out of a Next route module because route files cannot export arbitrary test helpers.
- `better-sqlite3` was rebuilt before the final clean standalone build so `.next/standalone` contains the native binding.
