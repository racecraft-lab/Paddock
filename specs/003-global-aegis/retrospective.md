# SPEC-003 Retrospective

Recorded: 2026-04-28T22:10:54Z

## Summary

SPEC-003 implemented the feature-flagged global Aegis resolver in `src/lib/aegis.ts`, routed scheduler review dispatch through `getAegis(db, workspace_id?)`, preserved flag-off workspace-first behavior, preserved legacy workspace-scoped fallback, and kept Aegis completion gates on `quality_reviews.reviewer='aegis'`.

## Spec Adherence

- P2-AC1 flag-off workspace-first behavior: implemented and covered by unit and e2e tests.
- P2-AC2 flag-on global-first behavior: implemented and covered by unit and e2e tests.
- P2-AC3 legacy fallback behavior: implemented and covered by unit tests.
- P2-AC4 scheduler loop preservation: implemented through resolver-source-only dispatch changes and covered by task-dispatch tests.
- P2-AC5 global-only, workspace-only, and legacy scenarios: covered by focused resolver tests.
- P2-AC6 `quality_reviews.reviewer='aegis'` gate preservation: covered by route/task-dispatch guardrails and static checks.

## Implementation Drift

No product-scope drift was found into SPEC-004 task pipelines, SPEC-005 `ready_for_owner`, SPEC-006 area labels, SPEC-007 artifacts/dispositions, SPEC-008 governance, SPEC-009 pilot behavior, or SPEC-011 CrabTrap.

The only process drift was post-implementation tooling drift:

- Extension commands are installed as command files, but this Codex runtime does not expose a slash-command invoker.
- The `/loop` recurring review-remediation scheduler is unavailable in this runtime.

## Verification Outcome

- Focused Vitest: 4 files / 35 tests passed after the remediation pass.
- SPEC-003 e2e: `tests/e2e/spec-003-global-aegis.spec.ts` passed 2 tests.
- Full Playwright: 533 tests passed.
- Typecheck: passed.
- Lint: passed with 0 errors and 10 pre-existing warnings.
- Build: passed after rerunning with network access for Google Fonts.
- Full unit suite: still blocked by baseline GPG-agent and provisioner socket environment issues outside SPEC-003.

## Lessons

- Keep phase-specific e2e coverage in a spec-named file so autopilot post-gate discovery is unambiguous.
- Record post-extension gate evidence in a dedicated spec artifact when the runtime cannot invoke slash commands directly.
- Do not mark `/loop` as scheduled unless the runtime actually exposes the scheduling capability.
