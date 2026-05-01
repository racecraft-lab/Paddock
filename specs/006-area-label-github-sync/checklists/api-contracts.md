# API Contracts Checklist: Area-Label GitHub Sync

**Purpose**: Validate that requirements for the API surface (PUT /api/projects/[id], POST /api/github, OpenAPI documentation) are complete, unambiguous, consistent, measurable, and cover edge cases — including the hybrid 409 response shape, optional-field backward compatibility, operator-only authorization invariance, area_slug validation, and first-time-set vs transfer-owner semantics.
**Created**: 2026-05-01
**Feature**: [spec.md](../spec.md)
**Domain**: API contracts (Phase 4 checklist 4 of 4)

> This is a unit test for the requirements in the api-contracts domain. Each item asks whether the spec/plan/contracts define the property — not whether code passes. The standalone `[Gap]` token marks items where the requirement text is missing or under-specified and must be authored before G4 closure.

## PUT /api/projects/[id] Request Shape

- [ ] CHK001 - Are the four new optional request fields (`area_slug`, `is_triage_project`, `is_repo_sync_owner`, `transfer_owner`) explicitly defined with name, JSON type, nullability, and required/optional flag in the contract? [Completeness] [Spec §FR-033] [Contract §projects-put.md Body]
- [ ] CHK002 - Is the request body schema explicitly stated to be backward-compatible (omitting all four new fields produces behavior identical to the pre-SPEC-006 baseline)? [Completeness] [Spec §FR-002] [Contract §projects-put.md Body]
- [ ] CHK003 - Are the existing PUT body fields (`name`, `slug`, `description`, etc.) explicitly preserved without alteration in the SPEC-006 contract? [Consistency] [Contract §projects-put.md Body]
- [ ] CHK004 - Is the type contract for `area_slug` explicitly `string | null` (with `null` defined as the clear-slug operation)? [Clarity] [Contract §projects-put.md Body]
- [ ] CHK005 - Are `is_triage_project`, `is_repo_sync_owner`, and `transfer_owner` explicitly typed as boolean (not 0/1 numeric, not optional truthy strings)? [Clarity] [Contract §projects-put.md Body]
- [ ] CHK006 - Is the semantic of `transfer_owner` when paired with `is_repo_sync_owner=false` or absent explicitly defined as a no-op? [Clarity] [Contract §projects-put.md Body]

## area_slug Validation (Format / 400 Responses)

- [ ] CHK007 - Is the `area_slug` regex (`^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$`) documented in the request contract verbatim and consistent with FR-034? [Consistency] [Spec §FR-034] [Contract §projects-put.md Body]
- [ ] CHK008 - Is the 400 Bad Request response shape for invalid `area_slug` documented with the exact JSON keys (`error`, `message`, `field`)? [Completeness] [Contract §projects-put.md 400]
- [ ] CHK009 - Is the validation order (400 format/regex evaluated BEFORE 409 uniqueness) explicitly stated so a request that is both malformed AND collides yields a deterministic 400? [Consistency] [Spec §FR-034] [Contract §projects-put.md Validation order]
- [ ] CHK010 - Is the requirement that no DB write occurs on the 400 path (no SELECT-for-conflict, no UPDATE) explicitly stated? [Completeness] [Spec §FR-034] [Contract §projects-put.md Validation order]
- [ ] CHK011 - Are non-boolean values for `is_triage_project`/`is_repo_sync_owner`/`transfer_owner` explicitly required to return 400 with a field-specific error? [Coverage] [Contract §projects-put.md Validation order]
- [ ] CHK012 - Is the single-character slug case (e.g., `area_slug='q'`) explicitly stated as accepted by the regex (covered by the optional outer group)? [Edge Case] [Spec §FR-034]
- [ ] CHK013 - Is `area_slug=null` explicitly defined as a valid value (clears the slug, never triggers regex check)? [Edge Case, Clarity] [Contract §projects-put.md Body]

## Hybrid 409 Response Shape (Clarify Session 3)

- [ ] CHK014 - Is the `area_slug_conflict` 409 body shape explicitly documented with all four required keys (`error`, `message`, `existing_area_slug_project_id`, `existing_area_slug_project_slug`)? [Completeness] [Spec §FR-035] [Contract §projects-put.md 409]
- [ ] CHK015 - Is the `triage_conflict` 409 body shape explicitly documented with all four required keys (`error`, `message`, `existing_triage_project_id`, `existing_triage_project_slug`)? [Completeness] [Spec §FR-036] [Contract §projects-put.md 409]
- [ ] CHK016 - Is the `owner_conflict` 409 body shape explicitly documented with all five required keys (`error`, `message`, `existing_owner_project_id`, `existing_owner_project_slug`, `hint`)? [Completeness] [Spec §FR-037] [Contract §projects-put.md 409]
- [ ] CHK017 - Is the `hint` field on `owner_conflict` documented with its exact stable string ("Set transfer_owner=true to swap ownership in one transaction") so UI and API tests can both pin it? [Clarity] [Spec §FR-037]
- [ ] CHK018 - Are the three `error` codes (`area_slug_conflict`, `triage_conflict`, `owner_conflict`) consistently used across spec, contract, and FR-041 (UI keying) without drift? [Consistency] [Spec §FR-035] [Spec §FR-036] [Spec §FR-037] [Spec §FR-041]
- [ ] CHK019 - Is the requirement that the form keys on the structured `error` code (NOT on regex-parsing of `message`) explicitly stated for downstream UI implementations? [Clarity] [Spec §FR-041] [Contract §projects-put.md 409]
- [ ] CHK020 - Are the `existing_*_project_id` fields explicitly typed as `number` (integer primary key) and the `existing_*_project_slug` fields as `string` in the 409 contract? [Clarity] [Contract §projects-put.md 409]
- [ ] CHK021 - Is the requirement that no DB write occurs on any 409 path (SELECT-only, no UPDATE) explicitly stated? [Completeness] [Spec §FR-035] [Spec §FR-036] [Spec §FR-037]

## First-Time Set vs Transfer-Owner Semantics (Edge Case)

- [ ] CHK022 - Is it explicitly defined that `is_repo_sync_owner=true` set on a project when NO existing owner exists for `(workspace_id, github_repo)` MUST succeed (200 OK) and NOT return 409, regardless of the value of `transfer_owner`? [Edge Case, Coverage] [Spec §FR-037] [Contract §projects-put.md Validation order]
- [ ] CHK023 - Is the trigger condition for the `owner_conflict` 409 explicitly defined as "another project in the same `(workspace_id, github_repo)` group already has `is_repo_sync_owner=1` AND `transfer_owner !== true`"? [Clarity] [Spec §FR-037] [Contract §projects-put.md Validation order]
- [ ] CHK024 - Is the case where `is_repo_sync_owner=true` is set on the SAME project that already owns it (idempotent re-assertion) explicitly addressed (should be 200 no-op, not 409)? [Edge Case] [Spec §FR-059] [Contract §projects-put.md Idempotent owner re-assertion]
- [ ] CHK025 - Is the case where `is_repo_sync_owner=false` is set on the current owner without a transfer (leaves zero owners — permitted by the partial unique index per Spec §Edge Cases) explicitly defined as 200 OK with no 409? [Edge Case, Coverage] [Spec §FR-037]
- [ ] CHK026 - Is the case where a project sets `is_repo_sync_owner=true` for a `(workspace_id, github_repo)` group whose existing owner is the project itself + `transfer_owner=true` is also passed addressed as a no-op (200), or explicitly excluded? [Edge Case] [Spec §FR-059]
- [ ] CHK027 - Is the requirement that `transfer_owner=true` without `is_repo_sync_owner=true` is a no-op (no transfer, no error) explicitly stated and covered by a test? [Edge Case, Coverage] [Contract §projects-put.md Body]

## Transfer-Owner Atomic Swap (Clear-Then-Set)

- [ ] CHK028 - Is the clear-then-set ordering inside the transfer transaction explicitly required by the spec, with the rationale (SQLite immediate UNIQUE constraints, no DEFERRABLE on partial unique indexes)? [Clarity] [Spec §FR-037] [Contract §projects-put.md Transactional behavior]
- [ ] CHK029 - Is the activity row insert (`kind='sync_owner_transferred'`) included as the third statement of the transaction, inside the same atomicity envelope? [Completeness] [Spec §FR-037] [Contract §projects-put.md Transactional behavior]
- [ ] CHK030 - Is the `data` payload of `sync_owner_transferred` activities documented with all five required keys (`previous_owner_project_id`, `new_owner_project_id`, `github_repo`, `workspace_id`, `actor_user_id`)? [Completeness] [Spec §FR-037]
- [ ] CHK031 - Is there a requirement that a unit test asserts set-first ordering raises a UNIQUE violation (locking the rule against future regressions)? [Measurability] [Spec §FR-037] [Contract §projects-put.md Transactional behavior]
- [ ] CHK032 - Is the case where a UNIQUE-violation race occurs between the SELECT-for-conflict and the UPDATE explicitly required to translate back to the matching 409 structured response (not leak as 500)? [Edge Case, Coverage] [Spec §FR-034]

## Operator-Only Authorization Invariance

- [ ] CHK033 - Is the requirement that operator-only authorization (`requireRole(request, 'operator')`) is unchanged for PUT /api/projects/[id] explicitly stated? [Completeness] [Spec §FR-033] [Contract §projects-put.md Authorization]
- [ ] CHK034 - Is there an explicit requirement that no new public surface, no new role tier, and no new authentication path is introduced by the four new fields? [Completeness] [Spec §Assumptions]
- [ ] CHK035 - Is the workspace-scope check (project must belong to caller's workspace, returning 404 otherwise) explicitly preserved in the SPEC-006 contract? [Consistency] [Contract §projects-put.md Validation order]
- [ ] CHK036 - Is the requirement that unauthorized callers (non-operator) receive 401/403 BEFORE any 400/409 evaluation explicitly stated? [Clarity, Coverage] [Contract §projects-put.md Validation order]

## Backward Compatibility (Omitted Fields)

- [ ] CHK037 - Is the requirement that requests omitting all four new fields produce a response identical in shape and side-effects to the pre-SPEC-006 PUT explicitly stated? [Completeness] [Spec §FR-002]
- [ ] CHK038 - Is there an explicit requirement that the 200 OK success response includes the three new fields (`area_slug`, `is_triage_project`, `is_repo_sync_owner`) in the returned project record so clients can read back what was set? [Completeness] [Contract §projects-put.md 200]
- [ ] CHK039 - Is the requirement that `transfer_owner` is NOT echoed back in the 200 response (because it is a request-only flag, not a stored field) explicitly stated? [Clarity] [Spec §FR-061] [Contract §projects-put.md 200 OK]
- [ ] CHK040 - Is the requirement that field-level `undefined` (omitted) MUST be distinguished from explicit `null` (clear) in the request handler explicitly documented for `area_slug`? [Clarity] [Contract §projects-put.md Body]

## Flag-OFF Defense-in-Depth (FR-040a)

- [ ] CHK041 - Is the 400 `feature_flag_disabled` response shape explicitly documented with all three required keys (`error`, `message`, `fields`)? [Completeness] [Spec §FR-040a] [Contract §projects-put.md 400]
- [ ] CHK042 - Is the requirement that only the fields actually present in the request are listed in the `fields` array (not all four unconditionally) explicitly stated? [Clarity] [Contract §projects-put.md 400]
- [ ] CHK043 - Is the requirement that the flag-OFF 400 evaluation occurs BEFORE 400-format and BEFORE 409-uniqueness evaluation explicitly stated (so a flag-OFF request never leaks conflict information about other projects)? [Clarity] [Spec §FR-057] [Contract §projects-put.md Validation order step 4]
- [ ] CHK044 - Is the requirement that a flag-OFF PUT request with `area_slug=null` (clearing) is also rejected (because it is a non-undefined value of the new field) explicitly addressed, OR explicitly defined as permitted? [Edge Case] [Spec §FR-057] [Contract §projects-put.md Validation order step 4]

## POST /api/github Connect Handler Delta (FR-039)

- [ ] CHK045 - Is the requirement that `POST /api/github` connect handler request and response shapes are unchanged by SPEC-006 explicitly stated? [Completeness] [Spec §FR-039] [Contract §github-connect.md Request]
- [ ] CHK046 - Is the internal change documented (the handler now passes `workspaceId` to `initializeLabels` via `initializeLabels(repo, workspaceId, { trigger: 'connect' })`) without altering the public contract? [Clarity] [Spec §FR-039] [Contract §github-connect.md Behavior delta]
- [ ] CHK047 - Is the source from which `workspaceId` is resolved (`resolveWorkspaceScopeFromRequest`) explicitly named so implementers do not introduce a new resolution path? [Clarity] [Contract §github-connect.md Request]
- [ ] CHK048 - Is the requirement that connect HTTP response is unaffected by per-label provisioning failures explicitly stated? [Completeness] [Spec §FR-027] [Contract §github-connect.md Failure isolation]
- [ ] CHK049 - Is the requirement that connecting a repo to a flag-OFF workspace produces only the legacy `mc:*`/`priority:*` label set (no `area:*`) explicitly stated and testable? [Coverage] [Spec §FR-002] [Contract §github-connect.md Behavior delta]
- [ ] CHK050 - Is the requirement that connecting a repo to a flag-ON workspace provisions both static `AREA_LABEL_MAP` defaults AND workspace-specific `area_slug`-derived labels explicitly stated? [Completeness] [Spec §FR-025] [Contract §github-connect.md Behavior delta]

## Side-Effect: initializeLabels After PUT (FR-038)

- [ ] CHK051 - Is the requirement that `initializeLabels(repo, workspaceId)` is invoked AFTER the transaction commits (not inside the transaction) explicitly stated? [Clarity] [Contract §projects-put.md Post-write side effect]
- [ ] CHK052 - Is the trigger condition (a transaction successfully transitioned `area_slug` or `is_triage_project` to a new value) explicitly defined? [Clarity] [Spec §FR-038] [Contract §projects-put.md Post-write side effect]
- [ ] CHK053 - Is the iteration target (every repo owned by an `is_repo_sync_owner=1` project in the workspace) explicitly defined? [Completeness] [Spec §FR-038]
- [ ] CHK054 - Is the requirement that `initializeLabels` failures during the PUT side-effect MUST NOT alter the PUT response (200 returned regardless of label-provisioning outcome) explicitly stated? [Completeness] [Contract §projects-put.md Post-write side effect]
- [ ] CHK055 - Is the trigger string `'area_slug_change'` for the post-PUT `initializeLabels` invocation consistent with FR-027a (`trigger: 'connect' | 'area_slug_change' | 'bootstrap'`)? [Consistency] [Spec §FR-027a] [Contract §projects-put.md Post-write side effect]
- [ ] CHK056 - Is the case where a PUT changes `is_repo_sync_owner` (transferring ownership) but does NOT change `area_slug` or `is_triage_project` explicitly addressed as NOT triggering `initializeLabels` (because no slug transitioned)? [Edge Case] [Spec §FR-060] [Contract §projects-put.md Post-write side effect]
- [ ] CHK057 - Is the case where a transfer-owner request changes BOTH `is_repo_sync_owner` AND `area_slug` simultaneously explicitly defined for the side-effect ordering (transaction commits first, then initializeLabels runs once)? [Edge Case, Coverage]

## OpenAPI Spec Updates (openapi.json)

- [ ] CHK058 - Is there an explicit requirement that `openapi.json` is updated to document the four new optional request fields on `PUT /api/projects/{id}` with their JSON types and nullability? [Completeness] [Spec §FR-064(a)]
- [ ] CHK059 - Is there an explicit requirement that `openapi.json` documents the three new 409 response shapes (`area_slug_conflict`, `triage_conflict`, `owner_conflict`) with their structured `error` codes and `existing_*` fields? [Completeness] [Spec §FR-064(d)]
- [ ] CHK060 - Is there an explicit requirement that `openapi.json` documents the 400 `invalid_area_slug` and `feature_flag_disabled` response shapes? [Completeness] [Spec §FR-064(c)]
- [ ] CHK061 - Is there an explicit requirement that the OpenAPI schema for the project response object includes the three new persisted fields (`area_slug`, `is_triage_project`, `is_repo_sync_owner`)? [Completeness] [Spec §FR-064(b)]
- [ ] CHK062 - Is there an explicit requirement that the OpenAPI spec preserves the existing PUT request/response schema (no breaking changes to existing fields) so the spec remains backward-compatible? [Consistency] [Spec §FR-064(e)]
- [ ] CHK063 - Is there a requirement that an OpenAPI schema-validation step (lint, validator, or snapshot test) is run as part of the CI gate to prevent drift between spec and code? [Measurability] [Spec §FR-064]

## Error-Code Stability (Cross-Surface Contract)

- [ ] CHK064 - Are the structured `error` strings (`invalid_area_slug`, `feature_flag_disabled`, `area_slug_conflict`, `triage_conflict`, `owner_conflict`) declared as a stable enum/union in the contract documentation so future renames are forbidden without a versioned migration? [Clarity] [Spec §FR-062]
- [ ] CHK065 - Is the requirement that `message` strings are human-readable but NOT the load-bearing identifier for clients explicitly stated (clients MUST key on `error`, not regex-parse `message`)? [Clarity] [Spec §FR-041]
- [ ] CHK066 - Is the requirement that `message` strings MUST NOT contain operator/user PII (email, display name) or secrets (tokens) explicitly stated? [Coverage] [Spec §FR-027a] [Spec §FR-043a]

## Test Matrix Coverage

- [ ] CHK067 - Does the contract test matrix explicitly cover the first-time-set case (`is_repo_sync_owner=true` with no existing owner, no `transfer_owner` flag) as a 200 OK case? [Coverage, Edge Case] [Contract §projects-put.md Test matrix]
- [ ] CHK068 - Does the test matrix explicitly cover the regex pass / regex fail / null-clear cases for `area_slug`? [Coverage] [Contract §projects-put.md Test matrix]
- [ ] CHK069 - Does the test matrix explicitly cover all three 409 cases (area_slug, triage, owner) with the exact response-body assertions for the `existing_*` fields? [Coverage] [Contract §projects-put.md Test matrix]
- [ ] CHK070 - Does the test matrix explicitly cover the flag-OFF defense-in-depth path (any of the four fields present → 400 `feature_flag_disabled`)? [Coverage] [Contract §projects-put.md Test matrix]
- [ ] CHK071 - Does the test matrix explicitly cover the post-commit `initializeLabels` invocation when `area_slug` transitions NULL→value? [Coverage] [Contract §projects-put.md Test matrix]
- [ ] CHK072 - Does the test matrix explicitly cover the connect-handler matrix (flag-OFF connect → no `area:*`; flag-ON connect → both static + workspace-derived labels)? [Coverage] [Contract §github-connect.md Test matrix]

## Ambiguities & Conflicts

- [ ] CHK073 - Is there any conflict between FR-033 (operator-only unchanged) and FR-040a (flag-OFF rejects new fields with 400) on the order of authorization vs flag-evaluation that requires resolution? [Conflict resolved] [Spec §FR-057] (auth precedes flag evaluation; no conflict)
- [ ] CHK074 - Is the case where a single PUT request triggers two simultaneous 409s (e.g., `area_slug` collides AND `is_triage_project` also collides) explicitly defined to return ONE 409 response with a deterministic priority order? [Ambiguity resolved] [Spec §FR-058]
- [ ] CHK075 - Is the case where a 400 (regex format error) and a 400 (flag-OFF) would both apply explicitly resolved with a precedence rule? [Ambiguity resolved] [Spec §FR-057] (flag-OFF rejection precedes regex evaluation)
