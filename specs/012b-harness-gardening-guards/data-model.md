# Data Model: Harness-Gardening Drift Guards

## Report Envelope

The deterministic top-level machine-readable output for one guard run.

Fields:

- `schema_version`: constant `harness_gardening_report.v1`.
- `as_of`: explicit `YYYY-MM-DD` freshness date supplied by `--as-of`.
- `detector_statuses`: status for each v1 detector, including skipped optional inputs.
- `summary`: count fields for findings, recommendations, hard failures, warnings, and errors.
- `findings`: sorted list of drift findings with embedded recommendations.
- `errors`: sanitized guard or fixture errors.

Validation rules:

- No default wall-clock timestamp appears in deterministic JSON.
- Paths are repo-relative POSIX paths.
- Findings are sorted by severity, drift class, source path, anchor, owner key, then stable ID.
- For a fixed input corpus and `--as-of`, repeated runs produce byte-for-byte equivalent JSON after stable formatting.

## Drift Finding

A deterministic record of one supported drift instance.

Fields:

- `stable_finding_id`: `hg_<sha256 first 20 hex>` computed from normalized `drift_class + source_path + anchor + owner_key`.
- `drift_class`: closed v1 lower-snake enum.
- `source_path`: repo-relative POSIX path.
- `anchor`: detector-stable Markdown heading, JSON pointer, workflow phase, or equivalent locator.
- `owner`: derived owner metadata.
- `severity`: `error` or `warning`.
- `evidence`: sorted unique evidence references.
- `warnings`: sorted unique warning records.
- `recommendation`: one cleanup recommendation for the stable finding.

Validation rules:

- Exact normalized tuple matches dedupe to one active finding.
- Duplicate evidence is merged deterministically.
- Effective severity is the maximum severity across duplicate inputs.

## Cleanup Recommendation

One narrow remediation action attached to a drift finding.

Fields:

- `schema_version`: constant `harness_gardening_recommendation.v1`.
- `stable_finding_id` and `recommendation_id`: equal stable ID values.
- `drift_class`, `source_path`, `anchor`, `owner`, `severity`, `evidence`, and `warnings`: copied from the finding.
- `remediation_summary`: one narrow cleanup action, not a broad rewrite.
- `paddock_cleanup_task`: non-mutating task import draft.
- `github_issue_export`: optional export-only issue draft.
- `deferred_side_effects`: explicit list of side effects not performed by v1.

Validation rules:

- Exactly one active recommendation exists for each stable finding ID.
- `paddock_cleanup_task.live_mutation` is always `false`.
- `github_issue_export.export_only` and `github_issue_export.live_mutation` are always `true` and `false`, respectively, when present.

## Paddock Cleanup-Task Payload

The canonical non-mutating future import draft for Paddock cleanup work.

Fields:

- `schema_version`: constant `paddock_cleanup_task_import_draft.v1`.
- `operation`: constant `create_task`.
- `live_mutation`: constant `false`.
- `title`, `description`, `status`, `priority`, and `tags`.
- `metadata`: stable finding ID, drift class, source path, anchor, owner metadata, evidence references, and optional workspace/project hints.

Validation rules:

- No live `workspace_id` or `project_id` is required.
- The payload is not executable by the guard itself.

## GitHub Issue Export

Optional export-only issue draft for manual or later explicitly approved apply-mode use.

Fields:

- `export_only`: constant `true`.
- `live_mutation`: constant `false`.
- `repository`, `title`, and `body`.
- Optional `labels`, `assignees`, `milestone`, `type`, and `issue_field_values`.

Validation rules:

- The guard must not call GitHub APIs, invoke `gh`, create labels, assign users, set milestones, set issue types, set project fields, or create issues.
- `repository` names the export target and is not a GitHub request body field.

## Owner Metadata

Repo-derived ownership context for routing cleanup recommendations.

Fields:

- `name`: owner display name or `unknown`.
- `owner_key`: normalized owner key or `unknown`.
- `owner_source`: exact index path, longest index prefix, link target/source path, SPEC family, roadmap/path-class convention, or unknown.
- `confidence`: `high`, `medium`, `low`, or `unknown`.

Derivation order:

1. Exact `docs/ai/repo-knowledge-index.json` path.
2. Longest indexed directory prefix.
3. Link-target or source-path owner where applicable.
4. Related SPEC family.
5. Roadmap or path-class convention.
6. `owner: unknown` with warning fallback.

## Guard Error

Sanitized record for artifact, parse, schema, format, path, size, or fixture expectation failures.

Fields:

- `source_path`: repo-relative POSIX path.
- `detector`: detector identifier.
- `code`: closed `harness_gardening_error_code.v1` enum.
- `message`: bounded sanitized message.
- `required`: boolean.
- `redacted`: boolean.

Validation rules:

- Required repo artifacts, required fixtures, required detector inputs, fixture expectation mismatches, and unsafe fixture paths fail CI.
- Optional detector inputs warn with `detector_status: "skipped_detector"`.
- Error records must not expose raw artifact contents, absolute host paths, stack traces, environment values, tokens, credentials, secrets, secret-shaped values, or matched substrings.

## Fixture Case

Small checked-in fresh/stale example used to prove guard behavior.

Layout:

```text
scripts/spec-012b/fixtures/{fresh,hard,warning,dedupe,errors}/<drift-class>/<case>/
├── fixture.json
└── repo/
```

Validation rules:

- Each supported drift class has at least one fresh case and one stale/warning/error case as applicable.
- Fixture paths must stay within the fixture mini-tree.
- Fixture expected fields are deterministic and include the `--as-of` date.
