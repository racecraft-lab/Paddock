# SPEC-007 Data Model

**Feature**: SPEC-007 Disposition Logging and Task Artifact Store
**Date**: 2026-05-01
**Migrations**: ZERO. All entities below already exist on the live schema (SPEC-001 M053-M061).

This document enumerates the entities SPEC-007 reads or writes, their fields, validation rules, and state transitions. Schema citations reference live `src/lib/migrations.ts` lines.

---

## Entity 1: `task_dispositions` row (M057)

**Live schema**: `src/lib/migrations.ts:1549-1565`

```sql
CREATE TABLE IF NOT EXISTS task_dispositions (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  disposition TEXT NOT NULL,
  reason TEXT,
  triaged_by_agent_id INTEGER REFERENCES agents(id),
  triaged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id)
);
CREATE INDEX idx_task_dispositions_task_id ON task_dispositions(task_id);
CREATE INDEX idx_task_dispositions_workspace_triaged_at ON task_dispositions(workspace_id, triaged_at);
CREATE INDEX idx_task_dispositions_disposition ON task_dispositions(disposition);
```

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | INTEGER PK | yes | auto |
| `task_id` | INTEGER | yes | FK `tasks(id)` ON DELETE CASCADE |
| `disposition` | TEXT | yes | App-level enum (no DB CHECK); see below |
| `reason` | TEXT | no | Free text from agent output |
| `triaged_by_agent_id` | INTEGER | no | FK `agents(id)`. Set to the completing task's `agent_id` |
| `triaged_at` | TIMESTAMP | yes (default) | Use `unixepoch()` SQL default at INSERT — monotonic with throttle clock |
| `workspace_id` | INTEGER | yes | FK `workspaces(id)`. Set to the producer task's `workspace_id` |

### Application-level disposition enum

```ts
const DISPOSITIONS = [
  'merged','closed','rejected','rerouted',
  'duplicate','spam','completed','abandoned',
  'unknown',  // reserved — only the validation-failure path may insert this
] as const
```

Agent output is rejected if it contains `'unknown'` (FR-015). The validation-failure path is the sole writer of `'unknown'`.

### Validation rules

- **FR-010** triage-template detection: `workflow_templates.output_schema` contains a required top-level `disposition` field whose enum is exactly `['merged','closed','rejected','rerouted','duplicate','spam','completed','abandoned']`.
- **FR-011** insert exactly one row per triage-template completion.
- **FR-012** INSERT failure does NOT block task transition.
- **FR-013** validation failure → `disposition='unknown'` + `disposition_validation_failed` activity + Aegis FAIL.
- **FR-014** INSERT-error throttle: `WHERE type='disposition_insert_failed' AND entity_type='task' AND entity_id=? AND created_at >= unixepoch() - 60`.

### State transitions

A `task_dispositions` row is **append-only** in the FR-001-099 surface. Admin actions (FR-060+) do not mutate disposition rows. (Future specs may add archival; out of scope here.)

---

## Entity 2: `task_artifacts` row (M058)

**Live schema**: `src/lib/migrations.ts:1567-1599`

```sql
CREATE TABLE IF NOT EXISTS task_artifacts (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
  project_id INTEGER REFERENCES projects(id),
  producer_agent_id INTEGER REFERENCES agents(id),
  workflow_template_slug TEXT,
  artifact_type TEXT NOT NULL,
  schema_version TEXT,
  storage_kind TEXT NOT NULL CHECK (storage_kind IN ('inline_json','inline_markdown','file','external_uri')),
  content_json JSON,
  content_markdown TEXT,
  storage_uri TEXT,
  original_filename TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  sha256 TEXT,
  preview_text TEXT,
  redaction_status TEXT NOT NULL DEFAULT 'pending',
  security_scan_status TEXT NOT NULL DEFAULT 'pending',
  supersedes_artifact_id INTEGER REFERENCES task_artifacts(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_task_artifacts_task_created_at ON task_artifacts(task_id, created_at);
CREATE INDEX idx_task_artifacts_workspace_type ON task_artifacts(workspace_id, artifact_type);
CREATE INDEX idx_task_artifacts_workflow_template_slug ON task_artifacts(workflow_template_slug);
```

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | INTEGER PK | yes | auto |
| `task_id` | INTEGER | yes | FK `tasks(id)` ON DELETE CASCADE — producer task |
| `workspace_id` | INTEGER | yes | FK; producer task's workspace (FR-026) |
| `project_id` | INTEGER | no | FK `projects(id)` |
| `producer_agent_id` | INTEGER | no | FK `agents(id)` |
| `workflow_template_slug` | TEXT | no | Producer template slug |
| `artifact_type` | TEXT | yes | Free string e.g. `triage_decision`, `pr_diff`, `audit_report` |
| `schema_version` | TEXT | no | Caller-supplied for forward compat |
| `storage_kind` | TEXT | yes | DB CHECK: `inline_json`/`inline_markdown`/`file`/`external_uri`. Publish path REJECTS `external_uri` (FR-020); existing rows render normally on read |
| `content_json` | JSON | conditional | Required for `inline_json`; NULL otherwise |
| `content_markdown` | TEXT | conditional | Required for `inline_markdown`; NULL otherwise |
| `storage_uri` | TEXT | conditional | Required for `file` and existing `external_uri`; NULL for inline. RELATIVE TO `DATA_DIR` |
| `original_filename` | TEXT | no | Caller-supplied for files |
| `mime_type` | TEXT | yes | Allowlist enforced (FR-025) |
| `byte_size` | INTEGER | yes | UTF-8 bytes for inline, file size for `file` |
| `sha256` | TEXT | yes | Lowercase hex; canonical content addressing |
| `preview_text` | TEXT | yes | First 4 KiB UTF-8 post-redaction (text MIMEs); binary stub for binary MIMEs (FR-042) |
| `redaction_status` | TEXT | yes (default `'pending'`) | App enum (no DB CHECK) — see below |
| `security_scan_status` | TEXT | yes (default `'pending'`) | App enum (no DB CHECK) — see below |
| `supersedes_artifact_id` | INTEGER | no | FK `task_artifacts(id)` — predecessor row |
| `created_at` | TIMESTAMP | yes (default) | `CURRENT_TIMESTAMP` |

### Application-level enums (FR-029)

Exported from `src/lib/task-artifacts.ts`:

```ts
export const REDACTION_STATUSES = [
  'pending',
  'clean',
  'redacted',
  'rejected',
  'quarantined',
  'superseded',
] as const

export const SECURITY_SCAN_STATUSES = [
  'pending',
  'scanned_clean',
  'scanned_with_findings',
  'scan_error',
  'hash_mismatch',
  'file_missing',
] as const
```

The enums-snapshot test at `src/lib/__tests__/task-artifacts.enums.test.ts` asserts:
1. Exact ordered tuple contents.
2. `EXPLAIN` of `task_artifacts` confirms no DB CHECK exists on `redaction_status` or `security_scan_status`.
3. `EXPLAIN` confirms the `content_json` / `content_markdown` column split persists.
4. The `storage_kind` CHECK is preserved (expected and unrelated).

### Validation rules

- **FR-021** Inline ≤ 64 KiB UTF-8; > 64 KiB auto-promotes to `file`.
- **FR-024** File size ≤ 25 MiB (else HTTP 413).
- **FR-025** MIME in allowlist: `text/plain`, `text/markdown`, `application/json`, `application/x-yaml`, `application/pdf`, `image/png`, `image/jpeg`, `image/svg+xml`, `application/zip` (else HTTP 415).
- **FR-026** Workspace mismatch: non-Facility session whose `activeWorkspace` ≠ producer task's workspace → HTTP 403.
- **FR-029** Enum integrity: snapshot test failure (added/removed/reordered values, or DB CHECK introduced) blocks merge.

### State transitions for `redaction_status`

```text
pending ──────────► clean              (no findings)
        ──────────► redacted           (findings + allow_redacted_artifacts=1 + text MIME)
        ──────────► rejected           (publish failure or orphan-repair: file missing)
        ──────────► quarantined        (admin quarantine action)
        ──────────► superseded         (later row supersedes this one in single transaction)

quarantined ──────► <previous status>  (admin un-quarantine restores prior; before/after recorded in activities row)
```

### State transitions for `security_scan_status`

```text
pending ──────────► scanned_clean             (detector ran, no findings)
        ──────────► scanned_with_findings     (detector ran, findings ≥ 1, redact-and-store path)
        ──────────► scan_error                (detector threw; reserved — implementation MAY use 'pending' instead and retry)
        ──────────► hash_mismatch             (FR-067 hash-verify or FR-023 race-loser hash mismatch)
        ──────────► file_missing              (FR-068 orphan-repair finds DB row without file)
```

### Supersede transaction (FR-027)

```ts
db.transaction(() => {
  // Step 1: INSERT new row with supersedes_artifact_id = prev_id
  db.prepare('INSERT INTO task_artifacts (...) VALUES (...)').run(...)
  // Step 2: UPDATE prev row's redaction_status to 'superseded'
  db.prepare("UPDATE task_artifacts SET redaction_status='superseded' WHERE id=?").run(prev_id)
})()
```

The atomic file write (FR-022) for the new row's content MUST complete BEFORE this transaction begins. SQLite WAL guarantees readers see a pre-COMMIT snapshot, so successor dispatch never observes both rows non-superseded simultaneously.

---

## Entity 3: `workflow_templates.allow_redacted_artifacts` (M054)

**Live schema**: `src/lib/migrations.ts:1500-1521`

Per-template integer flag (`BOOLEAN NOT NULL DEFAULT 0`).

| Value | Meaning |
|---|---|
| `0` | Default. Reject any publish whose detector finds ≥ 1 secret. |
| `1` | If MIME is text-like (`text/*`, `application/json`, `application/x-yaml`) AND detector finds secrets, store the redacted content with `redaction_status='redacted'` and `security_scan_status='scanned_with_findings'`. |

**Binary MIMEs always reject regardless of this flag** (FR-034).

---

## Entity 4: `tasks.metadata.input_artifacts` (read by SPEC-007, owned at write time by `advanceTaskChain`)

The `tasks.metadata` JSON column is owned by SPEC-004's `task_pipeline` namespace plus generic dispatch fields. SPEC-007 attaches a sibling `input_artifacts` key under the SAME `metadata` JSON column.

### Shape (flag ON)

```ts
type SuccessorMetadata = {
  task_pipeline?: { /* SPEC-004 owned */ }
  input_artifacts: Array<{
    id: number
    type: string
    sha256: string
    preview_text: string
    storage_kind: 'inline_json' | 'inline_markdown' | 'file'
    byte_size: number
  }>
  // ... existing SPEC-004 sibling keys preserved
}
```

### Shape (flag OFF)

```ts
type SuccessorMetadata = {
  task_pipeline?: { /* SPEC-004 owned */ }
  // input_artifacts key MUST be absent — `'input_artifacts' in metadata === false`
  // Byte-compatible with src/lib/__tests__/__fixtures__/spec-004-dispatch-metadata-baseline.json
}
```

### Population rule (FR-040)

Selected from `task_artifacts` where `task_id = producer_task.id`, `redaction_status NOT IN ('superseded','quarantined')`, ordered by `created_at` ascending. Quarantined artifacts are silently skipped and an `artifact_skipped_quarantined_in_dispatch` activity row is written (FR-066).

---

## Entity 5: `activities` rows added by SPEC-007

SPEC-007 writes 14 new `activities.type` values. Schema reference: `activities.type` TEXT, `activities.entity_type` TEXT (`'task'` or `'artifact'`), `activities.entity_id` INTEGER, `activities.created_at` INTEGER (unix epoch), `activities.data` JSON.

### Throttled types (60 s window per FR-014, FR-032)

| Type | entity_type | Payload | Trigger |
|---|---|---|---|
| `disposition_insert_failed` | `task` | `{ task_id, error: string }` | FR-014: INSERT into `task_dispositions` raised an exception |
| `security_violation` | `task` | `{ task_id, mime, rule_ids: string[], finding_count }` | FR-032: detector finding count ≥ 1 (matched substrings NEVER included) |

### Unthrottled types — every event writes a row

| Type | entity_type | Payload | Trigger |
|---|---|---|---|
| `disposition_validation_failed` | `task` | `{ task_id, agent_output: object, validation_error: string }` | FR-013: agent output failed schema validation |
| `artifact_quarantined` | `artifact` | `{ artifact_id, actor_session_id, actor_user_id, reason, before_status, after_status }` | FR-063 admin action |
| `artifact_unquarantined` | `artifact` | as above | FR-063 |
| `artifact_deleted` | `artifact` | as above | FR-063 |
| `artifact_archived` | `artifact` | as above | FR-063 |
| `artifact_hash_verified` | `artifact` | `{ artifact_id, actor_*, expected_sha256, actual_sha256, mismatch: boolean }` | FR-067 |
| `artifact_hash_verification_failed` | `artifact` | `{ artifact_id, expected_sha256, actual_sha256 }` | FR-023 race-loser hash mismatch (HTTP 500 path) |
| `artifact_repaired_orphan` | `artifact` | `{ artifact_id?, file_path?, direction: 'db_no_file' | 'file_no_db', new_status }` | FR-068 |
| `artifact_previews_rebuilt` | `artifact` | `{ count: number, actor_* }` | FR-062 batch rebuild |
| `artifact_retention_swept` | `artifact` | `{ workspace_id, archived: number, deleted: number, kept: number, actor_* }` | FR-069 manual sweep |
| `artifact_skipped_quarantined_in_dispatch` | `task` | `{ successor_task_id, skipped_artifact_ids: number[] }` | FR-066 |
| `artifact_quarantined_read_overridden` | `artifact` | `{ artifact_id, actor_session_id, actor_user_id, requested_at }` | FR-065 — privileged read; **NEVER throttled** (NIST SP 800-53 AU-2/3/12) |

---

## Entity 6: In-process p95 ring buffer (NOT persisted)

Owned by `src/lib/task-artifacts.ts`. Process-local; resets on process restart.

```ts
type RingBuffer = {
  publish: number[]  // length ≤ 1024, FIFO
  read: number[]     // length ≤ 1024, FIFO
}
const ringBuffers: Map<number /* workspace_id */, RingBuffer> = new Map()
```

Public API:
- `recordPublishLatency(workspaceId: number, ms: number): void` — append, drop oldest if length > 1024.
- `recordReadLatency(workspaceId: number, ms: number): void` — append, drop oldest if length > 1024.
- `getP95Latencies(workspaceId: number): { publish: number | 'insufficient_data', read: number | 'insufficient_data' }` — returns p95 (95th percentile by `arr[Math.floor(arr.length * 0.95) - 1]` after sort) when `arr.length >= 100`, else `'insufficient_data'`.

Surface: admin panel metrics tile (FR-064).

---

## Entity 7: Cursor pagination opaque token

Owned by the FR-051 / FR-080 endpoints. Not persisted.

```ts
type Cursor = {
  triaged_at: number  // unix epoch seconds
  id: number          // task_dispositions.id
}

// Wire form
const wireCursor = base64url(JSON.stringify(cursorObj))

// Decoding
function decodeCursor(s: string): Cursor {
  try {
    const json = Buffer.from(s, 'base64url').toString('utf8')
    const parsed = JSON.parse(json)
    if (typeof parsed.triaged_at !== 'number' || typeof parsed.id !== 'number') {
      throw new Error('invalid_cursor')
    }
    return parsed as Cursor
  } catch {
    throw new HttpError(400, 'invalid_cursor')
  }
}
```

Server query: `WHERE workspace_id = ? AND (triaged_at, id) < (?, ?) ORDER BY triaged_at DESC, id DESC LIMIT ?`.

Response shape: `{ rows: Array<...>, next_cursor: string | null, has_more: boolean }`. `has_more === true ⇔ next_cursor !== null`.

---

## Cross-cutting validation

| Rule | Source | Enforcement |
|---|---|---|
| Both flags resolve through `resolveFlag(name, { workspaceId })` | FR-001/FR-002 | CI grep against `process.env.FEATURE_DISPOSITION_LOGGING`/`process.env.FEATURE_TASK_ARTIFACTS` |
| Detector regex `safe-regex` clean | FR-035 | Test-load assertion in `secret-detector.test.ts` |
| 6 strict-scope files exactly | FR-100 | Strict-scope grep test against PR diff |
| No `tasks.input` column written | FR-040 | Schema is the enforcement; column does not exist |
| `external_uri` rejected at publish | FR-020 | Test contract |

---

## Schema citations summary

| Migration | Lines | Purpose |
|---|---|---|
| M054 | `src/lib/migrations.ts:1500-1521` | `workflow_templates.allow_redacted_artifacts` (+ SPEC-004 columns) |
| M057 | `src/lib/migrations.ts:1549-1565` | `task_dispositions` table |
| M058 | `src/lib/migrations.ts:1567-1599` | `task_artifacts` table |
| Existing | `src/lib/migrations.ts:460` | `idx_activities_entity` used by throttle predicate |
