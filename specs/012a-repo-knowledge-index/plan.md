# Implementation Plan: SPEC-012A - Repo Knowledge Index and AGENTS Map

**Branch**: `012a-repo-knowledge-index` | **Date**: 2026-05-21 | **Spec**: `specs/012a-repo-knowledge-index/spec.md`
**Input**: Feature specification from `specs/012a-repo-knowledge-index/spec.md`

## Summary

SPEC-012A adds a repository-owned JSON knowledge index at `docs/ai/repo-knowledge-index.json`, a colocated JSON Schema, concise root `AGENTS.md` routing into that index, and deterministic local/CI guard scripts that validate required repo-local docs, metadata, required links, current status pointers, and fresh-agent discoverability. The implementation is process/tooling-only: small Node.js scripts using built-in modules, fixture-backed negative cases, package-script wiring, and guardrail integration through the existing `pnpm guardrails` quality-gate path.

## Technical Context

**Language/Version**: TypeScript 5.7 strict for the repository baseline; SPEC-012A-owned guard scripts use Node.js >=22 `.mjs` with built-in modules only
**Primary Dependencies**: Next.js 16 App Router, React 19, better-sqlite3, Zustand, Tailwind CSS 3 remain unchanged; no new runtime dependency and no new parser dependency
**Storage**: Checked-in JSON, JSON Schema, Markdown docs, and fixture files under `docs/ai/`, root `AGENTS.md`, `scripts/spec-012a/`, and `specs/012a-repo-knowledge-index/`
**Testing**: RED fixture-first guard validation, focused Node guard scripts, `pnpm typecheck`, `pnpm lint`, `pnpm guardrails`, and focused package scripts for index and fresh-agent checks
**Target Platform**: Repository checkout on Node.js >=22, local developer machines, and GitHub Actions quality gate
**Project Type**: Process/tooling feature inside an existing Next.js web application repository
**Performance Goals**: Guard and fresh-agent proxy checks complete in seconds on a clean checkout without network, secrets, `.gitnexus/`, or operator services
**Constraints**: No runtime source behavior changes, database migrations, UI changes, scheduler/runner changes, automatic GitHub sync, sandbox lifecycle changes, harness adapters, generated `.gitnexus/` artifacts, broad docs rewrites, or nested `AGENTS.md` rollout
**Scale/Scope**: Required discovery entries cover root instructions, PRD, roadmap, SpecKit workflow/status files, QA checklist, rollback runbook, workflow contract, and GitNexus guidance; optional future entries are allowed only when schema-valid
**Reviewability Budget**: Primary surface is docs/process. Projected reviewable LOC: approximately 350-500 across JSON index/schema, root map, two small Node scripts, fixtures, and package wiring. Production files: 0. Total files: approximately 12-15. Budget result: acceptable if implementation keeps guard logic compact and avoids expanding into runtime code.
**Strict Scope**: N/A for runtime strict TS scope because no new TS/TSX production modules are planned. New `.mjs` scripts do not enter `tsconfig.spec-strict.json`; implementation must keep `eslint.config.mjs` behavior compatible with repository linting if new script paths are linted.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- I. Zero-Regression Contract: PASS. No runtime behavior, database, feature flag, or UI path changes.
- II. Upstream Compatibility Discipline: PASS. Additive process/tooling files only; no upstream-owned runtime identifiers or destructive changes.
- IV. Test-First Development: PASS. Plan requires RED negative fixtures/tests for missing metadata, missing required docs, stale status pointers, and broken required links before guard implementation.
- VI. Dependency Supply-Chain Hygiene: PASS. No new runtime dependencies; JSON validation is implemented with built-in Node checks tailored to the required schema.
- VII. Additive Migration Policy: PASS. No migrations.
- XI/XII. Keep It Simple and Avoid Speculative Generality: PASS. First version validates only the required index, metadata, links, status-pointer relationship, and fresh-agent smoke targets.
- XIII. Defensive Boundaries: PASS. Guard scripts must emit actionable failures naming entry path/field/file relationship and classify external URL/wiki links as warnings without fetching.
- XIV. Real UI Journey Quality Gate: N/A. No UI journey changes.
- XV. Spec Artifact Provenance And Archive Sweep: PASS. SPEC-012A touches spec/process artifacts and must record archive sweep status in PR evidence; current target spec is excluded from cleanup.
- XVI. Reviewability And Verification Debt Control: PASS. Single primary surface (`docs/process`) with focused scripts and no runtime code.

For all specs:

- Primary review surface: docs/process.
- Secondary surfaces: package-script wiring and CI guardrail wiring only.
- Split decision: no split needed if implementation stays within the planned files and avoids runtime source changes. If the guard grows beyond the budget or needs runtime integration, split the extra behavior into a later spec.
- PR review packet source: summarize the index/schema, root map, guard commands, fresh-agent proxy, package/CI wiring, negative fixtures, verification evidence, non-goals, known warnings, and rollback instructions.

Archive/evidence policy:

- Archive Sweep discovery runs before implementation via the autopilot lifecycle and excludes `specs/012a-repo-knowledge-index/` from same-run cleanup.
- Cleanup of completed prior specs is not a SPEC-012A deliverable unless the archive extension reports a safe reviewed cleanup path.
- Generated screenshots are not expected; guard output and fixture logs are text evidence.

## Project Structure

### Documentation (this feature)

```text
specs/012a-repo-knowledge-index/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── repo-knowledge-index-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
AGENTS.md
docs/
├── ai/
│   ├── repo-knowledge-index.json
│   ├── repo-knowledge-index.schema.json
│   ├── rc-factory-technical-roadmap.md
│   ├── specs/
│   │   ├── SPEC-012A-workflow.md
│   │   └── autopilot-state.json
│   └── workflows/mission-control/workflow-contract.yaml
├── qa/pilot-smoke-checklist.md
└── runbook/migration-rollback.md
scripts/
├── check-guardrails.mjs
└── spec-012a/
    ├── verify-repo-knowledge-index.mjs
    ├── fresh-agent-proxy.mjs
    └── fixtures/
        ├── broken-required-link/
        ├── missing-required-doc/
        ├── missing-required-metadata/
        └── stale-status-pointer/
package.json
.github/workflows/quality-gate.yml
```

**Structure Decision**: Use the existing single-repository layout. Canonical knowledge artifacts live under `docs/ai/`; root `AGENTS.md` stays the concise human map; guard scripts live under `scripts/spec-012a/`; `scripts/check-guardrails.mjs` wires the blocking validation suite into the already-CI-run `pnpm guardrails` command.

## Complexity Tracking

No constitution violations require justification.

## Phase 0: Research

Research output is recorded in `research.md`. Decisions:

- JSON plus colocated JSON Schema is the canonical machine-readable index format.
- Built-in Node.js validation keeps the guard small and avoids adding dependencies.
- Hard failures are limited to required repo-local docs, required metadata, required links, invalid related spec IDs, and the SPEC-012A status-pointer relationship.
- Warnings cover external URLs, Obsidian-style wikilinks, and optional links unless declared repo-owned and required.
- GitNexus stays optional operator tooling; `.gitnexus/` is neither committed nor required by CI.

## Phase 1: Design And Contracts

Design artifacts:

- `data-model.md`: defines Knowledge Index, Canonical Index Entry, Freshness Rule, Link Finding, Status Pointer, and Fresh-Agent Target.
- `contracts/repo-knowledge-index-contract.md`: defines JSON index shape, required entries, guard command behavior, fresh-agent proxy behavior, failure/warning expectations, and package scripts.
- `quickstart.md`: gives local verification commands, negative fixture checks, and clean-checkout expectations.

Implementation contract:

- Add focused package scripts for canonical index validation and fresh-agent proxy smoke checks.
- Update `pnpm guardrails` through `scripts/check-guardrails.mjs` so CI quality gate runs blocking index validation.
- Do not require `.gitnexus/`, `.envrc.local`, network fetches, secret material, or operator-only services.

## Post-Design Constitution Check

- Zero-regression/runtime boundary remains PASS: planned changes are docs/process/scripts/package wiring only.
- Dependency hygiene remains PASS: no new dependency is planned.
- TDD remains PASS: negative fixtures are required before guard implementation.
- Reviewability remains PASS if guard scripts stay focused and package/CI wiring remains the only secondary surface.
- Archive/evidence policy remains PASS: plan records SPEC-012A as current-target excluded from archive cleanup and uses text guard evidence.
