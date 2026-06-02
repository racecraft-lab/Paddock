# SPEC-014A Sandbox Lifecycle UAT Report

## Status

Complete. PR #64 merged to `main` as `c01d9e44ec826d94fa5916284c51453e5ec339ee` on 2026-05-30T02:08:31Z. HAL target deployment was promoted to that commit on May 29, 2026 CDT, and post-merge fake lifecycle/read API UAT passed with zero disposable residue.

SPEC-014A proves the sandbox ownership and lifecycle contract only. First operator-visible runtime inventory remains blocked on SPEC-014B, and first real harness operation remains blocked on SPEC-013D plus SPEC-014B.

## Local Evidence

| Check | Result |
|-------|--------|
| Focused SPEC-014A Vitest | Passed: 34 tests |
| Feature flag and migration guard tests | Passed: 44 tests |
| TypeScript | Passed: `pnpm typecheck` |
| Lint | Passed: `pnpm lint` |
| API parity | Passed: `pnpm api:parity` |
| Unit suite | Passed outside sandbox: 307 files, 3201 tests, 3 skipped, 84 todo |
| Build | Passed outside sandbox |
| E2E | N/A: no UI/browser route surface changed |

## Post-Merge HAL Target UAT

Target UAT was executed on May 29, 2026 CDT against HAL after deploying merged
`main` commit `c01d9e44ec826d94fa5916284c51453e5ec339ee`.

- `uat_replay_id`: `spec013c-014a-uat-1780110032087`
- Target: HAL `paddock.service`, local HTTP `http://127.0.0.1:3000`
- Deployment evidence: `pnpm install --frozen-lockfile` no-op from lockfile; `pnpm build` passed under Next.js 16.2.6; `paddock.service` restarted and logged database migrations applied; `/login` returned HTTP `200`; `openclaw-gateway.service` remained active.
- Migration markers: `079_task_claim_control`, `080_agent_sandbox_lifecycles`
- Auth role used: disposable session admin
- Sandbox UAT scope: disposable workspace `18`
- Initial sandbox flag state: `FEATURE_AGENT_RUNNER_SANDBOXES=false`
- Enabled sandbox flag state: `FEATURE_AGENT_RUNNER_SANDBOXES=true`
- Stage key: `issue_remediation`

| Fixture | Result |
|---------|--------|
| Flag off before enable | Passed: `createSandboxLifecycle` returned `feature_flag_off`; lifecycle row count stayed `0` |
| Fake lifecycle owner `paddock` | Passed: fake lifecycle completed with durable status `cleaned_up` |
| Fake lifecycle owner `openclaw` | Passed: fake lifecycle completed with durable status `cleaned_up` |
| Fake lifecycle owner `external_harness` | Passed: fake lifecycle completed with durable status `cleaned_up` |
| Enabled read API | Passed: `GET /api/tasks/{id}/sandbox-lifecycles` returned `sandbox_lifecycle.v1`, mutation state `enabled`, and 3 lifecycle rows |
| Safe read payload | Passed: read payload did not contain absolute host paths, token-shaped values, or bearer-shaped credentials |
| Flag off after disable | Passed: `createSandboxLifecycle` returned `feature_flag_off`; lifecycle row count did not increase |
| Disabled read API | Passed: read API returned mutation state `disabled` and preserved the 3 durable lifecycle rows |

Cleanup restored the target UAT row-count tables to baseline and verified zero marker residue:

| Table | Baseline | After cleanup | Residue |
|-------|----------|---------------|---------|
| `workspaces` | 3 | 3 | 0 |
| `projects` | 7 | 7 | 0 |
| `users` | 1 | 1 | 0 |
| `user_sessions` | 2 | 2 | 0 |
| `tasks` | 4 | 4 | 0 |
| `task_stage_attempts` | 0 | 0 | 0 |
| `task_stage_attempt_events` | 0 | 0 | 0 |
| `task_stage_claims` | 0 | 0 | 0 |
| `agent_sandbox_lifecycles` | 0 | 0 | 0 |
| `agent_sandbox_lifecycle_events` | 0 | 0 | 0 |
| `github_sync_lifecycle_controls` | 0 | 0 | 0 |
| `resource_policy_events` | 0 | 0 | 0 |
| `activities` | 410 | 410 | 0 |

The temporary database backup, sandbox test file, fake artifact root, and disposable workspace/project/task/user/session rows were removed. A final HAL check returned no `spec013c-014a-uat-*` workspace rows and no `/tmp/spec013c-014a-uat-*-paddock.db.bak` files.

## Follow-Up Boundary

SPEC-014A provides durable lifecycle contract evidence only. SPEC-014B owns the first runtime-inventory integration and fake adapter registry. SPEC-014C remains blocked until SPEC-013D and SPEC-014B are complete.
