# Research: SPEC-013B - Claim and Reconciliation Authority

**Date**: 2026-05-27
**Scope**: Prevent duplicate scheduler dispatch for one GitHub issue-linked assigned task stage while preserving tracker truth, resource governance, SPEC-013A attempt evidence, and existing dispatch/successor boundaries.

## Decision: Add M78 `task_stage_claims` as the active claim authority

**Rationale**: SPEC-013A `task_stage_attempts` is passive lifecycle evidence. Migration `076_task_stage_attempts` creates attempt and event tables plus ordering indexes, but it does not enforce one active attempt or one active launch. SPEC-013B needs a separate active lock with database-level uniqueness, so M78 adds `task_stage_claims`, `UNIQUE(task_stage_attempt_id)`, and a partial unique index on `(workspace_id, task_id, stage_key)` where `claim_state = 'active'`.

**Alternatives considered**:

- Use `task_stage_attempts.status = 'running'` as the active lock. Rejected because the attempt spine is evidence and does not currently own active uniqueness.
- Store claim metadata on `tasks.metadata`. Rejected because JSON metadata cannot provide reliable SQLite partial uniqueness or focused release/recovery scans.
- Process-local mutex. Rejected because scheduler concurrency and restarts require durable local truth.

## Decision: Put claim authority in `src/lib/task-claim-reconciliation.ts`

**Rationale**: `dispatchAssignedTasks` is the existing assigned-task launch boundary. It selects `assigned` tasks, immediately mutates them to `in_progress`, logs `task_dispatched`, and performs the launch handoff. A narrow helper called before that mutation can protect the boundary without moving semantics into `src/lib/scheduler.ts` or replacing existing dispatch logic.

**Alternatives considered**:

- Put claim logic directly in `task-dispatch.ts`. Rejected because dispatch is already broad and successor-heavy.
- Put claim logic in `task-stage-attempts.ts`. Rejected because that module owns passive evidence, not active admission.
- Put claim logic in `scheduler.ts`. Rejected because the scheduler should continue to invoke tasks and not own claim semantics.

## Decision: Use persisted GitHub task fields plus SPEC-013A1 lifecycle state

**Rationale**: The spec forbids live GitHub fetches inside the active claim transaction. Claim intake therefore uses task-level `github_repo`, `github_issue_number`, `github_pr_number`, and `github_synced_at`, plus the M77 lifecycle controls/runs exposed by `getLifecycleStatusForScope`. Freshness is `github_synced_at` age <= `min(max(2 * interval_seconds, 600), 3600)` with `interval_seconds=300` when no scope-specific value exists. Disabled, unresolved, unhealthy, or stale-lease lifecycle state defers claim.

**Alternatives considered**:

- Fetch GitHub before insert. Rejected because the active claim decision must be bounded and local.
- Ignore lifecycle health and rely only on `github_synced_at`. Rejected because SPEC-013A1 already records sync ownership, lease, backoff, and health needed for trustworthy tracker truth.
- Terminally fail stale tasks. Rejected because stale truth should defer launch until the next sync or operator action.

## Decision: Validate `github_repo` as canonical `owner/repo`

**Rationale**: SPEC-013B only needs the local persisted GitHub repository identity used by existing GitHub API contracts, not arbitrary remotes or URLs. GitHub's REST repository endpoint identifies repositories by separate `owner` and `repo` path parameters, with the repo name excluding the `.git` extension. Claim intake therefore accepts only a canonical `owner/repo` full name, rejects URL/scp-like/path-traversal/control-character forms, and records `invalid_github_repo` instead of leaking or normalizing unsafe identifiers.

**Alternatives considered**:

- Accept any non-empty string. Rejected because it leaves `valid github_repo` ambiguous and could let URL-shaped or path-shaped values enter activities and read models.
- Parse full Git remotes. Rejected because claim intake is local reconciliation only and must not introduce remote parsing semantics or credential-bearing URL handling.
- Lowercase everything. Rejected because GitHub names are not case sensitive for lookup, but preserving stored canonical casing avoids unnecessary churn in existing persisted identity.

## Decision: Classify claim boundary errors as fail-closed deferrals

**Rationale**: Claim acquisition sits at a defensive boundary: it evaluates persisted GitHub truth, resource governance, SQLite uniqueness, and activity persistence before launch. Project constitution Principle XIII requires boundary errors to be caught, classified, and surfaced as structured data without leaking secrets. OWASP fail-secure guidance says exceptions inside a security control should follow the disallow path, and OWASP logging guidance recommends documented event classification and excluding secrets from logs. SPEC-013B therefore classifies expected SQLite uniqueness races as `duplicate_prevented`, stale-owner release retries as safe no-ops, and SQLite busy/database errors, malformed inputs, governance evaluator failures, and unknown claim/release exceptions as `boundary_deferred`.

**Alternatives considered**:

- Let boundary exceptions propagate to the scheduler. Rejected because one task's claim failure could crash the tick and obscure other task outcomes.
- Continue to legacy dispatch when the claim helper errors. Rejected because that bypasses governance and duplicate-prevention authority.
- Persist raw exception messages. Rejected because database errors, stack traces, and provider/gateway payloads can expose implementation details or secret-shaped strings.

## Decision: Use closed release reasons and terminal task states

**Rationale**: `release_reason` must be reviewable and queryable without free-form strings. The existing Paddock task status type defines `done` and `failed` as terminal outcomes for this release boundary; `awaiting_owner` and review states remain non-terminal handoff states. M78 therefore constrains release reasons to `launch_handoff_completed`, `dispatch_failed`, `task_terminal_done`, `task_terminal_failed`, `github_issue_terminal`, `github_pr_terminal`, `governance_blocked`, `governance_deferred`, `stale_claim_recovered`, and `boundary_error_deferred`.

**Alternatives considered**:

- Store arbitrary release text. Rejected because it weakens validation, read-model enums, and redaction guarantees.
- Treat owner handoff as terminal. Rejected because owner-gated completion remains outside SPEC-013B and still depends on linked PR terminal evidence.
- Merge governance and boundary reasons. Rejected because governance `block/defer` is a business decision, while `boundary_error_deferred` is a fail-closed diagnostic outcome.

## Decision: Evaluate governance before active claim insert

**Rationale**: Resource governance is a synchronous admission evaluator with an `allow | defer | block` decision contract. SPEC-013B needs governance truth to remain authoritative, so the helper evaluates governance before inserting an active claim. Non-allow decisions write governance/reconciliation evidence and do not create active claims.

**Alternatives considered**:

- Acquire then immediately release for governance block/defer. Rejected because it creates noisy claims for work that never became launch-eligible.
- Skip SPEC-013B evidence and rely only on existing governance events. Rejected because duplicate prevention and claim UAT need claim-specific reconciliation evidence.
- Evaluate governance after launch. Rejected because blocked work could already have been dispatched.

## Decision: Preserve `advanceTaskChain` and `createTask` ownership

**Rationale**: `advanceTaskChain` is the successor-selection authority and `createTask` is the shared task-creation helper. Claim, release, stale recovery, duplicate-prevention, and deferral paths must not create successors or advance chains. Tests will assert the new helper does not import or call either symbol.

**Alternatives considered**:

- Use claim release to trigger successors. Rejected because it duplicates existing task pipeline authority.
- Add remediation/triage branching in claim logic. Rejected because SPEC-013B only protects launch admission.

## Decision: Expose read-only `task_claim_reconciliation.v1`

**Rationale**: Operators and reviewers need a way to inspect claim state and reconciliation outcomes. A viewer-scoped GET route beside the existing task-stage attempts route provides enough evidence without adding manual retry, release, cancel, or primary dashboard controls.

**Alternatives considered**:

- Primary dashboard panel. Rejected as UI scope reserved for later retry/debug/control specs.
- Mutation endpoints for release/retry. Rejected because manual controls are out of scope.
- Activity-only inspection. Rejected because reviewers need a stable versioned envelope.

## Decision: Treat OpenAI Harness Engineering and Symphony as boundary context only

**Rationale**: OpenAI Harness Engineering, OpenAI's Symphony announcement, and `openai/symphony` SPEC all reinforce that durable agent control planes need tracker reconciliation, review loops, controlled autonomy, and operator evidence. They also include larger runner, sandbox, Linear, hardening, retry, and orchestration behavior that SPEC-013B explicitly excludes.

**Alternatives considered**:

- Import Symphony runner or sandbox ideas now. Rejected because SPEC-013B is only claim/reconciliation authority around an existing dispatch boundary.
- Add retry UI or manual controls with claim evidence. Rejected because those belong to later retry/debug specs.
- Add generic harness abstraction. Rejected because SPEC-014 owns harness execution.

## Sources

- `src/lib/task-dispatch.ts:2292-2549` for assigned dispatch, launch, completion, and failure behavior.
- `src/lib/scheduler.ts:366-548` for scheduled/manual invocation of task dispatch.
- `src/lib/task-stage-attempts.ts:3-610` and `src/lib/migrations.ts:3387-3455` for attempt evidence behavior.
- `src/lib/migrations.ts:3459-3582`, `src/lib/github-sync-lifecycle.ts:620-790`, and `src/lib/github-sync-lifecycle-types.ts:1-173` for SPEC-013A1 lifecycle truth.
- `src/lib/resource-evaluator.ts:1-33`, `src/lib/resource-evaluator.ts:264-283`, and `src/lib/resource-decision-writer.ts:41-185` for governance decision/evidence APIs.
- `.specify/memory/constitution.md` Principle XIII for boundary classification and secret-safe structured data requirements.
- `specs/013a1-github-sync-automation/spec.md` FR-041 for precedent stable GitHub boundary failure categories and sanitized diagnostics.
- GitHub REST repository endpoint docs for `owner` and `repo` path parameters: https://docs.github.com/en/rest/repos/repos
- SQLite partial unique index docs: https://www.sqlite.org/partialindex.html
- OWASP Fail Securely: https://owasp.org/www-community/Fail_securely
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- OWASP Error Handling Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html
- OpenAI Harness Engineering, fetched 2026-05-27: https://openai.com/index/harness-engineering/
- OpenAI Symphony announcement, fetched 2026-05-27: https://openai.com/index/open-source-codex-orchestration-symphony/
- `openai/symphony` README and SPEC, fetched 2026-05-27: https://github.com/openai/symphony and https://github.com/openai/symphony/blob/main/SPEC.md
