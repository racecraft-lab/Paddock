# Quickstart: SPEC-014C First Real Harness Adapter Pilot

## Local Planning Preconditions

Run from the feature worktree:

```bash
cd /Users/fredrickgabelmann/.codex/worktrees/5424/racecraft-mission-control/.worktrees/014c-first-real-harness-adapter
```

Confirm Codex app-server surface:

```bash
codex --version
codex app-server --help
codex app-server generate-ts --out /tmp/spec-014c-codex-app-server-schema/ts --experimental
```

Expected planning evidence:

- CLI version is locally available.
- `app-server` exposes the documented direct `--listen stdio://` transport plus schema generation commands.
- Direct `codex app-server --listen stdio://` returns the official initialize response during HAL UAT.
- No `serve` command is assumed.
- Generated protocol contains initialize, thread, turn, usage, item, request-approval, user-input, permission, and tool-call shapes.

## Plan Gate Checks

Check generated plan artifacts for unresolved markers:

```bash
rg -n "NEEDS[[:space:]]+CLARIFICATION" specs/014c-first-real-harness-adapter/plan.md specs/014c-first-real-harness-adapter/research.md specs/014c-first-real-harness-adapter/data-model.md specs/014c-first-real-harness-adapter/quickstart.md specs/014c-first-real-harness-adapter/contracts
```

Check G3 architecture statements:

```bash
rg -n "G3|SPEC-014A|SPEC-014B|SPEC-013B|SPEC-013C|SPEC-013D|SPEC-014E|SPEC-014F|No schema migration|No new runtime dependency" specs/014c-first-real-harness-adapter/plan.md
```

## Implementation Verification Commands

Task generation must turn these into TDD-first tasks and focused commands:

```bash
pnpm vitest run src/lib/harness-adapters/__tests__/codex-app-server-manifest.test.ts
pnpm vitest run src/lib/harness-adapters/__tests__/codex-app-server-protocol.test.ts
pnpm vitest run src/lib/harness-adapters/__tests__/codex-app-server-evidence.test.ts
pnpm vitest run src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts
pnpm vitest run src/lib/harness-adapters/__tests__/codex-app-server-artifact-safety.test.ts
pnpm vitest run src/lib/__tests__/task-dispatch-codex-app-server.test.ts
node scripts/spec-014c/check-scope-guard.mjs
pnpm typecheck
pnpm lint
pnpm build
```

Run broader `pnpm test` outside the Codex sandbox when implementation touches shared runtime behavior. Run Playwright only if an existing browser-visible evidence surface changes.

## HAL UAT Shape

Completion requires a target HAL report at `specs/014c-first-real-harness-adapter/uat-report.md` with descriptor-level evidence for:

- Service/deployed commit health.
- `codex app-server` availability and real launch proof.
- Workspace-scoped `FEATURE_TASK_CONTROL_PLANE` and `FEATURE_AGENT_RUNNER_SANDBOXES` flag scope.
- Marker-scoped disposable GitHub-linked assigned task/stage fixture.
- One real app-server handshake/thread/turn launch from the Paddock-owned sandbox lifecycle root.
- Unsupported user-input/tool/approval, timeout, malformed protocol/output, unsafe evidence rejection, and allowed redaction fixtures exercising the same target code.
- Lifecycle cleanup and zero DB/sandbox/artifact residue.

If `codex app-server` is unavailable on HAL or a real handshake/thread/turn launch cannot complete, UAT blocks instead of accepting fake-only evidence.

## Review Packet Shape

Implementation closeout must create `specs/014c-first-real-harness-adapter/pr-review-packet.md` with:

- What changed and why.
- Non-goals and SPEC-014E/SPEC-014F boundaries.
- Review order.
- Scope budget.
- Traceability from requirements to files, tests, HAL UAT, and failure fixtures.
- Verification commands and results.
- Rollback/flag story.
- Known gaps and follow-up ownership.
