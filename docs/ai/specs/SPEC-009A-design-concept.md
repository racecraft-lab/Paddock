---
spec_id: SPEC-009A
spec_name: Workflow Contract Format and Roundtrip
short_name: workflow-contract-roundtrip
phase: 8A
priority: P0
status: draft
created_at: 2026-05-05
question_count: 16
authority: Operator (interactive grill-me session) + research-augmented validation-stack decision
implementation_authority: SpecKit autopilot via speckit-pro plugin
---

# Design Concept: SPEC-009A Workflow Contract Format and Roundtrip

> **Questions asked:** 16
> **Interview mode:** Human-in-the-loop grill-me during `$speckit-pro:speckit-setup`
> **Setup branch:** `009a-workflow-contract-roundtrip`
> **Roadmap source:** `docs/ai/rc-factory-technical-roadmap.md`

## Context

Paddock currently stores executable workflow templates in SQLite
`workflow_templates`. The RC Factory PRD requires workflow policy to be
repo-owned instead of database-only: a product line workflow family must be
importable/exportable as a versioned contract and must preserve parity with the
runtime template projection.

SPEC-009A is the process-only contract roundtrip slice. It defines the contract
format under `docs/ai/workflows/`, imports valid contracts into
`workflow_templates`, exports the runtime projection back to a Markdown review
artifact, and proves fail-closed behavior for invalid contracts. It does not
seed the Paddock product line, ingest a GitHub issue, claim work, launch
a runner, or run a pilot.

The roadmap already contains later governance and control-plane specs that
complete runtime enforcement:

- SPEC-009B seeds Product Line A, flags, assignments, templates, and governance
  policy without dispatching work.
- SPEC-009C runs one GitHub-linked self-hosting smoke with governance evidence.
- SPEC-009D emits the review packet and lifecycle snapshot.
- SPEC-013A adds durable run-attempt state.
- SPEC-013B owns claim and reconciliation authority, including governance gates
  and terminal-state release.
- SPEC-013C owns retry/backoff and debug surfaces.
- SPEC-014A-D own sandbox and harness adapter execution for already-claimed
  work only.

SPEC-009A must therefore represent governance fields as durable declarations,
not implement enforcement in a way coupled to SPEC-009A itself.

## Goals

1. Define a repo-owned Paddock workflow contract under
   `docs/ai/workflows/mission-control/`.
2. Keep YAML as the canonical source file shape, with prompt bodies embedded as
   block scalars and Markdown generated only as a review artifact.
3. Parse contract YAML into a typed canonical object model, validate with the
   existing constrained AJV JSON Schema profile, and compute stable hashes over
   canonical data.
4. Import valid contracts into `workflow_templates` through explicit operator
   tooling only; default mode is dry-run, apply is explicit.
5. Export the runtime projection back to Markdown and prove no-op parity through
   stable hashes, not byte-for-byte formatting.
6. Fail closed on invalid YAML, unknown template variables, invalid tracker
   identity, invalid capabilities, invalid governance declarations, or unsafe
   schema/routing declarations.
7. Preserve last-known-good runtime templates if a later contract reload fails.
8. Expose reusable import diagnostics in the existing Workflow/Orchestration
   admin surface without SPEC-009A-specific naming.

## Non-Goals

- No product-line seed and no `PILOT_MISSION_CONTROL_E2E` activation.
- No GitHub issue ingestion, task claim, dispatch, autonomous runner launch, or
  live pilot run.
- No new harness adapter and no mandatory provider binding for OpenClaw, Codex,
  Claude, Hermes, OpenCode, or any other runner.
- No second schema-validation stack beyond the existing pinned AJV profile.
- No JSON-only authoring format.
- No visual workflow editor.
- No governance enforcement beyond validating and roundtripping declarative
  policy fields required by later specs.

## Design Tree (Q&A log)

### Q1 - Canonical source of truth for workflow policy

**Decision:** YAML files under `docs/ai/workflows/` are canonical. The
`workflow_templates` rows are the imported runtime projection. Markdown export
is a review artifact, not the source of policy truth.

### Q2 - Runtime flag vs operator tooling

**Decision:** SPEC-009A import/export is operator-run tooling. It does not add a
new runtime feature flag. Existing and later flags govern imported runtime
behavior.

### Q3 - Invalid import after a prior valid version

**Decision:** Invalid imports fail closed. The command exits nonzero, records
operator-visible validation evidence, and preserves last-known-good
`workflow_templates` rows.

### Q4 - Roundtrip parity definition

**Decision:** Parity is canonical parse -> typed model -> import/export hash
equality for prompt versions, routing rules, output schemas, tracker identity,
capabilities, concurrency/retry fields, sandbox fields, and feature-flag
dependencies. It is not byte-for-byte Markdown/YAML formatting equality.

### Q5 - Provider-specific fields

**Decision:** Use provider-neutral `capabilities` and `adapter_requirements`.
Reject or defer mandatory provider-specific runner keys. Provider selection is
data declared for later adapters, not a SPEC-009A runtime assumption.

### Q6 - Tracker identity

**Decision:** v1 declares GitHub tracker identity explicitly: owner/name, label
selectors, priority rules, area labels, and local-only non-pilot intake
semantics.

### Q7 - Existing operator-edited templates

**Decision:** Import command defaults to dry-run. Apply mode is explicit and
transactional. Upsert keys are workspace plus contract template slug. Unrelated
templates are preserved. Every dry-run/apply emits a diff report.

### Q8 - Failure visibility

**Decision:** Add a narrow Workflow Contracts diagnostics view inside the
existing Orchestration/Workflows admin surface. The implementation must be
generic and reusable, not named or modeled as SPEC-009A-only UI.

### Q9 - Durable diagnostics storage

**Decision:** Add generic import-run/validation-result storage such as
`workflow_contract_import_runs`. Avoid `spec_009a` table/column names.

### Q10 - UI boundary

**Decision:** The UI is diagnostics-only. Show import/export runs, validation
errors, diff summaries, last-known-good state, and artifact/report links. Do not
ship a full workflow editor.

### Q11 - Template variable validation

**Decision:** Validate explicit variable namespace allowlists. Initial
namespaces: `task`, `workspace`, `project`, `github_issue`, `artifacts`,
`prior_outputs`, and governance context needed for later specs. Unknown
variables are rejected. Each template declares required and optional namespaces.

### Q12 - Versioning and last-known-good rollback

**Decision:** Contracts include `contract_version`, `schema_version`, and
content hashes. Each successful apply records a last-known-good snapshot
reference and rollback command to re-apply the exact contract. Recovery is
deterministic and operator-driven; there is no automatic rollback behavior.

### Q13 - Initial workflow family content

**Decision:** Include a minimal Paddock workflow family under
`docs/ai/workflows/mission-control/`. It covers intake, planning,
implementation, review, owner gate, and lifecycle metadata, but does not
dispatch a pilot.

### Q14 - Concurrency, retry, and governance declarations

**Decision:** SPEC-009A validates and roundtrips concurrency, retry, sandbox,
and governance fields as declarative metadata only. Enforcement belongs to
SPEC-009B/C/D and SPEC-013A-C. The design must be durable beyond SPEC-009A and
must not couple governance behavior to the spec that introduced the contract
format.

### Q15 - Validation technology

**Decision:** Use a hybrid validated by research. Add only an explicit direct
pinned YAML parser dependency for YAML syntax/loading if Plan confirms the
existing transitive `yaml@2.8.2` package is the right parser. Reuse the existing
direct pinned `ajv@8.18.0` strict JSON Schema profile for contract validation.
Convert loaded YAML into a typed canonical model before hashing/import/export.
Do not add a new schema validator and do not make contracts JSON-only.

Research basis:

- YAML 1.2.2 is designed for human-friendly configuration and aligns with JSON
  data models.
- OpenAPI treats a conforming document as a JSON object representable in JSON
  or YAML.
- GitHub Actions uses repo-owned YAML workflow files.
- Kubernetes CRDs validate YAML-authored resources through structural OpenAPI
  schemas.
- AJV strict mode prevents quietly ignored or ambiguous schema mistakes.

Primary references:

- https://yaml.org/spec/1.2.2/
- https://spec.openapis.org/oas/latest.html#format
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/
- https://ajv.js.org/strict-mode.html

### Q16 - Canonical contract file shape

**Decision:** Canonical source files are YAML manifests with prompt bodies as
block scalars. Markdown files are generated review artifacts. This preserves
literal invalid-YAML testing, straightforward canonicalization, and clean hash
semantics.

## Contract Shape Sketch

The final schema is owned by Specify/Plan, but setup establishes this direction:

```yaml
contract_version: 1
schema_version: 1
family: mission-control
tracker:
  kind: github_issues
  owner: racecraft-lab
  repo: Paddock
  selector_labels:
    - mc:self-hosting
templates:
  - slug: intake
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
      sandbox: none
      network: github_api
    governance:
      feature_flags:
        - FEATURE_RESOURCE_GOVERNANCE
      policy_refs:
        - product_line_wip
    concurrency:
      max_in_flight_per_workspace: 1
    retry:
      max_attempts: 0
    output_schema:
      hash_algorithm: sha256
      schema: {}
```

## Acceptance Criteria Draft

- Contract source files live under `docs/ai/workflows/mission-control/`.
- Import command supports dry-run and explicit apply mode.
- Apply mode is transactional and preserves unrelated workflow templates.
- Invalid YAML fixtures fail before mutation.
- Unknown template variable fixtures fail before mutation.
- Invalid tracker identity, capabilities, adapter requirements, concurrency,
  retry, sandbox, prompt version, routing hash, output-schema hash, and
  feature-flag dependency fixtures fail visibly before mutation.
- Export command produces a Markdown review artifact from runtime projection.
- Canonical hashes prove no-op import/export parity.
- Last-known-good snapshot reference and recovery command are recorded on
  successful apply.
- Generic diagnostics persist validation errors and import/export results and
  render in the Workflow/Orchestration admin surface.
- Existing `workflow_templates` behavior is unchanged unless the operator runs
  the contract import command explicitly.

## Open Questions for SpecKit Clarify

1. Exact YAML package and version pin. Plan should inspect package health,
   TypeScript/ESM compatibility, existing transitive `yaml@2.8.2`, and audit
   output before selecting the direct dependency.
2. Exact canonical hash inputs. Clarify should decide whether hashes include
   sorted JSON serialization only or a versioned canonicalization envelope with
   schema version and field list.
3. Exact diagnostics persistence shape. Clarify should decide whether to add a
   single import-run table with JSON columns or normalized run/error tables.
4. Exact Markdown export path and naming convention.
5. Exact migration numbering for reusable diagnostics storage.
