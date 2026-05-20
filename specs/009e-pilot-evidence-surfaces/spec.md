# Feature Specification: Pilot Evidence Surfaces

**Feature Branch**: `009e-pilot-evidence-surfaces`
**Created**: 2026-05-20
**Status**: Draft
**Input**: User description: "SPEC-009E - Pilot Eligibility and Evidence Surfaces"

## Clarifications

### Session 1: API Contract And Naming (2026-05-20)

- Q: Should SPEC-009E standardize the v1 API as a generic task-scoped route? A: Yes. The route is `GET /api/tasks/[id]/evidence`; pilot-derived sections are v1 content inside a generic task evidence contract.
- Q: What top-level response sections are required? A: The route returns a light task evidence envelope with `schema_version`, `task`, `pilot_eligibility`, `identity`, `packet_artifacts`, `smoke`, `current_stage`, `warnings`, `deferrals`, and `source_map`.
- Q: How do non-pilot, local-only, and partial-proof tasks respond? A: Return `200` with compact explicit states such as `not_eligible` or `incomplete` and structured missing-proof reasons; do not return an empty success body or imply pilot proof exists.
- Q: What HTTP/error behavior is required? A: Unauthenticated reads return `401`; malformed workspace scope returns `400`; authenticated but forbidden workspace scope returns existing `403`; missing tasks and tasks outside the authorized workspace scope return masked `404 task_not_found`; incomplete evidence remains a `200` domain state. If artifact storage is disabled but the aggregate evidence route can still return task-local evidence, it returns `200` with the artifact/packet section unavailable and a warning; direct artifact routes may keep their existing `503 artifact_store_disabled` behavior.
- Q: Should task evidence inline artifact content? A: No. The route returns artifact references and safe metadata only; full artifact content remains behind the existing artifact read endpoint and its masking, quarantine, and redaction rules.

### Session 2: Task Detail UI And Accessibility (2026-05-20)

- Q: Where should the first Evidence UI live? A: Add a compact read-only Evidence section inside the existing task detail Details tab, near the current task/GitHub metadata. Do not add a fourth modal tab unless Plan proves the Details section cannot remain usable.
- Q: Which tasks should show the section? A: Render the compact Evidence section for every opened task, with density based on evidence state. GitHub-linked or pilot-relevant tasks show full evidence; partial-proof tasks show `incomplete` with missing categories; local-only or no-evidence tasks show a one-line `not_eligible` or `no_stored_evidence` explanation.
- Q: How should UI states render? A: Fetch `GET /api/tasks/[id]/evidence` when task detail opens and show explicit loading, empty/no-evidence, route error, missing-proof, stale/unavailable, and deferred states without triggering refreshes or writes.
- Q: What accessibility contract applies? A: If implemented as a Details section, use a labelled section with a heading, text labels that do not depend on color alone, keyboard-reachable existing links, accessible names for GitHub/artifact references, and polite async status/error announcements. If Plan chooses a tab instead, it must implement standard tab semantics, keyboard navigation, and labelled panels.
- Q: Are global evidence navigation or action controls allowed? A: No. SPEC-009E adds no global Evidence page, diagnostics dashboard, refresh, packet generation, sync, smoke execution, retry, claim, sandbox, adapter, or harness controls. The UI may link to existing GitHub/artifact references but must not produce evidence.

### Session 3: Evidence State And Stored Source Truth (2026-05-20)

- Q: What evidence-state vocabulary should the v1 route expose? A: Use compact snake_case states: `eligible`, `not_eligible`, `incomplete`, `available`, `missing`, `stale`, `redacted`, `quarantined`, `superseded`, `unavailable`, and `deferred`. Map packet-local `local_only_excluded` to `not_eligible`; represent `oversized` and `malformed` as warning reason codes rather than top-level eligibility states.
- Q: When stored sources disagree, what source hierarchy applies? A: Use current task/activity rows for live stage and identity; packet artifacts for packet existence and snapshot references; current artifact, review, governance, and GitHub sync rows for section evidence; smoke checklist proof only through stored packet/source-map references or static UAT links.
- Q: Should the route call `buildPilotReviewPacket()` directly? A: No. Build a lighter task evidence helper that reuses SPEC-009D constants/types and reads stored rows/artifact metadata; never publish, generate, or refresh a packet on `GET`.
- Q: How should redacted, quarantined, superseded, oversized, malformed, or secret-bearing artifact evidence render? A: Render artifact evidence as safe references, status, reasons, and source-map metadata only. Quarantined, unsafe, malformed, oversized, and non-redactable secret evidence must not expose raw content, preview text, storage URI, object paths, signed URLs, raw secret values, parser details, or actor identity. Redacted text evidence may show only an existing post-redaction safe preview from artifact metadata. Superseded evidence remains trace-only and must not count as current proof. SPEC-009E must not add quarantine override, unquarantine, repair, refresh, read-through, or artifact mutation controls.
- Q: How does `docs/qa/pilot-smoke-checklist.md` participate in runtime evidence? A: Do not parse the Markdown checklist at runtime. Smoke evidence is `available` only when a stored packet/source-map or explicit stored reference names checklist proof; otherwise show `missing` or `incomplete`. Use the checklist itself for UAT recording.

### Session 4: UAT And Cleanup Evidence (2026-05-20)

- Q: What retained evidence source should SPEC-009E UAT use when prior disposable rows were cleaned? A: Use the retained external pilot trail issue #50 / PR #51 plus SPEC-009D packet/source-map and smoke-checklist evidence as canonical proof. If no live retained task row exists, SPEC-009E may seed a disposable Mission Control task row only as a browser-journey carrier for screenshots.
- Q: What must the operator see in the Evidence UI for UAT to pass? A: Eligibility, GitHub issue/PR identity, packet JSON/Markdown references, smoke/checklist proof, current or archived stage, warnings, source-map pointers, and all seven deferred categories.
- Q: How should cleaned disposable UAT rows be represented? A: Cleaned rows are archived/UAT proof only, not current active Mission Control state. The route/UI may show stored packet/source-map references, retained GitHub issue/PR identity, retained sync rows, or static UAT links as archived proof; missing live task/activity/notification pointers must be `unavailable` or `missing` with cleanup rationale.
- Q: What cleanup expectations apply if SPEC-009E creates fixture rows for UAT? A: Seed fixture rows only in a temp data directory or clearly scoped UAT workspace, capture backup/export before cleanup, record before/after counts plus owner/timestamp, remove only SPEC-009E fixture Mission Control rows after screenshots, and retain GitHub issue/PR plus checklist evidence. No runtime cleanup control is added.
- Q: Where is UAT recorded? A: Add a SPEC-009E section to `docs/qa/pilot-smoke-checklist.md` as the canonical ledger; a spec-local checklist is optional only if it links back to that ledger.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review task-local pilot evidence (Priority: P1)

As a Mission Control operator, I can open a task detail journey backed by the retained pilot trail and see the stored eligibility, packet, smoke, GitHub, stage, warnings, and deferral evidence from the task context so that I can review the pilot trail without searching through terminal output or unrelated records.

**Why this priority**: This is the minimum operator value for SPEC-009E and makes the existing SPEC-009D review packet usable from the task workflow.

**Independent Test**: Can be fully tested by opening a retained live task when available, or a disposable UAT carrier task linked to retained issue #50 / PR #51 evidence, viewing the task detail evidence surface, and capturing Playwright screenshots for the loaded evidence, warning/missing-proof state, and deferred future-state sections.

**Acceptance Scenarios**:

1. **Given** a retained live task or disposable UAT carrier linked to retained issue #50 / PR #51 evidence with stored review packet, smoke checklist, GitHub identity, and eligibility evidence, **When** an operator opens the task detail, **Then** the evidence surface shows current or archived stage, eligibility inputs, linked issue/PR identity, packet artifact references, smoke evidence, warnings, and future-state deferrals.
2. **Given** a pilot-relevant task has packet artifacts and smoke notes stored in Mission Control, **When** the operator reviews its evidence surface, **Then** each visible evidence item is traceable to stored task-local evidence rather than a new external refresh or action.
3. **Given** the operator captures UAT evidence for the retained pilot trail or a disposable task row linked to that trail, **When** the UAT run is reviewed, **Then** the screenshots and notes prove that the operator-facing UI reads the stored evidence correctly.

---

### User Story 2 - Identify incomplete or ineligible tasks (Priority: P2)

As a reviewer, I can open a local-only or partial-proof task and immediately see why it is not eligible or why its evidence is incomplete so that I can separate valid pilot evidence from missing proof.

**Why this priority**: Review confidence depends on explicit negative states; silently hiding evidence or implying eligibility would make the pilot trail ambiguous.

**Independent Test**: Can be independently tested by opening representative local-only and partial-proof tasks and verifying the evidence surface displays not-eligible or incomplete states with specific missing proof reasons.

**Acceptance Scenarios**:

1. **Given** a task lacks GitHub-linked task identity required for pilot eligibility, **When** a reviewer opens the evidence surface, **Then** the task is labeled not eligible and the missing identity proof is named.
2. **Given** a task has only partial packet or smoke evidence, **When** a reviewer opens the evidence surface, **Then** the task is labeled incomplete and all missing proof categories are listed.
3. **Given** a task is not pilot-relevant, **When** a reviewer opens its task detail, **Then** the evidence section remains compact, gives a one-line not-eligible or no-stored-evidence explanation, and does not imply that pilot evidence exists.

---

### User Story 3 - Preserve clear future-state boundaries (Priority: P3)

As a future SPEC-009F, SPEC-013, or SPEC-014 implementer, I can see which evidence categories are deliberately deferred so that I do not confuse current stored evidence with future runtime authority or automation.

**Why this priority**: SPEC-009E must expose current evidence without accidentally claiming deferred platform capabilities.

**Independent Test**: Can be independently tested by reviewing the evidence surface for a pilot task and verifying that run state, sync automation, claim authority, retry controls, sandbox lifecycle, adapter registry, and real harness execution are labeled as deferred with the owning future spec family.

**Acceptance Scenarios**:

1. **Given** a pilot task has current stored packet evidence, **When** a reviewer inspects future-state sections, **Then** run-state persistence and GitHub sync automation are labeled deferred to SPEC-013A or SPEC-013A1.
2. **Given** a reviewer inspects authority and remediation controls, **When** the evidence surface renders deferred sections, **Then** claim authority and retry/debug controls are labeled deferred to SPEC-013B and SPEC-013C.
3. **Given** a reviewer inspects execution and adapter evidence, **When** the evidence surface renders deferred sections, **Then** sandbox lifecycle, adapter registry, and real harness execution are labeled deferred to SPEC-014A-D.

### Edge Cases

- A task has GitHub issue identity but no PR identity; the evidence surface must show the available identity and name the missing PR proof without triggering any refresh.
- A task has packet artifact references but no smoke checklist evidence; the surface must show packet proof and mark smoke proof incomplete.
- A task has smoke checklist notes but no packet artifact reference; the surface must show smoke proof and mark packet proof incomplete.
- A task has stale or unavailable stored artifact references; the surface must expose the stored reference and warn that proof cannot be confirmed from available stored evidence.
- Artifact storage is disabled or unavailable while task-local evidence is otherwise readable; the route must degrade the packet/artifact section with a warning rather than hiding eligibility, identity, stage, or deferral evidence.
- The task evidence route is still loading or returns an error while the task detail modal is open; the UI must show a labelled non-mutating status or error state inside the Evidence section without blocking the rest of Details.
- Stored task/activity state and packet snapshot state disagree; the route must show current task/activity state for live stage and identity while warning that packet evidence is a snapshot.
- Stored artifact evidence is redacted, quarantined, superseded, oversized, malformed, unsafe, or secret-bearing; the route/UI must render only safe metadata and warnings allowed for that state.
- Prior disposable UAT task rows were intentionally cleaned; the route/UI must present retained issue #50 / PR #51, packet/source-map, retained sync, and checklist references as archived proof while marking missing live row pointers with cleanup rationale.
- A task is local-only, archived, or otherwise not pilot-relevant; the surface must avoid presenting it as eligible while still giving a compact explanation.
- Multiple stored evidence items conflict about stage or readiness; the surface must prefer an explicit warning over silently choosing a misleading positive state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a generic task evidence concept exposed as `GET /api/tasks/[id]/evidence` that can summarize stored task-local proof for pilot-relevant review.
- **FR-002**: System MUST expose task evidence in a read-only manner derived only from evidence already stored in Mission Control.
- **FR-003**: System MUST include `schema_version`, `task`, `pilot_eligibility`, `identity`, `packet_artifacts`, `smoke`, `current_stage`, `warnings`, `deferrals`, and `source_map` sections in the v1 task evidence response.
- **FR-004**: System MUST include GitHub-linked task identity when issue or pull request proof is stored for the task.
- **FR-005**: System MUST include review packet artifact references and safe metadata when packet evidence is stored for the task.
- **FR-006**: System MUST include smoke checklist evidence when smoke proof is stored for the task.
- **FR-007**: System MUST include the task's current stage as represented by stored Mission Control state.
- **FR-008**: System MUST include warnings and missing-proof reasons when evidence is incomplete, conflicting, stale, or insufficient for pilot eligibility.
- **FR-009**: System MUST show local-only and partial-proof tasks as `not_eligible` or `incomplete` in a `200` evidence response, with specific missing proof reasons.
- **FR-010**: System MUST provide a compact read-only Evidence section inside the existing task detail Details tab unless Plan proves a tab is necessary.
- **FR-011**: System MUST render the compact Evidence section for every opened task, keeping non-pilot and non-GitHub-linked task evidence terse and never implying pilot eligibility without required proof.
- **FR-012**: System MUST label future-state evidence categories for run state, sync automation, claim authority, retry controls, sandbox lifecycle, adapter registry, and real harness execution as deferred.
- **FR-013**: System MUST associate deferred future-state categories with SPEC-013A, SPEC-013A1, SPEC-013B, SPEC-013C, or SPEC-014A-D as appropriate.
- **FR-014**: System MUST NOT create or mutate task evidence, task artifacts, smoke results, packets, GitHub sync state, or pilot status as part of viewing evidence.
- **FR-015**: System MUST NOT perform live GitHub refresh, packet generation, smoke execution, GitHub sync trigger, claim authority, runner state mutation, retry control, sandbox lifecycle management, adapter registry execution, or harness execution for this feature.
- **FR-016**: UAT MUST open a task detail Evidence UI journey backed by the retained pilot trail issue #50 / PR #51 and stored SPEC-009D packet/source-map and smoke-checklist evidence, seeding a disposable task row only when no live retained task row exists.
- **FR-017**: The feature MUST remain bounded to a task-local evidence surface and MUST NOT introduce a global Evidence page.
- **FR-018**: The feature MUST be reviewable as one compact change set.
- **FR-019**: The task evidence route MUST return `401` for unauthenticated reads, `400` for malformed workspace scope, existing `403` for forbidden explicit workspace scope, and masked `404 task_not_found` for missing tasks or tasks outside the authorized workspace scope.
- **FR-020**: The task evidence route MUST represent disabled or unavailable artifact storage as a section-level unavailable warning when other task-local evidence can still be returned; direct artifact routes are not changed by this requirement.
- **FR-021**: The task evidence route MUST NOT inline artifact content; artifact body inspection remains delegated to existing artifact read routes and their masking, quarantine, and redaction behavior.
- **FR-022**: The Evidence UI MUST show explicit loading, no-stored-evidence, route error, missing-proof, stale/unavailable, and deferred states without refreshing evidence or mutating stored records.
- **FR-023**: The Evidence UI MUST expose status text, section headings, artifact/GitHub reference names, and async loading/error updates in an accessible way that does not depend on color alone.
- **FR-024**: The Evidence UI MUST NOT introduce global Evidence navigation, diagnostics dashboards, or controls for refresh, packet generation, sync, smoke execution, retry, claim, sandbox, adapter, or harness behavior.
- **FR-025**: The task evidence route MUST use the v1 states `eligible`, `not_eligible`, `incomplete`, `available`, `missing`, `stale`, `redacted`, `quarantined`, `superseded`, `unavailable`, and `deferred`, with oversized and malformed evidence represented as warning reason codes.
- **FR-026**: The task evidence route MUST use current task/activity rows for live stage and identity, packet artifacts for packet existence and snapshot references, current artifact/review/governance/GitHub sync rows for section evidence, and smoke checklist proof only through stored packet/source-map references or static UAT links.
- **FR-027**: The task evidence route MUST NOT call `buildPilotReviewPacket()` as a packet-generation path on `GET`; any helper must build a lighter read-only task evidence view from stored rows, artifact metadata, and reusable SPEC-009D constants or types.
- **FR-028**: The task evidence route and Evidence UI MUST render redacted, quarantined, superseded, oversized, malformed, stale, missing, unsafe, and secret-bearing artifact evidence using existing artifact metadata, packet-local states, warnings, and source-map pointers only; MUST NOT expose quarantined content, storage URIs, object paths, signed URLs, raw secret values, parser internals, or actor identity; and MUST NOT add task-evidence controls for quarantine override, unquarantine, repair, refresh, read-through, or artifact mutation.
- **FR-029**: Runtime evidence derivation MUST NOT parse `docs/qa/pilot-smoke-checklist.md`; checklist references may appear only when already present in stored packet/source-map evidence or in static UAT documentation.
- **FR-030**: When prior disposable UAT rows were intentionally cleaned, the task evidence route MUST represent missing live task/activity/notification pointers as `unavailable` or `missing` with cleanup rationale, and MUST use stored packet/source-map references, retained GitHub issue/PR identity, retained sync rows, or static UAT links only as archived proof. The route MUST NOT claim current active Mission Control state from cleaned rows.
- **FR-031**: SPEC-009E UAT fixture rows, if created, MUST be disposable, backup/exported before cleanup, cleaned after screenshots, and documented with before/after counts, owner, timestamp, retained GitHub issue/PR, and checklist evidence.
- **FR-032**: SPEC-009E UAT MUST be recorded in `docs/qa/pilot-smoke-checklist.md`; spec-local evidence checklists may supplement it only by linking back to that canonical ledger.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.
- SPEC-009E UAT fixture cleanup requires backup/export, before/after counts, owner/timestamp, and retained checklist/GitHub evidence before disposable rows are removed.

### Key Entities *(include if feature involves data)*

- **Task Evidence**: Task-local summary of stored proof used for operator review; includes eligibility, identity, packet, smoke, stage, warning, and deferral sections.
- **Task Evidence Response**: Generic API envelope with `schema_version`, `task`, `pilot_eligibility`, `identity`, `packet_artifacts`, `smoke`, `current_stage`, `warnings`, `deferrals`, and `source_map` sections.
- **Evidence Section**: Compact read-only section in task detail Details that renders task evidence state, safe references, missing proof, warnings, and deferred future-state rows for the opened task.
- **Pilot Eligibility Evidence**: Stored inputs that explain whether a task is eligible for pilot review and which proof categories are present or missing.
- **GitHub Task Identity**: Stored issue and pull request identifiers associated with the task.
- **Review Packet Reference**: Stored reference and safe metadata for an existing pilot review packet or packet artifact; it is not inline artifact body content.
- **Smoke Checklist Evidence**: Stored proof or notes from smoke checklist validation associated with the task.
- **Future-State Deferral**: Explicit label for evidence categories intentionally deferred to later specs rather than implemented in SPEC-009E.
- **Evidence State**: Compact task evidence status vocabulary that distinguishes eligibility, proof availability, missing or stale proof, redaction/quarantine/supersession, unavailable sources, and deferred future-state categories.
- **Archived UAT Proof**: Retained external issue/PR, packet/source-map, sync, and smoke-checklist references used to prove a cleaned disposable UAT journey without claiming live Mission Control row state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operators can find the retained pilot trail's eligibility, GitHub identity, packet, smoke, stage, warning, and deferral evidence from task detail in under 30 seconds without using a terminal.
- **SC-002**: 100% of tested local-only or partial-proof tasks display a not-eligible or incomplete state with at least one specific missing proof reason.
- **SC-003**: 100% of tested pilot-relevant tasks render future-state deferral labels for the seven named deferred categories without exposing controls for those capabilities.
- **SC-004**: UAT evidence includes at least one browser journey backed by retained issue #50 / PR #51 evidence, using a retained live task or disposable UAT carrier as needed, with screenshots proving the stored evidence appears in the operator-facing UI.
- **SC-005**: Reviewers can distinguish stored proof, missing proof, and deferred future-state categories on first inspection for all UAT tasks.

## Assumptions

- Existing stored task, artifact, activity, packet, smoke, and GitHub identity records are sufficient to derive the v1 evidence view.
- The first operator surface is task-local because the feature explicitly excludes a global Evidence page.
- Evidence viewing is available to the same operators who can already inspect task detail.
- Deferred future-state labels are informational only and do not create controls, automation, or execution paths.
- Prior SPEC-009C4/SPEC-009D disposable Mission Control task rows may have been intentionally cleaned after evidence capture. SPEC-009E UAT uses the retained external audit trail issue #50 / PR #51 plus stored SPEC-009D packet/source-map and smoke-checklist references as canonical proof; any newly seeded task row for browser UAT is a disposable carrier and must not be treated as durable evidence after cleanup.
- SPEC-009E may reuse SPEC-009D constants, types, and artifact metadata readers, but `GET /api/tasks/[id]/evidence` is a lighter aggregate read model and not a packet-generation endpoint.
- The smoke checklist is an operator evidence ledger and UAT recording target, not a runtime data source to parse on each evidence request.
