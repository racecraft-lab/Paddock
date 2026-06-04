---
feature: 014b-adapter-manifest-fakes
branch: 014b-adapter-manifest-fakes
date: 2026-06-03T21:03:09Z
completion_rate: 100
spec_adherence: 96
critical_findings: 0
significant_findings: 0
minor_findings: 2
---

# SPEC-014B Retrospective

## Executive Summary

SPEC-014B delivered the intended typed fake harness adapter contract, fake registry, fail-closed runtime inventory read model, dedicated read-only API, and read-only Agents evidence surface without adding real harness execution or mutation controls.

## Requirement Coverage

| Area | Status | Evidence |
|------|--------|----------|
| Harness adapter contract | Implemented | Closed types, fake fixtures, manifest validation, registry checks |
| Runtime inventory read model | Implemented | Derived state, gate packets, reason precedence, lifecycle refs, summary counts |
| Read-only API | Implemented | `GET /api/agents/runtime-inventory` with bounded success/error envelopes |
| Agents evidence UI | Implemented | Existing Agents panel shows read-only inventory evidence without controls |
| Boundary preservation | Implemented | Static guard, route tests, repo knowledge guardrails, no migration |
| Manual UAT | Complete | Local manual UAT and post-merge HAL target UAT passed; skipped Playwright scaffold remains a future automation upgrade |

## Minor Deviations

| Deviation | Impact | Resolution |
|-----------|--------|------------|
| Strict mini-project could not include the Next route/panel graph without pulling legacy app-router/auth/database files outside SPEC-014B | Low | Strict-compatible modules stay in `tsconfig.spec-strict.json`; route/panel/e2e paths are covered by root typecheck, lint, focused Vitest, and Playwright |
| Default Turbopack build fails in linked worktree because `node_modules` points outside the project root | Low | Passing build proof uses `pnpm exec next build --webpack`; quickstart and workflow document the environment limitation |

## Constitution Compliance

No constitution violations found. SPEC-014B preserved zero-regression boundaries, feature-flag discipline, additive migration policy, observability/auditability, defensive evidence boundaries, and reviewability split rules.

## Lessons

- SPEC-014B’s ultimate purpose is not to prove Paddock has no harness support; Paddock already has OpenClaw, framework adapters, runtime/session observation, agent sync, and AgentRun surfaces. The spec formalizes a stricter manifest-driven eligibility and evidence contract so future real harness work can be reviewed before it mutates runtime behavior.
- Static guards need to scan both committed branch diffs and working-tree additions during autopilot closeout, otherwise uncommitted files can evade pre-commit scope checks.
- The linked-worktree Turbopack symlink limitation should stay documented until the local dependency layout changes.
