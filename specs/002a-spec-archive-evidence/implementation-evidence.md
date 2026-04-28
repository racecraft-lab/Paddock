# SPEC-002A Implementation Evidence

## Phase 7: Setup and Baseline Evidence (T001-T005)

Recorded: 2026-04-28

Scope: Evidence-only setup for SPEC-002A. No archive extension was installed, no external repository was fetched, no cleanup was applied, and no files outside `specs/002a-spec-archive-evidence/` were edited for this task group.

### T001 Baseline Evidence

Baseline artifacts were verified from the workflow/state files and SPEC-002A artifact set:

| Artifact | Lines | SHA-256 |
| --- | ---: | --- |
| `docs/ai/specs/SPEC-002A-workflow.md` | 95 | `8f5fb369bc644d9d8491775a1d5136c30a360f88a826a7acfd99130b62f1691e` |
| `docs/ai/specs/autopilot-state.json` | 95 | `5c800959d1f1c9111e9610e58fde449219d59fc519491d74918d825133beded1` |
| `specs/002a-spec-archive-evidence/spec.md` | 116 | `452e95109939059c93ff5b3f8650d02e6caf482ec55cefb5608eebb38cad38a8` |
| `specs/002a-spec-archive-evidence/plan.md` | 109 | `10c958a9e6a6a8f7414b08b85b7db08ffed36f9ed67e42a74199bc51bdb98d85` |
| `specs/002a-spec-archive-evidence/data-model.md` | 113 | `bc5b9e0cbec61927dea85c1888dd3459c151d2f05486ed859f2d9c7d76c4674f` |
| `specs/002a-spec-archive-evidence/quickstart.md` | 72 | `a856dc21ca3bf5b2d9ae2a7ecdb6c4020f9027401a60f5801b08e0b080c538ae` |
| `specs/002a-spec-archive-evidence/contracts/archive-sweep.md` | 77 | `3d05877afbc2773145d9657fa6b25f140e76adcd0e47af2f01f374e8a8fed057` |
| `specs/002a-spec-archive-evidence/checklists/archive-adoption.md` | 53 | `0944e189a2b16e8a5e500e41ba241302dd634ee4cb7c66ef86cc191edcfa059b` |
| `specs/002a-spec-archive-evidence/checklists/cleanup-recovery-safety.md` | 54 | `530fae25e940d097c1fd1ab69b0db77f1785d9be28966a5cb4f127113769aee7` |
| `specs/002a-spec-archive-evidence/checklists/evidence-policy.md` | 57 | `684aac5ddffb5c8151e827653f2a7f5eed996b6a610b88dd76b13c518f641eb6` |
| `specs/002a-spec-archive-evidence/checklists/plugin-local-release.md` | 55 | `3e7857667e0491384a08cb13eec10c2c4a55a509555fa51103d9009377ee30f9` |
| `specs/002a-spec-archive-evidence/checklists/requirements.md` | 30 | `242abea8956dec5d80cb5117f74f017df2ba32100300bb03177818edcf15f7fa` |
| `specs/002a-spec-archive-evidence/checklists/sweep-lifecycle.md` | 48 | `1bdb453fdfa6d60569f009f5c50a35ba8d4ddc0d35c7d464da405fc576b1001a` |

`docs/ai/specs/autopilot-state.json` records `archive_sweep.mode` as `dry-run-eligibility-only`, `safe_to_apply_cleanup` as `false`, `archive_extension_installed` as `false`, eligible previous specs as SPEC-001 and SPEC-002, and excluded current spec as `specs/002a-spec-archive-evidence`.

### T002 Package Manager Evidence

Targeted lockfile detection found `pnpm-lock.yaml` at the repository root. The downstream runner for Mission Control commands is therefore `pnpm`.

Evidence:

```text
$ ls -1 *lock*
pnpm-lock.yaml
```

Lockfile SHA-256: `7b48b5ed98b91c57e44cfa52aef0594eb5064c29ed24ecca8430c73f5e86a8ac`.

### T003 Remote Evidence

Git remotes were verified before any future fetch, push, or PR work. No fetch, push, or PR operation was run in this task group.

```text
$ git remote -v
origin   git@github.com:racecraft-lab/mission-control.git (fetch)
origin   git@github.com:racecraft-lab/mission-control.git (push)
upstream git@github.com:builderz-labs/mission-control.git (fetch)
upstream git@github.com:builderz-labs/mission-control.git (push)
```

Remote names available for later work: `origin`, `upstream`.

### T004 Branch and Worktree Safety Evidence

Active checkout state:

```text
$ git status --short --branch
## feat/openfeature-feature-flags
 M docs/ai/specs/SPEC-002A-workflow.md
 M docs/ai/specs/autopilot-state.json
 M specs/002a-spec-archive-evidence/spec.md
?? docs/_captures/
?? docs/_diffs/
?? racecraft-mission-control.code-workspace
?? specs/002a-spec-archive-evidence/checklists/archive-adoption.md
?? specs/002a-spec-archive-evidence/checklists/cleanup-recovery-safety.md
?? specs/002a-spec-archive-evidence/checklists/evidence-policy.md
?? specs/002a-spec-archive-evidence/checklists/plugin-local-release.md
?? specs/002a-spec-archive-evidence/checklists/sweep-lifecycle.md
?? specs/002a-spec-archive-evidence/contracts/
?? specs/002a-spec-archive-evidence/data-model.md
?? specs/002a-spec-archive-evidence/plan.md
?? specs/002a-spec-archive-evidence/quickstart.md
?? specs/002a-spec-archive-evidence/tasks.md
```

Worktree inventory:

```text
$ git worktree list
<repo>                                        c15a48e [feat/openfeature-feature-flags]
<repo>/.worktrees/001-foundation-migrations   f100cc4 [001-foundation-migrations]
<repo>/.worktrees/002-product-line-switcher   7e5f6e1 [002-product-line-switcher]
<repo>/.worktrees/002a-spec-archive-evidence  c908bf8 [002a-spec-archive-evidence]
```

Archive cleanup remains dry-run-only in this checkout because the active branch is `feat/openfeature-feature-flags`, the worktree is dirty, and autopilot state explicitly records `safe_to_apply_cleanup: false`. Cleanup-sensitive archive operations must not delete or move active `specs/**` content from this branch.

### T005 Pre-Adoption Extension State

Pre-adoption extension configuration was captured from `.specify/extensions.yml` and `.specify/extensions/.registry` without installing `archive`.

`.specify/extensions.yml` begins with:

```text
installed: []
```

`.specify/extensions/.registry` contains enabled local entries for:

| Extension | Version | Source | Manifest hash |
| --- | --- | --- | --- |
| `git` | `1.0.0` | `local` | `sha256:9731aa8143a72fbebfdb440f155038ab42642517c2b2bdbbf67c8fdbe076ed79` |
| `verify` | `1.0.3` | `local` | `sha256:74202b2c3bb17058b10787838cdf30c9ebe11e8793fc1de04bee75d5f111949a` |
| `doctor` | `1.0.0` | `local` | `sha256:45150c8ac10b6b002ebea9de34a203911951fe3a89cb8635a2a149082c02eeed` |
| `retrospective` | `1.0.0` | `local` | `sha256:43dbaba249c6e7322de1130446632197bbcb21c3c9f08fbe16654e86f6d5d922` |
| `cleanup` | `1.0.0` | `local` | `sha256:b15a5e3b4e5b43f867c093d962492f502b01503d0ec174611d0797854b017578` |
| `review` | `1.0.1` | `local` | `sha256:3f9eedfc8079662edfb8d1f9c07a161be4e66111ea57621061f1658e91710d83` |
| `verify-tasks` | `1.0.0` | `local` | `sha256:6428b6dccaa3daa8aa5d72a73001cd3f82b9908e8c67bedd84697dd7547c96e8` |

No `archive` extension entry is present in `.specify/extensions/.registry`, and `.specify/extensions.yml` records an empty `installed` list. File hashes captured for future comparison:

| File | SHA-256 |
| --- | --- |
| `.specify/extensions.yml` | `67ba75469a4e2e2b51dc5026c4d87a9ec72f4d676eb309e61bebde810282f272` |
| `.specify/extensions/.registry` | `552599913e44da2d985a57614df5c56948dd011771bd1a85779dd7e7b202adb2` |

## Phase 7: speckit-pro Release (T028-T033)

Recorded: 2026-04-28

Scope: Updated the archive-aware `speckit-pro` plugin release candidate in `racecraft-lab/racecraft-plugins-public` and opened the required PR for main-based release flow.

### T028 Autopilot Archive Sweep Startup

Release branch: `racecraft/speckit-pro-archive-sweep`

Release commit: `6a44e1a6d1a685c699941447c4713acca0f2820b`

`speckit-pro` autopilot now starts with an Archive Sweep startup step before Phase 0, records the archive state in `autopilot-state.json`, and keeps cleanup gated behind dry-run/apply safety checks.

Updated surfaces:

- `speckit-pro/codex-skills/speckit-autopilot/SKILL.md`
- `speckit-pro/skills/speckit-autopilot/SKILL.md`
- `speckit-pro/commands/autopilot.md`
- `speckit-pro/README.md`

### T029 Coach Archive Guidance

Updated coach guidance for archive extension install/vendor support, Archive Sweep timing, dry-run/apply separation, current-target exclusion, and cleanup safety boundaries.

Updated surfaces:

- `speckit-pro/codex-skills/speckit-coach/SKILL.md`
- `speckit-pro/skills/speckit-coach/SKILL.md`
- `speckit-pro/commands/coach.md`

### T030 Status Archive State

Updated status guidance to surface archive extension installation state, safe cleanup state, excluded current spec, and next-step guidance when previously merged specs are eligible for archival.

Updated surfaces:

- `speckit-pro/codex-skills/speckit-status/SKILL.md`
- `speckit-pro/commands/status.md`

### T031 Release Surfaces

Updated release metadata and parity surfaces for version `1.9.0`:

- `speckit-pro/.codex-plugin/plugin.json`
- `speckit-pro/.claude-plugin/plugin.json`
- `speckit-pro/CHANGELOG.md`
- `speckit-pro/README.md`
- Codex and Claude skill/command files listed above
- Codex skill sidecars under `speckit-pro/codex-skills/*/agents/openai.yaml`

### T032 Structural Release Validation

Validation result:

```text
$ bash speckit-pro/tests/run-all.sh
speckit-pro test suite: 830/830 passed
  L1: 203/203
  L1: 336/336
  L4: 157/157
  L5: 134/134
```

The Codex structural validation initially caught a Codex-facing slash-command wording drift; the release branch was corrected before the full suite passed.

### T033 Versioned Release

Release candidate and corrective PR:

- corrective PR: `https://github.com/racecraft-lab/racecraft-plugins-public/pull/20`
- provisional branch-cut tag: `speckit-pro-v1.9.0`
- tag object: `e053ade70a1f69edf6ded0b5632efeffdef868f2`
- target commit: `6a44e1a6d1a685c699941447c4713acca0f2820b`
- provisional branch-cut release: `https://github.com/racecraft-lab/racecraft-plugins-public/releases/tag/speckit-pro-v1.9.0`
- published at: `2026-04-28T13:33:41Z`

Release-process correction: `speckit-pro-v1.9.0` was created from branch
`racecraft/speckit-pro-archive-sweep` before PR #20 merged to `main`. Treat it
as invalid for the official release process. The correct next step is to merge
PR #20 to `main` and let the main-based release-please flow produce the
official `speckit-pro` release.

Relevant verification:

```text
$ git push origin racecraft/speckit-pro-archive-sweep
$ git push origin speckit-pro-v1.9.0
$ gh release create speckit-pro-v1.9.0 --repo racecraft-lab/racecraft-plugins-public --target 6a44e1a6d1a685c699941447c4713acca0f2820b --title "speckit-pro: v1.9.0" --notes "..."
$ gh release view speckit-pro-v1.9.0 --repo racecraft-lab/racecraft-plugins-public --json tagName,url,publishedAt,name,targetCommitish
$ gh api repos/racecraft-lab/racecraft-plugins-public/git/ref/tags/speckit-pro-v1.9.0
$ gh api repos/racecraft-lab/racecraft-plugins-public/git/tags/e053ade70a1f69edf6ded0b5632efeffdef868f2
```

## Phase 7: Local Codex Plugin Refresh (T034-T038)

Recorded: 2026-04-28

Scope: Refreshed the user's Codex-side `speckit-pro` installation to the released archive-aware version and verified marketplace/source wiring.

### T034 Local Plugin Refresh

Updated local plugin install:

- source: `/tmp/racecraft-plugins-public.8f1rVV/repo/speckit-pro`
- destination: `<local-home>/.codex/plugins/speckit-pro`
- cache destination: `<local-home>/.codex/plugins/cache/racecraft-plugins-public/speckit-pro/1.9.0`

Both destinations were refreshed from release commit `6a44e1a6d1a685c699941447c4713acca0f2820b`.

### T035 Manifest Version Comparison

Verified local and cache manifests report version `1.9.0`, matching the released `speckit-pro-v1.9.0` manifest.

### T036 Marketplace Wiring

`<local-home>/.agents/plugins/marketplace.json` remains valid JSON and already points `speckit-pro` at the intended local source path:

```json
{
  "source": "local",
  "path": "./.codex/plugins/speckit-pro"
}
```

The path resolves to `<local-home>/.codex/plugins/speckit-pro`, so no marketplace edit was required.

### T037 Codex Agent Template Refresh Decision

Bundled Codex agent templates did not change between the installed user-level templates and the `1.9.0` release:

```text
$ diff -qr <local-home>/.codex/plugins/speckit-pro/codex-agents /tmp/racecraft-plugins-public.8f1rVV/repo/speckit-pro/codex-agents
$ diff -qr <local-home>/.codex/agents <local-home>/.codex/plugins/speckit-pro/codex-agents
```

Both comparisons produced no output, so running the agent install script was not required for this release.

### T038 Restart Guidance

Codex should be restarted before relying on the newly installed `1.9.0` skill text in a fresh session because plugin files and the plugin cache changed. A custom-agent reload is not required for this release because agent templates are unchanged and already match `~/.codex/agents`.

Local install validation:

```text
$ bash tests/layer1-structural/validate-codex-plugin.sh
validate-codex-plugin: 25/25 passed

$ bash tests/layer1-structural/validate-codex-skills.sh
validate-codex-skills: 80/80 passed

$ bash tests/layer1-structural/validate-codex-agents.sh
validate-codex-agents: 146/146 passed

$ bash tests/layer4-scripts/test-install-codex-agents.sh
test-install-codex-agents: 32/32 passed
```

Note: `validate-codex-marketplace.sh` and `validate-pr-checks-sentinel.sh` are repository-root structural tests and are not valid when executed directly from the user-level plugin install path; the release repository suite already passed them during T032.

Relevant verification:

```text
$ cat <local-home>/.codex/plugins/speckit-pro/.codex-plugin/plugin.json
$ cat <local-home>/.codex/plugins/cache/racecraft-plugins-public/speckit-pro/1.9.0/.codex-plugin/plugin.json
$ python3 -m json.tool <local-home>/.agents/plugins/marketplace.json
$ python3 -c "import json, pathlib; data=json.load(open('<local-home>/.agents/plugins/marketplace.json')); p=data['plugins'][0]['source']['path']; target=(pathlib.Path('<local-home>')/p).resolve(); print(data['plugins'][0]['name'], data['plugins'][0]['source']['source'], p, target, target.is_dir())"
$ rg -n "Archive Sweep|archive extension|speckit\\.archive|previously merged|safe cleanup" <local-home>/.codex/plugins/speckit-pro/codex-skills/speckit-autopilot/SKILL.md <local-home>/.codex/plugins/speckit-pro/codex-skills/speckit-coach/SKILL.md <local-home>/.codex/plugins/speckit-pro/codex-skills/speckit-status/SKILL.md
```

## Phase 7: Policy, Workflow, and Final Acceptance Evidence (T039-T047)

Recorded: 2026-04-28

Scope: Closed the policy inheritance and final traceability loop for SPEC-002A.

### T039 Future Policy Surfaces

Updated durable policy surfaces:

- `.specify/memory/constitution.md`: version `1.4.0`, new Principle XV, archive sweep startup convention, and PR compliance checkpoint for spec/process evidence.
- `.specify/templates/spec-template.md`: archive/evidence policy prompt for specs that touch `specs/**`, `.specify/**`, PR evidence, UI screenshots, or archival behavior.
- `.specify/templates/plan-template.md`: Archive Sweep startup, current-target exclusion, branch/worktree safety, provenance fields, and screenshot guard plan requirements.
- `.specify/templates/tasks-template.md`: task-generation guidance for Archive Sweep evidence, cleanup safety, recovery commands, and screenshot/evidence guard verification.
- `.github/pull_request_template.md`: evidence readiness blockers for UI/spec evidence PRs.
- `docs/spec-evidence-policy.md`: repository policy for Argos/CI provenance, manifest-backed screenshot exceptions, and PR readiness blockers.

### T040 Archive Sweep Timing Guidance

Future workflow/template guidance now states that Archive Sweep discovery runs before Phase 0, considers previously merged specs only, excludes the current target spec, and uses dry-run or stop behavior when branch/worktree safety is not satisfied.

Updated surfaces:

- `.specify/memory/constitution.md`
- `.specify/templates/spec-template.md`
- `.specify/templates/plan-template.md`
- `.specify/templates/tasks-template.md`
- `docs/ai/rc-factory-technical-roadmap.md`
- `docs/rc-factory-v1-prd.md`
- `docs/ai/specs/SPEC-002A-workflow.md`
- refreshed `speckit-pro` autopilot/coach/status release surfaces recorded in T028-T033

### T041 Reviewed-Forward Cleanup Guidance

Cleanup guidance is now explicit:

- completed spec folders may leave active `specs/**` only after archive success
- the archive report must record merge/tree references and recovery commands
- unsafe branches or dirty worktrees stay dry-run-only or stop
- cleanup is a reviewed forward-history change
- history rewrite and silent post-merge CI mutation of `main` are forbidden

Evidence surfaces:

- `.specify/memory/constitution.md`
- `docs/spec-evidence-policy.md`
- `specs/002a-spec-archive-evidence/archive-sweep-dry-run.md`
- `.specify/extensions/archive/commands/archive.md`

### T042 Archive Extension Adoption Evidence

Final adoption state:

- source repo: `https://github.com/racecraft-lab/spec-kit-archive`
- source PR: `https://github.com/racecraft-lab/spec-kit-archive/pull/1`
- provisional source tag: `v1.1.0`
- source commit: `08ee0e919a72ccb254758a2b6f51d58196490ea7`
- tag object: `1e87928c30293aef4f75c1c3fbc46a8c43540d7a`
- vendored install path: `.specify/extensions/archive`
- pin record: `.specify/extensions/archive/RACECRAFT-PIN.md`
- enabled registry: `.specify/extensions/.registry`
- installed list: `.specify/extensions.yml`

Release-process correction: `v1.1.0` was created before PR #1 merged to
`main`. Treat that tag as provisional branch evidence, not the official
main-based archive extension release. After PR #1 merges, cut or recreate the
official archive extension tag from `main`.

### T043 Plugin Release and Local Codex Refresh Evidence

Final plugin state:

- `racecraft-lab/racecraft-plugins-public` branch: `racecraft/speckit-pro-archive-sweep`
- corrective PR: `https://github.com/racecraft-lab/racecraft-plugins-public/pull/20`
- release commit: `6a44e1a6d1a685c699941447c4713acca0f2820b`
- provisional tag: `speckit-pro-v1.9.0`
- tag object: `e053ade70a1f69edf6ded0b5632efeffdef868f2`
- provisional GitHub release: `https://github.com/racecraft-lab/racecraft-plugins-public/releases/tag/speckit-pro-v1.9.0`
- release validation: `speckit-pro test suite: 830/830 passed`
- local plugin install: `<local-home>/.codex/plugins/speckit-pro` reports manifest version `1.9.0`
- local cache: `<local-home>/.codex/plugins/cache/racecraft-plugins-public/speckit-pro/1.9.0` reports manifest version `1.9.0`
- local marketplace: `<local-home>/.agents/plugins/marketplace.json` points to `./.codex/plugins/speckit-pro`

Official plugin release remains pending until PR #20 merges and the
release-please/main-based release flow cuts the replacement official release.

### T044 Screenshot Guard and Provenance-Only Evidence

Final guard state:

- `pnpm test:evidence:screenshots` passes with zero committed spec screenshots.
- `pnpm test:evidence:screenshots:negative` fails the synthetic fixture as expected and names `specs/negative-fixture/screenshots/unmanifested.png`.
- `archive-sweep-dry-run.md` records Argos Storybook and Playwright build URLs plus CI artifact manifest entries instead of committed screenshot payloads.
- `.github/workflows/quality-gate.yml` runs the guard in CI.
- `.github/pull_request_template.md` and `docs/spec-evidence-policy.md` define PR readiness blockers.

### T045 FR Traceability Matrix

| FR | Completed evidence output |
|---|---|
| FR-001 | T006-T009, T042 archive fork validation/adoption evidence |
| FR-002 | T006-T007, T011-T012, T042 pinned fork/tag/commit and license-preserving vendored install |
| FR-003 | T005, T011-T015, T042 Mission Control install/vendor evidence |
| FR-004 | T017, T021, T025, T044 Argos/CI provenance path and guard policy |
| FR-005 | T010, T016, T018 recovery-command evidence |
| FR-006 | T010, T015, T016, T041 reviewed cleanup guidance |
| FR-007 | T006, T013, T019, T040, T047 current-target exclusion and cleanup safety |
| FR-008 | T013, T019, T028, T040 Archive Sweep startup behavior |
| FR-009 | T004, T006, T014, T019, T040 unsafe branch dry-run/stop behavior |
| FR-010 | T004, T006, T014, T016, T020, T041 dry-run evidence boundary |
| FR-011 | T005, T007-T009, T011-T012, T042 adoption decision and install evidence |
| FR-012 | T028-T033, T043 archive-aware `speckit-pro` release candidate and PR #20 evidence |
| FR-013 | T034-T038, T043 local Codex marketplace/plugin refresh |
| FR-014 | T017, T021, T025, T044 Argos/CI durable provenance |
| FR-015 | T003, T010, T018 merge/tree recovery references |
| FR-016 | T021-T024, T044 local/CI screenshot guard and negative fixture |
| FR-017 | T001, T006, T019, T028, T030, T040 eligible/excluded spec output |
| FR-018 | T026, T039 PR readiness/evidence policy |
| FR-019 | T017, T027, T039 Argos metadata and no-empty-build policy inheritance |
| FR-020 | T003, T014, T015, T041, T047 no rewrite/no silent post-merge mutation |
| FR-021 | T001, T004, T014, T016, T019, T020, T045-T047 final traceability and safety evidence |

### T046 SC Traceability Matrix

| SC | Completed evidence output |
|---|---|
| SC-001 | T004, T006, T010, T014, T016, T018, T020, T047 dry-run without deletion and recovery commands |
| SC-002 | T017, T021, T025-T027, T039, T044 Argos/CI provenance and PR readiness policy |
| SC-003 | T001, T004, T006, T013-T014, T019-T020, T028, T040, T047 Archive Sweep lifecycle and unsafe-branch behavior |
| SC-004 | T005, T007-T009, T011-T012, T042 pinned Racecraft fork install/vendor evidence |
| SC-005 | T028-T038, T043 plugin release candidate, PR #20 evidence, local plugin refresh, marketplace verification, and structural tests |
| SC-006 | T010, T015, T018, T039-T041, T047 future cleanup and recovery safety policy |
| SC-007 | T001, T021-T025, T044-T046 screenshot guard and final traceability evidence |

### T047 Final Cleanup Safety Evidence

No active spec cleanup was applied on this unsafe branch:

- `specs/001-foundation-migrations` remains present.
- `specs/002-product-line-switcher` remains present.
- `specs/002a-spec-archive-evidence` remains present and excluded as the current target.
- No history rewrite was performed.
- No post-merge CI mutation of `main` was introduced.
- `archive-sweep-dry-run.md` records `cleanupMode: dry-run`, `dryRunProvenanceOnly: true`, and `safeToApplyCleanup: false`.

Relevant verification:

```text
$ rg -n "Archive Sweep|current target|previously merged|safe reviewed|generated screenshots|manifest-backed|safe-to-apply|recovery commands" .specify/memory/constitution.md .specify/templates/spec-template.md .specify/templates/plan-template.md .specify/templates/tasks-template.md docs/ai/rc-factory-technical-roadmap.md docs/rc-factory-v1-prd.md docs/spec-evidence-policy.md .github/pull_request_template.md
$ rg --files specs/001-foundation-migrations specs/002-product-line-switcher specs/002a-spec-archive-evidence
$ git status --short
$ git diff --name-status -- .specify/memory/constitution.md .specify/templates/spec-template.md .specify/templates/plan-template.md .specify/templates/tasks-template.md docs/ai/rc-factory-technical-roadmap.md docs/rc-factory-v1-prd.md docs/spec-evidence-policy.md .github/pull_request_template.md .github/workflows/quality-gate.yml scripts/verify-spec-evidence-screenshots.mjs package.json specs/002a-spec-archive-evidence/implementation-evidence.md specs/002a-spec-archive-evidence/tasks.md docs/ai/specs/autopilot-state.json
```

## Post-Autopilot Checks

Recorded: 2026-04-28

### Extension Command Availability

The post-implementation extension registry is enabled for `doctor`,
`verify-tasks`, `verify`, `review`, `cleanup`, and `retrospective`, but these
extension commands are registered as repo-local extension or Claude command
files in this checkout and are not exposed as Codex-invocable shell commands in
this session.

Completed post checks:

- `Post: Doctor extension check`: explicit command skip; registry wiring
  confirmed by subagent.
- `Post: Verify-tasks extension check`: explicit command skip; subagent
  performed a read-only phantom-completion check and found no obvious
  phantom-completion signal.
- `Post: Verify extension check`: explicit command skip; subagent performed
  read-only artifact verification and found no artifact-level blocker.
- `Post: Review extension check`: explicit command skip; subagent performed
  read-only blocker review and found no validated blocker.
- `Post: Cleanup extension check`: explicit command skip; `speckit.cleanup.run`
  and `speckit.cleanup` are not shell-executable in this session. A constrained
  cleanup scan found only benign matches: template placeholders, documented
  localhost development commands, and intentional CLI status output in
  `scripts/verify-spec-evidence-screenshots.mjs`.
- `Post: Retrospective extension check`: explicit command skip; command file
  inspected and equivalent report written to
  `specs/002a-spec-archive-evidence/retrospective.md`.

### File Descriptor Recovery

The resumed run verified that process spawning worked again at
`2026-04-28T14:06:43Z` with a non-login shell. Subsequent post checks were kept
serial and low-fanout to avoid reintroducing OS error 24.

### Retrospective Summary

`specs/002a-spec-archive-evidence/retrospective.md` records 100% task
completion, 100% spec adherence, no critical findings, one minor finding about
Codex extension command exposure, and no proposed `spec.md` changes.

### Final Command Verification

Final targeted verification passed:

```text
$ bash <local-home>/.codex/plugins/speckit-pro/skills/speckit-autopilot/scripts/validate-gate.sh G7 specs/002a-spec-archive-evidence
{"gate":"G7","pass":true,"reason":"All 47 tasks complete","markers":0,"total":47,"done":47}

$ bash <local-home>/.codex/plugins/speckit-pro/skills/speckit-autopilot/scripts/count-markers.sh all specs/002a-spec-archive-evidence
{"gaps":0,"clarifications":0,"critical":0,"high":0,"medium":0,"low":0}

$ node --check scripts/verify-spec-evidence-screenshots.mjs
$ pnpm exec eslint scripts/verify-spec-evidence-screenshots.mjs
$ pnpm test:evidence:screenshots
[spec-evidence-screenshots] checked 0 committed spec screenshot(s); policy passed

$ pnpm test:evidence:screenshots:negative
[spec-evidence-screenshots] synthetic negative fixture failed as expected: specs/negative-fixture/screenshots/unmanifested.png

$ git diff --check
```

Full `pnpm test:all` was not rerun because SPEC-002A is process/tooling scoped
and the changed executable surface is covered by the targeted screenshot guard,
syntax, lint, and SpecKit G7 checks above.

### Final Local Plugin Verification

Final local Codex plugin state:

```text
$ python3 -c "import json; print(json.load(open('<local-home>/.codex/plugins/speckit-pro/.codex-plugin/plugin.json'))['version'])"
1.9.0

$ python3 -c "import json, pathlib; data=json.load(open('<local-home>/.agents/plugins/marketplace.json')); p=data['plugins'][0]['source']['path']; target=(pathlib.Path('<local-home>')/p).resolve(); print(data['plugins'][0]['name'], data['plugins'][0]['source']['source'], p, target, target.is_dir())"
speckit-pro local ./.codex/plugins/speckit-pro <local-home>/.codex/plugins/speckit-pro True
```

### Final Diff and PR Readiness

`git status --short --branch` shows SPEC-002A changes plus pre-existing
untracked local artifacts:

- `docs/_captures/`
- `docs/_diffs/`
- `racecraft-mission-control.code-workspace`

Those three paths are not part of SPEC-002A and were not modified by this run.
They should be left unstaged or removed separately before any SPEC-002A commit
or PR.

### Verification Commands Run

```text
sed -n '1,240p' specs/002a-spec-archive-evidence/tasks.md
sed -n '1,220p' docs/ai/specs/SPEC-002A-workflow.md
sed -n '1,220p' docs/ai/specs/autopilot-state.json
rg --files specs/002a-spec-archive-evidence .specify | sort
ls -1 *lock*
git remote -v
git status --short --branch
git worktree list
ls -la .specify/extensions .specify/extensions/.registry
sed -n '1,220p' .specify/extensions.yml
sed -n '1,240p' .specify/extensions/.registry
wc -l docs/ai/specs/SPEC-002A-workflow.md docs/ai/specs/autopilot-state.json specs/002a-spec-archive-evidence/spec.md specs/002a-spec-archive-evidence/plan.md specs/002a-spec-archive-evidence/data-model.md specs/002a-spec-archive-evidence/quickstart.md specs/002a-spec-archive-evidence/contracts/archive-sweep.md specs/002a-spec-archive-evidence/checklists/*.md
shasum -a 256 docs/ai/specs/SPEC-002A-workflow.md docs/ai/specs/autopilot-state.json specs/002a-spec-archive-evidence/spec.md specs/002a-spec-archive-evidence/plan.md specs/002a-spec-archive-evidence/data-model.md specs/002a-spec-archive-evidence/quickstart.md specs/002a-spec-archive-evidence/contracts/archive-sweep.md specs/002a-spec-archive-evidence/checklists/*.md .specify/extensions.yml .specify/extensions/.registry pnpm-lock.yaml
find specs/002a-spec-archive-evidence -maxdepth 3 -type f | sort
rg -n '^#|archive_sweep|safe_to_apply_cleanup|mode|excluded_current_spec|eligible_previous_specs|installed:|archive|spec-kit-archive' docs/ai/specs/SPEC-002A-workflow.md docs/ai/specs/autopilot-state.json specs/002a-spec-archive-evidence/spec.md specs/002a-spec-archive-evidence/plan.md specs/002a-spec-archive-evidence/data-model.md specs/002a-spec-archive-evidence/quickstart.md specs/002a-spec-archive-evidence/contracts/archive-sweep.md specs/002a-spec-archive-evidence/checklists/*.md .specify/extensions.yml .specify/extensions/.registry
test -f specs/002a-spec-archive-evidence/implementation-evidence.md
rg -c '^- \[x\] T00[1-5]' specs/002a-spec-archive-evidence/tasks.md
rg -n 'Phase 7: Setup|pnpm-lock|git remote|feat/openfeature|installed: \[\]|No `archive`' specs/002a-spec-archive-evidence/implementation-evidence.md
```

## Phase 7: Archive Fork Validation and Adoption Decision (T006-T010)

Recorded: 2026-04-28

Scope: Validation and adoption of `racecraft-lab/spec-kit-archive` for SPEC-002A Archive Sweep support. Initial inspection used read-only `gh repo view` and `gh api` calls. After the as-is fork failed validation, T007 was completed in a temporary checkout under `/tmp/spec-kit-archive.EPlmsB/repo`; the fork branch and tag were pushed, and Mission Control evidence was updated without changing Mission Control files outside `specs/002a-spec-archive-evidence/`.

### T006 Fork Validation Evidence

Candidate repository state:

| Field | Evidence |
| --- | --- |
| Repository | `https://github.com/racecraft-lab/spec-kit-archive` |
| Default branch | `main` |
| Current main commit | `9b6c64e357a761c0c0d59754b4049b4a9b7a0e7d` |
| Commit date | `2026-03-14T13:15:19Z` |
| Latest release | None |
| License | MIT |
| Main tree files inspected | `README.md`, `CHANGELOG.md`, `extension.yml`, `commands/archive.md` |
| `extension.yml` Git blob SHA | `9b7349be41976f8bc369383c9abb3b5bacd72d4c` |
| `commands/archive.md` Git blob SHA | `6f219d4e3f00f3d293b9ce0a013b3fa7829e2527` |

Manifest evidence from `extension.yml`:

- Extension id is `archive`.
- Extension version is `1.0.0`.
- Manifest repository field is `https://github.com/stn1slv/spec-kit-archive`, not the Racecraft fork URL.
- Provided command is `speckit.archive.run` from `commands/archive.md`.
- The command description is post-merge archival of a feature specification into main project memory.

Command and README evidence:

- `README.md` describes the command as a post-merge archival tool that consolidates finalized feature specifications, plans, and technical debt into `.specify/memory/`.
- `README.md` lists features for lifecycle separation, SpecKit prerequisite-path discovery, `[Source: specs/###-feature-name]` traceability tags, and absolute-path reporting.
- `README.md` installation points to `https://github.com/stn1slv/spec-kit-archive/archive/refs/tags/v1.0.0.zip`, not `racecraft-lab/spec-kit-archive`.
- `CHANGELOG.md` records only `1.0.0` from `2026-03-14`.
- `commands/archive.md` validates `spec.md` and `plan.md`, inventories optional artifacts, bootstraps `.specify/memory`, merges feature content into memory files, may update feature status from `Draft` to `Completed`, and emits an archival report.
- `commands/archive.md` has scope modifiers for memory updates only: `--spec-only`, `--plan-only`, `--changelog-only`, and `--agent-only`.

SPEC-002A requirement validation:

| SPEC-002A need | Candidate evidence | Verdict |
| --- | --- | --- |
| Argos/CI provenance | No inspected README, changelog, manifest, or command text requires Argos URLs, CI run URLs, metadata gate outcomes, command provenance, or optional artifact manifests. | Fails |
| Dry-run/apply separation | No `--dry-run`, `--apply`, `cleanupMode`, `dryRunProvenanceOnly`, or explicit no-write preview mode appears in the command contract. The prompt proceeds to "Step 5: Archival (Apply Edits)" after analysis. | Fails |
| Gated active-spec cleanup | The command says not to delete input feature spec files, but it does not gate later active `specs/**` cleanup on archive success, merge/tree references, recovery commands, and `safeToApplyCleanup=true`. | Fails |
| Recovery-command reporting | The archival report template lists changed files, status, compliance, conflicts, and scoping, but does not require `git show <merge-sha>:specs/<feature>/spec.md` or equivalent recovery commands. | Fails |
| Current-target exclusion | The command accepts a single feature directory and does not define Archive Sweep behavior, eligible previous specs, or excluded current target spec output. | Fails |
| Unsafe-checkout dry-run/stop behavior | The command does not inspect branch safety or dirty worktree state and does not stop or remain dry-run-only on unsafe branches. | Fails |
| Racecraft fork pin readiness | No latest release exists, `extension.yml` still names the upstream repository, and no Racecraft-specific tag/commit records the needed behavior. | Fails |

Validation verdict: `racecraft-lab/spec-kit-archive` at `main` commit `9b6c64e357a761c0c0d59754b4049b4a9b7a0e7d` cannot satisfy SPEC-002A as-is. It is useful prior art for post-merge memory consolidation, but it is not the Archive Sweep/provenance/cleanup-safety implementation required by SPEC-002A.

### T007 Adoption Change Requirement

T007 is complete. The required Racecraft fork changes were implemented and pushed to `racecraft-lab/spec-kit-archive`.

Fork update evidence:

| Field | Evidence |
| --- | --- |
| Temporary checkout | `/tmp/spec-kit-archive.EPlmsB/repo` |
| Branch pushed | `racecraft/archive-sweep-provenance` |
| Commit | `08ee0e919a72ccb254758a2b6f51d58196490ea7` |
| Commit message | `feat: add provenance-safe archive sweep` |
| Corrective PR | `https://github.com/racecraft-lab/spec-kit-archive/pull/1` |
| Provisional tag pushed | `v1.1.0` |
| Tag object | `1e87928c30293aef4f75c1c3fbc46a8c43540d7a` |
| Tag target | `08ee0e919a72ccb254758a2b6f51d58196490ea7` |
| Install URL | `https://github.com/racecraft-lab/spec-kit-archive/archive/refs/tags/v1.1.0.zip` |

Files changed in the fork:

- `commands/archive.md`: expanded the command contract from post-merge memory consolidation only to Archive Sweep, dry-run/apply separation, current-target exclusion, provenance reporting, recovery commands, and gated cleanup.
- `extension.yml`: bumped version to `1.1.0`, changed the repository field to `https://github.com/racecraft-lab/spec-kit-archive`, and updated command description/tags.
- `README.md`: documented Racecraft install URL, sweep usage, cleanup safety, provenance output, and generated screenshot policy.
- `CHANGELOG.md`: added `1.1.0` release notes for the Racecraft Archive Sweep behavior.

Verification evidence:

```text
$ git diff --check
$ rg -n 'Archive Sweep|current-target|safeToApplyCleanup|dryRunProvenanceOnly|git show <merge-sha>|Argos|metadata-gate|artifact-manifest|apply-cleanup|post-merge CI|rewrite git history' commands/archive.md README.md CHANGELOG.md extension.yml
$ ruby -e 'require "yaml"; data = YAML.load_file("extension.yml"); abort("bad version") unless data.dig("extension", "version") == "1.1.0"; abort("bad repo") unless data.dig("extension", "repository") == "https://github.com/racecraft-lab/spec-kit-archive"; puts "extension.yml OK"'
$ git rev-parse HEAD
08ee0e919a72ccb254758a2b6f51d58196490ea7
$ gh api repos/racecraft-lab/spec-kit-archive/git/tags/1e87928c30293aef4f75c1c3fbc46a8c43540d7a --jq '.object.sha + " " + .tag + " " + .message'
08ee0e919a72ccb254758a2b6f51d58196490ea7 v1.1.0 spec-kit-archive v1.1.0
```

External fork changes completed:

1. `extension.yml` now points to `https://github.com/racecraft-lab/spec-kit-archive`, version `1.1.0`, with PR #1, a provisional pushed Racecraft tag, and immutable commit for Mission Control to pin pending the main-based archive release.
2. `commands/archive.md` defines explicit `--dry-run`, `--apply`, `--sweep`, and `--apply-cleanup` modes.
3. Branch/worktree safety gates require dry-run/provenance-only behavior unless cleanup is explicitly safe.
4. Archive Sweep semantics identify previously merged specs and report the excluded current target.
5. Report fields now include source spec path, PR URL, merge commit, tree reference, CI run URL, Argos build/review URL, metadata gate outcomes, artifact manifest, screenshot retention, cleanup mode, `dryRunProvenanceOnly`, and `safeToApplyCleanup`.
6. Recovery commands include `git show <merge-sha>:specs/<feature>/spec.md` and sibling commands.
7. Active `specs/**` cleanup is gated behind archive success, merge/tree references, recovery commands, clean worktree, safe base branch, explicit `--apply-cleanup`, no history rewrite, and no post-merge CI mutation.
8. Generated screenshots are treated as review artifacts with Argos/CI provenance and manifest references, not default durable payloads.
9. README examples document unsafe-safe dry-run sweep and current-target exclusion usage.

### T008 Adoption Without Changes

T008 is not applicable because the fork was not adopted without changes. The as-is candidate was rejected, and the adopted source is the Racecraft-updated commit from T007, currently exposed through provisional branch tag `v1.1.0` pending PR #1 merge and main-based retag.

### T009 Rejection and Fallback Behavior

Adoption decision: reject `racecraft-lab/spec-kit-archive` unchanged for SPEC-002A.

Fallback behavior recorded during validation, now superseded by the T007 `v1.1.0` fork update:

- Mission Control must not install or refresh the original `1.0.0` archive extension as the active SPEC-002A archive implementation.
- Mission Control integration tasks should install or vendor the corrected `racecraft-lab/spec-kit-archive` commit `08ee0e919a72ccb254758a2b6f51d58196490ea7` or the official main-based tag created after PR #1 merges.
- Any fallback archive report must be provenance-first and cleanup-safe: it can record readiness and recovery evidence in dry-run mode, but it must not delete or move active `specs/**` content in this unsafe checkout.
- The fallback must record the same reproducibility fields required of an adopted extension: source URL, pinned commit/tag or vendored file hashes, manifest/source hashes, license/version evidence, and local modifications.

### T010 Merge/Tree Reference and Recovery-Command Evidence

SPEC-002A requires archive reports to preserve enough raw-git recovery data to reconstruct removed active spec files after later reviewed cleanup. A compliant archive report must include both merge/tree references and concrete commands, for example:

```text
sourceSpecPath: specs/<feature>/spec.md
mergeCommit: <merge-sha>
treeReference: <merge-sha>:specs/<feature>
recoveryCommands:
  - git show <merge-sha>:specs/<feature>/spec.md
  - git show <merge-sha>:specs/<feature>/plan.md
  - git show <merge-sha>:specs/<feature>/tasks.md
cleanupMode: dry-run
dryRunProvenanceOnly: true
safeToApplyCleanup: false
```

Cleanup implication: an active spec folder under `specs/**` must remain in source control until a later apply-mode run on a clean safe branch records archive success, merge/tree references, concrete recovery commands, and `safeToApplyCleanup=true`. A dry-run report that lacks those fields is evidence only and is not permission to remove the source folder.

## Phase 7: Mission Control SpecKit Integration (T011-T015)

Recorded: 2026-04-28

Scope: Installed the archive extension into the Mission Control SpecKit integration by vendoring the pinned Racecraft fork tag. No active `specs/**` directory was deleted or moved, no git history was rewritten, and no post-merge CI mutation path was introduced.

### T011 Mission Control Extension Configuration

Mission Control now vendors the Racecraft archive extension from the pinned fork tag:

| Field | Evidence |
| --- | --- |
| Extension directory | `.specify/extensions/archive/` |
| Extension manifest | `.specify/extensions/archive/extension.yml` |
| Command file | `.specify/extensions/archive/commands/archive.md` |
| Source repository | `https://github.com/racecraft-lab/spec-kit-archive` |
| Source ref | `refs/tags/v1.1.0` |
| Source commit | `08ee0e919a72ccb254758a2b6f51d58196490ea7` |
| Install archive URL | `https://github.com/racecraft-lab/spec-kit-archive/archive/refs/tags/v1.1.0.zip` |

`.specify/extensions.yml` now includes `archive` in the installed list, and `.specify/extensions/.registry` includes an enabled `archive` entry for `speckit.archive.run`.

### T012 Vendored Manifest and Source Evidence

Vendored files and hashes:

| File | SHA-256 |
| --- | --- |
| `.specify/extensions/archive/extension.yml` | `fb4b68b85d69d6ed546965acc6a2a7157e215d894093230574fffc11c20d7893` |
| `.specify/extensions/archive/commands/archive.md` | `0a4b128e77bcb37c9d964756020d4b19975f13f8d63060e0616f5b46c707a48f` |
| `.specify/extensions/archive/README.md` | `15d4a9f0fe5c66d5bcaaa1925ab85b9f492e092648fb1cb5fac5bbe3633283be` |
| `.specify/extensions/archive/CHANGELOG.md` | `f795322c9e51412cd4da8b4462c12f50232a9bdf894280dbbe2058bff3ea3427` |
| `.specify/extensions/archive/LICENSE` | `7abc1ff97b2ebeb16bd1b8b5ffc6936c293bc2eef3bb17095aa4e89dd6c2be10` |

The registry manifest hash is `sha256:fb4b68b85d69d6ed546965acc6a2a7157e215d894093230574fffc11c20d7893`, matching the vendored `extension.yml`. `RACECRAFT-PIN.md` records the fork source, tag, commit, tag object, archive URL, license, vendored hashes, and Mission Control safety policy.

### T013 Archive Dry-Run Configuration

The vendored `speckit.archive.run` command defines:

- `--sweep` mode for previously merged spec discovery.
- `--current-target <path>` current-target exclusion.
- `--dry-run`, `--apply`, and `--apply-cleanup` separation.
- Archive report output for `excludedCurrentSpec`, `cleanupMode`, `archiveExtensionInstalled`, `safeToApplyCleanup`, and `dryRunProvenanceOnly`.

`RACECRAFT-PIN.md` records the Mission Control policy that Archive Sweep runs before requested spec work, excludes the current target spec, and remains dry-run-only in this dirty unsafe checkout.

### T014 Unsafe Branch and Dirty Worktree Handling

Current branch/worktree evidence remains:

```text
## feat/openfeature-feature-flags
 M .specify/extensions.yml
 M .specify/extensions/.registry
 M docs/ai/specs/SPEC-002A-workflow.md
 M docs/ai/specs/autopilot-state.json
 M specs/002a-spec-archive-evidence/spec.md
?? .specify/extensions/archive/
...
```

Because this checkout is not on a safe base branch and contains uncommitted SPEC-002A work, archive cleanup stays dry-run-only. The vendored command requires failed cleanup gates to set `safeToApplyCleanup=false` and `dryRunProvenanceOnly=true` without removing source files.

### T015 No Active Spec Deletion, History Rewrite, or CI Mutation

Verification found no active spec deletion from this integration step. `.specify/extensions/archive/commands/archive.md` requires cleanup to avoid git history rewrites and forbids reliance on post-merge CI mutating `main`.

Relevant verification:

```text
$ ruby -e 'require "json"; data = JSON.parse(File.read(".specify/extensions/.registry")); ext = data.dig("extensions", "archive"); abort("missing archive") unless ext; abort("bad version") unless ext["version"] == "1.1.0"; puts "registry OK"'
registry OK
$ ruby -e 'require "yaml"; data = YAML.load_file(".specify/extensions.yml"); abort("archive not installed") unless data["installed"].include?("archive"); puts "extensions.yml OK"'
extensions.yml OK
$ shasum -a 256 .specify/extensions/archive/extension.yml .specify/extensions/archive/commands/archive.md .specify/extensions/archive/README.md .specify/extensions/archive/CHANGELOG.md .specify/extensions/archive/LICENSE
fb4b68b85d69d6ed546965acc6a2a7157e215d894093230574fffc11c20d7893  .specify/extensions/archive/extension.yml
0a4b128e77bcb37c9d964756020d4b19975f13f8d63060e0616f5b46c707a48f  .specify/extensions/archive/commands/archive.md
15d4a9f0fe5c66d5bcaaa1925ab85b9f492e092648fb1cb5fac5bbe3633283be  .specify/extensions/archive/README.md
f795322c9e51412cd4da8b4462c12f50232a9bdf894280dbbe2058bff3ea3427  .specify/extensions/archive/CHANGELOG.md
7abc1ff97b2ebeb16bd1b8b5ffc6936c293bc2eef3bb17095aa4e89dd6c2be10  .specify/extensions/archive/LICENSE
$ rg -n 'archive|v1.1.0|08ee0e919a72ccb254758a2b6f51d58196490ea7|safeToApplyCleanup|dryRunProvenanceOnly|current target|post-merge CI|rewrite git history' .specify/extensions.yml .specify/extensions/.registry .specify/extensions/archive/RACECRAFT-PIN.md .specify/extensions/archive/extension.yml .specify/extensions/archive/commands/archive.md
$ git status --short -- specs .specify/extensions
```

## Phase 7: Archive Sweep and Evidence Provenance (T016-T020)

Recorded: 2026-04-28

Scope: Produced dry-run Archive Sweep evidence from the vendored archive command contract and live Mission Control GitHub/local git evidence. No active `specs/**` files were deleted or moved.

### T016 SPEC-002 Dry-Run

Dry-run report: `specs/002a-spec-archive-evidence/archive-sweep-dry-run.md`

Command contract simulated:

```text
/speckit.archive.run --sweep --current-target specs/002a-spec-archive-evidence --dry-run
```

The report uses `specs/002-product-line-switcher` as the dry-run source and records `cleanupApplied: false`, `cleanupMode: dry-run`, `dryRunProvenanceOnly: true`, and `safeToApplyCleanup: false`. The source files remained in place after the dry-run evidence step.

### T017 Archive Output Provenance

The dry-run report records:

- source spec path: `specs/002-product-line-switcher`
- PR URL: `https://github.com/racecraft-lab/mission-control/pull/16`
- merge commit: `65f2e7ce0f99991760f0236e605c7daf8f44d770`
- tree reference: `65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher`
- CI run URL: `https://github.com/racecraft-lab/mission-control/actions/runs/25011323867`
- Argos Storybook build: `https://app.argos-ci.com/visual-reviewer/mission-control/builds/11`
- Argos Playwright build: `https://app.argos-ci.com/visual-reviewer/mission-control/builds/12`
- metadata gate policy for Playwright and Storybook Argos metadata
- artifact manifest entries for `spec-002-ui-e2e-artifacts` and `storybook-argos-screenshots`

### T018 Recovery Commands

The report includes raw recovery commands using the required `git show <merge-sha>:specs/<feature>/...` form, including:

```text
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/spec.md
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/plan.md
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/tasks.md
```

### T019 Archive Sweep Output

The dry-run sweep lists:

- eligible previous specs: SPEC-001 (`specs/001-foundation-migrations`, PR #15) and SPEC-002 (`specs/002-product-line-switcher`, PR #16)
- excluded current target: `specs/002a-spec-archive-evidence`
- cleanup mode: `dry-run`
- archive extension installed state: `true`
- `dryRunProvenanceOnly: true`
- `safeToApplyCleanup: false`

### T020 Dry-Run Evidence Boundary

SPEC-001 and SPEC-002 dry-run evidence remains provenance/readiness evidence only. It does not authorize cleanup because the checkout is dirty, the branch is not a safe base branch, this run is dry-run-only, and `--apply-cleanup` was not supplied.

Relevant verification:

```text
$ gh pr view 16 --repo racecraft-lab/mission-control --json number,title,url,mergedAt,mergeCommit,headRefName,baseRefName,state
$ gh pr view 15 --repo racecraft-lab/mission-control --json number,title,url,mergedAt,mergeCommit,headRefName,baseRefName,state
$ gh api repos/racecraft-lab/mission-control/commits/65f2e7ce0f99991760f0236e605c7daf8f44d770/check-runs --jq '.check_runs[] | [.name,.status,.conclusion,.html_url] | @tsv'
$ gh api repos/racecraft-lab/mission-control/commits/65f2e7ce0f99991760f0236e605c7daf8f44d770/status --jq '.statuses[] | [.context,.state,.target_url] | @tsv'
$ gh api repos/racecraft-lab/mission-control/actions/runs/25011323867/artifacts --jq '.artifacts[] | [.name,.expired,.size_in_bytes,.archive_download_url] | @tsv'
$ gh api repos/racecraft-lab/mission-control/actions/runs/25011323893/artifacts --jq '.artifacts[] | [.name,.expired,.size_in_bytes,.archive_download_url] | @tsv'
$ find specs/002-product-line-switcher -maxdepth 2 -type f | sort
```

## Phase 7: Screenshot Guard and UI Evidence Policy (T021-T027)

Recorded: 2026-04-28

Scope: Added a local and CI screenshot evidence guard, documented manifest fields, recorded a synthetic negative fixture, and preserved existing Argos metadata/no-empty-build behavior as the accepted UI evidence path.

### T021 Evidence Manifest Fields

`docs/spec-evidence-policy.md` defines the manifest fields for committed generated screenshots or binary artifacts under `specs/**`:

- `path`
- `sha256`
- `bytes`
- `ciArtifact.name`
- `ciArtifact.url`
- `retentionClassification`
- `redactionStatus`
- `expirationRisk`

### T022 Local Screenshot-Retention Guard

Added `scripts/verify-spec-evidence-screenshots.mjs` and package script `pnpm test:evidence:screenshots`. The guard scans committed image files under `specs/**` and fails when a screenshot is unmanifested, oversized, or has incomplete manifest metadata.

Normal guard result:

```text
$ pnpm test:evidence:screenshots
[spec-evidence-screenshots] checked 0 committed spec screenshot(s); policy passed
```

### T023 CI Guard

`.github/workflows/quality-gate.yml` now runs `pnpm test:evidence:screenshots` as the "Spec evidence screenshot guard" step before lint/typecheck/unit/build/e2e work.

### T024 Negative Fixture

Added package script `pnpm test:evidence:screenshots:negative`, which uses a synthetic unmanifested fixture path without committing a binary fixture:

```text
$ pnpm test:evidence:screenshots:negative
[spec-evidence-screenshots] synthetic negative fixture failed as expected: specs/negative-fixture/screenshots/unmanifested.png
```

### T025 Approved Evidence Path

The normal guard passing with zero committed spec screenshots verifies that artifact-bundle-only and Argos-link evidence paths do not require committed generated screenshots. `archive-sweep-dry-run.md` records the approved SPEC-002 evidence as Argos build links and CI artifacts instead of durable screenshot payloads.

### T026 PR Readiness Policy

`.github/pull_request_template.md` and `docs/spec-evidence-policy.md` now state that missing evidence, failing Argos metadata gates, visible UI defects, clipped or overlapping controls, wrong seeded data, inaccessible controls, broken UI journeys, or unmanifested committed screenshots block PR readiness.

### T027 Argos Metadata and No-Empty-Build Policy

Existing SPEC-002 behavior remains the baseline:

- `.github/workflows/spec-002-ui-e2e.yml` runs Docker-backed visual coverage with `ARGOS_UPLOAD_TO_ARGOS=1`, `SPEC002_ARGOS_SCREENSHOTS=1`, and `SPEC002_ARGOS_TRACES=1`.
- `.github/workflows/spec-002-ui-e2e.yml` verifies Playwright metadata counts, `@spec-002` test tags, `spec-002` screenshot tags, and domain counts before passing.
- `.github/workflows/argos-storybook.yml` verifies Storybook metadata counts, story counts, and `spec-002,visual` tags before passing.
- `scripts/e2e-docker.sh` runs the clean flag-off regression with `ARGOS_UPLOAD_TO_ARGOS=0`, `SPEC002_ARGOS_SCREENSHOTS=0`, and `SPEC002_ARGOS_TRACES=0`, preventing empty Argos uploads for non-visual/flag-off regression runs.

Relevant verification:

```text
$ node --check scripts/verify-spec-evidence-screenshots.mjs
$ pnpm exec eslint scripts/verify-spec-evidence-screenshots.mjs
$ pnpm test:evidence:screenshots
$ pnpm test:evidence:screenshots:negative
$ rg -n 'ARGOS_UPLOAD_TO_ARGOS|SPEC002_ARGOS|EXPECTED_METADATA|REQUIRED_TAG|flag-off|empty Argos|workspace-switcher-flag-off' package.json .github/workflows scripts tests specs/002-product-line-switcher/quickstart.md specs/002-product-line-switcher/retrospective.md
```

### Verification Commands Run

```text
sed -n '1,240p' specs/002a-spec-archive-evidence/tasks.md
sed -n '1,260p' specs/002a-spec-archive-evidence/implementation-evidence.md
sed -n '1,180p' specs/002a-spec-archive-evidence/spec.md
sed -n '1,180p' specs/002a-spec-archive-evidence/contracts/archive-sweep.md
git status --short
gh repo view racecraft-lab/spec-kit-archive --json nameWithOwner,defaultBranchRef,url,licenseInfo,latestRelease,description
gh api repos/racecraft-lab/spec-kit-archive/commits/main --jq '.sha + " " + .commit.committer.date + " " + (.commit.message|split("\n")[0])'
gh api repos/racecraft-lab/spec-kit-archive/contents/extension.yml --jq '.sha + " " + .download_url'
gh api repos/racecraft-lab/spec-kit-archive/contents/commands/archive.md --jq '.sha + " " + .download_url'
gh api repos/racecraft-lab/spec-kit-archive/contents/extension.yml -H Accept:application/vnd.github.raw
gh api repos/racecraft-lab/spec-kit-archive/contents/commands/archive.md -H Accept:application/vnd.github.raw
gh api repos/racecraft-lab/spec-kit-archive/contents/README.md -H Accept:application/vnd.github.raw
gh api repos/racecraft-lab/spec-kit-archive/contents/CHANGELOG.md -H Accept:application/vnd.github.raw
rg -n "Phase 7: Archive Fork Validation|Validation verdict|git show <merge-sha>:specs/<feature>/spec.md|T007 is not complete|Adoption decision: reject" specs/002a-spec-archive-evidence/implementation-evidence.md
rg -n "^- \[x\] T0(06|09|10)|^- \[ \] T0(07|08)" specs/002a-spec-archive-evidence/tasks.md
```
