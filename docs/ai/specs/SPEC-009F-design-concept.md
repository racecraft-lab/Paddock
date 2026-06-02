---
topic: "Production triage outcome routing"
slug: "production-triage-routing"
date: "2026-05-21"
mode: "setup"
spec_id: "SPEC-009F"
source_input:
  type: "topic"
  ref: "SPEC-009F roadmap entry in docs/ai/rc-factory-technical-roadmap.md"
question_count: 15
stop_reason: "natural"
---

# Design Concept: Production Triage Outcome Routing

> **Source:** SPEC-009F roadmap entry in `docs/ai/rc-factory-technical-roadmap.md`
> **Date:** 2026-05-21
> **Questions asked:** 15
> **Stop reason:** natural

## Goals

- Route every non-remediation Issue Triage outcome into a production-visible lane without entering Issue Remediation.
- Preserve GitHub as tracker truth while making Paddock's stored evidence sufficient for operator review.
- Produce recommendation-only next actions in v1, with no automatic close, reject, comment, label, assign, claim, dispatch, SpecKit setup, runner, sandbox, adapter, or auto-merge side effects.
- Extend the existing task-local Evidence route and section from SPEC-009E instead of creating a separate routing surface.
- Persist typed, validated lane artifacts through existing disposition, artifact, and activity storage.
- Keep repeated routing idempotent by source triage task and outcome.

## Non-goals

- Live GitHub issue closing, commenting, label application, or state mutation in v1 - answered in Q1, Q13, and Q14.
- Automatic SpecKit setup, spec branch/worktree creation, or SDD execution for `NEEDS_SPEC` - answered in Q2 and Q15.
- Automatic specialist assignment, claim, dispatch, runner state, sandbox lifecycle, harness adapter work, or auto-merge policy - answered in Q4 and Q14.
- New database tables or migrations for triage routing events - answered in Q8.
- New workflow successor templates for non-remediation outcomes - answered in Q9 and Q15.
- Separate global or task-external triage-routing UI/API surface - answered in Q6.

## Design Tree (Q&A log)

### Q1. For SPEC-009F, should non-remediation outcomes create only Paddock routing/evidence recommendations first, or should any outcome perform live GitHub/task-closing side effects in v1?

**Branch:** Side-effect boundary

**Recommended answer:** Recommendation-only routing/evidence.
> This keeps SPEC-009F inside the roadmap boundary: production routing/evidence for non-remediation outcomes, no remediation execution, polling, claims, runner, sandbox, adapter, or auto-merge work.

**Alternatives offered:**
- Some live effects: allow tightly scoped live effects for duplicate/obsolete/invalid, increasing UAT and rollback risk.
- Full automation: automatically route or close every non-remediation outcome, broadening into claim/poller/owner-control work.

**User's answer:** A - Recommendation-only routing/evidence.

---

### Q2. For the `NEEDS_SPEC` lane, should SPEC-009F create a concrete SpecKit-ready handoff artifact, or only label the issue/task as needing SDD without drafting the handoff?

**Branch:** SDD handoff

**Recommended answer:** Create a SpecKit-ready handoff artifact.
> The artifact should capture source issue, triage rationale, proposed spec scope, non-goals, and evidence links without invoking `$speckit-setup` or creating a worktree. That gives later operators a durable handoff while preserving human control.

**Alternatives offered:**
- Label only: mark the task/issue as `NEEDS_SPEC` with evidence, leaving humans to reconstruct the SDD brief later.
- Auto-start setup: create the handoff and invoke `$speckit-setup` automatically, expanding into autonomous SpecKit lifecycle work.

**User's answer:** A - Create a SpecKit-ready handoff artifact, no automatic setup.

---

### Q3. For `NEEDS_HUMAN`, should the lane produce an explicit clarification request assigned to the issue owner/reporter, or should it just pause with a generic needs-human status?

**Branch:** Human clarification

**Recommended answer:** Create an explicit clarification request.
> Store blocking questions, target audience, evidence needed, and owner-facing next action. Do not message externally or change GitHub state automatically in v1.

**Alternatives offered:**
- Generic pause only: record `NEEDS_HUMAN` and rationale, leaving operators to decide what to ask later.
- External prompt now: automatically comment or message the reporter with clarification questions, adding live side effects.

**User's answer:** A - Create a stored clarification-request artifact.

---

### Q4. For `NEEDS_SPECIALIST`, should SPEC-009F assign a specialist lane using existing Paddock agent/project metadata, or leave it as an unassigned recommendation?

**Branch:** Specialist routing

**Recommended answer:** Use existing metadata to recommend a specialist owner/lane when available.
> Recommendation-only matching gives operators a useful next action while avoiding automatic assignment, claim, or dispatch. If no safe match exists, expose an explicit unassigned-specialist state.

**Alternatives offered:**
- Always unassigned: record the specialist need and rationale, but do not attempt matching.
- Auto-assign/dispatch: immediately assign or launch specialist work when a matching agent exists.

**User's answer:** A - Recommend from existing metadata when safe; fall back to unassigned.

---

### Q5. For duplicate, obsolete, and invalid outcomes, should they share one closure recommendation model, or should each have its own artifact shape and UI/evidence contract?

**Branch:** Closure recommendation model

**Recommended answer:** Use one closure-recommendation model with outcome-specific required fields.
> A shared model keeps the API and UI compact while preserving reviewability: duplicate requires a duplicate target link, obsolete requires superseding context, and invalid requires invalid reason or evidence gap.

**Alternatives offered:**
- Separate artifact models: clearer per outcome but heavier.
- Generic evidence only: store disposition/rationale and skip closure-specific fields.

**User's answer:** A - Shared closure-recommendation model with outcome-specific required fields.

---

### Q6. Should SPEC-009F expose these non-remediation lanes through the existing task Evidence section/API from SPEC-009E, or create a separate triage-routing surface?

**Branch:** Operator surface

**Recommended answer:** Extend the existing task Evidence route and section with a `triage_routing` section.
> SPEC-009E established a generic task-local evidence pattern. Reusing it avoids a second surface and lets operators inspect disposition, lane, artifacts, and deferred side effects in one place.

**Alternatives offered:**
- Separate triage-routing route/section: clearer ownership but duplicates patterns.
- Backend only for v1: persist lane artifacts and tests, but defer operator-facing display.

**User's answer:** A - Extend task-local Evidence with `triage_routing`.

---

### Q7. Should SPEC-009F require a new feature flag, or should it run under the existing pilot/product-line scope used by the Paddock workflow family?

**Branch:** Rollout scope

**Recommended answer:** Use the existing `PILOT_PADDOCK_E2E` product-line scope for v1.
> The behavior is recommendation-only and belongs to the Paddock workflow family. Avoiding a new flag reduces flag lifecycle overhead unless Clarify proves a separate flag is needed.

**Alternatives offered:**
- Add a dedicated flag such as `FEATURE_PRODUCTION_TRIAGE_ROUTING`.
- No flag: enable recommendation lanes for all Issue Triage workflows once merged.

**User's answer:** A - Use existing `PILOT_PADDOCK_E2E` product-line scope for v1.

---

### Q8. Where should SPEC-009F persist the non-remediation lane outputs?

**Branch:** Persistence

**Recommended answer:** Reuse existing `task_dispositions`, `task_artifacts`, and `activities` rows with typed artifact payloads.
> This follows SPEC-009C2/SPEC-009E storage patterns, avoids a migration, and keeps evidence durable through existing review surfaces.

**Alternatives offered:**
- Add a new `triage_routing_events` table.
- Store only in activity metadata.

**User's answer:** A - Reuse existing disposition, artifact, and activity rows.

---

### Q9. After a non-remediation outcome is routed, what should happen to the original Issue Triage task status?

**Branch:** State lifecycle

**Recommended answer:** Mark the triage task complete with terminal non-remediation lane evidence.
> The triage work is done once the lane evidence and recommendation are recorded. Follow-up action remains operator-driven rather than an automatic successor.

**Alternatives offered:**
- Leave the triage task paused/open until an operator manually accepts the recommendation.
- Create a new follow-up task for every non-remediation lane.

**User's answer:** A - Complete the triage task with terminal lane evidence.

---

### Q10. What should the UAT fixture strategy be for SPEC-009F?

**Branch:** UAT and test strategy

**Recommended answer:** Use deterministic local/fixture-driven triage outputs for all six non-remediation outcomes, plus one operator-readable task Evidence inspection path.
> This proves the six lane contracts without live GitHub mutation or cleanup burden, while still validating the operator-facing evidence surface.

**Alternatives offered:**
- Use fresh live GitHub issues for each outcome.
- Use unit tests only, with no task Evidence/browser/operator inspection path.

**User's answer:** A - Fixture-driven outcomes plus one operator-readable Evidence inspection path.

---

### Q11. Should SPEC-009F define strict schemas for each lane artifact payload, or allow free-form artifact metadata?

**Branch:** Payload contract

**Recommended answer:** Define strict typed payload schemas per lane family, validated before persistence.
> Strict schemas support reviewability and future automation without introducing new storage. Lane families are SpecKit handoff, clarification request, specialist recommendation, and closure recommendation.

**Alternatives offered:**
- Loose common shape with optional fields.
- Free-form payloads with only disposition validation.

**User's answer:** A - Strict typed schemas per lane family.

---

### Q12. How should SPEC-009F handle repeated triage runs with the same non-remediation outcome?

**Branch:** Idempotency

**Recommended answer:** Make routing idempotent by outcome and source triage task.
> Repeated equivalent routing should update or supersede the existing lane artifact/activity without duplicate terminal evidence.

**Alternatives offered:**
- Append every run as a new artifact/event for full history.
- Reject repeat routing attempts as conflicts.

**User's answer:** A - Idempotent by outcome and source triage task.

---

### Q13. Should SPEC-009F include GitHub label recommendations in the stored evidence, even though it will not apply labels automatically?

**Branch:** GitHub label recommendations

**Recommended answer:** Include proposed label changes as recommendation metadata only.
> Suggested labels such as `pd:needs-spec`, `pd:needs-human`, `pd:needs-specialist`, `pd:duplicate`, `pd:obsolete`, or `pd:invalid` help operators execute next actions manually without the system mutating GitHub.

**Alternatives offered:**
- No labels in v1.
- Apply labels automatically while keeping other effects recommendation-only.

**User's answer:** A - Include proposed GitHub labels as recommendation metadata only.

---

### Q14. Should SPEC-009F provide operator action controls, or only display evidence and recommended next steps?

**Branch:** Operator actions

**Recommended answer:** Display evidence and recommended next steps only; no action buttons in v1.
> This matches recommendation-only scope and prevents accidentally implementing live close/comment/assign/spec setup behavior.

**Alternatives offered:**
- Add disabled/future action controls.
- Add enabled controls for operator-confirmed actions.

**User's answer:** A - Evidence and recommended next steps only.

---

### Q15. Should SPEC-009F change the workflow contract by adding successor templates for non-remediation outcomes, or keep them as terminal Issue Triage outcomes with evidence only?

**Branch:** Workflow contract and successors

**Recommended answer:** Keep them terminal in Issue Triage.
> Update output handling/schema/evidence so non-remediation dispositions complete the triage task with lane artifacts and no successor templates. This preserves the roadmap boundary and avoids hidden follow-up work.

**Alternatives offered:**
- Add non-remediation successor templates.
- Add only a `NEEDS_SPEC` successor template and keep the rest terminal.

**User's answer:** A - Keep non-remediation outcomes terminal in Issue Triage.

## Open Questions

- **What:** Exact specialist matching inputs and confidence rules.
  **Why deferred:** Q4 chose recommendation matching from existing metadata, but the precise fields should be verified against current code in Clarify/Plan.
  **Suggested next step:** Resolve during `/speckit.clarify` and consensus against `projects`, `agents`, `project_agent_assignments`, and task metadata.
- **What:** Exact v1 response shape for `triage_routing` inside task evidence.
  **Why deferred:** Q6 chose the existing Evidence route/section, but field naming should align with SPEC-009E implementation details.
  **Suggested next step:** Resolve during Plan using `src/lib/task-evidence.ts` and `GET /api/tasks/[id]/evidence`.
- **What:** Whether `PILOT_PADDOCK_E2E` alone is sufficient or a dedicated flag is needed.
  **Why deferred:** Q7 defaults to the existing pilot/product-line scope, but Clarify should verify operator rollout expectations.
  **Suggested next step:** Clarify before Plan; add a new flag only if concrete rollout evidence requires it.

## Recommended Next Step

Run `$speckit-autopilot docs/ai/specs/SPEC-009F-workflow.md` from the `009f-production-triage-routing` worktree after setup commits and pushes this design concept and workflow file.
