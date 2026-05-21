# Checklist: regression-safety

**Feature**: SPEC-012A - Repo Knowledge Index and AGENTS Map
**Created**: 2026-05-21
**Scope**: Validate strict process/tooling boundaries and non-goal protection.

## Checks

- [x] Plan and spec prohibit runtime source behavior changes.
- [x] Plan and spec prohibit database migrations and schema changes.
- [x] Plan and spec prohibit UI changes.
- [x] Plan and spec prohibit scheduler, runner, automatic GitHub sync, sandbox lifecycle, and harness adapter changes.
- [x] Plan and spec prohibit generated `.gitnexus/` artifacts in git.
- [x] Plan limits `AGENTS.md` to a concise Repo Knowledge Map and does not plan nested `AGENTS.md` rollout.
- [x] External URLs and Obsidian-style wikilinks remain warning/informational unless declared repo-owned and required.
- [x] Reviewability budget stays on one primary surface: docs/process, with package/CI wiring as secondary only.

## Gaps Addressed

None.

## Result

0 unresolved gaps.
