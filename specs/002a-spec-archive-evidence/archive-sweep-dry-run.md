# Archive Sweep Dry-Run Report

Recorded: 2026-04-28

Command contract simulated from the vendored extension:

```text
/speckit.archive.run --sweep --current-target specs/002a-spec-archive-evidence --dry-run
```

## Mode

- archiveMode: sweep
- dryRun: true
- applyCleanupRequested: false
- dryRunProvenanceOnly: true
- safeToApplyCleanup: false
- cleanupMode: dry-run
- archiveExtensionInstalled: true
- archiveExtensionPin: `racecraft-lab/spec-kit-archive@v1.1.0`
- archiveExtensionCommit: `08ee0e919a72ccb254758a2b6f51d58196490ea7`

Cleanup is dry-run-only because this checkout is on
`feat/openfeature-feature-flags` with uncommitted SPEC-002A work and unrelated
untracked files. No source spec files were deleted, moved, or rewritten.

## Sweep Summary

| Spec | PR | Merge Commit | Eligibility | Cleanup Mode | Reason |
| --- | --- | --- | --- | --- | --- |
| `specs/001-foundation-migrations` | [#15](https://github.com/racecraft-lab/mission-control/pull/15) | `85baf27c218617f412a4a74f9feae13948fc26cd` | eligible previous merged spec | dry-run only | PR merged to `main`; cleanup unsafe in current dirty feature checkout |
| `specs/002-product-line-switcher` | [#16](https://github.com/racecraft-lab/mission-control/pull/16) | `65f2e7ce0f99991760f0236e605c7daf8f44d770` | eligible previous merged spec | dry-run only | PR merged to `main`; used as SPEC-002A dry-run source; cleanup unsafe in current dirty feature checkout |
| `specs/002a-spec-archive-evidence` | current run | n/a | excluded current target | none | Current target spec is never archived or cleaned up in the same run |

## SPEC-002 Dry-Run Provenance

- Source spec path: `specs/002-product-line-switcher`
- PR URL: `https://github.com/racecraft-lab/mission-control/pull/16`
- PR title: `feat(SPEC-002): add Product Line scope switcher`
- PR state: `MERGED`
- Merged at: `2026-04-27T18:02:20Z`
- Source branch: `002-product-line-switcher`
- Base branch: `main`
- Merge commit: `65f2e7ce0f99991760f0236e605c7daf8f44d770`
- Tree reference: `65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher`
- CI run URL: `https://github.com/racecraft-lab/mission-control/actions/runs/25011323867`
- Argos Storybook build: `https://app.argos-ci.com/fgabelmannjr/mission-control/builds/11`
- Argos Playwright build: `https://app.argos-ci.com/fgabelmannjr/mission-control/builds/12`
- Argos summary: `https://app.argos-ci.com/fgabelmannjr/mission-control`

## Check And Metadata Gate Evidence

| Check | Status | URL |
| --- | --- | --- |
| `quality-gate` | success | `https://github.com/racecraft-lab/mission-control/actions/runs/25011323880/job/73247534730` |
| `docker-ui-e2e` | success | `https://github.com/racecraft-lab/mission-control/actions/runs/25011323867/job/73247534668` |
| `argos-storybook` | success | `https://github.com/racecraft-lab/mission-control/actions/runs/25011323893/job/73247534667` |
| `argos/spec-002-storybook` | success | `https://app.argos-ci.com/fgabelmannjr/mission-control/builds/11` |
| `argos/spec-002-playwright` | success | `https://app.argos-ci.com/fgabelmannjr/mission-control/builds/12` |
| `argos/summary` | success | `https://app.argos-ci.com/fgabelmannjr/mission-control` |

Metadata gate policy:

- `pnpm test:e2e:argos-metadata` must verify SPEC-002 Playwright screenshot metadata, test identity, source locations, `@spec-002` tags, and `spec-002` screenshot tags.
- `pnpm test:visual:argos-metadata` must verify SPEC-002 Storybook screenshot metadata, story identity, source locations, and `spec-002` / `visual` tags.
- Non-visual or flag-off regression runs must not upload empty Argos builds.

## Artifact Manifest

| Artifact | Run | Expired | Size |
| --- | --- | --- | ---: |
| `spec-002-ui-e2e-artifacts` | `https://github.com/racecraft-lab/mission-control/actions/runs/25011323867` | false | 18,211,335 bytes |
| `storybook-argos-screenshots` | `https://github.com/racecraft-lab/mission-control/actions/runs/25011323893` | false | 238,518 bytes |

These artifacts and Argos build links are provenance references. Generated
screenshots are not copied into durable spec memory by default.

## Recovery Commands

```text
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/spec.md
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/plan.md
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/tasks.md
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/quickstart.md
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/retrospective.md
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/contracts/product-line-scope.md
```

Directory recovery:

```text
git checkout 65f2e7ce0f99991760f0236e605c7daf8f44d770 -- specs/002-product-line-switcher
```

## Cleanup Decision

- cleanupApplied: false
- cleanupCommand: none
- blockedBy:
  - active branch is not a safe base branch for cleanup
  - worktree is dirty
  - current run is `--dry-run`
  - `--apply-cleanup` was not supplied
  - SPEC-002A current target must be excluded until a later run sees it merged

## Source File Preservation

`find specs/002-product-line-switcher -maxdepth 2 -type f` confirmed the
source spec files still exist after the dry-run evidence step. `git status`
shows no deletions under `specs/**` from this Archive Sweep.
