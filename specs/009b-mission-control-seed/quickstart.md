# Quickstart: Mission Control Product-Line Seed and Flag Activation

## 1. Confirm Worktree and Package Manager

```bash
git rev-parse --abbrev-ref HEAD
ls -1 *lock*
```

Expected branch:

```text
009b-mission-control-seed
```

Expected package manager: `pnpm` from `pnpm-lock.yaml`.

## 2. Run Focused Tests During Implementation

```bash
pnpm exec vitest run src/lib/__tests__/mission-control-seed
pnpm typecheck
pnpm lint
```

Expected SPEC-009B focused result: the Mission Control seed suites pass with
redaction, seed, preflight, evidence, and guardrail coverage. Related
feature-flag regression suites should also pass when run with the focused seed
suites.

## 3. Preflight a Target Database

```bash
node --experimental-strip-types scripts/seed-mission-control-product-line.ts \
  --db .data/mission-control.db \
  --contract docs/ai/workflows/mission-control/workflow-contract.yaml \
  --mode preflight \
  --json
```

Equivalent package script form:

```bash
pnpm seed:mission-control -- \
  --db .data/mission-control.db \
  --contract docs/ai/workflows/mission-control/workflow-contract.yaml \
  --mode preflight \
  --json
```

If non-Mission-Control residue exists, the command exits blocked with:

```json
{
  "status": "blocked_preflight",
  "mutation_status": "not_mutated"
}
```

No automatic cleanup is performed.

## 4. Complete Operator Cleanup Checklist

Use the generated runbook before deployment:

```text
docs/runbooks/mission-control-seed-predeploy.md
```

The checklist must require backup/export first and cover `ssh hal` FocusEngine project state, tickets, GitHub sync configuration, OpenClaw/gateway GitHub automation or product-line binding cleanup targets, and issue-sync cron cleanup targets. Post-cleanup evidence must verify that only `racecraft-lab/mission-control` issue sync remains; OpenClaw runtime agent inventory alone may remain.

## 5. Apply the Seed

```bash
node --experimental-strip-types scripts/seed-mission-control-product-line.ts \
  --db .data/mission-control.db \
  --contract docs/ai/workflows/mission-control/workflow-contract.yaml \
  --mode apply \
  --json
```

The seed must:

- Preserve `facility`.
- Upsert `mission-control`.
- Create/update QA, Development, DevSecOps, Marketing, Customer Service, and Finance.
- Make QA the triage/inbox and repo sync-owner department.
- Preserve existing `racecraft-lab/mission-control` issue task linkage as unprocessed intake.
- Import required workflows through SPEC-009A workflow-contract functions.
- Enable Phase 1-7 prerequisite flags plus `PILOT_MISSION_CONTROL_E2E`.
- Seed advisory token/USD budget rows plus evaluator-inactive WIP visibility.
- Create no synthetic issue, claim, dispatch, runner, sandbox, or auto-merge state.

## 6. Verify Idempotency and Non-Dispatch

```bash
node --experimental-strip-types scripts/seed-mission-control-product-line.ts \
  --db .data/mission-control.db \
  --contract docs/ai/workflows/mission-control/workflow-contract.yaml \
  --mode apply \
  --json

node --experimental-strip-types scripts/seed-mission-control-product-line.ts \
  --db .data/mission-control.db \
  --contract docs/ai/workflows/mission-control/workflow-contract.yaml \
  --mode verify \
  --json
```

Expected verification:

- Stable counts after rerun.
- Exactly one non-facility `mission-control` Product Line.
- Exactly one preserved `facility` workspace.
- Six department projects.
- Six required role assignments.
- Required workflow slugs present.
- Canonical feature flags present with future flags off.
- Governance policy identities stable.
- Preserved issue-intake count unchanged.
- Zero new pilot tasks, successor records, per-agent seed tasks, claims, dispatches, runner rows, sandbox rows, synthetic GitHub issues, auto-merge, or reconciliation side effects.

## 7. Full Verification Before Completion

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

SPEC-009B completion evidence is recorded in
`docs/runbooks/mission-control-seed-predeploy.md`. If the local full unit suite
hits an environment-owned daemon/socket timeout, keep the failure recorded and
use the focused seed plus feature-flag regression suites as the spec-specific
evidence until the daemon environment is fixed.
