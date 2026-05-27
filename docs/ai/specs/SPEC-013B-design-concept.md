---
topic: "Claim and Reconciliation Authority"
slug: "spec-013b-claim-reconciliation"
date: "2026-05-27"
mode: "setup"
spec_id: "SPEC-013B"
source_input:
  type: "topic"
  ref: "SPEC-013B roadmap entry in docs/ai/rc-factory-technical-roadmap.md"
question_count: 16
stop_reason: "natural"
---

# Design Concept: Claim and Reconciliation Authority

> **Source:** SPEC-013B roadmap entry in `docs/ai/rc-factory-technical-roadmap.md`
> **Date:** 2026-05-27
> **Questions asked:** 16
> **Stop reason:** natural

## Goals

- Prevent duplicate scheduler dispatch for the same GitHub-linked task stage when concurrent scheduler ticks run.
- Add one coordination path that reconciles Mission Control task state, GitHub tracker truth, and resource-governance readiness before launch.
- Reuse the SPEC-013A task-stage attempt spine as the evidence substrate while adding a narrow active-claim authority that SPEC-013A deliberately deferred.
- Keep `advanceTaskChain` as successor-selection authority and protect the existing assigned-task dispatch boundary instead of introducing a runner abstraction.
- Preserve tracker truth by admitting only GitHub issue-linked assigned tasks into autonomous claim intake.
- Make claim and reconciliation decisions auditable through structured activities, lifecycle events, and read-model/API evidence.
- Keep operator controls, retry/release/cancel UI, sandbox lifecycle, harness adapters, and full runner execution out of SPEC-013B.

## Non-goals

- Whole-task claim semantics for all stages - rejected in Q1 because the stage-attempt boundary better preserves future multi-stage visibility.
- Claiming local-only, repo-only, or arbitrary assigned tasks - rejected in Q3 and Q11 because SPEC-013B autonomous intake is GitHub issue-linked only.
- Overloading `task_stage_attempts.status = running` as the active claim - rejected in Q4 because SPEC-013A made attempt rows passive and intentionally avoided one-active enforcement.
- Runner, harness, sandbox, fake adapter, or real adapter launch behavior - rejected in Q8 and reserved for SPEC-014A-D.
- Dedicated claim control UI, manual release controls, retry, release, or cancel actions - rejected in Q9 and Q15 and reserved for SPEC-013C.
- Long-running execution ownership or heartbeat leases - rejected in Q12 because SPEC-013B owns only the launch critical section.
- Terminally failing tasks when GitHub truth is stale or unresolved - rejected in Q14 because stale tracker truth should defer launch, not destroy work.

## Design Tree (Q&A log)

### Q1. For SPEC-013B, what should be the atomic claim boundary that prevents duplicate scheduler dispatch?

**Branch:** Claim model

**Recommended answer:** Stage attempt
> One active claim per GitHub-linked task and workflow stage reuses the SPEC-013A task-stage attempt spine and releases on terminal or gated states. This aligns with the roadmap's "stage" language and avoids collapsing future multi-stage evidence into a whole-task lock.

**Alternatives offered:**
- Whole task: Simpler but may block future multi-stage visibility and recovery.
- Dispatch only: Less schema work but weaker reconciliation and operator evidence.

**User's answer:** A. Stage attempt.

---

### Q2. When a scheduler tick sees an eligible assigned task, what should happen first: reconciliation checks or claim acquisition?

**Branch:** Scheduler sequence

**Recommended answer:** Reconcile, then claim in one bounded transaction
> Checking GitHub-linked eligibility, terminal state, workflow stage, and governance readiness before claim acquisition avoids creating active locks for work that should never launch. The bounded transaction is the path of least surprise for duplicate prevention.

**Alternatives offered:**
- Claim, then reconcile: Earlier duplicate prevention but more release cleanup for ineligible tasks.
- Claim only after dispatch succeeds: Fewer claim rows but no protection against duplicate concurrent launch attempts.

**User's answer:** A. Reconcile, then claim in one bounded transaction.

---

### Q3. What should count as "GitHub-linked eligible" for SPEC-013B autonomous claim intake?

**Branch:** Tracker eligibility

**Recommended answer:** Issue-linked task only
> Require `tasks.github_repo` plus `tasks.github_issue_number`, matching a GitHub-sync-enabled project/workspace, and exclude local-only tasks. This matches the roadmap boundary and prevents web-created local tasks from becoming autonomous runner intake.

**Alternatives offered:**
- Repo-linked task: Supports more manual work but weakens tracker truth.
- Any assigned task: Preserves current dispatch shape but does not satisfy the GitHub-linked control-plane boundary.

**User's answer:** A. Issue-linked task only.

---

### Q4. How should SPEC-013B persist the active claim so concurrent scheduler ticks cannot both launch the same stage?

**Branch:** Persistence and uniqueness

**Recommended answer:** Add a small claim table linked to task-stage attempts
> An additive table with a partial unique active-claim constraint on `(workspace_id, task_id, stage_key)`, lease owner/run metadata, expiry, and a pointer to the SPEC-013A attempt gives database-level duplicate prevention without overloading passive attempt lifecycle rows.

**Alternatives offered:**
- Use `task_stage_attempts.status = running` as the claim: Reuses the existing table but contradicts SPEC-013A's passive-state boundary.
- Store claim metadata on `tasks.metadata`: Avoids a migration but is weaker for concurrency, indexing, auditability, and release semantics.

**User's answer:** A. Add a small claim table linked to task-stage attempts.

---

### Q5. What should automatically release an active SPEC-013B claim?

**Branch:** Release semantics

**Recommended answer:** Terminal or gated state release
> Release when the task reaches terminal Mission Control status, the linked GitHub issue/PR is closed or merged as appropriate, governance returns block/defer, or the stage attempt reaches `succeeded`, `failed`, `released`, or `cancelled`. This keeps reconciliation authoritative and prevents claims from becoming stale locks.

**Alternatives offered:**
- Only attempt terminal states: Cleaner lifecycle coupling but GitHub/governance changes may leave claims stuck.
- Manual release only: Maximizes operator control but risks dead claims and misses automatic reconciliation.

**User's answer:** A. Terminal or gated state release.

---

### Q6. How should stale active claims be handled in SPEC-013B?

**Branch:** Stale recovery

**Recommended answer:** Recover after bounded lease expiry
> Each claim gets a lease expiry; a later scheduler tick can release or recover it after expiry, record an activity plus attempt event, and avoid operator-only recovery. This mirrors SPEC-013A1's lifecycle lease pattern while leaving retry controls to SPEC-013C.

**Alternatives offered:**
- Never auto-recover: Safer but can halt the autonomous path until manual controls exist.
- Immediate takeover by any later tick: Maximizes liveness but weakens duplicate-launch safety if the original runner is still alive.

**User's answer:** A. Recover after bounded lease expiry.

---

### Q7. When governance blocks or defers an otherwise eligible GitHub-linked task, what should SPEC-013B persist?

**Branch:** Governance reconciliation

**Recommended answer:** No active claim; persist a reconciliation decision
> Do not acquire the claim. Record a structured activity and, if an attempt exists, a `released` lifecycle event with governance reason metadata. This preserves auditability without making governance blocks look like launched work.

**Alternatives offered:**
- Acquire then immediately release a claim: Uniform trace but noisy for work that never became launch-eligible.
- Skip silently and rely on existing governance events: Minimal new behavior but weakens SPEC-013B evidence.

**User's answer:** A. No active claim; persist a reconciliation decision.

---

### Q8. Should SPEC-013B change the actual harness/runner launch path, or only protect the existing dispatch boundary?

**Branch:** Scope boundary

**Recommended answer:** Only protect existing dispatch boundary
> Wrap current scheduler/dispatch entry points with claim and reconciliation authority. Do not add sandbox lifecycle, harness adapter, retry UI, or new runner behavior because SPEC-014 owns harness execution.

**Alternatives offered:**
- Add a minimal fake runner launch: Proves the path end to end but crosses into SPEC-014A/B ownership.
- Replace dispatch with new runner abstraction: Future-aligned but too broad and review-hostile for SPEC-013B.

**User's answer:** A. Only protect existing dispatch boundary.

---

### Q9. What operator-facing surface should SPEC-013B add for claim and reconciliation state?

**Branch:** Operator surface

**Recommended answer:** API/debug evidence only, no new primary UI
> Add structured API/read-model evidence and task evidence/activity visibility, but defer dedicated controls or dashboards to SPEC-013C unless an existing task detail surface needs a small read-only field. This keeps SPEC-013B focused on authority and tests.

**Alternatives offered:**
- Task detail read-only claim panel: More visible but adds UI scope and Playwright burden.
- Dedicated control-plane dashboard: Useful long term but belongs after retry/debug controls mature.

**User's answer:** A. API/debug evidence only, no new primary UI.

---

### Q10. What should be the main UAT proof for SPEC-013B after merge?

**Branch:** Human validation

**Recommended answer:** Concurrent scheduler tick replay
> On target deployment with `FEATURE_TASK_CONTROL_PLANE` enabled for one product-line workflow, seed or identify one GitHub-linked eligible task, run concurrent scheduler ticks, verify exactly one active claim/launch path, then verify release on terminal/gated state and no duplicate launch.

**Alternatives offered:**
- Unit-level concurrency proof only: Deterministic but not enough for post-merge HITL UAT.
- Full harness execution proof: Stronger end-to-end proof but depends on SPEC-014 harness work.

**User's answer:** A. Concurrent scheduler tick replay.

---

### Q11. Which Mission Control task state should be eligible for SPEC-013B claim intake?

**Branch:** Task-state eligibility

**Recommended answer:** Only `assigned` GitHub-linked tasks
> Keep the existing scheduler dispatch boundary intact by claiming only tasks the current dispatch loop would already consider, then layer GitHub/governance/reconciliation gates before launch.

**Alternatives offered:**
- `assigned` and `in_progress` tasks: Supports partial recovery but risks stepping into SPEC-013C retry/release semantics.
- Any non-terminal GitHub-linked task: Too broad and likely to duplicate triage/ready-for-owner boundaries.

**User's answer:** A. Only `assigned` GitHub-linked tasks.

---

### Q12. How long should a SPEC-013B active claim lease cover?

**Branch:** Lease duration

**Recommended answer:** Launch critical section only
> The claim prevents duplicate scheduler launch while reconciliation and dispatch handoff happen, then links to the task-stage attempt/run evidence. Long-running execution ownership remains for SPEC-014 harness lifecycle, avoiding an accidental runner lease model in SPEC-013B.

**Alternatives offered:**
- Entire agent execution: Stronger ownership semantics but crosses into SPEC-014 harness lifecycle.
- Fixed short lease regardless of dispatch state: Simple but can expire during valid launch and create false stale recovery.

**User's answer:** A. Launch critical section only.

---

### Q13. Where should SPEC-013B put the claim/reconciliation authority in the codebase?

**Branch:** Code ownership

**Recommended answer:** New narrow claim module called by dispatch
> Add a focused `src/lib/task-claim-reconciliation.ts` style module that owns eligibility, reconciliation, claim acquisition, release, and evidence writes; `task-dispatch.ts` calls it at the existing assigned-task launch boundary. This keeps `advanceTaskChain` as successor-selection authority and avoids bloating scheduler code.

**Alternatives offered:**
- Inside `task-dispatch.ts` directly: Fewer files but likely makes an already large module harder to review and test.
- Inside `task-stage-attempts.ts`: Keeps lifecycle state together but mixes passive attempt projection with active claim authority.

**User's answer:** A. New narrow claim module called by dispatch.

---

### Q14. What should happen when an eligible task has an unresolved or stale GitHub truth state before dispatch?

**Branch:** GitHub truth reconciliation

**Recommended answer:** Defer claim and record reconciliation evidence
> If GitHub state is missing, stale, closed, merged, or inconsistent, do not claim; write a bounded reconciliation activity/result so the next GitHub sync or human action can resolve truth before launch. This keeps tracker truth authoritative.

**Alternatives offered:**
- Claim and attempt best-effort dispatch: Preserves momentum but risks launching stale work.
- Fail the task terminally: Prevents duplicate work but is too destructive when a fresh sync may resolve the issue.

**User's answer:** A. Defer claim and record reconciliation evidence.

---

### Q15. Should SPEC-013B include a dedicated operator action to manually release a claim?

**Branch:** Operator controls

**Recommended answer:** No, read-only evidence only
> Automatic release/recovery belongs in SPEC-013B, while manual retry/release/cancel controls stay in SPEC-013C. This keeps the current spec focused and matches the roadmap split.

**Alternatives offered:**
- Yes, release only: Useful for stuck states but starts adding operator controls before the retry/debug surface spec.
- Yes, release/retry/cancel together: Operationally complete but explicitly SPEC-013C territory.

**User's answer:** A. No, read-only evidence only.

---

### Q16. What verification scope should the workflow require before implementation is considered complete?

**Branch:** Verification strategy

**Recommended answer:** Focused concurrency plus full repo gates
> Require failing-first focused tests for claim uniqueness, stale recovery, governance block/defer, GitHub-linked eligibility, flag-off legacy behavior, plus `pnpm typecheck`, `pnpm lint`, `pnpm build`, focused dispatch tests, and full `pnpm test:all` before PR packaging. This fits the constitution's TDD and reviewability principles for scheduler/dispatch and migration surfaces.

**Alternatives offered:**
- Focused tests only: Faster but too risky for scheduler/dispatch and migration surfaces.
- Full `pnpm test:all` only: Broad but can miss the precise concurrency/reconciliation invariants unless focused tests are explicit.

**User's answer:** A. Focused concurrency plus full repo gates.

## Open Questions

- **What:** Exact claim table name, columns, and partial unique-index predicate.
  **Why deferred:** Better resolved during `/speckit-plan` against live `src/lib/migrations.ts`, `task_stage_attempts`, and SQLite partial-index behavior.
  **Suggested next step:** Plan phase should propose additive migration M78 or the next available migration id and include rollback SQL.
- **What:** Exact lease timeout for the launch critical section.
  **Why deferred:** It depends on the measured dispatch handoff path and whether existing `dispatchAssignedTasks` remains synchronous around `runOpenClaw`.
  **Suggested next step:** Clarify/Plan should choose a bounded default and cap, then focused tests should prove stale recovery.
- **What:** Exact API/read-model route shape for claim evidence.
  **Why deferred:** The setup decision intentionally avoids a primary UI and leaves route placement to architecture planning.
  **Suggested next step:** Plan should choose either a task-scoped evidence extension or a narrow control-plane debug route, with no write controls.
- **What:** Whether GitHub stale truth uses existing `github_synced_at`, `github_pr_state`, `github_syncs`, or a new reconciliation timestamp.
  **Why deferred:** Needs code-level schema review and should avoid duplicating SPEC-013A1 lifecycle state.
  **Suggested next step:** Clarify should resolve the stale-truth threshold and evidence source.

## Recommended Next Step

Run setup completion and then execute:

```text
$speckit-autopilot docs/ai/specs/SPEC-013B-workflow.md
```

The workflow should preserve the design decisions above, especially the stage-attempt claim boundary, issue-linked-only intake, launch-critical-section lease, no primary UI, and no SPEC-014 harness behavior.
