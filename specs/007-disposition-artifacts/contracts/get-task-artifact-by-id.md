# Contract: `GET /api/task-artifacts/[id]`

**Source files**: `src/app/api/task-artifacts/[id]/route.ts` (NEW), `src/lib/task-artifacts.ts` (NEW, strict scope)
**Spec references**: FR-002, FR-041, FR-064, FR-065, API Error Code Matrix (spec.md lines 304-326)

## Purpose

Read raw artifact content for an authorized caller. Successor agents and operators use this; agents NEVER receive raw content in dispatch payloads (FR-041 — only `preview_text`).

## Authentication

Same pattern as `/api/activities` (existing project convention).

## Feature flag gate

Resolved via `resolveFlag('FEATURE_TASK_ARTIFACTS', { workspaceId })` from the artifact's `workspace_id`. With flag OFF → HTTP 503.

## Request

### Path parameters

- `id` (integer, required) — `task_artifacts.id`

### Query parameters

- `include_quarantined` (optional, `0`/`1`, default `0`) — admin-only override to read quarantined artifacts. Non-admin requests are ignored when set.

### Headers

- `Authorization` / `X-API-Key` per project convention.

## Successful response (HTTP 200)

For inline kinds: response body is the inline content with `Content-Type` matching `task_artifacts.mime_type`.
- `inline_json` → response body is the JSON content (`Content-Type: application/json`).
- `inline_markdown` → response body is the Markdown text (`Content-Type: text/markdown`).
- `file` → response body is the file bytes (`Content-Type` from `mime_type`); `Content-Disposition: attachment; filename="<original_filename>"` if present.

Headers always include:
- `X-Artifact-Id`
- `X-Artifact-SHA256`
- `X-Artifact-Redaction-Status`
- `X-Artifact-Security-Scan-Status`

## Error responses

Per spec.md API Error Code Matrix:

| Status | Error code | Trigger | Body |
|---|---|---|---|
| 401 | `unauthenticated` | Missing/invalid auth | `{ "error": "unauthenticated" }` |
| 403 | `workspace_forbidden` | Caller cannot read this workspace (non-Facility, mismatched activeWorkspace) | `{ "error": "workspace_forbidden" }` |
| 404 | `artifact_not_found` | Id doesn't exist or row's workspace not visible to caller | `{ "error": "artifact_not_found" }` |
| 423 | `artifact_locked` | `redaction_status='quarantined'` AND (no `?include_quarantined=1` OR not admin) | `{ "error": "artifact_locked", "artifact_id": 9001 }` (metadata-only, NO content) |
| 503 | `artifact_store_disabled` | `FEATURE_TASK_ARTIFACTS` resolves OFF | `{ "error": "artifact_store_disabled" }` |

### 423 body shape

The 423 metadata-only stub includes the artifact id and basic metadata for operator orientation, but NO `content`/`storage_uri` and NO file bytes:

```json
{
  "error": "artifact_locked",
  "artifact_id": 9001,
  "redaction_status": "quarantined",
  "mime_type": "application/json",
  "byte_size": 89,
  "sha256": "a1b2c3..."
}
```

## Side effects

1. On success (200): append latency to read ring buffer (per `recordReadLatency` in `task-artifacts.ts`).
2. On admin override read (`?include_quarantined=1` AND caller is admin AND artifact is quarantined): write **UNTHROTTLED** `artifact_quarantined_read_overridden` activity row with payload `{ artifact_id, actor_session_id, actor_user_id, requested_at: unixepoch() }` (FR-065). This is the ONLY case where reads write activities.
3. Hash verification is NOT performed on every read (admin-triggered only via separate path).

## Audit logging

The `artifact_quarantined_read_overridden` activity row is written EVERY time the override path returns 200 — never throttled. Constitutional source: Principle X (durable record of governance crossings) + NIST SP 800-53 AU-2/3/12 (unconditional privileged-access logging).

## Test expectations

Contract tests in `src/lib/__tests__/task-artifacts.test.ts`:

| Scenario | Expected |
|---|---|
| Flag OFF | 503 + `artifact_store_disabled` |
| Unauthenticated | 401 |
| Authenticated non-Facility, wrong workspace | 403 + `workspace_forbidden` |
| Id doesn't exist | 404 + `artifact_not_found` |
| `inline_json` clean | 200 + JSON body + headers populated |
| `inline_markdown` clean | 200 + Markdown body |
| `file` PDF clean | 200 + binary body + `Content-Disposition` |
| Quarantined, no `?include_quarantined=1` | 423 + metadata stub |
| Quarantined, `?include_quarantined=1`, non-admin | 423 (override ignored) |
| Quarantined, `?include_quarantined=1`, admin | 200 + `artifact_quarantined_read_overridden` activity row written |
| 5 sequential admin overrides on same artifact | 5 activity rows (UNTHROTTLED — FR-065) |
| 100 successful reads | publish ring buffer length 100; admin metrics tile shows numeric p95 |

## Strict-scope note

The route file `src/app/api/task-artifacts/[id]/route.ts` is NOT in strict scope. The library `src/lib/task-artifacts.ts` IS in strict scope and owns the read path, hash verification, and the override audit-write helper.
