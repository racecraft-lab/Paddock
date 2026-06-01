# Feature Flag Runbook

Paddock uses feature flags to ship partially complete capabilities safely
while keeping production behavior explicit, reversible, and reviewable. Flags are
server-evaluated through OpenFeature, stored per workspace, and managed by human
admins in the UI.

## Operating Policy

- Feature flags default to OFF unless the owning spec and roadmap explicitly
  document a different default.
- Human admins may change flags through **Settings > Feature Flags**.
- Agent and API-key identities may read flag state and run preflight checks, but
  they must not mutate production feature flags.
- Every production-impacting flag must document its operator impact, risk level,
  dependencies, and rollback path in the registry before it can be enabled.
- Do not update a PR, merge a PR, or open a follow-up PR with known UI journey
  bugs shown in Playwright, Storybook, or visual regression evidence.

## Current Implementation

- Flag registry: `src/lib/feature-flags.ts`
- Admin service: `src/lib/feature-flag-service.ts`
- Admin UI: `src/components/settings/feature-flags-section.tsx`
- Workspace storage: `workspaces.feature_flags` JSON
- Audit action: `feature_flag_update`
- OpenAPI paths:
  - `GET /api/feature-flags?workspace_id=<id>`
  - `POST /api/feature-flags/{key}/preflight`
  - `PATCH /api/feature-flags/{key}`

The current admin-managed flag is `FEATURE_WORKSPACE_SWITCHER`.

## `FEATURE_AREA_LABEL_ROUTING` Preflight Checklist

SPEC-006 introduces workspace-scoped GitHub sync routing. Before enabling
`FEATURE_AREA_LABEL_ROUTING` for a workspace, verify:

1. **At least one project has `area_slug` set.** Without any
   `projects.area_slug` configured for the workspace, no inbound issue
   can resolve as `single_match`; everything routes to triage or to the
   sync owner. Run:

   ```sql
   SELECT COUNT(*) FROM projects WHERE workspace_id = ? AND area_slug IS NOT NULL;
   ```

   Expect `>= 1`.

2. **Exactly one `is_repo_sync_owner=1` per `(workspace_id, github_repo)`
   group.** Migration M62 elects an initial owner deterministically, but
   projects added post-migration may not have ownership set. Run:

   ```sql
   SELECT github_repo, SUM(is_repo_sync_owner) AS owners
     FROM projects
     WHERE workspace_id = ? AND github_repo IS NOT NULL
     GROUP BY github_repo;
   ```

   Every row should have `owners = 1`. Zero-owner groups will not poll;
   double-owner groups violate the partial unique index (this should
   never happen — if observed, file a bug).

3. **A triage project is designated if ambiguous-issue routing is
   expected.** Without `is_triage_project=1` on any project,
   no-label / multi-label / no-match issues fall through to the sync
   owner via the `no_triage` path (FR-014). Confirm the operator
   intends that fallback. Run:

   ```sql
   SELECT id, slug FROM projects WHERE workspace_id = ? AND is_triage_project = 1;
   ```

   Expect 0 rows (intentional fallback) or exactly 1.

See `docs/github-sync.md` for the full sync behavior and rollback path.

## Safe Enable Procedure

1. Confirm the owning spec, task list, and roadmap entry identify the feature as
   ready for guarded rollout.
2. Open **Settings > Feature Flags** and select the intended workspace.
3. Review the flag card for risk, operator impact, dependencies, and evidence.
4. Run the preflight check from the UI before enabling.
5. Resolve all blockers. Treat warnings as review items that need an explicit
   acceptance reason.
6. Enable the flag and provide an operator reason when prompted.
7. Verify the affected user journey in the running app.
8. For PR review, confirm the workflow run includes relevant Storybook and
   Playwright visual regression reports before merge.

## Safe Disable And Rollback

1. Open **Settings > Feature Flags** for the affected workspace.
2. Disable the flag and record the rollback reason.
3. Verify the legacy or fallback journey still works.
4. Confirm a `feature_flag_update` audit entry was recorded.
5. If the UI cannot be used, set the corresponding environment variable to `0`
   and restart the deployment. Environment force-off takes precedence over
   workspace settings and locks the flag off in the UI.

Environment `FEATURE_* = 0` values force matching flags off. Environment
`FEATURE_* = 1` values do not generally force flags on; the only current
exception is `PILOT_MISSION_CONTROL_E2E`. Legacy `PILOT_PRODUCT_LINE_A_E2E`
references are compatibility drift and must not be persisted as a second
workspace pilot flag.

## API Usage

Use the API for read and preflight automation:

```bash
curl "http://localhost:3000/api/feature-flags?workspace_id=1"
curl -X POST "http://localhost:3000/api/feature-flags/FEATURE_WORKSPACE_SWITCHER/preflight" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":1}'
```

Flag writes require an authenticated admin browser session:

```json
{
  "workspace_id": 1,
  "value": true,
  "reason": "Enable guarded workspace switcher review for staging workspace"
}
```

Do not build agent automation that writes flags with API keys.

## Adding A New Flag

Before a new flag can ship:

1. Add the flag to `src/lib/feature-flags.ts` with default OFF behavior unless
   the constitution, PRD, and owning spec justify another default.
2. Declare scope, risk, operator impact, dependencies, and evidence metadata.
3. Add server-side tests for OpenFeature resolution, environment force-off, and
   workspace override behavior.
4. Add or update the admin UI story in Storybook.
5. Add Playwright coverage for the operator journey when the flag affects UI or
   user-visible behavior.
6. Ensure visual snapshots cover the affected Storybook states and
   Playwright journeys.
7. Update visual manifest gates when new screenshot domains or counts are added.
8. Update OpenAPI when request or response contracts change.
9. Update the PR description with the relevant visual report links and any
   manual operator verification notes.

## CI And Visual Review

- Storybook visual coverage runs through the Visual Storybook Snapshots workflow.
- User journey visual coverage runs through Playwright plus visual manifests.
- `reg-suit` publishes merged-main baselines to GitHub Pages so main can set
  the visual baseline without paid SaaS.
- Screenshots are review artifacts, not source artifacts. Do not commit generated
  screenshots unless a spec explicitly requires a tracked image asset.
- If screenshots show a defect, remediate the defect and rerun the visual checks
  before updating the PR.

## Production Notes

- Feature flags are workspace-scoped. Confirm the selected workspace before
  changing a flag.
- Use environment force-off only for emergency rollback or deployment-level
  safety controls.
- After a force-off rollback, remove the environment override only after the
  workspace setting and owning spec are reviewed.
- Keep flag names stable. Renaming a flag can strand stored workspace overrides
  unless a migration handles the old key.

## SPEC-008 Resource Governance Flags

SPEC-008 adds two flags. Both default OFF; both follow the
constitution's matrix-test convention.

### `FEATURE_RESOURCE_GOVERNANCE`

- **Scope**: workspace.
- **Risk**: high. Affects the synchronous admission path.
- **Dependencies (`enableRequires`)**: none at the registry level
  (the policy evaluator depends on schema readiness, not on other
  flags).
- **Activation**: workspace `feature_flags.FEATURE_RESOURCE_GOVERNANCE = true`.
- **Env override**:
  - `FEATURE_RESOURCE_GOVERNANCE='0'` forces OFF (emergency rollback).
  - `FEATURE_RESOURCE_GOVERNANCE='1'` does NOT force ON. Only the
    workspace JSON value can opt in. This is enforced by
    `resolveFlag` (FR-323).
- **OFF behavior (byte-compat per FR-305)**:
  - Cost Tracker renders without the Governance tab.
  - The legacy 3-row LIMIT for the cost summary is preserved.
  - The evaluator returns `allow:feature_flag_off` for every dispatch.
  - No governance JS is eagerly fetched.
- **ON behavior**:
  - Governance tab appears as the 4th tab in Cost Tracker.
  - Resource policy evaluator runs synchronously on every dispatch.
  - Diagnostic feed, System Health, Overrides, Budgets, Windows
    subviews are reachable.
- **Pre-flight**: confirm the workspace seed migrations M65a..m + M66
  ran clean; confirm `governance.json` parses; confirm the
  `resource_governance_breaker` row exists.
- **Rollback**: set the workspace flag to `false`, OR set
  `FEATURE_RESOURCE_GOVERNANCE='0'` in the deployment env.
- **Visual report**: every PR touching governance UI must reference a
  visual workflow report — see `docs/operator-guides/visual-baseline-approval.md`.

### `FEATURE_OPENCLAW_HEALTH_COSTS`

- **Scope**: workspace.
- **Risk**: medium. Adds the OpenClaw health adapter as a source.
- **Dependencies (`enableRequires`)**: `FEATURE_RESOURCE_GOVERNANCE`.
- **Env override**: same semantics as `FEATURE_RESOURCE_GOVERNANCE`.
- **OFF behavior**: System Health subview hides the OpenClaw card.
- **ON behavior**: OpenClaw health adapter is registered as a source
  (heartbeat, freshness, ingest pressure visible in System Health).
- **Pre-flight**: `FEATURE_RESOURCE_GOVERNANCE` must be ON first.

### Matrix coverage reference

Per Constitution V (NON-NEGOTIABLE) every flag is exercised by the
matrix harness:

- Harness: `src/lib/feature-flag-matrix.ts`.
- Integration test (9 unit + 9 integration scenarios): `tests/integration/feature-flag-matrix.test.ts`.
- E2E test (9 UI gating scenarios): `tests/e2e/feature-flag-matrix.e2e.ts`.
- Coverage assertion: `tests/integration/feature-flag-matrix-coverage.test.ts`.
- Env-leak guard: `scripts/spec-008/check-feature-flag-env-leak.mjs`.

Run all matrix tests with:

```bash
pnpm vitest run \
  tests/integration/feature-flag-matrix.test.ts \
  tests/integration/feature-flag-matrix-coverage.test.ts
```

The harness is the single source of truth for scenario semantics —
adding a new flag MUST update the registry **and** must continue to
pass the matrix integration test without changes.
