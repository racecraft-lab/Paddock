# Feature Specification: SPEC-007 Disposition Logging and Task Artifact Store

**Feature Branch**: `007-disposition-artifacts`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "SPEC-007 — Add disposition logging for triage-template completions and a secret-scanned artifact handoff plane between agent sandboxes, gated by `FEATURE_DISPOSITION_LOGGING` and `FEATURE_TASK_ARTIFACTS`."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Flag-OFF Parity Preserves Existing Behavior (Priority: P1)

When both `FEATURE_DISPOSITION_LOGGING` and `FEATURE_TASK_ARTIFACTS` are OFF for a workspace, the system behaves byte-compatibly with SPEC-004: no `task_dispositions` rows are inserted, no successor dispatch payload includes an `input_artifacts` key, and the publish API returns 503 (service unavailable). This guarantees a clean, instant rollback path that does not lose previously stored evidence.

**Why this priority**: Rollback safety is the foundation of the rollout strategy. Without verifiable byte-compatibility when flags are OFF, operators cannot deploy the change with confidence that disabling a flag fully unwinds the new behavior. Both schemas (M057, M058) already exist, so the only behavioral guarantee in this state is "do nothing observable."

**Independent Test**: With both flags resolving to OFF (default), drive a triage-template task to completion via `advanceTaskChain` and assert: (a) zero rows inserted into `task_dispositions`, (b) successor task `input` JSON is byte-identical to the SPEC-004 baseline (no `input_artifacts` key), (c) `POST /api/task-artifacts` returns HTTP 503. Run an EXPLAIN QUERY PLAN diff against the SPEC-004 dispatch baseline to confirm no query-plan drift.

**Acceptance Scenarios**:

1. **Given** both flags OFF in workspace W and a triage-template task T1 about to complete, **When** `advanceTaskChain` commits T1, **Then** no row is inserted into `task_dispositions` for T1, no `activities` row of `kind='disposition_*'` is written, and the successor task T2's `input` JSON contains no `input_artifacts` key.
2. **Given** both flags OFF in workspace W, **When** an agent calls `POST /api/task-artifacts`, **Then** the response is HTTP 503 with a stable error body indicating the artifact store is disabled, and no row is inserted into `task_artifacts`.
3. **Given** both flags OFF, **When** the audit panel loads the "Dispositions" tab, **Then** the tab renders an empty-state message but does not error, and the dashboard widget renders "no data" without polling failures.

---

### User Story 2 - Disposition Insert After Triage Completion (Priority: P1)

When `FEATURE_DISPOSITION_LOGGING` is ON for a workspace, every triage-template completion records exactly one row in `task_dispositions` (M057) with `disposition`, `reason`, `triaged_by_agent_id`, `triaged_at`, and `workspace_id`. A "triage template" is detected by inspecting `workflow_templates.output_schema` for a required top-level `disposition` field whose enum is the closed set `['merged','closed','rejected','rerouted','duplicate','spam','completed','abandoned']`. The insert runs in its own try/catch *after* `advanceTaskChain` commits the task transition, so an INSERT failure never blocks task advancement.

**Why this priority**: Disposition logging is the foundation of all downstream surfaces — audit panel, dashboard widget, generic API. Without reliable, deterministic inserts, every other story degrades. The "after-transaction insert" pattern matches SPEC-006's `label_provisioning_failed` reliability discipline.

**Independent Test**: With `FEATURE_DISPOSITION_LOGGING=ON`, complete a triage-template task whose agent output includes `{disposition: 'closed', reason: '...'}`. Assert: (a) one row in `task_dispositions` with the expected fields, (b) the row's `triaged_by_agent_id` matches the completing task's `agent_id`, (c) `triaged_at` is within ±2s of the task transition commit time, (d) the task transition itself succeeded regardless of disposition path.

**Acceptance Scenarios**:

1. **Given** `FEATURE_DISPOSITION_LOGGING=ON` and triage-template task T with valid agent output `{disposition: 'closed', reason: 'duplicate of #123'}`, **When** `advanceTaskChain(T)` commits, **Then** exactly one row exists in `task_dispositions` with `disposition='closed'`, `reason='duplicate of #123'`, `triaged_by_agent_id=T.agent_id`, `workspace_id=T.workspace_id`.
2. **Given** the agent output is missing the `disposition` field or contains a value outside the closed enum, **When** `advanceTaskChain(T)` commits, **Then** a row is still inserted with `disposition='unknown'`, an `activities` row of `kind='disposition_validation_failed'` is written with the full payload, and the producer's Aegis quality_review fails with `reason='disposition_validation_failed'`.
3. **Given** the disposition INSERT fails with a database error, **When** `advanceTaskChain(T)` commits, **Then** the task transition itself succeeds, an `activities` row of `kind='disposition_insert_failed'` is written (throttled to max 1 per `(task_id, kind)` per 60 seconds), and no exception propagates to the dispatcher.
4. **Given** a non-triage template (no required `disposition` field in `output_schema`), **When** `advanceTaskChain` commits, **Then** no `task_dispositions` row is inserted and no validation activity is written.

---

### User Story 3 - Artifact Publish (Inline + File-Backed) (Priority: P1)

When `FEATURE_TASK_ARTIFACTS` is ON, agents can publish JSON, Markdown, or file outputs through `publishArtifact({ task_id, artifact_type, storage_kind, content|file, mime, schema_version?, supersedes? })`. Inline content ≤ 64 KiB (UTF-8 encoded) stays inline; > 64 KiB auto-promotes to file storage. File-backed artifacts are written atomically (write-temp + fsync + rename + parent-dir fsync) under `<DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/<sha256>.<ext>`. The DB row is INSERTed only after rename success. `external_uri` publishes are rejected with HTTP 400. Files > 25 MiB return 413; non-allowlisted MIMEs return 415. Producer task's `workspace_id` wins; if `session.activeWorkspace` differs and the session is non-Facility, the publish returns 403.

**Why this priority**: A durable, crash-safe, workspace-isolated artifact store is the prerequisite for every successor handoff and admin operation. Without atomic writes and content-addressed paths, partial files would corrupt downstream consumers; without size/MIME limits, the store becomes an attack surface.

**Independent Test**: With `FEATURE_TASK_ARTIFACTS=ON`, publish (a) a 1 KiB inline JSON, (b) a 70 KiB string that auto-promotes to file, (c) a 24 MiB PDF file, (d) a 26 MiB file (expect 413), (e) an `external_uri` request (expect 400), (f) a `text/x-python` request (expect 415). Assert that file-backed publishes write to the canonical sharded path with sha256-hash filenames, that the DB row exists *only* after the rename, and that crash-during-write leaves a `.tmp.*` sibling, never a partial canonical file.

**Acceptance Scenarios**:

1. **Given** `FEATURE_TASK_ARTIFACTS=ON` and a 1 KiB JSON publish from producer task P in workspace W, **When** `publishArtifact` is called, **Then** a row is inserted with `storage_kind='inline_json'`, `content` populated, `byte_size=1024`, `redaction_status='clean'`, and the inline content is the original JSON.
2. **Given** a 70 KiB string publish, **When** `publishArtifact` is called, **Then** the row's `storage_kind='file'`, `storage_uri='artifacts/<workspace_id>/<yyyy>/<mm>/<sha256>.json'` (relative to `DATA_DIR`), the file exists at the canonical path, and the inline `content` field is null.
3. **Given** a publish whose `storage_kind='external_uri'`, **When** the API receives it, **Then** the response is HTTP 400 and no row or file is created. Existing `external_uri` rows continue to render normally on read.
4. **Given** a 26 MiB file publish, **When** the API receives it, **Then** the response is HTTP 413 and no row or file is created.
5. **Given** a publish with MIME outside the allowlist (`text/plain`, `text/markdown`, `application/json`, `application/x-yaml`, `application/pdf`, `image/png`, `image/jpeg`, `image/svg+xml`, `application/zip`), **When** the API receives it, **Then** the response is HTTP 415.
6. **Given** a session whose `activeWorkspace=W2` but the producer task belongs to `W1`, and the session is non-Facility, **When** `publishArtifact` is called, **Then** the response is HTTP 403 and no row or file is created. If the session is Facility-scoped, the publish proceeds and is stored under `W1`.
7. **Given** a republish with `supersedes: <prev_id>`, **When** the new publish succeeds, **Then** a new row is inserted with `supersedes_artifact_id=<prev_id>`, the previous row's `redaction_status` becomes `'superseded'`, and the audit-panel artifact view renders the full chain.
8. **Given** two concurrent publishes from different producers writing identical content (same sha256), **When** both succeed, **Then** the canonical file is written exactly once, both rows are inserted with the same `storage_uri`, and a hash verification on either row passes.

---

### User Story 4 - Secret Detection and Redaction Gate (Priority: P1)

The system runs every artifact through `detectSecrets(content, mime)` from `src/lib/secret-detector.ts` before any storage write. The detector ships rules sourced from gitleaks v8.18.0 plus MC additions covering AWS keys, GitHub tokens, Google API keys, Slack tokens, Stripe keys, PEM private keys, generic env-style secrets, JWTs, Bearer headers, Anthropic and OpenAI keys. A finding count ≥ 1 rejects the publish with HTTP 422 and a redacted preview by default; an `activities` row of `kind='security_violation'` is written (throttled max 1 per `(task_id, kind)` per 60s). When `workflow_templates.allow_redacted_artifacts=1` (M054) AND the MIME is text-like (`text/*`, `application/json`, `application/x-yaml`), the redacted content is stored with `redaction_status='redacted'` and `security_scan_status='scanned_with_findings'`. Binaries with findings always reject regardless of the flag.

**Why this priority**: This is the security floor for the whole artifact plane. Every successor consumption, every operator preview, every admin export inherits its safety from this single gate. Failing this gate quietly would leak credentials between workspaces.

**Independent Test**: Run a per-rule fixture set (≥ 1 positive + ≥ 1 negative per rule) plus a "wild corpus" of ≥ 50 mixed strings; assert recall ≥ 0.95 on the wild corpus. Drive (a) a publish with `AKIA...` in content (expect 422 + redacted preview + activity), (b) the same publish on a template with `allow_redacted_artifacts=1` and `text/markdown` MIME (expect 200 + `redaction_status='redacted'`), (c) the same secret embedded in a PDF on a redact-allowed template (expect 422 — binaries always reject). Assert all rule patterns pass `safe-regex` validation in CI.

**Acceptance Scenarios**:

1. **Given** a publish whose content matches an AWS access key id rule (`AKIA[0-9A-Z]{16}`), **When** the detector runs, **Then** the publish returns HTTP 422 with a redacted preview, an `activities` row of `kind='security_violation'` is written, and no row or file is stored.
2. **Given** a burst of 100 retries of the same rejected publish within 60 seconds, **When** each retry runs the detector, **Then** at most 1 `security_violation` activity row is written within the 60s window for that `(task_id, kind)`, and a counter exposed in the admin panel shows "violations attempted but throttled" preserving the signal.
3. **Given** the producer's `workflow_templates.allow_redacted_artifacts=1` AND MIME is `text/markdown` AND the content contains a GitHub PAT, **When** `publishArtifact` is called, **Then** the redacted content is stored, `redaction_status='redacted'`, `security_scan_status='scanned_with_findings'`, and the GitHub PAT in the redacted bytes is replaced by a stable placeholder.
4. **Given** the producer template has `allow_redacted_artifacts=1` AND MIME is `application/pdf` AND the binary contains a secret, **When** `publishArtifact` is called, **Then** the response is HTTP 422 (binaries always reject) and an `activities` row of `kind='security_violation'` is written.
5. **Given** the wild corpus of ≥ 50 secret-bearing lines, **When** the recall test runs, **Then** the detector flags ≥ 95% of lines, and CI fails on lower recall or on `safe-regex` rejecting any rule.

---

### User Story 5 - Successor Consumes Artifact References (Priority: P1)

When `FEATURE_TASK_ARTIFACTS=ON`, the successor dispatched by `advanceTaskChain` receives an `input_artifacts` array in `task.input`, populated from the producer task's latest non-superseded, non-quarantined `task_artifacts` rows. Each entry carries `{ id, type, sha256, preview_text, storage_kind, byte_size }`. `preview_text` is the first 4 KiB of UTF-8-decoded post-redaction content for text-like MIMEs, or `'(binary, ${byte_size} bytes, sha256=${sha256.slice(0,12)})'` for binary MIMEs. Raw content is available *only* via `GET /api/task-artifacts/[id]` with auth. With the flag OFF, the dispatch payload is byte-compatible with SPEC-004 and contains no `input_artifacts` key.

**Why this priority**: Successor handoff is the operational reason the artifact plane exists. Successor agents must NEVER read another agent's private sandbox; the `input_artifacts` contract is how they discover what their predecessor produced safely. The flag-OFF byte compatibility check protects rollback.

**Independent Test**: With `FEATURE_TASK_ARTIFACTS=ON`, publish two artifacts (one inline JSON, one binary PDF) for producer task P, then drive the chain to dispatch successor S. Assert `S.input.input_artifacts` is an array of two entries with the correct shape, `preview_text` is post-redaction for the JSON, and the binary entry uses the binary stub. Quarantine one artifact and re-run; assert it is silently skipped from the successor's array. Run a publish-then-republish pair; assert only the latest non-superseded version appears.

**Acceptance Scenarios**:

1. **Given** `FEATURE_TASK_ARTIFACTS=ON` and producer task P with two non-superseded, non-quarantined artifacts (one `inline_json`, one `file` PDF), **When** `advanceTaskChain` dispatches successor S, **Then** `S.input.input_artifacts` is `[{id, type, sha256, preview_text, storage_kind:'inline_json', byte_size}, {id, type, sha256, preview_text:'(binary, ...)' , storage_kind:'file', byte_size}]`.
2. **Given** producer task P has an artifact A1 published, then A2 published with `supersedes=A1`, **When** successor S is dispatched, **Then** `S.input.input_artifacts` contains only A2; A1 is excluded as superseded.
3. **Given** producer task P has an artifact that an admin quarantined, **When** successor S is dispatched, **Then** the quarantined artifact is silently skipped from `input_artifacts` and an `activities` row records the skip.
4. **Given** `FEATURE_TASK_ARTIFACTS=OFF`, **When** `advanceTaskChain` dispatches successor S, **Then** `S.input` JSON has no `input_artifacts` key (byte-compatible with SPEC-004 baseline).
5. **Given** a successor agent reads `S.input.input_artifacts[0].preview_text`, **When** the producer published a 10 KiB Markdown post-redaction, **Then** the preview is the first 4 KiB of the redacted Markdown UTF-8-decoded.

---

### User Story 6 - Audit Panel "Dispositions" Tab (Priority: P2)

Operators reviewing what triage agents decided open a "Dispositions" tab in `audit-trail-panel.tsx`. The tab supports filtering by `workspace_id`, `disposition` (multi-select), date range (preset + custom), `triaged_by_agent_id`, and `task_id` (numeric exact match OR title substring). Results are paginated by cursor on `(triaged_at DESC, id DESC)` with a default page size of 50 and max of 200. A banner reads "Logging began on YYYY-MM-DD" — derived from the earliest `task_dispositions.triaged_at` — and is hidden if no rows exist.

**Why this priority**: Operators need this surface for forensic review ("who triaged this", "how often did agent X reject", "what happened on date Y"). It is the primary visible product of disposition logging.

**Independent Test**: Seed 250 disposition rows across 2 workspaces, 4 agents, 6 dispositions, and 30 days. Open the Dispositions tab; verify filter combinations (workspace + disposition multi-select, date preset, agent dropdown, task_id numeric vs. substring) return correct subsets. Page through with cursor; assert default 50/page, max 200 enforced, and stable order across paging. Confirm the banner shows the earliest `triaged_at` date.

**Acceptance Scenarios**:

1. **Given** 250 disposition rows in workspace W and the Dispositions tab is loaded, **When** the operator selects `disposition ∈ {'closed','rejected'}` and a 7-day preset date range, **Then** the result list contains only rows in W matching those filters, sorted by `triaged_at DESC, id DESC`, and the first page returns ≤ 50 rows with a next-cursor.
2. **Given** the operator types `12345` in the `task_id` filter, **When** results render, **Then** the panel filters to the row whose `task_id=12345` exactly. **Given** the operator types `audit issue`, **When** results render, **Then** the panel filters to rows whose related `tasks.title` contains `audit issue` as a substring.
3. **Given** at least one disposition row exists, **When** the panel loads, **Then** the banner reads `Logging began on YYYY-MM-DD` using the earliest `task_dispositions.triaged_at` formatted as a date.
4. **Given** zero disposition rows exist (flag never turned on), **When** the panel loads, **Then** the banner is hidden and the empty-state message "No dispositions yet" is shown.

---

### User Story 7 - Artifact Admin Panel (Priority: P2)

Admins manage the artifact plane through `artifact-admin-panel.tsx`. The panel lists and searches artifacts with filters for `workspace_id`, `artifact_type`, `redaction_status`, `security_scan_status`, and date range. Admins inspect metadata, preview text, and download raw content for non-quarantined non-binary artifacts. Destructive actions are gated by the existing admin guard: quarantine (reversible), un-quarantine, delete, archive, hash-verify (single + batch), repair orphans (bidirectional), rebuild previews/indexes, and run retention sweep on demand. Each destructive action writes an `activities` row capturing actor, target, before/after status, and reason. Health metrics are surfaced: counts, total bytes, failed publishes/scans/reads, orphan count, storage free space, and p95 publish/read latency per workspace from the in-memory ring buffer (showing "insufficient data" when fewer than 100 observations).

**Why this priority**: Admins need both observability and surgical control over a system where a single bad artifact can compromise security or correctness. The retention sweep is admin-triggered only — never auto-cron — to avoid data-loss surprises during rollout.

**Independent Test**: Seed mixed artifacts (clean text, redacted text, file-backed PDF, quarantined image, orphan DB row, orphan FS file). Drive each admin action and assert: (a) UI gates non-admins out, (b) quarantine flips `redaction_status='quarantined'` and reads return 423 unless `?include_quarantined=1` AND admin, (c) un-quarantine restores the prior status, (d) delete removes the row + file (or marks deleted) and writes an activity, (e) archive moves the file to the archive subtree, (f) hash-verify rehashes and on mismatch sets `'hash_mismatch'` without auto-quarantine, (g) repair orphans handles both DB-without-file and FS-without-row directions per Q24, (h) rebuild previews recomputes preview text, (i) retention sweep applies the per-workspace `feature_flags.artifact_retention` policy, and (j) the metrics tile shows ring-buffer p95 or "insufficient data".

**Acceptance Scenarios**:

1. **Given** an admin clicks "Quarantine" on artifact A, **When** the action completes, **Then** A's `redaction_status='quarantined'`, an `activities` row of `kind='artifact_quarantined'` is written with `{artifact_id, actor_session_id, reason, before, after}`, and `GET /api/task-artifacts/[A.id]` returns 423 Locked with metadata-only body unless `?include_quarantined=1` AND the caller is admin.
2. **Given** an admin clicks "Run hash verification" on artifact A whose on-disk content has been corrupted, **When** the verification runs, **Then** A's `security_scan_status='hash_mismatch'`, an `activities` row of `kind='artifact_hash_verified'` is written, and A's `redaction_status` is NOT auto-changed to `'quarantined'`.
3. **Given** a DB row whose file is missing on disk, **When** the admin clicks "Repair orphans", **Then** the row's `redaction_status='rejected'` and `security_scan_status='file_missing'`, the row is preserved (not deleted), and an `activities` row records the repair.
4. **Given** a file on disk whose DB row is missing, **When** the admin clicks "Repair orphans", **Then** the file is moved to `<DATA_DIR>/artifacts/_orphaned/<timestamp>/<original-relative-path>` and an `activities` row records the move.
5. **Given** the admin clicks "Run retention sweep" on workspace W with `feature_flags.artifact_retention = { keep_days: 30, archive_after_days: 14, delete_after_days: 60 }`, **When** the sweep runs, **Then** artifacts older than 14 days are archived, artifacts older than 60 days are deleted, and a single summary `activities` row records counts.
6. **Given** the publish path has recorded fewer than 100 observations since process start, **When** the metrics tile renders, **Then** the p95 publish-latency cell shows "insufficient data" instead of a numeric value.
7. **Given** a non-admin caller, **When** any destructive action is attempted via the API, **Then** the response is HTTP 403 and no state changes.

---

### User Story 8 - Dashboard Widget "Last 7d Triage Totals" (Priority: P2)

The dashboard surfaces a per-workspace card titled "Last 7d triage totals" in `dashboard.tsx`. The card shows a total triage count at the top and 7 stacked bars below — one per day, segments per disposition. The client polls every 30 seconds; the server-side rollup query is cached for 15 seconds keyed on `(workspace_id, day_bucket)`, and the cache is invalidated whenever a new disposition row is inserted.

**Why this priority**: This is the at-a-glance pulse for operators monitoring triage agents. It must stay accurate within the 30s/15s freshness budget without hammering the database.

**Independent Test**: Seed 7 days of disposition rows across 5 dispositions in workspace W. Render the dashboard widget; assert the total matches the sum and each day's stacked bar segments match the per-disposition counts. Insert a new disposition row; assert the cache invalidates and the widget reflects the new count within one poll cycle.

**Acceptance Scenarios**:

1. **Given** workspace W has 7 days of disposition rows totaling 142 across 5 dispositions, **When** the dashboard widget renders, **Then** the total card reads "142", and the 7 stacked bars together visually total 142 with segments proportional to per-disposition counts per day.
2. **Given** the widget has already polled and rendered, **When** a new disposition row is inserted, **Then** the server-side cache for that `(workspace_id, day_bucket)` is invalidated, and the next 30s client poll renders the updated total.
3. **Given** workspace W has zero disposition rows in the last 7 days, **When** the widget renders, **Then** the total reads "0" and the bars render as empty placeholders without polling failures.
4. **Given** two clients poll the same workspace within 5 seconds, **When** the server handles the second request, **Then** the rollup query is served from the 15s cache (no second DB scan).

---

### User Story 9 - Generic Dispositions GET API (Priority: P3)

A stable, generic `GET /api/dispositions` endpoint exposes disposition rows for any authorized consumer. Filters: `workspace_id` (required for non-Facility callers), `disposition` (multi-select), `since`/`until` (ISO timestamps), `triaged_by_agent_id`, `task_id`. Cursor pagination on `(triaged_at DESC, id DESC)`. Auth follows the same pattern as `/api/activities`. No rate limiting in v1; observed usage informs whether to add limits later.

**Why this priority**: This is the long-term integration surface that downstream consumers (custom dashboards, ad-hoc queries) will use. It is generic by design — no consumer-specific naming, contracts, or coupling.

**Independent Test**: Drive `GET /api/dispositions` with each filter combination and assert: (a) Facility caller can omit `workspace_id`, (b) non-Facility caller without `workspace_id` returns HTTP 400, (c) cursor pagination returns stable order across pages, (d) auth pattern matches `/api/activities` (same 401/403 behavior), (e) no rate-limit headers are emitted in v1.

**Acceptance Scenarios**:

1. **Given** an authenticated non-Facility session calling `GET /api/dispositions` without `workspace_id`, **When** the API receives the request, **Then** the response is HTTP 400 with a `workspace_id_required` error.
2. **Given** a Facility-scoped session calling `GET /api/dispositions?disposition=closed&disposition=rejected&since=2026-04-01T00:00:00Z`, **When** the API receives the request, **Then** the response contains only rows with disposition in `{'closed','rejected'}` and `triaged_at >= 2026-04-01T00:00:00Z`, sorted by `triaged_at DESC, id DESC`, with a `next_cursor` if more pages exist.
3. **Given** an unauthenticated request, **When** the API receives it, **Then** the response is HTTP 401 (matching `/api/activities`).
4. **Given** a request without API key authorization, **When** the API receives it, **Then** the response matches the `/api/activities` 403 behavior.

---

### Edge Cases

- **Disposition value is `'unknown'`**: Reserved for the validation-failure path; agents cannot return `'unknown'` from their output JSON. Inserting `'unknown'` is restricted to the validation-failure code path. Whether `'unknown'` rows appear as a stacked-bar segment in the dashboard widget remains a clarification target.
- **Crash during file write**: Atomic-rename pattern leaves a `.tmp.<sha256>.<pid>.<rand>` sibling; the canonical file is never partially written. Orphan repair sweep handles `.tmp.*` siblings older than a configurable threshold.
- **Concurrent same-content publishes**: Two writers detect the canonical path already exists, verify hash matches, skip the FS write, and insert their own row pointing to the same `storage_uri`. Hash mismatch in this path is an error (returns 500 + `activities` row).
- **Republish of a quarantined artifact**: Quarantined source cannot be `supersedes` target — return HTTP 409 `cannot_supersede_quarantined`.
- **Detector finding inside a redaction-allowed text artifact whose redaction would produce zero non-whitespace bytes**: Reject with 422 `redaction_would_empty_artifact` rather than store an empty-but-classified-clean artifact.
- **Dashboard widget when a workspace's `activeWorkspace` no longer exists**: Render the empty-state placeholder, not an error toast.
- **Audit panel `task_id` filter ambiguity**: Numeric input is treated as exact `task_id` match; non-numeric input is treated as `tasks.title` substring search. Both modes share the same filter input.
- **Successor dispatch when producer has zero artifacts**: `input_artifacts` is an empty array (still present when flag ON); compatible with SPEC-004 successor consumers that ignore unknown keys.
- **Aegis review window crosses a security_violation activity**: Aegis FAILs the producer task with `reason='secret_in_artifact'`. If the producer also has a `disposition='unknown'` row, both reasons appear in the failure summary.
- **`external_uri` rows during retention sweep**: Existing legacy rows are aged like file rows but the sweep removes only the DB row — never attempts outbound deletion of the external resource.

## Requirements *(mandatory)*

### Functional Requirements

#### Feature flags

- **FR-001**: System MUST resolve `FEATURE_DISPOSITION_LOGGING` through `resolveFlag(name, { workspaceId })` at every call site that affects behavior. With the flag OFF, no `task_dispositions` rows are inserted, no `disposition_*` activities are written, and no Aegis fail signal is generated from disposition logic.
- **FR-002**: System MUST resolve `FEATURE_TASK_ARTIFACTS` through `resolveFlag(name, ctx)` at every call site. With the flag OFF, the publish API returns HTTP 503; successor dispatch payloads contain no `input_artifacts` key and are byte-compatible with the SPEC-004 baseline.
- **FR-003**: Both flags MUST default to OFF and MUST be independently togglable per workspace.

#### Disposition logging (FEATURE_DISPOSITION_LOGGING)

- **FR-010**: System MUST detect "triage templates" by inspecting `workflow_templates.output_schema` for a required top-level `disposition` field whose enum is the closed set `['merged','closed','rejected','rerouted','duplicate','spam','completed','abandoned']`.
- **FR-011**: After `advanceTaskChain` commits the task transition, the system MUST run a separate try/catch that inserts exactly one row into `task_dispositions` with `disposition`, `reason`, `triaged_by_agent_id` (= completing task's `agent_id`), `triaged_at` (now), `workspace_id` (= task's workspace).
- **FR-012**: System MUST NOT block the task transition on disposition INSERT failure or validation failure. Task advancement always proceeds.
- **FR-013**: On output validation failure (missing field or enum violation), the system MUST write `disposition='unknown'`, write an `activities` row of `kind='disposition_validation_failed'` with the full agent-output payload, and fail the producer's Aegis quality_review with `reason='disposition_validation_failed'`.
- **FR-014**: On INSERT failure (DB error), the system MUST write an `activities` row of `kind='disposition_insert_failed'` throttled to a maximum of 1 per `(task_id, kind)` per 60 seconds.
- **FR-015**: System MUST reject any agent-supplied disposition value of `'unknown'` (the value is reserved for the validation-failure code path).

#### Artifact publish + storage (FEATURE_TASK_ARTIFACTS)

- **FR-020**: System MUST expose `publishArtifact({ task_id, artifact_type, storage_kind, content|file, mime, schema_version?, supersedes? })` from `src/lib/task-artifacts.ts`. Allowed `storage_kind` values: `inline_json`, `inline_markdown`, `file`. The publish API MUST reject any request with `storage_kind='external_uri'` with HTTP 400.
- **FR-021**: System MUST keep inline content ≤ 64 KiB UTF-8 encoded. Content > 64 KiB MUST auto-promote to `file` storage with an appropriate extension derived from MIME.
- **FR-022**: For file-backed artifacts, the system MUST write to `<DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/.tmp.<sha256>.<pid>.<rand>`, fsync the file, rename to `<sha256>.<ext>`, and fsync the parent directory. The DB row INSERT MUST occur ONLY after rename success. `storage_uri` MUST be relative to `DATA_DIR`.
- **FR-023**: System MUST detect concurrent same-content writes by checking the canonical path's existence and hash. If the canonical file already exists with matching hash, the second writer MUST skip the FS write and still insert its own row with the same `storage_uri`.
- **FR-024**: System MUST reject HTTP 413 if file size > 25 MiB.
- **FR-025**: System MUST reject HTTP 415 if MIME is not in the allowlist: `text/plain`, `text/markdown`, `application/json`, `application/x-yaml`, `application/pdf`, `image/png`, `image/jpeg`, `image/svg+xml`, `application/zip`.
- **FR-026**: System MUST use the producer task's `workspace_id` as the authoritative workspace for storage path and policy. If `session.activeWorkspace` differs and the session is non-Facility, the publish MUST return HTTP 403. Facility-scoped sessions MUST be allowed to publish across workspaces.
- **FR-027**: On republish with `supersedes: <prev_id>`, the system MUST insert a new row with `supersedes_artifact_id=<prev_id>` and set the previous row's `redaction_status` to `'superseded'` only after the new publish succeeds.
- **FR-028**: System MUST update the in-memory p95 latency ring buffer (publish path, 1024 observations per workspace) on every successful publish.
- **FR-029**: System MUST enforce the application-level enum sets:
  - `redaction_status ∈ {'pending','clean','redacted','rejected','quarantined','superseded'}`
  - `security_scan_status ∈ {'pending','scanned_clean','scanned_with_findings','scan_error','hash_mismatch','file_missing'}`
  These enums MUST be exported `const` arrays in `src/lib/task-artifacts.ts` and guarded by a snapshot test. No DB CHECK constraints.

#### Secret detector

- **FR-030**: System MUST export `detectSecrets(content: string | Buffer, mime: string): { findings: SecretFinding[], redacted: string | Buffer }` from `src/lib/secret-detector.ts`.
- **FR-031**: System MUST ship MC Secret Detector v1 rules sourced from gitleaks v8.18.0 plus MC additions covering: AWS access key id (`AKIA[0-9A-Z]{16}`), AWS secret access key (40-char base64-ish + AWS context), GitHub PATs (`gh[pousr]_…`), GitHub fine-grained PAT, GitHub OAuth (`gho_…`), Google API key (`AIza…`), Slack token, Stripe (`sk_live_…`/`pk_live_…`), `BEGIN PRIVATE KEY` / `BEGIN RSA PRIVATE KEY` PEM, generic `password=` / `api_key=` / `token=` / `secret=` env-style, JWT (`eyJ.eyJ.X`), Bearer header, Anthropic (`sk-ant-…`), OpenAI (`sk-…`).
- **FR-032**: When detector findings ≥ 1, the system MUST reject the publish with HTTP 422 + redacted preview, and write an `activities` row of `kind='security_violation'` throttled to 1 per `(task_id, kind)` per 60 seconds.
- **FR-033**: When `workflow_templates.allow_redacted_artifacts=1` (M054) AND MIME is text-like (`text/*`, `application/json`, `application/x-yaml`), the system MUST store the redacted content with `redaction_status='redacted'` and `security_scan_status='scanned_with_findings'`.
- **FR-034**: Binaries with detector findings MUST always reject with HTTP 422 regardless of `allow_redacted_artifacts`.
- **FR-035**: Every detector rule MUST pass `safe-regex` validation in CI; the detector test suite MUST achieve ≥ 0.95 recall on the wild corpus.

#### Successor dispatch

- **FR-040**: With `FEATURE_TASK_ARTIFACTS=ON`, when `advanceTaskChain` dispatches the next task, the system MUST attach `task.input.input_artifacts: Array<{ id, type, sha256, preview_text, storage_kind, byte_size }>` populated from the producer task's latest non-superseded, non-quarantined `task_artifacts` rows.
- **FR-041**: Raw artifact content MUST be available only via `GET /api/task-artifacts/[id]` with authentication. Successor agents MUST NOT receive raw content in the dispatch payload.
- **FR-042**: `preview_text` MUST be the first 4 KiB of UTF-8-decoded post-redaction content for text-like MIMEs (`text/*`, `application/json`, `application/x-yaml`), or the literal string `'(binary, ${byte_size} bytes, sha256=${sha256.slice(0,12)})'` for binary MIMEs.
- **FR-043**: With `FEATURE_TASK_ARTIFACTS=OFF`, the dispatch payload MUST NOT contain an `input_artifacts` key (byte-compatible with SPEC-004 baseline). An EXPLAIN QUERY PLAN test MUST guard against query-plan drift.

#### Audit panel ("Dispositions" tab in src/components/panels/audit-trail-panel.tsx)

- **FR-050**: System MUST add a "Dispositions" tab to `audit-trail-panel.tsx` with filters for `workspace_id`, `disposition` (multi-select), date range (preset + custom), `triaged_by_agent_id` (dropdown), and `task_id` (numeric exact OR title substring).
- **FR-051**: Results MUST be paginated by cursor on `(triaged_at DESC, id DESC)` with a default page size of 50 and a max of 200.
- **FR-052**: When at least one row exists, the tab MUST display a banner reading "Logging began on YYYY-MM-DD" derived from the earliest `task_dispositions.triaged_at`. The banner MUST be hidden if no rows exist.

#### Artifact admin panel (src/components/panels/artifact-admin-panel.tsx)

- **FR-060**: System MUST provide an artifact admin panel that lists and searches artifacts with filters by `workspace_id`, `artifact_type`, `redaction_status`, `security_scan_status`, and date range.
- **FR-061**: The panel MUST allow inspection of metadata, preview text rendering, and raw content download for non-quarantined non-binary artifacts.
- **FR-062**: Destructive actions MUST be gated by the existing admin guard pattern: quarantine (reversible), un-quarantine, delete, archive, hash-verify (single + batch), repair orphans (bidirectional), rebuild previews/indexes, and run retention sweep.
- **FR-063**: Each destructive action MUST write an `activities` row with `kind ∈ {'artifact_quarantined','artifact_unquarantined','artifact_deleted','artifact_archived','artifact_hash_verified','artifact_repaired_orphan','artifact_previews_rebuilt','artifact_retention_swept'}` and a payload of `{artifact_id, actor_session_id, reason, before_status, after_status}`.
- **FR-064**: The panel MUST surface health metrics: artifact counts, total bytes, failed publishes/scans/reads, orphan count, storage free space, and p95 publish/read latency per workspace from the in-memory ring buffer. If fewer than 100 observations exist for a metric, the cell MUST display "insufficient data".
- **FR-065**: Quarantine MUST set `redaction_status='quarantined'`. Reads of quarantined artifacts MUST return HTTP 423 Locked with a metadata-only stub body unless the request includes `?include_quarantined=1` AND the caller is admin.
- **FR-066**: Successor dispatch MUST silently skip quarantined artifacts and write an `activities` row recording the skip.
- **FR-067**: Hash verification MUST re-hash the file. On mismatch, the system MUST set `security_scan_status='hash_mismatch'` and write an `activities` row of `kind='artifact_hash_verified'` with mismatch detail; the system MUST NOT auto-quarantine.
- **FR-068**: Orphan repair MUST handle both directions: a DB row without a file MUST get `redaction_status='rejected'` and `security_scan_status='file_missing'` (row preserved); a file without a DB row MUST be moved to `<DATA_DIR>/artifacts/_orphaned/<timestamp>/<original-relative-path>`.
- **FR-069**: Retention sweep MUST read per-workspace `feature_flags.artifact_retention = { keep_days, archive_after_days, delete_after_days }` (any field may be `null`, default null = keep forever) and apply the policy when an admin clicks "Run retention sweep". The system MUST NOT run the sweep automatically. Each manual sweep MUST write a single summary `activities` row.

#### Dashboard widget (src/components/dashboard/dashboard.tsx)

- **FR-070**: System MUST render a per-workspace dashboard card titled "Last 7d triage totals" containing a total count and 7 stacked bars (one per day, segments per disposition).
- **FR-071**: The client MUST poll the rollup endpoint every 30 seconds.
- **FR-072**: The server-side rollup query MUST be cached for 15 seconds keyed on `(workspace_id, day_bucket)`. The cache MUST be invalidated on every disposition INSERT.

#### Generic dispositions API (src/app/api/dispositions/route.ts)

- **FR-080**: System MUST expose `GET /api/dispositions` with filters: `workspace_id` (required for non-Facility callers), `disposition` (multi-select), `since` and `until` (ISO timestamps), `triaged_by_agent_id`, `task_id`. Cursor pagination on `(triaged_at DESC, id DESC)`.
- **FR-081**: Auth MUST follow the same pattern as `/api/activities`. v1 MUST NOT impose any rate limit beyond existing API-key gating.

#### Aegis hook (src/lib/aegis-review.ts)

- **FR-090**: `runAegisReviews` MUST examine activities for the triage-template task within the review window. Any `kind='security_violation'` MUST cause Aegis to FAIL the producer task with `reason='secret_in_artifact'`. Any `task_dispositions` row with `disposition='unknown'` for the producer task MUST cause Aegis to FAIL with `reason='disposition_validation_failed'`.

#### Strict-scope discipline

- **FR-100**: System MUST add `src/lib/secret-detector.ts`, `src/lib/secret-detector.rules.ts`, `src/lib/__tests__/secret-detector.test.ts`, and the explicit Aegis hook surface in `src/lib/aegis-review.ts` to `tsconfig.spec-strict.json` and `eslint.config.mjs`. A strict-scope grep test MUST guard against accidental blast-radius expansion outside the declared file list.

### Spec Evidence And Archive Policy

- Archive Sweep runs before Phase 0 for SPEC-007 and considers only previously merged specs; the current target spec (`007-disposition-artifacts`) is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands of the form `git show <merge-sha>:specs/<feature>/spec.md`.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.
- This spec creates new test fixtures under `src/lib/__tests__/fixtures/secrets/` (per-rule positive/negative, plus a wild corpus). These fixtures MUST be synthetic or manually curated — never derived from real customer data.

### Key Entities

- **task_dispositions row (M057)**: One row per triage-template completion. Attributes: `id`, `task_id`, `disposition` (closed enum + `'unknown'` sentinel), `reason` (free text), `triaged_by_agent_id`, `triaged_at`, `workspace_id`.
- **task_artifacts row (M058)**: One row per published artifact (or per superseding republish). Attributes: `id`, `task_id`, `workspace_id`, `artifact_type`, `storage_kind`, `mime`, `byte_size`, `sha256`, `content` (nullable, inline only), `storage_uri` (nullable, file only, relative to DATA_DIR), `redaction_status`, `security_scan_status`, `supersedes_artifact_id` (nullable), `schema_version` (nullable), timestamps.
- **workflow_templates.allow_redacted_artifacts (M054)**: Per-template integer flag (0 or 1) controlling whether text-like artifacts containing detected secrets may be stored in redacted form.
- **Secret detector rules**: Static array of `{name, regex, description}` entries; each entry passes `safe-regex` validation; each rule has at least one positive and one negative test fixture.
- **Wild corpus**: A synthetic + manually crafted ≥ 50-line text file at `src/lib/__tests__/fixtures/secrets/wild-corpus.txt` containing a representative mix of real-world-shaped secret patterns. Used to assert detector recall ≥ 0.95.
- **In-memory p95 ring buffer**: Per-workspace, two buffers (publish + read), 1024 observations each, no DB persistence, resets on process restart, surfaced in the admin panel with an "insufficient data" placeholder when fewer than 100 observations exist.
- **Activity kinds added by this spec**: `disposition_validation_failed`, `disposition_insert_failed`, `security_violation`, `artifact_quarantined`, `artifact_unquarantined`, `artifact_deleted`, `artifact_archived`, `artifact_hash_verified`, `artifact_repaired_orphan`, `artifact_previews_rebuilt`, `artifact_retention_swept`, `artifact_skipped_quarantined_in_dispatch`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With both flags OFF, the SPEC-004 dispatch payload baseline MUST be byte-identical: zero diff in the `task.input` JSON across 100 sampled chains, and EXPLAIN QUERY PLAN snapshots show zero new query-plan rows.
- **SC-002**: With `FEATURE_DISPOSITION_LOGGING=ON`, 100% of triage-template completions in a 1,000-task burst test produce exactly one `task_dispositions` row within 2 seconds of the task transition commit; INSERT failure rate logged as `activities` rows is < 0.1% under simulated DB stall.
- **SC-003**: Operators using the audit panel can locate a specific disposition row by `(workspace, disposition, agent, date range)` filter combination and have the result render in under 2 seconds for datasets up to 100,000 rows.
- **SC-004**: With `FEATURE_TASK_ARTIFACTS=ON`, the publish API rejects 100% of in-content secret patterns at the wild-corpus scale, producing redacted previews and `security_violation` activities. Detector recall MUST be ≥ 0.95.
- **SC-005**: A successor task receives `input_artifacts` references for 100% of producer artifacts that are non-superseded and non-quarantined; quarantined artifacts are silently skipped in 100% of dispatches.
- **SC-006**: Atomic file writes show zero partial canonical files across a 500-publish crash-injection test (process kill mid-write); orphan repair correctly identifies all `.tmp.*` siblings.
- **SC-007**: The dashboard widget reflects a newly inserted disposition row within one client poll cycle (≤ 30 seconds) of the insert; cache hit rate on read is ≥ 80% under 10 concurrent dashboards.
- **SC-008**: Admin destructive actions (quarantine, delete, archive, repair orphans, retention sweep) each produce exactly one `activities` row with full before/after status, actor, and reason; non-admins receive HTTP 403 in 100% of attempts.
- **SC-009**: P95 publish latency reported by the admin panel matches the in-process measured p95 within ±5% when the ring buffer has ≥ 100 observations; the panel displays "insufficient data" otherwise.
- **SC-010**: A strict-scope grep test passes for SPEC-007: only the declared files (the roadmap-listed surfaces, the secret-detector triplet, and the Aegis hook) appear in `tsconfig.spec-strict.json`'s include list and in eslint strict-scope coverage.

## Assumptions

- Both `task_dispositions` (M057) and `task_artifacts` (M058) tables already exist with the intended columns and indexes from SPEC-001; this spec adds zero new migrations and zero new columns.
- `workflow_templates.allow_redacted_artifacts` (M054) is the sole template-level opt-in for redact-and-store; no new template columns are introduced.
- `resolveFlag(name, ctx)` from SPEC-002 already handles per-workspace feature-flag resolution, including the pitfall that `process.env.FEATURE_X='1'` does NOT force a flag ON; only `workspaces.feature_flags` JSON does.
- The `quality_reviews` table and `runAegisReviews` semantics from SPEC-003 are stable; this spec only adds two new failure reasons (`secret_in_artifact`, `disposition_validation_failed`) and the activity-driven check in `runAegisReviews`.
- `MISSION_CONTROL_DATA_DIR` (default `.data/`) is the durable storage root; sharded paths under `<DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/` are reliable on the deployment filesystems in use (local disk + Docker volumes). No object-storage adapter is in scope for v1.
- Existing `external_uri` rows render normally on read; only the publish path rejects new `external_uri` requests.
- The session model includes `session.activeWorkspace` and a `session.scope` distinction between Facility and non-Facility per SPEC-002.
- The audit panel and dashboard already share an authenticated session context; no new authentication primitives are added.
- The detector's "wild corpus" can be authored from scratch using synthetic + manually crafted patterns; no real customer data is sourced.
- SPEC-007 depends on SPEC-005's status-hygiene fix landing first; if SPEC-005 merges first, this branch will rebase. Autopilot can still execute SPEC-007 independently against the stale roadmap; the dependency is for clean-merge ergonomics, not correctness.
- The pre-existing admin guard pattern used by other privileged endpoints is sufficient for artifact admin actions; no new admin-role primitive is introduced.
