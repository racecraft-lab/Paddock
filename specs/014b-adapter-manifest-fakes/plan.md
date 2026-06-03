# Implementation Plan: SPEC-014B - Harness Adapter Manifest and Fake Registry

**Branch**: `014b-adapter-manifest-fakes` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014b-adapter-manifest-fakes/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

SPEC-014B introduces a stricter, synthetic-only harness adapter contract layer before any real harness adapter can launch, continue, or mutate work. The implementation will add typed checked-in fake manifests, closed manifest and evidence validators, a fail-closed capability-resolution/read-model path, a dedicated read-only `GET /api/agents/runtime-inventory` API returning `runtime_inventory.v1`, and read-only Agents surface evidence. Existing framework adapters, `/api/agents`, `/api/adapters`, dispatch, claim/retry/control, sandbox lifecycle, GitHub sync, governance mutation, scheduler, and successor-selection behavior remain unchanged.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22
**Primary Dependencies**: Next.js 16 App Router, React 19, Tailwind CSS 3, Zustand only where existing Agents panel patterns require it, `better-sqlite3` through existing read helpers, Vitest, Playwright; no new runtime dependency planned
**Storage**: Checked-in typed fixture files plus derived runtime inventory; no SQLite manifest or inventory persistence and no migration. Existing SQLite state may be read through existing helpers for assignments, tasks, governance/capability decisions, and SPEC-014A lifecycle evidence.
**Testing**: Vitest unit/contract tests, route tests, static scope guards, API index/OpenAPI parity checks, focused UI tests, and Playwright UAT against the running app
**Target Platform**: Paddock Next.js web application on Node >=22 plus authenticated browser UI
**Project Type**: Full-stack Next.js application with server route handlers and read-only React evidence surface
**Performance Goals**: Runtime inventory derivation is bounded, deterministic, local-only, and performs no external calls, process launches, scheduler dispatch, or gateway RPC; operators can identify state, manifest, failed gate, and lifecycle reference from the Agents surface in under 30 seconds.
**Constraints**: `FEATURE_AGENT_RUNNER_SANDBOXES` defaults OFF; v1 manifests are synthetic-only; unsupported capabilities/policies fail closed; unsafe evidence is rejected rather than redacted-and-continued; runtime inventory is read-only; no launch, assignment, retry, release, cancel, lifecycle, scheduler, GitHub, governance, tracker-truth, successor, or auto-merge mutation path is introduced.
**Scale/Scope**: Exactly two required fake manifest postures, one runtime inventory API route, one read-only Agents surface integration, five runtime inventory states, twelve public reason codes, seven sanitized fake evidence kinds, and focused tests/guards for the SPEC-014B boundary.
**Reviewability Budget**: Primary surface: harness/adapter contract. Secondary surfaces: thin read-only API projection and read-only Agents evidence. Projected reviewable LOC: 650-780; production files: 7; total files: 15-18; budget result: WARN because projected LOC exceeds 400 and production file count may exceed 6, but not blocked because the plan stays under 800 LOC, 8 production files, 25 total files, and one primary surface. Split boundary: if implementation exceeds any hard cap, adds a second primary surface, or requires behavior beyond read-only evidence, split the Agents UI enrichment into a follow-up `014b-ui-runtime-inventory` slice and keep SPEC-014B to typed manifests, validators, read model, and API contract. Real harness execution, lifecycle controls, scheduler integration, provider/account binding, and durable inventory persistence are explicitly deferred to later specs.
**Strict Scope**: Add these new spec-owned TS/TSX files to `tsconfig.spec-strict.json` and `eslint.config.mjs`: `src/lib/harness-adapters/types.ts`, `src/lib/harness-adapters/fixtures.ts`, `src/lib/harness-adapters/evidence.ts`, `src/lib/harness-adapters/validation.ts`, `src/lib/harness-adapters/runtime-inventory.ts`, `src/app/api/agents/runtime-inventory/route.ts`, `src/components/agents/RuntimeInventoryEvidence.tsx`, `src/lib/harness-adapters/__tests__/validation.test.ts`, `src/lib/harness-adapters/__tests__/runtime-inventory.test.ts`, `src/app/api/agents/runtime-inventory/route.test.ts`, and `tests/e2e/agents-runtime-inventory.spec.ts`. New JS guard files enter ESLint scope: `scripts/spec-014b/check-harness-adapter-scope.mjs`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Zero-Regression Contract**: PASS. All runtime behavior is guarded by `FEATURE_AGENT_RUNNER_SANDBOXES` and must preserve `/api/agents`, `/api/adapters`, existing task dispatch, and flag-off single-workspace behavior.
- **II. Install Compatibility And Operational Impact Discipline**: PASS. Classification: `optional-adapter` and `install-compatible`. No destructive migration, no SQL rename, no startup wrapper change, and no service deployment assumption change.
- **III. OpenClaw Adapter Isolation**: PASS. SPEC-014B may reference existing OpenClaw/session/runtime evidence only as input and must not call the OpenClaw gateway or duplicate gateway behavior.
- **IV. Test-First Development**: PASS. Tasks must start with failing validator, read-model, route, guard, and UI tests before implementation.
- **V. Feature-Flag Resolution Discipline**: PASS. Use `resolveFlag("FEATURE_AGENT_RUNNER_SANDBOXES", ctx)`; no inline `process.env.FEATURE_*` checks in runtime code.
- **VI. Dependency Supply-Chain Hygiene**: PASS. No new runtime dependency is planned; validator logic uses closed TypeScript checks and existing test tooling.
- **VII. Additive Migration Policy**: PASS. No migration and no rollback SQL are planned. If later implementation proves derived state impossible, stop and split before adding persistence.
- **VIII. Successor Side-Effect Parity**: PASS. No task creation, successor selection, or direct `INSERT INTO tasks` path is in scope.
- **IX. Safe Evaluation Discipline**: PASS. Manifest and evidence validation use closed enums, bounded arrays/strings, and deterministic issue caps; no eval, dynamic schema execution, or unsafe payload echoing.
- **X. Observability and Auditability**: PASS. The feature is read-only. Diagnostics are response-local and bounded; no failed task attempts, artifacts, claims, lifecycle rows, governance rows, scheduler rows, GitHub rows, or tracker-truth rows are written for fake-registry failures.
- **XI. Keep It Simple / XII. Avoid Speculative Generality**: PASS. The new layer owns only typed fake manifests, validation, capability resolution, and derived inventory. Real adapters, real provider bindings, execution controls, and durable runtime inventory are deferred.
- **XIII. Defensive Boundaries**: PASS. The HTTP route validates scope and filters before deriving entries, returns structured `400`, `403`, or `422` errors, and never includes unsafe input values.
- **XIV. Real UI Journey Quality Gate**: PASS. The plan requires a Playwright journey against the running app for flag-off, visible, unassigned, assigned, eligible, blocked, and unsupported-capability states with screenshot evidence.
- **XV. Spec Artifact Provenance And Archive Sweep**: PASS. Archive Sweep startup behavior remains discovery/dry-run for previously merged specs only; the current `014b-adapter-manifest-fakes` target is excluded from same-run cleanup. Generated UI screenshots stay CI/Argos artifacts unless a manifest-backed exception is created.
- **XVI. Reviewability And Verification Debt Control**: WARN, not blocked. The harness/adapter contract is the single primary surface; API and UI work are read-only secondary projections. The split boundary above is mandatory if hard caps are exceeded.

**Post-Design Recheck**: PASS with same WARN for Reviewability. `research.md`, `data-model.md`, `contracts/runtime-inventory-api.md`, and `quickstart.md` keep the feature within the read-only fake-registry boundary and include no migration, real harness execution, or mutation path.

## Project Structure

### Documentation (this feature)

```text
specs/014b-adapter-manifest-fakes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── runtime-inventory-api.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   └── api/
│       └── agents/
│           └── runtime-inventory/
│               ├── route.ts
│               └── route.test.ts
├── components/
│   └── agents/
│       └── RuntimeInventoryEvidence.tsx
└── lib/
    └── harness-adapters/
        ├── types.ts
        ├── fixtures.ts
        ├── evidence.ts
        ├── validation.ts
        ├── runtime-inventory.ts
        └── __tests__/
            ├── validation.test.ts
            └── runtime-inventory.test.ts

scripts/
└── spec-014b/
    └── check-harness-adapter-scope.mjs

tests/
└── e2e/
    └── agents-runtime-inventory.spec.ts

docs/
├── ai/
│   ├── repo-knowledge-index.json
│   └── repo-knowledge-index.schema.json
└── ...

openapi.json
tsconfig.spec-strict.json
eslint.config.mjs
```

**Structure Decision**: Use a new `src/lib/harness-adapters/` boundary for the stricter manifest, fake registry, validation, evidence, and runtime inventory read model. Keep existing `src/lib/adapters` as the compatibility surface. Add one API route under the existing Agents namespace and one read-only Agents component, plus tests and a static guard script.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | No constitution hard gate violation is accepted. | N/A |
