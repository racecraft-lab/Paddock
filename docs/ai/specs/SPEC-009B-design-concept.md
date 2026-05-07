---
topic: "Mission Control Product-Line Seed and Flag Activation"
slug: "spec-009b-mission-control-seed"
date: "2026-05-07"
mode: "setup"
spec_id: "SPEC-009B"
source_input:
  type: "interactive"
  ref: "SPEC-009B roadmap entry plus Grill Me setup interview"
question_count: 11
stop_reason: "natural"
---

# Design Concept: Mission Control Product-Line Seed and Flag Activation

> **Source:** SPEC-009B roadmap entry plus interactive setup interview
> **Date:** 2026-05-07
> **Questions asked:** 11
> **Stop reason:** natural

## Goals

- Seed Mission Control itself as Product Line A with a non-facility `mission-control` workspace while preserving `facility` as the Facility/global aggregate support row.
- Keep SPEC-009B Mission-Control-specific and reviewable; defer reusable product-line seeding to SPEC-010A.
- Seed the full PRD department set now: QA, Development, DevSecOps, Marketing, Customer Service, and Finance.
- Preserve and re-home only existing `racecraft-lab/mission-control` issue sync state; the desired post-cleanup state is that only Mission Control issues are synced.
- Use the repo-owned SPEC-009A workflow contract mechanism to seed Issue Triage and Issue Remediation workflow families.
- Enable Phase 1-7 pilot prerequisite flags and `PILOT_MISSION_CONTROL_E2E` only for the Mission Control product-line scope.
- Prove idempotent seed shape, cleanup preflight behavior, and non-dispatch guardrails before SPEC-009C runs a pilot issue.

## Non-goals

- Generic product-line seeding in SPEC-009B; SPEC-010A owns that generalization (Q1).
- Reusing the `facility` workspace as Product Line A or introducing a new product-line table (Q2).
- Creating product-surface projects such as macOS app, UI, website, or docs; surfaces remain labels/metadata under departments (Q3).
- Automatically deleting FocusEngine or any other non-Mission-Control sync state from the seed script (Q5).
- Creating or ingesting a synthetic GitHub issue in SPEC-009B; SPEC-009C owns that pilot input (Q10).
- Enabling future task-control-plane or sandbox-runner flags such as `FEATURE_TASK_CONTROL_PLANE` or `FEATURE_AGENT_RUNNER_SANDBOXES` (Q7).
- Dispatching, claiming, launching, or running autonomous issue work in SPEC-009B (Q4, Q10, Q11).

## Design Tree (Q&A log)

### Q1. For SPEC-009B, should the seed be Mission-Control-specific or generic?

**Branch:** Scope boundary

**Recommended answer:** Mission-Control-specific fixture/script.
> The roadmap makes SPEC-009B the Product Line A proof and SPEC-010A the generic seeder. Keeping this spec specific reduces implementation blast radius and prevents scope theft from SPEC-010A.

**Alternatives offered:**
- Generic seeder now: reusable immediately, but steals SPEC-010A scope.
- Hardcoded script only: fastest, but weak reviewability and harder idempotency testing.

**User's answer:** Option 1.

---

### Q2. What should be the canonical Product Line A identity?

**Branch:** Product-line data model

**Recommended answer:** Upsert a non-facility workspace with slug `mission-control` and display name `Mission Control`, attached to the existing/default tenant, while preserving the seeded Facility workspace as aggregate/global scope.
> The PRD explicitly maps SQL `workspace` to Product Line and preserves `facility` as a global/facility support row. This keeps Product Line scope distinct from Facility aggregate scope.

**Alternatives offered:**
- Reuse the `facility` workspace: simpler, but blurs Facility aggregate vs Product Line scope.
- Create a new product-line entity/table: cleaner domain model, but out of scope and contrary to upstream-compat constraints.

**User's answer:** Option 1 after discussing PRD implications and future FocusEngine/Product Line B behavior.

---

### Q3. How broad should the initial Mission Control department seed be?

**Branch:** Department model

**Recommended answer:** Seed the full PRD department set now: QA, Development, DevSecOps, Marketing, Customer Service, and Finance.
> FR-K1 names this full set, and SPEC-006 area routing needs deterministic department destinations. Product surfaces should remain labels or metadata, not department rows.

**Alternatives offered:**
- Minimal QA + Development only: simpler, but creates follow-up seed churn and weaker triage coverage.
- Infer departments from current GitHub labels: adaptive, but less deterministic and harder to test idempotently.

**User's answer:** Option 1.

---

### Q4. Should SPEC-009B migrate any existing synced `racecraft-lab/mission-control` issue tasks into the new Mission Control product-line intake?

**Branch:** Existing sync continuity

**Recommended answer:** Yes, preserve GitHub linkage/sync metadata and move matching existing synced Mission Control issue tasks into Mission Control triage/intake without dispatching them.
> FR-K6 requires preserving previously synced Mission Control issue metadata and treating it as unprocessed intake. This gives SPEC-009C realistic intake while preserving the SPEC-009B no-dispatch boundary.

**Alternatives offered:**
- Leave existing synced issues untouched: lower risk, but weakens FR-K6 and may create split-brain intake.
- Ignore old tasks and seed only a synthetic issue later: simplest, but less realistic for the pilot base.

**User's answer:** Preserve Mission Control issues only. Additional live-ops note: a FocusEngine project currently runs on `ssh hall`; its GitHub repo sync, project tickets, OpenClaw/gateway agents, and issue-sync cron need explicit cleanup before deploying SPEC-009B code. That cleanup is not a SPEC-009B code blocker, but the target post-cleanup state is that only Mission Control issues are synced.

---

### Q5. How should SPEC-009B handle non-Mission-Control GitHub sync/project state if it exists when the seed runs?

**Branch:** Preflight and destructive behavior

**Recommended answer:** Add a seed preflight that detects non-`racecraft-lab/mission-control` synced projects/tasks/cron/gateway residue and reports a blocking operator cleanup message without deleting anything.
> A seed script should be idempotent and non-destructive. Deleting another product line's live history belongs in an explicit operator cleanup, not an automatic seed side effect.

**Alternatives offered:**
- Automatically unlink/delete non-Mission-Control sync state: convenient, but destructive and risky.
- Ignore non-Mission-Control sync state: fastest, but conflicts with the desired "only Mission Control issues synced" target.

**User's answer:** Option 1.

---

### Q6. Where should the FocusEngine cleanup be documented for operators?

**Branch:** Operator deployment readiness

**Recommended answer:** Put it in a SPEC-009B pre-deploy runbook section/checklist, not in the seed script as deletion behavior.
> The cleanup must be visible at deployment time and require backup/export first. Keeping it as runbook/checklist work prevents silent data loss while making it hard to miss.

**Alternatives offered:**
- Separate GitHub issue only: good tracking, but easy to miss during deployment.
- Inline comments in seed script only: close to code, but poor operator visibility.

**User's answer:** Option 1.

---

### Q7. Which feature flags should the Mission Control Product Line A seed enable?

**Branch:** Feature-flag activation

**Recommended answer:** Enable only the Phase 1-7 flags needed for the pilot on the `mission-control` workspace plus `PILOT_MISSION_CONTROL_E2E`; do not enable future runner/sandbox flags.
> SPEC-009B/009C need the merged primitives but must not jump ahead into SPEC-013 or SPEC-014 runner scope.

**Alternatives offered:**
- Only `PILOT_MISSION_CONTROL_E2E`: narrow, but may not activate the merged primitives the pilot needs.
- Enable future runner/sandbox flags too: tempting, but out of scope.

**User's answer:** Option 1.

---

### Q8. How should governance be seeded for Product Line A?

**Branch:** Resource governance

**Recommended answer:** Conservative allow-with-guardrails defaults: low WIP, modest token/budget caps, no blackout window by default, and enabled policy rows tuned not to block the seed or normal pilot intake.
> SPEC-009B should prove governance policy shape and visibility. SPEC-009C can prove allow/defer/block behavior during the pilot.

**Alternatives offered:**
- Strict blocking policies from day one: stronger safety, but may make the first pilot brittle.
- No governance rows yet: simpler, but fails the roadmap's governance seed expectation.

**User's answer:** Option 1.

---

### Q9. How should the two workflow families be seeded from the SPEC-009A contract mechanism?

**Branch:** Workflow contract continuity

**Recommended answer:** Use the repo-owned Mission Control workflow contract as the source, apply/import it into `workflow_templates` for the `mission-control` workspace, and verify the seeded slugs for both families.
> SPEC-009A made repo-owned workflow policy the source of truth. SPEC-009B should reuse that mechanism rather than duplicating parser/import logic or manual SQL inserts.

**Alternatives offered:**
- Insert workflow templates manually in the seed script: simpler, but bypasses the contract source of truth.
- Do not seed workflows yet: too weak for SPEC-009C and conflicts with FR-K2.

**User's answer:** Option 1.

---

### Q10. Should the seed create or trigger a synthetic GitHub issue?

**Branch:** Pilot boundary

**Recommended answer:** No synthetic issue creation in SPEC-009B.
> SPEC-009B proves configuration and no-dispatch behavior. SPEC-009C owns selecting a safe live issue or creating `[mc-pilot] synthetic e2e issue`.

**Alternatives offered:**
- Create synthetic issue but do not ingest it: mixes pilot concerns into seed.
- Create and ingest synthetic issue: directly conflicts with the seed-only boundary.

**User's answer:** Option 1.

---

### Q11. What should count as successful SPEC-009B setup evidence?

**Branch:** Verification and evidence

**Recommended answer:** Idempotent local/target-database seed verification plus non-dispatch guardrails.
> Reviewable evidence should prove the shape of the seeded product line, blocked cleanup preflight, and zero claimed/dispatched work. This makes SPEC-009C start from a known state.

**Alternatives offered:**
- Only unit tests for seed functions: fast, but misses deployment readiness.
- Only manual target-deployment checklist: realistic, but weak CI/review coverage.

**User's answer:** Option 1.

## Open Questions

- **What:** Exact live cleanup commands for the FocusEngine project, tickets, OpenClaw/gateway agents, and issue-sync cron on `ssh hall`.
  **Why deferred:** This is operator pre-deploy cleanup, not SPEC-009B seed code.
  **Suggested next step:** SPEC-009B should produce a pre-deploy runbook/checklist that requires backup/export first, documents the cleanup targets, and verifies that only `racecraft-lab/mission-control` remains configured for sync before deployment.
- **What:** Exact conservative governance thresholds for Product Line A.
  **Why deferred:** The interview fixed policy intent, but concrete numbers should be selected during Specify/Plan against existing SPEC-008 policy schema and tests.
  **Suggested next step:** Clarify or Plan should choose explicit WIP and budget values and verify they do not block normal pilot intake.
- **What:** Whether the current SPEC-009A contract already contains all Mission Control Issue Triage and Issue Remediation slugs needed by FR-K2.
  **Why deferred:** The interview fixed the source-of-truth mechanism, but implementation must inspect the live contract.
  **Suggested next step:** Specify/Plan should require contract-slug verification and narrow contract edits only if the family is incomplete.

## Recommended Next Step

Run `$speckit-autopilot docs/ai/specs/SPEC-009B-workflow.md` from the `009b-mission-control-seed` worktree after setup commits and pushes this design concept and workflow file.
