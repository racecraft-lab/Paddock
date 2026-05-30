# Quickstart: SPEC-014A Fake Lifecycle UAT

## Preconditions

- Use a disposable database or disposable workspace rows.
- Keep `FEATURE_AGENT_RUNNER_SANDBOXES` disabled until the enabled-path step.
- Do not launch Codex, OpenClaw, Claude, Hermes, OpenCode, or any external harness.
- Run from the repository root after dependencies are installed with `pnpm install`.

## Focused Verification Commands

```bash
pnpm exec vitest run src/lib/__tests__/migrations-M80-agent-sandbox-lifecycles.test.ts
pnpm exec vitest run src/lib/__tests__/agent-sandbox-lifecycle.test.ts
pnpm exec vitest run src/lib/__tests__/agent-sandbox-lifecycle-route.test.ts
pnpm exec vitest run src/lib/__tests__/migrations-M80-agent-sandbox-lifecycles.test.ts src/lib/__tests__/agent-sandbox-lifecycle.test.ts src/lib/__tests__/agent-sandbox-lifecycle-route.test.ts
pnpm typecheck
pnpm lint
pnpm api:parity
```

## 1. Verify Flag-Off Baseline

1. Confirm `FEATURE_AGENT_RUNNER_SANDBOXES` is absent or false for the target workspace.
2. Attempt fake lifecycle create/prepare/running/terminal/cleanup through the planned helper or test harness.
3. Verify the mutation result reports disabled-state evidence.
4. Verify no rows were inserted into `agent_sandbox_lifecycles` or `agent_sandbox_lifecycle_events`.

## 2. Enable In Disposable Workspace

1. Add `{ "FEATURE_AGENT_RUNNER_SANDBOXES": true }` to the disposable workspace feature flags.
2. Create fake lifecycles for owners `mission_control`, `openclaw`, and `external_harness`.
3. Verify every lifecycle key matches:

```text
workspace/<workspace_id>/product-line/<product_line_slug>/task/<task_id>/stage/<stage_key>/attempt/<attempt_id>/owner/<owner>
```

## 3. Exercise Lifecycle Hooks

1. Run `create`.
2. Run `prepare`.
3. Run `mark_running`.
4. Run `mark_terminal`.
5. Run `cleanup`.
6. Verify status reaches `cleaned_up`.
7. Verify fake physical artifacts are gone.
8. Verify lifecycle and event rows remain.

## 4. Inspect Read API

1. Request `GET /api/tasks/{id}/sandbox-lifecycles`.
2. Confirm `schema_version = "sandbox_lifecycle.v1"`.
3. Confirm owner, status, sandbox key, root id, sanitized relative path, linkage ids, and recent events are present.
4. Confirm no absolute host path, raw path fragment, prompt, token, auth header, provider payload, or raw session data appears.

Example request against a local server:

```bash
curl -sS -H "Authorization: Bearer $API_KEY" "http://127.0.0.1:3000/api/tasks/$TASK_ID/sandbox-lifecycles?workspace_id=$WORKSPACE_ID"
curl -sS -H "Authorization: Bearer $API_KEY" "http://127.0.0.1:3000/api/tasks/$TASK_ID/sandbox-lifecycles?workspace_id=$WORKSPACE_ID&lifecycle_id=$LIFECYCLE_ID"
```

Expected top-level response shape:

```json
{
  "schema_version": "sandbox_lifecycle.v1",
  "feature_flag": {
    "key": "FEATURE_AGENT_RUNNER_SANDBOXES",
    "enabled": true,
    "mutation_state": "enabled"
  },
  "task": {
    "id": "100",
    "workspace_id": "1",
    "stage_key": "issue_remediation"
  },
  "lifecycles": [],
  "diagnostics": {
    "warnings": []
  }
}
```

## 5. Disable Again

1. Disable `FEATURE_AGENT_RUNNER_SANDBOXES`.
2. Retry mutation calls.
3. Verify no additional lifecycle/event rows are created.
4. Query the read API and confirm it still returns authorized lifecycle evidence plus disabled-state flag evidence.

## 6. Migration Marker Checks

Use the disposable database path for `MISSION_CONTROL_DB_PATH`.

```sql
SELECT id FROM schema_migrations WHERE id = '080_agent_sandbox_lifecycles';
SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('agent_sandbox_lifecycles', 'agent_sandbox_lifecycle_events');
SELECT COUNT(*) AS lifecycle_rows FROM agent_sandbox_lifecycles WHERE workspace_id = :workspace_id;
SELECT COUNT(*) AS event_rows FROM agent_sandbox_lifecycle_events WHERE workspace_id = :workspace_id;
```

## 7. Cleanup

1. Delete disposable task/workspace rows if they were created only for UAT.
2. Confirm no fake artifacts remain below the sandbox root.
3. Keep committed lifecycle tests as the durable regression proof; do not commit local DB artifacts or screenshots.

Disposable lifecycle cleanup SQL:

```sql
DELETE FROM agent_sandbox_lifecycle_events
WHERE lifecycle_id IN (
  SELECT id
  FROM agent_sandbox_lifecycles
  WHERE workspace_id = :workspace_id
    AND task_id = :task_id
);

DELETE FROM agent_sandbox_lifecycles
WHERE workspace_id = :workspace_id
  AND task_id = :task_id;
```

Manual rollback SQL for the full M80 schema lives in `docs/migrations/rollback-M80.sql`.
