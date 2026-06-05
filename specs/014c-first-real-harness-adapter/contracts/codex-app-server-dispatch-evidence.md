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
