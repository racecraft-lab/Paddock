# Regression Safety Checklist — SPEC-007

**Purpose**: Unit tests for the regression-safety requirements in SPEC-007. This checklist validates whether the spec's requirements protecting prior behavior (SPEC-004 dispatch parity, M054/M057/M058 schema invariants, existing UI/API consumers) are well-written, complete, unambiguous, and consistent — NOT whether the implementation works.
**Created**: 2026-05-01
**Feature**: 007-disposition-artifacts
**Audience**: Reviewer (PR + autopilot consensus)
**Depth**: Standard
**Focus**: Flag-OFF byte-compatibility, schema invariance, scope discipline, prior-convention preservation

## Flag-OFF Parity (advanceTaskChain + Dispatch)

- [ ] CHK001 - Are the call-site requirements for `runPostCommitDispositionInsert` (must run AFTER the IIFE returns AND BEFORE `runPostCommitSuccessorSync`, anchored at `src/lib/task-dispatch.ts:502`) specified with exact line/order semantics? [Clarity, Spec §FR-011]
- [ ] CHK002 - Is the NO-OP behavior of `runPostCommitDispositionInsert` when `FEATURE_DISPOSITION_LOGGING=OFF` explicitly required (zero rows inserted, zero `disposition_*` activities written, zero Aegis fail signal)? [Completeness, Spec §FR-001, US1]
- [ ] CHK003 - Is the byte-compatibility guarantee of the successor's `metadata` JSON when both flags OFF specified as a structural assertion (`'input_artifacts' in JSON.parse(successor.metadata) === false`) rather than a vague "looks the same"? [Measurability, Spec §FR-043, SC-001]
- [ ] CHK004 - Are the requirements for the structural baseline fixture (`__fixtures__/spec-004-dispatch-metadata-baseline.json`) defined in terms of "keys + types only, not literal values" so flag-OFF assertions don't break on incidental value drift? [Clarity, Spec §FR-043, US1]
- [ ] CHK005 - Is the EXPLAIN QUERY PLAN regression baseline (`explain-query-plan-pre-m62.json`) named, located, and reused from SPEC-004 so the regression gate is concrete and not invented later? [Traceability, Spec §FR-043, SC-001]
- [ ] CHK006 - Are the requirements complete for *all three* flag-OFF acceptance scenarios in US1 (no `task_dispositions` row, no `input_artifacts` key in successor metadata, `POST /api/task-artifacts` → 503)? [Coverage, Spec §US1]
- [ ] CHK007 - Are the requirements unambiguous about *which* flag controls *which* path when only one flag is OFF (e.g., `FEATURE_DISPOSITION_LOGGING=ON` + `FEATURE_TASK_ARTIFACTS=OFF`)? [Clarity, Spec §FR-001, FR-002, Edge Case]
- [ ] CHK008 - Is the rollback-by-flag-flip guarantee (instant unwind without losing previously stored evidence) stated as a requirement, not just a story rationale? [Completeness, Spec §US1]

## Dispatch Payload Structural Invariance

- [ ] CHK009 - Does the spec require the successor `metadata.input_artifacts` to be a sibling of `metadata.task_pipeline` (the SPEC-004-owned namespace) and explicitly NOT a replacement, rename, or wrapper? [Consistency, Spec §FR-040]
- [ ] CHK010 - Is the successor payload location ("there is NO `tasks.input` column — the dispatch payload lives in `tasks.metadata` JSON") restated wherever it could be misread? [Ambiguity, Spec §US1, FR-040]
- [ ] CHK011 - Is the assertion form for SC-001 ("100 sampled SPEC-004 chains") quantified with a concrete sample size and pass criterion (zero new query-plan rows)? [Measurability, Spec §SC-001]
- [ ] CHK012 - Are requirements present for *what happens if the SPEC-004 baseline fixture is missing or stale* (test failure mode, not silent skip)? [Edge Case, Spec §FR-110]

## Audit Panel & Dashboard Widget Zero-State Rendering

- [ ] CHK013 - Is the requirement that the "Logging began on YYYY-MM-DD" banner is HIDDEN when no `task_dispositions` rows exist stated explicitly (not implied)? [Completeness, Spec §FR-052, US6 AC4]
- [ ] CHK014 - Is the requirement that the dashboard widget renders a zero-state ("0" total + empty placeholder bars) WITHOUT polling failures stated for the no-data case? [Completeness, Spec §US8 AC3]
- [ ] CHK015 - Are the audit-panel and dashboard zero-state requirements consistent with each other (both render without erroring, both convey "no data" rather than throwing)? [Consistency, Spec §US1 AC3, US6 AC4, US8 AC3]
- [ ] CHK016 - Is the requirement specified for the audit panel's empty-state copy ("No dispositions yet") so reviewers can verify the exact string? [Clarity, Spec §US6 AC4]
- [ ] CHK017 - Are the zero-state requirements measurable (specific assertions a Playwright test can encode), not just descriptive? [Measurability, Spec §US6, US8]

## Aegis Hook Non-Triage Pass-Through

- [ ] CHK018 - Does the spec define `evaluateSpec007AegisSignals` as returning `null` when the producer task has neither `security_violation` activities NOR `disposition='unknown'` rows, so non-triage templates are unaffected? [Clarity, Spec §FR-090]
- [ ] CHK019 - Is the requirement that `runAegisReviews` calls `evaluateSpec007AegisSignals` BEFORE its other checks (and falls through unchanged on `null`) stated as an ordering invariant? [Completeness, Spec §FR-090]
- [ ] CHK020 - Is the boundary requirement explicit that the full `runAegisReviews` body remains in `task-dispatch.ts` (NOT extracted, NOT in strict scope) preserving the SPEC-003 / SPEC-004 boundary? [Consistency, Spec §FR-090, FR-100]
- [ ] CHK021 - Are the `AEGIS_FAILURE_REASONS` values closed and frozen (`['secret_in_artifact', 'disposition_validation_failed'] as const`) so future additions can't silently broaden the failure surface? [Clarity, Spec §FR-090]
- [ ] CHK022 - Is the requirement specified that no Aegis pass/fail outcome change is permitted for templates whose `output_schema` does NOT match the triage-template detection rule (FR-010)? [Coverage, Spec §FR-010, FR-090, US2 AC4]

## Workspace-Scoping of Audit Surfaces

- [ ] CHK023 - Are the audit-panel filter scoping requirements stated explicitly (non-Facility callers cannot view other workspaces) at the API + UI layers? [Completeness, Spec §FR-050, FR-080]
- [ ] CHK024 - Is the requirement consistent between `GET /api/dispositions` (FR-080: workspace_id required for non-Facility callers; missing → HTTP 400 `workspace_id_required`) and the audit panel UI? [Consistency, Spec §FR-080, FR-050]
- [ ] CHK025 - Is the Facility-scoped session's privileged behavior (omit `workspace_id` and view across workspaces) defined symmetrically across the audit panel, dashboard widget, and dispositions API? [Consistency, Spec §FR-026, FR-080, US9 AC1]
- [ ] CHK026 - Are the requirements specified for what happens when a non-Facility session's `activeWorkspace` differs from the producer task's workspace (publish 403, read 403)? [Coverage, Spec §FR-026, Spec API Error Code Matrix]

## Strict-Scope Discipline (FR-100)

- [ ] CHK027 - Are the 6 strict-scope files enumerated explicitly (not "the new SPEC-007 modules") so the grep test has an unambiguous allowlist? [Clarity, Spec §FR-100]
- [ ] CHK028 - Is the list of SPEC-007-touched files OUTSIDE strict scope enumerated explicitly (`task-dispatch.ts`, `audit-trail-panel.tsx`, `artifact-admin-panel.tsx`, `dashboard.tsx`, `dispositions/route.ts`, `task-artifacts/route.ts`, `task-artifacts/[id]/route.ts`)? [Completeness, Spec §FR-100]
- [ ] CHK029 - Are the configuration-only edits to `tsconfig.spec-strict.json` and `eslint.config.mjs` listed as expected modifications so the grep test does not flag them as scope leaks? [Coverage, Spec §FR-100]
- [ ] CHK030 - Is the failure mode of the strict-scope grep test stated ("any additional file in the diff MUST fail the test")? [Measurability, Spec §FR-100, SC-010]
- [ ] CHK031 - Are the requirements consistent between FR-100 (strict-scope file list) and SC-010 (assertion that exactly those 6 files appear in `tsconfig.spec-strict.json` `include` AND `eslint.config.mjs` `specStrictFiles`)? [Consistency, Spec §FR-100, SC-010]
- [ ] CHK032 - Are the test-fixture additions (`__fixtures__/secrets/*`, `spec-004-dispatch-metadata-baseline.json`, etc.) explicitly listed in the strict-scope grep test's allowlist (FR-100 expanded)? [Ambiguity, Spec §FR-100]

## Schema Invariance (No New Migrations)

- [ ] CHK033 - Is the "no new migrations" requirement stated explicitly with the existing migrations enumerated (M054, M057, M058)? [Completeness, Spec §Plan Constitution Check VII, Assumptions]
- [ ] CHK034 - Are the inline-content storage requirements specified as "ONE of the live M058 columns based on `storage_kind`" with the column-NULL invariants (`inline_json` → `content_markdown` is NULL; `inline_markdown` → `content_json` is NULL; `file` → both NULL)? [Clarity, Spec §FR-020]
- [ ] CHK035 - Is the requirement specified that the FR-029 enums-snapshot test EXPLAINs the live `task_artifacts` schema and asserts the `content_json` / `content_markdown` column split exists (so a future schema change is detected)? [Measurability, Spec §FR-020, FR-029]
- [ ] CHK036 - Is the requirement specified that no DB-level CHECK constraint exists on `redaction_status` or `security_scan_status` (the enums are app-level only)? [Coverage, Spec §FR-029]
- [ ] CHK037 - Are the M054 / M057 / M058 column lists referenced in the spec (FR-011 disposition columns; FR-020 artifact columns; data-model.md) consistent with the actual `migrations.ts` definitions cited in plan.md (M054 at lines 1500-1521, M057 at 1549-1565, M058 at 1567-1599)? [Consistency, Spec §Plan VII]
- [ ] CHK038 - Are the requirements complete for the M058 `storage_kind` CHECK constraint (which IS expected and unrelated to the redaction/scan-status enums)? [Clarity, Plan §Constraints]

## external_uri Read-Path Compatibility

- [ ] CHK039 - Is the requirement specified that the publish path REJECTS new `storage_kind='external_uri'` requests (HTTP 400) but EXISTING `external_uri` rows continue to render normally on read? [Completeness, Spec §FR-020, US3 AC3, Assumptions]
- [ ] CHK040 - Is the requirement consistent across the publish path (FR-020 reject), the read path (Assumptions: "existing external_uri rows render normally"), and the retention sweep (Edge Case: "removes only the DB row — never attempts outbound deletion")? [Consistency, Spec §FR-020, Edge Cases, Assumptions]
- [ ] CHK041 - Are admin-panel rendering requirements specified for `external_uri` rows (preview, download behavior — does the panel show a stub, follow the URI, or refuse)? [Coverage, Spec §FR-112]

## Cursor Pagination as a NEW MC Convention

- [ ] CHK042 - Is the spec explicit that opaque base64url cursor pagination is a NEW MC-wide convention (no prior precedent in `/api/`) and that SPEC-007 establishes it? [Clarity, Spec §FR-051, Plan §Observability]
- [ ] CHK043 - Are the requirements specified that the new cursor-pagination response shape (`{ rows / dispositions, next_cursor, has_more }`) is DIFFERENT from the existing offset-pagination shape (`{ total, hasMore }`) used by `/api/activities`? [Consistency, Spec §FR-051, FR-080]
- [ ] CHK044 - Is the requirement specified that NO existing offset-paginated endpoint is changed by this spec (i.e., `/api/activities` and any other `{total, hasMore}` consumer remains byte-compatible)? [Coverage, Spec §FR-051, FR-080, FR-113]
- [ ] CHK045 - Are the cursor format requirements unambiguous (`base64url(JSON.stringify({ triaged_at: number, id: number }))`) and is the malformed-cursor failure mode specified (HTTP 400 + `invalid_cursor`)? [Clarity, Spec §FR-051]
- [ ] CHK046 - Is the requirement consistent between FR-051 (audit panel response shape) and FR-080 (`/api/dispositions` response shape) — both use `{ dispositions, next_cursor, has_more }`? [Consistency, Spec §FR-051, FR-080]
- [ ] CHK047 - Are the migration requirements specified for any future endpoint adopting cursor pagination (or is FR-051 the only authority)? [Ambiguity, Spec §FR-113]

## Boundary Discipline — Code Outside Strict Scope That Touches task_artifacts / task_dispositions

- [ ] CHK048 - Are the requirements explicit that code paths OUTSIDE `src/lib/task-artifacts.ts` and `src/lib/aegis-review.ts` MUST NOT directly INSERT/UPDATE/DELETE `task_artifacts` or `task_dispositions` rows, except via the declared SPEC-007-touched files? [Coverage, Spec §FR-100, FR-111]
- [ ] CHK049 - Is the requirement specified for the `runPostCommitDispositionInsert` boundary (lives in `task-dispatch.ts`, calls into the disposition validator/insert path, but is NOT a duplicate of `task-artifacts.ts` write logic)? [Clarity, Spec §FR-011]
- [ ] CHK050 - Are the requirements complete for what `task-dispatch.ts` is allowed to do with `task_artifacts` (read-only for `metadata.input_artifacts` population per FR-040; NOT direct INSERT/UPDATE)? [Coverage, Spec §FR-040, FR-100, FR-111]
- [ ] CHK051 - Is the requirement specified that the dispositions API route, the task-artifacts API routes, and the UI panels use the strict-scope library functions as the sole write/admin surface (no inline SQL against the M057/M058 tables)? [Consistency, Spec §FR-100, FR-111]

## Throttle SQL Pattern Reuse

- [ ] CHK052 - Is the throttle SQL pattern (`WHERE type=? AND entity_type='task' AND entity_id=? AND created_at >= unixepoch() - 60`) cited consistently across FR-014 (disposition_insert_failed) and FR-032 (security_violation)? [Consistency, Spec §FR-014, FR-032]
- [ ] CHK053 - Is the SPEC-006 precedent (`label_provisioning_failed` at `github-sync-engine.ts:200-209`) cited as the source-of-truth pattern, ensuring SPEC-007 does not invent a new throttle dialect? [Traceability, Spec §FR-014, Plan §Observability]
- [ ] CHK054 - Is the explicit non-throttling of `artifact_quarantined_read_overridden` (FR-065) stated with rationale (NIST SP 800-53 AU-2/3/12) so a future "consistency" refactor doesn't add a throttle? [Clarity, Spec §FR-065]
- [ ] CHK055 - Are the requirements complete for activity-write failure handling (logged to stderr, does NOT rethrow) for both throttled events? [Completeness, Spec §FR-014, FR-032]

## API Error Matrix Stability

- [ ] CHK056 - Is the API Error Code Matrix declared as the AUTHORITATIVE contract such that any other status code emitted by SPEC-007 endpoints is forbidden? [Clarity, Spec §API Error Code Matrix]
- [ ] CHK057 - Are the error-body requirements specified as `{ error: '<error_code>' }` with optional inline domain-specific fields, explicitly NOT a generic `{ code }` field that would diverge from the project convention? [Consistency, Spec §API Error Code Matrix]
- [ ] CHK058 - Are the flag-OFF endpoint behaviors specified consistently across all three new endpoints (POST /api/task-artifacts → 503, GET /api/task-artifacts/[id] → 503, GET /api/dispositions → 503)? [Consistency, Spec §API Error Code Matrix]
- [ ] CHK059 - Is the auth pattern reuse explicit ("MUST follow the same pattern as `/api/activities`") so 401/403 behavior cannot drift? [Traceability, Spec §FR-081]

## Feature-Flag Resolution Discipline

- [ ] CHK060 - Is the requirement specified that both flags resolve via `resolveFlag(name, ctx)` at every call site (publish, read, dispatch, advanceTaskChain post-commit) — not via direct `process.env` reads? [Coverage, Spec §FR-001, FR-002, Plan §V]
- [ ] CHK061 - Is the CI grep guard against `process.env.FEATURE_DISPOSITION_LOGGING` and `process.env.FEATURE_TASK_ARTIFACTS` direct reads required, with failure mode specified? [Measurability, Plan §V, Spec §FR-114]
- [ ] CHK062 - Are the requirements consistent with the documented pitfall that `process.env.FEATURE_X='1'` does NOT force a flag ON; only `workspaces.feature_flags` JSON does? [Consistency, Spec §Assumptions, CLAUDE.md]

## Activity Type Stability

- [ ] CHK063 - Is the list of 14 new `activities.type` values enumerated in FR-100/Plan X (Observability) closed and frozen, so no PR-time drift introduces a 15th value silently? [Completeness, Spec §Key Entities, Plan §X]
- [ ] CHK064 - Are the activity type names consistent with prior SPEC conventions (snake_case, noun-then-verb, no namespacing prefix)? [Consistency, Spec §Key Entities]
- [ ] CHK065 - Is the requirement specified that the `activities` column is `type` (NOT `kind`), and is this disambiguation present everywhere `kind` is referenced in narrative text (FR-014, FR-032, FR-063, FR-067)? [Ambiguity, Spec §FR-014, FR-032, FR-063]

## Dependency Surface

- [ ] CHK066 - Is the "no new runtime dependencies" requirement stated explicitly, and is the reuse list (`ajv`, `jsonpath-plus`, `safe-regex`) cited with version pins matching SPEC-004? [Completeness, Plan §Technical Context]
- [ ] CHK067 - Is the requirement specified that the detector ruleset is CLOSED (17 families, no transitive gitleaks pulls)? [Clarity, Spec §FR-031]

## Dependencies & Assumptions

- [ ] CHK068 - Are all assumed-stable upstream invariants (M054 column shape, M057 column shape, M058 column split, `resolveFlag` semantics, `quality_reviews` semantics, `runAegisReviews` semantics, session model) explicitly listed in the Assumptions section? [Completeness, Spec §Assumptions]
- [ ] CHK069 - Is the SPEC-005 dependency stated as "for clean-merge ergonomics, not correctness" so SPEC-007 autopilot can run independently? [Clarity, Spec §Assumptions]
- [ ] CHK070 - Are the requirements consistent between Assumptions (M054/M057/M058 already exist with intended columns) and Constitution Check VII (zero new migrations)? [Consistency, Spec §Assumptions, Plan §VII]
