# Research: SPEC-014A - Sandbox Ownership and Lifecycle Contract

## Decision: Add M80 lifecycle persistence as a narrow schema pair

**Decision**: Implement `080_agent_sandbox_lifecycles` with `agent_sandbox_lifecycles` and `agent_sandbox_lifecycle_events`.

**Rationale**: Live migrations end at `078_task_stage_claims`, and SPEC-014A needs durable audit rows before real harness adapters exist. M76 and M78 show the local pattern: current-state table plus event/history evidence, explicit indexes, and rollback SQL.

**Rejected alternatives**:
- Reuse `task_stage_attempt_events`: blurs passive attempt evidence with sandbox ownership.
- Store lifecycle history as JSON on one row: weaker audit and harder read API windows.
- Fake-only in memory: cannot prove cleanup/rollback/read behavior.

## Decision: Keep sandbox lifecycle separate from claim authority

**Decision**: Store nullable `task_stage_attempt_id` and `task_stage_claim_id` as evidence links only. Do not use sandbox lifecycle rows as locks.

**Rationale**: SPEC-013B owns `task_stage_claims` as active claim authority. Sandbox ownership is execution-context evidence for already-claimed work and must not decide work eligibility.

**Rejected alternatives**:
- Unique active lifecycle per task/stage as a lock: duplicates SPEC-013B and risks split-brain launch authority.
- Require claim id for every sandbox: blocks fake/external lifecycle proof where only a task/stage/attempt key is available.

## Decision: Use task-authorized read shapes

**Decision**: Add a task-scoped route, expected as `GET /api/tasks/[id]/sandbox-lifecycles`, with optional lifecycle filtering. Do not expose global lifecycle reads.

**Rationale**: Existing `GET /api/tasks/[id]/evidence` and `GET /api/tasks/[id]/claim-reconciliation` establish viewer auth, workspace-scope filtering, side-effect-free read builders, and task id routing.

**Rejected alternatives**:
- Global `/api/sandbox-lifecycles/[id]`: increases cross-workspace leakage risk.
- No API in SPEC-014A: leaves SPEC-014B without a stable read model.

## Decision: Persist only bounded logical path evidence

**Decision**: Persist `root_id`, `sandbox_key`, `sanitized_relative_path`, owner, handle id, linkage ids, timestamps, and redacted reason metadata. Never persist absolute host paths, raw path fragments, raw prompts, tokens, provider payloads, or raw session data.

**Rationale**: Harness Engineering emphasizes repo-visible, agent-legible systems, but host path disclosure is not required for bounded proof. The read model should prove containment without leaking machine layout.

**Rejected alternatives**:
- Persist resolved absolute path: easier debugging but leaks host topology.
- Persist only opaque id: safer but insufficient for bounded-root review.

## Decision: Use production-code fakes behind `FEATURE_AGENT_RUNNER_SANDBOXES`

**Decision**: Implement fake lifecycle owners for `mission_control`, `openclaw`, and `external_harness` as production code guarded by `resolveFlag`.

**Rationale**: Later adapter specs need a stable fake contract. Tests must prove fake owners cannot launch, resume, stop, or contact real harnesses.

**Rejected alternatives**:
- Test-only fixtures: hides the lifecycle contract from SPEC-014B.
- Real OpenClaw/Codex launch stubs: crosses into SPEC-014C/D and adapter manifest scope.

## External Source Boundary

- OpenAI Harness Engineering (fetched 2026-05-28): https://openai.com/index/harness-engineering/
- OpenAI Symphony announcement (fetched 2026-05-28): https://openai.com/index/open-source-codex-orchestration-symphony/
- OpenAI Symphony README (fetched 2026-05-28): https://github.com/openai/symphony
- OpenAI Symphony SPEC (fetched 2026-05-28): https://github.com/openai/symphony/blob/main/SPEC.md

SPEC-014A uses these sources only for workspace safety, lifecycle vocabulary, context legibility, and observable evidence. It does not import Symphony's scheduler, Linear tracker assumptions, runner client, workspace cleanup algorithm, or token/accounting behavior.
