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

type PilotOperatorError =
  | "missing_credentials"
  | "insufficient_permissions"
  | "github_api_failure"
  | "malformed_issue_payload"
  | "synthetic_issue_label_mismatch"
  | "synthetic_issue_create_failed"
  | "sync_failed";
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
    }
  | {
      eligible: false;
      error: PilotOperatorError;
      operation: "candidate_selection" | "synthetic_fallback" | "operator_sync";
      evidence: Record<string, unknown>;
    };
```

Malformed or partial issue payloads must produce `error: "malformed_issue_payload"` before eligibility admission. They are not counted as ineligible candidates, duplicate synced tasks, or successful no-ops.

## Sync Identity Proof

After existing GitHub ingest/sync runs, exactly one root task must match:

```sql
SELECT COUNT(*)
FROM tasks
WHERE workspace_id = :workspace_id
  AND github_repo = 'racecraft-lab/mission-control'
  AND github_issue_number = :issue_number
  AND github_synced_at IS NOT NULL
  AND parent_task_id IS NULL;
```

The required count is `1` before and after repeated sync for the same workspace, repository, and issue identity.

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
5. Never auto-close or auto-delete the issue from the script, app runtime, CI,
   or sync path; manual after-evidence cleanup belongs to
   `docs/qa/pilot-smoke-checklist.md`.
6. Fail closed when an existing fallback issue lacks any required label; do not admit or auto-repair it.
7. Return a redacted non-mutating error when credentials are missing, permissions are insufficient, or GitHub issue creation fails.

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

Operator-triggered sync failures must be surfaced as `error: "sync_failed"` evidence and must not be treated as an ineligible candidate, duplicate synced task, or successful idempotent no-op. Error output must identify the failed operation and candidate while omitting token values, secret-like headers, and raw credential material.

Checklist and script evidence must be reviewable without hidden terminal context. It must omit raw terminal scrollback, environment dumps, token values, Authorization headers, API keys, GitHub credentials, raw credential material, credential-like values, and matched secret substrings. It may include cleanup-safe identifiers such as repo slug, issue number or URL, task id, workspace id, timestamps, `token_set` booleans, operation names, stable error codes, counts, and content hashes.
