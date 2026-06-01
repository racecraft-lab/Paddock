---
topic: "Dev/Review/Aegis to Ready for Owner"
slug: "spec-009c3-remediation-ready-for-owner"
date: "2026-05-16"
mode: "setup"
spec_id: "SPEC-009C3"
source_input:
  type: "interactive"
  ref: "SPEC-009C3 roadmap entry plus Grill Me setup interview"
question_count: 10
stop_reason: "natural"
---

# Design Concept: Dev/Review/Aegis to Ready for Owner

> **Source:** SPEC-009C3 roadmap entry plus interactive setup interview
> **Date:** 2026-05-16
> **Questions asked:** 10
> **Stop reason:** natural

## Goals

- Execute the Paddock Issue Remediation chain from remediation planning through dev implementation, review, Aegis approval, and the `ready_for_owner` gate.
- Keep the PR-producing `mission-control_dev_implementation` task as the linked PR owner and final `ready_for_owner` task for SPEC-009C4 reconciliation.
- Prove review and Aegis gates are meaningful: `fix` and `rejected` outcomes must loop or block before owner/Aegis readiness, not silently advance.
- Preserve existing workflow slugs for seeded-contract compatibility while fixing labels, prompts, or copy only where nomenclature misleads stage ownership.
- Persist stage-scoped plan, dev verification, review verdict, and Aegis approval artifacts tied to both the PR-producing dev task and the root GitHub issue.
- Verify advisory governance evidence and absence of resource-policy violations without introducing durable run-state, claim authority, runner state, or sandbox lifecycle.
- Keep automated validation deterministic with fixture-linked PR identity, while allowing an explicit operator smoke path to create a real draft PR only when deliberately run.

## Non-goals

- Manual merge, GitHub merge observation, and `ready_for_owner -> done` reconciliation; SPEC-009C4 owns that gate (Q2, Q6).
- Durable run-state, claim authority, automatic GitHub sync pollers, retry/debug control-plane surfaces, sandbox lifecycle, and harness adapter execution; SPEC-013A, SPEC-013A1, SPEC-013B, SPEC-013C, and SPEC-014A-D own those paths (Q4, Q5, Q9).
- Pilot review packet assembly or durable operator evidence UI; SPEC-009D and SPEC-009E own review packet and evidence surfaces (Q7, Q10).
- Workflow slug migration or broad naming rewrite; SPEC-009C3 may tighten names/prompts/copy only when current nomenclature confuses task ownership (Q2, Q3).
- Requiring live GitHub mutation in automated tests; real draft PR creation is operator-smoke-only and must be explicit (Q6).
- Dedicated pilot remediation progress UI unless an existing operator surface must be corrected to show ready-for-owner/evidence state accurately (Q10).

## Design Tree (Q&A log)

### Q1. For `SPEC-009C3`, how should a remediation review result of `fix` behave in the Paddock workflow chain?

**Branch:** Review outcome semantics

**Recommended answer:** `pass` advances toward owner/Aegis, while `fix` routes back to dev or blocks without creating owner-review/Aegis successors.
> This keeps bad remediation work from reaching `ready_for_owner` and matches the roadmap's "review before owner approval" intent.

**Alternatives offered:**
- Treat `fix` as terminal failure for this pilot slice: simpler and safer, but does not exercise a realistic remediation loop.
- Keep the current static chain behavior where review always advances and only records the verdict as evidence: lowest implementation change, but risks marking flawed work owner-ready.

**User's answer:** Option A.

---

### Q2. Which task should own the linked PR and become `ready_for_owner` at the end of `SPEC-009C3`?

**Branch:** PR and status ownership

**Recommended answer:** The `mission-control_dev_implementation` task owns the linked PR and is moved to `ready_for_owner` after review/Aegis approval.
> It is the PR-producing stage in the existing workflow contract, so owner merge evidence has a concrete PR task to reconcile in SPEC-009C4.

**Alternatives offered:**
- The `mission-control_owner_review` task becomes `ready_for_owner`: matches the stage name, but is not currently the PR-producing implementation task.
- The root GitHub issue task becomes `ready_for_owner`: operator-friendly at the top level, but blurs tracker truth and stage ownership.

**User's answer:** Option A, with the caveat that nomenclature should be fixed up if current wording misleads ownership, without forcing unnecessary renames.

---

### Q3. Should `SPEC-009C3` change the workflow contract's stage names/slugs, or preserve existing slugs and fix only labels/prompts where they are misleading?

**Branch:** Nomenclature and compatibility

**Recommended answer:** Preserve existing slugs for compatibility and tighten names/prompts/copy only where they confuse ownership.
> This avoids breaking seeded workflow identity while still cleaning up nomenclature if current labels imply the wrong task owns `ready_for_owner`.

**Alternatives offered:**
- Rename slugs now so the contract exactly matches the ownership model: cleaner long-term vocabulary, but higher migration/import/test blast radius.
- Defer all nomenclature cleanup to a later spec: lowest risk, but may leave SPEC-009C3 artifacts internally confusing.

**User's answer:** Option A.

---

### Q4. What should count as sufficient governance evidence for `SPEC-009C3`?

**Branch:** Governance evidence boundary

**Recommended answer:** Record and verify advisory governance evaluation for each remediation stage without introducing formal claim/run state.
> The chain must show no resource-policy violations, no blocked budget/window result, and enough activity/artifact evidence for the later review packet. This matches the roadmap scope and keeps SPEC-013 run-state work out.

**Alternatives offered:**
- Require a new durable governance decision row per stage: stronger evidence, but risks pulling SPEC-013-style run-state/control-plane work forward.
- Only assert governance by checking existing feature flags/policies are enabled: minimal, but too weak for the stated definition of done.

**User's answer:** Option A, and make sure future roadmap specs cover remaining governance work.

---

### Q5. How should `SPEC-009C3` prove Aegis approval without introducing a new runner or formal claim-state system?

**Branch:** Aegis proof

**Recommended answer:** Use the existing quality review/Aegis surfaces: persist an Aegis reviewer approval tied to the PR-producing dev task, assert `reviewer='aegis'`, preserve workspace scope, and require that approval as the final gate before `ready_for_owner`.
> This matches current code and keeps runner/claim authority deferred.

**Alternatives offered:**
- Treat the `mission-control_aegis` workflow successor output as the sole proof: cleaner workflow-chain abstraction, but may not exercise the existing `quality_reviews` gate that moves PR-producing work to `ready_for_owner`.
- Add a pilot-only Aegis evidence artifact: more explicit for review packets, but risks duplicating `quality_reviews` and artifact evidence prematurely.

**User's answer:** Option A, and make sure future roadmap specs cover remaining governance work.

---

### Q6. For the live/smoke proof in `SPEC-009C3`, should the linked PR be a real GitHub PR opened by the remediation flow, or a deterministic fixture-linked PR identity?

**Branch:** PR linkage and smoke shape

**Recommended answer:** Use deterministic fixture-linked PR identity for automated tests, plus an operator smoke path that may create a real draft PR only when explicitly run.
> This keeps CI and autopilot deterministic while still giving the pilot a realistic owner-gate path before SPEC-009C4 merges anything.

**Alternatives offered:**
- Require a real GitHub PR in all validation paths: strongest pilot realism, but brittle for CI/local runs and externally visible.
- Use only fixture PR identity and never exercise a real PR before SPEC-009C4: safest and simplest, but weaker as evidence that the owner gate can handle real GitHub linkage.

**User's answer:** Option A, and make sure future roadmap specs cover remaining governance work.

---

### Q7. What artifact evidence should `SPEC-009C3` require before a remediation task can be considered ready for owner?

**Branch:** Artifact evidence

**Recommended answer:** Require stage-scoped artifacts for plan, dev verification, review verdict, and Aegis approval, all tied back to the PR-producing dev task and root GitHub issue.
> This gives SPEC-009D enough material for the review packet without adding new artifact types beyond the existing `task_artifacts` surface.

**Alternatives offered:**
- Require only the final owner packet artifact: simpler, but weak for diagnosing which remediation stage failed or passed.
- Require no new artifact assertions and rely on activities/statuses only: lowest scope, but undercuts the disposition/artifact evidence requirement.

**User's answer:** Option A, and make sure future roadmap specs cover remaining governance work.

---

### Q8. Should `SPEC-009C3` update the roadmap to explicitly reaffirm the deferred governance/control-plane work, or only rely on existing later-spec entries?

**Branch:** Roadmap boundary

**Recommended answer:** Add a narrow roadmap note while marking `SPEC-009C3` in progress.
> This slice verifies advisory governance evidence only, and remaining durable governance/run-state/claim/control-plane work stays in SPEC-009D, SPEC-009E, SPEC-013A, SPEC-013A1, SPEC-013B, and related later specs. This makes the boundary visible to future agents without widening C3.

**Alternatives offered:**
- Do not edit roadmap scope beyond the normal status flip: lower setup churn, but future agents may keep asking the same governance-boundary question.
- Add detailed acceptance criteria to later specs now: more explicit, but risks turning setup into a roadmap rewrite.

**User's answer:** Option A.

---

### Q9. What should happen if the Aegis stage returns `rejected` in `SPEC-009C3`?

**Branch:** Aegis rejection semantics

**Recommended answer:** Treat Aegis rejection like a bounded remediation loop: return the PR-producing dev task to implementation/review with rejection evidence, do not create owner-ready state, and cap/guard retries using existing retry/activity surfaces.
> This proves the final gate is meaningful without adding formal claim-state machinery.

**Alternatives offered:**
- Treat Aegis rejection as terminal failure for the pilot: simpler and safer for v1, but it does not prove a realistic fix-and-rereview loop.
- Let Aegis rejection still produce an owner packet, but mark it as blocked: preserves evidence, but risks confusing `ready_for_owner` semantics.

**User's answer:** Option A.

---

### Q10. Should `SPEC-009C3` require UI changes, or keep the first slice API/library/test/smoke-led unless existing UI surfaces must show the new evidence?

**Branch:** UI scope

**Recommended answer:** Keep it API/library/test/smoke-led, with UI changes only if an existing operator surface must show the ready-for-owner/evidence state correctly.
> This fits the strict scope and avoids turning C3 into the later pilot evidence surface work.

**Alternatives offered:**
- Add a dedicated pilot remediation progress UI now: useful for operators, but overlaps with SPEC-009E.
- Add only smoke-checklist documentation, no UI assertions: lowest surface area, but may miss regressions in existing ready-for-owner/operator views.

**User's answer:** Option A.

## Open Questions

- **What:** Exact loop mechanics for review `fix` and Aegis `rejected` outcomes.
  **Why deferred:** The interview fixed the behavior boundary, but implementation should inspect existing task-chain retry, successor, activity, and workflow-template fields before choosing whether the loop is status reset, same-stage retry, or successor suppression.
  **Suggested next step:** Clarify and Plan should define a bounded loop that uses current retry/activity surfaces and does not add claim-state tables.
- **What:** Exact artifact schema for plan, dev verification, review verdict, and Aegis approval artifacts.
  **Why deferred:** The interview fixed required evidence classes, but the plan should inspect `task_artifacts` conventions before naming fields and schema versions.
  **Suggested next step:** Plan should define compact JSON artifact contracts and redaction behavior, then tasks should require RED tests for each.
- **What:** Exact nomenclature cleanup.
  **Why deferred:** The user asked to consider nomenclature without forcing it. Setup should preserve slugs and let Specify/Clarify decide whether names/prompts/copy are misleading enough to change.
  **Suggested next step:** Clarify should inspect workflow contract labels and generated operator-facing copy for ownership ambiguity.
- **What:** Real draft PR operator smoke path.
  **Why deferred:** Automated tests should use deterministic fixture-linked PR identity. The live smoke path may create a real draft PR only when the operator deliberately runs it.
  **Suggested next step:** Quickstart should document fixture validation first and an explicit opt-in live draft PR path second.

## Recommended Next Step

Run `$speckit-autopilot docs/ai/specs/SPEC-009C3-workflow.md` from the `009c3-remediation-ready-for-owner` worktree after setup commits and pushes this design concept, workflow file, and roadmap status update.
