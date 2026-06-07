# Product-Line Seed Runbook

## Scope

The generic product-line seeder applies reviewed config-owned product-line seed state from YAML. SPEC-010A validated Paddock parity and did not create Product Line B. SPEC-010B later added the reviewed Product Line B config and smoke lifecycle using the same seeder. The seeder still does not mutate GitHub, create tasks, dispatch or claim work, launch runners, create sandboxes, add harness adapters, auto-merge, or invoke SpecKit setup/autopilot.

## Schema

Canonical Paddock config path:

```text
docs/ai/product-lines/paddock.yaml
```

The config must use this schema marker:

```yaml
schema_version: product-line-seed-v1
```

Required top-level sections are `schema_version`, `product_line`, `github`, `workflow_contract`, `departments`, `agent_assignments`, `feature_flags`, `governance_defaults`, and `safety_policy`. Unknown top-level sections fail validation. YAML loading is single-document and non-executing; custom tags, anchors, aliases, merge keys, multi-document streams, executable constructs, and remote references are rejected before semantic validation.

Config-owned surfaces are limited to workspace identity, department projects, product-line agent assignments, workflow-contract templates, config-owned feature flags, and governance defaults. Operational/history surfaces such as tasks, task evidence/read-model state, issues, activities, histories, comments, notifications, dispositions, artifacts, quality reviews, GitHub sync state, governance audit rows, manual workflow templates, row IDs, timestamps, counters, task status/linkage/lineage, assignment timestamps, workflow use counters, and non-owned feature flags are preserved.

## Command Modes

Preflight validates the config and target without writes:

```bash
pnpm seed:product-line -- \
  --config docs/ai/product-lines/paddock.yaml \
  --db .data/paddock.db \
  --mode preflight \
  --json
```

Apply writes config-owned state only after preflight succeeds:

```bash
pnpm seed:product-line -- \
  --config docs/ai/product-lines/paddock.yaml \
  --db .data/paddock.db \
  --mode apply \
  --json
```

Verify compares target state to config without writes:

```bash
pnpm seed:product-line -- \
  --config docs/ai/product-lines/paddock.yaml \
  --db .data/paddock.db \
  --mode verify \
  --json
```

## Evidence Shape

All modes return `schema_version:"product-line-seed-result-v1"` with `ok`, `entrypoint`, `mode`, `status`, `code`, `mutation_status`, `config`, `target`, `evidence`, `errors`, `redaction`, `action_required`, and `exit_code`.

Apply, existing-target refusal, blocked-preflight, and validation-failure paths include `snapshot_before` and `snapshot_after` when a target database is available. Snapshot evidence includes config-owned `surfaces` and `preserved_operational_state.subsurfaces`; matching no-mutation snapshots are reported through `evidence.no_mutation_proof`.

Expected evidence categories include identity, GitHub ownership, workflow contract, required slugs, feature flags, assignments, governance defaults, target residue, mutation counts, redaction proof, and read-only verify proof. Raw operator evidence, secrets, tokens, passwords, signed URLs, and raw logs must not be echoed or hashed.

## Existing Target Policy

The safety policy is `refuse_unless_allow_existing`. Applying to an existing product-line target without `--allow-existing` fails with `EXISTING_TARGET_REQUIRES_ALLOW_EXISTING`, `status:"existing_target_refused"`, `mutation_status:"not_mutated"`, `action_required:"--allow-existing"`, and exit code `2`.

Use `--allow-existing` only after reviewing `snapshot_before`, target residue evidence, and preserved operational state evidence. With `--allow-existing`, the seeder may update config-owned surfaces but must preserve FR-020 operational/history surfaces.

## Residue Blocking Policy

Residue handling is detection-only. The cleanup policy is `detection_only_no_automatic_deletion_or_unlinking`.

Target repository conflicts, product-line conflicts, reserved future flags already enabled on the target, unsafe governance, and other residue conflicts fail closed before writes. Residue blockers use stable codes such as `TARGET_RESIDUE_BLOCKED`, `TARGET_REPO_CONFLICT`, and `TARGET_PRODUCT_LINE_CONFLICT` with redacted evidence. The seeder never deletes, unlinks, disables, or repairs target residue automatically.

## Paddock Compatibility Wrapper

The compatibility wrapper remains available:

```bash
pnpm seed:paddock -- \
  --db .data/paddock.db \
  --mode verify \
  --json
```

The wrapper delegates to the generic seeder with `docs/ai/product-lines/paddock.yaml`. Wrapper output keeps `entrypoint:"seed:paddock"` while preserving the same schema, modes, evidence categories, existing-target policy, snapshot shape, residue blocking policy, and no-mutation proof model as `pnpm seed:product-line`.

## Product Line B Boundary

SPEC-010A does not create Product Line B. SPEC-010B now provides the reviewed
`docs/ai/product-lines/product-line-b.yaml` config and the bounded Product Line
B enable-smoke-disable evidence flow. That smoke flow remains outside this
generic runbook's Paddock parity examples.

Future product lines must still be added through a separate reviewed spec and
config path. This runbook documents the reusable schema and command surface;
product-line-specific smoke evidence belongs in that product line's workflow
or runbook.

## Rollback By No-Op

SPEC-010A adds no migration and no automated rollback runner. not running the command leaves target state unchanged.

Validation failures, existing-target refusals, blocked preflight, and verify drift return `mutation_status:"not_mutated"` with before/after or observed-state evidence when applicable. Recovery from an undesired successful apply is an operator database-backup restore or a reviewed config re-apply decision; it is not GitHub mutation, task dispatch, runner launch, sandbox cleanup, automatic deletion, or SpecKit invocation.

## Implementation Validation

Run the focused implementation and static guard checks before relying on a new config:

```bash
pnpm test -- src/lib/__tests__/product-line-seed.test.ts
pnpm test -- src/lib/__tests__/product-line-seed-cli.test.ts
pnpm typecheck
pnpm lint
```

Static scope guard:

```bash
rg -n "Product Line B|product-line-b|focusengine|createTask\\(|INSERT INTO tasks|gh issue|github.*(create|comment|close|label)|runner|sandbox|auto.?merge|speckit-setup|speckit-autopilot" \
  docs/ai/product-lines scripts/seed-product-line.ts scripts/seed-paddock-product-line.ts src/lib/product-line-seed src/lib/__tests__/product-line-seed*.test.ts
```

Expected matches are limited to negative assertions, blocked-side-effect declarations, preserved-state evidence reads, and docs describing excluded surfaces.
