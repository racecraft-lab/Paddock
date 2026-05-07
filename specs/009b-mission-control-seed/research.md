# Research: Mission Control Product-Line Seed and Flag Activation

## Decision: Reuse existing workspace/project schema for Product Line A

**Rationale**: The constitution and clarified spec require `workspaces` to remain the Product Line surface and `projects` to remain Department destinations. Existing migrations already provide `workspaces.slug`, `workspaces.feature_flags`, `projects.github_repo`, `projects.github_sync_enabled`, `projects.area_slug`, `projects.is_triage_project`, and `projects.is_repo_sync_owner`.

**Alternatives considered**:
- New Product Line table: rejected because it violates scope and upstream-compatibility constraints.
- Reuse `facility` as Product Line A: rejected because Facility/global support must remain distinct from Mission Control Product Line A.

## Decision: Use QA as the only triage/inbox and repository sync-owner department

**Rationale**: Clarify resolved that QA is both triage/inbox and repo sync owner for `racecraft-lab/mission-control`. The existing partial indexes allow one triage project per workspace and one sync owner per `(workspace_id, github_repo)`.

**Alternatives considered**:
- Separate Triage department/project: rejected by FR-029.
- Development as sync owner: rejected because issue intake and triage ownership must be QA.

## Decision: Keep agent assignments project-scoped

**Rationale**: The current project-agent route inserts `project_agent_assignments(project_id, agent_name, role)` and derives access through the owning `projects` row. SPEC-009B must not add or rely on `project_agent_assignments.workspace_id`.

**Alternatives considered**:
- Add `workspace_id` to assignments: rejected by FR-030 and schema scope.
- Assign by global agent role only: rejected because evidence must prove the six PRD stage-role mappings on seeded department projects.

## Decision: Correct and import repo-owned workflow contract

**Rationale**: The current `docs/ai/workflows/mission-control/workflow-contract.yaml` contains stale `intake` and `implementation` slugs and the stale tracker repo `builderz-labs/mission-control`. FR-015, FR-016, and Clarify require narrow correction to the Mission Control Issue Triage and Issue Remediation slugs, then direct reuse of `loadWorkflowContractFromFile()` and `importWorkflowContract()` with `workspace_id` overridden to the actual seeded Product Line id.

**Alternatives considered**:
- Manual SQL insert into `workflow_templates`: rejected because it bypasses SPEC-009A source-of-truth behavior.
- Accept aliases and translate at seed time: rejected because seed readiness must fail closed or correct the repo-owned contract before apply.

## Decision: Canonicalize pilot flag to `PILOT_MISSION_CONTROL_E2E`

**Rationale**: Clarify resolved that legacy `PILOT_PRODUCT_LINE_A_E2E` is compatibility drift. SPEC-009B must update registry/runbook/runtime evidence to the canonical Mission Control key and seed only that key plus Phase 1-7 prerequisites in `workspaces.feature_flags`.

**Alternatives considered**:
- Persist both pilot flags: rejected because it creates a second pilot flag state.
- Keep only the legacy key: rejected because roadmap and clarified spec name `PILOT_MISSION_CONTROL_E2E`.

## Decision: Governance rows are advisory budgets plus evaluator-inactive WIP visibility

**Rationale**: Stable `resource_policies.notes` identities allow idempotent upsert without new schema. Enabled budget rows with `enforcement='alert'` prove visibility without blocking normal intake. WIP visibility remains `enabled=0` or `default_template=1` so the evaluator cannot emit `defer:wip_limit` unless later tests prove safe active WIP behavior.

**Alternatives considered**:
- Strict blocking budgets or WIP from day one: rejected because SPEC-009B must not block normal pilot intake.
- No governance rows: rejected because the spec requires visible policy shape.
- Default blackout/degraded-window policies: rejected by FR-035.

## Decision: Preflight blocks before mutation and never cleans residue automatically

**Rationale**: Non-Mission-Control sync/project/task/cron/gateway/FocusEngine residue can represent live state. Preflight must return structured blocked output with `mutation_status: "not_mutated"`, redacted summaries, and backup/export-first checklist references while leaving row/file snapshots unchanged.

**Alternatives considered**:
- Automatic delete/unlink cleanup: rejected as destructive and out of scope.
- Ignore residue: rejected because the seed target must be Mission-Control-only before readiness.

## Decision: No new runtime dependencies

**Rationale**: Existing `better-sqlite3`, Node >=22 type stripping, and SPEC-009A workflow-contract modules cover seed execution. Adding a CLI framework or YAML/parser dependency is unnecessary.

**Alternatives considered**:
- New command parser dependency: rejected as unnecessary supply-chain surface.
- Shell-only seed script: rejected because typed seed/preflight/idempotency logic needs focused Vitest coverage.
