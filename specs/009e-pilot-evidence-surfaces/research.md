# Research: Pilot Evidence Surfaces

## Decision: Use a generic task-scoped route

Use `GET /api/tasks/[id]/evidence` as the v1 route. The response is a task evidence envelope with pilot-derived sections instead of a pilot-only endpoint.

**Rationale**: The feature is intended to establish a durable task evidence pattern. The design concept explicitly states: "A route named `/pilot-evidence` would be too narrow if this is the durable pattern for all future task evidence." Task scoping also preserves existing workspace/task authorization semantics and avoids global evidence navigation.

**Alternatives considered**:

- `/pilot-evidence`: rejected as too narrow for future task evidence.
- Global Evidence page/API: rejected by strict scope guardrails and FR-017.
- Reusing artifact read routes directly: rejected because artifact routes expose artifact-specific semantics, while this feature needs a task-local aggregate.

## Decision: Derive evidence from stored rows only

The route reads current task/activity rows for live stage and identity, packet artifacts for packet existence and snapshot references, current artifact/review/governance/GitHub sync rows for section evidence, and smoke proof only when already stored as packet/source-map references or static UAT links.

**Rationale**: SPEC-009E is a read-only evidence display. The design concept requires: "SPEC-009E adds no write actions." Stored evidence derivation prevents the route from accidentally becoming a sync, packet, smoke, or claim authority path.

**Alternatives considered**:

- Calling GitHub live: rejected by FR-014 and FR-015.
- Calling `buildPilotReviewPacket()` on `GET`: rejected because that would make the route a packet-generation path.
- Parsing `docs/qa/pilot-smoke-checklist.md` at runtime: rejected by FR-029.

## Decision: Build a lightweight `task-evidence` helper

Implement a helper with generic task evidence naming, reusing SPEC-009D constants/types and existing stored artifact metadata readers where available. The helper returns a serializable evidence envelope consumed by the route and UI.

**Rationale**: A helper keeps route code small, makes incomplete/not-eligible domain states testable without HTTP setup, and avoids duplicating derivation logic in the UI. Generic naming supports future task evidence without expanding v1 scope beyond pilot-derived sections.

**Alternatives considered**:

- Put all derivation in the route handler: rejected because it weakens focused unit coverage and reviewability.
- Reuse `buildPilotReviewPacket()` directly: rejected because the route must not publish, generate, or refresh packets on `GET`.
- Create broad evidence service architecture: rejected as speculative generality.

## Decision: Use explicit domain states in `200` responses

Return `200` for authenticated readable tasks even when pilot evidence is local-only, incomplete, unavailable, stale, redacted, quarantined, superseded, missing, or deferred. Use HTTP errors only for auth/scope/task existence boundaries.

**Rationale**: Missing evidence is domain data, not route failure. Explicit states let reviewers distinguish missing proof from route errors and satisfy FR-009 and FR-022.

**Alternatives considered**:

- `404` or empty body for non-pilot tasks: rejected because it hides review-relevant ineligibility.
- `409` for incomplete proof: rejected because incomplete evidence is expected for partial-proof tasks and must render in the UI.

## Decision: Render safe artifact references only

Artifact evidence exposes status, reason codes, source-map metadata, safe names, hashes/ids where already safe, and existing redacted previews only when metadata already contains a safe post-redaction preview.

**Rationale**: The spec must not expose quarantined content, storage URIs, object paths, signed URLs, raw secret values, parser internals, actor identity, or raw artifact content. Existing artifact read routes remain responsible for full content and their masking/quarantine behavior.

**Alternatives considered**:

- Inline artifact snippets: rejected by FR-021 and FR-028.
- Add quarantine override/read-through controls: rejected by strict scope guardrails and FR-028.

## Decision: Place Evidence inside task detail Details

Add a compact read-only Evidence section inside the existing task detail Details tab near task/GitHub metadata.

**Rationale**: Operators review this evidence in the task workflow. The section is always visible for opened tasks with density based on evidence state, and it avoids adding a fourth tab or global navigation for a compact v1 surface.

**Alternatives considered**:

- Fourth modal tab: rejected unless implementation proves Details unusable; the plan does not require it.
- Global Evidence page: rejected by strict scope guardrails.

## Decision: Record UAT in the pilot smoke checklist ledger

SPEC-009E UAT uses retained issue #50 / PR #51 and stored SPEC-009D packet/source-map and smoke-checklist evidence. If no live retained task row exists, a disposable UAT carrier task may be seeded only in a temp/scoped data directory and cleaned with backup/export evidence.

**Rationale**: UAT must verify operator-facing UI and preserve cleanup provenance without treating intentionally cleaned disposable rows as current active Mission Control state.

**Alternatives considered**:

- Commit binary screenshots: rejected by archive/evidence policy unless a manifest-backed exception is recorded.
- Treat cleaned rows as live state: rejected by FR-030.
