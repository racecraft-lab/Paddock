---
topic: "Pilot Review Packet and Lifecycle Snapshot"
slug: "spec-009d-pilot-review-lifecycle"
date: "2026-05-20"
mode: "setup"
spec_id: "SPEC-009D"
source_input:
  type: "interactive"
  ref: "SPEC-009D roadmap entry plus Grill Me setup interview"
question_count: 8
stop_reason: "natural"
---

# Design Concept: Pilot Review Packet and Lifecycle Snapshot

> **Source:** SPEC-009D roadmap entry plus interactive setup interview
> **Date:** 2026-05-20
> **Questions asked:** 8
> **Stop reason:** natural

## Goals

- Materialize one compact review packet for the Mission Control self-hosting pilot.
- Derive the packet from existing Mission Control evidence: tasks, activities, notifications, task artifacts, quality reviews, governance rows, smoke checklist evidence, and linked GitHub issue/PR fields.
- Preserve reviewability by storing the packet as SPEC-007-backed artifacts with source-map pointers rather than creating a new review-packet table.
- Make unsupported run-state, claim-state, sandbox, adapter, and automatic GitHub polling fields explicit `deferred` or `not_available` values with owning future specs.
- Produce both a machine-readable JSON packet and a human-readable Markdown summary.
- Anchor packet identity to the GitHub issue and root task, including lifecycle descendants and PR evidence.
- Complete SPEC-009C4 PR merge and HAL target deployment/UAT closeout before treating SPEC-009D setup as unblocked.

## Non-goals

- No new persistent review-packet table or schema migration; use SPEC-007 artifact storage plus source-map pointers instead (Q1).
- No fresh GitHub API calls are required to assemble the packet; use stored Mission Control evidence first and surface missing/stale evidence explicitly (Q2).
- No placeholder schema for future runner, sandbox, adapter, claim, retry, or automatic polling state; deferred fields must name SPEC-013A/A1/B/C or SPEC-014A-D as the owner (Q3).
- No new evidence dashboard in this spec; an API or small UI seam is allowed only if it fits an existing route/panel pattern, while broader operator evidence surfaces belong to SPEC-009E (Q4).
- No raw secret or oversized evidence embedding; reuse SPEC-007 redaction, compact previews, hashes, and source pointers (Q5).
- No single-format artifact; JSON-only is too opaque for review, and Markdown-only is too weak for downstream validation (Q6).
- No issue-only identity model that loses task-chain lineage, and no task-only model that loses the external GitHub audit trail (Q7).
- No setup execution before SPEC-009C4 merge and HAL target deployment/UAT evidence exist (Q8).

## Design Tree (Q&A log)

### Q1. How should SPEC-009D persist the pilot review packet?

**Branch:** Packet persistence model

**Recommended answer:** Persist a compact SPEC-007-backed artifact with source-map pointers to existing rows; do not add a new review-packet table.
> SPEC-007 already owns task artifact provenance, hashes, redaction state, and preview metadata. Reusing it keeps SPEC-009D additive and reviewable while still giving later specs a durable packet to consume.

**Alternatives offered:**
- Add a dedicated `pilot_review_packets` table: stronger relational shape, but adds schema surface before the packet contract has proven value.
- Keep the packet entirely transient: lowest persistence cost, but weakens review and follow-on SPEC-013A traceability.

**User's answer:** Option A.

---

### Q2. Should packet assembly refresh GitHub state live, or trust stored Mission Control evidence first?

**Branch:** Evidence freshness

**Recommended answer:** Use stored Mission Control evidence first. Do not require fresh GitHub calls to assemble the packet.
> SPEC-009C4 already proved sync reconciliation and label/status projection. SPEC-009D should review what Mission Control has recorded, not introduce a new external dependency or polling behavior.

**Alternatives offered:**
- Always call GitHub during packet assembly: fresher, but couples review packet generation to credentials, rate limits, and future sync automation.
- Allow optional live refresh as a best-effort fallback: useful later, but risks turning packet assembly into another sync path.

**User's answer:** Option A.

---

### Q3. How should SPEC-009D represent fields that later control-plane and runner specs will own?

**Branch:** Future-field boundary

**Recommended answer:** Include explicit `deferred` or `not_available` fields with owning future spec references: SPEC-013A/A1/B/C for run, sync, claim, and retry state; SPEC-014A-D for sandbox and adapter state.
> The packet should make absence visible without pretending durable state exists. This creates a concrete baseline for later specs without adding placeholder schema.

**Alternatives offered:**
- Omit unsupported fields entirely: simpler, but reviewers cannot see what is intentionally missing.
- Add placeholder columns or JSON blobs for future state now: tempting, but violates avoid-speculative-generality and expands schema ownership.

**User's answer:** Option A.

---

### Q4. What operator surface should SPEC-009D expose?

**Branch:** API and UI surface

**Recommended answer:** Produce the artifact and add an API only if an existing seam fits cleanly; do not build a new evidence dashboard.
> The roadmap puts operator-visible eligibility/evidence surfaces in SPEC-009E. SPEC-009D's job is the packet contract and current-state derivation.

**Alternatives offered:**
- Build a full UI dashboard now: useful for operators, but overlaps SPEC-009E and broadens the review surface.
- Keep the artifact only with no API: smallest scope, but may make packet inspection awkward if an existing route can expose it cheaply.

**User's answer:** Option A.

---

### Q5. How should packet assembly handle secrets and oversized evidence?

**Branch:** Redaction and evidence size

**Recommended answer:** Reuse SPEC-007 redaction and compact evidence behavior: summaries, hashes, source pointers, byte counts, redaction status, and security-scan state.
> The constitution requires no raw secret leakage in activities or artifacts. SPEC-007 already defines artifact provenance and secret-handling semantics.

**Alternatives offered:**
- Inline full artifact content in the packet: easier to read, but risks leaking secrets and creating large review payloads.
- Drop any evidence that is too large or redacted: safe, but loses traceability and makes the packet less useful.

**User's answer:** Option A.

---

### Q6. What format should the review packet use?

**Branch:** Artifact format

**Recommended answer:** Publish a JSON packet plus a Markdown summary.
> JSON gives downstream specs and tests a stable contract. Markdown gives a human reviewer a readable PR packet without terminal archaeology.

**Alternatives offered:**
- JSON only: machine-readable, but poor as a human review artifact.
- Markdown only: readable, but weak for contract tests and later automation.

**User's answer:** Option A.

---

### Q7. What identity should anchor the packet?

**Branch:** Packet identity

**Recommended answer:** Anchor on the GitHub issue plus root task, and include lifecycle descendants and PR evidence.
> The GitHub issue is the external pilot identity, while the root task and descendants prove the Mission Control lifecycle. Both are required for review.

**Alternatives offered:**
- GitHub issue only: preserves external audit trail, but loses internal task-chain evidence.
- Root task only: preserves Mission Control lineage, but weakens linkage to issue/PR labels and merge state.

**User's answer:** Option A.

---

### Q8. What must be true before SPEC-009D setup proceeds?

**Branch:** Dependency gate

**Recommended answer:** Require SPEC-009C4 closeout first: PR merge plus target deployment promotion/UAT evidence.
> SPEC-009D consumes C4's done-reconciliation evidence. Starting D before C4 target closeout would make the packet source trail incomplete.

**Alternatives offered:**
- Start D after C4 branch UAT only: faster, but risks building on evidence not yet proven on the target deployment.
- Start D while C4 PR is still open and patch later: creates stale setup assumptions and weakens traceability.

**User's answer:** Option A.

## Open Questions

- **What:** Exact API route, if any, for reading the packet.
  **Why deferred:** Q4 selected "artifact plus API only if an existing seam fits." The spec/plan phases should inspect current routes and choose the smallest consistent seam or artifact-only behavior.
  **Suggested next step:** Clarify and Plan should decide whether an existing task artifact or task detail route can expose the packet without creating the SPEC-009E dashboard early.
- **What:** Exact JSON field names for future-state deferrals.
  **Why deferred:** Q3 fixed the policy and owning specs, but field naming should be generated with the formal spec so tests can bind to FR IDs.
  **Suggested next step:** Specify should require explicit deferred fields for SPEC-013A/A1/B/C and SPEC-014A-D ownership, then Plan should define the JSON contract.

## Recommended Next Step

Run `$speckit-autopilot docs/ai/specs/SPEC-009D-workflow.md` from the `009d-pilot-review-lifecycle` worktree after setup commits and pushes this design concept, workflow file, and roadmap status update.
