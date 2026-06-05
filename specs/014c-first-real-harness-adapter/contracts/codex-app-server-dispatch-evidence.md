# Contract: Dispatch And Evidence Integration

## Purpose

Define the narrow SPEC-014C integration seam between existing dispatch/claim/lifecycle behavior and the Codex app-server adapter.

## Dispatch Admission

The dispatch seam may invoke the adapter only when all are true:

- Workspace, task, stage, repository, assignment, and manifest identity match.
- Task is GitHub-linked.
- Stage is already assigned.
- Active claim id is current.
- Claim run id is current.
- Linked stage attempt id is current and nonterminal.
- Governance allows the stage and capability packet.
- Runtime inventory resolves the Codex app-server manifest.
- `FEATURE_TASK_CONTROL_PLANE` and `FEATURE_AGENT_RUNNER_SANDBOXES` are enabled for the workspace scope.
- SPEC-014A lifecycle is Paddock-owned and prepared/running.

If any condition fails, the seam records bounded blocked evidence and does not launch.

Blocked admission evidence uses one or more specific reason codes rather than a
generic ineligible label:

- `feature_disabled`
- `adapter_unassigned`
- `not_github_linked`
- `manifest_invalid`
- `manifest_mismatch`
- `missing_claim`
- `stale_claim`
- `missing_attempt`
- `governance_denied`
- `capability_unsupported`
- `sandbox_lifecycle_missing`
- `sandbox_lifecycle_not_paddock_owned`
- `sandbox_lifecycle_not_ready`
- `workspace_mismatch`
- `repository_mismatch`
- `authorization_denied`

Blocked-before-launch evidence may omit claim, attempt, manifest, claim-run,
or lifecycle ids when the failed admission check proves that the identifier is
unavailable or unsafe to assert. Launched and terminal adapter evidence must
include the current ownership, manifest, and lifecycle ids.

## Ownership Re-Proof Points

The adapter must re-prove ownership:

- Before launching the subprocess.
- Before same-run continuation.
- Before terminal run/attempt/failure evidence writes.
- Before claim release.
- Before lifecycle terminal marking when that write could affect current state.

If ownership changed, existing claim-control or stale recovery wins. The adapter may record bounded abandoned evidence only when it can do so without overwriting newer state.

## Evidence Write Ordering

Success:

```text
run launched
lifecycle running
protocol terminal success
safe artifact/evidence accepted
run completed/success
attempt succeeded
claim release launch_handoff_completed
lifecycle terminal
cleanup_pending
cleaned_up
```

Failure:

```text
run launched when applicable
lifecycle running when applicable
failure classified
safe failure evidence recorded
run failed or timeout
attempt failed
claim release dispatch_failed
lifecycle terminal
cleanup_pending
cleaned_up
```

Cleanup failure:

```text
terminal run/attempt/claim evidence preserved
cleanup_failed evidence appended
lifecycle left inspectable
```

Subprocess termination or cancellation failure after terminal classification:

```text
original terminal run/attempt/claim/reason evidence preserved
cleanup_failed evidence appended with phase=subprocess_termination
lifecycle remains inspectable for operator follow-up
```

## No-Mutation Guard

SPEC-014C adapter and dispatch integration files must not:

- Mark tasks terminal.
- Call direct GitHub mutation or outbound sync.
- Choose successors.
- Create tasks.
- Auto-merge.
- Mutate governance policy.
- Bypass Aegis/owner gates.
- Add OpenClaw-specific behavior.
- Add live intervention UI.
- Add transcript retention or replay/debug export behavior.

## Operator-Visible Evidence

Operators must be able to distinguish:

- Blocked before launch.
- Launched.
- Completed.
- Failed.
- Timed out.
- Unsafe evidence rejected.
- Binary unavailable.
- Malformed protocol.
- Unsupported user input.
- Unsupported approval/tool/file/capability.
- Abandoned by claim-control/stale recovery.
- Cleanup failed.

Evidence is descriptor-only and uses existing run, attempt, lifecycle, activity, usage, failure, and artifact-reference surfaces.

Activity evidence uses existing `activities` rows. Activity payloads must link
the relevant run id, task-stage attempt id, claim id, claim-run id, manifest id,
lifecycle id, artifact ids when present, phase, reason code, status, outcome,
safe diagnostic category, counts, safe hash/size, and created timestamp. Blocked
before launch activity payloads may omit unavailable ids only when the blocked
reason proves the id is unavailable or unsafe to assert.

Activity payloads must stay descriptor-only: no raw transcripts, protocol
payloads, prompt bodies, provider/tool/MCP payloads, command/file-change
details, raw reasoning, host paths, storage URIs, external URLs, original
filenames, secrets, or matched secret substrings.
