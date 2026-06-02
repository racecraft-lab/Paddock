# SPEC-013B Manual UAT Report

**Date**: 2026-05-27
**Replay type**: local/manual pre-merge UAT replay
**Branch**: `013b-claim-reconciliation`
**Worktree**: `/Users/fredrickgabelmann/.codex/worktrees/6b95/racecraft-paddock/.worktrees/013b-claim-reconciliation`

## Scope

This report records both the local pre-merge replay and the post-merge HAL target replay for SPEC-013B claim/reconciliation user acceptance behavior. PR #62 has now landed on `main`, and the target-environment HITL replay passed on HAL.

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
| GitHub repo | `racecraft-lab/Paddock` |
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
| Issue-linked assigned task enters claim intake | Pass | Task `100`, repo `racecraft-lab/Paddock`, issue `123`, stage `dev_implementation` |
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

## Post-Merge HAL Target UAT

**Date**: 2026-05-27
**Replay type**: target post-merge HITL UAT replay on HAL
**Merge commit**: `5e61d0ffc02f9345b265cd5420660d02bf693016`
**Live worktree**: `/home/fredrick-gabelmann/paddock`
**Live DB**: `/home/fredrick-gabelmann/paddock-data/paddock.db`
**Backup before UAT**: `/home/fredrick-gabelmann/paddock-data/backups/paddock.db.spec013b-target-uat-20260527-175012.bak`

The target replay used the existing Ideaverse Paddock deployment runbook. HAL pulled PR #62's merge commit, ran `pnpm install --frozen-lockfile`, rebuilt successfully, verified `.next/standalone/server.js`, restarted `paddock.service`, served `/login` with HTTP 200, kept `openclaw-gateway.service` active, and verified live DB migration markers `076_task_stage_attempts`, `077_github_sync_lifecycle`, and `078_task_stage_claims`.

The replay used a temporary Vitest harness copied to HAL, run with the service-compatible Node path, and removed after success:

```bash
SPEC013B_UAT_DB=/home/fredrick-gabelmann/paddock-data/paddock.db \
PATH=/usr/bin:/home/linuxbrew/.linuxbrew/bin:/usr/local/bin:/bin \
/home/linuxbrew/.linuxbrew/bin/pnpm --dir /home/fredrick-gabelmann/paddock \
  exec vitest run src/lib/__tests__/spec-013b-hal-uat.test.ts --reporter=verbose
```

Result: 1 test file passed, 1 test passed. Runtime: Node v24.15.0 / ABI 137, matching the HAL service-compatible `better-sqlite3` build.

## Post-Merge Evidence Packet

| Field | Value |
|-------|-------|
| `uat_replay_id` | `spec013b-hal-uat-2026-05-27T23-05-31-000Z` |
| Feature flag state | `FEATURE_TASK_CONTROL_PLANE=true` through a disposable `workspaces.feature_flags` row |
| Disposable `workspace_id` | `9` |
| Disposable `project_id` | `10` |
| Primary `task_id` | `44` |
| Primary `stage_key` | `spec013b-hal-uat-2026-05-27T23-05-31-000Z-dispatch` |
| GitHub repo | `racecraft-lab/Paddock` |
| Primary GitHub issue number | `62` |
| First scheduler tick outcome | `claim_acquired` |
| Second scheduler tick outcome | `duplicate_prevented` |
| Acquired claim id | `2` |
| `task_stage_attempt_id` | `2` |
| Launch-handoff release reason | `launch_handoff_completed` |
| Primary final active-claim count | `0` |
| Read model schema version | `task_claim_reconciliation.v1` |
| Read model active claim | `null` |
| Terminal release task id | `45` |
| Terminal release outcome | `terminal_reconciled` |
| Terminal release reason | `task_terminal_done` |
| Governance task id | `46` |
| Governance outcome | `governance_deferred` |
| Governance release reason | `governance_blocked` |
| Cleanup residue | `0` UAT workspaces and `0` UAT task metadata matches |

## Post-Merge Acceptance Results

| Check | Result | Evidence |
|-------|--------|----------|
| Target deployment promotion | Pass | HAL live worktree at `5e61d0ffc02f9345b265cd5420660d02bf693016`; standalone build exists; `/login` returned HTTP 200 |
| Workspace-scoped feature flag opt-in | Pass | `FEATURE_TASK_CONTROL_PLANE=true` only through disposable workspace JSON |
| Issue-linked assigned task enters claim intake | Pass | Task `44`, repo `racecraft-lab/Paddock`, issue `62` |
| Concurrent scheduler tick replay permits one active claim | Pass | First tick acquired claim `2`; second tick returned `duplicate_prevented` for the same claim |
| Duplicate tick does not launch | Pass | One active claim existed during the critical section; final active-claim count returned to `0` after handoff release |
| Claim releases after launch handoff | Pass | Release reason `launch_handoff_completed` |
| Terminal task state releases active work | Pass | Task `45` reconciled as `terminal_reconciled` with release reason `task_terminal_done` |
| Governance gate prevents launch | Pass | Task `46` returned `governance_deferred`, release reason `governance_blocked`, and no claim row |
| Evidence visible through read model | Pass | `task_claim_reconciliation.v1`, no active claim after release |
| Local-only tasks are excluded | Pass | `not_claimable`, reason `missing_github_repo`, zero claim rows |
| Repo-only tasks are excluded | Pass | `not_claimable`, reason `missing_github_issue_number`, zero claim rows |
| Non-`assigned` tasks are excluded | Pass | `not_claimable`, reason `not_assigned`, zero claim rows |
| Target cleanup | Pass | Temporary harness removed; HAL git status clean; live DB residue checks returned `0` |

## Target Operational Note

The HAL restart initially exposed a host-startup reliability issue before Paddock reached Next.js: the 1Password CLI secret-resolution step in `mc-start.sh` hit transient resolver/IPv6 errors for `team-gabelmann.1password.com`. The service later recovered and remained active for UAT. The Ideaverse HAL/1Password runbook check also showed `timedatectl` reporting `System clock synchronized: no` and inactive NTP, which is a known host risk for 1Password service-account authentication. That host NTP follow-up is outside SPEC-013B and did not block the recovered deployment or UAT replay.
