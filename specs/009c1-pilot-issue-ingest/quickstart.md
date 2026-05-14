# Quickstart: GitHub Pilot Issue Ingest and Eligibility

## Automated Verification Path

1. Install dependencies with the repo package manager:

   ```bash
   pnpm install
   ```

2. Run the focused SPEC-009C1 test files after implementation:

   ```bash
   pnpm test -- pilot-issue
   ```

3. Run the required project checks before review:

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm build
   ```

4. Run Playwright only if implementation changes an existing UI or smoke checklist path that requires browser coverage:

   ```bash
   pnpm test:e2e
   ```

## Fixture Expectations

Automated tests must cover these cases without live GitHub access:

- Eligible `racecraft-lab/mission-control` issue with `mc:inbox`, at least one `priority:*`, exactly one routable `area:*`, no linked PR, no terminal state, and no duplicate synced task.
- Missing `mc:inbox`.
- Missing every `priority:*` label.
- Zero routable `area:*` labels.
- Multiple routable `area:*` labels.
- Wrong repository.
- Linked PR.
- Terminal issue state or conflicting terminal/status label.
- Existing synced task for the same GitHub repository and issue number.
- Repeated sync for the same eligible issue remains idempotent.
- Local-only task does not satisfy pilot source-of-truth evidence.
- Synthetic fallback find/create behavior uses a mocked GitHub client and never mutates live GitHub in CI.
- Existing synthetic fallback issue lacks a required label and fails closed without auto-repair.
- Synthetic fallback creation is denied by missing opt-in, missing credentials, insufficient permission, or mocked GitHub creation failure.
- Operator-triggered sync failure is distinct from ineligible candidate, duplicate synced task, and successful no-op outcomes.
- Malformed or partial issue payloads fail before eligibility admission.

## Manual Live Smoke Path

Manual smoke is operator-controlled and should be captured in `docs/qa/pilot-smoke-checklist.md` after implementation.

Evidence recorded in the checklist or script output must be reviewable without
hidden terminal context. Do not paste raw terminal scrollback, environment
dumps, token values, Authorization headers, API keys, GitHub credentials, raw
credential material, credential-like values, or matched secret substrings.
Record cleanup-safe identifiers instead: repo slug, issue number or URL, task
id, workspace id, timestamps, `token_set` booleans, operation names, stable
error codes, counts, and content hashes.

1. Select a candidate with:

   ```text
   repo:racecraft-lab/mission-control is:issue is:open label:"mc:inbox" -linked:pr
   ```

2. If no safe candidate exists, use the explicit smoke script path to find an existing open `[mc-pilot] synthetic e2e issue`. Create it only with explicit live-mutation opt-in.

   - If credentials are missing or permissions are insufficient, stop before mutation and record the redacted operator error.
   - If an existing synthetic issue lacks `mc:inbox`, `priority:medium`, or `area:dev`, stop and record remediation instructions; do not auto-repair, auto-close, or auto-delete the issue.
   - If creation fails, record the failed operation and candidate using cleanup-safe evidence only, without token values, secret-like headers, raw credential material, or terminal context.

3. Trigger existing operator GitHub sync. SPEC-009C1 does not add a poller, cron job, scheduler lifecycle, or ownerless runtime discovery. If sync fails, record a distinct sync failure and do not count it as ineligible, duplicate, or idempotent success evidence.

4. Record proof that exactly one Mission Control root task exists for the issue:

   ```sql
   SELECT COUNT(*)
   FROM tasks
   WHERE workspace_id = :workspace_id
     AND github_repo = 'racecraft-lab/mission-control'
     AND github_issue_number = :issue_number
     AND github_synced_at IS NOT NULL
     AND parent_task_id IS NULL;
   ```

5. Re-run sync and record that the count remains one.

6. Record side-effect absence using current-schema surfaces only:

   ```text
   no child tasks
   no task-chain lineage on the pilot row
   dispatch_attempts = 0
   assigned_to IS NULL
   zero linked runs, task_dispositions, and task_artifacts
   no dispatch/pipeline/remediation activities
   future claim/runner/sandbox tables checked only if they exist
   ```

7. If the synthetic issue was created, leave cleanup to the checklist. The script must not auto-close or auto-delete it.

## Non-Goals To Preserve

- No automatic GitHub sync polling or cron lifecycle.
- No Issue Triage or Issue Remediation execution.
- No claim, dispatch, runner, sandbox, harness, or auto-merge behavior.
- No new production pilot eligibility UI.
- No new production evidence API.
- No workflow-contract tracker-label semantic change.
- No schema migration unless implementation proves an unavoidable live-schema gap.
