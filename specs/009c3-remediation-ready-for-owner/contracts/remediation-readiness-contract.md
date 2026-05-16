# Contract: SPEC-009C3 Remediation Readiness

## Scope

This contract defines the observable behavior and evidence required for the
Issue Remediation chain to move the PR-producing
`mission-control_dev_implementation` task to `ready_for_owner`.

It does not define a new public API, database schema, runner, claim authority,
sandbox adapter, poller, merge observer, or evidence UI.

## Readiness Subject

- The readiness subject is the `mission-control_dev_implementation` task.
- The readiness subject owns `github_repo` and `github_pr_number`.
- The root GitHub issue and helper stage tasks remain traceable but cannot be
  the SPEC-009C3 PR owner or owner-ready task.

## Required Evidence Contract

All required artifacts are attached to or linked/superseded onto the readiness
subject before readiness evaluation.

### Common Artifact Envelope

```json
{
  "schema_version": "spec-009c3.v1",
  "artifact_type": "remediation_plan",
  "stage": "remediation_plan",
  "produced_at": "2026-05-16T00:00:00.000Z",
  "producer_task_id": 1001,
  "workspace_id": 1,
  "root_issue": {
    "task_id": 900,
    "github_repo": "racecraft-lab/mission-control",
    "github_issue_number": 123
  },
  "pr_dev_task": {
    "task_id": 1002,
    "workflow_template_slug": "mission-control_dev_implementation",
    "github_repo": "racecraft-lab/mission-control",
    "github_pr_number": 456,
    "pr_identity_source": "fixture"
  },
  "summary": "Bounded non-secret evidence summary"
}
```

Common validation:

- `schema_version` is exactly `spec-009c3.v1`.
- `storage_kind` is `inline_json`.
- `mime` is `application/json`.
- `workspace_id` matches the readiness subject.
- `root_issue` identifies the original GitHub issue context.
- `pr_dev_task` identifies the readiness subject and its PR identity.
- Payloads exclude secrets, tokens, credentials, connection strings, raw
  sensitive logs, and raw sensitive source.

### Remediation Plan

```json
{
  "artifact_type": "remediation_plan",
  "stage": "remediation_plan",
  "problem_statement": "Issue being remediated",
  "planned_changes": ["Change summary"],
  "verification_plan": ["pnpm test ..."],
  "risk_notes": ["Residual risk summary"]
}
```

### Dev Verification

```json
{
  "artifact_type": "dev_verification",
  "stage": "dev_implementation",
  "commit": "abcdef123456",
  "branch": "009c3-remediation-ready-for-owner",
  "checks": [
    {"command": "pnpm test ...", "result": "pass"}
  ],
  "residual_risk": "None identified",
  "pr_identity_source": "fixture"
}
```

### Review Verdict

```json
{
  "artifact_type": "review_verdict",
  "stage": "review",
  "verdict": "pass",
  "reviewer": "review-agent",
  "blocking_findings": []
}
```

Allowed `verdict` values:

- `pass`: eligible to proceed toward Aegis when all prior evidence exists.
- `fix`: records evidence and blocks Aegis successors, owner-review successors,
  and `ready_for_owner`.

### Aegis Approval

```json
{
  "artifact_type": "aegis_approval",
  "stage": "aegis",
  "quality_review_id": 7001,
  "reviewer": "aegis",
  "status": "approved",
  "workspace_id": 1,
  "reason": "Approved after review gate passed"
}
```

The artifact is durable evidence only. The authoritative gate is the referenced
`quality_reviews` row for the same task/workspace with reviewer `aegis`.

Allowed `status` values:

- `approved`: eligible for readiness when all other evidence and governance
  conditions pass.
- `rejected`: records evidence and blocks owner-ready state.

### Governance Evidence

```json
{
  "artifact_type": "governance_evidence",
  "stage": "readiness",
  "stage_decisions": [
    {
      "stage": "dev_implementation",
      "decision_class": "resource_policy",
      "decision": "allow",
      "reason_codes": [],
      "policy_ids": ["policy-1"],
      "event_ids": [],
      "evaluated_at": "2026-05-16T00:00:00.000Z"
    }
  ],
  "readiness_blocked": false
}
```

Readiness is blocked if any stage decision records a resource-policy violation,
blocked budget result, blocked window result, or `readiness_blocked=true`.

## Transition Contract

### Happy Path

Given a PR-producing dev task in the same workspace as the root issue lineage:

1. Remediation plan evidence exists.
2. Dev task has deterministic or live PR identity and dev verification evidence.
3. Latest applicable review verdict is `pass`.
4. `quality_reviews` contains reviewer `aegis` status `approved` for the dev
   task and workspace.
5. `aegis_approval` artifact references that quality-review row.
6. Governance evidence exists and does not block readiness.

Then the dev task may transition to `ready_for_owner`.

### Review Fix Path

Given a review verdict `fix`:

- The verdict is retained as evidence.
- No Aegis successor or owner-review readiness is created for that failed
  verdict.
- The dev task remains available for bounded correction/retry.
- No task becomes `ready_for_owner`.

### Aegis Rejected Path

Given Aegis status `rejected`:

- The rejection is retained in `quality_reviews`, activities/comments where
  current behavior provides them, and an `aegis_approval` evidence artifact.
- The dev task remains available for bounded correction/retry.
- No task becomes `ready_for_owner`.

## Out-of-Scope Assertions

SPEC-009C3 validation fails if the implementation introduces or exercises:

- Manual merge observation.
- GitHub merge reconciliation.
- `ready_for_owner -> done`.
- Durable claim-state or run-state tables.
- Automatic GitHub sync polling.
- Sandbox lifecycle or harness adapter execution.
- Dedicated pilot evidence UI.
- Broad workflow slug migration.
