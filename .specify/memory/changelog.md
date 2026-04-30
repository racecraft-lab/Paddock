# Project Memory Changelog

Auto-generated from Archive Sweep on 2026-04-28.

---

## SPEC-001: Foundation Migrations

- **Feature**: RC Factory Phase 0 schema tail (M53-M61)
- **Branch**: `001-foundation-migrations`
- **Spec Path**: `specs/001-foundation-migrations/`
- **PR URL**: https://github.com/racecraft-lab/mission-control/pull/15
- **Merge Commit**: `85baf27c218617f412a4a74f9feae13948fc26cd`
- **Tree Reference**: `git show 85baf27c218617f412a4a74f9feae13948fc26cd:specs/001-foundation-migrations/spec.md`
- **CI URL**: N/A (local HAL UAT accepted 2026-04-26)
- **Argos URL**: N/A (migration-only spec, no UI evidence)
- **Task Completion**: 35/35
- **Summary**: Appended migrations M53-M61 to `src/lib/migrations.ts` adding agent scope backfill (global for Aegis, Security Guardian, HAL), workflow-template routing metadata, task lineage fields, workspace feature-flag storage, task dispositions, task artifacts, facility workspace seed, resource policies, and resource policy events. All changes additive and rerun-safe. Paired with 9 rollback SQL files and rollback-procedure.md. No runtime behavior added.

**Recovery Commands**:
```text
git show 85baf27c218617f412a4a74f9feae13948fc26cd:specs/001-foundation-migrations/spec.md
git show 85baf27c218617f412a4a74f9feae13948fc26cd:specs/001-foundation-migrations/plan.md
git show 85baf27c218617f412a4a74f9feae13948fc26cd:specs/001-foundation-migrations/tasks.md
```

---

## SPEC-002: Product Line Switcher and activeWorkspace Scoping

- **Feature**: RC Factory Phase 1 — feature-flagged workspace switcher
- **Branch**: `002-product-line-switcher`
- **Spec Path**: `specs/002-product-line-switcher/`
- **PR URL**: https://github.com/racecraft-lab/mission-control/pull/16
- **Merge Commit**: `65f2e7ce0f99991760f0236e605c7daf8f44d770`
- **Tree Reference**: `git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/spec.md`
- **CI URL**: N/A (local verification)
- **Argos URL**: N/A (Argos build referenced in quickstart.md; generated screenshots not committed)
- **Task Completion**: 56/56
- **Summary**: Added `FEATURE_WORKSPACE_SWITCHER`-gated Product Line switcher. New production modules: `src/lib/feature-flags.ts` (resolveFlag), `src/types/product-line.ts` (discriminated scope types, scopeKey), `src/components/layout/workspace-switcher.tsx` (listbox, ARIA semantics, Facility/Product Line modes). Zustand persistence key `mc:active-workspace:v1`. Cross-tab BroadcastChannel sync. REST/SSE scope matrix with `workspace_scope=facility` / `workspace_id=<id>` contracts. Rejections: 400 for conflicting params or real facility row as PL id, 403 for unauthorized. `/api/events` scoped with reconnect on scope change. Baseline flag-OFF behavior preserved byte-compatible.

**Recovery Commands**:
```text
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/spec.md
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/plan.md
git show 65f2e7ce0f99991760f0236e605c7daf8f44d770:specs/002-product-line-switcher/tasks.md
```

---

## SPEC-002A: Spec Archive and Evidence Retention

- **Feature**: Archive policy, evidence retention, speckit-pro 1.9.1 release
- **Branch**: `002a-spec-archive-evidence`
- **Spec Path**: `specs/002a-spec-archive-evidence/`
- **PR URLs**:
  - https://github.com/racecraft-lab/mission-control/pull/18 (Merge: `daab0c11f8896b31c2d24ed0a53419814671c3b1`)
  - https://github.com/racecraft-lab/mission-control/pull/19 (Merge: `e161a70ed9d415afaec3d0c5fb6d7fb682e6d884`)
- **Merge Commit**: `e161a70ed9d415afaec3d0c5fb6d7fb682e6d884` (latest)
- **Tree Reference**: `git show e161a70ed9d415afaec3d0c5fb6d7fb682e6d884:specs/002a-spec-archive-evidence/spec.md`
- **CI URL**: N/A
- **Argos URL**: N/A (evidence-policy spec; no UI journey)
- **Task Completion**: 47/47
- **Summary**: Established archive evidence policy (provenance-first, no committed screenshots by default). Installed `racecraft-lab/spec-kit-archive` archive extension v1.1.0 at `.specify/extensions/archive/`. Defined Archive Sweep lifecycle: autopilot pre-flight archives previously merged specs, excludes current target, dry-runs on unsafe branches/dirty worktrees. Released `speckit-pro` 1.9.1 (fix: archive sweep runs actual cleanup on feature branches instead of always dry-running). Argos/CI provenance links preferred over committed screenshots. Recovery-command format: `git show <merge-sha>:specs/<feature>/spec.md`.

**Recovery Commands**:
```text
git show e161a70ed9d415afaec3d0c5fb6d7fb682e6d884:specs/002a-spec-archive-evidence/spec.md
git show e161a70ed9d415afaec3d0c5fb6d7fb682e6d884:specs/002a-spec-archive-evidence/plan.md
git show e161a70ed9d415afaec3d0c5fb6d7fb682e6d884:specs/002a-spec-archive-evidence/tasks.md
```

---

<!-- Archive Sweep metadata -->
<!-- archiveMode: sweep | dryRun: false | applyCleanupRequested: false | safeToApplyCleanup: false -->
<!-- Branch: 003-global-aegis (feature branch — cleanup deferred to main) -->
<!-- Sweep run: 2026-04-28 | archiveExtension: 1.1.0 | excludedCurrentSpec: specs/003-global-aegis -->
