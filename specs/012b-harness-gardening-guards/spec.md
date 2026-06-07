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

- Duplicate drift inputs with the same drift class, source path, anchor, and normalized `owner_key` must collapse to one active recommendation.
- Duplicate aggregation must merge evidence and warnings as sorted unique lists and compute effective severity by maximum rank, where `error` is higher than `warning`.
- Stable identity must use normalized `owner_key`; human-readable owner display metadata must remain present in findings and recommendations but must not affect the hash except through `owner_key`.
- Report summary counts must match emitted report content and derived totals.
- JSON Schema validates report shape, constants, enums, and path constraints; parent-child equality, aggregate counts, stable sorting, and duplicate aggregation invariants must be verified by fixture-backed contract tests or generator assertions.
- Missing owner metadata must remain a warning, not a hard failure, unless the same finding also violates a hard-drift rule.
- Missing optional GitHub issue export fields must not invalidate a cleanup-task recommendation.
- Fresh fixtures must prove the guard does not emit false positives for current PRD, roadmap, workflow, feature-flag, strict-scope, evidence, and source-link records.
- Cleanup eligibility under `specs/**` must never delete files or change archive state.
- External context records may be absent from normal guard execution; the guard remains based on checked-in repo artifacts only.

## Clarifications

### Session 2026-06-06 - Recommendation Schema And Outputs

- Q: Should `harness_gardening_recommendation.v1` be a required-field recommendation item nested inside a deterministic report envelope? -> A: Yes. The guard output is a deterministic finding-centric report envelope containing required `harness_gardening_recommendation.v1` items. Each item includes `schema_version`, `stable_finding_id`, `recommendation_id`, `drift_class`, `source_path`, `anchor`, `owner`, `severity`, `evidence`, `remediation_summary`, `paddock_cleanup_task`, optional `github_issue_export`, `deferred_side_effects`, and `warnings`. Deterministic JSON must not include default wall-clock timestamps.
- Q: Should the canonical Paddock cleanup-task payload be an import draft rather than an immediately executable live task create body? -> A: Yes. `paddock_cleanup_task` is a non-mutating import draft with `schema_version`, `operation: "create_task"`, `live_mutation: false`, `title`, `description`, `status: "inbox"`, `priority`, `tags`, and `metadata` containing `stable_finding_id`, `drift_class`, `source_path`, `anchor`, owner metadata, and evidence references. It must not require live `workspace_id` or `project_id`; optional workspace/project hints are allowed.
- Q: Which optional GitHub issue export fields should v1 include while guaranteeing no live GitHub mutation? -> A: If a recommendation includes `github_issue_export`, it must be an export-only create-issue draft with `export_only: true`, `live_mutation: false`, `repository`, `title`, and `body`. `repository` is the export target, not a GitHub request-body field. The `body` must summarize the stable finding ID, source path and anchor, owner or owner warning, severity, evidence, and narrow remediation action. The draft may include `labels`, `assignees`, `milestone`, `type`, and `issue_field_values` as proposed metadata only. The guard must not call GitHub APIs, invoke `gh`, provision or apply labels, assign users, set milestones, set issue types, set project field values, create Paddock tasks, or run any scheduler/apply path in v1.
- Q: What should the canonical JSON and local/CI report paths be? -> A: Contract schemas live under `specs/012b-harness-gardening-guards/contracts/`. Generated run reports default to `specs/012b-harness-gardening-guards/.process/harness-gardening-report.json` and `specs/012b-harness-gardening-guards/.process/harness-gardening-report.md`; automation may request JSON on stdout with `--json`.
- Q: How should stable finding IDs and duplicate suppression be normalized? -> A: Compute `stable_finding_id` from a normalized tuple of `drift_class + source_path + anchor + owner_key`, represented as a stable hash id such as `hg_<sha256-prefix>` while retaining the readable tuple fields. `recommendation_id` equals `stable_finding_id`. Exact normalized tuple matches dedupe to one active recommendation, with evidence aggregated deterministically.

### Session 2026-06-06 - Drift Taxonomy And Failure Policy

- Q: What is the closed hard-failure vs warning severity matrix for SPEC-012B v1? -> A: CI fails only for high-confidence repo-owned hard drift: broken required repo-owned links or paths, stale status pointers with contradictory repo-owned evidence, missing required evidence, strict-scope drift, and required unreadable or malformed guard inputs. CI warns for freshness-only staleness, unknown owners, deterministic low-value-test hints, optional/external/wiki links, and `specs/**` cleanup eligibility.
- Q: Which exact repo-owned signals should hard-drift detectors rely on? -> A: Hard detectors rely only on explicit repo-owned signals: required/repo-owned missing links or paths, missing required index entries or fields, roadmap/workflow/autopilot status disagreement, missing required evidence markers, strict-scope forbidden surfaces, and invalid required guard fixtures or artifacts. Broad keyword scans and live HAL/GitHub/Paddock state are not hard-drift inputs.
- Q: How should stale feature-flag status be classified? -> A: Feature-flag drift is hard only for safety-contract contradictions: a roadmap, spec, or runbook requires a flag absent from `FEATURE_FLAG_REGISTRY`; a flag has an unsafe default; enablement requirements contradict each other; or completed implementation evidence contradicts documented flag state. Stale `last_verified`, owner, risk, or evidence metadata without contradiction is warning-only.
- Q: Which lower-confidence cleanup signals should v1 emit as warning-only recommendations? -> A: Warning-only cleanup signals include no-assertion tests, snapshot-only or static fixture tests lacking owner/evidence assertions, duplicate stale fixture cases with the same finding tuple, archive-eligible `specs/**` folders blocked by cleanup gates, freshness threshold warnings, and unknown owners. Broad quality scoring, coverage scoring, semantic test judgment, and automatic source cleanup are excluded.
- Q: What sanitized error categories should unreadable or malformed repo artifacts and fixtures use, and when should they fail CI? -> A: Use the closed `harness_gardening_error_code.v1` enum: `repo_artifact_missing`, `repo_artifact_unreadable`, `repo_artifact_malformed_json`, `repo_artifact_malformed_markdown`, `repo_artifact_schema_invalid`, `fixture_missing`, `fixture_malformed_json`, `fixture_expectation_mismatch`, `fixture_unsafe_path`, `artifact_unsupported_format`, and `artifact_too_large`. Required repo artifacts, required fixtures, required detector inputs, fixture expectation mismatches, and `fixture_unsafe_path` fail CI. Optional detector inputs warn with `detector_status: "skipped_detector"` and the underlying error code. Error records expose only repo-relative `source_path`, `detector`, `code`, bounded sanitized `message`, `required`, and `redacted`; they must not include raw contents, absolute host paths, stack traces, environment values, tokens, credentials, secrets, secret-shaped values, or matched substrings.

### Session 2026-06-06 - Evidence Freshness And Owner Metadata

- Q: What default freshness thresholds should v1 use when `freshness.stale_after_days` is absent? -> A: Explicit `freshness.stale_after_days` always overrides defaults. When absent, v1 uses repo-kind defaults evaluated against explicit `--as-of YYYY-MM-DD`: `status-pointer` = 2 days; active/current workflow evidence = 7 days; `execution-ledger`, `qa-evidence`, `contract`, `operator-tooling`, and `rollback-runbook` = 30 days; `durable-intent` = 45 days. Active/current workflow evidence means the active spec workflow, active process workflow, active spec directory, or any workflow/status artifact declaring the current in-progress spec. Freshness-only staleness emits warning-level recommendations only and must not fail CI unless the same finding also has hard drift such as roadmap/workflow/autopilot status contradiction or missing required evidence. Fixture and CI tests must pass `--as-of YYYY-MM-DD`; hidden wall-clock defaults must not drive deterministic JSON report output.
- Q: Which status pointers and closeout fields are authoritative for hard stale-status drift? -> A: Compare active `.process/autopilot-state.json`, root `docs/ai/specs/autopilot-state.json`, roadmap status row, and workflow phase tables. Hard-fail only contradictory repo-owned pointers or missing required closeout markers. Treat `.process/autopilot-state.json` as current feature execution state and root `docs/ai/specs/autopilot-state.json` as durable repo pointer or last closeout state.
- Q: What exact owner derivation order should v1 use? -> A: Derive owner from exact repo-knowledge-index path, longest indexed directory prefix, link-target/source-path owner where applicable, related SPEC family, roadmap/path-class convention, then `owner: unknown` as warning fallback. Each recommendation stores normalized `owner_key`, `owner_source`, and owner confidence.
- Q: How should stale or missing owner metadata affect CI? -> A: Missing or empty `owner` in a required repo-knowledge-index entry is a hard artifact error. A drift finding whose owner cannot be derived emits `owner: unknown` and a warning only. If the same finding has hard drift, CI fails for the hard drift, not for owner unknown.
- Q: Which explicit evidence markers should v1 recognize for freshness and closeout checks? -> A: Recognize only closed repo-owned markers: `last_verified`, `updated_at`, roadmap status rows, workflow phase tables, closeout fields (`pr`, `merge_commit`, `merged_at`, UAT run id, source cleanup), archive sweep cleanup fields, and verification evidence rows. Missing required markers for `Complete` or `UAT Pending` claims hard-fails; marker age or owner freshness warns unless contradictory.

### Session 2026-06-06 - Fixtures, Dedupe, And Historical Patterns

- Q: What fixture directory layout should SPEC-012B standardize? -> A: Use `scripts/spec-012b/fixtures/{fresh,hard,warning,dedupe,errors}/<drift-class>/<case>/` with a `fixture.json`, optional `repo/` mini-tree, and expected report fields. Do not extend SPEC-012A fixtures or depend on the live repo as the primary fixture oracle.
- Q: Which reduced historical drift patterns should seed v1? -> A: Include one minimal fixture for each supported class: SPEC-012A-style stale status pointer, SPEC-012A-style broken required link, missing closeout evidence, stale feature-flag contradiction, strict-scope drift, deterministic low-value duplicate/no-assertion test warning, and `specs/**` cleanup eligibility warning. Use reduced synthetic or historical-shape examples, not full historical repo snapshots.
- Q: How should the stable finding tuple be normalized? -> A: Normalize `drift_class` as a closed lower-snake enum, `source_path` as repo-relative POSIX path, `anchor` as a detector-stable markdown heading, JSON pointer, workflow phase, or equivalent stable locator, and `owner_key` as the normalized owner. Hash the tuple as `hg_<sha256 first 20 hex>` while retaining all readable tuple fields in the report.
- Q: What deterministic sort and duplicate suppression rules should v1 use? -> A: Group by stable ID first, merge evidence and warnings into sorted unique lists, set effective severity to max rank `error > warning`, and emit findings sorted by severity, drift class, source path, anchor, owner key, then stable ID.
- Q: Should duplicate suppression persist across runs in v1? -> A: No. Dedupe applies only within the current report. Stable IDs enable future explicit apply-mode persistence, but v1 writes only deterministic JSON/Markdown reports and creates no live Paddock, GitHub, or persistent dedupe ledger state.

### Session 2026-06-06 - Scope Control And Archive Cleanup Boundary

- Q: Should SPEC-012B remain strictly process/tooling-only, with no runtime/control-plane behavior? -> A: Yes. SPEC-012B is limited to guard scripts, fixtures, schema/templates, docs/checklists, package/guardrail wiring, and tests. Plan and tasks must exclude runtime product behavior, migrations, UI/API endpoints, scheduler, dispatch, claim/retry, sandbox, harness adapter, live GitHub writes, live Paddock task creation, and auto-merge.
- Q: How should `specs/**` cleanup eligibility be represented? -> A: Cleanup eligibility is a warning-level recommendation only, with archive evidence and gate blockers. SPEC-012B must never delete source folders, move specs, mutate archive state, or bypass the archive extension `--apply-cleanup` safe-base gate.
- Q: How should SPEC-012B integrate with guardrails without replacing SPEC-012A? -> A: Add a focused command and separate guardrails suite for harness-gardening drift. Keep `pnpm knowledge:index:check` and `pnpm guardrails -- --suite repo-knowledge-index` intact; SPEC-012B may be added to `pnpm guardrails` as an additional suite, not a replacement.
- Q: Should external OpenAI Harness/Symphony sources affect guard execution? -> A: No. Specify and Plan must record current retrieval evidence and use those sources for vocabulary and safety posture only. Default guard execution is offline and repo-artifact-only, with no network dependency or live external-source reads.
- Q: What verification closes the scope-control risk? -> A: Use fixture-backed tests, static forbidden-surface checks, and command verification. Browser/UI/e2e/UAT validation is not required unless later implementation widens into runtime or UI behavior, which this spec forbids.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The guard MUST evaluate exactly these v1 drift classes: stale PRD, roadmap, and workflow claims; missing required evidence; stale feature-flag status; deterministic low-value test patterns; strict-scope drift; and broken source-of-truth links.
- **FR-002**: The guard MUST use checked-in repo artifacts as its source of truth, including product requirements, roadmap, workflow ledgers, `.specify/memory`, active specs, repo knowledge index, local guard configuration, package-script declarations, and fixtures.
- **FR-003**: The guard MUST NOT use live HAL, GitHub, deployment, database, service, scheduler, or runtime state during default execution unless that state is represented by checked-in evidence.
- **FR-004**: The guard MUST emit a deterministic finding-centric machine-readable report envelope and a local/CI-readable report for every run.
- **FR-005**: Each `harness_gardening_recommendation.v1` item MUST include `schema_version`, `stable_finding_id`, `recommendation_id`, `drift_class`, `source_path`, `anchor`, `owner`, severity, evidence, remediation summary, a non-mutating `paddock_cleanup_task` import draft, optional export-only `github_issue_export`, deferred side effects, and warnings. `recommendation_id` MUST equal `stable_finding_id`, and copied recommendation fields MUST match the parent finding.
- **FR-006**: Stable finding IDs MUST be derived from normalized `drift_class + source_path + anchor + owner_key`, represented as `hg_<sha256 first 20 hex>`.
- **FR-007**: Findings MUST be sorted deterministically by severity, drift class, source path, anchor, owner key, then stable ID, and deduped so only one active recommendation exists for each stable finding ID.
- **FR-008**: Owner metadata MUST include `name`, normalized `owner_key`, `owner_source`, and `confidence`; it MUST be derived from `docs/ai/repo-knowledge-index.json` exact path, then longest indexed directory prefix, link target/source path, related SPEC family, roadmap/path-class convention, then `unknown` with a warning fallback. Missing or empty owner metadata in a required repo-knowledge-index entry MUST be a hard artifact error.
- **FR-009**: Recommendations MUST describe one narrow cleanup action and MUST NOT request broad rewrites or unrelated documentation refreshes.
- **FR-010**: The guard MUST fail CI only for high-confidence repo-owned hard drift: broken required links, stale status pointers, strict-scope drift, or missing required evidence.
- **FR-011**: The guard MUST emit warning-level recommendations, not CI failures, for lower-confidence cleanup signals such as deterministic low-value test patterns and unknown owners.
- **FR-012**: Evidence freshness MUST be controlled by configurable guard constants based on repo-owned metadata such as `last_verified`, workflow closeout dates, status pointers, and explicit evidence markers.
- **FR-013**: The feature MUST include a checked-in fixture corpus with small synthetic fresh/stale documents and structured data plus reduced historical drift patterns.
- **FR-014**: The fixture corpus MUST cover at least one fresh case and one stale case for every supported drift class.
- **FR-015**: The guard MUST expose exactly one canonical focused local package command, `pnpm spec:012b:harness-gardening`, and MUST wire it into the existing shared guardrails runner as a separate `harness-gardening` suite. Full `pnpm guardrails` MUST include the new suite alongside existing suites, selected `pnpm guardrails -- --suite harness-gardening` MUST run only the focused suite, and unknown-suite diagnostics MUST list `harness-gardening` while preserving existing suite names. This MUST NOT replace, rename, inline, or add a harness-gardening dependency to `pnpm knowledge:index:check` or `pnpm guardrails -- --suite repo-knowledge-index`.
- **FR-016**: The guard MUST detect `specs/**` cleanup eligibility as a recommendation only and MUST never remove spec folders or bypass archive `--apply-cleanup` safe-base gating.
- **FR-017**: The spec and downstream plan MUST record fresh external-context retrieval evidence for the OpenAI Harness Engineering article, OpenAI Symphony announcement, and OpenAI Symphony SPEC, while default guard execution MUST remain repo-artifact-only.
- **FR-018**: The feature MUST remain process/tooling-only and MUST NOT add runtime product behavior, migrations, UI, API endpoints, scheduler behavior, dispatch behavior, claim/retry behavior, sandbox behavior, harness adapter behavior, live GitHub writes, live Paddock task creation, or auto-merge behavior.
- **FR-019**: Guard artifact-read, parse, schema, format, path, size, and fixture expectation failures MUST use the closed `harness_gardening_error_code.v1` enum defined in Clarifications.
- **FR-020**: Guard error records MUST expose only repo-relative source path, detector, closed code, bounded sanitized message, required flag, and redaction flag. Reports MUST NOT expose raw artifact contents, absolute host paths, stack traces, environment values, tokens, credentials, secrets, secret-shaped values, or matched secret substrings.
- **FR-021**: Required repo artifacts, required fixtures, required detector inputs, fixture expectation mismatches, and unsafe fixture paths MUST fail CI; optional detector inputs MUST warn with `detector_status: "skipped_detector"` and MUST NOT fail CI unless another hard-drift finding is present.
- **FR-022**: Duplicate raw drift inputs MUST group by `stable_finding_id`, merge evidence and warnings into sorted unique lists, and set effective severity to the maximum duplicate severity using rank `error > warning`.
- **FR-023**: Report summaries MUST satisfy these invariants: `finding_count` equals `findings.length`; `recommendation_count` equals the number of emitted recommendations; `error_count` equals `errors.length`; `warning_count` equals warning-severity findings plus warning records plus optional-input warning statuses; and `hard_failure_count` equals error-severity findings plus required guard errors.
- **FR-024**: Fixture-backed contract tests or generator assertions MUST verify cross-field invariants that JSON Schema cannot fully enforce, including summary counts, recommendation-parent field equality, stable sort order, dedupe grouping, and `recommendation_id == stable_finding_id`.
- **FR-025**: Source-of-truth link checks MUST classify each checked target before severity is assigned: broken `required: true` and `repo_owned: true` links are hard drift, while optional links, external URLs, and informational wiki-style links are warning-only or informational unless another hard-drift rule applies.
- **FR-026**: Docs-integrity recommendations for source-link or evidence drift MUST identify the exact repo-relative source path, anchor, affected link target or evidence marker, owner metadata or owner warning, and one narrow edit to apply.
- **FR-027**: SPEC-012B artifacts MUST remain discoverable from checked-in repo maps by indexing the design concept, workflow ledger, generated spec folder, and concise root `AGENTS.md` pointers without requiring hidden operator context or unimplemented command claims.
- **FR-028**: The focused command MUST define a stable command matrix: fixture execution with `--fixtures scripts/spec-012b/fixtures`, deterministic stdout JSON with `--json`, default local report writes to `specs/012b-harness-gardening-guards/.process/harness-gardening-report.json` and `specs/012b-harness-gardening-guards/.process/harness-gardening-report.md`, and explicit `--as-of YYYY-MM-DD` freshness input for fixture and CI deterministic runs.
- **FR-029**: Guarded repo artifact reads MUST classify an input as `artifact_too_large` before parsing when an individual guarded repo artifact exceeds `1,048,576` bytes or an individual fixture input file, including `fixture.json` and files under that fixture case's `repo/` mini-tree, exceeds `262,144` bytes. Required oversized inputs MUST fail CI; optional oversized detector inputs MUST warn with `detector_status: "skipped_detector"` unless another hard-drift finding is present. Oversize diagnostics MUST use the existing guard error fields and may include only the repo-relative source path, detector, `artifact_too_large` code, required flag, configured byte limit, observed byte count, bounded sanitized message, and redaction flag.
- **FR-030**: Guard error `redacted` MUST be `true` when sanitization removed, replaced, or withheld raw artifact content, raw parser or filesystem output, absolute host paths, stack traces, environment values, tokens, credentials, secrets, secret-shaped values, matched substrings, or any untrusted value that could contain forbidden content. `redacted` MUST be `false` only when the emitted message is built entirely from safe constant templates and allowed bounded fields, and no forbidden content was removed or withheld. When uncertain, the guard MUST set `redacted: true`.
- **FR-031**: Fixture-declared input paths MUST be normalized and resolved against the fixture case root before any read. Simulated repo reads MUST remain inside that case's `repo/` mini-tree. Absolute paths, parent traversal, Windows separators, symlink traversal outside the fixture mini-tree, or any post-normalization containment escape MUST emit `fixture_unsafe_path` and fail CI before file content is read.
- **FR-032**: Scope-control verification MUST include a deterministic static guard that evaluates the current changed-file set before implementation closeout. The guard MUST fail when any changed path is outside the SPEC-012B allowed surfaces: `specs/012b-harness-gardening-guards/**`, `scripts/spec-012b/**`, `package.json`, `pnpm-lock.yaml`, `scripts/check-guardrails.mjs`, `docs/ai/specs/.process/SPEC-012B-workflow.md`, `docs/ai/specs/.process/autopilot-state.json`, `docs/ai/repo-knowledge-index.json`, `AGENTS.md`, and explicitly documented SPEC-012B-owned tests or fixtures. The guard MUST fail on changed paths under runtime/control-plane surfaces, including `src/**`, migrations or rollback SQL, UI/API routes, scheduler/dispatch/claim/retry/sandbox/harness-adapter modules, live GitHub or Paddock mutation wiring, auto-merge wiring, and automatic `specs/**` deletion or archive-apply paths, unless the path is an explicitly documented process-only test or guard fixture owned by SPEC-012B. The guard MUST scan non-doc, non-fixture added lines for forbidden live-mutation/runtime tokens, including GitHub mutation APIs or `gh` mutation commands, Paddock live task creation or apply calls, scheduler/dispatch/claim/retry/sandbox/harness-adapter execution tokens, auto-merge tokens, runtime feature-flag/env behavior, direct task insert/update mutation, network fetches for OpenAI Harness or Symphony sources, and archive cleanup apply/delete/move operations. Docs/process files may mention these tokens only as non-goals, forbidden examples, or review evidence. The guard MUST expose self-test fixture mode and current-diff mode and report changed-file and scanned-entry counts.

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

- **Drift Finding**: A deterministic record of one supported drift instance, identified by drift class, source path, anchor, and normalized owner key.
- **Cleanup Recommendation**: One narrow remediation action attached to a drift finding, suitable for review and later conversion into cleanup work.
- **Paddock Cleanup-Task Payload**: The canonical task-shaped payload emitted in recommendations for future Paddock import or apply flows; v1 does not create live tasks.
- **GitHub Issue Export**: Optional export-only create-issue draft fields attached to a cleanup recommendation for later manual or explicitly approved apply-mode use. The draft includes `export_only: true`, `live_mutation: false`, `repository`, `title`, and `body`, and may include proposed `labels`, `assignees`, `milestone`, `type`, and `issue_field_values`; v1 never applies these fields or performs live GitHub writes.
- **Owner Metadata**: Repo-derived ownership context used to route a recommendation to the most appropriate documentation, workflow, or spec family owner. Owner derivation records `owner`, normalized `owner_key`, `owner_source`, and confidence.
- **Evidence Marker**: A checked-in proof point from the closed marker set: `last_verified`, `updated_at`, roadmap status rows, workflow phase tables, closeout fields, archive sweep cleanup fields, and verification evidence rows.
- **Source-of-Truth Link**: A checked-in link target with source path, anchor, required flag, repo-owned flag, and target classification used to decide whether broken-link drift is a CI hard failure or warning-only recommendation.
- **Fixture Case**: A small checked-in fresh or stale example used to prove guard behavior for one or more supported drift classes.

### Scope Boundaries

- SPEC-012A remains the owner of the repo knowledge index check; `pnpm knowledge:index:check` remains standalone and must not depend on the SPEC-012B harness-gardening command.
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
- **SC-005**: Every emitted recommendation contains a canonical non-mutating cleanup-task payload and, when applicable, optional GitHub issue export fields with `export_only: true` and `live_mutation: false`.
- **SC-006**: Command-level evidence proves `pnpm spec:012b:harness-gardening -- --fixtures scripts/spec-012b/fixtures --as-of YYYY-MM-DD`, `pnpm guardrails -- --suite harness-gardening`, full `pnpm guardrails`, `pnpm knowledge:index:check`, and `pnpm guardrails -- --suite repo-knowledge-index` preserve separate SPEC-012B and SPEC-012A guard behavior.
- **SC-007**: `specs/**` cleanup eligibility appears only as a recommendation and produces no file deletion or archive-state mutation.
- **SC-008**: A reviewer can trace every failing fixture to the responsible source path, anchor, owner derivation, and narrow remediation action in under five minutes.
- **SC-009**: Fixture coverage proves each sanitized error code is emitted deterministically, required inputs fail CI, optional detector inputs warn with `skipped_detector`, and JSON/Markdown reports contain no forbidden raw content, absolute paths, stack traces, environment values, tokens, credentials, secrets, or matched substrings.
- **SC-010**: Fixture-backed contract checks prove stable ID identity uses `owner_key`, duplicate inputs aggregate deterministically, recommendation fields mirror their parent finding, summary counts match report contents, and sorted JSON output remains byte-for-byte stable.
- **SC-011**: A reviewer can find the SPEC-012B design concept, workflow ledger, generated spec folder, and docs-integrity checklist through `AGENTS.md` and `docs/ai/repo-knowledge-index.json`, then verify PRD, roadmap, workflow, source-link, and evidence agreement without live-state access.
- **SC-012**: Scope-control closeout evidence proves the static guard self-test passes and current-diff mode reports zero failures with changed-file and scanned-entry counts, while allowing docs/process non-goal references and requiring no live HAL, GitHub, Paddock, network, browser, UI, e2e, or UAT validation.

## Assumptions

- The current repo knowledge index remains the first owner lookup source for documentation, workflow, and spec-family ownership.
- Roadmap and spec-family naming conventions are sufficient fallback owner sources when repo knowledge does not name an owner.
- The v1 fixture corpus should be small and deterministic rather than a full copy of live repository history.
- The default guard output is intended for local and CI use, not live operator mutation.
- Warning-level recommendations are still useful follow-up work even when they do not fail CI.
