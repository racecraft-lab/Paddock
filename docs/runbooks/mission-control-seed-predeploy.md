# Mission Control Seed Predeploy Runbook

## Scope

SPEC-009B seeds Mission Control as Product Line A and verifies readiness. It does not unlink GitHub repos, delete tickets, stop OpenClaw agents, mutate cron jobs, create pilot tasks, claim work, dispatch agents, launch runners, create sandboxes, or merge pull requests.

## Preflight

Run preflight before any apply attempt:

```bash
node --experimental-strip-types scripts/seed-mission-control-product-line.ts \
  --db .data/mission-control.db \
  --contract docs/ai/workflows/mission-control/workflow-contract.yaml \
  --mode preflight \
  --operator-evidence src/lib/__tests__/mission-control-seed/fixtures/operator-evidence.json \
  --json
```

Expected clean-target result: `ok: true`, `status: "ready"`, `mutation_status: "not_mutated"`.

Expected dirty-target result: exit code `2`, `status: "blocked_preflight"`, `mutation_status: "not_mutated"`, redacted residue summaries, and this cleanup checklist path.

## Cleanup Checklist

1. Take a backup/export first of the Mission Control SQLite database, current GitHub-linked task rows, OpenClaw gateway config, and issue-sync cron state.
2. Confirm the target cleanup explicitly. The operator must record explicit operator confirmation before destructive cleanup of any FocusEngine project, repo sync, cron, OpenClaw gateway agent, or `ssh hall` state.
3. Remove only non-Mission-Control residue. Keep `racecraft-lab/mission-control` issue sync metadata intact because SPEC-009B re-homes it to QA triage/intake.
4. Treat FocusEngine cleanup as destructive cleanup. Unlink the FocusEngine GitHub repo, undo issue sync, remove FocusEngine tickets/projects from Mission Control, and remove OpenClaw/gateway agents or cron entries only after the backup/export and confirmation are complete.
5. Verify `ssh hall` and OpenClaw after cleanup. Check the Mission Control service, `openclaw-gateway.service`, issue-sync cron definitions, and gateway agent lists for leftover FocusEngine references.
6. Run post-cleanup verification with preflight again. The preflight output must be clean before `apply` mode is allowed.

## Apply

Run apply only after clean preflight:

```bash
node --experimental-strip-types scripts/seed-mission-control-product-line.ts \
  --db .data/mission-control.db \
  --contract docs/ai/workflows/mission-control/workflow-contract.yaml \
  --mode apply \
  --json
```

Expected result: `ok: true`, `status: "seeded"`, `mutation_status: "applied"`, six departments, six required role assignments, nine workflow templates, three governance rows, canonical `PILOT_MISSION_CONTROL_E2E`, and zero pilot task/chain records.

## Verify

Run verify after one apply and again after a second apply:

```bash
node --experimental-strip-types scripts/seed-mission-control-product-line.ts \
  --db .data/mission-control.db \
  --contract docs/ai/workflows/mission-control/workflow-contract.yaml \
  --mode verify \
  --json
```

Expected result: `ok: true`, `status: "verified"`, stable identity evidence, all canonical Mission Control feature flags enabled, all disallowed runner/sandbox/auto-merge/task-control flags disabled or absent, zero new pilot tasks, zero successor records, zero per-agent seed tasks, zero claims, zero dispatched state, zero runner rows, zero sandbox rows, and zero auto-merge markers.

## Validation Evidence

- `pnpm exec vitest run src/lib/__tests__/mission-control-seed/redaction.test.ts src/lib/__tests__/mission-control-seed/seed.test.ts src/lib/__tests__/mission-control-seed/preflight.test.ts src/lib/__tests__/mission-control-seed/evidence.test.ts src/lib/__tests__/mission-control-seed/guardrails.test.ts`: passed on 2026-05-07 with 5 files and 21 tests.
- `pnpm exec vitest run src/lib/__tests__/feature-flags.test.ts src/lib/__tests__/feature-flag-service.test.ts tests/integration/feature-flag-matrix.test.ts src/lib/__tests__/mission-control-seed/redaction.test.ts src/lib/__tests__/mission-control-seed/seed.test.ts src/lib/__tests__/mission-control-seed/preflight.test.ts src/lib/__tests__/mission-control-seed/evidence.test.ts src/lib/__tests__/mission-control-seed/guardrails.test.ts`: passed on 2026-05-07 with 8 files and 74 tests.
- `pnpm typecheck`: passed on 2026-05-07.
- `pnpm lint`: passed on 2026-05-07.
- `pnpm build`: passed on 2026-05-07 after rerunning outside the sandbox so Next.js could fetch configured fonts.
- `pnpm test:e2e`: passed on 2026-05-07 after rerunning outside the sandbox so Playwright could bind the local web server; 646 tests passed.
- `pnpm test`: ran on 2026-05-07; the full suite stopped on the existing local daemon socket timeout in `src/lib/__tests__/mc-provisioner-daemon.test.ts`. A single-test rerun failed the same way. SPEC-009B focused suites and feature-flag regressions passed as listed above.
- Full seed twice plus verify-mode evidence on a clean eligible target: covered by `src/lib/__tests__/mission-control-seed/evidence.test.ts`; two apply runs against a clean in-memory target produce the same identity hash and `verifyMissionControlSeed()` returns `ok: true`, `status: "verified"`. Verify mode also fails when any required Mission Control feature flag is missing or any explicitly disallowed runner/sandbox/auto-merge/task-control flag is enabled.
- Workflow contract import/export evidence: `pnpm workflow-contract import --db /private/tmp/spec009b-workflow.db --contract docs/ai/workflows/mission-control/workflow-contract.yaml --mode apply` and the matching export passed on 2026-05-07; exported hash `workflow-contract-hash-v1:sha256:4e485c97c7136a79619c362ba7de26cd9439ea49f60ea54a2f14414a7a287c92`.
