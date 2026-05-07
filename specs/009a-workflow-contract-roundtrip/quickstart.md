# Quickstart: SPEC-009A Workflow Contract Roundtrip

## Prerequisites

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
```

`package.json` must declare exact direct production dependency `yaml@2.8.2`; `ajv@8.18.0` remains the only schema validator for workflow-contract validation.

## 1. Inspect Canonical Source

```bash
ls docs/ai/workflows/mission-control/
```

Expected canonical source includes YAML manifests such as:

```text
docs/ai/workflows/mission-control/workflow-contract.yaml
```

Markdown under `docs/ai/workflows/mission-control/exports/` is generated review output only.

## 2. Dry-Run Import

```bash
pnpm workflow-contract import \
  --source docs/ai/workflows/mission-control \
  --workspace 1 \
  --dry-run \
  --json
```

Expected:

- exit code `0` for a valid contract
- diff summary includes create/update/disable/remove/no-op counts
- parity hashes are present
- `workflow_templates` is unchanged

## 3. Apply Import

```bash
pnpm workflow-contract import \
  --source docs/ai/workflows/mission-control \
  --workspace 1 \
  --apply \
  --json
```

Expected:

- full validation and diff complete before mutation
- owned `workflow_templates` rows are upserted by workspace plus slug
- unrelated templates are preserved
- diagnostics and last-known-good snapshot are written in the same SQLite transaction
- output includes deterministic recovery command

## 4. Export Markdown Review Artifact

```bash
pnpm workflow-contract export \
  --workspace 1 \
  --family mission-control \
  --output docs/ai/workflows/mission-control/exports/workflow-contract.md \
  --json
```

Expected:

- Markdown export is deterministic
- export contains contract-owned templates and hash evidence
- Markdown is not accepted as import source

## 5. Verify No-Op Parity

```bash
pnpm workflow-contract import \
  --source docs/ai/workflows/mission-control \
  --workspace 1 \
  --dry-run \
  --json
```

Expected:

- no required mutations
- canonical object hash is stable across repeated runs
- routing-rule and output-schema hashes are stable

## 6. Validate Fail-Closed Fixtures

Run focused tests for invalid fixture classes:

```bash
pnpm exec vitest run src/lib/__tests__/workflow-contracts
```

Expected invalid classes:

- invalid YAML syntax
- multi-document stream
- non-mapping root
- duplicate keys
- custom tags, anchors, aliases, and merge keys
- non-literal prompt scalar
- unknown template variable
- invalid tracker identity
- invalid capabilities or adapter requirements
- invalid governance, concurrency, retry, or sandbox declarations
- prompt-version, routing-rule-hash, and output-schema-hash mismatch

Every invalid fixture exits before runtime mutation and records operator-visible diagnostics.

## 7. Inspect Diagnostics

Open the existing Orchestration/Workflows surface and inspect Workflow Contracts diagnostics.

Expected states:

- successful import/export
- changed dry-run diff
- invalid contract with grouped errors
- last-known-good available
- no-last-known-good state before first apply

The diagnostics surface is read-only and does not apply imports or launch work.

## 8. Recover Last Known Good

```bash
pnpm workflow-contract recover \
  --workspace 1 \
  --family mission-control \
  --dry-run \
  --json
```

Then explicitly apply if the dry-run is acceptable:

```bash
pnpm workflow-contract recover \
  --workspace 1 \
  --family mission-control \
  --apply \
  --json
```

Expected:

- recovery uses the stored last-known-good canonical snapshot
- dry-run mutates nothing
- apply uses the same transaction boundary as import apply

## Scope Guard

SPEC-009A verification must confirm these actions do not start: product-line seed, GitHub issue ingestion, claim/reconciliation, dispatch, retry execution, auto-merge, runner launch, sandbox lifecycle, harness adapter work, visual editor behavior, or the Mission Control self-hosting pilot.
