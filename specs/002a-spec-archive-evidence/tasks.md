# Tasks: Spec Archive and Evidence Retention

**Input**: SPEC-002A artifacts in `specs/002a-spec-archive-evidence/`, source workflow `docs/ai/specs/SPEC-002A-workflow.md`, and current `docs/ai/specs/autopilot-state.json` Archive Sweep evidence.

**Execution Mode**: These tasks define Phase 7 implementation and verification. This Phase 6 Analyze remediation does not execute external repo, source, workflow, package, local plugin, branch, commit, push, release, or PR changes.

**Safety Rule**: The current checkout is dirty and on an unsafe branch for cleanup. All Archive Sweep/archive validation against this checkout is dry-run-only unless a later clean safe apply-mode run explicitly records archive success, merge/tree references, recovery commands, and `safeToApplyCleanup=true`.

**Forbidden for Every Task**:

- Do not delete or move active `specs/**` content from this unsafe branch.
- Do not archive the current `specs/002a-spec-archive-evidence` target during the same run.
- Do not rewrite git history.
- Do not depend on post-merge CI silently mutating `main`.
- Do not refresh this user's local Codex plugin install until after a versioned archive-aware `speckit-pro` release exists.

## Phase 1: Setup and Baseline Evidence

- [x] T001 Record current SPEC-002A baseline evidence in implementation notes: `docs/ai/specs/SPEC-002A-workflow.md`, `docs/ai/specs/autopilot-state.json` `archive_sweep`, `specs/002a-spec-archive-evidence/spec.md`, `plan.md`, `data-model.md`, `quickstart.md`, `contracts/archive-sweep.md`, and all SPEC-002A checklists. [FR-017, FR-021, SC-003, SC-007]
- [x] T002 Verify the Mission Control package manager from the lockfile before any downstream local command and record the detected runner in acceptance evidence. [FR-013]
- [x] T003 Verify the Mission Control git remotes before any downstream fetch/push/PR operation and record the remote names used in acceptance evidence. [FR-015, FR-020]
- [x] T004 Confirm the active branch/worktree state and record that cleanup-sensitive archive operations are dry-run-only in the current checkout. [FR-009, FR-010, FR-021, SC-001, SC-003]
- [x] T005 [P] Capture the current pre-adoption Mission Control extension state from `.specify/extensions.yml` and `.specify/extensions/.registry` without installing archive yet. [FR-003, FR-011, SC-004]

## Phase 2: Archive Fork Validation and Adoption Decision

- [x] T006 Validate `racecraft-lab/spec-kit-archive` against SPEC-002A requirements for Argos/CI provenance, dry-run/apply separation, gated active-spec cleanup, recovery-command reporting, current-target exclusion, and unsafe-checkout dry-run/stop behavior. [FR-001, FR-002, FR-004, FR-007, FR-009, FR-010, FR-017, FR-021, SC-001, SC-003]
- [x] T007 If `racecraft-lab/spec-kit-archive` needs Racecraft-specific changes, implement those changes in the fork and record the commit/tag containing the behavior. [FR-001, FR-002, FR-003, FR-011, SC-004]
- [x] T008 If the archive fork is adopted without changes, record the pinned fork tag/commit, source URL, manifest hash, license/version evidence, and rationale for no fork changes. [FR-001, FR-002, FR-003, FR-011, SC-004] (Not applicable: adopted with Racecraft changes in T007; no-change rejection recorded in implementation evidence.)
- [x] T009 If the archive fork is rejected, document the rejection evidence and define the fallback pinned/vendored archive behavior required for Mission Control. [FR-001, FR-002, FR-011, SC-004]
- [x] T010 [P] Add fork validation evidence showing that the archive report can include merge/tree references and `git show <merge-sha>:specs/<feature>/spec.md` recovery commands. [FR-005, FR-006, FR-015, SC-001, SC-006]

## Phase 3: Mission Control SpecKit Integration

**Goal**: Install or vendor the adopted archive extension in Mission Control from a reproducible Racecraft fork/tag/commit while preserving dry-run-only behavior for the unsafe checkout.

**Independent test**: Mission Control records the archive extension pin, installed registry evidence, vendored manifest/source hash when applicable, and dry-run-only fallback when cleanup is unsafe.

- [x] T011 Update Mission Control SpecKit extension configuration or vendored extension files to use the pinned `racecraft-lab/spec-kit-archive` fork tag/commit or documented fallback. [FR-003, FR-011, SC-004]
- [x] T012 Record direct-install evidence from `.specify/extensions.yml` and `.specify/extensions/.registry`, or vendored evidence from `.specify/extensions/archive/extension.yml`, source URL, tag/commit, local modifications, and manifest hash. [FR-003, FR-011, SC-004]
- [x] T013 Add or update Mission Control-facing archive dry-run documentation/configuration so Archive Sweep starts before requested spec work and excludes the current target spec. [FR-007, FR-008, FR-017, SC-003]
- [x] T014 Add unsafe-branch and dirty-worktree handling evidence proving the archive path stops or remains dry-run-only instead of applying active-spec cleanup. [FR-009, FR-010, FR-020, FR-021, SC-001, SC-003]
- [x] T015 Verify Mission Control does not delete active `specs/**`, rewrite history, or rely on post-merge CI mutation for cleanup. [FR-006, FR-020, FR-021, SC-006]

## Phase 4: Archive Sweep and Evidence Provenance

**Goal**: Produce archive and Archive Sweep evidence for previously merged specs while treating generated screenshots as review artifacts, not default durable payload.

**Independent test**: A dry-run against `specs/002-product-line-switcher` records provenance, recovery commands, cleanup mode, archive installed state, and current-target exclusion without deleting source files.

- [x] T016 Run the archive dry-run against `specs/002-product-line-switcher` and capture output proving no source files were deleted or moved. [FR-005, FR-006, FR-010, FR-021, SC-001]
- [x] T017 Verify archive output records source spec path, PR URL, merge commit or tree reference, CI run URL, Argos build/review URL, command provenance, metadata gate outcomes, and optional artifact manifest entries. [FR-004, FR-005, FR-014, FR-019, SC-002]
- [x] T018 Verify archive output records recovery commands, including `git show <merge-sha>:specs/<feature>/spec.md`, for raw completed-spec artifact recovery. [FR-005, FR-015, SC-001, SC-006]
- [x] T019 Verify Archive Sweep output lists eligible previously merged specs, the excluded current target spec, cleanup mode, archive extension installed state, `dryRunProvenanceOnly`, and `safeToApplyCleanup`. [FR-007, FR-008, FR-009, FR-017, FR-021, SC-003]
- [x] T020 Verify dry-run evidence for SPEC-001 and SPEC-002 remains provenance/readiness evidence only and does not authorize active-spec cleanup. [FR-010, FR-021, SC-001, SC-003]

## Phase 5: Screenshot Guard and UI Evidence Policy

**Goal**: Preserve Argos/CI provenance for UI review while rejecting accidental unmanifested or oversized generated screenshot commits.

**Independent test**: Local and CI guard evidence names an offending path for a negative fixture and passes for approved artifact-bundle-only or manifest-backed evidence.

- [x] T021 Define or update the evidence manifest fields for screenshot or binary artifact names, hashes, CI artifact references, retention classification, redaction status, and expiration risk. [FR-004, FR-014, FR-016, SC-002, SC-007]
- [x] T022 Add a local screenshot-retention guard or equivalent documented test that rejects or flags unmanifested or oversized generated screenshots and names the offending path. [FR-016, SC-007]
- [x] T023 Add CI validation for the same screenshot-retention policy, or document the equivalent CI-safe validation path if the guard runs through existing workflow infrastructure. [FR-016, SC-007]
- [x] T024 Add a negative fixture or synthetic fixture path proving the guard fails without committing unnecessary large binaries. [FR-016, SC-007]
- [x] T025 Verify approved SPEC-002 evidence or artifact-bundle-only paths pass without requiring committed generated screenshots as durable artifacts. [FR-004, FR-014, FR-016, SC-002, SC-007]
- [x] T026 Update PR-readiness evidence policy so missing evidence, failing metadata gates, visible UI defects, clipped or overlapping controls, wrong seeded data, inaccessible controls, or broken UI journeys block readiness. [FR-018, FR-019, SC-002]
- [x] T027 Verify non-visual or flag-off regression runs do not upload empty Argos builds and visual runs retain SPEC-002-style metadata for test/story identity, source location, and spec-scoped tags. [FR-019, SC-002]

## Phase 6: Archive-Aware speckit-pro Release

**Goal**: Release archive-aware `speckit-pro` behavior in `racecraft-lab/racecraft-plugins-public`.

**Independent test**: The released plugin version documents Archive Sweep startup, archive extension install/vendor guidance, cleanup safety boundaries, status visibility, and passing structural validation.

- [x] T028 Update `racecraft-lab/racecraft-plugins-public` `speckit-pro` autopilot behavior so `speckit-pro:autopilot` begins with Archive Sweep for previously merged specs before requested spec work. [FR-008, FR-012, FR-017, SC-003, SC-005]
- [x] T029 Update `speckit-coach` guidance to explain archive extension install or vendoring support, Archive Sweep timing, dry-run/apply separation, and cleanup safety boundaries. [FR-012, SC-005]
- [x] T030 Update `speckit-status` guidance to surface archive extension installation state, safe cleanup state, excluded current spec, and next-step guidance. [FR-012, FR-017, SC-005]
- [x] T031 Update required `speckit-pro` release surfaces when behavior changes: `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `README.md`, Codex skill files, Claude/Codex parity surfaces, and marketplace metadata when package metadata or source routing changes. [FR-012, SC-005]
- [x] T032 Run `racecraft-plugins-public` structural release validation, including `tests/run-all.sh` and Codex checks for plugin manifest, skills, marketplace metadata, and parity. [FR-012, SC-005]
- [x] T033 Publish or record the versioned archive-aware `speckit-pro` release/tag and its validation output. [FR-012, SC-005]

## Phase 7: Local Codex Plugin Refresh

**Goal**: Refresh this user's local Codex plugin install only after the versioned archive-aware plugin release exists.

**Independent test**: Local plugin manifest version and marketplace source path match the released archive-aware plugin, with conditional agent-template refresh and restart guidance.

- [x] T034 Refresh `~/.codex/plugins/speckit-pro` to the released archive-aware plugin version after T033 completes. [FR-013, SC-005]
- [x] T035 Compare `~/.codex/plugins/speckit-pro/.codex-plugin/plugin.json` version against the released archive-aware manifest version. [FR-013, SC-005]
- [x] T036 Verify `~/.agents/plugins/marketplace.json` points `speckit-pro` at the intended local plugin source path and update it only when package metadata or source routing changed. [FR-013, SC-005]
- [x] T037 Refresh bundled Codex agent templates only if the `speckit-pro` release changed those templates, then record the comparison. [FR-013, SC-005]
- [x] T038 Record conditional Codex restart guidance only when plugin or custom-agent reload is required. [FR-013, SC-005]

## Phase 8: Policy, Workflow, and Final Acceptance Evidence

**Goal**: Make future specs inherit the archive/evidence policy and close the FR/SC traceability loop.

- [x] T039 Update Mission Control constitution, workflow, or template policy surfaces in downstream implementation so future UI specs inherit archive/evidence retention discipline and PR-readiness gates. [FR-018, FR-019, SC-002, SC-006]
- [x] T040 Update workflow/template guidance so future specs know Archive Sweep runs at autopilot start, excludes the current target, and keeps unsafe checkouts dry-run-only or stopped. [FR-007, FR-008, FR-009, FR-017, SC-003, SC-006]
- [x] T041 Record reviewed-forward cleanup guidance showing completed spec folders may leave active `specs/**` only after archive success, merge/tree references, recovery commands, and safe-to-apply cleanup state are recorded. [FR-006, FR-010, FR-020, FR-021, SC-006]
- [x] T042 Record final archive extension adoption evidence and Mission Control install/vendor evidence. [FR-001, FR-002, FR-003, FR-011, SC-004]
- [x] T043 Record final plugin release and local Codex refresh evidence. [FR-012, FR-013, SC-005]
- [x] T044 Record final guard evidence for negative screenshot fixture and approved/provenance-only evidence path. [FR-004, FR-014, FR-016, SC-002, SC-007]
- [x] T045 Verify final acceptance evidence maps FR-001 through FR-021 to at least one completed task/evidence output. [FR-021, SC-007]
- [x] T046 Verify final acceptance evidence maps SC-001 through SC-007 to at least one completed task/evidence output. [FR-021, SC-007]
- [x] T047 Verify final implementation evidence shows no active `specs/**` deletion from the unsafe branch, no current SPEC-002A same-run archive, no history rewrite, and no post-merge CI mutation of `main`. [FR-007, FR-020, FR-021, SC-001, SC-003, SC-006]

## Dependencies

- Phase 1 completes before all downstream implementation work.
- T006 completes before T007, T008, or T009 select the adoption path.
- T007/T008/T009 unblock Mission Control integration tasks T011-T015.
- T011-T015 unblock archive dry-run evidence tasks T016-T020.
- T021-T027 can proceed after Phase 1 and can run in parallel with archive fork validation when file scopes do not overlap.
- T028-T033 require the archive behavior and Mission Control integration contract from T006-T020.
- T034-T038 require the versioned plugin release from T033.
- T039-T047 run after the implementation evidence from Phases 3-7 is available.

## Parallel Execution Examples

- T005 can run in parallel with T002-T004 because it is read-only pre-adoption evidence.
- T010 can run in parallel with T006-T009 once the recovery-command format is known.
- T021-T024 can run in parallel with T011-T015 because screenshot guard work does not depend on extension installation mechanics.
- T029 and T030 can run in parallel after T028 defines the autopilot Archive Sweep contract.
- T035-T038 can run in parallel after T034 refreshes the local plugin install.

## Requirement Coverage Matrix

| Requirement / Criterion | Covering Tasks |
|---|---|
| FR-001 | T006, T007, T008, T009, T042 |
| FR-002 | T006, T007, T008, T009, T042 |
| FR-003 | T005, T007, T008, T011, T012, T042 |
| FR-004 | T006, T017, T021, T025, T044 |
| FR-005 | T010, T016, T018 |
| FR-006 | T010, T015, T016, T041 |
| FR-007 | T006, T013, T019, T040, T047 |
| FR-008 | T013, T019, T028, T040 |
| FR-009 | T004, T006, T014, T019, T040 |
| FR-010 | T004, T006, T014, T016, T020, T041 |
| FR-011 | T005, T007, T008, T009, T011, T012, T042 |
| FR-012 | T028, T029, T030, T031, T032, T033, T043 |
| FR-013 | T002, T034, T035, T036, T037, T038, T043 |
| FR-014 | T017, T021, T025, T044 |
| FR-015 | T003, T010, T018 |
| FR-016 | T021, T022, T023, T024, T025, T044 |
| FR-017 | T001, T006, T019, T028, T030 |
| FR-018 | T026, T039 |
| FR-019 | T017, T027, T039 |
| FR-020 | T003, T014, T015, T041, T047 |
| FR-021 | T001, T004, T014, T016, T019, T020, T045, T046, T047 |
| SC-001 | T004, T006, T010, T014, T016, T018, T020, T047 |
| SC-002 | T017, T021, T025, T026, T027, T044 |
| SC-003 | T001, T004, T006, T013, T014, T019, T020, T028, T040, T047 |
| SC-004 | T005, T007, T008, T009, T011, T012, T042 |
| SC-005 | T028, T029, T030, T031, T032, T033, T034, T035, T036, T037, T038, T043 |
| SC-006 | T010, T015, T018, T039, T040, T041, T047 |
| SC-007 | T001, T021, T022, T023, T024, T025, T044, T045, T046 |
