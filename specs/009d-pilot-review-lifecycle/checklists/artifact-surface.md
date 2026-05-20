# Artifact Surface Evidence

Task: T004

Sources checked:
- `specs/009d-pilot-review-lifecycle/spec.md`
- `specs/009d-pilot-review-lifecycle/plan.md`
- `specs/009d-pilot-review-lifecycle/research.md`
- `specs/009d-pilot-review-lifecycle/quickstart.md`
- `specs/009d-pilot-review-lifecycle/contracts/pilot-review-packet.md`
- `src/lib/task-artifacts.ts`
- `src/app/api/task-artifacts/route.ts`
- `src/app/api/task-artifacts/[id]/route.ts`

## Packet Artifact Contract

JSON packet artifact:

- `artifact_type="pilot_review_packet_json"`
- `storage_kind="inline_json"`
- `mime="application/json"`
- `schema_version="spec-009d.packet.v1"`

Markdown packet artifact:

- `artifact_type="pilot_review_packet_markdown"`
- `storage_kind="inline_markdown"`
- `mime="text/markdown"`
- `schema_version="spec-009d.packet.v1"`
- Markdown must name the JSON artifact id or hash when both artifacts are persisted.

## Publication Seam

- Existing library seam: `publishArtifact()`.
- Existing route seam if route-mediated publication is needed: `POST /api/task-artifacts`.
- `src/lib/task-artifacts.ts` supports `inline_json` and `inline_markdown` storage through `getInlineContent()` and `publishArtifact()`.
- `src/app/api/task-artifacts/route.ts` forwards `task_id`, `artifact_type`, `storage_kind`, `mime`, `content`, `schema_version`, and `supersedes` into `publishArtifact()`.
- SPEC-009D must not add a packet-specific publication route.

## List And Read Inspection Seams

Existing reviewer discovery routes:

- `GET /api/task-artifacts?artifact_type=pilot_review_packet_json`
- `GET /api/task-artifacts?artifact_type=pilot_review_packet_markdown`

Existing reviewer read route:

- `GET /api/task-artifacts/[id]`

Route behavior verified from current code:

- Collection `GET /api/task-artifacts` requires admin role, resolves workspace scope, checks `FEATURE_TASK_ARTIFACTS`, filters by `artifact_type`, and returns `200 { rows }`.
- Item `GET /api/task-artifacts/[id]` requires viewer role, resolves workspace scope, masks cross-workspace non-Facility reads as `404 artifact_not_found`, checks `FEATURE_TASK_ARTIFACTS`, and returns metadata plus inline content for non-quarantined artifacts.
- Quarantined item reads return `423 artifact_locked` metadata stubs without content, preview text, storage URI, or actor identity unless an admin override is explicitly requested.
- Disabled artifact storage returns `503 artifact_store_disabled`.

## Metadata Compatibility

Existing artifact rows already expose the metadata SPEC-009D needs:

- `id`
- `task_id`
- `workspace_id`
- `artifact_type`
- `storage_kind`
- `storage_uri`
- `redaction_status`
- `security_scan_status`
- `sha256`
- `byte_size`
- `mime`
- `preview_text`
- `schema_version`
- `workflow_template_slug`
- `original_filename`
- `producer_agent_id`
- `supersedes_artifact_id`
- `created_at`

This satisfies the setup-level seam verification for JSON and Markdown packet inspection without adding a packet-specific route, new table, or new artifact enum.

## Verification Evidence

- T025 same-snapshot JSON/Markdown publication verification: passed through `pnpm exec vitest run src/lib/__tests__/pilot-review-packet.test.ts src/lib/__tests__/pilot-review-packet-artifacts.test.ts src/app/api/dispositions/__tests__/rollup.test.ts`; result was 3 passed files and 20 passed tests. The artifact test verifies both packet artifacts are published from the same packet snapshot and that Markdown names the JSON artifact id/hash.
- T035 local-only/incomplete artifact verification: passed in `pilot-review-packet.test.ts` and `pilot-review-packet-artifacts.test.ts`; local-only candidates are excluded and partial-proof packets publish as `incomplete` without claiming pilot completion.
- T041 generated packet artifact discovery/read verification: passed by keeping publication on `publishArtifact()` and by reusing existing task-artifact route behavior. Existing seam coverage also passed through `pnpm exec vitest run src/lib/__tests__/task-artifacts-publish.test.ts src/app/api/task-artifacts/__tests__/admin-actions.test.ts`; result was 2 passed files and 38 passed tests.

No packet-specific route, new list endpoint, schema migration, or new persisted artifact enum was added.

## Status

T004, T025, T035, and T041 artifact-surface evidence recorded. Packet inspection remains on existing SPEC-007 artifact publication/list/read seams.
