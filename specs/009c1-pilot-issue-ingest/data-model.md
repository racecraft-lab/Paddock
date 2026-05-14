# Data Model: GitHub Pilot Issue Ingest and Eligibility

## Entity: Pilot GitHub Issue

Source work item from `racecraft-lab/mission-control`.

**Fields**
- `repository`: must equal `racecraft-lab/mission-control`.
- `issueNumber`: GitHub issue number used for identity and duplicate checks.
- `title`: may equal `[mc-pilot] synthetic e2e issue` for the fallback path.
- `state`: must be open for pilot admission.
- `isPullRequest`: must be false.
- `linkedPullRequest`: must be absent for pilot admission.
- `labels`: source labels used for `mc:*`, `priority:*`, and `area:*` checks.
- `terminalStatus`: derived from issue state and conflicting status labels such as `mc:done` or `mc:failed`.
- `payloadIntegrity`: present only when repository, issue number, title, state, labels, issue-not-PR identity, and linked-PR evidence are all available.

**Validation Rules**
- Must match the pilot repository.
- Must be an open issue, not a PR.
- Must include `mc:inbox`.
- Must include at least one `priority:*` label.
- Must include exactly one routable `area:*` label.
- Must not have a linked PR or terminal/conflicting status label.
- Must not already have a synced Mission Control task for the same repository and issue number.
- Malformed or partial payloads fail before eligibility admission and are reported as data errors, not ineligible candidates.

## Entity: Eligibility Decision

Inspectable admission result for one candidate issue.

**Fields**
- `candidate`: repository and issue number.
- `eligible`: boolean admission result.
- `reason`: stable reason code for ineligible candidates.
- `error`: stable error code for malformed data, GitHub API failure, credential failure, or sync failure.
- `labels`: normalized label set used for decision evidence.
- `areaResolution`: `single_match` for eligible candidates; reject `no_label`, `multi_label`, `no_match`, and triage fallback outcomes.
- `duplicateTaskId`: existing task id when the candidate is rejected as already synced.

**Validation Rules**
- Eligible decisions must have no rejection reason and exactly one routable area match.
- Ineligible decisions must expose a reason for fixture and smoke evidence.
- Error decisions must be distinguishable from ineligible candidates, duplicate synced tasks, and successful no-ops.
- Decision logic must not depend on live GitHub-only behavior; fixtures must be able to exercise every branch.

## Entity: Pilot Root Task

Mission Control task projection created by GitHub ingest/sync for the admitted pilot issue.

**Existing Storage**
- `tasks.workspace_id`
- `tasks.github_repo`
- `tasks.github_issue_number`
- `tasks.github_synced_at`
- `tasks.parent_task_id`
- `tasks.dispatch_attempts`
- `tasks.assigned_to`
- task-chain lineage fields when present on the current schema

**Validation Rules**
- Exactly one row must exist for the pilot issue where:
  - `workspace_id` equals the Mission Control workspace under validation
  - `github_repo = 'racecraft-lab/mission-control'`
  - `github_issue_number` equals the pilot issue number
  - `github_synced_at IS NOT NULL`
  - `parent_task_id IS NULL`
- Re-running sync for the same issue must leave this count at one.
- The root proof does not require `root_task_id`, `chain_id`, or `chain_stage`.

**Side-Effect Absence Rules**
- No child `tasks` for the pilot task.
- No task-chain lineage on the pilot row.
- `dispatch_attempts = 0`.
- `assigned_to IS NULL`.
- Zero linked `runs`.
- Zero linked `task_dispositions`.
- Zero linked `task_artifacts`.
- No dispatch, pipeline, or remediation `activities`.
- Future claim, runner, or sandbox tables are checked only with table-if-exists guards.

## Entity: Synthetic Fallback Issue

Operator-controlled GitHub issue used only when no safe live candidate exists.

**Fields**
- `title`: `[mc-pilot] synthetic e2e issue`.
- `repository`: `racecraft-lab/mission-control`.
- `labels`: `mc:inbox`, `priority:medium`, `area:dev`.
- `state`: open.
- `createdBySmokePath`: true only when explicit live-mutation opt-in is supplied.

**Validation Rules**
- Search/reuse an existing open synthetic issue before creation.
- Creation requires explicit live-mutation opt-in.
- The script must not auto-close or auto-delete the issue.
- Existing fallback issues missing required labels fail closed with remediation instructions and are not auto-repaired.
- Missing credentials, insufficient permissions, or GitHub creation failure return redacted non-mutating errors and create no local pilot task.
- Cleanup instructions live in `docs/qa/pilot-smoke-checklist.md`.

## Entity: Pilot Smoke Evidence

Manual validation record maintained by the operator.

**Fields**
- Candidate query used.
- Issue URL and issue number.
- Whether existing or synthetic fallback was used.
- Sync trigger and timestamp.
- Pilot root task id and GitHub linkage proof.
- Duplicate prevention evidence after resync.
- Local-only exclusion evidence.
- Side-effect absence snapshot.
- Error or failure evidence for missing credentials, GitHub API failure, malformed issue payload, sync failure, or fallback label mismatch.
- Cleanup notes for any synthetic issue.

**Validation Rules**
- Evidence may be recorded in the checklist and command output.
- No production UI or evidence API is added in SPEC-009C1.
- Live GitHub mutation is manual/operator-only and excluded from automated CI.
- Error output must identify the failed operation and candidate without exposing token values, secret-like headers, or raw credential material.
- Checklist and script evidence must be reviewable without hidden terminal context and must not include raw terminal scrollback, environment dumps, token values, Authorization headers, API keys, GitHub credentials, raw credential material, credential-like values, or matched secret substrings.
- Evidence may include cleanup-safe identifiers such as repo slug, issue number or URL, task id, workspace id, timestamps, booleans such as `token_set`, operation names, stable error codes, counts, and content hashes.
