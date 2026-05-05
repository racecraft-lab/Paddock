# Mission Control AI Software Factory PRD

> For SpecKit-Pro ingestion. Execute in phases (schema -> switcher -> spec archive/evidence policy -> Aegis refactor -> pipeline engine -> state extension -> labels -> logging -> governance -> Symphony-style pilot), with **zero regression for existing single-workspace deployments** as the primary acceptance criterion and **explicit upstream-impact disclosure** for every phase.

## SpecKit-Pro Usage

This PRD is the product and architecture source of truth for the Mission Control departmental architecture.

The companion technical roadmap at `docs/ai/rc-factory-technical-roadmap.md` defines spec sequencing, dependency order, and the individual autopilot execution units used by SpecKit-Pro setup and autopilot. Wikilinks (`[[…]]`) elsewhere in this PRD point to companion notes in the operator's Obsidian vault and are NOT required for autopilot ingestion; consensus agents should treat them as informational only.

Workflow files under `docs/ai/specs/SPEC-*-workflow.md` are execution records created by SpecKit-Pro setup/autopilot for individual specs. They should capture per-spec prompts, phase outputs, gate results, implementation notes, and completion status.

Spec archive and evidence retention is governed by SPEC-002A. Autopilot starts
with Archive Sweep discovery for previously merged specs, excludes the current
target spec, records recovery commands before cleanup, and treats visual
regression/CI provenance as the durable UI evidence path instead of committing
generated screenshots by default.

This PRD should preserve the durable **why**, **what**, **success criteria**, and **constraints** for the architecture. It should not become the per-spec execution ledger or duplicate the detailed workflow records.

## Harness Engineering + Symphony Integration

This PRD adopts the useful parts of OpenAI's harness-engineering practice and Symphony service design while staying on Mission Control's existing stack: Next.js 16, React 19, TypeScript, SQLite, better-sqlite3, Zustand, Tailwind, pnpm, GitHub sync, OpenClaw integration, and SpecKit-Pro workflow artifacts.

The adopted harness-engineering principles are:

1. **Repository knowledge is the system of record.** `AGENTS.md` stays a map, while PRDs, roadmaps, workflow specs, runbooks, schemas, verification evidence, and operator guides live in versioned repository documents that agents can inspect and CI can validate.
2. **Agent legibility is a product requirement.** Mission Control must expose task state, run state, logs, metrics, artifacts, cost, governance decisions, validation results, and human feedback in forms that agents can consume without hidden Slack/Google Docs/operator context.
3. **Architecture is enforced mechanically.** Specs, feature-flag matrices, strict-scope manifests, route contracts, migration rollback files, visual evidence, and guardrail scripts are first-class harness components, not after-the-fact documentation.
4. **Entropy gets continuous cleanup.** Recurring audit/gardening tasks should detect stale docs, low-value tests, schema drift, broken links, stale workflow contracts, and architectural boundary violations before they compound.
5. **Humans steer through goals and review packets.** Agents execute in bounded sandboxes, publish durable artifacts, answer reviews, and escalate only when judgment, credentials, or final owner approval is required.

The adopted Symphony ideas are:

1. **GitHub issues are the v1 work-item control plane.** For Symphony-aligned autonomous work, GitHub Issues are the tracker of record and Mission Control task rows are synchronized projections enriched with workflow, assignment, governance, artifact, and run metadata. Individual Codex sessions, PRs, branches, and worktrees are implementation artifacts, not the primary unit of management.
2. **Every active work item has an isolated execution workspace.** Mission Control uses its existing Agent Sandbox terminology plus git worktrees or OpenClaw-managed sandboxes to keep per-task commands, logs, artifacts, and credentials isolated.
3. **Workflow policy is repo-owned.** Mission Control keeps SQLite `workflow_templates` as the runtime store, but the source-of-truth workflow family for a product line must be exportable/importable as a versioned Markdown contract with YAML front matter and prompt body, analogous to Symphony's `WORKFLOW.md`.
4. **The orchestrator owns dispatch, retries, reconciliation, and cancellation.** Mission Control already has task-chain and governance primitives; the next pilot must add Symphony-style run lifecycle visibility around workspace preparation, harness-adapter launch, stalled/failed/continued attempts, terminal-state cleanup, and restart recovery.
5. **Observability is operator-facing and agent-facing.** Mission Control's Status, Cost Tracker, Audit, Dispositions, Artifacts, Governance, and Session surfaces should make long-running agent fleets debuggable without terminal hopping.

Mission Control does **not** adopt Symphony wholesale. Symphony's current spec is intentionally a language-agnostic scheduler/runner without a rich web UI or multi-tenant control plane; Mission Control's product is the richer control plane. Symphony's Elixir prototype is reference material only; Mission Control stays on the existing TypeScript/Next.js/SQLite stack.

Source references for this integration: OpenAI's [Harness Engineering](https://openai.com/index/harness-engineering/) article, OpenAI's [Symphony announcement](https://openai.com/index/open-source-codex-orchestration-symphony/), Symphony's [`SPEC.md`](https://github.com/openai/symphony/blob/main/SPEC.md), and Symphony's [Elixir prototype README](https://github.com/openai/symphony/blob/main/elixir/README.md).

## Control-Plane Boundary

Existing Mission Control manual, recurring, REST, CLI, and MCP task flows remain supported for non-Symphony use cases. The Symphony-aligned pilot and runner phases use a stricter boundary:

1. **GitHub Issues are the source work item.** Status, priority, area, issue closure, and linked PR merge evidence flow through the existing `mc:*`, `priority:*`, and `area:*` label protocol plus GitHub issue/PR state.
2. **Mission Control tasks are the local projection and enrichment layer.** Task rows store GitHub linkage, workflow-template binding, chain lineage, assignee/stage state, disposition records, artifact references, governance decisions, and run/retry metadata.
3. **The web UX is config, admin, control, and observability.** Operators use the app to configure product lines, departments, sync ownership, workflow templates, feature flags, policies, gates, review packets, artifacts, and audit/run views. The task board and task APIs remain available for legacy/manual work, but the SPEC-009+ pilot must not depend on creating local-only tasks through the web UI.
4. **Harness choice is explicit per workflow/run.** OpenClaw may own sandbox/workspace preparation, process control, session messaging, and optional health/cost telemetry when selected, but Mission Control can also own the git worktree/sandbox and launch Codex, Claude Code, Hermes, OpenCode, or another harness directly. No harness owns product task truth or replaces the GitHub issue tracker.
5. **Agent sessions are run artifacts.** Codex, Claude Code, Hermes, OpenCode, gateway sessions, branches, PRs, and worktrees are attached to GitHub-linked Mission Control tasks as evidence and execution state.

## Goal

Extend the `racecraft-lab/mission-control` fork (upstream `builderz-labs/mission-control`) into an AI software factory control plane for a **facility -> product-line -> department** operating model, starting with **Mission Control itself as Product Line A in the first facility** and Quality Assurance as the first department. Enable always-on, issue-driven, multi-stage autonomous workflows (researcher -> planner -> dev -> reviewer -> Aegis -> owner merge) while preserving every existing single-workspace deployment byte-compatibly.

## Architecture

Mission Control remains the source of truth for product-line hierarchy, workflow policy, stage assignments, governance, artifacts, local task projections, and run metadata. For Symphony-aligned autonomous work, GitHub Issues are the tracker of record for product work intake and external terminal state. The existing `tenant → workspace → project → task` hierarchy is retained without SQL rename — `workspace` formally represents a **product line** at the UI/domain layer, `project` represents a **department**, and `project_agent_assignments.role` represents the **stage role** an agent plays in a task-chain template.

A new **task pipeline engine** auto-chains tasks based on declarative routing rules evaluated against structured agent output. **Aegis is refactored** from per-workspace resolution to facility-wide via a new `scope='global'` flag on agents. **GitHub sync routes issues** via a new `area:*` label family to the correct department project within a product line's monorepo. **Resource governance** extends the existing Cost Tracker into enforceable WIP limits, blackout/degraded windows, and budget gates before autonomous work is started. Facility electricity / infrastructure usage and cost from the OpenClaw health cron are part of the same governance surface, but only through a fork-only optional adapter.

The Symphony-inspired runtime layer sits above those merged primitives. It ingests GitHub issues into Mission Control tasks, claims eligible GitHub-linked task stages, maps each active work item to an isolated sandbox/worktree, renders a repo-owned workflow contract into a harness-specific run request, records each run attempt and live session, and reconciles GitHub issue/PR state with Mission Control task-chain status. Mission Control's database remains the durable local projection and control metadata store; per-run workspace state is isolated, resumable, and safe to clean up when the GitHub issue reaches a terminal state.

The runner is **harness-agnostic by design**. Current Mission Control already observes and controls local Claude Code, Codex CLI, Hermes, OpenCode, and OpenClaw gateway sessions through normalized session, transcript, command, and task-dispatch surfaces. Future runner specs must formalize that shape as a harness adapter contract instead of privileging one execution loop. An adapter declares launch/resume/continue/stop support, session id shape, transcript/event reader, token/runtime accounting, artifact publication, sandbox policy, tool/user-input behavior, MCP exposure, skill/plugin/memory roots, and provider/account constraints. OpenClaw remains an optional gateway/sandbox/runtime adapter; Codex/ChatGPT and Claude Code can be native local harnesses; Hermes/OpenCode can be observation or execution adapters according to the capabilities they can safely expose.

Sandbox ownership is a first-class run decision. A workflow can select `sandbox_owner = openclaw` when OpenClaw should provision and supervise the workspace, `sandbox_owner = mission_control` when Mission Control should create the git worktree and invoke a local harness directly, or `sandbox_owner = external_harness` when a future adapter returns a bounded workspace/session handle. In all cases, Mission Control remains the authority for claim state, governance, review gates, artifact handoff, and GitHub/task reconciliation.

As of 2026-05-04, SPEC-004 is merged on PR #22 as `20643d8`, SPEC-005 is merged on PR #23 as `851571f`, SPEC-006 is merged on PR #21 as `dbb6c75`, SPEC-007 is merged on PR #25 as `953f29b`, and SPEC-008 is merged on PR #26 as `bd9a693`. The next pilot work is split into SPEC-009A through SPEC-009D: workflow-contract roundtrip, Mission Control product-line seed/flag/governance activation, GitHub-linked self-hosting smoke, and a review-packet/lifecycle snapshot. This split makes Mission Control itself the first product line and proves the system by having agents work Mission Control GitHub issues toward completion and deployment before the formal runner/adapters are added.

## Tech Stack

- **Existing**: Next.js 16, React 19, TypeScript 5.x (`package.json` spec `^5.7.2`; current lockfile resolves 5.9.3), better-sqlite3 (SQLite), Zustand, xyflow/react, reagraph, pnpm, Node ≥22, existing REST + SSE API surface.
- **New**: Phase 0 schema additions only: one new column on `agents` (`scope`), four new tables (`task_dispositions`, `task_artifacts`, `resource_policies`, `resource_policy_events`), a feature-flag storage column on `workspaces` (`feature_flags JSON`), routing/chain/artifact-policy columns on `workflow_templates`, and task-chain binding/lineage columns on `tasks`. Later v1 runtime specs add the pinned schema-validation dependency (`ajv`), the application-level `ready_for_owner` vocabulary, and the UI/config/doc-copy rename from agent filesystem "workspace" to "Sandbox" while the existing `agents.workspace_path` SQL column remains unchanged. OpenClaw electricity / infra cost support is **not** a schema feature in v1; it is a runtime-only optional adapter.
- **Testing**: existing Playwright/Vitest patterns + new migration tests + scheduler unit tests for routing + pilot smoke (see Smoke Plan).
- **Security (fork-only optional):** CrabTrap (`github.com/brexhq/CrabTrap`) honeypot on the operator node — decoy endpoints detect unauthorized access attempts against the AI/software factory REST API and agent sandboxes. Absent-safe and disabled by default; no-ops cleanly when config is missing.

---

## Upstream Compatibility Contract

This PRD now follows D13: **Upstream-First Extension Discipline**.

Every major feature and every roadmap phase must be classified as one of:

| Class | Meaning |
|---|---|
| `upstream-safe` | additive, opt-in, and reasonable to upstream |
| `upstream-divergent` | preserves runtime compatibility for current installs but creates schema/state/API divergence that increases permanent-fork pressure unless upstream accepts it |
| `fork-only optional` | OpenClaw/local-environment-specific integration that must be absent-safe, config-gated, and disabled by default |

Non-negotiable rules:

1. **If a change is upstream-divergent, the docs must say so plainly before implementation.**
2. **OpenClaw-only features must be adapters, not required core behavior.**
3. **If an upstream-safe adapter exists, prefer it over a schema divergence.**
4. **"Additive migration" does not equal "upstream-safe."** It only means existing deployments are less likely to break at runtime.
5. **OpenClaw health electricity/infra support is fork-only optional in v1.** If the health files/config are absent, Mission Control must behave exactly as it does today.

## 1) Problem Statement

Mission Control's hierarchy supports multi-workspace at the schema layer (50 migrations applied, latest id `052`, `workspace_id` propagated to 19+ scoped tables) but **not at the UI/request layer**. The live client store at `src/store/index.ts` has `activeTenant` and `activeProject`, but no `activeWorkspace`; `activeTenant` is a super-admin / tenant context, not the Product Line switcher. The current header (`src/components/layout/header-bar.tsx:320`) visually labels tenant context as "Workspace," which must stop. Core APIs and the SSE stream primarily scope to `auth.user.workspace_id`, so a client-side dropdown alone cannot select a different product line. The mismatch causes:

1. Operators cannot scope their view to one product line. All panels effectively render the authenticated workspace.
2. Facility-wide singletons (Aegis, Security Guardian) are resolved per-workspace in `src/lib/task-dispatch.ts` — the function `runAegisReviews` starts at line 376 and declares `aegisAgentByWorkspace = new Map<number, ReviewAgentRecord>()` at line 394, with `.get()` at line 422 and `.set()` at line 435; `resolveGatewayAgentIdForReviewAgent` at line 80 also keys lookups by workspace. This contradicts the global-singleton design intent recorded in the operator's vault (informational reference; not required for autopilot ingestion).
3. No native multi-stage task chain exists. The orchestration patterns reference (`docs/orchestration.md` in this repo, plus the operator's vault notes) documents this explicitly: Mission Control does not currently support a native same-task multi-agent handoff lane. Existing `workflows` are single-step prompt templates backed by the live `workflow_templates` table; existing `pipelines` are operator-supervised ordered bundles, not task-generating.
4. GitHub sync is project-driven (`pullFromGitHub(project, workspaceId)`), which can duplicate ingestion when many department projects share one monorepo unless repo-level ownership or dedupe is introduced.
5. No telemetry for triage dispositions. Operators cannot answer "how many issues did we triage as OBE last week" without manual GitHub scraping.
6. Two colliding senses of "workspace" (tenant/product-line hierarchy vs. agent filesystem sandbox) create ambiguity that worsens as the fork evolves.

Result: the fork supports running one product (Mission Control itself as Product Line A), one department, manually. It cannot operate a factory.

## 2) Product Objectives

### Primary objectives

1. **Departmental object model** — reuse existing hierarchy per D1 (`workspace` = product line, `project` = department, `project_agent_assignments.role` = stage role, `facility` workspace for globals).
2. **Terminology deconfliction** per D2 (UI "Product Line", TS `ProductLine`, SQL `workspace_id` unchanged; agent filesystem renamed "Sandbox").
3. **Facility-wide agent scope** per D3 (add `scope='global'` column; refactor Aegis + Security Guardian + OpenClaw to global).
4. **Product-line switcher** in header-bar with hybrid panel filtering per D4b.
5. **Auto-chained task chains** with declarative routing per D5. A "task-chain template" is a domain alias over the live `workflow_templates` table, not a new SQL table. Phase 0 must add explicit workflow-template identity, task binding, and task-chain lineage before implementation.
6. **`ready_for_owner` state** per D6; **two-step terminal event** for PR-producing tasks per D7.
7. **Monorepo + area-label GitHub routing** per D8, with repo-level sync ownership/dedupe so shared department projects do not ingest the same issue multiple times.
8. **Task disposition logging** per D9.
9. **Shared task artifact store** per D11.
10. **Resource governance** per D12, reusing Cost Tracker data to enforce WIP limits, blackout/degraded windows, and budgets.
11. **Symphony-compatible issue runner** — GitHub issue/task tracker as the control plane, one isolated sandbox/worktree per active GitHub-linked work item, bounded concurrency, retries, stall detection, and reconciliation.
12. **Repo-owned workflow contracts** — versioned Markdown workflow files with YAML front matter and prompt bodies that can seed/sync `workflow_templates` without making the database the only source of policy truth.
13. **Harness-adapter execution path** — launch and observe Codex/ChatGPT, Claude Code, OpenClaw gateway, Hermes, OpenCode, or future adapter sessions from Mission Control-controlled sandboxes, with turn/session metadata captured into Mission Control.
14. **Agent-legible operations surface** — logs, metrics, run state, artifact previews, governance decisions, and review packets accessible to both operators and downstream agents.
15. **Mission Control GitHub issue remediation workflow family** operational end-to-end as Product Line A (pilot).

### Success criteria

- **[SC-1] Zero-regression** — every existing single-workspace deployment runs unchanged after applying all migrations. `workspace_id=1` fallback preserved. All new behavior feature-flag-guarded or null-default.
- **[SC-2] Pilot end-to-end** — one eligible `racecraft-lab/mission-control` GitHub issue, or a synthetic `[mc-pilot]` GitHub issue when no safe live candidate exists, is ingested into Mission Control and flows **triage → plan → dev → review → Aegis → ready_for_owner → linked PR merged (done)** without operator intervention beyond the final PR merge click.
- **[SC-3] Switcher fidelity** — product-line switcher exposes exactly two operating modes: **Facility** aggregate mode and selected **Product Line** mode. Mode-sensitive panels filter to the selected Product Line, while Facility mode renders authorized aggregate data across the authenticated tenant/facility boundary.
- **[SC-4] Global Aegis** — Aegis resolves via `scope='global'` lookup; `aegisAgentByWorkspace` map is either removed or retained only as a backward-compat shim for legacy workspace-scoped Aegis records.
- **[SC-5] Disposition telemetry** — morning-briefing metric "Last 7d: N triaged, X ACTIONABLE, Y OBE, Z DUPLICATE, W NEEDS_SPECIALIST" queryable from `task_dispositions`.
- **[SC-6] Second product line onboarding** — Product Line B platform onboarded in < 1 operator-hour given seed templates (Phase 9B validation).
- **[SC-7] Upstream compat preserved** — cherry-picking from `builderz-labs/mission-control` `main` remains viable (no rename of `workspaces` table or `workspace_id` columns).
- **[SC-8] Artifact handoff durability** — researcher/planner/dev/reviewer/Aegis handoffs are persisted in `task_artifacts`; downstream agents consume MC artifact references rather than reading another agent's sandbox.
- **[SC-9] Resource governance safety** — WIP, blackout/degraded window, and budget policies block or defer new autonomous work before scheduler dispatch, while Cost Tracker continues to show spend/usage and policy decisions.
- **[SC-10] Blended cost visibility** — Cost Tracker shows both token/API spend and facility electricity/infra spend from OpenClaw health telemetry, with combined totals available for governance and operator review.
- **[SC-11] Upstream impact transparency** — every roadmap phase and every major feature is labeled `upstream-safe`, `upstream-divergent`, or `fork-only optional`.
- **[SC-12] OpenClaw health absence safety** — installs without OpenClaw health cron artifacts continue to function with no config errors, API breakage, or UI regressions.
- **[SC-13] Successor sync parity** — every successor task created by `advanceTaskChain` triggers the same outbound side effects as standard task creation, including GitHub issue creation/update and GNAP push where configured.
- **[SC-14] Product-line request scoping** — mode-sensitive REST endpoints and `/api/events` support explicit authorized scope. Product Line requests send `workspace_id=<id>`; Facility aggregate requests send `workspace_scope=facility`; requests sending both return `400`; unauthorized workspace ids return `403`; omitted scope is reserved for feature-flag-off legacy behavior only.
- **[SC-15] V2 gateway readiness** — v1 PRs that touch gateway-facing code do not add new direct assumptions that one process-global OpenClaw gateway or one global `gateways.is_primary` row serves all tenants. Any unavoidable compatibility path is isolated behind a named helper or existing gateway adapter and references V2-001 in the roadmap.
- **[SC-16] Facility/Product Line transition lifecycle** — switching between Facility and Product Line validates persisted scope, keeps `activeTenant` unchanged, uses scope-keyed caches/requests/events, clears stale scoped selections and URL params, ignores stale in-flight responses, synchronizes other tabs safely, and never shows stale cross-product UI after the transition.
- **[SC-17] Workflow contract parity** — the Mission Control Product Line workflow family can be exported from, and re-imported into, Mission Control as a repo-owned Markdown contract without changing the runtime behavior of seeded `workflow_templates`.
- **[SC-18] Isolated run lifecycle** — every active Mission Control pilot task has one observable run attempt at a time, an isolated workspace path, a recorded prompt/workflow version, and explicit lifecycle states for preparing, running, continued, failed, stalled, canceled, and completed attempts.
- **[SC-19] Reconciliation and retry safety** — if an issue/task becomes terminal, blocked, or no longer eligible, Mission Control stops or releases the active run and does not launch duplicate work. Transient failures retry with bounded backoff and visible reason codes.
- **[SC-20] Agent-readable review packet** — the pilot produces a Mission Control review packet with task chain, PR link, artifact references, validation evidence, cost/governance summary, and unresolved human gates before the operator merges.
- **[SC-21] Harness-gardening loop** — stale PRD/roadmap/workflow/runbook claims and low-value or missing verification surfaces are discoverable by an automated docs/quality audit that can open a targeted follow-up task.

### Non-goals (v1)

- Staged same-task multi-agent handoff (rejected — breaks D5 / constraint #2).
- User ACLs per product line (D4e, deferred to v2).
- Cross-product-line agent loan or sharing (D4a rejected — strict twin).
- Mega-monorepo across product lines (D8 explicitly per-product-line monorepo).
- Rename of SQL `workspaces` table (D2 — upstream compat constraint).
- Replacing the web UI with a CLI (out of scope; covered by the separate 2026-03-20 PRD).
- Staged workflows for non-GitHub workflow families (Release Readiness, etc.) — deferred to phase 2+.
- Using the web task form as the source for Symphony pilot work. Manual/API task creation remains supported for legacy and non-GitHub work, but SPEC-009+ autonomous pilot dispatch starts from GitHub-linked tasks.
- Silently normalizing OpenClaw-only assumptions into upstream Mission Control core behavior.
- Multi-facility tenant modeling. v1 treats the authenticated tenant as the Facility aggregate boundary; it does not introduce a tenant containing multiple independent facilities.
- Product-line skill ownership, assignment, permissioning, CRUD, or visibility filters. Skills remain Facility/global in SPEC-002.
- Session-to-workspace transcript mapping. Local/gateway sessions and transcripts remain Facility/global unless a later spec adds explicit ownership.
- Rewriting Mission Control in Elixir/OTP or adopting Symphony's prototype runtime stack.
- Replacing Mission Control's web dashboard with a CLI-only or terminal-only orchestration service.
- Limiting the product to Linear. GitHub remains the v1 tracker; Linear/Jira-style adapters can be added later through the normalized tracker model.
- Letting agents create or edit workflow contracts without operator review. Agents may propose patches, but operator-owned PR review remains the write gate for repo-owned policy.

## 3) Compatibility Snapshot

This is the current honest fork-pressure picture.

### Likely `upstream-safe` or at least upstreamable

- Product-line switcher UI and `activeWorkspace` scoping
- Area-label GitHub routing
- Optional feature-flagged governance hooks
- Runtime-only optional OpenClaw health cost adapter

### Explicitly `fork-only optional`

- Running CrabTrap honeypot decoy service on the operator node to detect unauthorized access to Mission Control API surfaces and agent sandboxes
- Processing CrabTrap alert webhooks to create `activities` rows of kind `security_intrusion_detected` in Mission Control
- Reading electricity / infra telemetry from `~/.openclaw/health/readings.jsonl`
- Reading `~/.openclaw/health/current-rate.json`
- Reading `~/.openclaw/health/cost.json`
- Any UI or API surfaces that render those OpenClaw-specific cost metrics

### Explicitly `upstream-divergent` unless upstream accepts them

- `agents.scope` column
- `workspaces.feature_flags` column
- task-chain binding/lineage columns on `tasks`
- later runtime spec task-status vocabulary gaining `ready_for_owner` with no SPEC-001 DB CHECK change
- `workflow_templates` gaining slug/routing/output/terminal-event columns for task-chain use
- `task_dispositions` table
- `task_artifacts` table
- `resource_policies` and `resource_policy_events` tables

If those schema/state changes are unacceptable as long-term fork pressure, the implementation strategy must change before coding starts.

Agent filesystem "Sandbox" terminology is UI/config-level in v1. The live schema contains `agents.workspace_path`; v1 keeps that SQL column unchanged and does not add `sandbox_path`.

## 4) Personas

1. **Facility operator** (`operator` today) — runs multiple product lines, needs focus mode + cross-product awareness. Primary user.
2. **Future product-line owner** — delegate for a single product line. May be ACL-restricted in v2 (D4e deferred).
3. **Autonomous agent** — **subject** of the system, not a user. Consumes templates, produces structured output matching `output_schema`. **Does NOT** create or choose successor templates.
4. **External contributor** — files GitHub issues, receives disposition comments on closure, sees `mc:*` / `area:*` / `priority:*` labels.

## 5) Functional Requirements

### A. Object model & naming (D1, D2)

- **FR-A1:** Three-layer naming scheme enforced. UI + TS domain uses "Product Line" / `ProductLine` for SQL workspaces. SQL `workspaces` / `workspace_id` unchanged. Agent filesystem workspace terminology renders as "Sandbox" in UI/config copy in a later v1 spec, not SPEC-001/Phase 0. The live schema (verified 2026-04-24 at `src/lib/migrations.ts:1041-1042`) DOES contain `agents.workspace_path`. v1 decision: **keep the SQL column name as-is** (`agents.workspace_path`); rename only UI labels, config keys, TypeScript type names (`AgentSandbox`), error messages, log strings, and external doc copy. v1 ships **NO** `ALTER TABLE agents RENAME COLUMN` and **NO** `ADD COLUMN sandbox_path`. A future spec may revisit this if upstream parity becomes a hard requirement.
- **FR-A1a:** `activeTenant` remains tenant/super-admin context only. It MUST NOT be reused as the product-line switcher. The header MUST stop labeling tenant context as "Workspace"; tenant context should be labeled as tenant/facility context, while Product Line selection is represented by a separate `activeWorkspace`.
- **FR-A2:** `ProductLine` TypeScript type defined as alias/extension of existing `Workspace` type. Exported from `@/types/product-line` and re-exported where convenient.
- **FR-A3:** A dedicated `facility` workspace (slug = `'facility'`) exists for hosting `scope='global'` agents. Seeded on migration using the live `workspaces.name` column; idempotent.
- **FR-A4:** `projects.github_repo` is nullable and not uniqueness-constrained across workspace (already true post-migration 028). Non-code departments (Marketing, Customer Service, Finance) may set `github_repo = NULL` and skip GitHub sync participation.
- **FR-A5:** V2 tenant gateway readiness is preserved. For this requirement, `tenant` is the facility/account boundary; it is NOT the seeded `workspaces.slug='facility'` row and NOT the "Facility" switcher entry (`activeWorkspace = null`). A tenant may eventually own an independent OpenClaw home and gateway port; today's `owner_gateway` is persisted owner/provisioning metadata, not a runtime endpoint binding. v1 does not need to operate multiple live tenant gateways concurrently, but v1 changes MUST NOT deepen the current global-gateway coupling. Gateway-facing code should preserve a future path where gateway registry rows, runtime gateway resolution, health probes, and OpenClaw config paths can be resolved from tenant context instead of one process-global primary gateway.

### B. Agent scope (D3, D4a)

- **FR-B1:** `agents.scope TEXT NOT NULL DEFAULT 'workspace' CHECK (scope IN ('workspace','global'))` added via additive migration.
- **FR-B2:** Backfill migration: `UPDATE agents SET scope='global' WHERE LOWER(name) IN ('aegis','security-guardian','<operator-agent>')`.
- **FR-B3:** Agent-visibility query replaces single-workspace lookup with `WHERE scope='global' OR workspace_id = :current` across all affected endpoints.
- **FR-B4:** `task-dispatch.ts` Aegis resolution: `aegisAgentByWorkspace` replaced by a single global Aegis lookup; fallback to per-workspace only if a workspace has an explicit legacy local Aegis record.
- **FR-B5:** Cross-product agent sharing is NOT supported by default (D4a strict-twin). A `scope='global'` promotion is the only path to cross-product visibility.

### C. UI — product-line switcher (D1, D4b)

- **FR-C0:** SPEC-002 terminology is fixed: **Facility** is the canonical user-facing aggregate mode; **tenant** is the current authenticated compatibility/data boundary for that Facility; **Product Line** is the selected workspace operating scope. `activeTenant` remains tenant/facility context and MUST NOT be reused as the Product Line switcher. `activeWorkspace = null` is only an internal compatibility representation of Facility after authenticated scope initialization; product logic should treat scope as discriminated (`facility` vs `productLine`).
- **FR-C1:** New component `<WorkspaceSwitcher>` in `header-bar.tsx`. It renders exactly one synthetic "Facility" aggregate option plus authorized non-Facility Product Line workspaces from `GET /api/workspaces`. The synthetic Facility option is not the real `workspaces.slug='facility'` row; if a real workspace is named or slugged `facility`, it MUST NOT create a duplicate aggregate option. The switcher is separate from `activeTenant`.
- **FR-C1a:** Header behavior uses the existing design system. Desktop places the switcher in the left header context cluster near tenant/facility context. Mobile keeps a compact switcher visible at 320, 375, and 390 px inside the fixed `h-14` header; long Product Line names truncate and MUST NOT push out search, notifications, theme, or account controls. No icon library, card-like wrapper, or explanatory header copy is introduced. Terse accessible loading/empty/error rows are allowed inside the popover.
- **FR-C1b:** The switcher popover uses listbox semantics: stable accessible name, `aria-controls`, `aria-haspopup`, `aria-expanded`, option roles, `aria-selected`, roving focus or `aria-activedescendant`, Escape/outside-click close, Arrow/Home/End navigation, Enter/Space selection, selected state, and focus return to the trigger after close/selection.
- **FR-C2:** Zustand store gains a transition API for Product Line scope. The public transition is `setActiveProductLine(productLine | null, options)`, backed by `activeWorkspace: Workspace | null` persistence for compatibility. It validates persisted scope after `/api/workspaces`, keeps `activeTenant` independent, and uses a `scopeKey = tenantId + ":" + ("facility" | productLineId)` for all mode-sensitive caches and requests.
- **FR-C2a:** Scope transitions clear incompatible `activeProject`, selected task/agent/project/conversation state, scoped modals, scoped filters, and scoped drafts unless those drafts/filters are explicitly stored per `scopeKey`. In-flight requests and optimistic mutation completions carry the initiating `scopeKey` and are ignored if stale. Mode-sensitive cached data MUST NOT render until the persisted scope has been validated or cleared.
- **FR-C2b:** Cross-tab sync broadcasts `{ tenantId, userId/sessionId, productLineId|null, version, originTabId }`. Receivers ignore mismatched tenant/session, self echoes, and stale versions; accepted remote changes run the same transition path and do not rebroadcast.
- **FR-C2c:** URL state is scope-owned. Mode-sensitive detail URLs carry `workspace_scope=facility` or `workspace_id=<id>`. URL scope wins only after auth/workspace validation. Invalid scope strips scoped entity params and resets to Facility. Entity params without provable scope ownership are cleared instead of being resolved against stale persisted scope.
- **FR-C3:** REST request model: Product Line requests send `workspace_id=<id>`; Facility aggregate requests send `workspace_scope=facility`; requests sending both return `400`; unauthorized workspace ids return `403`; omitted scope is allowed only for feature-flag-off legacy behavior. Mode-sensitive route implementations must either accept the selected scope or authorize by resource id joined back to tenant/workspace before use.
- **FR-C3a:** SPEC-002 route matrix includes every route called by mode-sensitive panels: task root/detail/comment/broadcast/branch routes, project root/detail/agent routes, agent root/detail/subroutes, quality-review routes, DB-backed chat messages/conversations, activities, notifications, dashboard/status/audit/live-feed routes, and `/api/events`.
- **FR-C3b:** SSE request model: `/api/events` supports authorized Product Line filtering and authorized Facility aggregation. Workspace-scoped events MUST include `workspace_id`; Product Line clients drop missing or mismatched workspace events; Facility clients receive authorized tenant/facility events; only explicitly whitelisted connection/system events may omit workspace scope. EventSource reconnects when Product Line scope changes.
- **FR-C4:** **Mode-sensitive panels** honor the active Facility/Product Line scope and use `scopeKey` in request/cache behavior:
  - `task-board-panel.tsx`
  - `agent-squad-panel-phase3.tsx`
  - `project-manager-modal.tsx`
  - quality-review UI surfaces
  - DB-backed chat message/conversation surfaces
- **FR-C5:** **Facility/global panels or surfaces** do not become Product Line-owned in SPEC-002:
  - `live-feed.tsx`, `notifications-panel.tsx`, `dashboard.tsx`, `system-monitor-panel.tsx`, and `audit-trail-panel.tsx` render Facility aggregate data, not stale authenticated-workspace-only data.
  - `skills-panel.tsx` remains Facility/global. SPEC-002 adds no product-line skill ownership, assignment, permissioning, CRUD, or visibility filters.
  - Local/gateway sessions and transcripts remain Facility/global. SPEC-002 adds no session-to-workspace transcript mapping.
- **FR-C6:** Agent squad panel adds hierarchical grouping: **Facility (globals) › Product Line › Department › Agent**. Selected Product Line views include `scope='global'` agents plus local Product Line agents. Duplicate global/local display names require id-based mutation semantics and must not merge task stats across Product Lines.

### D. Task pipeline engine (D5)

- **FR-D1:** The live SQL table is `workflow_templates`. A "task-chain template" is a domain alias over `workflow_templates`, not a separate `task_templates` table.
- **FR-D1a:** `workflow_templates` gains task-chain/artifact-policy columns: `slug TEXT NULL`, `output_schema JSON`, `routing_rules JSON`, `next_template_slug TEXT NULL`, `produces_pr BOOLEAN NOT NULL DEFAULT 0`, `external_terminal_event TEXT NULL`, and `allow_redacted_artifacts BOOLEAN NOT NULL DEFAULT 0`. `slug` is required for declarative routing once `FEATURE_TASK_PIPELINES` is enabled; it should be unique per workspace when non-null. Dynamic `routing_rules` require `output_schema` at template save/update time; static `next_template_slug` chaining may be configured without `output_schema`.
- **FR-D1b:** `tasks` gains binding/lineage fields before Phase 3 ships: `workflow_template_id INTEGER REFERENCES workflow_templates(id)`, `workflow_template_slug TEXT NULL` for snapshot/readability, `parent_task_id INTEGER REFERENCES tasks(id)`, `root_task_id INTEGER REFERENCES tasks(id)`, `chain_id TEXT NULL`, and `chain_stage INTEGER NULL`. `workflow_template_id` is the canonical binding; slug is a denormalized template identity snapshot used for routing/debugging. SPEC-004 adds a narrow DB-backed one-successor-per-parent guard with `CREATE UNIQUE INDEX idx_tasks_one_successor_per_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL` after a zero-duplicate preflight; rollback drops only that index. On the first successor hop from a parent with no existing lineage, SPEC-004 initializes the parent as the chain root before creating the successor: parent `root_task_id = parent.id`, parent `chain_id` is generated, parent `chain_stage = 0`, and the successor receives the same `root_task_id`/`chain_id` with `chain_stage = 1`.
- **FR-D2:** Agent output validated against `output_schema` using an explicit direct `ajv` dependency at task-completion time. For a pipeline-bound task with `output_schema`, missing `tasks.resolution` or invalid structured output is a schema validation failure: parent task → `failed`, chain does not advance, no successor is created, and the failure is logged to `activities`.
- **FR-D2a:** Recovery from a SPEC-004 chain failure or advancement stall is explicit, not a normal status re-mark. Editing `tasks.resolution` or changing a failed task back to `done` through the ordinary `PUT /api/tasks/[id]` update MUST NOT implicitly rerun chain advancement. Operators trigger recovery with an operator-only `POST /api/tasks/[id]` action `{ "action": "retry_chain_advancement" }`. For `failed` parents, retry is allowed only when the prior reason is `task_pipeline_output_missing` or `task_pipeline_output_invalid`; it revalidates the current `tasks.resolution`, keeps the parent `failed` if validation still fails, and restores terminal success before applying normal route, stall, termination, idempotency, and successor-creation semantics only after validation passes. For terminal-success parents with a prior advancement stall, retry is allowed for `task_pipeline_routing_expression_rejected`, `task_pipeline_routing_budget_exceeded`, `task_pipeline_target_missing`, `task_pipeline_target_disabled`, `task_pipeline_target_duplicate`, `task_pipeline_target_cross_workspace`, and `task_pipeline_successor_assignee_missing`; it re-runs routing/assignee resolution while preserving the parent's terminal-success state throughout and MUST NOT convert the parent to `failed`. If a terminal-success advancement-stall retry clears because current routing resolves no matching rule and no `next_template_slug`, that is successful normal chain termination: no successor is created, no new stall activity is written, the recovery activity records `recovery_outcome='chain_terminated'`, and no extra confirmation flag or `409 Conflict` is required beyond the existing provenance/drift checks. Recovery always anchors to the latest eligible SPEC-004 failure/stall activity for the parent task; the API does not accept an `activity_id` override and MUST NOT replay older failure/stall history. All `409 Conflict` retry rejections are side-effect-free: they write no activity, increment no `retry_attempt`, leave state/successors unchanged, and return `{ "retry_rejection_reason": "<enum>" }` in the response body. Allowed rejection enum values are `retry_not_eligible`, `retry_template_provenance_missing`, and `retry_template_drift_unconfirmed`. SPEC-004 does not enforce a hard retry-attempt cap for still-unresolved eligible failures/stalls; repeated eligible retries remain allowed, but every attempt is audited and tests must prove repeated invalid/stalled retries do not create successors or corrupt parent state. Post-recovery retries follow one closure rule: if a successor already exists for the parent, retry returns `200 OK` with `recovery_outcome='successor_already_exists'`, `successor_task_id`, `chain_terminated=false`, and `idempotent_successor=true` without creating a duplicate; if the selected failure/stall was already resolved with `recovery_outcome='chain_terminated'`, later retry calls return side-effect-free `409 Conflict` with `retry_rejection_reason='retry_not_eligible'` until a new retry-eligible SPEC-004 failure/stall activity is recorded. Retry uses the current `workflow_templates` row, but drift is explicit: the selected latest failure/stall activity stores `template_output_schema_sha256`, `template_routing_rules_sha256`, and `template_next_slug_sha256`; if any required selected-activity hash is missing, retry fails closed with `409 Conflict` and `retry_rejection_reason='retry_template_provenance_missing'`, with no `confirm_template_drift` bypass until provenance is manually remediated. Retry recomputes hashes from the current template and returns `409 Conflict` with `retry_rejection_reason='retry_template_drift_unconfirmed'` unless the operator retries with `{ "action": "retry_chain_advancement", "confirm_template_drift": true }` when all required hashes exist and any hash differs. Every `200 OK` retry recovery activity sets `activities.data.reason_code='task_pipeline_retry_chain_advancement'` and stores the selected original failure/stall code in `previous_reason_code`; recovery activity data also includes `recovery_class` (`output_validation_failure` or `advancement_stall`), `recovery_action='retry_chain_advancement'`, a monotonic per-parent `retry_attempt` shared across all recovery classes and reason codes, relevant task/template/chain ids, original/current template hashes, `template_drift_detected`, `template_drift_confirmed`, and a SHA-256 hash of the corrected resolution when applicable; it MUST NOT duplicate the full corrected output into `activities.data`.
- **FR-D2b:** Every `retry_chain_advancement` `200 OK` response returns the normal task detail response shape plus a bounded `chain_retry` summary. `chain_retry` includes `recovery_class`, `retry_attempt`, `recovery_outcome`, `successor_task_id` (or `null`), `chain_terminated`, and `idempotent_successor`. Allowed `recovery_outcome` values are `output_still_invalid`, `stall_persisted`, `successor_created`, `successor_already_exists`, and `chain_terminated`. `successor_already_exists` requires `successor_task_id` and `idempotent_successor=true`; `chain_terminated` requires `successor_task_id=null` and `chain_terminated=true`. The response MUST NOT include the full corrected output, full parsed agent output, or full routing-evaluation trace.
- **FR-D3:** Routing resolution order on successful completion:
  1. Evaluate `routing_rules` in order; first match wins → create successor task from resolved workflow-template slug.
  2. Else if `next_template_slug` set → create successor task from that slug.
  3. Else chain terminates; task remains in terminal success state.
- **FR-D3a:** Every live status transition from non-`done` to `done` for a pipeline-bound task is a task-chain completion candidate. SPEC-004 must route all such transitions through one shared `advanceTaskChain` terminal-success helper from `runAegisReviews`, `POST /api/quality-review`, bulk `PUT /api/tasks`, and detail `PUT /api/tasks/[id]`. Manual/API completions remain allowed, but no live pipeline-bound `done` path may bypass the shared helper.
- **FR-D4:** Successor tasks inherit `workspace_id` and `project_id` from the parent task. Assignee is resolved by the SQL join `SELECT a.name FROM project_agent_assignments paa JOIN agents a ON a.name = paa.agent_name WHERE paa.project_id = :project_id AND paa.role = :workflow_templates.agent_role LIMIT 1`. The live `project_agent_assignments` table (added at `src/lib/migrations.ts:825-836`) keys agents by `agent_name TEXT NOT NULL` (NOT `agent_id`); the `role` column has `DEFAULT 'member'` and the table has `UNIQUE(project_id, agent_name)`. If no matching assignee exists for the resolved successor template role, chain advancement stalls deterministically: the parent remains in its terminal success state, an operator-visible `activities` row records the missing assignee, and no successor is created.
- **FR-D4a:** Successor creation MUST go through a single shared `createTask()` helper at `src/lib/task-create.ts`. The helper performs INSERT, ticket-counter allocation, activity logging, creator subscription, mention/assignee notifications, GitHub push (when `projects.github_sync_enabled=1` AND `projects.github_repo IS NOT NULL`), and GNAP push (when configured). The four current direct `INSERT INTO tasks` callsites (`src/app/api/tasks/route.ts:218`, `src/app/api/github/route.ts:159`, `src/lib/github-sync-engine.ts:189`, `src/lib/recurring-tasks.ts:105`) are migrated to use this helper as a Phase 3 prerequisite. The helper contract preserves caller-specific behavior for API creation, GitHub import, GitHub sync import, recurring tasks, and pipeline successors. `advanceTaskChain` MUST wrap parent lineage initialization, validation failure state/activity writes, stall activity writes, duplicate-successor guard checks, and successor `createTask()` insertion in one database transaction so partial chain advancement cannot persist. Duplicate-successor protection is DB-backed: SPEC-004 adds a partial unique index on non-null `tasks.parent_task_id` after `SELECT parent_task_id, COUNT(*) FROM tasks WHERE parent_task_id IS NOT NULL GROUP BY parent_task_id HAVING COUNT(*) > 1` returns zero rows, and the rollback SQL drops that index. At runtime, `advanceTaskChain` still checks for an existing successor inside the transaction; if found, it returns a successful idempotent no-op and creates no duplicate successor. The unique index is the final guard against races or bypasses. CI greps production runtime source for `INSERT INTO tasks` outside `src/lib/task-create.ts` and fails on match; intentional test fixture inserts are either migrated where semantically useful or excluded from the production guardrail.
- **FR-D4b:** Every SPEC-004 chain failure, advancement-stall, or `200 OK` retry recovery activity MUST include a human-readable `activities.description` and stable machine-readable metadata in `activities.data` JSON. `activities.data.reason_code` is required and must use one of the SPEC-004 codes: `task_pipeline_output_missing`, `task_pipeline_output_invalid`, `task_pipeline_routing_expression_rejected`, `task_pipeline_routing_budget_exceeded`, `task_pipeline_target_missing`, `task_pipeline_target_disabled`, `task_pipeline_target_duplicate`, `task_pipeline_target_cross_workspace`, `task_pipeline_successor_assignee_missing`, or `task_pipeline_retry_chain_advancement`. Retry recovery activities use `task_pipeline_retry_chain_advancement` and preserve the selected original failure/stall code in `previous_reason_code`; retry `409 Conflict` rejections write no activity. The data payload also includes relevant non-secret context such as `parent_task_id`, `workflow_template_id`, `workflow_template_slug`, `target_template_slug`, `chain_id`, `chain_stage`, `template_output_schema_sha256`, `template_routing_rules_sha256`, and `template_next_slug_sha256`; the three template hashes are required for retry-eligible SPEC-004 failure/stall activities even when a template field is empty/null. Tests assert exact reason codes so operator filters, dashboards, and later automation can depend on them.
- **FR-D5:** Phase 3 reads structured parent output from `tasks.resolution` as the temporary bridge before Phase 6 artifact publishing exists. After Phase 6, canonical handoff state moves to `task_artifacts`; `tasks.resolution` remains a fallback/summary source for backward compatibility.
- **FR-D6:** Workflow templates created by operator (seed scripts + UI editor in `src/components/panels/orchestration-bar.tsx`, persisted through `src/app/api/workflows/route.ts` and create/update workflow schemas in `src/lib/validation.ts`). Agents MUST NOT create or modify templates. Governance: template write endpoints require operator auth, including create/update/delete of task-chain fields. Existing-template edits via `PUT /api/workflows` must be schema-validated and must persist every chain field; create/update validation rejects non-empty `routing_rules` unless `output_schema` is present, while allowing `next_template_slug` without schema for static chaining. SPEC-004 must repair and preserve workflow-template delete compatibility by making `DELETE /api/workflows?id=...` accept the current live editor query-parameter contract. Existing JSON `{ id }` body support may remain for backward compatibility, but the query-parameter contract is the required P3-AC12 path.
- **FR-D7:** Tasks without workflow-template binding or with all chain fields NULL behave as today — single-step, no chain, zero regression.
- **FR-D8:** Routing-rule expression language: safe-subset boolean expressions over the output JSON. Implementation MUST use `jsonpath-plus` with JavaScript execution disabled (`eval: false`, or `preventEval: true` on older supported APIs) for JSONPath traversal and a hand-written recursive-descent parser for the boolean grammar. JSONPath filters/script expressions are rejected before calling `JSONPath()`. Forbidden: any use of the `eval` global, `Function` constructor, `vm`, `vm2`, `with`, dynamic `require`, prototype-chain access (`__proto__`, `constructor`), arithmetic and bitwise operators on the right-hand side, regex on the right-hand side, and any operator outside the explicit allowlist (`==`, `!=`, `in`, `not in`, `&&`, `||`, `!`). Per-call routing evaluation budget is `maxRuleEvalMs=10`; budget overrun stalls automated chain advancement, leaves the parent in its terminal success state, records an operator-visible `activities` row with `activities.data.reason_code='task_pipeline_routing_budget_exceeded'`, and creates no successor task; operator triage corrects the routing rule/configuration and retries through `retry_chain_advancement`. The evaluator must enforce pre-validation caps before synchronous work: `maxRoutingRules=64`, `maxRoutingExpressionBytes=8192`, `maxRoutingTokens=256`, `maxBooleanNestingDepth=16`, `maxJsonPathBytes=512`, `maxJsonPathResults=128`, and `maxLiteralBytes=32768`; it checks budget before each rule, token parse group, and JSONPath traversal.
- **FR-D9:** Phase 6 upgrades parent-stage handoff reads to `task_artifacts`; until then, Phase 3 must not depend on artifact publishing being implemented.
- **FR-D10:** Mission Control supports a constrained JSON Schema profile for `output_schema` with the following NUMERIC bounds (autopilot must implement these literally, not paraphrase): `maxOutputBytes=262144` (256 KiB), `maxSchemaBytes=65536` (64 KiB), `maxNestingDepth=16`, `maxKeysPerObject=256`, `maxArrayLength=1024`, `maxStringLength=32768` (32 KiB), `maxPatternLength=256`, `maxValidationMs=50`. Forbidden schema features: remote `$ref` (only `#/...` local refs), `$dynamicRef`, `$dynamicAnchor`, custom keywords, async schemas, the `format` validator (annotations allowed, enforcement forbidden), and any `pattern`/`patternProperties` value rejected by `safe-regex` or outside the SPEC-004 conservative pattern subset. A `safe-regex` pass is necessary but not sufficient: accepted patterns are limited to literals, anchors, character classes, and bounded quantifiers; nested quantifiers, backreferences, lookaround, unbounded wildcards, and ambiguous alternation are rejected. AJV must run with strict schema behavior, no data mutation/default insertion, no type coercion, no exhaustive error collection, no `$data`, and `validateFormats=false`; SPEC-004 must not add `ajv-formats` as a direct dependency and `src/lib/output-schema-validator.ts` must not import or register it. Existing transitive lockfile presence is allowed only if unused by SPEC-004 validator code. Compiled validators are cached per `(template_id, schema_sha256)` with LRU eviction at 256 entries.
- **FR-D11:** Dependency policy: `ajv`, `jsonpath-plus`, and `safe-regex` MUST be explicit pinned direct runtime `dependencies` in `package.json` and `pnpm-lock.yaml` (not dev-only or transitive), reviewed as supply-chain surface, covered by CI and `pnpm audit --audit-level high`, and never imported as transitive dependencies. SPEC-004 owns remediating the current high-severity audit baseline observed on 2026-04-30 (`minimatch`, `rollup`, `flatted`, `picomatch`, `defu`, and `next` advisories) before P3-AC8 can pass; these advisories are not deferred to another spec.

### E. Task state extension (D6)

- **FR-E1:** Task-status vocabulary gains `ready_for_owner`. The live schema (verified 2026-04-24) shows `tasks.status TEXT NOT NULL DEFAULT 'inbox'` with NO database CHECK constraint (the comment listing valid values at `src/lib/schema.sql:9` is documentation only, not an enforced constraint). Therefore enforcement is **application-level only** for v1: extend the TypeScript status union, the Zod schema, `STATUS_LABEL_MAP` in `src/lib/github-label-map.ts`, `ALL_STATUS_LABEL_NAMES`, and the kanban column ordering. NO DB-level CHECK is added. A future spec may add a CHECK constraint after a backfill audit; that is out of scope for v1.
- **FR-E2:** `github-label-map.ts` — `STATUS_LABEL_MAP.ready_for_owner = 'mc:ready-for-owner'`; `ALL_STATUS_LABEL_NAMES` updated; `initializeLabels` auto-creates the GitHub label on sync.
- **FR-E3:** Kanban panel (`task-board-panel.tsx`) renders `ready_for_owner` as a distinct column between `quality_review` and `done`.
- **FR-E4:** Distinct notification class for `ready_for_owner` transitions (operator action required).

### F. Two-step terminal event (D7)

- **FR-F1:** `workflow_templates` gains `produces_pr BOOLEAN NOT NULL DEFAULT 0` and `external_terminal_event TEXT NULL`.
- **FR-F2:** Scheduler `runAegisReviews` branches on successful Aegis approval:
  - `template.produces_pr = true` → transition to `ready_for_owner` (NOT `done`).
  - Else → transition to `done` (current behavior).
- **FR-F3:** `github-sync-engine.ts` `pullFromGitHub` on linked PR merge: if a `produces_pr=true` task is in `ready_for_owner`, transition to `done`.
- **FR-F4:** A linked GitHub issue closing without a merged linked PR MUST NOT transition a `produces_pr=true` task to `done`; leave it in `ready_for_owner` and create an operator-visible reconciliation activity/alert.
- **FR-F5:** Non-PR-producing templates (triage, plan, review, close_issue) are unaffected — direct `quality_review → done` on Aegis approval. Issues that do not or will not have PRs remain supported by `produces_pr=false` templates and close/disposition workflow paths.

### G. GitHub sync — monorepo + area labels (D8)

- **FR-G1:** `github-label-map.ts` gains `AREA_LABEL_MAP = { qa, dev, devsecops, marketing, customer_service, finance, ... }`. `ALL_AREA_LABEL_NAMES` exported. Extensible per product line. Product surfaces/components such as macOS App, Website, UI, Documentation, integrations, licensing/billing, and onboarding use labels or structured task metadata (for example `surface:macos-app`, `surface:website`, `component:ui`) rather than project rows.
- **FR-G2:** `initializeLabels` on sync enablement creates the `area:*` label family in the target repo.
- **FR-G2a:** Shared-repo sync uses one repo-level sync owner per `(workspace_id, github_repo)` or an equivalent dedupe key. Multiple department projects sharing a monorepo MUST NOT each poll and ingest the same issue independently. Existing uniqueness on `(workspace_id, github_repo, github_issue_number)` remains a last-line guard, not the primary dedupe strategy.
- **FR-G3:** `pullFromGitHub` on issue ingestion:
  1. Read `area:*` label(s) from the issue.
  2. If exactly one resolvable `area:*` label exists, resolve `(workspace_id, area_slug)` → target `project_id` and set `task.project_id = resolved`.
  3. If no `area:*` label, more than one `area:*` label, or resolution fails, route to the workspace's triage/inbox project with `area:triage` tag and create an activity explaining the ambiguity.
- **FR-G4:** `pushTaskToGitHub` on task creation/update: emit `area:<project_slug>` label alongside existing `mc:*` and `priority:*` labels.
- **FR-G5:** Multiple projects within one workspace may share a `github_repo`. Sync ownership/dedupe, not per-project duplicate polling, protects ingestion.

### H. Disposition logging (D9)

- **FR-H1:** New table `task_dispositions` (schema per D9).
- **FR-H2:** Scheduler writes a row at **every triage template completion**, regardless of successor choice. One INSERT per completion. Failure to write does not block task advancement (logged to `activities`).
- **FR-H3:** `audit-trail-panel.tsx` gains a "Dispositions" view surfacing `task_dispositions` with filters on `disposition`, `workspace_id`, and date range.
- **FR-H4:** Morning-briefing / dashboard query shape (pseudo-SQL):
  ```sql
  SELECT disposition, COUNT(*) FROM task_dispositions
  WHERE workspace_id = :product_line_id
    AND triaged_at >= datetime('now','-7 days')
  GROUP BY disposition;
  ```

### I. Shared task artifact store (D11)

- **FR-I1:** Agent sandboxes are private execution spaces. Mission Control owns the shared, durable handoff plane. Agents publish required outputs into MC artifact storage; successor agents consume artifact references through MC.
- **FR-I2:** New append-only `task_artifacts` table stores metadata and inline content for JSON/Markdown artifacts and references for file-backed artifacts.
- **FR-I3:** Supported storage modes: `inline_json`, `inline_markdown`, `file`, `external_uri`.
- **FR-I4:** File-backed artifacts support PDFs, images, CSVs, Excel files, logs, screenshots, archives, and future media types subject to MIME allowlist, size limits, hashing, and security checks.
- **FR-I5:** Artifact writes record `workspace_id`, `project_id`, `task_id`, producer agent, template slug, artifact type, schema version, storage URI, filename, MIME type, byte size, SHA-256, preview text, redaction status, security scan status, and supersession relation.
- **FR-I6:** Artifacts MUST NOT persist secrets. The single redaction/rejection gate is `src/lib/secret-detector.ts`, exporting `detectSecrets(content, mime)` returning `{ findings, redacted }`. Default ruleset is **MC Secret Detector v1**, derived from gitleaks 8.x default rules plus Mission Control additions. Required rule families: AWS access key id, AWS secret access key, GitHub PAT (`gh[pousr]_…`), GitHub fine-grained PAT, GitHub OAuth (`gho_…`), Google API key (`AIza…`), Slack token, Stripe live keys, generic PEM private-key blocks (`BEGIN PRIVATE KEY`, `BEGIN RSA PRIVATE KEY`, `BEGIN OPENSSH PRIVATE KEY`), `.env`-style assignments for `password=`, `api_key=`, `token=`, `secret=`, JWT (3-segment dot-separated base64url), generic `Authorization: Bearer …` headers, and Anthropic / OpenAI key patterns (`sk-ant-…`, `sk-…`). Default policy: **REJECT** the publish on any finding. Templates may opt into `allow_redacted_artifacts=1` to instead store the redacted content. Every finding produces an `activities` row of kind `security_violation` with the matched rule id (NOT the matched substring).
- **FR-I7:** Downstream agents receive safe previews plus artifact references by default. Raw file content is fetched only through MC-controlled artifact-read paths.
- **FR-I8:** Aegis, Security Guardian, audit views, and operator UI can inspect artifact provenance, hashes, scan status, and relevant content previews.
- **FR-I9:** Artifact store observability includes artifact count, total bytes, bytes by product line/project/task, failed publishes, failed scans, failed reads, orphan count, p95 publish/read latency, and storage free-space thresholds.
- **FR-I10:** Admin maintenance supports list/search, metadata inspection, quarantine, delete/archive by policy, orphan repair, hash verification, preview/index rebuild, retention policy enforcement, and audit logs for read/write/delete/quarantine.

### J. Resource governance (D12)

- **FR-J1:** Reuse existing token/cost telemetry (`/cost-tracker`, `/api/tokens`, task-cost reports, provider-subscription detection) as the measurement layer. Do not duplicate token ingestion unless a missing event source is identified.
- **FR-J1a:** Ingest OpenClaw health telemetry from `~/.openclaw/health/readings.jsonl`, `current-rate.json`, and `cost.json` into Mission Control's cost surface as electricity / infrastructure usage records. Preserve backward compatibility of `/api/tokens` by adding additive response fields or actions rather than breaking existing consumers.
- **FR-J1b:** OpenClaw health electricity / infra support is `fork-only optional` in v1. It must be controlled by a dedicated flag such as `FEATURE_OPENCLAW_HEALTH_COSTS` and an explicit config path. If the flag is OFF or the files/config are absent, Mission Control behaves exactly as it does today.
- **FR-J1c:** v1 OpenClaw health electricity / infra support requires **no schema migration**. It is implemented as a runtime adapter, not a persistent core-table dependency.
- **FR-J2:** Add `resource_policies` and `resource_policy_events` tables. Policies are scoped by any combination of workspace/product line, project/department, task status, template slug, agent role, agent, provider, model, and period/window.
- **FR-J3:** Support policy types `wip_limit`, `budget`, `blackout`, and `degraded_window`.
- **FR-J4:** Budget policies support `estimated_marginal_cost_usd`, raw token counts, requests, sessions, dispatches, active tasks, in-progress tasks, provider usage, model usage, and task-chain cost. OpenAI ChatGPT Pro or other provider subscription flags may reduce estimated marginal USD to zero, but raw usage budgets still apply.
- **FR-J4a:** Budget policies also support `electricity_cost_usd`, `infra_cost_usd`, `energy_kwh`, `power_watts`, and `blended_total_cost_usd` (`token/API + electricity/infra`) at least at facility scope in v1.
- **FR-J5:** Scheduler enforcement runs before `autoRouteInboxTasks`, `dispatchAssignedTasks`, `advanceTaskChain`, and `runAegisReviews`. A governance decision returns `allow`, `defer`, `block`, or `override_required`.
- **FR-J6:** Soft thresholds create activity/alert records without stopping work. Hard thresholds pause/defer/block new work according to the policy's `enforcement`; in-flight tasks may finish or checkpoint unless an explicit emergency halt policy says otherwise.
- **FR-J7:** Replace hard-coded capacity rules (`LIMIT 3`, "3+ in-progress tasks") with policy-backed defaults that preserve existing behavior when `FEATURE_RESOURCE_GOVERNANCE` is OFF.
- **FR-J8:** Cost Tracker UI gains a governance view or tab showing budget utilization, token/request usage, WIP by state/agent/project, active blackout/degraded windows, upcoming windows, policy decisions, and operator overrides.
- **FR-J8a:** Cost Tracker overview also shows facility electricity rate, recent power draw / energy usage when available, cumulative electricity spend, and blended totals. If attribution to task/agent/project is not reliable, electricity appears as facility-level overhead rather than fake per-task precision.
- **FR-J9:** Every non-allow governance decision is written to `resource_policy_events`, shown in audit/activity surfaces, and includes enough metadata to explain why work was deferred, blocked, or override-gated.
- **FR-J10:** Real-time rate windows from OpenClaw health telemetry may drive degraded/blackout policy for high-draw local workloads. Governance must allow operator-defined policy on whether electricity price spikes pause only local-model work or all autonomous work.
- **FR-J11:** If OpenClaw health telemetry is unavailable, unreadable, or malformed, Mission Control must degrade gracefully: no scheduler crash, no API contract breakage, and no false governance block based on missing infra data.

### K. Mission Control Product Line pilot (pilot)

- **FR-K1:** Seed the `facility` workspace + Mission Control Product Line workspace (`slug='mission-control'`, `name='Mission Control'`) + per-department projects (QA, Development, DevSecOps, Marketing, Customer Service, Finance). Do not create `macos`, `ui`, `website`, or `docs` projects; represent those as task labels/metadata under the appropriate department.
- **FR-K2:** Seed the Mission Control workflow family: `mission-control_issue_triage`, `mission-control_remediation_plan`, `mission-control_specialist_route`, `mission-control_owner_review`, `mission-control_close_issue`, `mission-control_dev_implementation`, `mission-control_review`, `mission-control_aegis` (Aegis is invoked by scheduler, not a template, but the flow is documented).
- **FR-K3:** Map agent roles to `project_agent_assignments`:
  - `researcher` → `mission-control-platform-research`
  - `planner` → `mission-control-platform-planner`
  - `dev` → `mission-control-platform-dev`
  - `ui` → `mission-control-platform-ui`
  - `devsecops` → `mission-control-platform-devsecops`
  - `qa` → `mission-control-platform-qa`
- **FR-K4:** Point the Mission Control Product Line workspace's GitHub repo at `racecraft-lab/mission-control`.
- **FR-K5:** Trigger pilot with an eligible open `racecraft-lab/mission-control` GitHub issue labeled `mc:inbox` and `priority:*`. The historical smoke plan lives in the operator's Obsidian vault (informational reference; not required for autopilot ingestion). If no safe live issue exists, the seed script creates a synthetic GitHub issue titled `[mc-pilot] synthetic e2e issue`; the second smoke uses a second eligible live issue or a second synthetic. The pilot root task must be created by GitHub ingest/sync, not by direct local task creation.
- **FR-K6:** Treat existing synced `racecraft-lab/mission-control` issue tasks as unprocessed intake. Preserve GitHub linkage and sync metadata, move them into Mission Control triage/intake, and start the new departmental workflow from triage.

### L. Symphony-compatible issue runner (new pilot scope)

- **FR-L1:** Mission Control treats GitHub issues as the tracker of record and Mission Control tasks as synchronized control-plane projections for autonomous work. A coding session, PR, branch, or worktree is a run artifact attached to a GitHub-linked task, not the durable work item.
- **FR-L2:** The runner creates or reuses one isolated execution workspace per active task-chain work item. The workspace key is derived from a stable tracker/task identifier, sanitized to `[A-Za-z0-9._-]`, and scoped under an operator-configured workspace root.
- **FR-L3:** Workspace preparation supports lifecycle hooks equivalent to `after_create`, `before_run`, `after_run`, and `before_remove`. Hooks run with the isolated workspace as `cwd`, have bounded timeouts, and record failure reason codes rather than silently falling back.
- **FR-L4:** Run attempts have explicit lifecycle states: `preparing_workspace`, `building_prompt`, `launching_agent`, `running_turn`, `continuing`, `succeeded`, `failed`, `timed_out`, `stalled`, `canceled_by_reconciliation`, and `released`.
- **FR-L5:** The orchestrator owns claim state. A task cannot have two active runner claims. Claim, retry, release, and cancellation mutations must be serialized through one Mission Control authority and exposed in audit/run-state views.
- **FR-L6:** Dispatch eligibility combines existing task-chain status, GitHub sync state, blockers, feature flags, and resource governance. A blocked, terminal, unauthorized, or no-longer-active item is released without starting a new run.
- **FR-L7:** Retry behavior is bounded and visible. Normal continuation may retry quickly when a task remains active; failure retries use exponential backoff up to a configured cap; every retry has attempt number, due time, and last error.
- **FR-L8:** Stall detection uses the latest harness event or transcript timestamp when available, otherwise run start time. Stalled runs are terminated, recorded, and retried or released according to eligibility.
- **FR-L9:** Reconciliation runs before dispatch on every scheduler tick. If GitHub/Mission Control state moves to done/closed/canceled/duplicate or otherwise exits active status, Mission Control terminates the active run and optionally removes the corresponding workspace after `before_remove`.
- **FR-L10:** Harness adapters are the first-class execution path for Mission Control pilot runs. The initial adapter registry must cover Codex/ChatGPT through Codex app-server or Codex CLI where available, Claude Code through local CLI/API or OpenClaw CLI backend where configured, OpenClaw gateway as a fork-only optional runtime/sandbox substrate, and Hermes/OpenCode as observation or execution adapters only for capabilities they can prove. Mission Control captures adapter id, external session/thread id, turn id/count when available, token/runtime totals, latest event, transcript pointer, and summarized last message without storing secrets.
- **FR-L11:** Mission Control review packets aggregate task-chain lineage, PR/branch links, artifacts, validation commands, screenshots or visual evidence references, governance decisions, token/cost totals, and unresolved human gates.
- **FR-L12:** The runner is feature-flagged and pilot-scoped in v1. Existing manual assignment, task-chain advancement, and GitHub sync flows remain usable when the runner flag is OFF.
- **FR-L13:** Runner dispatch eligibility in the pilot requires GitHub linkage (`github_repo` and `github_issue_number`) before work can be claimed. Local-only tasks remain visible and manually manageable, but they are not autonomous runner work items unless a later non-GitHub tracker adapter explicitly owns them.
- **FR-L14:** The web UI, REST API, CLI, and MCP server expose configuration, manual override, cancel/retry, owner-gate, review-packet, artifact, and observability surfaces for runner work. They must not become a parallel source of autonomous pilot work that bypasses GitHub issue ingest.
- **FR-L15:** OpenClaw-backed gateway/session/sandbox behavior is an execution substrate. OpenClaw failures may fail, stall, or release a run attempt, but they must not mutate the underlying GitHub issue state or task terminal state except through the documented Mission Control reconciliation path.
- **FR-L16:** Every harness adapter manifest declares its launch, resume/continue, transcript/event, token/runtime, artifact, sandbox, tool/MCP, memory, skill, plugin, provider-account, and user-input policies. Unsupported or unsafe capabilities fail closed at launch or during the current run attempt instead of silently falling back to a different harness.
- **FR-L17:** Every autonomous run records `harness_adapter_id`, `sandbox_owner`, `sandbox_root`, external session/thread ids where available, and whether Mission Control, OpenClaw, or another adapter owns create/cleanup. Operator UI and run/debug APIs must make this ownership clear before launch and after failure.
- **FR-L18:** Mission Control-owned sandboxes use deterministic git worktree paths under an allowlisted root and launch the selected harness with the workflow-rendered prompt and capability packet. OpenClaw-owned sandboxes delegate create/run/cleanup to the gateway adapter but still publish the resulting session, artifact, token/runtime, and error summaries back to Mission Control.
- **FR-L19:** Codex app-server is the preferred Codex-native adapter path when available because it exposes thread/turn/item events, command/file/tool requests, dynamic tools, and approvals through a structured protocol. Codex CLI remains a compatible fallback only when the adapter can still provide bounded launch/continue, transcript, and accounting behavior.

### M. Repo-owned workflow contracts and harness gardening (new pilot scope)

- **FR-M1:** The Mission Control Product Line workflow family is represented by a versioned repo-owned Markdown contract under `docs/ai/workflows/`. The file uses YAML front matter for runtime configuration and a Markdown body for the task prompt template.
- **FR-M2:** The contract can round-trip with `workflow_templates`: export current database templates to Markdown, import Markdown into seed/update operations, and verify parity by slug, agent role, prompt version, output schema hash, routing rules hash, terminal event, and feature flag dependencies.
- **FR-M3:** Workflow contract validation fails closed on missing file, invalid YAML, non-object front matter, unknown template variables, unknown template filters, missing tracker credentials, missing product-line/project identity, missing harness adapter id/config, missing declared capability, or invalid concurrency/retry/sandbox fields.
- **FR-M4:** Dynamic reload is required for future dispatches. When a workflow contract changes, Mission Control validates it, keeps the last-known-good version if validation fails, and emits an operator-visible error without crashing active runs.
- **FR-M5:** Agents may propose workflow-contract changes by opening a PR or task artifact, but production workflow contract writes require operator-reviewed repository changes or an explicit operator API call.
- **FR-M6:** Harness-gardening automation scans for stale PRD/roadmap/workflow claims, broken doc links, missing evidence files, missing runbook verification steps, stale feature-flag statuses, low-value tests, and strict-scope drift. Findings become targeted Mission Control tasks instead of broad rewrites.
- **FR-M7:** `AGENTS.md` remains a concise map. Long-lived instructions belong in PRD/roadmap/spec/runbook/workflow docs with ownership, freshness checks, and mechanical validation where possible.
- **FR-M8:** Workflow contracts can request capabilities such as GitHub issue sync, MCP tools, skill roots, memory scopes, artifact store access, browser/UI evidence, or native transcript access, but adapter resolution must prove those capabilities before dispatch. The Mission Control MCP server and CLI remain control interfaces for downstream agents, not hidden out-of-band policy sources.

## 6) Data Model Changes (Additive Migrations)

### Migration sequence (no destructive changes)

```sql
-- M53: agent_scope
ALTER TABLE agents ADD COLUMN scope TEXT NOT NULL DEFAULT 'workspace'
  CHECK (scope IN ('workspace','global'));
UPDATE agents SET scope='global' WHERE LOWER(name) IN ('aegis','security-guardian','<operator-agent>');

-- Phase 0 safety gate, no migration entry:
-- agents.workspace_path exists and remains unchanged in v1.
-- SPEC-001 must not rename it and must not add sandbox_path.
-- UI/config/doc terminology changes ship in SPEC-002+ runtime work.

-- Phase 0 safety gate, no migration entry:
-- tasks.status has no DB CHECK constraint in the live schema.
-- SPEC-001 must not add or rebuild a status CHECK.
-- Application-level ready_for_owner vocabulary support ships in SPEC-005.

-- M54: workflow_templates_task_chain_routing_and_artifact_policy
ALTER TABLE workflow_templates ADD COLUMN slug TEXT NULL;
ALTER TABLE workflow_templates ADD COLUMN output_schema JSON;
ALTER TABLE workflow_templates ADD COLUMN routing_rules JSON;
ALTER TABLE workflow_templates ADD COLUMN next_template_slug TEXT NULL;
ALTER TABLE workflow_templates ADD COLUMN produces_pr BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE workflow_templates ADD COLUMN external_terminal_event TEXT NULL;
ALTER TABLE workflow_templates ADD COLUMN allow_redacted_artifacts BOOLEAN NOT NULL DEFAULT 0;
-- Add a unique index for non-null slugs per workspace if SQLite version/support permits:
-- CREATE UNIQUE INDEX idx_workflow_templates_workspace_slug
--   ON workflow_templates(workspace_id, slug)
--   WHERE slug IS NOT NULL;

-- M55: tasks_workflow_template_binding_and_lineage
ALTER TABLE tasks ADD COLUMN workflow_template_id INTEGER REFERENCES workflow_templates(id);
ALTER TABLE tasks ADD COLUMN workflow_template_slug TEXT NULL;
ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER REFERENCES tasks(id);
ALTER TABLE tasks ADD COLUMN root_task_id INTEGER REFERENCES tasks(id);
ALTER TABLE tasks ADD COLUMN chain_id TEXT NULL;
ALTER TABLE tasks ADD COLUMN chain_stage INTEGER NULL;
CREATE INDEX idx_tasks_workflow_template_id ON tasks(workflow_template_id);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_chain_id ON tasks(chain_id);
-- SPEC-004 follow-up migration after M61:
-- Preflight must return zero rows before creating the unique index:
-- SELECT parent_task_id, COUNT(*) FROM tasks WHERE parent_task_id IS NOT NULL GROUP BY parent_task_id HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX idx_tasks_one_successor_per_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
-- Rollback: DROP INDEX IF EXISTS idx_tasks_one_successor_per_parent;

-- M56: workspace_feature_flags
ALTER TABLE workspaces ADD COLUMN feature_flags JSON;
-- NULL means all feature flags resolve to hardcoded OFF defaults unless overridden elsewhere.

-- M57: task_dispositions
CREATE TABLE task_dispositions (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  disposition TEXT NOT NULL,
  reason TEXT,
  triaged_by_agent_id INTEGER REFERENCES agents(id),
  triaged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id)
);
CREATE INDEX idx_task_dispositions_workspace_triaged_at
  ON task_dispositions(workspace_id, triaged_at);

-- M58: task_artifacts
CREATE TABLE task_artifacts (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
  project_id INTEGER REFERENCES projects(id),
  producer_agent_id INTEGER REFERENCES agents(id),
  workflow_template_slug TEXT,
  artifact_type TEXT NOT NULL,
  schema_version TEXT,
  storage_kind TEXT NOT NULL CHECK (storage_kind IN ('inline_json','inline_markdown','file','external_uri')),
  content_json JSON,
  content_markdown TEXT,
  storage_uri TEXT,
  original_filename TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  sha256 TEXT,
  preview_text TEXT,
  redaction_status TEXT NOT NULL DEFAULT 'pending',
  security_scan_status TEXT NOT NULL DEFAULT 'pending',
  supersedes_artifact_id INTEGER REFERENCES task_artifacts(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_task_artifacts_task_created_at
  ON task_artifacts(task_id, created_at);
CREATE INDEX idx_task_artifacts_workspace_type
  ON task_artifacts(workspace_id, artifact_type);

-- M59: facility_workspace_seed
INSERT OR IGNORE INTO workspaces (slug, name, tenant_id)
  SELECT 'facility', 'Facility', id
  FROM tenants
  ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC
  LIMIT 1;

-- M60: resource_policies
CREATE TABLE resource_policies (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id),
  project_id INTEGER REFERENCES projects(id),
  agent_id INTEGER REFERENCES agents(id),
  agent_role TEXT,
  task_status TEXT,
  workflow_template_slug TEXT,
  provider TEXT,
  model TEXT,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('wip_limit','budget','blackout','degraded_window')),
  limit_kind TEXT NOT NULL,
  limit_value REAL,
  period TEXT,
  timezone TEXT,
  schedule_json JSON,
  enforcement TEXT NOT NULL CHECK (enforcement IN ('alert','defer','pause_new_work','block_dispatch','require_override')),
  soft_threshold_pct REAL DEFAULT 80,
  hard_threshold_pct REAL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_resource_policies_scope
  ON resource_policies(workspace_id, project_id, agent_id, policy_type, enabled);

-- M61: resource_policy_events
CREATE TABLE resource_policy_events (
  id INTEGER PRIMARY KEY,
  policy_id INTEGER REFERENCES resource_policies(id),
  task_id INTEGER REFERENCES tasks(id),
  agent_id INTEGER REFERENCES agents(id),
  decision TEXT NOT NULL CHECK (decision IN ('allow','defer','block','override_required','override')),
  reason TEXT,
  observed_value REAL,
  limit_value REAL,
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_resource_policy_events_created_at
  ON resource_policy_events(created_at);
CREATE INDEX idx_resource_policy_events_task
  ON resource_policy_events(task_id, created_at);

-- No migration in v1 for OpenClaw health electricity / infra costs.
-- That integration remains a fork-only optional runtime adapter.
```

## 7) Non-Functional Requirements

- **NFR-1 Zero regression:** existing deployments pre-migration state is reachable post-migration (null `activeWorkspace`, null `next_template_slug`, non-`global` agent scopes). Every new behavior is additive or feature-flag-guarded.
- **NFR-2 Upstream compat:** `workspaces` table not renamed. `workspace_id` columns not renamed. Cherry-picks from `builderz-labs/main` remain viable.
- **NFR-3 Single-agent primacy:** each task still has one `assigned_to`, one status, one kanban card. The pipeline is a relationship between tasks, not a state of a task.
- **NFR-4 Governance:** agents cannot create, modify, or choose successor templates. Template write endpoints require operator auth. Invalid structured output breaks the chain deterministically.
- **NFR-5 Observability:** every triage disposition logged. Every state transition auditable via existing `activities`, `task_dispositions`, and `task_artifacts`.
- **NFR-6 Performance:** combined routing-rule evaluation plus schema validation MUST NOT increase task-completion latency by more than 50ms at p95 (one-shot per completion), measured around the terminal-success path against a flag-off/null-chain baseline.
- **NFR-7 Rollback-safe:** each migration is individually revertible **via documented manual reverse SQL** (one `docs/migrations/rollback-M<id>.sql` file per migration, plus `docs/migrations/rollback-procedure.md`); the live migration runner is forward-only and rollback is operator-initiated. Feature flags (resolved via the Feature Flag Resolution Policy in the technical roadmap) allow shipping code without activating new behavior.
- **NFR-8 Artifact store safety:** artifact publish/read/delete/quarantine operations are audited; retention, quotas, scan status, and storage health are operator-visible.
- **NFR-9 Dependency safety:** new runtime dependencies are pinned, direct, reviewed, and validated by dependency audit/lockfile checks in CI. SPEC-004 also owns clearing the current high-severity `pnpm audit --audit-level high` baseline before merge.
- **NFR-10 Resource governance safety:** when enabled, a thrown error inside `evaluateResourceGovernance` causes the call site to return `defer` (NOT `block`, to avoid wedging dispatch on a transient bug); the error is recorded in `resource_policy_events` and `activities` and an operator notification fires. A scheduler-wide circuit breaker (>5 errors/minute) opens and bypasses the evaluator (returns `allow`) until manually reset, with operator alert. This combination prevents both silent failure and full DOS while keeping WIP / blackout / hard-budget policy meaningful when the evaluator is healthy.
- **NFR-11 Compatibility labeling:** every major feature and every roadmap phase must declare `upstream-safe`, `upstream-divergent`, or `fork-only optional`.
- **NFR-12 Adapter absence safety:** fork-only adapters such as OpenClaw health electricity/infra ingestion must no-op cleanly when their files/config are absent.
- **NFR-13 Successor side-effect parity:** task-chain successor creation MUST go through the shared `createTask()` helper at `src/lib/task-create.ts` (extracted as a Phase 3 prerequisite). Parity is enforced structurally — by sharing the function — not by attempting to keep two parallel code paths in sync. The helper contract preserves source-specific side effects for API, GitHub import, GitHub sync import, recurring, and pipeline successor creation. CI greps production runtime source for `INSERT INTO tasks` outside `src/lib/task-create.ts` and fails on match.
- **NFR-14 Schema truthfulness:** docs, migrations, and smoke checks must not assert nonexistent tables, columns, or DB constraints. `workflow_templates` (with existing columns: `name`, `description`, `model`, `task_prompt`, `timeout_seconds`, `agent_role`, `tags`, `created_by`, `created_at`, `updated_at`, `last_used_at`, `use_count`, plus `workspace_id` added by a later migration), `workspaces.name`, `quality_reviews.reviewer` (TEXT), `project_agent_assignments.agent_name` (TEXT, NOT `agent_id`), `agents.workspace_path` (EXISTS), and application-level (NOT DB CHECK) status validation on `tasks.status` are the documented live-schema defaults. Any roadmap deliverable that contradicts these MUST first verify and document the live schema.
- **NFR-15 Secret detector ruleset versioning:** the secret detector at `src/lib/secret-detector.ts` declares a versioned ruleset (`MC Secret Detector v1`, derived from gitleaks 8.x default rules plus MC additions). Every rule has positive AND negative fixtures in `src/lib/__tests__/fixtures/secrets/`. CI enforces ≥1 fixture per rule and runs `safe-regex` against every rule pattern. Ruleset upgrades go through a separate spec.
- **NFR-16 Routing evaluator hygiene:** the routing-rule evaluator MUST use `jsonpath-plus` with JavaScript execution disabled (`eval: false`, or `preventEval: true` on older supported APIs) for path traversal and a hand-written recursive-descent parser for the boolean grammar. JSONPath filters/script expressions are rejected before calling `JSONPath()`. Use of `eval`, `Function`, `vm`, `vm2`, `with`, dynamic `require`, prototype-chain access, arithmetic on right-hand side, or any non-allowlisted operator is forbidden and CI-greppable.
- **NFR-17 Workflow contract legibility:** workflow contracts must be self-contained enough for a fresh agent to understand the issue source, workspace policy, prompts, validation gates, handoff state, and escalation rules without opening external notes.
- **NFR-18 Runner isolation:** runner workspaces must be rooted under configured allowlisted paths, never outside the task sandbox/worktree root, and must not depend on destructive reset for normal reuse.
- **NFR-19 Restart recovery:** after process restart, Mission Control must reconcile from durable task/GitHub state plus filesystem workspace state and must not assume in-memory scheduler state survived.
- **NFR-20 Agent-reviewability:** every autonomous pilot run must leave enough machine-readable and human-readable evidence for a second agent to review, reproduce, and continue the work without private terminal history.

## 8) Constraints (from Hub)

1. Zero regressions for existing users.
2. Preserve single-agent as the primary working mode.
3. Departmental / staged-handoff behavior opt-in, feature-flagged, or null-default.
4. Aegis is a global facility-wide singleton (D3 formalizes this).
5. Preserve `builderz/main` upstream compatibility (D2 enforces this).
6. OpenClaw-only integrations must remain optional, disabled by default, and absent-safe.
7. Workflow contracts and runner state must stay inspectable from the repo and Mission Control UI/API; hidden local terminal state is not a durable source of truth.
8. The Mission Control Product Line pilot uses GitHub first as the tracker and may select Codex/ChatGPT, Claude Code, OpenClaw, Hermes, OpenCode, or later harnesses through an explicit adapter registry. Non-GitHub tracker adapters are future extensions through a normalized tracker interface.

## 9) Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Aegis refactor (per-workspace → global) touches ~60+ references across `tasks/route.ts`, `scheduler.ts`, `validation.ts`, `task-dispatch.ts`, `task-board-panel.tsx`, chat components | Dedicated refactor phase (Phase 2) with comprehensive test coverage before any other multi-workspace behavior ships. Maintain a shim for legacy workspace-Aegis records. |
| R2 | Cross-product MEMORY.md context bleed if `scope='global'` is over-applied | D4a strict-twin is the default. Global promotion is per-agent, explicit, reviewed. |
| R3 | Routing-rule expression safety — arbitrary eval in rule evaluation | FR-D8 mandates safe-subset expression language (JSONPath + comparisons), no runtime eval. |
| R4 | Template schema validation false-positives or schema abuse | Use explicit pinned `ajv`; constrain the supported schema profile; cache compiled validators; maintain schema version fields; tests cover malicious schemas, missing/invalid output, performance, and agent prompt/schema drift. |
| R5 | GitHub area-label drift (labels deleted in repo, or operator renames) | `initializeLabels` runs on sync enable and is idempotent; label absence triggers `area:triage` fallback (FR-G3). |
| R6 | `activeWorkspace` state desync between browser tabs | The live store (`src/store/index.ts:4`) imports only `subscribeWithSelector` — there is **no existing `persist` middleware** and **no `BroadcastChannel` cross-tab listener**. Phase 1 implements both from scratch for the `activeWorkspace` slice only: `zustand/middleware`'s `persist` (key `mc:active-workspace:v1`, `localStorage`) plus a `BroadcastChannel('mc:active-workspace')` listener with a graceful no-op fallback when the API is unavailable. |
| R7 | Disposition logging table grows unboundedly | Acceptable at current scale; revisit partitioning at 1M+ rows. Index on `(workspace_id, triaged_at)` supports range queries. |
| R8 | Feature-flag sprawl — too many flags, unclear defaults | All new flags default to OFF; flipping ON is a manual operator decision per product line. |
| R9 | ChatGPT Pro / subscribed-provider cost reads as `$0`, hiding runaway usage | D12 separates estimated marginal USD from token/request/session/WIP budgets. Raw usage budgets still enforce even when dollar cost is zero. |
| R10 | "Additive" schema changes are mistaken for upstream-safe changes | D13 forces explicit compatibility labeling; roadmap must mark schema/state divergence as fork pressure before implementation. |
| R11 | OpenClaw health electricity integration leaks OpenClaw-node-specific assumptions into upstream installs | Keep it fork-only optional, runtime-adapter-based, absent-safe, and behind its own flag with no schema migration in v1. |
| R12 | Global gateway coupling blocks clean multi-facility v2 | Treat `openclaw_home` and `gateway_port` as tenant provisioning data, and `owner_gateway` as persisted future ownership metadata rather than a runtime endpoint/FK. v1 must avoid new assumptions that one `gateways.is_primary` row or process-global `OPENCLAW_GATEWAY_*` config is the only runtime source. A future v2 spec owns tenant-aware gateway registry, resolution, health checks, and config path routing before multiple facilities run concurrently. |
| R13 | Workflow contract drift between Markdown and `workflow_templates` makes agents run stale prompts | SPEC-009A owns export/import parity checks, prompt/schema/routing hashes, and last-known-good behavior for invalid reloads; SPEC-012B adds later drift guards. |
| R14 | Long-running runner sessions duplicate work after crash/restart | Claim state is serialized in Mission Control, dispatch reconciles before launch, and restart recovery is driven from task/GitHub state plus workspace inspection. |
| R15 | App-server/session logs leak secrets into review packets | Reuse SPEC-007 secret detection/redaction and SPEC-008 observability redaction before persisting summaries or artifact previews. |
| R16 | Agents learn bad local patterns and amplify documentation/test debt | Harness-gardening scans become recurring tasks with narrow PRs instead of relying on periodic manual cleanup. |

## 10) Open Questions (deferred)

- **D4c — Chat history isolation** (default: product-line-scoped for non-global agents, cross-product for globals; formalize during implementation).
- **D4d — Skills library isolation** (default: facility-wide skills with per-product-line opt-out).
- **D4e — User ACLs per product line** (v2, not in this PRD).
- **D14 — Tracker adapter model** (GitHub remains v1; decide later whether Linear/Jira adapters use the same normalized issue model and workflow contract fields).
- **D15 — Workspace retention policy** (decide how long successful/stalled task workspaces persist after the review packet and artifacts are durable).

## 11) Phased Rollout

Detailed phasing in `docs/ai/rc-factory-technical-roadmap.md`. Summary:

| Phase | Scope | Status | Ship-safe? | Compatibility class |
|---|---|---|---|---|
| 0 | Foundation migrations (M53–M61) | Complete | Yes — runtime-safe | `upstream-divergent` |
| 1 | Workspace switcher + `activeWorkspace` scoping | Complete | Yes — flag-off default | `upstream-safe` |
| 1A | Spec archive + evidence retention | Complete | Yes — process/tooling only | `upstream-safe` |
| 2 | Aegis refactor (facility singleton) | Complete | Yes — shim preserves legacy | `upstream-divergent` |
| 3 | Task-chain engine + declarative routing over `workflow_templates` | Complete | Yes — null-default fields | `upstream-divergent` |
| 4 | `ready_for_owner` state + two-step terminal | Complete | Yes — per-template opt-in | `upstream-divergent` |
| 5 | Area labels + GitHub sync updates | Complete | Yes — fallback to `area:triage` | `upstream-safe` |
| 6 | Disposition logging + artifact store + audit/admin panels | Complete | Yes — purely additive | `upstream-divergent` |
| 7 | Resource governance + Cost Tracker enforcement | Complete | Yes — flag-off default | Mixed: governance core = `upstream-divergent`; OpenClaw health cost adapter = `fork-only optional` |
| 7.5 | CrabTrap honeypot adapter | Pending | Yes — `FEATURE_CRABTRAP_HONEYPOT` flag-off default | `fork-only optional` |
| 8A | Workflow contract roundtrip | Pending | Process/tooling only | `upstream-safe` |
| 8B | Mission Control product-line seed + flag/governance activation | Pending | Gated behind pilot feature flag | Fork rollout only |
| 8C | GitHub-linked Mission Control self-hosting smoke | Pending | Gated behind pilot feature flag | Fork rollout only |
| 8D | Pilot review packet + lifecycle snapshot | Pending | Gated behind pilot feature flag | Fork rollout only |
| 9A | Generic product-line seeder | Pending | Process/tooling only | Fork rollout only |
| 9B | Second product line onboarding smoke (Product Line B) | Pending | Disabled workspace until operator enablement | Fork rollout only |
| 10A | Repo knowledge index and AGENTS map | Pending | Process/tooling only | `upstream-safe` |
| 10B | Harness-gardening drift guards | Pending | Process/tooling only | `upstream-safe` |
| 11A | Run-state persistence spine | Pending | Yes — `FEATURE_TASK_CONTROL_PLANE` flag-off default | `upstream-safe` core; optional persisted state = `upstream-divergent` |
| 11B | Claim and reconciliation authority | Pending | Yes — `FEATURE_TASK_CONTROL_PLANE` flag-off default | `upstream-safe` core; optional persisted state = `upstream-divergent` |
| 11C | Retry/backoff and debug surfaces | Pending | Yes — `FEATURE_TASK_CONTROL_PLANE` flag-off default | `upstream-safe` core |
| 12A | Sandbox ownership and lifecycle contract | Pending | Yes — `FEATURE_AGENT_RUNNER_SANDBOXES` flag-off default | `upstream-divergent` |
| 12B | Harness adapter manifest and fake registry | Pending | Yes — `FEATURE_AGENT_RUNNER_SANDBOXES` flag-off default | `upstream-divergent` |
| 12C | First real harness adapter pilot | Pending | Yes — `FEATURE_AGENT_RUNNER_SANDBOXES` flag-off default | `upstream-divergent` |
| 12D | OpenClaw/external harness adapter | Pending | Yes — `FEATURE_AGENT_RUNNER_SANDBOXES` flag-off default | `fork-only optional` |

**V2 readiness item:** Tenant-aware gateway isolation is deliberately deferred from v1 implementation. Before hosting multiple live tenant/facility accounts in one Mission Control instance, add a dedicated v2 spec to give gateway registry, runtime resolution, health checks, and OpenClaw config paths an explicit tenant context, with compatibility fallbacks for the current process-global primary gateway behavior.

**Phase 0 completion note:** SPEC-001 is complete on PR #15 after operator-node UAT acceptance on 2026-04-26. Acceptance evidence: M53-M61 migration markers present, `PRAGMA quick_check` OK, `workspaces.slug='facility'` seeded, Aegis/<operator-agent>/Security Guardian backfilled to `scope='global'`, and operator UAT found no blocking regressions in the core app flows.

**Phase 1 completion note:** SPEC-002 is complete on PR #16 after merge to `main` as `65f2e7c`. Evidence: all 50 generated tasks checked, `pnpm typecheck`, `pnpm lint`, `pnpm test` (106 files / 1035 tests), `pnpm build`, and `pnpm test:e2e` (526 tests) passed before merge.

**Phase 1A completion note:** SPEC-002A is complete on PR #18 after merge to `main` as `daab0c1`. It defines spec artifact archival, Argos/CI evidence provenance, PR evidence links, CI/local guards, and the Archive Sweep lifecycle. The adopted `racecraft-lab/spec-kit-archive` fork is published as `v1.1.0`, `speckit-pro-v1.9.0` is released from merged main history, and later feature specs can proceed with Archive Sweep running first.

**Phase 2 completion note:** SPEC-003 is complete on PR #20 after merge to `main` as `85d102f` on 2026-04-30. Evidence: all 21 generated tasks are checked, `getAegis(db, workspace_id?)` is implemented in `src/lib/aegis.ts`, `runAegisReviews` uses the shared resolver, Aegis completion gates remain `quality_reviews.reviewer='aegis'`, static guardrails pass with zero matches, focused Vitest passes the SPEC-003 resolver/dispatch/flag matrix (9 tests in `src/lib/__tests__/aegis.test.ts`), `pnpm typecheck` passes, `pnpm lint` passes with 0 errors and 10 pre-existing warnings, `pnpm build` passes with network access for Google Fonts, and `pnpm test:e2e` passes 533 Playwright tests. Full `pnpm test` is still blocked by baseline environment issues in GPG-backed GNAP sync tests and the provisioner socket timeout.

**Phase 3 completion note:** SPEC-004 is complete on PR #22 after final verification on 2026-05-01. Evidence: all 88 generated tasks are checked, task creation is centralized through `createTask()`, task-chain advancement and explicit `retry_chain_advancement` are implemented behind `FEATURE_TASK_PIPELINES`, M62 enforces one successor per non-null parent task, workflow-template chain fields are exposed in API/UI, Storybook/Argos and Playwright UI coverage are present, `pnpm typecheck`, `pnpm lint`, `pnpm test` (150 files / 1182 tests), `pnpm build`, full `pnpm test:e2e` (532 tests), and `pnpm audit:high` passed under the recorded higher-ulimit execution surface, PR #22 review threads are resolved, and GitHub CodeQL, Quality Gate, Mission Control UI E2E, Argos Storybook, Argos Playwright, and Argos summary are green.

**Phase 4 completion note:** SPEC-005 is complete on PR #23 after merge to `main` as `851571f` on 2026-05-02. Evidence recorded in the workflow includes 79 generated tasks checked, application-level `ready_for_owner` status vocabulary, shared transition guard, exact linked-PR merge verification, closed-issue reconciliation, `mc:ready-for-owner` label provisioning/application, Kanban lane and notification surfaces, `pnpm typecheck`, `pnpm lint`, `pnpm test` (169 files / 1376 tests), `pnpm build`, `pnpm test:e2e`, Ready for Owner Storybook/Playwright visual coverage, and guardrails confirming no schema migration, DB-level status CHECK, terminal-event table, issue timeline inference, or operator override path.

**Phase 5 completion note:** SPEC-006 is complete on PR #21 after merge to `main` as `dbb6c75` on 2026-05-01. Evidence recorded in the workflow includes 64 FRs satisfied, 88+ tasks landed, `FEATURE_AREA_LABEL_ROUTING` flag-off parity, repo sync ownership, triage routing, area-label routing, auto-backfill, label provisioning, docs updates, `pnpm typecheck`, `pnpm lint`, `pnpm test` (124 files / 1228 tests), strict-scope guardrails, and passing GitHub checks for Quality Gate, docker UI e2e, CodeQL, Argos Playwright, Argos Storybook, and Argos summary.

**Phase 6 completion note:** SPEC-007 is complete on PR #25 after merge to `main` as `953f29b` on 2026-05-02. Evidence includes task disposition API/rollup behavior, Mission Control artifact publish/read/admin/health surfaces, secret detection/redaction fixtures, dashboard/audit/admin UI surfaces, dispatch input-artifact integration, OpenAPI updates, e2e seed support, and retrospective evidence noting implementation complete with remaining operator-led verification/polish caveats.

**Phase 7 completion note:** SPEC-008 is complete on PR #26 after merge to `main` as `bd9a693` on 2026-05-04. Evidence includes the feature-flagged synchronous resource policy evaluator, observability ingestion/reconciliation pipeline, M65a..m + M66 additive migrations and rollback files, Cost Tracker Governance tab with Policies/Budgets/Windows/Overrides/Diagnostics/System Health subviews, feature-flag matrix harness, axe coverage guard, feature-flag env-leak guard, strict-scope guard, runbooks, observability docs, and SPEC-008 summary/retrospective evidence. Operator-led soak/chaos and selected running-instance e2e checks remain documented as follow-up evidence and do not block SPEC-009A planning.

### Autopilot Caveats (per spec)

- **SPEC-001 (Phase 0)** is migration-only and intentionally degenerate for the SDD funnel. `clarify`, `checklist`, and `analyze` should produce minimal output (no markers, "N/A — pure-schema spec" gaps, migration-safety findings only). The implement phase consists of the migration writes and the per-migration smoke checks listed in P0-AC1..AC14. Rollback for SPEC-001 is documented manual reverse SQL (the live migration runner has no `down()` function).
- **SPEC-009A through SPEC-009D (Phases 8A-8D)** replace the old monolithic pilot. SPEC-009C has one intentional human-in-the-loop checkpoint: `G_PILOT_MERGE`. Autopilot stops after observing `ready_for_owner` and resumes when `pullFromGitHub` records the linked PR merge. Manual wall-clock and UI-observation checks live in `docs/qa/pilot-smoke-checklist.md`; they are NOT validated by `gate-validator`.
- **SPEC-010A and SPEC-010B (Phases 9A-9B)** split reusable product-line seeding from Product Line B's real smoke. SPEC-010B's 1-operator-hour onboarding check is MANUAL; code-checkable isolation/dashboard checks remain validator/TDD work.
- **SPEC-012A/B, SPEC-013A/B/C, and SPEC-014A/B/C/D (Phases 10A-12D)** are Symphony-aligned v2 work. They must not rewrite the v1 departmental architecture or replace SpecKit task-chain governance. Each spec starts by proving which v1 primitives it reuses and which new state, if any, it adds.
- **Tool count = N/A:** every spec in this PRD is non-tool-surface. `/speckit-pro:setup` should accept `N/A` and skip MCP-tool artifacts.

## 12) Success Measurement

- Every single-workspace deployment passes the existing test suite post-migration: **PASS gate**.
- Mission Control is onboarded as the first product line with configured agents, workflow contract, GitHub sync, feature flags, and governance policies; one Mission Control GitHub issue completes end-to-end with no operator intervention beyond PR merge (the `G_PILOT_MERGE` human gate): **PILOT gate**.
- Disposition dashboard and artifact admin health panels show 7-day rollups / storage health for at least one product line: **TELEMETRY gate**.
- Second product line onboarding completes in < 1 operator-hour: **SCALE gate** (manual measurement).
- A GitHub-backed Mission Control task can be claimed, run in a deterministic sandbox, observed, retried, and handed off without operator session supervision: **CONTROL-PLANE gate**.
- Repository-local product/workflow/quality knowledge is indexed and drift-checked enough that new agent runs can discover current constraints without out-of-band context: **AGENT-LEGIBILITY gate**.
