# Feature Specification: Production Triage Outcome Routing

**Feature Branch**: `009f-production-triage-routing`
**Created**: 2026-05-21
**Status**: Completed
**Input**: User description: "Route non-remediation Issue Triage outcomes into production-visible recommendation lanes with typed artifacts and task-local Evidence display, without Issue Remediation entry or live side effects."

## Clarifications

### Session 2026-05-21 - Lane Payload Contracts

- Q: Should SPEC-009F use a common typed lane payload envelope with distinct lane artifact types? A: Yes. Use one common envelope with `schema_version: "spec-009f.triage_routing.v1"` and distinct `artifact_type` values: `triage_speckit_handoff`, `triage_clarification_request`, `triage_specialist_recommendation`, and `triage_closure_recommendation`. Common fields are `source_task_id`, `workspace_id`, `source_issue`, `disposition`, `lane`, `routing_status`, `triage_rationale`, `recommended_next_action`, `proposed_labels`, `evidence_links`, `deferred_side_effects`, and `produced_at`.
- Q: What exact lane-specific fields should be required beyond the common envelope? A: `NEEDS_SPEC` requires `proposed_scope`, `non_goals`, and `deferred_setup_action` with `automatic_setup: false`; `NEEDS_HUMAN` requires `blocking_questions`, `target_audience`, `evidence_needed`, and `no_external_message_sent: true`; `NEEDS_SPECIALIST` requires `specialist_state` as `recommended` or `unassigned`, with recommendation basis fields when recommended and missing-metadata plus owner-action fields when unassigned; closure recommendations require `closure_outcome` and outcome-specific duplicate, obsolete, or invalid evidence fields.
- Q: How should proposed GitHub labels be represented? A: Store `proposed_labels` as recommendation metadata only: `{ name, source, action: "recommend_add", applied: false }`, normalized by trim/lowercase/dedupe. Default lane examples may use `mc:needs-spec`, `mc:needs-human`, `mc:needs-specialist`, `mc:duplicate`, `mc:obsolete`, and `mc:invalid`, but SPEC-009F must not add them to the GitHub label map or apply them automatically.
- Q: How should raw triage rationale and evidence links be normalized/redacted before storage and display? A: Store normalized safe strings/references only. `triage_rationale`, `recommended_next_action`, closure rationales, blocking questions, and evidence-needed text are bounded plain text treated as untrusted display text; they must not persist raw issue bodies, terminal logs, credentials, tokens, cookies, passwords, signed URLs, storage URIs/object paths, raw secret values, parser internals, actor identity, or PII-bearing key/value material. Text normalization uses the limits in Security Normalization And Link Allowlist: NFC, trimmed whitespace, CRLF/CR normalized to LF, tabs to spaces, no persisted C0/C1 controls except bounded LF in multiline fields, and fail-closed over-limit handling. `evidence_links` are typed safe references such as `{ type, label, url?, artifact_id?, activity_id? }`; `url` is optional, query strings/fragments are stripped by default, and active links render only for the explicit allowlist of same-origin Mission Control task/artifact/activity references, `https://github.com/racecraft-lab/mission-control/issues/{number}`, `https://github.com/racecraft-lab/mission-control/pull/{number}`, and repo-local/static docs or SPEC-009F checklist paths. Raw artifact content goes through existing task artifact storage and secret detector/redaction behavior; unsafe or secret-bearing content is rejected by default or represented only through safe metadata/status. The `triage_routing` Evidence API and `Triage routing` UI display render stored strings as inert text and construct links only from allowlisted typed references.
- Q: Where should strict payload validation live? A: Add a focused pure helper near triage routing, such as `src/lib/triage-routing-payloads.ts`, with exported types, builders, and validators for SPEC-009F lane payloads. The routing helper calls it before artifact publishing; existing task artifact storage continues to own persistence, MIME/size limits, supersession, redaction, and secret scanning. No new runtime dependency or migration is planned.

### Session 2026-05-21 - Terminal State And Idempotency

- Q: What terminal source-task state and activity vocabulary should successful non-remediation routing use? A: Keep the source Issue Triage task `done`; write one SPEC-009F activity type `triage_routing_recorded` with description `Recorded terminal triage routing for <DISPOSITION>` and data fields `source_task_id`, `workspace_id`, `disposition`, `lane`, `routing_status: "recorded"`, `artifact_id`, `idempotency_key`, and optional `supersedes_artifact_id`.
- Q: What is the canonical idempotency key? A: Use `spec-009f.triage_routing.v1:{workspace_id}:{source_task_id}:{disposition}`. Do not include rationale, recommended action, labels, or artifact id in the key.
- Q: How should same-outcome repeat routing behave when payload content changes? A: If normalized payload content is unchanged, create no new artifact or activity. If payload content differs, publish a new routing artifact with `supersedes` set to the previous active artifact id, mark the prior artifact superseded through the existing artifact supersession mechanism, and write a new `triage_routing_recorded` activity referencing both artifact ids. Evidence shows only the newest non-superseded artifact as current and keeps superseded artifacts trace-only.
- Q: What if a repeat run attempts a different disposition outcome for the same completed source task? A: Reject it visibly. Once a non-unknown disposition is recorded for a completed source task, SPEC-009F supports only same-outcome retries. A changed disposition writes no terminal routing artifact for the attempted outcome and records a `triage_routing_conflict` activity with sanitized existing disposition, attempted disposition, and idempotency key.
- Q: What happens when persistence partially fails? A: If routing artifact publish fails, write `triage_routing_artifact_publish_failed` with sanitized error data and `routing_status: "failed"`, do not write `triage_routing_recorded`, and expose `triage_routing` as `incomplete` or `unavailable` until retry. If the artifact exists but the recorded activity is missing, retry backfills the missing activity without creating a duplicate active artifact.

### Session 2026-05-21 - Evidence API/UI Shape

- Q: Should SPEC-009F add a `triageRouting` or `triage_routing` section to task Evidence? A: The API field is required as snake_case `triage_routing` to match existing task Evidence JSON style; the operator-facing UI block label is `Triage routing`. The response object includes `state`, `routing_status`, `disposition`, `lane`, `artifact`, `activity_reference`, `idempotency_key`, `recommended_next_action`, `proposed_labels`, `deferred_side_effects`, `missing`, `warnings`, optional `lane_detail`, and `superseded_artifacts`.
- Q: What state vocabulary should `triage_routing` use? A: Use existing task Evidence `state` values: `missing`, `available`, `incomplete`, `unavailable`, and `superseded` for trace references only. Keep route-specific `routing_status` separate with `missing`, `recorded`, `failed`, or `conflict`. Use `deferred` only inside `deferred_side_effects`.
- Q: Where should Evidence derivation live? A: Add `buildTriageRoutingEvidence()` in or near `src/lib/task-evidence.ts`, backed by the SPEC-009F payload validators. The React component must not parse or validate raw payloads, and no separate API route is planned.
- Q: How should the current route be selected when multiple artifacts exist? A: Show the newest non-superseded, non-quarantined SPEC-009F routing artifact matching `schema_version: "spec-009f.triage_routing.v1"` and one of the four routing artifact types. Superseded artifacts remain trace-only; publish-failure activity maps to `incomplete` or `unavailable`.
- Q: What UI wording and accessibility contract should the task Evidence section use? A: Extend the existing Evidence section with one compact `Triage routing` block, preserving the existing `Task evidence` aria label, `Evidence` heading, `Loading evidence...`, and `Failed to load evidence` semantics. Use `No triage routing recorded.`, `Routing recorded`, `Triage routing incomplete`, `Triage routing unavailable`, `Superseded routing evidence`, `Specialist unassigned`, and `Deferred side effects` for display states. No action buttons are included in v1.
- Q: What keyboard and screen-reader behavior applies to the new `Triage routing` block? A: The block remains inside the existing `Task evidence` region and `Evidence` heading. Keyboard focus enters only allowlisted active links rendered from typed safe references; lane labels, routing statuses, recommended next actions, proposed labels, deferred side effects, missing/unassigned states, and superseded trace labels render as static read-only text and are not focusable controls. Screen-reader-accessible visible labels or descriptions must distinguish lane, routing status, artifact/activity references, recommended next action, proposed labels with `applied: false`, deferred side effects, missing/unassigned states, and superseded routing evidence without relying on color alone.

### Session 2026-05-21 - Specialist Matching And Rollout Scope

- Q: Which existing metadata may SPEC-009F use to recommend a specialist owner or lane? A: Use only deterministic Mission Control workspace metadata: source task/workspace, `projects.area_slug`, normalized `area:*` routing evidence, `project_agent_assignments`, and same-workspace `agents` rows. Do not infer specialist ownership from free-form issue title/body/rationale keywords, raw agent config/soul content, logs, or GitHub body text.
- Q: What minimum confidence is required for a `NEEDS_SPECIALIST` recommendation? A: Recommend only when exactly one safe lane and exactly one eligible same-workspace owner assignment resolve. Record `matching_confidence: "deterministic"` and `matching_basis` for recommendations. Use `specialist_state: "unassigned"` for missing area, multiple areas, missing assignment, missing same-workspace agent, disabled/inactive project, or ambiguous role mapping, with `missing_metadata` and `owner_action`.
- Q: Should SPEC-009F execute or create a specialist route successor/template task? A: No. Existing specialist workflow/template metadata may inform recommendation wording, but SPEC-009F must not execute, route to, or create `mission-control_specialist_route` or any other non-remediation successor in v1.
- Q: Is `PILOT_MISSION_CONTROL_E2E` sufficient rollout scope? A: Yes. No dedicated SPEC-009F feature flag is planned for v1. Gate routing under `resolveFlag("PILOT_MISSION_CONTROL_E2E")` and existing Mission Control source-task checks.
- Q: How does behavior remain absent/off for non-Mission-Control workflows? A: SPEC-009F routing requires all gates: `PILOT_MISSION_CONTROL_E2E` resolved true, source task template slug `mission-control_issue_triage`, GitHub repo `racecraft-lab/mission-control`, supported disposition, and existing disposition/artifact prerequisites. Otherwise the API returns only the normal missing route state and writes no SPEC-009F artifacts, activities, proposed labels, dispatches, or successors.

### Session 2026-05-21 - UAT And Regression Boundaries

- Q: What fixture matrix should SPEC-009F require? A: Use deterministic local/test database fixtures for all six supported dispositions: `NEEDS_SPEC`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `DUPLICATE`, `OBSOLETE`, and `INVALID`. Do not create or mutate live GitHub issues. Each fixture asserts typed routing artifact, `task_dispositions`, `triage_routing_recorded`, `done` source task, no Issue Remediation successor, and no non-remediation successor.
- Q: What counts as operator-readable Evidence inspection? A: Run a focused Playwright journey that opens `/tasks`, selects each seeded outcome task, verifies the `Task evidence` region and `Triage routing` block, asserts no mutation/action controls, and attaches six outcome region screenshots plus `spec-009f-triage-routing-fixture-export.json` under `test-results/spec-009f-triage-routing/`. Screenshot binaries are review artifacts and are not committed.
- Q: How are disposable fixture rows cleaned up? A: Fixture export records task ids, artifact/activity ids, feature-flag changes, retained repo identity if any, cleanup scope, and post-run counts. Cleanup deletes inserted artifacts, activities, tasks, reviews/sync rows, and flag overrides, then records zero counts. Durable proof is the checklist plus CI/test artifacts, not retained local rows.
- Q: What guardrails prove recommendation-only behavior? A: Behavioral tests assert no child tasks for all six non-remediation outcomes, unchanged `ACTIONABLE_REMEDIATION`, no GitHub mutation calls, proposed labels remaining metadata with `applied: false`, no workflow/template successor creation, and no claim/runner/sandbox/adapter/auto-merge tables or APIs touched. Add or adapt a SPEC-009F static/diff guard script to scan `origin/main...HEAD` for forbidden path/content drift.
- Q: Where is UAT evidence recorded? A: Add a `SPEC-009F Production Triage Routing UAT` section to `docs/qa/pilot-smoke-checklist.md` with command, branch/commit, fixture export path, six-outcome matrix, screenshot paths, cleanup counts, and explicit non-use of live GitHub, successor, claim, runner, sandbox, adapter, or auto-merge behavior.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Route Spec-Ready Triage Exits (Priority: P1)

An operator reviewing an Issue Triage task that ends in `NEEDS_SPEC` can see a complete SpecKit-ready handoff package on the completed triage task, including why spec work is recommended and what setup remains deferred.

**Why this priority**: `NEEDS_SPEC` is the primary non-remediation exit that would otherwise become a terminal dead end; it must preserve enough context for later spec work without starting that work automatically.

**Independent Test**: Can be fully tested by completing a triage task with `NEEDS_SPEC` and verifying that the completed source task has terminal routing evidence, no remediation successor, no external mutation, and a handoff artifact containing all required owner-facing fields.

**Acceptance Scenarios**:

1. **Given** an Issue Triage task resolves as `NEEDS_SPEC`, **When** routing is recorded, **Then** the source task completes with a SpecKit-ready handoff artifact containing source issue, triage rationale, proposed scope, non-goals, evidence links, proposed labels, and deferred setup action.
2. **Given** the `NEEDS_SPEC` route has been recorded, **When** the operator inspects downstream task relationships, **Then** no Issue Remediation task or non-remediation successor template has been created.
3. **Given** the `NEEDS_SPEC` route has been recorded, **When** the operator inspects external issue state, **Then** the issue has not been closed, commented on, labeled, assigned, dispatched to an agent, or used to create a spec worktree.

---

### User Story 2 - Route Human and Specialist Recommendations (Priority: P1)

An operator reviewing triage outcomes that need more input or expertise can distinguish a human clarification request from a specialist recommendation and can see the exact missing information or assignment state without leaving the task Evidence surface.

**Why this priority**: `NEEDS_HUMAN` and `NEEDS_SPECIALIST` are common production routing outcomes that require visible next action, explicit ownership expectations, and safe handling when a specialist cannot be selected.

**Independent Test**: Can be fully tested by routing one task as `NEEDS_HUMAN` and one as `NEEDS_SPECIALIST`, then verifying that each completed source task exposes the correct terminal lane, artifact fields, recommended next action, proposed labels, and missing or unassigned state.

**Acceptance Scenarios**:

1. **Given** an Issue Triage task resolves as `NEEDS_HUMAN`, **When** routing is recorded, **Then** the source task completes with a clarification-request artifact containing blocking questions, target audience, evidence needed, owner-facing next action, proposed labels, and an explicit note that no external message was sent.
2. **Given** an Issue Triage task resolves as `NEEDS_SPECIALIST` and Mission Control has safe specialist metadata, **When** routing is recorded, **Then** the source task completes with a specialist recommendation that identifies the recommended specialist lane and evidence behind that recommendation.
3. **Given** an Issue Triage task resolves as `NEEDS_SPECIALIST` and no safe specialist metadata exists, **When** routing is recorded, **Then** the source task completes with an explicit unassigned-specialist state and a recommended owner action to choose or supply specialist context.

---

### User Story 3 - Route Closure Recommendations (Priority: P2)

An operator reviewing non-remediation closure exits can see whether the issue is recommended as duplicate, obsolete, or invalid, with outcome-specific evidence and no live closure behavior.

**Why this priority**: Closure-like outcomes are risky if they silently mutate external issue state; recommendation-only evidence lets the owner decide whether to act while preserving the triage rationale.

**Independent Test**: Can be fully tested by routing separate triage tasks as `DUPLICATE`, `OBSOLETE`, and `INVALID`, then verifying that each completed source task uses the shared closure-recommendation model with the required outcome-specific fields and no external mutation.

**Acceptance Scenarios**:

1. **Given** an Issue Triage task resolves as `DUPLICATE`, **When** routing is recorded, **Then** the closure recommendation identifies the suspected duplicate target, comparison rationale, evidence links, proposed labels, and owner-facing next action.
2. **Given** an Issue Triage task resolves as `OBSOLETE`, **When** routing is recorded, **Then** the closure recommendation identifies the superseding condition or changed context, why the issue is no longer actionable, evidence links, proposed labels, and owner-facing next action.
3. **Given** an Issue Triage task resolves as `INVALID`, **When** routing is recorded, **Then** the closure recommendation identifies the invalidity reason, validation evidence, any missing reproducibility context, proposed labels, and owner-facing next action.
4. **Given** any closure recommendation route is recorded, **When** the operator inspects external issue state, **Then** no issue has been closed, commented on, labeled, assigned, or otherwise mutated.

---

### User Story 4 - Preserve Idempotent Evidence Display (Priority: P3)

An operator revisiting or retrying a completed Issue Triage task sees one compact routing summary on the task Evidence surface, even if the same non-remediation outcome is routed more than once.

**Why this priority**: Production routing must be stable under retries and visible where operators already inspect task-local evidence.

**Independent Test**: Can be fully tested by routing the same source triage task and outcome twice, then verifying that the Evidence surface shows one current `Triage routing` summary backed by `triage_routing` with artifact references, activity history, recommended next action, proposed labels, deferred side effects, and missing or unassigned states where applicable.

**Acceptance Scenarios**:

1. **Given** a non-remediation route already exists for a source triage task and outcome, **When** routing is repeated, **Then** the existing route evidence is updated or superseded without creating duplicate active routing artifacts.
2. **Given** any supported non-remediation route exists, **When** the operator opens task-local Evidence, **Then** a compact `Triage routing` section backed by API field `triage_routing` shows lane, status, artifact references, recommended next action, proposed labels, deferred side effects, and any missing or unassigned states.
3. **Given** routing evidence is present, **When** the operator reviews the source triage task timeline, **Then** the terminal routing activity is visible and tied back to the same source triage task and outcome.

### Edge Cases

- Routing is retried for the same source triage task and outcome after partial evidence was already recorded.
- Routing is retried for the same source triage task with a different disposition after a non-unknown disposition was already recorded.
- Routing artifact publish fails after disposition capture but before recorded terminal routing activity is written.
- A `NEEDS_SPECIALIST` outcome has no safe specialist metadata to support a recommendation.
- A `NEEDS_SPECIALIST` outcome has multiple possible areas, multiple possible owners, a missing same-workspace agent, or an inactive project.
- A non-Mission-Control triage task has a supported-looking disposition while the pilot flag or source-task identity gate is absent/off.
- A local UAT fixture run fails before cleanup and leaves disposable ids that must be exported and removed on retry.
- A closure recommendation lacks the outcome-specific target or rationale needed for owner action.
- The source issue has incomplete evidence links or missing labels proposed by triage.
- A non-remediation route is requested for an outcome outside `NEEDS_SPEC`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `DUPLICATE`, `OBSOLETE`, or `INVALID`.
- Evidence display encounters superseded routing artifacts and must present only the current route summary while preserving auditability.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support terminal recommendation routing for exactly these non-remediation Issue Triage outcomes in v1: `NEEDS_SPEC`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `DUPLICATE`, `OBSOLETE`, and `INVALID`.
- **FR-002**: System MUST keep all v1 non-remediation routing recommendation-only, with no issue close, external comment, label application, assignment, agent dispatch, spec worktree creation, or automatic SpecKit setup.
- **FR-003**: System MUST complete the source Issue Triage task with terminal non-remediation routing evidence for supported SPEC-009F outcomes and MUST NOT create an Issue Remediation successor or a non-remediation successor template. System MUST leave `ACTIONABLE_REMEDIATION` owned by the existing remediation successor flow to `mission-control_remediation_plan` and MUST NOT create SPEC-009F routing artifacts, terminal routing activities, task Evidence route summaries, non-remediation successors, or any other SPEC-009F side effects for that disposition.
- **FR-004**: System MUST record routing evidence through the existing disposition, artifact, and activity evidence model without requiring a new storage migration for v1.
- **FR-005**: System MUST make repeated routing idempotent by source triage task and outcome, updating or superseding current evidence without creating duplicate active route artifacts.
- **FR-006**: System MUST create a `NEEDS_SPEC` handoff artifact containing source issue, triage rationale, proposed scope, non-goals, evidence links, proposed labels, and deferred setup action.
- **FR-007**: System MUST create a `NEEDS_HUMAN` clarification-request artifact containing blocking questions, target audience, evidence needed, owner-facing next action, proposed labels, and confirmation that no external message was sent.
- **FR-008**: System MUST create a `NEEDS_SPECIALIST` recommendation from existing Mission Control metadata only when safe metadata is available.
- **FR-009**: System MUST record an explicit unassigned-specialist state for `NEEDS_SPECIALIST` when safe specialist metadata is unavailable.
- **FR-010**: System MUST use a shared closure-recommendation model for `DUPLICATE`, `OBSOLETE`, and `INVALID`.
- **FR-011**: System MUST require `DUPLICATE` closure recommendations to include suspected duplicate target, comparison rationale, evidence links, proposed labels, and owner-facing next action.
- **FR-012**: System MUST require `OBSOLETE` closure recommendations to include superseding condition or changed context, non-actionability rationale, evidence links, proposed labels, and owner-facing next action.
- **FR-013**: System MUST require `INVALID` closure recommendations to include invalidity reason, validation evidence, missing reproducibility context when applicable, proposed labels, and owner-facing next action.
- **FR-014**: System MUST expose a compact task-local Evidence API object named `triage_routing` for each routed source triage task, and the UI MUST present it as a `Triage routing` block inside the existing Evidence section.
- **FR-015**: The `triage_routing` evidence object and `Triage routing` UI block MUST show lane, status, artifact references, recommended next action, proposed labels, deferred side effects, and missing or unassigned states. The UI block MUST keep only allowlisted active links keyboard-focusable; all lane labels, route statuses, proposed labels, deferred side effects, missing/unassigned states, and superseded trace labels MUST remain inert read-only text with visible labels or screen-reader-accessible descriptions that do not rely on color alone.
- **FR-016**: System MUST preserve auditability for superseded routing evidence while presenting only the current active route summary to operators.
- **FR-017**: System MUST treat the existing `PILOT_MISSION_CONTROL_E2E` product-line scope as the default rollout boundary unless later clarification ratifies a dedicated rollout flag.
- **FR-018**: System MUST reject or visibly fail unsupported non-remediation routing outcomes without creating terminal evidence for an unknown lane.
- **FR-019**: System MUST use one typed lane payload envelope for all SPEC-009F routing artifacts with schema version, source task, workspace, source issue, disposition, lane, routing status, rationale, recommended next action, proposed labels, safe evidence references, deferred side effects, and production timestamp.
- **FR-020**: System MUST represent proposed GitHub labels as normalized recommendation metadata with `applied: false` and MUST NOT apply, sync, or add those labels to the GitHub label map in v1.
- **FR-021**: System MUST normalize and bound all rationale, next-action, question, and evidence-needed text before persistence using the field-specific limits in Security Normalization And Link Allowlist, and MUST store evidence links only as typed safe references that do not include raw bodies, raw logs, credentials, tokens, signed URLs, storage URIs, raw secrets, parser internals, actor identity, or PII-bearing key/value material.
- **FR-022**: System MUST validate each lane payload through a focused pure validation helper before artifact publishing, while existing task artifact storage remains responsible for persistence, redaction, size/MIME limits, supersession, and secret scanning.
- **FR-023**: System MUST keep the source Issue Triage task status as `done` after successful non-remediation routing and MUST record a `triage_routing_recorded` activity for the terminal route.
- **FR-024**: System MUST use `spec-009f.triage_routing.v1:{workspace_id}:{source_task_id}:{disposition}` as the route idempotency key.
- **FR-025**: System MUST create no new artifact or activity when a same-outcome retry has unchanged normalized payload content, and MUST supersede the prior active artifact when a same-outcome retry changes normalized payload content.
- **FR-026**: System MUST visibly reject changed-disposition retries after a non-unknown disposition is recorded for a completed source task, without creating terminal routing evidence for the attempted new outcome.
- **FR-027**: System MUST record sanitized `triage_routing_artifact_publish_failed` evidence and expose an incomplete or unavailable route state when artifact publishing fails before terminal routing is fully recorded.
- **FR-028**: System MUST backfill a missing `triage_routing_recorded` activity on retry when the route artifact already exists, without creating a duplicate active route artifact.
- **FR-029**: System MUST use existing task Evidence `state` values for `triage_routing` and MUST keep route-specific `routing_status` separate as `missing`, `recorded`, `failed`, or `conflict`.
- **FR-030**: System MUST derive `triage_routing` server-side from validated SPEC-009F payloads and activity/artifact evidence; the client component MUST NOT parse or validate raw routing payloads.
- **FR-031**: System MUST base specialist recommendations only on deterministic Mission Control workspace metadata: source task/workspace, project area slug, normalized area routing evidence, project-agent assignments, and same-workspace agent rows.
- **FR-032**: System MUST record `matching_confidence: "deterministic"` only when exactly one safe specialist lane and exactly one eligible same-workspace owner assignment resolve; otherwise it MUST record `specialist_state: "unassigned"` with missing metadata and owner action.
- **FR-033**: System MUST NOT execute, route to, or create `mission-control_specialist_route` or any other non-remediation successor for `NEEDS_SPECIALIST` in v1.
- **FR-034**: System MUST gate SPEC-009F routing on `resolveFlag("PILOT_MISSION_CONTROL_E2E")`, source task template slug `mission-control_issue_triage`, GitHub repo `racecraft-lab/mission-control`, supported disposition, and existing evidence prerequisites; when any gate is absent/off, no SPEC-009F artifact, activity, proposed label, dispatch, or successor is written.
- **FR-035**: System MUST provide deterministic local/test fixtures for all six supported non-remediation outcomes and MUST verify each fixture records typed routing evidence while creating no Issue Remediation or non-remediation successor.
- **FR-036**: System MUST provide an operator-readable Playwright Evidence inspection path covering all six outcomes, with non-committed region screenshots and fixture export evidence under `test-results/spec-009f-triage-routing/`.
- **FR-037**: System MUST clean up disposable SPEC-009F UAT fixture rows and record inserted ids, cleanup scope, and post-cleanup zero counts.
- **FR-038**: System MUST include behavioral and static/diff guardrails proving no live GitHub mutation, no label application, no successor creation, no claim, no runner, no sandbox, no adapter, and no auto-merge drift.
- **FR-039**: System MUST record SPEC-009F UAT evidence in `docs/qa/pilot-smoke-checklist.md`.
- **FR-040**: System MUST update the checked-in OpenAPI task Evidence response contract for `GET /api/tasks/{id}/evidence` to include the required `triage_routing` section and MUST preserve API-index parity without adding a separate triage-routing route or operation.
- **FR-041**: System MUST treat supported-disposition lane payload validation failures as fail-closed routing failures: reject before artifact publishing, write no terminal routing artifact and no `triage_routing_recorded` activity, persist only sanitized validation-failure evidence when source gates have passed, expose `triage_routing.routing_status: "failed"` with task Evidence state `incomplete` or `unavailable`, and allow corrected retry to record the route without duplicate active artifacts.

### Security Normalization And Link Allowlist

SPEC-009F stored/displayed text normalization MUST:

- Normalize Unicode to NFC, trim leading/trailing whitespace, normalize CRLF/CR to LF, and convert tabs to single spaces before validation.
- Persist no C0/C1 control characters except LF in multiline fields where this section allows LF.
- Fail closed before artifact publishing when a field exceeds its character or newline limit; validation-failure evidence may store only sanitized field/path reasons and MUST NOT store the rejected raw value.

Field limits:

| Field class | Max characters | Newline limit |
|-------------|----------------|---------------|
| `triage_rationale`, closure rationales, and `proposed_scope` | 2,000 | 8 LF |
| `recommended_next_action`, `owner_action`, `DeferredSideEffect.reason`, target audience, duplicate target, superseding condition, invalidity reason, and other single-value lane text | 500 | 0 |
| List items in `blocking_questions`, `evidence_needed`, `non_goals`, `matching_basis`, `missing_metadata`, `validation_evidence`, `warnings`, and sanitized failure reasons | 300 per item | 0 |
| `SafeEvidenceReference.label` | 120 | 0 |
| `proposed_labels.name` | 50 | 0 |

Active link construction is limited to typed references that pass all of these rules:

- `https:` is allowed only for `https://github.com/racecraft-lab/mission-control/issues/{number}` and `https://github.com/racecraft-lab/mission-control/pull/{number}`.
- Scheme-less same-origin/repo-local paths are allowed only for Mission Control task, artifact, or activity references and static docs/checklist paths under `docs/` or `specs/009f-production-triage-routing/`.
- Query strings and fragments are stripped before storage and validation.
- Userinfo/credentials, signed URLs, storage URIs/object paths, arbitrary hosts, broad external links, and `SafeEvidenceReference.type: "other"` render as inert text in v1.
- `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, `about:`, `ftp:`, `mailto:`, `tel:`, `ws:`, and `wss:` are explicitly unsafe for active links and MUST render as inert text.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.
- SPEC-009F UAT fixture screenshots and fixture exports are review artifacts under `test-results/spec-009f-triage-routing/`, not committed durable binaries.
- Disposable SPEC-009F fixture rows must be deleted after UAT, with post-cleanup zero counts recorded in the pilot smoke checklist.

### Key Entities *(include if feature involves data)*

- **Triage Route**: The terminal routing record for one source Issue Triage task and one supported non-remediation outcome; includes idempotency key, lane, status, current artifact reference, supersession state, deferred side effects, and recommended next action.
- **Routing Artifact**: Typed evidence created for the selected route, such as a SpecKit handoff, clarification request, specialist recommendation, unassigned-specialist state, or closure recommendation.
- **Lane Payload Envelope**: Common typed contract shared by all routing artifacts; includes source task/workspace/issue identity, disposition, lane, status, rationale, recommendation metadata, safe evidence references, deferred side effects, and production timestamp.
- **Proposed Label Recommendation**: Operator-facing label metadata with a normalized label name, source, recommended add action, and `applied: false`; it never mutates GitHub in v1.
- **Safe Evidence Reference**: Typed evidence pointer to internal artifacts, activities, or validated URLs; raw issue bodies, logs, storage URIs, signed URLs, secrets, and PII-bearing material are excluded.
- **Specialist Recommendation**: `NEEDS_SPECIALIST` lane artifact detail that either records a deterministic same-workspace specialist lane/owner recommendation with matching basis or an explicit unassigned-specialist state with missing metadata and owner action.
- **Closure Recommendation**: Shared recommendation model for `DUPLICATE`, `OBSOLETE`, and `INVALID`; includes outcome-specific rationale, evidence links, proposed labels, and owner-facing next action.
- **Task Evidence Summary**: Operator-facing task-local evidence view that exposes API field `triage_routing`, presents the current `Triage routing` state, and links to the underlying artifacts and activity history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of supported non-remediation outcomes produce terminal source-task routing evidence with no Issue Remediation successor in acceptance testing.
- **SC-002**: 100% of supported non-remediation outcomes produce no external issue mutation, no agent dispatch, no spec worktree, and no automatic SpecKit setup in acceptance testing.
- **SC-003**: Operators can identify the lane, status, artifact reference, recommended next action, proposed labels, and deferred side effects for any routed source task from the task Evidence surface in under 30 seconds.
- **SC-004**: Repeating routing for the same source triage task and outcome results in exactly one current active route summary in 100% of retry tests.
- **SC-005**: `NEEDS_SPECIALIST` routes without safe specialist metadata show an explicit unassigned-specialist state in 100% of applicable tests.
- **SC-006**: `DUPLICATE`, `OBSOLETE`, and `INVALID` routes each include all outcome-specific required closure fields in 100% of acceptance scenarios.
- **SC-007**: Same-outcome retry tests create exactly one current active route summary, while changed-disposition retry tests visibly reject the attempted new outcome without terminal evidence for that outcome.
- **SC-008**: The UAT fixture matrix covers all six supported outcomes with task Evidence screenshots and fixture export artifacts available for review.
- **SC-009**: UAT cleanup evidence records zero remaining disposable SPEC-009F fixture rows after cleanup.
- **SC-010**: Side-effect guard tests and static/diff guard checks pass with unchanged `ACTIONABLE_REMEDIATION` remediation-successor behavior and no GitHub mutation, label application, non-remediation successor creation, claim, runner, sandbox, adapter, or auto-merge drift.
- **SC-011**: API contract verification passes with `triage_routing` present in the checked-in OpenAPI `TaskEvidenceResponse` shape and no new triage-routing route or API-index operation.
- **SC-012**: Security normalization tests cover over-limit text, control characters, newline limits, stripped query/fragment values, allowed GitHub/static/internal references, unsafe schemes, and inert rendering for non-allowlisted destinations.

## Assumptions

- Operators are the primary users of this feature and already rely on task-local Evidence for triage review.
- Recommendation-only behavior is mandatory for v1; owner mutation actions may be considered later but are outside this feature.
- Existing Issue Triage disposition capture already determines the final non-remediation outcome before routing begins.
- Existing task evidence, artifact, and activity records can represent the required routing evidence without a new storage migration.
- The default rollout scope remains the existing pilot product-line boundary unless later clarification records a dedicated flag decision.
