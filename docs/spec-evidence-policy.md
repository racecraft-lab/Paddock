# Spec Evidence Policy

SPEC-002A defines durable evidence as provenance, not committed generated
screenshots by default.

## Durable Evidence

Archive records for UI-facing specs should preserve:

- source spec path
- PR URL
- merge commit or tree reference
- CI run URL
- Argos build or review URL
- command provenance
- metadata gate outcomes
- optional artifact manifest entries
- recovery commands for raw spec artifacts

Generated screenshots should remain in Argos builds or short-lived CI artifacts
unless a spec explicitly documents a durable image exception.

## Evidence Manifest Fields

If a generated screenshot or binary artifact must be committed under `specs/**`,
it must be listed in `evidence-manifest.json`, `artifact-manifest.json`, or
`archive-evidence-manifest.json` with:

- `path`
- `sha256`
- `bytes`
- `ciArtifact.name`
- `ciArtifact.url`
- `retentionClassification`
- `redactionStatus`
- `expirationRisk`

The local guard verifies those fields and fails on unmanifested or oversized
committed screenshots.

## Local Commands

```bash
pnpm guardrails
pnpm test:evidence:screenshots
pnpm test:evidence:screenshots:negative
```

The negative command uses a synthetic fixture path,
`specs/negative-fixture/screenshots/unmanifested.png`, and passes only when the
guard names that offending path.

## CI Guard

The Quality Gate workflow runs `pnpm guardrails` before lint,
typecheck, unit tests, build, and e2e tests.

## PR Readiness Blockers

A UI spec PR is not ready when any of these are true:

- required evidence links are missing
- Argos metadata gates fail
- visible UI defects are present
- controls are clipped or overlapping
- seeded data is wrong
- controls are inaccessible
- user journeys are broken
- generated screenshots are committed without a manifest-backed exception

## Argos No-Empty-Build Policy

Visual runs must retain SPEC-002-style metadata for test or story identity,
source location, and spec-scoped tags. Non-visual or flag-off regression runs
must not upload empty Argos builds.
