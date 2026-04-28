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
   changed_files=$(git diff --name-only -- src tests)
   if [ -n "$changed_files" ]; then
     rg -n 'FEATURE_TASK_PIPELINES|ready_for_owner|FEATURE_AREA_LABEL_ROUTING|task_artifacts|resource_policy|PILOT_PRODUCT_LINE_A_E2E|product-line skill|session ownership|multi-facility|CrabTrap' $changed_files
   fi
   ```
