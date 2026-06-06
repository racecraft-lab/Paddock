# Feature Specification: Product Line B Onboarding Smoke

**Feature Branch**: `010b-product-line-b-smoke`
**Created**: 2026-06-05
**Status**: Draft
**Input**: User description: "Create the smallest reviewable Product Line B onboarding smoke that proves disabled-by-default seeding, explicit enablement, one synthetic Paddock issue smoke, clean disablement, and Product Line A isolation without touching active harness-adapter work."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preflight Without Mutation (Priority: P1)

As an operator, I can preflight Product Line B before any write and receive a clear no-mutation proof so I know the target is ready and Product Line A will not be disturbed.

**Why this priority**: This is the safety gate for the entire smoke path. The operator must be able to stop before any state change if residue, ownership conflicts, or unsafe retained identities are detected.

**Independent Test**: Can be fully tested by running the Product Line B preflight on a target with existing Product Line A state, reviewing the before/after proof, and confirming the result records that no Product Line B writes occurred.

**Acceptance Scenarios**:

1. **Given** a target with Product Line A active and Product Line B absent or disabled, **When** the operator runs preflight, **Then** the result reports readiness, no target mutation, and the exact baseline used for later isolation proof.
2. **Given** retained FocusEngine or OpenClaw identities are present but not explicitly assigned to Product Line B, **When** preflight inspects the target, **Then** those identities are reported as retained inventory and are not treated as Product Line B resources.

---

### User Story 2 - Seed Disabled Product Line B (Priority: P1)

As an operator, I can seed Product Line B disabled by default and inspect its isolated workspace, project, and agent assignment shape before any smoke is enabled.

**Why this priority**: The feature must prove a second product line can exist safely before it processes any issue-shaped work.

**Independent Test**: Can be fully tested by applying the Product Line B seed after a passing preflight, inspecting the created Product Line B shape, and confirming it is disabled until the operator explicitly enables it.

**Acceptance Scenarios**:

1. **Given** preflight passed, **When** the operator seeds Product Line B, **Then** the target contains `product-line-b`, display name `Product Line B`, and agent prefix `plb-platform`.
2. **Given** Product Line B has just been seeded, **When** the operator inspects product-line status, **Then** Product Line B is disabled, Product Line A remains enabled as before, and no smoke work is eligible to run for Product Line B.

---

### User Story 3 - Enable, Smoke, And Disable (Priority: P2)

As an operator, I can explicitly enable Product Line B for one synthetic Paddock issue smoke, verify the issue-shaped path stays scoped to Product Line B, and disable Product Line B cleanly afterward.

**Why this priority**: This is the smallest behavior proof that Product Line B can move through the existing pilot path without requiring a live external issue write or new runtime authority.

**Independent Test**: Can be fully tested by enabling Product Line B, processing one synthetic issue using `racecraft-lab/Paddock` metadata, recording the Product Line B scoped evidence, disabling Product Line B, and verifying no further Product Line B smoke work can run.

**Acceptance Scenarios**:

1. **Given** Product Line B is seeded and disabled, **When** the operator explicitly enables it for smoke, **Then** exactly one Product Line B synthetic issue is eligible for the smoke path.
2. **Given** the synthetic issue uses `racecraft-lab/Paddock` metadata, **When** the smoke runs, **Then** required evidence is produced without requiring a live GitHub issue write.
3. **Given** the smoke evidence has been recorded, **When** the operator disables Product Line B, **Then** Product Line B is no longer eligible for smoke work and Product Line A behavior remains unchanged.

---

### User Story 4 - Prove Product Line A Isolation (Priority: P2)

As a maintainer, I can review evidence proving Product Line A records, metrics, tasks, and sync ownership were not changed by Product Line B onboarding or smoke activity.

**Why this priority**: The feature exists to prove two-product-line isolation. Review is not complete unless Product Line A non-interference is visible and testable.

**Independent Test**: Can be fully tested by comparing Product Line A baseline evidence from preflight with evidence after seed, smoke, disablement, and cleanup.

**Acceptance Scenarios**:

1. **Given** Product Line A baseline evidence exists, **When** Product Line B seed and smoke complete, **Then** Product Line A ownership and activity evidence matches the baseline except for explicitly read-only inspection timestamps or logs.
2. **Given** a Product Line B operation would change Product Line A ownership, task state, sync ownership, or metrics, **When** the operation is evaluated, **Then** the workflow stops and reports the Product Line A isolation violation.

---

### User Story 5 - Preserve Evidence For Future Gardening (Priority: P3)

As a future harness-gardening implementer, I can use the Product Line B evidence packet as real two-product-line input without replaying hidden setup assumptions.

**Why this priority**: SPEC-012B needs durable evidence from a real second product line. This story keeps the smoke small while making the output reusable.

**Independent Test**: Can be fully tested by reviewing the evidence packet and confirming it contains preflight, seed, enablement, synthetic issue smoke, disablement, cleanup, Product Line A isolation, timing, and scope-boundary entries.

**Acceptance Scenarios**:

1. **Given** the smoke has completed, **When** a maintainer opens the evidence packet, **Then** each smoke phase is identifiable, timestamped or operator-recorded, and tied to Product Line B identity.
2. **Given** a future implementer needs two-product-line drift or cleanup input, **When** they review the packet, **Then** the packet states which assumptions were proven, which follow-up behavior remains out of scope, and which active adapter files were intentionally avoided.

### Edge Cases

- Product Line B preflight detects existing `product-line-b` residue or conflicting `plb-platform` assignments; the workflow stops before mutation and reports the residue.
- Retained FocusEngine or OpenClaw identities are present; they remain retained inventory and are not reused unless a later spec explicitly generalizes and assigns them.
- Product Line B seed or smoke would change Product Line A ownership, task state, sync ownership, or metrics; the workflow stops and reports the isolation violation.
- A live GitHub write is unavailable or undesired; the required smoke remains valid with synthetic `racecraft-lab/Paddock` metadata.
- Product Line B remains enabled after smoke or cleanup fails; the workflow reports incomplete disablement and does not claim closeout.
- The implementation would require scheduler, runner, sandbox, harness-adapter, or auto-merge behavior; that work is rejected as out of scope for this spec.
- The operator cannot complete the manual smoke checklist in under one operator-hour; timing evidence records the miss and the PR review packet explains the cause.

## Clarifications

### Session 2026-06-05 - Config And Lifecycle

- Q: What exact Product Line B config path and base fields are canonical? -> A: Product Line B uses `docs/ai/product-lines/product-line-b.yaml`; `docs/ai/product-lines/paddock.yaml` remains unchanged. The config uses `schema_version: product-line-seed-v1`, `product_line.slug: product-line-b`, `product_line.display_name: Product Line B`, `product_line.agent_prefix: plb-platform`, `github.full_name: racecraft-lab/Paddock`, and the existing Paddock workflow contract family/path/slugs unless Plan proves a narrower fixture is required.
- Q: Should Product Line B copy Product Line A's GitHub sync-owner settings? -> A: No. Product Line B may declare `racecraft-lab/Paddock` repo metadata for synthetic issue shape and workflow-contract validation, but Product Line B department rows must keep `github_sync_enabled: false` and `is_repo_sync_owner: false` unless a later spec explicitly owns shared-repo sync behavior.
- Q: How should disabled-by-default and final-disabled state be represented? -> A: Product Line B lifecycle state uses the existing workspace disabled field (`workspaces.disabled_at`) and workspace `feature_flags`. Seed/apply must leave the Product Line B workspace disabled. Smoke enablement may clear only the Product Line B workspace disabled state and enable only smoke-required Product Line B workspace flags. Clean disablement must restore a non-null disabled state and clear or explicitly disable Product Line B smoke-owned flags. `disabled_at` alone is not treated as a universal access guard; disablement proof must also assert no active sync, dispatch, or smoke eligibility.
- Q: Should `seed:product-line` gain new `enable` or `disable` modes? -> A: No. `seed:product-line` remains limited to `preflight`, `apply`, and `verify`. Product Line B `apply` seeds reviewed config-owned disabled state; `verify` is read-only and proves expected state. Explicit enablement for the single smoke and clean disablement afterward are operator smoke lifecycle actions with structured evidence, not new seeder modes.
- Q: What counts as clean disablement for closeout? -> A: Product Line B workspace `disabled_at IS NOT NULL`; Product Line B smoke, pilot, sync, and dispatch flags are absent or false; no Product Line B repo sync-owner rows exist; no Product Line B smoke work remains eligible; `seed:product-line --mode verify` passes against `product-line-b.yaml`; and Product Line A baseline hashes/counts remain unchanged except permitted read-only inspection evidence.

### Session 2026-06-05 - Synthetic Smoke And Evidence

- Q: What exact synthetic Product Line B smoke issue shape is required? -> A: Required synthetic smoke uses a local `spec-010b.synthetic_issue.v1` fixture/envelope with a `PilotIssueCandidate` payload, title prefix `[mc-pilot][product-line-b] SPEC-010B synthetic smoke <run-id>`, repo `racecraft-lab/Paddock`, a positive run-scoped issue number, already-proven pilot labels `pd:inbox`, `priority:medium`, and `area:dev`, plus Product Line B identity in evidence/task metadata. Do not require new GitHub label provisioning for Product Line B identity.
- Q: Which already-proven pilot subset is required? -> A: Candidate eligibility, one root-task proof, pilot auto-route hold, and side-effect absence are required. Optional fixture-only terminal or non-remediation triage evidence may be added during Plan if it stays file-disjoint and does not add downstream remediation/owner workflows. ACTIONABLE_REMEDIATION, scheduler claims, retry, runner, sandbox, adapter, and owner-merge paths are out of scope.
- Q: What structured evidence packet closes out the smoke? -> A: Use `spec-010b.smoke_evidence.v1` with `run_id`, product line slug, commit/runtime identifiers, phase statuses for preflight/apply/verify/enable/synthetic issue/pilot subset/disable/cleanup/isolation/scope/timing, command/API/SQL evidence references, seed snapshot hashes, Product Line A before/after hashes, side-effect counts, cleanup counters, optional live issue status, and redaction proof.
- Q: What cleanup proof must be zero or explicitly retained after disablement? -> A: Active SPEC-010B smoke residue must be zero while the disabled Product Line B seed/config state is retained. Required proof includes non-null Product Line B `disabled_at`, absent or false smoke-owned flags, zero Product Line B projects with `github_sync_enabled=1` or `is_repo_sync_owner=1`, no eligible Product Line B smoke work, zero unintended side-effect rows tied to the synthetic task, Product Line A snapshot parity, and explicit retention rationale for any evidence rows.
- Q: If optional HAL live GitHub issue evidence is run, what credential/token/permission and mutation boundary is allowed? -> A: Optional HAL live GitHub evidence is manual UAT only. It requires explicit operator approval, the existing live-mutation opt-in path, and an operator-provided GitHub credential with permission to read open issues and create one issue in `racecraft-lab/Paddock`. The allowed live mutation is limited to finding/reusing one safe open Product Line B smoke issue or creating exactly one Product Line B synthetic issue, with required title/body/labels only at creation time. The smoke must not automatically repair labels, comment, close, delete, create PRs, enable repo sync ownership, mutate Product Line A sync state, or perform any other GitHub write. Evidence must record only cleanup-safe metadata such as issue URL/number, `token_set` booleans, stable error codes, counts, and timestamps. It must not record token values, authorization headers, raw GitHub responses, API keys, credentials, or matched secret substrings. Missing credentials, insufficient permissions, or operator refusal records optional live GitHub evidence as skipped with `mutation_status: not_mutated` and does not fail the required synthetic smoke.

### Session 2026-06-05 - Isolation Assertions

- Q: What exact SQL/hash surface proves Product Line A is unaffected? -> A: Compare Product Line A-scoped hashes before Product Line B writes and after cleanup for Product Line A workspace identity, projects, assignments, workflow templates, governance defaults, tasks/evidence/read-model rows, GitHub sync/lifecycle rows, counters, and non-owned flags. Do not compare only whole-database snapshots or counts because legitimate Product Line B rows are expected.
- Q: Which API routes prove Product Line A unaffected and Product Line B independently inspectable? -> A: Use existing scoped read routes: `/api/workspaces/:id`, `/api/projects`, `/api/tasks`, `/api/agents`, `/api/github/sync`, and `/api/status?action=dashboard` with explicit Product Line A and Product Line B `workspace_id` values, plus facility and invalid-scope negative cases. Do not add a dedicated product-line isolation API unless Plan proves an existing route cannot express required evidence.
- Q: Should disabled Product Line B appear in the normal dashboard switcher after seed or final disable? -> A: No. The normal dashboard Product Line switcher remains active/eligible Product Line only. Product Line B may appear in normal switcher/dashboard scope only during the explicit smoke enablement window. After seed/apply disabled state and after final clean disablement, Product Line B must remain inspectable through `seed:product-line --mode verify`, SQL/API/status evidence, and the smoke evidence packet, but it must not be selectable in the normal dashboard switcher. SPEC-010B must not add an include-disabled preview mode or make disabled Product Line B selectable; absence from the normal switcher is supporting disablement evidence, not a substitute for SQL/API/eligibility proof.
- Q: Which dashboard assertions prove scoped metrics? -> A: Dashboard evidence must prove active product-line scope is passed to `/api/status?action=dashboard`, then assert Metric Cards, Task Flow, Task Pipeline, and triage totals reflect Product Line A or Product Line B scope instead of facility/global totals. Do not add a new product-line metrics widget.
- Q: What shared facility-agent reuse rule should Product Line B enforce? -> A: Facility/global agents may be visible as read-only support in Product Line B-scoped agent views, but Product Line B tasks and assignments must use only explicit `plb-platform-*` assignments. SPEC-010B must not create shared-agent assignments or mutate shared facility task ownership.

### Session 2026-06-05 - Agent Substrate And SPEC-014C Parallel Safety

- Q: Should Product Line B smoke distinguish logical Product Line B agents from harness adapter manifest assignments? -> A: Yes. Product Line B seeds and assigns logical product-line agents named from the `plb-platform-*` prefix. Harness manifest IDs such as `paddock_owned_sandbox_fake` are runtime substrate identifiers only. SPEC-010B may cite them as selected-substrate or read-only runtime-inventory evidence when existing APIs support it, but MUST NOT use manifest IDs as Product Line B agent identity, assignment names, or ownership markers. If existing runtime-inventory APIs cannot express this without new adapter work, SPEC-010B records the substrate evidence as skipped or out of scope instead of expanding into harness-adapter behavior.
- Q: Which retained FocusEngine/OpenClaw state blocks preflight? -> A: Preflight blocks only explicit Product Line B conflicts, `plb-platform-*` conflicts, repo-sync ownership, active project/task/sync ownership, or explicit Product Line B assignment. Retained hidden/offline FocusEngine/OpenClaw identities are non-blocking inventory unless explicitly assigned to Product Line B. SPEC-010B reports them but does not clean them up automatically.
- Q: Should SPEC-010B require a full `eligible` runtime-inventory state for the smoke? -> A: No. Runtime inventory is optional read-only evidence for SPEC-010B. The required smoke may cite existing `visible`, `unassigned`, `assigned`, `blocked`, or `eligible` runtime-inventory evidence when available, but closeout must not depend on producing `eligible`, changing eligibility rules, or editing adapter/runtime-inventory files. Any Product Line B runtime-inventory assertion must be limited to read-only assignment/scope evidence and must stop if it overlaps active SPEC-014C files or behavior.
- Q: What file-overlap stop condition applies while SPEC-014C is active? -> A: Stop before editing `src/lib/harness-adapters/**`, `src/app/api/agents/runtime-inventory/**`, `src/lib/task-dispatch.ts`, `src/lib/task-dispatch-codex-app-server.ts`, `scripts/spec-014c/**`, or SPEC-014C artifacts. Resolve ownership first.
- Q: What should the PR/evidence packet record about parallel safety? -> A: Record active SPEC-014C, files intentionally avoided, runtime-inventory use as read-only/supporting evidence only, and no adapter ownership by SPEC-010B.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Product Line B preflight that can run before any Product Line B write.
- **FR-002**: Preflight MUST produce a no-mutation proof by recording comparable target evidence before and after the preflight.
- **FR-003**: Preflight MUST detect and report Product Line B residue, conflicting `plb-platform` assignments, and retained FocusEngine or OpenClaw identities without changing them.
- **FR-004**: System MUST seed Product Line B from `docs/ai/product-lines/product-line-b.yaml` with canonical identity `product-line-b`, display name `Product Line B`, and agent prefix `plb-platform`. Repeated `apply` against an already valid Product Line B target MUST require the existing-target allowance path and MUST preserve config-owned row cardinality, Product Line A scoped hashes, and stable before/after seed snapshot hashes; repeated `verify` MUST remain read-only and stable.
- **FR-005**: Product Line B MUST be disabled by default immediately after seed using the existing workspace disabled state and Product Line B smoke-owned workspace flags.
- **FR-006**: Operators MUST be able to inspect Product Line B workspace, project, and agent assignment shape separately from Product Line A through seed verification, SQL/API/status evidence, or temporary smoke-enabled dashboard scope. Disabled Product Line B MUST NOT be selectable in the normal dashboard Product Line switcher outside the explicit smoke enablement window.
- **FR-007**: Operators MUST explicitly enable Product Line B before any Product Line B smoke work becomes eligible. Enablement MUST be scoped to one run-id-bound synthetic smoke item and MUST NOT enable repo sync ownership, GitHub sync automation, generic scheduler dispatch, claim/retry/control-plane, runner, sandbox, adapter, or auto-merge paths.
- **FR-008**: The smoke MUST use one synthetic issue-shaped item with schema `spec-010b.synthetic_issue.v1`, `racecraft-lab/Paddock` metadata, already-proven pilot labels, and Product Line B identity in local evidence/task metadata while keeping Product Line B `github_sync_enabled` and repo sync ownership disabled.
- **FR-009**: Required implementation evidence MUST NOT depend on creating, editing, or deleting a live GitHub issue.
- **FR-010**: The smoke MUST process the synthetic issue only through already-proven pilot behavior and MUST NOT introduce new workflow language, scheduler authority, claim/retry authority, runner state, sandbox lifecycle, harness-adapter behavior, or auto-merge behavior.
- **FR-011**: Product Line B smoke MUST seed logical Product Line B agent assignments using explicit `plb-platform-*` product-line names. Any Paddock-owned fake or harness manifest ID, including `paddock_owned_sandbox_fake`, is selected-substrate or read-only runtime-inventory evidence only and MUST NOT be treated as Product Line B agent identity, assignment name, or ownership marker. The smoke MUST NOT require a runtime-inventory `eligible` state, and implementation MUST stop before collecting runtime-inventory evidence if doing so requires adapter, runtime-inventory eligibility, or active SPEC-014C-owned file changes.
- **FR-012**: System MUST disable Product Line B after the smoke and prove that no further Product Line B smoke, sync, dispatch, or pilot work is eligible. Disablement proof MUST enumerate Product Line B workspace flag keys that were enabled only during smoke and the final absent/false smoke-owned flag keys, plus counts for Product Line B repo sync-owner projects, GitHub-sync-enabled projects, assigned dispatch-eligible tasks, and remaining smoke-eligible items.
- **FR-013**: System MUST preserve Product Line A isolation evidence across preflight, seed, enablement, smoke, disablement, and cleanup using Product Line A-scoped hashes for workspace identity, projects, assignments, workflow templates, governance defaults, tasks/evidence/read-model rows, GitHub sync/lifecycle rows, counters, and non-owned flags.
- **FR-014**: The evidence packet MUST use schema `spec-010b.smoke_evidence.v1` and include preflight, seed, verify, enablement, synthetic issue smoke, pilot subset, disablement, cleanup, Product Line A isolation, timing, optional live issue status, redaction, and scope-boundary entries.
- **FR-015**: Required review evidence MUST identify the proving check for each changed behavior and state whether the check was observed before the behavior was accepted or already covered by existing behavior.

### Spec Evidence And Archive Policy

- Archive Sweep runs before Phase 0 for the requested spec and considers only previously merged specs.
- The current target spec, `specs/010b-product-line-b-smoke`, is excluded from same-run archival and cleanup.
- Unsafe branches or dirty worktrees use dry-run or stop behavior, not cleanup.
- Cleanup of completed spec folders requires archive success, merge/tree references, and recovery commands.
- Generated screenshots or binary artifacts are CI or review artifacts by default; committed binaries require a manifest-backed exception.
- SPEC-010B evidence must remain reviewable as text or structured records unless a manifest-backed exception is explicitly recorded.

### Reviewability Budget *(mandatory)*

- **Primary surface**: seed/config
- **Secondary surfaces, if any**: docs/process; narrowly scoped smoke evidence
- **Projected reviewable LOC**: 450-700 lines excluding generated, lock, vendor, and evidence output artifacts
- **Projected production files**: 4-6 files
- **Projected total files**: 8-12 files including spec, plan, tests, fixtures, docs, and evidence packet updates
- **Budget result**: within budget
- **Split decision**: This remains one spec because it is a bounded onboarding smoke for a disabled generic product line. Any scheduler, runner, sandbox, harness-adapter, auto-merge, live GitHub mutation, FocusEngine assignment, or broad dashboard work must become a separate follow-up spec.

### PR Review Packet Requirements *(mandatory)*

- PR description MUST include: what changed, why, non-goals, review order,
  scope budget, traceability, verification evidence, known gaps, and rollback
  or feature-flag notes.
- Traceability MUST map each major requirement or success criterion to changed
  files and verification evidence.
- Deferred work MUST name the follow-up spec or issue.
- PR review packet MUST call out the Product Line A isolation proof, Product Line B disablement proof, and the fact that live GitHub writes are optional evidence only.
- PR review packet MUST state that optional HAL live GitHub evidence requires explicit operator approval, redacted credential-safe metadata, and no automatic labels repair, comments, close/delete, PR creation, sync-owner change, or Product Line A mutation.
- PR review packet MUST identify any files intentionally avoided to remain disjoint from active harness-adapter work.
- PR review packet MUST state that runtime-inventory evidence is read-only/supporting only, that no runtime-inventory `eligible` state is required for closeout, and that SPEC-010B did not take adapter file ownership.

### Key Entities

- **Product Line B**: The generic second product line with identity `product-line-b`, display name `Product Line B`, disabled-by-default state, and `plb-platform` agent prefix.
- **Product Line B Smoke Item**: A single synthetic issue-shaped item using schema `spec-010b.synthetic_issue.v1`, `racecraft-lab/Paddock` metadata, already-proven pilot labels, and Product Line B local evidence/task metadata to prove scoped pilot behavior without requiring a live external issue write.
- **Product Line Assignment Shape**: The workspace, project, and `plb-platform-*` logical agent assignment relationship that shows Product Line B is isolated from Product Line A without treating harness manifest IDs as Product Line B agent identity.
- **Product Line A Isolation Baseline**: The comparable evidence captured before Product Line B writes and used to prove Product Line A ownership, task state, sync ownership, and metrics remain unchanged.
- **Smoke Evidence Packet**: The durable `spec-010b.smoke_evidence.v1` review record covering preflight, seed, verify, enablement, synthetic issue shape, pilot subset, disablement, cleanup, Product Line A isolation, timing, optional live issue status, redaction, scope boundaries, and follow-up assumptions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Preflight completes with a no-mutation proof and either a ready result or a residue/conflict stop result in under 15 operator minutes on a disposable or HAL-like target.
- **SC-002**: After seeding or an explicitly allowed repeated apply, Product Line B is visible with identity `product-line-b`, display name `Product Line B`, agent prefix `plb-platform`, non-null workspace disabled state, no duplicate config-owned workspace/project/assignment/template/governance rows, stable before/after seed snapshot hashes on an already valid target, and disabled or absent smoke-owned flags in 100% of required inspection evidence.
- **SC-003**: Exactly one Product Line B synthetic issue-shaped item can be enabled, smoked through candidate eligibility, one root-task proof, pilot auto-route hold, and side-effect absence, then recorded without requiring any live GitHub issue mutation.
- **SC-004**: Product Line A isolation evidence shows zero Product Line B-caused changes to Product Line A ownership, task state, sync ownership, product-line scoped hashes, and dashboard metrics.
- **SC-005**: Product Line B disablement proof shows non-null workspace disabled state, enumerated disabled or absent smoke-owned flags, no repo sync-owner rows, zero GitHub-sync-enabled Product Line B projects, zero assigned dispatch-eligible Product Line B tasks, zero remaining eligible Product Line B smoke work after the smoke, and no requirement that any runtime-inventory entry reach the SPEC-014B `eligible` state.
- **SC-006**: The operator-recorded smoke checklist can be completed in less than one operator-hour, excluding optional live GitHub UAT evidence.
- **SC-007**: A maintainer can trace every required Product Line B evidence phase to the smoke evidence packet and PR review packet without rerunning setup assumptions.

## Assumptions

- SPEC-010A generic product-line seeding behavior is the starting point and should be reused wherever it already satisfies Product Line B needs.
- Product Line A is the existing active Paddock product line and remains the isolation baseline.
- Product Line B is intentionally generic; FocusEngine and OpenClaw retained identities are not Product Line B for this spec.
- The required smoke uses synthetic `racecraft-lab/Paddock` issue metadata; live GitHub issue creation is optional HAL UAT evidence only.
- `seed:product-line` remains a three-mode CLI (`preflight`, `apply`, `verify`); enablement and disablement are smoke lifecycle actions with evidence, not seed modes.
- Optional live GitHub issue evidence is manual UAT only and is never a required implementation or PR gate for SPEC-010B.
- Disabled Product Line B does not appear in the normal dashboard Product Line switcher; explicit API/SQL/evidence paths remain the inspection mechanism outside the smoke enablement window.
- Paddock-owned fake or harness manifest IDs are only selected-substrate or read-only runtime-inventory evidence; Product Line B logical assignment identity remains `plb-platform-*`, and active harness-adapter work remains file-disjoint.
- The manual "<1 operator-hour" target is checklist-only and operator-recorded.
- Follow-up harness gardening can consume the evidence packet, but this spec does not implement SPEC-012B behavior.
