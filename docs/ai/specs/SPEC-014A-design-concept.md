---
topic: "Sandbox ownership and lifecycle contract"
slug: "spec-014a-sandbox-lifecycle-contract"
date: "2026-05-28"
mode: "setup"
spec_id: "SPEC-014A"
source_input:
  type: "file"
  ref: "docs/ai/rc-factory-technical-roadmap.md#SPEC-014A"
question_count: 24
stop_reason: "natural"
---

# Design Concept: Sandbox Ownership and Lifecycle Contract

> **Source:** docs/ai/rc-factory-technical-roadmap.md#SPEC-014A
> **Date:** 2026-05-28
> **Questions asked:** 24
> **Stop reason:** natural

## Goals

- Define deterministic, sanitized, product-line-scoped sandbox keys and bounded filesystem paths for Paddock-owned, OpenClaw-owned, and external-harness-owned sandboxes.
- Add a durable, inspectable sandbox lifecycle contract before any real harness adapter can launch work.
- Use fake owner implementations to prove lifecycle behavior without launching a real runner, adapter, OpenClaw job, or external harness.
- Keep `FEATURE_AGENT_RUNNER_SANDBOXES` hard-off by default; flag-off mutation attempts must create no lifecycle rows or events.
- Preserve existing claim/reconciliation authority from SPEC-013B; sandbox ownership is execution context, not the active claim lock.
- Leave first operator-visible sandbox lifecycle UI integration to SPEC-014B runtime inventory, with richer controls reserved for SPEC-014C/D or a later dedicated spec.

## Non-goals

- Real harness launches, resume/stop behavior, token accounting, or adapter manifests are not in SPEC-014A; they belong to SPEC-014B-D.
- Operator UI is not in SPEC-014A beyond API/read-model support; first UI visibility belongs to SPEC-014B runtime inventory.
- Retry, release, cancel, and debug controls remain SPEC-013C scope.
- Sandbox lifecycle must not own tracker truth, successor selection, resource-governance policy, auto-merge, or claim authority.
- No automatic stale-sandbox reaper is added in SPEC-014A.
- No raw prompts, tokens, provider/session payloads, raw user path fragments, or host-sensitive absolute paths are persisted as sandbox event metadata.

## Design Tree (Q&A log)

### Q1. For SPEC-014A, should sandbox lifecycle state be durable in SQLite now, or should this slice define the contract with fake in-memory lifecycle evidence only?

**Branch:** Data model and persistence

**Recommended answer:** Durable SQLite.
> Add narrow additive sandbox lifecycle/event persistence so inspectability, cleanup, and rollback are testable before real adapters.

**Alternatives offered:**
- Fake-only memory: Keep SPEC-014A smaller by proving path/key and hook semantics with in-memory fakes, deferring persistence to SPEC-014B/C.
- Existing events only: Use activities or task-stage attempt events for inspectability without adding sandbox-specific tables.

**User's answer:** A, Durable SQLite.

---

### Q2. Should SPEC-014A define sandbox ownership as a closed enum now?

**Branch:** Ownership model

**Recommended answer:** Yes, closed enum: `mission_control`, `openclaw`, `external_harness`.
> This matches the roadmap, keeps fake implementations bounded, and lets later adapter specs extend intentionally.

**Alternatives offered:**
- Allow arbitrary owner strings: More flexible for future adapters, but weaker for validation.
- Closed enum plus `unknown`: Easier import path for messy external data, but less fail-closed.

**User's answer:** A, closed enum: `mission_control`, `openclaw`, `external_harness`.

---

### Q3. What should be the canonical sandbox key shape?

**Branch:** Key and path identity

**Recommended answer:** Stable ID-based key with readable sanitized slugs: `workspace/<workspace_id>/product-line/<product_line_slug>/task/<task_id>/stage/<stage_key>/attempt/<attempt_id>/owner/<owner>`.
> IDs provide authority; slugs are sanitized readability only.

**Alternatives offered:**
- Opaque generated key: Strong against path/name leakage, but harder to inspect.
- Human-readable key from repo/task titles: Easier to read, but collision-prone and harder to validate safely.

**User's answer:** A, stable ID-based key with readable sanitized slugs.

---

### Q4. What should cleanup do when lifecycle creation partially succeeds and a later hook fails?

**Branch:** Cleanup and rollback

**Recommended answer:** Best-effort compensating cleanup with durable failure evidence.
> Mark the lifecycle `cleanup_failed` only if cleanup itself fails; otherwise mark `rolled_back` with structured event history.

**Alternatives offered:**
- Fail fast and leave the sandbox for manual inspection: Better debugging, but risks leaked worktrees/handles.
- Always delete everything silently: Keeps disk tidy, but loses inspectability and auditability.

**User's answer:** A, compensating cleanup with durable failure evidence.

---

### Q5. Should the feature flag gate only create/run paths, or also read/inspect paths?

**Branch:** Feature flag behavior

**Recommended answer:** Gate all create/run/mutation paths, but keep read/inspect APIs available with `flag_disabled` or empty state evidence.
> Operators need to verify disabled state without enabling the feature.

**Alternatives offered:**
- Gate both mutation and read paths: Stronger isolation, but harder to verify.
- Gate create/run only and allow cleanup mutation while disabled: Useful for emergencies, but weakens the hard-off contract.

**User's answer:** A, gate mutation paths while keeping read/inspect available with disabled-state evidence.

---

### Q6. Where should SPEC-014A anchor sandbox filesystem roots?

**Branch:** Filesystem boundary

**Recommended answer:** Default to `<MISSION_CONTROL_DATA_DIR>/sandboxes` with optional reviewed per-workspace configuration.
> Every sandbox path must resolve through a bounded helper that rejects traversal, unsafe segments, and root escape.

**Alternatives offered:**
- Require explicit per-workspace root configuration: Safer for operators, but heavier setup.
- Store only logical handles in v1: Smaller, but weakens bounded-path acceptance.

**User's answer:** A, default `<MISSION_CONTROL_DATA_DIR>/sandboxes` with optional reviewed per-workspace config and bounded path resolver.

---

### Q7. Should SPEC-014A include lifecycle hooks for `create`, `prepare`, `mark_running`, `mark_terminal`, and `cleanup`, or keep the hook vocabulary smaller?

**Branch:** Lifecycle vocabulary

**Recommended answer:** Use `create`, `prepare`, `mark_running`, `mark_terminal`, and `cleanup`.
> This is enough to model fake Paddock/OpenClaw/external ownership without adding real launch/resume adapter behavior.

**Alternatives offered:**
- Only `create` and `cleanup`: Too thin to prove inspectable lifecycle transitions.
- Add richer hooks now: `launch`, `resume`, `pause`, `snapshot`, `archive`, which crosses into later adapter/runner behavior.

**User's answer:** A, lifecycle hooks are `create`, `prepare`, `mark_running`, `mark_terminal`, and `cleanup`.

---

### Q8. How should SPEC-014A model lifecycle status?

**Branch:** State model

**Recommended answer:** Use a closed coarse status enum plus detailed event rows.
> `created`, `prepared`, `running`, `terminal`, `cleanup_pending`, `cleaned_up`, `rolled_back`, and `cleanup_failed` keep current state queryable while event rows carry reasons.

**Alternatives offered:**
- One detailed status enum for everything: Easier one-column queries, but mixes state with reasons.
- Append-only events only: Very auditable, but heavier and less consistent with existing read models.

**User's answer:** A, coarse closed status enum plus append-only detailed event rows.

---

### Q9. What should durable sandbox event metadata persist for paths and handles?

**Branch:** Evidence safety

**Recommended answer:** Persist sandbox key, owner, root identifier, sanitized relative path, handle id, lifecycle ids, timestamps, and redacted reason codes.
> Avoid raw user-provided path fragments, raw prompts, tokens, or provider/session payloads.

**Alternatives offered:**
- Persist the resolved absolute path too: Easier debugging, but leaks host layout.
- Persist only opaque IDs: Strong minimization, but weaker bounded-path proof.

**User's answer:** A, persist bounded logical evidence and sanitized relative paths, not raw path fragments or provider payloads.

---

### Q10. How should SPEC-014A link sandboxes to existing run-control state?

**Branch:** Control-plane integration

**Recommended answer:** Link sandbox lifecycles to `workspace_id`, `task_id`, `stage_key`, optional `task_stage_attempt_id`, and optional `task_stage_claim_id`.
> Keep sandbox ownership separate from claim authority so later specs can attach execution without making sandboxes the lock.

**Alternatives offered:**
- Link only to task/stage: Simpler, but loses traceability to attempts and claims.
- Link directly to `AgentRun` only: Risks skipping the task-stage/claim chain that owns launch authority.

**User's answer:** A, link to task/stage plus optional attempt and claim, while keeping sandbox ownership separate from claim authority.

---

### Q11. How should duplicate lifecycle creation behave for the same sandbox key?

**Branch:** Idempotency

**Recommended answer:** Make creation idempotent for the same deterministic key while the existing lifecycle is nonterminal.
> Return the existing lifecycle and append a `create_reused` event; if owner or bounded path inputs conflict, fail closed with validation evidence.

**Alternatives offered:**
- Reject every duplicate create attempt: Strong uniqueness, but noisier retries.
- Always create a new lifecycle row with incrementing attempt numbers: Useful for repeated runs, but risks duplicate handles.

**User's answer:** A, idempotent create for the same deterministic key, conflict failure for mismatched inputs.

---

### Q12. Should SPEC-014A include a minimal read API now?

**Branch:** Inspectability surface

**Recommended answer:** Yes, add a read-only task-scoped or lifecycle-scoped API returning `sandbox_lifecycle.v1`.
> Include disabled-state evidence, current status, owner, sanitized path evidence, and recent events without adding UI unless Plan proves one necessary.

**Alternatives offered:**
- No API: Smaller, but weaker for operator-visible lifecycle evidence.
- Add API and UI now: More visible, but likely broadens the review surface.

**User's answer:** A, add a minimal read-only `sandbox_lifecycle.v1` API; no UI unless Plan proves it necessary.

---

### Q13. What durable schema shape should SPEC-014A prefer?

**Branch:** Schema shape

**Recommended answer:** Add `agent_sandbox_lifecycles` for current lifecycle state and `agent_sandbox_lifecycle_events` for append-only audit events, with rollback SQL.
> This keeps sandbox lifecycle distinct from claims, attempts, activities, and adapter manifests.

**Alternatives offered:**
- One combined table with JSON event history: Smaller schema, weaker audit queries.
- Reuse `task_stage_attempt_events`: Avoids migration, but blurs passive attempt evidence with sandbox ownership.

**User's answer:** A, plus note that the roadmap must contain a future spec that handles operator UI.

**Notes:** The roadmap check showed runtime-inventory UI belongs broadly to SPEC-014B/SPEC-014D, but sandbox lifecycle operator UI needed explicit ownership. Q14 resolved that SPEC-014B should own first operator-visible runtime inventory integration with read-only sandbox lifecycle references.

---

### Q14. Which future spec should own sandbox lifecycle operator UI?

**Branch:** UI deferral and roadmap ownership

**Recommended answer:** SPEC-014B owns first operator-visible runtime inventory integration, including read-only sandbox lifecycle references from SPEC-014A.
> Richer lifecycle controls stay out until SPEC-014C/D or a later dedicated spec.

**Alternatives offered:**
- SPEC-014A should add read-only UI now: More directly inspectable, but broadens this slice.
- Add future SPEC-014E dedicated to sandbox lifecycle UI and controls: Clean separation, but adds another roadmap unit.

**User's answer:** A, SPEC-014B owns first operator-visible runtime inventory integration with read-only sandbox lifecycle references; controls stay out until SPEC-014C/D or a later dedicated spec.

---

### Q15. Should SPEC-014A define fake owner implementations as shared test fixtures only, or production-code fakes behind the feature flag?

**Branch:** Fake implementation placement

**Recommended answer:** Production-code fakes behind `FEATURE_AGENT_RUNNER_SANDBOXES`, with tests proving they cannot launch a real harness.
> This gives SPEC-014B a stable fake registry foundation without hidden test-only contracts.

**Alternatives offered:**
- Test fixtures only: Smaller runtime surface, but later specs may reinterpret behavior.
- Production fakes plus a dev-only UI switch: Useful for manual testing, but adds UI/config scope.

**User's answer:** A, production-code fakes behind `FEATURE_AGENT_RUNNER_SANDBOXES`, with no real harness launch ability.

---

### Q16. How should SPEC-014A handle lifecycle events when `FEATURE_AGENT_RUNNER_SANDBOXES` is OFF?

**Branch:** Flag-off mutation proof

**Recommended answer:** No create/prepare/running/terminal/cleanup mutations execute.
> Read APIs return disabled-state evidence and tests prove no lifecycle rows or events are inserted by disabled mutation attempts.

**Alternatives offered:**
- Record denied mutation attempts as lifecycle events: More audit detail, but weakens hard-off.
- Allow cleanup events while disabled: Useful escape hatch, but should be separately ratified.

**User's answer:** A, flag OFF prevents all sandbox lifecycle mutations and creates no lifecycle rows/events; reads return disabled-state evidence.

---

### Q17. What should SPEC-014A do about external OpenAI Harness Engineering and Symphony context during autopilot?

**Branch:** External research boundary

**Recommended answer:** Require Specify and Plan to fetch current external Harness Engineering and Symphony sources.
> Map only workspace safety, lifecycle vocabulary, and context-legibility lessons into Paddock. Do not import Symphony runner/client algorithms into SPEC-014A.

**Alternatives offered:**
- Treat roadmap context as sufficient: Faster, but violates the roadmap requirement.
- Pull in Symphony workspace-dispatch algorithm now: Crosses into SPEC-014C/D runner behavior.

**User's answer:** A, fetch current external context during Specify/Plan and import only lifecycle/safety/context-legibility lessons.

---

### Q18. What should the SPEC-014A reviewability split exception say?

**Branch:** Reviewability budget

**Recommended answer:** Accept a narrow transition exception only for the lifecycle safety boundary.
> Include one additive schema pair, one helper/API surface, production fakes, and tests. Explicitly defer operator UI to SPEC-014B, adapter manifests to SPEC-014B, real execution to SPEC-014C/D, and retry/debug to SPEC-013C.

**Alternatives offered:**
- No exception; force another split before scaffolding: Strict, but may leave acceptance criteria unprovable together.
- Broad exception for all SPEC-014A-D runner work: Too wide.

**User's answer:** A, narrow transition exception for lifecycle safety only, with UI/manifest/real execution/retry surfaces deferred.

---

### Q19. What should the acceptance test emphasis be for path safety?

**Branch:** Test strategy

**Recommended answer:** Include adversarial tests for traversal, absolute paths, symlink-like segments, unsafe Unicode/control characters, reserved names, duplicate normalized keys, overlong segments, and root escape after normalization.
> This makes the bounded-root contract reviewable before real harnesses exist.

**Alternatives offered:**
- Cover only `../` traversal and absolute paths: Too weak.
- Defer path adversarial corpus to the first real adapter: Undermines fake lifecycle safety proof.

**User's answer:** A, broad adversarial path-safety tests.

---

### Q20. What should happen to lifecycle rows after successful cleanup?

**Branch:** Retention

**Recommended answer:** Keep rows and append a `cleaned_up` event; do not delete durable lifecycle evidence.
> Physical sandbox artifacts may be removed, but audit/state rows remain for review packets and later runtime inventory.

**Alternatives offered:**
- Delete rows after cleanup: Smaller tables, but loses auditability.
- Archive rows immediately to files: Premature before retention policy is defined.

**User's answer:** A, keep durable lifecycle rows after cleanup and append `cleaned_up`; physical artifacts may be removed.

---

### Q21. Should SPEC-014A define retention/cleanup policy in detail now?

**Branch:** Cleanup policy

**Recommended answer:** Define minimal policy now.
> Lifecycle rows are durable audit evidence, physical fake sandbox artifacts are removed on cleanup/rollback, stale `cleanup_pending` rows are inspectable but not auto-reaped until a later operator-control spec.

**Alternatives offered:**
- Add automatic stale sandbox reaper now: Adds scheduler/runtime behavior beyond this slice.
- Defer all retention policy: Leaves cleanup behavior underspecified.

**User's answer:** A, minimal retention policy now; no auto-reaper in SPEC-014A.

---

### Q22. What should the read API require for authorization and scope?

**Branch:** Security and authorization

**Recommended answer:** Reuse existing authenticated task-scoped read patterns.
> Require the same auth/workspace access as task evidence or stage-attempt reads, accept task/lifecycle identifiers, and never expose lifecycle rows across workspace boundaries.

**Alternatives offered:**
- Admin-only read API: Simpler, but less useful for future runtime inventory.
- Public/internal unauthenticated API: Unacceptable for sandbox path and run-state evidence.

**User's answer:** A, reuse authenticated workspace/task-scoped read authorization and block cross-workspace reads.

---

### Q23. Should SPEC-014A include API index/OpenAPI parity for the read endpoint?

**Branch:** API documentation parity

**Recommended answer:** Yes.
> Any route added for `sandbox_lifecycle.v1` should update API index and OpenAPI docs, with tests or guardrails matching existing parity expectations.

**Alternatives offered:**
- No, because it is internal: Faster, but drifts from route conventions.
- Only API index, not OpenAPI: Partial parity creates review ambiguity.

**User's answer:** A, API index/OpenAPI parity is required for any new read endpoint.

---

### Q24. Should SPEC-014A include a manual UAT step, and what should it prove?

**Branch:** Human validation

**Recommended answer:** Yes.
> Run a fake lifecycle in a disposable target with `FEATURE_AGENT_RUNNER_SANDBOXES` enabled, inspect the read API for bounded key/path/events/cleanup, then disable the flag and verify create/run mutations are blocked while reads show disabled-state evidence.

**Alternatives offered:**
- Automated tests only: Faster, but roadmap requires a named human validation path.
- Manual UI inspection: Useful later, but operator UI is deferred to SPEC-014B.

**User's answer:** A, manual API-based UAT with fake lifecycle, bounded evidence, cleanup, and flag-off disabled-state proof.

## Open Questions

- **What:** Exact route shape for the `sandbox_lifecycle.v1` read API.
  **Why deferred:** Plan should choose the route after reading existing task evidence and task-stage-attempt route patterns.
  **Suggested next step:** Resolve during `/speckit-plan`; candidates include task-scoped and lifecycle-scoped read routes.
- **What:** Whether richer lifecycle controls need SPEC-014C/D coverage or a dedicated later spec.
  **Why deferred:** SPEC-014A and SPEC-014B only need read-only lifecycle evidence.
  **Suggested next step:** Revisit after SPEC-014B runtime inventory and SPEC-014C/D real adapter work.

## Recommended Next Step

Run `$speckit-autopilot docs/ai/specs/SPEC-014A-workflow.md` from the `014a-sandbox-lifecycle-contract` worktree. The workflow should preserve the Design Concept decisions above as the scope source for Specify, Plan, Tasks, Analyze, and Implement.
