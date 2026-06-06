# Contract: Product Line Seed CLI For SPEC-010B

## Command

```bash
pnpm seed:product-line -- --config docs/ai/product-lines/product-line-b.yaml --db <db-path> --mode <preflight|apply|verify> --json
```

Repeated `apply` against an already valid Product Line B target uses the existing generic seeder allowance:

```bash
pnpm seed:product-line -- --config docs/ai/product-lines/product-line-b.yaml --db <db-path> --mode apply --allow-existing --json
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
- `evidence.existing_target`: present when the target already has Product Line B state, with an outcome class of `already_valid`, `requires_allow_existing`, `residue_blocked`, or `ownership_conflict`
- `snapshot_before.hash`
- `snapshot_after.hash`
- `action_required`: `--allow-existing` for refused existing-target apply, otherwise null or omitted
- `redaction.raw_secret_values_emitted`: false
- `errors[]`: typed and redacted

### Required Status And Code Matrix

SPEC-010B must use the existing seed result status and code vocabulary where it already expresses the condition:

| Condition | `ok` | `mode` | `status` | `code` | `mutation_status` |
|-----------|------|--------|----------|--------|-------------------|
| Ready preflight with no residue | `true` | `preflight` | `ready` | `READY` | `not_mutated` |
| Apply created or reconciled config-owned Product Line B rows | `true` | `apply` | `seeded` | `SEEDED` | `applied` |
| Verify matched Product Line B config and disabled state | `true` | `verify` | `verified` | `VERIFIED` | `verified` |
| Existing valid target apply without explicit allow-existing | `false` | `apply` | `existing_target_refused` | `EXISTING_TARGET_REQUIRES_ALLOW_EXISTING` | `not_mutated` |
| Product Line B residue or `plb-platform-*` assignment conflict | `false` | any | `blocked_preflight` | `TARGET_PRODUCT_LINE_CONFLICT` or `TARGET_RESIDUE_BLOCKED` | `not_mutated` |
| Shared repo ownership or Product Line A sync-owner takeover risk | `false` | any | `blocked_preflight` | `TARGET_REPO_CONFLICT` or `TARGET_RESIDUE_BLOCKED` | `not_mutated` |
| Reserved future control-plane, runner, or sandbox flag enabled | `false` | any | `blocked_preflight` or `validation_failed` | `FEATURE_FLAG_RESERVED_FUTURE_ENABLED` | `not_mutated` |
| Workflow-template ownership conflict | `false` | any | `contract_not_ready` | `WORKFLOW_TEMPLATE_OWNERSHIP_CONFLICT` | `not_mutated` |
| Verify drift after read-only verification | `false` | `verify` | `verification_failed` | `VERIFY_DRIFT_DETECTED` | `not_mutated` |

If existing codes cannot express the Product Line B-specific disabled lifecycle, tasks may add only these focused codes: `PRODUCT_LINE_B_DISABLED_STATE_MISSING`, `PRODUCT_LINE_B_REPO_SYNC_OWNER_PRESENT`, `PRODUCT_LINE_B_SMOKE_FLAG_STILL_ENABLED`, and `PRODUCT_LINE_B_SMOKE_ELIGIBILITY_REMAINING`.

### Error And Residue Object Shapes

Each `errors[]` entry must match the existing `ProductLineSeedValidationError` shape:

- `code`: one of the seed error codes above, or one of the focused Product Line B codes if implementation proves it is required.
- `path`: JSONPath-style path such as `$.target.residue[0]`, `$.target.feature_flags.FEATURE_TASK_CONTROL_PLANE`, or `$.workspace.disabled_at`.
- `message`: short operator-safe description without raw SQL, stack traces, raw upstream responses, tokens, authorization headers, API keys, credentials, or matched secret substrings.
- `remediation`: optional operator action, also redaction-safe.

Each `evidence.residue[]` entry must match the existing residue shape and remain redaction-safe:

- `kind`: stable category such as `product_line_identity_conflict`, `plb_platform_assignment_conflict`, `repo_sync_owner_conflict`, `retained_inventory`, or `workflow_template_ownership_conflict`.
- `count`: non-negative integer.
- `repo`: optional repo full name when the repo itself is not secret.
- `project_ids` / `task_ids`: optional numeric IDs scoped to the target database.
- `identifiers`: optional stable names or hashes only; no tokens, raw GitHub responses, authorization headers, API keys, credentials, or matched secret substrings.

## Product Line B Assertions

Preflight must:

- Preserve equal before/after snapshot hashes.
- Report Product Line B residue and `plb-platform-*` assignment conflicts.
- Report retained FocusEngine/OpenClaw inventory without changing it.
- Stop on repo sync ownership conflicts.
- Separate absent/ready, already valid, residue blocked, and ownership-conflict target classes in redaction-safe evidence.

Apply must:

- Create or verify `workspaces.slug = 'product-line-b'`.
- Create Product Line B projects with `github_sync_enabled = 0` and `is_repo_sync_owner = 0`.
- Create logical assignments named `plb-platform-*`.
- Import required Paddock workflow templates for the Product Line B workspace.
- Write non-null `workspaces.disabled_at` when `disabled_by_default` is true.
- Refuse an existing Product Line B target without `--allow-existing` using the existing-target refusal status and `mutation_status: not_mutated`.
- With `--allow-existing`, preserve Product Line A scoped hashes, preserve operational/history surfaces, avoid duplicate config-owned rows, and produce matching before/after snapshot hashes when the target is already valid.

Verify must:

- Confirm Product Line B disabled state.
- Confirm no Product Line B repo sync owner rows.
- Confirm smoke/runner/control-plane flags are absent or false.
- Confirm Product Line A hashes remain unchanged when compared by the smoke evidence path.
- Remain read-only and repeatable on an already valid target, with no change to Product Line B or Product Line A row counts or hashes.

## Existing Target And Idempotency Outcomes

- Absent or ready target: `preflight` returns ready with `mutation_status: not_mutated`; first `apply` seeds Product Line B disabled.
- Already valid Product Line B target: `apply` without `--allow-existing` returns `existing_target_refused`, `EXISTING_TARGET_REQUIRES_ALLOW_EXISTING`, `mutation_status: not_mutated`, and `action_required: --allow-existing`.
- Already valid Product Line B target with `--allow-existing`: `apply` is idempotent for intended seed state, creates no duplicate workspace/project/assignment/template/governance rows, preserves Product Line A scoped hashes and operational/history surfaces, and records stable before/after seed snapshot hashes.
- Product Line B residue or `plb-platform-*` conflict: `preflight` and `apply` stop before mutation with typed residue evidence.
- Product Line A ownership conflict or repo sync ownership takeover risk: `preflight` and `apply` stop before mutation with typed ownership-conflict evidence.

## Existing Target And Idempotency Outcomes

- Absent Product Line B target: `preflight` returns `ready`; `apply` creates only config-owned Product Line B rows and returns `seeded`; `verify` returns `verified` after apply.
- Already valid Product Line B target: `preflight` returns `ready` with `target.existing_target: true`; `apply` without explicit allow-existing returns `existing_target_refused` and `not_mutated`; `apply` with explicit allow-existing is idempotent, may update only config-owned Product Line B rows, must leave `disabled_at` non-null, and must not change preserved Product Line A surfaces; repeated `verify` remains read-only.
- Product Line B residue: preflight/apply stop before mutation with `blocked_preflight`, typed residue entries, and no automatic cleanup.
- `plb-platform-*` assignment conflict: preflight/apply stop before mutation with `TARGET_PRODUCT_LINE_CONFLICT`.
- Product Line A ownership conflict or shared `racecraft-lab/Paddock` repo sync-owner takeover risk: preflight/apply stop before mutation with `TARGET_REPO_CONFLICT` or `TARGET_RESIDUE_BLOCKED`.
- Retained FocusEngine/OpenClaw inventory without Product Line B assignment: report as non-blocking retained inventory, not residue requiring cleanup.

## Failure Codes

Use existing seed error codes where possible:

- `TARGET_PRODUCT_LINE_CONFLICT`
- `TARGET_REPO_CONFLICT`
- `TARGET_RESIDUE_BLOCKED`
- `EXISTING_TARGET_REQUIRES_ALLOW_EXISTING`
- `FEATURE_FLAG_RESERVED_FUTURE_ENABLED`
- `WORKFLOW_TEMPLATE_OWNERSHIP_CONFLICT`
- `VERIFY_DRIFT_DETECTED`

Add only focused codes if implementation proves existing codes cannot express:

- Product Line B disabled state missing: `PRODUCT_LINE_B_DISABLED_STATE_MISSING`.
- Product Line B repo sync owner present: `PRODUCT_LINE_B_REPO_SYNC_OWNER_PRESENT`.
- Product Line B smoke-owned flag still enabled after disablement: `PRODUCT_LINE_B_SMOKE_FLAG_STILL_ENABLED`.
- Product Line B smoke eligibility remaining after disablement: `PRODUCT_LINE_B_SMOKE_ELIGIBILITY_REMAINING`.
