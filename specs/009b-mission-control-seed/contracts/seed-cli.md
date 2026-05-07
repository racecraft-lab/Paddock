# Contract: Mission Control Seed CLI

## Command

```bash
node --experimental-strip-types scripts/seed-mission-control-product-line.ts \
  --db <path> \
  --contract docs/ai/workflows/mission-control/workflow-contract.yaml \
  --mode <preflight|apply|verify> \
  --json
```

An optional package script may wrap this command, but the script remains the canonical operator entrypoint for SPEC-009B.

## Modes

| Mode | Mutates | Purpose |
|------|---------|---------|
| `preflight` | No | Detect non-Mission-Control residue and contract readiness before seed writes. |
| `apply` | Yes, only after clean preflight | Upsert Mission Control seed data, import workflows, flags, governance rows, and emit evidence. |
| `verify` | No | Re-read the target and assert idempotency/non-dispatch invariants after one or two seed runs. |

## Required Inputs

| Option | Required | Description |
|--------|----------|-------------|
| `--db <path>` | Yes | SQLite database path or resolved Mission Control data-dir database path. |
| `--contract <path>` | Yes | Repo-owned workflow contract YAML. |
| `--mode <mode>` | Yes | `preflight`, `apply`, or `verify`. |
| `--json` | Recommended | Emit machine-readable result. Human text may be added only outside JSON mode. |
| `--operator-evidence <path>` | Optional | Redacted operator-supplied cleanup evidence for `ssh hall` / OpenClaw / gateway surfaces. |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success; requested mode completed. |
| `2` | Blocked preflight with `mutation_status: "not_mutated"`. |
| `3` | Workflow contract invalid, stale, or missing required slugs. |
| `4` | Verification failed. |
| `5` | Unexpected operational failure; error payload is redacted. |

## Successful Apply Result

```json
{
  "ok": true,
  "mode": "apply",
  "status": "seeded",
  "mutation_status": "applied",
  "workspace": {
    "slug": "mission-control",
    "id": 2
  },
  "counts": {
    "mission_control_product_lines": 1,
    "facility_workspaces": 1,
    "department_projects": 6,
    "required_role_assignments": 6,
    "workflow_templates": 9,
    "governance_policies": 3,
    "preserved_issue_intake": 0,
    "new_pilot_tasks": 0,
    "new_successor_records": 0,
    "new_per_agent_seed_tasks": 0
  },
  "workflow_contract": {
    "source_path": "docs/ai/workflows/mission-control/workflow-contract.yaml",
    "run_id": 12,
    "contract_hash": "workflow-contract-hash-v1:sha256:<hash>",
    "required_slugs_present": true
  },
  "flags": {
    "enabled": ["FEATURE_WORKSPACE_SWITCHER", "PILOT_MISSION_CONTROL_E2E"],
    "disabled_or_absent": ["PILOT_PRODUCT_LINE_A_E2E", "FEATURE_TASK_CONTROL_PLANE", "FEATURE_AGENT_RUNNER_SANDBOXES"]
  }
}
```

## Blocked Preflight Result

```json
{
  "ok": false,
  "mode": "preflight",
  "status": "blocked_preflight",
  "code": "NON_MISSION_CONTROL_RESIDUE",
  "mutation_status": "not_mutated",
  "residue": [
    {
      "kind": "project_github_sync",
      "repo": "example/non-mission-control",
      "project_ids": [14],
      "count": 1
    }
  ],
  "cleanup_checklist": "docs/runbooks/mission-control-seed-predeploy.md",
  "redaction": {
    "raw_secret_values_emitted": false,
    "redacted_fields": ["authorization", "token", "api_key"]
  }
}
```

## Contract Readiness Failure

```json
{
  "ok": false,
  "mode": "preflight",
  "status": "contract_not_ready",
  "code": "WORKFLOW_CONTRACT_REQUIRED_SLUGS_MISSING",
  "mutation_status": "not_mutated",
  "missing_slugs": ["mission-control_issue_triage"],
  "source_path": "docs/ai/workflows/mission-control/workflow-contract.yaml"
}
```

## Security Requirements

- JSON output must not include raw secrets, tokens, Authorization headers, API keys, passwords, or matched secret substrings.
- Cleanup-safe values may include repo slugs, issue numbers, project ids, task ids, agent names, cron ids, service names, config paths, host alias `ssh hall`, counts, timestamps, booleans, and content hashes.
- Blocked preflight must complete before seed mutation.
