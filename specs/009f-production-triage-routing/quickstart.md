# Quickstart: Production Triage Outcome Routing

## Scope

SPEC-009F routes terminal non-remediation Issue Triage outcomes into stored recommendation evidence only. It does not mutate GitHub, create successor tasks, invoke SpecKit setup, dispatch agents, create runner/claim/sandbox/adapter state, or add migrations.

## Expected Implementation Order

1. Add RED payload validator tests for all six supported outcomes, including bad schema/version/field payloads and sanitized validation-failure reasons.
2. Implement `src/lib/triage-routing-payloads.ts`.
3. Add RED routing tests for gates, idempotency, supersession, conflicts, validation failure before artifact publishing, artifact-publish failure, no successors, and `ACTIONABLE_REMEDIATION` preservation.
4. Implement `src/lib/triage-routing.ts`.
5. Add RED task Evidence helper tests for `triage_routing`.
6. Extend `src/lib/task-evidence.ts`.
7. Add RED component tests for the `Triage routing` block.
8. Extend `src/components/panels/task-evidence-section.tsx`.
9. Add Playwright six-outcome Evidence inspection and fixture export under `test-results/spec-009f-triage-routing/`.
10. Add static/diff scope guard and UAT checklist section.

## Focused Verification

```bash
pnpm test src/lib/__tests__/triage-routing-payloads.test.ts src/lib/__tests__/triage-routing.test.ts src/lib/__tests__/task-evidence.test.ts src/components/panels/__tests__/task-evidence-section.test.tsx
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e tests/e2e/spec-009f-triage-routing.spec.ts
pnpm api:parity
node scripts/spec-009f/check-scope-guards.mjs
```

## Full Verification

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm api:parity
```

`pnpm test` may need to run outside the Codex sandbox per project guidance.

## UAT Evidence

Record a `SPEC-009F Production Triage Routing UAT` section in `docs/qa/pilot-smoke-checklist.md` with:

- Branch and commit.
- Command used.
- Fixture export path: `test-results/spec-009f-triage-routing/spec-009f-triage-routing-fixture-export.json`.
- Six-outcome matrix: `NEEDS_SPEC`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `DUPLICATE`, `OBSOLETE`, `INVALID`.
- Screenshot paths for each `Task evidence` region.
- Cleanup scope and post-cleanup zero counts.
- Explicit statement that no live GitHub issue was closed, commented, labeled, assigned, or mutated.
- Explicit statement that no Issue Remediation successor, non-remediation successor, claim, runner, sandbox, adapter, or auto-merge behavior was created.

## Guardrails

The implementation must fail review if any of these appear:

- New migration or rollback SQL for SPEC-009F.
- New runtime dependency.
- New external mutation API call for labels/comments/close/assign.
- `createTask()` call for non-remediation outcomes.
- New routing rule from non-remediation outcomes to `mission-control_specialist_route`, `mission-control_close_issue`, `mission-control_needs_spec_route`, or remediation.
- Operator action controls in `Triage routing`.
- Committed screenshots under `test-results/`.
