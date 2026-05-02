---
description: "Task list for SPEC-007 Disposition Logging and Task Artifact Store"
---

# Tasks: SPEC-007 Disposition Logging and Task Artifact Store

**Input**: Design documents from `/specs/007-disposition-artifacts/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. Each user story phase carries explicit `[T-RED]` test tasks
that MUST be authored AND asserted to FAIL before any implementation task in
that phase begins. UI surfaces (Dispositions tab, Dashboard widget, Artifact
admin panel) ship Playwright e2e against the Docker production build with
deterministic seed data, Argos metadata-tagged uploads, and a defect-remediation
review gate before any PR update.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing. The workflow prompt's `[US1]..[US11]` labels are
authoritative for this spec; the spec.md's `US1..US9` user stories map onto
these as documented in the **US Mapping** table below.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[T-RED]**: Test task that MUST be authored to FAIL before its sibling implementation task runs
- **[Story]**: `[US1]..[US11]` mapping (Setup/Foundational/Polish: no story label)
- File paths are absolute relative to the repo root unless noted.

## US Mapping (Workflow → Spec)

| Workflow US | Spec US | Theme |
|---|---|---|
| US1 | spec US1 | Flag-OFF parity (FEATURE_DISPOSITION_LOGGING + FEATURE_TASK_ARTIFACTS both OFF) |
| US2 | spec US2 | Disposition Insert After Triage Completion (flag ON) |
| US3 | spec US6 | Audit Panel "Dispositions" Tab |
| US4 | spec US8 | Dashboard Widget "Last 7d triage totals" |
| US5 | spec US9 | Generic `GET /api/dispositions` API |
| US6 | spec US3 | Artifact Publish (inline + file) |
| US7 | spec US4 (detector half) | Secret Detector v1 (17 families, recall ≥ 0.95, safe-regex) |
| US8 | spec US4 (enforcement half) | Secret-Handling Enforcement at Publish |
| US9 | spec US5 | Successor Dispatch Payload + Artifact Read API |
| US10 | spec US7 | Artifact Admin Panel |
| US11 | (cross-cutting) | Aegis Hook (`src/lib/aegis-review.ts`) |

## Path Conventions

- **Strict-scope (6 files, FR-100):** `src/lib/secret-detector.ts`,
  `src/lib/secret-detector.rules.ts`, `src/lib/__tests__/secret-detector.test.ts`,
  `src/lib/aegis-review.ts`, `src/lib/task-artifacts.ts`,
  `src/lib/__tests__/task-artifacts.enums.test.ts`
- **SPEC-007-touched outside strict scope:** `src/lib/task-dispatch.ts`,
  `src/components/panels/audit-trail-panel.tsx`,
  `src/components/panels/artifact-admin-panel.tsx`,
  `src/components/dashboard/dashboard.tsx`,
  `src/app/api/dispositions/route.ts`,
  `src/app/api/task-artifacts/route.ts`,
  `src/app/api/task-artifacts/[id]/route.ts`,
  `tsconfig.spec-strict.json`, `eslint.config.mjs`,
  test/fixture additions under `src/lib/__tests__/__fixtures__/...`
- **e2e:** `tests/e2e/disposition-audit-tab.spec.ts`,
  `tests/e2e/disposition-dashboard-widget.spec.ts`,
  `tests/e2e/artifact-admin-panel.spec.ts`
- **Seed:** `scripts/seed-spec-007.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify SPEC-007 preconditions; no migrations to author.

- [ ] T001 Verify M054, M057, M058 are present in `src/lib/migrations.ts` and the live schema (`pnpm tsx -e "..."` snapshot) — abort autopilot if absent. Reference: data-model.md "Schema citations summary"; FR-029 dependency on `task_artifacts.content_json`/`content_markdown` split. (No file written; assertion-only step.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Strict-scope plumbing, status enums + snapshot, ring-buffer skeleton, safe-regex CI infra, cursor helpers. **No user-story work begins until this phase is complete.**

### Foundational tests ([T-RED] first)

- [ ] T010 [T-RED] [P] Author `src/lib/__tests__/task-artifacts.enums.test.ts` asserting (i) `REDACTION_STATUSES` exact ordered tuple, (ii) `SECURITY_SCAN_STATUSES` exact ordered tuple, (iii) `EXPLAIN` of live `task_artifacts` schema confirming NO CHECK on `redaction_status` or `security_scan_status` AND the `content_json`/`content_markdown` column split persists AND the `storage_kind` CHECK is preserved. Test MUST FAIL because the constants and helpers do not yet exist. (FR-029, SC-010, data-model Decision 12.)
- [ ] T011 [T-RED] [P] Author strict-scope grep test at `src/lib/__tests__/strict-scope.test.ts` (or equivalent) that fails when any file outside the declared 6 strict-scope files PLUS the explicit SPEC-007-touched allowlist (`task-dispatch.ts`, `audit-trail-panel.tsx`, `artifact-admin-panel.tsx`, `dashboard.tsx`, `dispositions/route.ts`, `task-artifacts/route.ts`, `task-artifacts/[id]/route.ts`, `tsconfig.spec-strict.json`, `eslint.config.mjs`, declared test/fixture/seed/e2e paths) appears in `git diff main...HEAD`. Test MUST FAIL initially because the touched-file list is not yet realized. (FR-100, SC-010.)
- [ ] T012 [T-RED] [P] Author safe-regex CI smoke test at `src/lib/__tests__/secret-detector.test.ts` skeleton: import from a not-yet-existing `./secret-detector.rules` and assert each rule object passes `safeRegex(rule.regex.source)`. Test MUST FAIL with module-not-found. (FR-035.)
- [ ] T013 [T-RED] [P] Author cursor encode/decode unit test (placed at `src/lib/__tests__/cursor.test.ts` or co-located with the dispositions route module) that asserts (i) round-trip `{triaged_at, id}` object, (ii) malformed base64url → throws `invalid_cursor` HttpError, (iii) JSON missing required fields → throws. Test MUST FAIL because helpers do not yet exist. (FR-051, FR-080, data-model Entity 7.)
- [ ] T014 [T-RED] [P] Author ring-buffer skeleton test (at `src/lib/__tests__/task-artifacts.ring-buffer.test.ts` or inside `task-artifacts.test.ts`) asserting (i) `recordPublishLatency` appends and FIFO-drops at length 1024, (ii) `getP95Latencies` returns `'insufficient_data'` until ≥100 observations, (iii) p95 computed via `arr[Math.floor(arr.length*0.95)-1]` after sort. Test MUST FAIL until skeleton exists. (FR-028, FR-064, SC-009, data-model Entity 6.)

### Foundational implementation (turns T010..T014 green)

- [ ] T015 Create `src/lib/secret-detector.rules.ts` with TypeScript `Rule[]` type stub (empty array placeholder; rules added in US7). Adds module so T012 can import without throwing module-not-found.
- [ ] T016 Create `src/lib/secret-detector.ts` skeleton exporting `detectSecrets(content, mime)` returning `{findings: [], redacted: content}` (no rule logic yet — fleshed out in US7). (FR-030.)
- [ ] T017 Create `src/lib/aegis-review.ts` skeleton exporting `AEGIS_FAILURE_REASONS` constant and `evaluateSpec007AegisSignals` stub returning `null` (logic in US11). (FR-090.)
- [ ] T018 Create `src/lib/task-artifacts.ts` skeleton: export `REDACTION_STATUSES` and `SECURITY_SCAN_STATUSES` frozen const tuples per FR-029; export `recordPublishLatency`, `recordReadLatency`, `getP95Latencies` ring-buffer functions; export `publishArtifact` / `getArtifact` stubs throwing `not_implemented`. Includes `getInlineContent(row)` helper signature (FR-020). Turns T010 + T014 green.
- [ ] T019 Add the 6 strict-scope files to `tsconfig.spec-strict.json` `include` AND to the `specStrictFiles` array in `eslint.config.mjs`. Turns T011 partially green (the include lists now contain exactly the 6 declared files; full grep gate passes once all SPEC-007 file edits land in the diff). (FR-100.)
- [ ] T020 Implement opaque base64url cursor `encodeCursor`/`decodeCursor` helpers (location: top of `src/app/api/dispositions/route.ts` OR shared `src/lib/cursor.ts`; default location `route.ts`-local since FR-113 forbids leakage). Turns T013 green. (FR-051, FR-080.)
- [ ] T021 Persist baseline fixture skeletons at `src/lib/__tests__/__fixtures__/spec-004-dispatch-metadata-baseline.json` (capture current SPEC-004 successor `metadata` JSON shape — keys + types only) and confirm `src/lib/__tests__/__fixtures__/explain-query-plan-pre-m62.json` is reused as-is. Both files must exist before US1 parity tests can run hard (FR-110 mandates `fs.existsSync` precondition). (FR-110, FR-043.)

**Checkpoint**: Foundation ready — strict scope plumbed, enums frozen, ring-buffer math available, cursor helpers ready, baseline fixtures present. User story implementation can now begin in priority order (P1 first — US1, US2, US6, US7, US8, US9). P2 stories (US3, US4, US10) and P3 (US5) follow.

---

## Phase 3: User Story 1 — Flag-OFF Parity (Priority: P1) 🎯 MVP

**Goal**: With both flags resolving OFF, behavior is byte-compatible with SPEC-004: no `task_dispositions` rows, no `metadata.input_artifacts` key, `POST /api/task-artifacts` returns 503, `GET /api/task-artifacts/[id]` returns 503, audit panel and dashboard render empty state without errors.

**Independent Test**: Drive a triage-template task to completion via `advanceTaskChain` with both flags OFF; assert (a) zero rows in `task_dispositions`, (b) `'input_artifacts' in JSON.parse(successor.metadata) === false`, (c) `POST /api/task-artifacts` → 503, (d) structural baseline match against the fixture, (e) EXPLAIN QUERY PLAN unchanged. (P6-AC1, P6-AC7 flag-OFF half.)

### Tests for US1 ([T-RED] first)

- [ ] T100 [T-RED] [US1] Author `src/lib/__tests__/advance-task-chain-disposition.test.ts` flag-OFF case: assert NO `task_dispositions` row inserted and NO `disposition_*` activity row written when `FEATURE_DISPOSITION_LOGGING=OFF`. Test MUST FAIL because `runPostCommitDispositionInsert` is not yet wired. (FR-001, P6-AC1.)
- [ ] T101 [T-RED] [P] [US1] Author `src/lib/__tests__/advance-task-chain-input-artifacts.test.ts` flag-OFF case: assert `'input_artifacts' in JSON.parse(successor.metadata) === false` AND deep-shape diff against `spec-004-dispatch-metadata-baseline.json` (with FR-110 hard `fs.existsSync(BASELINE_PATH)` precondition). Test MUST FAIL until flag-OFF code path is asserted. (FR-002, FR-043, FR-110, P6-AC7.)
- [ ] T102 [T-RED] [P] [US1] Add EXPLAIN QUERY PLAN snapshot test to T101 (or sibling test) reusing `src/lib/__tests__/__fixtures__/explain-query-plan-pre-m62.json` with the FR-110 hard `fs.existsSync` precondition; assert zero new query-plan rows vs the baseline under flag OFF. (FR-110, SC-001.)
- [ ] T103 [T-RED] [P] [US1] Author API contract test at `src/app/api/task-artifacts/__tests__/route.test.ts` asserting `POST /api/task-artifacts` with both flags OFF returns HTTP 503 `{error: 'artifact_store_disabled'}` and writes no DB row. (FR-002, API Error Code Matrix row 1.)
- [ ] T104 [T-RED] [P] [US1] Add contract test that `GET /api/task-artifacts/[id]` with flag OFF returns HTTP 503 (FR-136). Same file as T103.

### Implementation for US1 (turns T100..T104 green)

- [ ] T105 [US1] Implement `runPostCommitDispositionInsert(db, parent, output, workspaceId)` short-circuit path in `src/lib/task-dispatch.ts` (BEFORE its other logic): call `resolveFlag('FEATURE_DISPOSITION_LOGGING', { workspaceId })` once; on resolved-OFF return immediately (no INSERT, no activity). Wire as call site at line ~499 (after the existing IIFE returns, BEFORE `runPostCommitSuccessorSync` at line ~502 per Decision 9). Turns T100 green. (FR-011, FR-121.)
- [ ] T106 [US1] In the same `advanceTaskChain` post-commit path, gate the `metadata.input_artifacts` attachment on `resolveFlag('FEATURE_TASK_ARTIFACTS', { workspaceId })`: when OFF, the successor's `metadata` JSON MUST NOT contain `input_artifacts` key. Turns T101 green. (FR-040, FR-043.)
- [ ] T107 [US1] Create `src/app/api/task-artifacts/route.ts` POST handler returning 503 `{error: 'artifact_store_disabled'}` when `resolveFlag('FEATURE_TASK_ARTIFACTS', ctx)` is OFF (precedence rank 1 per FR-122). Turns T103 green. (FR-002, FR-122 row 1.)
- [ ] T108 [US1] Create `src/app/api/task-artifacts/[id]/route.ts` GET handler returning 503 when flag OFF. Turns T104 green. (FR-136.)
- [ ] T109 [US1] Implement throttled-activity helper module-internal to `task-dispatch.ts` using SPEC-006 `label_provisioning_failed` precedent: SQL `WHERE type=? AND entity_type='task' AND entity_id=? AND created_at >= unixepoch() - 60`. Activity-write failure logs to stderr; never rethrows. (FR-014, FR-032, FR-120, Decision 4.)

**Checkpoint**: US1 fully testable independently. Flag-OFF parity demonstrably preserves SPEC-004 byte-for-byte.

---

## Phase 4: User Story 2 — Disposition Insert After Triage Completion (Priority: P1)

**Goal**: With `FEATURE_DISPOSITION_LOGGING=ON`, every triage-template completion writes exactly one `task_dispositions` row. Validation failures write `'unknown'` + sanitized activity payload + Aegis FAIL signal. INSERT failures throttled, never block task transition.

**Independent Test**: Complete a triage-template task whose agent output includes `{disposition: 'closed', reason: '...'}` with the flag ON; assert exactly one row inserted with correct fields, `triaged_at` within ±2s of commit, task transition succeeds regardless of validation path. Drive validation failure (missing field, enum violation) and INSERT failure (forced DB error); assert the FR-013 sanitized payload and FR-014 throttle. (P6-AC2, P6-AC3.)

### Tests for US2 ([T-RED] first)

- [ ] T200 [T-RED] [US2] Add to `advance-task-chain-disposition.test.ts` flag-ON happy-path case: assert exactly one row inserted with correct `disposition`, `reason`, `triaged_by_agent_id`, `triaged_at` (±2s), `workspace_id`. Test MUST FAIL until US2 implementation lands. (FR-011, P6-AC2.)
- [ ] T201 [T-RED] [P] [US2] Add validation-failure test cases: (a) missing `disposition` field, (b) enum-violation value, (c) agent supplies the reserved `'unknown'` value (FR-015) — all three cases assert `disposition='unknown'` row inserted, one `activities` row with `type='disposition_validation_failed'` whose payload matches the FR-013 shape EXACTLY (`{rule, violation, field, content_sha256, byte_size, redacted_excerpt, truncated}`), and the producer's Aegis quality_review FAILs with `reason='disposition_validation_failed'`. (FR-013, FR-015, FR-090.)
- [ ] T202 [T-RED] [P] [US2] Author FR-013 sanitization-pipeline unit test asserting (i) sha256 + byte_size computed correctly, (ii) excerpt ≤ 4 KiB UTF-8, (iii) `<REDACTED:{rule_id}>` token substitution (NEVER raw matched substring per Constitution Principle XIII), (iv) `truncated: true` set when `byte_size > 16 KiB`, (v) total payload ≤ 16 KiB serialized per FR-133. (FR-013, FR-133.)
- [ ] T203 [T-RED] [P] [US2] Add INSERT-failure case (force DB error e.g. via temporary FK violation): assert `disposition_insert_failed` activity row written exactly once within 60s (throttled per FR-014), task transition still commits, no exception propagates. (FR-014, FR-137, P6-AC3.)
- [ ] T204 [T-RED] [P] [US2] Add non-triage-template case (output_schema lacks required `disposition` field per FR-010): assert no row inserted and no validation activity written. (FR-010.)
- [ ] T205 [T-RED] [P] [US2] Add output-schema validation test asserting the validator uses SPEC-004's `output-schema-validator.ts` (constrained AJV profile per Decision 9 / Principle IX). (FR-010.)

### Implementation for US2 (turns T200..T205 green)

- [ ] T206 [US2] Implement triage-template detection in `runPostCommitDispositionInsert`: inspect `workflow_templates.output_schema` for required top-level `disposition` field with the closed enum `['merged','closed','rejected','rerouted','duplicate','spam','completed','abandoned']`. (FR-010.)
- [ ] T207 [US2] Implement happy-path insert in `runPostCommitDispositionInsert` using `triaged_at = unixepoch()` SQL default. Reads producer's `agent_id` and `workspace_id` from the parent task. Turns T200 green. (FR-011.)
- [ ] T208 [US2] Implement FR-013 sanitization pipeline (sha256-anchored diagnostic record) and the `disposition='unknown'` validation-failure path: write the FR-013 activity payload (sanitized + bounded ≤16 KiB per FR-133), call into `runPostCommitDispositionInsert` with `disposition='unknown'`. Turns T201, T202 green. (FR-013, FR-015, FR-133.)
- [ ] T209 [US2] Reject agent-supplied `disposition='unknown'` at validator boundary; treat as enum-violation feeding FR-013 path. Closes T201 case (c). (FR-015.)
- [ ] T210 [US2] Wrap the INSERT in a try/catch and emit throttled `disposition_insert_failed` activity (FR-014 SQL pattern); never rethrow. Turns T203 green. (FR-012, FR-014, FR-137.)
- [ ] T211 [US2] Add the dashboard rollup cache invalidation hook inside `runPostCommitDispositionInsert` (after a successful INSERT) — process-local `Map<workspace_id, day_bucket>` cache delete. Stub for US4 to consume. (FR-072.)
- [ ] T212 [US2] Skip non-triage templates (no required `disposition` field) — turns T204 green. (FR-010.)

**Checkpoint**: US2 functional. Disposition logging is sub-second observable; failure paths are isolated.

---

## Phase 5: User Story 6 — Artifact Publish (Inline + File-Backed) (Priority: P1)

**Goal**: With `FEATURE_TASK_ARTIFACTS=ON`, agents publish JSON / Markdown / file outputs through `publishArtifact`. Inline ≤ 64 KiB UTF-8 → split-column inline; > 64 KiB auto-promotes to file. Atomic write protocol (`fs.link()`, EEXIST loser, parent-dir fsync). Single-transaction supersede. Workspace-isolation enforcement. Concurrency-safe content addressing.

**Independent Test**: Per spec US3 — publish 1 KiB inline JSON, 70 KiB auto-promoted file, 24 MiB PDF, 26 MiB rejected (413), `external_uri` rejected (400), `text/x-python` rejected (415), workspace-mismatched non-Facility (403), supersede chain renders correctly, two same-content concurrent publishes write the canonical file once. (P6-AC6.)

### Tests for US6 ([T-RED] first)

- [ ] T300 [T-RED] [US6] Author `src/lib/__tests__/task-artifacts.test.ts` happy-path tests: (a) 1 KiB inline JSON → row with `storage_kind='inline_json'`, `content_json` populated, `content_markdown` NULL, `redaction_status='clean'`, `byte_size=1024`. (b) 1 KiB inline Markdown → `content_markdown` populated, `content_json` NULL. (c) 70 KiB string auto-promotes to `storage_kind='file'`, canonical sharded path under `<DATA_DIR>/artifacts/<wid>/<yyyy>/<mm>/<sha256>.json`, both inline columns NULL. Tests MUST FAIL — `publishArtifact` is a stub. (FR-020, FR-021, P6-AC6.)
- [ ] T301 [T-RED] [P] [US6] Add atomic-write test: temp under `<DATA_DIR>/artifacts/<wid>/<yyyy>/<mm>/.tmp.<sha256>.<pid>.<rand>` (NEVER `/tmp`); fsync sequence; `fs.link` promote; `fs.unlink(tmp)`; parent-dir fsync; ONLY THEN DB INSERT. (FR-022, Decision 1 + 2.)
- [ ] T302 [T-RED] [P] [US6] Add `fs.link` EEXIST-loser path test: simulate concurrent same-content publishes; assert (i) canonical file written exactly once, (ii) loser unlinks `.tmp.*` and re-reads canonical, (iii) hash match → both rows INSERTed pointing at same `storage_uri`, (iv) hash mismatch → 500 + `artifact_hash_verification_failed` activity row + `security_scan_status='hash_mismatch'`. (FR-023, P6-AC6.)
- [ ] T303 [T-RED] [P] [US6] Add FR-127 six-step failure-injection test: inject failure at each step (temp write, temp fsync, `fs.link` non-EEXIST, `fs.unlink(tmp)` post-link, parent-dir fsync, DB INSERT) and assert: (a) canonical path either does NOT exist OR is fully fsynced (no partial bytes), (b) no DB row exists for any failed publish, (c) appropriate HTTP status (`507 insufficient_storage` for ENOSPC, `500 internal_storage_error` otherwise), (d) `artifact_publish_failed` activity row with `phase` field. (FR-127.)
- [ ] T304 [T-RED] [P] [US6] Add size cap test: 26 MiB body → 413 `payload_too_large` with `limit_bytes: 26214400`. (FR-024.)
- [ ] T305 [T-RED] [P] [US6] Add MIME allowlist test: `text/x-python` → 415 `unsupported_media_type`. (FR-025.)
- [ ] T306 [T-RED] [P] [US6] Add `external_uri` rejection test: publish with `storage_kind='external_uri'` → 400 `external_uri_rejected`. (FR-020.)
- [ ] T307 [T-RED] [P] [US6] Add zero-byte rejection test: empty inline string → 400 `empty_payload`. (CHK080 / Edge case.)
- [ ] T308 [T-RED] [P] [US6] Add workspace-isolation tests: (a) non-Facility session whose `activeWorkspace ≠ producer.workspace_id` → 403 `workspace_mismatch`. (b) Facility-scoped session → publishes succeed and store under producer's `workspace_id`. (FR-026.)
- [ ] T309 [T-RED] [P] [US6] Add supersede single-transaction test: concurrent supersede of same predecessor — second-to-acquire transaction returns 409 `supersede_target_already_superseded` per CHK069/72. Add `cannot_supersede_quarantined` 409. Add quarantined-target serialization test. (FR-027, CHK069-77, FR-131.4.)
- [ ] T310 [T-RED] [P] [US6] Add FR-131 supersede-target validation tests: (a) missing → 404 `artifact_not_found`, (b) cross-task → 400 `supersedes_cross_task`, (c) cross-workspace non-Facility → 404 `artifact_not_found` (NOT 403; matches OWASP IDOR + codebase precedent). Facility caller cross-workspace → 403 `workspace_mismatch`. (FR-131.)
- [ ] T311 [T-RED] [P] [US6] Add UTC clock-source path-sharding test (CHK083): `<yyyy>/<mm>` derived from a single `Date.now()` reading at request entry; cross-month-boundary supersede leaves predecessor `storage_uri` unchanged.
- [ ] T312 [T-RED] [P] [US6] Add p95 ring-buffer integration test asserting successful `publishArtifact` appends to the publish ring; failed publishes do NOT (FR-028, FR-128). p95 budget assertion (200 ms inline / 1000 ms ≤ 5 MB file) emits `expect.soft` warning, NOT failure. (FR-028, FR-128, P6-AC9, Decision 13.)
- [ ] T313 [T-RED] [P] [US6] Add error-precedence pair tests (FR-122): (i) flag-OFF + unauthenticated → 503 (NOT 401); (ii) non-Facility + missing workspace_id → 403 `workspace_forbidden` (NOT 400); (iii) quarantined + non-admin → 423 `artifact_locked` (NOT 403). (FR-122.)
- [ ] T314 [T-RED] [P] [US6] Add API contract test for the `/api/task-artifacts` route asserting per the API Error Code Matrix all listed status/body pairs (extends T103/T104 to the flag-ON cases). Method-not-allowed (FR-123) test: PUT/DELETE → 405 `method_not_allowed`. (API Error Code Matrix, FR-123.)

### Implementation for US6 (turns T300..T314 green)

- [ ] T315 [US6] Implement core `publishArtifact({ task_id, artifact_type, storage_kind, content|file, mime, schema_version?, supersedes? })` in `src/lib/task-artifacts.ts`: pre-scan validation order per CHK034 (flag → auth → workspace auth → external_uri reject → bad input → supersede target quarantined → size → MIME → detector → atomic write). Inline-content split: `content_json` for `inline_json`, `content_markdown` for `inline_markdown`, both NULL for `file`. Auto-promote inline > 64 KiB → file. Returns the inserted row body. (FR-020, FR-021, FR-026, CHK034.)
- [ ] T316 [US6] Implement FR-022 atomic write: temp under `<DATA_DIR>/artifacts/<wid>/<yyyy>/<mm>/.tmp.<sha256>.<pid>.<rand>` (NEVER `/tmp`) → fsync → `fs.link()` (NOT `fs.rename`) → on success `fs.unlink(tmp)` → parent-dir fsync → THEN DB INSERT. UTC date sharding via single `Date.now()` capture. Lowercase-hex sha256 with defensive `.toLowerCase()` (CHK084). Turns T301, T311 green. (FR-022, Decision 1+2.)
- [ ] T317 [US6] Implement FR-023 EEXIST-loser path: re-read canonical, recompute sha256, hash-match → unlink temp + INSERT loser row pointing at same `storage_uri`; hash-mismatch → 500 + `artifact_hash_verification_failed` activity + `security_scan_status='hash_mismatch'`. Turns T302 green. (FR-023.)
- [ ] T318 [US6] Implement FR-127 six-step error recovery for atomic write: ENOSPC → 507 `insufficient_storage`; non-EEXIST `fs.link` errors → 500 `internal_storage_error`; canonical leaked-on-tx-failure → orphan reclaimed by FR-129 sweep; `artifact_publish_failed` activity with `phase` field. Turns T303 green. (FR-127.)
- [ ] T319 [US6] Implement single-transaction supersede (FR-027): inside `db.transaction(() => { INSERT new row ; UPDATE prev row.redaction_status='superseded' })()`. File write completes BEFORE the transaction. Detect concurrent-supersede loser (CHK069/72): re-read predecessor inside the tx and abort with 409 `supersede_target_already_superseded` if already `'superseded'`. Re-check `'quarantined'` inside tx (CHK071) and abort with 409 `cannot_supersede_quarantined`. Turns T309 green. (FR-027.)
- [ ] T320 [US6] Implement FR-131 supersede-target validation (missing/cross-task/cross-workspace) with 404 cross-workspace masking for non-Facility (matches `tasks/[id]/route.ts:117-123` codebase precedent). Turns T310 green. (FR-131.)
- [ ] T321 [US6] Implement FR-024 size cap (413), FR-025 MIME allowlist (415), FR-020 `external_uri` rejection (400), CHK080 zero-byte rejection (400 `empty_payload`). Turns T304-T307 green.
- [ ] T322 [US6] Implement FR-026 workspace-isolation enforcement (Facility passthrough; non-Facility 403 `workspace_mismatch`). Turns T308 green.
- [ ] T323 [US6] Implement FR-128 inline-content failure path (no atomic-write phase; INSERT-only; on failure → 500 + `artifact_publish_failed` `phase='db_insert_inline'`; no p95 ring update). (FR-128.)
- [ ] T324 [US6] Wire FR-028 p95 ring-buffer recording at publish path completion (success only). Turns T312 green. (FR-028.)
- [ ] T325 [US6] Implement FR-122 error-precedence ordering throughout the route handler (flag → auth → workspace → bad input → not_found → conflict → locked → size → MIME → empty/secret → 500). Turns T313 green. (FR-122.)
- [ ] T326 [US6] Wire `/api/task-artifacts` route POST to `publishArtifact()` (the route is the SOLE route writer per FR-035a.1 + FR-111). Add 401/403/4xx/5xx status mapping per the API Error Code Matrix. Add 405 method-not-allowed (FR-123). Turns T314 green. (FR-035a, FR-111, FR-123.)

**Checkpoint**: US6 functional — agents can publish inline + file artifacts safely, with atomic FS semantics and workspace isolation.

---

## Phase 6: User Story 7 — Secret Detector v1 (Priority: P1)

**Goal**: 17 rule families with positive + negative fixtures each, wild corpus recall ≥ 0.95 (hard CI gate), every rule passes `safe-regex` (hard CI gate), detector fails CLOSED on internal exception.

**Independent Test**: Run per-rule fixtures (≥ 1 positive + ≥ 1 negative per rule, 17 × 2 = 34 fixtures); run wild corpus of ≥ 50 lines; assert recall ≥ 0.95 hard. Trip the detector via `safe-regex` failure on a synthetic catastrophic-backtracking pattern; assert CI fails. Inject a detector throw; assert 500 + `security_violation_scan_error` activity. (P6-AC8 detector half.)

### Tests for US7 ([T-RED] first)

- [ ] T400 [T-RED] [US7] Per-rule positive + negative fixtures at `src/lib/__tests__/__fixtures__/secrets/<rule>-positive.txt` and `<rule>-negative.txt` for ALL 17 families (FR-031): aws-access-key-id (incl. ASIA), aws-secret-access-key, github-pat-classic, github-pat-fine-grained, github-oauth-tokens, google-api-key, gcp-sa-json-compound, slack-tokens, stripe-keys, pem-private-keys, generic-env-secret, jwt, authz-bearer, anthropic-key, openai-key, vault-hvs, npm-token. Tests MUST FAIL initially (rules not yet declared). (FR-031.)
- [ ] T401 [T-RED] [P] [US7] Wild-corpus fixture at `src/lib/__tests__/__fixtures__/secrets/wild-corpus.txt` ≥ 50 lines (synthetic + manually crafted, NEVER customer data). Test asserts detector recall ≥ 0.95 — hard CI gate. (FR-035, SC-004.)
- [ ] T402 [T-RED] [P] [US7] `safe-regex` validator gate test: each rule's regex source MUST pass `safeRegex(...)`; intentionally insert a known-bad pattern in a side-channel test fixture and assert CI fails. (FR-035.)
- [ ] T403 [T-RED] [P] [US7] Redaction-substitution unit test: matched substrings replaced by `<REDACTED:{rule_id}>` token; binary content (non-text MIME) is NOT redacted (FR-034). (FR-030, FR-034, Constitution Principle XIII.)
- [ ] T404 [T-RED] [P] [US7] Detector-throw fail-closed test: stub `String.prototype.match` (or wrap one rule) to throw; assert publish returns 500 `internal_scan_error`, writes `security_violation_scan_error` activity (NOT `security_violation`) with `{task_id, mime, byte_size, error_message: <sanitized>}`, no p95 update. (FR-132.)

### Implementation for US7 (turns T400..T404 green)

- [ ] T405 [US7] Populate `src/lib/secret-detector.rules.ts` with all 17 families per FR-031: each rule `{name, regex, description}`, regex provenance gitleaks v8.18.0 + MC additions. Includes the three Phase-promoted families (Vault `hvs.*`, npm `npm_…`, GCP service-account JSON compound). Module-load assertion runs `safeRegex` over every rule (throws at module init on any bad pattern). Turns T400, T402 green. (FR-031, FR-035.)
- [ ] T406 [US7] Implement `detectSecrets(content, mime)` in `src/lib/secret-detector.ts`: iterate rules, collect findings, redact text content (non-binary MIMEs only) with `<REDACTED:{rule_id}>` substitution. Wrap rule iteration in try/catch and re-throw a single `DetectorScanError` for FR-132 fail-closed handling. Turns T403 green. (FR-030, FR-034, FR-132.)
- [ ] T407 [US7] Implement detector-throw fail-closed handler in `publishArtifact` (or its scan helper): catch `DetectorScanError`, return 500, write `type='security_violation_scan_error'` activity. Turns T404 green. (FR-132.)
- [ ] T408 [US7] Implement wild-corpus recall test runner: load fixture, count detector hits, assert `hits / lines >= 0.95`. Turns T401 green. (FR-035, SC-004.)

**Checkpoint**: US7 done. Detector has closed v1 ruleset, hard recall + safe-regex gates, fail-closed semantics.

---

## Phase 7: User Story 8 — Secret-Handling Enforcement at Publish (Priority: P1)

**Goal**: Detector findings ≥ 1 → reject by default with sanitized 422; `workflow_templates.allow_redacted_artifacts=1` + text-like MIME → store redacted with `redaction_status='redacted'`; binaries always reject; `security_violation` activity throttled; cross-workspace supersede returns 404 (already in FR-131); `redaction_would_empty_artifact` precedence over `secret_detected`.

**Independent Test**: Per spec US4 — (a) AKIA inline JSON → 422 + redacted preview + activity; (b) same content on a redact-allowed `text/markdown` template → 200 + `redaction_status='redacted'`; (c) PDF binary with embedded secret on redact-allowed template → 422; (d) burst of 100 retries → ≤ 1 `security_violation` row in 60 s + counter preserves the violations-attempted-but-throttled signal. (P6-AC8 enforcement half.)

### Tests for US8 ([T-RED] first)

- [ ] T500 [T-RED] [US8] Add to `task-artifacts.test.ts`: AKIA-bearing inline JSON publish → 422 `secret_detected` body `{error, redacted_preview ≤ 4 KiB, findings: integer}` (no rule names, no matched substrings, no offsets). Asserts `security_violation` activity row written. (FR-032, FR-141, P6-AC8.)
- [ ] T501 [T-RED] [P] [US8] Add throttle test: 100 retries within 60 s → ≤ 1 `security_violation` row for the `(task_id, type)` window; activity payload uses FR-141 shape `{task_id, mime, byte_size, findings: Array<{rule_id, line_number?, char_offset?}>}` — NEVER matched substring. (FR-032, FR-141.)
- [ ] T502 [T-RED] [P] [US8] Add redact-and-store test: template with `allow_redacted_artifacts=1` AND `text/markdown` AND content with GitHub PAT → 201 + `redaction_status='redacted'` + `security_scan_status='scanned_with_findings'` + stored body contains `<REDACTED:github-pat-classic>` not the raw token. (FR-033.)
- [ ] T503 [T-RED] [P] [US8] Add binary-always-reject test: `application/pdf` with embedded secret AND `allow_redacted_artifacts=1` → 422 (binaries always reject). (FR-034.)
- [ ] T504 [T-RED] [P] [US8] Add FR-140 sub-422 precedence test: detector findings ≥ 1 AND redacted result would be empty → return FIRST `redaction_would_empty_artifact` (NOT `secret_detected`); `security_violation` activity STILL written for the underlying findings. (FR-140.)
- [ ] T505 [T-RED] [P] [US8] Add FR-035a "no bypass" test: assert `publishArtifact` is the ONLY function that calls `db.prepare('INSERT INTO task_artifacts ...')` (combined with FR-111 grep gate). Supersede republish re-runs `detectSecrets` on the new content — cleanliness NOT inherited from predecessor. (FR-035a.1, FR-035a.3.)
- [ ] T506 [T-RED] [P] [US8] Add cross-workspace supersede test (already drafted in T310 — assert it's part of US8 enforcement coverage too). Pure regression coverage; no new test, but referenced here for traceability.

### Implementation for US8 (turns T500..T506 green)

- [ ] T507 [US8] Implement secret-detection step inside `publishArtifact` BEFORE any FS write or INSERT (FR-035a.2): call `detectSecrets(content, mime)`; on findings ≥ 1 either reject with 422 (default) OR enter redact-and-store branch when `workflow_templates.allow_redacted_artifacts=1` AND MIME is text-like. Turns T500, T502, T503 green. (FR-032, FR-033, FR-034, FR-035a.)
- [ ] T508 [US8] Implement throttled `security_violation` activity write using shared throttle helper (FR-032 SQL identical to FR-014; payload shape per FR-141). Turns T501 green. (FR-032, FR-141.)
- [ ] T509 [US8] Implement FR-140 sub-422 precedence: when redacted output is empty (zero non-whitespace bytes), return `422 redaction_would_empty_artifact` BEFORE `secret_detected`; STILL write the `security_violation` activity for forensic trail. Turns T504 green. (FR-140.)
- [ ] T510 [US8] Add supersede-republish detector re-run guard inside `publishArtifact` (cleanliness not inherited): the supersede branch unconditionally calls `detectSecrets` on the new content. Turns T505 green. (FR-035a.3.)
- [ ] T511 [US8] Implement 422 response body shape per FR-032: `{error: 'secret_detected', redacted_preview: <≤4 KiB>, findings: <integer>}` — NEVER rule names or offsets at the API surface. (FR-032.)

**Checkpoint**: US8 done. Detector enforcement is correct and bypass-proof.

---

## Phase 8: User Story 9 — Successor Dispatch + Read API (Priority: P1)

**Goal**: With flag ON, `advanceTaskChain` populates `metadata.input_artifacts` from latest non-superseded, non-quarantined `task_artifacts` rows; `GET /api/task-artifacts/[id]` returns full content with auth + workspace check; quarantine returns 423; admin override returns 200 AND writes UNTHROTTLED `artifact_quarantined_read_overridden` activity.

**Independent Test**: Per spec US5 — publish two artifacts (inline JSON + binary PDF) for producer P → drive chain → assert `metadata.input_artifacts` shape + `preview_text` rules + binary stub. Quarantine one → re-dispatch; assert it's silently skipped + `artifact_skipped_quarantined_in_dispatch` activity. Republish; assert only latest non-superseded appears. Read API: 401, 403 cross-workspace, 404 not found, 423 quarantined, 200 with full body, 200 admin-override + UNTHROTTLED activity row. (P6-AC7, FR-065.)

### Tests for US9 ([T-RED] first)

- [ ] T600 [T-RED] [US9] Add to `advance-task-chain-input-artifacts.test.ts` flag-ON case: producer P with inline_json + file PDF → assert `metadata.input_artifacts` is `[{id, type, sha256, preview_text (4 KiB UTF-8), storage_kind:'inline_json', byte_size}, {id, type, sha256, preview_text:'(binary, ${byte_size} bytes, sha256=${sha256.slice(0,12)})' , storage_kind:'file', byte_size}]`. (FR-040, FR-042, P6-AC7.)
- [ ] T601 [T-RED] [P] [US9] Add supersede test: producer P with A1 then A2 supersedes=A1 → `metadata.input_artifacts` contains only A2. (FR-040.)
- [ ] T602 [T-RED] [P] [US9] Add quarantined-skip test: quarantine A1 → re-dispatch → A1 silently skipped + `artifact_skipped_quarantined_in_dispatch` activity row written (NOT throttled — one row per skipped artifact). (FR-066.)
- [ ] T603 [T-RED] [P] [US9] Add zero-artifacts-empty-array test: producer with no artifacts under flag ON → `metadata.input_artifacts === []` (key present, empty). (FR-040 edge case.)
- [ ] T604 [T-RED] [P] [US9] Add `GET /api/task-artifacts/[id]` contract tests against the full Error Code Matrix: 503 (flag OFF), 401 (unauthenticated), 403 (cross-workspace non-Facility), 404 (id not found), 423 (quarantined no override or non-admin), 200 (success). Method-not-allowed (FR-123) for POST/PUT/DELETE → 405 `method_not_allowed`. (API Error Code Matrix, FR-123.)
- [ ] T605 [T-RED] [P] [US9] Add 423 metadata-stub body shape test (FR-125): body MUST be `{error: 'artifact_locked', artifact_id, redaction_status: 'quarantined', quarantined_at, byte_size, sha256, mime}` and MUST NOT include `content`, `content_json`, `content_markdown`, `storage_uri`, `preview_text`, or actor identity. (FR-125.)
- [ ] T606 [T-RED] [P] [US9] Add admin override test (FR-065): admin with `?include_quarantined=1` → 200 with full content body AND exactly one `artifact_quarantined_read_overridden` activity row written; non-admin with `?include_quarantined=1` → 423 (parameter alone is not a privilege boundary per FR-126); 5 successful overrides → 5 activity rows (UNTHROTTLED). Malformed `?include_quarantined=foo` treated as false. (FR-065, FR-126.)
- [ ] T607 [T-RED] [P] [US9] Add `external_uri` legacy-row read test (FR-112): metadata-only body with `storage_kind: 'external_uri'`; route MUST NOT proxy or fetch the external resource. (FR-112.)
- [ ] T608 [T-RED] [P] [US9] Add hash-mismatch read test (FR-067): `security_scan_status='hash_mismatch'` row remains accessible via GET (no auto-quarantine, no auto-delete) — body's `security_scan_status` field alerts caller. (FR-067.)
- [ ] T609 [T-RED] [P] [US9] Add p95 read-ring-buffer test: every successful `getArtifact` appends to read ring; failed reads (4xx/5xx) do NOT. (FR-028, FR-064.)
- [ ] T610 [T-RED] [P] [US9] Concurrency dispatch test (CHK074): quarantine after dispatcher snapshot but before successor runs → successor's `GET` returns 423 + skipped exactly like missing artifact + activity row. (CHK074, FR-066.)

### Implementation for US9 (turns T600..T610 green)

- [ ] T611 [US9] Implement `metadata.input_artifacts` population in `advanceTaskChain` post-commit: SELECT from `task_artifacts WHERE task_id=? AND redaction_status NOT IN ('superseded','quarantined') ORDER BY created_at ASC`. Map each row to `{id, type, sha256, preview_text, storage_kind, byte_size}`. Resolves under flag-ON guard from T106. Turns T600, T601, T603 green. (FR-040.)
- [ ] T612 [US9] Implement `preview_text` materialization rule (FR-042): first 4 KiB UTF-8 post-redaction for text-like MIMEs; binary stub `'(binary, ${byte_size} bytes, sha256=${sha256.slice(0,12)})'` for binary. Recompute on supersede. Turns T600 green. (FR-042.)
- [ ] T613 [US9] Implement quarantined-skip in dispatcher: write `artifact_skipped_quarantined_in_dispatch` activity (UNTHROTTLED — one row per skipped artifact per dispatch per FR-066). Turns T602 green. (FR-066.)
- [ ] T614 [US9] Implement `GET /api/task-artifacts/[id]` route handler in `src/app/api/task-artifacts/[id]/route.ts`: full Error Code Matrix coverage, FR-122 precedence ordering, FR-125 423 metadata stub. Turns T604, T605 green. (API Error Code Matrix, FR-122, FR-125.)
- [ ] T615 [US9] Implement FR-065/FR-126 admin override branch: `?include_quarantined=1` + admin auth → 200 + UNTHROTTLED `artifact_quarantined_read_overridden` activity write `{artifact_id, actor_session_id, actor_user_id, requested_at}`. Non-admin or no flag → 423. Malformed value → false. Turns T606 green. (FR-065, FR-126.)
- [ ] T616 [US9] Implement FR-112 `external_uri` legacy-row read behavior: metadata-only body, NO outbound fetch. Turns T607 green. (FR-112.)
- [ ] T617 [US9] Implement hash-mismatch read pass-through (FR-067): rows in `'hash_mismatch'` remain readable; field surfaces in response body. Turns T608 green. (FR-067.)
- [ ] T618 [US9] Wire FR-028 read-side ring-buffer recording on successful `getArtifact`. Turns T609 green. (FR-028.)
- [ ] T619 [US9] Concurrency CHK074 handler (read-after-quarantine): rely on SQLite WAL snapshot at dispatch + 423 from `GET` + activity row. Turns T610 green. (CHK074.)

**Checkpoint**: US9 done. Successor dispatch is safe, quarantine-aware, and the read API mirrors the codebase auth pattern.

---

## Phase 9: User Story 11 — Aegis Hook (Cross-cutting)

**Goal**: `src/lib/aegis-review.ts` is the only new strict-scope module the SPEC owns for Aegis logic. Two failure reasons (`secret_in_artifact`, `disposition_validation_failed`) feed `runAegisReviews` (in `task-dispatch.ts` — NOT extracted). Non-triage tasks: no-op proof.

**Independent Test**: Unit test `evaluateSpec007AegisSignals` with seeded `activities` (`security_violation`) and `task_dispositions` (`disposition='unknown'`); assert correct `AegisFailure | null`. Integration test `runAegisReviews` calls into helper BEFORE its other checks. Non-triage task → returns null; runAegisReviews continues unchanged. (FR-090, FR-134.)

### Tests for US11 ([T-RED] first)

- [ ] T700 [T-RED] [US11] Author `src/lib/__tests__/aegis-review.test.ts`: assert `AEGIS_FAILURE_REASONS` exact frozen tuple `['secret_in_artifact','disposition_validation_failed']`. (FR-090.)
- [ ] T701 [T-RED] [P] [US11] `evaluateSpec007AegisSignals` test: seed `activities` with `type='security_violation'` for task T within `reviewWindow.since` → returns `{reason:'secret_in_artifact', evidence:{...}}`. (FR-090.)
- [ ] T702 [T-RED] [P] [US11] Test: seed `task_dispositions` with `disposition='unknown'` for task T's most recent triage → returns `{reason:'disposition_validation_failed', evidence:{...}}`. (FR-090.)
- [ ] T703 [T-RED] [P] [US11] Test: both signals clean → returns `null`. (FR-090.)
- [ ] T704 [T-RED] [P] [US11] Test: `reviewWindow.since` null/undefined → returns `null` without scanning DB. (FR-134.)
- [ ] T705 [T-RED] [P] [US11] Integration test: `runAegisReviews` (existing in `task-dispatch.ts`) calls `evaluateSpec007AegisSignals` BEFORE its other checks; non-null AegisFailure → FAILs producer task with returned `reason`. Non-triage / clean tasks: helper returns null, behavior unchanged. (FR-090.)

### Implementation for US11 (turns T700..T705 green)

- [ ] T706 [US11] Implement `AEGIS_FAILURE_REASONS` and `evaluateSpec007AegisSignals(taskId, db, reviewWindow)` in `src/lib/aegis-review.ts`: SELECT from `activities WHERE entity_type='task' AND entity_id=? AND type='security_violation' AND created_at >= ?` and `task_dispositions WHERE task_id=? AND disposition='unknown' AND triaged_at >= ?` using `reviewWindow.since` (ISO-8601 inclusive lower bound parsed to unix epoch). Returns first matching `AegisFailure | null`. Turns T700-T704 green. (FR-090, FR-134.)
- [ ] T707 [US11] Wire `runAegisReviews` in `src/lib/task-dispatch.ts` to call `evaluateSpec007AegisSignals` BEFORE its existing checks; on non-null result, FAIL producer's `quality_review` with the returned reason; on null, continue unchanged. NO extraction of `runAegisReviews` (boundary preserved per Decision 7). Turns T705 green. (FR-090.)

**Checkpoint**: US11 done. Aegis hook is thin, isolated, and respects SPEC-003/004 boundaries.

---

## Phase 10: User Story 3 — Audit Panel "Dispositions" Tab (Priority: P2)

**Goal**: New "Dispositions" tab in `src/components/panels/audit-trail-panel.tsx` with workspace + disposition (multi-select) + date range + agent + task_id (numeric exact OR substring) filters; opaque base64url cursor pagination on `(triaged_at DESC, id DESC)`; banner "Logging began on YYYY-MM-DD"; empty-state when zero rows.

**Independent Test**: Seed 250 disposition rows across 2 workspaces, 4 agents, 6 dispositions, 30 days. Open tab; verify filter combos return correct subsets, default 50/page max 200, stable order across paging, banner shows earliest `triaged_at`, empty workspace shows empty-state. e2e via `tests/e2e/disposition-audit-tab.spec.ts`. (P6-AC4, FR-139.)

### Tests for US3 ([T-RED] first)

- [ ] T800 [T-RED] [US3] Author `tests/e2e/disposition-audit-tab.spec.ts` Playwright journey (real e2e, no `page.setContent()`): seed via `scripts/seed-spec-007.ts`, navigate to audit panel, switch to Dispositions tab, run filter combos, page through cursor pagination (default 50/page, max 200, stable order), verify banner "Logging began on YYYY-MM-DD" + empty-state. Test MUST FAIL until tab is built. (FR-050, FR-051, FR-052, P6-AC4.)
- [ ] T801 [T-RED] [P] [US3] Add Argos metadata gate test asserting screenshot uploads carry `test_identity`, `source_file`, `spec:007-disposition-artifacts` tag. (Plan §Real UI Journey Plan.)
- [ ] T802 [T-RED] [P] [US3] Add validation-failure-row visibility test (FR-139): `disposition='unknown'` rows are visible in the tab and the `disposition` filter MUST include `'unknown'` (display label "validation_failed", underlying value `'unknown'`). (FR-139.)
- [ ] T803 [T-RED] [P] [US3] Add invalid-cursor test: malformed `?cursor=...` → server returns 400 `invalid_cursor` (verifies T013 helpers integrated server-side too). (FR-051.)

### Implementation for US3 (turns T800..T803 green)

- [ ] T804 [US3] Implement Dispositions tab in `src/components/panels/audit-trail-panel.tsx`: filter UI (workspace, disposition multi-select, date range preset + custom, agent dropdown, task_id input with numeric vs. substring switch — numeric input → exact `task_id` match; non-numeric → `tasks.title LIKE %?%`), banner, empty-state. Reads via `/api/dispositions` (built in US5) — declare US5 dependency. (FR-050, FR-052.)
- [ ] T805 [US3] Implement cursor-paginated list rendering (default 50/page, max 200), stable order by `(triaged_at DESC, id DESC)`. Response shape `{rows, next_cursor, has_more}`. (FR-051, FR-113.)
- [ ] T806 [US3] Implement `disposition='unknown'` filter option labeled "validation_failed" (display only; underlying value remains `'unknown'`). Turns T802 green. (FR-139.)
- [ ] T807 [US3] Wire seed script `scripts/seed-spec-007.ts` to provide deterministic e2e state (250 rows × 2 workspaces × 4 agents × 6 dispositions × 30 days). Run via `pnpm tsx scripts/seed-spec-007.ts`.
- [ ] T808 [US3] Run Docker-backed Playwright (`docker-compose -f docker-compose.yml -f docker-compose.hardened.yml up -d` + `pnpm test:e2e tests/e2e/disposition-audit-tab.spec.ts`) — required screenshots: empty-state, filtered list, paginated 2nd page, banner visible. Argos metadata gate (T801) green. Defect-remediation review BEFORE PR. (Plan §Real UI Journey Plan.)

**Checkpoint**: US3 done. Audit panel surface ships with full Playwright journey + Argos coverage.

---

## Phase 11: User Story 4 — Dashboard Widget (Priority: P2)

**Goal**: Per-workspace card "Last 7d triage totals" in `src/components/dashboard/dashboard.tsx` with total + 7 stacked bars (segments per disposition); 30 s client poll, 15 s server cache invalidated on every disposition INSERT; `'unknown'` is its OWN stacked-bar segment.

**Independent Test**: Seed 7 days × 5 dispositions in workspace W → render → assert total + segment counts. Insert new row → assert cache invalidates and widget updates within one poll cycle. Empty workspace → empty placeholders, no errors. e2e via `tests/e2e/disposition-dashboard-widget.spec.ts`. (P6-AC5, FR-072, FR-139.)

### Tests for US4 ([T-RED] first)

- [ ] T900 [T-RED] [US4] Author `tests/e2e/disposition-dashboard-widget.spec.ts` Playwright journey: seed 7-day data, render widget for W, assert total + 7 stacked bars + segment proportions; insert new row → wait 1 poll cycle (≤ 30 s) → assert widget reflects new total; zero-disposition workspace → empty-state. Test MUST FAIL until widget exists. (FR-070, FR-071, FR-072, P6-AC5.)
- [ ] T901 [T-RED] [P] [US4] Add cache-invalidation unit test for the rollup query helper: cache hit before insert, miss after invalidation hook fires. Two clients within 5 s → second served from cache (no second DB scan). (FR-072.)
- [ ] T902 [T-RED] [P] [US4] Add `'unknown'` segment test (FR-139): widget shows `'unknown'` as its own bar segment with legend label `'validation_failed'`. (FR-139.)
- [ ] T903 [T-RED] [P] [US4] Add empty-state test: zero-disposition workspace → total reads "0", bars empty, no polling failures. (FR-070 edge case.)

### Implementation for US4 (turns T900..T903 green)

- [ ] T904 [US4] Implement rollup query in dashboard server-side route (or co-located server function): `SELECT date(triaged_at, 'unixepoch') AS day, disposition, COUNT(*) FROM task_dispositions WHERE workspace_id=? AND triaged_at >= unixepoch()-7*24*3600 GROUP BY day, disposition`. Cache key `(workspace_id, day_bucket)`, 15 s TTL, process-local `Map`. (FR-072, plan §Observability Notes.)
- [ ] T905 [US4] Wire cache invalidation hook (already created in T211): invalidate matching `(workspace_id, day_bucket)` keys after every `runPostCommitDispositionInsert` success. Turns T901 green. (FR-072.)
- [ ] T906 [US4] Implement React widget in `src/components/dashboard/dashboard.tsx`: total card + 7 stacked bars (segments by disposition with stable color mapping). 30 s `setInterval` poll. Empty-state placeholder when zero rows. `'unknown'` segment present + legend label `'validation_failed'`. Turns T900, T902, T903 green. (FR-070, FR-071, FR-139.)
- [ ] T907 [US4] Run Docker-backed Playwright (`pnpm test:e2e tests/e2e/disposition-dashboard-widget.spec.ts`) — required screenshots: populated widget, empty-state, post-poll updated state. Argos metadata gate green. Defect-remediation review BEFORE PR.

**Checkpoint**: US4 done.

---

## Phase 12: User Story 5 — Generic `GET /api/dispositions` API (Priority: P3)

**Goal**: Stable `GET /api/dispositions` with workspace_id (required for non-Facility), disposition multi-select, since/until ISO timestamps, triaged_by_agent_id, task_id; opaque base64url cursor pagination; auth pattern parity with `/api/activities`; no rate limiting in v1.

**Independent Test**: Per spec US9 — Facility caller can omit `workspace_id`; non-Facility without `workspace_id` → 400 `workspace_id_required`; unauthenticated → 401; cursor pagination stable across pages; auth matches `/api/activities`. (P6-AC4 API half.)

### Tests for US5 ([T-RED] first)

- [ ] T1000 [T-RED] [US5] Author `src/app/api/dispositions/__tests__/route.test.ts` covering Error Code Matrix rows for `GET /api/dispositions`: 503 (flag OFF), 400 `workspace_id_required` (non-Facility no workspace_id), 400 `invalid_cursor` (malformed cursor), 401 (unauthenticated), 403 `workspace_forbidden` (caller cannot read workspace). 405 method-not-allowed for POST/PUT/DELETE. (FR-080, FR-081, FR-122, FR-123.)
- [ ] T1001 [T-RED] [P] [US5] Add filter combo test: `?disposition=closed&disposition=rejected&since=2026-04-01T00:00:00Z` → only rows in `{'closed','rejected'}` with `triaged_at >= 2026-04-01T00:00:00Z`, sorted by `(triaged_at DESC, id DESC)`, with `next_cursor` if more pages. Response shape `{rows, next_cursor, has_more}` (NOT `{total, hasMore}`). (FR-080.)
- [ ] T1002 [T-RED] [P] [US5] Add Facility caller can-omit-workspace_id test. (FR-080.)
- [ ] T1003 [T-RED] [P] [US5] Add no-rate-limit test (v1): assert no rate-limit headers emitted. (FR-081.)
- [ ] T1004 [T-RED] [P] [US5] Add auth-parity test: same 401/403 behavior as `/api/activities` (e.g., missing API key → identical body shape). (FR-081.)

### Implementation for US5 (turns T1000..T1004 green)

- [ ] T1005 [US5] Implement `src/app/api/dispositions/route.ts` GET handler: flag check (503), auth (401), workspace authorization (403), filter parsing, opaque base64url cursor decode using helpers from T020, SELECT with `WHERE workspace_id=? AND (triaged_at, id) < (?, ?) ORDER BY triaged_at DESC, id DESC LIMIT ?`, response shape `{rows, next_cursor, has_more}`. FR-122 precedence ordering. (FR-080, FR-081, FR-122.)
- [ ] T1006 [US5] Add 405 method-not-allowed for non-GET (FR-123). Turns T1000 green for that row.
- [ ] T1007 [US5] Wire auth pattern from `/api/activities` (mirror exact 401/403 shapes). (FR-081.)

**Checkpoint**: US5 done.

---

## Phase 13: User Story 10 — Artifact Admin Panel (Priority: P2)

**Goal**: Full `src/components/panels/artifact-admin-panel.tsx` listing + searching artifacts; admin destructive actions (quarantine, un-quarantine, delete, archive, hash-verify single + batch, repair orphans bidirectional incl. workspace-isolation violation, rebuild previews/indexes, run retention sweep); each action writes one audit row in a single `db.transaction()`; health metrics (counts, bytes, failed publishes/scans/reads, orphan count, free space, p95 panel readout); FS step BEFORE tx for actions with side effects.

**Independent Test**: Per spec US7 — full action coverage with fixtures (clean text, redacted text, file PDF, quarantined image, orphan DB row, orphan FS file, workspace-isolation violation file). e2e via `tests/e2e/artifact-admin-panel.spec.ts`. (P6-AC9, P6-AC10.)

### Tests for US10 ([T-RED] first)

- [ ] T1100 [T-RED] [US10] Author `tests/e2e/artifact-admin-panel.spec.ts` Playwright journey covering admin loads panel → mixed-state artifact list → quarantine A → 423 on non-admin GET → admin override 200 + UNTHROTTLED `artifact_quarantined_read_overridden` activity row → un-quarantine → hash-verify with corrupted file (no auto-quarantine) → run repair-orphans (4 classes incl. workspace-isolation violation) → run retention-sweep with seeded retention policy → metrics tile shows "insufficient data" until ≥ 100 publishes, then numeric → non-admin gets 403 on every destructive endpoint. (FR-060..FR-069, FR-124, FR-129, FR-130, P6-AC9, P6-AC10.)
- [ ] T1101 [T-RED] [P] [US10] Add admin-action audit-row test: every destructive action writes `activities.type IN ('artifact_quarantined','artifact_unquarantined','artifact_deleted','artifact_archived','artifact_hash_verified','artifact_repaired_orphan','artifact_previews_rebuilt','artifact_retention_swept')` with `{artifact_id, actor_session_id, reason, before_status, after_status}` payload INSIDE a single `db.transaction(() => UPDATE + audit INSERT)()`. (FR-063.)
- [ ] T1102 [T-RED] [P] [US10] Add hash-verify mismatch test (FR-067): rehash → set `security_scan_status='hash_mismatch'`, write `artifact_hash_verified` activity, NO auto-quarantine, NO auto-delete; row remains accessible; quarantine remains explicit admin action. (FR-067.)
- [ ] T1103 [T-RED] [P] [US10] Add orphan-repair four-class test (FR-129): (a) DB row no file → `redaction_status='rejected'`, `security_scan_status='file_missing'`, row preserved; (b) FS file no row → moved to `<DATA_DIR>/artifacts/_orphaned/<run_id>/<original-relative-path>`; (c) `.tmp.*` siblings older than configurable threshold → `fs.unlink`d; (d) workspace-isolation violation (file at workspace_A's tree but row references workspace_B) → moved to `_orphaned/` + `artifact_workspace_isolation_violation` activity + row also treated as Class (a). Idempotency: re-run safe. `_orphaned/` collision → suffix `.<unixepoch_micros>.collision` then activity row `artifact_repaired_orphan_collision`. Workspace-isolation Phase 4 consensus: move-and-flag + continue sweep (Option A, codebase precedent). (FR-129.)
- [ ] T1104 [T-RED] [P] [US10] Add retention-sweep test (FR-130): per-row tx isolation (failure on row N continues to N+1, counted in `failed_count`); single end-of-sweep `artifact_retention_swept` summary activity with `{workspace_id, started_at, finished_at, archived_count, deleted_count, skipped_count, failed_count, policy: {keep_days, archive_after_days, delete_after_days}, sample_failure_reason?}`; delete wins precedence over archive (Phase 4 consensus); quarantined skipped + counted; superseded eligible for delete via policy; advisory lock — second concurrent invocation → 409 `sweep_in_progress`; mid-run kill leaves no partial summary; never auto-cron. (FR-130.)
- [ ] T1105 [T-RED] [P] [US10] Add p95 metrics-tile test (FR-064, SC-009): < 100 observations → cell shows `'insufficient data'`; ≥ 100 observations → numeric within ±5% of in-process measured p95.
- [ ] T1106 [T-RED] [P] [US10] Add admin-action HTTP error matrix test (FR-124): non-admin → 403 `forbidden_admin_required` BEFORE any state mutation; flag-OFF → 503; quarantine target not found → 404; quarantine already quarantined → 409 `already_quarantined`; un-quarantine not quarantined → 409 `not_quarantined`. (FR-124.)
- [ ] T1107 [T-RED] [P] [US10] Add disposition insert-failures health-tile test (FR-138): "Failed disposition inserts (24h)" count from `activities WHERE type='disposition_insert_failed' AND created_at >= unixepoch() - 86400`. (FR-138.)
- [ ] T1108 [T-RED] [P] [US10] Add `external_uri` admin-panel render test (FR-112): list view shows metadata + "external" badge; detail view shows "Source: external" badge + disabled download; admin actions on `external_uri` rows update only DB row's status fields (no FS work); hash-verify is no-op writing `artifact_hash_verified` with `outcome='skipped_external_uri'`; retention sweep removes only DB row. (FR-112.)
- [ ] T1109 [T-RED] [P] [US10] Add FR-035a.5 invariant test: `repairOrphans`, `runRetentionSweep`, `rebuildPreviews` MUST NOT re-run detector and MUST NOT promote `'redacted'`/`'rejected'` rows to `'clean'`. (FR-035a.5.)

### Implementation for US10 (turns T1100..T1109 green)

- [ ] T1110 [US10] Implement list/search UI in `src/components/panels/artifact-admin-panel.tsx`: filters (workspace, type, redaction_status, security_scan_status, date range), table with metadata + preview + download (non-quarantined non-binary). FR-061. (FR-060, FR-061.)
- [ ] T1111 [US10] Implement admin action endpoints (preferred location: `src/app/api/task-artifacts/admin/*` paths declared in quickstart §6, §7, §8) with admin-guard at the boundary BEFORE any state mutation (FR-124). Each action: FS step BEFORE the transaction (delete file → archive move → orphan move → retention move) — single `db.transaction(() => UPDATE + audit INSERT)()`. Turns T1101 green. (FR-062, FR-063, FR-124.)
- [ ] T1112 [US10] Implement `quarantine` / `unquarantine` actions in `task-artifacts.ts` (admin write helpers) with before/after status capture in audit payload. Add admin matrix codes per FR-124. (FR-062, FR-063, FR-065, FR-124.)
- [ ] T1113 [US10] Implement `hashVerify(artifactId)` (single + batch): re-hash file, on mismatch set `security_scan_status='hash_mismatch'`, audit row with `expected_sha256`/`actual_sha256`/`mismatch`. NO auto-quarantine, NO auto-delete. Turns T1102 green. (FR-067.)
- [ ] T1114 [US10] Implement `repairOrphans(workspaceId)` covering all 4 classes incl. workspace-isolation violation: per-row transactions, catch-log-continue (per `github-sync-engine.ts:862-927` precedent), idempotent. Activity payload shape per FR-129.5. `_orphaned/` collision suffix `.<unixepoch_micros>.collision`. Turns T1103 green. (FR-068, FR-129.)
- [ ] T1115 [US10] Implement `runRetentionSweep(workspaceId)`: read `feature_flags.artifact_retention`; per-row tx isolation; delete wins over archive when both apply; quarantined SKIPPED; superseded eligible; advisory lock `Map<workspace_id, boolean>`; second concurrent → 409 `sweep_in_progress`; one summary activity row at completion. NEVER auto-cron. Turns T1104 green. (FR-069, FR-130.)
- [ ] T1116 [US10] Implement `rebuildPreviews(...)` and the "rebuild previews/indexes" admin action; preserves `redaction_status`/`security_scan_status` (FR-035a.5). Single `artifact_previews_rebuilt` summary activity. Turns T1109 green. (FR-035a.5, FR-062.)
- [ ] T1117 [US10] Implement health metrics tile in admin panel: counts, total bytes, failed publishes/scans/reads (24h), orphan count, free space (`statfs`), p95 publish/read latency from ring buffer with `'insufficient data'` for < 100 observations. Add "Failed disposition inserts (24h)" count per FR-138. Turns T1105, T1107 green. (FR-064, FR-138.)
- [ ] T1118 [US10] Implement FR-112 `external_uri` row rendering in admin panel + admin action behavior (DB-only updates; hash-verify NO-OP). Turns T1108 green. (FR-112.)
- [ ] T1119 [US10] Run Docker-backed Playwright (`pnpm test:e2e tests/e2e/artifact-admin-panel.spec.ts`) — required screenshots: full panel, quarantine flow with toast, hash-verify mismatch state, retention-sweep summary, metrics tile (insufficient + populated), responsive narrow layout. Argos metadata gate green. Defect-remediation review BEFORE PR. Turns T1100 green.

**Checkpoint**: US10 done.

---

## Phase 14: Polish & Cross-Cutting Concerns

**Purpose**: CI guard rails (strict-scope grep, FR-114/FR-120/FR-111/FR-113 grep gates), docs (`docs/artifacts.md`, `docs/dispositions.md`, `docs/secret-detector.md`), `openapi.json` snapshot for new routes, archive-sweep evidence, screenshot/evidence guard, FULL_VERIFY pass.

- [ ] T1200 [P] Strict-scope grep test (T011 fully green): assert `git diff main...HEAD` touches ONLY the declared 6 strict-scope files PLUS the explicit allowlist (the 7 SPEC-007-touched non-strict files + 2 config files + declared test/fixture/seed/e2e paths). Any unlisted file in the diff → FAIL. (FR-100, SC-010.)
- [ ] T1201 [P] FR-114 grep guard CI step in `pnpm guardrails`: `grep -r 'process\.env\.FEATURE_(DISPOSITION_LOGGING|TASK_ARTIFACTS)'` over the SPEC-007 PR diff (excluding `src/lib/__tests__/**`); any production-code match → FAIL with hint to use `resolveFlag(name, { workspaceId })`. (FR-114.)
- [ ] T1202 [P] FR-120 grep guard CI step: `grep` for `activities\.kind` and `INSERT INTO activities (kind` in production code; any match → FAIL. (FR-120.)
- [ ] T1203 [P] FR-111 direct-DB-write boundary grep guard CI step: regex `(INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?(task_artifacts|task_dispositions)\b` (case-sensitive) over all files outside the FR-111 exception list (allowed in `task-artifacts.ts`, `aegis-review.ts`, `task-dispatch.ts` (dispositions only), migrations, `seed-spec-007.ts`). Any other match → FAIL. (FR-111.)
- [ ] T1204 [P] FR-113 existing-pagination invariance CI step: `git diff main -- src/app/api/activities/route.ts` (and any other pre-existing offset-paginated route) → FAIL on changes touching `total`, `hasMore`, `next_cursor`, `has_more` keys. (FR-113.)
- [ ] T1205 [P] Wire all four grep guards (T1201-T1204) into `pnpm guardrails` (the SPEC-004 consolidated CI script). (FR-114.)
- [ ] T1206 [P] Documentation updates: author `docs/artifacts.md` (publish/read/admin operator guide), `docs/dispositions.md` (logging + audit panel + dashboard widget), `docs/secret-detector.md` (v1 ruleset + safe-regex policy + recall floor). Cross-link from `docs/cli-agent-control.md` if relevant.
- [ ] T1207 [P] `openapi.json` snapshot update for the three new routes (`/api/dispositions`, `/api/task-artifacts`, `/api/task-artifacts/[id]`) — full Error Code Matrix represented; method-not-allowed (FR-123) documented. Snapshot test asserting no drift.
- [ ] T1208 [P] `pnpm guardrails` full pass + `FULL_VERIFY` pass (`pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`) — green required for PR open. (Plan §Test stack.)
- [ ] T1209 Archive Sweep dry-run/apply safety evidence: SPEC-007 itself excluded from same-run archival; previously merged specs (SPEC-001/002/002A/003/004/006, plus SPEC-005 if landed) in scope. Recovery commands `git show <merge-sha>:specs/<feature>/spec.md` recorded post-merge. (Plan §Archive Sweep Plan, FR-100 / SC-010 do NOT cover this.)
- [ ] T1210 Screenshot/evidence guard: `git diff --stat main...HEAD` shows zero `*.png`/`*.jpg`/`*.gif` additions outside test fixtures (Argos owns visual review). Manifest-backed exception path documented if any binary screenshot becomes necessary.
- [ ] T1211 Run quickstart.md validation against the running stack — confirm all 10 walkthroughs (flag enable, inline JSON, inline Markdown, file PDF, secret detection reject + redact-and-store, retention sweep, orphan repair, admin override read, dashboard widget, flag-OFF rollback) execute as documented.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 verifies migration preconditions.
- **Foundational (Phase 2)**: BLOCKS all user stories. T010-T021 must complete first.
- **P1 stories**: US1 (Phase 3), US2 (Phase 4), US6 (Phase 5), US7 (Phase 6), US8 (Phase 7), US9 (Phase 8), US11 (Phase 9). Any may run in parallel after Phase 2 modulo:
  - US8 depends on US7 (`detectSecrets` exists) for runtime.
  - US9 depends on US6 (`publishArtifact` exists) for the dispatch population.
  - US11 depends on US2 (disposition rows seeded) AND US8 (`security_violation` activity emitted).
- **P2 stories**: US3 (Phase 10) depends on US5 (Phase 12) (the API route the panel reads). US4 (Phase 11) depends on US2 (rows + cache invalidation). US10 (Phase 13) depends on US6, US7, US8, US9 (publish + read + detector are prerequisites for admin actions).
- **P3 story**: US5 (Phase 12) depends on US2 (rows to query).
- **Polish (Phase 14)**: AFTER all stories.

### Within Each User Story

- All `[T-RED]` tests are written and asserted to FAIL before any implementation task in that story runs.
- Models (frozen tuples / DB shape) before services; services before endpoints; endpoints before UI; UI integration before e2e.
- Story complete + e2e + Argos metadata + defect remediation BEFORE moving to next priority.

### Parallel Opportunities

- All Foundational `[T-RED]` tests T010-T014 in parallel.
- All Foundational implementation T015-T021 mostly in parallel (T020/T021 are no-overlap with strict-scope files).
- Once Phase 2 is green: US1 / US2 / US6 / US7 / US11 can start in parallel by different developers (mostly different files); US8 starts when US7's `detectSecrets` real impl lands; US9 starts when US6's `publishArtifact` lands.
- All `[P]`-marked tests within a story are parallel-safe.

---

## Parallel Example: User Story 6 (Artifact Publish)

```bash
# All [T-RED] tests for US6 can be authored in parallel by different agents
Task: "T300 happy-path inline + auto-promote tests in src/lib/__tests__/task-artifacts.test.ts"
Task: "T301 atomic-write happy-path test"
Task: "T302 fs.link EEXIST loser path test"
Task: "T303 FR-127 six-step failure injection test"
Task: "T304 size cap (413) test"
Task: "T305 MIME allowlist (415) test"
Task: "T306 external_uri rejection (400) test"
Task: "T307 zero-byte rejection (400) test"
Task: "T308 workspace-isolation tests"
Task: "T309 supersede single-tx + concurrent supersede test"
Task: "T310 FR-131 supersede-target validation test"
Task: "T311 UTC clock-source path-sharding test"
Task: "T312 p95 ring-buffer integration test"
Task: "T313 FR-122 error-precedence pair tests"
Task: "T314 API contract test"

# After all FAIL, run the implementation tasks T315-T326 sequentially
# (they all touch task-artifacts.ts and the route handlers)
```

---

## Implementation Strategy

### MVP First

1. Phase 1: Setup (T001 — verify M054/M057/M058)
2. Phase 2: Foundational (T010-T021) — strict scope plumbing, enums, ring buffer, cursor helpers, baseline fixtures
3. Phase 3: US1 (Flag-OFF parity, the rollback floor)
4. Phase 4: US2 (Disposition Insert under flag ON — unlocks every disposition surface)
5. **STOP and VALIDATE**: Drive a triage-template task to completion under flag ON; confirm row, activity throttle, Aegis FAIL signal.

### Incremental Delivery

After MVP, add stories in this order (each independently testable + demoable):

1. US6 (Artifact publish) → US7 (Detector) → US8 (Enforcement) — completes the artifact security floor.
2. US9 (Dispatch + read API) — successor handoff is now durable.
3. US11 (Aegis hook) — closes the Aegis loop on both signal classes.
4. US3 (Audit panel) → US4 (Dashboard widget) → US10 (Admin panel) — operator surfaces.
5. US5 (Generic API) — long-term integration surface.
6. Phase 14 polish + verification.

### Parallel Team Strategy

- Developer A: US1 + US2 + US3 (disposition vertical)
- Developer B: US6 + US7 + US8 (artifact + detector vertical)
- Developer C: US9 + US10 + US11 (dispatch + admin + Aegis)
- Developer D: US4 + US5 + US14 polish (UI dashboards + API + CI guards)

---

## FR Coverage Matrix (Phase 4 + FR-035a)

| FR | Description | Tasks |
|---|---|---|
| FR-035a (no-bypass detector discipline) | Sole creation entry point + detector before write + supersede re-runs + no admin override + repair preserves status + activity sanitization | T315, T319, T326, T505, T507, T510, T1116, T1109, T1203 |
| FR-110 (baseline-fixture freshness) | Hard `fs.existsSync` precondition on baseline + EXPLAIN fixtures | T021, T101, T102 |
| FR-111 (direct-DB-write boundary) | Grep guard against external INSERT/UPDATE/DELETE on task_artifacts/task_dispositions | T505, T1203 |
| FR-112 (external_uri admin render) | List + detail + admin actions + retention behavior on legacy `external_uri` rows | T607, T616, T1108, T1118 |
| FR-113 (existing-pagination invariance) | Grep guard against modifying offset-pagination shapes | T805, T1204 |
| FR-114 (feature-flag direct-read CI guard) | `process.env.FEATURE_*` grep gate | T1201, T1205 |
| FR-120 (`type` is canonical, NOT `kind`) | Grep guard + throttle SQL uses `type` | T109, T1202, T210 |
| FR-121 (mid-flight flag transitions) | `resolveFlag` called once per logical operation; in-flight ops complete | T105, T106, T319 |
| FR-122 (error-precedence ordering) | Three precedence pairs tested + ordering enforced in route handlers | T313, T325, T614, T1006 |
| FR-123 (method-not-allowed) | 405 `method_not_allowed` for off-method on each new endpoint | T314, T326, T604, T1000, T1006 |
| FR-124 (admin action HTTP error matrix) | Per-action codes (403, 503, 404, 409 already_quarantined / not_quarantined) | T1106, T1111, T1112 |
| FR-125 (423 metadata-stub body shape) | Body excludes content/uri/preview/actor; includes `artifact_locked`, `quarantined_at`, `byte_size`, `sha256`, `mime` | T605, T614 |
| FR-126 (`?include_quarantined=1` handling) | Truthy + admin → 200 + UNTHROTTLED activity; non-admin → 423; malformed → false | T606, T615 |
| FR-127 (atomic-write per-step recovery) | 6-step failure injection; HTTP 507 ENOSPC; `artifact_publish_failed` activity | T303, T318 |
| FR-128 (inline-content failure path) | INSERT-only; no atomic-write phase; no p95 ring update on failure | T312, T323 |
| FR-129 (orphan-repair four classes) | DB-no-file / FS-no-row / `.tmp.*` / workspace-isolation violation; idempotent; collision suffix | T1103, T1114 |
| FR-130 (retention-sweep failure isolation) | Per-row tx; summary row shape; advisory lock; delete wins; quarantined skipped; never auto-cron | T1104, T1115 |
| FR-131 (supersede-target validation) | Missing 404 / cross-task 400 / cross-workspace non-Facility 404 / Facility 403 / quarantined 409 | T310, T320 |
| FR-132 (detector fail-closed) | Throw → 500 + `security_violation_scan_error` activity; no p95 update | T404, T407 |
| FR-133 (activity payload size bounding) | ≤16 KiB serialized; string fields ≤ 1 KiB; findings[] ≤ 32 entries | T202, T208 |
| FR-134 (Aegis review-window semantics) | `reviewWindow.since` ISO-8601 inclusive lower bound; null/undef → return null | T704, T706 |
| FR-135 (no silent-failure 200s) | Every failure returns non-2xx; hash-verify success-with-mismatch is 200 (state, not failure) | T1102, T314, T604, T1000 |
| FR-136 (existing-row read parity flag-OFF) | `GET /api/task-artifacts/[id]` 503 under flag OFF (incl. legacy `external_uri`) | T104, T108 |
| FR-137 (DB-error classification) | Validation = pre-INSERT; insert = any DB error class; throttled `disposition_insert_failed` row regardless of class | T203, T210 |
| FR-138 (failed disposition inserts admin metric) | "Failed disposition inserts (24h)" count tile | T1107, T1117 |
| FR-139 (`'unknown'` in audit panel + dashboard) | Filter includes `'unknown'`; widget has its own segment with legend "validation_failed" | T802, T806, T902, T906 |
| FR-140 (sub-422 precedence) | `redaction_would_empty_artifact` precedes `secret_detected`; `security_violation` activity STILL written | T504, T509 |
| FR-141 (security_violation activity payload) | `{task_id, mime, byte_size, findings:[{rule_id, line_number?, char_offset?}]}`; never matched substring | T500, T501, T508 |

## P6-AC Coverage Matrix

| P6-AC | Description | Tasks |
|---|---|---|
| P6-AC1 | Flag OFF: no `task_dispositions` rows | T100, T105 |
| P6-AC2 | Flag ON: every triage-template completion → exactly one row | T200, T207 |
| P6-AC3 | INSERT failure does not block task advancement; throttled `disposition_insert_failed` activity | T203, T210 |
| P6-AC4 | Audit panel "Dispositions" tab with filters + cursor pagination | T800, T804, T805, T1000, T1001, T1005 |
| P6-AC5 | Dashboard widget — accurate 7-day rollup; 30 s client / 15 s server cache invalidated on insert | T900, T901, T904, T905, T906 |
| P6-AC6 | Agent output publishes inline JSON + inline Markdown + file artifacts | T300, T315, T316 |
| P6-AC7 | Successor dispatch (flag ON) `input_artifacts` references + safe previews; flag OFF byte-compatible | T101, T106, T600, T611, T612 |
| P6-AC8 | Secret content rejected (or redacted-and-stored when flag + text MIME); `security_violation` activity; per-rule fixtures; `safe-regex` CI; recall ≥ 0.95 | T400, T401, T402, T405, T406, T500, T503, T507 |
| P6-AC9 | Admin panel health metrics — counts, bytes, failed publishes/scans/reads, orphans, free space, p95 latency (insufficient_data < 100 obs) | T312, T1105, T1117 |
| P6-AC10 | Admin actions — quarantine reversible, hash verification, retention/archive/delete by manual sweep, orphan repair (bidirectional + workspace-isolation), preview/index rebuild — each per-action audit row | T1100, T1101, T1102, T1103, T1104, T1111, T1112, T1113, T1114, T1115, T1116 |

---

## Notes

- **Activity column terminology**: `activities.type`, NEVER `activities.kind` (FR-120). All throttle SQL: `WHERE type=? AND entity_type='task' AND entity_id=? AND created_at >= unixepoch() - 60`.
- **Strict scope (6 files)**: any modification outside the 6 + the SPEC-007-touched allowlist FAILS the strict-scope grep test (T011, T1200).
- **No DB migrations**: M054, M057, M058 already present per data-model.md.
- **Inline content split**: `content_json` for `inline_json`, `content_markdown` for `inline_markdown`, both NULL for `file`.
- **Successor dispatch payload**: `tasks.metadata.input_artifacts` — there is NO `tasks.input` column.
- **Atomic write**: `fs.link()` (POSIX EEXIST), NOT `fs.rename()`. Temp under `<DATA_DIR>/artifacts/.../.tmp.*`, NEVER `/tmp` (Docker `read_only:true` + EXDEV).
- **Cursor pagination**: opaque base64url-encoded `JSON.stringify({triaged_at, id})`; response shape `{rows, next_cursor, has_more}` — NEW MC convention, NOT applied retroactively to existing offset routes (FR-113).
- **`artifact_quarantined_read_overridden`**: NEVER throttled (NIST SP 800-53 AU-2/3/12); every successful admin override read writes one row.
- **Verify tests fail before implementing**: each `[T-RED]` task must produce a verifiable failure (module-not-found, assertion-failed, missing route) before its implementation sibling runs.
- **e2e screenshots**: NO committed binary screenshots; Argos owns visual review with metadata gate (`test_identity`, `source_file`, `spec:007-disposition-artifacts`).
