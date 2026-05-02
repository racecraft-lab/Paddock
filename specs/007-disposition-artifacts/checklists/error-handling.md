# Error Handling Requirements Quality Checklist: SPEC-007

**Purpose**: Unit tests for the error-handling requirements in spec.md and plan.md — validate that every error path is completely, clearly, and consistently specified.
**Created**: 2026-05-01
**Feature**: [spec.md](../spec.md)
**Domain**: error-handling
**Focus areas**: Flag-OFF behavior; disposition insert isolation; validation failure; HTTP error code matrix; hash-mismatch on verify; orphan repair (bidirectional); retention sweep failures; `fs.link()` EEXIST race; durability invariants (no partial canonical files; no DB rows pointing at missing files).
**Audience**: Reviewer (PR) — gating SPEC-007 readiness for `/speckit.tasks` and `/speckit.implement`.
**Depth**: Standard (release gate).

## Flag-OFF Behavior (Rollback Safety)

- [ ] CHK001 - Are flag-OFF rollback requirements specified for BOTH `FEATURE_DISPOSITION_LOGGING` and `FEATURE_TASK_ARTIFACTS` independently and together (4-cell matrix)? [Completeness, Spec §FR-001, §FR-002, §FR-003]
- [ ] CHK002 - Is the flag-OFF byte-compatibility contract for successor dispatch quantified with an exact, machine-checkable assertion (e.g., `'input_artifacts' in JSON.parse(successor.metadata) === false`)? [Clarity, Measurability, Spec §FR-043, §SC-001]
- [ ] CHK003 - Is the flag-OFF baseline shape (keys + types) for `tasks.metadata` explicitly captured in a fixture and referenced by FR/SC? [Completeness, Spec §FR-043 / `spec-004-dispatch-metadata-baseline.json`]
- [ ] CHK004 - Are flag-OFF requirements specified for `POST /api/task-artifacts` (HTTP 503) AND `GET /api/task-artifacts/[id]` (HTTP 503) AND `GET /api/dispositions` (HTTP 503)? [Coverage, Spec §FR-002, §API Error Code Matrix]
- [ ] CHK005 - Is the response body shape for the 503 flag-OFF case stable and identical across all three endpoints, or are the divergent error codes (`artifact_store_disabled`, `disposition_logging_disabled`) intentional and documented? [Consistency, Spec §API Error Code Matrix]
- [ ] CHK006 - Are flag-OFF requirements for the audit panel "Dispositions" tab AND the dashboard widget specified to render empty-state without polling failures (no client-side error toast)? [Coverage, Edge Case, Spec §US1 AS3]
- [x] CHK007 - Does the spec define what happens when `FEATURE_DISPOSITION_LOGGING` flips OFF mid-task (between insert decision and execution)? [Edge Case]
  - Resolved by FR-121 (mid-flight flag flips do not abort in-flight ops; resolveFlag cached per-operation)
- [x] CHK008 - Does the spec define behavior when `FEATURE_TASK_ARTIFACTS` flips OFF while a publish is mid-flight (after secret-scan, before file write, before DB INSERT)? [Edge Case]
  - Resolved by FR-121 (publish that has cleared resolveFlag runs to completion)
- [x] CHK009 - Are existing-data read paths (legacy `external_uri` rows, pre-existing `task_dispositions` rows) specified to remain readable when the relevant flag is OFF? [Clarity, Spec §FR-002 ("Existing `external_uri` rows continue to render normally on read"), §Edge Cases]
  - Resolved by FR-136 (existing-row reads gated on flag; legacy external_uri also returns 503 under flag-OFF)

## Disposition Insert Failure Isolation

- [ ] CHK010 - Is the post-commit insert sequence (commit → try insert → on failure write activity) specified with explicit ordering relative to `runPostCommitSuccessorSync`? [Clarity, Spec §FR-011, plan.md §Summary]
- [ ] CHK011 - Is the exact throttle SQL predicate for `disposition_insert_failed` specified verbatim (`WHERE type=? AND entity_type='task' AND entity_id=? AND created_at >= unixepoch() - 60`) including column-name reconciliation between `type` (canonical) and `kind` (legacy spec text)? [Clarity, Consistency, Spec §FR-014]
- [ ] CHK012 - Is the throttle key dimensionality (`(task_id, type)` per 60s) consistent between FR-014 (insert failure) and FR-032 (security violation), and is this consistency explicitly required? [Consistency, Spec §FR-014 vs §FR-032]
- [ ] CHK013 - Is the requirement that disposition INSERT failure NEVER blocks task advancement testable as an independent assertion (advancement succeeds + activity row exists + no exception propagates)? [Measurability, Spec §FR-012, §US2 AS3]
- [ ] CHK014 - Is the failure mode for the throttle-write itself specified (i.e., what happens if the `activities` row INSERT also fails — log to stderr, do NOT rethrow)? [Completeness, Spec §FR-014 ("Activity-write failure is logged to stderr and does NOT rethrow")]
- [ ] CHK015 - Is the index supporting the throttle predicate (`idx_activities_entity ON activities(entity_type, entity_id)`) explicitly required by the spec/plan, with a reference to where it is created? [Traceability, plan.md §Observability Notes / migrations.ts:460]
- [x] CHK016 - Are requirements defined for what counts as "DB error" that triggers `disposition_insert_failed` vs. what is treated as validation? (e.g., FK violation, UNIQUE, busy/locked, disk full) [Coverage]
  - Resolved by FR-137 (DB error classes enumerated; every DB error class produces one throttled disposition_insert_failed)
- [x] CHK017 - Is the inconsistency between FR-014 (column = `type`) and US2 AS3 / FR-013 wording (`kind=`) explicitly flagged or reconciled in the spec? [Conflict, Ambiguity, Spec §US2 AS3 vs §FR-014]
  - Resolved by FR-120 (kind=/type= reconciliation; type is canonical; CI grep guard)
- [x] CHK018 - Are post-commit insert failures observable in the admin panel (failed-publishes / failed-scans / failed-reads counter), or is `disposition_insert_failed` separately surfaced? [Spec §FR-064]
  - Resolved by FR-138 (admin tile surfaces "Failed disposition inserts (24h)" count)

## Validation Failure (Disposition)

- [ ] CHK019 - Is the validation-failure path completely specified: (a) row inserted with `disposition='unknown'`, (b) activity `type='disposition_validation_failed'` with full agent-output payload, (c) Aegis FAIL with `reason='disposition_validation_failed'`? [Completeness, Spec §FR-013, §US2 AS2]
- [ ] CHK020 - Is the rejection of agent-supplied `'unknown'` (FR-015) consistent with the validation path that itself uses `'unknown'` as the sentinel (i.e., agents cannot return it; only the validator can write it)? [Consistency, Spec §FR-013 vs §FR-015, §Edge Cases]
- [ ] CHK021 - Is "missing field" vs. "enum violation" treated identically by the validation path, or are they distinguished in the activity payload? [Clarity, Spec §FR-013]
- [ ] CHK022 - Are validation-failure requirements consistent across the disposition path AND any output-schema validator reuse from SPEC-004 (`output-schema-validator.ts`)? [Consistency, plan.md §Constraints]
- [x] CHK023 - Is the "full agent-output payload" written into the validation-failure activity bounded in size (to prevent oversized rows) or is unbounded payload a ``? [Edge Case]
  - Resolved by FR-133 ("full" payload bounded ≤ 16 KiB; truncation rules defined)
- [ ] CHK024 - Does the spec define whether a validation-failure row is itself paged on the audit-panel "Dispositions" tab (visible alongside successful dispositions, filterable by `disposition='unknown'`)? [Coverage, Spec §FR-050]
- [ ] CHK025 - Is the dashboard widget's behavior for `disposition='unknown'` rows specified (segment in the stacked bar, separate slice, or excluded)? [Ambiguity, Spec §Edge Cases ("remains a clarification target")]

## API Error Code Matrix

- [ ] CHK026 - Is every HTTP status code in scope (400, 401, 403, 404, 409, 413, 415, 422, 423, 500, 503) bound to an exact endpoint+condition row in the matrix with no overlapping or contradictory rows? [Completeness, Consistency, Spec §API Error Code Matrix]
- [x] CHK027 - Is the precedence order for stacking errors specified (e.g., 503 flag-OFF wins over 401 unauthenticated wins over 400 bad input)? [Clarity]
  - Resolved by FR-122 (12-tier error precedence with three contract-test pairs)
- [ ] CHK028 - Is the error body shape (`{ error: '<error_code>' }` plus optional domain fields) explicitly required to match the existing project convention referenced in `openapi.json` and `src/app/api/activities/route.ts:18,36`? [Consistency, Traceability, Spec §API Error Code Matrix]
- [ ] CHK029 - Is the explicit prohibition on a generic `code` field documented and testable by contract tests? [Clarity, Spec §API Error Code Matrix]
- [ ] CHK030 - Are domain-specific supplemental fields (`limit_bytes`, `mime`, `redacted_preview`, `findings`, `artifact_id`, `supersedes_id`) defined for each row that uses them, with exact field names? [Completeness, Spec §API Error Code Matrix]
- [ ] CHK031 - Is the 400 family (`bad_request`, `external_uri_rejected`, `invalid_cursor`, `workspace_id_required`) disambiguated by error_code so contract tests can assert specific codes? [Clarity, Measurability, Spec §API Error Code Matrix]
- [ ] CHK032 - Is the 422 family (`secret_detected`, `redaction_would_empty_artifact`) disambiguated by error_code, and does each row specify additional required fields? [Clarity, Spec §API Error Code Matrix]
- [ ] CHK033 - Are 403 conditions distinguished between `workspace_mismatch` (publish path), `workspace_forbidden` (read path), and admin-guard 403 (destructive actions FR-062)? [Consistency, Spec §API Error Code Matrix vs §FR-062 / §US7 AS7]
- [ ] CHK034 - Is the 404 case for `GET /api/task-artifacts/[id]` defined for both "id never existed" AND "id existed and was deleted"? [Coverage, Edge Case, Spec §API Error Code Matrix]
- [x] CHK035 - Are HTTP status codes for the admin-only destructive actions (quarantine, delete, archive, hash-verify, repair-orphans, retention-sweep) defined in the matrix or referenced from another section? [Coverage, Spec §FR-062]
  - Resolved by FR-124 (admin-action HTTP error matrix)
- [x] CHK036 - Is the 423 `artifact_locked` body shape consistent with the rule that the response is "metadata-only stub body" (i.e., is the metadata schema for this stub specified)? [Clarity, Spec §FR-065]
  - Resolved by FR-125 (423 metadata-stub body shape exact)
- [x] CHK037 - Is the response for a malformed `?include_quarantined=1` parameter or a non-admin attempting `?include_quarantined=1` specified (silently ignored vs. 400 vs. 403)? [Edge Case, Spec §FR-065]
  - Resolved by FR-126 (?include_quarantined parameter handling)
- [x] CHK038 - Is the 405 (method not allowed) behavior specified for the three new endpoints (e.g., POST to `/api/dispositions`, GET to `/api/task-artifacts` collection)? [Coverage]
  - Resolved by FR-123 (405 method-not-allowed with off-method contract tests)
- [x] CHK039 - Is the response when both flag-OFF AND another error condition apply (e.g., flag OFF + unauthenticated) specified deterministically? [Conflict]
  - Resolved by FR-122 (precedence ordering deterministic across stacked errors)
- [ ] CHK040 - Are all matrix entries traceable to a contract test in the suite, and is the spec explicit that codes not in the matrix MUST NOT appear? [Measurability, Spec §API Error Code Matrix ("codes not listed here are NOT permitted responses")]

## Hash Mismatch (Verify) and Hash Verification (EEXIST Race)

- [ ] CHK041 - Is the hash-mismatch-on-verify path specified to set `security_scan_status='hash_mismatch'` AND write an `artifact_hash_verified` activity AND explicitly NOT auto-quarantine? [Completeness, Spec §FR-067, §US7 AS2]
- [ ] CHK042 - Is the EEXIST-race hash-mismatch path (different `activities.type='artifact_hash_verification_failed'`, returns 500) clearly distinguished from the verify-action mismatch path (`type='artifact_hash_verified'`, no HTTP code involved)? [Consistency, Spec §FR-023, §FR-067, §API Error Code Matrix, §Key Entities activity types list]
- [ ] CHK043 - Is the activity-type vocabulary for hash events consistent across spec.md (`artifact_hash_verified`, `artifact_hash_verification_failed`) and is the difference between them documented? [Consistency, Spec §FR-067 vs §FR-023]
- [ ] CHK044 - Is the requirement specified that BOTH hashes (existing canonical + new content) are recorded in the `artifact_hash_verification_failed` activity payload? [Completeness, Spec §FR-023]
- [ ] CHK045 - Is the durability invariant ("loser path leaves no partial file at the canonical path") explicitly required and testable in the EEXIST race? [Measurability, Spec §FR-022, §FR-023]
- [x] CHK046 - Is the non-EEXIST `fs.link` error path specified (abort + clean up the `.tmp.*` + return what HTTP code)? [Spec §FR-022 step 3]
  - Resolved by FR-127 step 3 (non-EEXIST fs.link error → 500 internal_storage_error + activity)
- [x] CHK047 - Is the failure path specified when the post-link `fs.unlink(tmpPath)` fails (FR-022 step 4) — does the publish still succeed? [Edge Case]
  - Resolved by FR-127 step 4 (post-link unlink failure → publish proceeds; orphan reclaimed)
- [x] CHK048 - Is the failure path for the parent-directory fsync (FR-022 step 5) specified? [Edge Case]
  - Resolved by FR-127 step 5 (parent-fsync failure → ABORT publish + cleanup canonical)
- [ ] CHK049 - Is the failure path specified for the DB INSERT after a successful link+unlink+fsync (orphan canonical file with no row)? [Coverage, Spec §FR-027 ("the canonical file is left as a healthy orphan to be reclaimed by the FR-068 orphan-repair sweep")]
- [ ] CHK050 - Is hash-mismatch detection specified to use the same canonical sha256 algorithm for both sides of the comparison (preventing collision-via-algorithm-mismatch)? [Clarity, Spec §FR-023]

## Orphan Repair (Bidirectional)

- [ ] CHK051 - Is the DB-row-without-file repair fully specified: `redaction_status='rejected'`, `security_scan_status='file_missing'`, row preserved (not deleted), activity row recorded? [Completeness, Spec §FR-068, §US7 AS3]
- [ ] CHK052 - Is the FS-file-without-row repair fully specified: file moved to `<DATA_DIR>/artifacts/_orphaned/<timestamp>/<original-relative-path>`, activity row recorded? [Completeness, Spec §FR-068, §US7 AS4]
- [x] CHK053 - Is the repair behavior for the third class — `.tmp.*` siblings older than a configurable threshold — specified, including the threshold default? [Coverage, Spec §Edge Cases ("Orphan repair sweep handles `.tmp.*` siblings older than a configurable threshold")]
  - Resolved by FR-129.1 (.tmp.* threshold = artifact_tmp_orphan_age_seconds, default 86400)
- [x] CHK054 - Is repair idempotency required (running repair twice over the same orphan does not produce duplicate activity rows or move files twice)? [Edge Case]
  - Resolved by FR-129.2 (idempotency rules per orphan class)
- [x] CHK055 - Is the repair behavior specified when the move target `_orphaned/<timestamp>/<path>` already exists (collision)? [Edge Case]
  - Resolved by FR-129.3 (collision suffix .<unixepoch_micros>.collision)
- [x] CHK056 - Is the activity payload for `artifact_repaired_orphan` specified with `{direction: 'db_row_without_file'|'fs_file_without_row', artifact_id?, original_path, new_path?, ...}`? [Clarity, Spec §FR-063 (payload shape) vs §FR-068]
  - Resolved by FR-129.5 (artifact_repaired_orphan payload shape with direction enum)
- [ ] CHK057 - Are repair operations specified to be admin-only and to return 403 for non-admins (consistent with FR-062 admin-guard)? [Consistency, Spec §FR-062, §US7 AS7]
- [x] CHK058 - Resolved by Phase 4 consensus 2/3 high (CHK058) — Option A (move-and-flag + continue sweep) confirmed; codebase precedent in `src/lib/github-sync-engine.ts:862-927` and current FR-129.4 wording match.
- [ ] CHK059 - Is repair behavior specified when a DB row references a file that exists but whose on-disk sha256 differs from the row's recorded sha256 (file present but corrupted — is this orphan, hash-mismatch, or both)? [Conflict, Ambiguity, Spec §FR-067 vs §FR-068]

## Retention Sweep Failures

- [ ] CHK060 - Is the per-row failure handling during retention sweep specified (log per-row failure, sweep continues, summary activity records counts)? [Completeness, user input — note: spec body in §FR-069 specifies "single summary activities row" but does NOT explicitly require continue-on-failure semantics]
- [x] CHK061 - Does the spec require the summary activity row to record both success counts AND failure counts (archived_count, deleted_count, failed_count, skipped_count)? [Completeness, Spec §FR-069]
  - Resolved by FR-130.2 (summary row carries archived/deleted/skipped/failed counts + sample_failure_reason)
- [x] CHK062 - Is the retention sweep specified to be transactional per-row (each row's archive/delete is its own transaction, so a failure on row N does not roll back row N-1)? [Clarity, Spec §FR-069]
  - Resolved by FR-130.1 (per-row db.transaction; failure caught, sweep continues)
- [ ] CHK063 - Is the sweep behavior specified when `feature_flags.artifact_retention` is missing, malformed, or has all three fields null? [Coverage, Spec §FR-069 ("any field may be `null`, default null = keep forever")]
- [x] CHK064 - Resolved by Phase 4 consensus 1/1 high (CHK064) — Option A (delete wins) confirmed; Constitution Principle XI + no-cron / no-resume design make archive-then-later-delete unreliable.
- [ ] CHK065 - Is the sweep behavior specified for `external_uri` legacy rows (DB row removed, no outbound delete attempted)? [Coverage, Spec §Edge Cases]
- [x] CHK066 - Is the sweep behavior specified for quarantined rows (excluded from delete, included in delete, or admin choice)? [Edge Case]
  - Resolved by FR-130.4 (quarantined rows SKIPPED in counted skipped_count)
- [x] CHK067 - Is the sweep behavior specified when the archive subtree write fails (disk full, permission denied)? [Edge Case]
  - Resolved by FR-130.1+2 (archive write failure → counted in failed_count, sweep continues)
- [x] CHK068 - Is the sweep behavior specified for partially-completed sweeps that get killed mid-run (resume vs. restart)? [Edge Case]
  - Resolved by FR-130.6 (mid-run kill leaves no partial summary; restart is fresh-query, no resume)
- [x] CHK069 - Is concurrent admin-triggered sweep specified (idempotency lock, advisory lock, or simply "last write wins")? [Edge Case]
  - Resolved by FR-130.5 (process-local advisory lock; second concurrent → 409 sweep_in_progress)
- [ ] CHK070 - Is the absence of an automatic cron sweep explicitly required and asserted (no scheduler ever invokes the sweep)? [Clarity, Spec §FR-069, §US7]

## Atomic Write Durability Invariants ("Pay Special Attention")

- [ ] CHK071 - Is the invariant "no error path leaves a partial file at the canonical path" stated as a discrete, testable requirement (not just an outcome of FR-022)? [Measurability, Spec §FR-022, §SC-006]
- [ ] CHK072 - Is the invariant "no DB row points at a non-existent canonical file" stated explicitly, with the orphan-repair sweep as the recovery (not prevention) mechanism? [Clarity, Spec §FR-027, §FR-068]
- [x] CHK073 - Are crash points enumerated for the atomic write protocol (after step 1, after step 2, ..., after step 6) with the recovery property defined for each? [Coverage, Spec §FR-022]
  - Resolved by FR-127 (six-step recovery enumerated with per-step invariant test)
- [ ] CHK074 - Is the atomic-write requirement specified to forbid `fs.rename()` (silent overwrite on POSIX) and to require `fs.link()` (POSIX EEXIST atomicity)? [Clarity, Spec §FR-022, plan.md §Constraints]
- [ ] CHK075 - Is the temp-file location requirement (same canonical directory tree, never `/tmp`, never tmpfs) stated with the rationale (Docker `read_only:true`, EXDEV)? [Clarity, Spec §FR-022 step 1]
- [ ] CHK076 - Is the SC-006 acceptance threshold ("zero partial canonical files across a 500-publish crash-injection test") testable with a defined harness? [Measurability, Spec §SC-006]
- [ ] CHK077 - Is the post-supersede invariant ("exactly one non-superseded row per (task_id, artifact_type) at all times outside the transaction window") testable? [Measurability, Spec §FR-027]
- [ ] CHK078 - Is the WAL-snapshot guarantee ("readers see a pre-COMMIT snapshot, no partial supersede state visible") explicitly required and traceable to a SQLite mode assertion? [Traceability, Spec §FR-027, plan.md §Storage]

## Inline Content Failure Paths

- [x] CHK079 - Is the failure path for inline-content writes specified when the DB INSERT itself fails (no FS state to clean, but is an activity row required)? [Coverage, Spec §FR-020]
  - Resolved by FR-128 (inline DB INSERT failure → 500 + activity, no p95 update)
- [ ] CHK080 - Is the failure path specified when content size is exactly 64 KiB UTF-8 (boundary — does it stay inline or auto-promote)? [Edge Case, Spec §FR-021 ("≤ 64 KiB" inline, "> 64 KiB" file)]
- [ ] CHK081 - Is the inline column-split invariant (only one of `content_json` / `content_markdown` is non-null per row) testable, with a violation surfaced as what failure mode? [Measurability, Spec §FR-020]
- [ ] CHK082 - Is the auto-promotion path (inline → file because > 64 KiB) specified to write through the same atomic protocol as a native file publish (not a separate code path)? [Consistency, Spec §FR-021 vs §FR-022]

## Quarantine / Supersede Conflicts

- [ ] CHK083 - Is the 409 `cannot_supersede_quarantined` error specified with the original artifact id surfaced in the response body for operator action? [Completeness, Spec §API Error Code Matrix, §Edge Cases]
- [ ] CHK084 - Is the supersede transaction failure path specified (transaction rolls back; new file remains as orphan; FR-068 reclaims)? [Coverage, Spec §FR-027]
- [x] CHK085 - Is the behavior specified when a publish targets `supersedes=<id>` and `<id>` does not exist (404)? [Coverage]
  - Resolved by FR-131.1 (404 artifact_not_found with supersedes_id; no file write)
- [x] CHK086 - Resolved by Phase 4 consensus 3/3 high (CHK086) — **Option B (HTTP 404, NOT 403) confirmed; FR-131.3 updated.** OWASP IDOR Prevention Cheat Sheet + RFC 9110 §15.5 + GitHub/AWS/Stripe multi-tenant precedent + codebase `tasks/[id]/route.ts:117-123` pattern all converge on 404 to prevent ID-enumeration.
- [ ] CHK087 - Is the read of a quarantined-and-superseded chain specified (does the chain still render, with quarantined nodes shown as locked stubs)? [Coverage, Spec §US3 AS7]

## Detector / Secret-Scan Error Paths

- [ ] CHK088 - Is the 422 `secret_detected` body shape specified with `redacted_preview` and `findings` count, and is `findings` an integer count vs. a list? [Clarity, Spec §API Error Code Matrix]
- [ ] CHK089 - Is the 422 `redaction_would_empty_artifact` precedence specified relative to 422 `secret_detected` (both could apply)? [Conflict, Spec §Edge Cases, §API Error Code Matrix]
- [ ] CHK090 - Is the binary-with-findings rejection (FR-034) consistent with the binary-with-`allow_redacted_artifacts=1` rejection in §US4 AS4? [Consistency, Spec §FR-034 vs §US4 AS4]
- [ ] CHK091 - Is the throttle for `security_violation` activity rows specified to share the same predicate shape as `disposition_insert_failed`, parameterized only by `type` and `entity_id`? [Consistency, Spec §FR-014 vs §FR-032]
- [x] CHK092 - Resolved by Phase 4 consensus 3/3 high (CHK092) — Option A (fail-closed) confirmed; OWASP 2025 A10 + `output-schema-validator.ts` codebase precedent + Constitution Principle XIII all mandate fail-closed.
- [x] CHK093 - Is the `security_scan_status='scan_error'` enum value used by any code path, and is the requirement that triggers it documented? [Spec §FR-029 (`scan_error` is in the enum tuple but its trigger is not specified in any FR)]
  - Resolved by FR-132 (scan_error reserved for orphan-repair scenarios with prior security_violation_scan_error history)
- [ ] CHK094 - Is the detector requirement that findings log the rule id and never the matched substring stated as a discrete requirement (not just inferred from Constitution Principle XIII)? [Traceability, plan.md §Constitution Check (Principle XIII)]

## Aegis Failure Path

- [ ] CHK095 - Are the two AEGIS_FAILURE_REASONS (`secret_in_artifact`, `disposition_validation_failed`) the only Aegis failure reasons introduced by SPEC-007, with all other Aegis behaviors unchanged? [Completeness, Spec §FR-090, plan.md §Constitution Check (Principle II)]
- [ ] CHK096 - Is the Aegis hook ordering specified (the SPEC-007 helper runs BEFORE pre-existing checks in `runAegisReviews`)? [Clarity, Spec §FR-090]
- [ ] CHK097 - Is the Aegis behavior specified when both signals fire for the same producer task (e.g., `disposition='unknown'` AND `security_violation` activity)? [Coverage, Spec §Edge Cases ("both reasons appear in the failure summary")]
- [x] CHK098 - Is the review-window definition for Aegis signal evaluation (`reviewWindow.since`) specified to align with the existing Aegis review window semantics? [Clarity, Spec §FR-090]
  - Resolved by FR-134 (reviewWindow.since = inclusive ISO-8601 lower bound; null returns null without scanning)

## Generic Cross-Cutting Error Concerns

- [ ] CHK099 - Are all new `activities.type` values (14 listed in §Key Entities) used exactly once in their introducing FR with no orphan types? [Consistency, Spec §Key Entities vs §FR-013/14/32/63/65/66/67/68/69]
- [ ] CHK100 - Are the column-name conflicts between spec text (`kind=`) and FR-014/FR-063 (`type=`) resolved everywhere, or is this a [Conflict] requiring a spec edit? [Conflict, Spec §US2 AS3 ("kind='disposition_insert_failed'") vs §FR-014 ("type='disposition_insert_failed'")]
- [x] CHK101 - Are error-path latency budgets specified (e.g., a rejected-publish should still emit p95 budget data, or is the ring buffer publish-success-only)? [Spec §FR-028 ("on every successful publish")]
  - Resolved by FR-128 (rejected publishes do NOT update p95; FR-028 is success-only)
- [ ] CHK102 - Is the requirement that admin destructive-action 403s do NOT alter state (no partial mutation) explicitly required and testable? [Measurability, Spec §US7 AS7]
- [ ] CHK103 - Is the requirement specified that error responses do NOT leak secret material in their bodies (e.g., the `redacted_preview` in 422 is post-redaction, not raw content)? [Security, Critical, Spec §FR-032, §API Error Code Matrix]
- [ ] CHK104 - Are observability hooks (logs, activities) specified for the 500 path so operators can diagnose `artifact_hash_verification_failed` without raw content access? [Coverage, Spec §FR-023, plan.md §Constitution Check (Principle X)]
- [x] CHK105 - Is the requirement that NO error path returns 200 (silent failure) explicitly stated (i.e., every failure must produce a non-2xx code)? [Clarity]
  - Resolved by FR-135 (no SPEC-007 endpoint returns 200/201 for logical failures; contract tests assert error body)
