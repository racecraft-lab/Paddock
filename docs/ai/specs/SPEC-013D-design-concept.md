---
topic: "SPEC-013D claim-control operator UX"
slug: "spec-013d-claim-control-operator-ux"
date: "2026-05-30"
mode: "setup"
spec_id: "SPEC-013D"
source_input:
  type: "topic"
  ref: "docs/ai/rc-factory-technical-roadmap.md#SPEC-013D"
question_count: 13
stop_reason: "natural"
---

# Design Concept: SPEC-013D claim-control operator UX

> **Source:** `docs/ai/rc-factory-technical-roadmap.md#SPEC-013D`
> **Date:** 2026-05-30
> **Questions asked:** 13
> **Stop reason:** natural

## Goals

- Make the SPEC-013C retry, release, and cancel API usable from the existing Mission Control task detail experience.
- Let operators discover claimed-stage state, available actions, unavailable reasons, backoff, last operator action, sanitized errors, and linked audit/debug evidence without terminal archaeology.
- Use `GET /api/tasks/[id]/claim-reconciliation` and its `claim_control` field as the source of truth for UI eligibility and expected-state predicates.
- Submit `POST /api/tasks/[id]/claim-control` mutations from accessible, confirmed, task-detail controls without recomputing scheduler or claim state in the client.
- Keep disabled/ineligible states visible enough for diagnosis while enabling mutation controls only when the backend authorizes them.
- Provide real browser evidence and stable visual review states for the changed operator journey.

## Non-goals

- New dashboard or global claim-control page - Q1 keeps controls inside the existing task detail `Details` tab.
- New retry, release, cancel, backoff, claim, or scheduler semantics - Q2, Q4, Q10, and Q12 keep SPEC-013C as the backend authority.
- Direct database mutation, direct GitHub mutation, task-chain successor selection, scheduler launch, or whole-task terminal changes - roadmap strict scope and Q10 keep the UI as a client of existing routes.
- Recomputing claim-control eligibility from task, activity, stage-attempt, or board state - Q10 requires the backend `claim_control` read model.
- Browser-native `confirm()` prompts or nested modals - Q3 chooses inline confirmation inside the existing task detail modal.
- Persisting or displaying raw idempotency keys, raw request bodies, raw diagnostics, prompts, transcripts, provider payloads, tokens, auth headers, or GitHub bodies - Q7 and Q8 keep output bounded.
- Replacing Playwright with component-only tests - Q9 requires a real task-detail browser journey.

## Design Tree (Q&A log)

### Q1. Where should the claim-control UI live in the existing task experience?

**Branch:** UI placement

**Recommended answer:** Add a dedicated `Claim control` section inside the current task detail `Details` tab, near the existing `Evidence` and `Run state` sections.
> This keeps the work inside the strict roadmap scope, uses the existing modal and evidence layout, and avoids inventing a dashboard or a new navigation surface.

**Alternatives offered:**
- Add a new `Control` tab inside the task detail modal: Separates risky actions from read-only evidence, but increases UI surface area and may make operators miss controls unless they know to open the tab.
- Fold the controls directly into the existing `Run state` stage-attempt cards: Compact, but couples passive attempt evidence with mutating controls and risks blurring the SPEC-013A/SPEC-013C boundaries.

**User's answer:** A - dedicated `Claim control` section in the current task detail `Details` tab.

---

### Q2. Should disabled or unavailable claim-control actions stay visible, or should the UI hide actions the operator cannot currently take?

**Branch:** Disabled and ineligible states

**Recommended answer:** Keep all three actions visible as disabled controls with backend-provided unavailable reasons.
> SPEC-013C already exposes closed `available_actions` descriptors, and visible disabled states help operators understand why retry, release, or cancel is blocked without recomputing eligibility in the client.

**Alternatives offered:**
- Hide unavailable actions and show only currently enabled controls: Reduces clutter, but makes blocked states harder to diagnose and weakens the debug value of the UI.
- Show only a status summary until at least one action is enabled: Quieter, but makes ineligible and flag-off states less explicit.

**User's answer:** A - keep disabled actions visible with backend-provided reasons.

---

### Q3. What confirmation pattern should the UI use before submitting a claim-control mutation?

**Branch:** Confirmation flow

**Recommended answer:** Use an inline confirmation state inside the `Claim control` section for each action, with a short summary of the target stage and outcome, then a confirm button.
> This keeps the flow accessible, testable with Playwright, and avoids browser-native `confirm()` while staying inside the existing task detail modal.

**Alternatives offered:**
- Use the existing browser-native `confirm()` pattern: Faster and matches the current delete-task shortcut, but harder to style and test, and weaker for showing expected state/backoff details.
- Open a second modal for confirmation: More space, but adds nested modal complexity and risks focus/keyboard bugs in an existing modal.

**User's answer:** A - inline confirmation inside the `Claim control` section.

---

### Q4. How should the UI handle active retry backoff when retry is otherwise eligible?

**Branch:** Backoff and override UX

**Recommended answer:** Show the retry action disabled by default with the backend's backoff time/reason, plus an inline override path that requires an operator reason before enabling confirmation.
> SPEC-013C already requires audited override reasons, and this keeps the client from inventing retry policy.

**Alternatives offered:**
- Hide override entirely and tell the operator to wait until backoff expires: Simpler and safer, but fails the operator-recovery intent for urgent stuck work.
- Always allow retry and let the API return `retry_backoff_active`: Simpler UI, but creates avoidable failed actions.

**User's answer:** A - show backoff and require an inline override reason.

---

### Q5. After a retry/release/cancel request succeeds or returns a semantic conflict, what should refresh automatically?

**Branch:** Refresh and stale state

**Recommended answer:** Refresh the claim-reconciliation read model, task evidence, stage attempts, and task list item state, then show bounded inline success/error feedback in the `Claim control` section.
> This uses SPEC-013C as the source of truth and keeps the visible task detail synchronized after stale, conflict, or idempotent outcomes.

**Alternatives offered:**
- Refresh only the claim-control section: Faster and narrower, but risks stale `Evidence`, `Run state`, or task-board state after mutation.
- Close the task detail modal and rely on the board reload: Avoids partial stale UI, but prevents immediate audit/debug inspection.

**User's answer:** A - refresh claim-reconciliation, task evidence, stage attempts, and task list state, then keep inline feedback visible.

---

### Q6. Which roles should be able to see and use the claim-control section?

**Branch:** Authorization visibility

**Recommended answer:** Show the section to any task-visible user when the read model returns `claim_control`, but only enable mutation controls when `authorization.can_mutate=true`.
> This mirrors SPEC-013C's read-model contract and keeps permission explanations backend-driven. Viewers can see disabled actions with `insufficient_role` reasons.

**Alternatives offered:**
- Hide the entire section from viewers and only show it to operators/admins: Cleaner for viewers, but hides useful debug state and weakens the "why can't I act?" story.
- Show only a generic read-only claim summary to viewers: Reduces perceived affordance, but adds client branching and duplicates backend reason logic.

**User's answer:** A - show backend-provided claim-control state to task-visible users and enable mutations only when the backend authorizes them.

---

### Q7. How should the UI generate and handle `Idempotency-Key` for retry/release/cancel submissions?

**Branch:** Idempotency and retries

**Recommended answer:** Generate a fresh client-side idempotency key per confirmation attempt, keep it in component state while the request is in flight, and reuse it only for an immediate retry of the same failed network submission.
> This matches SPEC-013C's replay contract without exposing raw keys in the UI or persisting them beyond the task detail session.

**Alternatives offered:**
- Generate a deterministic key from task, stage, action, and expected state: Improves repeatability, but risks replay collisions across separate operator decisions.
- Require the operator to type or paste an idempotency key: Explicit but too operationally noisy for an in-app recovery control.

**User's answer:** A - fresh per-confirmation idempotency key, held only for the in-flight attempt and same failed network retry.

---

### Q8. What should the operator see after a claim-control action returns?

**Branch:** Outcome receipt

**Recommended answer:** Show a compact inline outcome receipt in the `Claim control` section with action, backend outcome, stage key, refreshed availability, audit/activity reference when present, idempotency replay status, and sanitized error category for conflicts.
> This gives operators enough proof to trust the action without exposing raw request bodies, raw idempotency keys, or internal diagnostics.

**Alternatives offered:**
- Show only a short toast-style success/error message: Lighter, but the result may disappear before the operator compares it with evidence and run state.
- Add the full response JSON behind expandable details: Useful for debugging, but risks normalizing fields that should not be operator-facing and adds review burden.

**User's answer:** A - compact inline outcome receipt.

---

### Q9. What browser/UI verification should SPEC-013D require?

**Branch:** UI verification

**Recommended answer:** Add a real Playwright task-detail journey covering enabled release/cancel/retry, disabled/ineligible reasons, backoff override reason entry, stale/conflict refresh, viewer read-only state, and feature-flag-off behavior, with screenshots for before/confirm/after states.
> Constitution XIV requires a real browser journey for changed user-facing UI, and the repo already has task detail evidence e2e patterns.

**Alternatives offered:**
- Use component tests plus route/domain unit tests only: Faster, but does not satisfy the real UI journey quality gate.
- Add Playwright only for the happy path and leave disabled/error states to unit tests: Lower e2e cost, but misses recovery states operators are most likely to need.

**User's answer:** A - real Playwright task-detail journey with screenshots covering enabled, disabled, backoff, stale/conflict, viewer, and flag-off states.

---

### Q10. What should the task detail UI use as the source of truth for claim-control state?

**Branch:** Source of truth

**Recommended answer:** Add a dedicated task-detail fetch for `GET /api/tasks/[id]/claim-reconciliation` and render a new `ClaimControlSection` from the returned `claim_control` data.
> This keeps SPEC-013C's read model authoritative and avoids mixing mutating control state into older task evidence or stage-attempt routes.

**Alternatives offered:**
- Extend `/api/tasks/[id]/evidence` to include claim-control state: Reduces client requests, but duplicates SPEC-013C's read model and blurs evidence/control boundaries.
- Derive state from `/api/tasks/[id]/stage-attempts` plus task data: Avoids another API call, but violates SPEC-013C's requirement that SPEC-013D not recompute eligibility client-side.

**User's answer:** A - dedicated task-detail fetch for `GET /api/tasks/[id]/claim-reconciliation`.

---

### Q11. Should the UI require an operator-written reason for release and cancel actions, or only for backoff override?

**Branch:** Operator reasons

**Recommended answer:** Require a bounded reason for `cancel` and backoff override, but make `release` reason optional with a short default summary.
> Cancel intentionally stops automatic pickup and should carry operator intent. Release is often ownership cleanup and should stay low-friction.

**Alternatives offered:**
- Require a reason for all three actions: Maximizes audit context, but makes simple release cleanup unnecessarily heavy.
- Require a reason only for backoff override: Matches the strict backend minimum, but cancel audit evidence may be too thin for later diagnosis.

**User's answer:** A - require a bounded reason for `cancel` and backoff override; `release` can use an optional/default reason.

---

### Q12. How should the UI behave when the feature flag is off or the task has no `claim_control` data?

**Branch:** Feature flag and absent state

**Recommended answer:** Do not render actionable controls; show either no section when `claim_control` is absent, or a compact disabled section when the backend returns `feature_flag.enabled=false` with the backend reason.
> This keeps flag-off installs quiet while still allowing explicit debug visibility when the read model provides it.

**Alternatives offered:**
- Always render the section with all controls disabled and a generic unavailable message: Consistent visually, but noisy for tasks with no claim-control relevance.
- Render only an error-style warning when the flag is off: More noticeable, but makes normal disabled rollout look defective.

**User's answer:** A - no actionable controls; quiet absent state unless the backend provides disabled/debug state.

---

### Q13. Should SPEC-013D include Storybook/visual component states in addition to Playwright?

**Branch:** Visual review

**Recommended answer:** Add Storybook stories for `ClaimControlSection` states that can be represented without a running backend: enabled active claim, disabled viewer, backoff override required, stale/conflict receipt, flag-off, loading, and error.
> Playwright remains the acceptance gate, but Storybook gives reviewers stable visual states and matches Constitution XIV's guidance for changed UI journeys.

**Alternatives offered:**
- Use Playwright screenshots only: Satisfies the hard UI journey gate, but makes visual review less focused for individual component states.
- Use Storybook only for disabled/error states and rely on Playwright for enabled mutation paths: Narrower, but may miss normal happy-path component review.

**User's answer:** A - Storybook states supplement the required Playwright journey.

## Open Questions

No critical open questions remain from setup. Clarify should still verify exact operator-facing copy, the final component API for `ClaimControlSection`, and the deterministic e2e fixture shape before planning.

## Recommended Next Step

Run setup's generated workflow:

```bash
$speckit-autopilot docs/ai/specs/SPEC-013D-workflow.md
```
