# Feature Specification: SPEC-007 Disposition Logging and Task Artifact Store

**Feature Branch**: `007-disposition-artifacts`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "SPEC-007 — Add disposition logging for triage-template completions and a secret-scanned artifact handoff plane between agent sandboxes, gated by `FEATURE_DISPOSITION_LOGGING` and `FEATURE_TASK_ARTIFACTS`."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Flag-OFF Parity Preserves Existing Behavior (Priority: P1)

When both `FEATURE_DISPOSITION_LOGGING` and `FEATURE_TASK_ARTIFACTS` are OFF for a workspace, the system behaves byte-compatibly with SPEC-004: no `task_dispositions` rows are inserted, no successor dispatch payload includes an `input_artifacts` key, and the publish API returns 503 (service unavailable). This guarantees a clean, instant rollback path that does not lose previously stored evidence.

**Why this priority**: Rollback safety is the foundation of the rollout strategy. Without verifiable byte-compatibility when flags are OFF, operators cannot deploy the change with confidence that disabling a flag fully unwinds the new behavior. Both schemas (M057, M058) already exist, so the only behavioral guarantee in this state is "do nothing observable."

**Independent Test**: With both flags resolving to OFF (default), drive a triage-template task to completion via `advanceTaskChain` and assert: (a) zero rows inserted into `task_dispositions`, (b) successor task `metadata` JSON contains no `input_artifacts` key (`'input_artifacts' in JSON.parse(successor.metadata) === false`), (c) `POST /api/task-artifacts` returns HTTP 503. Persist `src/lib/__tests__/__fixtures__/spec-004-dispatch-metadata-baseline.json` (a structural baseline of the successor's `metadata` object — keys + types only, not literal values) and assert flag-OFF dispatch matches it. Reuse `src/lib/__tests__/__fixtures__/explain-query-plan-pre-m62.json` for the EXPLAIN QUERY PLAN diff. (Clarify Session 3 / Q1, Q2: there is no `tasks.input` column — the dispatch payload lives in `tasks.metadata` JSON; SPEC-007 attaches `metadata.input_artifacts` as a sibling of the existing `metadata.task_pipeline` namespace.)

**Acceptance Scenarios**:

1. **Given** both flags OFF in workspace W and a triage-template task T1 about to complete, **When** `advanceTaskChain` commits T1, **Then** no row is inserted into `task_dispositions` for T1, no `activities` row of `type='disposition_*'` is written, and the successor task T2's `metadata` JSON contains no `input_artifacts` key.
2. **Given** both flags OFF in workspace W, **When** an agent calls `POST /api/task-artifacts`, **Then** the response is HTTP 503 with a stable error body indicating the artifact store is disabled, and no row is inserted into `task_artifacts`.
3. **Given** both flags OFF, **When** the audit panel loads the "Dispositions" tab, **Then** the tab renders an empty-state message but does not error, and the dashboard widget renders "no data" without polling failures.

---

### User Story 2 - Disposition Insert After Triage Completion (Priority: P1)

When `FEATURE_DISPOSITION_LOGGING` is ON for a workspace, every triage-template completion records exactly one row in `task_dispositions` (M057) with `disposition`, `reason`, `triaged_by_agent_id`, `triaged_at`, and `workspace_id`. A "triage template" is detected by inspecting `workflow_templates.output_schema` for a required top-level `disposition` field whose enum is the closed set `['merged','closed','rejected','rerouted','duplicate','spam','completed','abandoned']`. The insert runs in its own try/catch *after* `advanceTaskChain` commits the task transition, so an INSERT failure never blocks task advancement.

**Why this priority**: Disposition logging is the foundation of all downstream surfaces — audit panel, dashboard widget, generic API. Without reliable, deterministic inserts, every other story degrades. The "after-transaction insert" pattern matches SPEC-006's `label_provisioning_failed` reliability discipline.

**Independent Test**: With `FEATURE_DISPOSITION_LOGGING=ON`, complete a triage-template task whose agent output includes `{disposition: 'closed', reason: '...'}`. Assert: (a) one row in `task_dispositions` with the expected fields, (b) the row's `triaged_by_agent_id` matches the completing task's `agent_id`, (c) `triaged_at` is within ±2s of the task transition commit time, (d) the task transition itself succeeded regardless of disposition path.

**Acceptance Scenarios**:

1. **Given** `FEATURE_DISPOSITION_LOGGING=ON` and triage-template task T with valid agent output `{disposition: 'closed', reason: 'duplicate of #123'}`, **When** `advanceTaskChain(T)` commits, **Then** exactly one row exists in `task_dispositions` with `disposition='closed'`, `reason='duplicate of #123'`, `triaged_by_agent_id=T.agent_id`, `workspace_id=T.workspace_id`.
2. **Given** the agent output is missing the `disposition` field or contains a value outside the closed enum, **When** `advanceTaskChain(T)` commits, **Then** a row is still inserted with `disposition='unknown'`, an `activities` row of `type='disposition_validation_failed'` is written with the **redacted sanitized diagnostic payload** (sha256 + byte_size + redacted ≤4 KiB excerpt; raw payload NEVER stored verbatim per FR-013), and the producer's Aegis quality_review fails with `reason='disposition_validation_failed'`.
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

When `FEATURE_TASK_ARTIFACTS=ON`, the successor dispatched by `advanceTaskChain` receives an `input_artifacts` array under the successor task's `metadata.input_artifacts` key (sibling of the existing `metadata.task_pipeline` namespace owned by SPEC-004), populated from the producer task's latest non-superseded, non-quarantined `task_artifacts` rows. Each entry carries `{ id, type, sha256, preview_text, storage_kind, byte_size }`. `preview_text` is the first 4 KiB of UTF-8-decoded post-redaction content for text-like MIMEs, or `'(binary, ${byte_size} bytes, sha256=${sha256.slice(0,12)})'` for binary MIMEs. Raw content is available *only* via `GET /api/task-artifacts/[id]` with auth. With the flag OFF, the dispatch payload is byte-compatible with SPEC-004 and contains no `input_artifacts` key in `metadata`.

**Why this priority**: Successor handoff is the operational reason the artifact plane exists. Successor agents must NEVER read another agent's private sandbox; the `input_artifacts` contract is how they discover what their predecessor produced safely. The flag-OFF byte compatibility check protects rollback.

**Independent Test**: With `FEATURE_TASK_ARTIFACTS=ON`, publish two artifacts (one inline JSON, one binary PDF) for producer task P, then drive the chain to dispatch successor S. Assert `JSON.parse(S.metadata).input_artifacts` is an array of two entries with the correct shape, `preview_text` is post-redaction for the JSON, and the binary entry uses the binary stub. Quarantine one artifact and re-run; assert it is silently skipped from the successor's array. Run a publish-then-republish pair; assert only the latest non-superseded version appears.

**Acceptance Scenarios**:

1. **Given** `FEATURE_TASK_ARTIFACTS=ON` and producer task P with two non-superseded, non-quarantined artifacts (one `inline_json`, one `file` PDF), **When** `advanceTaskChain` dispatches successor S, **Then** `JSON.parse(S.metadata).input_artifacts` is `[{id, type, sha256, preview_text, storage_kind:'inline_json', byte_size}, {id, type, sha256, preview_text:'(binary, ...)' , storage_kind:'file', byte_size}]`.
2. **Given** producer task P has an artifact A1 published, then A2 published with `supersedes=A1`, **When** successor S is dispatched, **Then** `metadata.input_artifacts` contains only A2; A1 is excluded as superseded.
3. **Given** producer task P has an artifact that an admin quarantined, **When** successor S is dispatched, **Then** the quarantined artifact is silently skipped from `metadata.input_artifacts` and an `activities` row records the skip.
4. **Given** `FEATURE_TASK_ARTIFACTS=OFF`, **When** `advanceTaskChain` dispatches successor S, **Then** `JSON.parse(S.metadata)` has no `input_artifacts` key (byte-compatible with SPEC-004 baseline).
5. **Given** a successor agent reads `JSON.parse(S.metadata).input_artifacts[0].preview_text`, **When** the producer published a 10 KiB Markdown post-redaction, **Then** the preview is the first 4 KiB of the redacted Markdown UTF-8-decoded.

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
- **Pre-scan validation order (CHK034)**: The publish path MUST validate inputs in this fixed order, short-circuiting on the first failure: (1) flag resolution → 503; (2) authentication → 401; (3) workspace authorization (FR-026) → 403; (4) `storage_kind='external_uri'` rejection (FR-020) → 400; (5) other malformed-input checks → 400; (6) `supersedes` target quarantined check → 409; (7) file-size cap (FR-024) → 413; (8) MIME allowlist (FR-025) → 415; (9) secret detector (FR-030+); (10) atomic file write (FR-022). Size-before-MIME means a 30 MiB request never has its bytes parsed for MIME sniffing; MIME-before-detector means the scan never runs on unsupported MIMEs.
- **Zero-byte payloads (CHK080)**: A publish whose computed `byte_size === 0` (empty inline string OR empty file body) MUST be rejected with HTTP 400 `{ error: 'empty_payload' }`. No row or file is created. Rationale: a zero-byte canonical file is indistinguishable from a partial write under post-crash inspection and produces the well-known sha256-of-empty digest (`e3b0c44...`) that would unify all empty publishes under a single canonical inode — confusing orphan-repair semantics. The `empty_payload` code is added to the API Error Code Matrix as a `POST /api/task-artifacts` 400 variant.
- **`<DATA_DIR>` exhausted during write (ENOSPC) (CHK085)**: If any of the FR-022 atomic-write steps (temp write, fsync, `fs.link`) returns `ENOSPC`, the publish MUST: (a) attempt `fs.unlink` of the temp file (best-effort; ENOSPC errors on unlink are swallowed and logged), (b) NOT INSERT a DB row, (c) return HTTP 507 `{ error: 'storage_exhausted' }`. The `storage_exhausted` code is added to the API Error Code Matrix. Repeated 507s within a workspace MUST surface in the admin panel "failed publishes" health metric (FR-064).
- **Filesystem case-insensitivity (CHK084)**: The lowercase-hex sha256 in canonical paths is invariant — `node:crypto` `.digest('hex')` always emits lowercase. The publish path MUST normalize via `.toLowerCase()` defensively even though the digest is already lowercase, so a future rehash code change cannot accidentally produce mixed-case paths that collide on macOS APFS / Windows NTFS but not on Linux ext4. Tests MUST run on a case-sensitive filesystem (Linux CI) to catch any drift; macOS dev contributors are warned that a case-insensitive volume can mask path-normalization bugs.
- **Clock source for `<yyyy>/<mm>` path sharding (CHK083)**: Path date components MUST be derived from a single clock reading captured at publish-request entry: `const t = Math.floor(Date.now() / 1000)`, then `<yyyy> = new Date(t * 1000).getUTCFullYear()` and `<mm> = String(new Date(t * 1000).getUTCMonth() + 1).padStart(2, '0')`. UTC is the chosen frame so deployments across timezones produce stable sharding. Crossing a month boundary mid-supersede is harmless: the new row's canonical path uses the new month; the old (predecessor) row keeps its original `storage_uri`. Daylight-savings transitions and leap seconds are irrelevant under UTC.
- **`_orphaned/` destination collision (CHK037, CHK086)**: When orphan repair moves a file to `<DATA_DIR>/artifacts/_orphaned/<timestamp>/<original-relative-path>`, the `<timestamp>` segment uses ISO-8601-basic UTC at second precision (`YYYYMMDDTHHMMSSZ`, e.g., `20260501T142359Z`) sourced from `Date.now()` at the moment the sweep begins. If the destination path already exists (e.g., a prior aborted sweep left a file there), repair MUST append `-<short-hash>` (first 8 hex chars of the file's sha256) before the file extension and retry once; if that path also exists, repair MUST log a single `artifact_repaired_orphan_collision` activity row and skip the file (never overwrite). The `<original-relative-path>` is the path RELATIVE to `<DATA_DIR>/artifacts/` (the leading `artifacts/` prefix is stripped) so `_orphaned/` mirrors the canonical sharded layout.

#### Race Conditions on the Same `artifact_id` Chain

The artifact plane has three concurrent action classes that can target the same chain: `publish` (with or without `supersedes`), `quarantine` (admin), and `dispatch` (successor read). All concurrency is single-process; `better-sqlite3` serializes synchronous transactions and SQLite WAL provides snapshot-isolated reads.

- **Publish-with-supersedes vs concurrent supersede on the same predecessor (CHK069, CHK072)**: When two `publishArtifact` calls each carry `supersedes=A1` and arrive concurrently, the FR-027 single-transaction wrapper serializes them. The second-to-acquire transaction MUST detect that A1's `redaction_status` is no longer in the eligible-to-supersede set (it is now `'superseded'` because the first writer flipped it) and MUST fail with HTTP 409 `{ error: 'supersede_target_already_superseded', supersedes_id: <A1.id>, current_status: 'superseded' }`. The atomic file write for the loser is left as a healthy orphan reclaimed by FR-068. The `supersede_target_already_superseded` code is added to the API Error Code Matrix.
- **Publish vs quarantine race (read of an artifact being quarantined) (CHK070)**: A `GET /api/task-artifacts/[id]` reading row A serializes against the quarantine UPDATE through SQLite's row-level write lock. The read either observes the pre-quarantine state (returns 200 with full body) OR the post-quarantine state (returns 423 + metadata stub). There is no torn read. The dispatcher's preview-rendering path reads through the SAME predicate — `redaction_status NOT IN ('superseded','quarantined')` — so it cannot dispatch a quarantined preview after the quarantine commit.
- **Supersede vs concurrent quarantine of the predecessor (CHK071)**: When admin quarantines A1 while a publish-with-supersedes=A1 is in flight, the publish path MUST re-check `redaction_status NOT IN ('quarantined')` INSIDE the FR-027 transaction (not just at request entry). If A1 became quarantined between request entry and the transaction start, the transaction MUST abort and the publish MUST return HTTP 409 `cannot_supersede_quarantined`. The atomic file write for the new content is left as a healthy orphan reclaimed by FR-068.
- **Quarantine vs concurrent dispatch (CHK074)**: The dispatcher's `metadata.input_artifacts` SELECT (FR-040) runs inside `advanceTaskChain`'s transaction. SQLite WAL guarantees this SELECT observes a consistent snapshot — either A is present in the snapshot (it was non-quarantined at transaction start) OR it is absent (it was already quarantined). The dispatcher MUST NOT re-read after the snapshot; the WAL guarantee is sufficient. If A is quarantined AFTER the dispatcher's snapshot but BEFORE the successor task actually runs, the successor's later `GET /api/task-artifacts/[A.id]` returns 423 — the successor handles this exactly like a missing artifact (skips it; logs `artifact_skipped_quarantined_in_dispatch`).
- **Same-content concurrent publish where one carries `supersedes` (CHK075)**: Writer A publishes content X (no supersedes); writer B publishes content X (with `supersedes=existing-row`). The FR-022 `fs.link()` step is content-addressed by sha256 and is independent of the DB-level supersede transaction. The loser of the `fs.link` race takes the FR-023 EEXIST loser path (re-read + hash verify, skip FS write); the supersede transaction (FR-027) then runs on whichever writer carries `supersedes`. The two paths are orthogonal and serialize correctly.
- **Cross-row uniqueness invariant (CHK077)**: At ALL times outside the FR-027 transaction window, AT MOST ONE row per `(task_id, artifact_type)` MUST satisfy `redaction_status NOT IN ('superseded','quarantined')`. This is the dispatcher's contract for FR-040. The supersede transaction is the only writer that can momentarily expose two non-superseded rows, and SQLite WAL hides that intermediate state from readers. A test MUST assert this invariant after every supersede / quarantine / un-quarantine combination.
- **Supersede transaction failure mid-flight (CHK076)**: If the FR-027 transaction fails (e.g., `SQLITE_BUSY`, FK violation, or admin quarantined the predecessor between request entry and transaction start), the new row's already-linked canonical file is left untouched on disk. The publish MUST NOT retry automatically; the operator-triggered retry endpoint owned by SPEC-004 (`/api/tasks/[id]/retry-chain`) does NOT cover artifact publish. The orphan canonical file is reclaimed by FR-068 the next time an admin triggers orphan repair. Repeat publish attempts of identical content from the agent take the FR-023 EEXIST loser path and reuse the orphan as their canonical file (correct by design — content is content-addressed).

## Requirements *(mandatory)*

### Functional Requirements

#### Feature flags

- **FR-001**: System MUST resolve `FEATURE_DISPOSITION_LOGGING` through `resolveFlag(name, { workspaceId })` at every call site that affects behavior. With the flag OFF, no `task_dispositions` rows are inserted, no `disposition_*` activities are written, and no Aegis fail signal is generated from disposition logic.
- **FR-002**: System MUST resolve `FEATURE_TASK_ARTIFACTS` through `resolveFlag(name, ctx)` at every call site. With the flag OFF, the publish API (`POST /api/task-artifacts`) returns HTTP 503; the read API (`GET /api/task-artifacts/[id]`) ALSO returns HTTP 503; successor dispatch payloads contain no `metadata.input_artifacts` key and are byte-compatible with the SPEC-004 baseline. **Rollback evidence preservation**: Pre-existing `task_artifacts` rows (including those in `redaction_status='quarantined'` or `'redacted'`) are NEVER auto-deleted, auto-archived, or auto-mutated when the flag flips OFF — the rows remain in the database verbatim. They become inaccessible via the public API (503) but are preserved for forensic recovery if the flag is re-enabled. Files on disk under `<DATA_DIR>/artifacts/` are similarly preserved; the orphan-repair sweep MUST NOT run while the flag is OFF.
- **FR-003**: Both flags MUST default to OFF and MUST be independently togglable per workspace.

#### Disposition logging (FEATURE_DISPOSITION_LOGGING)

- **FR-010**: System MUST detect "triage templates" by inspecting `workflow_templates.output_schema` for a required top-level `disposition` field whose enum is the closed set `['merged','closed','rejected','rerouted','duplicate','spam','completed','abandoned']`.
- **FR-011**: After `advanceTaskChain` commits the task transition (the synchronous IIFE `db.transaction((): T => { ... })()` returns), the system MUST run a separate try/catch that inserts exactly one row into `task_dispositions` with `disposition`, `reason`, `triaged_by_agent_id` (= completing task's `agent_id`), `triaged_at = unixepoch()` (SQL default — monotonic with the FR-014 / FR-032 activities throttle clock), `workspace_id` (= task's workspace). The post-commit helper `runPostCommitDispositionInsert(db, parent, output, workspaceId)` MUST run BEFORE `runPostCommitSuccessorSync` (existing post-commit hook in `src/lib/task-dispatch.ts:502`) so disposition logging is not delayed by the successor's GitHub outbound-sync network calls. Disposition logging is on the synchronous path. (Clarify Session 2 / Q3.)
- **FR-012**: System MUST NOT block the task transition on disposition INSERT failure or validation failure. Task advancement always proceeds.
- **FR-013**: On output validation failure (missing field or enum violation), the system MUST write `disposition='unknown'`, write an `activities` row of `type='disposition_validation_failed'` whose payload is the **redacted, sanitized, sha256-anchored diagnostic record** described below — NOT the full agent-output payload — and fail the producer's Aegis quality_review with `reason='disposition_validation_failed'`. (Clarify Phase 4 / Security CHK073 + CHK082 consensus 3/3 high confidence: Constitution Principle XIII forbids logging raw untrusted user payloads; OWASP Logging Cheat Sheet + CWE-532 + CWE-117 + NIST AU-9 mandate sanitize-at-write-site; SPEC-006 `sanitizeLabelProvisioningError` is the established precedent at `src/lib/github-sync-engine.ts:70-91`.)

  **Required activity payload shape:**
  ```json
  {
    "rule": "disposition_validation_failed",
    "violation": "missing_field" | "enum_violation",
    "field": "disposition",
    "content_sha256": "<hex sha256 of the raw output>",
    "byte_size": <integer byte count>,
    "redacted_excerpt": "<≤4 KiB UTF-8 sanitized first-bytes excerpt>",
    "truncated": true | false
  }
  ```

  **Required sanitization pipeline before insert:** (1) compute sha256 + byte_size of raw output, (2) take the first 4 KiB UTF-8 substring (matching the FR-042 preview budget), (3) run `detectSecrets(excerpt, mime='application/json')` on the excerpt, (4) replace any findings with `<REDACTED:{rule_id}>` tokens (NEVER the matched substring — Constitution Principle XIII), (5) if `byte_size > 16 KiB` set `truncated: true`, (6) INSERT.
- **FR-014**: On INSERT failure (DB error), the system MUST write an `activities` row of `type='disposition_insert_failed'` (note: the `activities` table column is `type`, not `kind`) throttled to a maximum of 1 per `(task_id, type)` per 60 seconds. The throttle predicate is exactly `WHERE type = ? AND entity_type = 'task' AND entity_id = ? AND created_at >= unixepoch() - 60` (`created_at` is unix epoch seconds, indexed via `idx_activities_entity ON activities(entity_type, entity_id)` per `migrations.ts:460`). This mirrors the SPEC-006 `label_provisioning_failed` throttle precedent (`src/lib/github-sync-engine.ts:200-209`). Activity-write failure is logged to stderr and does NOT rethrow. (Clarify Session 2 / Q1.)
- **FR-015**: System MUST reject any agent-supplied disposition value of `'unknown'` (the value is reserved for the validation-failure code path).

#### Artifact publish + storage (FEATURE_TASK_ARTIFACTS)

- **FR-020**: System MUST expose `publishArtifact({ task_id, artifact_type, storage_kind, content|file, mime, schema_version?, supersedes? })` from `src/lib/task-artifacts.ts`. Allowed `storage_kind` values: `inline_json`, `inline_markdown`, `file`. The publish API MUST reject any request with `storage_kind='external_uri'` with HTTP 400. Inline content is persisted to ONE of the live M058 columns based on `storage_kind` (Clarify Session 2 / Q2):
  - `storage_kind='inline_json'` → write `task_artifacts.content_json` (the JSON column); `content_markdown` MUST be NULL
  - `storage_kind='inline_markdown'` → write `task_artifacts.content_markdown` (TEXT); `content_json` MUST be NULL
  - `storage_kind='file'` → both `content_json` and `content_markdown` MUST be NULL; `storage_uri` set
  A read-side helper `getInlineContent(row): string | Buffer | null` in `task-artifacts.ts` SHOULD return whichever column matches `storage_kind`. `preview_text` (also a live M058 column) is materialized at publish time (post-redaction for text-like; binary stub for binary) and recomputed on supersede. The FR-029 enums-snapshot test MUST `EXPLAIN` the live `task_artifacts` schema and assert the `content_json` / `content_markdown` column split exists.
- **FR-021**: System MUST keep inline content ≤ 64 KiB UTF-8 encoded. Content > 64 KiB MUST auto-promote to `file` storage with an appropriate extension derived from MIME.
- **FR-022**: For file-backed artifacts, the system MUST execute the following atomic write sequence (Clarify Session 2 / Q5):
  1. Write to a temp file `<DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/.tmp.<sha256>.<pid>.<rand>` (the temp MUST live in the same canonical directory tree under `<DATA_DIR>` — NEVER in system `/tmp` or in any tmpfs path; Docker deploys this app with `read_only: true` and a named volume mounted at `/app/.data`, so `/tmp` is on a different filesystem and `fs.link` across filesystems would fail with `EXDEV`).
  2. `fsync` the temp file.
  3. Promote temp → canonical via Node `fs.link(tmpPath, canonicalPath)` (POSIX `link(2)` — atomic, fails with `EEXIST` when the canonical path exists). If `fs.link` returns `EEXIST`, follow FR-023's loser path. On any other error, abort and clean up the temp.
  4. On link success: `fs.unlink(tmpPath)` to remove the now-orphaned temp inode.
  5. `fsync` the parent directory.
  6. Begin the SQLite transaction (per FR-027) for the new-row INSERT (and supersedes UPDATE if applicable). The DB row INSERT MUST occur ONLY after step 5 completes.

  `storage_uri` MUST be relative to `DATA_DIR`. The system MUST NOT use `fs.rename` (silent-overwrite on POSIX) for promotion; `fs.link` is the only correct primitive given the same-content concurrency contract in FR-023.
- **FR-023**: System MUST detect concurrent same-content writes via the atomic `fs.link` primitive in FR-022. The loser path (when `fs.link` returns `EEXIST`):
  1. Re-read the existing canonical file, recompute its sha256, and assert equality with the new content's sha256. Hash mismatch in this branch MUST mark the new row's `security_scan_status='hash_mismatch'`, return HTTP 500, and write an `activities` row of `type='artifact_hash_verification_failed'` with both hashes (this branch should be impossibly rare absent sha256 collision or filesystem corruption).
  2. On hash match: `fs.unlink` the loser's `.tmp.*`, then INSERT the loser's DB row pointing at the same canonical `storage_uri`. Both writers' rows reference the same canonical file; both rows are valid.
  3. The canonical file is written exactly once even under N concurrent writers.
- **FR-024**: System MUST reject HTTP 413 if file size > 25 MiB.
- **FR-025**: System MUST reject HTTP 415 if MIME is not in the allowlist: `text/plain`, `text/markdown`, `application/json`, `application/x-yaml`, `application/pdf`, `image/png`, `image/jpeg`, `image/svg+xml`, `application/zip`.
- **FR-026**: System MUST use the producer task's `workspace_id` as the authoritative workspace for storage path and policy. If `session.activeWorkspace` differs and the session is non-Facility, the publish MUST return HTTP 403. Facility-scoped sessions MUST be allowed to publish across workspaces.
- **FR-027**: On republish with `supersedes: <prev_id>`, the new-row INSERT (with `supersedes_artifact_id=<prev_id>`) AND the previous row's UPDATE (`redaction_status='superseded'`) MUST run inside a single `db.transaction(() => { ... })()` (Clarify Session 2 / Q4). The file-write sequence in FR-022 (temp + fsync + `fs.link` + parent-dir fsync) MUST complete before the transaction begins; if the transaction fails, the canonical file is left as a healthy orphan to be reclaimed by the FR-068 orphan-repair sweep. Successor dispatch (FR-040) MUST therefore observe exactly one non-superseded row per `(task_id, artifact_type)` at all times outside the transaction window. SQLite WAL mode guarantees readers see a pre-COMMIT snapshot, so no partial supersede state is ever visible.
- **FR-028**: System MUST update the in-memory p95 latency ring buffer (publish path, 1024 observations per workspace) on every successful publish.
- **FR-029**: System MUST enforce the application-level enum sets, exported as ordered, frozen `const` tuples from `src/lib/task-artifacts.ts`:
  - `export const REDACTION_STATUSES = ['pending','clean','redacted','rejected','quarantined','superseded'] as const`
  - `export const SECURITY_SCAN_STATUSES = ['pending','scanned_clean','scanned_with_findings','scan_error','hash_mismatch','file_missing'] as const`

  A dedicated snapshot test at `src/lib/__tests__/task-artifacts.enums.test.ts` MUST assert (i) the exact ordered contents of both tuples, and (ii) an `EXPLAIN` of the live `task_artifacts` schema confirming no DB-level CHECK constraint exists on `redaction_status` or `security_scan_status`. The test fails if any enum value is added, removed, reordered, or if a CHECK constraint is introduced. (Clarify Session 1 / Q2.)

#### Secret detector

- **FR-030**: System MUST export `detectSecrets(content: string | Buffer, mime: string): { findings: SecretFinding[], redacted: string | Buffer }` from `src/lib/secret-detector.ts`.
- **FR-031**: System MUST ship MC Secret Detector v1 as a CLOSED, BOUNDED rule list (no transitive gitleaks pulls). Pattern provenance is gitleaks v8.18.0 plus MC additions. The complete v1 family list is:
  1. AWS access key id (`AKIA[0-9A-Z]{16}` and `ASIA[0-9A-Z]{16}` for STS sessions)
  2. AWS secret access key (40-char base64-ish + AWS context heuristic)
  3. GitHub Personal Access Tokens (classic `ghp_…` and user `ghu_…`)
  4. GitHub fine-grained PAT (`github_pat_…`)
  5. GitHub OAuth / refresh / server tokens (`gho_…`, `ghs_…`, `ghr_…`)
  6. Google API key (`AIza[0-9A-Za-z\-_]{35}`)
  7. **Google Cloud service-account JSON compound** (`"type": "service_account"` + `"private_key"` PEM-block in same JSON object) — promoted from v2 deferral per Clarify Session 1 consensus (Q3)
  8. Slack tokens (`xoxb-…` bot, `xoxp-…` user, `xoxa-…` workspace, `xoxr-…` refresh)
  9. Stripe live keys (`sk_live_…` secret, `pk_live_…` publishable)
  10. PEM private key headers (`-----BEGIN PRIVATE KEY-----`, `-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN EC PRIVATE KEY-----`, `-----BEGIN OPENSSH PRIVATE KEY-----`)
  11. Generic env-style assignments (case-insensitive `^(password|api[_-]?key|token|secret)\s*=\s*[A-Za-z0-9/+=._\-]{16,}$`)
  12. JSON Web Token (`eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+`)
  13. Authorization Bearer header (`(?i)authorization:\s*bearer\s+[A-Za-z0-9._\-]{20,}`)
  14. Anthropic API key (`sk-ant-(api03|sid01)-[A-Za-z0-9_\-]{93,}`)
  15. OpenAI API key (`sk-(proj-)?[A-Za-z0-9_\-]{40,}`)
  16. **HashiCorp Vault service token** (`hvs\.[A-Za-z0-9_\-]{20,}`) — promoted from v2 deferral per Clarify Session 1 consensus (Q3)
  17. **npm access token** (`npm_[A-Za-z0-9]{36}`) — promoted from v2 deferral per Clarify Session 1 consensus (Q3)

  Each family ships a single canonical regex in `src/lib/secret-detector.rules.ts`; per-rule positive AND negative test fixtures are MANDATORY (CI gate). The list is closed for v1 — no transitive inclusion of unlisted gitleaks rules.
- **FR-032**: When detector findings ≥ 1, the system MUST reject the publish with HTTP 422 + redacted preview, and write an `activities` row of `type='security_violation'` throttled identically to FR-014 (`WHERE type = 'security_violation' AND entity_type = 'task' AND entity_id = ? AND created_at >= unixepoch() - 60`). Activity-write failure is logged but does NOT rethrow. The 422 response body's `redacted_preview` field is a UTF-8 string of at most 4 KiB containing the post-redaction content head; for binary MIMEs (where redaction is not applied per FR-034) the `redacted_preview` field is the literal string `'(binary, ${byte_size} bytes, sha256=${sha256.slice(0,12)})'` (mirroring the binary-stub convention in FR-042). The `findings` field is a non-negative integer count; the response MUST NOT include rule names, matched substrings, byte offsets, or any other information that could be used to reconstruct the secret.
- **FR-033**: When `workflow_templates.allow_redacted_artifacts=1` (M054) AND MIME is text-like (`text/*`, `application/json`, `application/x-yaml`), the system MUST store the redacted content with `redaction_status='redacted'` and `security_scan_status='scanned_with_findings'`.
- **FR-034**: Binaries with detector findings MUST always reject with HTTP 422 regardless of `allow_redacted_artifacts`.
- **FR-035**: Every detector rule MUST pass `safe-regex` validation in CI; the detector test suite MUST achieve ≥ 0.95 recall on the wild corpus.
- **FR-035a (Detector Coverage Discipline — no-bypass)**: To prevent any path that bypasses `detectSecrets`, the system MUST enforce all of the following:
  1. **Sole creation entry point.** `publishArtifact()` in `src/lib/task-artifacts.ts` is the ONLY code path permitted to INSERT rows into `task_artifacts`. Direct DB inserts from outside this function (route handlers, admin tools, migrations, repair sweeps) are prohibited. The strict-scope grep gate (FR-100 / SC-010) keeps the publish path inside the 6 declared files.
  2. **Detector runs before any storage write.** `detectSecrets(content, mime)` MUST execute, and its findings MUST be evaluated, BEFORE any byte is written to the canonical FS path AND BEFORE any `task_artifacts` INSERT statement is prepared. The atomic-write sequence in FR-022 begins only after the gate is cleared.
  3. **Supersedes re-runs the detector.** A republish via `supersedes: <prev_id>` (FR-027) MUST run `detectSecrets` against the NEW content. Cleanliness MUST NOT be inherited from the predecessor row's `redaction_status` / `security_scan_status`.
  4. **No admin override of the detector gate.** The admin guard (FR-062) gates destructive read/quarantine/delete actions but MUST NOT expose any "skip detector" or "force-clean publish" surface. Admin-published artifacts traverse `publishArtifact` and the detector identically to agent publishes.
  5. **Repair / rebuild / sweep paths MUST NOT re-evaluate.** `rebuildPreviews` (FR-062), `repairOrphans` (FR-068), and `runRetentionSweep` (FR-069) MUST preserve the existing `redaction_status` and `security_scan_status` values of every row they touch. They MUST NOT re-run the detector and they MUST NOT promote a `'redacted'` or `'rejected'` row to `'clean'`. Status changes from these paths are limited to: orphan-repair flipping a missing-file row to `redaction_status='rejected'` + `security_scan_status='file_missing'` (FR-068); retention-sweep moving a row to archive without changing its scan/redaction status; rebuild-previews recomputing `preview_text` only.
  6. **Disposition write paths: row body NOT scanned; activity payload IS sanitized at the write boundary.** The `task_dispositions.reason` free-text field is NOT routed through `detectSecrets` (the row's boundary is the agent-output validator, not the detector). However, the `disposition_validation_failed` activity payload (FR-013) IS sanitized at the activity-write boundary per FR-013's required pipeline (sha256-anchored diagnostic record + ≤4 KiB redacted excerpt with `<REDACTED:{rule_id}>` tokens + 16 KiB truncation flag). This aligns with Constitution Principle XIII: the activity log is itself a "boundary write" and cannot be exempted from sanitization (Phase 4 security consensus 3/3 high confidence — superseded the prior "deferred to future spec" framing).

#### Successor dispatch

- **FR-040**: With `FEATURE_TASK_ARTIFACTS=ON`, when `advanceTaskChain` dispatches the next task, the system MUST attach `metadata.input_artifacts: Array<{ id, type, sha256, preview_text, storage_kind, byte_size }>` to the successor task's `metadata` JSON column (sibling of the SPEC-004-owned `metadata.task_pipeline` namespace), populated from the producer task's latest non-superseded, non-quarantined `task_artifacts` rows. (Clarify Session 3 / Q1: there is no `tasks.input` column — the existing payload storage is `tasks.metadata`.)
- **FR-041**: Raw artifact content MUST be available only via `GET /api/task-artifacts/[id]` with authentication. Successor agents MUST NOT receive raw content in the dispatch payload.
- **FR-042**: `preview_text` MUST be the first 4 KiB of UTF-8-decoded post-redaction content for text-like MIMEs (`text/*`, `application/json`, `application/x-yaml`), or the literal string `'(binary, ${byte_size} bytes, sha256=${sha256.slice(0,12)})'` for binary MIMEs.
- **FR-043**: With `FEATURE_TASK_ARTIFACTS=OFF`, the successor's `metadata` JSON MUST NOT contain an `input_artifacts` key (byte-compatible with SPEC-004 baseline; key absence asserted with `'input_artifacts' in JSON.parse(successor.metadata) === false`). The flag-OFF baseline is captured in `src/lib/__tests__/__fixtures__/spec-004-dispatch-metadata-baseline.json` as a structural shape (keys + types) and asserted by a Vitest deep-shape diff. An EXPLAIN QUERY PLAN test MUST also guard against query-plan drift, reusing `src/lib/__tests__/__fixtures__/explain-query-plan-pre-m62.json`. (Clarify Session 3 / Q2.)

#### Audit panel ("Dispositions" tab in src/components/panels/audit-trail-panel.tsx)

- **FR-050**: System MUST add a "Dispositions" tab to `audit-trail-panel.tsx` with filters for `workspace_id`, `disposition` (multi-select), date range (preset + custom), `triaged_by_agent_id` (dropdown), and `task_id` (numeric exact OR title substring).
- **FR-051**: Results MUST be paginated by **opaque base64url cursor** on `(triaged_at DESC, id DESC)` with a default page size of 50 and a max of 200. Cursor format (server-side): `base64url(JSON.stringify({ triaged_at: number, id: number }))`. Wire contract: clients pass the opaque string back as `?cursor=<value>`; server decodes to apply `WHERE (triaged_at, id) < (?, ?)`. Malformed cursor → HTTP 400 with code `invalid_cursor`. Response shape: `{ dispositions: Array<...>, next_cursor: string | null, has_more: boolean }` (NOT the offset-pagination `{total, hasMore}` shape used by `/api/activities`). (Clarify Session 3 / Q5: no existing cursor-pagination precedent in the codebase; SPEC-007 establishes this convention.)
- **FR-052**: When at least one row exists, the tab MUST display a banner reading "Logging began on YYYY-MM-DD" derived from the earliest `task_dispositions.triaged_at`. The banner MUST be hidden if no rows exist.

#### Artifact admin panel (src/components/panels/artifact-admin-panel.tsx)

- **FR-060**: System MUST provide an artifact admin panel that lists and searches artifacts with filters by `workspace_id`, `artifact_type`, `redaction_status`, `security_scan_status`, and date range.
- **FR-061**: The panel MUST allow inspection of metadata, preview text rendering, and raw content download for non-quarantined non-binary artifacts.
- **FR-062**: Destructive actions MUST be gated by the existing admin guard pattern: quarantine (reversible), un-quarantine, delete, archive, hash-verify (single + batch), repair orphans (bidirectional), rebuild previews/indexes, and run retention sweep.
- **FR-063**: Each destructive action MUST write an `activities` row with `type ∈ {'artifact_quarantined','artifact_unquarantined','artifact_deleted','artifact_archived','artifact_hash_verified','artifact_repaired_orphan','artifact_previews_rebuilt','artifact_retention_swept'}` (note: the `activities` column is `type`, not `kind`) and a payload of `{artifact_id, actor_session_id, reason, before_status, after_status}`. The state-changing DB write (UPDATE on `task_artifacts`) AND the audit-row INSERT MUST run inside a single `db.transaction(() => { ... })()` so that no partial state is observable: either both rows commit or neither does. For actions that include a side-effecting filesystem step (delete file, archive move, orphan move per FR-068, retention-sweep file ops per FR-069), the FS step MUST complete BEFORE the transaction begins; if the transaction fails after a successful FS step, the canonical file is left as a healthy orphan reclaimable by FR-068 — never as a "DB says alive, FS says gone" inconsistency. The `reason` field is REQUIRED (free text, captured verbatim in the audit payload, no length cap enforced beyond the existing `activities` table column constraints). The privileged-read audit type `artifact_quarantined_read_overridden` (FR-065) is NOT in this destructive-action set — it is its own audit category — but it shares the same write path and payload conventions.
- **FR-064**: The panel MUST surface health metrics: artifact counts, total bytes, failed publishes/scans/reads, orphan count, storage free space, and p95 publish/read latency per workspace from the in-memory ring buffer. If fewer than 100 observations exist for a metric, the cell MUST display "insufficient data".
- **FR-065**: Quarantine MUST set `redaction_status='quarantined'`. Reads of quarantined artifacts MUST return HTTP 423 Locked with a metadata-only stub body unless the request includes `?include_quarantined=1` AND the caller is admin. Every successful admin-override read (i.e., `GET /api/task-artifacts/[id]?include_quarantined=1` returning 200 to an admin caller) MUST write an `activities` row of `type='artifact_quarantined_read_overridden'` with payload `{ artifact_id, actor_session_id, actor_user_id, requested_at: unixepoch() }` (Clarify Session 3 / Q4 — Constitution Principle X mandates a durable record of every governance-boundary crossing; NIST SP 800-53 AU-2/AU-3/AU-12 require complete unthrottled logging of privileged access; HashiCorp Vault and AWS KMS audit every privileged read unconditionally). This audit row MUST NOT be throttled — every override read produces exactly one row. The throttle pattern is reserved for failure-noise events (FR-014, FR-032), not authorized governance-boundary access. The audit row is written ONLY on successful override reads (200 response). Failed override attempts (`?include_quarantined=1` from a non-admin caller, returning 423) do NOT write `artifact_quarantined_read_overridden`; they MAY be captured by existing API-access logging but are out of scope for SPEC-007's audit surface. The `artifact_quarantined_read_overridden` activity is therefore a positive marker of authorized governance-boundary crossings, never a negative or attempt marker.
- **FR-066**: Successor dispatch MUST silently skip quarantined artifacts and write an `activities` row of `type='artifact_skipped_quarantined_in_dispatch'` with payload `{ artifact_id, producer_task_id, successor_task_id, workspace_id, reason: 'quarantined' }`. This row is NOT throttled — one row per skipped artifact per dispatch — so forensic reconstruction of which dispatches were narrowed by quarantine is always possible.
- **FR-067**: Hash verification MUST re-hash the file. On mismatch, the system MUST set `security_scan_status='hash_mismatch'` and write an `activities` row of `type='artifact_hash_verified'` (`type`, not `kind` — `activities` table column name) with payload `{ artifact_id, actor_session_id, expected_sha256, actual_sha256, byte_size, before_status, after_status }`; the system MUST NOT auto-quarantine and MUST NOT auto-delete. Read-side behavior of a row in `security_scan_status='hash_mismatch'`: `GET /api/task-artifacts/[id]` continues to return the artifact metadata and stored content (the row remains accessible per the no-auto-delete / evidence-preservation principle); the `security_scan_status` field in the response body alerts callers to the integrity failure. Quarantine of a hash-mismatched artifact remains an explicit admin action via FR-062.
- **FR-068**: Orphan repair MUST handle both directions: a DB row without a file MUST get `redaction_status='rejected'` and `security_scan_status='file_missing'` (row preserved); a file without a DB row MUST be moved to `<DATA_DIR>/artifacts/_orphaned/<timestamp>/<original-relative-path>`.
- **FR-069**: Retention sweep MUST read per-workspace `feature_flags.artifact_retention = { keep_days, archive_after_days, delete_after_days }` (any field may be `null`, default null = keep forever) and apply the policy when an admin clicks "Run retention sweep". The system MUST NOT run the sweep automatically. Each manual sweep MUST write a single summary `activities` row of `type='artifact_retention_swept'` with payload `{ workspace_id, actor_session_id, policy_snapshot: { keep_days, archive_after_days, delete_after_days }, counts: { archived, deleted, skipped }, started_at, completed_at }`. The `policy_snapshot` captures the policy values in effect at sweep time (so subsequent policy edits do not retroactively alter forensic evidence).

#### Dashboard widget (src/components/dashboard/dashboard.tsx)

- **FR-070**: System MUST render a per-workspace dashboard card titled "Last 7d triage totals" containing a total count and 7 stacked bars (one per day, segments per disposition).
- **FR-071**: The client MUST poll the rollup endpoint every 30 seconds.
- **FR-072**: The server-side rollup query MUST be cached for 15 seconds keyed on `(workspace_id, day_bucket)`. The cache MUST be invalidated on every disposition INSERT.

#### Generic dispositions API (src/app/api/dispositions/route.ts)

- **FR-080**: System MUST expose `GET /api/dispositions` with filters: `workspace_id` (required for non-Facility callers; missing → HTTP 400 code `workspace_id_required`), `disposition` (multi-select), `since` and `until` (ISO timestamps), `triaged_by_agent_id`, `task_id`. **Opaque base64url cursor pagination** on `(triaged_at DESC, id DESC)` with the same format and response shape as FR-051. Server response shape: `{ dispositions: Array<...>, next_cursor: string | null, has_more: boolean }`.
- **FR-081**: Auth MUST follow the same pattern as `/api/activities`. v1 MUST NOT impose any rate limit beyond existing API-key gating.

#### API Error Code Matrix (per Clarify Session 3 / Q3)

The following table is the authoritative contract for HTTP status codes emitted by SPEC-007 endpoints. Every code listed here MUST be tested by the contract-test suite; codes not listed here are NOT permitted responses for the covered scenarios. Error body shape MUST follow the existing project convention `{ error: '<error_code>' }` with optional domain-specific supplemental fields (per `openapi.json` global Error schema and `src/app/api/activities/route.ts:18,36`). The system MUST NOT introduce a generic `code` field — domain-specific fields like `missing_mentions`, `redacted_preview`, `limit_bytes`, `mime`, `artifact_id` are added inline alongside `error`.

| Endpoint | Condition | HTTP Status | Error body |
|----------|-----------|-------------|------------|
| `POST /api/task-artifacts` | Both flags resolve OFF | 503 | `{ error: 'artifact_store_disabled' }` |
| `POST /api/task-artifacts` | `storage_kind='external_uri'` | 400 | `{ error: 'external_uri_rejected' }` |
| `POST /api/task-artifacts` | Bad input (missing required field, malformed) | 400 | `{ error: 'bad_request', details?: string[] }` |
| `POST /api/task-artifacts` | Unauthenticated | 401 | `{ error: 'unauthenticated' }` |
| `POST /api/task-artifacts` | Session workspace ≠ producer workspace (non-Facility) | 403 | `{ error: 'workspace_mismatch' }` |
| `POST /api/task-artifacts` | `supersedes` target is quarantined | 409 | `{ error: 'cannot_supersede_quarantined', supersedes_id: <id> }` |
| `POST /api/task-artifacts` | File > 25 MiB | 413 | `{ error: 'payload_too_large', limit_bytes: 26214400 }` |
| `POST /api/task-artifacts` | MIME not in allowlist | 415 | `{ error: 'unsupported_media_type', mime: '<received>' }` |
| `POST /api/task-artifacts` | Detector findings ≥ 1, redact-and-store NOT enabled | 422 | `{ error: 'secret_detected', redacted_preview: '<...>', findings: number }` |
| `POST /api/task-artifacts` | Redaction would empty the artifact | 422 | `{ error: 'redaction_would_empty_artifact' }` |
| `POST /api/task-artifacts` | sha256 collision detected post-link (extremely rare) | 500 | `{ error: 'artifact_hash_verification_failed' }` |
| `GET /api/task-artifacts/[id]` | Flag OFF | 503 | `{ error: 'artifact_store_disabled' }` |
| `GET /api/task-artifacts/[id]` | Unauthenticated | 401 | `{ error: 'unauthenticated' }` |
| `GET /api/task-artifacts/[id]` | Caller cannot read this workspace | 403 | `{ error: 'workspace_forbidden' }` |
| `GET /api/task-artifacts/[id]` | Artifact id not found | 404 | `{ error: 'artifact_not_found' }` |
| `GET /api/task-artifacts/[id]` | Quarantined; no `?include_quarantined=1` OR not admin | 423 | `{ error: 'artifact_locked', artifact_id: <id> }` |
| `GET /api/dispositions` | Flag OFF | 503 | `{ error: 'disposition_logging_disabled' }` |
| `GET /api/dispositions` | `workspace_id` missing for non-Facility caller | 400 | `{ error: 'workspace_id_required' }` |
| `GET /api/dispositions` | Malformed `cursor` parameter | 400 | `{ error: 'invalid_cursor' }` |
| `GET /api/dispositions` | Unauthenticated | 401 | `{ error: 'unauthenticated' }` |
| `GET /api/dispositions` | Caller cannot read this workspace | 403 | `{ error: 'workspace_forbidden' }` |

#### Aegis hook (src/lib/aegis-review.ts — thin new module per Clarify Session 1 consensus / Q1)

- **FR-090**: System MUST ship a thin new module `src/lib/aegis-review.ts` exporting:
  - `export const AEGIS_FAILURE_REASONS = ['secret_in_artifact', 'disposition_validation_failed'] as const`
  - `export function evaluateSpec007AegisSignals(taskId: number, db: Database, reviewWindow: { since: string }): AegisFailure | null` — inspects `activities` for `type='security_violation'` AND `task_dispositions` for `disposition='unknown'` for the producer task, returns the first matching `AegisFailure { reason, evidence }` or `null` when both signals are clean. (`activities.type` is the canonical column per FR-120; `kind` is legacy narrative shorthand only.)

  The pre-existing `runAegisReviews` in `src/lib/task-dispatch.ts` MUST call `evaluateSpec007AegisSignals` BEFORE its other checks. When the helper returns a non-null `AegisFailure`, `runAegisReviews` MUST FAIL the producer task with the returned `reason` (`secret_in_artifact` or `disposition_validation_failed`). When it returns `null`, behavior continues unchanged.

  The full `runAegisReviews` body remains in `task-dispatch.ts` (NOT extracted, NOT in strict scope) — this preserves the SPEC-003 / SPEC-004 boundary. Only `aegis-review.ts` (the new thin module + its constants and helper) enters SPEC-007 strict scope. SPEC-007 introduces no other Aegis behavior changes.

#### Strict-scope discipline

- **FR-100**: System MUST add the following 6 files to `tsconfig.spec-strict.json` `include` AND to the `specStrictFiles` array in `eslint.config.mjs` (per Clarify Session 1 consensus / Q4):
  1. `src/lib/secret-detector.ts`
  2. `src/lib/secret-detector.rules.ts`
  3. `src/lib/__tests__/secret-detector.test.ts`
  4. `src/lib/aegis-review.ts`
  5. `src/lib/task-artifacts.ts` (owns FR-029 enums, the publish/read path, and the in-process p95 ring buffer — bulk of SPEC-007 risk surface)
  6. `src/lib/__tests__/task-artifacts.enums.test.ts` (snapshot-test sibling guarding the FR-029 enums)

  A strict-scope grep test MUST verify that ONLY these 6 files (plus the SPEC-007-touched files outside strict scope: `src/lib/task-dispatch.ts` for the post-commit insert hook + Aegis call, `src/components/dashboard/dashboard.tsx`, `src/components/panels/audit-trail-panel.tsx`, `src/components/panels/artifact-admin-panel.tsx`, `src/app/api/dispositions/route.ts`, `src/app/api/task-artifacts/route.ts`, `src/app/api/task-artifacts/[id]/route.ts`, the configuration files `tsconfig.spec-strict.json` and `eslint.config.mjs`, and the SPEC-007 test/fixture additions under `src/lib/__tests__/__fixtures__/spec-004-dispatch-metadata-baseline.json`, `src/lib/__tests__/__fixtures__/secrets/**`, `src/lib/__tests__/task-artifacts.test.ts`, `src/lib/__tests__/aegis-review.test.ts`, `src/lib/__tests__/advance-task-chain-disposition.test.ts`, `src/lib/__tests__/advance-task-chain-input-artifacts.test.ts`, plus the three Playwright specs `tests/e2e/disposition-audit-tab.spec.ts`, `tests/e2e/disposition-dashboard-widget.spec.ts`, `tests/e2e/artifact-admin-panel.spec.ts`, plus `scripts/seed-spec-007.ts`) are modified by the SPEC-007 PR diff against `main`. Any additional file in the diff MUST fail the test.

#### Regression-safety invariants (added per regression-safety checklist remediation)

- **FR-110 (Baseline-fixture freshness)**: The flag-OFF dispatch parity test (asserting structural shape against `src/lib/__tests__/__fixtures__/spec-004-dispatch-metadata-baseline.json`) MUST FAIL HARD when the baseline fixture is missing, unreadable, or has zero keys — the test MUST NOT skip silently. The matching EXPLAIN-QUERY-PLAN test (against `src/lib/__tests__/__fixtures__/explain-query-plan-pre-m62.json`) MUST follow the same rule. A first-line `expect(fs.existsSync(BASELINE_PATH)).toBe(true)` (or equivalent) precondition is REQUIRED in both tests. (Remediates checklist CHK012.)

- **FR-111 (Direct-DB-write boundary for SPEC-007 tables)**: Code paths OUTSIDE `src/lib/task-artifacts.ts` and `src/lib/aegis-review.ts` MUST NOT execute `INSERT`/`UPDATE`/`DELETE` SQL against `task_artifacts` or `task_dispositions`, with the following EXACT exceptions:
  1. `src/lib/task-dispatch.ts` is the SOLE writer of `task_dispositions` rows via `runPostCommitDispositionInsert` (FR-011). It is the SOLE READER of `task_artifacts` for `metadata.input_artifacts` population (FR-040). It MUST NOT execute any `INSERT`/`UPDATE`/`DELETE` against `task_artifacts`.
  2. The three new API routes (`src/app/api/dispositions/route.ts`, `src/app/api/task-artifacts/route.ts`, `src/app/api/task-artifacts/[id]/route.ts`) and the three UI files (`src/components/panels/audit-trail-panel.tsx`, `src/components/panels/artifact-admin-panel.tsx`, `src/components/dashboard/dashboard.tsx`) MUST delegate ALL writes (publish, supersede, quarantine, un-quarantine, delete, archive, hash-verify, repair, retention sweep, preview rebuild) to functions exported from `src/lib/task-artifacts.ts`. Reads MAY use direct `SELECT` SQL but MUST use the workspace-scoping predicates documented in FR-026/FR-050/FR-080.
  3. Migrations and seed scripts (`scripts/seed-spec-007.ts`) are exempt from this boundary — they may insert seed rows directly.
  A CI grep guard MUST enforce this boundary by failing the build when any file outside the exception list contains the regex `(INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?(task_artifacts|task_dispositions)\b` (case-sensitive). (Remediates checklist CHK048, CHK050, CHK051.)

- **FR-112 (External_uri admin-panel render)**: Existing `task_artifacts` rows with `storage_kind='external_uri'` (legacy) MUST render in the artifact admin panel and in `GET /api/task-artifacts/[id]` with the following behavior:
  - The list view shows the row's metadata (id, task, workspace, type, mime, byte_size, sha256, redaction_status, security_scan_status, created_at) and a literal `storage_uri` value badged "external".
  - The detail view shows the same metadata plus a "Source: external" badge. The panel MUST NOT auto-fetch the `external_uri` content; download/preview controls are DISABLED for `external_uri` rows.
  - `GET /api/task-artifacts/[id]` for an `external_uri` row returns the metadata body (same shape as a file or inline row) but with a `storage_kind: 'external_uri'` field; it MUST NOT proxy or fetch the external resource.
  - Quarantine, un-quarantine, hash-verify, archive, and delete admin actions MUST behave on `external_uri` rows by updating only the DB row's status fields (no FS work). Hash-verify on an `external_uri` row is a NO-OP that writes an `activities` row of `type='artifact_hash_verified'` with `outcome='skipped_external_uri'`.
  - Retention sweep on `external_uri` rows removes only the DB row per Edge Cases. (Remediates checklist CHK041.)

- **FR-113 (Existing-pagination invariance)**: SPEC-007 MUST NOT modify the response shape of any pre-existing API endpoint that uses offset pagination (`{ total, hasMore }`). The opaque cursor pagination format defined in FR-051 / FR-080 is EXCLUSIVELY for the two new SPEC-007 endpoints (`GET /api/dispositions` and the audit-panel disposition-list rollup) and MUST NOT be retroactively applied. A CI grep guard MUST FAIL if `git diff main -- src/app/api/activities/route.ts` or any other pre-existing offset-paginated route file returns a change touching response-shape keys (`total`, `hasMore`, `next_cursor`, `has_more`). FR-051 / FR-080 are the SOLE authority for cursor pagination in SPEC-007; any future spec adopting cursor pagination MUST cite this section as precedent and define its own scope explicitly. (Remediates checklist CHK044, CHK047.)

- **FR-114 (Feature-flag direct-read CI guard)**: CI MUST grep all source files in the SPEC-007 PR diff for the regex `process\.env\.FEATURE_(DISPOSITION_LOGGING|TASK_ARTIFACTS)` (case-sensitive) and FAIL the build when any production-code match is found (excluded paths: `src/lib/__tests__/**` test files that intentionally manipulate env to verify the override-OFF semantics — see precedent at `src/lib/__tests__/feature-flag-service.test.ts:138-143`). The failure message MUST instruct the developer to use `resolveFlag(name, { workspaceId })` instead. This guard MUST run as a step in `pnpm guardrails` (the SPEC-004 consolidated CI script). (Remediates checklist CHK061.)

#### Failure-mode invariants (added per error-handling checklist remediation)

The following FR-120 series consolidates failure-path requirements surfaced by the error-handling checklist. Where an existing FR (FR-013 / FR-014 / FR-022 / FR-027 / FR-068 / FR-069) already speaks to the same scenario, this section adds the missing predicate and cross-references back. The user-facing acceptance-scenario prose in §User Stories (which uses the legacy `kind=` shorthand) is normatively superseded by the canonical `type=` column name documented in FR-014 / FR-063 — see FR-120 below.

- **FR-120 (Activity-column terminology — `type` is canonical)**: Throughout this spec, every reference to "an `activities` row of `kind='X'`" or "`activities.kind='X'`" in §User Scenarios prose, §Edge Cases, and §FR-013 MUST be read as "an `activities` row of `type='X'`" — `activities.type` (per `migrations.ts:455-460`) is the canonical column; `kind` is informal narrative shorthand inherited from the design concept and is NOT a separate column. Contract tests, throttle SQL (FR-014, FR-032), and the activities INSERT statement in `runPostCommitDispositionInsert` MUST use `type`. CI grep MUST FAIL the build if any production code (excluding test fixtures and committed `.md` docs) writes a literal SQL string containing `activities.kind` or `INSERT INTO activities (kind`. (Remediates checklist CHK017.)

- **FR-121 (Mid-flight flag transitions are observed at decision time only)**: `resolveFlag(name, { workspaceId })` MUST be called exactly ONCE per logical operation at the documented call sites and the resolved value MUST be cached in the local stack frame for the duration of that operation. Mid-flight flag flips MUST NOT abort an in-flight operation: a publish that has cleared `resolveFlag` and entered the FR-022 atomic-write protocol MUST run to completion (file written + row INSERTed or fully aborted with no partial state); a disposition insert that has entered the FR-011 try-block MUST run to completion. The next operation observes the new flag value. (Remediates checklist CHK007, CHK008.)

- **FR-122 (Error-precedence ordering)**: When multiple error conditions apply to the same request, the system MUST emit the FIRST matching status code in the following ordered list (top wins):
  1. `503 artifact_store_disabled` / `503 disposition_logging_disabled` (flag OFF)
  2. `401 unauthenticated`
  3. `403 workspace_forbidden` / `403 workspace_mismatch`
  4. `400 bad_request` / `400 external_uri_rejected` / `400 invalid_cursor` / `400 workspace_id_required`
  5. `404 artifact_not_found`
  6. `409 cannot_supersede_quarantined`
  7. `423 artifact_locked`
  8. `413 payload_too_large`
  9. `415 unsupported_media_type`
  10. `422 redaction_would_empty_artifact` (precedes `secret_detected`)
  11. `422 secret_detected`
  12. `500 artifact_hash_verification_failed`

  Contract tests MUST exercise at least three precedence pairs (flag-OFF + unauthenticated → 503; non-Facility + missing workspace_id → 403 not 400; quarantined + non-admin → 423 not 403). (Remediates checklist CHK027, CHK039.)

- **FR-123 (Method-not-allowed behavior)**: Each new endpoint MUST return HTTP 405 with `{ error: 'method_not_allowed' }` for any HTTP method outside its declared verb set. The Next.js App Router default 405 behavior is sufficient — no explicit middleware required — but the contract-test suite MUST assert one off-method per endpoint. (Remediates checklist CHK038.)

- **FR-124 (Admin-action HTTP error matrix)**: Admin destructive actions exposed at the artifact admin panel MUST return:

  | Action | Condition | HTTP | Error code |
  |--------|-----------|------|-----------|
  | Any destructive action | Caller is not admin | 403 | `forbidden_admin_required` |
  | Any destructive action | Both flags resolve OFF | 503 | `artifact_store_disabled` |
  | Quarantine / un-quarantine | Target id not found | 404 | `artifact_not_found` |
  | Quarantine | Target already quarantined | 409 | `already_quarantined` |
  | Un-quarantine | Target not quarantined | 409 | `not_quarantined` |
  | Delete / archive | Target id not found | 404 | `artifact_not_found` |
  | Hash-verify | Target id not found | 404 | `artifact_not_found` |
  | Hash-verify (single) | Hash mismatch detected (FR-067 path) | 200 | (success body with `outcome: 'hash_mismatch'`) — non-error |
  | Repair orphans | (always success unless flag OFF) | 200 | (summary body) |
  | Retention sweep | (always success unless flag OFF) | 200 | (summary body per FR-130) |

  Non-admin attempts MUST be rejected at the endpoint boundary BEFORE any state mutation. (Remediates checklist CHK033, CHK035, CHK102.)

- **FR-125 (423 metadata-stub body shape)**: When a quarantined artifact is read without `?include_quarantined=1` (or by a non-admin), the 423 body MUST be `{ error: 'artifact_locked', artifact_id, redaction_status: 'quarantined', quarantined_at, byte_size, sha256, mime }`. The body MUST NOT include `content`, `content_json`, `content_markdown`, `storage_uri`, `preview_text`, or any actor identity. (Remediates checklist CHK036.)

- **FR-126 (`?include_quarantined=1` parameter handling)**: A truthy value (`1`, `true`) MUST grant override read only when combined with admin auth and MUST write the unthrottled `artifact_quarantined_read_overridden` activity (FR-065). A non-admin caller passing `?include_quarantined=1` MUST receive `423 artifact_locked` (the parameter alone is not a privilege boundary — the admin role is). A malformed value MUST be treated as `false`. (Remediates checklist CHK037.)

- **FR-127 (Atomic-write per-step failure recovery)**: Each step of the FR-022 atomic write protocol has the following defined recovery:
  1. **Step 1 (temp write fails)** — `ENOSPC` → 507 `insufficient_storage`; other → 500 `internal_storage_error`. Best-effort `fs.unlink` of partial `.tmp.*`. No DB row INSERT.
  2. **Step 2 (temp fsync fails)** — Same as step 1.
  3. **Step 3 (`fs.link` non-EEXIST: `ENOENT` parent missing, `ENOSPC`, `EROFS`, etc.)** — Clean up temp (best-effort), return `500 internal_storage_error`, write activity `type='artifact_publish_failed'` with `{phase: 'link', errno, sha256}`. No DB row INSERT.
  4. **Step 3 EEXIST** — Per FR-023.
  5. **Step 4 (`fs.unlink(tmpPath)` fails after successful link)** — Publish PROCEEDS (canonical file is in place). Orphan temp inode logged via `type='artifact_publish_failed'` with `phase='unlink_temp', outcome='proceed'`; reclaimed by the FR-129 sweep.
  6. **Step 5 (parent-dir fsync fails)** — Publish ABORTS. Best-effort `fs.unlink` of canonical. Return `500 internal_storage_error`, write `type='artifact_publish_failed'` with `phase='parent_fsync'`.
  7. **Step 6 (DB INSERT fails)** — Canonical file remains as healthy orphan; FR-129 reclaims. Return `500 internal_storage_error`, write activity with `phase='db_insert'`. The supersede UPDATE rolls back atomically with the new INSERT.

  HTTP 507 is permitted only for the storage-exhaustion case; non-EEXIST `fs.link` errors do NOT add new HTTP codes. An invariant test MUST inject failure at each of the six steps and assert: (a) canonical path either does NOT exist OR contains the fully-written and fsync'd content (no partial bytes ever); (b) at most one DB row exists for any (task_id, sha256, attempted_storage_kind) triple. (Remediates checklist CHK046, CHK047, CHK048, CHK049, CHK071, CHK072, CHK073.)

- **FR-128 (Inline-content failure path)**: For inline publishes (`storage_kind ∈ {inline_json, inline_markdown}`) the only failure point after secret-scan is the DB INSERT itself. On INSERT failure return `500 internal_storage_error`, write `type='artifact_publish_failed'` with `phase='db_insert_inline'`, and do NOT update the p95 ring buffer (FR-028 covers successful publishes only). The inline column-split invariant MUST be enforced by the publish helper before INSERT; a violation is an internal assertion failure (logged + 500, no DB write attempted). (Remediates checklist CHK079, CHK081, CHK101.)

- **FR-129 (Orphan-repair invariants and edge cases)**:
  1. **Three orphan classes**: (a) DB row whose `storage_kind='file'` but file is missing — set `redaction_status='rejected'`, `security_scan_status='file_missing'`, preserve row, write activity (FR-068); (b) FS file under `<DATA_DIR>/artifacts/<workspace_id>/<yyyy>/<mm>/<sha256>.<ext>` with no DB row — move to `<DATA_DIR>/artifacts/_orphaned/<run_id>/<original-relative-path>` where `<run_id>` is `unixepoch()` of sweep start; (c) `.tmp.*` siblings older than `feature_flags.artifact_tmp_orphan_age_seconds` (DEFAULT 86400, minimum 300, null = default) — `fs.unlink` and write activity.
  2. **Idempotency**: Repair MUST be safe to re-run. Class (a) MUST NOT write a duplicate `artifact_repaired_orphan` activity if status fields already match the rejected/file_missing terminal state. Class (b)/(c) MUST short-circuit if the file/temp no longer exists at scan time.
  3. **`_orphaned` collision**: If the move target path already exists, the system MUST suffix the basename with `.<unixepoch_micros>.collision` BEFORE the move and proceed; the `<run_id>` directory itself is unique-per-run.
  4. **Workspace-isolation violation** (file at workspace_A's tree but row references workspace_B): TREAT AS A CLASS (b) ORPHAN — file moved to `_orphaned/`, AND a `type='artifact_workspace_isolation_violation'` activity is written with `{found_workspace, row_workspace, sha256, original_path, new_path}`. The row remains and is treated as Class (a) on the same sweep. Defense-in-depth — should be unreachable under FR-026 enforcement. **Phase 4 consensus 2/3 (CHK058):** Option A (move-and-flag + continue sweep) wins — codebase precedent in `src/lib/github-sync-engine.ts:862-927` `backfillAreaRouting` (per-item transactions, catch-log-continue, never abort the sweep) and current FR-129 wording match. Domain-researcher's NIST IR-4 "halt sweep + incident-quarantine-tree" alternative was lower-confidence and would require new FS infrastructure with no project precedent.
  5. **Activity payload shape**: `type='artifact_repaired_orphan'` body is `{direction: 'db_row_without_file' | 'fs_file_without_row' | 'tmp_sibling_aged_out', artifact_id?, original_path?, new_path?, sha256?, age_seconds?}`. Direction-specific fields are required only for their direction.
  6. **DB row with file present but corrupted (sha256 mismatch on read)**: This is NOT an orphan — it is an FR-067 hash-mismatch event (set `security_scan_status='hash_mismatch'`, write `type='artifact_hash_verified'`, do NOT auto-quarantine, do NOT move file). Orphan repair does NOT recompute sha256 unless admin explicitly requests it. (Remediates checklist CHK053, CHK054, CHK055, CHK056, CHK059.)

- **FR-130 (Retention-sweep failure isolation and counts)**:
  1. **Per-row transactionality**: Each row's archive or delete MUST run in its own `db.transaction(() => {...})()`. A failure on row N (FS error, DB error, permission denied, archive write failure) MUST be caught, logged via `console.error`, counted; sweep CONTINUES to row N+1.
  2. **Summary activity row shape**: The single end-of-sweep `type='artifact_retention_swept'` row carries `{workspace_id, started_at, finished_at, archived_count, deleted_count, skipped_count, failed_count, policy: { keep_days, archive_after_days, delete_after_days }, sample_failure_reason?: string}` where `sample_failure_reason` is set only when `failed_count > 0` (≤ 256 chars, sanitized).
  3. **Policy precedence**: When both `archive_after_days` and `delete_after_days` apply (row age ≥ both thresholds), `delete_after_days` WINS — row is deleted directly, never archived first. **Phase 4 consensus 1/1 (CHK064):** Option A (delete wins) confirmed by spec-context-analyst high confidence — Constitution Principle XI (Keep It Simple) + the no-cron / no-resume design (FR-130.6) make archive-then-later-delete unreliable; archive-then-delete-on-next-sweep introduces a two-sweep dependency with no consumer.
  4. **Quarantined and superseded rows**: `redaction_status='quarantined'` rows are SKIPPED (counted in `skipped_count`); operator must un-quarantine first. `redaction_status='superseded'` rows are NOT auto-deleted by supersede; they age into delete via the policy.
  5. **Concurrent-sweep guard**: Process-local advisory lock (`Map<workspace_id, boolean>`); second concurrent invocation returns `409 sweep_in_progress` with `{ workspace_id, started_at }`.
  6. **Mid-run kill**: Killed sweep does NOT leave a partial summary activity row (written ONLY at completion). On restart there is no resume — the operator re-runs and the sweep continues from a fresh query. Per-row idempotency MUST be safe.
  7. **No automatic sweep**: The sweep MUST NOT be invoked from any background job, cron, scheduler, startup hook, or test "warm-up" path. The only invocation surface is the admin-panel button. (Remediates checklist CHK060, CHK061, CHK062, CHK063, CHK064, CHK066, CHK067, CHK068, CHK069, CHK070.)

- **FR-131 (Supersede-target validation)**:
  1. **Missing target**: `supersedes=<id>` not found → `404 artifact_not_found` with `{ error: 'artifact_not_found', supersedes_id }`. No file write.
  2. **Cross-task target**: target's `task_id ≠` publishing `task_id` → `400 bad_request` with `{ error: 'supersedes_cross_task', supersedes_id, supersedes_task_id, publishing_task_id }`. Supersede chain is task-scoped.
  3. **Cross-workspace target**: target's `workspace_id ≠` publishing `workspace_id` AND caller is non-Facility → `404 artifact_not_found` with `{ error: 'artifact_not_found', supersedes_id }` (NOT 403). This hides cross-workspace existence and matches the established codebase invisibility pattern: the tasks API uses `WHERE id = ? AND workspace_id = ?` and returns 404 for IDs that exist in other workspaces (`src/app/api/tasks/[id]/route.ts:117-123`). Per Phase 4 error-handling consensus 3/3 high confidence (CHK086): OWASP IDOR Prevention Cheat Sheet + RFC 9110 §15.5 + GitHub / AWS / Stripe multi-tenant precedent all converge on 404 to prevent ID-enumeration disclosure. Facility-scoped callers retain `403 workspace_mismatch` since cross-workspace visibility is part of their authorized scope.
  4. **Quarantined target**: existing edge case → `409 cannot_supersede_quarantined`. (Remediates checklist CHK085, CHK086.)

- **FR-132 (Detector failure mode — fail-closed)**: When `detectSecrets(content, mime)` THROWS (regex engine failure, OOM, library exception), the publish MUST FAIL CLOSED: return `500 internal_scan_error` with `{ error: 'internal_scan_error' }`, write `type='security_violation_scan_error'` (NOT `'security_violation'` — separate type to avoid polluting the normal-finding signal) with `{task_id, mime, byte_size, error_message: <sanitized>}`, no p95 update, no file-write phase. **Confirmed by Phase 4 consensus 3/3 high confidence (CHK092):** OWASP 2025 A10 (Mishandling of Exceptional Conditions), `output-schema-validator.ts` codebase precedent (`{ ok: false }` on validator throw), and Constitution Principle XIII all mandate fail-closed.
  - `security_scan_status='scan_error'` (FR-029) is reserved for orphan-repair scenarios that discover a row whose history includes a `security_violation_scan_error` activity AND no successful re-scan; otherwise no row is ever INSERTed with this status.
  - Detector findings (normal path) MUST log only the rule id, never the matched substring. Activity payload schema enforces this by carrying only `{rule_id, line_number?, char_offset?}` per finding. (Remediates checklist CHK092, CHK093, CHK094, CHK103.)

- **FR-133 (Activity payload size bounding)**: Every `activities.data` JSON write performed by SPEC-007 code MUST be bounded ≤ 16 KiB serialized. Bounding helper truncates string fields to ≤ 1 KiB each (with `…[truncated]` suffix), drops `findings[]` entries beyond index 32, and replaces oversized embedded payloads with `<elided ${original_byte_count} bytes>`. The `disposition_validation_failed` payload (FR-013), required to carry "the full agent-output payload," MUST apply this bounding — "full" means up to 16 KiB serialized, not unbounded. (Remediates checklist CHK023.)

- **FR-134 (Aegis review-window semantics)**: `evaluateSpec007AegisSignals(taskId, db, reviewWindow)` MUST interpret `reviewWindow.since` as an inclusive ISO-8601 lower bound on `activities.created_at` for `type='security_violation'` lookups AND on `task_dispositions.triaged_at` for `disposition='unknown'` lookups. The pre-existing `runAegisReviews` MUST pass its own existing per-task window's `since` value (no new semantic). When `reviewWindow.since` is null/undefined the helper MUST return null without scanning. (Remediates checklist CHK098.)

- **FR-135 (No silent-failure 200s)**: No SPEC-007 endpoint returns HTTP 200/201 for a logical failure. Every failure emits a non-2xx code per the API Error Code Matrix (the table immediately preceding the FR-090 section) or per FR-124. The hash-verify success-with-mismatch case (200 + `outcome: 'hash_mismatch'`) is NOT a logical failure — the operation succeeded; it discovered a state. Contract tests MUST assert that for every entry in the API Error Code Matrix and FR-124, the body field `error` is non-empty. (Remediates checklist CHK105.)

- **FR-136 (Existing-row read parity under flag-OFF)**: When `FEATURE_TASK_ARTIFACTS=OFF`, `GET /api/task-artifacts/[id]` MUST return 503. Read endpoint is SPEC-007-introduced; gating on the flag preserves rollback. Pre-SPEC-007 `task_artifacts` rows remain in DB visible to migrations and admin DB tooling but NOT to runtime API. Legacy `external_uri` rows (FR-112) ALSO return 503 under flag OFF (consistent rollback). Read-side renders inside the audit-trail and admin panels are also gated — empty-state when flag OFF. (Remediates checklist CHK009.)

- **FR-137 (DB-error classification — `disposition_insert_failed` vs validation)**:
  - **Validation failure** (FR-013) is triggered ONLY by missing-field or enum-violation errors detected from the agent's output JSON BEFORE any DB write.
  - **Insert failure** (FR-014) is triggered by any DB error from the `INSERT INTO task_dispositions` statement: FK violation (`SQLITE_CONSTRAINT_FOREIGNKEY`), UNIQUE violation, busy/locked (`SQLITE_BUSY`), disk full (`SQLITE_FULL`), corrupt DB (`SQLITE_CORRUPT`), or any other non-validation error class. Catch block MUST NOT inspect error class to skip the activity row — every DB error class produces exactly one throttled `disposition_insert_failed` activity.
  - Errors raised between validation and INSERT (transaction setup, prepared-statement compile errors) are also `disposition_insert_failed`. (Remediates checklist CHK016.)

- **FR-138 (Disposition insert failures observable in admin metrics)**: The admin-panel "failed publishes / failed scans / failed reads" health tile (FR-064) MUST also surface a "Failed disposition inserts (24h)" count from `activities` where `type='disposition_insert_failed'` AND `created_at >= unixepoch() - 86400`. Count, not list; refreshes on the same cadence as other admin tiles. (Remediates checklist CHK018.)

- **FR-139 (Validation-failure rows in audit panel and dashboard widget)**: Validation-failure rows (`disposition='unknown'`) MUST be visible in the audit-panel "Dispositions" tab; the `disposition` filter MUST include `'unknown'` as selectable. In the dashboard widget the `'unknown'` segment MUST be its OWN stacked-bar segment (not merged, not excluded). Legend label is "validation_failed" (display); underlying value remains `'unknown'`. (Remediates checklist CHK024, CHK025.)

- **FR-140 (Sub-422 error precedence)**: When detector findings ≥ 1 AND redacted artifact would be empty, return FIRST `422 redaction_would_empty_artifact` (per FR-122 ordering). `secret_detected` body MUST NOT be returned in this case; `redacted_preview` field is omitted entirely. The `security_violation` activity row IS still written for the underlying detector findings. (Remediates checklist CHK089.)

- **FR-141 (Detector security-violation activity payload)**: `type='security_violation'` payload is `{task_id, mime, byte_size, findings: Array<{rule_id: string, line_number?: number, char_offset?: number}>}`. MUST NOT include matched substring, redacted_preview, or raw content. Throttle predicate (FR-032) shares column shape with FR-014 — parameterized only by `type` and `entity_id`. (Remediates checklist CHK091, CHK094, CHK103.)

### Detector v2 Deferrals (NOT in v1)

Per Clarify Session 1 consensus (Q3), the v1 detector ruleset (FR-031) is closed. The following rule families are explicitly deferred to a future v2 spec — naming them here gives v2 a concrete target and makes the v1 floor auditable:

- Azure AD client secret (`(?i)azure[_-]?(?:ad|ar)[_-]?secret`)
- Atlassian API tokens
- SendGrid API keys (`SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}`)
- Twilio account SID + auth token (compound)
- Mailgun API keys (`key-[A-Za-z0-9]{32}`)
- Datadog API + APP keys
- PyPI tokens (`pypi-AgEIcHlwaS5vcmcC[A-Za-z0-9_\-]{50,}`)
- Heroku API keys
- Docker registry credentials
- Linear / Notion / Asana API tokens
- Discord / Telegram bot tokens

The v2 spec MUST author per-rule positive + negative fixtures and a wild-corpus update before promoting any of these into v1.

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
- **Activity types added by this spec** (`activities.type` column): `disposition_validation_failed`, `disposition_insert_failed`, `security_violation`, `artifact_quarantined`, `artifact_unquarantined`, `artifact_deleted`, `artifact_archived`, `artifact_hash_verified`, `artifact_hash_verification_failed`, `artifact_repaired_orphan`, `artifact_previews_rebuilt`, `artifact_retention_swept`, `artifact_skipped_quarantined_in_dispatch`, `artifact_quarantined_read_overridden`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With both flags OFF, across 100 sampled SPEC-004 chains, every successor's `metadata` JSON MUST contain no `input_artifacts` key (`'input_artifacts' in JSON.parse(successor.metadata) === false`), the structural shape MUST match `src/lib/__tests__/__fixtures__/spec-004-dispatch-metadata-baseline.json`, AND EXPLAIN QUERY PLAN snapshots MUST show zero new query-plan rows vs `src/lib/__tests__/__fixtures__/explain-query-plan-pre-m62.json`.
- **SC-002**: With `FEATURE_DISPOSITION_LOGGING=ON`, 100% of triage-template completions in a 1,000-task burst test produce exactly one `task_dispositions` row within 2 seconds of the task transition commit; INSERT failure rate logged as `activities` rows is < 0.1% under simulated DB stall.
- **SC-003**: Operators using the audit panel can locate a specific disposition row by `(workspace, disposition, agent, date range)` filter combination and have the result render in under 2 seconds for datasets up to 100,000 rows.
- **SC-004**: With `FEATURE_TASK_ARTIFACTS=ON`, the publish API rejects 100% of in-content secret patterns at the wild-corpus scale, producing redacted previews and `security_violation` activities. Detector recall MUST be ≥ 0.95.
- **SC-005**: A successor task receives `input_artifacts` references for 100% of producer artifacts that are non-superseded and non-quarantined; quarantined artifacts are silently skipped in 100% of dispatches.
- **SC-006**: Atomic file writes show zero partial canonical files across a 500-publish crash-injection test (process kill mid-write); orphan repair correctly identifies all `.tmp.*` siblings.
- **SC-007**: The dashboard widget reflects a newly inserted disposition row within one client poll cycle (≤ 30 seconds) of the insert; cache hit rate on read is ≥ 80% under 10 concurrent dashboards.
- **SC-008**: Admin destructive actions (quarantine, delete, archive, repair orphans, retention sweep) each produce exactly one `activities` row with full before/after status, actor, and reason; non-admins receive HTTP 403 in 100% of attempts.
- **SC-009**: P95 publish latency reported by the admin panel matches the in-process measured p95 within ±5% when the ring buffer has ≥ 100 observations; the panel displays "insufficient data" otherwise.
- **SC-010**: A strict-scope grep test passes for SPEC-007: exactly the 6 files declared in FR-100 (`src/lib/secret-detector.ts`, `src/lib/secret-detector.rules.ts`, `src/lib/__tests__/secret-detector.test.ts`, `src/lib/aegis-review.ts`, `src/lib/task-artifacts.ts`, `src/lib/__tests__/task-artifacts.enums.test.ts`) — and no others added by SPEC-007 — appear in `tsconfig.spec-strict.json`'s `include` list and in `eslint.config.mjs`'s `specStrictFiles` array.

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
- Migrations are referenced as `M054` / `M057` / `M058` in spec.md, plan.md, tasks.md, and code (matching `migrations.ts` IDs `054_workflow_templates_task_chain_routing_and_artifact_policy`, `057_task_dispositions`, `058_task_artifacts`). Existing rollback files in `docs/migrations/` retain their original two-digit names (`rollback-M54.sql`, `rollback-M57.sql`, `rollback-M58.sql`) per SPEC-001 convention. SPEC-007 creates no new migrations and renames no files. (Clarify Session 1 / Q5.)
