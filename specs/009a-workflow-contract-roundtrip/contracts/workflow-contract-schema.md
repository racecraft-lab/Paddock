# Contract: Workflow Contract YAML And Canonical Model

## Canonical YAML Location

Canonical manifests live under:

```text
docs/ai/workflows/mission-control/
```

Generated Markdown exports live under:

```text
docs/ai/workflows/mission-control/exports/
```

Markdown exports are review artifacts only and must not be accepted as import input.

## YAML Document Rules

- Exactly one YAML 1.2 document per manifest.
- Document root must be a mapping.
- Duplicate mapping keys fail.
- Custom tags fail.
- Anchors, aliases, and merge keys fail.
- Unknown top-level or nested fields fail unless explicitly modeled.
- Prompt bodies must be literal block scalars (`|` or `|-`).
- Folded prompt scalars (`>`), plain multi-line strings, quoted multi-line strings, and non-string prompts fail.

## Minimal Shape

```yaml
contract_version: 1
schema_version: 1
family: mission-control
tracker:
  kind: github_issues
  owner: racecraft-lab
  repo: mission-control
  selector_labels:
    - mc:self-hosting
  intake_mode: local_only
templates:
  - slug: intake
    name: Intake
    version: 1
    prompt: |
      Classify the GitHub issue and produce a disposition-ready planning task.
    variables:
      required:
        - github_issue.title
        - github_issue.body
      optional:
        - github_issue.labels
    capabilities:
      required:
        - repo_read
        - issue_read
    adapter_requirements:
      network:
        - github_api
    governance:
      feature_flags:
        - FEATURE_RESOURCE_GOVERNANCE
      policy_refs:
        - product_line_wip
    concurrency:
      max_in_flight_per_workspace: 1
    retry:
      max_attempts: 0
    sandbox:
      mode: none
    routing_rules:
      hash: sha256:...
      rules: []
    output_schema:
      hash: sha256:...
      schema:
        type: object
```

## Canonical Model Rules

- YAML parser output is copied into a typed canonical model before validation, diffing, import, export, or hashing.
- Prompt line endings are normalized from CRLF to LF before hashing.
- Stable sorted JSON is used for canonical hash input.
- Timestamps, database row ids, diagnostics run ids, absolute local paths, and Markdown bytes are excluded from hash input.
- `workflow-contract-hash-v1` is the canonical object hash envelope.
- Per-template routing-rule and output-schema hashes are computed separately.

## Validation Profile

Contract model validation reuses the existing AJV 8 strict profile:

```ts
{
  strict: true,
  validateSchema: true,
  $data: false,
  validateFormats: false,
  allErrors: false,
  useDefaults: false,
  coerceTypes: false,
  removeAdditional: false,
  addUsedSchema: false,
}
```

Unsupported schema keywords, custom formats, default insertion, coercion, additional-property removal, and schema-data mutation fail closed.

## Variable Namespaces

Allowed initial namespaces:

- `task`
- `workspace`
- `project`
- `github_issue`
- `artifacts`
- `prior_outputs`
- explicit governance context namespaces required by later specs

Unknown variables fail validation before mutation.
