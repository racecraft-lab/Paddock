# Contract: Product Line Seed CLI For SPEC-010B

## Command

```bash
pnpm seed:product-line -- --config docs/ai/product-lines/product-line-b.yaml --db <db-path> --mode <preflight|apply|verify> --json
```

HAL service-compatible checks may bypass `pnpm` and use:

```bash
/usr/bin/node --experimental-strip-types scripts/seed-product-line.ts --config docs/ai/product-lines/product-line-b.yaml --db <db-path> --mode <preflight|apply|verify> --json
```

## Modes

- `preflight`: validates config, checks residue, returns no-mutation proof, performs no writes.
- `apply`: creates or updates only config-owned Product Line B seed rows and leaves Product Line B disabled.
- `verify`: read-only check that config-owned Product Line B rows match, Product Line B is disabled, and disallowed flags/sync ownership are absent.

No `enable` or `disable` seed modes are added.

## Required Result Envelope

The existing `product-line-seed-result-v1` envelope remains the CLI contract.

Required SPEC-010B fields:

- `ok`: boolean
- `entrypoint`: `seed:product-line`
- `mode`: `preflight`, `apply`, or `verify`
- `status`: `ready`, `seeded`, `verified`, or typed failure status
- `mutation_status`: `not_mutated`, `applied`, or `verified`
- `config.path`: `docs/ai/product-lines/product-line-b.yaml`
- `config.product_line_slug`: `product-line-b`
- `target.product_line_slug`: `product-line-b`
- `evidence.no_mutation_proof`: present for non-mutating modes
- `evidence.residue`: empty on ready, otherwise typed residue entries
- `snapshot_before.hash`
- `snapshot_after.hash`
- `redaction.raw_secret_values_emitted`: false
- `errors[]`: typed and redacted

## Product Line B Assertions

Preflight must:

- Preserve equal before/after snapshot hashes.
- Report Product Line B residue and `plb-platform-*` assignment conflicts.
- Report retained FocusEngine/OpenClaw inventory without changing it.
- Stop on repo sync ownership conflicts.

Apply must:

- Create or verify `workspaces.slug = 'product-line-b'`.
- Create Product Line B projects with `github_sync_enabled = 0` and `is_repo_sync_owner = 0`.
- Create logical assignments named `plb-platform-*`.
- Import required Paddock workflow templates for the Product Line B workspace.
- Write non-null `workspaces.disabled_at` when `disabled_by_default` is true.

Verify must:

- Confirm Product Line B disabled state.
- Confirm no Product Line B repo sync owner rows.
- Confirm smoke/runner/control-plane flags are absent or false.
- Confirm Product Line A hashes remain unchanged when compared by the smoke evidence path.

## Failure Codes

Use existing seed error codes where possible:

- `TARGET_PRODUCT_LINE_CONFLICT`
- `TARGET_REPO_CONFLICT`
- `TARGET_RESIDUE_BLOCKED`
- `FEATURE_FLAG_RESERVED_FUTURE_ENABLED`
- `WORKFLOW_TEMPLATE_OWNERSHIP_CONFLICT`
- `VERIFY_DRIFT_DETECTED`

Add only focused codes if implementation proves existing codes cannot express:

- Product Line B disabled state missing.
- Product Line B repo sync owner present.
- Product Line B smoke-owned flag still enabled after disablement.
