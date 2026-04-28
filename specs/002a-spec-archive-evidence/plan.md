# Implementation Plan: Spec Archive and Evidence Retention

**Feature**: SPEC-002A - Spec Archive and Evidence Retention
**Branch**: `002a-spec-archive-evidence`
**Status**: Planning
**Source of Truth**: `docs/ai/specs/SPEC-002A-workflow.md`

## Technical Context

- Mission Control is a Next.js/TypeScript repository that already uses SpecKit workflows and local `.specify` extension state.
- The current SPEC-002A evidence set already includes the feature spec, checklist, and draft research, but the plan artifact was missing and must be reconciled.
- The archive extension candidate is `racecraft-lab/spec-kit-archive`, and the working decision is to evaluate it as a pinned Racecraft fork/commit before adoption.
- The repo’s current extension registry shows `git`, `verify`, `doctor`, `retrospective`, `cleanup`, `review`, and `verify-tasks` enabled; `archive` is not installed.
- The observed upstream `stn1slv/spec-kit-archive` package registers `speckit.archive.run` to `commands/archive.md`; that markdown/prompt command is useful adoption context, but it is not by itself proof of CI-safe Racecraft behavior for Argos/CI provenance, dry-run/apply separation, gated active-spec cleanup, or recovery-command reporting.
- The active checkout is on `feat/openfeature-feature-flags` with unrelated local edits and untracked files, so cleanup-sensitive archive operations must remain dry-run only in this state.
- Current Archive Sweep dry-run evidence for SPEC-001 and SPEC-002 is provenance and readiness evidence only. It is not permission to remove active spec folders until a later clean, safe apply-mode cleanup records archive success, merge/tree references, recovery commands, and safe-to-apply cleanup state.
- `racecraft-lab/racecraft-plugins-public` and the local `~/.codex/plugins/speckit-pro` install are part of the delivery surface for the archive-aware plugin release.

## Goals

1. Define the archive lifecycle so autopilot starts with an Archive Sweep for previously merged specs only.
2. Specify how Mission Control pins or vendors the archive extension from the Racecraft fork.
3. Describe the plugin and local Codex refresh path after the archive-aware release.
4. Preserve provenance-first evidence for Argos/CI without requiring committed generated screenshots by default.
5. Record git-history recovery commands and cleanup constraints for completed specs.
6. Carry SPEC-002 Argos metadata-gate and no-empty-build behavior forward into the evidence policy so visual evidence remains reviewable without committing generated screenshots.
7. Keep dry-run Archive Sweep evidence separate from cleanup authorization.

## Non-Goals for This Analyze Remediation Pass

- No source code, package manifest, CI, external repository, local plugin install, workflow, or autopilot-state edits are performed during Phase 6 Analyze remediation.
- No edits are made outside `specs/002a-spec-archive-evidence/` during Phase 6 Analyze remediation.
- No branch creation, commits, pushes, releases, PR updates, or local Codex plugin refreshes are performed during Phase 6 Analyze remediation.
- No destructive archive cleanup is applied from the current dirty or unsafe checkout.
- No active `specs/**` folder is deleted or moved from this unsafe branch.
- No cleanup rewrites git history or depends on post-merge CI silently mutating `main`.

## Downstream Implementation Surfaces

Phase 7 implementation MUST decompose concrete write scopes across the actual delivery surfaces that SPEC-002A owns:

- `racecraft-lab/spec-kit-archive`: validate the archive extension candidate, update the Racecraft fork when SPEC-002A behavior requires Argos/CI provenance, dry-run/apply separation, gated active-spec cleanup, or recovery-command reporting, then tag or pin the adopted commit.
- Mission Control SpecKit integration: install or vendor the archive extension from the pinned Racecraft fork/tag/commit and record `.specify/extensions.yml`, `.specify/extensions/.registry`, vendored manifest/source hash, and dry-run-only unsafe-checkout evidence.
- `racecraft-lab/racecraft-plugins-public` `speckit-pro`: update archive-aware autopilot, coach, status, README, plugin manifests, parity surfaces, marketplace metadata when required, structural tests, and release/version evidence.
- This user's local Codex environment: refresh `~/.codex/plugins/speckit-pro`, verify `~/.agents/plugins/marketplace.json` source path, refresh bundled Codex agent templates only when the release changes them, and record conditional Codex restart guidance.
- Mission Control policy/verification surfaces: add or update local/CI screenshot-retention guard evidence, archive dry-run evidence, workflow/template/constitution policy references, and final acceptance evidence.

## Constitution Check

- Real UI journey quality gates remain in force.
- Evidence retention must preserve reviewability, recovery, and branch safety.
- Cleanup is reviewed and gated, not automatic deletion.
- Generated screenshots remain review artifacts, not default archival payload.
- Missing evidence, failing Argos metadata gates, visible UI defects, clipped or overlapping controls, wrong data, inaccessible controls, and broken UI journeys still block PR readiness.

## Gate Evaluation

- **Gate G1: Scope fit** - Pass. This plan stays within specification and design artifacts.
- **Gate G2: Provenance model** - Pass. The plan centers Argos/CI links, merge refs, and recovery commands.
- **Gate G3: Fork adoption safety** - Pass with follow-up validation. Adoption depends on Racecraft-specific behavior checks.
- **Gate G4: Branch safety** - Pass as dry-run only. Current checkout is not safe for cleanup.
- **Gate G5: Local plugin refresh** - Pass as planned work. The release/install flow is documented, not executed here.
- **Gate G6: Cleanup mutation safety** - Pass. Cleanup is a reviewed forward change only; dry-run evidence is provenance, not deletion permission, and history rewrite or silent post-merge CI mutation is out of scope.

## Phase 0: Research Summary

- Validate `racecraft-lab/spec-kit-archive` against Racecraft requirements before installation.
- Pin the chosen fork/tag/commit in Mission Control-facing docs/config.
- Confirm the archive command can separate dry-run from apply behavior.
- Confirm the archive report records recovery commands and merge/tree references.
- Confirm the plugin release updates autopilot, coach, and status awareness for archive support.
- Confirm the local Codex marketplace and installed plugin refresh after the release.
- Confirm release-surface parity for `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `README.md`, Codex archive-aware skills, and marketplace metadata when package metadata or source routing changes.

## Archive Adoption Verification Surfaces

- Current pre-adoption state is verified by `.specify/extensions.yml` and `.specify/extensions/.registry`, which do not list `archive`.
- Direct-install adoption must record the pinned Racecraft fork source URL and tag or commit used for installation, then verify `.specify/extensions.yml` and `.specify/extensions/.registry` show the archive extension and manifest hash.
- Vendored adoption must record the vendored `.specify/extensions/archive/extension.yml` manifest, source URL, tag or commit, local modifications, and manifest hash so CI does not depend on a moving remote.
- SPEC-002A implementation evidence must include the install or vendor verification output plus validation results for Argos/CI provenance, dry-run/apply separation, gated active-spec cleanup, and recovery-command reporting before Mission Control treats the archive extension as adopted.

## Phase 1: Design Summary

- Create a data model for archive policy, archive report, evidence provenance, and pinned extension metadata.
- Document the archive command contract, including dry-run/apply behavior and unsafe-branch stop conditions.
- Document the plugin refresh contract for `speckit-pro` and the local marketplace.
- Document quickstart steps for validating dry-run archive behavior against previously merged specs.

## Phase 2: Verification Plan

1. Confirm archive dry-run output for `specs/002-product-line-switcher` remains the reference dry-run case.
2. Confirm the current target spec is excluded from the sweep until later eligibility.
3. Confirm cleanup is blocked or dry-run only on unsafe branches and dirty worktrees.
4. Confirm no generated screenshots are required as committed archive payload.
5. Confirm recovery commands are present and usable from git history.
6. Confirm evidence records include Argos build links, CI run links, command provenance, metadata gate outcomes, PR/merge references, and optional artifact manifests.
7. Confirm a local and CI guard, negative fixture, or documented equivalent rejects or flags unmanifested or oversized generated screenshot commits and names the offending path.
8. Confirm non-visual or flag-off regression runs do not upload empty Argos builds, matching SPEC-002 behavior.
9. Confirm the `speckit-pro` release runs structural validation through `tests/run-all.sh`, including Codex structural checks for plugin manifest, skills, marketplace metadata, and Claude/Codex parity.
10. Confirm this user's local Codex refresh compares the installed `~/.codex/plugins/speckit-pro/.codex-plugin/plugin.json` version and `~/.agents/plugins/marketplace.json` source path against the released archive-aware plugin.
11. Confirm dry-run Archive Sweep evidence for SPEC-001 and SPEC-002 is recorded as provenance/readiness evidence only, not cleanup permission.
12. Confirm active-spec cleanup is represented as a reviewed forward change and does not rewrite git history or depend on post-merge CI mutating `main`.
13. Confirm Phase 7 tasks map FR-001 through FR-021 and SC-001 through SC-007 to concrete evidence outputs, including archive fork validation, Mission Control installation, `speckit-pro` release, local Codex refresh, guard results, dry-run boundaries, and recovery commands.

## Open Plan Blockers

- The repository checkout is currently dirty and not on the safe branch required for destructive archive cleanup validation.
- The plan cannot verify the actual plugin release or local Codex refresh in this phase without switching to implementation/release work.
- The branch mismatch means the standard SpecKit plan setup script cannot run end-to-end in this checkout.
