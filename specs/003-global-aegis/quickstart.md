# Quickstart

## Verify the Plan

1. Work from the feature worktree:
   ```bash
   cd /Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/003-global-aegis
   ```
2. Confirm the plan artifacts exist:
   ```bash
   ls specs/003-global-aegis
   ```
3. Review the resolver contract and design notes:
   ```bash
   cat specs/003-global-aegis/research.md
   cat specs/003-global-aegis/data-model.md
   ```

## Planned Verification

1. Run resolver-focused Vitest coverage for `src/lib/aegis.ts`.
2. Run scheduler and task-route regression tests covering `runAegisReviews` and Aegis gate references.
3. Run project checks:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```
4. Run static guardrail checks. Each command must return no matches:
   ```bash
   rg -n 'process\.env\.FEATURE_GLOBAL_AEGIS' src --glob '!src/lib/feature-flags.ts'
   rg -n 'aegisAgentByWorkspace' src
   rg -n -U "FROM\s+agents[\s\S]{0,500}(LOWER\s*\(\s*name\s*\)\s*=\s*['\"]aegis['\"]|name\s*=\s*['\"]aegis['\"])" src --glob '!src/lib/aegis.ts'
   rg -n -U "(LOWER\s*\(\s*name\s*\)\s*=\s*['\"]aegis['\"][\s\S]{0,300}workspace_id|workspace_id[\s\S]{0,300}LOWER\s*\(\s*name\s*\)\s*=\s*['\"]aegis['\"])" src --glob '!src/lib/aegis.ts'
   rg -n 'quality_reviews\.agent_id' src tests
   git diff -U0 -- src tests \
     | rg -n '^\+.*(FEATURE_TASK_PIPELINES|ready_for_owner|FEATURE_AREA_LABEL_ROUTING|task_artifacts|resource_policy|PILOT_PRODUCT_LINE_A_E2E|product-line skill|session ownership|multi-facility|CrabTrap)'
   ```

## Implementation Reference Sweep

- `src/lib/task-dispatch.ts`: resolver dependency. `runAegisReviews()` now calls `getAegis(db, task.workspace_id)` and keeps `resolveGatewayAgentIdForReviewAgent()` as the gateway-routing adapter.
- `src/app/api/tasks/route.ts` and `src/app/api/tasks/[id]/route.ts`: review-gate dependencies only. Both keep `quality_reviews.reviewer='aegis'` approval checks and do not use `quality_reviews.agent_id`.
- `src/lib/validation.ts`: review payload default only. The `reviewer` default remains the display/gate string `aegis`; it does not resolve an Aegis agent row.
- `src/components/panels/task-board-panel.tsx`: display-only review state. It reads review rows with `reviewer === 'aegis'` for approval indicators and does not resolve agent metadata.
- `src/components/chat/chat-workspace.tsx`: display-only style mapping for `aegis`; no resolver behavior.
- `src/lib/scheduler.ts`: unaffected trigger surface. It continues to call `runAegisReviews()` and does not resolve Aegis directly.

## Implementation Verification Notes

- Archive Sweep startup evidence: SPEC-001, SPEC-002, and SPEC-002A are complete in `docs/ai/rc-factory-technical-roadmap.md`; SPEC-003 is in progress on `003-global-aegis`. Current-target `specs/003-global-aegis` was excluded from cleanup by inspection, and this implementation applied no archive cleanup, delete, or move.
- Focused RED evidence: `pnpm test src/lib/__tests__/aegis.test.ts src/lib/__tests__/feature-flags.test.ts src/lib/__tests__/feature-flags-route.test.ts src/lib/__tests__/task-dispatch.test.ts` failed before implementation with missing `@/lib/aegis`, `FEATURE_GLOBAL_AEGIS` registry status, route preflight, and scheduler resolver assertions.
- Focused GREEN evidence: the same command passed after implementation with 4 files and 35 tests passing.
- Focused route and validation evidence: `pnpm test src/lib/__tests__/aegis.test.ts src/lib/__tests__/task-dispatch.test.ts src/lib/__tests__/feature-flags.test.ts src/lib/__tests__/feature-flags-route.test.ts src/lib/__tests__/tasks-route-noop-update.test.ts src/lib/__tests__/validation.test.ts` passed with 6 files and 68 tests passing.
- Typecheck evidence: `pnpm typecheck` passed after implementation.
- Lint evidence: `pnpm lint` passed with 0 errors and 10 pre-existing warnings outside `src/lib/aegis.ts`.
- Full suite evidence: `pnpm test` still fails on unrelated baseline environment issues: 8 `src/lib/__tests__/gnap-sync.test.ts` tests cannot sign git commits because GPG agent access is blocked, and `src/lib/__tests__/mc-provisioner-daemon.test.ts` times out waiting for its test socket.
- Static guardrail evidence: all guardrail commands returned zero matches for inline `process.env.FEATURE_GLOBAL_AEGIS` reads outside `src/lib/feature-flags.ts`, `aegisAgentByWorkspace`, direct production Aegis agent lookup bypasses outside `src/lib/aegis.ts`, workspace-id-plus-Aegis-name lookup bypasses outside `src/lib/aegis.ts`, `quality_reviews.agent_id`, and newly added downstream drift terms.
- Strict-scope evidence: `rg -n 'src/lib/aegis\.ts' tsconfig.spec-strict.json eslint.config.mjs` found the new resolver in both strict-scope lists.
