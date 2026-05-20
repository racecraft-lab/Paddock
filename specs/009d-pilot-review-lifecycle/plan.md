# Implementation Plan: Pilot Review Packet and Lifecycle Snapshot

**Branch**: `009d-pilot-review-lifecycle` | **Date**: 2026-05-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/009d-pilot-review-lifecycle/spec.md`

## Summary

SPEC-009D creates a reviewable pilot lifecycle packet from existing Mission Control evidence and publishes the result as two SPEC-007 task artifacts: canonical JSON and deterministic Markdown. The primary implementation surface is a pure `src/lib/pilot-review-packet.ts` derivation module, with focused Vitest coverage and reuse of existing `task_artifacts` publishing and read/list APIs. Packet assembly reads stored rows only; it performs no fresh GitHub calls, adds no schema migration, adds no runtime dependency, and introduces no dashboard, polling, retry, sandbox, adapter, claim authority, or harness execution surface.

## Technical Context

**Language/Version**: TypeScript 5.7 strict on Node >=22 with Next.js 16 App Router and React 19  
**Primary Dependencies**: Existing Next.js, React, Zustand where existing panels need it, Tailwind CSS 3, `better-sqlite3`, SPEC-007 `src/lib/task-artifacts.ts`, existing GitHub sync/task/quality-review/governance modules; no new runtime dependency  
**Storage**: SQLite through existing `better-sqlite3` synchronous helpers; packet output persists through existing `task_artifacts` rows  
**Testing**: Vitest for pure packet derivation, route-free artifact publication checks, source-map/contract tests, and local-only lookalike rejection; Playwright not required unless tasks later add a real UI journey  
**Target Platform**: Mission Control web application and local operator deployment  
**Project Type**: Next.js web application with server-side packet derivation and existing artifact APIs  
**Performance Goals**: Packet derivation uses bounded queries over one pilot task lifecycle and publishes two compact artifacts; no external network latency in assembly  
**Constraints**: No migration, no new dependency, no fresh GitHub API requirement, no dashboard, no automatic polling, no claim authority, no retry UI, no sandbox lifecycle, no adapter registry, no real harness execution  
**Scale/Scope**: One current self-hosting pilot lifecycle packet, including ineligible local-only candidate handling and explicit future-state deferrals  
**Reviewability Budget**: Primary surface `src/lib` packet derivation; projected reviewable LOC approximately 350-500 including tests; projected production files 1-2; projected total files 8-10; budget result warns only if tasks expand beyond 400 LOC, blocks above 800 LOC or more than one primary surface without split exception  
**Strict Scope**: Add new spec-owned TS file `src/lib/pilot-review-packet.ts` to `tsconfig.spec-strict.json` and `eslint.config.mjs`. Add any spec-owned tests under current test patterns without broad strict-scope globs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Zero-Regression Contract**: PASS. Existing single-workspace behavior is preserved because the packet is additive, derived from existing rows, and persisted through the existing task artifact surface.
- **II. Upstream Compatibility Discipline**: PASS. No upstream-owned identifier rename, destructive migration, or upstream-conflict change is planned.
- **III. OpenClaw Adapter Isolation**: PASS. No OpenClaw adapter or runtime reader is introduced.
- **IV. Test-First Development**: PASS. Tasks must start with failing Vitest coverage for candidate eligibility, source-map coverage, JSON/Markdown agreement, deferrals, and redaction/metadata behavior before implementation.
- **V. Feature-Flag Resolution Discipline**: PASS. No new runtime feature flag is planned. Existing `FEATURE_TASK_ARTIFACTS` behavior remains authoritative for artifact publishing/reading.
- **VI. Dependency Supply-Chain Hygiene**: PASS. No new dependency.
- **VII. Additive Migration Policy**: PASS. No schema migration or rollback file required.
- **VIII. Successor Side-Effect Parity**: PASS. No task creation path is introduced.
- **IX. Safe Evaluation Discipline**: PASS. Packet assembly performs deterministic row derivation and JSON serialization only; no expression evaluation.
- **X. Observability and Auditability**: PASS. Artifact publication uses existing `task_artifacts` provenance, hashes, byte counts, redaction status, security-scan status, preview semantics, and activity behavior.
- **XI. Keep It Simple**: PASS. One pure derivation module plus existing artifact publication is the simplest sufficient design.
- **XII. Avoid Speculative Generality**: PASS. Future control-plane fields are explicit deferrals with owner specs, not placeholder schema or runtime capability.
- **XIII. Defensive Boundaries, Trusting Interior**: PASS. The library boundary returns typed incomplete/ineligible states; trusted internal derivation relies on typed packet structures.
- **XIV. Real UI Journey Quality Gate**: PASS. No new user-facing UI journey is planned. If implementation later changes UI inspection, a real Playwright journey becomes mandatory.
- **XV. Spec Artifact Provenance And Archive Sweep**: PASS WITH REQUIRED EVIDENCE. The plan records Archive Sweep startup behavior, excludes the current target spec, and requires screenshot/evidence guard evidence because this spec touches `specs/**` and PR evidence.
- **XVI. Reviewability And Verification Debt Control**: PASS WITH TRANSITION WATCH. One primary surface is declared. Tasks must keep SPEC-009D under the transition exception boundary and split any SPEC-009E dashboard or SPEC-013/SPEC-014 control-plane expansion.

Post-design re-check: PASS. Phase 1 keeps the design to the same primary `src/lib` derivation surface and existing task artifact API; no second primary surface was introduced.

## Project Structure

### Documentation (this feature)

```text
specs/009d-pilot-review-lifecycle/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── pilot-review-packet.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── pilot-review-packet.ts
│   ├── task-artifacts.ts
│   ├── pilot-issue-eligibility.ts
│   ├── github-sync-engine.ts
│   └── __tests__/
│       ├── pilot-review-packet.test.ts
│       └── pilot-review-packet-artifacts.test.ts
└── app/
    └── api/
        └── task-artifacts/
            ├── route.ts
            └── [id]/route.ts
```

**Structure Decision**: Implement the packet in `src/lib/pilot-review-packet.ts`, reuse `publishArtifact()` from `src/lib/task-artifacts.ts`, and rely on existing `GET /api/task-artifacts?artifact_type=...` plus `GET /api/task-artifacts/[id]` for reviewer inspection. No new packet-specific API route is planned.

## Complexity Tracking

No constitution violations require justification. If generated tasks exceed one primary surface, 800 reviewable LOC, 8 production files, or 25 total files, implementation must split before coding rather than use this table as an exception.

## Phase 0: Research

See [research.md](./research.md). Decisions are resolved with no unresolved clarification markers:

- Persist packet as existing task artifacts, not a new table.
- Assemble from stored Mission Control evidence only, no fresh GitHub call.
- Publish both JSON and Markdown from the same source snapshot.
- Use source-map pointers for every evidence-backed claim.
- Encode future control-plane absence as explicit deferrals with owning future specs.
- Reject or mark incomplete local-only lookalikes lacking GitHub linkage or sync proof.
- Reuse SPEC-007 redaction, security-scan, hash, byte count, and preview semantics.

## Phase 1: Design And Contracts

See [data-model.md](./data-model.md) and [contracts/pilot-review-packet.md](./contracts/pilot-review-packet.md).

### Primary Architecture

`src/lib/pilot-review-packet.ts` owns pure packet derivation:

1. Select a candidate by stored `tasks.github_repo`, `tasks.github_issue_number`, `tasks.github_synced_at`, and linked `github_pr_number` or checklist-backed issue/PR evidence.
2. Gather lifecycle descendants, activities, notifications, artifacts, quality reviews, governance events, GitHub sync rows, and smoke checklist references from existing storage.
3. Build a single immutable packet snapshot with `schema_version="spec-009d.packet.v1"`.
4. Generate JSON and Markdown from that same snapshot.
5. Publish artifacts with `artifact_type="pilot_review_packet_json"` and `artifact_type="pilot_review_packet_markdown"` through `publishArtifact()`.
6. Return artifact ids, hashes, warnings, and ineligible/incomplete status when candidate proof is missing.

### Contracts Created

- `contracts/pilot-review-packet.md` defines the JSON packet shape, Markdown summary sections, source-map reference shape, artifact publication semantics, existing API read/list behavior, and error/incomplete states.

### Contracts Explicitly Not Created

- No OpenAPI route contract for a new packet-specific endpoint.
- No schema migration contract.
- No dashboard or UI contract.
- No runner, sandbox, adapter, claim, retry, or polling contract.

### Artifact Surface

Existing `POST /api/task-artifacts` is sufficient for publication if the implementation chooses route-mediated publishing. Existing `GET /api/task-artifacts?artifact_type=pilot_review_packet_json`, `GET /api/task-artifacts?artifact_type=pilot_review_packet_markdown`, and `GET /api/task-artifacts/[id]` are sufficient for inspection. The preferred implementation path is library-mediated publication from the packet assembler using `publishArtifact()` so the route surface remains unchanged.

### Redaction And Safety

The packet never inlines quarantined raw content, secret-bearing values, unsafe previews, storage URIs for locked content, actor identity for quarantined evidence, or oversized bodies. It records existing artifact metadata, packet-local `evidence_state`, warnings, hashes, byte sizes, and source-map pointers.

### Archive Sweep And Evidence Policy

- Startup behavior: Archive Sweep discovery or dry-run runs before Phase 0 in autopilot and considers only previously merged specs.
- Current target exclusion: `specs/009d-pilot-review-lifecycle` is excluded from same-run archival.
- Safety decision: cleanup is applied only from a safe reviewed context; unsafe or dirty worktrees dry-run or stop.
- Provenance fields: source paths, PR URL, merge commit or tree reference, CI/Argos links if relevant, cleanup mode, safe-to-apply state, and `git show <tree-ref>:specs/<feature>/...` recovery commands.
- Screenshot/evidence guard: generated UI screenshots are CI/Argos artifacts by default; committed binaries require a manifest-backed exception. SPEC-009D does not plan UI screenshots.

### Review Packet Source

The PR body for implementation must include: what changed, why, non-goals, review order, scope budget, traceability from FR/SC to tests, verification evidence, known gaps, rollback/flags, and explicit confirmation that no migration, dependency, new dashboard, polling, claim authority, retry UI, sandbox lifecycle, adapter registry, or real harness execution was introduced.

## G3 Readiness Notes

- Ready for checklist/tasks if generated tasks keep one primary `src/lib` surface and use existing task artifact APIs.
- G3 should block if tasks add a new API/dashboard, schema migration, runtime dependency, fresh GitHub call requirement, or SPEC-013/SPEC-014 control-plane capability.
- G3 should verify `source_map` coverage for every evidence-backed claim and JSON/Markdown consistency from the same snapshot.
- G3 should require local-only lookalike tests and stored GitHub linkage/sync proof tests.
- G3 should require strict-scope updates for `src/lib/pilot-review-packet.ts`.
