---
feature: SPEC-012B
branch: 012b-harness-gardening-guards
date: 2026-06-07
completion_rate: 100
spec_adherence: 100
critical_findings: 0
---

# SPEC-012B Retrospective

## Executive Summary

SPEC-012B completed 55/55 tasks and met the planned process/tooling-only scope. The implementation adds deterministic harness-gardening drift guards, non-mutating cleanup recommendations, guardrail integration, fixture coverage, and static scope-control evidence without runtime product behavior or live mutation.

## Proposed Spec Changes

None. The implementation matches the spec and no post-implementation spec edits are recommended.

## Requirement Coverage

| Area | Status | Notes |
|------|--------|-------|
| Functional requirements | Complete | FR-001 through FR-032 are implemented or verified through scripts, fixtures, reports, guardrails, and docs/process evidence |
| Success criteria | Complete | SC-001 through SC-012 are covered by fixture runs, deterministic JSON comparison, guardrail checks, discoverability entries, and scope evidence |
| User stories | Complete | US1 hard drift, US2 recommendation generation, and US3 warning-only advisory signals are independently testable |
| Non-goals | Preserved | No runtime behavior, migration, UI/API, scheduler/dispatch/claim/retry/sandbox/harness adapter, live GitHub/Paddock mutation, auto-merge, or automatic cleanup entered the diff |

## Architecture Drift

| Planned Architecture | Actual Result | Drift |
|----------------------|---------------|-------|
| Node.js process tooling using built-in modules where practical | Implemented in `scripts/spec-012b/*.mjs` without new runtime dependencies | None |
| Checked-in fixtures and report artifacts | Implemented under `scripts/spec-012b/fixtures/` and `specs/012b-harness-gardening-guards/.process/`; post-review remediation added default checked-in repo-artifact scanning for no-fixture guardrails runs | None after remediation |
| Separate guardrails suite preserving SPEC-012A | Implemented `harness-gardening` suite while `repo-knowledge-index` remains separate | None |
| Recommendation-only cleanup | Implemented non-mutating Paddock import and GitHub export drafts | None |
| Static scope closeout guard | Implemented self-test and current-diff modes | None |

## Verification Summary

- `validate-gate.sh G7`: pass after lowercase task-marker normalization.
- `count-markers.sh all`: 0 gaps, 0 clarifications, 0 critical, 0 high, 0 medium, 0 low.
- `reviewability-gate.sh diff origin/main...HEAD`: pass with transition exception.
- `pnpm guardrails`: pass with 4 suites.
- `pnpm typecheck`, `pnpm lint`, and unsandboxed `pnpm test`: pass under Node v22.22.2.
- PR review remediation: default no-fixture runs now scan checked-in repo artifacts, local absolute paths are redacted or portable, and the no-op fixture expression is removed without changing warning-only fixture intent.
- Full fixture matrix: expected hard-failure run with 15 findings and 15 recommendations.
- Deterministic JSON: two full-corpus runs matched byte-for-byte.

## Significant Deviations

None.

## Lessons Learned

- The G7 helper currently recognizes lowercase `[x]`; normalizing task markers before G7 avoids false incomplete counts.
- Node v22.22.2 remains the correct local verification runtime for native SQLite dependencies; Node v26 can break `better-sqlite3` rebuilds.
- Full fixture corpora that intentionally include hard failures need explicit review-packet wording so nonzero exit status is not confused with a broken guard.
- Default command paths need explicit tests that prove repo artifacts were scanned; otherwise a clean report can mask a no-op pass.

## Constitution Compliance

No constitution violations found. Test-first development, process provenance, reviewability exception documentation, no live mutation, and zero-runtime-regression boundaries were preserved.

## Follow-Up Recommendations

- Keep SPEC-012B focused on offline repo-artifact drift until a later explicit apply-mode or cleanup-execution spec is approved.
- Use the `harness-gardening` guardrails suite as a preflight for future cleanup specs.
- Do not apply archive cleanup from this branch; use the archive extension safe-base gate in a later explicit cleanup run.
