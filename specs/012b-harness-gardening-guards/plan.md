# Implementation Plan: Harness-Gardening Drift Guards

**Branch**: `012b-harness-gardening-guards` | **Date**: 2026-06-06 | **Spec**: `specs/012b-harness-gardening-guards/spec.md`

**Input**: Feature specification from `specs/012b-harness-gardening-guards/spec.md`

**Note**: This plan keeps SPEC-012B process/tooling-only. It does not add runtime product behavior, migrations, UI, API endpoints, scheduler/dispatch behavior, claim/retry behavior, sandbox behavior, harness adapter behavior, live GitHub writes, live Paddock task creation, auto-merge behavior, or automatic `specs/**` cleanup.

## Summary

Add a focused offline harness-gardening guard that reads checked-in repo artifacts and fixtures, detects the supported v1 drift classes, emits deterministic JSON/Markdown reports, and produces one narrow non-mutating cleanup recommendation per stable finding ID. The implementation surface is limited to Node.js process scripts, JSON schemas, small fixtures, package/guardrail wiring, docs/checklists, and tests.

## Technical Context

**Language/Version**: Node.js >=22 scripts using built-in modules where practical; TypeScript 5.7 strict remains the repository baseline for any new TS/TSX module, though v1 is planned as Node `.mjs` process tooling.

**Primary Dependencies**: Existing Next.js 16, React 19, Zustand, Tailwind CSS 3, `better-sqlite3`, Vitest, Playwright, ESLint, pnpm baseline. SPEC-012B adds no runtime dependency and should avoid new process dependencies unless tasks prove a built-in-only approach cannot satisfy the contract.

**Storage**: Checked-in JSON/Markdown fixture and contract artifacts plus deterministic local/CI report outputs. No SQLite migration, runtime persistence, Paddock row, GitHub issue, scheduler state, or durable dedupe ledger.

**Testing**: Fixture-backed Vitest or Node test coverage, package-script checks, docs-integrity artifact review, `pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures --as-of 2026-06-06`, `pnpm spec:012b:harness-gardening -- --json`, `pnpm guardrails -- --suite harness-gardening`, full `pnpm guardrails`, `pnpm knowledge:index:check`, `pnpm guardrails -- --suite repo-knowledge-index`, and `git diff --check`.

**Target Platform**: Local developer and CI execution on Node.js >=22 through pnpm; no browser, service, database, HAL, GitHub, or deployed Paddock dependency.

**Project Type**: Process/tooling guard suite inside the existing Next.js repository.

**Performance Goals**: Deterministic bounded scans over the fixture corpus and explicit repo-owned artifacts; no broad semantic scoring, live network fetch, hidden wall-clock report fields, or unbounded repository crawl in the default guard path.

**Constraints**: Recommendation-only default behavior; repo-artifact-only truth; explicit `--as-of YYYY-MM-DD` for freshness; sanitized closed error enum; stable IDs from `drift_class + source_path + anchor + owner_key`; no runtime surfaces or live mutation; no automatic `specs/**` cleanup.

**Error Boundary Constants**: Guarded repo artifacts are limited to `1,048,576` bytes per file. Fixture input files are limited to `262,144` bytes per file. Oversized inputs use `artifact_too_large` with the required-vs-optional CI behavior defined in the spec.

**Fixture Path Boundary**: Fixture-declared paths normalize and resolve under the fixture case root before reads. Simulated repo reads must stay under that case's `repo/` mini-tree. Containment escapes use `fixture_unsafe_path` and hard-fail before file content is read.

**Redaction Truth Semantics**: `redacted` is `true` when forbidden or untrusted content was removed, replaced, or withheld; `false` only for safe template diagnostics with no redaction.

**Scale/Scope**: V1 supports stale PRD/roadmap/workflow claims, missing required evidence, stale feature-flag status, deterministic low-value test patterns, strict-scope drift, broken source-of-truth links, and warning-only archive cleanup eligibility.

**Reviewability Budget**: Primary surface `docs/process`; secondary surfaces guard scripts, guard configuration, fixture corpus, package/guardrail wiring, and tests. Projected reviewable LOC 350-450, production files 0 runtime production files, total files 10-15. Budget result: warning accepted. Split decision: one spec remains appropriate because all work serves one process/tooling guard and no runtime/live-mutation surface is planned.

**Ratified reviewability exception**: The setup transition exception is ratified for the task gate because the task and plan artifacts necessarily name `contracts/`, workflow ledgers, and harness-gardening process paths that the heuristic classifies as API, runtime, or adapter surfaces. The completed scope-control checklist and consensus confirmed these names are process/tooling artifacts only. The implementation remains one deployable docs/process guard slice, and any task that widens into runtime source, migration, UI/API, scheduler, dispatch, harness adapter, live mutation, or automatic cleanup must stop before implementation.

## External Context Evidence

Retrieved during Plan on 2026-06-06:

| Source | Evidence Used | Plan Impact |
|--------|---------------|-------------|
| OpenAI Harness Engineering article, `https://openai.com/index/harness-engineering/`, dated 2026-02-11 | Repository knowledge as system of record, short maps over monolithic instructions, mechanical checks for freshness/cross-links/ownership, continuous doc gardening. | Reinforces repo-artifact-only truth, small maps, owner/freshness/link checks, and targeted cleanup recommendations. |
| OpenAI Symphony announcement, `https://openai.com/index/open-source-codex-orchestration-symphony/`, dated 2026-04-27 | Symphony frames task trackers as orchestration control planes and emphasizes workspaces, guardrails, and human review. | Vocabulary only. SPEC-012B does not import orchestration behavior, live issue writes, tracker polling, scheduling, or always-on agents. |
| OpenAI Symphony SPEC, `https://github.com/openai/symphony/blob/main/SPEC.md` | Repository-owned workflow contract, workspace/tracker/reconciliation/validation terminology, explicit trust/safety posture. | Vocabulary and safety posture only. SPEC-012B remains an offline repo guard and does not add `WORKFLOW.md` runtime loading, scheduler preflight, tracker clients, or agent runners. |

Default guard execution MUST NOT fetch these sources or depend on network access.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Plan Evidence |
|-----------|--------|---------------|
| I. Zero-Regression Contract | PASS | No runtime product code, migrations, UI, API, scheduler, dispatch, sandbox, adapter, or database behavior is planned. |
| II. Install Compatibility And Operational Impact Discipline | PASS | Existing installs are unaffected because the scope is scripts, fixtures, docs, schemas, tests, and package/guardrail wiring only. |
| IV. Test-First Development | PASS | Tasks must start with failing fixture tests for every hard/warning drift class, dedupe behavior, sanitized errors, and deterministic report output. |
| V. Feature-Flag Resolution Discipline | PASS | The guard reads checked-in feature-flag registry/docs only; it must not add runtime `process.env.FEATURE_*` checks or runtime flag behavior. |
| VI. Dependency Supply-Chain Hygiene | PASS | No new runtime dependency planned; any later process dependency would require package and lockfile review. |
| XI/XII. Simplicity and Avoid Speculative Generality | PASS | V1 uses a closed drift taxonomy, deterministic fixtures, and no persistent apply/dedupe mode. |
| XIII. Defensive Boundaries | PASS | Artifact and fixture reads produce structured sanitized error records using the closed enum and bounded messages. |
| XIV. Real UI Journey Quality Gate | N/A | No user-facing UI journey is added or changed. |
| XV. Spec Artifact Provenance And Archive Sweep | PASS | `specs/**` cleanup is warning-only recommendation output; this spec never deletes source folders or bypasses archive safe-base gating. |
| XVI. Reviewability And Verification Debt Control | PASS WITH ACCEPTED WARNING | The declared scope stays within one primary surface and 10-15 files; projected reviewable LOC may exceed the 400-line warning threshold but remains below block thresholds. PR packet must declare exclusions for fixture/report data. |

**Pre-design gate result**: PASS. G3 is satisfied if implementation remains limited to guard scripts, fixtures, recommendation schema/template, docs/checklists, package/guardrail wiring, and tests.

## Project Structure

### Documentation (this feature)

```text
specs/012b-harness-gardening-guards/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── docs-integrity.md
├── contracts/
│   └── harness-gardening-report.schema.json
└── .process/
    ├── harness-gardening-report.json
    └── harness-gardening-report.md

docs/ai/specs/.process/
├── SPEC-012B-design-concept.md
└── SPEC-012B-workflow.md

docs/ai/repo-knowledge-index.json
AGENTS.md
```

### Source Code (repository root)

```text
scripts/spec-012b/
├── harness-gardening-check.mjs
├── harness-gardening-report.mjs
├── check-scope-control.mjs
├── fixtures/
│   ├── fresh/
│   ├── hard/
│   ├── warning/
│   ├── dedupe/
│   └── errors/
└── __tests__/
    └── harness-gardening-check.test.mjs

specs/012b-harness-gardening-guards/contracts/
└── harness-gardening-report.schema.json

package.json
pnpm-lock.yaml
```

**Structure Decision**: Use process tooling under `scripts/spec-012b/` plus contract and process artifacts under `specs/012b-harness-gardening-guards/`. Keep runtime `src/**`, migrations, UI, API routes, scheduler, dispatch, sandbox, and harness adapter files out of scope.
Docs-discoverability updates are part of this process/tooling surface: the repo knowledge index, concise `AGENTS.md` map, workflow checklist status, and docs-integrity checklist must point at SPEC-012B artifacts without claiming package commands exist before implementation adds them.

### Guardrail Wiring Ownership

- `package.json` owns the future `spec:012b:harness-gardening` package script, following the existing `pnpm run verify:node && node ...` script pattern.
- `scripts/spec-012b/harness-gardening-check.mjs` owns the focused command, argument parsing, fixture mode, `--json`, `--as-of`, local report output, and exit-code policy.
- `scripts/spec-012b/check-scope-control.mjs` owns SPEC-012B static scope-control verification: changed-file allowlist and blocklist checks, added-line forbidden-token scanning, `--self-test` fixtures, current-diff mode, docs/process prose exemptions, and changed-file/scanned-entry count reporting.
- `scripts/spec-012b/fixtures/**` owns SPEC-012B fixture inputs.
- `specs/012b-harness-gardening-guards/.process/**` owns default generated JSON/Markdown reports.
- `scripts/check-guardrails.mjs` owns the `harness-gardening` suite registration, selected `--suite` behavior, and known-suite diagnostics.
- Existing guardrail suite keys `task-pipeline`, `spec-evidence-screenshots`, and `repo-knowledge-index` must remain unchanged.
- `scripts/spec-012a/verify-repo-knowledge-index.mjs` remains SPEC-012A-owned and must not be edited for SPEC-012B except as a compatibility verification target.

## Phase 0 Research

Research output is captured in `specs/012b-harness-gardening-guards/research.md`.

Resolved decisions:

- Use Node.js >=22 built-ins for artifact traversal, hashing, JSON parsing, path safety, and report writes.
- Keep the default guard offline and repo-artifact-only.
- Use fixture-first tests rather than the live repo as the primary oracle.
- Define the JSON report schema now so later explicit apply mode can consume stable recommendations without adding v1 mutation.
- Treat OpenAI Harness Engineering and Symphony as vocabulary/safety context only.

## Phase 1 Design And Contracts

Design artifacts:

- `specs/012b-harness-gardening-guards/data-model.md`
- `specs/012b-harness-gardening-guards/contracts/harness-gardening-report.schema.json`
- `specs/012b-harness-gardening-guards/quickstart.md`

Key contract decisions:

- Report envelope schema version: `harness_gardening_report.v1`.
- Recommendation item schema version: `harness_gardening_recommendation.v1`.
- Error enum schema version: `harness_gardening_error_code.v1`.
- Stable finding identity uses normalized `drift_class + source_path + anchor + owner_key`; display owner metadata is retained for routing and review but does not replace `owner_key` in the hash tuple.
- Source-of-truth link checks classify required repo-owned links separately from optional, external, and informational links before assigning hard-failure or warning severity.
- Source-link and evidence recommendations name the repo-relative source path, anchor, affected link target or evidence marker, owner metadata, and one narrow remediation edit.
- JSON Schema validates shape, constants, enums, and path/message bounds; fixture-backed contract tests or generator assertions verify summary counts, recommendation-parent equality, stable sorting, dedupe grouping, severity aggregation, and `recommendation_id == stable_finding_id`.
- JSON output must be deterministic for a fixed input and `--as-of` value.
- Markdown output is a human-readable projection of the JSON report.

**Post-design constitution re-check**: PASS. The design artifacts preserve G3: no runtime source behavior, migration, UI, API endpoint, scheduler, dispatch, claim/retry, sandbox, harness adapter, live GitHub write, live Paddock task creation, auto-merge, or automatic `specs/**` cleanup.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Reviewable LOC warning accepted | Fixture coverage plus schema/report validation may exceed 400 reviewable LOC while staying below block thresholds. | Splitting the schema from the guard would create cross-spec coordination for one process/tooling feature and reduce traceability. |
