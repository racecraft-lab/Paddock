# Data Model: Spec Archive and Evidence Retention

## ArchivePolicy

Represents the repository rules for what gets archived, what stays in active `specs/**`, and when cleanup is allowed.

### Fields

- `id`: Stable policy identifier.
- `pinnedExtensionRef`: Fork tag or commit for `racecraft-lab/spec-kit-archive`.
- `screenshotPolicy`: Rule set describing that generated screenshots are not the default archival payload.
- `cleanupPolicy`: Rule set describing reviewed cleanup after successful archive.
- `branchSafetyPolicy`: Conditions that force dry-run or stop behavior.
- `recoveryPolicy`: Required recovery command formats.

### Validation Rules

- Must reference a pinned extension version or commit.
- Must distinguish dry-run from apply.
- Must require evidence provenance links and recovery commands.

## ArchiveReport

Represents the output of an archive dry-run or apply operation.

### Fields

- `specPath`: Source spec path, for example `specs/002-product-line-switcher`.
- `mergeCommit`: Merge SHA for the completed spec.
- `pullRequest`: PR number or URL.
- `ciRuns`: CI run references.
- `argosArtifacts`: Argos build or review references.
- `metadataGateOutcomes`: Results from Argos/CI metadata gates, including the command name, pass/fail state, expected metadata counts or tags, and links to the CI job that evaluated them.
- `artifactManifest`: Optional manifest of screenshot or binary artifact references, including artifact names, hashes, CI artifact identifiers or URLs, and retention classification.
- `evidenceLinks`: Links to durable provenance artifacts.
- `recoveryCommands`: Commands such as `git show <merge-sha>:specs/<feature>/spec.md`.
- `cleanupMode`: `dry-run`, `apply`, or `stop`.
- `dryRunProvenanceOnly`: Boolean indicating that dry-run evidence is provenance/readiness evidence and does not authorize active-spec cleanup.
- `conflicts`: Any blocking validation or canonical-record mismatch.

### Validation Rules

- Must include enough provenance to reconstruct the archived spec without screenshots.
- Must include merge/tree references when cleanup is allowed.
- Must not imply deletion unless apply mode completed successfully.
- Dry-run reports must not grant cleanup permission, even when they identify eligible previously merged specs.
- Must record missing required evidence or failing metadata gates as PR-readiness blockers, not as acceptable archive omissions.

## EvidenceProvenance

Represents the durable, link-based evidence record for UI journey specs.

### Fields

- `prReference`: PR number or URL.
- `commitReference`: Merge or tree SHA.
- `ciReference`: CI build or workflow URL.
- `argosReference`: Argos build/review URL.
- `commandHistory`: Commands used to generate the evidence.
- `metadataGateOutcomes`: Argos/CI metadata gate outcomes, including SPEC-002-style test/story identity, source location, spec tag, and no-empty-build checks when applicable.
- `artifactManifest`: Optional manifest of screenshots or binary outputs with names, hashes, CI artifact references, and whether each item is ephemeral, durable metadata, or an explicit committed-evidence exception.

### Validation Rules

- Screenshots may be referenced, but they are not required as committed source files.
- A spec with no screenshots must still retain provenance metadata.
- UI specs with missing required evidence, failing metadata gates, empty Argos builds where screenshots were expected, or known visible journey defects are not PR-ready.

## ArchiveSweepRun

Represents the autopilot pre-flight sweep performed before requested spec work.

### Fields

- `requestedSpec`: Current target spec directory.
- `previouslyMergedSpecs`: Specs eligible for archival.
- `excludedCurrentSpec`: The active target spec, excluded from the same run.
- `branchState`: Safe, unsafe, or dirty.
- `worktreeState`: Clean or dirty.
- `mode`: `dry-run`, `apply`, or `stop`.
- `cleanupPermission`: `none`, `provenance-only`, or `safe-to-apply`.

### Validation Rules

- Must only process previously merged specs.
- Must stop or dry-run when branch or worktree is unsafe.
- Must never archive the current target spec in the same run.
- Must treat SPEC-001/SPEC-002 dry-run evidence as provenance only until a later clean safe apply-mode run records safe-to-apply cleanup state.

## PluginReleaseMetadata

Represents the versioned archive-aware `speckit-pro` release and its local install state.

### Fields

- `version`: Released plugin version.
- `archiveSupport`: Boolean or feature flag indicating archive awareness.
- `autopilotAwareness`: Whether autopilot starts with Archive Sweep.
- `coachAwareness`: Whether coach guidance includes archive support.
- `statusAwareness`: Whether status surfaces installation state.
- `releaseSurfaces`: Files that must carry archive-aware release behavior, including `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `README.md`, Codex archive-aware skill files, parity surfaces when shared behavior changes, and marketplace metadata when package metadata or source routing changes.
- `structuralValidation`: Required release validation evidence, including `tests/run-all.sh` and Codex structural tests for plugin manifest, skills, marketplace metadata, and parity.
- `localInstallPath`: User-scope plugin path.
- `marketplaceConfig`: Local marketplace JSON reference.
- `marketplaceSourcePath`: The marketplace `source.path` expected to point at the refreshed local plugin.
- `installedManifestVersion`: Version reported by the refreshed local `.codex-plugin/plugin.json`.

### Validation Rules

- Must reflect the released archive-aware build.
- Must be refreshable into the local Codex plugin install.
- Must compare the local installed manifest version and marketplace source path against the released archive-aware plugin after refresh.
- Must refresh bundled Codex agent templates only when template files changed.
