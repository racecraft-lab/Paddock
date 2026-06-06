# Data Model: Product Line B Onboarding Smoke

## ProductLineBSeedConfig

Reviewed YAML config at `docs/ai/product-lines/product-line-b.yaml`.

Fields:

- `schema_version`: `product-line-seed-v1`
- `product_line.slug`: `product-line-b`
- `product_line.display_name`: `Product Line B`
- `product_line.agent_prefix`: `plb-platform`
- `product_line.disabled_by_default`: `true`
- `github.owner`: `racecraft-lab`
- `github.repo`: `Paddock`
- `github.full_name`: `racecraft-lab/Paddock`
- `workflow_contract.family`: `paddock`
- `workflow_contract.path`: `docs/ai/workflows/paddock/workflow-contract.yaml`
- `departments[]`: Product Line B project rows with `github_sync_enabled: false` and `is_repo_sync_owner: false`
- `agent_assignments.product_line_assignments[]`: logical agents that resolve to `plb-platform-*`
- `feature_flags.enabled[]`: only flags needed for inspection/smoke and their existing prerequisites
- `feature_flags.disabled_or_absent[]`: smoke, runner, sync, sandbox, control-plane, and Product Line A-only flags that must not be active
- `feature_flags.smoke_owned[]`: for SPEC-010B, this is limited to `FEATURE_WORKSPACE_SWITCHER`, `FEATURE_GLOBAL_AEGIS`, `FEATURE_TASK_PIPELINES`, `FEATURE_TWO_STEP_TERMINAL`, `FEATURE_AREA_LABEL_ROUTING`, `FEATURE_DISPOSITION_LOGGING`, `FEATURE_TASK_ARTIFACTS`, `FEATURE_RESOURCE_GOVERNANCE`, `FEATURE_OPENCLAW_HEALTH_COSTS`, and `PILOT_PADDOCK_E2E`. These may be enabled only during the explicit smoke window and must be false or absent after seed/apply disabled state and after final disablement.
- `feature_flags.paused_or_forbidden[]`: for SPEC-010B, this must include `FEATURE_GITHUB_SYNC_AUTOMATION`, `FEATURE_TASK_CONTROL_PLANE`, `FEATURE_AGENT_RUNNER_SANDBOXES`, and `PILOT_PRODUCT_LINE_A_E2E`. These must remain false or absent for Product Line B throughout seed, smoke, and disablement.
- `safety_policy.blocked_side_effects[]`: includes GitHub mutation, dispatch, claim, runner, sandbox, harness adapter, auto-merge, and Product Line A takeover boundaries

Validation rules:

- Slug and prefix are lowercase slug-safe.
- Repo fields must match `racecraft-lab/Paddock`.
- Product Line B departments must not become repo sync owners.
- Product Line B agent names derive from `plb-platform-*`; harness manifest IDs are not valid assignment names.
- `disabled_by_default: true` requires `workspaces.disabled_at IS NOT NULL` after apply and verify.

## ProductLineBLifecycleState

SQLite state for Product Line B workspace.

Fields:

- `workspace.slug`: `product-line-b`
- `workspace.name`: `Product Line B`
- `workspace.disabled_at`: non-null after seed/apply and after final disable; null only during explicit smoke enablement
- `workspace.feature_flags`: smoke-owned flags absent or false when disabled
- `projects.github_sync_enabled`: `0` for all Product Line B projects
- `projects.is_repo_sync_owner`: `0` for all Product Line B projects
- `pause_evidence`: Product Line B evidence fields proving `sync_paused: true`, `dispatch_paused: true`, `claim_runner_sandbox_paused: true`, `github_sync_enabled_count: 0`, `repo_sync_owner_count: 0`, `eligible_smoke_item_count: 0` while disabled, and `eligible_smoke_item_count: 1` only during the explicit smoke window.

State transitions:

- `absent -> disabled_seeded`: `seed:product-line --mode apply`
- `disabled_seeded -> smoke_enabled`: SPEC-010B smoke lifecycle enable action clears only Product Line B `disabled_at`, enables only `feature_flags.smoke_owned[]`, records a run-scoped `synthetic_issue_run_id`, and proves exactly one Product Line B synthetic issue is eligible while sync, dispatch, claim, runner, sandbox, and live GitHub mutation remain paused.
- `smoke_enabled -> smoke_recorded`: synthetic issue evidence and pilot subset proof recorded
- `smoke_recorded -> disabled_clean`: disable action restores non-null `disabled_at`, clears smoke-owned flags, and proves no eligible Product Line B smoke/sync/dispatch work remains

## SyntheticIssue

Local smoke fixture with schema `spec-010b.synthetic_issue.v1`.

Fields:

- `schema_version`: `spec-010b.synthetic_issue.v1`
- `run_id`: stable run identifier
- `product_line_slug`: `product-line-b`
- `repo.owner`: `racecraft-lab`
- `repo.name`: `Paddock`
- `repo.full_name`: `racecraft-lab/Paddock`
- `issue.number`: positive run-scoped integer
- `issue.title`: `[mc-pilot][product-line-b] SPEC-010B synthetic smoke <run-id>`
- `issue.labels`: includes `pd:inbox`, `priority:medium`, `area:dev`
- `metadata.live_github_required`: `false`
- `metadata.optional_live_issue_url`: null unless manual HAL UAT provides it

Validation rules:

- No raw credential, token, authorization header, or raw GitHub response fields.
- Issue number must be positive and run-scoped.
- Product Line B identity must appear in local metadata, not in GitHub sync ownership.

## SmokeEvidencePacket

Durable review record with schema `spec-010b.smoke_evidence.v1`.

Fields:

- `run_id`
- `schema_version`
- `product_line_slug`
- `commit`: local commit/runtime identifiers
- `phases.preflight`
- `phases.apply`
- `phases.verify`
- `phases.enable`
- `phases.synthetic_issue`
- `phases.pilot_subset`
- `phases.disable`
- `phases.cleanup`
- `phases.isolation`
- `phases.scope`
- `phases.timing`
- `seed_snapshots`
- `product_line_a_baseline`
- `product_line_a_after`
- `side_effect_counts`
- `cleanup_counters`
- `optional_live_issue_status`
- `redaction`
- `parallel_safety`

Validation rules:

- Every phase has `status`, `observed_at`, and at least one evidence reference.
- The enable phase must record `eligible_smoke_item_count: 1`, `sync_paused: true`, `dispatch_paused: true`, `claim_runner_sandbox_paused: true`, `live_github_required: false`, and the run-scoped synthetic issue identifier.
- Product Line A before/after hashes must match except explicitly permitted read-only inspection evidence.
- Product Line B final disablement must prove non-null `disabled_at`, no repo sync owner, no smoke-owned flags, no eligible smoke work, and zero unintended side effects.
- Optional live GitHub evidence may be skipped with `mutation_status: not_mutated`.

## ProductLineAIsolationBaseline

Comparable snapshot captured before Product Line B writes and after cleanup.

Surfaces:

- Workspace identity
- Projects
- Agent assignments
- Workflow templates
- Governance defaults
- Tasks/evidence/read-model rows
- GitHub sync/lifecycle rows
- Counters
- Non-owned flags
- Dashboard scoped metrics if dashboard assertions change

Validation rules:

- Hashes are Product Line A-scoped, not whole-database snapshots.
- Product Line B expected rows must not be counted as Product Line A drift.

## RetainedInventoryReport

Read-only evidence for hidden/offline FocusEngine/OpenClaw identities.

Fields:

- `source`: agent rows, OpenClaw config, or runtime-inventory read endpoint
- `count`
- `identifiers`: redacted stable names or hashes
- `assigned_to_product_line_b`: always false for retained identities
- `blocking`: true only for explicit Product Line B or `plb-platform-*` conflicts

Validation rules:

- No automatic cleanup.
- No reuse as Product Line B assignment.
- Runtime-inventory evidence is skipped if collection requires SPEC-014C-owned files or behavior.
