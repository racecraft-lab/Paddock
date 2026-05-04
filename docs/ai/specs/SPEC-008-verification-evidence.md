# SPEC-008 verification evidence

**Generated**: 2026-05-03T07:59:22Z
**HEAD**: 1690ead

Runs the SPEC-008 verification suite that is runnable without a
live Mission Control instance. Soak (T367) and chaos (T368 verification
steps) are intentionally skipped — they require running infra and are
operator-gated.

---

## PR #26 final rerun — 2026-05-03

Follow-up validation after closing two PR #26 UI gate regressions and the
remote CodeQL annotations reported on the pushed PR head:

- The local full `pnpm test:e2e` quality-gate path was leaking auth-workspace
  feature flags after SPEC-008 matrix tests. The fixture now snapshots and
  restores workspace `1` through the app's admin API.
- Docker Playwright runs were intermittently returning
  `SQLITE_IOERR_SHORT_READ` from `/api/governance/decisions` and
  `/api/governance/dispatch` because the fixture opened the Docker-mounted
  SQLite file from the host while the app container was live. The fixture no
  longer opens that DB directly.
- CodeQL reported `js/command-line-injection` at the centralized command
  runner sink and `js/biased-cryptographic-random` in the shared E2E helper.
  The command runner now resolves executables through an audited allowlist
  before reaching the spawn sink; the E2E helper now uses `crypto.randomInt`
  for the randomized login IP.
- visual snapshot captures are temporarily disabled in PR CI while the account is quota
  blocked. Storybook and Docker visual jobs still generate screenshots and
  enforce visual manifest locally; the external visual snapshot capture/status is no
  longer part of the required CI path for now.

| Command | Result |
| --- | --- |
| `pnpm exec eslint 'src/app/api/admin/workspaces/[id]/feature-flags/route.ts' tests/e2e/spec-008/governance-fixtures.ts` | PASS |
| `pnpm exec eslint src/lib/command.ts tests/helpers.ts` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm vitest run src/app/api/admin/spec-008/__tests__/auth-gate.test.ts` | PASS, 24 tests |
| `pnpm vitest run src/lib/__tests__/command.test.ts` | PASS, 2 tests |
| `pnpm build` | PASS after rerun with network for `next/font` |
| `pnpm exec playwright test tests/e2e/feature-flag-matrix.e2e.ts tests/workspace-switcher-flag-off.spec.ts --reporter=list` | PASS, 21 tests |
| `MC_E2E_DOCKER_PRESEED=1 MC_VISUAL_SNAPSHOTS=1 SPEC_008_AXE_ENABLED=1 bash scripts/e2e-docker.sh tests/e2e/governance-diagnostic-feed.e2e.ts tests/e2e/governance-dispatch-feed.spec.ts` | PASS, 6 tests |
| `MC_E2E_DOCKER_PRESEED=1 MC_VISUAL_SNAPSHOTS=1 SPEC_008_AXE_ENABLED=1 bash scripts/e2e-docker.sh` | PASS, clean flag-off + 123 seeded tests |
| `pnpm test:e2e` | PASS, 645 tests |
| `pnpm lint` | PASS |
| `pnpm test` | PASS after socket-bind approval for `mc-provisioner-daemon`: 252 files; 2708 tests passed, 1 skipped, 84 todo |
| `MC_VISUAL_SNAPSHOTS=1 SPEC_008_AXE_ENABLED=1 pnpm exec playwright test ...` visual subset | PASS, 123 tests |
| `CI=true MC_VISUAL_SNAPSHOTS=1 pnpm test:visual:storybook` | PASS after socket-bind approval, 30 files / 152 stories |
| `node scripts/verify-visual-manifest.mjs --mode playwright` | PASS, 149 metadata files across 118 Playwright tests |
| `node scripts/verify-visual-manifest.mjs --mode storybook` | PASS, 170 metadata files across 152 Storybook stories |
| `git diff --check` | PASS |

---

## T361 — pnpm typecheck

```

> mission-control@2.0.1 typecheck /Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance
> pnpm run verify:node && tsc -b --pretty false


> mission-control@2.0.1 verify:node /Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance
> node scripts/check-node-version.mjs

```

**T361 — pnpm typecheck**: PASS

## T360 — pnpm lint

```

> mission-control@2.0.1 lint /Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance
> pnpm run verify:node && eslint .


> mission-control@2.0.1 verify:node /Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance
> node scripts/check-node-version.mjs


/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/src/app/api/governance/windows/[id]/route.ts
  48:1  warning  Unused eslint-disable directive (no problems were reported from '@typescript-eslint/require-await')

/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/src/app/api/projects/[id]/__tests__/route.test.ts
  545:28  warning  Unused eslint-disable directive (no problems were reported from 'no-unreachable')

/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/src/components/modals/exec-approval-overlay.tsx
  57:6  warning  React Hook useEffect has a missing dependency: 'active'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/src/components/panels/agent-detail-tabs.tsx
  2185:36  warning  React Hook useEffect has a missing dependency: 'loadFiles'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/src/components/panels/agent-squad-panel.tsx
  74:6  warning  React Hook useCallback has a missing dependency: 't'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/src/components/panels/audit-trail-panel.tsx
  273:6  warning  React Hook useCallback has a missing dependency: 't'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/src/components/panels/memory-graph.tsx
  104:9  warning  The 'agents' logical expression could make the dependencies of useMemo Hook (at line 146) change on every render. To fix this, wrap the initialization of 'agents' in its own useMemo() Hook      react-hooks/exhaustive-deps
  104:9  warning  The 'agents' logical expression could make the dependencies of useMemo Hook (at line 256) change on every render. To fix this, wrap the initialization of 'agents' in its own useMemo() Hook      react-hooks/exhaustive-deps
  104:9  warning  The 'agents' logical expression could make the dependencies of useCallback Hook (at line 312) change on every render. To fix this, wrap the initialization of 'agents' in its own useMemo() Hook  react-hooks/exhaustive-deps

/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/src/components/panels/security-audit-panel.tsx
  338:55  warning  The ref value 'prefetchControllersRef.current' will likely have changed by the time this effect cleanup function runs. If this ref points to a node rendered by React, copy 'prefetchControllersRef.current' to a variable inside the effect, and use that variable in the cleanup function  react-hooks/exhaustive-deps

/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/src/components/panels/user-management-panel.tsx
  94:6  warning  React Hook useCallback has a missing dependency: 't'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/src/lib/__tests__/mc-provisioner-daemon.test.ts
  12:3  warning  Unused eslint-disable directive (no problems were reported from 'no-constant-condition')

/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/src/lib/github-sync-engine.ts
  184:5  warning  Unused eslint-disable directive (no problems were reported from 'no-console')

/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/src/lib/governance-activity-middleware.ts
  219:7  warning  Unused eslint-disable directive (no problems were reported from '@typescript-eslint/only-throw-error')

/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/tests/e2e/spec-008/governance-axe-shim.ts
  41:5  warning  Unused eslint-disable directive (no problems were reported from 'no-console')
  59:5  warning  Unused eslint-disable directive (no problems were reported from 'no-console')

✖ 16 problems (0 errors, 16 warnings)
  0 errors and 7 warnings potentially fixable with the `--fix` option.

```

**T360 — pnpm lint**: PASS

## T319 — axe-core coverage guard

```
[spec-008] axe-core coverage check OK (14 specs scanned).
```

**T319 — axe-core coverage guard**: PASS

## T353 — feature-flag env-leak guard

```
[spec-008] feature-flag env-leak check OK.
```

**T353 — feature-flag env-leak guard**: PASS

## T370 — strict-scope test

```

 RUN  v4.1.5 /Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance


 Test Files  1 passed (1)
      Tests  331 passed (331)
   Start at  02:59:58
   Duration  689ms (transform 41ms, setup 95ms, import 86ms, tests 15ms, environment 382ms)

```

**T370 — strict-scope test**: PASS

## T321..T353 — feature-flag matrix

```

 RUN  v4.1.5 /Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance


 Test Files  2 passed (2)
      Tests  47 passed (47)
   Start at  03:00:00
   Duration  642ms (transform 87ms, setup 178ms, import 69ms, tests 8ms, environment 757ms)

```

**T321..T353 — feature-flag matrix**: PASS

## T362 — pnpm vitest run (full unit suite)

```

 RUN  v4.1.5 /Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance

 ❯ tests/integration/spec-spike-gates.test.ts (12 tests | 4 failed) 8ms
       × evidence file MUST exist at docs/ai/specs/spikes/<slug>.json 5ms
       × evidence file MUST exist at docs/ai/specs/spikes/<slug>.json 0ms
       × evidence file MUST exist at docs/ai/specs/spikes/<slug>.json 0ms
       × evidence file MUST exist at docs/ai/specs/spikes/<slug>.json 0ms
 ❯ src/lib/__tests__/task-artifacts.enums.test.ts (15 tests | 1 failed) 529ms
     × no file outside the SPEC-007 allowlist appears in `git diff main...HEAD` 451ms
(node:55417) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 exit listeners added to [process]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
(Use `node --trace-warnings ...` to show where the warning was created)
[03:00:11.154] [32mINFO[39m (55760): [36mCreated GitHub issue for task[39m
    [35mrepo[39m: "org/repo"
    [35missue[39m: 42
    [35mtaskId[39m: 1
[03:00:11.213] [32mINFO[39m (55760): [36mGitHub sync completed[39m
    [35mrepo[39m: "org/repo"
    [35mpulled[39m: 1
    [35mpushed[39m: 0
    [35mprojectId[39m: 2
[03:00:03.166] [32mINFO[39m (54538): [36mGNAP repo initialized[39m
    [35mrepoPath[39m: "/var/folders/jp/nt5kjq_11m3fvxg9ftwjjqsw0000gn/T/gnap-test-rPs0CD/gnap-repo"
[03:00:12.298] [32mINFO[39m (55890): [36minitializeLabels: activity throttled (within 24h window)[39m
    [35mrepo[39m: "org/r"
    [35mworkspaceId[39m: 7
    [35mfailureCount[39m: 1
    [35mevent[39m: "label_provisioning_failed_throttled"
[03:00:12.353] [32mINFO[39m (55890): [36minitializeLabels: activity throttled (within 24h window)[39m
    [35mrepo[39m: "o/r"
    [35mworkspaceId[39m: 8
    [35mfailureCount[39m: 1
    [35mevent[39m: "label_provisioning_failed_throttled"
[03:00:22.392] [32mINFO[39m (56169): [36mGitHub labels initialized[39m
    [35mrepo[39m: "org/repo"
[03:00:22.406] [32mINFO[39m (56169): [36mAUTH_PASS is not set — admin account will be created via /setup. Set AUTH_PASS or AUTH_PASS_B64 to seed an admin from env (useful for CI/automation).[39m
[03:00:22.406] [32mINFO[39m (56169): [36mDatabase migrations applied successfully[39m
[03:00:22.406] [32mINFO[39m (56169): [36mGitHub labels initialized[39m
    [35mrepo[39m: "org/repo"
[03:00:32.381] [33mWARN[39m (56271): [36mAUTH_PASS_B64 is not valid base64; falling back to AUTH_PASS[39m

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/integration/spec-spike-gates.test.ts > SPEC-008 Phase-0 CI gate — verification spike evidence (FR-090a) > verify-claude-code-otel-emission (FR-071, FR-090a) > evidence file MUST exist at docs/ai/specs/spikes/<slug>.json
AssertionError: MISSING EVIDENCE: docs/ai/specs/spikes/verify-claude-code-otel-emission.json — Phase-0 spike script must be executed by an operator on a node with the relevant CLI installed. See script header for procedure. FR-071, FR-090a: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ tests/integration/spec-spike-gates.test.ts:122:11
    120|             `with the relevant CLI installed. See script header for pr…
    121|             `${contract.frRefs.join(', ')}`,
    122|         ).toBe(true);
       |           ^
    123|       });
    124|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  tests/integration/spec-spike-gates.test.ts > SPEC-008 Phase-0 CI gate — verification spike evidence (FR-090a) > verify-claude-mcp-otel-emission (FR-071a, FR-090a) > evidence file MUST exist at docs/ai/specs/spikes/<slug>.json
AssertionError: MISSING EVIDENCE: docs/ai/specs/spikes/verify-claude-mcp-otel-emission.json — Phase-0 spike script must be executed by an operator on a node with the relevant CLI installed. See script header for procedure. FR-071a, FR-090a: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ tests/integration/spec-spike-gates.test.ts:122:11
    120|             `with the relevant CLI installed. See script header for pr…
    121|             `${contract.frRefs.join(', ')}`,
    122|         ).toBe(true);
       |           ^
    123|       });
    124|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  tests/integration/spec-spike-gates.test.ts > SPEC-008 Phase-0 CI gate — verification spike evidence (FR-090a) > verify-codex-stdout-rollout-timestamp-parity (FR-072, FR-082, FR-090a, FR-388) > evidence file MUST exist at docs/ai/specs/spikes/<slug>.json
AssertionError: MISSING EVIDENCE: docs/ai/specs/spikes/verify-codex-stdout-rollout-timestamp-parity.json — Phase-0 spike script must be executed by an operator on a node with the relevant CLI installed. See script header for procedure. FR-072, FR-082, FR-090a, FR-388: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ tests/integration/spec-spike-gates.test.ts:122:11
    120|             `with the relevant CLI installed. See script header for pr…
    121|             `${contract.frRefs.join(', ')}`,
    122|         ).toBe(true);
       |           ^
    123|       });
    124|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  tests/integration/spec-spike-gates.test.ts > SPEC-008 Phase-0 CI gate — verification spike evidence (FR-090a) > verify-copilot-events-ci (FR-073, FR-083, FR-090a, FR-090d, FR-090d1) > evidence file MUST exist at docs/ai/specs/spikes/<slug>.json
AssertionError: MISSING EVIDENCE: docs/ai/specs/spikes/verify-copilot-events-ci.json — Phase-0 spike script must be executed by an operator on a node with the relevant CLI installed. See script header for procedure. FR-073, FR-083, FR-090a, FR-090d, FR-090d1: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ tests/integration/spec-spike-gates.test.ts:122:11
    120|             `with the relevant CLI installed. See script header for pr…
    121|             `${contract.frRefs.join(', ')}`,
    122|         ).toBe(true);
       |           ^
    123|       });
    124|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  src/lib/__tests__/task-artifacts.enums.test.ts > T011: strict-scope diff gate (FR-100) > no file outside the SPEC-007 allowlist appears in `git diff main...HEAD`
AssertionError: expected [ …(357) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "docs/feature-flags-runbook.md",
+   "docs/migrations/migration-id-reservations.md",
+   "docs/migrations/rollback-M64.sql",
+   "docs/migrations/rollback-M65a.sql",
+   "docs/migrations/rollback-M65b.sql",
+   "docs/migrations/rollback-M65c.sql",
+   "docs/migrations/rollback-M65d.sql",
+   "docs/migrations/rollback-M65e.sql",
+   "docs/migrations/rollback-M65f.sql",
+   "docs/migrations/rollback-M65g.sql",
+   "docs/migrations/rollback-M65h.sql",
+   "docs/migrations/rollback-M65i.sql",
+   "docs/migrations/rollback-M65j.sql",
+   "docs/migrations/rollback-M65k.sql",
+   "docs/migrations/rollback-M65l.sql",
+   "docs/migrations/rollback-M65m.sql",
+   "docs/migrations/rollback-M66.sql",
+   "docs/migrations/rollback-M68.sql",
+   "docs/observability/provider-tos-considerations.md",
+   "docs/observability/setup.md",
+   "docs/observability/troubleshooting.md",
+   "docs/operator-guides/visual-baseline-approval.md",
+   "docs/orchestration.md",
+   "docs/runbook/aegis-deferred-no-fallback.md",
+   "docs/runbook/aegis-emergency-reserve-depletion.md",
+   "docs/runbook/aegis-local-mode-fallback.md",
+   "docs/runbook/visual-false-positive-triage.md",
+   "docs/runbook/visual-rollback-baseline.md",
+   "docs/runbook/audit-chain-mismatch.md",
+   "docs/runbook/audit-chain-tamper.md",
+   "docs/runbook/auth-secret-rotation.md",
+   "docs/runbook/backfill-window-failure.md",
+   "docs/runbook/breaker-stuck-open.md",
+   "docs/runbook/collector-outage.md",
+   "docs/runbook/copilot-schema-broken.md",
+   "docs/runbook/counter-drift.md",
+   "docs/runbook/encryption-key-rotation.md",
+   "docs/runbook/ingest-disk-full-pause.md",
+   "docs/runbook/ingest-payload-oversize.md",
+   "docs/runbook/ingest-rate-limit-exceeded.md",
+   "docs/runbook/ingest-schema-malicious.md",
+   "docs/runbook/migration-rollback.md",
+   "docs/runbook/ollama-proxy-port-collision.md",
+   "docs/runbook/reconciler-stall.md",
+   "docs/runbook/retention-sweep-failure.md",
+   "docs/runbook/visual-regression-pages-recovery.md",
+   "docs/runbook/rotate-otelcol-api-key.md",
+   "docs/runbook/source-schema-break.md",
+   "docs/runbook/visual-flake-quarantine.md",
+   "scripts/backup-mc-db.sh",
+   "scripts/check-license.ts",
+   "scripts/check-no-copilot-token-tracker-dep.mjs",
+   "scripts/check-runbook-links.ts",
+   "scripts/check-tos-doc.mjs",
+   "scripts/install-otelcol.sh",
+   "scripts/mc-cli.cjs",
+   "scripts/secrets-rotate-provider-accounts.cjs",
+   "scripts/soak-test/governance-soak.ts",
+   "scripts/spec-008/check-axe-coverage.mjs",
+   "scripts/spec-008/check-feature-flag-env-leak.mjs",
+   "scripts/verify-claude-code-otel-emission.ts",
+   "scripts/verify-claude-mcp-otel-emission.ts",
+   "scripts/verify-codex-stdout-rollout-timestamp-parity.ts",
+   "scripts/verify-copilot-events-ci.ts",
+   "src/app/api/governance/audit/route.ts",
+   "src/app/api/governance/backfill/windows/[window_id]/retry/__tests__/retry.test.ts",
+   "src/app/api/governance/backfill/windows/[window_id]/retry/route.ts",
+   "src/app/api/governance/breaker/half-open-probe/route.ts",
+   "src/app/api/governance/breaker/reset/route.ts",
+   "src/app/api/governance/breaker/state/route.ts",
+   "src/app/api/governance/budgets/[id]/route.ts",
+   "src/app/api/governance/budgets/__tests__/route.test.ts",
+   "src/app/api/governance/budgets/route.ts",
+   "src/app/api/governance/collector/config/route.ts",
+   "src/app/api/governance/decisions/route.ts",
+   "src/app/api/governance/diagnostic/route.ts",
+   "src/app/api/governance/diagnostic/stream/route.ts",
+   "src/app/api/governance/dispatch/route.ts",
+   "src/app/api/governance/ingest/[source]/resume/route.ts",
+   "src/app/api/governance/operators/[id]/reenable-grants/route.ts",
+   "src/app/api/governance/overrides/[id]/route.ts",
+   "src/app/api/governance/overrides/__tests__/route.test.ts",
+   "src/app/api/governance/overrides/route.ts",
+   "src/app/api/governance/policies/[id]/promote/__tests__/promote.test.ts",
+   "src/app/api/governance/policies/[id]/promote/route.ts",
+   "src/app/api/governance/policies/[id]/route.ts",
+   "src/app/api/governance/policies/__tests__/route.test.ts",
+   "src/app/api/governance/policies/bulk-promote/route.ts",
+   "src/app/api/governance/policies/route.ts",
+   "src/app/api/governance/policy-events/route.ts",
+   "src/app/api/governance/quarantine/[id]/discard/route.ts",
+   "src/app/api/governance/quarantine/[id]/promote/route.ts",
+   "src/app/api/governance/quarantine/route.ts",
+   "src/app/api/governance/system-health/rebuild/route.ts",
+   "src/app/api/governance/system-health/recovery/route.ts",
+   "src/app/api/governance/system-health/route.ts",
+   "src/app/api/governance/windows/[id]/route.ts",
+   "src/app/api/governance/windows/route.ts",
+   "src/app/api/otlp/v1/metrics/route.ts",
+   "src/app/api/otlp/v1/traces/route.ts",
+   "src/app/api/resource-overrides/__tests__/route.test.ts",
+   "src/app/api/resource-overrides/route.ts",
+   "src/app/api/resource-policies/[id]/route.ts",
+   "src/app/api/resource-policies/route.ts",
+   "src/app/api/resource-policy-events/route.ts",
+   "src/components/__storybook__/decorators/with-feature-flags.tsx",
+   "src/components/governance/__tests__/governance-tab-a11y.test.tsx",
+   "src/components/governance/aegis-emergency-reserve-badge.stories.tsx",
+   "src/components/governance/aegis-emergency-reserve-badge.tsx",
+   "src/components/governance/breaker-open-banner.stories.tsx",
+   "src/components/governance/breaker-open-banner.tsx",
+   "src/components/governance/budget-utilization-chart.stories.tsx",
+   "src/components/governance/budget-utilization-chart.tsx",
+   "src/components/governance/budgets-subview.stories.tsx",
+   "src/components/governance/budgets-subview.tsx",
+   "src/components/governance/bulk-promote-modal.stories.tsx",
+   "src/components/governance/bulk-promote-modal.tsx",
+   "src/components/governance/calibration-progress.stories.tsx",
+   "src/components/governance/calibration-progress.tsx",
+   "src/components/governance/diagnostic-feed-row.stories.tsx",
+   "src/components/governance/diagnostic-feed-row.tsx",
+   "src/components/governance/diagnostic-feed.stories.tsx",
+   "src/components/governance/diagnostic-feed.tsx",
+   "src/components/governance/diagnostics-subview.stories.tsx",
+   "src/components/governance/diagnostics-subview.tsx",
+   "src/components/governance/etag-conflict-toast.stories.tsx",
+   "src/components/governance/etag-conflict-toast.tsx",
+   "src/components/governance/feature-flag-disabled-shim.stories.tsx",
+   "src/components/governance/feature-flag-disabled-shim.tsx",
+   "src/components/governance/governance-tab.stories.tsx",
+   "src/components/governance/governance-tab.tsx",
+   "src/components/governance/incident-recovery-modal.stories.tsx",
+   "src/components/governance/incident-recovery-modal.tsx",
+   "src/components/governance/modal-error-summary.stories.tsx",
+   "src/components/governance/modal-error-summary.tsx",
+   "src/components/governance/override-grant-form.stories.tsx",
+   "src/components/governance/override-grant-form.tsx",
+   "src/components/governance/overrides-subview.stories.tsx",
+   "src/components/governance/overrides-subview.tsx",
+   "src/components/governance/policies-subview.stories.tsx",
+   "src/components/governance/policies-subview.tsx",
+   "src/components/governance/policy-editor.stories.tsx",
+   "src/components/governance/policy-editor.tsx",
+   "src/components/governance/policy-row.stories.tsx",
+   "src/components/governance/policy-row.tsx",
+   "src/components/governance/system-health-card.stories.tsx",
+   "src/components/governance/system-health-card.tsx",
+   "src/components/governance/system-health-subview.stories.tsx",
+   "src/components/governance/system-health-subview.tsx",
+   "src/components/governance/telemetry-source-health-pill.stories.tsx",
+   "src/components/governance/telemetry-source-health-pill.tsx",
+   "src/components/governance/use-modal-focus-trap.ts",
+   "src/components/governance/window-editor.stories.tsx",
+   "src/components/governance/window-editor.tsx",
+   "src/components/governance/windows-subview.stories.tsx",
+   "src/components/governance/windows-subview.tsx",
+   "src/components/governance/wip-indicator-panel.stories.tsx",
+   "src/components/governance/wip-indicator-panel.tsx",
+   "src/components/panels/cost-tracker-panel.tsx",
+   "src/lib/__tests__/connection-pool.test.ts",
+   "src/lib/__tests__/governance-activity-middleware.test.ts",
+   "src/lib/__tests__/governance-audit-chain.test.ts",
+   "src/lib/__tests__/governance-constant-time.test.ts",
+   "src/lib/__tests__/governance-idempotency-cache.test.ts",
+   "src/lib/__tests__/governance-rate-limit.test.ts",
+   "src/lib/__tests__/governance-resource-resolver.test.ts",
+   "src/lib/__tests__/migrations-M64.test.ts",
+   "src/lib/__tests__/migrations-M65a-d.test.ts",
+   "src/lib/__tests__/migrations-M65e-h.test.ts",
+   "src/lib/__tests__/migrations-M65i-m-M66.test.ts",
+   "src/lib/__tests__/provider-account-encryption.test.ts",
+   "src/lib/__tests__/provider-account-rotation.test.ts",
+   "src/lib/__tests__/provider-account-tos.test.ts",
+   "src/lib/__tests__/resource-aegis-reserve.test.ts",
+   "src/lib/__tests__/resource-aegis-starvation-detector.test.ts",
+   "src/lib/__tests__/resource-audit-chain-verifier.test.ts",
+   "src/lib/__tests__/resource-audit-chain.test.ts",
+   "src/lib/__tests__/resource-breaker-chronic-alert.test.ts",
+   "src/lib/__tests__/resource-breaker-restart-recovery.test.ts",
+   "src/lib/__tests__/resource-budget-counters-race.test.ts",
+   "src/lib/__tests__/resource-budget-counters-split-update.test.ts",
+   "src/lib/__tests__/resource-budget-ledger.test.ts",
+   "src/lib/__tests__/resource-circuit-breaker-deterministic.test.ts",
+   "src/lib/__tests__/resource-counter-rebuild-atomicswap.test.ts",
+   "src/lib/__tests__/resource-counter-rebuild.test.ts",
+   "src/lib/__tests__/resource-decision-writer.test.ts",
+   "src/lib/__tests__/resource-drift-detector.test.ts",
+   "src/lib/__tests__/resource-etag.test.ts",
+   "src/lib/__tests__/resource-evaluator-determinism.test.ts",
+   "src/lib/__tests__/resource-evaluator-failsafe.test.ts",
+   "src/lib/__tests__/resource-evaluator-precedence.test.ts",
+   "src/lib/__tests__/resource-evaluator.test.ts",
+   "src/lib/__tests__/resource-governance-benchmark.test.ts",
+   "src/lib/__tests__/resource-override-anomaly-guard.test.ts",
+   "src/lib/__tests__/resource-policy-cache.test.ts",
+   "src/lib/__tests__/resource-reservation-reaper.test.ts",
+   "src/lib/__tests__/resource-reservation.test.ts",
+   "src/lib/__tests__/resource-validation-reason-sanitization.test.ts",
+   "src/lib/__tests__/resource-validation.test.ts",
+   "src/lib/__tests__/resource-window-evaluator.test.ts",
+   "src/lib/__tests__/resource-window-materializer-dst.test.ts",
+   "src/lib/__tests__/token-pricing-resolver.test.ts",
+   "src/lib/db/connection-pool.ts",
+   "src/lib/feature-flag-matrix.ts",
+   "src/lib/governance-activity-middleware.ts",
+   "src/lib/governance-audit-chain.ts",
+   "src/lib/governance-bulk-demote.ts",
+   "src/lib/governance-constant-time.ts",
+   "src/lib/governance-forensics-snapshot.ts",
+   "src/lib/governance-health-events.ts",
+   "src/lib/governance-idempotency-cache.ts",
+   "src/lib/governance-ingest-admission.ts",
+   "src/lib/governance-orphan-event-sweep.ts",
+   "src/lib/governance-post-restore-verifier.ts",
+   "src/lib/governance-rate-limit.ts",
+   "src/lib/governance-reconciler-alert.ts",
+   "src/lib/governance-resource-resolver.ts",
+   "src/lib/governance-route-context.ts",
+   "src/lib/governance-self-obs-counters.ts",
+   "src/lib/migrations.ts",
+   "src/lib/observability/__tests__/canonical-events.test.ts",
+   "src/lib/observability/__tests__/correction-ledger.test.ts",
+   "src/lib/observability/__tests__/dedupe.test.ts",
+   "src/lib/observability/__tests__/freshness-tracker.test.ts",
+   "src/lib/observability/__tests__/ingest-admission.test.ts",
+   "src/lib/observability/__tests__/ingest-rate-state.test.ts",
+   "src/lib/observability/__tests__/local-health-channel.test.ts",
+   "src/lib/observability/__tests__/posted-effect.test.ts",
+   "src/lib/observability/__tests__/reconciler.test.ts",
+   "src/lib/observability/__tests__/redaction.test.ts",
+   "src/lib/observability/__tests__/self-obs-metrics.test.ts",
+   "src/lib/observability/__tests__/snapshot-writer.test.ts",
+   "src/lib/observability/__tests__/throttle-supervisor.test.ts",
+   "src/lib/observability/adapters/__tests__/codex-session-reset.test.ts",
+   "src/lib/observability/adapters/_adapter-helpers.ts",
+   "src/lib/observability/adapters/claude-code-otel.ts",
+   "src/lib/observability/adapters/claude-code-transcript.ts",
+   "src/lib/observability/adapters/codex-rollout.ts",
+   "src/lib/observability/adapters/codex-stdout.ts",
+   "src/lib/observability/adapters/copilot-events-jsonl.ts",
+   "src/lib/observability/adapters/copilot-schema-versioning.ts",
+   "src/lib/observability/adapters/lm-studio-log.ts",
+   "src/lib/observability/adapters/manual-post.ts",
+   "src/lib/observability/adapters/ollama-log.ts",
+   "src/lib/observability/adapters/openclaw-gateway.ts",
+   "src/lib/observability/adapters/provider-quota.ts",
+   "src/lib/observability/canonical-events.ts",
+   "src/lib/observability/collector-config-writer.ts",
+   "src/lib/observability/correction-ledger.ts",
+   "src/lib/observability/dedupe.ts",
+   "src/lib/observability/freshness-tracker.ts",
+   "src/lib/observability/governance.json.template",
+   "src/lib/observability/ingest-admission.ts",
+   "src/lib/observability/ingest-rate-state.ts",
+   "src/lib/observability/lm-studio-probe.ts",
+   "src/lib/observability/local-health-channel.ts",
+   "src/lib/observability/otlp-decoder.ts",
+   "src/lib/observability/otlp-receiver.ts",
+   "src/lib/observability/posted-effect.ts",
+   "src/lib/observability/reconciler.ts",
+   "src/lib/observability/redaction.ts",
+   "src/lib/observability/self-obs-metrics.ts",
+   "src/lib/observability/snapshot-writer.ts",
+   "src/lib/observability/source-registry.ts",
+   "src/lib/observability/throttle-supervisor.ts",
+   "src/lib/provider-account-encryption.ts",
+   "src/lib/provider-account-rotation.ts",
+   "src/lib/provider-account-tos.ts",
+   "src/lib/provider-accounts.ts",
+   "src/lib/provider-entitlement-detector.ts",
+   "src/lib/resource-aegis-fallback-activity.ts",
+   "src/lib/resource-aegis-mode.ts",
+   "src/lib/resource-aegis-reserve.ts",
+   "src/lib/resource-aegis-starvation-detector.ts",
+   "src/lib/resource-archive-format.ts",
+   "src/lib/resource-audit-chain-verifier.ts",
+   "src/lib/resource-audit-chain.ts",
+   "src/lib/resource-breaker-chronic-alert.ts",
+   "src/lib/resource-breaker-clock.ts",
+   "src/lib/resource-breaker-restart-recovery.ts",
+   "src/lib/resource-budget-counters.ts",
+   "src/lib/resource-budget-ledger.ts",
+   "src/lib/resource-circuit-breaker-deterministic.ts",
+   "src/lib/resource-circuit-breaker.ts",
+   "src/lib/resource-counter-rebuild.ts",
+   "src/lib/resource-decision-writer.ts",
+   "src/lib/resource-dr-rehearsal.ts",
+   "src/lib/resource-drift-detector.ts",
+   "src/lib/resource-etag.ts",
+   "src/lib/resource-evaluator.ts",
+   "src/lib/resource-override-anomaly-guard.ts",
+   "src/lib/resource-override-grant.ts",
+   "src/lib/resource-policy-cache.ts",
+   "src/lib/resource-policy-loader.ts",
+   "src/lib/resource-precedence.ts",
+   "src/lib/resource-reservation-reaper.ts",
+   "src/lib/resource-reservation-release.ts",
+   "src/lib/resource-reservation.ts",
+   "src/lib/resource-retention-job.ts",
+   "src/lib/resource-retention.ts",
+   "src/lib/resource-validation.ts",
+   "src/lib/token-pricing-resolver.ts",
+   "src/lib/token-pricing.ts",
+   "src/types/observability.ts",
+   "src/types/resource-governance.test.ts",
+   "src/types/resource-governance.ts",
+   "tests/chaos/runbook-chaos.test.ts",
+   "tests/e2e/feature-flag-matrix.e2e.ts",
+   "tests/e2e/governance-aegis-starvation.e2e.ts",
+   "tests/e2e/governance-budget.e2e.ts",
+   "tests/e2e/governance-bulk-promote.e2e.ts",
+   "tests/e2e/governance-calibration-progress.e2e.ts",
+   "tests/e2e/governance-diagnostic-feed.e2e.ts",
+   "tests/e2e/governance-dispatch-feed.spec.ts",
+   "tests/e2e/governance-flag-off-byte-compat.e2e.ts",
+   "tests/e2e/governance-override-grant.e2e.ts",
+   "tests/e2e/governance-system-health-recovery.e2e.ts",
+   "tests/e2e/governance-system-health.spec.ts",
+   "tests/e2e/governance-tab-landing.e2e.ts",
+   "tests/e2e/governance-telemetry-health.e2e.ts",
+   "tests/e2e/governance-windows.e2e.ts",
+   "tests/e2e/governance-wip-policy.e2e.ts",
+   "tests/e2e/spec-008/governance-axe-shim.ts",
+   "tests/e2e/spec-008/governance-fixtures.ts",
+   "tests/integration/canonical-dedup.test.ts",
+   "tests/integration/feature-flag-matrix-coverage.test.ts",
+   "tests/integration/feature-flag-matrix.test.ts",
+   "tests/integration/governance-404-vs-403.test.ts",
+   "tests/integration/governance-audit-chain-walk.test.ts",
+   "tests/integration/governance-backfill-active-bench.test.ts",
+   "tests/integration/governance-backup-restore.test.ts",
+   "tests/integration/governance-breaker-rest.test.ts",
+   "tests/integration/governance-byte-compat-flag-off.test.ts",
+   "tests/integration/governance-copilot-schema-versioning.test.ts",
+   "tests/integration/governance-correction-ledger-same-tx.test.ts",
+   "tests/integration/governance-csrf-and-cross-origin.test.ts",
+   "tests/integration/governance-drift-autorepair-idempotency.test.ts",
+   "tests/integration/governance-idempotency-key.test.ts",
+   "tests/integration/governance-ingest-disk-hysteresis.test.ts",
+   "tests/integration/governance-late-arrival-post-archival.test.ts",
+   "tests/integration/governance-otlp-receiver-decode.test.ts",
+   "tests/integration/governance-otlp-receiver.test.ts",
+   "tests/integration/governance-override-race.test.ts",
+   "tests/integration/governance-override-reason-sanitization.test.ts",
+   "tests/integration/governance-override-ttl-bounds.test.ts",
+   "tests/integration/governance-payload-structure-bounds.test.ts",
+   "tests/integration/governance-prototype-pollution.test.ts",
+   "tests/integration/governance-rate-limit-buckets.test.ts",
+   "tests/integration/governance-rebuild-active-bench.test.ts",
+   "tests/integration/governance-retention-sweep.test.ts",
+   "tests/integration/governance-scale-headroom-benchmark.test.ts",
+   "tests/integration/governance-source-rate-burst.test.ts",
+   "tests/integration/governance-sweep-active-bench.test.ts",
+   "tests/integration/spec-numeric-consistency.test.ts",
+   "tests/integration/spec-spike-gates.test.ts",
+   "tests/integration/strict-scope-guard.test.ts",
+   "vitest.config.ts",
+ ]

 ❯ src/lib/__tests__/task-artifacts.enums.test.ts:224:23
    222|       .filter((s) => s.length > 0)
    223|     const offenders = changed.filter((p) => !isAllowedPath(p))
    224|     expect(offenders).toEqual([])
       |                       ^
    225|   })
    226| })

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


 Test Files  2 failed | 241 passed | 33 skipped (276)
      Tests  5 failed | 2584 passed | 1 skipped | 86 todo (2676)
   Start at  03:00:01
   Duration  35.76s (transform 12.10s, setup 32.35s, import 19.46s, tests 50.17s, environment 176.48s)

```

**T362 — pnpm vitest run (full unit suite)**: FAIL (exit 1)

## T371 — runbook links

```
runbook-links: 26 pages, all referenced
(node:56320) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/scripts/check-runbook-links.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/008-resource-governance/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
```

**T371 — runbook links**: PASS

## T373 — screenshot evidence guard

```
[spec-evidence-screenshots] checked 0 committed spec screenshot(s); policy passed
```

**T373 — screenshot evidence guard**: PASS

---

## Latest completion rerun — 2026-05-03

The earlier generated section above is superseded by the PR #26 completion
rerun below. The live runtime surfaces now exist, the Playwright placeholder
guards were removed, and the UI/visual gates were executed locally with
`SPEC_008_AXE_ENABLED=1`.

### Static and unit gates

- `pnpm lint` — PASS.
- `pnpm typecheck` — PASS.
- `pnpm test` — PASS with socket-bind approval for `mc-provisioner-daemon`: 252 files passed / 32 skipped; 2707 tests passed / 1 skipped / 84 todo.
- `pnpm vitest run tests/integration/governance-byte-compat-flag-off.test.ts tests/integration/feature-flag-matrix.test.ts tests/integration/feature-flag-matrix-coverage.test.ts` — PASS: 3 files / 49 tests.
- `node scripts/spec-008/check-axe-coverage.mjs` — PASS: 16 specs scanned.
- `node scripts/spec-008/check-feature-flag-env-leak.mjs` — PASS.
- `node -c scripts/seed-e2e-spec-008.cjs` — PASS.
- `bash -n scripts/e2e-docker.sh` — PASS.
- `git diff --check` — PASS.

### Runtime UI and visual gates

- `SPEC_008_AXE_ENABLED=1 MC_E2E_SCREENSHOTS=1 MC_VISUAL_SNAPSHOTS=1 pnpm exec playwright test tests/e2e/feature-flag-matrix.e2e.ts tests/e2e/governance-aegis-starvation.e2e.ts tests/e2e/governance-budget.e2e.ts tests/e2e/governance-bulk-promote.e2e.ts tests/e2e/governance-calibration-progress.e2e.ts tests/e2e/governance-diagnostic-feed.e2e.ts tests/e2e/governance-dispatch-feed.spec.ts tests/e2e/governance-etag-conflict-toast.e2e.ts tests/e2e/governance-flag-off-byte-compat.e2e.ts tests/e2e/governance-modal-error-summary.e2e.ts tests/e2e/governance-override-grant.e2e.ts tests/e2e/governance-system-health-recovery.e2e.ts tests/e2e/governance-system-health.spec.ts tests/e2e/governance-tab-landing.e2e.ts tests/e2e/governance-telemetry-health.e2e.ts tests/e2e/governance-windows.e2e.ts tests/e2e/governance-wip-policy.e2e.ts` — PASS: 107 tests; axe reported no accessibility violations across checked states.
- `MC_E2E_DOCKER_PRESEED=1 MC_VISUAL_SNAPSHOTS=1 SPEC_008_AXE_ENABLED=1 bash scripts/e2e-docker.sh` — PASS: Docker build passed, clean flag-OFF regression 1 passed, and seeded Product Line + Ready for Owner + SPEC-007 + SPEC-008 suite 123 passed with all current RC Factory flags seeded ON.
- `SPEC_008_AXE_ENABLED=1 pnpm test:visual:storybook` — PASS: 30 files / 152 stories.
- `node scripts/verify-visual-manifest.mjs --mode playwright` — PASS: 149 screenshot metadata files across 118 Playwright tests.
- `node scripts/verify-visual-manifest.mjs --mode storybook` — PASS: 170 screenshot metadata files across 152 Storybook stories; 152 stories include test/source metadata.

### Remaining operator-gated gates

- **T367 `pnpm test:soak`** — 30 min @ 100 admissions/sec; operator-gated.
- **T368 `pnpm test:chaos`** — every runbook's `## Verification` step; operator-gated.
- **T369 coverage-report artifacting** — aggregate CI/operator artifacting; constituent lint, typecheck, unit, build, Docker e2e, Storybook, and metadata gates above are green.

## SPEC-008 gate state: GREEN for PR #26 UI/UX completion scope
