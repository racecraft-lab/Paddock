# Data Model: Mission Control Product-Line Seed and Flag Activation

## Facility Workspace

Existing aggregate/global support scope.

**Storage**: `workspaces`

**Identity**:
- `slug = 'facility'`

**Rules**:
- Must remain present when already present.
- Must not be reused as Product Line A.
- Must not receive Mission Control pilot flags or departments as a substitute for `mission-control`.

## Mission Control Product Line

Product Line A workspace.

**Storage**: `workspaces`

**Identity**:
- `slug = 'mission-control'`
- `name = 'Mission Control'`

**Fields used**:
- `id`
- `slug`
- `name`
- `tenant_id`
- `feature_flags`
- `created_at`
- `updated_at`

**Idempotency key**: `workspaces.slug`

**Rules**:
- Exactly one non-facility row with slug `mission-control`.
- `feature_flags` JSON contains Phase 1-7 prerequisites plus `PILOT_MISSION_CONTROL_E2E`.
- Future `FEATURE_TASK_CONTROL_PLANE`, `FEATURE_AGENT_RUNNER_SANDBOXES`, runner, sandbox, and harness flags remain unset or false.
- Legacy `PILOT_PRODUCT_LINE_A_E2E` is not persisted as a second pilot flag.

## Department Project

Mission Control Product Line department destination.

**Storage**: `projects`

**Required rows**:

| Department | Slug | Ticket Prefix | Area Slug | Triage | Repo Sync Owner | GitHub Repo |
|------------|------|---------------|-----------|--------|-----------------|-------------|
| QA | `qa` | `QA` | `qa` | `1` | `1` | `racecraft-lab/mission-control` |
| Development | `development` | `DEV` | `dev` | `0` | `0` | `racecraft-lab/mission-control` or null per existing project pattern |
| DevSecOps | `devsecops` | `SEC` | `devsecops` | `0` | `0` | `racecraft-lab/mission-control` or null per existing project pattern |
| Marketing | `marketing` | `MKT` | `marketing` | `0` | `0` | null unless existing routing requires repo metadata |
| Customer Service | `customer-service` | `CS` | `customer-service` | `0` | `0` | null unless existing routing requires repo metadata |
| Finance | `finance` | `FIN` | `finance` | `0` | `0` | null unless existing routing requires repo metadata |

**Fields used**:
- `id`
- `workspace_id`
- `name`
- `slug`
- `ticket_prefix`
- `area_slug`
- `github_repo`
- `github_sync_enabled`
- `is_triage_project`
- `is_repo_sync_owner`
- `status`
- `metadata`

**Idempotency key**: `(workspace_id, slug)`

**Rules**:
- QA is the only triage/inbox and repo sync-owner department.
- No separate Triage project is created.
- Product surfaces such as macOS app, UI, website, and docs remain task labels or metadata, not projects.

## Agent Role Assignment

Workflow stage-role to platform-agent mapping.

**Storage**: `project_agent_assignments`

**Required mappings**:

| Role | Agent Name |
|------|------------|
| `researcher` | `mission-control-platform-research` |
| `planner` | `mission-control-platform-planner` |
| `dev` | `mission-control-platform-dev` |
| `ui` | `mission-control-platform-ui` |
| `devsecops` | `mission-control-platform-devsecops` |
| `qa` | `mission-control-platform-qa` |

**Fields used**:
- `project_id`
- `agent_name`
- `role`
- `assigned_at`

**Idempotency key**: `(project_id, agent_name, role)`

**Rules**:
- Runtime/evidence derives workspace scope by joining through `projects`.
- No `workspace_id` column is added or required.
- Evidence proves required mappings without requiring an exact total platform-agent count.

## Mission Control Issue Intake

Existing synced GitHub issue task projections preserved as unprocessed intake.

**Storage**: `tasks`

**Identity**:
- `github_repo = 'racecraft-lab/mission-control'`
- `github_issue_number IS NOT NULL`
- `workspace_id = mission-control workspace id` after re-home

**Fields preserved**:
- `github_repo`
- `github_issue_number`
- `github_synced_at`
- `github_branch`
- `github_pr_number`
- `github_pr_state`
- `metadata`
- `created_at`
- `updated_at`

**Fields constrained**:
- `project_id` points to QA triage/inbox project after re-home.
- Status remains unclaimed/unprocessed intake; not claimed, dispatched, done, or remediated by SPEC-009B.
- `parent_task_id` and workflow-chain successor records are not created by the seed.

**Rules**:
- Existing Mission Control issue task count remains stable across reruns.
- SPEC-009B creates zero new pilot issue tasks and zero per-agent seed tasks.

## Workflow Family Templates

Repo-owned runtime workflow templates imported for Mission Control Product Line A.

**Storage**: `docs/ai/workflows/mission-control/workflow-contract.yaml` and `workflow_templates`

**Required slugs**:
- Issue Triage: `mission-control_issue_triage`, `mission-control_specialist_route`, `mission-control_close_issue`, `mission-control_needs_spec_route`
- Issue Remediation: `mission-control_remediation_plan`, `mission-control_dev_implementation`, `mission-control_review`, `mission-control_owner_review`, `mission-control_aegis`

**Idempotency key**: `(workspace_id, slug)` with `created_by = 'workflow-contract'`

**Rules**:
- Contract is corrected before apply if stale.
- Seed calls `loadWorkflowContractFromFile()` and `importWorkflowContract()` directly.
- Import overrides `contract.workspace_id` to the actual `mission-control` workspace id.
- Ownership conflicts fail closed before manual overwrite.

## Feature Flag Set

Product Line A scoped feature flag activation.

**Storage**: `workspaces.feature_flags`

**Enabled keys**:
- `FEATURE_WORKSPACE_SWITCHER`
- `FEATURE_GLOBAL_AEGIS`
- `FEATURE_TASK_PIPELINES`
- `FEATURE_TWO_STEP_TERMINAL`
- `FEATURE_AREA_LABEL_ROUTING`
- `FEATURE_DISPOSITION_LOGGING`
- `FEATURE_TASK_ARTIFACTS`
- `FEATURE_RESOURCE_GOVERNANCE`
- `FEATURE_OPENCLAW_HEALTH_COSTS` only as the Phase 7 prerequisite if the current registry still requires it for pilot cascade
- `PILOT_MISSION_CONTROL_E2E`

**Disabled/unset keys**:
- `PILOT_PRODUCT_LINE_A_E2E`
- `FEATURE_TASK_CONTROL_PLANE`
- `FEATURE_AGENT_RUNNER_SANDBOXES`
- harness, runner, sandbox, and auto-merge future flags

**Idempotency key**: JSON object key within `workspaces.feature_flags`

## Governance Policy

Conservative Mission Control policy visibility rows.

**Storage**: `resource_policies`

**Required identities**:

| Notes Marker | Policy Type | Limit Kind | Limit Value | Period | Timezone | Enforcement | Enabled |
|--------------|-------------|------------|-------------|--------|----------|-------------|---------|
| `SPEC-009B:mission-control:daily-token-budget` | `budget` | `token` | `1000000` | `day` | `America/Chicago` | `alert` | `1` |
| `SPEC-009B:mission-control:daily-usd-budget` | `budget` | `usd` | `10` | `day` | `America/Chicago` | `alert` | `1` |
| `SPEC-009B:mission-control:wip-visibility-template` | `wip_limit` | `concurrent_tasks` | `2` | null | `America/Chicago` | `alert` | `0` or `default_template=1` |

**Idempotency key**: `(workspace_id, notes)`

**Rules**:
- No blackout or degraded-window policies.
- WIP row is evaluator-inactive unless implementation tests prove it cannot emit `defer:wip_limit`.
- Evidence proves normal pilot intake receives no `defer:wip_limit`, `block:hard_budget_exceeded`, blackout, or degraded-window decision.

## Cleanup Residue

Non-Mission-Control state that blocks seed readiness.

**Observed surfaces**:
- Non-Mission-Control `projects.github_repo` / `github_sync_enabled`
- Non-Mission-Control `tasks.github_repo` / linked issue metadata
- Issue-sync cron configuration
- OpenClaw/gateway agent configuration
- Operator-supplied `ssh hall` FocusEngine project/ticket/sync evidence

**Rules**:
- Residue is summarized with cleanup-safe identifiers, counts, timestamps, booleans, config paths, and hashes.
- Raw tokens, secrets, passwords, Authorization headers, API keys, and credential-like substrings are redacted.
- If any blocking residue exists, no seed mutation occurs.

## State Transitions

```text
not_started
  -> blocked_preflight(not_mutated)  # residue found, no DB seed writes
  -> seeded(applied)                 # clean target, transactional seed applied
  -> verified(stable)                # seed rerun/evidence checks stable
```

Forbidden transitions:

- `seeded -> claimed`
- `seeded -> dispatched`
- `seeded -> runner_created`
- `seeded -> sandbox_created`
- `seeded -> synthetic_issue_created`
- `seeded -> auto_merged`
