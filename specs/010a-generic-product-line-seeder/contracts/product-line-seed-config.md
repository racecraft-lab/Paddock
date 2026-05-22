# Contract: Product-Line Seed Config

## Canonical Path

`docs/ai/product-lines/mission-control.yaml`

## Schema Marker

```yaml
schema_version: product-line-seed-v1
```

## Required Top-Level Sections

```yaml
schema_version: product-line-seed-v1
product_line: {}
github: {}
workflow_contract: {}
departments: []
agent_assignments: {}
feature_flags: {}
governance_defaults: []
safety_policy: {}
```

Unknown top-level sections are invalid.

## Minimal Mission Control Shape

```yaml
schema_version: product-line-seed-v1
product_line:
  slug: mission-control
  display_name: Mission Control
  agent_prefix: mission-control-platform
github:
  owner: racecraft-lab
  repo: mission-control
  full_name: racecraft-lab/mission-control
workflow_contract:
  family: mission-control
  path: docs/ai/workflows/mission-control/workflow-contract.yaml
  required_slugs:
    - mission-control_issue_triage
    - mission-control_specialist_route
    - mission-control_close_issue
    - mission-control_needs_spec_route
    - mission-control_remediation_plan
    - mission-control_dev_implementation
    - mission-control_review
    - mission-control_owner_review
    - mission-control_aegis
departments:
  - slug: qa
    name: QA
    ticket_prefix: QA
    area_slug: qa
    github_repo: racecraft-lab/mission-control
    github_sync_enabled: true
    is_triage_project: true
    is_repo_sync_owner: true
agent_assignments:
  product_line_assignments:
    - agent_key: research
      role: researcher
      department_slug: qa
feature_flags:
  enabled:
    - FEATURE_WORKSPACE_SWITCHER
    - FEATURE_GLOBAL_AEGIS
    - FEATURE_TASK_PIPELINES
    - FEATURE_TWO_STEP_TERMINAL
    - FEATURE_AREA_LABEL_ROUTING
    - FEATURE_DISPOSITION_LOGGING
    - FEATURE_TASK_ARTIFACTS
    - FEATURE_RESOURCE_GOVERNANCE
    - FEATURE_OPENCLAW_HEALTH_COSTS
    - PILOT_MISSION_CONTROL_E2E
  disabled_or_absent:
    - FEATURE_TASK_CONTROL_PLANE
    - FEATURE_AGENT_RUNNER_SANDBOXES
governance_defaults:
  - identity: daily-token-budget
    policy_type: budget
    limit_kind: token
    limit_value: 1000000
    period: day
    timezone: America/Chicago
    enforcement: alert
    enabled: true
    default_template: false
safety_policy:
  existing_target: refuse_unless_allow_existing
  allow_first_intake_blocking_governance: false
  config_owned_surfaces:
    - workspace_identity
    - department_projects
    - agent_assignments
    - workflow_contract_templates
    - feature_flags
    - governance_defaults
  preserved_surfaces:
    - tasks
    - activities
    - comments
    - notifications
    - dispositions
    - artifacts
    - quality_reviews
    - github_sync_state
    - governance_audit_rows
    - manual_workflow_templates
    - row_ids
    - creation_timestamps
    - task_status
    - task_github_linkage
    - task_lineage
    - project_ticket_counters
    - assignment_timestamps
    - workflow_use_counters
    - non_owned_feature_flags
  blocked_side_effects:
    - product_line_b
    - github_mutation
    - task_creation
    - dispatch
    - claim
    - runner
    - sandbox
    - harness_adapter
    - auto_merge
    - speckit_setup_or_autopilot
```

## Validation Rules

- `schema_version` must equal `product-line-seed-v1`.
- `workflow_contract.family` must equal `mission-control` for SPEC-010A.
- `workflow_contract.required_slugs` must all exist in the referenced contract.
- `feature_flags.enabled` entries must be keys in `FEATURE_FLAG_REGISTRY`.
- `feature_flags.disabled_or_absent` entries must be registry keys or the reserved future flags `FEATURE_TASK_CONTROL_PLANE` and `FEATURE_AGENT_RUNNER_SANDBOXES`.
- `agent_assignments.product_line_assignments[].agent_key` must be slug-safe and must not already include `product_line.agent_prefix`.
- Derived product-line agent names are `product_line.agent_prefix + "-" + agent_key`.
- Shared support assignments must declare `scope: facility_global`, `shared_support_role`, and `agent_name`.
- Governance defaults use existing `resource_policies` field names.
- First-intake-blocking governance requires an explicit safety-policy allowance and per-policy reason.
