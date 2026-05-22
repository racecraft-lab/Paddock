# Contract: CLI Result Envelope

## Command Surfaces

Generic:

```bash
pnpm seed:product-line -- --config <yaml> --db <db> --mode preflight|apply|verify --json [--allow-existing] [--operator-evidence <json>]
```

Compatibility:

```bash
pnpm seed:mission-control -- --db <db> --mode preflight|apply|verify --json [--allow-existing] [--operator-evidence <json>]
```

Unknown flags must fail with exit code `5` and `mutation_status:"not_mutated"`.

## Result Envelope

All modes return the stable envelope:

```json
{
  "schema_version": "product-line-seed-result-v1",
  "ok": true,
  "entrypoint": "seed:product-line",
  "mode": "preflight",
  "status": "ready",
  "code": "READY",
  "mutation_status": "not_mutated",
  "config": {
    "path": "docs/ai/product-lines/mission-control.yaml",
    "schema_version": "product-line-seed-v1",
    "product_line_slug": "mission-control"
  },
  "target": {
    "db_path": "<redacted-or-normalized>",
    "product_line_slug": "mission-control",
    "existing_target": false
  },
  "evidence": {},
  "errors": [],
  "snapshot_before": null,
  "snapshot_after": null,
  "redaction": {
    "raw_secret_values_emitted": false,
    "redacted_fields": []
  },
  "action_required": null,
  "exit_code": 0
}
```

## Exit Codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success: ready, applied, or verified. |
| 2 | Blocked/refusal: existing target requires `--allow-existing`, target residue conflict, or unsafe governance. |
| 3 | Workflow/config contract not ready: unsupported family, missing required slugs, or contract source cannot be validated. |
| 4 | Verify drift: target state does not match config and verify performed no writes. |
| 5 | CLI usage or unexpected error. |

## Required Statuses

| Status | Mode | Mutation Status | Required Fields |
|--------|------|-----------------|-----------------|
| `ready` | preflight | `not_mutated` | validation evidence, target safety evidence |
| `seeded` | apply | `applied` | before/after snapshots, mutation counts, config-owned surface evidence |
| `verified` | verify | `verified` | matching evidence and read-only proof |
| `verification_failed` | verify | `not_mutated` | drift errors, observed target evidence, exit code 4 |
| `existing_target_refused` | apply | `not_mutated` | `code:"EXISTING_TARGET_REQUIRES_ALLOW_EXISTING"`, `action_required:"--allow-existing"` |
| `blocked_preflight` | preflight/apply | `not_mutated` | redacted residue or unsafe policy evidence |
| `validation_failed` | preflight/apply/verify | `not_mutated` | field/path errors, no-mutation snapshots where a target is available |
| `contract_not_ready` | preflight/apply/verify | `not_mutated` | workflow family/path/slug evidence |
| `cli_error` | unknown | `not_mutated` | usage error without writes |

## Existing Target Refusal

Required refusal shape:

```json
{
  "schema_version": "product-line-seed-result-v1",
  "ok": false,
  "entrypoint": "seed:product-line",
  "mode": "apply",
  "status": "existing_target_refused",
  "code": "EXISTING_TARGET_REQUIRES_ALLOW_EXISTING",
  "mutation_status": "not_mutated",
  "target": {
    "product_line_slug": "mission-control",
    "existing_target": true
  },
  "action_required": "--allow-existing",
  "exit_code": 2
}
```

## Snapshot Format

```json
{
  "schema_version": "product-line-seed-snapshot-v1",
  "hash": "product-line-seed-snapshot-v1:sha256:<hex>",
  "surfaces": {
    "product_line": { "count": 1, "hash": "product-line-seed-snapshot-v1:sha256:<hex>" },
    "department": { "count": 6, "hash": "product-line-seed-snapshot-v1:sha256:<hex>" },
    "assignment": { "count": 6, "hash": "product-line-seed-snapshot-v1:sha256:<hex>" },
    "workflow": { "count": 9, "hash": "product-line-seed-snapshot-v1:sha256:<hex>" },
    "governance": { "count": 3, "hash": "product-line-seed-snapshot-v1:sha256:<hex>" },
    "task": { "count": 0, "hash": "product-line-seed-snapshot-v1:sha256:<hex>" },
    "issue": { "count": 0, "hash": "product-line-seed-snapshot-v1:sha256:<hex>" },
    "activity": { "count": 0, "hash": "product-line-seed-snapshot-v1:sha256:<hex>" },
    "history": { "count": 0, "hash": "product-line-seed-snapshot-v1:sha256:<hex>" },
    "evidence": { "count": 0, "hash": "product-line-seed-snapshot-v1:sha256:<hex>" },
    "github_sync": { "count": 0, "hash": "product-line-seed-snapshot-v1:sha256:<hex>" }
  }
}
```
