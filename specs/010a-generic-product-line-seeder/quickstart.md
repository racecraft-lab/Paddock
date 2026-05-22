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
- non-config-owned FR-020 operational/history state is preserved, including task, issue, activity, history, comment, notification, disposition, artifact, quality-review, GitHub sync, governance audit/ledger, manual template, unrelated flag, row ID, timestamp, counter, task status/linkage/lineage, assignment timestamp, and workflow use-counter evidence
- before/after snapshots and stable identity hashes are present

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

## Final Verification

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Run `pnpm test:all` before merge if the final diff or branch policy requires full verification.
