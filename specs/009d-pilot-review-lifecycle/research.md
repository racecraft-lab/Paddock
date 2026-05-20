# Research: Pilot Review Packet and Lifecycle Snapshot

## Decision: Persist packet output as SPEC-007 task artifacts

**Rationale**: Existing task artifacts already provide artifact ids, storage kind, MIME type, schema version, hashes, byte counts, preview text, redaction status, security-scan status, supersession, and task ownership. Reusing this path satisfies FR-005 through FR-008 without a new table.

**Alternatives considered**:
- Dedicated `pilot_review_packets` table: rejected because the setup decision says no new review-packet table and no schema migration.
- Transient packet generation only: rejected because reviewers need durable JSON and Markdown artifacts.

## Decision: Assemble from stored Mission Control evidence only

**Rationale**: SPEC-009D reviews what Mission Control has recorded. Stored `tasks`, `activities`, `notifications`, `task_artifacts`, `quality_reviews`, `resource_policy_events`, `github_syncs`, and smoke checklist evidence are the packet source. No fresh GitHub call is required during assembly.

**Alternatives considered**:
- Always refresh GitHub during packet assembly: rejected due credential, rate-limit, and scope expansion risk.
- Optional live refresh fallback: rejected because it creates another sync path and overlaps SPEC-013A1.

## Decision: Use JSON plus Markdown generated from the same snapshot

**Rationale**: JSON gives downstream validation a stable contract. Markdown gives PR reviewers a compact packet without terminal archaeology. Generating both from the same packet object makes SC-003 testable.

**Alternatives considered**:
- JSON only: rejected as reviewer-hostile.
- Markdown only: rejected as weak for source-map and future automation validation.

## Decision: Key `source_map` by RFC 6901-style JSON Pointer paths

**Rationale**: Pointer keys let tests assert 100% evidence-backed claim coverage and let reviewers trace individual values to table rows, artifact ids, checklist anchors, GitHub issue/PR numbers, or sync rows.

**Alternatives considered**:
- Inline source metadata next to each field: rejected because it bloats the packet and makes Markdown/JSON consistency harder.
- Free-form notes: rejected because they are difficult to validate.

## Decision: Represent unavailable future state as explicit deferrals

**Rationale**: The packet must make absence visible without introducing future capabilities. `deferrals.<field>` entries carry `state`, `owner_specs`, `reason_code`, `reason`, and optional `source_map`.

**Alternatives considered**:
- Omit unsupported fields: rejected because future implementers need to know absence is intentional.
- Add placeholder schema/runtime state now: rejected as speculative and outside SPEC-009D.

## Decision: Reject local-only lookalikes using stored GitHub linkage and sync proof

**Rationale**: Candidate eligibility requires `github_repo`, `github_issue_number`, `github_synced_at`, and either linked `github_pr_number` or checklist-backed issue/PR evidence. Candidates missing proof are `local_only_excluded` or incomplete, not proven pilot packets.

**Alternatives considered**:
- Match by task title or lifecycle shape: rejected because it can confuse local-only lookalikes with the proven pilot.
- Allow partial proof to publish as complete: rejected by FR-002 and FR-013.

## Decision: Preserve SPEC-007 redaction and preview semantics

**Rationale**: The packet records metadata, hashes, byte counts, safe previews, and packet-local `evidence_state` values without changing existing artifact enums or exposing quarantined/unsafe content.

**Alternatives considered**:
- Inline full artifact content: rejected because it risks secret leakage and oversized packet bodies.
- Drop redacted/oversized evidence entirely: rejected because traceability would be lost.

## Decision: No packet-specific API route by default

**Rationale**: Existing artifact list/read seams can publish, list, and inspect packet artifacts. A new route would be a second primary surface and risks pulling SPEC-009E dashboard scope into SPEC-009D.

**Alternatives considered**:
- New `GET /api/pilot-review-packet` endpoint: rejected unless tasks prove existing artifact seams cannot satisfy SC-001.
- Full evidence dashboard: rejected as SPEC-009E or later.
