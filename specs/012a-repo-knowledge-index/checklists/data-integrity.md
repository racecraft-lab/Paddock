# Checklist: data-integrity

**Feature**: SPEC-012A - Repo Knowledge Index and AGENTS Map
**Created**: 2026-05-21
**Scope**: Validate canonical index data shape, required entries, freshness metadata, and status-pointer consistency.

## Checks

- [x] Required index fields are named in the spec: `path`, `purpose`, `owner`, `freshness`, `last_verified`, `related_specs`, and `verification_commands`.
- [x] Required discovery entries are exact repo-local paths and include PRD, roadmap, workflow/status, QA, rollback, root instructions, and workflow contract coverage.
- [x] `freshness` semantics are structured enough for guard validation.
- [x] `last_verified` uses ISO `YYYY-MM-DD` semantics.
- [x] `related_specs` accepts suffixed IDs used by this roadmap, including forms like `SPEC-009C1`.
- [x] Duplicate required paths, missing required paths, invalid metadata, and invalid related spec IDs are planned as blocking failures.
- [x] Stale status-pointer detection compares roadmap, workflow, and autopilot-state evidence instead of trusting one file alone.
- [x] Required repo-local link validation rejects missing targets and outside-repo traversal.

## Gaps Addressed

- D001: `related_specs` validation was too narrow for existing suffixed IDs like `SPEC-009C1`. Resolved by changing the requirement and data model to allow alphanumeric suffixes.

## Result

0 unresolved gaps.
