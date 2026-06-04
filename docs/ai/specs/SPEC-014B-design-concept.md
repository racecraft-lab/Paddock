---
topic: "Harness Adapter Manifest and Fake Registry"
slug: "spec-014b-adapter-manifest-fakes"
date: "2026-06-03"
mode: "setup"
spec_id: "SPEC-014B"
source_input:
  type: "file"
  ref: "docs/ai/rc-factory-technical-roadmap.md#SPEC-014B"
question_count: 10
stop_reason: "natural"
---

# Design Concept: Harness Adapter Manifest and Fake Registry

> **Source:** docs/ai/rc-factory-technical-roadmap.md#SPEC-014B
> **Date:** 2026-06-03
> **Questions asked:** 10
> **Stop reason:** natural

## Goals

- Define a typed harness adapter manifest contract before any new real Codex, Claude, OpenClaw, Hermes, OpenCode, or external harness execution lands.
- Formalize Paddock's existing harness-adjacent surfaces into one explicit capability and eligibility contract instead of adding generic harness support from scratch.
- Prove the contract with two fake adapter postures: a Paddock-owned sandbox fake and an external-harness fake.
- Add a fake registry, manifest validator, capability-resolution packet, policy model, sanitized evidence model, and derived runtime-inventory read model.
- Show runtime inventory on the existing Agents surface using a read-only operator integration.
- Keep visibility separate from work eligibility: `visible`, `unassigned`, `assigned`, `eligible`, and `blocked` must be explicit states.
- Fail closed when a selected adapter lacks a required capability, approval policy, timeout policy, or user-input posture.
- Preserve SPEC-013B claim/reconciliation authority, SPEC-013C retry/debug semantics, SPEC-013D task-detail operator controls, and SPEC-014A sandbox lifecycle ownership.

## Non-goals

- No real harness launch, resume, stop, transcript fetch, token accounting call, MCP/tool/plugin invocation, or provider API call.
- No widening of the existing `src/lib/adapters` framework-adapter route/contract; SPEC-014B creates the stricter harness adapter layer separately.
- No duplicate OpenClaw gateway, framework-adapter, session scanner, runtime detection, agent sync, or AgentRun implementation.
- No SQLite migration for adapter manifests or runtime inventory unless implementation proves an unavoidable persistence need during Plan and records a reviewability exception.
- No launch, assignment, retry, release, cancel, lifecycle-control, GitHub mutation, scheduler dispatch, successor selection, governance-policy mutation, or auto-merge UI.
- No raw transcript, provider payload, secret-like value, host path, prompt body, or unsafe external event payload in UI, fixtures, logs, review packets, or artifacts.
- No automatic adapter fallback or silent switching when the selected adapter cannot satisfy a requirement.

## Existing Harness Baseline

Paddock already has several harness-adjacent surfaces that SPEC-014B must reuse as context rather than replace:

- `src/lib/adapters` and `/api/adapters` expose a narrow framework-adapter contract for registration, heartbeat, task reports, assignments, and disconnects across OpenClaw, generic, CrewAI, LangGraph, AutoGen, and Claude SDK style integrations.
- `src/lib/task-dispatch.ts`, `src/lib/openclaw-gateway.ts`, and `src/lib/command.ts` already contain OpenClaw gateway dispatch paths plus direct Claude fallback behavior in limited cases.
- `src/app/api/sessions/route.ts`, `src/lib/sessions.ts`, and local session scanners already normalize OpenClaw gateway, Claude Code, Codex CLI, Hermes, and OpenCode observations into one session surface.
- `src/lib/agent-runtimes.ts`, `src/lib/agent-sync.ts`, `src/lib/local-agent-sync.ts`, and `src/lib/runs.ts` already model runtime detection, OpenClaw/local agent inventory, and run/evidence storage.

The SPEC-014B gap is not "Paddock has no harness support." The gap is that launch, resume, stop, transcript, artifact, sandbox, tool/MCP, approval, timeout, user-input, token/runtime, and eligibility assumptions are still implicit or scattered. SPEC-014B should make those assumptions explicit through typed fake manifests and a derived runtime-inventory read model before SPEC-014C/D add real adapter execution.

## Design Tree (Q&A log)

### Q1. Where should SPEC-014B expose runtime inventory states for v1?

**Branch:** Operator UI surface

**Recommended answer:** Existing Agents surface.
> Add a narrow read model/API and show `visible`, `unassigned`, `assigned`, `eligible`, and `blocked` in the existing Agents page/detail patterns. This matches the roadmap note that the Agents page already exposes practical runtime inventory and keeps UI scope bounded.

**Alternatives offered:**
- API/read model only: Smaller, but defers the operator-visible ownership SPEC-014B is supposed to establish.
- New runtime dashboard: Clear separation, but larger and duplicates current Agents/session inventory.

**User's answer:** A, existing Agents surface.

---

### Q2. Where should SPEC-014B define fake adapter manifests for v1?

**Branch:** Manifest source of truth

**Recommended answer:** Typed fixtures.
> Use checked-in TypeScript manifest fixtures plus validation, with no SQLite migration unless implementation proves persistence is required.

**Alternatives offered:**
- YAML contract: Operator-readable, but adds another parser/parity surface.
- SQLite table: Explicit persistence, but expands schema scope for a fake-registry contract spec.

**User's answer:** Typed fixtures.

---

### Q3. Which two fake adapter shapes should SPEC-014B require?

**Branch:** Fake adapter coverage

**Recommended answer:** Paddock and external.
> Model two execution postures: Paddock-owned sandbox and external harness, without calling real Codex, Claude, OpenClaw, Hermes, or OpenCode.

**Alternatives offered:**
- Generic fakes: Lower naming risk but proves less of the future deployment split.
- Branded fakes: Future mapping is obvious but risks implying real integration.

**User's answer:** Paddock and external.

---

### Q4. How strict should runtime eligibility be?

**Branch:** Eligibility gates

**Recommended answer:** All gates.
> Require feature flag, explicit project-role assignment, adapter capability support, governance allow, tracker-linked task eligibility, and sandbox lifecycle evidence.

**Alternatives offered:**
- Capability only: Simpler but weakens assignment and governance boundaries.
- Assignment only: Operator-friendly but hides unsupported capabilities until launch.

**User's answer:** All gates.

---

### Q5. How should SPEC-014B compute runtime inventory states?

**Branch:** Runtime inventory state source

**Recommended answer:** Derived read model.
> Derive states from typed manifests, registry visibility, project assignments, governance/capability checks, task eligibility, and SPEC-014A lifecycle reads without a new inventory table.

**Alternatives offered:**
- Persisted snapshot: Adds history but requires migration and consistency work.
- Manifest only: Smaller but does not prove assignment or eligibility separation.

**User's answer:** Derived read model.

---

### Q6. What should happen when a selected adapter lacks a required capability?

**Branch:** Unsupported capability behavior

**Recommended answer:** Fail with evidence.
> Fail closed with a stable reason code and attempt/review-packet evidence; do not stall, auto-switch adapters, or mutate GitHub/tracker truth.

**Alternatives offered:**
- Block only: Avoids attempt evidence but weakens the roadmap proof.
- Fallback adapter: Improves throughput but weakens explicit harness selection and auditability.

**User's answer:** Fail with evidence.

---

### Q7. How rich should fake adapter transcript, token, runtime, and artifact evidence be?

**Branch:** Evidence payload safety

**Recommended answer:** Sanitized metadata.
> Emit bounded synthetic summaries, counters, event refs, and artifact descriptors only; never expose raw transcript, provider payload, host path, or secret-like data.

**Alternatives offered:**
- Raw fake payloads: Better demo fidelity but expands sanitization risk.
- No payloads: Minimal scope but does not prove publication/accounting contracts.

**User's answer:** Sanitized metadata.

---

### Q8. Which API shape should expose SPEC-014B runtime inventory?

**Branch:** API contract

**Recommended answer:** Dedicated route.
> Add a read-only runtime-inventory v1 route consumed by the Agents panel, keeping existing `/api/agents` compatibility behavior unchanged.

**Alternatives offered:**
- Include parameter: Fewer routes but widens an already busy endpoint.
- Default extension: Simple for UI but highest compatibility risk.

**User's answer:** Dedicated route.

---

### Q9. What should the Agents UI add for runtime inventory in SPEC-014B?

**Branch:** UI scope

**Recommended answer:** Read-only evidence.
> Show state badges, selected manifest, eligibility reasons, lifecycle references, and sanitized fake evidence; add no launch, assignment, retry, or lifecycle controls.

**Alternatives offered:**
- Assignment control: Useful but expands into project/role mutation.
- Launch control: Validates flow but crosses into SPEC-014C/D execution scope.

**User's answer:** Read-only evidence.

---

### Q10. How should approval, timeout, and user-input policies work in fake manifests?

**Branch:** Policy contract

**Recommended answer:** Declare and fail closed.
> Manifests declare policy support; unsupported approval or user-input requirements and expired timeout budgets resolve to stable blocked/failed reason codes.

**Alternatives offered:**
- Simulate success: Better happy-path demo but hides blocked states.
- Defer policies: Smaller v1 scope but does not prove the manifest contract fully.

**User's answer:** Declare and fail closed.

## Open Questions

- Exact API path name may be refined during Specify/Plan. Recommended default: `GET /api/agents/runtime-inventory`, returning `runtime_inventory.v1`.
- Exact TypeScript module names may be refined during Plan. Recommended default: `src/lib/harness-adapters/` so the stricter execution adapter layer is separate from `src/lib/adapters/`.
- Exact stable reason-code enum should be finalized in Clarify or Plan, but it must cover capability unsupported, feature disabled, unassigned, governance denied, task ineligible, lifecycle missing, approval unsupported, user input unsupported, and timeout budget expired.

## Recommended Next Step

Run `$speckit-autopilot` with `docs/ai/specs/SPEC-014B-workflow.md` from branch `014b-adapter-manifest-fakes`. The workflow must use SpecKit Pro 2.6.1 from `racecraft-lab/racecraft-plugins-public` and must not run with a stale prior cache.
