# Data Model: Generic Product-Line Seeder

## ProductLineSeedConfig

Checked-in YAML document at `docs/ai/product-lines/mission-control.yaml`.

Fields:

- `schema_version`: must equal `product-line-seed-v1`.
- `product_line`: `ProductLineIdentity`.
- `github`: `GitHubOwnership`.
- `workflow_contract`: `WorkflowContractDeclaration`.
- `departments`: `DepartmentDeclaration[]`.
- `agent_assignments`: `AgentAssignmentPolicy`.
- `feature_flags`: `FeatureFlagPolicy`.
- `governance_defaults`: `GovernanceDefault[]`.
- `safety_policy`: `SafetyPolicy`.

Validation:

- Required sections are present exactly once.
- Unknown top-level fields fail validation.
- Duplicate slugs, roles, policy identities, feature flags, and conflicting declarations fail before writes.

## ProductLineIdentity

Fields:

- `slug`: stable product-line slug, e.g. `mission-control`.
- `display_name`: reviewed display name, e.g. `Mission Control`.
- `agent_prefix`: slug-safe prefix used to derive product-line-scoped agent names.

Validation:

- `slug` and `agent_prefix` are slug-safe.
- `agent_prefix` is explicit and not inferred from departments.
- SPEC-010A canonical config uses only Mission Control identity.

Runtime projection:

- Maps to one `workspaces` row by slug.
- Existing-target apply may update the workspace name and config-owned feature flags only when `--allow-existing` is present.

## GitHubOwnership

Fields:

- `owner`: repository owner, e.g. `racecraft-lab`.
- `repo`: repository name, e.g. `mission-control`.
- `full_name`: normalized `owner/repo` value used for comparisons.

Validation:

- Must match the configured product-line boundary.
- Conflicting target residue blocks preflight/apply with redacted evidence.

Runtime projection:

- Config-owned department project rows may receive `github_repo` and `github_sync_enabled` according to the department declaration.
- The seed operation must not create issues, comments, labels, closes, or other GitHub mutations.

## WorkflowContractDeclaration

Fields:

- `family`: config-owned workflow family. SPEC-010A supports only `mission-control`.
- `path`: repo-relative workflow contract path.
- `required_slugs`: required template slug list.

Validation:

- Unsupported families fail with `UNSUPPORTED_WORKFLOW_CONTRACT_FAMILY`.
- Path must load through the existing workflow-contract YAML loader.
- Required slugs must exist in the contract before writes.
- Tracker repos in contract templates must match the declared GitHub ownership.

Runtime projection:

- Apply delegates to `importWorkflowContract` with the target workspace id.
- Only workflow-contract-owned templates are updated by the importer.
- Manual workflow templates are preserved.

## DepartmentDeclaration

Fields:

- `slug`: department/project slug.
- `name`: department display name.
- `ticket_prefix`: reviewed ticket prefix.
- `area_slug`: routing area slug.
- `github_repo`: optional repo full name.
- `github_sync_enabled`: boolean.
- `is_triage_project`: boolean.
- `is_repo_sync_owner`: boolean.

Validation:

- Slugs and ticket prefixes are unique.
- GitHub repo values must match declared ownership or be null.
- At least the Mission Control PRD department set is represented in the canonical config.

Runtime projection:

- Maps to `projects` rows under the product-line workspace.
- Existing-target apply updates only config-owned project fields.
- Project row ids, counters, created timestamps, and non-owned operational history are preserved.

## AgentAssignmentPolicy

Fields:

- `product_line_assignments`: `ProductLineAgentAssignment[]`.
- `shared_support`: optional `SharedSupportAssignment[]`.

Product-line assignment fields:

- `agent_key`: suffix that must not already include `agent_prefix`.
- `role`: workflow/stage role.
- `department_slug`: target department.
- Derived `agent_name`: `agent_prefix + "-" + agent_key`.

Shared support fields:

- `scope`: must be `facility_global`.
- `shared_support_role`: support role.
- `agent_name`: explicit global/facility agent identity.

Validation:

- Product-line assignments must reference declared departments.
- Derived agent names must be unique.
- Shared support must be explicit and never inferred.

Runtime projection:

- Maps to `project_agent_assignments`.
- Existing-target apply updates config-owned role by project/agent identity.
- Assignment timestamps and unrelated assignments are preserved unless config-owned.

## FeatureFlagPolicy

Fields:

- `enabled`: registry-backed feature flags to set true for the product line.
- `disabled_or_absent`: registry keys or reserved future flags that must not be true.
- `owned_keys`: optional explicit config-owned key list if needed to distinguish seed-owned updates from preserved unrelated flags.

Validation:

- `enabled` entries must be keys in `FEATURE_FLAG_REGISTRY`.
- `disabled_or_absent` entries must be registry keys or `FEATURE_TASK_CONTROL_PLANE` / `FEATURE_AGENT_RUNNER_SANDBOXES`.
- Duplicates and enabled/disabled conflicts fail before writes.
- Cascade prerequisites and env force-off blockers must be reported before apply.
- Reserved future flags are negative assertions only and are never registered or written.

Runtime projection:

- Maps to `workspaces.feature_flags` JSON for config-owned keys.
- Unrelated existing flags are preserved.

## GovernanceDefault

Fields:

- Stable config identity, represented by `notes` or an equivalent config-owned key.
- Existing `resource_policies` fields: `policy_type`, `limit_kind`, `limit_value`, `period`, `timezone`, `enforcement`, `enabled`, `default_template`.
- Optional first-intake-blocking reason when explicitly allowed by safety policy.

Validation:

- Uses the existing policy shape.
- Enabled `blackout`, enabled `degraded_window`, enabled `wip_limit`, or enforcement other than `alert` is first-intake-blocking unless explicitly allowed with a reason.

Runtime projection:

- Maps to `resource_policies`.
- Existing-target apply updates config-owned policy fields by stable config identity.
- Governance audit/ledger rows are preserved.

## SafetyPolicy

Fields:

- `existing_target`: default `refuse_unless_allow_existing`.
- `config_owned_surfaces`: reviewed mutation surfaces.
- `preserved_surfaces`: operational/history surfaces that must survive.
- `blocked_side_effects`: Product Line B, GitHub mutation, task creation, dispatch, claim, runner, sandbox, adapter, auto-merge, SpecKit setup/autopilot.
- `allow_first_intake_blocking_governance`: default false, with per-policy reasons when true.

Validation:

- Missing or contradictory safety policy fails before writes.
- Existing-target apply without `--allow-existing` returns the stable refusal envelope.

## SeedEvidenceReport

Fields:

- `schema_version`: `product-line-seed-result-v1`.
- `ok`, `entrypoint`, `mode`, `status`, `code`, `mutation_status`, `exit_code`.
- `config`, `target`, `evidence`, `errors`, `snapshot_before`, `snapshot_after`, `redaction`, `action_required`.

Validation:

- Failures never emit raw secrets, tokens, passwords, signed URLs, raw logs, raw untrusted payloads, or matched secret substrings.
- Redaction proof includes `raw_secret_values_emitted:false` and `redacted_fields`.

State transitions:

- `preflight`: validates config and target, performs zero writes.
- `apply` new target: validates, snapshots, writes config-owned rows in one transaction, snapshots again.
- `apply` existing target without flag: refuses with no writes.
- `apply --allow-existing`: updates only config-owned fields.
- `verify`: read-only comparison; reports matching or drift evidence.

## ProductLineSeedSnapshot

Fields:

- `schema_version`: `product-line-seed-snapshot-v1`.
- `hash`: `product-line-seed-snapshot-v1:sha256:<hex>`.
- `surfaces`: stable count/hash map for config-owned seed surfaces:
  - `product_line`
  - `department`
  - `assignment`
  - `workflow`
  - `governance`
  - `feature_flags`
- `preserved_operational_state`: required aggregate containing stable count/hash evidence for all non-config-owned FR-020 surfaces and invariants:
  - `task`
  - `issue`
  - `activity`
  - `history`
  - `evidence`
  - `comment`
  - `notification`
  - `disposition`
  - `artifact`
  - `quality_review`
  - `github_sync_state`
  - `governance_audit_or_ledger`
  - `manual_workflow_template`
  - `non_owned_feature_flags`
  - `row_identity`
  - `creation_timestamps`
  - `task_status_linkage_lineage`
  - `project_ticket_counters`
  - `assignment_timestamps`
  - `workflow_use_counters`

Validation:

- Snapshot hashes are deterministic and use stable ordered JSON.
- Invalid-config and blocked-preflight no-mutation proof compares `snapshot_before` and `snapshot_after` across both `surfaces` and `preserved_operational_state`.
- Existing-target apply and apply-twice evidence must demonstrate that non-config-owned FR-020 surfaces remain stable except for reviewed config-owned field updates.
- Snapshot evidence must obey result-envelope redaction rules and must not emit or hash raw secrets, raw logs, signed URLs, raw untrusted payloads, or matched secret substrings.
