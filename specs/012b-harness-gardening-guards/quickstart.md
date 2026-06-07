# Quickstart: Harness-Gardening Drift Guards

## Prerequisites

- Node.js >=22.
- pnpm available through the repository lockfile workflow.
- Run from the repository root on branch `012b-harness-gardening-guards`.

> These commands are post-implementation verification targets. Before implementation,
> they define the expected package-script and guardrails contract rather than
> already-passing checks.

## Validate Docs Integrity

Before implementation tasks rely on SPEC-012B artifacts, review the checked-in docs surfaces:

- `docs/rc-factory-v1-prd.md` FR-J4, `docs/ai/rc-factory-technical-roadmap.md` SPEC-012B, `docs/ai/specs/.process/SPEC-012B-workflow.md`, and `specs/012b-harness-gardening-guards/spec.md` name the same drift classes and recommendation-only boundary.
- `docs/ai/repo-knowledge-index.json` has first-class entries for the SPEC-012B design concept, workflow ledger, and generated spec folder.
- `AGENTS.md` points to the current SPEC-012B workflow and artifact folder without claiming the planned guard command is already implemented.
- External-context evidence records retrieval dates, URLs, and planning impact in the spec, plan, and research artifacts, while default guard execution remains offline.
- Source-link and evidence requirements classify required repo-owned links separately from optional, external, and informational links before hard-failure policy is applied.
- No docs-integrity check requires live HAL, GitHub, deployment, database, service, scheduler, or runtime state.

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
- Duplicate fixtures prove `stable_finding_id` uses normalized `owner_key`, not owner display name.
- Duplicate fixtures prove evidence and warnings merge into sorted unique lists.
- Mixed duplicate severities prove effective severity is max-rank with `error > warning`.
- Error fixtures emit the closed sanitized error enum and fail or warn according to required/optional input policy.
- Error fixtures prove `artifact_too_large` at the documented limits: guarded repo artifacts over `1,048,576` bytes and fixture input files over `262,144` bytes emit the closed error code before parse.
- Required oversized inputs fail CI; optional oversized detector inputs emit `detector_status: "skipped_detector"` without failing CI unless another hard-drift finding exists.
- Redaction fixtures include both `redacted: true` cases, where forbidden or untrusted content is removed or withheld, and `redacted: false` cases, where messages are generated only from safe bounded templates.
- Fixture containment fixtures cover absolute paths, `..` traversal, Windows separators, and symlink or normalization escapes; each emits `fixture_unsafe_path` before content read and fails CI.

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
- Contract checks also verify invariants the schema cannot fully enforce: summary counts equal report contents, recommendations mirror parent findings, `recommendation_id == stable_finding_id`, findings are sorted deterministically, and duplicate aggregation is stable.
- No default wall-clock timestamp, absolute host path, stack trace, environment value, token, credential, secret, secret-shaped value, raw artifact content, or matched substring appears in the report.
- Contract checks verify every guard error message is at most 512 characters and every reported path is repo-relative.
- Redaction checks verify `redacted: true` records contain no forbidden leaked content and `redacted: false` records are safe template diagnostics.
- Unsafe fixture-path checks verify containment escapes do not read file content before emitting `fixture_unsafe_path`.

## Write Local Reports

Run the default local report output:

```bash
pnpm spec:012b:harness-gardening -- --as-of 2026-06-06
```

Expected outcome:

- JSON report is written to `specs/012b-harness-gardening-guards/.process/harness-gardening-report.json`.
- Markdown report is written to `specs/012b-harness-gardening-guards/.process/harness-gardening-report.md`.
- Each finding has one narrow recommendation, owner metadata or owner warning, evidence, a non-mutating Paddock cleanup-task draft, and optional export-only GitHub issue draft fields.
- Each recommendation copies its parent finding's stable ID, drift class, source path, anchor, owner metadata, severity, evidence, and warnings exactly.

## Validate Guardrail Wiring

Run the SPEC-012B guardrails suite:

```bash
pnpm guardrails -- --suite harness-gardening
```

Expected outcome:

- Only the focused harness-gardening suite runs.
- Existing SPEC-012A knowledge-index checks are not replaced, renamed, or inlined.

Run the full shared guardrails set:

```bash
pnpm guardrails
```

Expected outcome:

- The full suite set runs, including existing `task-pipeline`, `spec-evidence-screenshots`, `repo-knowledge-index`, and new `harness-gardening`.

Run the preserved SPEC-012A checks:

```bash
pnpm knowledge:index:check
pnpm guardrails -- --suite repo-knowledge-index
```

Expected outcome:

- Both commands remain available and continue to validate repo knowledge index behavior.
- `pnpm knowledge:index:check` has no dependency on `pnpm spec:012b:harness-gardening`.
- Unknown `--suite` values fail with known-suite diagnostics that include `harness-gardening` while preserving `task-pipeline`, `spec-evidence-screenshots`, and `repo-knowledge-index`.

## Scope-Control Checks

Run the static SPEC-012B scope guard before implementation closeout:

```bash
node scripts/spec-012b/check-scope-control.mjs --self-test
node scripts/spec-012b/check-scope-control.mjs
```

Expected static matrix:

- Changed-file allowlist: `specs/012b-harness-gardening-guards/**`, `scripts/spec-012b/**`, `package.json`, `pnpm-lock.yaml`, `scripts/check-guardrails.mjs`, SPEC-012B workflow/status/index/AGENTS docs, and explicitly documented SPEC-012B-owned tests or fixtures only.
- Changed-file blocklist: `src/**` runtime behavior, migrations or rollback SQL, UI/API routes, scheduler/dispatch/claim/retry/sandbox/harness-adapter implementation, live GitHub or Paddock mutation wiring, auto-merge wiring, and automatic `specs/**` deletion or archive-apply paths.
- Added-line forbidden-token scan: GitHub mutation APIs or commands such as `octokit.rest.*.(create|update|merge|add|remove|set)`, `gh issue ... create/edit`, `gh pr ... create/edit/merge`, and `enablePullRequestAutoMerge`; Paddock live task creation or apply behavior such as `createTask(`, direct `INSERT INTO tasks`, or `paddock_cleanup_task` with `live_mutation: true`; scheduler/dispatch/claim/retry/sandbox/harness execution such as `advanceTaskChain`, `dispatchTask`, `claimTask`, `createSandbox`, `launchHarness`, or `harnessAdapter`; archive mutation such as `--apply-cleanup`, deleting/moving `specs/**`, or archive apply code; runtime feature behavior such as `process.env.FEATURE_` in runtime code; and network fetches to external OpenAI Harness/Symphony URLs in guard execution code.
- Expected evidence: self-test passes; current-diff mode reports zero failures and includes changed-file and scanned-entry counts; docs/process prose may mention forbidden tokens only as non-goals, forbidden examples, or review evidence.

Run baseline local checks after the static scope guard:

```bash
git diff --check
pnpm typecheck
pnpm lint
pnpm test
```

Expected outcome:

- No runtime `src/**` behavior, migrations, UI/API endpoints, scheduler/dispatch behavior, claim/retry behavior, sandbox behavior, harness adapter behavior, live GitHub write path, live Paddock task creation path, auto-merge path, or automatic `specs/**` cleanup path is introduced.
