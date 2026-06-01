# Feature Specification: SPEC-013C - Retry/Backoff and Debug API Surfaces

**Feature Branch**: `013c-retry-debug-surfaces`  
**Created**: 2026-05-28  
**Status**: Draft  
**Input**: User description: "SPEC-013C adds authenticated API-only retry, release, cancel, backoff, audit, and debug authority on top of SPEC-013B claim/reconciliation state, while deferring operator UI controls to SPEC-013D."

## Clarifications

### Session 1 - Action Eligibility And State Machine

- Release is allowed only for an active claim whose current stage key still matches the requested stage. It clears ownership with an operator-specific release reason and does not make work immediately eligible for a new scheduler attempt.
- Cancel is allowed only for an active claim or an explicitly cancellable running/stuck stage. It clears ownership with an operator-cancel reason, records a cancelled stage outcome, and blocks automatic pickup until a later explicit retry.
- Retry is allowed for either an active claim that the operator intentionally retires for retry, or for the latest retry-eligible stage evidence after a failed, stuck, stale, deferred, or cancelled outcome. It does not synchronously launch work; it makes the stage eligible for a later scheduler attempt subject to backoff and governance.
- Retry-eligible non-active evidence includes dispatch failure, boundary deferral, stale-truth deferral, governance deferral, stale-claim recovery, cancelled-by-operator state, and failed or cancelled stage-attempt lifecycle rows. Terminal task states, terminal GitHub issue/PR states, non-assigned tasks, local-only tasks, repo-only tasks, and non-claimable states are not retry-eligible.
- SPEC-013C adds operator release reasons for `operator_released`, `operator_cancelled`, and `operator_retry_requested` while preserving SPEC-013B terminal and governance release reasons.
- Mutation responses use a closed outcome vocabulary: `retry_ready`, `retry_backoff_active`, `released`, `cancelled`, `already_applied`, `stale_state`, `conflict`, `not_eligible`, `flag_off`, `unauthorized`, and `validation_error`.
- Cancel prevents automatic pickup by leaving the latest operator action as cancelled until a later successful `retry` clears that block. Cancel never changes the whole task to `failed` or `done`.

### Session 2 - API Contract, Idempotency, And Races

- The mutation surface is one route: `POST /api/tasks/[id]/claim-control`. The path task id plus the authenticated workspace scope identifies the task; the JSON body identifies `action`, `stage_key`, expected state predicates, optional backoff override, operator reason fields, and an optional client correlation id.
- The request body requires `action` as one of `retry`, `release`, or `cancel`; `stage_key`; and an `expected` object that carries the caller's last-seen claim, attempt, and operator-action evidence. Active-claim actions must include `expected.claim_id` and `expected.claim_run_id`; retry against non-active evidence must include `expected.attempt_id` plus the latest retry-eligible status or evidence id.
- The response envelope uses `schema_version: "task_claim_control.v1"` and returns `task`, `stage_key`, `action`, `outcome`, `claim`, `attempt`, `backoff`, `available_actions`, `audit`, `idempotency`, `correlation_id`, and sanitized `diagnostics`. Identifiers follow the existing debug surfaces by serializing externally visible ids as strings.
- Every mutation request requires an `Idempotency-Key` header. The key is scoped to the authenticated actor, route/action/task/stage target, and canonical parsed request body. Missing keys are rejected before any mutation; same key plus same canonical body returns a stable replay without rerunning the side effect; same key plus different canonical body returns `idempotency_key_body_mismatch`.
- Idempotency replay and business `already_applied` are distinct. Same-key replay returns the original successful response; a new-key request may return `already_applied` only when current state proves the same requested operator action has already been applied to the same claim/attempt target without needing another state transition.
- Existing claim, attempt, and activity rows remain the source of state and audit truth, but activity rows alone are not sufficient for durable response replay. Plan must provide a scoped claim-control idempotency record or a safely scoped shared idempotency store; it must not reuse an actor/key-only cache in a way that collides with unrelated routes.
- Mutations are transactional compare-and-set operations. The predicate must validate the visible task, workspace, stage key, feature flag, current active claim or latest retry-eligible evidence, expected claim/attempt/run identifiers, cancellation block state, and backoff override requirements before writing. If the predicate no longer matches, the route returns `stale_state` or `conflict` without partial mutation.
- Concurrent scheduler ticks and different operator actions are resolved by the same compare-and-set boundary. A scheduler-created active claim after the caller's read makes non-active retry stale; a scheduler release before an operator release makes active-claim actions stale; two different same-stage actions cannot both succeed.
- HTTP status mapping is closed: `200` for successful, backoff-active, already-applied, and same-key replay outcomes; `400` for malformed JSON or missing required routing/idempotency fields; `401` for unauthenticated callers; `403` for insufficient role or feature-flag-off mutation; `404` for invisible task/stage targets; `409` for stale-state, conflict, or not-eligible current state; `422` for semantic validation such as idempotency body mismatch, unsafe payload, or missing override reason; `429` for mutation rate limit; `500` only for sanitized unexpected failures.

### Session 3 - Authorization, Audit Safety, And Error Surfaces

- Mutation authorization uses the existing `requireRole(request, 'operator')` hierarchy. Operators and admins may mutate; viewers may read debug state only. The actor identity recorded for mutations comes from the authenticated user/session/API-key context and is never accepted from the request body.
- The mutation route applies the existing mutation rate limiter before parsing or mutating. Rate-limit responses do not write task-scoped claim-control audit rows.
- Successful mutations and authenticated task-visible semantic rejections write bounded task-scoped activity evidence. Unauthenticated, forbidden-role, invisible-task, malformed-body, and rate-limited requests do not write task claim-control audit rows beyond existing security or route logging.
- Audit payloads use a positive allowlist only: `schema_version`, `action`, `outcome`, `workspace_id`, `task_id`, `stage_key`, `claim_id`, `claim_run_id`, `task_stage_attempt_id`, `attempt_id`, `previous_claim_state`, `new_claim_state`, `previous_attempt_status`, `new_attempt_status`, `release_reason`, `retry_eligibility_reason`, `unavailable_reason`, `backoff_decision`, `backoff_seconds`, `next_retry_at`, `override_backoff`, `override_reason`, `actor_user_id`, `actor_username`, `actor_role`, `idempotency_key_hash`, `request_body_hash`, `correlation_id`, `sanitized_error_category`, `validation_code`, `redaction_applied`, and `http_status`.
- The raw `Idempotency-Key` value, raw request body, raw error text, raw prompt/transcript/provider/GitHub/auth payload, and user-supplied actor fields are never persisted. Audit may store only deterministic hashes for idempotency and canonical body identity.
- Text fields persisted in audit/debug evidence are trimmed, length-bounded, and secret-scanned. Secret-shaped values are redacted or rejected before persistence; detector failures fail closed without applying the claim-control mutation.
- Sanitized error categories are closed: `unauthenticated`, `forbidden_role`, `feature_flag_disabled`, `invalid_json`, `validation_failed`, `missing_idempotency_key`, `idempotency_key_body_mismatch`, `unsafe_payload`, `task_not_found`, `stage_not_found`, `not_eligible`, `stale_state`, `conflict`, `backoff_active`, `rate_limited`, `redaction_failed`, `idempotency_storage_unavailable`, and `internal_error`.
- Override reasons are required only when `retry` bypasses active backoff. The persisted reason is the sanitized, bounded reason plus actor and previous backoff fields, not any broad diagnostic text.

### Session 4 - Read Model And SPEC-013D Boundary

- The existing `task_claim_reconciliation.v1` envelope remains the read surface. SPEC-013C extends it backward-compatibly with optional `claim_control` fields rather than changing the route path or requiring existing consumers to adopt a new top-level schema version.
- `claim_control` exposes `stage_key`, `authorization`, `available_actions`, `retry_eligibility`, `backoff`, `last_operator_action`, `last_sanitized_error`, and `expected_state` data. It must not expose raw action URLs, raw request bodies, raw idempotency keys, or broad diagnostics.
- `available_actions` is an array of closed action descriptors for `retry`, `release`, and `cancel`, each with `enabled`, `unavailable_reason`, `requires_confirmation`, `requires_idempotency_key`, `requires_expected_state`, `requires_override_reason`, and `backoff_policy` fields. Disabled actions remain visible enough for SPEC-013D to explain why an operator cannot act.
- `authorization` reports the required role (`operator`), the current caller role category, and `can_mutate` so SPEC-013D can hide or disable controls without duplicating role rules. This read-only field does not authorize mutation by itself.
- `expected_state` contains the exact claim, run, attempt, retry evidence, and last operator-action identifiers a client must echo to the mutation endpoint. SPEC-013D must echo these fields and refresh on stale/conflict responses instead of recomputing state in the client.
- `backoff` reports `state`, `seconds_remaining`, `next_retry_at`, `reason`, `override_allowed`, and `override_requires_reason`. The read model distinguishes "retry unavailable" from "retry accepted but backoff still active".
- `last_operator_action` reports only bounded prior SPEC-013C evidence: action, outcome, activity id, actor display fields from persisted audit, claim/attempt ids, override reason when present, idempotency key hash, and created-at timestamp.
- `last_sanitized_error` reports closed error category, validation code, redaction flag, activity id when available, and created-at timestamp. It does not expose raw error text.
- The extended read model remains side-effect-free: it may read tasks, claims, attempts, activities, feature flags, and workspace/user scope, but it must not acquire/release claims, append attempt events, write activities, trigger GitHub sync, call scheduler/dispatch, or fetch live GitHub state.
- SPEC-013C PR and UAT evidence must use this wording: "SPEC-013C provides backend API/debug authority only. In-app operator adoption remains blocked on SPEC-013D, and first real harness operation remains blocked on SPEC-013D plus SPEC-014B." It must not describe API-only work as complete operator UX.

### Session 5 - API-And-Audit UAT

- Post-merge target UAT uses a disposable workspace or product-line scope with `FEATURE_TASK_CONTROL_PLANE=true` set only through `workspaces.feature_flags`. No global environment force-on is allowed.
- The UAT fixture set covers: active-claim release, active-claim cancel, retry of failed/stuck/deferred/cancelled evidence without active backoff, retry with active backoff respected, retry with explicit backoff override reason, same-key idempotency replay, same-key different-body rejection, stale-state/conflict after a competing transition, unauthorized/viewer mutation rejection, feature-flag-off mutation rejection, and read-model reflection after each accepted action.
- API/read-model/audit responses are the primary acceptance evidence. Manual database inspection is optional supporting evidence for source-row references and cleanup counts, not the primary proof that operators can use the backend contract.
- The evidence packet records `uat_replay_id`, target URL or service name, deployed commit, operator, timestamp, workspace/project/task ids, stage key, GitHub repo/issue identifiers if used, feature flag scope, route path, authenticated role used, action request summaries, response status/outcome, read-model before/after summaries, audit activity ids/types, idempotency key hash, request body hash, backoff previous/after fields, override reason, sanitized error category, and redaction flag.
- The evidence packet must prove no double mutation and no duplicate audit rows for same-key replay; no raw idempotency key, request body, prompt, transcript, auth header, GitHub body, token, provider payload, or secret-shaped value appears in responses, activities, retained logs, or checked-in evidence.
- Cleanup uses a unique `spec013c-uat-*` marker on disposable rows and records before/after counts for workspaces, projects, tasks, claims, attempts, idempotency rows, and activities. Cleanup must disable or remove the target flag scope and leave zero UAT residue unless a retained-evidence exception is explicitly recorded.
- Rollback for UAT is flag-first: disable `FEATURE_TASK_CONTROL_PLANE` for the disposable scope and verify mutation routes become unavailable while read-only debug remains safe. If Plan adds a migration, the UAT packet also records the migration id, rollback SQL path, backup path, and whether rollback was exercised or only documented.
- UAT closeout must explicitly record that SPEC-013D remains the operator UX adoption blocker and that SPEC-014C first real harness operation remains blocked until SPEC-013D and SPEC-014B are complete.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect Claim Control Eligibility (Priority: P1)

As a Paddock operator, I need to inspect a GitHub-linked assigned stage and understand whether retry, release, or cancel is currently available before I mutate scheduler state.

**Why this priority**: Operators cannot safely intervene in claimed-stage recovery unless the system exposes current eligibility, backoff, last action, and sanitized error state from one authoritative source.

**Independent Test**: Can be tested by creating controlled claimed, deferred, failed, cancelled, and ineligible stage states, then reading the claim-reconciliation debug payload and confirming available actions, unavailable reasons, backoff details, last operator action, and sanitized error state are correct without invoking a mutation.

**Acceptance Scenarios**:

1. **Given** an active claimed stage, **When** an authorized operator reads the debug surface, **Then** the response identifies the active claim and lists release and cancel as available actions.
2. **Given** a retry-eligible failed, stuck, deferred, or cancelled stage, **When** an authorized operator reads the debug surface, **Then** the response lists retry availability, backoff status, and the reason a retry is or is not currently allowed.
3. **Given** a local-only task, repo-only task, non-assigned task, or task with no eligible stage evidence, **When** an authorized operator reads the debug surface, **Then** mutation actions are unavailable and the response explains the ineligible condition without creating audit rows.

---

### User Story 2 - Retry A Recoverable Stage (Priority: P1)

As a Paddock operator, I need to explicitly retry a failed, stuck, deferred, or cancelled stage so work can become eligible for a new scheduler attempt after the cause has been addressed.

**Why this priority**: Retry is the primary recovery path for failed or intentionally stopped work. It must be distinct from release and cancel so audit evidence and scheduler behavior remain clear.

**Independent Test**: Can be tested by placing a stage in retry-eligible states, calling the authenticated action endpoint with `retry`, and verifying state transition, backoff handling, idempotency replay, audit evidence, and subsequent read-model eligibility.

**Acceptance Scenarios**:

1. **Given** a retry-eligible failed stage with no active backoff, **When** an authorized operator submits `retry`, **Then** the stage becomes eligible for a new scheduler attempt and the response records the retry outcome.
2. **Given** a retry-eligible stage with active backoff, **When** an authorized operator submits `retry` without override, **Then** the system preserves backoff and returns a bounded backoff response rather than forcing immediate pickup.
3. **Given** a retry-eligible stage with active backoff, **When** an authorized operator submits `retry` with an explicit override reason, **Then** the system records actor, override reason, previous/new state, and the retry outcome in bounded audit evidence.

---

### User Story 3 - Release Or Cancel An Active Claim (Priority: P1)

As a Paddock operator, I need to release or cancel an active claimed stage without marking the whole task done or failed, so I can unblock ownership or intentionally stop automatic pickup at the stage level.

**Why this priority**: SPEC-013B introduced active claims but not operator recovery controls. Release and cancel must let operators recover ownership state without bypassing tracker truth, task-chain successor rules, or governance.

**Independent Test**: Can be tested by creating an active claim, calling `release` and `cancel` in separate fixtures, and verifying distinct state, audit, read-model, and scheduler eligibility outcomes.

**Acceptance Scenarios**:

1. **Given** an active claimed stage, **When** an authorized operator submits `release`, **Then** active ownership is cleared without scheduling new work and without changing the whole task terminal state.
2. **Given** an active claimed stage, **When** an authorized operator submits `cancel`, **Then** the current stage is intentionally stopped, automatic pickup is disabled until explicit retry, and the whole task is not marked `failed` or `done`.
3. **Given** a repeated release or cancel request with the same idempotency key, **When** the operator submits it again, **Then** the system returns the stable original response without double-mutation or duplicate audit rows; a new-key request may return `already_applied` only when current state proves the same operator action was already applied.

---

### User Story 4 - Preserve Audit Safety And Race Clarity (Priority: P2)

As a reviewer or operator, I need every mutation to produce bounded, redacted evidence and clear conflict outcomes so scheduler races, stale clients, and repeated clicks can be reconstructed safely.

**Why this priority**: Claim-control actions mutate runtime ownership. The feature is only reviewable if audit evidence is complete enough for reconstruction but never persists raw prompts, transcripts, tokens, auth headers, GitHub bodies, provider payloads, or secret-shaped values.

**Independent Test**: Can be tested by exercising unauthorized calls, stale-state predicates, concurrent scheduler/action attempts, idempotent replays, and unsafe payload attempts, then inspecting responses and audit evidence for bounded categories.

**Acceptance Scenarios**:

1. **Given** an unauthenticated or insufficiently privileged caller, **When** the caller submits any mutation action, **Then** the system rejects the request without changing claim, attempt, task, GitHub, or audit state beyond normal security logging.
2. **Given** a stale operator view or concurrent scheduler transition, **When** an operator submits a mutation whose expected state no longer matches, **Then** the response reports a conflict or stale-state outcome without applying the mutation.
3. **Given** a mutation request that includes broad diagnostic or secret-shaped payloads, **When** the request is processed, **Then** only allowlisted fields are persisted and forbidden payload classes are rejected or redacted.

---

### User Story 5 - Handoff To Operator UX And Harness Work (Priority: P3)

As a future SPEC-013D or SPEC-014C implementer, I need SPEC-013C to expose a stable backend contract and adoption boundary so UI controls and first real harness operation do not recompute claim state or invent retry semantics.

**Why this priority**: The user explicitly identified API-only controls as an incomplete operator experience. SPEC-013C must enable, not replace, the SPEC-013D UI slice.

**Independent Test**: Can be tested by reviewing the API/read-model contract, PR packet, and UAT evidence to confirm SPEC-013D is named as the operator UX follow-up and SPEC-014C remains blocked from operational adoption until SPEC-013D and SPEC-014B are complete.

**Acceptance Scenarios**:

1. **Given** SPEC-013C is implemented, **When** a SPEC-013D client reads claim-control debug state, **Then** it can render eligibility and feedback from the backend response without recomputing scheduler state.
2. **Given** the SPEC-013C PR packet is reviewed, **When** reviewers inspect scope and non-goals, **Then** the packet explicitly states that operator UI adoption remains blocked on SPEC-013D.

### Edge Cases

- Active claim disappears between read and mutation.
- Retry is requested while backoff is still active.
- Retry override is requested without an explicit reason.
- Release is requested for a stage with no active claim.
- Cancel is requested for an already-cancelled or terminal stage.
- Two operators submit different actions for the same stage at the same time.
- A scheduler tick and an operator action race against the same claim.
- An idempotency key is reused with a different action or payload.
- Unauthorized, non-admin, or non-operator callers attempt mutation.
- Diagnostic input contains raw prompt text, transcripts, auth headers, provider payloads, GitHub issue bodies, tokens, or secret-shaped strings.
- Feature flag is off for the target context.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose an authenticated backend action surface for `retry`, `release`, and `cancel` against a claimed or explicitly retry-eligible task stage.
- **FR-002**: System MUST require admin/operator-equivalent authorization for every mutation action.
- **FR-003**: System MUST reject mutation actions when `FEATURE_TASK_CONTROL_PLANE` is disabled for the target context.
- **FR-004**: System MUST keep `retry`, `release`, and `cancel` as distinct action and outcome semantics.
- **FR-005**: System MUST allow `release` only when active ownership can be cleared from a currently claimed stage.
- **FR-006**: System MUST allow `cancel` only for an active or explicitly cancellable stage, and cancellation MUST stop automatic pickup until a later explicit retry.
- **FR-007**: System MUST ensure `cancel` does not mark the whole task `failed` or `done`.
- **FR-008**: System MUST allow `retry` only for active claims or explicitly retry-eligible failed, stuck, deferred, or cancelled stage outcomes.
- **FR-009**: System MUST preserve existing tracker truth, GitHub sync/reconciliation behavior, task-chain successor rules, and governance gates.
- **FR-010**: System MUST respect stored backoff by default when retry is requested.
- **FR-011**: System MUST allow a retry backoff override only when the request includes actor identity and an explicit operator reason.
- **FR-012**: System MUST provide idempotent mutation behavior using request identity and current-state validation.
- **FR-013**: System MUST return clear bounded outcomes for already-applied requests, stale state, conflicts, unavailable actions, and successful actions.
- **FR-014**: System MUST prevent repeated clicks or retried requests from double-mutating state or double-writing audit evidence.
- **FR-015**: System MUST emit bounded allowlisted audit evidence for every successful mutation and every meaningful rejected mutation outcome.
- **FR-016**: Audit/debug evidence MUST include action type, actor, task/stage/claim/attempt identifiers when available, previous/new state, backoff decision, override reason when present, request correlation, and sanitized error category.
- **FR-017**: Audit/debug evidence MUST NOT persist raw prompts, transcripts, provider payloads, auth headers, GitHub bodies, token data, or secret-shaped values.
- **FR-018**: System MUST extend the existing claim-reconciliation read model with action eligibility, available actions, unavailable reasons, backoff state, last operator action, and last sanitized error.
- **FR-019**: System MUST provide a mutation response envelope that is sufficient for API-and-audit UAT without requiring manual database inspection as the primary acceptance path.
- **FR-020**: System MUST document that SPEC-013D owns in-app operator controls and that SPEC-013C is not complete operator UX.
- **FR-021**: System MUST NOT add an in-app operator UI, CLI/MCP action surface, new dashboard, sandbox lifecycle, adapter registry, harness execution, direct GitHub mutation, successor selection, or task creation behavior.
- **FR-022**: System MUST keep any required persistence data-preserving and rollback-documented; M79 MAY widen the existing claim release-reason constraint for closed operator reasons and MAY add scoped idempotency storage only if planning proves existing claim, attempt, and activity evidence cannot enforce replay safely.
- **FR-023**: System MUST add only closed operator release reasons and outcome values, and MUST preserve SPEC-013B terminal task, terminal GitHub, governance, stale recovery, and boundary release semantics.
- **FR-024**: System MUST treat terminal task states and terminal GitHub issue/PR states as non-retryable, except that existing reconciliation may still release active claims using SPEC-013B terminal reasons.
- **FR-025**: System MUST expose mutation actions through `POST /api/tasks/[id]/claim-control` and MUST NOT add additional retry/release/cancel mutation routes in SPEC-013C.
- **FR-026**: Mutation request bodies MUST include `action`, `stage_key`, and expected state predicates sufficient to compare the caller's last-seen claim, attempt, run, and retry-eligible evidence with current state.
- **FR-027**: Mutation response bodies MUST use `schema_version: "task_claim_control.v1"` and include task/stage, action, outcome, current claim/attempt, backoff, available-actions, audit, idempotency, correlation, and sanitized diagnostics fields.
- **FR-028**: Every mutation request MUST require an `Idempotency-Key` header scoped to actor, route/action/task/stage target, and canonical parsed request body.
- **FR-029**: Same-key same-body mutation replays MUST return a stable original successful response without rerunning the side effect; same-key different-body requests MUST be rejected as `idempotency_key_body_mismatch`.
- **FR-030**: A new-key request MAY return `already_applied` only when current state proves the same requested operator action has already been applied to the same claim or attempt target.
- **FR-031**: Plan MUST provide durable response replay storage for claim-control idempotency by adding a small scoped idempotency record or a safely scoped shared store; activity rows alone MUST NOT be treated as sufficient replay storage.
- **FR-032**: Mutation writes MUST execute as single transaction compare-and-set transitions and MUST return stale-state or conflict outcomes without partial mutation when expected claim, attempt, run, cancellation, backoff, or scheduler state no longer matches.
- **FR-033**: Mutation authorization MUST use the existing operator role hierarchy so operators and admins can mutate while viewers remain read-only.
- **FR-034**: Actor identity for audit and authorization MUST come from the authenticated request context and MUST NOT be accepted from request body fields.
- **FR-035**: Successful mutations and authenticated task-visible semantic rejections MUST write exactly one bounded task-scoped claim-control activity; unauthenticated, forbidden-role, invisible-task, malformed-body, and rate-limited requests MUST NOT write claim-control task audit rows.
- **FR-036**: Claim-control audit payloads MUST use a positive allowlist of bounded state, actor, idempotency hash, backoff, override, correlation, outcome, validation, redaction, and HTTP status fields.
- **FR-037**: Raw idempotency keys, raw request bodies, raw error text, user-supplied actor fields, prompts, transcripts, provider payloads, auth headers, GitHub bodies, token data, and secret-shaped values MUST NOT be persisted in claim-control audit or debug evidence.
- **FR-038**: Persisted audit/debug strings MUST be trimmed, length-bounded, and secret-scanned; detector failures or unsafe payloads MUST fail closed without applying claim-control mutations.
- **FR-039**: Sanitized error categories MUST use a closed vocabulary sufficient to distinguish auth, feature flag, validation, idempotency, payload safety, not-found, not-eligible, stale, conflict, backoff, rate-limit, redaction, idempotency-storage, and unexpected internal failures.
- **FR-040**: The claim-control debug surface MUST extend the existing `task_claim_reconciliation.v1` envelope backward-compatibly with optional `claim_control` fields rather than introducing a separate SPEC-013C read route.
- **FR-041**: The `claim_control` read model MUST expose authorization, available actions, retry eligibility, backoff, last operator action, last sanitized error, and expected-state data for SPEC-013D.
- **FR-042**: Available-action descriptors MUST expose enabled/disabled state and closed unavailable reasons for `retry`, `release`, and `cancel` without exposing mutation URLs or raw diagnostics.
- **FR-043**: The read model MUST expose the exact expected-state predicates a client must echo to the mutation endpoint and SPEC-013D MUST use those fields instead of recomputing claim-control state client-side.
- **FR-044**: The read model MUST distinguish retry unavailability from retry accepted with active backoff, including next retry timing and override requirements.
- **FR-045**: Last operator action and last sanitized error fields MUST be derived only from bounded persisted SPEC-013C evidence and MUST NOT expose raw error text, raw idempotency keys, raw request bodies, or broad diagnostics.
- **FR-046**: The extended read model MUST remain side-effect-free and MUST NOT acquire/release claims, append attempt events, write activities, trigger GitHub sync, call scheduler or dispatch, or fetch live GitHub state.
- **FR-047**: PR, docs, and UAT evidence MUST state that SPEC-013C is backend API/debug authority only, that in-app operator adoption remains blocked on SPEC-013D, and that first real harness operation remains blocked on SPEC-013D plus SPEC-014B.
- **FR-048**: Post-merge target UAT MUST use a disposable workspace or product-line scope with `FEATURE_TASK_CONTROL_PLANE=true` set through workspace feature flags only.
- **FR-049**: UAT fixtures MUST cover release, cancel, retry without active backoff, retry with active backoff respected, retry with override, idempotency replay, idempotency body mismatch, stale/conflict, unauthorized/viewer rejection, feature-flag-off rejection, and read-model reflection.
- **FR-050**: UAT acceptance MUST rely primarily on authenticated API responses, read-model responses, and bounded audit evidence; manual database inspection MAY support row references and cleanup counts but MUST NOT be the primary acceptance path.
- **FR-051**: UAT evidence packets MUST record replay identity, target deployment, deployed commit, operator/timestamp, flag scope, task/stage/claim/attempt identifiers, route/status/outcome, read-model before/after summaries, audit references, idempotency hashes, backoff fields, override reason, sanitized error category, and redaction flags.
- **FR-052**: UAT evidence MUST prove same-key replay creates no duplicate mutation or duplicate audit row and MUST prove forbidden payload classes are absent from responses, activities, retained logs, and checked-in evidence.
- **FR-053**: UAT cleanup MUST use unique `spec013c-uat-*` markers, disable or remove the target feature flag scope, and record before/after residue counts for disposable workspace, project, task, claim, attempt, idempotency, and activity rows.
- **FR-054**: UAT rollback MUST be flag-first and, if a migration is added, MUST record migration id, rollback SQL path, backup path, and whether rollback was exercised or documented.
- **FR-055**: UAT closeout MUST record SPEC-013D as the operator UX adoption blocker and SPEC-014C as blocked until SPEC-013D and SPEC-014B are complete.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Reviewability Budget *(mandatory)*

- **Primary surface**: API
- **Secondary surfaces, if any**: scheduler/runtime read-model integration, audit/evidence, schema/migration only if Plan proves idempotency storage is necessary, docs/process
- **Projected reviewable LOC**: 800-1600 excluding generated OpenAPI/API index deltas and generated SpecKit artifacts
- **Projected production files**: 4-8
- **Projected total files**: 12-24 including tests, contracts, quickstart, and SpecKit artifacts
- **Budget result**: transition exception
- **Split decision**: SPEC-013C remains one backend control contract because retry, release, cancel, idempotency, audit, and the debug read model must agree transactionally. The operator UX gap is split to SPEC-013D and must not enter this spec.

### PR Review Packet Requirements *(mandatory)*

- PR description MUST include: what changed, why, non-goals, review order, scope budget, traceability, verification evidence, known gaps, rollback or feature-flag notes, and SPEC-013D as the operator UX follow-up.
- Traceability MUST map each major requirement or success criterion to changed files and verification evidence.
- Deferred work MUST name SPEC-013D for operator UI adoption and must not imply API-only controls are complete operator experience.
- PR packet MUST explain any transition exception, M79 release-reason constraint expansion, and idempotency persistence decision.

### Key Entities *(include if feature involves data)*

- **Claim-Control Action**: An operator-requested `retry`, `release`, or `cancel` command with actor, request identity, target stage, optional expected state, and optional override reason.
- **Claimed Stage**: A GitHub-linked assigned task stage with claim, attempt, task, and reconciliation evidence inherited from SPEC-013B.
- **Backoff Decision**: The system decision to respect stored retry delay, deny immediate retry, or apply an explicit audited override.
- **Operator Action Evidence**: Bounded audit/debug event that records action, state transition, actor, request identity, and sanitized outcome without raw diagnostic payloads.
- **Claim-Control Read Model**: The extended claim-reconciliation response that exposes eligibility, available actions, unavailable reasons, backoff, last operator action, and sanitized error state for SPEC-013D.
- **Idempotency Record**: The durable or derived evidence used to return stable responses for repeated requests without duplicating mutation or audit effects.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With `FEATURE_TASK_CONTROL_PLANE=false`, mutation actions are unavailable and existing scheduler/dispatch/read-only behavior remains unchanged.
- **SC-002**: With `FEATURE_TASK_CONTROL_PLANE=true`, authorized admin/operator callers can successfully perform retry, release, and cancel in controlled eligible fixtures.
- **SC-003**: 100% of retry, release, and cancel mutation outcomes produce bounded audit/debug evidence with no forbidden payload classes persisted.
- **SC-004**: Repeated requests with the same idempotency key return stable responses and do not create duplicate state transitions or duplicate audit rows.
- **SC-005**: Stale operator views and scheduler/action races return bounded stale-state or conflict outcomes without partial mutation.
- **SC-006**: Retry respects active backoff unless an explicit actor/reason override is provided and recorded.
- **SC-007**: Cancel prevents automatic pickup until explicit retry and never marks the whole task `failed` or `done`.
- **SC-008**: The claim-reconciliation read model exposes enough eligibility/debug state for SPEC-013D to render controls without recomputing claim state.
- **SC-009**: Scope guards or review evidence prove no UI controls, CLI/MCP action surface, new dashboard, sandbox, adapter, harness execution, direct GitHub mutation, successor selection, or task creation entered SPEC-013C.
- **SC-010**: Post-merge target UAT proves API-and-audit behavior for retry, release, cancel, backoff override, idempotency replay, stale/conflict state, and unauthorized access, and records SPEC-013D as the operator UX adoption blocker.

## Assumptions

- SPEC-013B claim/reconciliation state, claim uniqueness, terminal release, and read-only evidence are already complete and remain authoritative.
- Existing auth/session helpers can identify admin/operator-equivalent callers; Clarify/Plan must choose the exact helper.
- Existing claim, attempt, and activity evidence will be reused where safe; M79 release-reason constraint expansion and scoped idempotency storage are allowed only because Plan proves they are necessary for operator reasons and stable response replay.
- The action target is a single task stage, not the entire task or GitHub issue.
- GitHub issue truth remains owned by existing sync/reconciliation paths.
- SPEC-013D will provide in-app task-detail/evidence controls after this backend contract exists.
- SPEC-014C first real harness operation waits for SPEC-013D and SPEC-014B.
