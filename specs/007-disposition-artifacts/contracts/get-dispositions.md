# Contract: `GET /api/dispositions`

**Source files**: `src/app/api/dispositions/route.ts` (NEW)
**Spec references**: FR-001 (flag), FR-080, FR-081, FR-051 (cursor format reused), API Error Code Matrix (spec.md lines 304-326)

## Purpose

Generic, stable disposition-row read API for downstream consumers (custom dashboards, ad-hoc queries, audit panels). Decoupled from any consumer-specific naming.

## Authentication

Same pattern as `/api/activities` (existing project convention). Same 401/403 behavior.

## Feature flag gate

Resolved via `resolveFlag('FEATURE_DISPOSITION_LOGGING', { workspaceId })`. With flag OFF → HTTP 503.

## Request

### Query parameters

| Param | Required | Type | Notes |
|---|---|---|---|
| `workspace_id` | required for non-Facility callers | integer | Facility-scoped sessions may omit. Non-Facility call without it → 400 |
| `disposition` | optional | repeating string | Multi-select; e.g. `?disposition=closed&disposition=rejected` |
| `since` | optional | ISO 8601 timestamp | Inclusive lower bound on `triaged_at` |
| `until` | optional | ISO 8601 timestamp | Exclusive upper bound on `triaged_at` |
| `triaged_by_agent_id` | optional | integer | Filter by agent |
| `task_id` | optional | integer | Exact match on `task_id` |
| `cursor` | optional | base64url string | Opaque pagination cursor |
| `limit` | optional | integer | Default 50, max 200 |

### Cursor format (FR-051 reused)

```ts
type Cursor = { triaged_at: number; id: number }
const wireCursor = base64url(JSON.stringify(cursor))
```

Server decodes and applies `WHERE workspace_id = ? AND (triaged_at, id) < (?, ?) ORDER BY triaged_at DESC, id DESC LIMIT ?`.

Malformed cursor → HTTP 400 `invalid_cursor`.

## Successful response (HTTP 200)

```json
{
  "rows": [
    {
      "id": 1234,
      "task_id": 5678,
      "disposition": "closed",
      "reason": "duplicate of #123",
      "triaged_by_agent_id": 12,
      "triaged_at": 1714579200,
      "workspace_id": 7
    }
  ],
  "next_cursor": "eyJ0cmlhZ2VkX2F0IjoxNzE0NTc5MjAwLCJpZCI6MTIzNH0",
  "has_more": true
}
```

Invariant: `has_more === true ⇔ next_cursor !== null`. When `has_more === false`, `next_cursor === null`.

## Error responses

Per spec.md API Error Code Matrix:

| Status | Error code | Trigger | Body |
|---|---|---|---|
| 400 | `workspace_id_required` | Non-Facility caller omitted `workspace_id` | `{ "error": "workspace_id_required" }` |
| 400 | `invalid_cursor` | Malformed `cursor` parameter | `{ "error": "invalid_cursor" }` |
| 400 | `bad_request` | Other malformed parameter (e.g. invalid `since` ISO) | `{ "error": "bad_request", "details": ["since must be ISO 8601"] }` |
| 401 | `unauthenticated` | Missing/invalid auth | `{ "error": "unauthenticated" }` |
| 403 | `workspace_forbidden` | Caller cannot read the requested workspace | `{ "error": "workspace_forbidden" }` |
| 503 | `disposition_logging_disabled` | `FEATURE_DISPOSITION_LOGGING` resolves OFF | `{ "error": "disposition_logging_disabled" }` |

## Side effects

NONE. Read-only endpoint. No activity rows. No metrics writes.

## Rate limiting

NONE in v1. Existing API-key gating is the only access control. FR-081 explicitly defers rate limiting to a future spec informed by observed usage.

## Idempotency

Read-only. Trivially idempotent.

## Test expectations

Contract tests in `src/app/api/dispositions/__tests__/route.test.ts`:

| Scenario | Expected |
|---|---|
| Flag OFF | 503 + `disposition_logging_disabled` |
| Unauthenticated | 401 |
| Non-Facility, no `workspace_id` | 400 + `workspace_id_required` |
| Facility-scoped, no `workspace_id` | 200 (cross-workspace results) |
| Multi-select `disposition` | only matching rows returned |
| `since` + `until` window | only rows in range |
| `task_id=12345` | exact match returned |
| Cursor pagination round-trip (250 rows, page size 50) | 5 pages, stable order, last page `has_more=false` |
| Malformed cursor (not base64url) | 400 + `invalid_cursor` |
| Malformed cursor (bad JSON inside) | 400 + `invalid_cursor` |
| Workspace forbidden | 403 + `workspace_forbidden` |
| `limit` exceeds 200 | clamped to 200 |
| Default `limit` | 50 rows returned |

## Cursor pagination contract test (key shape assertion)

```ts
test('cursor round-trip preserves stable order', async () => {
  // Seed 250 rows
  // Fetch page 1, capture next_cursor
  // Fetch page 2 with cursor; assert no overlap, no skip
  // Continue until has_more=false
  // Assert total rows seen equals 250 with no duplicates
})
```
