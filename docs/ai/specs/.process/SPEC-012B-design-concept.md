---
topic: "Harness-Gardening Drift Guards"
slug: "spec-012b-harness-gardening-guards"
date: "2026-06-06"
mode: "setup"
spec_id: "SPEC-012B"
source_input:
  type: "interactive"
  ref: "SPEC-012B roadmap entry and Grill Me setup interview"
question_count: 15
stop_reason: "natural"
---

# Design Concept: Harness-Gardening Drift Guards

> **Source:** SPEC-012B roadmap entry and interactive setup interview
> **Date:** 2026-06-06
> **Questions asked:** 15
> **Stop reason:** natural

## Goals

- Add deterministic harness-gardening drift guards after SPEC-010B proved real two-product-line behavior and SPEC-012A created repo-local knowledge truth.
- Produce one narrow cleanup recommendation per supported drift finding instead of broad rewrite guidance.
- Keep v1 guard execution repo-artifact-only, using checked-in evidence rather than live HAL, GitHub, or deployment state.
- Fail CI only for high-confidence repo-owned hard drift while emitting warnings and recommendations for lower-confidence cleanup signals.
- Include owner metadata and canonical Paddock cleanup-task payloads, with optional GitHub issue export fields, without auto-creating tasks or issues.
- Preserve archive cleanup safety: detect eligible cleanup recommendations but never remove `specs/**` source folders from this spec.
- Wire a focused harness-gardening guard into existing `pnpm guardrails` without replacing `pnpm knowledge:index:check`.

## Non-goals

- Live Paddock task creation, live GitHub issue creation, scheduler integration, or periodic automatic cleanup runs (Q1, Q5, Q10).
- Live HAL, GitHub, deployment, database, service, or runtime-state validation in v1 guard execution unless represented by checked-in evidence (Q6).
- Runtime product behavior, migrations, UI, dispatch, scheduler, harness adapter, sandbox lifecycle, or auto-merge behavior (Q10).
- Subjective test-quality scoring or broad heuristic analysis over all tests (Q13).
- Automatic deletion of completed `specs/**` folders or bypassing the archive extension's explicit `--apply-cleanup` safe-base gate (Q14).
- Baking external OpenAI Harness Engineering or Symphony context into the guard taxonomy during scaffold (Q8).

## Design Tree (Q&A log)

### Q1. Should SPEC-012B guards create live cleanup work automatically, or only produce deterministic recommendations?

**Branch:** Mutation behavior

**Recommended answer:** Produce deterministic machine-readable recommendations by default, with owner metadata and exact task/issue payloads, but do not mutate Paddock or GitHub unless a later explicit apply path is approved.
> The roadmap describes process/tooling guards and narrow cleanup-task generation, not live workflow mutation. Keeping v1 recommendation-only preserves reviewability and avoids creating work from stale or ambiguous evidence.

**Alternatives offered:**
- Auto-create Paddock cleanup tasks for each drift class during the guard run.
- Auto-create GitHub issues for each drift class during the guard run.

**User's answer:** A - recommended path.

---

### Q2. Which drift classes should SPEC-012B support in v1?

**Branch:** Drift taxonomy

**Recommended answer:** Support exactly the roadmap set: stale PRD/roadmap/workflow claims, missing evidence, stale feature-flag status, low-value tests, strict-scope drift, and broken source-of-truth links.
> The roadmap already names the intended v1 scope. Expanding beyond it would risk runtime/live-state work, while narrowing it would fail the Phase 10B acceptance intent.

**Alternatives offered:**
- Narrow to repo-knowledge/status-pointer drift and broken source-of-truth links only.
- Broaden to runtime/data drift checks, including live DB, GitHub, HAL service, and deployment-state validation.

**User's answer:** A - roadmap drift classes exactly.

---

### Q3. Where should SPEC-012B guard output live?

**Branch:** Output artifacts

**Recommended answer:** Use a deterministic local/CI report format under `docs/ai/` or `specs/012b-harness-gardening-guards/.process/`, plus JSON output from the guard script that contains one narrow recommended cleanup task per drift finding.
> SPEC-012A established checked-in repo knowledge and local guard outputs. Putting reports in process artifacts and JSON output keeps CI deterministic while preserving reviewable evidence.

**Alternatives offered:**
- Write recommendations directly into `docs/ai/specs/autopilot-state.json` as the current operational queue.
- Store recommendations as Paddock task artifacts or task rows immediately.

**User's answer:** A - deterministic local/CI report plus JSON output.

---

### Q4. How should SPEC-012B classify guard findings?

**Branch:** CI failure policy

**Recommended answer:** Fail CI only for repo-owned hard drift, like broken required links, stale status pointers, strict-scope drift, or missing required evidence; emit warnings/recommendations for lower-confidence cleanup signals like low-value tests.
> This mirrors SPEC-012A's warning-versus-failure discipline and avoids blocking CI on subjective cleanup opportunities.

**Alternatives offered:**
- Treat every supported drift class as a CI failure.
- Never fail CI; always emit advisory cleanup recommendations only.

**User's answer:** A - hard repo-owned drift fails CI, lower-confidence signals warn.

---

### Q5. What should each drift finding recommend as the operator action?

**Branch:** Recommendation payload

**Recommended answer:** Emit one canonical Paddock cleanup-task payload per finding, with optional GitHub issue fields for export, but no duplicate recommendations for the same drift.
> Paddock is the canonical control-plane destination, while GitHub export can stay a secondary review/share path. Stable payloads make later apply-mode work possible without adding mutation now.

**Alternatives offered:**
- Emit only GitHub issue-ready recommendations.
- Emit only human-readable remediation notes, with no task/issue payload shape.

**User's answer:** A - canonical Paddock cleanup-task payload plus optional GitHub fields.

---

### Q6. What should SPEC-012B use as its source of truth for drift detection?

**Branch:** Source of truth

**Recommended answer:** Use checked-in repo artifacts only: PRD, roadmap, workflow ledgers, `.specify/memory`, specs, repo knowledge index, package scripts, guardrail config, and representative fixtures. External/HAL/GitHub state stays out of v1 guard execution unless represented by checked-in evidence.
> This keeps the guard CI-safe and reproducible. Live state belongs to UAT or future operator-run checks, not the default drift guard.

**Alternatives offered:**
- Include live GitHub, HAL service, and deployment state in the guard.
- Use checked-in artifacts for CI but add an optional manual live-inspection mode for HAL/GitHub.

**User's answer:** A - repo artifacts only.

---

### Q7. How should SPEC-012B dedupe and identify drift findings?

**Branch:** Stable identity

**Recommended answer:** Use stable finding IDs derived from `drift_class + source_path + anchor + owner`, with deterministic sorting and one active recommendation per stable ID.
> Stable IDs prevent noisy churn across runs while keeping enough context to locate and assign each finding.

**Alternatives offered:**
- Use content hashes of the full finding payload.
- Do not dedupe in v1; emit every detected instance independently.

**User's answer:** A - stable deterministic IDs.

---

### Q8. How should SPEC-012B handle external context like OpenAI Harness Engineering and Symphony references?

**Branch:** External context gate

**Recommended answer:** Scaffold the workflow with an explicit external-context gate requiring fresh retrieval during Specify/Plan, but keep the v1 guard itself repo-artifact-only.
> The roadmap requires current external context before Specify or Plan. The guard still needs to be deterministic and CI-safe, so it should not fetch external sources during normal execution.

**Alternatives offered:**
- Fetch and bake external context into the guard taxonomy now.
- Skip external context entirely because this spec is process/tooling-only.

**User's answer:** A - explicit workflow gate, repo-artifact-only guard.

---

### Q9. What fixture strategy should SPEC-012B use for drift guard tests?

**Branch:** Fixture strategy

**Recommended answer:** Use a checked-in fixture corpus with small synthetic fresh/stale docs and JSON, plus a few real historical drift patterns reduced into minimal fixtures. Do not run tests against the whole live repo as the primary oracle.
> Fixtures make red-green testing deterministic while still encoding drift classes that have happened in this repository.

**Alternatives offered:**
- Test only against the live repo so fixtures cannot drift from reality.
- Use only synthetic fixtures and avoid historical examples.

**User's answer:** A - fixture corpus with synthetic and reduced historical patterns.

---

### Q10. How should SPEC-012B stay out of implementation/runtime scope?

**Branch:** Strict scope

**Recommended answer:** Strict scope is guard scripts, fixtures, cleanup recommendation schema/template, docs/checklist updates, package/guardrail wiring, and tests only. No runtime product behavior, migrations, UI, scheduler, dispatch, harness adapter, live GitHub write, or auto task creation.
> This matches the roadmap's process/tooling classification and avoids crossing into runtime control-plane specs.

**Alternatives offered:**
- Allow a small Paddock API endpoint to preview guard recommendations in the app.
- Allow scheduler integration so the guard runs periodically and opens cleanup tasks.

**User's answer:** A - strict process/tooling scope only.

---

### Q11. How should SPEC-012B assign owners to drift recommendations?

**Branch:** Ownership metadata

**Recommended answer:** Derive owner metadata from `docs/ai/repo-knowledge-index.json` when possible, then fall back to roadmap/spec family ownership conventions; emit `owner: unknown` only as a warning when no repo-owned source declares it.
> SPEC-012A made owner metadata part of repo knowledge. Reusing it keeps ownership consistent and avoids inventing a separate assignment model.

**Alternatives offered:**
- Require every finding to have a known owner or fail CI.
- Do not include owner metadata in v1 recommendations.

**User's answer:** A - derive owners from repo knowledge first, then conventions.

---

### Q12. How should SPEC-012B integrate with existing guard commands?

**Branch:** Command integration

**Recommended answer:** Add a focused guard script and package command for harness-gardening drift, then wire it into the existing `pnpm guardrails` suite without replacing `pnpm knowledge:index:check`.
> SPEC-012A already owns repo knowledge checks. SPEC-012B should extend guardrails with a focused suite rather than overloading the existing command.

**Alternatives offered:**
- Extend `pnpm knowledge:index:check` directly to own all SPEC-012B drift classes.
- Keep SPEC-012B as a standalone command only, not part of shared guardrails.

**User's answer:** A - focused command wired into `pnpm guardrails`.

---

### Q13. How should SPEC-012B detect low-value tests in v1?

**Branch:** Low-value test detection

**Recommended answer:** Only flag explicit, deterministic patterns in fixtures and repo-owned test metadata, such as tests that assert no behavior, only snapshot static docs without ownership metadata, or duplicate stale guard fixtures. Avoid subjective quality scoring.
> Low-value test detection can easily become subjective. V1 should only encode deterministic, reviewable patterns that can be proven through fixtures.

**Alternatives offered:**
- Use broad heuristic scoring over all tests to find weak assertions, excessive mocking, or low coverage.
- Defer low-value test detection entirely.

**User's answer:** A - deterministic patterns only.

---

### Q14. How should SPEC-012B treat cleanup source folders under `specs/**`?

**Branch:** Archive cleanup boundary

**Recommended answer:** Detect eligible cleanup recommendations but never remove source folders; preserve the archive extension's explicit `--apply-cleanup` safe-base gate.
> The repo already treats source cleanup as a reviewed archive-extension operation. SPEC-012B can recommend but must not bypass that safety gate.

**Alternatives offered:**
- Automatically delete completed `specs/**` folders when archive evidence exists.
- Ignore `specs/**` cleanup entirely.

**User's answer:** A - detect but never remove; preserve archive safe-base gate.

---

### Q15. How should SPEC-012B define stale evidence?

**Branch:** Evidence freshness

**Recommended answer:** Use repo-owned metadata only, such as `last_verified`, workflow closeout dates, status pointers, and explicit evidence markers; thresholds are configurable constants in the guard, with fixture coverage.
> Wall-clock age alone is noisy, and missing-only detection would miss stale status pointers. Repo-owned metadata gives deterministic, explainable staleness signals.

**Alternatives offered:**
- Use current wall-clock age only.
- Avoid staleness thresholds in v1 and only detect missing evidence.

**User's answer:** A - repo-owned metadata with configurable thresholds and fixtures.

## Open Questions For SpecKit Clarify

- What exact JSON schema should define `harness_gardening_recommendation.v1` and its optional GitHub issue export fields?
- Which status-pointer and evidence-marker fields count as CI-failing hard drift versus warning-only drift?
- What configurable freshness thresholds should v1 use for `last_verified`, workflow closeout dates, and explicit evidence markers?
- Which reduced historical drift examples should seed the fixture corpus without depending on full live-repo state?
- What package command names should be exposed for local checks and JSON output?
- How should duplicate recommendations be persisted across runs if a future apply mode is added?

## Recommended Next Step

Run `$speckit-autopilot docs/ai/specs/.process/SPEC-012B-workflow.md` from the `012b-harness-gardening-guards` worktree after reviewing the generated workflow.
