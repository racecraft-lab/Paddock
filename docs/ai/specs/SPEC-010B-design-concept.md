---
topic: "Product Line B Onboarding Smoke"
slug: "spec-010b-product-line-b-smoke"
date: "2026-06-05"
mode: "setup"
spec_id: "SPEC-010B"
source_input:
  type: "interactive"
  ref: "SPEC-010B roadmap entry, HAL preflight, and Grill Me setup interview"
question_count: 5
stop_reason: "operator accepted recommended scoped path"
---

# Design Concept: Product Line B Onboarding Smoke

> **Source:** SPEC-010B roadmap entry, HAL preflight, and interactive setup interview
> **Date:** 2026-06-05
> **Questions asked:** 5
> **Stop reason:** operator accepted recommended scoped path

## Goals

- Onboard a second product line with a generic identity: `product-line-b`, display name `Product Line B`, and an explicit product-line-scoped agent prefix.
- Add the Product Line B seed/config surface needed to reuse the SPEC-010A generic product-line seeder.
- Keep Product Line B disabled by default, require explicit operator enablement for smoke execution, and disable it cleanly afterward.
- Use `racecraft-lab/Paddock` as the canonical smoke repository with clearly labeled Product Line B synthetic issue metadata.
- Prove Product Line A remains unaffected through SQL, API, dashboard, and seed/verify assertions.
- Run one synthetic issue through the already-proven pilot subset without adding a new workflow language or new control-plane authority.
- Use Paddock-owned fake/harness agents for the smoke path unless a later explicit decision generalizes and assigns real runtime agents.
- Record HAL/operator evidence for preflight, enablement, smoke, disablement, and cleanup without mutating unrelated live state.

## Non-goals

- Reusing hidden/offline legacy FocusEngine runtime identities without explicit profile generalization and Product Line B role assignment (Q1, Q3).
- Automatically deleting, unlinking, or rewriting legacy FocusEngine/OpenClaw/Paddock residue during implementation (preflight evidence).
- Creating a real GitHub issue as a required implementation step; live GitHub issue creation may be optional HAL UAT evidence only (Q5).
- Adding new workflow language, scheduler authority, claim/reconciliation authority, retry semantics, runner state, sandbox lifecycle, or auto-merge behavior.
- Touching Product Line A seed identity, tasks, workflow templates, GitHub sync ownership, governance history, or dashboard metrics except for read-only isolation assertions.
- Leaving Product Line B enabled after the smoke.
- Treating the retained FocusEngine OpenClaw configuration as Product Line B.

## Setup Preflight Evidence

- HAL preflight was run against the live Paddock database at `/home/fredrick-gabelmann/paddock-data/paddock.db`.
- `paddock.service` and `openclaw-gateway.service` were active during inspection.
- The generic product-line seeder preflight completed with `ok: true`, `status: ready`, `mutation_status: not_mutated`, and an empty residue list.
- Before/after seed snapshot hashes matched, proving the preflight did not mutate the live database.
- Live database inspection found only `racecraft-lab/Paddock` project/GitHub sync ownership and no FocusEngine project, task, sync, or assignment rows.
- Six hidden/offline FocusEngine agent rows and corresponding OpenClaw config identities remain retained inventory. They are not Product Line B and must not be reused in this spec unless the implementation first generalizes their runtime profile and assigns them explicitly.
- Interactive `node` on HAL resolves to Node v26 and can hit a `better-sqlite3` ABI mismatch; service-compatible checks used `/usr/bin/node` v24.15.0.

## Design Tree (Q&A log)

### Q1. Which identity should SPEC-010B use for Product Line B?

**Branch:** Product-line identity and legacy runtime boundary

**Recommended answer:** Use a deliberately generic disabled product line: `product-line-b`, display `Product Line B`, and agent prefix `plb-platform`; do not reuse the legacy FocusEngine OpenClaw agents unless they are generalized and explicitly assigned.
> The roadmap needs a second product line, but the HAL preflight shows FocusEngine exists only as retained hidden/offline inventory with no current project/task/sync ownership. A generic identity proves two-product-line isolation without reviving old naming.

**Alternatives offered:**
- Make FocusEngine the real Product Line B, requiring explicit repo selection, identity cleanup, and operator approval for profile generalization.
- Use a disposable second Paddock product line only for isolation proof and defer a real second-product identity.

**User's answer:** Recommended path.

---

### Q2. What should SPEC-010B use as the smoke repo/issue source?

**Branch:** Smoke target

**Recommended answer:** Use `racecraft-lab/Paddock` with a synthetic, clearly labeled Product Line B smoke issue so isolation can be proven without introducing a new external repo dependency.
> The live target already owns Paddock sync state and no Product Line B repo is documented. Reusing the Paddock repo metadata for a synthetic smoke keeps the spec reviewable while still proving product-line scoping.

**Alternatives offered:**
- Use a real second-product repository if the operator provides one.

**User's answer:** Recommended path.

---

### Q3. Which runtime substrate should SPEC-010B use for Product Line B agents?

**Branch:** Agent substrate

**Recommended answer:** Use Paddock-owned fake/harness agents for the smoke path, disabled by default, and avoid OpenClaw/FocusEngine reuse in this spec.
> SPEC-014B established the manifest/runtime-inventory boundary for fakes and harness identities. Using that substrate keeps this smoke independent from retained OpenClaw identities and from SPEC-014C's active real-harness work.

**Alternatives offered:**
- Use existing OpenClaw agents only after their runtime profile is generalized and explicitly assigned to Product Line B.

**User's answer:** Recommended path.

---

### Q4. Should Product Line B be disabled by default after seed/smoke?

**Branch:** Enablement and rollback

**Recommended answer:** Yes. Seed it disabled, require explicit operator enablement for the smoke, then disable it cleanly afterward. Product Line A must remain untouched.
> This matches the roadmap human validation and rollback path: set the Product Line B workspace disabled, pause sync/dispatch for that product line, and leave shared agents/runtimes unaffected.

**Alternatives offered:**
- Leave Product Line B enabled after smoke for follow-on testing.

**User's answer:** Recommended path.

---

### Q5. Should the smoke create a real GitHub issue, or stay synthetic?

**Branch:** Issue smoke mode

**Recommended answer:** Use a synthetic Paddock smoke issue linked to `racecraft-lab/Paddock` metadata, with no live GitHub write required during implementation. Live GitHub issue creation can stay as optional HAL UAT evidence.
> The spec's required proof is product-line isolation and one issue-shaped pilot path, not external GitHub mutation. Keeping GitHub writes optional reduces blast radius while preserving a realistic metadata shape.

**Alternatives offered:**
- Require creation and cleanup of a real GitHub issue during the spec.

**User's answer:** Recommended path.

## Open Questions For SpecKit Clarify

- What exact YAML fields should Product Line B add or reuse from `docs/ai/product-lines/paddock.yaml` for disabled-by-default state, smoke metadata, and `plb-platform` agent assignment?
- Which existing API/dashboard surfaces should provide the canonical per-workspace and cross-product-line metric assertions?
- What structured evidence envelope should the smoke checklist emit for enablement, synthetic issue creation, pilot subset processing, disablement, and cleanup?
- How should tests distinguish Product Line B synthetic Paddock repo metadata from Product Line A's real Paddock sync ownership?
- What is the minimal fake/harness agent set required for the already-proven pilot subset without overlapping SPEC-014C real-harness adapter files?
