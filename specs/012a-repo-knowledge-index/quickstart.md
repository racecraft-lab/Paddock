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
pnpm guardrails -- --suite repo-knowledge-index
```

Expected passing output includes:

- `[repo-knowledge-index] passed with 0 warning(s)`
- `[fresh-agent-proxy] resolved 9 required target(s) from AGENTS.md through docs/ai/repo-knowledge-index.json`
- `[guardrails] 1 guardrail suite(s) passed`

## Required Negative Fixture Evidence

Fixture-backed negative cases:

```bash
pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/missing-required-metadata
pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/missing-required-doc
pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/stale-status-pointer
pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/broken-required-link
pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/invalid-related-spec
pnpm knowledge:index:check -- --fixture scripts/spec-012a/fixtures/warning-only-links
```

The first five fixtures exit non-zero and emit the expected stable error code.
`warning-only-links` exits zero while emitting `external_link_warning` and
`wikilink_warning`.

## Full Verification For The PR

```bash
pnpm typecheck
pnpm lint
pnpm knowledge:index:check
pnpm knowledge:index:smoke
pnpm guardrails -- --suite repo-knowledge-index
git diff --check
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
