# UAT Runbook: 014c-first-real-harness-adapter

| Field | Value |
|-------|-------|
| Spec | 014c-first-real-harness-adapter |
| Branch | 014c-first-real-harness-adapter |
| PR | **PR:** <set on PR open> |
| Generated from | 2026-06-05T14:42:19Z |



## Env Setup

Run these from the repository root before walking the acceptance tests.

| Command | Value |
|---------|-------|
| BUILD | `pnpm build` |
| TYPECHECK | `pnpm typecheck` |
| LINT | `pnpm lint` |
| LINT_FIX | _not available for this project_ |
| UNIT_TEST | `pnpm test` |
| INTEGRATION_TEST | `pnpm test:e2e` |
| SINGLE_FILE_INTEGRATION | _not available for this project_ |

## Per-Story Acceptance Tests

<a id="us-1"></a>
### User Story 1 - Admit and launch a claimed stage (Priority: P1)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-2"></a>
### User Story 2 - Inspect safe run evidence (Priority: P2)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-3"></a>
### User Story 3 - Fail closed on unsupported runtime events (Priority: P3)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-4"></a>
### User Story 4 - Review a bounded adapter PR (Priority: P4)

- [ ] Walk this story end to end and confirm the observable behavior the spec promises.



## FR Coverage Matrix

| Story | Acceptance test |
|-------|-----------------|
| [User Story 1 - Admit and launch a claimed stage (Priority: P1)](#us-1) | see the Per-Story Acceptance Tests block above |
| [User Story 2 - Inspect safe run evidence (Priority: P2)](#us-2) | see the Per-Story Acceptance Tests block above |
| [User Story 3 - Fail closed on unsupported runtime events (Priority: P3)](#us-3) | see the Per-Story Acceptance Tests block above |
| [User Story 4 - Review a bounded adapter PR (Priority: P4)](#us-4) | see the Per-Story Acceptance Tests block above |


## Negative-Path Tests


- Feature flag OFF blocks launch even when the claim, assignment, manifest, governance, and lifecycle are otherwise eligible.
- Runtime inventory has a Codex app-server manifest, but the task assignment is unassigned or bound to a different manifest.
- The claimed stage is not GitHub-linked, has a stale claim, has no stage attempt, or no longer belongs to the expected workspace or repository.
- Governance allows the task generally, but denies the specific harness capability or sandbox posture.
- Sandbox lifecycle creation or preparation fails before launch.
- Codex app-server binary is unavailable or reports a version/protocol shape that cannot be safely handled.
- The subprocess exits before initialization, hangs past the manifest timeout, or cannot be terminated cleanly.
- The protocol stream includes unknown, malformed, duplicated, or out-of-order events.
- Codex app-server asks for live user input, tool approval, file approval, shell access outside the sandbox, or a capability outside the manifest packet.
- Output includes raw transcripts, provider payloads, tool payloads, prompt bodies, secrets, host paths, or unsafe evidence.
- Artifact publication fails after the run has produced a safe summary.
- Usage events are absent, partial, duplicated, or malformed.
- Retry, release, cancellation, or stale-claim recovery happens through existing claim-control behavior while the adapter path is preparing or running.
- A successful adapter attempt releases active ownership but must not become retry-eligible merely because ownership was released.
- Claim-control or stale recovery changes the active claim after the adapter starts but before it writes terminal evidence.
- The subprocess cannot be terminated cleanly after timeout, unsupported request, cancellation, or stale ownership loss.
- Sandbox lifecycle cleanup fails after terminal evidence is recorded.
- HAL has Paddock deployed but does not have an available Codex app-server binary; UAT blocks instead of accepting fake-only proof.

## Self-Review Findings

1. **Tests executed?** Partial post-implementation coverage is complete for the local implementation path. On 2026-06-05T14:47:29Z after rebasing to `origin/main`, the focused SPEC-014C Vitest cluster passed 8 files / 89 tests, `node scripts/spec-014c/check-scope-guard.mjs` passed, `pnpm typecheck` passed, `pnpm lint` passed, and escalated `pnpm build` passed. `pnpm test:e2e` did not run because SPEC-014C changes no browser-visible surface; target HAL UAT remains blocked until merge/promotion.
2. **Edge cases?** Covered locally by focused tests: blocked admission and workspace/repository/manifest/governance cases in `src/lib/__tests__/task-dispatch-codex-app-server.test.ts:616`; timeout/binary/cleanup failures in `src/lib/harness-adapters/__tests__/codex-app-server-runner.test.ts:418`; unsupported user-input/approval/tool/capability and malformed protocol in `src/lib/harness-adapters/__tests__/codex-app-server-protocol.test.ts:320`; unsafe evidence rejection and allowed redaction in `src/lib/harness-adapters/__tests__/codex-app-server-artifact-safety.test.ts:321`; runtime-inventory feature/assignment states in `src/lib/harness-adapters/__tests__/runtime-inventory.test.ts:145`. `[edge-case-gap]` FR-023/FR-024 target evidence remains open for post-merge HAL UAT.
3. **Requirements matched?** FR-001 through FR-022 and FR-025 trace to completed T001-T041 and T046-T049 plus commit `08ef087b` and passing local verification. FR-023 and FR-024 trace to T042-T045 and remain intentionally open until merged target deployment, one real HAL Codex app-server launch, deterministic HAL fixture matrix, and zero-residue cleanup proof.
4. **Follow-up?** No `[TODO]`, `[DEFERRED]`, or `[OUT-OF-SCOPE]` markers were found in `spec.md`, `plan.md`, or `tasks.md`. Explicit follow-up ownership is recorded instead: SPEC-014E owns richer transcript/event retention, SPEC-014F owns live intervention UI, and T042-T045 own target HAL UAT after merge/promotion.

## Sign-off

Advisory only — these checkboxes block nothing.

- [ ] Reviewer walked every Per-Story Acceptance Test above.
- [ ] Reviewer confirmed the Negative-Path Tests behave as described.
- [ ] Reviewer is satisfied the PR delivers the behavior the spec promised.

## Rollback

git revert <SHA>; see plan.md for data-migration considerations
