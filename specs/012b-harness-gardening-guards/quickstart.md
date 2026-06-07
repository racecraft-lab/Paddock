# Quickstart: Harness-Gardening Drift Guards

## Prerequisites

- Node.js >=22.
- pnpm available through the repository lockfile workflow.
- Run from the repository root on branch `012b-harness-gardening-guards`.

## Validate Fixture Behavior

Run the focused fixture-backed guard:

```bash
pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures --as-of 2026-06-06
```

Expected outcome:

- Fresh fixtures emit zero active findings.
- Hard fixtures fail the guard for supported repo-owned hard drift.
- Warning fixtures emit recommendations without failing the hard-drift result.
- Duplicate fixtures collapse to one recommendation per stable finding ID.
- Error fixtures emit the closed sanitized error enum and fail or warn according to required/optional input policy.

## Produce Deterministic JSON

Run the JSON form twice with the same input and `--as-of`:

```bash
pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures --as-of 2026-06-06 --json > /tmp/hg-report-1.json
pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures --as-of 2026-06-06 --json > /tmp/hg-report-2.json
cmp /tmp/hg-report-1.json /tmp/hg-report-2.json
```

Expected outcome:

- `cmp` exits cleanly.
- JSON conforms to `specs/012b-harness-gardening-guards/contracts/harness-gardening-report.schema.json`.
- No default wall-clock timestamp, absolute host path, stack trace, environment value, token, credential, secret, secret-shaped value, raw artifact content, or matched substring appears in the report.

## Write Local Reports

Run the default local report output:

```bash
pnpm spec:012b:harness-gardening -- --as-of 2026-06-06
```

Expected outcome:

- JSON report is written to `specs/012b-harness-gardening-guards/.process/harness-gardening-report.json`.
- Markdown report is written to `specs/012b-harness-gardening-guards/.process/harness-gardening-report.md`.
- Each finding has one narrow recommendation, owner metadata or owner warning, evidence, a non-mutating Paddock cleanup-task draft, and optional export-only GitHub issue draft fields.

## Validate Guardrail Wiring

Run the SPEC-012B guardrails suite:

```bash
pnpm guardrails -- --suite harness-gardening
```

Expected outcome:

- The harness-gardening guard runs as a separate suite.
- Existing SPEC-012A knowledge-index checks are not replaced.

Run the preserved SPEC-012A checks:

```bash
pnpm knowledge:index:check
pnpm guardrails -- --suite repo-knowledge-index
```

Expected outcome:

- Both commands remain available and continue to validate repo knowledge index behavior.

## Scope-Control Checks

Run static review commands before implementation closeout:

```bash
git diff --check
pnpm typecheck
pnpm lint
pnpm test
```

Expected outcome:

- No runtime `src/**` behavior, migrations, UI/API endpoints, scheduler/dispatch behavior, claim/retry behavior, sandbox behavior, harness adapter behavior, live GitHub write path, live Paddock task creation path, auto-merge path, or automatic `specs/**` cleanup path is introduced.
