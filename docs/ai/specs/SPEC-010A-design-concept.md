---
topic: "Generic Product-Line Seeder"
slug: "spec-010a-generic-product-line-seeder"
date: "2026-05-22"
mode: "setup"
spec_id: "SPEC-010A"
source_input:
  type: "interactive"
  ref: "SPEC-010A roadmap entry plus Grill Me setup interview"
question_count: 12
stop_reason: "natural"
---

# Design Concept: Generic Product-Line Seeder

> **Source:** SPEC-010A roadmap entry plus interactive setup interview
> **Date:** 2026-05-22
> **Questions asked:** 12
> **Stop reason:** natural

## Goals

- Parameterize the existing Paddock product-line seed path into a reusable generic product-line seeder.
- Define checked-in, operator-reviewable YAML seed configs under `docs/ai/product-lines/`.
- Convert Paddock into the first reusable fixture/config without changing the already-proven SPEC-009B behavior.
- Provide a generic `seed:product-line` CLI with `preflight`, `apply`, and `verify` modes.
- Keep `seed:paddock` as a compatibility wrapper around the Paddock product-line config.
- Prove Paddock parity with apply-twice, verify-mode, and invalid-config no-mutation evidence in a disposable or safe target database.
- Preserve product-line history and unrelated state; mutate only config-owned fields through explicit apply/verify paths.

## Non-goals

- Creating, enabling, smoking, or operating Product Line B; SPEC-010B owns real second-product-line onboarding (Q7).
- Adding runtime/admin-authored product-line configuration UI or database authoring surfaces (Q1).
- Silently taking over existing product lines by slug (Q2).
- Writing partial product-line state for invalid configs (Q3).
- Hardcoding Paddock workflow names into the generic seeder (Q4).
- Adding a new governance DSL or blocking first-intake policy model (Q5).
- Removing the existing `seed:paddock` operator entrypoint (Q6).
- Mutating GitHub, dispatching work, creating tasks, claiming work, launching runners, creating sandboxes, or invoking SpecKit setup/autopilot (Q7, Q8, Q12).

## Design Tree (Q&A log)

### Q1. Should SPEC-010A define product-line seeding as a checked-in declarative config consumed by a generic seeder, with Paddock converted to the first fixture?

**Branch:** Config source of truth

**Recommended answer:** Checked-in versioned config/schema fixture.
> The roadmap names product-line slug, display name, agent prefix, GitHub repo, workflow family, feature flags, and governance defaults as seeder inputs. A checked-in config keeps those inputs reviewable and directly reusable for SPEC-010B without adding a runtime authoring surface.

**Alternatives offered:**
- Extraction-only library around existing Paddock constants: smaller, but Product Line B would still require code edits.
- Runtime/admin-authored config: flexible, but much larger than the seed-tooling scope.

**User's answer:** A - checked-in versioned config/schema fixture.

---

### Q2. What should the generic seeder do when a target product-line workspace already exists?

**Branch:** Idempotency and live-state safety

**Recommended answer:** Require an explicit `--mode verify` or `--mode apply --allow-existing` path, then update only fields owned by the checked-in config while preserving existing issue/task/history rows.
> SPEC-009B already proved idempotent reruns, but generic reuse raises takeover risk. Explicit existing-target handling keeps reruns safe without silently rewriting a live product line.

**Alternatives offered:**
- Always upsert existing rows by slug: simpler, but easier to rewrite live state accidentally.
- Refuse to run if the workspace exists: safest for accidental mutation, but weakens idempotency and Paddock fixture verification.

**User's answer:** A - explicit apply/verify path; mutate only config-owned fields and preserve history.

---

### Q3. How should unsafe or incomplete product-line configs fail?

**Branch:** Validation and no-mutation guarantee

**Recommended answer:** Fail closed before opening a write transaction, return structured JSON errors with config path/field codes, and prove by hash/count tests that no workspace/project/task/template/governance rows changed.
> This mirrors the SPEC-009B preflight style and gives both operators and autopilot a concrete acceptance surface for incomplete or unsafe configs.

**Alternatives offered:**
- Validate best-effort, write safe parts, and report skipped sections: forgiving, but creates partial product-line state.
- Throw plain process errors: smaller, but weaker operator evidence and harder CLI automation.

**User's answer:** A - fail closed before writes with structured errors and no-mutation proof.

---

### Q4. Should the generic seeder remain Paddock workflow-family aware, or should workflow templates be supplied by each product-line config?

**Branch:** Workflow contract integration

**Recommended answer:** Product-line config declares the workflow contract family/path plus required template slugs, and the generic seeder imports that contract through the existing SPEC-009A workflow-contract library.
> SPEC-009A made workflow contracts the repo-owned source of truth. Keeping workflow selection in config avoids Paddock-specific assumptions while reusing the proven importer.

**Alternatives offered:**
- Keep Paddock workflow slugs hardcoded: smaller, but not generic.
- Do not import workflow templates in the generic seeder: simpler, but pushes workflow seeding into SPEC-010B.

**User's answer:** A - workflow contract family/path and required slugs are config-owned.

---

### Q5. What should be in scope for generic governance defaults?

**Branch:** Governance config

**Recommended answer:** Let config declare advisory/default governance policy rows using the existing `resource_policies` shape, with validation that enforcement defaults cannot block first intake unless explicitly marked.
> This reuses SPEC-009B's conservative governance pattern and avoids inventing a new policy DSL.

**Alternatives offered:**
- Copy the three Paddock governance rows exactly for every product line: fast, but not meaningfully generic.
- Exclude governance from SPEC-010A: smaller, but contradicts the roadmap's governance-default input list.

**User's answer:** A - reuse existing `resource_policies` shape with first-intake blocking safeguards.

---

### Q6. What should the SPEC-010A CLI surface look like?

**Branch:** Operator entrypoint

**Recommended answer:** Add a generic `seed:product-line` pnpm script/CLI with `preflight`, `apply`, and `verify` modes, while keeping `seed:paddock` as a compatibility wrapper around the Paddock config.
> This preserves existing operator/runbook muscle memory while giving SPEC-010B a reusable entrypoint.

**Alternatives offered:**
- Replace `seed:paddock` entirely: cleaner long term, but disruptive.
- Keep only library APIs and no new CLI: smaller, but weak process-only UAT.

**User's answer:** A - add generic CLI and keep the Paddock wrapper.

---

### Q7. What should SPEC-010A explicitly not do for Product Line B?

**Branch:** Split with SPEC-010B

**Recommended answer:** Do not create Product Line B's real config, run its smoke, enable it on a live target, or mutate GitHub. Provide only reusable schema/fixture examples and Paddock parity evidence.
> The roadmap makes SPEC-010B the second-product-line onboarding and smoke slice. SPEC-010A should stop at reusable seed tooling.

**Alternatives offered:**
- Include a placeholder Product Line B config that is never run: useful preview, but may drift into false evidence.
- Seed Product Line B in disabled mode: more confidence, but steals SPEC-010B.

**User's answer:** A - no Product Line B config/run/smoke in SPEC-010A.

---

### Q8. What should count as the human-reviewable/UAT proof for SPEC-010A?

**Branch:** UAT and review evidence

**Recommended answer:** Recreate the existing Paddock seed from the generic config in a disposable or safe target DB, run apply twice, run verify, and run invalid-config fixtures proving no mutation.
> The roadmap's required gate is process-only seeder config. Paddock parity proves reuse without requiring a second product line.

**Alternatives offered:**
- Only unit tests around config parsing and seed functions: faster, but weaker operator evidence.
- Require a live target deployment apply: realistic, but higher risk and overlaps Product Line B onboarding.

**User's answer:** A - Paddock parity, apply twice, verify, and invalid-config no-mutation fixtures.

---

### Q9. Where should the product-line seed configs live, and what format should they use?

**Branch:** Config file layout

**Recommended answer:** Use checked-in YAML configs under `docs/ai/product-lines/`, plus a JSON Schema or typed validator adjacent to the seeder and test fixtures.
> The repo already uses YAML for workflow contracts. Keeping product-line seed configs under `docs/ai/` makes them operator-reviewable while validators and tests keep them executable.

**Alternatives offered:**
- TypeScript config modules under `src/lib/product-line-seed/configs/`: easier type checking, but less operator-friendly.
- JSON files under test fixtures only: useful for tests, but weak as the canonical operator-reviewed config.

**User's answer:** A - YAML under `docs/ai/product-lines/` with typed/schema validation.

---

### Q10. How should agent naming and assignment reuse work in the generic config?

**Branch:** Agent assignment isolation

**Recommended answer:** Config declares product-line-scoped agent assignments using an explicit `agentPrefix`, while facility/global agents remain out of the product-line config unless referenced as shared support by role.
> The roadmap says facility agents stay global and product-line agents stay isolated. An explicit prefix prevents accidental reuse of retained OpenClaw/global identities.

**Alternatives offered:**
- Config lists full agent names only: explicit, but more duplicated and less guarded.
- Infer agent names from department slugs: less config, but too magical for review.

**User's answer:** A - explicit `agentPrefix` plus product-line-scoped assignments.

---

### Q11. How should feature flags be handled in reusable product-line configs?

**Branch:** Feature-flag safety

**Recommended answer:** Config must explicitly list flags to enable and flags that must remain disabled/absent, then the seeder validates names against `FEATURE_FLAG_REGISTRY` and preserves unrelated existing flags unless the config owns them.
> This keeps the Paddock fixture compatible with SPEC-009B while preventing typo-driven config drift or accidental activation of future runner/sandbox flags.

**Alternatives offered:**
- Raw `feature_flags` JSON written directly: flexible, but weak validation.
- Do not manage feature flags in the generic seeder: smaller, but contradicts the roadmap parameter list.

**User's answer:** A - explicit enabled and disabled/absent flag lists with registry validation.

---

### Q12. How should the generic seeder handle non-target GitHub sync or product-line residue during preflight?

**Branch:** Preflight residue detection

**Recommended answer:** Generalize the SPEC-009B preflight model: block only when residue conflicts with the target config's declared repo/product-line ownership, report structured redacted evidence, and never delete or unlink anything automatically.
> Generic seeding must be reusable across product lines without hardcoding FocusEngine or Paddock assumptions. Deletion remains operator-owned.

**Alternatives offered:**
- Keep the exact SPEC-009B residue scanner: safer for current Paddock, but not generic enough.
- Do not scan residue generically: simpler, but risks conflicting GitHub sync state.

**User's answer:** A - target-config-aware residue blocking with redacted evidence and no automatic deletion.

## Open Questions

- **What:** Exact product-line YAML schema field names and version marker.
  **Why deferred:** The interview fixed ownership and semantics; Plan should name the exact schema after inspecting existing seeder types and workflow-contract YAML conventions.
  **Suggested next step:** `/speckit.plan` should define `schema_version`, required sections, and typed validation errors.
- **What:** Exact validation codes for unsafe configs.
  **Why deferred:** The interview fixed fail-closed behavior but not the error-code catalog.
  **Suggested next step:** Clarify or Plan should define stable error codes for missing identity, invalid feature flags, conflicting repos, missing workflow slugs, unsafe governance, and existing-target apply policy.
- **What:** Exact Paddock config path and compatibility wrapper behavior.
  **Why deferred:** Implementation should inspect the current `scripts/seed-paddock-product-line.ts` and `src/lib/paddock-seed/*` surfaces before naming final paths.
  **Suggested next step:** Plan should preserve `pnpm seed:paddock` while adding `pnpm seed:product-line`.

## Recommended Next Step

Run `$speckit-autopilot docs/ai/specs/SPEC-010A-workflow.md` from the `010a-generic-product-line-seeder` worktree after setup commits and pushes this design concept and workflow file.
