# Contract: SPEC-009C3 Remediation Readiness

## Scope

This contract defines the observable behavior and evidence required for the
Issue Remediation chain to move the PR-producing
`mission-control_dev_implementation` task to `ready_for_owner`.

It does not define a new public API, database schema, runner, claim authority,
sandbox adapter, poller, merge observer, or evidence UI.

The SPEC-009C3 evidence gates apply only to the remediation pilot chain whose
readiness subject is `mission-control_dev_implementation`. Non-pilot task
chains and non-remediation PR-producing tasks continue to use the existing
SPEC-004/SPEC-007 task-chain behavior and SPEC-005 ready-for-owner semantics
without requiring SPEC-009C3 stage artifacts.

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
- Publish or supersede failure for any required stage artifact blocks readiness
  until the required artifact is successfully present on or linked/superseded
  onto the readiness subject. The failure record is an activity scoped to the
  readiness subject's workspace with artifact type, stage, readiness subject,
  and sanitized error class or reason.

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

### Readiness Failure Semantics

Readiness checks fail closed before owner-ready side effects. For review `fix`,
Aegis `rejected`, missing or failed artifact evidence, blocked governance
evidence, unsupported verdict/status, wrong workspace, fixture/live PR misuse,
or missing PR linkage:

- no task status is written to `ready_for_owner`;
- no owner-ready notification is emitted;
- no `task_ready_for_owner` activity is written;
- no outbound ready-for-owner sync is attempted;
- no Aegis successor, owner-review successor, or owner packet is created.

### C3 Review Transition Guard

`mission-control_review.next_template_slug` remains stable workflow-contract
metadata for compatibility, but it is not by itself sufficient to create a
SPEC-009C3 successor. For review output associated with the PR-producing
`mission-control_dev_implementation` task, the latest applicable
`review_verdict` is the guard evaluated before static fallback successor
selection:

- `fix` disables the C3 transition for that attempt, retains verdict evidence,
  and prevents `mission-control_owner_review`, `mission-control_aegis`, and
  `ready_for_owner` side effects.
- `pass` bypasses owner-review for this slice, retains verdict evidence on or
  linked/superseded onto the PR-producing dev task, and allows the Aegis
  quality-review/readiness gate to be evaluated against that dev task.
- Missing dev-task identity, wrong workspace, missing required prior evidence,
  or an unsupported verdict fails closed and does not fall through to the
  static `next_template_slug`.

### Happy Path

Given a PR-producing dev task in the same workspace as the root issue lineage:

1. Remediation plan evidence exists.
2. Dev task has deterministic or live PR identity and dev verification evidence.
3. Latest applicable review verdict is `pass` and the C3 review transition guard
   has bypassed owner-review for this slice.
4. `quality_reviews` contains reviewer `aegis` status `approved` for the dev
   task and workspace.
5. `aegis_approval` artifact references that quality-review row.
6. Governance evidence exists and does not block readiness.

Then the dev task may transition to `ready_for_owner`.

### Review Fix Path

Given a review verdict `fix`:

- The verdict is retained as evidence.
- The static review successor fallback is suppressed for that failed verdict.
- No Aegis successor, owner-review successor/readiness, or owner-ready state is
  created for that failed verdict.
- The dev task remains available for bounded correction/retry.
- No task becomes `ready_for_owner`.
- No owner-ready side effects listed in Readiness Failure Semantics occur.

### Aegis Rejected Path

Given Aegis status `rejected`:

- The rejection is retained in `quality_reviews`, activities/comments where
  current behavior provides them, and an `aegis_approval` evidence artifact.
- The dev task remains available for bounded correction/retry.
- No task becomes `ready_for_owner`.
- No owner-ready side effects listed in Readiness Failure Semantics occur.

### Optional Live Draft PR Smoke

Live PR smoke is operator UAT only and cannot change fixture acceptance. A live
smoke proof is valid only when the recorded PR identity is draft, belongs to the
readiness subject, has not been merged or reconciled to `done`, and includes
cleanup evidence or an explicit retention rationale.

Missing PR identity, non-draft PR identity, PR identity owned by the wrong task,
unexpected live mutation beyond draft creation, merge or `done` reconciliation,
or missing cleanup evidence fails the live-smoke proof closed.

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
- SPEC-009C4 owner merge or `ready_for_owner -> done` reconciliation.
- SPEC-009D/E pilot review packet or durable evidence-surface delivery.
- SPEC-013A-C or SPEC-014A-D durable run-state, claim, control-plane, sandbox,
  adapter, or full SpecKit/SDD execution-lane delivery.
