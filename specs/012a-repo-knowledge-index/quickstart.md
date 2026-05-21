# Quickstart: SPEC-012A - Repo Knowledge Index and AGENTS Map

## Local Setup

```bash
pnpm install
```

SPEC-012A must run on Node.js >=22 and pnpm from `pnpm-lock.yaml`.

## Focused Verification

Validate the canonical repository knowledge index:

```bash
pnpm knowledge:index:check
```

Run the deterministic fresh-agent proxy:

```bash
pnpm knowledge:index:smoke
```

Run both through the repository guardrails path used by CI:

```bash
pnpm guardrails
```

## Required Negative Fixture Evidence

Before implementing the passing guard, create fixture-backed failing cases for:

```bash
pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/missing-required-metadata
pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/missing-required-doc
pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/stale-status-pointer
pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/broken-required-link
```

Each fixture must fail for the expected reason and name the offending field, path, or relationship.

## Full Verification For The PR

```bash
pnpm typecheck
pnpm lint
pnpm knowledge:index:check
pnpm knowledge:index:smoke
pnpm guardrails
```

Run `pnpm test` outside the Codex sandbox if unit tests are needed for final PR evidence.

## Clean Checkout Expectations

- `.gitnexus/` may be absent.
- `.envrc.local` may be absent.
- No network access, secret material, LM Studio embedding server, or operator Obsidian vault is required.
- External URLs and Obsidian-style wikilinks are warning or info findings unless an indexed entry declares the referenced fact repo-owned and required.

## GitNexus Refresh Documentation Check

The fresh-agent proxy must prove GitNexus guidance is discoverable through the index by finding:

- `direnv exec . gitnexus analyze --embeddings --skip-agents-md`
- linked-worktree `.envrc.local` setup guidance
- `.gitnexus/` ignored-output boundary
