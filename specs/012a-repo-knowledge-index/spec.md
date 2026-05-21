# Feature Specification: SPEC-012A - Repo Knowledge Index and AGENTS Map

**Feature Branch**: `012a-repo-knowledge-index`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "Fresh agents need a repo-owned JSON docs index under `docs/ai/`, a concise `AGENTS.md` Repo Knowledge Map, required ownership/freshness metadata, local and CI-runnable guards, a deterministic fresh-agent proxy smoke check, and GitNexus refresh documentation without runtime behavior changes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fresh Agent Finds Repo Truth (Priority: P1)

An autonomous coding agent starting a new Mission Control task can begin from the root instructions, follow the Repo Knowledge Map, and find the current source-of-truth documents for product intent, technical roadmap status, workflow ledgers, QA evidence expectations, rollback procedures, and GitNexus usage without relying on hidden operator memory.

**Why this priority**: This is the primary value of SPEC-012A and unblocks later run-state and drift-guard specs that need reliable repo-local process truth.

**Independent Test**: Can be fully tested by starting from `AGENTS.md`, following the map into the canonical index, and confirming the referenced PRD, technical roadmap, active/pending workflow pointers, QA checklist, rollback runbook, and GitNexus instructions are discoverable from checked-in repository files.

**Acceptance Scenarios**:

1. **Given** a fresh agent with only the repository checkout and root instructions, **When** it reads the Repo Knowledge Map, **Then** it can identify the canonical index and the indexed source-of-truth documents for product, roadmap, workflow, QA, rollback, and GitNexus guidance.
2. **Given** the roadmap marks SPEC-012A as active and later specs as dependent, **When** the agent follows the indexed status pointers, **Then** it can distinguish durable intent documents from execution ledgers and current-status artifacts.
3. **Given** the agent needs to refresh semantic search locally, **When** it reads the indexed GitNexus guidance, **Then** it can find the refresh command, embedding environment prerequisites, ignored output boundary, and linked-worktree setup expectations.

---

### User Story 2 - Operator Verifies Index Freshness (Priority: P2)

A human operator reviewing the repository can run a documented guard and know whether the canonical docs index still contains required entries, required metadata, valid repo-local links, and current status pointers.

**Why this priority**: The map is only useful if it stays current after merges and documentation moves.

**Independent Test**: Can be fully tested by running the repository guard with a valid index, then with controlled failures for missing required documents, missing required metadata, stale status pointers, and broken required repo-local links.

**Acceptance Scenarios**:

1. **Given** every required canonical document is indexed with complete metadata, **When** the guard runs, **Then** it passes for required entries and reports no stale required status pointers.
2. **Given** an indexed required document path is missing or a required metadata field is empty, **When** the guard runs, **Then** it fails with an actionable message naming the offending entry and field.
3. **Given** an indexed external URL or Obsidian-style wikilink cannot be resolved locally, **When** the guard runs, **Then** it reports a warning or informational note unless the referenced fact is declared repo-owned.

---

### User Story 3 - Maintainer Updates Canonical Docs Safely (Priority: P3)

A maintainer changing process documentation can update the canonical index entry for an affected document and know which owner, freshness rule, related specs, and verification commands must travel with that change.

**Why this priority**: The index should make upkeep explicit and reviewable without turning `AGENTS.md` into a large instruction file.

**Independent Test**: Can be fully tested by adding or modifying a canonical entry and verifying the guard requires `path`, `purpose`, `owner`, `freshness`, `last_verified`, `related_specs`, and `verification_commands`.

**Acceptance Scenarios**:

1. **Given** a maintainer adds a new canonical document entry, **When** any required metadata field is omitted, **Then** the guard fails and names the missing field.
2. **Given** a maintainer changes a durable process document, **When** the index entry is updated, **Then** the entry records the owning role or team, freshness expectation, last verification date, related specs, and at least one verification command or manual verification instruction.
3. **Given** `AGENTS.md` is updated, **When** the change is reviewed, **Then** `AGENTS.md` remains a concise map and does not duplicate the full machine-readable index in prose.

---

### User Story 4 - CI Prevents Drift (Priority: P4)

Repository CI can run the same freshness and discovery checks as local operators so stale or incomplete repo knowledge cannot merge unnoticed.

**Why this priority**: Local-only checks are insufficient for a canonical map that future agents will trust after merges.

**Independent Test**: Can be fully tested by invoking the CI-runnable guard command locally and confirming the same command is available to CI without requiring local semantic-search artifacts or secret embedding infrastructure.

**Acceptance Scenarios**:

1. **Given** a pull request removes or renames an indexed required repo-local document without updating the index, **When** CI runs the guard, **Then** the guard fails before merge.
2. **Given** `.gitnexus/` is absent, **When** CI runs the guard and fresh-agent proxy smoke check, **Then** the checks do not require `.gitnexus/` output and do not create generated GitNexus artifacts.

### Edge Cases

- A required repo-local document is moved, renamed, or archived without updating the index.
- A required index entry exists but one of `path`, `purpose`, `owner`, `freshness`, `last_verified`, `related_specs`, or `verification_commands` is missing, empty, or malformed.
- The technical roadmap status and the indexed active/pending workflow pointers disagree.
- A repo-local required link points outside the checkout or to a missing file.
- An external URL is temporarily unreachable.
- An Obsidian-style wikilink references content that is not repo-owned.
- A linked worktree lacks ignored local GitNexus embedding environment files.
- The root instructions grow beyond a concise map by duplicating the full index.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST provide a canonical machine-readable docs index under `docs/ai/`.
- **FR-001A**: The canonical docs index filename MUST be `docs/ai/repo-knowledge-index.json`.
- **FR-001B**: The repository MUST provide a JSON Schema for the canonical docs index at `docs/ai/repo-knowledge-index.schema.json`.
- **FR-002**: The canonical index MUST include entries for the PRD, technical roadmap, SpecKit workflow directory or workflow pointers, QA checklist, rollback runbook, root `AGENTS.md`, and GitNexus instructions.
- **FR-002A**: The minimum required discovery entries MUST include `AGENTS.md`, `docs/rc-factory-v1-prd.md`, `docs/ai/rc-factory-technical-roadmap.md`, `docs/ai/specs/`, `docs/ai/specs/SPEC-012A-workflow.md`, `docs/ai/specs/autopilot-state.json`, `docs/qa/pilot-smoke-checklist.md`, `docs/runbook/migration-rollback.md`, and `docs/ai/workflows/mission-control/workflow-contract.yaml`.
- **FR-002B**: The `AGENTS.md` index entry MUST cover both the root Repo Knowledge Map and the GitNexus operator instructions so the index does not require duplicate `AGENTS.md` path entries.
- **FR-003**: Every canonical index entry MUST include `path`, `purpose`, `owner`, `freshness`, `last_verified`, `related_specs`, and `verification_commands`.
- **FR-003A**: `owner` MUST be a non-empty owning role or team string, not an individual-only memory note.
- **FR-003B**: `freshness` MUST be structured enough for guards to evaluate, including a cadence or stale-after rule and the trigger that requires re-verification.
- **FR-003C**: `last_verified` MUST be an ISO `YYYY-MM-DD` date representing the latest successful verification of the entry.
- **FR-003D**: `related_specs` MUST be an array of valid `SPEC-###` identifiers with optional alphanumeric suffixes such as `SPEC-009C1`, or an empty array when no spec owns the document.
- **FR-003E**: `verification_commands` MUST be an array of local commands or explicit manual verification instructions that a fresh agent can run or follow from the repository checkout.
- **FR-004**: Every canonical index entry's `path` MUST resolve to a repo-local file or directory when the entry is marked required.
- **FR-005**: The index MUST distinguish durable intent documents from execution ledgers and status pointers so agents know which files describe long-lived decisions and which files record current workflow progress.
- **FR-006**: Root `AGENTS.md` MUST include a concise Repo Knowledge Map section that points to the canonical index, PRD, technical roadmap, workflow location, QA checklist, rollback runbook, GitNexus instructions, and freshness/ownership guard.
- **FR-007**: Root `AGENTS.md` MUST remain a routing map and MUST NOT duplicate the full canonical index in prose.
- **FR-008**: The repository MUST provide a local guard command that fails when required indexed docs are missing.
- **FR-008A**: The guard MUST fail locally and in CI for malformed index JSON, schema validation failures, missing `docs/ai/repo-knowledge-index.json`, missing `docs/ai/repo-knowledge-index.schema.json`, missing required discovery entries, missing required metadata, invalid required metadata, required paths that resolve outside the repository, broken required repo-local links, stale required status pointers, or invalid related spec IDs.
- **FR-008B**: The guard MUST report warnings without a failing exit code for external URLs, Obsidian-style wikilinks, and optional non-required links unless the index explicitly declares the referenced fact to be repo-owned and required.
- **FR-009**: The guard MUST fail when any required canonical metadata field is missing, empty, or structurally invalid.
- **FR-010**: The guard MUST fail when indexed required status pointers are stale relative to the repo-owned source they claim to summarize.
- **FR-010A**: Stale status detection MUST compare the SPEC-012A roadmap status, `docs/ai/specs/SPEC-012A-workflow.md` workflow overview, and `docs/ai/specs/autopilot-state.json` active workflow/state so an index cannot advertise a current workflow/status pointer that disagrees with checked-in roadmap or workflow ledger evidence.
- **FR-010B**: Stale status detection MUST name the disagreeing files, the observed values, and the expected relationship in its failure output.
- **FR-011**: The guard MUST fail when required repo-local links in canonical entries are broken.
- **FR-011A**: Repo-local Markdown link validation MUST normalize links relative to the source file, reject traversal outside the repository, ignore same-file headings only when the target file exists, and fail required links whose target file or directory is missing.
- **FR-012**: The guard MUST treat external URLs and Obsidian-style wikilinks as warnings or informational findings unless an indexed entry declares the referenced fact as repo-owned.
- **FR-012A**: The guard MUST NOT perform network fetches for external URLs and MUST NOT require access to the operator's Obsidian vault.
- **FR-013**: The guard MUST be runnable both locally and in CI without requiring secret material, operator-only services, or generated semantic-search indexes.
- **FR-013A**: The repository MUST expose focused package scripts for index validation and fresh-agent proxy smoke checks, and `pnpm guardrails` MUST invoke the blocking index validation path so the existing Quality Gate workflow covers SPEC-012A.
- **FR-013B**: The focused package scripts MUST be runnable on a clean checkout where `.gitnexus/` is absent and `.envrc.local` is ignored or missing.
- **FR-014**: The repository MUST provide a deterministic fresh-agent proxy smoke check that proves the index resolves the PRD, technical roadmap, active/pending workflow pointers, QA checklist, rollback runbook, root `AGENTS.md`, and GitNexus instructions.
- **FR-014A**: The fresh-agent proxy smoke check MUST start from the root `AGENTS.md` Repo Knowledge Map, follow the canonical index pointer, and resolve each required discovery target through the index rather than through hard-coded hidden context.
- **FR-014B**: The fresh-agent proxy smoke check MUST prove that the GitNexus guidance is discoverable by locating the checked-in instruction containing `direnv exec . gitnexus analyze --embeddings --skip-agents-md`, linked-worktree `.envrc.local` setup guidance, and the ignored `.gitnexus/` boundary.
- **FR-015**: The fresh-agent proxy smoke check MUST fail when any required discovery target cannot be resolved through the canonical index.
- **FR-016**: GitNexus guidance MUST document the refresh command, required embedding environment, linked-worktree setup expectations, and the fact that `.gitnexus/` is ignored and not required for CI truth.
- **FR-016A**: SPEC-012A MUST NOT add project-local GitNexus MCP, hook, skill, generated index, or committed `.gitnexus/` artifacts.
- **FR-016B**: The root `AGENTS.md` Repo Knowledge Map MUST remain a concise set of links and routing notes; it MUST point to the canonical index and source-of-truth docs without embedding the JSON index contents or duplicating every indexed entry.
- **FR-017**: SPEC-012A MUST NOT introduce runtime source behavior changes, database migrations, UI changes, scheduler or runner behavior, automatic GitHub sync, sandbox lifecycle changes, harness adapters, generated `.gitnexus/` artifacts, broad documentation rewrites, or directory-wide nested `AGENTS.md` rollout.
- **FR-018**: The feature MUST preserve SpecKit workflow files as execution ledgers and roadmap/PRD documents as durable intent sources.

### Spec Evidence And Archive Policy *(include when the spec touches `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior)*

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec is excluded from same-run archival.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated UI screenshots are Argos/CI artifacts by default; committed binaries require a manifest-backed exception.

### Key Entities *(include if feature involves data)*

- **Knowledge Index**: The canonical machine-readable catalog of repo-owned source-of-truth documents and process discovery targets.
- **Canonical Index Entry**: A single indexed document or directory with a resolvable path, purpose, owner, freshness rule, last verification date, related specs, and verification commands.
- **Required Discovery Target**: A document or pointer that every fresh agent must be able to find, including PRD, roadmap, workflows, QA checklist, rollback runbook, root instructions, and GitNexus guidance.
- **Freshness Rule**: A human-readable rule describing when an entry must be rechecked or updated.
- **Guard Finding**: A pass, failure, warning, or informational result produced by the index guard or fresh-agent proxy smoke check.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh agent starting from the repository root can identify all required discovery targets through checked-in files in 5 minutes or less.
- **SC-002**: The guard detects 100% of intentionally introduced missing required entries, missing required metadata fields, stale required status pointers, and broken required repo-local links in controlled validation cases.
- **SC-003**: The fresh-agent proxy smoke check resolves 100% of required discovery targets from the canonical index without relying on hidden memory, external services, or generated semantic-search artifacts.
- **SC-004**: `AGENTS.md` remains concise enough for quick onboarding by adding only a map-level section and avoiding full index duplication.
- **SC-005**: CI can run the repository knowledge guard successfully on a clean checkout where `.gitnexus/` is absent.

## Assumptions

- The canonical index is the source of truth for repository knowledge discovery; `AGENTS.md` is a human entry point into that index.
- The first index format is JSON because the feature description explicitly requires a repo-owned JSON index under `docs/ai/`.
- Existing roadmap, PRD, workflow ledgers, QA checklist, rollback runbook, and GitNexus instructions remain the authoritative documents this feature indexes rather than rewrites.
- Local and CI guard integration will use existing repository command conventions and package scripts without adding runtime application behavior.
- The GitNexus semantic index remains optional operator tooling; `.gitnexus/` is ignored, uncommitted, and not a prerequisite for guard success.
