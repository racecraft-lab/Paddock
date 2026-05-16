# Data Model: SPEC-009C3 - Dev/Review/Aegis to Ready for Owner

## Existing Entities

### Root GitHub Issue Task

- **Purpose**: Original pilot tracker item from issue ingest/triage.
- **Key fields**: `id`, `workspace_id`, GitHub issue repository/number fields,
  `status`, lineage fields, activity history.
- **Relationships**: Parent or lineage root for the remediation plan task and
  PR-producing dev task.
- **Validation rules**: Must remain traceable but must not become the linked PR
  owner or SPEC-009C3 `ready_for_owner` subject.

### Remediation Plan Task

- **Purpose**: Bounded successor created by SPEC-009C2 to capture the
  remediation plan.
- **Key fields**: `id`, `workspace_id`, template/workflow slug, parent/lineage,
  status, assignee, artifact relationships.
- **Relationships**: Links root issue to the downstream PR-producing dev task.
- **Validation rules**: Must produce or link/supersede `remediation_plan`
  evidence onto the PR-producing dev task before readiness evaluation.

### PR-Producing Dev Task

- **Purpose**: `mission-control_dev_implementation` task that owns the linked PR
  and becomes `ready_for_owner`.
- **Key fields**: `id`, `workspace_id`, `workflow_template_slug`, `status`,
  `github_repo`, `github_pr_number`, parent/lineage, activities, artifacts.
- **Relationships**: Descendant of root issue/remediation plan; subject for
  review verdict, Aegis quality review, stage artifacts, governance evidence,
  and readiness transition.
- **Validation rules**:
  - Must own deterministic or live PR identity before C3 success can be counted.
  - Must be the only task moved to `ready_for_owner` for this chain.
  - Must not transition to `done` in SPEC-009C3.

### Workflow Template

- **Purpose**: Repo-owned YAML/runtime template that defines stage slugs and PR
  producing semantics.
- **Key fields**: `slug`, labels/prompts/copy, `produces_pr`,
  `external_terminal_event`, successor fields.
- **Relationships**: Drives task-chain stage creation and advancement.
- **Validation rules**:
  - Slugs remain stable.
  - `mission-control_dev_implementation` preserves `produces_pr`.
  - Dev template declares merge-gated external terminal semantics with
    `external_terminal_event: github_pr_merged`.
  - Non-slug copy may be tightened only to avoid misleading ownership.

### Stage Artifact

- **Purpose**: Durable readiness evidence stored in `task_artifacts`.
- **Storage**: Existing artifact row with `storage_kind='inline_json'`,
  `mime='application/json'`, and `schema_version='spec-009c3.v1'`.
- **Canonical subject**: PR-producing dev task.
- **Required common payload fields**:
  - `artifact_type`
  - `stage`
  - `produced_at`
  - `producer_task_id`
  - `workspace_id`
  - `root_issue`
  - `pr_dev_task`
  - `summary`
- **Security rules**: Payloads contain metadata, bounded summaries, command
  names/results, links, commit IDs, and PR identifiers only. They must not
  include secrets, tokens, credentials, connection strings, raw sensitive source,
  or raw sensitive logs.

### Remediation Plan Artifact

- **Artifact type**: `remediation_plan`
- **Minimum fields**:
  - Common stage artifact fields
  - `problem_statement`
  - `planned_changes`
  - `verification_plan`
  - `risk_notes`
- **Validation rules**: Missing root issue identity, wrong workspace, or missing
  dev task linkage fails readiness evaluation.

### Dev Verification Artifact

- **Artifact type**: `dev_verification`
- **Minimum fields**:
  - Common stage artifact fields
  - `commit`
  - `branch`
  - `checks`
  - `residual_risk`
  - `pr_identity_source`
- **Validation rules**:
  - `checks` records command names and pass/fail results, not raw logs.
  - `pr_identity_source='fixture'` is accepted only for automated fixture
    validation, not as live GitHub proof.
  - PR repo/number identity must be present before C3 success.

### Review Verdict Artifact

- **Artifact type**: `review_verdict`
- **Minimum fields**:
  - Common stage artifact fields
  - `verdict` with value `pass` or `fix`
  - `reviewer`
  - `blocking_findings`
- **Validation rules**:
  - `fix` blocks Aegis advancement, owner-review advancement, and
    `ready_for_owner`.
  - Corrected work may add a later `pass` without deleting prior `fix`
    evidence.

### Aegis Quality Review

- **Purpose**: Authoritative Aegis gate in existing `quality_reviews`.
- **Key fields**: `id`, reviewed task id, `workspace_id`, `reviewer='aegis'`,
  status `approved` or `rejected`, reason/comment fields, timestamps.
- **Relationships**: Referenced by the `aegis_approval` artifact.
- **Validation rules**:
  - Must target the PR-producing dev task.
  - Must share the same workspace as the dev task.
  - Missing, wrong-workspace, or non-`aegis` review blocks readiness.

### Aegis Approval Artifact

- **Artifact type**: `aegis_approval`
- **Minimum fields**:
  - Common stage artifact fields
  - `quality_review_id`
  - `reviewer='aegis'`
  - `status` with value `approved` or `rejected`
  - `workspace_id`
  - `reason`
- **Validation rules**:
  - Artifact cannot approve readiness without the canonical quality-review row.
  - `rejected` blocks readiness and records bounded retry evidence.

### Advisory Governance Evidence Artifact

- **Artifact type**: `governance_evidence`
- **Minimum fields**:
  - Common stage artifact fields
  - `stage_decisions`
  - `policy_ids`
  - `reason_codes`
  - `event_ids`
  - `evaluated_at`
  - `readiness_blocked`
- **Validation rules**:
  - Any resource-policy violation, blocked budget result, blocked window result,
    or `readiness_blocked=true` prevents `ready_for_owner`.
  - Evidence remains advisory and does not create claim/run authority.

## State Transitions

```text
Remediation plan evidence present
  -> PR-producing dev task records PR linkage and dev verification
  -> review verdict recorded
      pass -> Aegis review gate
      fix  -> loop/block before Aegis and readiness
  -> Aegis quality review recorded
      approved -> readiness evaluation
      rejected -> bounded loop/block before readiness
  -> governance evidence evaluated
      no blockers -> dev task may become ready_for_owner
      blockers    -> readiness blocked
```

## Fail-Closed Conditions

- Missing remediation plan evidence.
- Missing deterministic or live PR linkage on the dev task.
- Missing dev verification evidence.
- Review verdict absent or unsupported.
- Review verdict `fix`.
- Missing Aegis quality-review row.
- Aegis row not reviewer `aegis`.
- Aegis row scoped to the wrong workspace or wrong task.
- Aegis status `rejected`.
- Missing or blocked governance evidence.
- Any attempt to move helper/root/review tasks to `ready_for_owner`.
- Any attempt to merge, observe merge, reconcile GitHub merge, or move
  `ready_for_owner` to `done`.
