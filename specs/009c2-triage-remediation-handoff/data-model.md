# Data Model: Triage-to-Remediation Plan Handoff

No schema migration is planned. SPEC-009C2 is modeled over existing rows.

## Pilot Issue

- `repository`: must be `racecraft-lab/mission-control`.
- `issueNumber`: GitHub issue number inherited from SPEC-009C1.
- `labels`: includes `mc:inbox`, one `priority:*`, and one routable `area:*`
  for manual smoke.
- Relationship: represented locally by exactly one GitHub-synced Mission
  Control root task from SPEC-009C1.

## Issue Triage Task

- Existing `tasks` row with GitHub repo/issue linkage.
- `workflow_template_slug`: `mission-control_issue_triage`.
- `resolution`: JSON object validated by the workflow template output schema.
- State transition: reaches `done`, then `advanceTaskChain` evaluates output.

## Triage Output

- `disposition`: one of `ACTIONABLE_REMEDIATION`, `DUPLICATE`, `OBSOLETE`,
  `INVALID`, `NEEDS_HUMAN`, `NEEDS_SPECIALIST`, `NEEDS_SPEC`.
- `rationale`: operator-reviewable explanation.
- Validation: missing, malformed, or unknown dispositions fail closed before any
  successor is created.

## Remediation Planning Successor

- Existing `tasks` child row where `parent_task_id` is the Issue Triage task id.
- `workflow_template_slug`: `mission-control_remediation_plan`.
- Created only for `ACTIONABLE_REMEDIATION`.
- Duplicate prevention: repeated processing returns the existing child row and
  must not insert another child for the same triage task.

## Evidence Records

- Disposition: `task_dispositions.task_id` equals the Issue Triage task id.
- Artifact: `task_artifacts.task_id` equals the Issue Triage task id and
  `artifact_type` is `triage_outcome`.
- Activity: `activities.entity_type='task'` and `activities.entity_id` equals
  the Issue Triage task id.
- Side-effect checks must not count activities for other entity types whose ids
  happen to match the task id.

## Negative Outcomes

Valid negative dispositions create no remediation planning successor:

- `DUPLICATE`
- `OBSOLETE`
- `INVALID`
- `NEEDS_HUMAN`
- `NEEDS_SPECIALIST`
- `NEEDS_SPEC`

`NEEDS_SPEC` records evidence only. It does not create a SpecKit/SDD task or
start a future lane in SPEC-009C2.
