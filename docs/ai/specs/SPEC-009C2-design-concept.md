---
topic: "Triage-to-Remediation Plan Handoff"
slug: "spec-009c2-triage-remediation-handoff"
date: "2026-05-15"
mode: "setup"
spec_id: "SPEC-009C2"
source_input:
  type: "interactive"
  ref: "SPEC-009C2 roadmap entry plus Grill Me setup interview"
question_count: 6
stop_reason: "natural"
---

# Design Concept: Triage-to-Remediation Plan Handoff

> **Source:** SPEC-009C2 roadmap entry plus interactive setup interview
> **Date:** 2026-05-15
> **Questions asked:** 6
> **Stop reason:** natural

## Goals

- Prove that a SPEC-009C1 eligible GitHub-linked pilot task can complete the Mission Control Issue Triage workflow and hand off to Issue Remediation planning only when the triage disposition is `ACTIONABLE_REMEDIATION`.
- Keep the handoff policy repo-owned by updating the Mission Control workflow contract so the disposition taxonomy and routing behavior are visible before runtime import.
- Persist traceable disposition and artifact evidence for the triage decision using existing SPEC-007 surfaces.
- Reuse the existing SPEC-004 task-chain engine and `createTask` successor path instead of introducing a new control plane, scheduler, runner, or production operator action.
- Prove negative outcomes are clean exits: duplicate, obsolete, invalid, needs-human, needs-specialist, and `NEEDS_SPEC` outcomes must not create remediation-planning work in this slice.
- Use a fresh synthetic SPEC-009C2 pilot issue for live UAT rather than reusing closed SPEC-009C1 smoke issues.
- Add explicit future roadmap coverage for production non-remediation triage lanes so the current narrow proof does not hide required production vision work.

## Non-goals

- Production routing for `NEEDS_SPEC`, needs-human clarification, needs-specialist assignment, duplicate/obsolete/invalid close recommendations, or operator-visible non-remediation lanes; these are deferred to future production triage routing work (Q2, Q6).
- Issue Remediation development, review, Aegis, `ready_for_owner`, owner merge, or done reconciliation; SPEC-009C3 and SPEC-009C4 own those phases (Q5).
- New production UI/API for triage evidence or pilot observability; SPEC-009E and later production triage routing work own durable operator surfaces (Q2, Q6).
- Automatic GitHub sync polling, claim authority, run-state persistence, retry/debug controls, sandbox lifecycle, or harness adapter execution; SPEC-013A1, SPEC-013B/C, and SPEC-014A-D own those paths.
- Live GitHub mutation from automated tests or normal runtime; the fresh synthetic issue is a manual UAT action only (Q4).
- A new workflow language or replacement for the SPEC-004 task-chain engine; SPEC-009C2 should correct and use the existing workflow contract and task-chain semantics (Q1, Q3, Q5).

## Design Tree (Q&A log)

### Q1. For SPEC-009C2, should the triage handoff be implemented by making the existing Issue Triage workflow output a typed disposition artifact that the existing task-chain engine routes into Issue Remediation planning only for `ACTIONABLE_REMEDIATION`?

**Branch:** Handoff mechanism

**Recommended answer:** Yes, use typed triage output plus existing `workflow_templates.output_schema`, routing rules, `task_dispositions`, `task_artifacts`, and `advanceTaskChain` behavior.
> This matches the roadmap's "no new control plane yet" boundary and keeps SPEC-009C2 focused on handoff evidence instead of new UI/API machinery.

**Alternatives offered:**
- Add a new production API or operator action specifically for approving triage handoff: explicit human control earlier, but broadens the spec into production surface area.
- Keep SPEC-009C2 manual/checklist-only and do not create an actual remediation-planning successor: safest operationally, but under-delivers the acceptance gate.

**User's answer:** Option A, with concern that the roadmap may be missing future work required to fully implement the production vision.

---

### Q2. Should this setup add explicit future roadmap coverage for production non-remediation triage lanes, while keeping SPEC-009C2 limited to proving those outcomes do not create remediation work?

**Branch:** Roadmap completeness

**Recommended answer:** Yes, add roadmap future-spec coverage for `NEEDS_SPEC`, needs-human, and needs-specialist production routing.
> SPEC-009C2 should define the disposition taxonomy and prove clean exits; later specs should own SpecKit/SDD handoff, specialist assignment, human-clarification loops, and close recommendations.

**Alternatives offered:**
- Leave the roadmap unchanged and record this as an open question only: less churn now, but less concrete production planning.
- Fold those production routing lanes into SPEC-009C2 now: closes the gap immediately, but widens the P0 handoff slice.

**User's answer:** Option A.

---

### Q3. Should SPEC-009C2 update the repo-owned Mission Control workflow contract so Issue Triage emits the full disposition enum and routes `ACTIONABLE_REMEDIATION` directly to a remediation-planning template?

**Branch:** Workflow contract alignment

**Recommended answer:** Yes, update the contract in this spec.
> The current contract only has coarse `close | needs_spec | remediation` routing, while the roadmap requires duplicate, obsolete, invalid, needs-human, needs-specialist, `NEEDS_SPEC`, and `ACTIONABLE_REMEDIATION` behavior to be testable.

**Alternatives offered:**
- Leave the workflow contract unchanged and implement richer disposition mapping only in code/tests: less contract churn, but permits policy drift.
- Defer all workflow-contract changes to a later spec: preserves SPEC-009A/B artifacts, but lacks repo-owned policy for the handoff being proved.

**User's answer:** Option A.

---

### Q4. How should SPEC-009C2 handle the live smoke issue at setup time?

**Branch:** Live UAT source item

**Recommended answer:** Reuse the clean synthetic pilot issue/task pattern from SPEC-009C1, but create a fresh SPEC-009C2 synthetic issue during manual UAT rather than relying on the closed #42 issue.
> This keeps the end-to-end proof clean and repeatable without mutating old evidence.

**Alternatives offered:**
- Use the existing closed/previous synthetic issue as the seed: avoids another GitHub issue, but weakens the clean-state proof.
- Require a real non-synthetic Mission Control issue: closest to production, but risky for an early handoff smoke.

**User's answer:** Option A.

---

### Q5. Should SPEC-009C2 create actual remediation-planning successor tasks through `advanceTaskChain`, or only verify what successor would be created?

**Branch:** Successor side effects

**Recommended answer:** Create the actual remediation-planning successor through existing task-chain helpers for `ACTIONABLE_REMEDIATION`, and assert exactly zero successors for every non-remediation disposition.
> This satisfies the roadmap's handoff gate while keeping execution of the remediation chain for SPEC-009C3.

**Alternatives offered:**
- Only compute a dry-run handoff plan/artifact and do not create a successor: less mutation, but no live chain handoff proof.
- Create successors for remediation plus separate tasks for needs-human/specialist/spec: closer to production routing, but belongs in future-lane specs.

**User's answer:** Option A, with renewed concern that the roadmap may miss future production work.

---

### Q6. Should the roadmap add one consolidated future spec for production non-remediation triage lanes, or split those lanes into separate future specs?

**Branch:** Future production triage routing shape

**Recommended answer:** Add one future spec after the pilot evidence surfaces: `SPEC-009F Production Triage Outcome Routing`.
> It would own `NEEDS_SPEC` to SpecKit/SDD, needs-human clarification loops, needs-specialist routing, duplicate/obsolete/invalid close recommendations, and operator-visible lane evidence. This keeps SPEC-009C2 small while making the production vision explicit.

**Alternatives offered:**
- Split into separate future specs for `NEEDS_SPEC`, human clarification, specialist routing, and close/duplicate/invalid outcomes: more reviewable later, but more roadmap overhead now.
- Do not add a named future spec yet: lighter, but less actionable.

**User's answer:** Option A.

## Open Questions

- **What:** Exact canonical casing for the SPEC-009C2 triage disposition enum in runtime code and workflow contract.
  **Why deferred:** The roadmap uses `ACTIONABLE_REMEDIATION` and `NEEDS_SPEC`, while existing SPEC-007 disposition code uses a lower-case legacy enum. The setup decision is to make the richer taxonomy explicit; Specify/Clarify should settle the exact stored values and compatibility mapping.
  **Suggested next step:** Clarify should inspect `src/lib/task-dispatch.ts` `DISPOSITION_ENUM`, `isTriageTemplateSchema`, and `task_dispositions.disposition` behavior, then choose a compatibility-safe enum strategy.
- **What:** Exact artifact shape for the triage decision.
  **Why deferred:** The interview fixed that durable evidence is required, but implementation should inspect `publishArtifact`, current task artifact fields, and workflow contract export conventions before choosing JSON/Markdown shape.
  **Suggested next step:** Plan should define a small JSON artifact contract with redaction behavior and successor handoff references.
- **What:** Whether `SPEC-009F` should depend only on `SPEC-009E` or also on `SPEC-012A`.
  **Why deferred:** Production non-remediation lanes likely need both operator evidence and repo knowledge, but exact dependencies can be tightened when SPEC-009F is set up.
  **Suggested next step:** Leave SPEC-009F pending with conservative dependencies and revisit during its own setup.

## Recommended Next Step

Run `$speckit-autopilot docs/ai/specs/SPEC-009C2-workflow.md` from the `009c2-triage-remediation-handoff` worktree after setup commits and pushes this design concept, workflow file, and roadmap status/future-spec update.
