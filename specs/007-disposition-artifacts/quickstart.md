# SPEC-007 Quickstart — Operator Walkthroughs

This document walks an operator through SPEC-007's six core flows: enabling each flag, publishing artifacts via cURL (inline JSON, inline Markdown, file PDF), simulating secret detection, running a retention sweep, repairing an orphan, and overriding a quarantine read.

**Prerequisites**:
- Mission Control running locally (`pnpm dev` on `localhost:3000`) or in Docker (`docker compose up`).
- Admin session (for admin actions). Set `AUTH_USER`/`AUTH_PASS` in `.env` for headless access OR sign in at `/setup`.
- API key from your admin profile or via `pnpm mc tokens create`.
- Set `MC_URL=http://127.0.0.1:3000` and `MC_API_KEY=<your-key>` in your shell.

---

## 1. Enable the feature flags

Both flags are per-workspace JSON in `workspaces.feature_flags` (per Constitution Principle V — `process.env.FEATURE_X='1'` does NOT force ON).

### Enable disposition logging for workspace 7

```bash
sqlite3 .data/mission-control.db <<SQL
UPDATE workspaces
SET feature_flags = json_set(
  COALESCE(feature_flags, '{}'),
  '$.FEATURE_DISPOSITION_LOGGING', json('true')
)
WHERE id = 7;
SQL
```

### Enable artifact store for workspace 7

```bash
sqlite3 .data/mission-control.db <<SQL
UPDATE workspaces
SET feature_flags = json_set(
  COALESCE(feature_flags, '{}'),
  '$.FEATURE_TASK_ARTIFACTS', json('true')
)
WHERE id = 7;
SQL
```

### Verify flags

```bash
sqlite3 .data/mission-control.db "SELECT id, slug, feature_flags FROM workspaces WHERE id = 7;"
```

Restart the server (or wait for the next request — flags are read on every `resolveFlag` call).

---

## 2. Publish an inline JSON artifact

Triage decision artifact for an existing task `task_id=12345` in workspace 7.

```bash
curl -X POST "$MC_URL/api/task-artifacts" \
  -H "X-API-Key: $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": 12345,
    "artifact_type": "triage_decision",
    "storage_kind": "inline_json",
    "mime": "application/json",
    "content": { "disposition": "closed", "reason": "duplicate of #123" },
    "schema_version": "1.0.0"
  }'
```

**Expected**: HTTP 201 with response body containing `id`, `sha256`, `redaction_status: "clean"`, `security_scan_status: "scanned_clean"`.

**Verify DB row**:

```bash
sqlite3 .data/mission-control.db <<SQL
SELECT id, task_id, storage_kind, mime_type, byte_size, redaction_status, security_scan_status,
       length(content_json) AS json_len,
       length(content_markdown) AS md_len
FROM task_artifacts WHERE task_id = 12345 ORDER BY id DESC LIMIT 1;
SQL
```

`json_len > 0`, `md_len = NULL`. (Per FR-020: `inline_json` writes `content_json` only.)

---

## 3. Publish an inline Markdown artifact

Audit report markdown for the same task.

```bash
curl -X POST "$MC_URL/api/task-artifacts" \
  -H "X-API-Key: $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": 12345,
    "artifact_type": "audit_report",
    "storage_kind": "inline_markdown",
    "mime": "text/markdown",
    "content": "# Audit Report\n\nThis task was triaged as **closed**."
  }'
```

**Expected**: HTTP 201.

**Verify**: `content_markdown` populated, `content_json` NULL.

---

## 4. Publish a file artifact (PDF)

```bash
curl -X POST "$MC_URL/api/task-artifacts" \
  -H "X-API-Key: $MC_API_KEY" \
  -F "task_id=12345" \
  -F "artifact_type=invoice_export" \
  -F "storage_kind=file" \
  -F "mime=application/pdf" \
  -F "file=@./sample.pdf"
```

**Expected**: HTTP 201. `storage_kind: "file"`, `storage_uri: "artifacts/7/2026/05/<sha256>.pdf"`.

**Verify on disk**:

```bash
SHA=$(sqlite3 .data/mission-control.db "SELECT sha256 FROM task_artifacts WHERE task_id=12345 ORDER BY id DESC LIMIT 1;")
ls -la ".data/artifacts/7/2026/05/${SHA}.pdf"
```

The file exists at the canonical path. No `.tmp.*` siblings remain in that directory.

---

## 5. Simulate secret detection (rejected)

Try publishing an artifact whose content includes an AWS access key.

```bash
curl -i -X POST "$MC_URL/api/task-artifacts" \
  -H "X-API-Key: $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": 12345,
    "artifact_type": "agent_output",
    "storage_kind": "inline_json",
    "mime": "application/json",
    "content": { "log": "deploying with key AKIAIOSFODNN7EXAMPLE" }
  }'
```

**Expected**: HTTP 422 with body:

```json
{
  "error": "secret_detected",
  "redacted_preview": "{\"log\":\"deploying with key [REDACTED:aws-access-key-id]\"}",
  "findings": 1
}
```

**Verify activity row**:

```bash
sqlite3 .data/mission-control.db <<SQL
SELECT id, type, entity_type, entity_id, json_extract(data, '$.rule_ids') AS rules
FROM activities
WHERE entity_type = 'task' AND entity_id = 12345 AND type = 'security_violation'
ORDER BY id DESC LIMIT 1;
SQL
```

Row exists with `rules` containing `aws-access-key-id`. The matched substring `AKIAIOSFODNN7EXAMPLE` is NOT in the activity payload (Constitution Principle XIII).

### Same secret on a redact-and-store template

If `task_id=12345`'s template has `workflow_templates.allow_redacted_artifacts=1` AND MIME is `text/markdown`, the same content publishes successfully with `redaction_status: "redacted"`:

```bash
curl -X POST "$MC_URL/api/task-artifacts" \
  -H "X-API-Key: $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": 12345,
    "artifact_type": "post_mortem",
    "storage_kind": "inline_markdown",
    "mime": "text/markdown",
    "content": "Deployed using AKIAIOSFODNN7EXAMPLE — leaked the key."
  }'
```

**Expected**: HTTP 201 with `redaction_status: "redacted"`, `security_scan_status: "scanned_with_findings"`. The stored `content_markdown` contains `[REDACTED:aws-access-key-id]` instead of the raw key.

(Binary MIMEs always reject regardless of the flag — FR-034.)

---

## 6. Run a retention sweep (admin)

Set the per-workspace retention policy in `feature_flags`:

```bash
sqlite3 .data/mission-control.db <<SQL
UPDATE workspaces
SET feature_flags = json_set(
  COALESCE(feature_flags, '{}'),
  '$.artifact_retention',
  json('{"keep_days": 30, "archive_after_days": 14, "delete_after_days": 60}')
)
WHERE id = 7;
SQL
```

Then trigger the sweep from the admin panel UI (recommended) OR via the admin API (admin auth required):

```bash
curl -X POST "$MC_URL/api/task-artifacts/admin/retention-sweep" \
  -H "X-API-Key: $MC_API_KEY_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{ "workspace_id": 7 }'
```

**Expected**: HTTP 200 with summary `{ "archived": N, "deleted": M, "kept": K }`.

**Verify activity row**:

```bash
sqlite3 .data/mission-control.db <<SQL
SELECT id, type, json_extract(data, '$.archived'), json_extract(data, '$.deleted')
FROM activities
WHERE entity_type = 'artifact' AND type = 'artifact_retention_swept'
ORDER BY id DESC LIMIT 1;
SQL
```

A single summary row with archived/deleted/kept counts. (FR-069: never auto-cron — only admin-triggered.)

---

## 7. Repair an orphan

### Simulate a DB-without-file orphan

```bash
# Pick an artifact and delete its file from disk, leaving the row
SHA=$(sqlite3 .data/mission-control.db "SELECT sha256 FROM task_artifacts WHERE storage_kind='file' LIMIT 1;")
rm -f ".data/artifacts/7/2026/05/${SHA}.pdf"
```

Trigger orphan repair from the admin panel OR via API:

```bash
curl -X POST "$MC_URL/api/task-artifacts/admin/repair-orphans" \
  -H "X-API-Key: $MC_API_KEY_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{ "workspace_id": 7 }'
```

**Expected**: HTTP 200. The DB row's `redaction_status` becomes `'rejected'` and `security_scan_status` becomes `'file_missing'` — the row is preserved (FR-068).

### Simulate a file-without-DB-row orphan

```bash
# Drop a file at a canonical-shaped path with no DB row
mkdir -p .data/artifacts/7/2026/05
echo "orphan" > .data/artifacts/7/2026/05/dead0000000000000000000000000000.txt
```

Run repair again. **Expected**: the file is moved to `.data/artifacts/_orphaned/<timestamp>/7/2026/05/dead00...txt`. Activity row of `artifact_repaired_orphan` written.

---

## 8. Admin override read of a quarantined artifact

Quarantine an artifact (admin):

```bash
curl -X POST "$MC_URL/api/task-artifacts/9001/quarantine" \
  -H "X-API-Key: $MC_API_KEY_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "leaked credential" }'
```

A non-admin (or admin without the `?include_quarantined=1` flag) trying to read it:

```bash
curl -i "$MC_URL/api/task-artifacts/9001"
```

**Expected**: HTTP 423 with metadata-only body.

Admin override:

```bash
curl -i "$MC_URL/api/task-artifacts/9001?include_quarantined=1" \
  -H "X-API-Key: $MC_API_KEY_ADMIN"
```

**Expected**: HTTP 200 with the artifact content.

**Verify the unthrottled audit row**:

```bash
sqlite3 .data/mission-control.db <<SQL
SELECT id, created_at,
       json_extract(data, '$.artifact_id') AS aid,
       json_extract(data, '$.actor_session_id') AS sid,
       json_extract(data, '$.actor_user_id') AS uid
FROM activities
WHERE type = 'artifact_quarantined_read_overridden' AND entity_type = 'artifact' AND entity_id = 9001
ORDER BY id DESC LIMIT 5;
SQL
```

**Every successful override read produces exactly one row — never throttled** (FR-065, NIST SP 800-53 AU-2/3/12). Run the override curl 5 times and you will see 5 activity rows.

---

## 9. Verify the dashboard widget

After several disposition rows have been recorded for workspace 7:

1. Open `http://localhost:3000` and select workspace 7 in the workspace switcher.
2. Confirm the "Last 7d triage totals" card shows the per-day stacked bars and a total count.
3. Insert a new disposition row (drive a triage-template task to completion).
4. Wait ≤ 30 seconds. The widget reflects the new total via the next poll.

---

## 10. Verify flag-OFF rollback

Disable both flags:

```bash
sqlite3 .data/mission-control.db <<SQL
UPDATE workspaces
SET feature_flags = json_remove(
  json_remove(feature_flags, '$.FEATURE_DISPOSITION_LOGGING'),
  '$.FEATURE_TASK_ARTIFACTS'
)
WHERE id = 7;
SQL
```

Then:
- `POST /api/task-artifacts` returns 503 `artifact_store_disabled`.
- `GET /api/dispositions?workspace_id=7` returns 503 `disposition_logging_disabled`.
- Drive a triage-template task to completion: no `task_dispositions` row inserted, successor `metadata` JSON has no `input_artifacts` key (`'input_artifacts' in JSON.parse(successor.metadata) === false`).

Existing `task_dispositions` and `task_artifacts` rows from before the flag flip remain untouched and remain readable through admin paths.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| 503 even with flag set in JSON | `process.env.FEATURE_TASK_ARTIFACTS=0` overrides | Unset the env var |
| 415 on `text/x-yaml` | Allowlist uses `application/x-yaml` | Use `application/x-yaml` |
| 413 on a 25 MiB file | Boundary is exclusive; ≤ 25 MiB allowed | Trim file to ≤ 25 MiB or split |
| `EXDEV` error on file publish | Temp file landed outside `<DATA_DIR>` | Ensure `MISSION_CONTROL_DATA_DIR` is on the same filesystem; never `/tmp` |
| Detector misses a known secret type | Rule is in v2 deferral list, not v1 | File a v2 spec request; v1 is closed |
| Cursor returns `invalid_cursor` | Hand-decoded JSON edited and re-encoded | Use the server-emitted opaque string verbatim |
