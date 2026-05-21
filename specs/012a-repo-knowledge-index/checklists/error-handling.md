# Checklist: error-handling

**Feature**: SPEC-012A - Repo Knowledge Index and AGENTS Map
**Created**: 2026-05-21
**Scope**: Validate guard output, blocking/warning classification, and autonomous remediation usefulness.

## Checks

- [x] Guard findings distinguish `error`, `warning`, and `info`.
- [x] Blocking failures cover missing index/schema, malformed JSON, schema mismatch, missing required entries, missing required paths, metadata failures, invalid related specs, broken required links, outside-repo traversal, and stale status pointers.
- [x] Warning-only findings cover external URLs, Obsidian wikilinks, and optional links.
- [x] Failure output must name the offending entry, field, path, file, or status relationship.
- [x] Stale status failures must name observed and expected roadmap/workflow/state values.
- [x] Fresh-agent proxy failures must name the unresolved target and whether discovery bypassed the index.
- [x] Stable finding codes are enumerated for autonomous remediation and CI parsing.

## Gaps Addressed

- E001: The guard contract described stable codes but did not enumerate them. Resolved by adding the required code list to the data model and contract artifact.

## Result

0 unresolved gaps.
