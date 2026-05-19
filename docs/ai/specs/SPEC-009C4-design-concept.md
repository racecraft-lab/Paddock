---
topic: "Owner Merge Gate and Done Reconciliation"
slug: "spec-009c4-owner-merge-reconciliation"
date: "2026-05-19"
mode: "setup"
spec_id: "SPEC-009C4"
source_input:
  type: "interactive"
  ref: "SPEC-009C4 roadmap entry plus Grill Me setup interview"
question_count: 7
stop_reason: "natural"
---

# Design Concept: Owner Merge Gate and Done Reconciliation

> **Source:** SPEC-009C4 roadmap entry plus interactive setup interview
> **Date:** 2026-05-19
> **Questions asked:** 7
> **Stop reason:** natural

## Goals

- Record the intentional `G_PILOT_MERGE` human gate for the Mission Control pilot issue.
- Merge a fresh synthetic pilot PR only at the operator-approved merge gate.
- Reconcile the linked PR-producing task from `ready_for_owner` to `done` through the existing manual GitHub sync path.
- Prove exact PR matching, label/status sync, reconciliation activities, and duplicate-sync idempotency.
- Produce enough checklist and task/activity/notification/label evidence for SPEC-009D without building a review packet or evidence UI.
- Keep automatic polling, claim authority, runner state, sandbox lifecycle, and harness adapters deferred to their later roadmap specs.

## Non-goals

- No automatic GitHub sync poller, webhook listener, scheduler path, or new API surface; SPEC-013A1 owns automation beyond the existing manual sync path (Q2).
- No new claim-state, runner-state, sandbox, or harness-adapter model; SPEC-013B and SPEC-014A-D own those paths (Q3, Q6).
- No review packet table, lifecycle snapshot API/UI, or durable evidence dashboard; SPEC-009D and SPEC-009E own packet assembly and operator-visible evidence surfaces (Q5).
- No reuse of the closed/unmerged SPEC-009C3 draft PR #49 as C4 UAT proof; C4 uses a fresh synthetic pilot PR for the merge gate (Q4).
- No production-code churn unless RED tests or pilot evidence prove a gap in exact PR matching, idempotency, activity/label sync, or duplicate-launch prevention (Q3).
- No roadmap completion or C4 archive cleanup during setup; setup marks C4 in progress only on the spec branch (Q7).

## Design Tree (Q&A log)

### Q1. For SPEC-009C4, where should the real GitHub merge happen?

**Branch:** Human gate boundary

**Recommended answer:** Manual UAT: automated implementation uses mocked or webhook fixtures, and the operator performs the real merge only at `G_PILOT_MERGE`.
> The roadmap explicitly allows operator intervention only at this gate, while the PR-merge-to-`done` path remains code-checkable through a fixture.

**Alternatives offered:**
- Fully automated merge during implementation: stronger automation proof, but violates the owner gate and risks externally visible side effects.
- Fixture-only with no real merge: safe for tests, but too weak for the pilot's human merge acceptance criterion.

**User's answer:** Option A.

---

### Q2. Should SPEC-009C4 use the existing manual GitHub sync path as the production reconciliation trigger, rather than adding a new webhook/API/scheduler path?

**Branch:** Reconciliation trigger

**Recommended answer:** Use the existing manual sync path, `pullFromGitHub` through the existing sync operator path, and defer automatic polling to SPEC-013A1.
> Current code already owns GitHub issue/PR projection through manual sync. Adding a poller or new trigger would widen C4 into later control-plane work.

**Alternatives offered:**
- Add a webhook/API trigger now: closer to production automation, but pulls in new external runtime behavior.
- Add a scheduler poller now: useful long term, but explicitly belongs to GitHub sync automation and poller lifecycle.

**User's answer:** Option A.

---

### Q3. If the existing `pullFromGitHub` merge-reconciliation path already satisfies core `ready_for_owner -> done` behavior, how should SPEC-009C4 handle implementation scope?

**Branch:** Implementation scope

**Recommended answer:** Narrow hardening only. Write pilot-specific RED tests and checklist evidence first; change production code only for a proven gap in exact PR matching, idempotency, activity/label sync, or duplicate-launch prevention.
> This keeps C4 reviewable and respects the existing GitHub sync engine rather than re-implementing it.

**Alternatives offered:**
- Rewrite reconciliation around a new terminal-state abstraction: broader future value, but too much blast radius for the merge-gate slice.
- Treat existing behavior as sufficient and make C4 docs-only: low risk, but may miss pilot-specific regressions or missing negative coverage.

**User's answer:** Option A.

---

### Q4. What should live `G_PILOT_MERGE` UAT use as its PR target?

**Branch:** Live smoke target

**Recommended answer:** Fresh synthetic draft PR. Create a fresh cleanup-aware pilot PR for C4 UAT, merge it manually at `G_PILOT_MERGE`, sync, and verify done reconciliation.
> The SPEC-009C3 draft PR #49 was intentionally closed unmerged after ready-for-owner smoke. C4 needs its own merge evidence.

**Alternatives offered:**
- Reuse SPEC-009C3 PR #49: less setup work, but it is closed and unmerged, so it cannot prove C4.
- Use an arbitrary existing product PR: realistic, but risks contaminating unrelated work and exact-match evidence.

**User's answer:** Option A.

---

### Q5. What evidence should SPEC-009C4 produce for SPEC-009D without building the review packet or evidence UI?

**Branch:** Evidence boundary

**Recommended answer:** Update `docs/qa/pilot-smoke-checklist.md` with `G_PILOT_MERGE` run evidence, assert existing task/activity/notification/label/sync evidence, and leave packet assembly and UI to SPEC-009D/E.
> SPEC-009D needs traceable source material, not a premature packet implementation.

**Alternatives offered:**
- Add a new persistent review-packet artifact or table now: more structured, but overlaps with SPEC-009D.
- Rely only on final task status: too little evidence for lifecycle review.

**User's answer:** Option A.

---

### Q6. Which negative cases must be in SPEC-009C4 scope?

**Branch:** Regression safety

**Recommended answer:** Exact PR mismatch, closed issue with no merged PR, duplicate sync idempotency, and no duplicate launch or local-only terminal completion.
> These are the core ways the pilot could incorrectly mark work done or restart work after owner readiness.

**Alternatives offered:**
- Add new claim, sandbox, poller, and runner negative cases now: important later, but outside C4.
- Keep only the happy-path merge fixture and defer all negative cases: too weak for the owner gate.

**User's answer:** Option A.

---

### Q7. How should setup treat roadmap and archive hygiene for SPEC-009C4?

**Branch:** Setup and archive hygiene

**Recommended answer:** Mark SPEC-009C4 `In Progress` only on the setup branch, include startup archive-sweep and current-target exclusion instructions in the workflow, and leave C4 completion and cleanup for the later implementation PR.
> Setup should prepare autopilot execution without pretending implementation or UAT has happened.

**Alternatives offered:**
- Mark SPEC-009C4 complete now because setup produced the workflow: incorrect because merge/reconciliation proof has not run.
- Skip archive guidance because this spec only touches reconciliation behavior: risky because archive hygiene is a project constitution requirement.

**User's answer:** Option A.

## Open Questions

- **What:** Exact shape of the fresh synthetic C4 pilot PR.
  **Why deferred:** The setup interview fixed that the PR must be fresh and cleanup-aware, but implementation should choose the smallest safe branch/file change or docs-only fixture that reviewers can merge without contaminating unrelated work.
  **Suggested next step:** Clarify and Plan should define the operator UAT script/checklist steps, including cleanup and evidence capture.
- **What:** Whether production code needs any change.
  **Why deferred:** Existing code appears to reconcile merged exact-match PR evidence already. C4 should start with RED tests and only patch a proven gap.
  **Suggested next step:** Tasks should require failing coverage for exact PR matching, unmerged/closed issue behavior, idempotent duplicate sync, label/status sync, and no duplicate chain launch before any production edit.
- **What:** Exact SPEC-009D evidence handoff fields.
  **Why deferred:** C4 should produce source evidence without designing the packet schema.
  **Suggested next step:** Plan should list the existing task, activity, notification, label, GitHub PR, and smoke-checklist evidence that SPEC-009D can consume.

## Recommended Next Step

Run `$speckit-autopilot docs/ai/specs/SPEC-009C4-workflow.md` from the `009c4-owner-merge-reconciliation` worktree after setup commits and pushes this design concept, workflow file, and roadmap status update.
