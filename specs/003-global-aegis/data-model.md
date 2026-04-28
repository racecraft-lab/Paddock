# Data Model

## Entities

### Aegis Resolver Result

- Fields:
  - `id`: database agent id
  - `name`: canonical reviewer name
  - `config`: gateway routing and agent configuration
  - `workspace_id`: nullable workspace scope
  - `scope`: `global` or workspace-scoped equivalent
- Relationships:
  - Backed by rows from `agents`
  - Used by scheduler review dispatch and gateway agent-id resolution
- Validation rules:
  - Match by `LOWER(name)='aegis'`
  - Prefer the scope dictated by `FEATURE_GLOBAL_AEGIS`
  - Use lowest database id when multiple rows match the same scope

### Shadow Audit Activity

- Fields:
  - `type`: `aegis_local_shadowed`
  - `entity_type`: `agent`
  - `entity_id`: shadowed local Aegis row id
  - `actor`: `system`
  - `workspace_id`: requested workspace id
  - `data.global_agent_id`
  - `data.local_agent_id`
  - `data.workspace_id`
  - `data.feature_flag`
- Relationships:
  - Records when global Aegis supersedes a local row for a workspace
- Validation rules:
  - Insert at most one row per requested workspace id, global agent id, and local agent id tuple
  - Skip insert when a matching row already exists

### Quality Review Gate

- Fields:
  - `reviewer`: live gate signal, kept as `aegis`
  - `status`: review completion state
- Relationships:
  - Consumed by task review completion checks and scheduler-driven review updates
- Validation rules:
  - No `quality_reviews.agent_id` dependency

## State Transitions

- Resolver state:
  - `no local row` -> `global fallback`
  - `local row present, flag off` -> `local selected`
  - `global row present, flag on` -> `global selected`
  - `global wins over local, flag on` -> `global selected + shadow audit`
- Review flow state:
  - Unchanged task selection, retry, and status transition behavior
