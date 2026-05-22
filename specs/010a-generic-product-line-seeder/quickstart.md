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
direnv exec . pnpm test -- src/lib/__tests__/product-line-seed.test.ts
direnv exec . pnpm test -- src/lib/__tests__/product-line-seed-cli.test.ts
direnv exec . pnpm typecheck
direnv exec . pnpm lint
direnv exec . pnpm build
```

Run `pnpm test:all` before merge if the final diff or branch policy requires full verification.

Implementation validation for US5 docs/static guard changes also includes:

```bash
direnv exec . rg -n "Product Line B|product-line-b|focusengine|createTask\\(|INSERT INTO tasks|gh issue|github.*(create|comment|close|label)|runner|sandbox|auto.?merge|speckit-setup|speckit-autopilot" \
  docs/ai/product-lines scripts/seed-product-line.ts scripts/seed-mission-control-product-line.ts src/lib/product-line-seed src/lib/__tests__/product-line-seed*.test.ts
direnv exec . git diff --check
```

## Phase 8 Evidence - 2026-05-22

All Node and pnpm commands below were run with `direnv exec .` from the `010a-generic-product-line-seeder` worktree using Node `v22.22.2`.

Focused product-line seed tests:

- `pnpm exec vitest run src/lib/__tests__/product-line-seed.test.ts` passed: 1 file, 32 tests.
- `pnpm exec vitest run src/lib/__tests__/product-line-seed-cli.test.ts` passed: 1 file, 8 tests.
- A discarded `pnpm test -- src/lib/__tests__/product-line-seed.test.ts` attempt expanded to the full Vitest suite and failed in unrelated `src/lib/__tests__/mc-provisioner-daemon.test.ts` socket setup; the focused files above were rerun with `pnpm exec vitest run <file>` for SPEC-010A evidence.

CLI parity evidence was run against copied disposable database `/private/tmp/spec-010a-phase8/phase8-parity.db`, created from `.data/mission-control.db`; `.data/mission-control.db` was not mutated. Full result envelopes are stored under `/private/tmp/spec-010a-phase8/`.

- `preflight.json`: `ok:true`, `status:"ready"`, `code:"READY"`, `mutation_status:"not_mutated"`, `existing_target:false`.
- `apply.json`: `ok:true`, `status:"seeded"`, `code:"SEEDED"`, `mutation_status:"applied"`, `existing_target:false`.
- `existing-target-refusal.stderr.json`: `ok:false`, `status:"existing_target_refused"`, `code:"EXISTING_TARGET_REQUIRES_ALLOW_EXISTING"`, `mutation_status:"not_mutated"`, `action_required:"--allow-existing"`, `exit_code:2`.
- `apply-allow-existing.json`: `ok:true`, `status:"seeded"`, `code:"SEEDED"`, `mutation_status:"applied"`, `existing_target:true`.
- `verify.json`: `ok:true`, `status:"verified"`, `code:"VERIFIED"`, `mutation_status:"verified"`, `entrypoint:"seed:product-line"`.
- `wrapper-verify.json`: `ok:true`, `status:"verified"`, `code:"VERIFIED"`, `mutation_status:"verified"`, `entrypoint:"seed:mission-control"`.
- Known warning preserved for TypeScript script entrypoints: Node `MODULE_TYPELESS_PACKAGE_JSON` warning appeared during CLI runs.

Static scope guard:

- `rg -n "Product Line B|product-line-b|focusengine|createTask\\(|INSERT INTO tasks|gh issue|github.*(create|comment|close|label)|runner|sandbox|auto.?merge|speckit-setup|speckit-autopilot" docs/ai/product-lines scripts/seed-product-line.ts scripts/seed-mission-control-product-line.ts src/lib/product-line-seed src/lib/__tests__/product-line-seed*.test.ts` exited 0.
- `rg --count-matches ...` reported matches only in negative/static guard tests, blocked-side-effect config values, safety policy types, and preserved-state snapshot evidence: `product-line-seed.test.ts:55`, `mission-control.yaml:3`, `types.ts:3`, `evidence.ts:2`.
- No Product Line B config, runtime execution path, GitHub mutation path, task creation path, dispatch/claim path, runner/sandbox/adapter path, auto-merge path, or SpecKit setup/autopilot path was introduced.

Migration and dependency guard review:

- `git diff --name-only origin/main...HEAD -- src/lib/migrations.ts docs/migrations pnpm-lock.yaml` produced no output.
- `git diff origin/main...HEAD -- package.json pnpm-lock.yaml` shows only one `package.json` script addition: `seed:product-line`.
- No migration, rollback SQL, lockfile, or runtime dependency change is present in the branch diff.

Repository verification:

- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` failed inside the Codex sandbox with the known Turbopack `binding to a port` / `Operation not permitted (os error 1)` artifact, then passed when rerun outside the sandbox.
- `pnpm test:all` was not run because SPEC-010A Phase 8 and the quickstart make it conditional on branch policy or final diff requiring full verification. This branch's Phase 8 coverage is the focused product-line tests, CLI parity sequence, static scope guard, migration/dependency guard, typecheck, lint, build, and `git diff --check`.
