# Quickstart: Spec Archive and Evidence Retention

## Purpose

Validate the archive plan, its dry-run contract, and the post-release plugin refresh path without modifying source code.

## Prerequisites

- A checkout of Mission Control with the SPEC-002A artifacts present.
- Access to the `racecraft-lab/spec-kit-archive` fork for validation.
- Access to the `racecraft-lab/racecraft-plugins-public` repository for plugin-release verification.
- A clean safe branch if you intend to test apply behavior. The current dirty branch should remain dry-run only.

## Dry-Run Archive Validation

1. Confirm the archive extension candidate and its pin.
2. Run the archive sweep in dry-run mode against a previously merged spec, such as `specs/002-product-line-switcher`.
3. Verify the output includes:
   - eligible previously merged specs considered by the sweep
   - skipped current target spec
   - cleanup mode
   - archive extension installed state
   - safe-to-apply cleanup state
   - dry-run provenance-only state when cleanup is not being applied
   - source spec path
   - merge commit or tree reference
   - PR reference
   - CI and Argos provenance links
   - command provenance
   - Argos/CI metadata gate outcomes
   - optional artifact manifest entries with names, hashes, CI artifact references, and retention classification
   - recovery commands
4. Verify the current target spec is excluded from the same sweep.
5. Verify SPEC-001 and SPEC-002 dry-run evidence remains provenance/readiness evidence only and is not treated as permission to remove active spec folders.
6. Verify no generated screenshots are required to exist in source control for the provenance record.
7. Verify non-visual or flag-off regression runs do not upload empty Argos builds.

## Safety Checks

1. Confirm the branch is safe before any apply-mode cleanup.
2. Confirm the worktree is clean before destructive archive operations.
3. If either check fails, keep the run in dry-run mode or stop.
4. Confirm active-spec cleanup is performed only as an explicit reviewed forward change after archive success and recovery references are recorded.
5. Confirm cleanup does not rewrite git history and does not rely on post-merge CI silently mutating `main`.

## Screenshot Guard Validation

1. Run the local screenshot-retention guard, negative fixture, or documented equivalent for an intentionally unmanifested or oversized generated screenshot under `specs/**/screenshots`.
2. Confirm the guard fails or flags the fixture and names the offending path.
3. Confirm the corresponding CI guard uses the same policy and passes for approved SPEC-002 evidence or artifact-bundle-only paths.

## PR Readiness Evidence Gate

1. Confirm required Argos build links, CI run links, command provenance, metadata gate outcomes, PR references, merge references, and optional artifact manifests are present before marking a UI spec PR ready.
2. Confirm missing required evidence, failing metadata gates, visible UI defects, clipped or overlapping controls, wrong seeded data, inaccessible controls, or broken UI journeys remain PR-readiness blockers.
3. Confirm generated screenshots are reviewed through Argos, CI artifacts, or an explicit manifest-backed exception rather than being committed by default.

## Plugin Refresh Validation

1. Confirm `racecraft-lab/racecraft-plugins-public` has a versioned archive-aware `speckit-pro` release.
2. Confirm the release updates the required surfaces for changed behavior: `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `README.md`, Codex `speckit-autopilot`, `speckit-coach`, and `speckit-status` skill files, Claude/Codex parity files when shared behavior changes, and marketplace metadata when package metadata or source routing changes.
3. Run the `speckit-pro` structural release suite, including `tests/run-all.sh` and Codex structural checks for plugin manifest, skills, marketplace metadata, and parity.
4. Refresh the local `~/.codex/plugins/speckit-pro` install to the released version.
5. Compare `~/.codex/plugins/speckit-pro/.codex-plugin/plugin.json` against the released archive-aware manifest version.
6. Confirm `~/.agents/plugins/marketplace.json` points `speckit-pro` at the intended local plugin source path and reflects the plugin update if the package metadata changed.
7. Reinstall or refresh the bundled Codex agent templates only if the release changed them.
8. Restart Codex only if the updated plugin or templates require a reload.

## Recovery Check

1. Use the recorded merge SHA and `git show` format from the archive report to reconstruct a removed spec file.
2. Confirm the recovery command points at the original committed spec path.
