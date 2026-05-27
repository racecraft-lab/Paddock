# Mission Control AI Software Factory PRD

> Product source of truth for the Mission Control factory vision. Keep this
> document focused on durable why, what, constraints, and success criteria.
> Execution detail belongs in `docs/ai/rc-factory-technical-roadmap.md`,
> `specs/*`, workflow contracts, migrations, runbooks, and PR review packets.

## Purpose

Mission Control is a public OSS control plane for AI software factories. It
turns GitHub issues, workflow contracts, agent runtimes, isolated sandboxes,
artifacts, review gates, and cost governance into one observable operating
surface.

The first production proof is Mission Control itself: one Facility, Mission
Control as Product Line A, and Quality Assurance / Development / DevSecOps /
Marketing / Customer Service / Finance as departments. The product should let
agents triage issues, execute bounded remediation work, publish evidence, pass
review gates, and hand a PR to the owner without relying on private terminal
history or out-of-band context.

Mission Control is allowed to diverge from its historical fork origin. The
repo remains public and OSS under the existing license, but product decisions
should optimize for the factory vision and current installation compatibility,
not for indefinite cherry-pick compatibility with the pre-fork project.

## Operating Model

| Term | Meaning |
| --- | --- |
| Facility | The authenticated tenant/account boundary and aggregate operating mode. |
| Product Line | A software product or business line. It maps to the existing `workspaces` table. |
| Department | A functional area inside a Product Line. It maps to the existing `projects` table. |
| Stage Role | The role an agent plays in a workflow chain, such as researcher, planner, dev, reviewer, or Aegis. |
| Runtime Inventory | Visible agent identities and harness profiles that may or may not be assigned to Product Line work. |
| Sandbox | The isolated filesystem/worktree/session space for a run. The existing `agents.workspace_path` column remains a legacy storage name. |
| Workflow Contract | Repo-owned Markdown/YAML policy that can round-trip with `workflow_templates`. |
| GitHub Issue | The v1 tracker-of-record work item. |
| Mission Control Task | The local projection and enrichment layer for tracker-linked work. |
| Artifact | Durable handoff evidence published through Mission Control, not another agent's sandbox. |
| Review Packet | Human-readable and agent-readable summary of intent, changes, evidence, risks, and gates. |

## Design Principles

1. Repository knowledge is the system of record. PRDs, roadmaps, specs,
   workflow contracts, schemas, runbooks, and evidence live in versioned repo
   artifacts that agents and CI can inspect.
2. GitHub issues are the v1 intake and terminal-state source. Mission Control
   enriches them with workflow policy, assignment, governance, artifacts, run
   state, and review evidence.
3. Mission Control owns product task truth. Harnesses, CLIs, gateways, agent
   sessions, branches, PRs, and worktrees are execution artifacts.
4. Every active work item has an isolated sandbox/worktree and one serialized
   claim authority.
5. Harness choice is explicit. Codex/ChatGPT, Claude Code, OpenClaw, Hermes,
   OpenCode, and future adapters are selected through a capability-checked
   adapter contract.
6. Agents publish durable artifacts and review packets. Humans steer through
   goals, policy, review, deployment, and final owner decisions.
7. Architecture is enforced mechanically through feature flags, workflow
   contract validation, strict-scope checks, migration tests, route contracts,
   visual evidence, and governance gates.
8. Fork-only adapters remain optional, disabled by default, and absent-safe.
9. External reference context must be fetched into the active model context for
   Symphony-aligned and harness-engineering work. Do not rely on training data,
   stale summaries, or memory when scoping or planning these product surfaces.

## External Reference Context

The factory vision depends on external references that postdate many model
training cuts and can change over time. Any GPT-5.5 or later run that scopes,
specifies, plans, tasks, analyzes, implements, or reviews Symphony-aligned
control-plane work or harness-engineering work must fetch these sources into
the current context window during that run:

- OpenAI Harness Engineering:
  <https://openai.com/index/harness-engineering/>
- OpenAI Symphony announcement:
  <https://openai.com/index/open-source-codex-orchestration-symphony/>
- OpenAI Symphony service specification:
  <https://github.com/openai/symphony/blob/main/SPEC.md>

The generated design concept, workflow, plan, or review packet must record
the retrieval date, source URLs, and for GitHub sources the branch/ref or
commit when available. If the agent cannot fetch the sources, it must stop at
the phase gate and ask the operator for the current material instead of filling
gaps from model memory.

The context extraction should preserve these durable lessons:

- Harness Engineering: repository knowledge is the system of record; short
  maps should point to indexed, mechanically checked sources of truth; UI,
  logs, metrics, tests, and cleanup loops must be legible to agents.
- Symphony: tracker work items form the control plane; each active work item
  receives an isolated workspace; the orchestrator owns dispatch,
  reconciliation, retry, and observability.
- Symphony SPEC: workspace safety, tracker refresh, dispatch/reconciliation,
  retry, app-server/client policy, and validation profiles are conceptual
  contracts to adapt, not a stack to import wholesale.

Mission Control must adapt these references to its own
Next.js/React/TypeScript/SQLite stack, GitHub-first tracker model, SpecKit
task-chain governance, and OpenClaw/Codex/Claude/harness adapter boundaries.
The external references are source material for product intent and constraints,
not authority to replace Mission Control's stack or public OSS roadmap.

## Product Goals

1. Provide a Facility -> Product Line -> Department operating model without
   renaming existing SQL tables or breaking single-workspace installs.
2. Give operators a Product Line switcher with explicit Facility aggregate
   mode and Product Line scoped mode.
3. Represent global agents such as Aegis and Security Guardian separately from
   Product Line scoped agents.
4. Route GitHub issues through area labels, triage dispositions, and workflow
   contracts into department-specific work.
5. Support task-chain workflows where each stage has one assigned agent, one
   status, one artifact handoff path, and deterministic successor creation.
6. Add `ready_for_owner` as the owner handoff state for PR-producing work.
7. Persist dispositions, artifacts, review packets, governance decisions, run
   attempts, and reconciliation evidence.
8. Enforce WIP, blackout/degraded windows, and budget policies before
   autonomous work starts.
9. Make runtime inventory legible: visible, unassigned, assigned, eligible, and
   blocked states must be distinct in UI/API/review evidence.
10. Prove the system on Mission Control's own GitHub issues before generalizing
    to a second Product Line.

## Control-Plane Boundary

Mission Control remains the authority for:

- Product Line and department configuration.
- Workflow-template and workflow-contract policy.
- Task projection, assignment, chain lineage, and claim state.
- Resource-governance decisions.
- Artifact publication, redaction, retention, and review packets.
- Aegis, owner, and post-merge acceptance gates.
- GitHub issue/PR reconciliation.

Harness adapters may own:

- Sandbox/worktree creation when selected.
- Process/session launch and continuation.
- Transcript and event capture.
- Token/runtime accounting.
- Tool/MCP exposure within the run.
- Adapter-specific cleanup hooks.

Harness adapters must not bypass Mission Control's claim authority, workflow
policy, artifact handoff, review gates, governance checks, or tracker
reconciliation.

## Success Criteria

- **SC-1 Zero regression:** existing single-workspace installs continue to run
  with null/default values and all new behavior gated or opt-in.
- **SC-2 Product Line fidelity:** Facility mode and selected Product Line mode
  are visually and API-distinct; stale cross-product data is never shown after
  a scope transition.
- **SC-3 Global review agents:** Aegis and Security Guardian resolve through
  global scope with a compatibility path for legacy local records.
- **SC-4 GitHub issue pilot:** an eligible Mission Control issue flows from
  ingest through triage, remediation, review, Aegis, `ready_for_owner`, linked
  PR merge, and done.
- **SC-5 Triage telemetry:** dispositions are queryable by Product Line, agent,
  disposition, and date range for operator briefings.
- **SC-6 Artifact handoff:** downstream stages consume Mission Control artifact
  references instead of reading another agent's sandbox.
- **SC-7 Resource-governance safety:** policy decisions block, defer, or allow
  dispatch before new autonomous work begins.
- **SC-8 Workflow contract parity:** repo-owned workflow contracts can be
  imported, applied, exported, recovered from last-known-good state, and
  compared to runtime `workflow_templates`.
- **SC-9 Isolated run lifecycle:** every active run has one observable attempt,
  one sandbox owner, a recorded workflow version, and explicit terminal or
  retry state.
- **SC-10 Reconciliation safety:** terminal, blocked, duplicate, or ineligible
  tracker state releases or stops active runs and does not launch duplicate
  work.
- **SC-11 Review packet completeness:** pilot work produces a review packet
  with task chain, PR link, artifacts, validation evidence, governance/cost
  summary, and unresolved human gates.
- **SC-12 Runtime inventory clarity:** imported external agents are inspectable
  while autonomous eligibility requires assignment, adapter capability proof,
  flags, governance allow, and tracker-linked task eligibility.
- **SC-13 Second Product Line onboarding:** a second Product Line can be
  configured from templates and smoke-tested in under one operator-hour.
- **SC-14 Post-merge UAT loop:** merged spec work is deployed, narrowly
  enabled, checked by a human, and remediated until accepted or explicitly
  deferred.
- **SC-15 V2 gateway readiness:** v1 changes do not deepen assumptions that one
  process-global gateway or primary gateway row serves all future facilities.
- **SC-16 GitHub sync automation:** one Product Line can enable automatic
  GitHub issue polling, observe lifecycle state and failures, disable polling,
  and still use manual sync without duplicate ingestion.

## Functional Requirements

### FR-A Object Model And Scope

- **FR-A1:** UI and TypeScript use Facility, Product Line, Department, Stage
  Role, and Sandbox terminology. SQL `workspaces`, `workspace_id`, and
  `agents.workspace_path` remain unchanged in v1.
- **FR-A2:** `activeTenant` remains tenant/facility context. Product Line
  selection is separate state represented by `activeWorkspace` or equivalent
  scope payload.
- **FR-A3:** A seeded Facility workspace exists for global agent ownership and
  aggregate views, but the synthetic Facility switcher option is not confused
  with a normal Product Line row.
- **FR-A4:** Department projects may share one monorepo or have no repository.
  Product surfaces such as docs, website, UI, and macOS app are labels or
  structured metadata, not mandatory project rows.
- **FR-A5:** Tenant gateway readiness is preserved. Tenant is the
  facility/account boundary, not the Facility switcher option. Gateway-facing
  code should keep a future path where gateway registry rows, health probes,
  and OpenClaw config paths resolve from tenant context.

### FR-B Agents And Runtime Inventory

- **FR-B1:** Agents support local Product Line scope and global Facility scope.
- **FR-B2:** Global agents are visible across Product Lines, but cross-product
  work eligibility still requires explicit assignment and policy gates.
- **FR-B3:** Runtime inventory entries distinguish visible, unassigned,
  assigned, eligible, and blocked states.
- **FR-B4:** Runtime profile files stay role/domain-specific. Product, issue,
  workflow, and task context is injected by Mission Control at assignment or
  run time.
- **FR-B5:** OpenClaw and other external runtimes may provide identities and
  sandboxes, but Mission Control owns Product Line membership and task routing.

### FR-C Product Line UI And API Scope

- **FR-C1:** The header exposes a compact Product Line switcher with exactly
  two operating modes: Facility aggregate and selected Product Line.
- **FR-C2:** Mode-sensitive panels, REST calls, SSE streams, caches, selected
  entities, filters, and URL state are keyed by the active scope.
- **FR-C3:** Product Line requests send `workspace_id=<id>`. Facility aggregate
  requests send `workspace_scope=facility`. Requests sending both fail closed.
- **FR-C4:** Unauthorized workspace ids return `403`; ambiguous or invalid
  scope returns `400` or clears stale scoped state before rendering.
- **FR-C5:** Facility/global surfaces such as skills, runtime sessions,
  notifications, live feed, audit, and system health remain aggregate unless a
  later spec assigns them Product Line ownership.

### FR-D Workflow, Task-Chain, And Routing Policy

- **FR-D1:** `workflow_templates` remains the runtime table. A "task-chain
  template" is a domain alias over workflow-template rows, not a separate SQL
  table.
- **FR-D2:** Workflow templates can define slugs, output schemas, routing
  rules, static next-template slugs, PR-producing behavior, terminal events,
  and artifact policy.
- **FR-D3:** Successful stage completion validates structured output before
  routing. Invalid or missing output fails or stalls deterministically with
  operator-visible activity.
- **FR-D4:** Successor creation inherits Product Line and department scope,
  resolves assignees from project-role bindings, and prevents duplicate
  successors.
- **FR-D4a:** Successor tasks go through the shared `createTask()` helper so
  task creation side effects stay identical for API, GitHub import, recurring,
  and pipeline-created tasks.
- **FR-D5:** `ready_for_owner` is a first-class application status for
  PR-producing templates after review/Aegis approval and before linked PR merge.
- **FR-D6:** Non-PR-producing templates can still complete directly to done
  after the required review gates.
- **FR-D7:** Operators, not agents, own workflow-template and workflow-contract
  writes. Agents may propose changes through artifacts or PRs.
- **FR-D8:** Routing-rule evaluation uses a safe, bounded expression language:
  no `eval`, `Function`, VM execution, dynamic module loading, prototype-chain
  access, or JSONPath script/filter execution.

### FR-E GitHub Issue Control Plane

- **FR-E1:** GitHub issues are the v1 tracker of record for autonomous product
  work. Local-only tasks remain supported but are not runner-eligible unless a
  later tracker adapter owns them.
- **FR-E2:** Repo-level sync ownership prevents duplicate ingestion when
  several departments share one monorepo.
- **FR-E3:** `area:*`, `mc:*`, and `priority:*` labels route issues to the
  correct Product Line, department, status, and priority.
- **FR-E4:** Ambiguous or missing area labels route to triage with an activity
  explaining the ambiguity.
- **FR-E5:** Linked PR merge reconciles PR-producing tasks from
  `ready_for_owner` to done. Closed issues without merged linked PR evidence do
  not silently complete PR-producing tasks.
- **FR-E6:** GitHub issue polling is automatic only when enabled for a Product
  Line/workspace. Polling has bounded intervals, leases, pagination, backoff,
  cursor-safe failures, owner filtering, status diagnostics, disable controls,
  and manual sync fallback.

### FR-F Dispositions, Artifacts, And Review Packets

- **FR-F1:** Every triage completion writes one disposition record when the
  feature is enabled. Disposition write failure is logged and must not corrupt
  task-chain state.
- **FR-F2:** Artifacts support inline JSON, inline Markdown, file references,
  and external URIs with metadata, hashing, preview text, redaction status,
  scan status, and supersession.
- **FR-F3:** Secret detection rejects unsafe artifacts by default. Templates may
  opt into redacted storage, but raw secrets are never persisted.
- **FR-F4:** Aegis, Security Guardian, operators, and downstream agents can
  inspect artifact provenance, hashes, scan status, safe previews, and related
  review evidence.
- **FR-F5:** Review packets summarize the work without requiring reviewers to
  reconstruct intent from generated artifacts, terminal history, or branch
  archaeology.

### FR-G Resource Governance And Cost

- **FR-G1:** Existing Cost Tracker/token telemetry remains the measurement
  layer. New ingestion is added only for missing event sources.
- **FR-G2:** Policies support WIP limits, budgets, blackout windows, degraded
  windows, soft alerts, hard blocks, and operator overrides.
- **FR-G3:** Governance checks run before autonomous dispatch, task-chain
  advancement, and review-gate work that could launch more agent activity.
- **FR-G4:** Policy decisions are written to governance/audit surfaces with
  enough metadata to explain allow, defer, block, override-required, or
  override outcomes.
- **FR-G5:** OpenClaw health/electricity cost telemetry is a fork-only optional
  runtime adapter. Missing files, disabled flags, malformed data, or absent
  config must no-op cleanly.

### FR-H Runner, Sandbox, And Harness Adapters

- **FR-H1:** Runner dispatch requires a tracker-linked eligible task, workflow
  contract, adapter capability proof, assignment, resource-governance allow,
  and one serialized claim.
- **FR-H2:** Run attempts record lifecycle state, sandbox owner, workspace path,
  workflow version, adapter id, external session ids, transcript/event pointer,
  token/runtime totals, latest event, and summarized last message.
- **FR-H3:** Supported lifecycle states include preparing, building prompt,
  launching, running, continuing, succeeded, failed, timed out, stalled,
  canceled by reconciliation, and released.
- **FR-H4:** Retry/backoff is bounded and visible. Reconciliation runs before
  dispatch and stops or releases no-longer-eligible work.
- **FR-H5:** Adapter manifests declare launch, resume/continue, stop,
  transcript/event, token/runtime, artifact, sandbox, tool/MCP, memory, skill,
  plugin, provider-account, and user-input policies. Unsupported required
  capabilities fail closed.
- **FR-H6:** Sandbox ownership can be Mission Control, OpenClaw, or a future
  external harness. Ownership is visible before launch and after failure.

### FR-I Mission Control Product Line Pilot

- **FR-I1:** Seed Mission Control as the first Product Line from a repo-owned
  product-line config with department projects, workflow families, flags,
  governance defaults, and GitHub sync to `racecraft-lab/mission-control`.
- **FR-I2:** Issue Triage is the first workflow family. It classifies issues as
  actionable remediation, duplicate, obsolete, invalid, needs human
  clarification, needs specialist, or needs spec.
- **FR-I3:** Issue Remediation is the first execution family for bounded fixes
  that do not need a new spec: reproduce/plan, implement, verify, review,
  Aegis, `ready_for_owner`, owner merge reconciliation.
- **FR-I4:** SpecKit/SDD remains a later workflow destination for `NEEDS_SPEC`
  issues and must not be conflated with direct remediation.
- **FR-I5:** Existing synced Mission Control issues are treated as intake. They
  retain GitHub linkage and start through Issue Triage before remediation.
- **FR-I6:** Product Line seed inputs are checked-in, reviewable config
  artifacts with typed validation, preflight/apply/verify modes, and fail-closed
  behavior before writes.

### FR-J Workflow Contracts And Harness Gardening

- **FR-J1:** The Mission Control workflow family is represented by repo-owned
  Markdown/YAML contracts under `docs/ai/workflows/`.
- **FR-J2:** Contracts round-trip with runtime `workflow_templates` by slug,
  role, prompt version, schema hash, routing hash, terminal event, and feature
  flag dependency.
- **FR-J3:** Invalid contract import, apply, export, or reload fails closed and
  preserves last-known-good runtime behavior.
- **FR-J4:** Harness-gardening automation looks for stale PRD/roadmap/workflow
  claims, broken links, missing evidence, stale flag statuses, low-value tests,
  and strict-scope drift, then opens targeted work.
- **FR-J5:** `AGENTS.md` remains a concise navigation map. Long-lived policy
  belongs in PRD, roadmap, spec, runbook, workflow, or contract artifacts.

## Data And Migration Policy

The PRD intentionally does not duplicate full DDL. Durable data-model direction
is limited to the entities Mission Control needs:

- Agent scope.
- Product Line feature flags.
- Workflow-template routing/contract fields.
- Task workflow binding and chain lineage.
- Task dispositions.
- Task artifacts.
- Resource policies and policy events.
- Workflow-contract diagnostics and last-known-good snapshots.
- Product Line seed configs and seed verification evidence.
- GitHub sync lifecycle control state and run history.
- Run/claim/sandbox state for later runner phases.

Migrations are additive unless a future spec explicitly justifies otherwise.
Rollback SQL, data-shape truth, and exact schema constraints live with the
owning spec and migration artifacts.

## Non-Functional Requirements

- **NFR-1 Compatibility:** default/null values preserve existing deployments.
- **NFR-2 Feature-flag safety:** new autonomous behavior is off until
  explicitly enabled for the intended Product Line or Facility scope.
- **NFR-3 Single-agent primacy:** a task has one assigned agent, one status,
  and one kanban card. Multi-agent work is modeled as a task chain.
- **NFR-4 Auditability:** state transitions, dispositions, artifacts, review
  gates, governance decisions, retries, and reconciliations are inspectable.
- **NFR-5 Secret safety:** artifact and review-packet persistence reuses the
  repository secret detector and redaction policy.
- **NFR-6 Performance:** routing, validation, and governance checks are bounded
  and measured against flag-off baselines.
- **NFR-7 Restart recovery:** process restart reconciles from durable
  Mission Control state, GitHub state, and sandbox inspection, not in-memory
  scheduler assumptions.
- **NFR-8 Adapter absence safety:** optional adapters no-op cleanly when
  disabled, unconfigured, unavailable, or missing files.
- **NFR-9 Reviewability:** every autonomous run leaves enough evidence for a
  second agent and a human reviewer to reproduce, assess, and continue it.
- **NFR-10 Human gates:** owner merge and post-merge UAT stay explicit human
  gates unless an operator records a narrower policy.
- **NFR-11 Dependency safety:** new runtime dependencies are direct, pinned,
  reviewed, and covered by lockfile/audit checks.
- **NFR-12 Schema truthfulness:** docs and tests must not assert nonexistent
  tables, columns, constraints, or status semantics.
- **NFR-13 Successor side-effect parity:** task-chain successor creation shares
  the normal task creation path rather than maintaining a parallel insert path.

## Compatibility And Fork Stance

Mission Control should classify new work by operational impact:

| Class | Meaning |
| --- | --- |
| `install-compatible` | Preserves current Mission Control installs through null/default/flag-off behavior. |
| `factory-core` | Required for the Mission Control factory vision, even when it creates long-term fork divergence. |
| `optional-adapter` | Runtime or host-specific integration that is disabled by default and absent-safe. |

The design target is install compatibility plus clear operator rollout, not
permanent pre-fork parity. "Additive migration" means runtime-safe by default;
it does not automatically make a feature low-risk or broadly reusable.

## Non-Goals

- Renaming SQL `workspaces`, `workspace_id`, or `agents.workspace_path` in v1.
- Replacing Mission Control with a CLI-only scheduler or a different runtime
  stack.
- Letting agents create or mutate production workflow policy without operator
  review.
- Treating local terminal state, private chat, or another agent's sandbox as
  durable handoff state.
- Cross-product agent sharing by default.
- Product Line user ACLs in v1.
- Multi-facility live gateway isolation in v1.
- Non-GitHub tracker adapters in v1.
- Product-line skill ownership or session transcript ownership in v1.
- OpenClaw health/cost telemetry as required core behavior.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| R1 Global Aegis refactor changes review behavior | Ship behind clear resolver tests and retain a legacy local-record compatibility path. |
| R2 Product Line scope leaks stale UI/API data | Use scope-keyed caches, request params, SSE filtering, stale-response rejection, and cross-tab transition handling. |
| R3 Routing-rule expression safety | Enforce FR-D8 and CI-greppable bans on unsafe execution primitives. |
| R4 Workflow contract drift | Use hash parity, last-known-good snapshots, fail-closed validation, and diagnostics. |
| R5 Duplicate GitHub ingestion across departments | Use repo-level sync ownership plus existing unique linkage as a final guard. |
| R6 Disposition/artifact tables grow without bounds | Add retention, archive, health, and admin maintenance surfaces. |
| R7 Cost appears as zero for subscription providers | Track raw usage separately from estimated marginal USD and enforce raw usage budgets where needed. |
| R8 Optional adapters become hidden hard dependencies | Require dedicated flags, explicit config, and absence-safety checks. |
| R9 Runner crash duplicates work | Serialize claims in Mission Control and reconcile tracker/task state before every launch. |
| R10 Review packets leak secrets | Reuse artifact secret detection/redaction before persisting summaries or previews. |
| R11 Agents amplify stale docs or low-value tests | Run harness-gardening as targeted recurring work, not broad rewrite campaigns. |
| R12 Global gateway coupling blocks multi-facility v2 | Preserve tenant-aware gateway seams and avoid adding new process-global gateway assumptions. |

## Rollout Source Of Truth

The technical roadmap owns phase sequencing, status, dependency order, and the
next unblocked spec pointer after each implementation PR merges. Spec
directories own detailed requirements, generated tasks, checklists, research,
data models, exact acceptance evidence, and completion notes. Migration files
own exact DDL. Workflow contracts own executable agent policy.

This PRD only changes when the durable product direction, operating model,
requirements, or success criteria change.

## Open Questions

- How should Product Line scoped chat/session ownership work after the runner
  state model is stable?
- Which skill/library permissions need Product Line scoping in v2?
- What is the normalized tracker contract for Jira/Linear-style adapters after
  the GitHub issue pilot is proven?
- How long should successful, failed, and stalled sandboxes persist after
  artifacts and review packets are durable?
- What tenant-aware gateway registry shape is required before true
  multi-facility hosting?
