# UAT Runbook: 014c-first-real-harness-adapter

| Field | Value |
|-------|-------|
| Spec | 014c-first-real-harness-adapter |
| Branch | 014c-first-real-harness-adapter |
| PR | **PR:** [#79](https://github.com/racecraft-lab/Paddock/pull/79) |
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

- [x] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-2"></a>
### User Story 2 - Inspect safe run evidence (Priority: P2)

- [x] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-3"></a>
### User Story 3 - Fail closed on unsupported runtime events (Priority: P3)

- [x] Walk this story end to end and confirm the observable behavior the spec promises.

<a id="us-4"></a>
### User Story 4 - Review a bounded adapter PR (Priority: P4)

- [x] Walk this story end to end and confirm the observable behavior the spec promises.



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

1. **Tests executed?** Local implementation coverage passed after rebasing and after official-doc-grounded stdio transport alignment: focused SPEC-014C cluster 8 files / 89 tests, `node scripts/spec-014c/check-scope-guard.mjs`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`. HAL branch deployment at `43989ac856696abb2ea764fed409da268b87c9a8` also passed `pnpm build`, service restart, `/login`, authenticated `/api/status`, and marker-scoped UAT.
2. **Edge cases?** Covered locally and on HAL: blocked admission and workspace/repository/manifest/governance cases; timeout/binary/cleanup failures; unsupported input/approval/tool/capability; malformed protocol; unsafe evidence rejection; allowed redaction; runtime-inventory states; workspace-scoped flag-off blocking; and zero-residue cleanup.
3. **Requirements matched?** FR-001 through FR-025 trace to completed T001-T049 plus passing local verification and HAL UAT marker `SPEC-014C-HAL-UAT-20260605121830`.
4. **Follow-up?** No `[TODO]`, `[DEFERRED]`, or `[OUT-OF-SCOPE]` markers were found in `spec.md`, `plan.md`, or `tasks.md`. Follow-up ownership remains explicit: SPEC-014D owns OpenClaw/external adapter work, SPEC-014E owns richer transcript/event retention, and SPEC-014F owns live intervention UI.

## Sign-off

Advisory only — these checkboxes block nothing.

- [x] Reviewer walked every Per-Story Acceptance Test above.
- [x] Reviewer confirmed the Negative-Path Tests behave as described.
- [x] Reviewer is satisfied the PR delivers the behavior the spec promised.

## Rollback

git revert <SHA>; see plan.md for data-migration considerations
