---
feature: 014c-first-real-harness-adapter
branch: 014c-first-real-harness-adapter
date: 2026-06-05T18:39:37Z
completion_rate: 100
spec_adherence: 97
critical_findings: 0
significant_findings: 0
minor_findings: 2
---

# SPEC-014C Retrospective

## Executive Summary

SPEC-014C delivered the first real Codex app-server harness adapter behind the SPEC-014B registry. The implementation launches one already-claimed, GitHub-linked, assigned, governance-allowed stage from the Paddock-owned sandbox, records descriptor-only run/attempt/lifecycle/activity/usage/artifact evidence, and fails closed on unsupported live events without mutating task terminal state, GitHub, successor selection, auto-merge, or governance.

## Requirement Coverage

| Area | Status | Evidence |
|------|--------|----------|
| Codex app-server manifest and registry integration | Implemented | Manifest tests, runtime inventory tests, `runtime-inventory.ts` integration |
| Claimed-stage dispatch handoff | Implemented | Dispatch admission tests, `task-dispatch-codex-app-server.ts`, narrow `task-dispatch.ts` hook |
| Official stdio app-server transport | Implemented | Runner/protocol tests and official-doc-grounded PR body; source docs at https://developers.openai.com/codex/app-server/ |
| Descriptor-only evidence | Implemented | Evidence schema, artifact safety tests, dispatch evidence contract |
| Fail-closed runtime events | Implemented | Protocol, runner, ownership, and no-mutation tests |
| HAL target UAT | Complete | Marker `SPEC-014C-HAL-UAT-20260605121830` passed on target commit `43989ac856696abb2ea764fed409da268b87c9a8` |
| PR closeout hygiene | Complete | Verify, verify-tasks, cleanup, review, retrospective, G7, doctor, reviewability, local checks, and PR checks recorded |

## Minor Deviations

| Deviation | Impact | Resolution |
|-----------|--------|------------|
| Generic reviewability thresholds are exceeded by the full branch diff | Low | Transition exception is recorded; production behavior remains bounded by one adapter plus narrow dispatch/evidence integration and is protected by scope/no-mutation guards |
| Plain shell runtime selected Node 26 during closeout | Low | Rebuilt `better-sqlite3` and reran validation under the documented `direnv exec .` Node 22.22.2 runtime |

## Constitution Compliance

No constitution violations found. SPEC-014C preserved install compatibility, feature-flag discipline, test-first evidence, dependency hygiene, additive migration policy, successor side-effect parity, safe evidence discipline, and reviewability split rules with a documented transition exception.

## Lessons

- Real adapter closeout needs a target UAT proof, not just deterministic fixture evidence. The HAL marker made that line concrete.
- The app-server runner must be grounded in the current official Codex app-server protocol because CLI/app-server transport details are still an evolving surface.
- Linked worktrees should consistently run validation through `direnv exec .`; native SQLite tests are sensitive to Node ABI drift.

## Follow-Up Ownership

- SPEC-014D owns OpenClaw/external adapter work.
- SPEC-014E owns richer transcript/event retention, replay/debug export, quarantine policy, retention windows, and any opt-in raw capture policy.
- SPEC-014F owns live operator intervention UI, user input, approval handling, answer capture, pause/resume, and stop controls.
