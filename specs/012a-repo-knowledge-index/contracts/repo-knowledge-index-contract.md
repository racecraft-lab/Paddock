# Contract: Repo Knowledge Index And Guards

## Canonical Files

- Index: `docs/ai/repo-knowledge-index.json`
- Schema: `docs/ai/repo-knowledge-index.schema.json`
- Root map: `AGENTS.md`

## Required Index Entry Fields

Every entry must include:

- `path`
- `purpose`
- `owner`
- `freshness`
- `last_verified`
- `related_specs`
- `verification_commands`

`freshness` must include a cadence or stale-after rule plus the trigger that requires re-verification.

## Required Discovery Paths

The guard and fresh-agent proxy must require these repo-local paths:

- `AGENTS.md`
- `docs/rc-factory-v1-prd.md`
- `docs/ai/rc-factory-technical-roadmap.md`
- `docs/ai/specs/`
- `docs/ai/specs/SPEC-012A-workflow.md`
- `docs/ai/specs/autopilot-state.json`
- `docs/qa/pilot-smoke-checklist.md`
- `docs/runbook/migration-rollback.md`
- `docs/ai/workflows/mission-control/workflow-contract.yaml`

## Guard Command Contract

Planned package script:

```bash
pnpm knowledge:index:check
```

Behavior:

- Exits `0` when required index, schema, entries, metadata, paths, required repo-local links, related spec IDs, and SPEC-012A status pointers are valid.
- Exits non-zero for malformed JSON, schema mismatch, missing required discovery entries, missing or invalid required metadata, required paths outside the repository, missing required paths, broken required repo-local links, invalid related spec IDs, or stale required status pointers.
- Emits warnings without a failing exit code for external URLs, Obsidian-style wikilinks, and optional links unless declared repo-owned and required.
- Does not fetch network URLs.
- Does not read outside the repository.
- Does not require `.gitnexus/`, `.envrc.local`, secrets, LM Studio, or an Obsidian vault.

Stable finding codes:

- `index_missing`
- `schema_missing`
- `json_malformed`
- `schema_invalid`
- `required_entry_missing`
- `required_path_missing`
- `required_path_outside_repo`
- `metadata_missing`
- `metadata_invalid`
- `related_spec_invalid`
- `required_link_broken`
- `status_pointer_stale`
- `external_link_warning`
- `wikilink_warning`
- `optional_link_warning`

Fixture mode:

```bash
pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/missing-required-metadata
```

Fixture mode validates controlled invalid checkouts and must fail with expected errors for RED evidence.

## Fresh-Agent Proxy Contract

Planned package script:

```bash
pnpm knowledge:index:smoke
```

Behavior:

- Starts from root `AGENTS.md`.
- Locates the canonical index pointer in the Repo Knowledge Map.
- Loads the index and resolves all required discovery targets through index entries.
- Proves discovery of PRD, roadmap, workflow/status pointers, QA checklist, rollback runbook, root instructions, and GitNexus guidance.
- Proves GitNexus guidance by locating the refresh command, linked-worktree `.envrc.local` setup guidance, and ignored `.gitnexus/` boundary.
- Fails when any required target is missing or bypasses the canonical index.

## Guardrails Integration Contract

`scripts/check-guardrails.mjs` must add a `repo-knowledge-index` suite that invokes the blocking index guard. Because `.github/workflows/quality-gate.yml` already runs `pnpm guardrails`, CI coverage must not require a new workflow step.

Focused scripts remain available for local diagnosis:

```bash
pnpm knowledge:index:check
pnpm knowledge:index:smoke
pnpm guardrails -- --suite repo-knowledge-index
```
