---
topic: "SPEC-005 ready_for_owner State and Two-Step Terminal Event"
slug: "spec-005-ready-for-owner"
date: "2026-05-02"
mode: "setup"
spec_id: "SPEC-005"
source_input:
  type: "topic"
  ref: "SPEC-005 roadmap entry plus interactive setup interview"
question_count: 18
stop_reason: "natural"
---

# Design Concept: SPEC-005 ready_for_owner State and Two-Step Terminal Event

> **Source:** SPEC-005 roadmap entry plus interactive setup interview
> **Date:** 2026-05-02
> **Questions asked:** 18
> **Stop reason:** natural

## Goals

- Add a feature-flagged `ready_for_owner` task state for PR-producing workflow templates.
- Preserve the existing flag-off task lifecycle while allowing existing `ready_for_owner` rows to remain visible after rollback.
- Require explicit merged linked PR evidence before a PR-producing task can reach `done`.
- Keep `ready_for_owner` distinct from the existing `awaiting_owner` state.
- Make the waiting-for-merge state visible in Mission Control Kanban, GitHub labels, task activity, and notifications.
- Keep SPEC-005 application-level only: no database migration, no DB status CHECK, and no new terminal-event table.
- Include a Phase 0 status-hygiene prerequisite to repair stale merged-spec tracking for SPEC-004/SPEC-006/autopilot state before SPEC-005 Specify runs.

## Non-goals

- No DB-level CHECK constraint or task-status table rebuild in v1 - answered in Q10.
- No GitHub issue timeline inference for PR linkage - answered in Q4.
- No generic operator override path for forcing PR-producing tasks to `done` without merge evidence - answered in Q3 and Q16.
- No collapsing or renaming of the existing `awaiting_owner` state - answered in Q2.
- No new chain-advancement behavior at `ready_for_owner`; SPEC-004 advancement still waits for `done` - answered in Q8.
- No direct edits to `main` during setup; status hygiene runs on the SPEC-005 branch/worktree - answered in Q17 and Q18.

## Design Tree (Q&A log)

### Q1. When `FEATURE_TWO_STEP_TERMINAL` is OFF, how should Mission Control handle any existing task row whose status is already `ready_for_owner`?

**Branch:** Feature flag rollback and data preservation

**Recommended answer:** A. Preserve and display existing `ready_for_owner` rows, but block all new automatic/manual transitions into that state while the flag is OFF.
> This keeps rollback non-destructive and avoids hiding operator work while still satisfying the flag-off promise that the feature creates no new two-step terminal behavior.

**Alternatives offered:**
- B. Treat `ready_for_owner` as invalid when the flag is OFF and coerce existing rows back to `quality_review` or `done`.
- C. Allow reads and manual moves into `ready_for_owner` even when the flag is OFF; only automated transitions are disabled.

**User's answer:** A

---

### Q2. Should `ready_for_owner` remain a distinct task status from the existing `awaiting_owner` status?

**Branch:** Status vocabulary semantics

**Recommended answer:** A. Keep them distinct.
> `awaiting_owner` means general manual input is blocking work. `ready_for_owner` means an approved PR-producing task is waiting only for the external merge/terminal event.

**Alternatives offered:**
- B. Reuse `awaiting_owner` and interpret it differently for PR-producing tasks.
- C. Rename or migrate `awaiting_owner` into `ready_for_owner` everywhere.

**User's answer:** A

---

### Q3. With `FEATURE_TWO_STEP_TERMINAL` ON, should Mission Control block every non-GitHub-merge path from moving a `produces_pr=true` task to `done`?

**Branch:** Terminal-state authority

**Recommended answer:** A. Yes. Ordinary status paths stop at `ready_for_owner`; only linked PR merge handling can move the task to `done`.
> This matches the roadmap rule that `produces_pr=true` tasks must not become `done` until linked PR merge is observed and keeps the SPEC-009 pilot gate meaningful.

**Alternatives offered:**
- B. Allow an explicit operator override with audit activity.
- C. Only change the automated Aegis path and leave manual/API/bulk moves unchanged.

**User's answer:** A

---

### Q4. How should SPEC-005 decide which PR is the linked terminal event for a `produces_pr=true` task?

**Branch:** GitHub linkage model

**Recommended answer:** A. Use explicit Mission Control task linkage fields first, especially `tasks.github_pr_number`, `tasks.github_repo`, and related branch/PR metadata.
> Explicit linkage is deterministic and testable. A closed issue without explicit merged PR evidence is reconciliation work, not completion.

**Alternatives offered:**
- B. Query GitHub issue timeline/events to infer any PR that references or closes the issue.
- C. Accept either explicit task PR fields or inferred issue timeline links.

**User's answer:** A

---

### Q5. When a linked GitHub issue closes without a merged linked PR for a `produces_pr=true` task, who should receive the reconciliation notification?

**Branch:** Reconciliation notification routing

**Recommended answer:** A. Notify the task assignee if present, otherwise the task creator, and always log operator-visible activity on the task.
> This uses existing notification patterns without inventing a global operator role and keeps the event visible in the task audit trail.

**Alternatives offered:**
- B. Notify only the task creator.
- C. Notify a configured global admin/operator recipient.

**User's answer:** A

---

### Q6. Should entering `ready_for_owner` push the `mc:ready-for-owner` GitHub status label immediately?

**Branch:** GitHub label behavior

**Recommended answer:** A. Yes, push `mc:ready-for-owner` as part of the same outbound sync behavior used for other status labels, and make it idempotent.
> The roadmap acceptance criterion expects the label on the linked issue, and existing label provisioning centralizes status labels.

**Alternatives offered:**
- B. Only provision the label, but do not automatically apply it to issues.
- C. Apply the label only after successful PR linkage is present.

**User's answer:** A

---

### Q7. What should the Kanban lane ordering be once `ready_for_owner` exists?

**Branch:** Kanban UX

**Recommended answer:** A. Insert `ready_for_owner` between `quality_review` and `done`, while keeping `awaiting_owner` near early/manual-blocked work.
> This matches the roadmap, preserves current semantics, and makes PR-merge waiting visually distinct from general owner blocking.

**Alternatives offered:**
- B. Put `ready_for_owner` next to `awaiting_owner`.
- C. Hide the lane when the feature flag is OFF and show it only when ON.

**User's answer:** A

---

### Q8. How should SPEC-005 treat `advanceTaskChain` from SPEC-004 when a PR-producing task reaches `ready_for_owner`?

**Branch:** SPEC-004 chain interaction

**Recommended answer:** A. Do not call `advanceTaskChain` when moving to `ready_for_owner`; call existing terminal-chain advancement only when verified PR merge transitions the task to `done`.
> This preserves SPEC-004's "chain advances on done" contract and keeps downstream tasks from starting before the external merge gate.

**Alternatives offered:**
- B. Call `advanceTaskChain` immediately when the task enters `ready_for_owner`.
- C. Add a separate pre-merge chain hook for `ready_for_owner`.

**User's answer:** A

---

### Q9. Where should `FEATURE_TWO_STEP_TERMINAL` be resolved?

**Branch:** Feature flag resolution

**Recommended answer:** A. Resolve per task/workspace with `resolveFlag('FEATURE_TWO_STEP_TERMINAL', { workspaceId })` at every transition site.
> This matches the repo's Product Line feature-flag policy and avoids a global behavior leak across workspaces.

**Alternatives offered:**
- B. Resolve once globally at process startup.
- C. Resolve only in `runAegisReviews`.

**User's answer:** A

---

### Q10. Should SPEC-005 add any database migration?

**Branch:** Data model and migration scope

**Recommended answer:** A. No. Keep SPEC-005 application-level.
> The existing `tasks.status` column has no DB CHECK constraint, and `workflow_templates.produces_pr` / `external_terminal_event` already exist from SPEC-004.

**Alternatives offered:**
- B. Add a migration for a stricter task-status CHECK including `ready_for_owner`.
- C. Add a new table to track external terminal events.

**User's answer:** A

---

### Q11. What should happen if a PR-producing task lacks explicit PR linkage when Aegis approves it?

**Branch:** Missing PR linkage

**Recommended answer:** A. Move it to `ready_for_owner`, write activity evidence that PR linkage is missing, and notify the assignee/creator to attach or create the PR.
> The task is approved but cannot reach `done` until linkage plus merged PR evidence exists.

**Alternatives offered:**
- B. Keep it in `quality_review` until a PR is linked.
- C. Fail the task.

**User's answer:** A

---

### Q12. Should the GitHub pull/sync path transition `ready_for_owner` to `done` from a live pull result only, or should SPEC-005 add the test-only webhook fixture seam described in the constitution?

**Branch:** Test seam and terminal event verification

**Recommended answer:** A. Add the optional test-only `{ webhookFixture }` seam to `pullFromGitHub` while keeping production calls unchanged.
> The constitution reserves this seam for SPEC-005/SPEC-009 and it makes closed-PR/merged and closed-issue/no-merged-PR cases deterministic in tests.

**Alternatives offered:**
- B. Use only live GitHub pull results and mock the GitHub HTTP layer in tests.
- C. Defer the webhook fixture seam to SPEC-009.

**User's answer:** A

---

### Q13. Should the `ready_for_owner` notification be delivered as a new notification type distinct from `status_change`?

**Branch:** Notification semantics

**Recommended answer:** A. Create a distinct `task_ready_for_owner` notification type and render/deliver it with operator-action-required wording.
> This matches the roadmap and lets notification consumers distinguish a normal status change from merge action needed.

**Alternatives offered:**
- B. Reuse `status_change` with a special title/message.
- C. Do not create a notification on `ready_for_owner`.

**User's answer:** A

---

### Q14. When GitHub sync sees a linked PR-producing task in `ready_for_owner`, what evidence should be required before transitioning it to `done`?

**Branch:** Merge evidence

**Recommended answer:** A. Require explicit merged-PR evidence: linked PR repo/number matches the task and the PR is closed with `merged=true` or equivalent merged timestamp/commit data.
> A closed issue alone is never enough because abandoned or closed-without-merge work must not complete the Mission Control task.

**Alternatives offered:**
- B. Treat any closed linked PR as sufficient, even if merged state is unavailable.
- C. Treat linked issue closure as sufficient when a PR number is missing.

**User's answer:** A

---

### Q15. Should `ready_for_owner` be accepted by task create/update validation schemas when the flag is OFF?

**Branch:** API validation and rollback

**Recommended answer:** A. Reads can return it, but create/update validation should reject or normalize attempts to newly set `ready_for_owner` while the flag is OFF.
> This aligns with Q1's non-destructive rollback while preserving the flag boundary for new writes.

**Alternatives offered:**
- B. Always accept it in create/update validation and rely only on transition code.
- C. Never accept it through API validation; only internal code can set it.

**User's answer:** A

---

### Q16. What should the public/API response shape expose for blocked attempts to move a PR-producing `ready_for_owner` task to `done` without merged PR evidence?

**Branch:** API conflict contract

**Recommended answer:** A. Return side-effect-free `409 Conflict` with a stable machine-readable reason such as `ready_for_owner_pr_merge_required`.
> This mirrors SPEC-004's conflict style and gives UI/tests a deterministic contract.

**Alternatives offered:**
- B. Return `403 Forbidden`.
- C. Return `200` with the task unchanged and an informational warning.

**User's answer:** A

---

### Q17. Should the setup workflow tell autopilot to update stale SPEC-006/SPEC-004 status drift in the roadmap/autopilot state as part of SPEC-005?

**Branch:** Setup status hygiene

**Recommended answer:** A. No, keep SPEC-005 setup focused and only note stale upstream tracking drift.
> The recommended answer was narrower, but the user chose to include a preliminary status-hygiene task so SPEC-005 starts from a clean source of truth.

**Alternatives offered:**
- B. Include a preliminary status-hygiene task for SPEC-006 and `autopilot-state.json`.
- C. Stop setup until main's status drift is fixed first.

**User's answer:** B

---

### Q18. Where should that status-hygiene work run?

**Branch:** Setup status-hygiene execution point

**Recommended answer:** A. Run it as an explicit Phase 0/setup prerequisite inside the `005-ready-for-owner` worktree before SPEC-005 Specify.
> This gives autopilot a clean source of truth before generating SPEC-005 artifacts while avoiding direct changes to `main`.

**Alternatives offered:**
- B. Defer it to the SPEC-005 implementation/polish phase.
- C. Do it immediately in the setup commit before the design concept/workflow commit.

**User's answer:** A

## Open Questions

- **What:** Exact implementation helper shape for guarding blocked `done` transitions across bulk update, detail update, quality-review, and GitHub sync paths.
  **Why deferred:** This is code-shape detail best resolved in Plan after reading current transition helpers and SPEC-004 `advanceTaskChain` integration.
  **Suggested next step:** Clarify/Plan should decide whether to centralize the guard in `task-status.ts`, `task-dispatch.ts`, or a new helper.

- **What:** Exact copy/styling for the `ready_for_owner` Kanban lane and notification panel.
  **Why deferred:** UX detail can be resolved during Checklist/Plan as long as lane placement and action-required semantics are fixed.
  **Suggested next step:** Include a UX/accessibility checklist domain.

- **What:** Whether `external_terminal_event` should be limited to a literal such as `github_pr_merged`.
  **Why deferred:** The roadmap names the field but does not define its enum behavior.
  **Suggested next step:** Clarify session should decide allowed values and defaulting behavior for `produces_pr=true`.

## Recommended Next Step

Run setup continuation from this worktree by generating the workflow file and then run:

```bash
$speckit-autopilot docs/ai/specs/SPEC-005-workflow.md
```

In setup mode this section is informational only. The workflow must include the Phase 0 status-hygiene prerequisite chosen in Q17-Q18 before SPEC-005 Specify runs.
