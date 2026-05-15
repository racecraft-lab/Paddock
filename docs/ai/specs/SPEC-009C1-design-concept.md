---
topic: "GitHub Pilot Issue Ingest and Eligibility"
slug: "spec-009c1-pilot-issue-ingest"
date: "2026-05-14"
mode: "setup"
spec_id: "SPEC-009C1"
source_input:
  type: "interactive"
  ref: "SPEC-009C1 roadmap entry plus Grill Me setup interview"
question_count: 10
stop_reason: "natural"
---

# Design Concept: GitHub Pilot Issue Ingest and Eligibility

> **Source:** SPEC-009C1 roadmap entry plus interactive setup interview
> **Date:** 2026-05-14
> **Questions asked:** 10
> **Stop reason:** natural

## Goals

- Prove that one eligible `racecraft-lab/mission-control` GitHub issue can enter Mission Control as exactly one GitHub-linked pilot root task.
- Keep SPEC-009C1 deterministic and reviewable by using operator-triggered sync, fixture-driven tests, and a manual smoke checklist instead of automatic polling or runtime dispatch.
- Define executable pilot eligibility around GitHub tracker truth: repo identity, issue number, `mc:inbox`, `priority:*`, exactly one routable `area:*`, no duplicate local task, and no terminal/linked-PR state.
- Provide an idempotent synthetic fallback path for `[mc-pilot] synthetic e2e issue` when no safe live issue exists.
- Prove local-only tasks created through `/api/tasks` or the task board cannot enter the pilot lane.
- Prove current-schema absence of claim, dispatch, remediation, runner, and successor side effects without inventing future run-state tables.
- Update the roadmap so deferred GitHub sync automation and operator-visible pilot evidence each have explicit future spec homes.

## Non-goals

- Automatic GitHub sync cron or poller lifecycle wiring in SPEC-009C1; this is deferred to a future GitHub sync automation spec (Q1, Q2).
- Issue Triage, Issue Remediation, successor creation, claim authority, scheduler dispatch, runner launch, sandbox lifecycle, or harness adapter work (Q1, Q8).
- Production pilot eligibility UI or new operator evidence panels in SPEC-009C1; this is deferred to a future post-SPEC-009D evidence-surface spec (Q5, Q6).
- Changing workflow-contract tracker-label semantics in SPEC-009C1; pilot eligibility labels remain separate from workflow-template metadata (Q7).
- Live GitHub mutation from automated tests or normal app runtime; live selection/creation is an explicit operator smoke/script action only (Q4, Q9).
- Placeholder schema or fake run-state tables just to assert absence; current-schema assertions are sufficient for this slice (Q8).

## Design Tree (Q&A log)

### Q1. For SPEC-009C1, should the pilot prove GitHub issue ingest through an operator-triggered sync only, or should it also wire automatic GitHub sync polling/cron into the runtime?

**Branch:** Sync automation scope

**Recommended answer:** Operator-triggered sync only for SPEC-009C1.
> Use the existing `/api/github/sync` or `pullFromGitHub` test seam to keep the pilot deterministic. Automatic poller wiring broadens the spec into scheduler/runtime work that the roadmap did not assign to Phase 8C1.

**Alternatives offered:**
- Include minimal runtime poller wiring: proves automation now, but widens SPEC-009C1 into scheduler/runtime.
- Require an OpenClaw or external cron job: proves live automation, but couples the pilot to operator-node infrastructure.

**User's answer:** Option A, with the explicit note that the roadmap needs a future spec for GitHub sync automation cron/poller.

---

### Q2. Where should the roadmap capture GitHub sync automation so it is explicit without expanding SPEC-009C1?

**Branch:** Roadmap sequencing

**Recommended answer:** Add a dedicated future mini-spec immediately before `SPEC-013B`, for example `SPEC-013A1: GitHub Sync Automation and Poller Lifecycle`.
> GitHub sync automation is scheduler/runtime work that should become executable before claim/reconciliation relies on automatic issue discovery. A standalone spec keeps `SPEC-013B` focused on claim authority.

**Alternatives offered:**
- Fold it into `SPEC-013B`: keeps scheduler work together, but expands claim/reconciliation.
- Add only notes under `SPEC-009C1` and `SPEC-010B`: lightest, but not reliably executable.

**User's answer:** Option A.

---

### Q3. For SPEC-009C1, what should count as an eligible live pilot issue before falling back to a synthetic `[mc-pilot]` issue?

**Branch:** Pilot issue eligibility

**Recommended answer:** Require an open `racecraft-lab/mission-control` issue with `mc:inbox`, at least one `priority:*` label, exactly one routable `area:*` label, no existing synced Mission Control task for that issue, and no linked PR or terminal status.
> This makes the pilot deterministic and proves the source-of-truth gate cleanly. It also exercises the intended Mission Control label families without making the first pilot depend on ambiguous routing.

**Alternatives offered:**
- Allow missing or ambiguous `area:*` labels and route through triage: exercises more existing behavior, but makes the pilot less deterministic.
- Use any open issue in the repo: operationally easy, but weakens the eligibility proof.

**User's answer:** Option A.

---

### Q4. How should the synthetic fallback issue be created and cleaned up?

**Branch:** Synthetic issue fallback

**Recommended answer:** Add an idempotent operator script or command path for setup/smoke use: find an existing open `[mc-pilot] synthetic e2e issue` first, otherwise create it with `mc:inbox`, `priority:medium`, and `area:dev`; do not auto-close it from the script, app runtime, CI, or sync path, but require manual cleanup instructions in the pilot smoke checklist after evidence is captured.
> This avoids hidden live GitHub mutation during normal app runtime while keeping the pilot reproducible when no safe live issue exists.

**Alternatives offered:**
- Create the synthetic issue inside app GitHub sync when no live issue exists: automatic, but mixes runtime sync with fallback mutation.
- Require the operator to prepare it manually: safest for mutation, but less reproducible.

**User's answer:** Option A.

---

### Q5. Should SPEC-009C1 add production UI for pilot eligibility/evidence, or keep evidence to tests, CLI/script output, and the smoke checklist?

**Branch:** Evidence surface scope

**Recommended answer:** No new production UI.
> Evidence should come from focused tests, operator script output, DB/API assertions, and `docs/qa/pilot-smoke-checklist.md`. The existing GitHub sync UI/status can be referenced, but this spec should avoid a UI surface.

**Alternatives offered:**
- Add a small read-only API endpoint: more machine-friendly, but expands production API surface.
- Add a UI panel or badge: useful, but too much surface for this narrow spec.

**User's answer:** Option A, with the explicit note that the roadmap needs a future planned spec for operator-visible eligibility/evidence.

---

### Q6. Where should that future eligibility/evidence surface live in the roadmap?

**Branch:** Evidence-surface roadmap sequencing

**Recommended answer:** Add it as a follow-on after `SPEC-009D`, because the review packet/lifecycle snapshot will reveal the real operator evidence model before UI/API gets formalized.
> A separate post-SPEC-009D observability spec can turn pilot evidence into durable operator-visible surfaces without widening SPEC-009C1 or overloading the review-packet spec.

**Alternatives offered:**
- Fold it into `SPEC-009D`: keeps pilot evidence together, but risks making review packets UI/API-heavy.
- Put it after `SPEC-013A/B`: waits for stronger backend truth, but delays basic operator visibility.

**User's answer:** Option A.

---

### Q7. Should SPEC-009C1 modify the existing workflow contract labels so pilot eligibility and workflow contract tracker labels match, or should it keep eligibility separate from workflow-contract template metadata?

**Branch:** Workflow contract semantics

**Recommended answer:** Keep them separate in SPEC-009C1, but document the distinction.
> Pilot eligibility uses executable GitHub issue labels `mc:*`, `priority:*`, and `area:*`. Workflow-contract tracker labels remain template metadata unless a later contract spec defines them as executable eligibility filters.

**Alternatives offered:**
- Update the workflow contract with `mc:inbox`, `priority:*`, and `area:*` filters: looks aligned, but may imply unsupported wildcard semantics.
- Stop setup until contract semantics are redesigned: safest semantically, but too heavy for this setup.

**User's answer:** Option A.

---

### Q8. How should SPEC-009C1 prove no claim/dispatch/runner state without depending on future SPEC-013/014 tables that do not exist yet?

**Branch:** Negative proof and schema boundary

**Recommended answer:** Assert absence across current surfaces only: no successor/remediation task, no assignment/dispatch side effects in existing task/activity fields, no pipeline/agent run artifacts if those tables exist, and smoke-checklist notes that formal run-state assertions are deferred to SPEC-013A+.
> This keeps proof grounded in the live schema and avoids creating placeholder control-plane tables before their owning specs.

**Alternatives offered:**
- Add placeholder run-state tables or fields now: creates schema before the run-state spec.
- Only state it in docs: lighter, but too weak for the definition of done.

**User's answer:** Option A.

---

### Q9. Should the GitHub pilot issue selection/creation path use the GitHub CLI/API live during implementation, or should tests stay fully fixture-driven with live GitHub only in the manual smoke checklist?

**Branch:** Test strategy and external mutation

**Recommended answer:** Tests stay fixture-driven and deterministic; live GitHub selection/creation is only an operator smoke/checklist step or script run with explicit credentials.
> This avoids flaky CI, protects against unintended external mutation, and matches the repo's existing test seam discipline around GitHub sync.

**Alternatives offered:**
- Include live GitHub integration tests behind an env var: stronger end-to-end confidence, but higher flake and secret risk.
- No scripted live path at all: safe, but less reproducible.

**User's answer:** Option A.

---

### Q10. Should SPEC-009C1 update roadmap status only to `In Progress`, or also insert the two new future specs now: GitHub sync automation and pilot eligibility/evidence surface?

**Branch:** Setup roadmap mutation

**Recommended answer:** Insert the two future roadmap mini-specs now, plus mark SPEC-009C1 `In Progress`.
> This matches the user's direction and prevents deferred automation/visibility work from being lost as soft notes.

**Alternatives offered:**
- Mark SPEC-009C1 `In Progress` only: less roadmap churn, but weaker follow-through.
- Do not update the roadmap during setup: conflicts with setup's required status update.

**User's answer:** Option A.

## Open Questions

- **What:** Exact script name and implementation shape for the synthetic fallback path.
  **Why deferred:** The interview fixed the operator-script boundary, but implementation should inspect existing seed/smoke script conventions before naming a new script.
  **Suggested next step:** Specify/Plan should choose a script path, probably under `scripts/`, and require idempotency tests for "find existing open synthetic issue first, otherwise create."
- **What:** Whether automatic GitHub sync automation should be owned by a separate runtime flag or existing GitHub sync settings only.
  **Why deferred:** This is out of scope for SPEC-009C1 and belongs to the future GitHub sync automation spec.
  **Suggested next step:** `SPEC-013A1` should define poller lifecycle, startup wiring, operator disable/rollback, interval safety, and observability.
- **What:** Exact operator-visible evidence surface for pilot eligibility.
  **Why deferred:** This should be informed by `SPEC-009D` lifecycle packet output rather than designed before the pilot runs.
  **Suggested next step:** `SPEC-009E` should turn the manual/test evidence into durable read-only operator surfaces after `SPEC-009D`.
- **What:** Exact current-schema queries for absence of claim/dispatch/runner state.
  **Why deferred:** The principle is fixed, but the Specify/Plan phases should inspect live tables and avoid claiming nonexistent schema.
  **Suggested next step:** Specify should require evidence over current tables only and explicitly defer formal run-state checks to `SPEC-013A+`.

## Recommended Next Step

Run `$speckit-autopilot docs/ai/specs/SPEC-009C1-workflow.md` from the `009c1-pilot-issue-ingest` worktree after setup commits and pushes this design concept, workflow file, and roadmap status/follow-up-spec update.
