# Contract: Issue Triage Handoff

## Workflow Template

Template slug: `mission-control_issue_triage`

Required output schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["disposition", "rationale"],
  "properties": {
    "disposition": {
      "type": "string",
      "enum": [
        "ACTIONABLE_REMEDIATION",
        "DUPLICATE",
        "OBSOLETE",
        "INVALID",
        "NEEDS_HUMAN",
        "NEEDS_SPECIALIST",
        "NEEDS_SPEC"
      ]
    },
    "rationale": {
      "type": "string"
    }
  }
}
```

Routing rules:

```json
[
  {
    "when": "$.disposition == \"ACTIONABLE_REMEDIATION\"",
    "next_template_slug": "mission-control_remediation_plan"
  }
]
```

`next_template_slug` must be absent or null on `mission-control_issue_triage` so
negative outcomes terminate instead of falling through to a successor.

## Runtime Contract

- `advanceTaskChain` validates the triage JSON before routing.
- `ACTIONABLE_REMEDIATION` creates one child task using
  `mission-control_remediation_plan`.
- Reprocessing the same triage task returns the existing successor.
- Negative dispositions create no child task.
- Invalid or missing dispositions fail closed and create no child task.
- Evidence is recorded on the triage task through existing
  `task_dispositions`, `task_artifacts`, and `activities` rows.

## Verification Contract

- Workflow-contract import/apply/export parity preserves prompt, schema, and
  routing hashes.
- Focused Vitest proves actionable, duplicate actionable, negative, and invalid
  branches without live GitHub mutation.
- Manual UAT uses a fresh SPEC-009C2 synthetic issue and records cleanup.
