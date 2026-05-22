# Quickstart: Generic Product-Line Seeder

## Scope

SPEC-010A validates reusable seed/config tooling with Mission Control parity only. It does not create Product Line B, mutate GitHub, create tasks, dispatch or claim work, launch runners, create sandboxes, add harness adapters, auto-merge, or invoke SpecKit setup/autopilot.

## Preflight

```bash
pnpm seed:product-line -- \
  --config docs/ai/product-lines/mission-control.yaml \
  --db .data/mission-control.db \
  --mode preflight \
  --json
```

Expected:

- `schema_version:"product-line-seed-result-v1"`
- `ok:true`
- `status:"ready"`
- `mutation_status:"not_mutated"`
- validation evidence for identity, GitHub ownership, workflow contract, required slugs, feature flags, assignments, governance, and target residue

## Apply To Empty Safe Target

```bash
pnpm seed:product-line -- \
  --config docs/ai/product-lines/mission-control.yaml \
  --db .data/spec-010a-safe.db \
  --mode apply \
  --json
```

Expected:

- one `mission-control` product-line workspace
- PRD department projects
- product-line-scoped assignments
- workflow templates imported through workflow-contract tooling
- config-owned feature flags
- governance defaults using `resource_policies`
- no Product Line B artifacts
- no task creation, dispatch, claim, runner, sandbox, adapter, auto-merge, or GitHub mutation

## Existing Target Refusal

```bash
pnpm seed:product-line -- \
  --config docs/ai/product-lines/mission-control.yaml \
  --db .data/spec-010a-safe.db \
  --mode apply \
  --json
```

Expected:

- `ok:false`
- `status:"existing_target_refused"`
- `code:"EXISTING_TARGET_REQUIRES_ALLOW_EXISTING"`
- `mutation_status:"not_mutated"`
- `action_required:"--allow-existing"`

## Apply Twice With Explicit Existing Target

```bash
pnpm seed:product-line -- \
  --config docs/ai/product-lines/mission-control.yaml \
  --db .data/spec-010a-safe.db \
  --mode apply \
  --allow-existing \
  --json
```

Expected:

- config-owned rows are stable and not duplicated
- non-config-owned FR-020 operational/history state is preserved, including task, issue, task evidence/read-model state, activity, history, comment, notification, disposition, artifact, quality-review, GitHub sync, governance audit/ledger, manual template, unrelated flag, row ID, timestamp, counter, task status/linkage/lineage, assignment timestamp, and workflow use-counter evidence
- before/after snapshots and stable identity hashes are present
- apply-twice parity evidence reports the same `snapshot_before.hash` and `snapshot_after.hash`
- snapshot counts remain `workspace_identity:1`, `department_projects:6`, `agent_assignments:6`, `workflow_contract_templates:9`, `feature_flags:1`, and `governance_defaults:3`

## Verify

```bash
pnpm seed:product-line -- \
  --config docs/ai/product-lines/mission-control.yaml \
  --db .data/spec-010a-safe.db \
  --mode verify \
  --json
```

Expected:

- `ok:true`
- `status:"verified"`
- `mutation_status:"verified"`
- no writes performed

Drifted target expectation:

- `ok:false`
- `status:"verification_failed"`
- `code:"VERIFY_DRIFT_DETECTED"`
- `exit_code:4`
- no writes performed

## Compatibility Wrapper

```bash
pnpm seed:mission-control -- \
  --db .data/spec-010a-safe.db \
  --mode verify \
  --json
```

Expected:

- delegates to the generic behavior using `docs/ai/product-lines/mission-control.yaml`
- produces equivalent evidence categories to `seed:product-line`
- requires `--allow-existing` for existing-target apply

Wrapper parity sequence:

```bash
pnpm seed:product-line -- \
  --config docs/ai/product-lines/mission-control.yaml \
  --db .data/spec-010a-parity.db \
  --mode apply \
  --json

pnpm seed:product-line -- \
  --config docs/ai/product-lines/mission-control.yaml \
  --db .data/spec-010a-parity.db \
  --mode apply \
  --allow-existing \
  --json

pnpm seed:product-line -- \
  --config docs/ai/product-lines/mission-control.yaml \
  --db .data/spec-010a-parity.db \
  --mode verify \
  --json

pnpm seed:mission-control -- \
  --db .data/spec-010a-parity.db \
  --mode verify \
  --json
```

The wrapper result envelope must keep `entrypoint:"seed:mission-control"` while using `config.path:"docs/ai/product-lines/mission-control.yaml"` and the same validation evidence categories, config-owned snapshot counts, existing-target refusal status, and `--allow-existing` policy as `seed:product-line`.

## Invalid Config No-Mutation Proof

Run focused fixtures through Vitest:

```bash
pnpm test -- src/lib/__tests__/product-line-seed.test.ts
pnpm test -- src/lib/__tests__/product-line-seed-cli.test.ts
```

Required fixture classes:

- missing identity
- unsupported field
- invalid enabled feature flag
- reserved future flag true in target state
- duplicate or conflicting feature flags
- unsupported workflow family
- missing workflow slug
- unsafe governance
- duplicate or conflicting declarations
- existing-target refusal
- repo/product-line ownership conflict

Each invalid-config or blocked-preflight fixture must include:

- `mutation_status:"not_mutated"`
- `snapshot_before`
- `snapshot_after`
- matching per-surface counts and `product-line-seed-snapshot-v1:sha256:<hex>` hashes across config-owned seed surfaces plus the full `preserved_operational_state.subsurfaces` contract
- `raw_secret_values_emitted:false`
- redacted target evidence

## Static Scope Guards

```bash
rg -n "Product Line B|product-line-b|focusengine|createTask\\(|INSERT INTO tasks|gh issue|github.*(create|comment|close|label)|runner|sandbox|auto.?merge|speckit-setup|speckit-autopilot" \
  docs/ai/product-lines scripts/seed-product-line.ts scripts/seed-mission-control-product-line.ts src/lib/product-line-seed src/lib/__tests__/product-line-seed*.test.ts
```

Expected:

- only negative assertions or test guard names for excluded surfaces
- no implementation path for Product Line B, GitHub mutation, task creation, dispatch, claim, runner, sandbox, adapter, auto-merge, or SpecKit setup/autopilot

## Rollback And No-Op Recovery

Expected:

- SPEC-010A adds no migration and therefore has no migration rollback file or automated rollback runner.
- Not running `pnpm seed:product-line` or `pnpm seed:mission-control` leaves target state unchanged.
- Validation failures, existing-target refusals, blocked preflight, and verify drift return `mutation_status:"not_mutated"` with before/after or observed-state evidence where applicable.
- Residue conflicts remain operator-cleanup decisions; the seeder never deletes, unlinks, or automatically repairs target state.
- Recovery from an undesired successful apply is an operator database-backup restore or a reviewed config re-apply decision, not GitHub mutation, task dispatch, runner launch, sandbox cleanup, automatic deletion, or SpecKit invocation.

## Final Verification

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Run `pnpm test:all` before merge if the final diff or branch policy requires full verification.
