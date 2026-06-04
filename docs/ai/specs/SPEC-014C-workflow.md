# SpecKit Workflow: SPEC-014C - First Real Harness Adapter Pilot

**Template Version**: 1.0.0, populated from SpecKit Pro workflow template  
**Created**: 2026-06-04  
**Purpose**: Prepare RC Factory Phase 12C for autonomous SpecKit execution by implementing the first real Codex app-server harness adapter path behind the SPEC-014B registry.

Run from the dedicated worktree:

```bash
cd /Users/fredrickgabelmann/.codex/worktrees/5424/racecraft-mission-control/.worktrees/014c-first-real-harness-adapter
$speckit-autopilot docs/ai/specs/SPEC-014C-workflow.md
```

Do not run autopilot from the parent worktree. Keep generated feature artifacts under `specs/014c-first-real-harness-adapter/`.

## Design Concept

This workflow was enriched from a Grill Me setup interview. The source of truth for scoping decisions is:

```text
docs/ai/specs/SPEC-014C-design-concept.md
```

Re-read the design concept before each phase. If a generated artifact contradicts the design concept, treat the generated artifact as wrong unless it records an explicit human-approved revision.

## Workflow Overview

| Phase | Command | Status | Notes |
|---|---|---|---|
| Scaffold | `$speckit-scaffold-spec SPEC-014C` | Complete | Worktree, branch, design concept, roadmap follow-ups, and workflow created |
| Specify | `$speckit-specify` | Pending | Generate `specs/014c-first-real-harness-adapter/spec.md` |
| Clarify | `$speckit-clarify` | Pending | Resolve protocol, failure, artifact, and UAT details |
| Plan | `$speckit-plan` | Pending | Generate implementation blueprint and contracts |
| Checklist | `$speckit-checklist` | Pending | Run focused domain checklists |
| Tasks | `$speckit-tasks` | Pending | Generate TDD-first task list |
| Analyze | `$speckit-analyze` | Pending | Cross-artifact drift check |
| Implement | `$speckit-implement` | Pending | Execute tasks exactly |

## Phase Gates

| Gate | Checkpoint | Approval Criteria |
|---|---|---|
| G0 | After scaffold | Branch is `014c-first-real-harness-adapter`; design concept and workflow are committed; reviewability preset resolves; roadmap names SPEC-014E and SPEC-014F follow-ups |
| G1 | After Specify | Requirements cover one real Codex app-server adapter, existing dispatch trigger, sandbox lifecycle, run/attempt/claim evidence, artifact safety, unsupported capability behavior, and HAL UAT |
| G2 | After Clarify | Protocol event names, same-run continuation stance, reason-code mapping, sanitized artifact shape, and HAL fixture shape are closed |
| G3 | After Plan | Architecture reuses SPEC-014A/B and SPEC-013B/C/D seams; no second adapter, no new live intervention UI, no transcript-retention policy, no auto-merge, and no task terminal mutation |
| G4 | After Checklist | Every checklist has zero unresolved `[Gap]` items or records a split decision |
| G5 | After Tasks | Tasks are dependency ordered, TDD-first, reviewable, and bounded to one adapter module plus the narrow dispatch/evidence seams |
| G6 | After Analyze | No CRITICAL/HIGH findings remain; design concept, spec, plan, tasks, and roadmap follow-up boundaries agree |
| G7 | After Implement | Focused tests, typecheck/lint/build as scope requires, local proof, HAL UAT runbook/report, roadmap/workflow status, and PR review packet are complete |

## Prerequisites

### Branch And Worktree

| Field | Value |
|---|---|
| Branch | `014c-first-real-harness-adapter` |
| Worktree | `.worktrees/014c-first-real-harness-adapter` |
| Base | `origin/main` at setup commit `4d318b77` |
| Remote | `origin` (`https://github.com/racecraft-lab/Paddock.git`) |
| Package manager | `pnpm`, detected from `pnpm-lock.yaml` |
| SpecKit CLI | `specify` available at setup |
| Setup reviewability gate | Passed with transition exception against `docs/ai/rc-factory-technical-roadmap.md` |
| Reviewability preset | `.specify/presets/speckit-pro-reviewability/` resolved for spec, plan, and tasks templates |
| Plugin note | The invocation referenced SpecKit Pro 2.6.2; only the 2.6.1 cache was present when final scaffold artifacts were written, so the available 2.6.1 template/preset scripts were used and recorded here |

Reviewability setup gate evidence:

```json
{"mode":"setup","status":"exception","pass":true,"reviewable_loc":8,"production_files":25,"total_files":0,"primary_surface_count":7,"primary_surfaces":["API","UI","harness/adapter","or docs/process","scheduler/runtime","schema/migration","seed/config"],"transition_exception":true,"warnings":["production files 25 exceeds warn threshold 6","primary surfaces 7 exceeds warn threshold 1"],"blockers":["production files 25 exceeds block threshold 8","more than one primary surface requires split or exception"]}
```

The exception permits setup to proceed, but implementation must keep SPEC-014C to one primary review surface: the first real harness adapter and narrow dispatch/evidence integration needed to run it.

### Constitution Validation

| Principle | Requirement | Verification |
|---|---|---|
| Zero-regression contract | Existing task dispatch, claim control, runtime inventory, sandbox lifecycle, artifact store, and GitHub sync behavior remain compatible | Focused regression tests plus `pnpm typecheck`, `pnpm lint`, and relevant Vitest suites |
| Test-first implementation | Write failing tests for adapter launch, failure, timeout, artifact safety, and scope guards before implementation | RED/GREEN evidence in tasks and final report |
| Strict scope | One Codex app-server adapter, one smoke path, bounded run/debug evidence, no second adapter or UI/control expansion | Static scope guard and Analyze pass |
| Data and secret safety | No raw transcripts, provider payloads, tool payloads, host paths, secrets, or broad prompts in artifacts or UI | Artifact/redaction tests and unsafe payload fixtures |
| Feature flag discipline | `FEATURE_AGENT_RUNNER_SANDBOXES` remains default OFF and flag OFF blocks launch | Flag matrix tests and UAT |
| Human validation | HAL target UAT must run the real Codex app-server path or block completion | `specs/014c-first-real-harness-adapter/uat-report.md` |

## External Context

Before Specify and again before Plan, fetch current external context and cite it in generated artifacts. The setup-time retrieval date is 2026-06-04.

- OpenAI Harness Engineering: https://openai.com/index/harness-engineering/
- OpenAI Symphony announcement: https://openai.com/index/open-source-codex-orchestration-symphony/
- Symphony SPEC: https://github.com/openai/symphony/blob/main/SPEC.md
- Codex App Server docs: https://developers.openai.com/codex/app-server/

Use these sources only for launch/resume vocabulary, workspace cwd/sandbox posture, approval/user-input behavior, unsupported-capability behavior, and validation profile decisions. Do not import Symphony's implementation stack, tracker assumptions, scheduler policy, or auto-merge behavior.

## Specification Context

| Field | Value |
|---|---|
| Spec ID | SPEC-014C |
| Name | First Real Harness Adapter Pilot |
| Branch short name | `first-real-harness-adapter` |
| Feature directory | `specs/014c-first-real-harness-adapter` |
| Status | Pending |
| Priority | P1 |
| Dependencies | SPEC-013D, SPEC-014B |
| Enables | SPEC-014D, SPEC-014E, SPEC-014F, later adapter specs |
| Tool count / tool names | N/A - not a tool-surface spec |

Roadmap scope:

- Implement one real harness adapter path behind the SPEC-014B registry.
- Prefer Codex app-server because structured threads, tool/file requests, approvals, and usage events map cleanly to Paddock.
- Execute already-claimed GitHub-linked work only.
- Include one adapter module, one smoke path, token/runtime summaries where available, artifact publication, redaction, and operator-visible run debug.
- Do not choose successor templates, create local-only tasks, auto-merge, bypass Aegis/owner gates, add a second real adapter, or add OpenClaw-specific behavior.

Human-reviewed setup decisions:

- Codex app-server is the selected first adapter.
- Launch is triggered only from the existing dispatch path after claim/reconciliation and runtime-inventory eligibility.
- Launch is required; same-run continuation is allowed only if Codex exposes a stable session/thread id without cross-tick retry ownership.
- One `codex app-server` subprocess is spawned per admitted stage attempt.
- Turn input is bounded to GitHub issue/task/workflow/claim/manifest/capability evidence.
- Output persistence is adapter evidence only; no task terminal or GitHub mutation.
- User-input, tool/file approval, unsupported capability, timeout, and unsafe evidence cases fail closed.
- SPEC-014E owns richer transcript/event retention and raw-capture policy.
- SPEC-014F owns live operator intervention UI.
- Paddock-owned SPEC-014A sandbox lifecycle root is the only cwd boundary.
- HAL UAT requires one real Codex app-server launch or blocks completion.

### Existing Baseline To Reuse

- `src/lib/harness-adapters/types.ts`, `fixtures.ts`, `validation.ts`, `runtime-inventory.ts`, and `evidence.ts` for the SPEC-014B manifest, eligibility, and evidence-safety contract.
- `src/app/api/agents/runtime-inventory/route.ts`, `src/components/agents/RuntimeInventoryEvidence.tsx`, and existing Agents panel integration for runtime-inventory visibility.
- `src/lib/agent-sandbox-lifecycle.ts` and `src/app/api/agent-sandbox-lifecycle/route.ts` for SPEC-014A lifecycle creation, state, and read evidence.
- `src/lib/task-claim-reconciliation.ts`, `src/lib/task-claim-control.ts`, and `src/components/panels/claim-control-section.tsx` for claim ownership, release, retry/cancel semantics, and operator debug patterns.
- `src/lib/task-stage-attempts.ts` for attempt lifecycle and run links.
- `src/lib/runs.ts` for `AgentRun` creation/update and bounded run summaries.
- `src/lib/task-artifacts.ts`, `src/lib/secret-detector.ts`, and artifact routes for publication, redaction, quarantine, and safe previews.
- `src/lib/task-dispatch.ts` for the current dispatch seam; SPEC-014C must integrate after claim acquisition and before legacy launch handoff where appropriate.

## Phase 1: Specify

**When to run:** At feature start. Output: `specs/014c-first-real-harness-adapter/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-014C First Real Harness Adapter Pilot

Implement the first real harness adapter path behind the SPEC-014B registry. The selected adapter is Codex app-server.

Problem:
Paddock has completed claim/reconciliation, retry/debug controls, operator claim-control UX, sandbox lifecycle, and fake harness manifest/runtime-inventory support. It still cannot execute an already-claimed GitHub-linked stage through a real harness. SPEC-014C must prove that one real adapter can launch or continue a claimed stage, publish safe artifacts, record bounded usage/failure summaries, and fail safely on unsupported tool/user-input events.

Primary users:
- Operators who need to see whether a claimed stage launched, failed, timed out, or published safe evidence.
- Paddock control-plane maintainers who need proof that the SPEC-014A/B and SPEC-013B-D contracts can drive a real harness.
- Future adapter implementers who need a concrete contract for Codex app-server before OpenClaw/external adapters and richer retention/intervention specs.

User stories:
1. As Paddock, I can admit only an already-claimed GitHub-linked assigned stage through runtime-inventory eligibility and launch Codex app-server in a bounded sandbox.
2. As an operator, I can inspect run, attempt, lifecycle, artifact, usage, and failure summaries without raw transcripts or unsafe payloads.
3. As Paddock, I can fail closed on unsupported user-input, tool/file approval, timeout, unavailable binary, malformed protocol event, and unsafe evidence cases without mutating task terminal state or GitHub.
4. As a reviewer, I can see that richer transcript retention belongs to SPEC-014E and live intervention UI belongs to SPEC-014F, not this PR.

Functional requirements must cover:
- One Codex app-server adapter manifest and adapter module.
- Existing dispatch trigger only after SPEC-013B claim/reconciliation and governance allow.
- Paddock-owned SPEC-014A lifecycle creation/preparation before launch and terminal/cleanup evidence after launch.
- One subprocess per admitted stage attempt with manifest bounded timeout.
- Bounded task-stage prompt assembly from GitHub issue title/body/link, workflow template/stage instructions, task id/stage key, assignment role, repo/workspace path, claim id, manifest id, capability packet, and handoff requirements.
- AgentRun, task-stage attempt, sandbox lifecycle, activities, usage summary, failure summary, and safe artifact references.
- Artifact publication through existing task artifact and secret/redaction paths.
- Fail-closed reason codes for user input unsupported, approval/tool/file unsupported, capability unsupported, timeout expired, unavailable binary, malformed protocol, and unsafe evidence rejected.
- Feature flag OFF and manifest/assignment/task/governance/lifecycle ineligible behavior.
- HAL UAT requiring a real Codex app-server launch.

Constraints:
- TypeScript 5 strict, Next.js 16 App Router, React 19, better-sqlite3, Vitest, Playwright only if UI surface changes, pnpm.
- No new runtime dependency unless Plan proves the Codex protocol cannot be handled with existing Node APIs.
- No schema migration unless Plan proves existing runs, attempts, claims, lifecycles, artifacts, and activities cannot store bounded evidence.
- Keep implementation reviewable. Stop and split if a second primary surface is needed.

Out of scope:
- Second real adapter.
- OpenClaw-specific behavior.
- Rich transcript/event retention, replay/debug export, quarantine policy, or opt-in raw capture beyond existing artifact safety: SPEC-014E.
- Live user-input/tool-approval UI, operator answer capture, pause/resume intervention state, or stop button: SPEC-014F.
- Successor selection, local-only task creation, direct GitHub mutation, task terminal mutation, auto-merge, Aegis/owner gate bypass, or governance mutation.
```

### Specify Outputs

- `specs/014c-first-real-harness-adapter/spec.md`
- Requirements and stories should explicitly cite `docs/ai/specs/SPEC-014C-design-concept.md`.

## Phase 2: Clarify

**When to run:** After Specify. Maximum five questions per session.

### Clarify Session 1: Codex App-Server Protocol

```bash
$speckit-clarify Focus on Codex app-server protocol details: launch request shape, event names, final result signal, usage events, failure events, and same-run continuation/session id behavior. Resolve only details required to implement one adapter path.
```

Expected closures:

- Protocol event names for launch, usage, final output, failure, user-input request, approval/tool/file request, and timeout.
- Whether same-run continuation has a stable session/thread id and remains in scope.
- How unavailable binary and malformed protocol errors are detected.

### Clarify Session 2: Evidence, Artifacts, And Redaction

```bash
$speckit-clarify Focus on safe evidence: AgentRun metadata, task-stage attempt events, sandbox lifecycle events, activities, usage summaries, failure summaries, sanitized artifact payloads, and unsafe content rejection.
```

Expected closures:

- Minimal `codex_app_server_run.v1` or equivalent evidence payload.
- Safe artifact descriptor shape.
- Rejection behavior for raw transcript/provider/tool payloads, host paths, prompt body leakage, and secret-shaped values.
- Whether rejected final output fails the run or publishes a redacted derivative through existing artifact policy.

### Clarify Session 3: Claim, Timeout, And Lifecycle Semantics

```bash
$speckit-clarify Focus on claim/lifecycle semantics: how adapter success, failure, timeout, cancellation by existing claim-control, stale claim recovery, lifecycle cleanup, and retry eligibility map to existing SPEC-013B/C/D and SPEC-014A behavior.
```

Expected closures:

- Exact release/defer reason used for successful launch handoff, adapter failure, timeout, and protocol error.
- Whether timeout marks attempt `failed` and run `failed` or uses run `timeout`.
- Cleanup ordering and evidence when subprocess termination fails.
- Static scope guard expectations for no task terminal mutation and no GitHub mutation.

### Clarify Session 4: UAT And Deployment

```bash
$speckit-clarify Focus on HAL UAT: disposable workspace/task/stage setup, feature flag scope, GitHub-linked fixture identity, required real Codex app-server launch, unsupported user-input/tool/approval cases, timeout fixture, artifact redaction fixture, lifecycle cleanup, and zero-residue cleanup.
```

Expected closures:

- HAL fixture shape and cleanup SQL/checks.
- Codex app-server availability preflight.
- What blocks UAT if app-server is unavailable.
- Required PR review packet and roadmap/workflow evidence.

## Phase 3: Plan

**When to run:** After Specify and Clarify. Output: `specs/014c-first-real-harness-adapter/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack
- Language: TypeScript 5 strict on Node >=22
- App: Next.js 16 App Router, React 19
- Database: SQLite through better-sqlite3, existing synchronous transactions
- State/UI: Existing task detail/evidence and Agents patterns only if needed for read-only debug visibility
- Testing: Vitest for adapter/helper/dispatch/artifact/lifecycle behavior; Playwright only if browser-visible UI changes; pnpm
- Runtime dependency policy: no new runtime dependency unless protocol evidence proves existing Node APIs are insufficient

## Architecture Notes
- Add the real Codex app-server adapter in the stricter SPEC-014B harness-adapter layer, not in the older framework-adapter layer.
- Add one manifest for Codex app-server. It must declare launch support, bounded timeout support, Paddock-owned sandbox posture, artifact publication support, token/runtime accounting where available, and non-interactive approval/user-input behavior.
- Integrate with `src/lib/task-dispatch.ts` only after SPEC-013B claim acquisition and runtime-inventory eligibility. Do not create a new launch route or operator launch button.
- Create or reuse SPEC-014A Paddock-owned lifecycle evidence before launch. The subprocess cwd must be the bounded lifecycle root.
- Spawn one `codex app-server` subprocess per admitted stage attempt. Use manifest timeouts and kill/cleanup on expiry.
- Assemble bounded input from existing task/GitHub/workflow/claim/manifest evidence. Do not serialize raw DB rows or secrets.
- Record `AgentRun`, task-stage attempt events, sandbox lifecycle events, activities, usage/failure summaries, and safe artifact references.
- Publish artifacts only through `publishArtifact` and existing secret/redaction behavior.
- Failure paths release/defer claims through existing reconciliation. Adapter code does not mark tasks done or failed and does not mutate GitHub.
- SPEC-014E and SPEC-014F are roadmap follow-ups only. Do not implement their retention or live-intervention UI behavior.

## Planning Questions To Resolve
- Is a new adapter result type needed, or can the existing `RuntimeInventoryEntry`, `AgentRun`, attempt, lifecycle, and artifact types carry all bounded evidence?
- Is any additive schema justified, or can existing runs/attempts/claims/lifecycles/artifacts/activities store all evidence?
- What exact command and protocol framing does `codex app-server` require in this environment?
- How are usage summaries extracted when usage events are absent?
- How are protocol errors sanitized and categorized?

## Reviewability Budget
- Target one primary surface: harness/adapter plus narrow dispatch/evidence seam.
- Stop and split if implementation requires a new dashboard, live intervention UI, transcript retention system, schema-heavy run platform, second adapter, OpenClaw behavior, or broad scheduler rewrite.
```

### Planned Artifacts

- `specs/014c-first-real-harness-adapter/plan.md`
- `specs/014c-first-real-harness-adapter/research.md`
- `specs/014c-first-real-harness-adapter/data-model.md`
- `specs/014c-first-real-harness-adapter/contracts/` for adapter protocol/evidence contracts if needed
- `specs/014c-first-real-harness-adapter/quickstart.md`

## Phase 4: Domain Checklists

Run these checklists after Plan:

```bash
$speckit-checklist api-contracts
$speckit-checklist security
$speckit-checklist data-integrity
$speckit-checklist error-handling
$speckit-checklist observability
$speckit-checklist scheduler-runtime
$speckit-checklist artifact-safety
$speckit-checklist uat-deployment
```

Checklist focus:

- API/contracts: adapter manifest, Codex protocol, run/evidence payload, runtime inventory eligibility, no new public mutation route unless justified.
- Security: cwd sandboxing, secret detection, no raw transcripts/provider/tool payloads, authorization, safe subprocess command construction.
- Data integrity: claim release/defer, attempt/run/lifecycle state ordering, idempotency, no task terminal/GitHub mutation.
- Error handling: unavailable binary, malformed protocol, unsupported user input, unsupported approval/tool/file request, timeout, unsafe evidence, cleanup failure.
- Observability: bounded activities, run summaries, usage summaries, lifecycle refs, operator-visible debug evidence.
- Scheduler/runtime: dispatch seam, feature flag OFF, governance deny/defer, duplicate claim prevention, stale state.
- Artifact safety: `publishArtifact`, redaction/quarantine, safe previews, sanitized descriptor-only behavior.
- UAT/deployment: HAL real launch, flag scope, cleanup, zero residue, app-server unavailable blocks UAT.

## Phase 5: Tasks

**When to run:** After checklists pass. Output: `specs/014c-first-real-harness-adapter/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

Generate dependency-ordered TDD-first tasks for SPEC-014C from:
- docs/ai/specs/SPEC-014C-design-concept.md
- docs/ai/specs/SPEC-014C-workflow.md
- specs/014c-first-real-harness-adapter/spec.md
- specs/014c-first-real-harness-adapter/plan.md
- specs/014c-first-real-harness-adapter/research.md
- specs/014c-first-real-harness-adapter/data-model.md
- specs/014c-first-real-harness-adapter/contracts/

Task requirements:
- Start with RED tests for manifest validation, runtime inventory eligibility, Codex app-server protocol adapter, failure mapping, timeout, artifact safety, claim release/defer, lifecycle cleanup, and feature flag OFF behavior.
- Add a static scope guard proving no second adapter, no OpenClaw-specific behavior, no live intervention UI, no transcript retention policy, no task terminal mutation, no GitHub mutation, no successor selection, and no auto-merge path.
- Keep implementation scoped to the harness-adapter layer plus the minimal dispatch/evidence seam needed to launch after claim acquisition.
- Include HAL UAT runbook/report tasks.
- Include PR review packet, roadmap/workflow status, and cleanup evidence tasks.
- Mark parallel tasks only when they touch disjoint files.
```

Task plan must include tests before implementation for:

- Successful Codex app-server launch evidence.
- Feature flag OFF and unassigned/ineligible runtime inventory blocking.
- Unsupported user-input/tool/file/approval request failure.
- Timeout expiry and subprocess termination.
- Unavailable binary and malformed protocol failure.
- Unsafe artifact/evidence rejection.
- Claim release/defer without task terminal/GitHub mutation.
- Lifecycle cleanup and zero-residue UAT fixtures.

## Phase 6: Analyze

**When to run:** After Tasks and before Implement.

### Analyze Prompt

```bash
$speckit-analyze

Analyze SPEC-014C for cross-artifact consistency across:
- docs/ai/specs/SPEC-014C-design-concept.md
- docs/ai/specs/SPEC-014C-workflow.md
- docs/ai/rc-factory-technical-roadmap.md
- specs/014c-first-real-harness-adapter/spec.md
- specs/014c-first-real-harness-adapter/plan.md
- specs/014c-first-real-harness-adapter/tasks.md
- generated research, data-model, contracts, quickstart, and checklists

Flag drift where any artifact:
- Implements a second real adapter or OpenClaw-specific behavior.
- Adds launch/stop/operator prompt UI, live answer capture, or approval UI in SPEC-014C instead of SPEC-014F.
- Adds raw transcript/event retention, replay/debug export, or raw-capture policy in SPEC-014C instead of SPEC-014E.
- Lets the adapter mutate task terminal state, GitHub state, successor selection, governance policy, Aegis/owner gates, or auto-merge.
- Runs outside the SPEC-014A Paddock-owned sandbox lifecycle root.
- Persists raw transcripts, provider payloads, tool payloads, prompt bodies, host paths, secrets, or unsafe evidence.
- Fails to require HAL real Codex app-server launch for UAT.
- Omits tests for unsupported user-input/tool/approval, timeout, unavailable binary, malformed protocol, artifact safety, feature flag OFF, and no terminal/GitHub mutation.
```

G6 passes only when no CRITICAL/HIGH findings remain and all follow-up ownership for SPEC-014E/F is consistent.

## Phase 7: Implement

**When to run:** After Analyze passes.

### Implement Prompt

```bash
$speckit-implement

Execute `specs/014c-first-real-harness-adapter/tasks.md` exactly.

Before editing:
1. Verify branch `014c-first-real-harness-adapter`.
2. Re-read `docs/ai/specs/SPEC-014C-design-concept.md`.
3. Re-read `specs/014c-first-real-harness-adapter/plan.md`.
4. Re-read `specs/014c-first-real-harness-adapter/tasks.md`.
5. Confirm no task asks for SPEC-014E/F behavior.

Implementation guardrails:
- Use TDD red/green/refactor.
- Keep all changes inside planned files.
- Preserve existing task dispatch, claim control, artifact, lifecycle, and runtime-inventory behavior.
- Use existing structured helpers and parsers rather than ad hoc string handling when available.
- Fail closed for unsafe protocol/events/evidence.
- Do not mark tasks terminal or mutate GitHub from the adapter.
- Do not auto-answer, auto-approve, auto-merge, or choose successors.
```

### Expected Verification

At minimum, implementation closeout should run the focused tests generated by Tasks plus:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Run full `pnpm test` outside the Codex sandbox if the task set touches shared runtime behavior. Run Playwright only if task-detail or Agents UI changes.

### Required UAT Report

Create `specs/014c-first-real-harness-adapter/uat-report.md` with:

- HAL target commit and service health.
- `codex app-server` availability/version proof.
- Feature flag scope.
- Disposable GitHub-linked assigned task/stage fixture.
- Real launch evidence.
- Usage/failure summaries.
- Sanitized artifact/redaction proof.
- Unsupported user-input/tool/approval proof.
- Timeout proof.
- Lifecycle cleanup proof.
- Zero disposable row residue.
- Statement that UAT blocks if Codex app-server is unavailable on HAL.

### Required Review Packet

Create `specs/014c-first-real-harness-adapter/pr-review-packet.md` with:

- What changed and why.
- Non-goals, especially SPEC-014E and SPEC-014F boundaries.
- Review order.
- Reviewability budget and any split exception.
- Traceability to requirements and tasks.
- Verification evidence.
- HAL UAT evidence.
- Rollback/flag story.
- Known gaps and follow-up specs.

## Closeout Notes

SPEC-014C is not complete when the branch is merely implemented. It is complete only after merge, target deployment promotion, flag-scoped HAL UAT with a real Codex app-server launch, and roadmap/workflow evidence updates.
