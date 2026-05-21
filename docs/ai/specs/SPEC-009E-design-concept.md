---
topic: "Pilot Eligibility and Evidence Surfaces"
slug: "spec-009e-pilot-evidence-surfaces"
date: "2026-05-20"
mode: "setup"
spec_id: "SPEC-009E"
source_input:
  type: "interactive"
  ref: "SPEC-009E roadmap entry plus Grill Me setup interview"
question_count: 7
stop_reason: "natural"
---

# Design Concept: Pilot Eligibility and Evidence Surfaces

> **Source:** SPEC-009E roadmap entry plus interactive setup interview
> **Date:** 2026-05-20
> **Questions asked:** 7
> **Stop reason:** natural

## Goals

- Give operators a read-only evidence surface for a GitHub-linked task without terminal archaeology.
- Start from the self-hosting pilot evidence already produced by SPEC-009C1 through SPEC-009D.
- Generalize the surface as task evidence, not as a pilot-only endpoint that must be renamed later.
- Show eligibility inputs, GitHub/task identity, packet artifact references, smoke state, current stage, and future-state deferrals in one task-local view.
- Preserve stored-evidence truth: missing, stale, local-only, or incomplete evidence is visible and never upgraded into a proven pilot claim.
- Keep SPEC-009E read-only. Do not generate new packets, trigger GitHub sync, run smoke scripts, mutate artifacts, or introduce a new schema.

## Non-goals

- No broad diagnostics dashboard or global evidence page in this spec; the first surface lives in the task context (Q1, Q4).
- No live GitHub refresh during evidence display; automatic sync and poller lifecycle remain future SPEC-013A1 work (Q2, Q6).
- No new evidence table or schema migration; derive from stored tasks, activities, artifacts, quality reviews, governance rows, SPEC-009D packet artifacts, and smoke checklist references (Q2).
- No pilot-named route that creates later rename churn; the route should be generic task evidence with v1 pilot-derived sections (Q3).
- No client-side evidence assembly spread across existing routes when a narrow server-side read route can keep the evidence contract testable (Q3).
- No manual operator override that marks a local-only or partial-proof task as pilot-proven (Q5).
- No packet generation, smoke execution, GitHub sync action, claim authority, retry control, sandbox lifecycle, adapter registry, or harness execution (Q6).
- No API-only acceptance path; UAT must prove the operator-facing UI against stored evidence (Q7).

## Design Tree (Q&A log)

### Q1. For SPEC-009E, where should the first operator-facing pilot evidence surface live?

**Branch:** Surface placement

**Recommended answer:** Task detail evidence tab/API.
> Attach read-only pilot eligibility, packet, and smoke evidence to the GitHub-linked task context with the smallest navigation change. This keeps the surface close to the work item and avoids a broad dashboard before the evidence model proves itself.

**Alternatives offered:**
- Diagnostics panel: better for comparing multiple pilot issues, but broadens UI and filtering scope.
- Artifact-only: narrowest code path, but does not meet the "no terminal archaeology" goal.

**User's answer:** Option A.

---

### Q2. What should SPEC-009E treat as the source of truth for the read-only evidence surface?

**Branch:** Evidence authority

**Recommended answer:** Stored Mission Control evidence only.
> Derive from SPEC-009C eligibility rows, SPEC-009D packet artifacts, task/activity/artifact/governance/review rows, and smoke checklist references. Missing or stale state should be explicit instead of hidden behind a live refresh.

**Alternatives offered:**
- Stored evidence plus live GitHub refresh: fresher, but pulls sync automation into this spec.
- New evidence table: cleaner read model, but adds schema before the surface proves its shape.

**User's answer:** Option A.

---

### Q3. What API shape should SPEC-009E plan?

**Branch:** API contract

**Recommended answer:** Add one generic task-scoped read route, such as `GET /api/tasks/[id]/evidence`, with a v1 response containing pilot eligibility, review packet/artifact references, smoke evidence, and deferred future sections.
> A route named `/pilot-evidence` would be too narrow if this is the durable pattern for all future task evidence. The route should be generic now, while the response clearly labels which sections are pilot-derived and which sections are deferred to later specs.

**Alternatives offered:**
- Add a pilot-named route now and rename/generalize later: narrower for this PR, but creates churn.
- Avoid a new route and compose from existing task/artifact APIs in the UI: avoids route design, but spreads evidence logic into the client.

**User's answer:** Option A.

---

### Q4. What UI placement should the Task detail evidence surface use?

**Branch:** UI placement

**Recommended answer:** Add a compact read-only Evidence section or tab inside the existing task detail surface, visible only when evidence exists or the task is GitHub-linked/pilot-relevant.
> The task context already carries the identity operators need. A compact section avoids inventing a global evidence product surface before production triage and run-state specs land.

**Alternatives offered:**
- Add a new global Evidence page: more discoverable later, but too broad for this spec.
- Add only a link from task detail to artifact admin: minimal, but does not summarize eligibility or smoke evidence in context.

**User's answer:** Option A.

---

### Q5. How should SPEC-009E handle local-only or partial-proof tasks in this surface?

**Branch:** Incomplete evidence states

**Recommended answer:** Show explicit "not pilot eligible" or "incomplete evidence" states with missing proof reasons, and never present them as a proven pilot lifecycle.
> This preserves SPEC-009C1 and SPEC-009D stored-evidence truth. Operators need to debug why evidence is missing without allowing manual proof overrides.

**Alternatives offered:**
- Hide local-only and partial-proof tasks entirely: reduces noise, but makes eligibility failures harder to debug.
- Allow operators to manually mark a task as pilot-proven: convenient, but undermines stored-evidence truth.

**User's answer:** Option A.

---

### Q6. Should SPEC-009E add any write actions, such as generating packets, rerunning smoke checks, or triggering GitHub sync?

**Branch:** Mutability boundary

**Recommended answer:** No writes in SPEC-009E.
> The spec is read-only: display stored evidence and provide links or references to existing artifacts and smoke checklist evidence. Packet generation belongs to SPEC-009D behavior, and sync automation belongs to SPEC-013A1.

**Alternatives offered:**
- Add a "generate latest packet" action: useful, but mutates artifact state and overlaps SPEC-009D.
- Add a "sync GitHub now" action: useful operationally, but belongs with GitHub sync automation/control in SPEC-013A1.

**User's answer:** Option A.

---

### Q7. What should the UAT gate prove after merge?

**Branch:** Human validation

**Recommended answer:** Open a retained pilot issue/task and verify the Evidence surface shows eligibility inputs, linked GitHub/task identity, packet artifact references, smoke state, current stage, and future run/sandbox fields as deferred.
> The roadmap requires an operator-visible surface, not only tests or artifact output. UAT should prove the UI reads stored evidence correctly for the retained pilot trail.

**Alternatives offered:**
- Only verify the API JSON response: precise, but misses the operator-facing goal.
- Only verify the UI render with fixture data: checks presentation, but not the stored-evidence path.

**User's answer:** Option A.

## Open Questions

- **What:** Exact task detail component seam for the Evidence section or tab.
  **Why deferred:** Q4 fixed task-context placement, but implementation should inspect the current task detail and panel structure before selecting the smallest UI seam.
  **Suggested next step:** Clarify and Plan should determine whether the existing task board/detail surface already has tab or section affordances, then keep the UI change compact.
- **What:** Exact `GET /api/tasks/[id]/evidence` response field names and status enums.
  **Why deferred:** Q3 fixed the route shape and broad sections, but formal field names should be generated with the spec so tests can bind to FR IDs.
  **Suggested next step:** Specify should require stable status fields for eligible, not eligible, incomplete, missing, stale, available, and deferred evidence; Plan should define the contract.
- **What:** How broadly the generic task evidence route should serve non-pilot tasks in v1.
  **Why deferred:** Q3 chose a generic route name, but SPEC-009E remains pilot-derived. Production triage outcomes and run/claim/sandbox evidence are future specs.
  **Suggested next step:** Specify should state that non-pilot tasks may receive an empty or deferred evidence response, while pilot/GitHub-linked tasks get the first complete sections.

## Recommended Next Step

Run `$speckit-autopilot docs/ai/specs/SPEC-009E-workflow.md` from the `009e-pilot-evidence-surfaces` worktree after setup commits and pushes this design concept, workflow file, and roadmap status update.
