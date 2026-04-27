# Quickstart: SPEC-002 Product-Line Switcher and activeWorkspace Scoping

## Prerequisites

- Node.js 22+
- pnpm
- A checked-out `002-product-line-switcher` worktree

## Verify the Plan Artifacts

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

If the environment supports it, also run:

```bash
pnpm test:e2e
```

For SPEC-002 UI acceptance, run the real Product Line browser journey with
screenshot artifacts enabled:

```bash
pnpm test:e2e:spec-002
```

When Docker is available, run the same acceptance path against the repository's
production Docker build with deterministic seed data:

```bash
pnpm test:e2e:docker
```

The Docker runner builds the existing `Dockerfile`, boots disposable
containers, mounts temporary host data directories at `/app/.data`, validates a
clean flag-off regression phase, then seeds `FEATURE_WORKSPACE_SWITCHER`
through `workspaces.feature_flags` in the mounted SQLite database before running
the flag-on Product Line journey. Product Line workspaces/tasks are seeded
through the API.

## Feature-Flag Baseline Check

1. Run the app with `FEATURE_WORKSPACE_SWITCHER=0`.
2. Run `FEATURE_WORKSPACE_SWITCHER=0 pnpm test:all`.
3. Confirm the existing single-workspace behavior remains unchanged.
4. Confirm the pre-SPEC-002 baseline counts recorded in the workflow evidence are not reduced or skipped: 996 Vitest tests and 514 Playwright tests. The current implementation pass increased the verified counts to 1037 Vitest tests and 526 Playwright tests.
5. Confirm no Playwright snapshot files are updated and no snapshot update command is required.
6. Confirm no new switcher behavior appears in the header.

## Flag-On Scope Check

1. Seed `workspaces.feature_flags` for the authenticated workspace context.
2. Confirm the switcher renders exactly one synthetic Facility option.
3. Select Facility and a Product Line workspace.
4. Confirm REST, SSE, URL scope, and cross-tab state follow the selected scope.
5. With Facility selected, keep existing baseline assertions unchanged and add only SPEC-002 tests for Facility aggregate semantics.

## UX and Accessibility Check

1. Confirm Facility and selected Product Line states are visually distinct without adding explanatory header or chrome copy.
2. Confirm 320 px, 375 px, and 390 px header checks preserve the compact trigger, search, notifications, language, theme, and account controls with long Product Line names truncated.
3. Confirm listbox semantics cover selected state, `aria-selected`, roving focus or `aria-activedescendant`, Arrow/Home/End navigation, Enter/Space selection, Escape/outside-click close, and trigger focus return.
4. Confirm loading and empty states are non-focusable `role="status"` content, while workspace-list failure, unauthorized-selection, and error states are non-focusable `role="alert"` content outside the selectable option set.
5. Confirm mode-sensitive panels and Facility/global surfaces match the Panel Taxonomy in `spec.md`.

## Screenshot Review and Defect Gate

1. Confirm `tests/product-line-switcher-ui.spec.ts` attaches screenshots for Facility task-board state, scope menu options, selected Product Line task-board state, Facility aggregate return, keyboard listbox focus, 320/375/390 px mobile menus, and cross-tab Product Line sync.
2. Confirm `pnpm test:visual:storybook` covers the focused SPEC-002 component and shell states through Storybook + Argos: switcher default/menu/loading/error states, desktop header integration, 320/375/390 px mobile scope menus, Facility task-board shell, and selected Product Line task-board shell.
3. Confirm the Docker-backed SPEC-002 Playwright workflow uploads named journey screenshots and traces through the Argos Playwright reporter on pull requests and `main` pushes so Argos visual builds contain the real user journey evidence, not only the Storybook component snapshots.
4. Confirm `pnpm test:e2e:argos-metadata` passes after the Docker-backed run. It must find the expected Argos `.argos.json` screenshot metadata, Playwright test identity/source locations, and `@spec-002` test tags so Argos Tests can derive SPEC-002 test rows from accepted reference builds.
5. Confirm `pnpm test:visual:argos-metadata` passes after the Storybook visual run. It must find the expected Argos Storybook `.argos.json` screenshot metadata, SPEC-002 story ids, source locations, and `spec-002` / `visual` story tags.
6. Confirm the clean flag-off regression run does not upload an empty Argos build; only the seeded visual Product Line journey should upload SPEC-002 Playwright screenshots.
7. Confirm both Argos workflows export `ARGOS_TOKEN` and `GITHUB_TOKEN` on CI so uploaded builds can link to GitHub PR metadata.
8. Confirm Storybook visual coverage follows the Argos Storybook Vitest path, which Argos recommends over Storybook Test Runner when the project already uses Storybook v8+ Vitest integration.
9. Review screenshots through the Argos Storybook build, Argos Playwright visual build, and GitHub Actions artifacts before updating the PR branch. Local generated screenshots live under ignored `screenshots/` or `test-results/` paths and must not be committed by default.
10. Treat an empty Argos `Tests` tab after accepted `main` reference builds as a release-blocking observability defect for UI specs that use Argos. PR builds still use Argos `Builds`, PR checks/comments, and GitHub Actions artifacts for first-review evidence.
11. If e2e output, Storybook visual output, Argos diffs, Argos build evidence, or screenshots show a user-visible defect, clipped or overlapping controls, wrong seeded data, inaccessible controls, or a broken Product Line journey, remediate the defect and rerun the relevant command before pushing.
12. Do not update or mark the PR ready with known UI user journey bugs.

Argos documentation crawl checkpoints:

- [Playwright SDK](https://argos-ci.com/docs/playwright): use the reporter plus `argosScreenshot`; traces/failure screenshots upload through the reporter; Playwright test tags are captured in screenshot metadata.
- [Storybook SDK](https://argos-ci.com/docs/storybook) and [Storybook Quickstart](https://argos-ci.com/docs/quickstart/storybook): prefer Storybook Vitest for this repo; Storybook story tags identify SPEC-002 visual coverage; the [Storybook Test Runner quickstart](https://argos-ci.com/docs/quickstart/storybook-test-runner) is for projects using Test Runner instead of Vitest.
- [Baseline build](https://argos-ci.com/docs/baseline-build): same build name plus accepted/orphan/reference-branch history drives comparison baseline selection.
- [Tests Dashboard](https://argos-ci.com/docs/tests-dashboard): this is a project-level reliability/flakiness dashboard over auto-approved/reference build history and must contain SPEC-002 rows after accepted `main` history exists.
- [GitHub integration](https://argos-ci.com/docs/github), [build splitting](https://argos-ci.com/docs/build-splitting), [subset builds](https://argos-ci.com/docs/subset-builds), [responsive viewports](https://argos-ci.com/docs/viewports), and [screenshot metadata](https://argos-ci.com/docs/screenshot-metadata) were checked for SPEC-002 workflow fit.

## State-Management Check

1. Confirm only the Product Line scope slice is persisted under `mc:active-workspace:v1`.
2. Confirm malformed, wrong-version, wrong-tenant, unauthorized, and real `facility` row persisted Product Line values are cleared after `/api/workspaces` validation before scoped data renders.
3. Confirm `activeTenant` changes clear Product Line scope and do not reuse a previous tenant's persisted Product Line value.
4. Confirm BroadcastChannel messages include tenant and user/session guards, reject stale versions, and converge within 1 second when available.
5. Confirm BroadcastChannel unavailable fallback is non-crashing and relies on reload or the next supported initialization path for other-tab convergence.
6. Confirm stale in-flight responses and optimistic mutation completions are ignored when their captured `scopeKey` no longer matches the active scope.

## Static Guardrail Checks

Feature flag reads must stay behind `resolveFlag()`:

```bash
if rg -n 'process\.env\.FEATURE_[A-Z0-9_]+' src --glob '!src/lib/feature-flags.ts'; then
  echo "Inline FEATURE_* env read found outside resolveFlag()" >&2
  exit 1
fi
```

When gateway-facing code is touched, run the grep against the touched gateway-facing files and treat matches as failures unless each match is in a documented resolver/adapter path with an SC-15/V2-001 reference:

```bash
rg -n 'OPENCLAW_GATEWAY_|config\.gatewayHost|config\.gatewayPort|gateways\.is_primary' <touched-gateway-facing-files>
```

Header tenant/facility context must not be visibly labeled "Workspace":

```bash
rg -n 'Workspace' src/components/layout/header-bar.tsx messages/en.json
```

The only allowed header match is the internal `WorkspaceSwitcher` component symbol. Other `messages/en.json` workspace strings belong to unrelated admin, boot, docs, or provisioning surfaces and are not tenant-context header copy.

## SPEC-002-Only Test Boundary

- New tests cover feature-flag resolution, Facility/Product Line scope, switcher behavior, REST/SSE scoping, cache/URL ownership, state invalidation, and BroadcastChannel behavior.
- New tests must not assert downstream Aegis ownership, task pipeline behavior, `ready_for_owner`, area labels, artifacts, governance, Product Line skill ownership, session/transcript mapping, tenant-routed gateway selection, or multi-facility tenant modeling.

## Notes

- Facility means aggregate tenant scope, not the real `facility` workspace row.
- Use `setActiveProductLine(productLine | null, options)` for all scope transitions in implementation work.

## Implementation Verification Evidence

Recorded on 2026-04-26 and updated on 2026-04-27 from worktree `.worktrees/002-product-line-switcher` on branch `002-product-line-switcher`:

- `pnpm typecheck` passed.
- `pnpm build` passed and generated the standalone App Router bundle used by E2E.
- `pnpm test` passed: 108 files, 1043 tests.
- `pnpm lint` passed with 0 errors and 11 pre-existing warnings.
- `pnpm exec playwright test tests/product-line-scope-api.spec.ts` passed: 2 tests.
- `pnpm exec playwright test tests/injection-guard-endpoints.spec.ts tests/limit-caps.spec.ts` passed after remediation: 15 tests.
- `pnpm test:e2e` passed after remediation: 526 tests.
- `pnpm test:e2e:spec-002` passed 10 focused SPEC-002 tests with screenshot capture enabled.
- `pnpm test:e2e:docker` passed against the production Docker build: 1 clean flag-off regression test and 9 seeded flag-on Product Line tests.
- Screenshot artifacts were generated under `test-results/spec-002-screenshots/` and reviewed after initial remediation; no known visible UI user journey defects remain. Follow-up Storybook + Argos coverage replaces the committed PNG review copy for component and shell visual states.
- `rg -n 'process\.env\.FEATURE_[A-Z0-9_]+' src --glob '!src/lib/feature-flags.ts'` returned no matches.

Traceability notes:

- SC-003 and P1-AC6 map to `src/store/index.ts` guarded `BroadcastChannel` handling, persisted `scopeVersion`, scope-change invalidation, and real cross-tab UI coverage in `tests/product-line-switcher-ui.spec.ts`.
- SC-014 and P1-AC14 map to `scopeKey` helpers in `src/types/product-line.ts`, the store scope slice, and scoped URL/request calls through `appendScopeToPath`.
- SC-15/V2-001 and P1-AC16 remain deferred: SPEC-002 does not add tenant-routed gateway selection or multi-facility runtime modeling.
- SC-016 and P1-AC14/P1-AC15 map to `setActiveProductLine(productLine | null, options)`, persisted-scope validation after `/api/workspaces`, and panel/API request scoping.
- SC-018 maps to `tests/product-line-switcher-ui.spec.ts`, `src/components/layout/spec-002-visual.stories.tsx`, `scripts/verify-argos-test-metadata.mjs`, `scripts/verify-argos-storybook-metadata.mjs`, `scripts/e2e-docker.sh`, `.github/workflows/spec-002-ui-e2e.yml`, and `.github/workflows/argos-storybook.yml`.
- P1-AC12 through P1-AC16 are documented in `spec.md`, `plan.md`, this quickstart, and the workflow ledger; generated standalone browser/component coverage tasks that were not separately implemented remain unchecked in `tasks.md`.
