# Harness Gardening Report

- Schema: harness_gardening_report.v1
- As of: 2026-06-06
- Findings: 5
- Recommendations: 5
- Hard failures: 5
- Warnings: 0
- Guard errors: 0

## Detector Statuses

- stale_claims: failed
- missing_required_evidence: failed
- stale_feature_flag_status: failed
- strict_scope_drift: failed
- source_of_truth_links: failed

## Findings

- hg_8f2ab9afa1d9fc913f4e: error broken_source_of_truth_link
  - Source: docs/ai/repo-knowledge-index.json (/entries/0/path)
  - Owner: Repo Knowledge (repo-knowledge)
  - Recommendation: Fix or remove the broken required repo-owned source link.
- hg_237373075eea6ba08aa9: error missing_required_evidence
  - Source: docs/ai/specs/.process/SPEC-010B-workflow.md (Closeout Evidence)
  - Owner: Docs Integrity (docs-integrity)
  - Recommendation: Add the exact UAT run id closeout marker or downgrade the status claim.
- hg_89983b19b05fe1a7df20: error stale_feature_flag_status
  - Source: docs/feature-flags.md (FEATURE_SPEC_012B_GARDENING)
  - Owner: Feature Flags (feature-flags)
  - Recommendation: Add the missing disabled-by-default registry entry or remove the documented requirement.
- hg_c7a728a2774be15f0bb4: error stale_workflow_claim
  - Source: docs/ai/specs/.process/SPEC-012A-workflow.md (Phase 6 Closeout)
  - Owner: Docs Integrity (docs-integrity)
  - Recommendation: Update the stale workflow status pointer or add current closeout evidence.
- hg_6cfdf31de798b67756bd: error strict_scope_drift
  - Source: specs/012b-harness-gardening-guards/plan.md (Scope Boundaries)
  - Owner: SpecKit (speckit)
  - Recommendation: Remove the runtime/API path from the SPEC-012B change or split it into a separate runtime spec.

## Errors

- None
