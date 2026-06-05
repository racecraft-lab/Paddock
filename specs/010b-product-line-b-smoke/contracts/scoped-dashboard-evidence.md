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
