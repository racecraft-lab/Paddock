# Feature Specification: SPEC-013D Claim-Control Operator UX

**Feature Branch**: `013d-claim-control-operator-ux`  
**Created**: 2026-05-30  
**Status**: Completed
**Input**: User description: "SPEC-013D makes the SPEC-013C retry, release, cancel, backoff, idempotency, and debug authority usable from the existing task detail experience without changing backend semantics."

## Clarifications

### Session 1 - UX, Copy, and Interaction States (2026-05-30)

- The task detail remains the owner of claim-control loading and refresh orchestration; the `Claim control` surface may be implemented as a small bounded section component, but it must stay inside the existing Details tab rather than becoming a new tab, dashboard, or run-state data-model extension.
- Operator-facing labels, confirmations, receipts, and errors use a closed local copy map keyed by the SPEC-013C action, outcome, and error vocabularies. UI text shows a human-readable label first and may show a bounded closed code second; it must not humanize arbitrary backend strings or expose raw diagnostics.
- Action labels use the following accepted nouns and commands unless planning finds an accessibility issue: `Claim control`, `Retry stage`, `Release claim`, `Cancel stage`, `Cancel reason`, `Override reason`, and optional `Release reason`.
- Inline confirmations move focus to the confirmation heading or first required reason field. Final receipts receive focus after refresh. Loading and success receipts are polite status updates; validation, conflict, and network failures are alert-style messages.
- Disabled actions remain visible as real disabled controls with associated reason text. They must not appear broken or imply the client recomputed eligibility.
- Real Playwright evidence must use authenticated app flows, disposable task fixtures, deterministic claim/backoff/idempotency rows, restored feature flags, after-test cleanup, JSON fixture evidence, and before/confirm/after screenshots. Storybook states are supplemental visual review states only.
- Recovery consensus accepted the same-submission idempotency lifecycle: after a network failure the UI may retry the exact same task, action, stage, expected state, and request body with the same in-memory key; every completed response, changed body, changed expected state, task change, close, cancel, or new operator decision clears the key. Raw keys are never stored, rendered, or written to evidence.

### Session 2 - Route Contracts and State Refresh (2026-05-30)

- The UI consumes only these claim-reconciliation fields for claim-control behavior: `schema_version`, `task.id`, `task.workspace_id`, `task.status`, `task.stage_key`, `feature_flag`, and `claim_control.stage_key`, `authorization`, `available_actions`, `retry_eligibility`, `backoff`, `expected_state`, `last_operator_action`, and `last_sanitized_error`.
- The UI must treat `claim_control.available_actions[]` as the sole action list and must not synthesize extra retry, release, or cancel availability from evidence, attempts, task status, or local role checks. Local checks may only suppress impossible client submissions such as missing required reason text.
- Each mutation request uses `POST /api/tasks/[id]/claim-control` with `Idempotency-Key` and a JSON body containing `action`, `stage_key`, `expected`, `override_backoff`, `override_reason`, `reason`, and `client_correlation_id`. The `expected` object is copied from the latest read model for the selected stage.
- Default request behavior is `override_backoff=false`, `override_reason=null`, and a bounded generated `client_correlation_id`. Retry backoff override sets `override_backoff=true` only after the operator supplies the required override reason. Cancel requires a bounded `reason`; release may send the operator reason or the accepted default reason.
- After any server response with a bounded claim-control envelope or claim-control error envelope, the task detail refreshes claim reconciliation before updating final availability. Success, already-applied, stale/conflict, not-eligible, feature-flag-off, authorization, validation, and idempotent replay responses also refresh evidence, stage attempts, and task-list item state when those surfaces are currently loaded.
- Pure client-side validation failures do not call the mutation route and therefore do not refresh server state. Network failures show the same-submission retry option from Session 1 and defer server refresh until the retry succeeds, returns a bounded response, or the operator abandons the attempt.

### Session 3 - Fixtures, Accessibility, and Visual Evidence (2026-05-30)

- The Playwright acceptance journey uses a real authenticated app flow in a serial SPEC-013D suite with disposable fixture markers prefixed `spec013d-claim-control-*`. App/API creation is preferred for tasks; direct database seeding is limited to SPEC-013B/C claim, stage-attempt, idempotency, activity, and workspace feature-flag rows needed to create deterministic backend states.
- Fixture states are bounded to active claim enabled, disabled or ineligible actions, backoff override required, stale/conflict receipt, viewer read-only, feature-flag off, loading, and backend-error states. Each fixture records cleanup scope, row identifiers, and a non-secret fixture hash in JSON evidence.
- Required Playwright screenshot artifacts are `spec013d-claim-control-before-active.png`, `spec013d-claim-control-confirm-retry.png`, `spec013d-claim-control-after-retry.png`, `spec013d-claim-control-disabled-reasons.png`, `spec013d-claim-control-backoff-override.png`, `spec013d-claim-control-stale-conflict.png`, `spec013d-claim-control-viewer-read-only.png`, and `spec013d-claim-control-flag-off.png`.
- The test must restore feature flags and remove disposable tasks, claim rows, stage-attempt rows, idempotency rows, activities, and fixture evidence rows in `afterAll`, then retain cleanup proof in the JSON fixture evidence. Evidence must never include raw idempotency keys, auth headers, raw request bodies, prompts, transcripts, provider payloads, tokens, or GitHub bodies.
- The Claim control section is exposed as a named region inside the existing Details tab. Loading and success updates use polite status semantics; validation, conflict, and network-failure feedback use alert semantics; keyboard-only flows can open confirmation, reach required reason fields, submit, and land focus on the final receipt.
- Storybook states are supplemental component review states in `src/components/panels/claim-control-section.stories.tsx` or the nearest established task-detail story location. They cover enabled active claim, disabled viewer, backoff override required, stale/conflict receipt, flag-off, loading, and error without backend mutation.
- Visual evidence uses the existing `captureVisualSnapshot` helper for the primary before/after states and key disabled, backoff, conflict, viewer, and flag-off variants. CI/Argos artifacts are preferred over committed binary screenshots unless the archive policy exception is explicitly recorded.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect Claim-Control State (Priority: P1)

An operator opens an existing task detail and can immediately understand the current claimed-stage state, the stage affected by claim control, which actions are available, which actions are blocked, why they are blocked, any retry backoff, the most recent operator action, and sanitized error context.

**Why this priority**: Operators cannot safely recover claimed stages until they can see authoritative claim-control state without terminal or API knowledge.

**Independent Test**: A real Playwright task-detail journey opens the Details tab for a task with claim-control data and captures before-state screenshots proving the section is visible near Evidence and Run state, renders enabled and disabled action states, and shows backend-provided reasons without exposing raw diagnostics.

**Acceptance Scenarios**:

1. **Given** a task-visible operator opens a task whose reconciliation response contains `claim_control`, **When** the Details tab is shown, **Then** a `Claim control` section appears near Evidence and Run state with the current stage key, claim status, available actions, unavailable actions, unavailable reasons, retry backoff where present, last operator action, and sanitized error category where present.
2. **Given** the backend marks an action unavailable, **When** the operator reviews the section, **Then** the action remains visible as disabled and displays the backend-provided unavailable reason.
3. **Given** a task has no `claim_control` state, **When** the Details tab loads, **Then** no noisy empty claim-control controls appear unless the backend explicitly returns disabled or debug state.

---

### User Story 2 - Confirm And Submit Eligible Actions (Priority: P2)

An operator can retry, release, or cancel an eligible claimed stage from the task detail through inline confirmation, then inspect a compact outcome receipt alongside refreshed task evidence.

**Why this priority**: Claim recovery must be usable without leaving the task detail, while preserving the existing backend authority and audit trail.

**Independent Test**: A real Playwright task-detail journey covers enabled retry, release, and cancel controls, captures confirm and after-state screenshots, and verifies refreshed claim-control, evidence, run-state, and task-list signals after success, stale/conflict, and idempotent replay outcomes.

**Acceptance Scenarios**:

1. **Given** an operator can mutate a stage and retry is available, **When** the operator chooses retry and confirms the inline prompt, **Then** the request is submitted with the backend expected-state predicate and the section shows a bounded retry outcome receipt.
2. **Given** an operator can mutate a stage and release is available, **When** the operator confirms release with no custom reason, **Then** the request uses the default release reason and the receipt identifies the action, stage key, backend outcome, refreshed availability, and audit or activity reference when present.
3. **Given** an operator can mutate a stage and cancel is available, **When** the operator enters a bounded cancel reason and confirms, **Then** the request is accepted only with that reason and the receipt shows the sanitized cancel outcome.
4. **Given** the backend returns a stale, conflict, or idempotent replay outcome, **When** the task detail refresh completes, **Then** the receipt identifies the outcome and replay status where present, and the section shows refreshed action availability rather than stale client assumptions.

---

### User Story 3 - Override Retry Backoff With Reason (Priority: P3)

An operator can see active retry backoff and, when the backend allows override, enter a bounded override reason before confirming retry.

**Why this priority**: Urgent recovery sometimes requires action before retry backoff expires, but the audit trail must capture operator intent.

**Independent Test**: A real Playwright task-detail journey opens a task with active backoff, verifies retry is disabled by default, enters an override reason, captures the confirmation state, and verifies the refreshed receipt after submission.

**Acceptance Scenarios**:

1. **Given** retry is blocked by active backoff, **When** the operator views the Claim control section, **Then** retry is disabled by default with the backend-provided backoff time and reason.
2. **Given** the backend exposes a backoff override path, **When** the operator enters a bounded override reason, **Then** the inline retry confirmation becomes available and the submitted action includes the override reason.

---

### User Story 4 - Understand Read-Only Access (Priority: P4)

A viewer or read-only user can inspect the claim-control state for a task they can see, but cannot mutate scheduler state.

**Why this priority**: Read-only users need to understand why actions are unavailable without being given recovery authority.

**Independent Test**: A real Playwright task-detail journey opens the same claim-control task as a viewer, captures the read-only screenshot state, and verifies that every mutation control remains disabled with backend-provided authorization reasons.

**Acceptance Scenarios**:

1. **Given** a viewer opens a task whose reconciliation response contains `claim_control`, **When** the Details tab renders, **Then** the section shows the claim-control state and unavailable reasons without enabling retry, release, cancel, or backoff override.
2. **Given** the backend reports `authorization.can_mutate=false`, **When** a viewer inspects disabled actions, **Then** the section uses backend-provided authorization reasons and does not infer permissions on the client.

---

### User Story 5 - Review Stable Visual States (Priority: P5)

A maintainer can verify the operator journey through real browser evidence and stable visual states that cover normal, disabled, backoff, stale/conflict, viewer, flag-off, loading, and error states.

**Why this priority**: The primary review surface is UI, so reviewers need durable visual evidence before SPEC-014C depends on this gate.

**Independent Test**: Playwright provides the acceptance evidence for the running app, while Storybook visual states provide stable component review for states that do not require a running backend.

**Acceptance Scenarios**:

1. **Given** SPEC-013D UI changes are ready for review, **When** the browser journey runs, **Then** screenshots exist for before, confirmation, and after states across enabled, disabled, backoff override, stale/conflict, viewer, and flag-off behavior.
2. **Given** a reviewer opens the visual component states, **When** they inspect the Claim control section, **Then** enabled active claim, disabled viewer, backoff override required, stale/conflict receipt, flag-off, loading, and error states are represented without requiring backend mutation.

### Edge Cases

- The claim-control read model is absent for a task that otherwise has evidence and run-state data.
- The backend returns feature-flag-disabled state with an explicit reason.
- The operator opens a task with stale claim-control data and the backend rejects the mutation because expected state no longer matches.
- A network failure happens after the operator confirms a mutation but before the client receives a response, leaving one same-submission retry path available.
- The same failed network submission is retried immediately and must reuse the in-flight idempotency key and identical request body.
- A subsequent operator decision, changed request body, changed expected state, task change, close, cancel, or completed response must clear the prior idempotency key.
- The backend returns an idempotent replay instead of performing a second mutation.
- The operator enters an overlong, empty, or otherwise invalid cancel or backoff override reason.
- The backend returns sanitized error categories without raw request, diagnostics, prompt, transcript, provider, token, auth header, or GitHub body content.
- Refresh after mutation succeeds for some task-detail surfaces before others.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The task detail Details tab MUST include a dedicated `Claim control` section near the existing Evidence and Run state sections when claim-control state is present or explicit backend disabled/debug state is returned.
- **FR-002**: The section MUST render from the backend `claim_control` read model returned by `GET /api/tasks/[id]/claim-reconciliation`; it MUST NOT derive retry, release, cancel, authorization, expected-state, backoff, or unavailable-reason eligibility from task, activity, evidence, stage-attempt, board, or client state.
- **FR-003**: The section MUST remain quiet when `claim_control` is absent, except that explicit backend disabled/debug state MUST be shown as a compact disabled state with the backend reason.
- **FR-004**: The section MUST show all backend-described retry, release, and cancel actions, including disabled actions, with backend-provided unavailable reasons.
- **FR-005**: The section MUST show claim-stage context sufficient for an operator to identify the affected stage, current claim state, backoff state where present, last operator action where present, and sanitized error category where present.
- **FR-006**: The section MUST enable mutation controls only when the backend read model reports that the current user can mutate the stage.
- **FR-007**: Read-only users MUST be able to inspect backend-provided claim-control state and unavailable reasons without any enabled mutation path.
- **FR-008**: Retry, release, cancel, and backoff override confirmations MUST use inline confirmation states inside the Claim control section; browser-native confirmations and nested modals are out of scope. Confirmation focus MUST move to the confirmation heading or first required reason field.
- **FR-009**: Claim-control submissions MUST use the existing `POST /api/tasks/[id]/claim-control` backend authority with an idempotency key, backend expected-state predicate, action, stage key, bounded reason fields, and optional backoff override when requested.
- **FR-010**: A fresh idempotency key MUST be generated for each confirmation attempt, retained only in memory while that request is in flight, and reused only for an immediate retry of the same failed network submission with the same task, action, stage, expected state, and request body.
- **FR-011**: Raw idempotency keys MUST NOT be displayed, persisted, or included in operator-facing receipts.
- **FR-012**: Cancel MUST require a bounded operator reason before confirmation can be submitted.
- **FR-013**: Backoff override MUST require a bounded operator reason before confirmation can be submitted.
- **FR-014**: Release MUST allow an optional operator reason and MUST provide a short default reason when the operator leaves it blank.
- **FR-015**: When retry is blocked by active backoff, retry MUST remain disabled by default with the backend-provided backoff time and reason, and an override path MUST be available only when the backend exposes it.
- **FR-016**: After success, stale/conflict, and idempotent replay outcomes, the task detail MUST refresh claim reconciliation, task evidence, stage attempts, and the task list item before presenting the final refreshed availability.
- **FR-017**: Each completed submission attempt MUST produce a compact inline receipt that includes action, backend outcome, stage key, refreshed availability, audit or activity reference when present, idempotency replay status when present, and sanitized error category when present. Receipt copy MUST come from the closed action, outcome, and error vocabulary rather than arbitrary backend strings.
- **FR-018**: Error and conflict feedback MUST remain bounded to operator-safe categories and MUST NOT expose raw request bodies, raw diagnostics, prompts, transcripts, provider payloads, tokens, authorization headers, GitHub bodies, or raw backend internals.
- **FR-019**: Loading, refresh, network-failure, stale/conflict, feature-flag-off, absent-state, and backend-error states MUST be explicit enough for operators to understand whether an action is pending, blocked, replayed, or unavailable. Loading and success messages MUST be perceivable as status updates; validation, conflict, and network-failure messages MUST be perceivable as alerts.
- **FR-020**: SPEC-013D MUST preserve SPEC-013C backend semantics and MUST NOT add or change retry, release, cancel, backoff, claim, scheduler, idempotency, or debug authority behavior.
- **FR-021**: SPEC-013D MUST NOT add a new migration, backend route, dashboard, CLI or MCP action, sandbox lifecycle behavior, adapter registry, harness execution path, direct GitHub mutation, successor selection, scheduler launch, or whole-task terminal mutation.
- **FR-022**: User-facing UI changes MUST be verified by a real Playwright task-detail journey with screenshots for enabled release/cancel/retry, disabled/ineligible reasons, backoff override reason entry, stale/conflict refresh, viewer read-only state, and feature-flag-off behavior. The journey MUST authenticate through the app, seed deterministic disposable data, restore feature flags, clean up residue, and retain fixture evidence.
- **FR-023**: Stable Storybook states MUST cover enabled active claim, disabled viewer, backoff override required, stale/conflict receipt, flag-off, loading, and error states for the Claim control section.
- **FR-024**: The Claim control section MUST be exposed as a named region; loading and successful refresh updates MUST be announced through status semantics; validation, conflict, and network-failure feedback MUST be announced through alert semantics; keyboard-only users MUST be able to reach confirmation controls, required reason fields, submission controls, and final receipts.
- **FR-025**: Playwright fixture evidence MUST record the `spec013d-claim-control-*` fixture marker, disposable task identifiers, seeded SPEC-013B/C row identifiers or counts, feature-flag restoration, cleanup proof, required screenshot artifact names, and visual snapshot manifest entries without recording raw idempotency keys or unsafe diagnostic payloads.

### Spec Evidence And Archive Policy

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities

- **Claim Control State**: Authoritative backend state for a task's claimed stage, including action availability, authorization, backoff, expected-state predicate, unavailable reasons, last operator action, and sanitized error category.
- **Available Action Descriptor**: Backend-provided description of retry, release, or cancel availability, including whether the control is enabled and why it is unavailable when disabled.
- **Expected State Predicate**: Backend-provided predicate submitted with a mutation so stale or conflicting client views can be rejected without client-side recomputation.
- **Operator Reason**: Bounded operator-entered justification used for cancel and backoff override, and optionally for release.
- **Idempotency Attempt**: A single confirmation attempt with an ephemeral idempotency key that may be reused only for immediate retry of the same failed network submission.
- **Outcome Receipt**: Compact operator-facing result after submission, including action, outcome, stage key, refreshed availability, audit or activity reference, replay status, and sanitized error category.
- **Refresh Set**: The task-detail surfaces that must be refreshed after claim-control outcomes: claim reconciliation, task evidence, stage attempts, and the task list item.
- **Visual Review State**: A stable review state for the Claim control section, including enabled, disabled, backoff, stale/conflict, flag-off, loading, error, and read-only viewer variants.
- **Fixture Evidence Manifest**: JSON evidence produced by the Playwright journey that identifies disposable fixture scope, cleanup proof, screenshot names, and visual snapshot entries without exposing secrets or raw backend internals.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of trained operators reviewing a claimed task can identify the affected stage, available action, unavailable reason, and retry backoff status within 30 seconds without terminal or API access.
- **SC-002**: Operators can complete an eligible retry, release, or cancel action from task detail in under 60 seconds, including inline confirmation and review of the outcome receipt.
- **SC-003**: 100% of successful, stale/conflict, and idempotent replay outcomes shown in the UI include refreshed action availability and a bounded receipt with no raw request, idempotency key, or diagnostic payload exposure.
- **SC-004**: 100% of read-only claim-control journeys keep mutation controls disabled while still showing the backend-provided reason the user cannot act.
- **SC-005**: The real browser acceptance journey covers every required operator state: enabled release/cancel/retry, disabled/ineligible reasons, backoff override reason entry, stale/conflict refresh, viewer read-only state, and feature-flag-off behavior.
- **SC-006**: Stable visual review states cover enabled active claim, disabled viewer, backoff override required, stale/conflict receipt, flag-off, loading, and error variants before the feature is considered ready for implementation review.
- **SC-007**: In flag-off or absent-state tasks, operators see no actionable controls and no noisy empty section unless the backend explicitly provides disabled/debug state.
- **SC-008**: The Playwright evidence manifest proves fixture cleanup, feature-flag restoration, required screenshot capture, and keyboard/live-region coverage before implementation review begins.

## Assumptions

- SPEC-013C backend retry, release, cancel, backoff, idempotency, and debug contracts are already authoritative and remain unchanged by this feature.
- Existing task detail users already have task visibility determined before the Details tab renders.
- The backend read model provides all user-facing availability, authorization, unavailable reason, expected-state, backoff, replay, audit/activity, and sanitized error fields needed by the UI.
- Bounded reason length and validation categories follow the existing backend contract; the UI only prevents obviously empty or invalid required reason submissions before sending.
- The existing task detail experience already has Evidence and Run state surfaces that can be refreshed after claim-control outcomes.
- Generated screenshots are CI/Argos artifacts by default; committed binary screenshots require the archive policy exception path.
- Storybook states supplement visual review and do not replace the real browser acceptance journey.
