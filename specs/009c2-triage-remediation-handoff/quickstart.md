# Quickstart: SPEC-009C2 Validation

## Focused Automated Checks

```bash
pnpm test src/lib/__tests__/task-dispatch.test.ts src/lib/__tests__/task-chain-advancement.routing.test.ts src/lib/__tests__/spec-007-disposition-dispatch.test.ts src/lib/__tests__/workflow-contracts/importer.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

Automated tests must use fixtures and mocked sync seams. They must not require
`GITHUB_TOKEN` or mutate live GitHub.

## Manual Smoke

1. Create or select a fresh issue titled:
   `[mc-pilot] SPEC-009C2 synthetic e2e issue YYYY-MM-DD clean run`.
2. Apply labels: `mc:inbox`, one `priority:*`, and exactly one routable
   `area:*` label such as `area:dev`.
3. Run the operator-triggered GitHub sync path from SPEC-009C1.
4. Complete Issue Triage with `ACTIONABLE_REMEDIATION`.
5. Verify exactly one `mission-control_remediation_plan` successor.
6. Re-run the handoff and verify no duplicate successor appears.
7. Exercise each negative disposition in fixture or disposable local state and
   verify zero remediation successors.
8. Record disposition, artifact, and task-scoped activity evidence.
9. Close or explicitly retain the synthetic issue as evidence, then remove or
   document disposable Mission Control smoke rows.

## Out-of-Scope Checks

Do not verify SPEC-009C3 remediation execution, SPEC-009C4 owner merge
reconciliation, SPEC-009D review packets, SPEC-009E production evidence UI,
SPEC-009F production non-remediation lanes, or SPEC-013A1 GitHub sync
automation from this branch.
