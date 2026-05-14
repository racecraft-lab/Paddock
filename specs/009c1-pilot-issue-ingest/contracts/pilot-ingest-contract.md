# Contract: Pilot Issue Ingest And Eligibility

SPEC-009C1 adds no new production API contract. This contract defines the implementation-facing shapes for deterministic eligibility tests, the explicit operator smoke path, and the existing operator-triggered GitHub sync path.

## Candidate Input

```ts
type PilotIssueCandidate = {
  repository: "racecraft-lab/mission-control";
  issueNumber: number;
  title: string;
  state: "open" | "closed";
  isPullRequest: boolean;
  linkedPullRequest: boolean;
  labels: string[];
};
```

## Eligibility Result

```ts
type PilotEligibilityReason =
  | "wrong_repository"
  | "not_open_issue"
  | "missing_mc_inbox"
  | "missing_priority"
  | "missing_area"
  | "multiple_areas"
  | "area_not_routable"
  | "linked_pr"
  | "terminal_status"
  | "duplicate_synced_task";

type PilotEligibilityResult =
  | {
      eligible: true;
      repository: "racecraft-lab/mission-control";
      issueNumber: number;
      priorityLabels: string[];
      areaSlug: string;
      areaResolution: "single_match";
    }
  | {
      eligible: false;
      repository: string;
      issueNumber: number;
      reason: PilotEligibilityReason;
      evidence: Record<string, unknown>;
    };
```

## Sync Identity Proof

After existing GitHub ingest/sync runs, exactly one root task must match:

```sql
SELECT COUNT(*)
FROM tasks
WHERE github_repo = 'racecraft-lab/mission-control'
  AND github_issue_number = :issue_number
  AND github_synced_at IS NOT NULL
  AND parent_task_id IS NULL;
```

The required count is `1` before and after repeated sync for the same issue.

## Side-Effect Snapshot

The side-effect proof is a read-only snapshot over current schema surfaces:

```ts
type PilotSideEffectSnapshot = {
  childTaskCount: 0;
  hasTaskChainLineage: false;
  dispatchAttempts: 0;
  assignedTo: null;
  linkedRunCount: 0;
  linkedDispositionCount: 0;
  linkedArtifactCount: 0;
  dispatchPipelineRemediationActivityCount: 0;
  optionalFutureTableChecks: Array<{
    tableName: string;
    exists: boolean;
    matchingRows: number;
  }>;
};
```

Future claim, runner, or sandbox table checks must be guarded by table existence and must not require placeholder schema.

## Synthetic Fallback Contract

The operator smoke path must:

1. Search for an existing open issue titled `[mc-pilot] synthetic e2e issue`.
2. Return that issue when found.
3. Create a new issue only when explicit live-mutation opt-in is supplied.
4. Use labels `mc:inbox`, `priority:medium`, and `area:dev` for created fallback issues.
5. Never auto-close or auto-delete the issue.

Automated tests must mock this contract and must not call live GitHub fetch/create/edit/close paths.

## Existing Operator Sync Contract

SPEC-009C1 reuses the existing operator-triggered sync surface at `src/app/api/github/sync/route.ts`. The implementation may call or test the existing sync seam, but must not add:

- automatic polling startup
- cron lifecycle
- ownerless runtime discovery
- production evidence endpoint
- production eligibility UI
- triage/remediation execution
- claim, dispatch, runner, sandbox, harness, or auto-merge behavior
