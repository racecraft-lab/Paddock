# Research: SPEC-012A - Repo Knowledge Index and AGENTS Map

## Decision: Use `docs/ai/repo-knowledge-index.json` as the canonical index

**Rationale**: The design concept and specification require a repo-owned JSON index under `docs/ai/`. JSON is deterministic, checked in, easy for agents and scripts to consume, and does not depend on GitNexus, Obsidian, network access, or local operator state.

**Alternatives considered**:

- Root `AGENTS.md` as canonical source: rejected because it would become too large and harder to validate mechanically.
- GitNexus as canonical source: rejected because `.gitnexus/` is ignored and depends on local embedding infrastructure.
- YAML as canonical source: rejected because SPEC-012A explicitly chooses JSON and the first guard does not need another parser dependency.

## Decision: Add `docs/ai/repo-knowledge-index.schema.json` beside the index

**Rationale**: A colocated schema documents the contract for fresh agents and reviewers. The guard can validate the same required shape without introducing a runtime dependency.

**Alternatives considered**:

- Embed the schema inside the guard script: rejected because reviewers need a stable repo-owned contract.
- Generate schema from code: rejected as unnecessary generated machinery for the first version.

## Decision: Implement guard validation with Node.js built-in modules

**Rationale**: The guard needs file existence, JSON parsing, metadata validation, path normalization, Markdown link scanning, and status-pointer comparisons. Node.js built-ins are enough for this scope and keep the feature process-only with no supply-chain change.

**Alternatives considered**:

- Add AJV or a Markdown parser: rejected because the existing dependency policy requires pinned runtime additions and the required first-version schema is small.
- Shell-only guard: rejected because JSON and path normalization are clearer and less brittle in Node.

## Decision: Fail hard only for required repo-local truth

**Rationale**: SPEC-012A's value is reliable repo-local discovery. Required entries, required metadata, required paths, required repo-local links, related spec identifiers, and SPEC-012A status pointers are all checked-in facts and can fail deterministically. External URLs and Obsidian-style wikilinks are not repo-local truth and should not create CI noise.

**Alternatives considered**:

- Fail on every link: rejected because external URLs and operator vault links are not stable CI inputs.
- Warnings only: rejected because stale required docs would still merge.

## Decision: Validate status freshness through a narrow SPEC-012A relationship

**Rationale**: FR-010A requires comparing the roadmap status, `docs/ai/specs/SPEC-012A-workflow.md`, and `docs/ai/specs/autopilot-state.json`. A narrow explicit comparison avoids a broad roadmap parser while still proving the index cannot advertise a current status pointer that disagrees with checked-in evidence.

**Alternatives considered**:

- Parse every roadmap spec status: rejected as broader than SPEC-012A.
- Manual review only: rejected because status-pointer drift is a required guard failure.

## Decision: Use a deterministic fresh-agent proxy script instead of an actual agent

**Rationale**: CI needs a repeatable check that starts from `AGENTS.md`, follows the canonical index pointer, and resolves required targets through the index. A script proves the discovery path without model nondeterminism, network access, or hidden memory.

**Alternatives considered**:

- Spawn Codex in CI: rejected as brittle and expensive.
- Manual UAT only: rejected because drift prevention needs a repeatable check.

## Decision: Keep GitNexus optional and document refresh only

**Rationale**: GitNexus is useful local tooling but `.gitnexus/` is ignored and depends on LM Studio, direnv, and local embedding configuration. SPEC-012A must document the refresh command and linked-worktree expectations without committing or requiring generated artifacts.

**Alternatives considered**:

- Require `.gitnexus/` in CI: rejected because clean checkout CI cannot depend on local semantic-search state.
- Commit generated summaries: rejected because generated docs would drift and enlarge review scope.

## Decision: Wire blocking validation through existing `pnpm guardrails`

**Rationale**: The GitHub Actions quality gate already runs `pnpm guardrails`. Adding a `repo-knowledge-index` suite to `scripts/check-guardrails.mjs` makes the required validation local and CI-runnable without another workflow.

**Alternatives considered**:

- Add a new CI step only: rejected because local and CI commands should share the same path.
- Put everything under `pnpm test:all`: rejected because guardrails already owns static repository policy checks.
