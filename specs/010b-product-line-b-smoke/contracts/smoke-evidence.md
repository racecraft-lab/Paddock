# Contract: SPEC-010B Smoke Evidence

## Synthetic Issue Envelope

Schema version: `spec-010b.synthetic_issue.v1`

```json
{
  "schema_version": "spec-010b.synthetic_issue.v1",
  "run_id": "SPEC-010B-LOCAL-0001",
  "product_line_slug": "product-line-b",
  "repo": {
    "owner": "racecraft-lab",
    "name": "Paddock",
    "full_name": "racecraft-lab/Paddock"
  },
  "issue": {
    "number": 1001,
    "title": "[mc-pilot][product-line-b] SPEC-010B synthetic smoke SPEC-010B-LOCAL-0001",
    "labels": ["pd:inbox", "priority:medium", "area:dev"]
  },
  "metadata": {
    "live_github_required": false,
    "optional_live_issue_url": null
  }
}
```

Required validation:

- `schema_version` matches exactly.
- `product_line_slug` is `product-line-b`.
- Repo full name is `racecraft-lab/Paddock`.
- Issue number is positive.
- Labels include `pd:inbox`, `priority:medium`, and `area:dev`.
- No live GitHub call is required.

## Smoke Evidence Envelope

Schema version: `spec-010b.smoke_evidence.v1`

Required top-level fields:

- `schema_version`
- `run_id`
- `product_line_slug`
- `commit`
- `runtime`
- `phases`
- `seed_snapshots`
- `product_line_a_baseline`
- `product_line_a_after`
- `side_effect_counts`
- `cleanup_counters`
- `optional_live_issue_status`
- `redaction`
- `parallel_safety`

Required phases:

- `preflight`
- `apply`
- `verify`
- `enable`
- `synthetic_issue`
- `pilot_subset`
- `disable`
- `cleanup`
- `isolation`
- `scope`
- `timing`

Each phase must include:

- `status`: `passed`, `failed`, or `skipped`
- `observed_at`: ISO timestamp or operator-recorded equivalent
- `evidence_refs[]`: command, SQL, API, or file evidence references
- `notes`: short redaction-safe context

## Cleanup Counters

Required cleanup proof:

- Product Line B `disabled_at` is non-null.
- Product Line B smoke-owned flags are absent or false.
- Product Line B projects with `github_sync_enabled = 1`: `0`
- Product Line B projects with `is_repo_sync_owner = 1`: `0`
- Remaining eligible Product Line B smoke work: `0`
- Unintended side-effect rows tied to the synthetic task: `0`
- Product Line A snapshot parity: passed
- Retained evidence rows: listed with rationale

## Optional Live Issue Status

Allowed statuses:

- `skipped`
- `reused_existing`
- `created_one`
- `failed_not_required`

Required redaction:

- Record booleans such as `token_set`.
- Record stable error codes, counts, URL/number, and timestamps.
- Never record token values, authorization headers, raw GitHub responses, API keys, credentials, or matched secret substrings.

## Parallel Safety

Required fields:

- `active_spec_014c_noted`: true
- `files_avoided[]`: includes SPEC-014C-owned adapter/runtime-inventory/dispatch paths
- `runtime_inventory_required`: false
- `runtime_inventory_evidence_status`: `skipped`, `read_only_observed`, or `not_available`
- `adapter_file_ownership_taken`: false
