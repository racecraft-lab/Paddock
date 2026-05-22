# Implementation Plan: Generic Product-Line Seeder

**Branch**: `010a-generic-product-line-seeder` | **Date**: 2026-05-22 | **Spec**: `specs/010a-generic-product-line-seeder/spec.md`
**Input**: Feature specification from `specs/010a-generic-product-line-seeder/spec.md`

## Summary

Build a reusable product-line seed configuration and CLI by extracting the existing SPEC-009B Mission Control seed constants and apply path into generic `src/lib/product-line-seed/` primitives. The canonical Mission Control config lives at `docs/ai/product-lines/mission-control.yaml`, the new `seed:product-line` command supports preflight/apply/verify with structured JSON evidence, and `seed:mission-control` remains a compatibility wrapper over the same generic behavior.

The design is driven by the setup interview decisions: Q1/Q9 require checked-in YAML under `docs/ai/product-lines/`; Q2 requires explicit existing-target apply/verify with config-owned mutations only; Q3 requires fail-closed structured field/path errors before writes; Q4 requires config-declared workflow contract family/path and required slugs; Q5 reuses the existing `resource_policies` shape; Q6 keeps both generic CLI and Mission Control wrapper; Q7/Q8 keep Product Line B out of scope and use Mission Control parity as UAT; Q10 requires explicit `agent_prefix`; Q11 requires feature-flag registry validation plus disabled/absent future flags; Q12 requires target-config-aware residue blocking with redacted evidence and no automatic deletion.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node.js >=22 in the existing Next.js 16 / React 19 repository baseline  
**Primary Dependencies**: Existing Next.js/React/Zustand stack, `better-sqlite3`, direct `yaml@2.8.2`, existing workflow-contract tooling, existing feature-flag registry; no new runtime dependency  
**Storage**: SQLite through `better-sqlite3`; existing `workspaces`, `projects`, `project_agent_assignments`, `workflow_templates`, `workflow_contract_*`, `resource_policies`, task/history/evidence/GitHub sync tables; no migration  
**Testing**: Focused Vitest tests for config validation, CLI contracts, invalid-config no-mutation snapshots across all FR-020 preserved operational/history surfaces and invariants, existing-target policy, wrapper parity, workflow/flag/agent/governance validation; `pnpm typecheck`, `pnpm lint`, and `pnpm build` as required
**Target Platform**: Local operator CLI in the Mission Control repo on Node.js >=22; no browser/UI surface  
**Project Type**: CLI/library plus checked-in configuration and operator documentation  
**Performance Goals**: Deterministic local seed operations over normal operator SQLite targets; validation and preflight complete before any write transaction; evidence hashes stable across repeated runs  
**Constraints**: Config validation and conflict preflight happen before opening write transactions; apply uses one transaction; verify is read-only; unknown CLI flags are rejected; unsupported workflow families fail before writes; Product Line B/runtime execution/GitHub mutation are excluded  
**Scale/Scope**: One canonical Mission Control config, one generic seed library, one generic CLI entrypoint, one compatibility wrapper, focused fixtures, and concise runbooks  
**Reviewability Budget**: Primary surface `seed/config`; secondary surfaces `tests/contracts/docs`. Projected reviewable LOC about 650-780, production files 8, total files 22-24, primary surface count 1. Result: within block thresholds but above warn thresholds for LOC/production files; no split required if implementation stays inside the listed file set. If implementation exceeds 800 reviewable LOC, 8 production files, 25 total files, or adds a second primary surface, split deferred advanced reuse into a follow-up `SPEC-010A1` and keep SPEC-010A to Mission Control parity and generic seed contracts only.  
**Strict Scope**: Add these spec-owned TS files to `tsconfig.spec-strict.json` and `eslint.config.mjs`: `src/lib/product-line-seed/types.ts`, `src/lib/product-line-seed/schema.ts`, `src/lib/product-line-seed/config.ts`, `src/lib/product-line-seed/preflight.ts`, `src/lib/product-line-seed/seed.ts`, `src/lib/product-line-seed/evidence.ts`, `scripts/seed-product-line.ts`, `scripts/seed-mission-control-product-line.ts`, `src/lib/__tests__/product-line-seed.test.ts`, `src/lib/__tests__/product-line-seed-cli.test.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Plan Evidence |
|-----------|--------|---------------|
| I. Zero-Regression Contract | Pass | `seed:mission-control` stays available and delegates to the generic Mission Control config; existing single-workspace runtime behavior is unaffected unless an operator runs the seed CLI. |
| II. Upstream Compatibility Discipline | Pass | Additive seed/config tooling only; no table rename, destructive migration, or upstream-owned UI/auth/layout changes. |
| IV. Test-First Development | Pass | Tasks must start with failing Vitest/CLI tests for schema validation, existing-target refusal, no-mutation, apply-twice parity, verify drift, wrapper compatibility, and scope guardrails. |
| V. Feature-Flag Resolution Discipline | Pass | Config validation uses `FEATURE_FLAG_REGISTRY`, validates cascades/env force-off blockers, preserves unrelated flags, and does not add inline runtime `process.env.FEATURE_*` checks. |
| VI. Dependency Supply-Chain Hygiene | Pass | Reuse the existing direct `yaml` dependency and Node built-ins; no `package.json` runtime dependency addition. |
| VII. Additive Migration Policy | Pass | No migration; existing tables are reused. Migration grep should show no migration or rollback files in this spec diff. |
| VIII. Successor Side-Effect Parity | Pass | Seeder must not create tasks, successors, dispatch records, claims, runner rows, sandbox rows, or GitHub mutations. Guardrail tests and grep evidence cover this. |
| X. Observability and Auditability | Pass | CLI returns `product-line-seed-result-v1` evidence, redacted residue details, stable validation codes, per-surface counts, and SHA-256 snapshots. |
| XIII. Defensive Boundaries | Pass | YAML/file/CLI/DB boundary failures become structured results; raw secrets, raw logs, signed URLs, and raw untrusted payloads are not emitted. |
| XIV. Real UI Journey Quality Gate | N/A | No user-facing UI journey is added or changed. |
| XV. Spec Artifact Provenance And Archive Sweep | Pass | SPEC-010A workflow recorded Archive Sweep startup as `recorded-no-cleanup`; current target spec is excluded; generated evidence remains text/JSON unless a manifest-backed exception is recorded. |
| XVI. Reviewability And Verification Debt Control | Pass with warning | One primary surface. Scope is above warn budget but below block budget if implementation stays within the exact files listed here. Split trigger is defined above. |

**Post-Design Recheck**: Pass. Phase 0 and Phase 1 artifacts keep one primary surface, name concrete files, avoid new dependencies/migrations/UI/runtime automation, and define the PR review packet source.

## Project Structure

### Documentation (this feature)

```text
specs/010a-generic-product-line-seeder/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── product-line-seed-config.md
    ├── cli-result-envelope.md
    └── validation-error-codes.md
```

### Source Code (repository root)

```text
docs/
├── ai/product-lines/mission-control.yaml
└── runbooks/
    ├── product-line-seed.md
    └── mission-control-seed-predeploy.md

scripts/
├── seed-product-line.ts
└── seed-mission-control-product-line.ts

src/lib/
├── product-line-seed/
│   ├── types.ts
│   ├── schema.ts
│   ├── config.ts
│   ├── preflight.ts
│   ├── seed.ts
│   └── evidence.ts
├── mission-control-seed/
│   └── *.ts
├── workflow-contracts/
│   └── *.ts
└── __tests__/
    ├── product-line-seed.test.ts
    └── product-line-seed-cli.test.ts
```

**Structure Decision**: Use a single generic seed library under `src/lib/product-line-seed/`, keep the existing `src/lib/mission-control-seed/` surface only as compatibility/shim support where useful, and keep CLI entrypoints in `scripts/`. Tests remain focused Vitest tests in `src/lib/__tests__/` so they can reuse existing SQLite fixture helpers and exercise the exported CLI harness without launching the app.

## Files Likely Touched

| Path | Scope Reason |
|------|--------------|
| `docs/ai/product-lines/mission-control.yaml` | New canonical, human-reviewable Mission Control product-line seed config with `schema_version: product-line-seed-v1`. |
| `src/lib/product-line-seed/types.ts` | New shared config, result envelope, mutation status, residue, snapshot, and validation error types. |
| `src/lib/product-line-seed/schema.ts` | New JSON Schema constant and shape validator for required top-level config sections, unknown fields, and basic types. |
| `src/lib/product-line-seed/config.ts` | New safe YAML loading plus TypeScript semantic validation for identity, workflow family/path/slugs, flags, assignments, governance, and safety policy. |
| `src/lib/product-line-seed/preflight.ts` | New target-config-aware existing-target/refusal/residue validation before writes. |
| `src/lib/product-line-seed/seed.ts` | New generic preflight/apply/verify orchestration, one-transaction apply path, and delegation to workflow-contract import/apply logic. |
| `src/lib/product-line-seed/evidence.ts` | New stable counts, ordered JSON snapshot hashing, verify drift evidence, redaction proof, full FR-020 preserved-operational-state hashing, and no-mutation comparison helpers. |
| `scripts/seed-product-line.ts` | New generic operator CLI: `--config`, `--db`, `--mode`, `--json`, `--allow-existing`, `--operator-evidence`; rejects unknown flags. |
| `scripts/seed-mission-control-product-line.ts` | Modify to delegate to the generic CLI using `docs/ai/product-lines/mission-control.yaml` while preserving command name/core flags. |
| `package.json` | Add `seed:product-line`; keep `seed:mission-control`. |
| `tsconfig.spec-strict.json` | Add new spec-owned TS test and production files per Constitution Convention J. |
| `eslint.config.mjs` | Add the same strict lint scope entries. |
| `src/lib/__tests__/product-line-seed.test.ts` | Focused unit/integration tests for config validation, no-mutation, apply-twice parity, verify drift, residue, and scope guardrails. |
| `src/lib/__tests__/product-line-seed-cli.test.ts` | CLI contract tests for generic command, unknown flags, result envelope, exit codes, and wrapper equivalence. |
| `docs/runbooks/product-line-seed.md` | New operator runbook for schema, modes, evidence, existing-target policy, residue policy, and Product Line B exclusion. |
| `docs/runbooks/mission-control-seed-predeploy.md` | Update existing runbook to point at the compatibility wrapper and generic evidence model. |
| `specs/010a-generic-product-line-seeder/quickstart.md` | Implementation validation commands and UAT evidence checklist. |

Out of scope files: migrations, UI components/routes, GitHub sync mutation code, task creation/dispatch/claim code, runner/sandbox/harness/auto-merge code, Product Line B configs or smoke artifacts.

## Phase 0: Research

Research complete in `research.md`. No unresolved technical questions remain.

## Phase 1: Design & Contracts

Design complete in:

- `data-model.md`
- `contracts/product-line-seed-config.md`
- `contracts/cli-result-envelope.md`
- `contracts/validation-error-codes.md`
- `quickstart.md`

The contracts define the reviewable YAML schema, generic CLI result envelope, and stable validation/error codes needed for SPEC-010B reuse.

## PR Review Packet Source

The PR description must be generated from:

- Reviewed config path: `docs/ai/product-lines/mission-control.yaml`
- What changed and why: extraction from Mission Control-specific seed constants into generic config/library/CLI
- Non-goals: no Product Line B, no UI, no migration, no runtime/admin config authoring, no GitHub mutation, no task creation, no dispatch/claim/runner/sandbox/adapter/auto-merge
- Review order: config, contracts/types/schema, validation/preflight, apply/verify/evidence, CLI/wrapper, tests, docs
- Scope budget: actual reviewable LOC, production file count, total file count, and primary surface count
- Traceability: FR-001 through FR-030 and SC-001 through SC-014 mapped through tests and quickstart evidence
- Verification: focused Vitest, `pnpm typecheck`, `pnpm lint`, `pnpm build`, apply-twice evidence, verify evidence, invalid-config no-mutation evidence, existing-target refusal evidence, wrapper parity evidence, and grep/static absence evidence
- Known gaps: no Product Line B real config or live smoke because SPEC-010B owns that work
- Rollback/flags: rollback is no-op by not running the seed command; seeded config-owned flags can be disabled through existing workspace flag state; no migration rollback is required

## Complexity Tracking

No constitution violations require a complexity exception. Reviewability warning thresholds are acknowledged; the split trigger is fixed in Technical Context.
