# Pilot Smoke Checklist

SPEC-009C1, SPEC-009C2, and SPEC-009C3 live smoke is operator-controlled.
Automated tests must not create, edit, close, route, or sync live GitHub issues
outside mocked fixtures.

## Candidate Selection

- Record the target deployment URL, workspace id, and timestamp.
- Search GitHub with:

  ```text
  repo:racecraft-lab/mission-control is:issue is:open label:"mc:inbox" -linked:pr
  ```

- Confirm the candidate is an issue, not a PR; is open; has `mc:inbox`; has at
  least one `priority:*`; has exactly one routable `area:*`; has no linked PR;
  and has no terminal/conflicting status label such as `mc:done` or `mc:failed`.
- If no safe candidate exists, run the synthetic fallback script only with an
  explicit mutation opt-in. It must reuse an existing open
  `[mc-pilot] synthetic e2e issue` before creating one.

## Synthetic Fallback

- For SPEC-009C2, create or select a fresh issue distinct from prior SPEC-009C1
  synthetic issues. Preferred title:

  ```text
  [mc-pilot] SPEC-009C2 synthetic e2e issue YYYY-MM-DD clean run
  ```

- The SPEC-009C2 issue must have `mc:inbox`, exactly one `priority:*` label,
  and exactly one routable `area:*` label. Do not reuse a closed SPEC-009C1
  clean-run issue.
- Command shape:

  ```bash
  GITHUB_TOKEN=<token> node scripts/pilot-issue-smoke.mjs --allow-live-mutation
  ```

- The created or reused fallback must have exactly the required pilot labels:
  `mc:inbox`, `priority:medium`, and `area:dev`.
- Do not auto-close, auto-delete, or auto-repair the synthetic issue. If labels
  are wrong, fix or close it manually in GitHub, then rerun the smoke path.

## Sync Proof

- Trigger existing GitHub sync manually through the existing operator route or
  equivalent local operator action. Do not enable cron or automatic pollers for
  this spec.
- Record cleanup-safe evidence only: repo slug, issue number or URL, workspace
  id, task id, sync timestamp, booleans, reason codes, and row counts.
- Verify exactly one root task exists:

  ```sql
  SELECT COUNT(*)
  FROM tasks
  WHERE workspace_id = :workspace_id
    AND github_repo = 'racecraft-lab/mission-control'
    AND github_issue_number = :issue_number
    AND github_synced_at IS NOT NULL
    AND parent_task_id IS NULL;
  ```

- Re-run the same sync once and verify the count remains `1`.

## SPEC-009C2 Triage Handoff Proof

- Apply or verify the current Mission Control workflow contract before the
  handoff. `mission-control_issue_triage` must expose disposition values
  `ACTIONABLE_REMEDIATION`, `DUPLICATE`, `OBSOLETE`, `INVALID`,
  `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, and `NEEDS_SPEC`; only
  `ACTIONABLE_REMEDIATION` may route to `mission-control_remediation_plan`.
- For the fresh SPEC-009C2 synthetic issue, complete Issue Triage with:

  ```json
  {
    "disposition": "ACTIONABLE_REMEDIATION",
    "rationale": "Synthetic SPEC-009C2 handoff proof."
  }
  ```

- Verify exactly one remediation-planning successor exists for the triage task:

  ```sql
  SELECT COUNT(*)
  FROM tasks
  WHERE workspace_id = :workspace_id
    AND parent_task_id = :triage_task_id
    AND workflow_template_slug = 'mission-control_remediation_plan';
  ```

- Verify durable task-scoped evidence exists:

  ```sql
  SELECT disposition, reason
  FROM task_dispositions
  WHERE workspace_id = :workspace_id
    AND task_id = :triage_task_id;

  SELECT artifact_type, storage_kind
  FROM task_artifacts
  WHERE workspace_id = :workspace_id
    AND task_id = :triage_task_id
    AND artifact_type = 'triage_outcome';

  SELECT type, entity_type, entity_id
  FROM activities
  WHERE workspace_id = :workspace_id
    AND entity_type = 'task'
    AND entity_id = :triage_task_id
    AND type = 'pilot_triage_outcome_recorded';
  ```

- Re-run the handoff once and verify there is still exactly one remediation
  successor, one `task_dispositions` row, one `triage_outcome` artifact, and one
  `pilot_triage_outcome_recorded` task activity for the triage task.

## SPEC-009C2 Negative Fixture Checks

- Fixture-drive each non-remediation disposition in a disposable local or test
  database path: `DUPLICATE`, `OBSOLETE`, `INVALID`, `NEEDS_HUMAN`,
  `NEEDS_SPECIALIST`, and `NEEDS_SPEC`.
- For each negative disposition, verify no remediation-planning successor is
  created and the triage task still has disposition, artifact, and task-scoped
  activity evidence.
- For `NEEDS_SPEC`, verify no SpecKit/SDD task, human clarification task,
  specialist task, close automation task, claim row, runner state, sandbox
  state, or harness adapter state is created by SPEC-009C2.

## SPEC-009C3 Ready For Owner Proof

- Deterministic fixture validation is the required automated path. It must use
  fixture PR identity on the PR-producing `mission-control_dev_implementation`
  task and must not create, update, merge, or reconcile a real GitHub PR.
- Verify the dev task owns `github_repo` and `github_pr_number`; root issue
  identity remains on the GitHub issue/root task evidence and is not duplicated
  as a second root issue row.
- Verify required `spec-009c3.v1` artifacts exist on or are linked/superseded
  onto the PR-producing dev task:

  ```sql
  SELECT artifact_type, schema_version, storage_kind, mime_type
  FROM task_artifacts
  WHERE workspace_id = :workspace_id
    AND task_id = :dev_task_id
    AND artifact_type IN (
      'remediation_plan',
      'dev_verification',
      'review_verdict',
      'aegis_approval',
      'governance_evidence'
    );
  ```

- Verify review `fix` creates no owner-review successor, Aegis successor,
  `ready_for_owner` status write, owner packet, owner-ready notification, or
  `task_ready_for_owner` activity.
- Verify Aegis `rejected`, wrong reviewer, wrong workspace, missing
  `aegis_approval` artifact, missing canonical `quality_reviews` row, missing
  governance evidence, or `readiness_blocked=true` leaves the dev task out of
  `ready_for_owner` and creates no owner-ready side effects.
- Verify the approved happy path stops at `ready_for_owner` on only the
  PR-producing dev task:

  ```sql
  SELECT id, status, github_repo, github_pr_number
  FROM tasks
  WHERE workspace_id = :workspace_id
    AND id IN (:root_task_id, :remediation_plan_task_id, :dev_task_id, :review_task_id);
  ```

- The optional live draft PR smoke is explicit operator UAT only. If run, it
  may create at most one draft PR, must record the draft PR URL/number,
  readiness subject task id, artifacts, Aegis quality review id, cleanup owner,
  and cleanup result or explicit retention rationale, and must still stop at
  `ready_for_owner`. Missing draft identity, non-draft identity, wrong-task PR
  identity, mutation beyond draft creation, merge, `done` reconciliation, or
  missing cleanup evidence fails the smoke proof closed.

### 2026-05-19 SPEC-009C3 UAT Run Evidence

- Target: HAL `mission-control.service`, workspace `4`, deployed commit
  `ac7760a222a33b4cefe886afae605238f479eaa5`; service remained `active`.
  Backup before smoke:
  `mission-control-data/backups/mission-control.db.spec009c3-uat-20260519-195459.bak`.
- Contract: workspace `4` workflow-contract import/apply run `8` set
  `mission-control_dev_implementation` to `produces_pr=1` and
  `external_terminal_event=github_pr_merged`.
- Live draft PR: #49
  (`https://github.com/racecraft-lab/mission-control/pull/49`) was created as
  draft from branch `spec-009c3-draft-pr-smoke-20260519-195459` at
  `b3b08a4326fa455d3b08a8da7118444fd3b1c413`; verification recorded
  `isDraft=true`, `mergedAt=null`, then the PR was closed and the remote branch
  deleted.
- Readiness proof: synthetic root/remediation/dev/review tasks `37`/`38`/`39`/`40`
  produced five `spec-009c3.v1` artifacts on dev task `39`, Aegis quality-review
  row `4`, one `task_ready_for_owner` notification to `HAL`, and only task `39`
  reached `ready_for_owner`; no merge or `done` reconciliation was run.
- Cleanup: synthetic tasks/artifacts/quality-reviews/notifications/activities
  were removed after evidence capture, with counts `4/5/2/1/1 -> 0/0/0/0/0`;
  local temp worktree and branch were removed, and GitHub PR #49 remains closed
  and unmerged.

## SPEC-009C4 Owner Merge Gate Proof

- SPEC-009C4 live UAT must use a fresh synthetic C4 PR. Record PR URL/number,
  target repo, workspace id, project id, linked PR-producing task id, cleanup
  owner, and creation timestamp before any merge action.
- Before `G_PILOT_MERGE`, record the pre-merge `ready_for_owner` state for the
  linked task and verify no `done` status, `mc:done` label projection, terminal
  `github_pr_merged` activity, or task-chain advancement has occurred.
- At `G_PILOT_MERGE`, the operator manually merges the fresh synthetic C4 PR.
  Record merge timestamp, operator, target deployment URL/commit, PR number,
  and exact linked task id.
- After the manual merge, trigger existing manual GitHub sync through
  `POST /api/github/sync` or the GitHub Sync panel. Record sync result,
  resulting task status, `mc:done` label projection, stale `mc:ready-for-owner`
  removal, terminal activity id/type, bounded notification evidence, duplicate
  sync result, and cleanup or retention rationale.
- SPEC-009C3 PR #49 must not be reused or treated as SPEC-009C4 merge proof.
  It was closed unmerged after the C3 ready-for-owner smoke and is valid only
  as explicit non-use evidence for C4.

## SPEC-009C4 Manual Operator Gate

SPEC-009C4 live UAT is blocked until an operator explicitly approves and
performs live GitHub mutation against a fresh synthetic C4 PR. Do not mark
T045-T049 complete from local fixtures, mocked PR evidence, or checklist text
alone.

- T045: Create a fresh synthetic draft PR only after live-mutation approval.
  Record PR URL/number, target repo, workspace id, project id, linked
  PR-producing task id, cleanup owner, creation timestamp, and pre-merge
  `ready_for_owner` state.
- T046: At `G_PILOT_MERGE`, manually merge that fresh synthetic C4 PR. Record
  merge timestamp, operator, target deployment URL/commit, PR number, linked
  task id, and explicit non-use of SPEC-009C3 PR #49.
- T047: Run manual GitHub sync through `POST /api/github/sync` or the GitHub
  Sync panel. Record sync result, resulting task status, `mc:done` label
  projection, stale `mc:ready-for-owner` removal, terminal activity,
  notification evidence, and duplicate sync evidence.
- T048: Clean disposable Mission Control UAT residue after evidence capture.
  Record before/after counts, cleanup owner, timestamp, retained GitHub audit
  trail, and retention rationale.
- T049: If cleanup fails, record failed cleanup step, owner, timestamp,
  before/after counts when available, sanitized failure reason, retained local
  rows or GitHub artifacts, and follow-up owner.

### 2026-05-20 SPEC-009C4 UAT Run Evidence

- Approval: live GitHub mutation was operator-approved in Codex before T045.
- Target: temporary C4 branch deployment at `http://127.0.0.1:3134`, branch
  `009c4-owner-merge-reconciliation`, commit
  `363ca085d95a35e0fe6b413c20050bdb75ed9773`, data dir
  `/private/tmp/mc-spec009c4-uat-20260520-011455`.
- GitHub transport: the temporary deployment used a localhost `gh api` proxy
  only to avoid printing or persisting a raw GitHub token; all issue and PR
  evidence came from real `racecraft-lab/mission-control` GitHub state.
- Fresh synthetic C4 issue: #50
  (`https://github.com/racecraft-lab/mission-control/issues/50`) created
  `2026-05-20T01:16:06Z` with labels `area:dev`,
  `priority:medium`, and `mc:ready-for-owner`.
- Fresh synthetic C4 PR: #51
  (`https://github.com/racecraft-lab/mission-control/pull/51`) created as a
  draft at `2026-05-20T01:16:28Z` from branch
  `spec-009c4-live-uat-20260520-011455`, head
  `6f92581f9f80f91ff5b280bdda8db999b8588e0c`, base `main`.
- Linked task before `G_PILOT_MERGE`: workspace `1`, project `1`, task `1`,
  workflow `mission-control_dev_implementation`, repo
  `racecraft-lab/mission-control`, issue #50, PR #51, status
  `ready_for_owner`, `completed_at=null`, and one bounded
  `task_ready_for_owner` notification to `HAL`.
- Pre-merge manual sync: `POST /api/github/sync` with
  `{ "action": "trigger", "project_id": 1, "workspace_id": 1 }` returned
  `pulled=11`, `pushed=0`; task `1` remained `ready_for_owner` with
  `completed_at=null`. The `pulled=11` count came from the empty temporary DB
  ingesting other repository issues into disposable local rows only.
- `G_PILOT_MERGE`: PR #51 was marked ready and manually squash-merged by
  `fgabelmannjr` at `2026-05-20T01:21:58Z`; merge commit
  `fc80b9f234e110e962f52b49595604474a9842b2`. Issue #50 closed at
  `2026-05-20T01:21:59Z`.
- Explicit non-use evidence: closed/unmerged SPEC-009C3 PR #49 was not used as
  SPEC-009C4 merge proof.
- Post-merge manual sync: the same `POST /api/github/sync` request returned
  `pulled=1`, `pushed=0`; task `1` moved to `done`, `completed_at=1779240143`,
  `github_synced_at=1779240143`, and terminal activity `12` recorded
  `github_pr_number=51` with `terminal_event=github_pr_merged`.
- GitHub label projection: issue #50 ended closed with labels `area:dev`,
  `priority:medium`, and `mc:done`; stale `mc:ready-for-owner` was absent.
- Duplicate sync: a repeated manual sync returned `pulled=0`, `pushed=0`;
  task `1` stayed `done`, notification count stayed `1`, terminal activity
  count stayed bounded, and no successor child task was observed for task `1`.
- Cleanup/export: pre-cleanup evidence was exported into this checklist before
  deletion. A temp DB file copy was retained at
  `/private/tmp/mc-spec009c4-uat-20260520-011455/backups/mission-control.db.spec009c4-uat-20260520-011455.bak`;
  row-count evidence was taken from the live temp DB connection before cleanup.
- Cleanup result: temporary workspace residue was removed after evidence
  capture. Related rows went from tasks/notifications/activities/artifacts/
  quality-reviews/github-syncs `1/1/2/0/0/3` to `0/0/0/0/0/0`;
  whole temporary workspace rows went from `11/1/12/0/0/3` to
  `0/0/0/0/0/0`.
- Retained audit trail: GitHub issue #50 and merged PR #51 remain closed/merged
  as the external audit trail. The temporary remote branch was deleted by PR
  merge cleanup, and the local temp worktree was removed.
- Cleanup failure evidence: not applicable; cleanup completed successfully.
- Verification: final commands ran outside the Codex sandbox with Node
  `v22.22.2`. `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `pnpm test`
  passed; `pnpm test` reported 275 passed test files, 33 skipped files, 2894
  passed tests, 3 skipped tests, and 84 todo tests.
- Final PR gate: the first `pnpm test:all` attempt failed before product
  assertions because the Playwright Chromium headless-shell executable was
  missing from the user cache. After `pnpm exec playwright install chromium`,
  `pnpm test:all` passed end-to-end, including strict-scope, lint, typecheck,
  Vitest, build, and 646 Playwright tests.
- No-new-UI-journey rationale: SPEC-009C4 changed library reconciliation
  behavior, focused Vitest coverage, and Markdown checklist evidence. No app
  UI/component route was added or changed; the full Playwright suite still ran
  through `pnpm test:all` as the final gate.

### 2026-05-20 SPEC-009C4 Target Deployment Closeout

- Promotion: HAL `/home/fredrick-gabelmann/mission-control` fast-forwarded
  `main` from SPEC-009C3 commit `ac7760a222a33b4cefe886afae605238f479eaa5`
  to SPEC-009C4 merge commit
  `ddc709f2f200a4ee4df51398d39ef42d85bd6e54`.
- Build/restart: `pnpm build` passed on HAL, `mission-control.service`
  restarted successfully at `2026-05-20T02:54:14Z`, `/login` returned 200,
  unauthenticated `/api/status` returned 401, and authenticated `/api/status`
  returned 200 without printing or persisting the API key.
- Backup before target replay:
  `/home/fredrick-gabelmann/mission-control-data/backups/mission-control.db.spec009c4-target-uat-20260520-025827.bak`.
- Target replay scope: workspace `4` (`mission-control`), project `3` (`QA`),
  workflow template `6` (`mission-control_dev_implementation`,
  `produces_pr=1`, `external_terminal_event=github_pr_merged`). The replay
  used retained external audit trail issue #50 / PR #51 instead of creating
  another empty PR/merge commit; the fresh-PR `G_PILOT_MERGE` requirement was
  already satisfied by PR #51 in the branch UAT above.
- Linked target task before sync: disposable task `41`, repo
  `racecraft-lab/mission-control`, issue #50, PR #51, status
  `ready_for_owner`.
- Target manual sync: deployed `POST /api/github/sync` with
  `{ "action": "trigger", "project_id": 3, "workspace_id": 4 }` returned
  `pulled=1`, `pushed=0`; task `41` moved to `done` with
  `completed_at=1779246054` and `github_synced_at=1779246054`.
- GitHub audit state after target replay: issue #50 remained closed with
  labels `area:dev`, `priority:medium`, and `mc:done`; PR #51 remained merged
  at `2026-05-20T01:21:58Z` with merge commit
  `fc80b9f234e110e962f52b49595604474a9842b2`.
- Duplicate sync: a repeated deployed sync returned `pulled=0`, `pushed=0`;
  task `41` stayed `done`, no successor child task was observed, and no extra
  GitHub mutation was required.
- Cleanup result: disposable HAL rows for task/activities/notifications went
  from `1/0/0` to `0/0/0`. GitHub sync log rows `160` and `161` were retained
  as live deployment audit history and to keep the live sync watermark past
  issue #50 so future syncs do not re-ingest the retained audit issue.

## SPEC-009D Handoff Evidence Sources

- Use existing source records only. The handoff source trail comes from
  `tasks.status`, `tasks.completed_at`, `tasks.github_repo`,
  `tasks.github_issue_number`, `tasks.github_pr_number`, and
  `tasks.github_synced_at` on the linked PR-producing task.
- Use `activities` rows for terminal proof: exactly one `task_updated` row
  whose data records `github_pr_merged`, plus any bounded reconciliation or
  failed-sync evidence generated before merge proof exists.
- Use `notifications` rows for owner-action proof: the existing
  `task_ready_for_owner` notification remains bounded, and duplicate sync must
  not create extra owner-action or reconciliation-required notifications.
- Use `task_artifacts` rows for upstream readiness proof: the
  `spec-009c3.v1` artifacts remain the owner-readiness inputs and are not
  repackaged for SPEC-009D.
- Use `quality_reviews` rows for review proof: the canonical `aegis` approval
  row remains the source for owner readiness.
- Use GitHub labels for external sync proof: `mc:done` must be projected and
  stale `mc:ready-for-owner` must be absent after successful reconciliation.
- Use smoke checklist text for operator proof: record the fresh synthetic C4 PR
  identity, manual `G_PILOT_MERGE`, duplicate-sync result, cleanup or retention
  rationale, and explicit non-use of SPEC-009C3 PR #49.

## 2026-05-20 SPEC-009D Packet Verification

- Packet implementation scope: `src/lib/pilot-review-packet.ts` derives a
  stored-evidence-only JSON packet plus deterministic Markdown from existing
  task, activity, notification, artifact, quality-review, governance, GitHub
  sync, and smoke-checklist evidence.
- Packet artifact surface: publication stays on existing SPEC-007 task artifact
  behavior with `artifact_type="pilot_review_packet_json"` and
  `artifact_type="pilot_review_packet_markdown"`. No packet-specific route,
  dashboard, schema migration, fresh GitHub call, poller, claim authority,
  retry control, sandbox lifecycle, adapter registry, or real harness execution
  was added.
- Verification evidence: focused packet/artifact tests passed 20 tests, existing
  task-artifact seam tests passed 38 tests, `pnpm build`, `pnpm typecheck`,
  `pnpm lint`, `pnpm test`, and `pnpm test:e2e` passed under Node 22. Full
  Playwright verification reported 646 passing tests.
- Build-blocker resolution: final standalone verification used a clean
  `.next/standalone` build after rebuilding `better-sqlite3`, so the native
  binding is present in the standalone server used by Playwright.

### 2026-05-20 SPEC-009D UAT Run Evidence

- Scope: disposable local UAT using stored Mission Control evidence only. No
  fresh GitHub mutation or live GitHub lookup was required; the run reused the
  retained external audit trail issue #50 and merged PR #51 from SPEC-009C4.
- Target: branch `009d-pilot-review-lifecycle`, commit `8f249fa`, Node
  `v22.22.2`, temp data dir
  `/private/tmp/mc-spec009d-uat-20260520-uat1`, temp HTTP target
  `http://127.0.0.1:3149`.
- Seeded evidence: workspace `3`, project `2`, root task `1`, owner task `2`,
  upstream readiness artifact `1`, resource policy event `1`, and GitHub sync
  row `1`. The root task used issue #50; the owner task used PR #51 and status
  `done`.
- Packet generation: the UAT harness ran the real migrations, loaded stored
  task/activity/notification/artifact/quality-review/governance/GitHub-sync
  rows plus the retained smoke-checklist reference, and generated a
  `candidate.state="proven"` packet with `current_stage="done"` and 15 source
  map pointers.
- Artifact publication: the real `publishArtifact()` path wrote JSON artifact
  `2` with SHA-256
  `44e63cd35ca3d3a1bef85aac701915999893fcd1082ebe333f6ec6bc3921b556`
  (`10732` bytes) and Markdown artifact `3` with SHA-256
  `22e03db419d4bcbf0bbcf0dfab3acb2635d51ff0d6a3de66c3e2c81fa43fcbdf`
  (`2055` bytes), both with schema version `spec-009d.packet.v1`.
- HTTP inspection: the disposable server returned the packet through existing
  artifact routes only. `GET /api/task-artifacts?workspace_id=3&artifact_type=pilot_review_packet_json`
  returned one JSON packet row, `GET /api/task-artifacts?workspace_id=3&artifact_type=pilot_review_packet_markdown`
  returned one Markdown packet row, and `GET /api/task-artifacts/2?workspace_id=3`
  plus `GET /api/task-artifacts/3?workspace_id=3` returned readable packet
  contents. The JSON read verified schema version, proven state, done stage,
  15 source-map pointers, and all SPEC-013/SPEC-014 deferrals. The Markdown
  read named JSON artifact `#2` and linked issue #50 / PR #51.
- Backup before cleanup:
  `/private/tmp/mc-spec009d-uat-20260520-uat1/backups/mission-control.db.spec009d-uat-20260520-uat1.bak`.
- Cleanup result: disposable rows for tasks/artifacts/activities/
  notifications/quality-reviews/resource-policy-events/github-syncs/projects/
  workspaces went from `2/3/3/1/1/1/1/1/1` to `0/0/0/0/0/0/0/0/0`.
  No disposable `[mc-pilot]` task rows remain in the UAT database.
- Post-merge closeout: PR #54 merged to `main` as
  `765264be667bd31d6266f606602a219312f72f23` on 2026-05-20. Main push
  CI/CD for that merge commit passed Quality Gate, CodeQL, Mission Control UI
  E2E, Visual Storybook Snapshots, Playwright visual approval, and Storybook
  visual approval.

## 2026-05-20 SPEC-009E Task Evidence Surface UAT

- Scope: read-only task detail Evidence surface on branch
  `009e-pilot-evidence-surfaces` under Node `v22.22.2`. The run used stored
  Mission Control rows only; it did not call GitHub, generate packets, execute
  smoke, trigger sync, mutate task evidence through the route, add a dashboard,
  or add migration/runtime dependency changes.
- Retained external audit trail: GitHub issue #50 and PR #51 from the
  SPEC-009C4/SPEC-009D pilot remain the canonical issue/PR proof. The
  disposable browser carrier task used the same repo/issue/PR identity only to
  render the UI journey from stored rows.
- UAT command:

  ```bash
  direnv exec . pnpm test:e2e -- tests/e2e/task-detail-evidence.spec.ts
  ```

- Browser evidence artifacts:
  `test-results/spec-009e-task-evidence/spec-009e-evidence-eligible.png`,
  `test-results/spec-009e-task-evidence/spec-009e-evidence-local-only.png`,
  `test-results/spec-009e-task-evidence/spec-009e-evidence-partial-proof.png`,
  and
  `test-results/spec-009e-task-evidence/spec-009e-evidence-fixture-export.json`.
- Fixture export: `spec-009e.e2e-export.v1`, generated
  `2026-05-20T22:26:27.864Z`, recorded disposable task ids `1/2/3`, artifact
  rows `1/2/3/4`, activity row `4`, quality-review row `1`, governance row
  `1`, GitHub sync row `1`, retained repo `racecraft-lab/mission-control`,
  retained issue `50`, and retained PR `51`.
- UI assertions: retained pilot carrier showed `eligible`,
  `ready_for_owner`, issue #50, PR #51, review-packet artifact references, the
  static smoke checklist reference `docs/qa/pilot-smoke-checklist.md#spec-009e`,
  source-map evidence, and all seven deferred future-state categories. The
  local-only carrier showed `not_eligible` with missing GitHub repo/issue
  reasons. The partial-proof carrier showed `incomplete`,
  `missing_github_pr_number`, oversized/unsafe/quarantined warning evidence,
  and no action controls.
- Cleanup: initial failed local runs left three disposable carrier task rows;
  they were manually removed from the local e2e database before the final run
  (`{"before":3,"after":0}`). The final successful run cleaned inserted
  evidence rows and disposable carrier tasks; post-run counts were
  `{"disposable_tasks_remaining":0,"matching_evidence_rows_remaining":0}`.
  The retained GitHub issue/PR audit trail and this checklist are the durable
  proof, not the cleaned local rows.
- Docker note: Docker CLI is installed, but the daemon was unavailable during
  this run (`Cannot connect to the Docker daemon at
  unix:///Users/fredrickgabelmann/.docker/run/docker.sock`), so the optional
  Docker build journey was not run.
- Full UAT rerun on the product-code head `fe8e4b53`: the focused browser
  journey passed again with `direnv exec . pnpm test:e2e --
  tests/e2e/task-detail-evidence.spec.ts` (`1` Chromium test, `6.6s`). The
  fresh fixture export was generated `2026-05-20T23:49:37.908Z`, retained
  GitHub proof repo `racecraft-lab/mission-control`, issue `50`, and PR `51`,
  and wrote screenshot evidence at
  `test-results/spec-009e-task-evidence/spec-009e-evidence-eligible.png`
  (`622x855`),
  `test-results/spec-009e-task-evidence/spec-009e-evidence-local-only.png`
  (`622x892`), and
  `test-results/spec-009e-task-evidence/spec-009e-evidence-partial-proof.png`
  (`622x1001`). The post-run cleanup query returned
  `{"disposable_tasks_remaining":0,"matching_artifacts_remaining":0,"matching_activities_remaining":0,"matching_reviews_remaining":0,"matching_syncs_remaining":0}`.
  Focused helper/API/component/read-only guard tests passed again (`4` files,
  `14` tests). Full unit UAT confidence came from the sandbox-external
  `direnv exec . pnpm test` pass (`281` passed files, `2933` passed tests,
  `33` skipped files, `84` todo tests). Local Docker UAT remains blocked by the
  unavailable daemon, while hosted PR Docker UI E2E and visual review checks
  were green on the same product-code head.
- Verification commands run outside the Codex sandbox with `direnv exec .`:
  `pnpm typecheck`, `pnpm lint`, focused SPEC-009E Vitest route/helper/component
  tests plus direct-insert guard (`4` files, `14` tests), full `pnpm test`
  (`281` passed files, `2933` passed tests, `33` skipped files, `84` todo
  tests), `pnpm build`, `pnpm api:parity`, `pnpm audit:high`, and the focused
  Playwright journey above.
- PR review packet notes: review order is `src/lib/task-evidence.ts`, then
  `src/app/api/tasks/[id]/evidence/route.ts`, then
  `src/components/panels/task-evidence-section.tsx` and task-board integration,
  then the Playwright journey and tracking docs. Rollback requires no database
  rollback: revert the route/helper/UI/test/doc changes. Known deferred work
  remains explicitly labeled for SPEC-013A, SPEC-013A1, SPEC-013B,
  SPEC-013C, and SPEC-014A-D.
- Post-merge closeout: PR #55 merged to `main` as
  `40507874b012abffe2356a66be36613c6dea5809` on 2026-05-21 UTC. Main push
  check runs for that merge commit passed `quality-gate`,
  `docker-ui-e2e / visual-review-report`,
  `visual-storybook / visual-review-report`, `Analyze (actions)`, and
  `Analyze (javascript-typescript)`.

## SPEC-009F Production Triage Routing UAT

- Status: focused local UAT and full e2e suite captured for T047/T050/T055 on
  2026-05-22 UTC.
- Branch and commit: `009f-production-triage-routing`; implementation base
  `e63672bf`, with final polish evidence committed after this checklist update.
- UAT command:
  `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm test:e2e tests/e2e/spec-009f-triage-routing.spec.ts`.
- Full e2e command:
  `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm test:e2e`
  passed with `648 passed`.
- Post-review security regression:
  `PATH=/Users/fredrickgabelmann/.nvm/versions/node/v22.22.2/bin:$PATH pnpm test src/lib/__tests__/triage-routing-payloads.test.ts src/lib/__tests__/triage-routing.test.ts src/lib/__tests__/task-evidence.test.ts src/components/panels/__tests__/task-evidence-section.test.tsx src/lib/__tests__/task-dispatch.test.ts`
  passed with `84 passed`; SPEC-009F routing artifacts publish through
  `publishArtifact()` so existing artifact redaction, secret scanning,
  size/MIME limits, and supersession behavior remain authoritative, and
  production dispatch skips legacy triage artifact publication after
  SPEC-009F validation/conflict/publish failures.
- Fixture export: `test-results/spec-009f-triage-routing/spec-009f-triage-routing-fixture-export.json`
  (`schema_version: spec-009f.e2e-export.v1`, generated
  `2026-05-22T00:30:51.630Z`, `no_live_side_effects: true`).
- Six-outcome matrix:
  - `NEEDS_SPEC`: task `12`, lane `speckit_handoff`, status `recorded`,
    artifact `1`, activity `150`, Evidence state `available`, successors `0`.
  - `NEEDS_HUMAN`: task `13`, lane `clarification_request`, status `recorded`,
    artifact `2`, activity `152`, Evidence state `available`, successors `0`.
  - `NEEDS_SPECIALIST`: task `14`, lane `specialist_recommendation`, status
    `recorded`, artifact `3`, activity `154`, Evidence state `available`,
    successors `0`.
  - `DUPLICATE`: task `15`, lane `closure_recommendation`, status `recorded`,
    artifact `4`, activity `156`, Evidence state `available`, successors `0`.
  - `OBSOLETE`: task `16`, lane `closure_recommendation`, status `recorded`,
    artifact `5`, activity `158`, Evidence state `available`, successors `0`.
  - `INVALID`: task `17`, lane `closure_recommendation`, status `recorded`,
    artifact `6`, activity `160`, Evidence state `available`, successors `0`.
- Screenshot evidence:
  `test-results/spec-009f-triage-routing/spec-009f-needs-spec.png`,
  `test-results/spec-009f-triage-routing/spec-009f-needs-human.png`,
  `test-results/spec-009f-triage-routing/spec-009f-needs-specialist.png`,
  `test-results/spec-009f-triage-routing/spec-009f-duplicate.png`,
  `test-results/spec-009f-triage-routing/spec-009f-obsolete.png`, and
  `test-results/spec-009f-triage-routing/spec-009f-invalid.png`.
- Cleanup counts: six disposable tasks, six routing artifacts, six terminal
  routing activities plus six task-create activities were removed by the e2e
  cleanup. Post-cleanup verification for task ids `12`-`17` returned
  `tasks=0`, `task_artifacts=0`, `activities=0`, and `task_dispositions=0`.
  No quality-review, notification, sync, workspace, or project rows are created
  by this SPEC-009F UAT fixture.
- Explicit non-use evidence: the fixture export records
  `no_live_side_effects: true`; the route source is local SQLite fixture rows
  plus the production `/api/tasks` status update path through
  `advanceTaskChain()`. The run did not mutate live GitHub, create Issue
  Remediation or non-remediation successor tasks, claim work, start a runner,
  use sandbox or adapter state, auto-merge, or send external messages.

## Local-Only Exclusion

- Create or identify a local-only lookalike task through normal Mission Control
  task creation.
- Verify it does not count as pilot evidence because `github_repo`,
  `github_issue_number`, and `github_synced_at` linkage are absent.

## Side-Effect Absence

- Verify the pilot task has no child tasks, no task-chain lineage,
  `dispatch_attempts = 0`, `assigned_to IS NULL`, no linked `runs`,
  `task_dispositions`, or `task_artifacts`, and no dispatch, pipeline, or
  remediation `activities`.
- If future claim, runner, or sandbox tables exist, check them only with
  table-if-exists guards. SPEC-009C1 must not add placeholder schema.

## Evidence Redaction

- Do not paste raw terminal scrollback, environment dumps, tokens,
  Authorization headers, API keys, credential values, or matched secret
  substrings into the PR or checklist notes.
- Acceptable evidence includes issue URL, task id, workspace id, timestamps,
  `token_set` booleans, stable error codes, counts, and content hashes.

## Cleanup

- If a synthetic issue was created, record its issue URL and intended cleanup
  owner before any cleanup action. Cleanup is manual; SPEC-009C1/SPEC-009C2 do
  not auto-close synthetic issues from the script, app runtime, CI, or sync path.
- After evidence is captured, close synthetic GitHub issues manually rather
  than deleting them. Closed issues remain the external audit trail.
- Do not leave disposable `[mc-pilot]` smoke tasks active in Mission Control.
  After recording the issue URL, root task id, triage task id, remediation
  successor id if created, workspace id, sync timestamp, duplicate-sync result,
  duplicate-handoff result, and side-effect snapshot, close or remove only the
  synthetic smoke rows that were created solely for this checklist run.
- Before deleting disposable smoke task rows, take an operator-owned backup or
  export of the target database. Then verify cleanup leaves no synthetic pilot
  dirt behind:

  ```sql
  SELECT id, title, status, github_repo, github_issue_number
  FROM tasks
  WHERE title LIKE '[mc-pilot]%'
     OR (
       github_repo = 'racecraft-lab/mission-control'
       AND github_issue_number IN (:synthetic_issue_numbers)
     );
  ```
