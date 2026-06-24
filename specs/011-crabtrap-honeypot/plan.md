# Implementation Plan: SPEC-011 CrabTrap Honeypot Adapter

**Branch**: `011-crabtrap-honeypot` | **Date**: 2026-06-24 | **Spec**: `specs/011-crabtrap-honeypot/spec.md`

**Input**: Feature specification from `specs/011-crabtrap-honeypot/spec.md`, workflow context from `docs/ai/specs/.process/SPEC-011-workflow.md`, design concept from `docs/ai/specs/.process/SPEC-011-design-concept.md`, and fixture UAT guidance from `specs/011-crabtrap-honeypot/.process/uat-runbook.md`.

## Summary

SPEC-011 adds a helper-only, disabled-by-default CrabTrap evidence adapter that accepts Paddock-owned signed denial-summary fixtures, validates them through strict safety controls, and writes exactly one bounded `activities.type='security_intrusion_detected'` row for each accepted unique event. The plan keeps the slice isolated to `src/lib/crabtrap-adapter.ts`, central feature flag registration, focused tests/fixtures, guardrails, docs, and UAT artifacts, with no production route, webhook receiver, OpenAPI change, schema migration, scheduler/task-dispatch dependency, UI panel, notification fanout, GitHub mutation, task terminal mutation, or successor-selection behavior.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node.js >=22.

**Primary Dependencies**: Existing Next.js 16 App Router / React 19 baseline, `better-sqlite3`, existing feature-flag helper, existing activity persistence patterns, Node built-in `crypto`; no new runtime dependency planned.

**Storage**: Existing SQLite `activities` table through `better-sqlite3`; no schema migration, no new table, no raw audit persistence.

**Testing**: Focused Vitest coverage for the adapter, feature flag/config no-op paths, signed fixture acceptance, malformed/unsigned/stale/replayed/oversized/unsafe rejection, and activity write failure isolation; guardrail/static scope proof; fixture UAT through existing activity inspection.

**Target Platform**: Paddock server runtime on Node >=22; helper-only library surface invoked by tests/UAT, not a Next.js route or scheduler path.

**Project Type**: Web application with a server-side helper library adapter.

**Performance Goals**: Reject payloads larger than 16 KiB before JSON parse; complete fixture UAT in under 15 minutes; keep adapter work deterministic and bounded to one fixture at a time.

**Constraints**: Feature flag defaults off; all runtime gating uses `resolveFlag('FEATURE_CRABTRAP_HONEYPOT', ctx)`; config must be valid before signature acceptance; accepted activity `data` stores bounded summaries and hashes only; diagnostics use closed failure codes and never include raw values, matched substrings, raw secret hashes, signing material, headers, bodies, cookies, auth material, query secrets, provider payloads, raw actor identifiers, or full audit rows.

**Scale/Scope**: One new production helper module, one narrow feature flag registration, one focused test file, bounded fixtures/UAT/docs/guardrails updates, and a projected 250-400 reviewable LOC excluding SpecKit artifacts.

**Reviewability Budget**: Primary surface `harness/adapter`; secondary surfaces `seed/config` and `docs/process`; projected production files 2; projected total files 8-12; projected reviewable LOC 250-400; budget result: within warning/block thresholds and no split required.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Plan decision | Gate |
|---|---|---|
| I. Zero-regression contract | Feature flag off and missing/invalid config are explicit no-op outcomes that write no activity and require no CrabTrap runtime. | PASS |
| II. Optional-adapter discipline | CrabTrap remains `optional-adapter`, disabled by default, absent-safe, and schema-free. | PASS |
| IV. Test-first development | Tasks must start with failing focused Vitest coverage before adapter implementation. | PASS |
| V. Feature-flag resolution discipline | Register `FEATURE_CRABTRAP_HONEYPOT` centrally and gate through `resolveFlag`; no inline `process.env.FEATURE_*` checks. | PASS |
| VI. Dependency supply-chain hygiene | Use Node built-in `crypto`; no new runtime dependency. | PASS |
| VII. Additive migration policy | No migration and no rollback SQL because existing `activities` is reused. | PASS |
| X. Observability and auditability | Accepted events write existing-schema activity evidence; invalid events return bounded diagnostics without unsafe persistence. | PASS |
| XI/XII. Simplicity and no speculative generality | Helper-only adapter; no route, admin poller, notification fanout, OpenAPI entry, or live CrabTrap integration in this slice. | PASS |
| XIII. Defensive boundaries | Treat fixture input as untrusted: size guard, JSON parse guard, strict schema, unsafe-field scan, HMAC, freshness, replay check, bounded failure codes. | PASS |
| XIV. Real UI journey quality gate | No UI journey is added or changed; Playwright UI evidence is not required for this phase. | PASS |
| XVI. Reviewability control | Primary surface and file/LOC budget stay within accepted setup budget; deferred runtime integration remains follow-up work. | PASS |

**Post-design re-check**: Phase 1 artifacts preserve helper-only scope, no new dependency, no schema migration, no OpenAPI/UI/scheduler/task-dispatch path, and no unresolved clarification markers.

## Research Decisions

Phase 0 output is recorded in `specs/011-crabtrap-honeypot/research.md`.

Key decisions:

- Use a Paddock-owned signed fixture contract, not raw CrabTrap webhook/admin/audit rows.
- Use Node built-in `crypto` for SHA-256, HMAC-SHA256, and constant-time comparison.
- Use existing `activities` persistence and workspace/facility landing scope; do not add replay tables.
- Use `data.replay_key_hash` derived by the adapter from bounded event identity.
- Keep live CrabTrap Docker evidence optional deploy evidence, not a blocking completion gate.

## Data Model

Phase 1 data model output is recorded in `specs/011-crabtrap-honeypot/data-model.md`.

Primary model boundaries:

- `CrabTrapDenialSummary`: strict flat fixture input.
- `CrabTrapAdapterConfig`: validated helper config and signing policy.
- `CrabTrapAdapterContext`: feature-flag and approved workspace/project landing context.
- `CrabTrapIntakeResult`: accepted/no-op/rejected outcome with closed failure codes.
- `SecurityActivityEvidence`: bounded existing-schema activity row data.
- `ReplayIdentity`: adapter-derived hash over bounded source/event/time fields.

## Contracts

Phase 1 contract output is recorded in `specs/011-crabtrap-honeypot/contracts/crabtrap-denial-summary.v1.schema.json`.

The contract defines the accepted helper fixture shape only. It does not define a runtime route, webhook headers, OpenAPI path, admin-polling shape, or notification contract.

## Project Structure

### Documentation (this feature)

```text
specs/011-crabtrap-honeypot/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── crabtrap-denial-summary.v1.schema.json
├── spec.md
├── checklists/
└── .process/
    └── uat-runbook.md
```

### Planned Source And Test Layout

```text
src/lib/crabtrap-adapter.ts
src/lib/feature-flags.ts
src/lib/__tests__/crabtrap-adapter.test.ts
src/lib/__tests__/fixtures/crabtrap/
scripts/check-guardrails.mjs
specs/011-crabtrap-honeypot/.process/uat-runbook.md
```

**Structure Decision**: Use the existing `src/lib` helper pattern. The only new production module is `src/lib/crabtrap-adapter.ts`; `src/lib/feature-flags.ts` is touched only to register the default-off flag. Tests and fixtures stay under existing `src/lib/__tests__` conventions. Guardrail/docs/UAT updates are limited to proving SPEC-011 ownership and scope control.

## Strict Scope Entries

Implementation must add the new TypeScript modules to project strict scope:

- `src/lib/crabtrap-adapter.ts`
- `src/lib/__tests__/crabtrap-adapter.test.ts`

Existing files such as `src/lib/feature-flags.ts` and `scripts/check-guardrails.mjs` are modified narrowly and are not new modules.

## Implementation Blueprint

1. Write failing focused Vitest tests for flag-off, config missing/invalid, valid signed fixture, malformed JSON, unsigned payload, stale timestamp, invalid signature, replay, oversized payload, unsafe fields, unsupported decision/method, and activity write failure isolation.
2. Register `FEATURE_CRABTRAP_HONEYPOT` as a typed default-off flag.
3. Implement `src/lib/crabtrap-adapter.ts` with explicit input/result types, deterministic canonical JSON hashing, HMAC verification, strict schema validation, unsafe-field rejection, replay hash derivation, workspace/facility landing selection, and existing-schema activity insert.
4. Keep all failure outcomes bounded to `crabtrap_intake_failure_code.v1` and write no activity for no-op/rejection paths.
5. Add fixtures and guardrail ownership updates only where needed for SPEC-011 markers and no-raw-persistence/scope-control proof.
6. Update `specs/011-crabtrap-honeypot/.process/uat-runbook.md` with exact commands/evidence after implementation adds the focused test/UAT harness.

## Validation Plan

- `pnpm vitest run src/lib/__tests__/crabtrap-adapter.test.ts`
- `pnpm guardrails`
- `pnpm typecheck`
- `pnpm lint`
- Fixture UAT from `specs/011-crabtrap-honeypot/quickstart.md` and `specs/011-crabtrap-honeypot/.process/uat-runbook.md`
- Scope-control proof that the diff contains no route, webhook receiver, admin poller, custom sender, OpenAPI contract, migration, scheduler/task-dispatch path, UI panel, notification fanout, GitHub mutation, task terminal mutation, or successor-selection behavior.

## Complexity Tracking

No constitution violations or split exceptions are required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| N/A | N/A | N/A |

## Deferred Work

Deferred to future CrabTrap architecture/follow-up specs:

- Private runtime route or webhook receiver.
- CrabTrap custom sender integration.
- Admin API polling.
- Notification or alert fanout.
- Dedicated UI/dashboard/reporting surface.
- Live CrabTrap Docker deployment as a required merge gate.
- Durable replay table or cross-workspace replay protection beyond existing activity lookup.
