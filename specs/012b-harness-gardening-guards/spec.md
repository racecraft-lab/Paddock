# Feature Specification: Harness-Gardening Drift Guards

**Feature Branch**: `012b-harness-gardening-guards`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "SPEC-012B - Harness-Gardening Drift Guards"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Detect High-Confidence Repo Drift (Priority: P1)

An autonomous coding agent can run the harness-gardening guard before starting or closing out a spec and receive deterministic findings for hard repo drift that would make future work unsafe or misleading.

**Why this priority**: High-confidence drift in repo-owned truth blocks trustworthy autonomous execution and should fail early with precise repair guidance.

**Independent Test**: Can be fully tested by running the guard against checked-in stale fixtures for broken required links, stale status pointers, strict-scope drift, and missing required evidence, then confirming failing results include exact evidence and one narrow cleanup recommendation per finding.

**Acceptance Scenarios**:

1. **Given** a fixture with a required source-of-truth link that no longer resolves, **When** the guard evaluates the fixture, **Then** it emits one failing broken-link finding with a stable ID, owner metadata when derivable, evidence, and a cleanup-task payload.
2. **Given** a fixture where a workflow/status pointer claims a spec is current but the supporting closeout evidence is stale or missing, **When** the guard evaluates the fixture, **Then** it emits one failing stale-status finding with the affected source path and anchor.
3. **Given** a fixture where a spec introduces new owned scope without matching strict-scope evidence, **When** the guard evaluates the fixture, **Then** it emits one failing strict-scope finding and a recommendation to update the exact missing strict-scope evidence.

---

### User Story 2 - Generate Narrow Cleanup Recommendations (Priority: P2)

A human operator can inspect the guard output and see one specific remediation recommendation for each supported drift class, suitable for later conversion into a Paddock cleanup task or optional GitHub issue without live mutation.

**Why this priority**: The core value of harness gardening is turning broad rewrite pressure into small reviewable work items.

**Independent Test**: Can be fully tested by triggering each supported drift fixture and confirming the output contains exactly one active recommendation per stable finding ID, sorted deterministically and deduped across duplicate inputs.

**Acceptance Scenarios**:

1. **Given** two fixtures that describe the same drift class, source path, anchor, and owner, **When** the guard emits recommendations, **Then** only one active recommendation appears for that stable finding ID.
2. **Given** a stale feature-flag status fixture, **When** the guard emits a recommendation, **Then** the recommendation includes evidence, derived owner metadata or an owner warning, a canonical cleanup-task payload, and optional GitHub issue export fields.
3. **Given** a completed `specs/**` folder that appears cleanup-eligible, **When** the guard evaluates archive evidence, **Then** it recommends archive cleanup only and never removes source folders or bypasses archive safe-base gating.

---

### User Story 3 - Preserve Advisory Signals Without Blocking CI (Priority: P3)

Future cleanup-spec implementers can use warning-level signals, such as deterministic low-value test patterns, without causing normal CI failures for lower-confidence cleanup opportunities.

**Why this priority**: Advisory cleanup signals are useful, but subjective or lower-confidence checks must not create noisy CI failures.

**Independent Test**: Can be fully tested by running low-value-test and freshness warning fixtures and confirming they emit warnings and recommendations without failing the hard-drift gate.

**Acceptance Scenarios**:

1. **Given** a fixture with a deterministic low-value test pattern, **When** the guard evaluates the fixture, **Then** it emits a warning-level recommendation and the CI-failing result remains clean.
2. **Given** a fixture with an unknown owner that cannot be derived from repo knowledge or conventions, **When** the guard evaluates the fixture, **Then** it emits an owner warning while preserving the recommendation.
3. **Given** a fresh fixture with valid links, current evidence, current feature-flag status, and matching strict-scope records, **When** the guard evaluates the fixture, **Then** it emits no active findings.

### Edge Cases

- Duplicate drift inputs with the same drift class, source path, anchor, and owner must collapse to one active recommendation.
- Missing owner metadata must remain a warning, not a hard failure, unless the same finding also violates a hard-drift rule.
- Missing optional GitHub issue export fields must not invalidate a cleanup-task recommendation.
- Fresh fixtures must prove the guard does not emit false positives for current PRD, roadmap, workflow, feature-flag, strict-scope, evidence, and source-link records.
- Cleanup eligibility under `specs/**` must never delete files or change archive state.
- External context records may be absent from normal guard execution; the guard remains based on checked-in repo artifacts only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The guard MUST evaluate exactly these v1 drift classes: stale PRD, roadmap, and workflow claims; missing required evidence; stale feature-flag status; deterministic low-value test patterns; strict-scope drift; and broken source-of-truth links.
- **FR-002**: The guard MUST use checked-in repo artifacts as its source of truth, including product requirements, roadmap, workflow ledgers, `.specify/memory`, active specs, repo knowledge index, local guard configuration, package-script declarations, and fixtures.
- **FR-003**: The guard MUST NOT use live HAL, GitHub, deployment, database, service, scheduler, or runtime state during default execution unless that state is represented by checked-in evidence.
- **FR-004**: The guard MUST emit deterministic machine-readable output and a local/CI-readable report for every run.
- **FR-005**: Each finding MUST include `drift_class`, `source_path`, `anchor`, `owner`, severity, evidence, remediation summary, stable finding ID, cleanup-task payload, and optional GitHub issue export fields.
- **FR-006**: Stable finding IDs MUST be derived from `drift_class + source_path + anchor + owner`.
- **FR-007**: Findings MUST be sorted deterministically and deduped so only one active recommendation exists for each stable finding ID.
- **FR-008**: Owner metadata MUST be derived from `docs/ai/repo-knowledge-index.json` when possible, then from roadmap or spec-family conventions; missing owner metadata MUST emit a warning.
- **FR-009**: Recommendations MUST describe one narrow cleanup action and MUST NOT request broad rewrites or unrelated documentation refreshes.
- **FR-010**: The guard MUST fail CI only for high-confidence repo-owned hard drift: broken required links, stale status pointers, strict-scope drift, or missing required evidence.
- **FR-011**: The guard MUST emit warning-level recommendations, not CI failures, for lower-confidence cleanup signals such as deterministic low-value test patterns and unknown owners.
- **FR-012**: Evidence freshness MUST be controlled by configurable guard constants based on repo-owned metadata such as `last_verified`, workflow closeout dates, status pointers, and explicit evidence markers.
- **FR-013**: The feature MUST include a checked-in fixture corpus with small synthetic fresh/stale documents and structured data plus reduced historical drift patterns.
- **FR-014**: The fixture corpus MUST cover at least one fresh case and one stale case for every supported drift class.
- **FR-015**: The guard MUST expose a focused local check command and MUST be wired into the existing shared guardrails suite without replacing the repo knowledge index check.
- **FR-016**: The guard MUST detect `specs/**` cleanup eligibility as a recommendation only and MUST never remove spec folders or bypass archive `--apply-cleanup` safe-base gating.
- **FR-017**: The spec and downstream plan MUST record fresh external-context retrieval evidence for the OpenAI Harness Engineering article, OpenAI Symphony announcement, and OpenAI Symphony SPEC, while default guard execution MUST remain repo-artifact-only.
- **FR-018**: The feature MUST remain process/tooling-only and MUST NOT add runtime product behavior, migrations, UI, API endpoints, scheduler behavior, dispatch behavior, claim/retry behavior, sandbox behavior, harness adapter behavior, live GitHub writes, live Paddock task creation, or auto-merge behavior.

### Reviewability Budget *(mandatory)*

- **Primary surface**: docs/process
- **Secondary surfaces, if any**: guard scripts, guard configuration, fixture corpus, package/guardrail wiring, tests
- **Projected reviewable LOC**: 350-450, excluding generated reports and reduced fixture data when declared in the PR review packet
- **Projected production files**: 0 runtime production files; guard/process files only
- **Projected total files**: 10-15
- **Budget result**: warning accepted
- **Split decision**: This remains one spec because all work serves one process/tooling guard and there is no runtime behavior. Split is required if planning adds runtime surfaces, live mutation, UI, scheduler integration, or more than the supported v1 drift classes.

### PR Review Packet Requirements *(mandatory)*

- PR description MUST include: what changed, why, non-goals, review order, scope budget, traceability, verification evidence, known gaps, and rollback or feature-flag notes.
- Traceability MUST map each major requirement or success criterion to changed files and verification evidence.
- Deferred work MUST name the follow-up spec or issue.

### Key Entities

- **Drift Finding**: A deterministic record of one supported drift instance, identified by drift class, source path, anchor, and owner.
- **Cleanup Recommendation**: One narrow remediation action attached to a drift finding, suitable for review and later conversion into cleanup work.
- **Paddock Cleanup-Task Payload**: The canonical task-shaped payload emitted in recommendations for future Paddock import or apply flows; v1 does not create live tasks.
- **GitHub Issue Export**: Optional issue-shaped fields that allow a recommendation to be exported later without making live GitHub writes in v1.
- **Owner Metadata**: Repo-derived ownership context used to route a recommendation to the most appropriate documentation, workflow, or spec family owner.
- **Evidence Marker**: A checked-in proof point such as `last_verified`, workflow closeout date, status pointer, explicit evidence marker, or archived provenance reference.
- **Fixture Case**: A small checked-in fresh or stale example used to prove guard behavior for one or more supported drift classes.

### Scope Boundaries

- SPEC-012A remains the owner of the repo knowledge index check.
- SPEC-012B adds a focused harness-gardening guard suite and shared guardrails wiring.
- Live task creation, issue creation, periodic scheduling, and apply-mode mutation are deferred to later explicitly approved cleanup specs.
- External OpenAI Harness Engineering and Symphony sources inform Specify/Plan context only; they are not fetched by the default guard.

### External Context Evidence

- OpenAI Harness Engineering article retrieved before Specify on 2026-06-06: `https://openai.com/index/harness-engineering/`.
- OpenAI Symphony announcement retrieved before Specify on 2026-06-06: `https://openai.com/index/open-source-codex-orchestration-symphony/`.
- OpenAI Symphony SPEC retrieved before Specify on 2026-06-06: `https://github.com/openai/symphony/blob/main/SPEC.md`.
- Retrieved-context relevance recorded for planning: repo knowledge as system of record, short maps over monolithic instructions, mechanical freshness/link/ownership checks, continuous doc gardening, orchestration safety, per-issue workspace isolation, reconciliation before dispatch, single authority for mutation, and validation profiles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Triggering each supported stale fixture produces exactly one active cleanup recommendation per stable finding ID with evidence and owner metadata or an owner warning.
- **SC-002**: Running the guard twice against the same fixture corpus produces byte-for-byte identical finding order, stable IDs, and recommendation counts.
- **SC-003**: Fresh fixtures for every supported drift class produce zero active findings.
- **SC-004**: Hard-drift fixtures fail the guard, while warning-only fixtures emit recommendations without failing the hard-drift result.
- **SC-005**: Every emitted recommendation contains a canonical cleanup-task payload and, when applicable, optional GitHub issue export fields.
- **SC-006**: The shared guardrails suite runs the harness-gardening guard while preserving the existing repo knowledge index check.
- **SC-007**: `specs/**` cleanup eligibility appears only as a recommendation and produces no file deletion or archive-state mutation.
- **SC-008**: A reviewer can trace every failing fixture to the responsible source path, anchor, owner derivation, and narrow remediation action in under five minutes.

## Assumptions

- The current repo knowledge index remains the first owner lookup source for documentation, workflow, and spec-family ownership.
- Roadmap and spec-family naming conventions are sufficient fallback owner sources when repo knowledge does not name an owner.
- The v1 fixture corpus should be small and deterministic rather than a full copy of live repository history.
- The default guard output is intended for local and CI use, not live operator mutation.
- Warning-level recommendations are still useful follow-up work even when they do not fail CI.
