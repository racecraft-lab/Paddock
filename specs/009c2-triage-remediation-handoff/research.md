# Research: Triage-to-Remediation Plan Handoff

## Decision: Use Uppercase Pilot Triage Taxonomy

The Issue Triage workflow contract will emit
`ACTIONABLE_REMEDIATION`, `DUPLICATE`, `OBSOLETE`, `INVALID`,
`NEEDS_HUMAN`, `NEEDS_SPECIALIST`, or `NEEDS_SPEC`.

**Rationale**: The roadmap and design concept treat these values as the pilot
taxonomy. Uppercase values make pilot routing explicit and keep
`ACTIONABLE_REMEDIATION` distinct from SPEC-007 terminal disposition words such
as `closed` or `duplicate`.

**Alternatives considered**: Reusing only the SPEC-007 lowercase enum was
rejected because it cannot distinguish `NEEDS_SPEC`, needs-human, and
needs-specialist future lanes without overloading generic outcomes.

## Decision: Preserve SPEC-007 Disposition Compatibility

Disposition schema detection and validation should accept both the existing
SPEC-007 lowercase enum family and the SPEC-009C2 pilot enum family.

**Rationale**: `src/lib/task-dispatch.ts` currently detects triage templates by
requiring a `disposition` output schema with the SPEC-007 enum. SPEC-009C2 must
not break existing disposition logging, but pilot triage also needs a new
closed taxonomy.

**Alternatives considered**: Replacing the SPEC-007 enum was rejected because
existing tests and workflow templates rely on the original values.

## Decision: Route Only Actionable Output To Remediation Planning

The `mission-control_issue_triage` template should use `routing_rules` to route
`$.disposition == "ACTIONABLE_REMEDIATION"` to
`mission-control_remediation_plan`. It should not use a static fallback
successor.

**Rationale**: `advanceTaskChain` already evaluates output schema, routing
rules, and target templates. With no fallback next template, valid negative
outputs terminate normally and do not create a successor.

**Alternatives considered**: A bespoke pilot handoff helper was rejected because
Constitution Principle VIII requires successor side-effect parity through the
shared task-chain helper path.

## Decision: Anchor Evidence To The Triage Task

Actionable and non-remediation outcomes should record disposition, artifact,
and activity evidence on the Issue Triage task.

**Rationale**: The triage task is the accepted decision point. Existing
`task_dispositions`, `task_artifacts`, and `activities` already provide durable
task-scoped evidence without adding UI/API surfaces.

**Alternatives considered**: A new pilot evidence table or UI was rejected
because SPEC-009E owns production evidence surfaces.

## Decision: Keep Live GitHub Mutation Manual

Automated tests will use SQLite fixtures and mocked sync seams only. The fresh
SPEC-009C2 synthetic issue is documented in `docs/qa/pilot-smoke-checklist.md`.

**Rationale**: The PRD keeps GitHub as tracker of record, but tests must not
require secrets or mutate live GitHub. Manual UAT records the one live smoke and
cleanup evidence.

**Alternatives considered**: Creating or closing GitHub issues from tests or
normal runtime was rejected because SPEC-009C2 is not the GitHub sync automation
spec.
