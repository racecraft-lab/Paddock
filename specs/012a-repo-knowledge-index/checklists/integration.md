# Checklist: integration

**Feature**: SPEC-012A - Repo Knowledge Index and AGENTS Map
**Created**: 2026-05-21
**Scope**: Validate package-script, CI, GitNexus, and root instruction integration boundaries.

## Checks

- [x] Focused package scripts are planned for index validation and fresh-agent proxy smoke checks.
- [x] Blocking validation wires into `pnpm guardrails`, which is already run by `.github/workflows/quality-gate.yml`.
- [x] CI does not require `.gitnexus/`, `.envrc.local`, LM Studio, secrets, network fetches, or an Obsidian vault.
- [x] `AGENTS.md` remains a concise map and routes to the canonical index rather than duplicating it.
- [x] GitNexus refresh instructions are discoverable from checked-in docs while generated `.gitnexus/` output remains ignored.
- [x] The workflow contract path is included as a required discovery target because it is repo-owned workflow policy.

## Gaps Addressed

None.

## Result

0 unresolved gaps.
