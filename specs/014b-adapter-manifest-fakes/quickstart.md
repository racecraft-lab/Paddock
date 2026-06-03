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

4. Verify the UI shows state badges, selected manifest, eligibility reasons, lifecycle references, and sanitized fake evidence.
5. Verify no launch, assignment, retry, release, cancel, debug, lifecycle-control, scheduler, GitHub, governance, successor-selection, or auto-merge controls are rendered.

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
