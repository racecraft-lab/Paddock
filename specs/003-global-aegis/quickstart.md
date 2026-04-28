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
