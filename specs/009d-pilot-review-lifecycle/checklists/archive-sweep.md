# Archive Sweep Evidence

Task: T001

Sources checked:
- `docs/ai/specs/autopilot-state.json`
- `docs/ai/specs/SPEC-009D-workflow.md`
- `docs/ai/rc-factory-technical-roadmap.md`
- `specs/009d-pilot-review-lifecycle/spec.md`
- `specs/009d-pilot-review-lifecycle/plan.md`

## Startup And Dry Run

- Archive extension status: installed (`archive_extension_installed: true`) with extension release `v1.1.0`.
- Sweep mode: `cleanup_mode: sweep-without-codex-command`.
- Cleanup result: `cleanup_applied: false`.
- Safety flag: `safeToApplyCleanup: false`.
- Current autopilot step: `Phase 7: Setup (T001-T004)`, so Archive Sweep evidence is being recorded before implementation tasks mutate runtime code.

Evidence basis: `docs/ai/specs/autopilot-state.json` records the Archive Sweep state and notes that this checkout exposes archive execution only as a `.claude` command, not a Codex-invokable command. Autopilot continued with active specs preserved.

## Current Target Exclusion

- Current target: `specs/009d-pilot-review-lifecycle`.
- Excluded current spec: `specs/009d-pilot-review-lifecycle`.
- Same-run archival does not apply to the active SPEC-009D folder.

Evidence basis: `autopilot-state.json` records both `current_target` and `excluded_current_spec` as `specs/009d-pilot-review-lifecycle`. `spec.md` and `plan.md` both require Archive Sweep to exclude the current target spec.

## Eligible Previous Specs

Previously merged specs identified as eligible, but not cleaned in this pass:

| Spec folder | Roadmap status | PR | Merge/tree reference | Source |
| --- | --- | ---: | --- | --- |
| `specs/009c3-remediation-ready-for-owner` | Complete | 48 | `ac7760a222a33b4cefe886afae605238f479eaa5` | `docs/ai/rc-factory-technical-roadmap.md` |
| `specs/009c4-owner-merge-reconciliation` | Complete | 52 | `ddc709f2f200a4ee4df51398d39ef42d85bd6e54` | `docs/ai/rc-factory-technical-roadmap.md` |

## Cleanup Safety

- Cleanup was not applied because `safeToApplyCleanup` is false and the current execution surface lacks a Codex-invokable archive command.
- Active specs remain preserved.
- Any future cleanup must be an explicit reviewed change with archive success, merge/tree references, and recovery commands.
- Unsafe branches or dirty worktrees must use dry-run or stop behavior, not silent cleanup.

## Recovery Command Evidence

If later reviewed cleanup removes completed spec folders, recovery commands must remain available from the recorded merge/tree references:

```bash
git show ac7760a222a33b4cefe886afae605238f479eaa5:specs/009c3-remediation-ready-for-owner/
git show ddc709f2f200a4ee4df51398d39ef42d85bd6e54:specs/009c4-owner-merge-reconciliation/
```

Use file-specific suffixes when recovering a single artifact, for example:

```bash
git show ddc709f2f200a4ee4df51398d39ef42d85bd6e54:specs/009c4-owner-merge-reconciliation/spec.md
```

## Screenshot And Evidence Guard

- SPEC-009D does not plan UI screenshots.
- Generated UI screenshots remain Argos/CI artifacts by default.
- Committed binaries under spec evidence require a manifest-backed exception.
- The current checklist update adds Markdown evidence only; no screenshot or binary artifact is introduced.

## Status

T001 setup evidence recorded. No cleanup applied.
