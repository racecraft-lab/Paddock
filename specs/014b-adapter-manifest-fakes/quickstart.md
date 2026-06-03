# Quickstart: SPEC-014B - Harness Adapter Manifest and Fake Registry

## Setup

1. Install dependencies if needed:

   ```bash
   pnpm install
   ```

2. Run the focused verification loop while implementing:

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```

3. Run the final build and browser proof before UAT closeout:

   ```bash
   pnpm build
   pnpm test:e2e
   ```

## Flag-Off Verification

1. Ensure `FEATURE_AGENT_RUNNER_SANDBOXES` is not enabled for the workspace.
2. Query:

   ```bash
   curl -sS "http://127.0.0.1:3000/api/agents/runtime-inventory?workspace_id=1"
   ```

3. Verify:

   - Response schema is `runtime_inventory.v1`.
   - Entries are absent or blocked with `feature_disabled`.
   - `/api/agents` remains response-compatible and does not embed runtime inventory by default.
   - No launch, assignment, retry, release, cancel, lifecycle, scheduler, GitHub, governance, tracker, successor, or auto-merge mutation occurs.

## Fake Registry Verification

1. Run the manifest validator tests.
2. Confirm both checked-in fake manifests validate:

   - `paddock_owned_sandbox_fake`
   - `external_harness_fake`

3. Confirm malformed fixtures fail with `harness_manifest_validation.v1` field-level metadata and no raw values.
4. Confirm duplicate manifest ids, missing required fake manifests, and unknown v1 manifest ids fail closed before eligibility.

## Runtime Inventory Verification

1. Seed or use deterministic fixtures for:

   - Visible fake manifest
   - Unassigned fake manifest
   - Assigned fake manifest
   - Eligible fake manifest with caller-visible `task_id`
   - Blocked fake manifest

2. Query the route with only authorized filters:

   ```bash
   curl -sS "http://127.0.0.1:3000/api/agents/runtime-inventory?workspace_id=1&task_id=<task_id>&requested_capability=launch"
   ```

3. Verify all five states appear across tests/UAT:

   - `visible`
   - `unassigned`
   - `assigned`
   - `eligible`
   - `blocked`

4. Verify `eligible` appears only when `task_id` is present and every gate passes.
5. Verify entry ids are unique, response order is deterministic, `summary.total` equals `entries.length`, and every per-state summary count matches the returned entries.
6. Verify stale lifecycle evidence, cross-workspace task/project/assignment evidence, malformed governance evidence, or unauthorized scope evidence cannot produce `eligible`.
7. Verify SPEC-014A lifecycle evidence supports eligibility only for same-workspace, same-task, same-stage, caller-visible, owner-compatible `created`, `prepared`, or `running` statuses; terminal, cleanup-pending, cleaned-up, rolled-back, cleanup-failed, owner-mismatched, task-mismatched, stage-mismatched, unauthorized, and absent lifecycle evidence must not produce `eligible`.

## Runtime Inventory API Contract Verification

1. Verify unauthenticated access fails before inventory derivation:

   ```bash
   curl -i "http://127.0.0.1:3000/api/agents/runtime-inventory?workspace_id=1"
   ```

   Expected: `401` with `runtime_inventory_error.v1`, the repository's standard bearer challenge when the bearer-auth path applies, and no `entries`.

2. Verify a read-only authenticated caller can read authorized inventory:

   ```bash
   curl -sS -H "Authorization: Bearer <viewer-or-higher-token>" \
     "http://127.0.0.1:3000/api/agents/runtime-inventory?workspace_id=1"
   ```

   Expected: `200`, `schema_version: "runtime_inventory.v1"`, and only caller-visible entries.

3. Verify `role` uses project-agent assignment role evidence:

   ```bash
   curl -sS -H "Authorization: Bearer <token>" \
     "http://127.0.0.1:3000/api/agents/runtime-inventory?workspace_id=1&project_id=<project_id>&role=<project_agent_assignments.role>"
   ```

   Expected: returned entries are limited to the exact caller-visible assignment role.

4. Verify unauthorized workspace, project, and task filters fail before inventory derivation:

   ```bash
   curl -i -H "Authorization: Bearer <token>" \
     "http://127.0.0.1:3000/api/agents/runtime-inventory?workspace_id=<unauthorized-workspace-id>&project_id=<unauthorized-project-id>&task_id=<unauthorized-task-id>"
   ```

   Expected: `403`, `runtime_inventory_error.v1`, bounded `authorization_denied` metadata, no indication of whether the supplied ids exist outside caller-visible scope, and no `entries`.

5. Verify an unknown but syntactically valid assignment role fails closed:

   ```bash
   curl -i -H "Authorization: Bearer <token>" \
     "http://127.0.0.1:3000/api/agents/runtime-inventory?workspace_id=1&role=missing-runtime-role"
   ```

   Expected: `422`, `runtime_inventory_error.v1`, bounded `invalid_filter` metadata, and no `entries`.

6. Verify every `requested_capability` example uses the closed v1 vocabulary:

   ```bash
   curl -sS -H "Authorization: Bearer <token>" \
     "http://127.0.0.1:3000/api/agents/runtime-inventory?workspace_id=1&task_id=<task_id>&requested_capability=artifact_publication"
   ```

   Expected: `200`, and each evaluated entry reports capability-resolution evidence for `artifact_publication`.

7. Verify an unknown capability fails closed:

   ```bash
   curl -i -H "Authorization: Bearer <token>" \
     "http://127.0.0.1:3000/api/agents/runtime-inventory?workspace_id=1&requested_capability=real_provider_launch"
   ```

   Expected: `422`, `runtime_inventory_error.v1`, `reason_code: "capability_unsupported"`, and no `entries`.

8. Verify `/api/agents` compatibility:

   ```bash
   curl -sS -H "Authorization: Bearer <token>" "http://127.0.0.1:3000/api/agents?workspace_id=1"
   curl -sS -H "Authorization: Bearer <token>" "http://127.0.0.1:3000/api/agents/runtime-inventory?workspace_id=1"
   ```

   Expected: `/api/agents` retains its existing agent-list response shape and does not embed runtime inventory by default; `/api/agents/runtime-inventory` returns `runtime_inventory.v1`.

9. Verify request-level error precedence:

   ```bash
   curl -i "http://127.0.0.1:3000/api/agents/runtime-inventory?workspace_id=1&workspace_scope=facility&requested_capability=unknown"
   ```

   Expected: unauthenticated `401` takes precedence. With authentication added, mixed scope returns `400` before the unknown capability can return `422`; unauthorized scope returns `403` before malformed or unknown filters. No request-level error includes partial `entries`.

10. Verify unexpected runtime inventory failures are bounded through a controlled test double:

   Expected: `500`, `runtime_inventory_error.v1`, `error: "runtime_inventory_unavailable"`, no stack trace, SQL text, raw manifest value, host path, provider payload, token, secret-like value, or `entries`.

## Unsupported Capability And Policy Verification

1. Request a capability unsupported by the selected fake manifest.
2. Verify the entry is `blocked` with `capability_unsupported`.
3. Request unsupported approval and user-input requirements.
4. Verify policy-specific reason codes:

   - `approval_unsupported`
   - `user_input_unsupported`

5. Request an expired or unsupported timeout budget.
6. Verify `timeout_budget_expired`.
7. Confirm no fallback adapter is selected and no task, claim, lifecycle, governance, GitHub, scheduler, tracker, successor, or auto-merge state changes.

## Sanitized Evidence Verification

1. Provide accepted fake evidence kinds:

   - `synthetic_summary`
   - `counter`
   - `event_ref`
   - `lifecycle_ref`
   - `manifest_ref`
   - `capability_resolution_ref`
   - `fake_artifact_descriptor`

2. Confirm accepted evidence appears in API and Agents UI.
3. Provide unsafe evidence containing raw transcript-like text, provider payload, host path, prompt body, token payload, auth material, secret-like value, raw external event payload, raw tool/MCP payload, unsafe URI, or artifact content.
4. Verify the entry is `blocked` with `sanitized_evidence_rejected`, the unsafe object is omitted, and only bounded field-path/evidence-kind/reason metadata appears.
5. Verify text-bearing evidence and diagnostics are plain text only, reject secret-shaped values before exposure, and are not rendered as raw HTML or Markdown in API, UI, logs, tests, review packets, or artifacts.

## Agents UI UAT

1. Start the app with deterministic data.
2. Open the existing Agents surface in a real browser.
3. Capture screenshot evidence for:

   - Feature flag off
   - Visible
   - Unassigned
   - Assigned
   - Eligible
   - Blocked
   - Unsupported capability
   - Sanitized evidence rejection
   - Loading, empty, invalid-filter, unauthorized, stale-lifecycle, and truncated-diagnostics states
   - Mobile and desktop responsive layouts

4. Verify the UI shows state badges, selected manifest, eligibility reasons, lifecycle references, and sanitized fake evidence.
5. Verify every runtime inventory state and reason uses visible text labels, not color or icons alone.
6. Verify keyboard focus traversal and screen-reader labels distinguish existing Agents controls from SPEC-014B read-only evidence.
7. Verify background refresh does not promote entries to `eligible` client-side and removes stale eligible labels when the latest authorized `runtime_inventory.v1` response lacks required gates.
8. Verify no launch, assignment, retry, release, cancel, debug, lifecycle-control, scheduler, GitHub, governance, successor-selection, or auto-merge controls are rendered.

## Static Scope Guards

Run the SPEC-014B guard script and full local checks:

```bash
node scripts/spec-014b/check-harness-adapter-scope.mjs
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

The guard must prove SPEC-014B introduces no real Codex, Claude, OpenClaw, Hermes, OpenCode, gateway, external process, scheduler dispatch, migration, claim-control mutation, retry semantic change, lifecycle-control mutation, successor selection, governance mutation, GitHub mutation, or auto-merge path.
