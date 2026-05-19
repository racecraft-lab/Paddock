# Research: SPEC-009C4 - Owner Merge Gate and Done Reconciliation

## Decision: Use existing manual GitHub sync as the only production reconciliation trigger

**Rationale**: The spec and clarifications require `POST /api/github/sync` with `{ "action": "trigger", "project_id": <id> }` and the GitHub Sync panel per-project button to share the existing `pullFromGitHub(project, workspaceId)` path. This keeps C4 inside the manual owner gate and defers automatic polling to future specs.

**Alternatives considered**:
- Add polling or webhook listener: rejected by FR-003, FR-017, and design decision Q2.
- Add a new sync API: rejected because the existing manual sync path is the required production entrypoint.

## Decision: Treat exact merged PR state as the only terminal completion proof

**Rationale**: Authoritative proof requires current GitHub state for the exact linked `github_repo` and `github_pr_number` to report the pull request as merged. Issue closed state, labels, `merge_commit_sha`, `merged_at`, and timeline metadata may support audit evidence but cannot satisfy completion alone.

**Alternatives considered**:
- Complete from a closed issue: rejected by FR-005 and SC-003.
- Complete from any merged PR in the same repo: rejected by FR-004 and FR-006.
- Complete from local status mutation: rejected by FR-008.

## Decision: Reuse existing task-chain advancement only after verified terminal evidence

**Rationale**: C4 must use `advanceTaskChain` only after verified `github_pr_merged` evidence and must prove duplicate manual sync does not launch downstream work more than once. This preserves successor side-effect parity and avoids a parallel launch path.

**Alternatives considered**:
- Add a C4-specific successor launcher: rejected by Constitution VIII and FR-009.
- Skip task-chain verification: rejected because SC-004 requires zero duplicate downstream launches.

## Decision: Use existing evidence sources for SPEC-009D handoff

**Rationale**: C4 is an evidence-producing bridge, not packet implementation. Existing `tasks`, `activities`, `notifications`, `task_artifacts`, `quality_reviews`, GitHub labels, sync rows, and smoke-checklist text provide the handoff map required by Session 4 without a new packet table or UI.

**Alternatives considered**:
- Add packet persistence or evidence dashboard: rejected by FR-012, FR-017, and Q5.
- Add a new terminal-done notification type: rejected by Session 3; evidence must remain bounded in existing notification surfaces.

## Decision: Keep fixture PR evidence test-only

**Rationale**: Automated tests may inject direct `pullFromGitHub` fixture evidence, but production API/UI/poller callsites must not pass fixtures or treat mocked evidence as live smoke proof. Live UAT must use a fresh synthetic C4 PR and text evidence in `docs/qa/pilot-smoke-checklist.md`.

**Alternatives considered**:
- Use SPEC-009C3 PR #49 for UAT: rejected by FR-014 and SC-006.
- Treat fixture evidence as live proof: rejected by FR-015.

## Decision: No UI coverage unless visible evidence surfaces change

**Rationale**: The primary surface is library/API reconciliation plus smoke checklist text. Playwright becomes required only if implementation changes Task Board, GitHub Sync UI, smoke-checklist rendering, or another visible evidence surface.

**Alternatives considered**:
- Always add Playwright: rejected as unnecessary verification debt when no UI behavior changes.
- Use mocked UI fixtures for changed journeys: rejected by Constitution XIV.

## Decision: Preserve archive/status hygiene during setup only

**Rationale**: C4 may move roadmap/status to `In Progress` during setup. Completion and archive cleanup wait for implementation and live UAT. The current target spec must be excluded from same-run archival.

**Alternatives considered**:
- Archive the current target during this run: rejected by FR-018 and Constitution XV.
- Mark complete before live smoke: rejected by FR-013 and SC-006.
