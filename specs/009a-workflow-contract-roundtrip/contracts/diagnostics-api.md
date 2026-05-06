# Contract: Workflow Contract Diagnostics API And UI

## Read-Only API

```http
GET /api/workflow-contracts/diagnostics?family=mission-control&workspace_id=1
```

### Response

```json
{
  "family": "mission-control",
  "workspace_id": 1,
  "last_run": {
    "id": 42,
    "mode": "import_dry_run",
    "status": "validation_failed",
    "mutation_status": "not_attempted",
    "source_paths": ["docs/ai/workflows/mission-control/workflow-contract.yaml"],
    "export_artifact_path": "docs/ai/workflows/mission-control/exports/workflow-contract.md",
    "template_count": 6,
    "diff_summary": {
      "creates": 0,
      "updates": 1,
      "disables": 0,
      "removes": 0,
      "noops": 5,
      "unrelated_preserved": 3
    },
    "hashes": {
      "canonical_object_hash": "sha256:...",
      "template_hashes": {},
      "routing_rule_hashes": {},
      "output_schema_hashes": {}
    },
    "snapshot_id": 7,
    "recovery_command": "pnpm workflow-contract recover --workspace 1 --family mission-control --snapshot latest --apply",
    "created_at": 1778035200
  },
  "last_successful_apply": {
    "run_id": 40,
    "snapshot_id": 7,
    "canonical_object_hash": "sha256:...",
    "created_at": 1778035000
  },
  "last_known_good_available": true,
  "errors": [
    {
      "code": "WFC_UNKNOWN_VARIABLE",
      "severity": "error",
      "manifest_path": "docs/ai/workflows/mission-control/workflow-contract.yaml",
      "canonical_model_path": "templates[0].prompt",
      "template_slug": "intake",
      "message": "Prompt references an unknown variable namespace.",
      "remediation_hint": "Declare an allowed namespace or remove the variable.",
      "mutation_status": "not_attempted",
      "details_redacted": "..."
    }
  ]
}
```

## API Rules

- API is read-only.
- Missing diagnostics return an empty state with `last_known_good_available: false`.
- Errors are grouped and sortable by manifest path, template slug, and stable code.
- Prompt bodies and secret-like values are redacted or truncated.
- API does not run import, apply, export, recovery, dispatch, governance evaluation, GitHub sync, or runner code.

## UI Contract

The existing Orchestration/Workflows surface adds a Workflow Contracts diagnostics view showing:

- source paths
- family
- mode
- status
- mutation status
- template counts
- diff counts
- validation errors grouped by manifest/template/code
- canonical, routing-rule, and output-schema hashes
- last successful apply
- last-known-good availability
- deterministic recovery command
- export artifact path

The UI may provide copy/open affordances for commands and artifact paths. It must not edit manifests, run imports, apply changes, launch workflows, dispatch tasks, or acknowledge governance overrides.
