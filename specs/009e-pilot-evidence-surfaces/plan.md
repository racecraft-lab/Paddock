# Implementation Plan: Pilot Evidence Surfaces

**Branch**: `009e-pilot-evidence-surfaces` | **Date**: 2026-05-20 | **Spec**: `specs/009e-pilot-evidence-surfaces/spec.md`
**Input**: Feature specification from `/specs/009e-pilot-evidence-surfaces/spec.md`

## Summary

Add a generic, read-only task evidence read model at `GET /api/tasks/[id]/evidence` plus a compact Evidence section inside the existing task detail Details tab. The route derives eligibility, identity, packet, smoke, current-stage, warning, deferral, and source-map evidence from stored Mission Control rows and artifact metadata only. It does not generate packets, call GitHub, parse smoke-checklist Markdown at runtime, run smoke scripts, trigger sync, create activities, mutate tasks, or write artifacts.

The durable route is task-scoped rather than pilot-specific. As required by the design concept, "A route named `/pilot-evidence` would be too narrow if this is the durable pattern for all future task evidence." SPEC-009E is also explicitly display-only: "SPEC-009E adds no write actions."

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22
**Primary Dependencies**: Next.js 16 App Router, React 19, Zustand where existing task detail panels need it, Tailwind CSS 3, `better-sqlite3`; no new runtime dependency
**Storage**: SQLite through existing `better-sqlite3` helpers; no migration and no rollback SQL planned
**Testing**: Vitest route/helper/component coverage; Playwright real browser journey for task detail Evidence UI; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and UI journey validation
**Target Platform**: Mission Control web app on Node >=22
**Project Type**: Web application with API route plus operator-facing task detail UI
**Performance Goals**: Task evidence is a lightweight single-task aggregate read; no network calls or evidence generation on `GET`; operator can find retained pilot evidence from task detail in under 30 seconds
**Constraints**: Read-only, stored-evidence-only, no schema migration, no new dependency, no global Evidence page, no GitHub polling/sync lifecycle, no claim/reconciliation authority, no retry/debug controls, no sandbox lifecycle, no harness adapter manifest/execution, no workflow language change
**Scale/Scope**: One task-scoped API route/helper, one compact task detail Details section, focused tests, and UAT ledger update for retained issue #50 / PR #51 evidence
**Reviewability Budget**: Primary surface is API/read model with secondary UI display. Projected reviewable LOC: warn range but below block threshold. Projected production files: 4-6. Projected total files: 10-14. Budget result: allowed, with PR review order API/helper -> UI -> tests -> UAT ledger.
**Strict Scope**: Add every new TS/TSX module introduced by SPEC-009E to `tsconfig.spec-strict.json` and `eslint.config.mjs`; expected new modules are `src/lib/task-evidence.ts` and `src/app/api/tasks/[id]/evidence/route.ts` if implementation confirms those paths.

## Read-Only State Management Constraints

SPEC-009E is a read-only evidence presentation feature. The HTTP `GET` route, server helper, and UI must preserve HTTP safe-method expectations by retrieving stored evidence without requesting or causing origin-server state changes.

### Server Route / Helper

- Use read-only retrieval over existing task, activity, artifact, review, governance, GitHub sync, packet/source-map, and UAT reference rows.
- Do not perform database writes, task updates, artifact writes, packet generation, smoke execution, GitHub calls, sync triggers, queue/job enqueues, repair/backfill work, quarantine updates, supersession updates, redaction updates, activity writes, audit/event writes, or hidden refreshes.
- Treat user retry, page reload, and task-detail reopen as another read-only API request only.
- Use `data-model.md` §V1 Evidence State Model as the authoritative section-state matrix.

### Client UI

- Hold only ephemeral in-memory request/render state for loading, error, and current response display.
- Do not persist evidence state, derived evidence state, or local evidence overrides in `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies, URL parameters, Zustand persistence, or application-level persisted caches.
- Do not create local override controls or hidden local correction state for task evidence sections.
- Retry/reload may re-fetch the API response but must not refresh, repair, backfill, or mutate evidence.

## UI State Projection Contract

The UI display model is a one-way projection from the API evidence state model.

| API contract element | UI responsibility | Prohibited UI behavior |
| --- | --- | --- |
| `state` | Render the API-provided state through approved labels, colors, copy, and accessible descriptions. | No reinterpretation, synthesis, merge, upgrade, downgrade, hide, override, or coercion. |
| `reason` / `reason_code` / `missing` | Display or summarize API-provided reasons where the section design needs them. | No client-created evidence reason codes. |
| Freshness or stale metadata | Display API-provided stale/source-disagreement information when present. | No client-side freshness calculation or external refresh. |
| Completeness metadata | Display API-provided missing categories and incomplete state. | No client-side completion by merging neighboring sections or cached evidence. |
| `redacted`, `quarantined`, `superseded` | Preserve restricted/trust-state semantics exactly. | No cached fallback display, bypass, or local override. |
| Unknown API state | Render an explicit unsupported contract/error condition. | No coercion to `missing`, `unavailable`, `available`, or any other known evidence state. |

## Stored Text And Link Rendering Constraints

Stored evidence-derived strings are untrusted display text, even after artifact redaction or compaction. The route/helper may return safe labels, warning reasons, source-map notes, and preview text only as inert text fields unless a value is modeled as a typed contract reference.

- Do not parse stored values as raw HTML, script-capable markup, Markdown links, autolinks, or navigation triggers.
- Construct active links only from typed, allowlisted references in the task evidence contract: GitHub issue/PR references, artifact ids or hashes, source-map pointers, checklist anchors, or static UAT links.
- Validate typed URL references to allowed protocols and expected destination families before rendering as links.
- Render unsafe schemes such as `javascript:`, `data:`, `vbscript:`, and `file:` as inert text.
- Keep this behavior aligned with SPEC-009D packet Markdown precedent, where stored evidence strings are escaped and active links are generated only from packet-owned references.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Zero-Regression Contract**: PASS. The route is additive and task-scoped; non-evidence task detail behavior remains unchanged except for a compact read-only section. No migration or flag baseline changes.
- **II. Upstream Compatibility Discipline**: PASS. Additive route/helper/UI changes avoid renaming upstream-owned schema or identifiers.
- **III. OpenClaw Adapter Isolation**: N/A. No OpenClaw adapter or telemetry surface.
- **IV. Test-First Development**: PASS WITH PLAN REQUIREMENT. Tasks must start with failing Vitest/API/helper/UI tests and a real Playwright journey before implementation code.
- **V. Feature-Flag Resolution Discipline**: PASS. No new feature flag planned because this is an additive read-only task detail surface with no rollback-specific workspace behavior. If implementation discovers a flag need, it must use `resolveFlag(name, ctx)`.
- **VI. Dependency Supply-Chain Hygiene**: PASS. No new runtime dependency.
- **VII. Additive Migration Policy**: PASS. No migration or rollback SQL.
- **VIII. Successor Side-Effect Parity**: PASS. No task creation path is introduced; UAT disposable carrier rows, if needed, are test/operator setup only and must not add production `INSERT INTO tasks` paths outside `createTask()`.
- **IX. Safe Evaluation Discipline**: PASS. No new evaluator. Artifact evidence renders safe metadata only.
- **X. Observability and Auditability**: PASS. Viewing evidence is not state-changing and must not create activities. Existing stored provenance is surfaced through `source_map`.
- **XI. Keep It Simple**: PASS. A single read model helper and one compact Details section are the simplest current shape.
- **XII. Avoid Speculative Generality**: PASS. Generic route naming is required for task evidence durability, but v1 content remains pilot-derived and does not add a global evidence product.
- **XIII. Defensive Boundaries, Trusting Interior**: PASS. HTTP boundary returns existing auth/scope errors plus compact domain states for incomplete evidence; secret-bearing artifact metadata is not exposed.
- **XIV. Real UI Journey Quality Gate**: PASS WITH PLAN REQUIREMENT. Include a real Playwright browser journey against the running app for task detail Evidence UI, covering loaded retained pilot evidence, missing/incomplete proof, and deferred categories. Component tests may supplement only.
- **XV. Spec Artifact Provenance And Archive Sweep**: PASS WITH PLAN REQUIREMENT. Archive Sweep discovery remains before Phase 0 in autopilot. Current target `009e-pilot-evidence-surfaces` is excluded from same-run cleanup. Generated screenshots stay CI/Argos artifacts unless a manifest-backed exception is recorded.
- **XVI. Reviewability And Verification Debt Control**: PASS WITH WARNING. This spec touches API and UI, but the UI is a compact consumer of the same task evidence read model. No split is required if implementation stays under 800 reviewable LOC, 8 production files, and 25 total files.

### UI Journey Gate

- Playwright must boot the real app, authenticate through supported auth seams, seed or select deterministic data, open task detail, and verify the Evidence section using accessible labels.
- Accessibility assertions must cover keyboard navigation to the Details tab and within the Evidence section, including GitHub references, packet/artifact references, source-map pointers, warnings, missing-proof indicators, and deferred-section labels.
- Screen-reader-oriented assertions or manual notes must prove eligibility, current stage, packet references, missing proof, warnings, and deferred sections have distinguishable labels or descriptions and are not conveyed by color alone.
- Overflow/reflow evidence must include long packet names, GitHub references, source-map pointers, warning reason codes, and deferred labels at the narrow viewport used for UAT, with browser zoom up to 400% when practical.
- Required screenshots: loading or initial open state, retained pilot evidence loaded state, incomplete/not-eligible state, and deferred categories visible. Responsive screenshot is required if the touched task detail layout changes at narrow width.
- Docker-backed execution using the existing repository Docker build and disposable data directory is preferred when Docker is available; otherwise record the local app command and data directory used.
- Failing e2e output and screenshots must be reviewed before PR update. Known UI defects in the touched journey block PR update.

### Archive And Evidence Gate

- Archive Sweep runs before Phase 0 during autopilot and considers only previously merged specs.
- Cleanup is not part of SPEC-009E implementation. Unsafe branches or dirty worktrees use dry-run or stop behavior.
- UAT fixture rows, if created, require backup/export, before/after counts, owner/timestamp, cleanup notes, retained issue #50 / PR #51 reference, and checklist evidence before removal.
- Generated UI screenshots are CI/Argos artifacts by default; committed screenshots require manifest-backed exception.

### PR Review Packet Source

The PR body must include: what changed, why, non-goals, review order, scope budget, FR/SC traceability, verification commands, Playwright screenshot artifact locations, known gaps, and rollback/flag notes. Rollback is removing the additive route/helper/UI section; no database rollback exists.

### State Management Verification

- Verify every v1 response section in `data-model.md` §V1 Evidence State Model accepts only its allowed API states.
- Verify route/helper code performs read-only retrieval only: no persistence, mutation, job enqueue, refresh, repair, backfill, quarantine/supersession/redaction update, activity write, or audit/event write.
- Verify UI retry/reload only re-fetches the read-only API response.
- Verify the client stores no evidence override state in `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, cookies, URL parameters, Zustand persistence, or persisted app cache.
- Verify each API state renders according to the state model without client-side reinterpretation, synthesis, override, coercion, or client-side freshness/completeness inference.
- Verify unknown API state renders an explicit unsupported contract/error condition.
- Verify `redacted`, `quarantined`, and `superseded` never display cached or locally reconstructed evidence content.
- Verify stored evidence-derived strings containing Markdown links, raw HTML, autolinks, or unsafe URL schemes render as inert text, and that active links are produced only from typed, allowlisted task evidence references.

## Project Structure

### Documentation (this feature)

```text
specs/009e-pilot-evidence-surfaces/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── task-evidence.openapi.yaml
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   └── api/
│       └── tasks/
│           └── [id]/
│               └── evidence/
│                   └── route.ts
├── components/
│   └── [existing task detail component path]
├── lib/
│   ├── task-evidence.ts
│   ├── pilot-issue-eligibility.ts
│   └── pilot-review-packet.ts
└── lib/__tests__/
    └── task-evidence.test.ts

tests/
├── e2e/
│   └── [task detail evidence journey spec]
└── [existing API/component test locations]

docs/
└── qa/
    └── pilot-smoke-checklist.md
```

**Structure Decision**: Use one generic task-scoped route and one generic helper name (`task-evidence`) so future task evidence can reuse the contract, while v1 sections remain pilot-derived. The first UI surface belongs inside the existing task detail Details tab. A fourth modal tab is not planned because the section is compact and read-only.

## Complexity Tracking

No constitution violations require justification.

## Phase 0: Research Output

See `research.md`.

## Phase 1: Design Output

See `data-model.md`, `contracts/task-evidence.openapi.yaml`, and `quickstart.md`.

## Post-Design Constitution Check

- No unresolved clarification placeholders remain.
- No migration, dependency, global page, write action, polling lifecycle, claim authority, retry/debug, sandbox, adapter, harness, or workflow-language expansion is introduced.
- The design remains within the reviewability warning budget and below the blocking budget.
- User-facing UI coverage is explicitly assigned to real Playwright browser validation.
- Strict-scope updates are required for any new TS/TSX modules introduced by implementation.
