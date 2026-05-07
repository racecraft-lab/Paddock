# CLI Contract: Workflow Contract Import, Export, and Recovery

## Command Family

SPEC-009A exposes operator-run tooling under the package-managed Mission Control workspace as the `pnpm workflow-contract ...` command family. Any additional alias must preserve the behavior below.

## Import

```bash
pnpm workflow-contract import \
  --source docs/ai/workflows/mission-control \
  --workspace 1 \
  [--dry-run | --apply] \
  [--json]
```

### Mode Rules

- Default mode is dry-run.
- `--apply` is explicit and mutually exclusive with `--dry-run`.
- Dry-run validates, hashes, and diffs without mutating `workflow_templates`.
- Apply validates and computes the full diff before mutation, then runs owned-template upserts/disables, diagnostics writes, and last-known-good snapshot writes in one SQLite transaction.

### Success Output

JSON output includes:

- `mode`
- `status`
- `workspace_id`
- `family`
- `source_paths`
- `diff_summary`
- `canonical_object_hash`
- `template_hashes`
- `routing_rule_hashes`
- `output_schema_hashes`
- `diagnostics_run_id`
- `snapshot_id` when apply succeeds
- `recovery_command` when a last-known-good snapshot exists
- `mutation_status`

### Validation Failure Output

JSON output includes:

- `status: "validation_failed"`
- `mutation_status: "not_attempted"`
- `errors[]` with stable `code`, `manifest_path`, `canonical_model_path`, `template_slug` when available, concise `message`, `remediation_hint`, and redacted/truncated `details`.
- `diagnostics_run_id` when diagnostics storage is available.

## Export

```bash
pnpm workflow-contract export \
  --workspace 1 \
  --family mission-control \
  [--output docs/ai/workflows/mission-control/exports/workflow-contract.md] \
  [--json]
```

### Rules

- Default output path is `docs/ai/workflows/mission-control/exports/workflow-contract.md`.
- Markdown is deterministic review output and cannot be imported.
- Export includes contract-owned templates, validation status, diff/parity evidence when available, and stable hashes in deterministic order.

## Recovery

```bash
pnpm workflow-contract recover \
  --workspace 1 \
  --family mission-control \
  [--dry-run | --apply] \
  [--snapshot latest] \
  [--json]
```

### Rules

- Recovery is operator-triggered.
- Default mode is dry-run.
- `--apply` is explicit and mutually exclusive with `--dry-run`.
- Recovery reuses the last-known-good canonical snapshot and the same transactional apply boundary as import apply.
- Absence of a last-known-good snapshot is a usage/configuration error, not a silent success.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success for import dry-run, import apply, export, recovery dry-run, or recovery apply |
| `2` | Usage or configuration error, including mutually exclusive modes, missing source directory, missing workspace, missing snapshot, or Markdown import attempt |
| `3` | Validation failure before mutation |
| `4` | Storage or SQLite failure, including transaction rollback |
| `5` | File-system or I/O failure |
| `1` | Unexpected unclassified failure |

## Scope Guard

These commands must not start product-line seed, GitHub issue ingest/sync, claim or reconciliation work, dispatch, retry execution, auto-merge, runner launch, sandbox lifecycle, harness adapter work, visual editor behavior, or the Mission Control self-hosting pilot.
