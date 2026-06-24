# Feature Specification: SPEC-011 CrabTrap Honeypot Adapter

**Feature Branch**: `011-crabtrap-honeypot`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Add a bounded optional CrabTrap honeypot adapter that turns safe denial-summary evidence into `security_intrusion_detected` activity rows while remaining disabled by default, absent-safe, schema-free, and isolated from scheduler, dispatch, OpenAPI, UI, and raw audit persistence."

## Clarifications

### Session 2026-06-24

- Q: Should SPEC-011 add a Paddock runtime route, or stay helper-only? -> A: SPEC-011 stays helper-only. It implements a library adapter that processes Paddock-owned signed denial-summary fixtures; no runtime route, webhook endpoint, polling integration, OpenAPI entry, or API-parity ignore is added in this slice.
- Q: What is the accepted intake object for this slice? -> A: The accepted intake object is a Paddock-owned signed denial-summary fixture, not a raw CrabTrap webhook payload, admin/audit row, transcript, or provider payload.
- Q: Should `FEATURE_CRABTRAP_HONEYPOT` be registered for helper-only intake? -> A: Yes. Register the typed central feature flag and keep all adapter gating through `resolveFlag('FEATURE_CRABTRAP_HONEYPOT', ctx)`.
- Q: Where should live CrabTrap custom sender, private route, or admin-polling integration be tracked? -> A: Defer it to a future CrabTrap architecture/follow-up spec. SPEC-011 must not absorb live runtime integration work.
- Q: What signature scheme does helper-level fixture intake use? -> A: Helper fixtures use HMAC-SHA256 over `v1:<timestamp>:<event_id>:<canonical_payload_sha256>` and carry `signature: "sha256=<hex>"`. `canonical_payload_sha256` is the SHA-256 of deterministic UTF-8 canonical JSON for the normalized denial-summary object, excluding the `signature` field. SPEC-011 reserves no runtime route headers.
- Q: What freshness and replay rule applies? -> A: Reject fixture timestamps outside +/-300 seconds of the adapter clock. After signature verification and normalization, accepted evidence stores only `data.replay_key_hash = "sha256:<hex>"`, computed from `source + "\0" + event_id + "\0" + occurred_at`. Future live intake must add durable replay protection in its own spec if activity lookup is not sufficient.
- Q: What size and JSON failure behavior applies? -> A: Raw fixture input is limited to 16 KiB UTF-8 before JSON parse. Oversized payloads return `payload_too_large`; malformed JSON returns `malformed_json`; neither path writes activity.
- Q: What failure code contract applies? -> A: CrabTrap intake uses a closed lower-snake `crabtrap_intake_failure_code.v1` vocabulary with first-match validation order: `feature_disabled`, `config_missing`, `config_invalid`, `payload_too_large`, `malformed_json`, `payload_schema_invalid`, `signature_missing`, `timestamp_missing`, `timestamp_invalid`, `timestamp_stale`, `signature_invalid`, `unsafe_field_present`, `unsupported_decision`, `unsupported_method`, `replay_detected`, `activity_write_failed`.
- Q: How are unsafe fields handled? -> A: Any forbidden raw field/key or secret-like value at any depth is rejected as `unsafe_field_present`. Diagnostics may include only bounded field path/category and must never include raw values, matched substrings, raw secret hashes, headers, bodies, cookies, auth material, query secrets, provider payloads, or audit rows. Approved hash fields such as `safe_request_hash` and `replay_key_hash` are not themselves unsafe.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Disabled And Absent Safe (Priority: P1)

As an operator or maintainer, I need Paddock to behave exactly as it does today when the CrabTrap feature flag is off or CrabTrap configuration is missing, so existing installs are not affected by an optional security adapter.

**Why this priority**: This protects current deployments and satisfies the optional-adapter requirement before any evidence path can be trusted.

**Independent Test**: Can be fully tested by processing Paddock-owned signed denial-summary fixtures with the feature disabled and with missing configuration, then confirming no CrabTrap activity is recorded and existing task, scheduler, dispatch, API, and activity behavior remains unchanged.

**Acceptance Scenarios**:

1. **Given** `FEATURE_CRABTRAP_HONEYPOT` resolves off for the current context, **When** a valid CrabTrap denial summary is presented, **Then** Paddock records no CrabTrap activity and returns an explicit no-op outcome.
2. **Given** the feature resolves on but required CrabTrap adapter configuration is absent or invalid, **When** any CrabTrap denial summary is presented, **Then** Paddock records no CrabTrap activity and does not fail unrelated application flows.
3. **Given** no CrabTrap binary, service, webhook, or admin API is available, **When** the application starts and normal workflows run, **Then** no runtime path requires CrabTrap to be present.

---

### User Story 2 - Bounded Denial Evidence (Priority: P1)

As an operator, I want a valid signed CrabTrap denial-summary fixture to create exactly one bounded security activity entry, so I can inspect security probe evidence without storing sensitive proxy data.

**Why this priority**: This is the core value of the feature: safe, inspectable evidence in an existing operational surface.

**Independent Test**: Can be fully tested by enabling the feature and valid config, replaying one Paddock-owned signed denial-summary fixture, and verifying exactly one `security_intrusion_detected` activity row with only approved bounded fields.

**Acceptance Scenarios**:

1. **Given** the feature resolves on, required config is valid, and the fixture is signed, fresh, unique, within size limits, and safe, **When** the fixture is processed, **Then** Paddock writes exactly one `security_intrusion_detected` activity row.
2. **Given** an accepted denial summary contains a URL with query parameters or fragments, **When** activity evidence is written, **Then** only the URL host and path are retained and query or fragment content is excluded.
3. **Given** an accepted denial summary includes workspace or project scope approved by the adapter context, **When** activity evidence is written, **Then** the activity carries that bounded scope without mutating tasks, projects, scheduler state, or successor selection.

---

### User Story 3 - Unsafe Or Invalid Payload Rejection (Priority: P1)

As an operator, I need malformed, unsigned, stale, replayed, oversized, or unsafe CrabTrap payloads rejected before persistence, so sensitive audit data cannot leak into Paddock.

**Why this priority**: CrabTrap can observe cleartext request data. Rejection and redaction boundaries are required before the adapter is safe to enable.

**Independent Test**: Can be fully tested with negative fixtures that exercise malformed shape, invalid signature, stale timestamp, replay, oversized body, raw headers, raw bodies, cookies, Authorization values, API keys, query secrets, provider payloads, and full audit rows.

**Acceptance Scenarios**:

1. **Given** a malformed, unsigned, stale, replayed, or oversized payload, **When** it is processed, **Then** Paddock rejects it and writes no activity evidence.
2. **Given** a payload contains raw headers, raw bodies, cookies, Authorization values, API keys, query secrets, provider payloads, or a full CrabTrap audit row, **When** it is processed, **Then** Paddock rejects it before writing activity evidence.
3. **Given** validation fails, **When** diagnostics are returned or recorded, **Then** the diagnostic names only bounded failure reasons and never includes raw sensitive field values.

---

### User Story 4 - Scope Isolation Review (Priority: P2)

As a reviewer, I need the final slice to be easy to inspect and prove isolated from unrelated product surfaces, so the adapter can merge without creating review or operational debt.

**Why this priority**: The feature is intentionally narrow and must not expand into schema, OpenAPI, UI, scheduler, dispatch, task, GitHub, or harness behavior.

**Independent Test**: Can be fully tested by reviewing the final diff, guardrails, and verification evidence for the declared file budget and explicit non-goals.

**Acceptance Scenarios**:

1. **Given** the implementation is ready for review, **When** the reviewer inspects the diff and PR packet, **Then** no schema migration, OpenAPI contract, scheduler/task-dispatch dependency, task-chain mutation, runner/sandbox dependency, GitHub sync mutation, new panel, or notification fanout is present.
2. **Given** the reviewer inspects stored activity evidence and test fixtures, **When** they search for raw CrabTrap audit rows or sensitive request data, **Then** they find only bounded summaries and hashes in accepted evidence.

### Edge Cases

- Feature flag off with otherwise valid config and payload must be a no-op.
- Feature flag on with missing, empty, or invalid config must be a no-op.
- CrabTrap absent from the host must not break application startup or unrelated workflows.
- Malformed JSON or missing required normalized fields must be rejected.
- Unsupported decisions or methods must be rejected unless explicitly allowed by the normalized contract.
- Stale timestamps must be rejected.
- Duplicate source/event/timestamp combinations must be treated as replay and must not create another activity.
- Payloads over 16 KiB UTF-8 must be rejected before parsing or persistence.
- Malformed JSON must return `malformed_json` and write no activity.
- Raw headers, bodies, cookies, Authorization values, API keys, query secrets, provider payloads, and full audit rows must be rejected even when the signature is otherwise valid.
- URL queries and fragments must never be persisted.
- Activity write failure must be isolated so CrabTrap intake failure does not crash unrelated application behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a new CrabTrap adapter boundary at `src/lib/crabtrap-adapter.ts` for all SPEC-011-owned CrabTrap evidence behavior.
- **FR-002**: System MUST register `FEATURE_CRABTRAP_HONEYPOT` in the central typed feature-flag registry and gate every CrabTrap evidence path through `resolveFlag('FEATURE_CRABTRAP_HONEYPOT', ctx)`.
- **FR-003**: System MUST treat a flag-off result as an explicit no-op that writes no activity and requires no CrabTrap runtime.
- **FR-004**: System MUST validate CrabTrap adapter configuration before accepting any event; missing or invalid configuration MUST write no activity and MUST not affect unrelated application flows.
- **FR-005**: System MUST operate on a Paddock-owned signed denial-summary fixture shape rather than raw CrabTrap webhook payloads, audit rows, admin API records, transcripts, or provider payloads.
- **FR-006**: System MUST normalize accepted denial summaries to bounded fields only: source, event id, timestamp, actor, decision, method, URL host, URL path, reason, safe request hash, counts, and workspace/project scope when supplied by an approved context.
- **FR-007**: System MUST exclude URL queries and fragments from persisted evidence and MUST represent request identity through safe hashes or counts only.
- **FR-008**: System MUST reject payloads containing raw headers, raw bodies, cookies, Authorization values, API keys, query secrets, provider payloads, or full CrabTrap audit rows.
- **FR-009**: System MUST require helper fixture signatures using HMAC-SHA256 over `v1:<timestamp>:<event_id>:<canonical_payload_sha256>`, with a `signature: "sha256=<hex>"` value, constant-time comparison, timestamp freshness, replay protection, and max-size validation before activity evidence can be written; any future runtime intake MUST satisfy at least the same controls in a separate ratified slice.
- **FR-010**: System MUST reject malformed, unsigned, stale, replayed, oversized, unsafe, or unsupported payloads without writing activity evidence and MUST return a bounded failure code from the closed `crabtrap_intake_failure_code.v1` vocabulary.
- **FR-011**: System MUST write exactly one existing-schema activity entry with kind `security_intrusion_detected` for each accepted unique denial summary.
- **FR-012**: System MUST keep activity data and diagnostics bounded to approved summary fields, safe hashes, and closed failure codes, and MUST never persist raw CrabTrap audit content, headers, bodies, cookies, tokens, query secrets, provider payloads, secret values, raw secret hashes, or matched secret substrings.
- **FR-013**: System MUST isolate activity-write failures so a failed CrabTrap evidence write returns a bounded failure outcome without crashing scheduler, task-dispatch, task-chain, runner, sandbox, GitHub sync, or unrelated API behavior.
- **FR-014**: System MUST NOT add a schema migration, new table, runtime route, OpenAPI contract, API-parity ignore, public webhook API, polling integration, dashboard panel, notification fanout, automatic remediation, GitHub mutation, task terminal mutation, or successor selection behavior.
- **FR-015**: System MUST include focused tests for flag off, config missing, valid signed fixture, malformed fixture, signature failure, stale event, replayed event, oversized payload, unsafe-field rejection, and activity write failure isolation.
- **FR-016**: System MUST support human validation through signed fixture replay and inspection of resulting activities without requiring live CrabTrap Docker evidence.
- **FR-017**: System MUST keep CrabTrap disabled by default and absent-safe for existing installs.
- **FR-018**: System MUST preserve reviewer evidence that the slice remains bounded to adapter behavior, focused tests, guardrails/docs, and fixture/UAT artifacts approved during planning.

### Reviewability Budget *(mandatory)*

- **Primary surface**: harness/adapter
- **Secondary surfaces, if any**: seed/config, docs/process
- **Projected reviewable LOC**: 250-400 excluding generated or lock artifacts
- **Projected production files**: 2 (`src/lib/crabtrap-adapter.ts` plus central feature-flag registration)
- **Projected total files**: 8-12 including tests, fixtures, guardrail/docs updates, spec artifacts, and UAT evidence
- **Budget result**: within budget
- **Split decision**: Remains one spec because the accepted scope has one primary surface, no schema migration, no OpenAPI contract, no scheduler/task-dispatch changes, no UI, and no runtime dependency addition. Any private route, polling path, notification fanout, live CrabTrap deployment requirement, or UI expansion must be split or explicitly ratified before implementation.

### PR Review Packet Requirements *(mandatory)*

- PR description MUST include: what changed, why, non-goals, review order,
  scope budget, traceability, verification evidence, known gaps, and rollback
  or feature-flag notes.
- Traceability MUST map each major requirement or success criterion to changed
  files and verification evidence.
- Deferred work MUST name the follow-up spec or issue, especially live CrabTrap private route, custom sender, admin-polling, notification fanout, or broader CrabTrap architecture work.

### Key Entities *(include if feature involves data)*

- **CrabTrap Denial Summary**: A Paddock-owned signed fixture that safely and boundedly represents a denied proxy event. Key attributes are source, event id, occurred timestamp, actor, decision, method, URL host/path, reason, safe request hash, denial counts, and approved workspace/project scope.
- **CrabTrap Adapter Config**: Operator-provided settings required before any event can be accepted, including enablement context, signing material, HMAC-SHA256 verification policy, freshness/replay limits, and the 16 KiB payload-size bound. Missing or invalid config results in no activity.
- **Security Activity Evidence**: Existing activity-stream evidence with kind `security_intrusion_detected` and bounded data derived only from accepted denial summaries.
- **Replay Identity**: A uniqueness key derived from bounded event identity as `sha256(source + "\0" + event_id + "\0" + occurred_at)`, persisted only as `data.replay_key_hash` in accepted activity evidence to prevent duplicate evidence without adding schema.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of flag-off and missing-config validation cases, no CrabTrap activity is recorded and unrelated workflows continue unchanged.
- **SC-002**: In 100% of valid signed denial-summary fixture replays, exactly one security activity entry is created for each unique event.
- **SC-003**: In 100% of malformed, unsigned, stale, replayed, oversized, and unsafe-field fixture cases, zero activity entries are created.
- **SC-004**: Accepted activity evidence contains only approved bounded summary fields and hashes, with zero raw headers, bodies, cookies, Authorization values, API keys, query secrets, provider payloads, or full audit rows found during review.
- **SC-005**: A reviewer can verify from the final diff and PR packet that no schema migration, OpenAPI contract, scheduler/task-dispatch dependency, new panel, notification fanout, GitHub mutation, task terminal mutation, or successor-selection behavior was added.
- **SC-006**: Human fixture replay and activity inspection can be completed in under 15 minutes without requiring a live CrabTrap service.

## Assumptions

- Official CrabTrap remains an outbound HTTP/HTTPS proxy with audit logs, admin APIs, metrics, and denial alerting, but no public generic webhook contract for this slice.
- The first Paddock slice stays helper-only and library-first: it validates Paddock-owned signed denial-summary fixtures through the adapter boundary rather than introducing a runtime route, webhook API, custom sender receiver, or CrabTrap admin-API polling.
- Timestamp tolerance, replay storage mechanics, and max payload size are planning decisions that must preserve the requirements above. Runtime header names and private route behavior are deferred unless a future spec ratifies live intake.
- The signed helper fixture has a delivery timestamp for the signature/freshness window and an event `occurred_at` timestamp for evidence/replay identity; Plan may choose the same field only if the distinction is explicit and tests remain deterministic.
- Existing activity inspection surfaces are sufficient for this spec; new panels, alerts, and notification fanout are deferred.
- Workspace/project scope is included only when the adapter context supplies approved bounded scope; otherwise accepted evidence remains facility/global without task or project mutation.
- Built-in platform cryptography is expected to be sufficient unless planning proves a pinned runtime dependency is necessary.
- Live CrabTrap route, custom sender, and admin-polling integration belong to a future CrabTrap architecture/follow-up spec, not SPEC-011 implementation tasks.
