# Research: GitHub Pilot Issue Ingest and Eligibility

## Decision: Reuse Existing GitHub Sync As The Only Pilot Ingest Path

**Rationale**: The spec requires GitHub Issues to remain the tracker of record and Mission Control tasks to be synchronized projections. Reusing `src/lib/github-sync-engine.ts`, `src/app/api/github/sync/route.ts`, `src/lib/github-label-map.ts`, and `src/lib/task-create.ts` preserves existing task creation side effects and avoids a second source of pilot work.

**Alternatives considered**:
- Local task creation with later GitHub linkage: rejected because it violates the GitHub source-of-truth proof.
- New pilot-only ingest endpoint: rejected because SPEC-009C1 explicitly avoids new production evidence/API surfaces.
- Workflow-contract tracker labels as executable filters: rejected because tracker labels remain template metadata until a later contract spec changes that contract.

## Decision: Keep Eligibility Deterministic And Fixture-Compatible

**Rationale**: The candidate pool starts from the operator/live query `repo:racecraft-lab/mission-control is:issue is:open label:"mc:inbox" -linked:pr`, then applies local filters for repository identity, open issue-not-PR identity, `mc:inbox`, at least one `priority:*`, exactly one routable `area:*`, duplicate synced task absence, linked PR exclusion, and terminal/status exclusion. The same filter shape can be exercised with static fixtures and mocked clients without live GitHub access.

**Alternatives considered**:
- Relying only on GitHub search syntax: rejected because fixture tests need local, inspectable rejection reasons.
- Allowing triage fallback for missing or ambiguous area labels: rejected because the pilot requires exactly one deterministic route.
- Allowing multiple area labels when one matches: rejected because ambiguity is itself an unsafe pilot candidate.

## Decision: Preserve Duplicate Prevention At GitHub Issue Identity

**Rationale**: The success proof is exactly one root `tasks` row in the Mission Control workspace where `github_repo='racecraft-lab/mission-control'`, `github_issue_number` matches the pilot issue, `github_synced_at IS NOT NULL`, and `parent_task_id IS NULL`. Duplicate checks should use this GitHub repository/issue identity before admitting a candidate and verify idempotency after repeated sync.

**Alternatives considered**:
- Dedupe by title: rejected because titles are mutable and synthetic fallback uses a known title only for finding/reusing the fallback issue.
- Dedupe by local task id: rejected because the pilot source identity is the GitHub issue.
- Requiring task-chain lineage fields for the root proof: rejected by clarification; root ingest proof does not require `root_task_id`, `chain_id`, or `chain_stage`.

## Decision: Keep Synthetic Fallback Explicit And Operator-Controlled

**Rationale**: The operator smoke path first searches for an open issue titled `[mc-pilot] synthetic e2e issue`; creation is allowed only with explicit live-mutation opt-in and uses `mc:inbox`, `priority:medium`, and `area:dev`. Automated tests should mock find/create behavior and must not require credentials or mutate GitHub.

**Alternatives considered**:
- Creating the synthetic issue automatically in app runtime: rejected because normal runtime must not mutate live GitHub for this spec.
- Auto-closing or deleting the synthetic issue after smoke: rejected because cleanup ownership belongs to the manual smoke checklist.
- Running live fallback in CI: rejected because CI must remain deterministic and credential-free.

## Decision: Prove No Autonomous Side Effects With Current-Schema Snapshots

**Rationale**: SPEC-009C1 should assert zero side effects only on current schema surfaces: no child `tasks`, no task-chain lineage on the pilot row, `dispatch_attempts = 0`, `assigned_to IS NULL`, zero linked `runs`, `task_dispositions`, and `task_artifacts`, and no dispatch/pipeline/remediation `activities`. Future claim, runner, or sandbox tables may be checked only with table-if-exists guards.

**Alternatives considered**:
- Adding placeholder run-state or sandbox tables: rejected because formal lifecycle assertions are deferred to SPEC-013A+ and SPEC-014A+.
- Proving absence through production UI: rejected because durable operator-visible eligibility/evidence surfaces are deferred to SPEC-009E.
- Wiring automatic sync to exercise the proof: rejected because automatic polling lifecycle belongs to SPEC-013A1.

## Decision: No Schema Migration

**Rationale**: The spec's identity proof and side-effect absence checks are expressible through existing GitHub task linkage, task parentage, dispatch/assignment fields, and related run/artifact/activity/disposition surfaces. No new persistence is required for this backend/smoke slice.

**Alternatives considered**:
- Adding an eligibility decisions table: rejected as unnecessary for SPEC-009C1 because inspectable test/operator evidence is sufficient and production evidence surfaces are deferred.
- Adding a pilot marker column to `tasks`: rejected because the pilot task is identified by GitHub issue linkage plus root-task shape.
- Adding migration-only future lifecycle placeholders: rejected as speculative schema for later specs.
