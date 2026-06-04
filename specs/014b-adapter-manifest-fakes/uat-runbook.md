# UAT Runbook: 014b-adapter-manifest-fakes

| Field | Value |
|-------|-------|
| Spec | 014b-adapter-manifest-fakes |
| Branch | 014b-adapter-manifest-fakes |
| PR | https://github.com/racecraft-lab/Paddock/pull/76 |
| Generated from | 2026-06-03T17:45:39Z |



## Env Setup

Run these from the repository root before walking the acceptance tests.

| Command | Value |
|---------|-------|
| BUILD | `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm exec next build --webpack` |
| TYPECHECK | `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm typecheck` |
| LINT | `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm lint` |
| LINT_FIX | N/A |
| UNIT_TEST | `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm test` |
| INTEGRATION_TEST | `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm exec playwright test tests/e2e/agents-runtime-inventory.spec.ts --project=chromium` |
| SINGLE_FILE_INTEGRATION | `tests/e2e/agents-runtime-inventory.spec.ts` |

## Per-Story Acceptance Tests

<a id="us-1"></a>
### User Story 1 - Review Declared Harness Capabilities (Priority: P1)

- [x] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-2"></a>
### User Story 2 - Distinguish Visibility From Eligibility (Priority: P1)

- [x] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-3"></a>
### User Story 3 - Fail Closed For Unsupported Capabilities And Policies (Priority: P1)

- [x] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-4"></a>
### User Story 4 - Inspect Runtime Inventory In The Existing Agents Surface (Priority: P2)

- [x] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-5"></a>
### User Story 5 - Preserve Existing Control-Plane Boundaries (Priority: P3)

- [x] Walk this story end to end and confirm the observable behavior the spec promises.



## FR Coverage Matrix

| Story | Acceptance test |
|-------|-----------------|
| [User Story 1 - Review Declared Harness Capabilities (Priority: P1)](#us-1) | see the Per-Story Acceptance Tests block above |
| [User Story 2 - Distinguish Visibility From Eligibility (Priority: P1)](#us-2) | see the Per-Story Acceptance Tests block above |
| [User Story 3 - Fail Closed For Unsupported Capabilities And Policies (Priority: P1)](#us-3) | see the Per-Story Acceptance Tests block above |
| [User Story 4 - Inspect Runtime Inventory In The Existing Agents Surface (Priority: P2)](#us-4) | see the Per-Story Acceptance Tests block above |
| [User Story 5 - Preserve Existing Control-Plane Boundaries (Priority: P3)](#us-5) | see the Per-Story Acceptance Tests block above |


## Negative-Path Tests


- `FEATURE_AGENT_RUNNER_SANDBOXES` is disabled globally or for the workspace.
- A fake manifest is visible but has no project-role assignment.
- A fake manifest is assigned to one project or role but not to the task's project role.
- The selected adapter supports launch but not resume, stop, transcript read, artifact publication, token/runtime accounting, MCP/tool exposure, skills, plugins, memory, approval, timeout, or user-input requirements.
- Governance denies autonomous work after the adapter is otherwise assigned.
- The task is local-only, missing a tracker link, terminal, not assigned, or otherwise ineligible for runner work.
- SPEC-014A sandbox lifecycle evidence is missing, disabled, cross-workspace, stale, or references an unsafe owner posture.
- Multiple fake manifests are visible and only one is explicitly selected for the evaluated task.
- Approval, timeout, or user-input policy declarations are unsupported, expired, malformed, or incompatible with the selected adapter.
- Fake evidence contains overlong summaries, raw transcript-like text, raw provider payloads, host paths, prompt bodies, token payloads, or secret-like values.
- A manifest omits a required top-level group, required capability key, or unsupported capability reason code.
- A manifest declares a real provider kind, account binding, credential exposure, prompt body, provider payload, or raw tool/MCP payload in v1.
- Manifest validation finds more issues than the response cap; diagnostics are truncated without exposing raw values.
- Existing OpenClaw gateway, session scanner, runtime detection, agent sync, or AgentRun inputs are absent, malformed, or stale.
- Runtime inventory is requested by a user without workspace access or by a read-only user.
- Runtime inventory is requested with both `workspace_id` and `workspace_scope=facility`, an unauthorized `workspace_id`, an unknown state filter, or an unknown requested capability.
- Runtime inventory is requested with multiple invalid top-level inputs, such as unauthenticated plus mixed scope, mixed scope plus invalid filters, or unauthorized scope plus malformed filters.
- Runtime inventory derivation encounters an unexpected internal failure after authorization.
- Runtime inventory is requested without `task_id`; the response may show visible, unassigned, assigned, or blocked inventory, but it cannot claim any adapter is eligible for work.
- Multiple evaluated gates fail for one entry; the response returns every failed reason code in deterministic precedence order.
- Browser UI is loaded while inventory entries change between visible, assigned, eligible, and blocked states.
- SPEC-014A lifecycle evidence is terminal, cleanup pending, cleaned up, rolled back, cleanup failed, owner-incompatible, task-mismatched, stage-mismatched, or absent.
- Duplicate fake manifest ids, missing required fake manifests, unknown v1 manifest ids, mismatched summary counts, duplicate runtime inventory entry ids, or cross-scope evidence appear during registry or inventory derivation.

## Self-Review Findings

- Tests executed: focused Vitest, guard, strict TypeScript, typecheck, lint, repo knowledge checks, full `pnpm test`, webpack build, and Playwright scaffold all ran in this session.
- Edge cases: negative-path coverage is concentrated in `validation.test.ts`, `runtime-inventory.test.ts`, `route.test.ts`, `RuntimeInventoryEvidence.test.tsx`, `agent-runtime-inventory.test.tsx`, and the UAT checklist above.
- Requirements matched: 82 / 82 tasks complete and 69 / 69 FRs are covered by the implemented contract/API/UI/guard/test surfaces.
- Follow-up: authenticated disposable workspace fixtures are still required before the skipped Playwright scaffold can become an active browser journey.

## Manual UAT Results - 2026-06-03

Manual UAT was performed against PR #76 on local branch `codex/pr-76-spec-014b-uat`, checked out from PR head `014b-adapter-manifest-fakes` at `06b8f143`.

### Findings Corrected During UAT

- `pnpm check:strict-scope` failed because the PR added `src/app/api/agents/runtime-inventory/route.test.ts` beside the route implementation, but the strict-scope allowlist only permitted `route.ts`. The allowlist now includes both files.
- The active `/agents` route renders `AgentSquadPanelPhase3`, while the PR had wired runtime inventory evidence into the inactive `AgentSquadPanel`. The active Phase 3 panel now fetches `/api/agents/runtime-inventory` with product-line scope, polls it with the existing smart-poll pattern, and renders `RuntimeInventoryEvidence` in the agent overview modal. A static regression assertion now covers this active-panel wiring.

### API Acceptance Evidence

The runtime inventory API was exercised against a disposable SQLite data directory with a seeded workspace, project, agents, task, project assignment, and SPEC-014A lifecycle row.

- Baseline scoped request returned `runtime_inventory.v1` with two entries: the external fake manifest as `unassigned` and the Paddock-owned fake manifest as `assigned`.
- `state=assigned` returned the assigned Paddock-owned entry.
- `task_id=100&project_id=10&role=builder&requested_capability=launch&manifest_id=paddock_owned_sandbox_fake` returned an eligible Paddock-owned entry with lifecycle evidence `7701:running`.
- The external fake manifest with `requested_capability=launch` failed closed with deterministic reasons including `adapter_unassigned`, `capability_unsupported`, and `sandbox_lifecycle_missing`.
- Invalid `requested_capability` and invalid `state` returned `422 runtime_inventory_error.v1`.
- Mixed facility and workspace scope returned `400 runtime_inventory_error.v1`.
- With `FEATURE_AGENT_RUNNER_SANDBOXES` disabled, the API returned `200 runtime_inventory.v1` and blocked entries with `feature_disabled` reasons.
- `/api/agents?workspace_id=1` preserved its existing shape and did not include a `runtime_inventory` field.
- Read-only derivation preserved seeded task, project assignment, and lifecycle row counts before and after the API matrix.

### Browser Acceptance Evidence

Manual browser UAT used a production build and a local authenticated session against the disposable data directory.

- `/agents` loaded with workspace scope after workspace hydration.
- The Paddock-owned fake agent detail modal displayed the runtime inventory evidence region.
- The evidence region showed `Feature flag: enabled`, `Manifest: paddock_owned_sandbox_fake`, and runtime state text.
- Desktop and mobile screenshots were reviewed locally; the evidence region was visible and did not overlap adjacent modal content.
- The evidence region exposed no runtime-control buttons, preserving SPEC-014B's read-only contract.

### Residual Notes

- The pure `visible` state remains covered by the read-model and component tests. In the migrated DB-backed route, manifests with assignment tables present but no matching assignment are represented as `unassigned`.
- Initial unscoped browser boot requests can return scope errors before workspace hydration. The scoped refresh path was verified after workspace hydration.
- One unrelated CSP inline-script warning and one seeded-agent files request warning appeared during browser UAT; neither blocked the runtime inventory API or evidence UI assertions.

## Post-Merge HAL Target UAT - 2026-06-04

Target UAT was performed against HAL after PR #76 merged and the live Paddock `main` worktree was fast-forwarded to `e7921a6f0e1e0a2a8042e9366be6a17beeb1e58b`.

### Deployment Evidence

- `git fetch origin main` succeeded after clearing stale fetch processes, and `git merge --ff-only origin/main` promoted HAL from `3ed79e26a19e6d78033ca0e13fdab01bb8aca01a` to `e7921a6f0e1e0a2a8042e9366be6a17beeb1e58b`.
- `pnpm install --frozen-lockfile` was a lockfile no-op with `better-sqlite3` postinstall ABI validation passing under the service Node runtime.
- `pnpm build` passed on HAL with the route manifest including `/api/agents/runtime-inventory`.
- `paddock.service` restarted successfully and logged database migrations applied; `/login` returned HTTP 200 and authenticated `/api/status` returned HTTP 200.
- `openclaw-gateway.service` remained active throughout the deployment and UAT.

### Runtime Inventory UAT Evidence

The disposable UAT marker was `SPEC-014B-HAL-UAT-20260604194737`. The probe seeded one temporary workspace, project, assigned task, project-agent assignment, and SPEC-014A lifecycle row in `/home/fredrick-gabelmann/paddock-data/paddock.db`, then exercised the live HTTP API at `http://127.0.0.1:3000`.

- Unauthenticated `GET /api/agents/runtime-inventory?workspace_id=<id>` returned HTTP 401.
- Mixed `workspace_id` plus `workspace_scope=facility` returned HTTP 400 `runtime_inventory_error.v1`.
- Authenticated scoped runtime inventory returned `runtime_inventory.v1` with two fake registry entries: `external_harness_fake` as `unassigned` and `paddock_owned_sandbox_fake` as `assigned`.
- The Paddock-owned fake manifest with `project_id`, `task_id`, `role=builder`, `requested_capability=launch`, and `manifest_id=paddock_owned_sandbox_fake` returned one `eligible` entry with a `running` sandbox lifecycle reference.
- The external fake manifest with the same task context returned one `blocked` entry with deterministic reasons `adapter_unassigned`, `capability_unsupported`, and `sandbox_lifecycle_missing`.
- Unknown `requested_capability=raw_shell` returned HTTP 422 `runtime_inventory_error.v1` with `capability_unsupported`.
- With `FEATURE_AGENT_RUNNER_SANDBOXES` disabled on the temporary workspace, both fake registry entries were blocked with `feature_disabled`.
- `/api/agents?workspace_id=<id>` returned HTTP 200 and preserved the existing response shape without embedding `runtime_inventory.v1`.
- Read-only runtime inventory derivation did not mutate seeded workspace, project, task, assignment, lifecycle, or lifecycle-event row counts.

### Cleanup Evidence

The UAT probe cleaned up all disposable rows. Remaining counts were zero for workspaces, projects, tasks, project-agent assignments, sandbox lifecycles, and sandbox lifecycle events matching `SPEC-014B-HAL-UAT-20260604194737`.

### Verification Commands

- `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm check:strict-scope`
- `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm exec vitest run src/lib/harness-adapters/__tests__/validation.test.ts src/lib/harness-adapters/__tests__/runtime-inventory.test.ts src/app/api/agents/runtime-inventory/route.test.ts src/components/agents/__tests__/RuntimeInventoryEvidence.test.tsx src/components/panels/__tests__/agent-runtime-inventory.test.tsx src/components/panels/product-line-panels.test.ts`
- `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm typecheck`
- `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm lint`
- `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm exec next build --webpack`
- `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm test`

## Sign-off

Advisory only — these checkboxes block nothing.

- [x] Reviewer walked every Per-Story Acceptance Test above.
- [x] Reviewer confirmed the Negative-Path Tests behave as described.
- [x] Reviewer is satisfied the PR delivers the behavior the spec promised.

## Rollback

git revert <SHA>; see plan.md for data-migration considerations
