# Contract: `POST /api/task-artifacts`

**Source files**: `src/app/api/task-artifacts/route.ts` (NEW), `src/lib/task-artifacts.ts` (NEW, strict scope)
**Spec references**: FR-002, FR-020-FR-029, FR-032-FR-035, FR-090 (Aegis hook), API Error Code Matrix (spec.md lines 304-326)

## Purpose

Publish a task artifact (inline JSON, inline Markdown, or file) into the secret-scanned, content-addressed store. Used by agents to hand off outputs to successor tasks via `metadata.input_artifacts` (FR-040).

## Authentication

Same pattern as `/api/activities` (existing project convention). Session cookie OR `X-API-Key` header.

## Feature flag gate

Resolved via `resolveFlag('FEATURE_TASK_ARTIFACTS', { workspaceId })` from the producer task's `workspace_id`. With flag OFF → HTTP 503.

## Request

### Headers

- `Content-Type: application/json` (for `inline_json`/`inline_markdown` and metadata-only path), OR `multipart/form-data` (for `file` path).
- `Authorization` / `X-API-Key` per project convention.

### Body — JSON (inline kinds)

```json
{
  "task_id": 12345,
  "artifact_type": "triage_decision",
  "storage_kind": "inline_json",
  "content": { "disposition": "closed", "reason": "duplicate of #123" },
  "mime": "application/json",
  "schema_version": "1.0.0",
  "supersedes": 678
}
```

### Body — multipart/form-data (file kind)

| Part | Required | Notes |
|---|---|---|
| `task_id` | yes | integer |
| `artifact_type` | yes | string |
| `storage_kind` | yes | literal `"file"` |
| `mime` | yes | must be in allowlist |
| `schema_version` | no | string |
| `supersedes` | no | integer |
| `file` | yes | binary; ≤ 25 MiB |

### Field validation

| Field | Constraint |
|---|---|
| `task_id` | INTEGER, references existing tasks row in caller-readable workspace |
| `artifact_type` | non-empty string ≤ 64 chars |
| `storage_kind` | one of `inline_json`, `inline_markdown`, `file` (NOT `external_uri` — 400) |
| `mime` | one of: `text/plain`, `text/markdown`, `application/json`, `application/x-yaml`, `application/pdf`, `image/png`, `image/jpeg`, `image/svg+xml`, `application/zip` |
| `content` | required for inline kinds; type matches `mime`; UTF-8 size ≤ 64 KiB OR auto-promotes to `file` |
| `file` | required for `storage_kind=file`; ≤ 25 MiB |
| `supersedes` | optional INTEGER; must be a non-quarantined existing artifact id |

## Successful response (HTTP 201)

```json
{
  "id": 9001,
  "task_id": 12345,
  "workspace_id": 7,
  "artifact_type": "triage_decision",
  "storage_kind": "inline_json",
  "mime_type": "application/json",
  "byte_size": 89,
  "sha256": "a1b2c3...",
  "preview_text": "{\"disposition\":\"closed\",\"reason\":\"...\"}",
  "redaction_status": "clean",
  "security_scan_status": "scanned_clean",
  "supersedes_artifact_id": null,
  "created_at": 1714579200
}
```

For redact-and-store path: `redaction_status='redacted'`, `security_scan_status='scanned_with_findings'`.

## Error responses

Per spec.md API Error Code Matrix:

| Status | Error code | Trigger | Body |
|---|---|---|---|
| 400 | `external_uri_rejected` | `storage_kind='external_uri'` | `{ "error": "external_uri_rejected" }` |
| 400 | `bad_request` | Missing/malformed required field | `{ "error": "bad_request", "details": ["mime is required"] }` |
| 401 | `unauthenticated` | Missing/invalid auth | `{ "error": "unauthenticated" }` |
| 403 | `workspace_mismatch` | Non-Facility session, `activeWorkspace` ≠ producer workspace | `{ "error": "workspace_mismatch" }` |
| 409 | `cannot_supersede_quarantined` | `supersedes` target has `redaction_status='quarantined'` | `{ "error": "cannot_supersede_quarantined", "supersedes_id": 678 }` |
| 413 | `payload_too_large` | File > 25 MiB | `{ "error": "payload_too_large", "limit_bytes": 26214400 }` |
| 415 | `unsupported_media_type` | MIME not in allowlist | `{ "error": "unsupported_media_type", "mime": "text/x-python" }` |
| 422 | `secret_detected` | Detector findings ≥ 1 AND (template not opt-in OR binary MIME) | `{ "error": "secret_detected", "redacted_preview": "<...>", "findings": 2 }` |
| 422 | `redaction_would_empty_artifact` | Redaction substitution leaves zero non-whitespace bytes | `{ "error": "redaction_would_empty_artifact" }` |
| 500 | `artifact_hash_verification_failed` | FR-023 race-loser hash mismatch (extremely rare) | `{ "error": "artifact_hash_verification_failed" }` |
| 503 | `artifact_store_disabled` | `FEATURE_TASK_ARTIFACTS` resolves OFF | `{ "error": "artifact_store_disabled" }` |

## Side effects

1. Detector runs against `content` or file bytes (FR-030).
2. On findings ≥ 1: `security_violation` activity row written, throttled (FR-032).
3. Atomic file write protocol (FR-022) for `storage_kind=file`: temp under `<DATA_DIR>/artifacts/<wid>/<yyyy>/<mm>/.tmp.<sha256>.<pid>.<rand>`, fsync, `fs.link()` to canonical, fsync parent dir, then INSERT row.
4. On `supersedes` provided: single `db.transaction(() => { INSERT new + UPDATE old SET redaction_status='superseded' })()` (FR-027).
5. On success: append latency to publish ring buffer (FR-028).
6. On any successful storage: audit-panel rollups invalidate as appropriate.

## Idempotency

Two concurrent publishes of identical content (same sha256) MUST result in:
- Canonical file written exactly once (`fs.link()` EEXIST loser path per FR-023).
- Both rows INSERTed pointing at the same `storage_uri`.
- Both responses HTTP 201 with distinct `id`s.

## Test expectations

Contract tests in `src/lib/__tests__/task-artifacts.test.ts`:

| Scenario | Expected |
|---|---|
| Flag OFF | 503 + `artifact_store_disabled` |
| inline_json happy | 201, row written to `content_json`, `content_markdown` NULL |
| inline_markdown happy | 201, row written to `content_markdown`, `content_json` NULL |
| 70 KiB string auto-promote | 201, `storage_kind='file'`, file at canonical path |
| File 26 MiB | 413 |
| MIME `text/x-python` | 415 |
| `storage_kind='external_uri'` | 400 |
| Workspace mismatch (non-Facility) | 403 |
| Workspace mismatch (Facility-scoped) | 201 (allowed across workspaces) |
| Detector finds AKIA key, no opt-in | 422 + redacted_preview |
| Detector finds GitHub PAT, opt-in + text/markdown | 201 + `redaction_status='redacted'` |
| Detector finds secret in PDF, opt-in | 422 (binaries always reject) |
| Republish with `supersedes` | 201 + prev row `redaction_status='superseded'` (single transaction) |
| Republish supersedes a quarantined target | 409 |
| Concurrent identical content | both 201, one canonical file |
