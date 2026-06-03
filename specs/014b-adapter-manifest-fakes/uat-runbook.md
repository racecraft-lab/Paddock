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

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-2"></a>
### User Story 2 - Distinguish Visibility From Eligibility (Priority: P1)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-3"></a>
### User Story 3 - Fail Closed For Unsupported Capabilities And Policies (Priority: P1)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-4"></a>
### User Story 4 - Inspect Runtime Inventory In The Existing Agents Surface (Priority: P2)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-5"></a>
### User Story 5 - Preserve Existing Control-Plane Boundaries (Priority: P3)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.



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

## Sign-off

Advisory only — these checkboxes block nothing.

- [ ] Reviewer walked every Per-Story Acceptance Test above.
- [ ] Reviewer confirmed the Negative-Path Tests behave as described.
- [ ] Reviewer is satisfied the PR delivers the behavior the spec promised.

## Rollback

git revert <SHA>; see plan.md for data-migration considerations
