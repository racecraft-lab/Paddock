# SPEC-002A Workflow - Spec Archive and Evidence Retention

**Spec ID**: SPEC-002A
**Spec Directory**: `specs/002a-spec-archive-evidence`
**Branch Short Name**: `spec-archive-evidence`
**Status**: Complete
**Priority**: P1
**Depends On**: SPEC-002
**Blocks**: SPEC-003 and later feature specs

## Purpose

Define and implement Paddock's policy for long-lived SpecKit artifacts, Argos/CI visual evidence provenance, PR evidence, and post-merge archival before SPEC-003 starts generating more spec evidence. Evaluate `stn1slv/spec-kit-archive` as the default archive extension and adopt it only after pinning and local/CI validation.

Candidate upstream extension: <https://github.com/stn1slv/spec-kit-archive>

## Workflow Source of Truth

This workflow file is the source of truth for the completed SPEC-002A autopilot run. Generated artifacts under `specs/002a-spec-archive-evidence/` have been reconciled and merged; later changes should treat those files and `implementation-evidence.md` as the completed evidence set.

Reference context:

- Roadmap source: `docs/ai/rc-factory-technical-roadmap.md`
- PRD source: `docs/rc-factory-v1-prd.md`
- Constitution: `.specify/memory/constitution.md`
- Existing SPEC-002 evidence source: `specs/002-product-line-switcher`

Generated artifact targets:

- Spec: `specs/002a-spec-archive-evidence/spec.md`
- Research: `specs/002a-spec-archive-evidence/research.md`
- Requirements checklist: `specs/002a-spec-archive-evidence/checklists/requirements.md`

## Target End State

- `speckit-pro` includes first-class archive extension support: install/discovery guidance, autopilot/coach/status awareness, and an Archive Sweep that runs at the start of autopilot for previously merged specs.
- Paddock vendors the archive extension from the pinned `racecraft-lab/spec-kit-archive` `v1.1.0` release and records that pin in repo documentation/configuration.
- The archive command is run at the correct lifecycle point: when `speckit-pro:autopilot` starts for the next spec, it first archives any prior specs whose PRs have already merged to `main`; the current target spec is excluded until a later run sees it as merged.
- Completed spec folders may be removed from active `specs/**` only after the Archive Sweep succeeds and the archive report records recovery commands.
- This user's local Codex marketplace and installed `speckit-pro` plugin are refreshed to the released archive-aware plugin, `speckit-pro-v1.9.0`.

## Completion Evidence

- Paddock PR #18 merged to `main` on 2026-04-28.
- `racecraft-lab/spec-kit-archive` PR #1 merged and `v1.1.0` was published: <https://github.com/racecraft-lab/spec-kit-archive/releases/tag/v1.1.0>.
- `racecraft-lab/racecraft-plugins-public` PR #20 and release-please PR #21 merged; stale branch-cut `speckit-pro-v1.9.0` release/tag was removed and recreated at main commit `75a5b727cd0868d647c9afa968e0edbe398c3f94`: <https://github.com/racecraft-lab/racecraft-plugins-public/releases/tag/speckit-pro-v1.9.0>.
- Local Codex `speckit-pro` install and cache report version `1.9.0`; marketplace wiring remains `./.codex/plugins/speckit-pro`.
- Paddock was deployed on the operator node from `main`; `mission-control.service` and `openclaw-gateway.service` were active and `/login` returned HTTP 200 after deployment verification.

## Implementation Brief

1. Validate `spec-kit-archive` against the current SpecKit tooling and decide whether to install, vendor, fork, or reject it.
2. Update the `racecraft-lab/spec-kit-archive` fork when adoption requires Racecraft-specific behavior for Argos/CI provenance, active-spec cleanup, dry-run/apply separation, or recovery-command reporting.
3. Add or document an archive command that can dry-run against `specs/002-product-line-switcher` and preserve traceability to PR, CI, commit, and Argos build/check evidence.
4. Add an evidence provenance convention for UI journey specs that records Argos builds, CI runs, commands, and metadata gate outcomes without copying generated screenshots into source control.
5. Define the active-spec cleanup model: completed spec folders may be removed from `main` only after archive succeeds and the report records Git-history recovery commands.
6. Add a CI and local guard that fails when generated screenshots are committed under spec evidence paths by default.
7. Update Paddock's SpecKit integration to install the adopted archive extension from the pinned Racecraft fork/tag/commit and document the autopilot Archive Sweep path.
8. Update `racecraft-lab/racecraft-plugins-public` `speckit-pro` so Codex autopilot/coach/status flows include the archive extension, recognize its installation state, start autopilot with an Archive Sweep for previously merged specs, and release a new plugin version.
9. Refresh this user's local Codex marketplace/plugin installation after the `speckit-pro` release: update `~/.codex/plugins/speckit-pro`, verify `~/.agents/plugins/marketplace.json`, rerun the bundled SpecKit Pro Codex agent install if agent templates changed, and restart Codex if needed.
10. Validate the guard, archive dry-run, Archive Sweep timing, Paddock extension installation, `speckit-pro` plugin behavior, and local user plugin installation before updating any PR.

## Required Autopilot Decisions

- **Argos baseline supersedes committed screenshot retention**: current `main` already uses Argos Playwright and Storybook metadata gates for SPEC-002 visual review. SPEC-002A should preserve Argos/CI evidence provenance, not archive generated screenshot content into the repo.
- **Active-spec cleanup model**: use Git history as the raw completed-spec archive. Active `specs/**` should hold in-progress or not-yet-archived specs. After archive succeeds, a reviewed cleanup may remove completed spec folders from `main` if the archive report records merge/tree references and concrete recovery commands such as `git show <merge-sha>:specs/<feature>/spec.md`.
- **Fork decision**: evaluate `racecraft-lab/spec-kit-archive` as the working fork. The fork currently needs Racecraft-specific support for Argos/CI provenance and gated active-spec cleanup before it should be treated as good enough for SPEC-002A. If adopted, pin the exact Racecraft fork tag or commit in Paddock docs/config.
- **Plugin release decision**: SPEC-002A owns the `speckit-pro` support path, including a `racecraft-lab/racecraft-plugins-public` update and versioned release when archive support changes plugin behavior.
- **Local install decision**: SPEC-002A is not complete until this user's local Codex plugin marketplace and installed `speckit-pro` copy are refreshed to the released archive-aware plugin, and the archive extension is installed or vendored in this Paddock checkout.
- **Invocation timing decision**: `speckit-pro:autopilot` must begin with an Archive Sweep before executing the requested spec. The sweep archives previously merged specs only; it excludes the current target spec. If the session is not on a safe base branch or the worktree is not clean, the sweep must run dry-run only or stop with clear instructions instead of mixing prior-spec cleanup into the current spec branch.

## Guardrails

- Do not delete or move existing source spec folders automatically.
- Allow completed spec folder removal only as an explicit reviewed cleanup after archive succeeds and recovery references are recorded.
- Do not archive the current target spec during the same autopilot run. It becomes eligible only after its PR has merged and a later autopilot run performs the Archive Sweep.
- Do not mix prior-spec archive cleanup into an unrelated feature branch unless the workflow explicitly allows it; prefer a clean base branch or dry-run/stop behavior.
- Do not rewrite git history.
- Do not depend on post-merge CI silently mutating `main`.
- Do not open or update a PR with known UI journey bugs, failing Playwright evidence, or screenshots that show user-visible defects.
- Treat generated screenshots as Argos/CI review artifacts that must not be committed by default.

## Acceptance Evidence

- Archive dry-run output for `specs/002-product-line-switcher`.
- Archive report includes merge commit or tree reference plus `git show` recovery commands for raw completed spec artifacts.
- `racecraft-lab/spec-kit-archive` fork commit/tag containing any Racecraft-specific archive behavior, or a documented rejection if no fork change is needed.
- `racecraft-lab/racecraft-plugins-public` `speckit-pro` release/version that documents archive extension support.
- Local Codex marketplace/plugin verification showing this user's installed `speckit-pro` points at the released archive-aware plugin.
- Paddock extension verification showing the archive extension is installed from the pinned Racecraft fork/tag/commit or vendored equivalent.
- Archive Sweep evidence showing `speckit-pro:autopilot` starts by archiving previously merged specs, excludes the current target spec, and uses dry-run/stop behavior when the branch/worktree is unsafe for cleanup.
- CI/local command proving the Argos-backed evidence path does not require committed generated screenshots.
- Negative fixture or documented test proving the guard fails for accidentally committed generated screenshots.
- Constitution diff showing archive/evidence retention discipline.
- Workflow/template diff showing future UI specs inherit the policy.

## Autopilot Notes

- This is a process/tooling spec, not a runtime feature flag spec.
- UI work is not expected unless documentation templates or PR body automation are UI-adjacent.
- Use the existing Docker-backed Playwright and Argos metadata gates as evidence input, but do not rerun full browser journeys unless the implementation changes their commands or artifacts.
- Autopilot must perform the Archive Sweep before Phase 0/prerequisites for the requested spec. The sweep handles previously merged specs only; the current spec remains unarchived until a later run sees it as merged.
- If adopting the upstream extension requires network access, provide a pinned/vendored CI-safe path or reject adoption for this spec with evidence.
