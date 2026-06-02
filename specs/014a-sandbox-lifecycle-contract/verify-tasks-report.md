# Verify Tasks Report: SPEC-014A - Sandbox Ownership and Lifecycle Contract

**Date**: 2026-05-28
**Scope**: all
**Task filter**: T002, T019, T020, T021, T026, T027, T028, T034, T035, T040, T047
**Completed tasks checked**: 11

> ⚠️ **FRESH SESSION ADVISORY**: For maximum reliability, run `/speckit.verify-tasks`
> in a **separate** agent session from the one that performed `/speckit.implement`.
> The implementing agent's context biases it toward confirming its own work.

## Scope Evidence

- Prerequisites command: `.specify/scripts/bash/check-prerequisites.sh --json`
- Feature directory: `/Users/fredrickgabelmann/.codex/worktrees/0466/racecraft-paddock/.worktrees/014a-sandbox-lifecycle-contract/specs/014a-sandbox-lifecycle-contract`
- Base ref used for branch evidence: `origin/main`
- Branch: `014a-sandbox-lifecycle-contract`
- Changed evidence included branch diff plus working-tree modified and untracked files.
- Warning: repository reports `git rev-parse --is-shallow-repository` as `true`; diff coverage may be incomplete.
- Untracked implementation evidence included:
  - `docs/migrations/rollback-M80.sql`
  - `src/app/api/tasks/[id]/sandbox-lifecycles/route.ts`
  - `src/lib/__tests__/agent-sandbox-lifecycle-fixtures.ts`
  - `src/lib/__tests__/agent-sandbox-lifecycle-route.test.ts`
  - `src/lib/__tests__/agent-sandbox-lifecycle.test.ts`
  - `src/lib/__tests__/migrations-M80-agent-sandbox-lifecycles.test.ts`
  - `src/lib/agent-sandbox-lifecycle.ts`

## Verification Commands

| Command | Result |
|---|---|
| `pnpm check:strict-scope` | Pass: `check-strict-scope: OK`. |
| `pnpm exec vitest run src/lib/__tests__/agent-sandbox-lifecycle.test.ts src/lib/__tests__/agent-sandbox-lifecycle-route.test.ts --reporter=verbose` | Blocked under Node 26 by `better-sqlite3` ABI mismatch. |
| `pnpm rebuild better-sqlite3` | Failed under Node 26 because `better-sqlite3@12.6.2` does not compile against that runtime. |
| `direnv exec . pnpm rebuild better-sqlite3` | Pass under repo-pinned Node v22.22.2. |
| `direnv exec . pnpm exec vitest run src/lib/__tests__/agent-sandbox-lifecycle.test.ts src/lib/__tests__/agent-sandbox-lifecycle-route.test.ts --reporter=verbose` | Pass: 2 files passed, 29 tests passed. |

## Summary Scorecard

| Verdict | Count |
|---|---:|
| ✅ VERIFIED | 11 |
| 🔍 PARTIAL | 0 |
| ⚠️ WEAK | 0 |
| ❌ NOT_FOUND | 0 |
| ⏭️ SKIPPED | 0 |

## Flagged Items

None.

## Verified Items

| Task | Verdict | Summary |
|---|---|---|
| T002 | ✅ VERIFIED | `tsconfig.spec-strict.json` includes the strict-compatible SPEC-014A helper, fixture, helper test, and route test paths while leaving the route implementation and M80 migration test out of the strict subproject boundary. |
| T019 | ✅ VERIFIED | Flag-off mutation tests cover create, prepare, mark_running, mark_terminal, cleanup, and rollback, with lifecycle/event row counts unchanged. |
| T020 | ✅ VERIFIED | Flag-off fake-owner test asserts blocked disabled evidence, no sandbox directory creation, and no lifecycle/event rows. |
| T021 | ✅ VERIFIED | Helper read-model test proves an existing lifecycle row remains readable after the workspace flag is disabled and includes disabled-state evidence. |
| T026 | ✅ VERIFIED | Adversarial validation coverage includes traversal, absolute paths, separators, reserved names, overlong values, unsafe Unicode/control-style input, and root-escape rejection; duplicate-normalized conflict coverage is present in the same helper test file. |
| T027 | ✅ VERIFIED | Persistence-safety tests reject unsafe root/handle fragments, provider payloads/prompts, bearer authorization metadata, raw session metadata, token-shaped values, and absolute host paths before lifecycle rows persist. |
| T028 | ✅ VERIFIED | Duplicate-normalized sandbox key conflict tests prove normalized attempt values conflict without mutating existing evidence. |
| T034 | ✅ VERIFIED | Duplicate create tests cover matching reuse plus conflicting root, owner, and path projection cases without mutating existing lifecycle evidence. |
| T035 | ✅ VERIFIED | Rollback, cleanup success, cleanup failure, stale `cleanup_pending`, and durable row/event retention tests are present. |
| T040 | ✅ VERIFIED | Route tests cover viewer auth, invalid task ids, malformed workspace filtering, cross-workspace rejection, task-scoped lifecycle listing, lifecycle filtering, disabled-state evidence, and no-write GET behavior. |
| T047 | ✅ VERIFIED | Static scope guard covers real launch/import patterns plus UI/components, adapter manifests, retry/release/cancel/debug controls, successor selection, governance/resource policy changes, token accounting, and auto-merge. |

## Unassessable Items

None.

## Machine Verdict Lines

| T002 | ✅ VERIFIED | Strict-compatible SPEC-014A helper/test paths are present, with route implementation and M80 migration test excluded from strict scope. |
| T019 | ✅ VERIFIED | Flag-off no-row/no-event mutation coverage is present for all lifecycle mutation hooks. |
| T020 | ✅ VERIFIED | Flag-off fake artifact no-touch and disabled evidence coverage is present. |
| T021 | ✅ VERIFIED | Existing authorized lifecycle rows remain readable with disabled-state evidence in the helper test. |
| T026 | ✅ VERIFIED | Adversarial path/key corpus and root-escape coverage are present. |
| T027 | ✅ VERIFIED | Unsafe persistence payload rejection coverage is present. |
| T028 | ✅ VERIFIED | Duplicate-normalized sandbox key/path conflict coverage is present. |
| T034 | ✅ VERIFIED | Conflicting owner/root/path duplicate create coverage is present. |
| T035 | ✅ VERIFIED | Rollback, cleanup success/failure, stale cleanup_pending, and durable retention coverage is present. |
| T040 | ✅ VERIFIED | Route auth, scope, filter, list, invalid-task, disabled-evidence, and no-write coverage is present. |
| T047 | ✅ VERIFIED | Static forbidden-scope guard coverage is present. |

✅ No flagged items — verification complete.

## Extension Hooks

No `before_verify-tasks` or `after_verify-tasks` hooks are registered in `.specify/extensions.yml`.
