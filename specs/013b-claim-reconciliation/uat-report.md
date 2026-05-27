# SPEC-013B Manual UAT Report

**Date**: 2026-05-27
**Replay type**: local/manual pre-merge UAT replay
**Branch**: `013b-claim-reconciliation`
**Worktree**: `/Users/fredrickgabelmann/.codex/worktrees/6b95/racecraft-mission-control/.worktrees/013b-claim-reconciliation`

## Scope

This replay validates the SPEC-013B claim/reconciliation user acceptance behavior against an isolated migrated SQLite database before PR merge. The target-environment post-merge HITL replay remains unavailable until PR #62 lands on `main`.

No UI journey was exercised because SPEC-013B introduced no primary UI. The UAT surface is claim admission, duplicate prevention, launch-handoff release evidence, negative autonomous-intake exclusion, and the read-only reconciliation evidence model.

## Command

The replay used a temporary Vitest harness that seeded a file-backed migrated database, called the production claim/release/read-model functions, printed the evidence packet below, and was removed after the successful run.

```bash
direnv exec . pnpm exec vitest run src/lib/__tests__/spec-013b-manual-uat.test.ts --reporter=verbose
```

Result: 1 test file passed, 1 test passed. Node runtime: v22.22.2 through `direnv exec .`.

## Evidence Packet

| Field | Value |
|-------|-------|
| `uat_replay_id` | `spec-013b-manual-uat-2026-05-27T22-24-30-806Z` |
| Feature flag state | `FEATURE_TASK_CONTROL_PLANE=true` through `workspaces.feature_flags` |
| `workspace_id` | `1` |
| `task_id` | `100` |
| `stage_key` | `dev_implementation` |
| GitHub repo | `racecraft-lab/mission-control` |
| GitHub issue number | `123` |
| Concurrent scheduler tick ids | `spec-013b-manual-uat-2026-05-27T22-24-30-806Z-scheduler-tick-a`, `spec-013b-manual-uat-2026-05-27T22-24-30-806Z-scheduler-tick-b` |
| Claim attempt count | `2` |
| Acquired claim id | `1` |
| Duplicate-prevented activity ids | `2` |
| Launch-handoff activity id | `3` |
| `task_stage_attempt_id` | `1` |
| Release activity id | `3` |
| Release reason | `launch_handoff_completed` |
| Released by run id | `spec-013b-manual-uat-2026-05-27T22-24-30-806Z-launch-handoff` |
| Final active-claim count | `0` |
| Read model schema version | `task_claim_reconciliation.v1` |
| Read model active claim | `null` |

## Source References

| Source | Row |
|--------|-----|
| Claim row | `task_stage_claims.id=1` |
| Attempt row | `task_stage_attempts.id=1` |
| Acquired activity row | `activities.id=1` |
| Duplicate-prevented activity row | `activities.id=2` |
| Release activity row | `activities.id=3` |

## Acceptance Results

| Check | Result | Evidence |
|-------|--------|----------|
| Workspace-scoped feature flag opt-in | Pass | `FEATURE_TASK_CONTROL_PLANE=true` only through workspace JSON |
| Issue-linked assigned task enters claim intake | Pass | Task `100`, repo `racecraft-lab/mission-control`, issue `123`, stage `dev_implementation` |
| Concurrent scheduler tick replay permits one active claim | Pass | First tick acquired claim `1`; second tick returned `duplicate_prevented` |
| Duplicate tick does not launch | Pass | One duplicate-prevented activity, one acquired claim, one launch-handoff release |
| Claim releases after launch handoff | Pass | Release reason `launch_handoff_completed`; final active-claim count `0` |
| Evidence visible through read model | Pass | `task_claim_reconciliation.v1`, released claim history, no active claim |
| Local-only tasks are excluded | Pass | `not_claimable`, reason `missing_github_repo`, zero claim rows |
| Repo-only tasks are excluded | Pass | `not_claimable`, reason `missing_github_issue_number`, zero claim rows |
| Non-`assigned` tasks are excluded | Pass | `not_claimable`, reason `not_assigned`, zero claim rows |

## Negative Intake Results

```json
{
  "local_only": {
    "outcome": "not_claimable",
    "stage_key": "dev_implementation",
    "active_claim_id": null,
    "task_stage_attempt_id": null,
    "reason": "missing_github_repo"
  },
  "repo_only": {
    "outcome": "not_claimable",
    "stage_key": "dev_implementation",
    "active_claim_id": null,
    "task_stage_attempt_id": null,
    "reason": "missing_github_issue_number"
  },
  "non_assigned": {
    "outcome": "not_claimable",
    "stage_key": "dev_implementation",
    "active_claim_id": null,
    "task_stage_attempt_id": null,
    "reason": "not_assigned"
  },
  "claim_rows_created_for_negative_cases": 0
}
```

## Remaining UAT Boundary

This report satisfies the manual pre-merge UAT replay requested on 2026-05-27. The workflow's post-merge HITL UAT checkbox should remain open until PR #62 is merged and the same replay is run against the target `main` environment.
