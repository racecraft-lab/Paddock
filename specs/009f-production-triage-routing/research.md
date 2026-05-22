# Research: Production Triage Outcome Routing

## Decision: Reuse existing disposition, artifact, and activity persistence

**Rationale**: Design Concept Q8 chooses existing `task_dispositions`, `task_artifacts`, and `activities` rows, and the spec clarifies no migration is planned. This satisfies Constitution VII and keeps the change additive. Routing artifacts carry strict SPEC-009F payloads; activities record `triage_routing_recorded`, `triage_routing_conflict`, and `triage_routing_artifact_publish_failed`.

**Alternatives considered**:

- New `triage_routing_events` table: rejected because Q8 and FR-004 require reuse and no migration.
- Activity-only evidence: rejected because FR-006 through FR-013 require typed lane artifacts with lane-specific payload fields.

## Decision: Add a focused TypeScript payload helper

**Rationale**: Clarify records a helper near triage routing, such as `src/lib/triage-routing-payloads.ts`, with exported types, builders, and validators. This keeps raw lane payload validation out of React and out of generic artifact storage. No runtime schema library is needed; use explicit TypeScript types and small validators.

**Alternatives considered**:

- Free-form artifact metadata: rejected by Design Concept Q11 and FR-022.
- AJV schemas for SPEC-009F payloads: rejected for v1 because no new runtime dependency is allowed and the payload family is small enough for explicit validation.

## Decision: Add one routing helper instead of workflow successor templates

**Rationale**: Design Concept Q9/Q15 require terminal Issue Triage outcomes with evidence only. The helper records recommendation artifacts and activities for supported non-remediation dispositions while preserving the existing `ACTIONABLE_REMEDIATION` successor behavior. It must not call `createTask()` for non-remediation outcomes.

**Alternatives considered**:

- Add successor templates for non-remediation lanes: rejected by Q15, FR-003, and FR-033.
- Reuse `mission-control_specialist_route`, `mission-control_close_issue`, or `mission-control_needs_spec_route` as successor tasks: rejected for v1; their metadata may inform wording only.

## Decision: Gate routing under existing pilot scope

**Rationale**: Design Concept Q7 and Clarify confirm `PILOT_MISSION_CONTROL_E2E` is sufficient. Runtime routing requires that flag, source template slug `mission-control_issue_triage`, GitHub repo `racecraft-lab/mission-control`, supported disposition, and existing disposition/artifact prerequisites.

**Alternatives considered**:

- Add `FEATURE_PRODUCTION_TRIAGE_ROUTING`: rejected as unnecessary flag lifecycle overhead.
- Enable for all Issue Triage workflows: rejected because FR-034 requires Mission Control pilot gates.

## Decision: Derive `triage_routing` server-side in existing task Evidence

**Rationale**: Design Concept Q6 says to extend existing task Evidence route/section, and Clarify requires API field `triage_routing` with UI label `Triage routing`. `src/lib/task-evidence.ts` already owns stored evidence derivation and sanitization; adding `buildTriageRoutingEvidence()` there or near it preserves the route contract and keeps React from parsing raw artifacts.

**Alternatives considered**:

- Separate triage-routing API route: rejected by Q6 and the no-new-surface reviewability constraint.
- Client-side artifact parsing: rejected by FR-030 and security requirements.

## Decision: Specialist recommendation uses deterministic metadata only

**Rationale**: Clarify limits specialist matching to source task/workspace, `projects.area_slug`, normalized `area:*` routing evidence, `project_agent_assignments`, and same-workspace `agents`. Recommendation is allowed only when exactly one lane and one eligible owner resolve; otherwise emit `specialist_state: "unassigned"`.

**Alternatives considered**:

- Infer from issue title/body/rationale keywords: rejected as unsafe and non-deterministic.
- Auto-assign or dispatch: rejected by Q4/Q14 and no-side-effect scope.

## Decision: Fixture-driven UAT covers all six outcomes

**Rationale**: Design Concept Q10 and Clarify require deterministic local/test database fixtures for all six dispositions plus a Playwright inspection journey over `/tasks`. Screenshots and fixture export live under `test-results/spec-009f-triage-routing/` and are not committed.

**Alternatives considered**:

- Live GitHub issue smoke: rejected because SPEC-009F must not create or mutate live GitHub issues.
- Unit tests only: rejected because Constitution XIV requires real browser validation for the task Evidence UI change.

## Decision: Static/diff guard proves forbidden side effects stay absent

**Rationale**: Clarify requires guardrails proving no GitHub mutation, label application, successor creation, claim, runner, sandbox, adapter, or auto-merge drift. A SPEC-009F guard script scanning `origin/main...HEAD` provides a reviewable, deterministic check that complements behavioral tests.

**Alternatives considered**:

- Rely on code review only: rejected because FR-038 requires behavioral and static/diff guardrails.
- Broad repo scanner over all history: rejected as noisy; Constitution XVI points diff-scoped acceptance at `origin/main...HEAD`.
