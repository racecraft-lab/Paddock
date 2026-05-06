# Implementation Plan: SPEC-009A Workflow Contract Format and Roundtrip

**Branch**: `009a-workflow-contract-roundtrip` | **Date**: 2026-05-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009a-workflow-contract-roundtrip/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

SPEC-009A makes Mission Control workflow policy repo-owned and roundtrippable without starting any self-hosting pilot behavior. YAML manifests under `docs/ai/workflows/mission-control/` become the canonical source; operator-run import/export tooling parses YAML through a typed canonical workflow-contract model, validates it with the existing AJV 8 strict profile, computes stable parity hashes, dry-runs or transactionally applies owned changes to `workflow_templates`, exports deterministic Markdown review output, preserves last-known-good snapshots, and exposes generic read-only workflow-contract diagnostics.

## Technical Context

**Language/Version**: TypeScript 5.7 strict in a Next.js 16 App Router / React 19 application  
**Primary Dependencies**: Next.js, React, Zustand, Tailwind CSS 3, `better-sqlite3`, existing direct `ajv@8.18.0`, exact direct `yaml@2.8.2` for SPEC-009A contract loading  
**Storage**: SQLite via `better-sqlite3`; existing `workflow_templates` runtime projection plus additive generic diagnostics tables in migration `071_workflow_contract_diagnostics`
**Testing**: Vitest for parser/model/schema/import/export/hash/transaction tests; Playwright for the read-only Workflow Contracts diagnostics surface  
**Target Platform**: Self-hosted Mission Control Node.js runtime and local operator CLI/scripts  
**Project Type**: Web application with local SQLite storage and operator-run import/export tooling  
**Performance Goals**: Contract operations stay bounded and deterministic for the small Mission Control workflow family; schema validation and hashing must avoid unbounded prompt or schema processing and reuse the existing constrained validator posture  
**Constraints**: Dry-run is default; apply requires explicit `--apply`; no runtime feature flag; no product-line seed, dispatch, retry execution, runner launch, sandbox lifecycle, harness adapter, GitHub ingest/sync, or resource-governance evaluator invocation; Markdown export is non-canonical; invalid input fails before mutation; apply uses one SQLite transaction for owned-template mutations, diagnostics writes, and last-known-good snapshot writes  
**Scale/Scope**: One canonical Mission Control workflow family with intake, planning, implementation, review, owner gate, and lifecycle metadata; reusable contract loader/import/export/diagnostics design for later workflow families  
**Strict Scope**: Add new SPEC-009A-owned production modules to `tsconfig.spec-strict.json` and `eslint.config.mjs`: `src/lib/workflow-contracts/types.ts`, `src/lib/workflow-contracts/yaml-loader.ts`, `src/lib/workflow-contracts/schema.ts`, `src/lib/workflow-contracts/validator.ts`, `src/lib/workflow-contracts/hash.ts`, `src/lib/workflow-contracts/diff.ts`, `src/lib/workflow-contracts/importer.ts`, `src/lib/workflow-contracts/exporter.ts`, `src/lib/workflow-contracts/diagnostics.ts`, `src/lib/workflow-contracts/recovery.ts`, `src/app/api/workflow-contracts/diagnostics/route.ts`, and diagnostics UI files added under the existing Orchestration/Workflows surface. Contract data files under `docs/ai/workflows/mission-control/`, CLI entrypoints under `scripts/`, migration M71, rollback SQL, fixtures, and tests are also spec-owned.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Plan Evidence |
|-----------|--------|---------------|
| I. Zero-Regression Contract | PASS | Existing workflow-template behavior is untouched unless an operator explicitly runs import apply mode. Dry-run performs no mutation. Apply only mutates contract-owned rows keyed by workspace plus slug. |
| II. Upstream Compatibility Discipline | PASS | Additive tooling, docs, generic diagnostics storage, and optional UI diagnostics are isolated from upstream-owned auth/layout surfaces. |
| IV. Test-First Development | PASS | Tasks must start with failing Vitest coverage for parser/model/import/export/diagnostics and Playwright coverage for diagnostics UI before production code. |
| V. Feature-Flag Resolution Discipline | PASS | SPEC-009A introduces no new runtime flag. Future feature flags are validated and roundtripped as inert data only. |
| VI. Dependency Supply-Chain Hygiene | PASS | `yaml@2.8.2` is an exact direct production dependency. AJV remains the existing direct pinned validator. No transitive YAML import, `ajv-formats`, or second schema validator is allowed. |
| VII. Additive Migration Policy | PASS | Diagnostics storage uses additive migration `071_workflow_contract_diagnostics` plus `docs/migrations/rollback-M71.sql`; no destructive changes or renames. |
| IX. Safe Evaluation Discipline | PASS | Output schema validation reuses the strict AJV profile and routing rules are validated as data without executing dispatch or routing behavior. |
| X. Observability and Auditability | PASS | Every import/export/recovery attempt records generic run diagnostics and validation errors; successful apply records a last-known-good snapshot and deterministic recovery command. |
| XII. Avoid Speculative Generality | PASS | Governance, concurrency, retry, sandbox, and adapter declarations are validated and stored as data only; enforcement remains owned by later specs. |
| XIV. Browser Evidence for UI Changes | PASS | If the diagnostics UI is implemented, Playwright must cover successful, changed, invalid, and no-last-known-good states in the real app surface. |

Archive/evidence retention is in scope because this spec touches SpecKit artifacts and generated review artifacts. Archive Sweep startup evidence is already recorded in the workflow; generated screenshots remain CI/Argos artifacts unless a manifest-backed exception is added.

## Project Structure

### Documentation (this feature)

```text
specs/009a-workflow-contract-roundtrip/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md
│   ├── workflow-contract-schema.md
│   └── diagnostics-api.md
└── tasks.md
```

### Source Code (repository root)

```text
docs/
├── ai/workflows/mission-control/
│   ├── workflow-contract.yaml
│   └── exports/workflow-contract.md
└── migrations/rollback-M71.sql

scripts/
└── workflow-contracts/
    └── workflow-contract-cli.ts

src/
├── app/api/workflow-contracts/diagnostics/route.ts
├── components/panels/orchestration-bar.tsx
└── lib/
    ├── migrations.ts
    └── workflow-contracts/
        ├── types.ts
        ├── yaml-loader.ts
        ├── schema.ts
        ├── validator.ts
        ├── hash.ts
        ├── diff.ts
        ├── importer.ts
        ├── exporter.ts
        ├── diagnostics.ts
        └── recovery.ts

src/lib/__tests__/workflow-contracts/
├── yaml-loader.test.ts
├── validator.test.ts
├── hash.test.ts
├── diff.test.ts
├── importer.test.ts
├── exporter.test.ts
├── diagnostics.test.ts
└── recovery.test.ts

tests/e2e/
└── workflow-contract-diagnostics.spec.ts
```

**Structure Decision**: Use one cohesive `src/lib/workflow-contracts/` boundary for parser/model/schema/hash/diff/import/export/recovery logic, one operator CLI wrapper under `scripts/` executed through Node's built-in TypeScript type stripping, additive M71 diagnostics storage, and a read-only diagnostics API/UI extension inside the existing Workflows admin surface. This keeps runtime dispatch, governance enforcement, scheduler, harness, and GitHub sync paths out of SPEC-009A.

## Phase 0: Research

Research resolved the dependency, parsing, validation, hash, transaction, diagnostics, and UI boundary decisions in [research.md](./research.md). No `NEEDS CLARIFICATION` markers remain.

## Phase 1: Design

Design artifacts:

- [data-model.md](./data-model.md): canonical contract, manifest, template, diff, diagnostics, and snapshot entities.
- [contracts/cli.md](./contracts/cli.md): import/export/recovery command behavior, modes, and exit codes.
- [contracts/workflow-contract-schema.md](./contracts/workflow-contract-schema.md): canonical YAML and typed model contract.
- [contracts/diagnostics-api.md](./contracts/diagnostics-api.md): read-only diagnostics API/UI contract.
- [quickstart.md](./quickstart.md): operator roundtrip and validation workflow.

### Post-Design Constitution Check

PASS. The design keeps YAML as exact direct `yaml@2.8.2`, reuses AJV 8 strict validation, adds only additive generic diagnostics schema at the next available M71 slot, requires explicit operator apply before runtime mutation, preserves last-known-good snapshots, and keeps governance/concurrency/retry/sandbox declarations as inert metadata. No downstream SPEC-009B/C/D, SPEC-013A-C, or SPEC-014A-D execution scope is introduced.

## Complexity Tracking

No constitution violations require justification.
