# Contract: Scoped SQL/API/Dashboard Evidence

## SQL Evidence

Product Line A isolation uses Product Line A-scoped hashes before Product Line B writes and after cleanup.

Required surfaces:

- Workspace identity
- Projects
- Agent assignments
- Workflow templates
- Governance defaults
- Tasks/evidence/read-model rows
- GitHub sync/lifecycle rows
- Counters
- Non-owned feature flags

Rules:

- Do not compare only whole-database counts.
- Expected Product Line B rows are not Product Line A drift.
- Product Line A read-only inspection timestamps or logs may be recorded as permitted differences only when explicitly named.

## API Evidence

Use existing scoped routes unless implementation proves they cannot express the evidence:

- `/api/workspaces/:id`
- `/api/projects?workspace_id=<id>`
- `/api/tasks?workspace_id=<id>`
- `/api/agents?workspace_id=<id>`
- `/api/github/sync?workspace_id=<id>`
- `/api/status?action=dashboard&workspace_id=<id>`

Required assertions:

- Product Line A scoped responses match baseline before/after.
- Product Line B is inspectable during smoke enablement by explicit scope.
- Invalid or unauthorized workspace scope returns the existing typed error.
- Product Line B does not become a repo sync owner.

Required response paths:

| Route | Required response paths for SPEC-010B evidence |
|-------|-----------------------------------------------|
| `/api/workspaces/:id` | `workspace.id`, `workspace.slug`, `workspace.name`, `workspace.tenant_id`, `workspace.feature_flags`, `workspace.disabled_at`, `workspace.agent_count` |
| `/api/projects?workspace_id=<id>` | `projects[].id`, `projects[].workspace_id`, `projects[].slug`, `projects[].github_repo`, `projects[].github_sync_enabled`, `projects[].is_repo_sync_owner`, `projects[].assigned_agents[]` |
| `/api/tasks?workspace_id=<id>` | `tasks[].id`, `tasks[].workspace_id`, `tasks[].project_id`, `tasks[].status`, `tasks[].assigned_to`, `tasks[].metadata.product_line_slug`, `tasks[].metadata.spec_010b_run_id`, `total`, `page`, `limit` |
| `/api/agents?workspace_id=<id>` | `agents[].id`, `agents[].workspace_id`, `agents[].name`, `agents[].role`, `agents[].config`, `agents[].taskStats.total`, `agents[].taskStats.assigned`, `agents[].taskStats.in_progress`, `agents[].taskStats.done` |
| `/api/github/sync?workspace_id=<id>` | `syncs[].project_id`, `syncs[].github_repo`, `syncs[].sync_count`, `github_sync_lifecycle.scopes[].workspace_id`, `github_sync_lifecycle.scopes[].github_repo`, `github_sync_lifecycle.scopes[].enabled`, `github_sync_lifecycle.flag.enabled` |
| `/api/status?action=dashboard&workspace_id=<id>` | `db.tasks.total`, `db.tasks.byStatus`, `db.agents.total`, `db.agents.byStatus`, `db.activities.day`, `db.notifications.unread`, `db.pipelines.active`, `db.pipelines.recentDay` |

Invalid scope evidence must record both the HTTP status and a stable SPEC-010B evidence code derived from the current route behavior:

- `invalid_workspace_scope` with HTTP `400` for malformed `workspace_id`, duplicate scope parameters, unsupported `workspace_scope`, combined `workspace_id` plus `workspace_scope=facility`, missing explicit scope when required, or workspace scoping disabled.
- `forbidden_workspace_scope` with HTTP `403` for a workspace outside the authenticated tenant.
- `workspace_not_found_or_out_of_scope` with HTTP `404` only for `/api/workspaces/:id` when the path ID is outside the accepted scope after scope resolution succeeds.

## Dashboard Evidence

Dashboard assertions are required only if dashboard behavior or tests change.

Required assertions when used:

- The active product-line scope is passed to `/api/status?action=dashboard`.
- Metric Cards, Task Flow, Task Pipeline, and triage totals reflect the explicit Product Line A or Product Line B scope.
- Disabled Product Line B is absent from the normal dashboard switcher outside the explicit smoke enablement window.
- No new product-line metrics widget or include-disabled preview mode is added.

## Switcher Evidence

The normal Product Line switcher remains active-only.

Required states:

- After seed/apply: Product Line B disabled and absent from the normal switcher.
- During explicit smoke enablement: Product Line B may appear for scoped smoke evidence.
- After final disablement: Product Line B disabled and absent from the normal switcher.

Absence from the switcher is supporting evidence only. SQL/API/eligibility proof remains required.
