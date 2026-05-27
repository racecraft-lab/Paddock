---
topic: "SPEC-013C retry/backoff and debug API surfaces"
slug: "spec-013c-retry-debug-surfaces"
date: "2026-05-27"
mode: "setup"
spec_id: "SPEC-013C"
source_input:
  type: "topic"
  ref: "docs/ai/rc-factory-technical-roadmap.md#SPEC-013C"
question_count: 16
stop_reason: "user-ended"
---

# Design Concept: SPEC-013C retry/backoff and debug API surfaces

> **Source:** `docs/ai/rc-factory-technical-roadmap.md#SPEC-013C`
> **Date:** 2026-05-27
> **Questions asked:** 16
> **Stop reason:** user ended after confirming the design tree was sufficiently scoped

## Goals

- Add backend retry, release, and cancel authority on top of SPEC-013B active claim/reconciliation state.
- Keep `SPEC-013C` API-first after discovering that the operator UI is a separate roadmap gap.
- Split claim-control operator UX into `SPEC-013D` before treating retry/release/cancel as operationally adopted.
- Preserve existing Mission Control tracker truth, task-chain successor rules, GitHub sync/reconciliation path, and resource governance.
- Emit bounded, allowlisted audit and debug evidence for every mutation.
- Give `SPEC-013D` a single read model for action eligibility, backoff, errors, and last operator action.

## Non-goals

- In-app operator control UI in `SPEC-013C` - split to `SPEC-013D` during Q1 and Q2.
- New dashboard, CLI action surface, or MCP action surface - Q1 and Q8 keep v1 to a narrow authenticated API.
- Sandbox lifecycle, harness adapter registry, or real harness execution - roadmap boundary and Q12 keep this out of SPEC-013C.
- Direct GitHub issue mutation outside existing sync/reconciliation paths - roadmap scope and Q3 through Q6 preserve tracker truth.
- Whole-task terminal state mutation on cancel - Q6 keeps cancel stage-level only.
- Raw prompts, transcripts, provider payloads, auth headers, GitHub bodies, or secret-shaped data in audit records - Q7 rejects broad diagnostic persistence.
- Recomputing claim state in a future UI client - Q10 makes the read model authoritative for UI eligibility.

## Design Tree (Q&A log)

### Q1. For SPEC-013C, which operator control surface should own retry, release, and cancel actions for a claimed stage?

**Branch:** Control surface

**Recommended answer:** Task API first
> A narrow authenticated task-stage control API keeps the spec testable and avoids a new dashboard. The recommendation was acceptable only if a later UI spec owns the operator experience.

**Alternatives offered:**
- UI first: More usable immediately, but larger UI/browser scope.
- CLI/script only: Lower product scope, but less visible inside Mission Control.

**User's answer:** Other: "I would agree with #1 but only if there is not a future spec to implement this UI."

**Notes:** The answer exposed a real technical and user experience gap. The roadmap did not already contain a later UI spec.

---

### Q2. Should SPEC-013C include a minimal operator UI for retry/release/cancel in addition to the API?

**Branch:** UX split

**Recommended answer:** API plus minimal task-detail UI
> Because no later UI spec existed, the initial recommendation was to keep the API narrow but include a minimal existing task-detail affordance.

**Alternatives offered:**
- API only, block until future UI spec exists: Keep SPEC-013C backend/API-only and require a future UI spec before operational adoption.
- Split now before scaffolding: Stop setup and add separate roadmap slices.

**User's answer:** API only, block until future UI spec exists.

**Notes:** Setup stopped and the roadmap was patched before continuing. `SPEC-013D: Claim-Control Operator UX` now depends on `SPEC-013C` and blocks `SPEC-014C` operational adoption.

---

### Q3. How should the SPEC-013C workflow treat that missing UI spec?

**Branch:** Roadmap governance

**Recommended answer:** Scaffold API spec with explicit follow-up gate
> This would keep the API slice moving while naming the UX gap in the PR packet.

**Alternatives offered:**
- Stop and update roadmap first: Do not scaffold until the roadmap has a concrete future UI spec.
- Make UI follow-up optional: Record the gap but do not block adoption.

**User's answer:** Stop and update roadmap first.

**Notes:** The roadmap was updated in this setup run before any Design Concept or workflow file was written.

---

### Q4. For SPEC-013C, what should retry, release, and cancel mean at the API level?

**Branch:** Action semantics

**Recommended answer:** Three distinct outcomes
> Distinct semantics keep audit and scheduler behavior clear: retry means new eligibility, release means ownership cleared without scheduling, and cancel means intentional operator stop without automatic retry.

**Alternatives offered:**
- Retry and release are same: Simpler but weaker audit semantics.
- Cancel fails the task: Stronger terminal outcome but risks bypassing reconciliation and successor rules.

**User's answer:** Three distinct outcomes.

---

### Q5. Which claim/stage states should the SPEC-013C API be allowed to act on?

**Branch:** Eligible targets

**Recommended answer:** Active or failed/stuck attempt states only
> This keeps controls tied to SPEC-013B claim evidence without creating arbitrary task retries. Release and cancel require an active claim, while retry may also target explicitly retry-eligible failed or deferred attempt outcomes.

**Alternatives offered:**
- Any assigned GitHub-linked task stage: More flexible but risks bypassing reconciliation.
- Active claims only: Safer but may strand failed or deferred stages with no active claim.

**User's answer:** Active or failed/stuck attempt states only.

**Notes:** User replied "a"; interpreted as option 1.

---

### Q6. How should retry handle backoff?

**Branch:** Backoff policy

**Recommended answer:** Respect backoff unless operator overrides
> Default retry should honor stored `next_retry_at` and backoff reason. An explicit override is allowed only with actor and reason evidence.

**Alternatives offered:**
- Always reset backoff on retry: Simpler but spam-prone.
- Never override backoff: Safer but frustrating after an operator fixes the cause.

**User's answer:** Respect backoff unless operator overrides.

---

### Q7. When an operator cancels a claimed stage, what should happen to the Mission Control task?

**Branch:** Cancel semantics

**Recommended answer:** Stage-level cancellation only
> Cancel should release or stop the current stage/attempt with `operator_cancelled` evidence, but it should not mark the whole task `failed` or `done`.

**Alternatives offered:**
- Mark task failed: Clear terminal result but bypass risk.
- Move task to human-review state: Potentially useful but broader status/workflow scope.

**User's answer:** Stage-level cancellation only.

---

### Q8. What evidence should mutation actions persist?

**Branch:** Audit payload safety

**Recommended answer:** Bounded allowlisted audit payloads
> Persist action type, actor, task/stage/claim/attempt IDs, previous/new state, backoff decision, override reason, request correlation ID, and sanitized error category. Reject raw prompts, transcripts, token payloads, auth headers, GitHub bodies, and provider responses.

**Alternatives offered:**
- Full diagnostic snapshot: Easier incident debugging but higher privacy/security risk.
- Minimal event only: Safer but too weak for reconstruction.

**User's answer:** Bounded allowlisted audit payloads.

---

### Q9. What API shape should SPEC-013C use for mutations?

**Branch:** API shape

**Recommended answer:** Single action endpoint
> `POST /api/tasks/[id]/claim-control` with an explicit `action` field centralizes auth, validation, audit, and idempotency.

**Alternatives offered:**
- Separate endpoints per action: Clear names but duplicated validation.
- Extend existing read route: Convenient but mixes read-only evidence and mutations.

**User's answer:** Single action endpoint.

---

### Q10. How should the API handle repeated clicks, stale operators, and scheduler races?

**Branch:** Idempotency and races

**Recommended answer:** Idempotency key plus compare-and-set
> A request idempotency key plus transactional current-state validation avoids double mutation and gives clear `already_applied`, `stale_state`, or `conflict` responses.

**Alternatives offered:**
- Compare-and-set only: Safe state, possible duplicate audit rows.
- Best-effort mutation: Simpler but ambiguous under races.

**User's answer:** Idempotency key plus compare-and-set.

---

### Q11. What should the debug surface expose after SPEC-013C?

**Branch:** Debug read model

**Recommended answer:** Extend claim-reconciliation read model
> Adding retry eligibility, next retry time, backoff reason, last operator action, available actions, and sanitized error state to the existing read model gives SPEC-013D one source to render.

**Alternatives offered:**
- Separate debug endpoint: Cleaner separation but another read surface.
- Mutation responses only: Too weak for a future UI to show eligibility before action.

**User's answer:** Extend claim-reconciliation read model.

---

### Q12. If an operator cancels a stage, should the scheduler ever pick that same stage up again automatically?

**Branch:** Cancel follow-up behavior

**Recommended answer:** No automatic retry after cancel
> Cancel becomes meaningful only if it stops automatic pickup. A later explicit retry action can make the stage eligible again.

**Alternatives offered:**
- Retry after cooldown: Useful for pauses but close to backoff/release.
- Never retry cancelled stages: Safer but may strand recoverable work.

**User's answer:** No automatic retry after cancel.

---

### Q13. Since SPEC-013D owns the UI, what should count as SPEC-013C post-merge HITL UAT?

**Branch:** Acceptance gate

**Recommended answer:** API-and-audit UAT only
> A target deployment can prove the backend contract through authenticated API calls, audit/debug/read-model evidence, and an explicit record that UI adoption waits for SPEC-013D.

**Alternatives offered:**
- API plus manual DB inspection: Stronger internal proof but less product-representative.
- Do not allow SPEC-013C to complete until UI exists: Stronger product gate but weakens the split.

**User's answer:** API-and-audit UAT only.

---

### Q14. Who should be allowed to call the retry/release/cancel API?

**Branch:** Authorization

**Recommended answer:** Admin/operator roles only
> Mutations affect scheduler state and must be restricted to authenticated admin/operator-equivalent users. Actor identity is mandatory audit evidence.

**Alternatives offered:**
- Assigned agent owner plus admins: More flexible but blurs operator and autonomous control.
- Any authenticated user with task access: Too broad for scheduler-state mutation.

**User's answer:** Admin/operator roles only.

---

### Q15. Should SPEC-013C add a new persistence table for operator actions, or reuse existing activities plus claim/attempt rows?

**Branch:** Storage model

**Recommended answer:** Reuse existing storage first
> `task_stage_claims`, `task_stage_attempts`, and `activities` already carry most state and audit requirements. Add only a small idempotency table if Plan proves it is necessary.

**Alternatives offered:**
- Add `task_stage_operator_actions`: Cleaner querying but adds migration scope.
- Activities only: Lower schema scope but harder idempotency.

**User's answer:** Reuse existing storage first.

---

### Q16. Wrap the grill-me interview and synthesize the Design Concept now?

**Branch:** Stop condition

**Recommended answer:** Wrap now
> The critical branches were covered: surface split, API semantics, eligibility, backoff, cancel behavior, audit safety, API shape, idempotency/races, read model, UAT, auth, and storage.

**Alternatives offered:**
- One more branch: Ask one final scoping question.
- Stop here: Keep only the roadmap update.

**User's answer:** Wrap now.

## Open Questions

- **What:** Whether SPEC-013C needs a small additive idempotency persistence table.
  **Why deferred:** The user chose "reuse existing storage first"; exact persistence need depends on Plan proving whether activities plus claim/attempt rows can enforce idempotency.
  **Suggested next step:** Resolve during Plan with live schema evidence from `src/lib/migrations.ts`, SPEC-013B claim rows, and route/idempotency tests.

- **What:** Exact admin/operator authorization primitive.
  **Why deferred:** The interview chose admin/operator-only semantics but did not name the current helper or role source.
  **Suggested next step:** Clarify and Plan should inspect current auth helpers and choose the narrowest existing authorization seam.

- **What:** Exact `stage_key` vocabulary and retry-eligible failed/deferred outcomes.
  **Why deferred:** SPEC-013B established claim/reconciliation vocabulary, but SPEC-013C needs Plan to map action eligibility to concrete closed enums.
  **Suggested next step:** Clarify should enumerate retry-eligible claim/attempt outcomes and Plan should encode them as constants with tests.

## Recommended Next Step

Continue `$speckit-scaffold-spec SPEC-013C` from the `013c-retry-debug-surfaces` worktree. Generate `docs/ai/specs/SPEC-013C-workflow.md` from this Design Concept and the updated roadmap, then run `$speckit-autopilot docs/ai/specs/SPEC-013C-workflow.md` only after reviewing the populated workflow.
