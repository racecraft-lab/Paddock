# Contract: Archive Sweep and Plugin Refresh

## Archive Sweep Command Contract

### Purpose

Run archival cleanup for previously merged specs before requested spec work begins.

### Required Behavior

- Dry-run by default when the branch is unsafe or the worktree is dirty.
- Process only previously merged specs.
- Exclude the current target spec from the same sweep.
- Treat dry-run evidence for previously merged specs as provenance/readiness evidence only, not as permission to remove active spec folders.
- Record eligible previously merged specs considered by the sweep, including PR and merge commit evidence when known.
- Record the excluded current target spec.
- Record cleanup mode, archive extension installed state, and whether cleanup is safe to apply.
- Record merge/tree references and recovery commands.
- Never rewrite git history or rely on post-merge CI silently mutating `main` for cleanup; active-spec cleanup must be an explicit reviewed forward change after archive success.
- Record Argos build links, CI run links, command provenance, metadata gate outcomes, PR/merge references, and optional artifact-manifest entries when available.
- Reject or flag committed generated screenshots as default archival payload.
- Reject or flag unmanifested or oversized committed generated screenshots through a local and CI guard, negative fixture, or equivalent documented test that names the offending path.
- Treat missing required evidence, failing metadata gates, visible UI defects, clipped or overlapping controls, wrong data, inaccessible controls, or broken UI journeys as PR-readiness blockers.
- Preserve SPEC-002-style no-empty-build behavior: non-visual or flag-off regression runs must not upload empty Argos builds.

### Inputs

- `requestedSpec`
- `eligiblePreviousSpecs`
- `branchState`
- `worktreeState`
- `archiveExtensionPin`
- `screenshotPolicy`
- `metadataGatePolicy`
- `artifactManifestPolicy`
- `cleanupPermissionPolicy`

### Outputs

- `archiveReport`
- `eligiblePreviousSpecs`
- `excludedCurrentSpec`
- `cleanupMode`
- `archiveExtensionInstalled`
- `safeToApplyCleanup`
- `dryRunProvenanceOnly`
- `recoveryCommands`
- `evidenceProvenance`
- `metadataGateOutcomes`
- `artifactManifest`
- `screenshotGuardResult`

## Plugin Refresh Contract

### Purpose

Update the local Codex environment after release of the archive-aware `speckit-pro` plugin.

### Required Behavior

- Publish a versioned release in `racecraft-lab/racecraft-plugins-public`.
- Update archive-aware release surfaces for changed behavior, including `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `README.md`, Codex `speckit-autopilot`, `speckit-coach`, and `speckit-status` skill files, Claude/Codex parity files when shared behavior changes, and marketplace metadata when package metadata or source routing changes.
- Validate the release with `tests/run-all.sh` and Codex structural checks for plugin manifest, skills, marketplace metadata, and parity.
- Refresh the installed `~/.codex/plugins/speckit-pro` copy.
- Update `~/.agents/plugins/marketplace.json` when plugin metadata changes.
- Compare the refreshed local `.codex-plugin/plugin.json` version and marketplace `source.path` against the released archive-aware plugin.
- Refresh bundled agent templates only when the release changes them.
- Leave restart behavior conditional on whether a reload is required.

### Outputs

- Updated plugin install state
- Updated marketplace metadata when applicable
- Installed local plugin manifest version
- Marketplace source path verification
- Structural release validation evidence
- Optional Codex restart guidance
