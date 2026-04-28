# Feature Specification: Spec Archive and Evidence Retention

**Feature Branch**: `[002a-spec-archive-evidence]`
**Created**: 2026-04-27
**Status**: Draft
**Input**: SPEC-002A workflow for archiving completed SpecKit artifacts and preserving Argos/CI evidence provenance without committing generated screenshots by default.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Archive Completed Spec Knowledge Safely (Priority: P1)

A maintainer can archive a completed feature spec after merge so the durable record preserves the feature's requirements, implementation evidence, PR links, CI links, and recovery commands without requiring generated screenshot content to remain in source control.

**Why this priority**: SPEC-002A exists to prevent repository bloat while preserving enough evidence to reconstruct what happened after a spec has merged.

**Independent Test**: Run an archive dry-run against `specs/002-product-line-switcher` and verify it produces an archive report, source references, and recovery commands without deleting source files or copying generated screenshots into `main`.

**Acceptance Scenarios**:

1. **Given** a merged feature spec with spec, plan, tasks, PR, CI, and Argos evidence, **When** the archive dry-run runs, **Then** it records durable references to the source paths, merge commit, PR, CI run, and recovery commands.
2. **Given** a merged feature spec with no screenshots, **When** the archive dry-run runs, **Then** it still records the spec lineage and notes that screenshot evidence was not present.
3. **Given** the archive process detects a conflict between the archived record and canonical project memory, **When** it runs, **Then** it stops for review rather than silently overwriting the canonical record.

---

### User Story 2 - Preserve Argos and CI Provenance Instead of Committed Screenshot Retention (Priority: P1)

A reviewer can trace UI evidence through Argos and CI artifacts, while the repository keeps provenance metadata and manifest links instead of archiving generated screenshot content into source control.

**Why this priority**: The accepted evidence model for SPEC-002A is provenance-first. Committed screenshots are not the default archival target.

**Independent Test**: Verify the evidence model captures Argos build links, CI run links, command provenance, and metadata gate outcomes while excluding generated screenshot files from the archive output by default.

**Acceptance Scenarios**:

1. **Given** a UI journey spec with Argos-backed review artifacts, **When** the archive flow records evidence, **Then** it preserves links and metadata for the review artifacts without copying generated screenshots into the repo.
2. **Given** a completed spec has no Argos artifacts but does have CI evidence, **When** it is archived, **Then** the archive record still preserves CI provenance and marks the absence of Argos data explicitly.
3. **Given** generated screenshot files are present in a spec folder, **When** the archive policy runs, **Then** it treats them as review artifacts unless an explicit exception says otherwise.

---

### User Story 3 - Prepare Archive Sweep Behavior for Future Autopilot Runs (Priority: P1)

A SpecKit executor can start autopilot with an Archive Sweep that processes only previously merged specs, excludes the current target spec, and stops or runs dry-run only when the branch or worktree is unsafe for cleanup.

**Why this priority**: SPEC-002A must define the archive lifecycle before SPEC-003 and later specs begin producing more evidence.

**Independent Test**: Start autopilot on a later spec and verify the Archive Sweep first targets already merged specs, excludes the current target spec, and refuses destructive cleanup on an unsafe base branch or dirty worktree.

**Acceptance Scenarios**:

1. **Given** autopilot starts on a clean safe base branch, **When** the Archive Sweep runs, **Then** it archives previously merged specs first and leaves the current target spec untouched.
2. **Given** autopilot starts on a dirty worktree or an unsafe branch, **When** the Archive Sweep runs, **Then** it limits itself to dry-run behavior or stops with a clear guard message.
3. **Given** the current target spec has not merged yet, **When** the Archive Sweep runs, **Then** it does not archive that spec in the same run.

### Edge Cases

- A merged spec's screenshot evidence is only available through expired CI artifacts. The archive record must still preserve the PR, merge commit, CI run, and recovery commands even if binary files are gone.
- A spec folder still exists under `specs/**` after merge. Removal from active specs may happen only after archive succeeds and the report records merge/tree references plus concrete recovery commands.
- The archive extension or plugin support changes behavior after pinning. Mission Control must keep the pinned fork/tag/commit and report the installed version so later runs remain reproducible.
- The current target spec is merged during a later run. It becomes eligible only in that later Archive Sweep, not the run that is currently processing it.
- The worktree is dirty or the base branch is not safe for cleanup. Archive behavior must stay in dry-run or stop rather than mixing prior-spec cleanup into the current feature branch.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST evaluate `racecraft-lab/spec-kit-archive` as the archive extension candidate and record whether Mission Control installs it directly from a pinned fork tag/commit or vendors an equivalent pinned copy.
- **FR-002**: The system MUST require validation of any `racecraft-lab/spec-kit-archive` fork against Racecraft-specific behavior before adoption, including Argos/CI provenance, dry-run/apply separation, gated active-spec cleanup, and recovery-command reporting.
- **FR-003**: Mission Control MUST pin the archive extension to a specific Racecraft fork tag or commit and record that pin in repo-facing documentation or configuration, including the applicable `.specify/extensions.yml` entry, `.specify/extensions/.registry` installed-extension evidence, vendored `.specify/extensions/archive/extension.yml` manifest when vendored, and SPEC-002A implementation evidence showing the source URL, tag or commit, and manifest hash.
- **FR-004**: The archive policy MUST preserve evidence links and metadata for Argos and CI runs, including Argos build/review URLs, CI run URLs, command provenance, metadata gate outcomes, and optional artifact manifests with screenshot or binary artifact names, hashes, and CI artifact references, and MUST NOT treat generated screenshot content as the default archival payload.
- **FR-005**: The archive policy MUST preserve traceability from durable records back to the source spec path, PR URL, merge commit, CI run, and recovery commands such as `git show <merge-sha>:specs/<feature>/spec.md`.
- **FR-006**: Completed spec folders in `specs/**` MUST remain in active source control until archive succeeds and the archive report includes merge/tree references and concrete recovery commands.
- **FR-007**: The archive process MUST NOT archive the current target spec during the same autopilot run that selected it; the current target spec becomes eligible only after it has merged and a later run sees it as merged.
- **FR-008**: The Archive Sweep MUST run at the start of `speckit-pro:autopilot` for previously merged specs only, and it MUST exclude the current target spec from the same sweep.
- **FR-009**: The Archive Sweep MUST stop or run dry-run only when the base branch is unsafe or the worktree is not clean.
- **FR-010**: The archive flow MUST support dry-run and apply separation so repository cleanup is explicit and reviewable.
- **FR-011**: Mission Control MUST install or vendor the archive extension from a pinned `racecraft-lab/spec-kit-archive` fork tag or commit.
- **FR-012**: `racecraft-lab/racecraft-plugins-public` `speckit-pro` MUST be updated and released with versioned archive-aware behavior across the release surfaces that own that behavior: `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `README.md`, Codex skill files for `speckit-autopilot`, `speckit-coach`, and `speckit-status`, Claude/Codex parity surfaces when shared behavior changes, and marketplace metadata when package metadata or source routing changes. The release MUST define that autopilot begins with Archive Sweep, coach explains archive extension install or vendoring support plus cleanup safety boundaries, and status surfaces archive extension installation state with next-step guidance.
- **FR-013**: This user's local Codex marketplace and installed `speckit-pro` plugin MUST be refreshed to the released archive-aware version after the plugin release, including validation that `~/.codex/plugins/speckit-pro` reports the released manifest version and that `~/.agents/plugins/marketplace.json` points at the intended local plugin source path. Bundled Codex agent templates MUST be refreshed only when the release changes those templates, and Codex restart guidance MUST remain conditional on whether plugin or custom-agent reload is required.
- **FR-014**: The archive policy MUST treat Argos/CI provenance as the source of truth for UI evidence retention and MUST not require committed generated screenshots for that provenance to exist.
- **FR-015**: The repository MUST provide evidence that future spec archival can identify merge/tree references and the exact recovery commands needed to reconstruct removed spec files.
- **FR-016**: The archive workflow MUST define a local and CI guard, negative fixture, or equivalent documented test showing that committed generated screenshots are not required by default and that accidental unmanifested or oversized generated screenshot commits are rejected or flagged with the offending path.
- **FR-017**: Archive Sweep output MUST record eligible previously merged specs, the excluded current target spec, cleanup mode, whether the archive extension is installed, and whether cleanup is safe to apply.
- **FR-018**: The evidence policy MUST state that missing required evidence, failing metadata gates, visible UI defects, clipped or overlapping controls, wrong seeded data, inaccessible controls, or broken UI journeys block PR readiness even when generated screenshots are not committed by default.
- **FR-019**: Future UI evidence runs MUST carry forward SPEC-002 Argos metadata gate and no-empty-build behavior: visual runs record expected Argos metadata for test/story identity, source location, and spec-scoped tags, while non-visual or flag-off regression runs MUST NOT upload empty Argos builds.
- **FR-020**: Archive cleanup MUST NOT rewrite git history and MUST NOT depend on post-merge CI silently mutating `main`; any active-spec folder removal MUST be an explicit reviewed cleanup change after archive success and recovery evidence are recorded.
- **FR-021**: Current Archive Sweep dry-run evidence for previously merged specs, including SPEC-001 and SPEC-002, MUST remain provenance and readiness evidence only and MUST NOT authorize active `specs/**` cleanup unless a later apply-mode run on a clean safe branch records archive success, merge/tree references, recovery commands, and safe-to-apply cleanup state.

### Key Entities

- **Archive Policy**: The repository rule set defining which evidence is preserved as links and metadata, which artifacts remain temporary, and when cleanup is permitted.
- **Archive Report**: The output of an archive dry-run or apply run, including source references, merge/tree references, evidence links, conflicts, recovery commands, cleanup mode, archive extension installed state, dry-run provenance status, and safe-to-apply cleanup state.
- **Archive Sweep**: The autopilot pre-flight archive step that processes previously merged specs before the requested spec and skips the current target spec until it is eligible.
- **Evidence Provenance**: The Argos/CI metadata, PR references, command provenance, and related links that reconstruct UI review history without committing generated screenshots by default.
- **Pinned Archive Extension**: The adopted `racecraft-lab/spec-kit-archive` fork tag or commit used to ensure repeatable archive behavior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A dry-run archive against `specs/002-product-line-switcher` completes without deleting source files, produces a report with merge/tree references and recovery commands, and records that dry-run evidence is not cleanup permission.
- **SC-002**: The spec record shows Argos/CI provenance links, metadata gate outcomes, command provenance, and optional artifact-manifest references for a completed UI journey without requiring committed generated screenshots as the durable artifact.
- **SC-003**: The Archive Sweep can be shown to archive previously merged specs first, exclude the current target spec, record cleanup mode and archive extension installed state, and stop or dry-run when the branch or worktree is unsafe.
- **SC-004**: Mission Control records a pinned archive extension version or commit from the Racecraft fork and shows that the archive extension is installed or vendored in the repo.
- **SC-005**: The `speckit-pro` release and this user's local plugin install both reflect archive-aware behavior, including Archive Sweep startup in autopilot, archive extension install/vendor guidance in coach, archive installation state and next-step guidance in status, matching version evidence from plugin manifests, marketplace source-path verification, and passing structural release tests.
- **SC-006**: Future SPEC-003 setup can identify SPEC-002A as complete and can recover any removed active-spec file using the recorded merge/tree reference and `git show` command, with cleanup performed through reviewed forward history rather than history rewrite or post-merge CI mutation.
- **SC-007**: A local and CI screenshot-retention guard, negative fixture, or documented equivalent fails or flags an accidental unmanifested or oversized generated screenshot commit and names the offending path.

## Assumptions

- SPEC-002 is the reference example because it introduced the first real UI journey evidence that motivated this policy.
- Argos and CI artifact provenance are preferred over committed screenshot retention for long-lived evidence.
- Git history is the raw archive of completed specs; active `specs/**` folders may be cleaned up only after archive succeeds and recovery commands are recorded.
- The `racecraft-lab/spec-kit-archive` fork must be validated for Racecraft-specific behavior before Mission Control installs or vendors a pinned copy.
- The `speckit-pro` plugin release and local install refresh are required parts of SPEC-002A completion, not optional follow-up work.
