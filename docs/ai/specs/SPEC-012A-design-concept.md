---
topic: "SPEC-012A Repo Knowledge Index and AGENTS Map"
slug: "spec-012a-repo-knowledge-index"
date: "2026-05-21"
mode: "setup"
spec_id: "SPEC-012A"
source_input:
  type: "topic"
  ref: "docs/ai/rc-factory-technical-roadmap.md#SPEC-012A"
question_count: 8
stop_reason: "natural"
---

# Design Concept: SPEC-012A Repo Knowledge Index and AGENTS Map

> **Source:** docs/ai/rc-factory-technical-roadmap.md#SPEC-012A
> **Date:** 2026-05-21
> **Questions asked:** 8
> **Stop reason:** natural

## Goals

- Make repository-local knowledge discoverable without hiding operator context in a giant instruction file.
- Give fresh agents a canonical, repo-owned machine-readable index for source-of-truth documents, owners, freshness rules, related specs, and verification commands.
- Keep `AGENTS.md` concise by making it a human map into the index, roadmap, PRD, workflow files, QA checklist, rollback runbook, and GitNexus instructions.
- Add deterministic local and CI guardrails that fail on stale or missing repo-local required metadata.
- Preserve GitNexus as optional local operator tooling while documenting the refresh command and embedding environment.

## Non-goals

- Runtime source changes, migrations, UI, scheduler/runner behavior, automatic GitHub sync, harness adapters, and generated `.gitnexus/` artifacts are out of scope - answered in Q8.
- Broad docs rewrites and directory-wide nested `AGENTS.md` rollout are out of scope - answered in Q8.
- GitNexus `.gitnexus/` output is not committed, required, or mutated by this spec - answered in Q7.
- `AGENTS.md` is not the canonical full index and should not duplicate the machine-readable index in prose - answered in Q1 and Q4.
- External links and Obsidian-style wikilinks are not hard CI failures unless the referenced fact is repo-owned - answered in Q3.

## Design Tree (Q&A log)

### Q1. Should SPEC-012A make a repo-owned machine-readable docs index the canonical discovery surface, with `AGENTS.md` kept as a concise human map that points into it?

**Branch:** Canonical discovery surface

**Recommended answer:** A. Yes.
> This matches the roadmap's "short map plus indexed sources of truth" direction and keeps `AGENTS.md` from becoming another giant instruction file while still giving fresh agents a reliable entry point.

**Alternatives offered:**
- B. Make `AGENTS.md` the canonical source: simpler for humans, but it will keep growing and is harder to validate mechanically.
- C. Use GitNexus as the canonical source: good for query quality, but weaker as repo-local truth because `.gitnexus/` is ignored and depends on local embedding infrastructure.

**User's answer:** A.

---

### Q2. What should the first machine-readable docs index be?

**Branch:** Index format and location

**Recommended answer:** A. Add a repo-owned JSON index under `docs/ai/`.
> JSON is easy to validate in CI, works without local services, and can later feed GitNexus or agents without adding a new parser decision.

**Alternatives offered:**
- B. Add YAML instead of JSON: more readable for humans, but adds parser and formatting ambiguity unless existing YAML tooling is reused carefully.
- C. Generate the index from GitNexus only: useful later, but too dependent on local `.gitnexus/` state for a process/tooling spec whose output must live in the repo.

**User's answer:** A.

---

### Q3. Should SPEC-012A's guard fail CI when indexed docs are stale or missing required metadata?

**Branch:** Guard strictness

**Recommended answer:** A. Yes, but only for the canonical index and explicitly listed required docs.
> This gives the process/tooling spec real enforcement while honoring the roadmap note that unresolvable Obsidian wikilinks are informational unless the repo also contains the referenced fact.

**Alternatives offered:**
- B. Make it local-only: lower CI friction, but fresh agents can still get stale maps after a merge.
- C. Fail on every broken link including external URLs and wiki links: stronger hygiene, but likely noisy and contrary to the roadmap guidance.

**User's answer:** A.

---

### Q4. How should `AGENTS.md` change in SPEC-012A?

**Branch:** Human map shape

**Recommended answer:** A. Keep root `AGENTS.md` concise and add a "Repo Knowledge Map" section.
> Root `AGENTS.md` is the first file many agents read, so it should route them to source-of-truth artifacts without becoming the source itself.

**Alternatives offered:**
- B. Split into multiple nested `AGENTS.md` files by directory: more local context, but higher drift risk and larger review surface for this spec.
- C. Leave `AGENTS.md` mostly untouched and rely on the JSON index only: cleaner diff, but weaker for fresh agents.

**User's answer:** A.

---

### Q5. What metadata should every canonical docs-index entry require?

**Branch:** Required metadata schema

**Recommended answer:** A. Require `path`, `purpose`, `owner`, `freshness`, `last_verified`, `related_specs`, and `verification_commands`.
> These fields give agents enough context to decide whether a doc is authoritative and give CI concrete fields to validate.

**Alternatives offered:**
- B. Require only `path`, `purpose`, and `owner`: lower upkeep, but weaker for stale-status detection and less useful for fresh-agent verification.
- C. Require a rich schema with dependencies, consumers, tags, risks, and update triggers for every doc: more expressive, but likely too much maintenance for the first index.

**User's answer:** A.

---

### Q6. How should SPEC-012A verify that a fresh agent can discover repo truth?

**Branch:** Fresh-agent proxy verification

**Recommended answer:** A. Add a deterministic local smoke script that reads the JSON index.
> A script can prove the index resolves the PRD, technical roadmap, active/pending workflow pointers, QA checklist, rollback runbook, `AGENTS.md`, and GitNexus instructions without depending on a live LLM or hidden state.

**Alternatives offered:**
- B. Spawn an actual Codex subagent during CI: closer to reality, but brittle, expensive, and not suitable for normal CI.
- C. Manual UAT only: useful as supplemental evidence, but too weak for a process/tooling spec that should guard drift over time.

**User's answer:** A.

---

### Q7. Should SPEC-012A update or depend on the local GitNexus `.gitnexus/` index?

**Branch:** GitNexus boundary

**Recommended answer:** A. No.
> GitNexus is valuable local operator tooling, but `.gitnexus/` is ignored and depends on LM Studio, direnv, and embedding configuration, so it should not be CI truth or a committed artifact.

**Alternatives offered:**
- B. Require a fresh GitNexus index as part of setup/CI: improves semantic search, but depends on local infrastructure.
- C. Add generated GitNexus summaries to the repo: richer docs, but risks generated churn and stale summaries unless governed by a later drift-guard spec.

**User's answer:** A.

---

### Q8. What is explicitly out of scope for SPEC-012A?

**Branch:** Scope cuts and downstream boundaries

**Recommended answer:** A. Runtime changes, migrations, UI, scheduler/runner behavior, automatic GitHub sync, harness adapters, generated `.gitnexus/` artifacts, broad docs rewrites, and directory-wide nested `AGENTS.md` rollout.
> This keeps the spec process/tooling-only and preserves SPEC-013/SPEC-014 boundaries.

**Alternatives offered:**
- B. Only runtime code and migrations: looser scope, but risks broad docs restructuring or generated index behavior.
- C. Only UI and migrations: too loose; it could accidentally mutate scheduler, sync, or harness behavior.

**User's answer:** A.

## Open Questions

- **What:** Exact JSON schema file name and whether it should live beside the index.
  **Why deferred:** This is an implementation detail that can be resolved during Plan from existing repo script patterns.
  **Suggested next step:** Let `/speckit.plan` choose the minimal validation shape and script path.
- **What:** Whether the guard is wired into `pnpm guardrails`, `pnpm test:all`, or a dedicated package script first.
  **Why deferred:** The plan phase should inspect current package scripts and CI ownership before choosing the integration point.
  **Suggested next step:** Resolve during Plan and verify with Checklist domains for integration and regression safety.

## Recommended Next Step

Run `$speckit-autopilot docs/ai/specs/SPEC-012A-workflow.md` from the `012a-repo-knowledge-index` worktree after setup commits and pushes this design concept and workflow.
