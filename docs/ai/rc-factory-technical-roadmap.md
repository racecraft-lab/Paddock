# Mission Control AI Software Factory — Technical Roadmap

> For SpecKit-Pro ingestion. Companion to the PRD at `docs/rc-factory-v1-prd.md`. Every phase is ship-safe on its own (additive migrations + feature flags), but ship-safe does **not** necessarily mean upstream-safe. Each phase below is explicitly labeled for upstream impact so fork pressure is visible before implementation.

## Guiding Principles

1. **Additive or compatibility-preserving migrations only.** No destructive schema changes. Do not assume column renames or CHECK rebuilds are safe unless the live schema proves the column/constraint exists and rollback compatibility is documented.
2. **Feature flags for every new runtime behavior.** All flags default OFF. Flipping ON is an explicit operator action per product line, stored in the documented feature-flag storage mechanism.
3. **Ship each phase to production** behind its flag before enabling. Deploy code ≠ activate behavior.
4. **Dev-first, flag-scoped canary on live.** Write and commit changes in the PR worktree, merge through GitHub, then promote the merged `main` branch on the operator node. As of live verification on 2026-05-05, `mission-control.service` runs from `<operator-home>/mission-control` on `main`, with runtime data in `<operator-data-dir>`; `<retired-live-worktree>` is no longer present. Promotion is `git fetch`/update, `pnpm build`, and restart of `mission-control.service`. The "canary" is a feature flag flipped for ONE workspace (e.g., the facility workspace or a dedicated test workspace) on the live service, validated, then promoted to wider workspaces. OpenClaw is a separate active service from `<openclaw-release-symlink>` and should be restarted only when gateway/runtime code or config changes.
5. **Upstream compat gate** on every PR: cherry-pick candidates from `builderz-labs/main` should still apply cleanly.
6. **Prefer upstream-safe extensions over schema divergence.** If the same goal can be achieved with an additive adapter, config path, or feature-flagged runtime hook, choose that before adding schema.
7. **OpenClaw-specific features are fork-only adapters.** They must be disabled by default and no-op cleanly when absent.
8. **Adopt Symphony as a contract, not a stack.** Mission Control may borrow Symphony's language-agnostic control-plane pattern — tracker-driven dispatch, per-task workspaces, repo-owned workflow policy, bounded concurrency, retries, reconciliation, and observability — while keeping Next.js/React/TypeScript/SQLite, GitHub-first sync, and existing SpecKit task-chain governance.
9. **Keep harnesses pluggable and explicit.** Mission Control owns tracker truth, claims, governance, artifacts, review packets, and run-state reconciliation. Codex/ChatGPT, Claude Code, OpenClaw, Hermes, OpenCode, or later systems execute through declared harness adapters that publish launch/resume/transcript/token/tool/MCP/memory/skill/plugin/sandbox capabilities and fail closed when a capability is absent.
10. **Separate tracker truth from local projections.** For SPEC-009 and later Symphony-aligned work, GitHub Issues are the v1 source work item and tracker of record. Mission Control tasks store synchronized projections, chain state, assignments, artifacts, governance, run metadata, and views. Manual/local tasks remain supported for non-Symphony work, but they are not pilot runner work items without explicit GitHub linkage.
11. **Keep the web UX operational.** The app configures product lines, GitHub sync, workflow templates, feature flags, policies, manual gates, review packets, artifacts, and run/audit views. It must not become a second autonomous-work intake path that bypasses GitHub issue ingest.
12. **Treat harness engineering as repository design.** Agent throughput depends on versioned repo knowledge, executable tests, UI/log/metric legibility, structural guardrails, and continuous cleanup. Do not grow one monolithic instruction file when a short map plus indexed sources of truth is possible.
13. **Small specs are the operating system.** SPEC-009+ must be sliced so one branch, one agent, and one reviewer can understand the complete blast radius. If a spec would naturally create a massive PR, it is not ready for setup; split it first.
14. **PR descriptions are review packets.** A spec is not ready for review until the PR body gives humans the review order, scope budget, traceability, validation evidence, known gaps, and rollback/flag story without requiring terminal history.

## External Reference Anchors

- OpenAI Harness Engineering: keep repository knowledge versioned, indexed, mechanically checked, and continuously gardened so agents can work from the repo instead of hidden operator context. Source: [Harness Engineering](https://openai.com/index/harness-engineering/).
- OpenAI Symphony: use repo-owned workflow files, tracker-driven work, isolated workspaces, orchestrator-owned state, reconciliation, retries, and observable attempts as the control-plane pattern, not as a required stack. Sources: [Symphony announcement](https://openai.com/index/open-source-codex-orchestration-symphony/) and [Symphony SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md).
- GitHub review guidance: keep pull requests small, focused, contextual, and easy to review; provide reviewer order when multiple files are touched. Source: [GitHub pull request best practices](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/getting-started/best-practices-for-pull-requests).
- Feature-flag discipline: release toggles let code deploy before broad release, but every flag adds carrying cost and validation complexity. Source: [Feature Toggles](https://martinfowler.com/articles/feature-toggles.html).

## Upstream Impact Rubric

| Label | Meaning |
|---|---|
| `upstream-safe` | additive, opt-in, and realistic to upstream |
| `upstream-divergent` | runtime-safe for current installs, but introduces schema/state/API divergence that increases permanent-fork pressure unless upstream accepts it |
| `fork-only optional` | OpenClaw/local-environment-specific adapter that must remain absent-safe and disabled by default |

## Reviewability Contract

This policy applies to every pending spec after SPEC-008. It is a hard gate,
not advisory guidance.

1. **One deployable slice.** A spec must ship one coherent capability that can be deployed with behavior OFF by default, then enabled for one product line or one operator-owned process path.
2. **Review budget.** Target 1-3 engineering days and one primary surface: schema/migration, API, UI, scheduler/runtime, harness/adapter, seed/config, or docs/process. Setup warns above 400 reviewable LOC, 6 production files, 15 total files, or more than one primary surface. Setup blocks above 800 reviewable LOC, 8 production files, 25 total files, or more than one primary surface unless a ratified split exception is recorded.
3. **Human validation path.** Every spec must name the exact manual check an operator can run in the target deployment after merge. "Tests pass" is insufficient; the spec must explain what to flip, what screen/API/CLI to inspect, and how to roll back.
4. **Parallel-agent ownership.** Specs may run in parallel only when their strict scopes do not edit the same primary files or mutate the same runtime state. The roadmap must name "can run with" and "blocked by" relationships so Mission Control can assign multiple agents safely.
5. **No hidden follow-on work.** A spec that discovers a larger requirement opens a follow-up spec/issue instead of expanding the PR. The PR body must call out anything deferred.
6. **Self-hosting bias.** Once SPEC-009D lands, every later spec should be represented as a GitHub issue ingested into Mission Control, routed first through the Mission Control Issue Triage workflow family, then assigned to Issue Remediation, SpecKit/SDD, specialist review, or closure from Mission Control evidence where possible.
7. **PR review packet.** Every PR body must include what changed, why, non-goals, review order, scope budget, traceability, verification evidence, known gaps, and rollback/flag notes. If the host repository has a PR template, generated PR bodies fill that template instead of replacing it.
8. **Upgrade-safe template enforcement.** Reviewability template changes must be delivered through `.specify/presets/speckit-pro-reviewability/` or another installed preset/explicit override that `specify preset resolve <template>` can prove. Do not edit core `.specify/templates/*.md` directly; those files are treated as Spec Kit-managed defaults.
9. **Transition exception.** PR #30 / SPEC-009B is a one-time transition exception while the reviewability gates are being added. Its follow-on work is split below and future PRs must not cite PR #30 as precedent.

## Post-Merge HITL UAT Deployment Policy

Every spec PR must produce a capability a human can review on the target Mission Control deployment after merge. "Merged" means code/docs are on `main`; it does not mean the spec is operationally accepted.

1. **Deploy after merge.** Promote merged `main` to the target Mission Control deployment, rebuild, restart the relevant service, and record the deployed commit before marking a spec operationally accepted. Process-only specs still require a fresh agent/operator to exercise the new repo workflow from the deployed or post-merge checkout.
2. **Enable the narrowest flag set.** If the spec ships runtime behavior, enable only the feature flag(s) named by the spec for one product line, one facility path, or one operator-owned process path. Record flag values, workspace/product-line scope, and rollback steps in the spec workflow or review packet.
3. **Run the named human validation.** The operator must perform the manual check named in this roadmap's Human Validation column or the spec workflow's UAT checklist. The check must inspect the UI/API/CLI/log/review-packet surface that proves the capability, not just test output.
4. **Open remediation as GitHub issues.** Any UAT defect becomes a GitHub issue with the affected spec id, expected behavior, observed behavior, reproduction steps, evidence links, and rollback state. Before the SPEC-009C family and SPEC-009D, this can be created manually. After the self-hosting pilot lands, Mission Control should ingest and route these issues itself.
5. **Resolve through the factory loop.** UAT remediation issues are worked through Mission Control when the required self-hosting capability exists: assign, claim, implement, review, merge by a human, redeploy, re-enable the same flags, and rerun UAT. The spec stays `UAT Remediation` or `Blocked` until the capability fully passes HITL UAT or a documented operator defer decision moves the issue to a later spec.
6. **No proxy completion.** Green CI, a merged PR, or a complete task checklist is not enough. A spec is `Complete` only when local/CI evidence, deployed-commit evidence, flag-scope evidence, and HITL UAT evidence all exist.

## Current Codebase Baseline for Harness Work

SPEC-013A-C and SPEC-014A-D must extend the existing Mission Control control-plane seams instead of designing a parallel runner:

- `src/lib/adapters/adapter.ts` currently defines the narrow framework-adapter surface (`register`, `heartbeat`, `reportTask`, `getAssignments`, `disconnect`). The SPEC-014A-D harness adapters are a new, stricter execution contract layered above this shape, not a rename of the existing framework adapter.
- `src/app/api/sessions/route.ts`, `src/lib/sessions.ts`, and the local session scanners already normalize OpenClaw gateway, Claude Code, Codex CLI, Hermes, and OpenCode session observations into one session surface. The runner must reuse that observation model and add launch/continue semantics only when an adapter proves the capability.
- `src/lib/runs.ts` already stores `AgentRun` records with runtime, task id, steps, cost, provenance, git, workspace, tags, metadata, and eval fields. Symphony-style attempts/processes should reuse or extend this run spine before adding a new concept.
- `src/lib/task-dispatch.ts` and `src/lib/scheduler.ts` are the current dispatch path, including resource-governance gates, OpenClaw gateway invocation, direct Claude fallback, Aegis review, stale-task requeue, and task-chain advancement. SPEC-013B owns claim/reconciliation authority; SPEC-014A-D own execution inside an already-claimed run. No later spec should duplicate successor selection or bypass governance.
- The operator node deployment proves the desired separation: Mission Control is the product/task/governance control plane, while OpenClaw gateway/node services provide an optional harness/runtime substrate. The same adapter contract must also support Mission Control-owned worktrees/sandboxes when Codex, Claude Code, Hermes, OpenCode, or another harness is selected directly.
- The current Agents page already exposes the practical runtime-inventory inspection surface for imported OpenClaw agents: overview, workspace files, tools, models, channels, cron, SOUL, memory, tasks, config, and activity. SPEC-014B/SPEC-014D should formalize that as first-class runtime inventory state rather than inventing a separate concept that duplicates the existing operator surface.

## Phase Map (At a Glance)

| Phase | Title | Ship-safe? | Feature Flag | Upstream impact | Blocks |
|---|---|---|---|---|---|
| 0 | Foundation migrations (M53–M61) | Yes | None — pure schema | `upstream-divergent` | — |
| 1 | Product-line switcher + `activeWorkspace` | Yes | `FEATURE_WORKSPACE_SWITCHER` | `upstream-safe` | Phase 8B |
| 1A | Spec archive + evidence retention | Yes | None — process/tooling | `upstream-safe` | Phase 2+ |
| 2 | Aegis refactor (facility singleton) | Yes (shim) | `FEATURE_GLOBAL_AEGIS` | `upstream-divergent` | Phase 3, 8C |
| 3 | Task pipeline engine + routing | Yes | `FEATURE_TASK_PIPELINES` | `upstream-divergent` | Phase 4, 6, 8A, 8C |
| 4 | `ready_for_owner` state + two-step terminal | Yes | `FEATURE_TWO_STEP_TERMINAL` | `upstream-divergent` | Phase 8C |
| 5 | Area-label GitHub sync | Yes | `FEATURE_AREA_LABEL_ROUTING` | `upstream-safe` | Phase 8B, 8C |
| 6 | Disposition logging + artifact store + audit/admin panels | Yes | `FEATURE_DISPOSITION_LOGGING`, `FEATURE_TASK_ARTIFACTS` | `upstream-divergent` | Phase 8C, 8D |
| 7 | Resource governance + Cost Tracker enforcement | Yes | `FEATURE_RESOURCE_GOVERNANCE`, `FEATURE_OPENCLAW_HEALTH_COSTS` | Mixed: governance core = `upstream-divergent`; OpenClaw health cost adapter = `fork-only optional` | Phase 8A, 8B, 8C |
| 7.5 | CrabTrap honeypot adapter | Yes | `FEATURE_CRABTRAP_HONEYPOT` | `fork-only optional` | Parallel after Phase 7 |
| 8A | Workflow contract roundtrip | Yes | None — contract tooling | `upstream-safe` | Phase 8B, Phase 10A |
| 8B | Mission Control product-line seed + flag activation | Yes | `PILOT_MISSION_CONTROL_E2E` | Fork rollout only | Phase 8C, Phase 9A |
| 8C | GitHub-linked Mission Control pilot smoke | Pilot gate | `PILOT_MISSION_CONTROL_E2E` | Fork rollout only | Phase 8D, Phase 9B |
| 8D | Pilot review packet + lifecycle snapshot | Yes | `PILOT_MISSION_CONTROL_E2E` | Fork rollout only | Phase 11A |
| 9A | Generic product-line seeder | Yes | None — seed tooling | Fork rollout only | Phase 9B |
| 9B | Product Line B onboarding smoke | Post-pilot | Disabled workspace until operator enablement | Fork rollout only | Phase 10B |
| 10A | Repo knowledge index + AGENTS map | Yes | None — process/tooling | `upstream-safe` | Phase 10B, Phase 11A |
| 10B | Harness-gardening drift guards | Yes | None — process/tooling | `upstream-safe` | Later cleanup specs |
| 11A | Run-state persistence spine | Yes | `FEATURE_TASK_CONTROL_PLANE` | `upstream-safe` core; persisted run-state schema = `upstream-divergent` | Phase 11B |
| 11B | Claim + reconciliation authority | Yes | `FEATURE_TASK_CONTROL_PLANE` | `upstream-safe` core; persisted state = `upstream-divergent` | Phase 11C, Phase 12A |
| 11C | Retry/backoff + debug surfaces | Yes | `FEATURE_TASK_CONTROL_PLANE` | `upstream-safe` core | Phase 12C |
| 12A | Sandbox ownership + lifecycle contract | Yes | `FEATURE_AGENT_RUNNER_SANDBOXES` | `upstream-divergent` | Phase 12B |
| 12B | Harness adapter manifest + fake registry | Yes | `FEATURE_AGENT_RUNNER_SANDBOXES` | `upstream-divergent` | Phase 12C, Phase 12D |
| 12C | First real harness adapter pilot | Yes | `FEATURE_AGENT_RUNNER_SANDBOXES` + adapter manifest | `upstream-divergent` | Later adapter specs |
| 12D | OpenClaw/external harness adapter | Yes | `FEATURE_AGENT_RUNNER_SANDBOXES` + adapter manifest | `fork-only optional` | Later adapter specs |

## SpecKit-Pro Autopilot Usage

Use `/speckit-pro:setup SPEC-###` in Claude Code, or `/speckit-setup SPEC-###` / `$speckit-setup SPEC-###` in Codex, to generate the workflow file for an individual spec.

Review the generated workflow prompts before running autopilot. Autopilot passes the populated phase prompts as-is; it does not enrich or repair weak source prompts later.

Then run `/speckit-pro:autopilot docs/ai/specs/SPEC-###-workflow.md` in Claude Code, or `/speckit-autopilot docs/ai/specs/SPEC-###-workflow.md` / `$speckit-autopilot docs/ai/specs/SPEC-###-workflow.md` in Codex.

Autopilot starts with Archive Sweep discovery before Phase 0. The sweep
considers previously merged specs only, excludes the current target spec,
records cleanup mode and recovery commands, and applies cleanup only from a
safe reviewed context. Dirty worktrees or unrelated feature branches use
dry-run or stop behavior.

Mission Control installs the setup-managed
`.specify/presets/speckit-pro-reviewability/` preset for reviewability budget
and PR review packet template enforcement. The preset is generated from the
project's current core templates so Mission Control's existing UI and archive
evidence policy remains intact. After Spec Kit upgrades, verify the preset
still wins with `specify preset resolve spec-template`, `specify preset
resolve plan-template`, and `specify preset resolve tasks-template`; rerun
`speckit-pro` setup/fixup or restore the preset registry rather than editing
core `.specify/templates/*.md`.

Each spec should be executed from its generated worktree/branch. The mini-spec sections below are the canonical detailed source for scope, deliverables, acceptance criteria, rollback, upstream-impact notes, and dependency/parallelization rules.

### Autopilot Ingestion Notes

These notes resolve known ambiguities so `/speckit-pro:setup` and `/speckit-pro:autopilot` can ingest this roadmap without operator clarification:

- **Tool count / tool names = "N/A":** every spec in this roadmap is non-tool-surface. `/speckit-pro:setup` MUST accept `N/A` as a valid value and skip MCP-tool-related artifacts. The autopilot workflow file should record `tools: []` and not fail the gate on missing tool descriptions.
- **Wikilinks `[[…]]`:** wikilink references in the PRD and this roadmap point to companion notes in the operator's Obsidian vault and are NOT required for autopilot ingestion. The information needed for autonomous execution is self-contained in this roadmap and the linked PRD (`docs/rc-factory-v1-prd.md`). Consensus agents should treat unresolvable wikilinks as informational only and proceed.
- **Migration count baseline:** the live `src/lib/migrations.ts` contains 50 migration entries spanning ids `001` through `052` (gap after `029` → `032`). The next available id slot is `053`, which this roadmap uses as `M53`.
- **SPEC-001 is migration-only.** Treat `clarify`, `checklist`, and `analyze` phases as minimal: zero `[NEEDS CLARIFICATION]` markers are expected; checklist gaps should resolve to "N/A — pure-schema spec"; analyze findings are limited to migration safety, idempotency, rollback-file presence, and the no-SQL safety gates. `/speckit.implement` performs the migration writes and the per-migration smoke checks listed in P0-AC1..AC14.
- **Suffixed spec IDs are first-class.** `SPEC-009A`, `SPEC-009B`, and similar split specs are independent setup/autopilot units. Do not regenerate the old monolithic SPEC-009/SPEC-010/SPEC-012/SPEC-013/SPEC-014 workflows.
- **SPEC-009C4 has a human gate.** The pilot's "operator merges PR on GitHub" step is recorded as `G_PILOT_MERGE`. Autopilot stops after observing `ready_for_owner` and resumes (or marks complete) when `pullFromGitHub` records the linked PR merge. The manual pilot checks live in the Pilot Smoke Checklist (`docs/qa/pilot-smoke-checklist.md`) and are NOT validated by `gate-validator`; the PR-merge-to-`done` webhook fixture remains code-checkable.
- **Real-system smoke wall-clock ACs are MANUAL:** the SPEC-009C family "<4h wall-clock" pilot check and SPEC-010B's "<1 operator-hour" onboarding check cannot be tested by `implement-executor` TDD. Each is recorded only in the Pilot Smoke Checklist and asserted by the operator after the run.
- **Pilot issue reproducibility:** SPEC-009C1 first tries an eligible open `racecraft-lab/mission-control` GitHub issue labeled `mc:inbox` and `priority:*`. If no safe live candidate exists, the operator smoke script creates a synthetic GitHub issue with title `[mc-pilot] synthetic e2e issue` and labels `mc:inbox priority:medium area:dev`. The pilot root task must be created by GitHub ingest/sync; local-only tasks created directly through `/api/tasks` or the task board do not satisfy the pilot source-of-truth gate.

## SpecKit-Pro Status Policy

| Status | Meaning |
|---|---|
| Pending | Not yet set up by `/speckit-pro:setup`. |
| In Progress | Setup/worktree/workflow created. |
| UAT Pending | Implementation PR merged, deployed-commit/flag evidence not yet recorded, or named HITL UAT not yet run. |
| UAT Remediation | HITL UAT found a defect; a GitHub issue exists and must be resolved, reviewed, merged, redeployed, and retested before completion. |
| Complete | Implementation PR merged, roadmap updated, target deployment promoted, required flags enabled in the named scope, and HITL UAT evidence recorded. |
| Blocked | Gate failure, deployment failure, unresolved UAT defect without a remediation issue, or human decision required. |

## SpecKit-Pro Spec Index

| Spec ID | Phase | Spec Name | Short Name | Status | Priority | Depends On | Enables | Source Section |
|---|---:|---|---|---|---|---|---|---|
| SPEC-001 | 0 | Foundation Migrations | foundation-migrations | Complete | P0 | — | SPEC-002 | Phase 0 |
| SPEC-002 | 1 | Product-Line Switcher and activeWorkspace Scoping | product-line-switcher | Complete | P1 | SPEC-001 | SPEC-002A, SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009A | Phase 1 |
| SPEC-002A | 1A | Spec Archive and Evidence Retention | spec-archive-evidence | Complete | P1 | SPEC-002 | SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009A, SPEC-010A, SPEC-012A | Phase 1A |
| SPEC-003 | 2 | Aegis Facility Singleton Refactor | global-aegis | Complete | P1 | SPEC-001, SPEC-002, SPEC-002A | SPEC-004, SPEC-009C1 | Phase 2 |
| SPEC-004 | 3 | Task Pipeline Engine and Declarative Routing | task-pipeline-engine | Complete | P1 | SPEC-001, SPEC-002, SPEC-002A, SPEC-003 | SPEC-005, SPEC-007, SPEC-008, SPEC-009C1, SPEC-013B | Phase 3 |
| SPEC-005 | 4 | ready_for_owner State and Two-Step Terminal Event | ready-for-owner | Complete | P1 | SPEC-002, SPEC-002A, SPEC-004 | SPEC-009C1 | Phase 4 |
| SPEC-006 | 5 | Area-Label GitHub Sync | area-label-github-sync | Complete | P1 | SPEC-001, SPEC-002, SPEC-002A | SPEC-009B, SPEC-009C1 | Phase 5 |
| SPEC-007 | 6 | Disposition Logging and Task Artifact Store | disposition-artifacts | Complete | P2 | SPEC-002, SPEC-002A, SPEC-004 | SPEC-009D, SPEC-014C | Phase 6 |
| SPEC-008 | 7 | Resource Governance and Cost Tracker Enforcement | resource-governance | Complete | P2 | SPEC-001, SPEC-002, SPEC-002A, SPEC-004 | SPEC-009A, SPEC-011, SPEC-013B | Phase 7 |
| SPEC-009A | 8A | Workflow Contract Format and Roundtrip | workflow-contract-roundtrip | Complete | P0 | SPEC-002A, SPEC-004, SPEC-008 | SPEC-009B, SPEC-012A | Phase 8A |
| SPEC-009B | 8B | Mission Control Product-Line Seed and Flag Activation | mission-control-seed | Complete | P0 | SPEC-009A, SPEC-006, SPEC-008 | SPEC-009C1, SPEC-010A | Phase 8B |
| SPEC-009C1 | 8C1 | GitHub Pilot Issue Ingest and Eligibility | pilot-issue-ingest | Complete | P0 | SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009B | SPEC-009C2 | Phase 8C1 |
| SPEC-009C2 | 8C2 | Triage-to-Remediation Plan Handoff | triage-remediation-handoff | Complete | P0 | SPEC-009C1 | SPEC-009C3 | Phase 8C2 |
| SPEC-009C3 | 8C3 | Dev/Review/Aegis to Ready for Owner | remediation-ready-for-owner | Complete | P0 | SPEC-009C2 | SPEC-009C4 | Phase 8C3 |
| SPEC-009C4 | 8C4 | Owner Merge Gate and Done Reconciliation | owner-merge-reconciliation | Complete | P0 | SPEC-009C3 | SPEC-009D, SPEC-010B | Phase 8C4 |
| SPEC-009D | 8D | Pilot Review Packet and Lifecycle Snapshot | pilot-review-lifecycle | Complete | P1 | SPEC-007, SPEC-008, SPEC-009C4 | SPEC-009E, SPEC-013A | Phase 8D |
| SPEC-009E | 8E | Pilot Eligibility and Evidence Surfaces | pilot-evidence-surfaces | Pending | P2 | SPEC-009D | SPEC-009F, SPEC-013A | Phase 8E |
| SPEC-009F | 8F | Production Triage Outcome Routing | production-triage-routing | Pending | P1 | SPEC-009E, SPEC-012A | Later production triage lanes | Phase 8F |
| SPEC-010A | 9A | Generic Product-Line Seeder | generic-product-line-seeder | Pending | P2 | SPEC-002A, SPEC-009B | SPEC-010B | Phase 9A |
| SPEC-010B | 9B | Product Line B Onboarding Smoke | product-line-b-smoke | Pending | P2 | SPEC-009C4, SPEC-010A | SPEC-012B | Phase 9B |
| SPEC-011 | 7.5 | CrabTrap Honeypot Adapter | crabtrap-honeypot | Pending | P2 | SPEC-008 | — | Phase 7.5 |
| SPEC-012A | 10A | Repo Knowledge Index and AGENTS Map | repo-knowledge-index | Pending | P1 | SPEC-002A, SPEC-009A | SPEC-012B, SPEC-013A | Phase 10A |
| SPEC-012B | 10B | Harness-Gardening Drift Guards | harness-gardening-guards | Pending | P1 | SPEC-010B, SPEC-012A | Later cleanup specs | Phase 10B |
| SPEC-013A | 11A | Run-State Persistence Spine | run-state-spine | Pending | P1 | SPEC-009D, SPEC-012A | SPEC-013A1 | Phase 11A |
| SPEC-013A1 | 11A1 | GitHub Sync Automation and Poller Lifecycle | github-sync-automation | Pending | P1 | SPEC-009D, SPEC-012A, SPEC-013A | SPEC-013B | Phase 11A1 |
| SPEC-013B | 11B | Claim and Reconciliation Authority | claim-reconciliation | Pending | P1 | SPEC-004, SPEC-006, SPEC-008, SPEC-013A1 | SPEC-013C, SPEC-014A | Phase 11B |
| SPEC-013C | 11C | Retry/Backoff and Debug Surfaces | retry-debug-surfaces | Pending | P1 | SPEC-013B | SPEC-014C | Phase 11C |
| SPEC-014A | 12A | Sandbox Ownership and Lifecycle Contract | sandbox-lifecycle-contract | Pending | P1 | SPEC-013B | SPEC-014B | Phase 12A |
| SPEC-014B | 12B | Harness Adapter Manifest and Fake Registry | adapter-manifest-fakes | Pending | P1 | SPEC-014A | SPEC-014C, SPEC-014D | Phase 12B |
| SPEC-014C | 12C | First Real Harness Adapter Pilot | first-real-harness-adapter | Pending | P1 | SPEC-013C, SPEC-014B | Later adapter specs | Phase 12C |
| SPEC-014D | 12D | OpenClaw and External Harness Adapter | openclaw-external-adapter | Pending | P2 | SPEC-014B | Later adapter specs | Phase 12D |

### Pending Mini-Spec Parallelization Snapshot

**Current roadmap note:** SPEC-001, SPEC-002, SPEC-002A, SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009A, SPEC-009B, SPEC-009C1, SPEC-009C2, SPEC-009C3, SPEC-009C4, and SPEC-009D are complete per the implementation evidence recorded below. Recent merge evidence includes SPEC-004 PR #22 as `20643d8`, SPEC-005 PR #23 as `851571f`, SPEC-006 PR #21 as `dbb6c75`, SPEC-007 PR #25 as `953f29b`, SPEC-008 PR #26 as `bd9a693`, SPEC-009A PR #28 as `2b78970e`, SPEC-009B PR #30 as `1d5c994c`, SPEC-009C1 PR #34 as `7d544f39`, the SPEC-009C1 post-merge routing fix PR #40 as `e6ee19ee`, SPEC-009C2 PR #43 as `a63afdea`, the SPEC-009C2 post-merge assignee fix PR #46 as `19b2db98`, SPEC-009C3 PR #48 as `ac7760a2`, SPEC-009C4 PR #52 as `ddc709f2`, and SPEC-009D PR #54 as `765264b`. SPEC-009C4 has target HAL deployment and UAT replay evidence recorded; SPEC-009D has packet UAT, merge, and main CI evidence recorded.

- **Active after SPEC-009D:** SPEC-012A is the highest-priority unblocked next setup target because it feeds the SPEC-013 run-state path. SPEC-009E is the direct self-hosting evidence-surface follow-on, while SPEC-010A and SPEC-011 remain parallel options because they touch the generic seeder and optional security adapter respectively.
- **Self-hosting critical path:** SPEC-009A -> SPEC-009B -> SPEC-009C1 -> SPEC-009C2 -> SPEC-009C3 -> SPEC-009C4 -> SPEC-009D proves that Mission Control can ingest a Mission Control GitHub issue, route it through a dedicated Issue Triage workflow family, execute the first bounded Issue Remediation workflow family, record the `ready_for_owner` merge gate, and emit a reviewable lifecycle packet. SpecKit/SDD remains a separate destination for `NEEDS_SPEC` issues, not the default first pilot lane.
- **Scale/doc parallel path:** SPEC-010A can start after SPEC-009B; SPEC-010B waits for SPEC-010A now that SPEC-009C4 is complete; SPEC-012B waits for two-product-line reality from SPEC-010B.
- **Evidence, routing, and automation follow-ons:** SPEC-009E turns the pilot evidence model into operator-visible read-only surfaces after SPEC-009D. SPEC-009F owns production routing/evidence for non-remediation triage outcomes after the pilot evidence surfaces exist. SPEC-013A1 explicitly owns GitHub sync automation and poller lifecycle before claim/reconciliation relies on automatic issue discovery.
- **Control-plane path:** SPEC-013A -> SPEC-013A1 -> SPEC-013B -> SPEC-013C starts after the pilot review packet and repo knowledge index exist. These specs own run-state, GitHub sync automation, claim/reconciliation, and retry state; they do not launch harnesses.
- **Runner path:** SPEC-014A -> SPEC-014B establishes sandbox ownership and fake adapter proof first. SPEC-014C and SPEC-014D then run in parallel if they do not touch the same adapter files.

### Spec-by-Spec HITL UAT Matrix

This matrix is the second-pass review gate for every roadmap spec. Each row must remain true when the individual spec workflow is generated. If UAT fails, open a GitHub issue with the spec id and rerun the deploy/test loop from the Post-Merge HITL UAT Deployment Policy.

| Spec | Human-reviewable capability after merge | Flag or activation scope | Required HITL UAT gate |
|---|---|---|---|
| SPEC-001 | Foundation schema and seed substrate exists without changing core behavior | No runtime flag; target deployment migration smoke | Deploy/restart, verify migration markers, `PRAGMA quick_check`, seeded facility workspace, global-agent backfill, and unchanged core flows |
| SPEC-002 | Operator can switch Facility/Product Line scope without data leakage | `FEATURE_WORKSPACE_SWITCHER` for one workspace/product line | Inspect flag OFF legacy UI, Facility aggregate view, selected Product Line view, REST/SSE scope, and cross-tab behavior |
| SPEC-002A | Spec archive/evidence workflow is usable by later agents | Process-only post-merge checkout | Run Archive Sweep/dry-run from the merged checkout and verify durable-vs-ephemeral evidence policy is discoverable |
| SPEC-003 | Aegis can resolve as a facility singleton while preserving legacy fallback | `FEATURE_GLOBAL_AEGIS` scoped to one facility path | Dispatch/review one safe task in global-Aegis mode, then verify flag OFF legacy/workspace behavior still works |
| SPEC-004 | A workflow-template task chain can advance or fail deterministically | `FEATURE_TASK_PIPELINES` for one product-line workflow | Run one happy-path chain and one invalid-output chain; inspect successor, activity reason codes, retry behavior, and rollback path |
| SPEC-005 | PR-producing work can stop at `ready_for_owner` until human merge | `FEATURE_TWO_STEP_TERMINAL` for one PR-producing workflow | Drive a linked PR task to `ready_for_owner`, merge manually, sync, and verify transition to `done` plus label/notification evidence |
| SPEC-006 | A shared monorepo issue routes to the correct department once | `FEATURE_AREA_LABEL_ROUTING` for one GitHub repo/product line | Ingest/update one `area:*` issue, verify no duplicate project ingestion, correct fallback/ambiguity handling, and outbound labels |
| SPEC-007 | Dispositions and artifacts become durable handoff/review evidence | `FEATURE_DISPOSITION_LOGGING` and `FEATURE_TASK_ARTIFACTS` | Publish/consume a safe artifact, reject or redact a seeded secret fixture, inspect disposition rollup and artifact admin/storage health |
| SPEC-008 | Governance can allow/defer/block autonomous work before dispatch | `FEATURE_RESOURCE_GOVERNANCE`; optional `FEATURE_OPENCLAW_HEALTH_COSTS` | Enable policies for one product line, verify WIP/blackout/budget decisions in UI/API/activity, and verify OpenClaw absence-safe OFF path |
| SPEC-009A | Mission Control workflow policy is repo-owned and roundtrippable | Process-only contract import/export | Export/import the Mission Control workflow family, inspect no-op parity hashes, and verify invalid contracts fail closed visibly |
| SPEC-009B | Mission Control is seeded as Product Line A without launching work | `PILOT_MISSION_CONTROL_E2E` seed scope only | Run seed twice on target deployment, inspect workspace/departments/agents/repo/templates/flags/governance plus separate Issue Triage and Issue Remediation workflow families, and confirm no issue claim/dispatch |
| SPEC-009C1 | One GitHub issue enters the pilot as an eligible Mission Control task | `PILOT_MISSION_CONTROL_E2E` for one real or synthetic issue | Ingest or create the pilot issue, prove GitHub is tracker-of-record, verify eligibility, and confirm local-only tasks cannot enter the pilot |
| SPEC-009C2 | Issue Triage hands actionable work to Issue Remediation planning | `PILOT_MISSION_CONTROL_E2E` for the pilot issue | Drive triage to `ACTIONABLE_REMEDIATION`, persist disposition/artifact evidence, and verify duplicate/OBE/invalid/needs-human/needs-specialist/`NEEDS_SPEC` outcomes do not enter remediation |
| SPEC-009C3 | The remediation chain reaches `ready_for_owner` | `PILOT_MISSION_CONTROL_E2E` for the pilot issue | Execute remediation planning, dev, review, and Aegis for the pilot issue until the linked PR-producing task reaches `ready_for_owner` |
| SPEC-009C4 | Human merge and GitHub sync reconcile the pilot to `done` | `PILOT_MISSION_CONTROL_E2E` for the pilot issue | Merge at `G_PILOT_MERGE`, sync GitHub state, and verify `ready_for_owner -> done` reconciliation without duplicate launch or local-only completion |
| SPEC-009D | Pilot work leaves a reviewable lifecycle packet | `PILOT_MISSION_CONTROL_E2E` review-packet scope | Inspect packet contents for issue/PR/artifacts/governance/Aegis/owner gate/current stage and explicitly deferred run/sandbox fields |
| SPEC-009E | Operators can inspect pilot eligibility and evidence without terminal archaeology | Read-only pilot evidence surface after SPEC-009D | Inspect a pilot issue's eligibility inputs, GitHub-linked task evidence, manual smoke state, and deferred automation/run-state fields |
| SPEC-009F | Production triage outcomes route to the right non-remediation lanes | Pilot/product-line flag scope to be defined during SPEC-009F setup after SPEC-009E | Drive `NEEDS_SPEC`, needs-human, needs-specialist, duplicate, obsolete, and invalid fixtures and inspect correct lane/evidence without a remediation successor |
| SPEC-010A | Product-line seeding is reusable beyond Mission Control | Process-only seeder config | Recreate the Mission Control seed from generic config in a safe target scope and verify incomplete/unsafe configs reject without mutation |
| SPEC-010B | Product Line B can be onboarded, smoked, and disabled independently | Disabled workspace until operator enablement | Onboard Product Line B in under one operator-hour, run one issue smoke, inspect isolation/shared globals, then disable cleanly |
| SPEC-011 | CrabTrap can surface honeypot evidence without being required | `FEATURE_CRABTRAP_HONEYPOT` and valid/missing adapter config | Verify flag OFF and absent binary no-op, then send one valid and one malformed webhook and inspect activities/alerts |
| SPEC-012A | A fresh agent can discover current repo truth from indexed docs | Process-only repo index/AGENTS map | Start a fresh agent from repo-local docs and verify it finds PRD, roadmap, workflow, runbook, ownership, and current status evidence |
| SPEC-012B | Drift guards can create narrow remediation work instead of broad rewrites | Process-only guard/manual scheduler path | Trigger each drift fixture and confirm one specific cleanup task or GitHub issue recommendation with evidence and owner metadata |
| SPEC-013A | Durable run-attempt state exists without changing legacy dispatch | `FEATURE_TASK_CONTROL_PLANE` flag OFF/ON inspection | Create/inspect/archive one attempt record and verify flag OFF ignores it while UI/API expose bounded state when enabled |
| SPEC-013A1 | GitHub sync polling is automatic, observable, and operator-controllable | Existing GitHub sync settings plus explicit poller lifecycle controls | Enable automatic polling for one product line, inspect status/last-run/error state, disable it, and verify manual sync still works |
| SPEC-013B | Only one claim can own a GitHub-linked stage at a time | `FEATURE_TASK_CONTROL_PLANE` for one product-line workflow | Run concurrent scheduler ticks, verify one claim, governance/reconciliation gates, terminal release, and no duplicate launch |
| SPEC-013C | Operators can retry, release, or cancel a claimed stage safely | `FEATURE_TASK_CONTROL_PLANE` debug surface | Retry/release/cancel one claimed stage and inspect state transition, audit evidence, backoff, and operator-visible error summary |
| SPEC-014A | Sandbox lifecycle is explicit, bounded, and flag-gated | `FEATURE_AGENT_RUNNER_SANDBOXES` with fake lifecycle | Create fake Mission Control/OpenClaw/external lifecycles, verify bounded paths/handles/events/cleanup, and confirm flag OFF blocks create/run |
| SPEC-014B | Harness adapters declare capabilities before execution | `FEATURE_AGENT_RUNNER_SANDBOXES` fake adapter registry | Run two fake adapters through the manifest, inspect visible/unassigned/assigned/eligible/blocked runtime-inventory states, and verify unsupported capabilities fail the attempt instead of stalling or switching harness |
| SPEC-014C | One real harness adapter can execute an already-claimed stage | `FEATURE_AGENT_RUNNER_SANDBOXES` plus one real adapter manifest | Launch/continue one claimed stage, inspect artifacts/usage/failure summaries, and verify unsupported tool/user-input failure behavior |
| SPEC-014D | OpenClaw/external harnesses use the same adapter contract | `FEATURE_AGENT_RUNNER_SANDBOXES` plus OpenClaw/external config | Verify missing OpenClaw/external config is absent-safe, then import/refresh OpenClaw runtime agents as unassigned inventory, assign one explicitly, and inspect lifecycle/failure evidence |
| V2-001 | Tenant-aware gateway resolution can support multi-facility deployments | Future v2 flag/scope; not in v1 spec index | In a future v2 target, prove two tenant/facility contexts resolve separate gateway settings without leaking or regressing single-tenant fallback |

## Feature Flag Resolution Policy

Every `FEATURE_*` flag named in this roadmap is resolved by a single helper, `resolveFlag(name, ctx)`, exported from `src/lib/feature-flags.ts` (added in SPEC-002 deliverables; consumed by every later phase):

1. **Hard-default OFF** — every flag's baseline value is `false`.
2. **Per-workspace JSON override (M56 storage):** `workspaces.feature_flags JSON` may contain `{ "FEATURE_X": true }` for a specific workspace; that value wins for that workspace.
3. **Process env override (emergency disable / kill-switch):** `process.env.FEATURE_X === '0'` ALWAYS forces the flag OFF regardless of JSON state. `process.env.FEATURE_X === '1'` does NOT force ON; only JSON can opt a workspace in.
4. **Global flag without workspace context:** when called with no workspace (e.g., from `auto-route` cron loops), resolution uses `workspace_id = null` → returns OFF unless an env var explicitly forces a value (rare, used only for `PILOT_MISSION_CONTROL_E2E`).

Phase deliverables that name a flag (e.g., `FEATURE_WORKSPACE_SWITCHER`, `FEATURE_GLOBAL_AEGIS`, `FEATURE_TASK_PIPELINES`, `FEATURE_TWO_STEP_TERMINAL`, `FEATURE_AREA_LABEL_ROUTING`, `FEATURE_DISPOSITION_LOGGING`, `FEATURE_TASK_ARTIFACTS`, `FEATURE_RESOURCE_GOVERNANCE`, `FEATURE_OPENCLAW_HEALTH_COSTS`, `FEATURE_TASK_CONTROL_PLANE`, `FEATURE_AGENT_RUNNER_SANDBOXES`, `PILOT_MISSION_CONTROL_E2E`) MUST resolve through this helper. Inline `process.env.FEATURE_X` checks are forbidden; CI greps for them and fails on match.

`PILOT_MISSION_CONTROL_E2E` is the one exception that may also be flipped via env (it is operator-temporary). All other flags route through `workspaces.feature_flags`.

## Spec Details for Autopilot Setup

### SPEC-001: Foundation Migrations

- **Status:** Complete
- **Priority:** P0
- **Branch short name:** `foundation-migrations`
- **Dependencies:** —
- **Enables:** SPEC-002; later specs consume Phase 0 schema after SPEC-002 adds the shared feature-flag resolver
- **Scope source:** Phase 0 — Foundation Migrations
- **Acceptance criteria source:** Phase 0 Acceptance Criteria
- **Scope summary:** Implement additive migrations and seed steps M53–M61, including agent scope, workflow-template routing/artifact-policy columns, task lineage, workspace feature flags, disposition/artifact tables, facility workspace seed, and resource policy tables. Sandbox terminology and `ready_for_owner` runtime vocabulary are explicit no-SQL safety gates here and ship as runtime work in later specs. No UI, config, type, or runtime behavior changes ship in SPEC-001.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** N/A — migration-only/no-new-module spec
- **Autopilot notes:** Treat migrations as the only implementation surface. Verify live schema truth before assuming `agents.workspace_path` or a `tasks.status` CHECK constraint. Preserve null-default / flag-off compatibility and document upstream-divergent fork pressure.
- **Definition of done:** Phase 0 deliverables are implemented, P0 acceptance criteria pass, migrations are idempotent on production-shape data, existing tests pass unchanged, and rollback scripts plus documented manual reverse steps exist for each SQL-changing migration or seed.
- **Completion evidence:** Complete on PR #15 (`001-foundation-migrations`) after local verification and operator-node UAT acceptance on 2026-04-26. operator-node UAT confirmed M53-M61 migration markers, `PRAGMA quick_check = ok`, the `facility` workspace seed, Aegis/<operator-agent>/Security Guardian `scope='global'` backfill, and unchanged core app flows.

### SPEC-002: Product-Line Switcher and activeWorkspace Scoping

- **Status:** Complete
- **Priority:** P1
- **Branch short name:** `product-line-switcher`
- **Dependencies:** SPEC-001
- **Enables:** SPEC-002A, SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009A
- **Scope source:** Phase 1 — Product-Line Switcher + `activeWorkspace` Scoping
- **Acceptance criteria source:** Phase 1 Acceptance Criteria
- **Scope summary:** Add the feature-flagged Product Line switcher, independent Facility/Product Line scope state, explicit REST/SSE scoping, mode-sensitive panel behavior, Facility aggregate awareness behavior, and header terminology fix so tenant/facility context is no longer labeled as Workspace.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** New production modules are limited to `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, and `src/lib/feature-flags.ts`. Existing store, header, panel, API, and SSE files may be touched only where Phase 1 route/panel matrices require Product Line scope, Facility aggregate behavior, or header terminology fixes.
- **Autopilot notes:** Keep `activeTenant` independent from Product Line scope. The switcher's synthetic Facility entry means authenticated Facility aggregate view, not direct selection of the real `workspaces.slug='facility'` row. Global agents must appear across product-line views. Skills, local/gateway sessions, transcripts, and multi-facility tenant modeling remain deferred boundaries.
- **Definition of done:** Phase 1 deliverables are implemented, P1-AC1 through P1-AC16 pass with flag OFF, Facility aggregate, and selected Product Line modes, and no unauthorized workspace data leaks through REST, URL state, cache reuse, BroadcastChannel, or SSE scoping.
- **Implementation evidence:** Complete on PR #16 after merge to `main` as `65f2e7c`. G7 passed locally on 2026-04-26 in branch `002-product-line-switcher`: all 50 generated tasks are checked, `pnpm typecheck` passed, `pnpm lint` passed with 0 errors / 11 pre-existing warnings, `pnpm test` passed 106 files / 1035 tests, `pnpm build` passed, `pnpm test:e2e` passed 526 tests, and guardrail greps found no inline runtime `FEATURE_*` reads outside `src/lib/feature-flags.ts` or new runtime gateway/global-boundary drift.

### SPEC-002A: Spec Archive and Evidence Retention

- **Status:** Complete
- **Branch status:** Implementation PR #18 merged to `main` on 2026-04-28; external archive/plugin release cleanup is complete.
- **Priority:** P1
- **Branch short name:** `spec-archive-evidence`
- **Dependencies:** SPEC-002
- **Enables:** SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009A, SPEC-010A, SPEC-012A
- **Scope source:** Phase 1A — Spec Archive and Evidence Retention
- **Acceptance criteria source:** Phase 1A Acceptance Criteria
- **Scope summary:** Define and implement the repository policy for long-lived SpecKit artifacts, Playwright screenshots, PR evidence, and post-merge archival before later specs generate more evidence. Evaluate `stn1slv/spec-kit-archive` as the default archival mechanism and adopt it only if it can be pinned and validated locally and in CI.
- **Tool count / tool names:** N/A — process/tooling spec
- **Strict Scope:** `.specify` archive integration and hooks, SpecKit workflow docs/templates, screenshot/evidence manifest conventions, CI/local guards for `specs/**/screenshots`, and PR evidence guidance. No runtime product feature behavior ships in this spec.
- **Autopilot notes:** Use `specs/002-product-line-switcher` as the dry-run source because it contains real Playwright screenshots. Do not delete or move existing spec folders automatically. If archive cleanup is needed, produce an explicit reviewed change rather than a silent post-merge mutation.
- **Definition of done:** Phase 1A deliverables are implemented, the archive command dry-runs against SPEC-002, screenshot guard behavior is verified locally and in CI, constitution/workflow docs distinguish durable memory from ephemeral CI artifacts and curated permanent screenshots, and SPEC-003 setup can proceed without unresolved artifact-retention decisions.
- **Implementation evidence:** Complete on PR #18 after merge to `main` as `daab0c1`. G7 passed locally on 2026-04-28 with all 47 generated tasks checked and zero markers. Final evidence includes `spec-kit-archive` PR #1 merged and `v1.1.0` released, vendored Mission Control archive extension pinning, Archive Sweep dry-run evidence for SPEC-001/SPEC-002, screenshot guard verification, `speckit-pro` PR #20 and release-please PR #21 merged, official `speckit-pro-v1.9.0` release recreated at main commit `75a5b727cd0868d647c9afa968e0edbe398c3f94`, local Codex plugin refresh evidence, operator node deployment verification, and retrospective evidence.

### SPEC-003: Aegis Facility Singleton Refactor

- **Status:** Complete
- **Branch status:** PR #20 merged to `main` on 2026-04-30 as `85d102f`.
- **Priority:** P1
- **Branch short name:** `global-aegis`
- **Dependencies:** SPEC-001, SPEC-002, SPEC-002A
- **Enables:** SPEC-004, SPEC-009C1
- **Scope source:** Phase 2 — Aegis Refactor (Facility Singleton)
- **Acceptance criteria source:** Phase 2 Acceptance Criteria
- **Scope summary:** Refactor Aegis resolution from workspace-keyed lookup toward facility-wide `scope='global'` resolution, preserving compatibility-mode fallback for legacy workspace-scoped Aegis rows.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** `src/lib/aegis.ts`
- **Autopilot notes:** Centralize lookup behavior in `getAegis`. Sweep all known Aegis references without changing review semantics. Use the live `quality_reviews.reviewer='aegis'` signal unless a separate migration intentionally changes that model.
- **Definition of done:** Phase 2 deliverables are implemented, P2 acceptance criteria pass for global-only, workspace-only, and legacy-local scenarios, and scheduler behavior remains unchanged with compatibility mode OFF.
- **Implementation evidence:** Complete on PR #20 after merge to `main` as `85d102f`. G7 passed with all 21 generated tasks checked. Evidence includes `src/lib/aegis.ts`, feature-flagged workspace-first/global-first resolver behavior, legacy fallback, idempotent `aegis_local_shadowed` activity writes, `runAegisReviews` using `getAegis(db, task.workspace_id)`, strict-scope coverage in `tsconfig.spec-strict.json` and `eslint.config.mjs`, focused Vitest passing the SPEC-003 resolver/dispatch/flag matrix (9 tests in `src/lib/__tests__/aegis.test.ts`), `pnpm typecheck` passing, `pnpm lint` passing with 0 errors and 10 pre-existing warnings, static guardrails passing with zero matches, `pnpm build` passing with network access for Google Fonts, and `pnpm test:e2e` passing 533 Playwright tests. Full `pnpm test` remains blocked by baseline environment issues: GPG-agent signing failures in `gnap-sync.test.ts` and a provisioner socket timeout.

### SPEC-004: Task Pipeline Engine and Declarative Routing

- **Status:** Complete
- **Branch status:** Implementation, local verification, PR review remediation, GitHub/Argos checks, and merge to `main` completed on PR #22 on 2026-05-01 as `20643d8`.
- **Priority:** P1
- **Branch short name:** `task-pipeline-engine`
- **Dependencies:** SPEC-001, SPEC-002, SPEC-002A, SPEC-003
- **Enables:** SPEC-005, SPEC-007, SPEC-008, SPEC-009C1, SPEC-013B
- **Scope source:** Phase 3 — Task Pipeline Engine + Declarative Routing
- **Acceptance criteria source:** Phase 3 Acceptance Criteria
- **Scope summary:** Implement feature-flagged task-chain behavior over `workflow_templates`, including template identity, task lineage, DB-backed successor uniqueness, constrained JSON Schema validation using direct pinned `ajv`, safe routing-rule evaluation, successor-task creation, outbound sync parity, and workflow-template editor updates.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, `src/types/workflow-template.ts`, plus `src/lib/migrations.ts` and `docs/migrations/rollback-M62.sql` only for the SPEC-004 one-successor-per-parent index.
- **Autopilot notes:** Do not introduce a `task_templates` SQL table. A task-chain template is a domain alias over `workflow_templates`. With the feature flag OFF or fields NULL, task completion must behave exactly as before. Phase 3 reads structured output from `tasks.resolution`; Phase 6 later upgrades artifact handoff. SPEC-004 is allowed one additive schema exception: a partial unique index on non-null `tasks.parent_task_id`, created only after a zero-duplicate preflight.
- **Definition of done:** Phase 3 deliverables are implemented, P3 acceptance criteria pass for valid routing, missing/invalid output failure, fallback, termination, side-effect parity, DB-backed successor uniqueness, dependency pinning, validator constraints, rollback SQL, and repository documentation refresh.
- **Implementation evidence:** Local G7/post gates passed on 2026-05-01 with all 88 generated tasks checked. Evidence includes the shared `createTask()` helper and migrated task-insert callsites, constrained output schema validation, safe routing evaluation, feature-flagged `advanceTaskChain`, explicit `retry_chain_advancement`, M62 successor uniqueness/rollback, workflow-template API/UI chain fields, repository guardrails, high-severity audit remediation, `pnpm guardrails`, strict-scope TypeScript, `pnpm typecheck`, `pnpm lint` with 0 errors / 10 pre-existing warnings, `pnpm test` passing 150 files / 1182 tests under `ulimit -n 8192`, `pnpm build` passing under `ulimit -n 8192`, `pnpm test:e2e` passing 532 tests under `ulimit -n 8192`, and `pnpm audit:high` reporting 0 high vulnerabilities. PR #22 review remediation is complete with zero unresolved review threads, and the latest GitHub checks are green: CodeQL, Quality Gate, Mission Control UI E2E, Argos Storybook, Argos Playwright, and Argos summary.

### SPEC-005: ready_for_owner State and Two-Step Terminal Event

- **Status:** Complete
- **Branch status:** PR #23 (https://github.com/racecraft-lab/mission-control/pull/23) merged to `main` on 2026-05-02 as `851571f`. Implementation and local G7 verification completed in worktree `.worktrees/005-ready-for-owner` on branch `005-ready-for-owner`.
- **Priority:** P1
- **Branch short name:** `ready-for-owner`
- **Dependencies:** SPEC-002, SPEC-002A, SPEC-004
- **Enables:** SPEC-009C1
- **Scope source:** Phase 4 — `ready_for_owner` State + Two-Step Terminal Event
- **Acceptance criteria source:** Phase 4 Acceptance Criteria
- **Scope summary:** Add feature-flagged `ready_for_owner` runtime behavior for PR-producing templates, including Kanban lane, GitHub status label, Aegis approval branching, PR-merge transition to `done`, reconciliation alert on issue closure without merged PR, and notification type.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** new helper `src/lib/task-status.ts`; ready-for-owner notifications stay on existing `src/lib/db.ts`, panel, and delivery callsites.
- **Autopilot notes:** Non-PR-producing templates must continue to complete directly to `done`. `produces_pr=true` tasks must not become `done` until linked PR merge is observed.
- **Definition of done:** Phase 4 deliverables are implemented, P4 acceptance criteria pass for flag OFF, non-PR templates, PR-producing templates, merged PR transition, closed-issue reconciliation, Kanban rendering, and GitHub label sync.
- **Implementation evidence:** Local G7 passed on 2026-05-02 with all 79 generated tasks checked. Evidence includes `ready_for_owner` application-level vocabulary, shared terminal transition guard, flag-off write blocking/read visibility, Aegis and quality-review owner-gate routing, side-effect-free blocked non-merge `done` attempts, explicit linked PR merge completion through `pullFromGitHub`, closed-issue reconciliation activity/notification dedupe, `mc:ready-for-owner` label provisioning/application, dedicated Kanban lane between `quality_review` and `done`, owner-action-required notifications, and accessibility coverage for lane/card/notification keyboard and focus behavior. Final verification passed: `pnpm typecheck`; `pnpm lint` with 0 errors and 12 existing warnings; `pnpm test` with 169 files / 1369 tests after host-permission rerun for GPG/socket tests; `pnpm build` after network-enabled rerun for Next.js Google Fonts with non-fatal existing Turbopack NFT trace warnings; and `pnpm test:e2e` with 535 Playwright tests. Guardrails confirmed no SPEC-005 database migration, DB-level task status CHECK, terminal-event table, issue timeline inference, operator override, or production `webhookFixture` callsite.

### SPEC-006: Area-Label GitHub Sync

- **Status:** Complete
- **Branch status:** PR #21 (https://github.com/racecraft-lab/mission-control/pull/21) merged to `main` on 2026-05-01 as `dbb6c75`. 30 commits landed from branch `006-area-label-github-sync`. All 7 SDD phases completed. Implementation: 64 FRs satisfied, 88+ tasks landed, 1228/1228 unit tests passed with zero regressions vs baseline, and GitHub checks passed for CodeQL, Quality Gate, docker UI e2e, Argos Playwright, Argos Storybook, and Argos summary. Two scope deferrals under Constitution Article XII remain documented: sync-owner re-election (operator preflight covers it) and backfill bookend activity kinds (SC-006 testable without them).
- **Priority:** P1
- **Branch short name:** `area-label-github-sync`
- **Dependencies:** SPEC-001, SPEC-002, SPEC-002A
- **Enables:** SPEC-009B, SPEC-009C1
- **Scope source:** Phase 5 — Area-Label GitHub Sync
- **Acceptance criteria source:** Phase 5 Acceptance Criteria
- **Scope summary:** Add feature-flagged `area:*` label routing and repo-level sync ownership/dedupe so multiple department projects can share one product-line monorepo without duplicate polling or duplicate ingestion.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** N/A unless the optional `projects.area_slug` path introduces new TS/TSX modules; existing-file edits remain outside strict-scope expansion
- **Autopilot notes:** Keep existing GitHub sync behavior unchanged when the flag is OFF. Use one repo-level owner or equivalent dedupe path per `(workspace_id, github_repo)`; the existing uniqueness constraint is a guardrail, not the routing strategy.
- **Definition of done:** Phase 5 deliverables are implemented, P5 acceptance criteria pass for no-duplicate ingestion, resolvable area routing, triage fallback, ambiguity activity, outbound area labels, and idempotent label provisioning.

### SPEC-007: Disposition Logging and Task Artifact Store

- **Status:** Complete
- **Branch status:** PR #25 (https://github.com/racecraft-lab/mission-control/pull/25) merged to `main` on 2026-05-02 as `953f29b`.
- **Priority:** P2
- **Branch short name:** `disposition-artifacts`
- **Dependencies:** SPEC-002, SPEC-002A, SPEC-004
- **Enables:** SPEC-009D, SPEC-014C
- **Scope source:** Phase 6 — Disposition Logging + Artifact Store + Admin Panels
- **Acceptance criteria source:** Phase 6 Acceptance Criteria
- **Scope summary:** Add feature-flagged triage disposition inserts, Mission Control-owned task artifact publishing/consumption, disposition audit view, artifact admin/health surface, dashboard rollups, and documented morning-briefing query integration.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** `src/lib/task-artifacts.ts`, `src/app/api/task-artifacts/route.ts`, `src/app/api/task-artifacts/[id]/route.ts`, `src/components/panels/artifact-admin-panel.tsx`, `src/app/api/dispositions/route.ts`
- **Autopilot notes:** Insert one disposition row per triage template completion when enabled, but never block task advancement on insert failure. Successor dispatch should consume MC artifact references/previews rather than another agent’s private sandbox.
- **Definition of done:** Phase 6 deliverables are implemented, P6 acceptance criteria pass for disposition logging, failure isolation, filters, rollups, artifact publish/consume, secret handling, storage health metrics, and admin maintenance actions.
- **Implementation evidence:** Complete on PR #25 after merge to `main` as `953f29b`. Evidence includes `task_dispositions` rollups and API routes, Mission Control-owned `task_artifacts` publish/read/admin/health surfaces, secret detection and redaction fixtures, dashboard/audit/admin UI surfaces, dispatch input artifact integration, openapi updates, Storybook/Argos metadata support, SPEC-007 e2e seed support, and retrospective evidence noting implementation complete with remaining operator-led verification/polish caveats.

### SPEC-008: Resource Governance and Cost Tracker Enforcement

- **Status:** Complete
- **Branch status:** PR #26 (https://github.com/racecraft-lab/mission-control/pull/26) merged to `main` on 2026-05-04 as `bd9a693`.
- **Priority:** P2
- **Branch short name:** `resource-governance`
- **Dependencies:** SPEC-001, SPEC-002, SPEC-002A, SPEC-004
- **Enables:** SPEC-009A, SPEC-011, SPEC-013B
- **Scope source:** Phase 7 — Resource Governance + Cost Tracker Enforcement
- **Acceptance criteria source:** Phase 7 Acceptance Criteria
- **Scope summary:** Extend Cost Tracker into feature-flagged scheduler enforcement for WIP, blackout/degraded windows, budgets, policy events, operator overrides, and optional runtime-only OpenClaw electricity/infra cost visibility.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** `src/lib/resource-governance.ts`, `src/app/api/resource-policies/route.ts`, `src/app/api/resource-policy-events/route.ts`, `src/lib/openclaw-health-costs.ts`
- **Autopilot notes:** Do not duplicate token/cost telemetry. `FEATURE_RESOURCE_GOVERNANCE=false` preserves legacy scheduler behavior. `FEATURE_OPENCLAW_HEALTH_COSTS` is fork-only optional, runtime-only, absent-safe, and must require no v1 schema migration.
- **Definition of done:** Phase 7 deliverables are implemented, P7 acceptance criteria pass for legacy behavior, empty-policy allow, WIP limits, blackout/degraded windows, soft/hard budgets, subscription raw-usage enforcement, OpenClaw absence safety, valid telemetry display, and fail-safe policy evaluation.
- **Implementation evidence:** Complete on PR #26 after merge to `main` as `bd9a693`. Evidence includes the feature-flagged synchronous resource policy evaluator, observability ingestion/reconciliation pipeline, M65a..m + M66 additive migrations and rollback files, Cost Tracker Governance tab with Policies/Budgets/Windows/Overrides/Diagnostics/System Health subviews, feature-flag matrix harness, axe coverage guard, feature-flag env-leak guard, strict-scope guard, runbooks, observability docs, and SPEC-008 summary/retrospective evidence. Operator-led soak/chaos and selected running-instance e2e checks remain documented as non-merge-blocking follow-up evidence, not blockers for SPEC-009A planning.

### SPEC-009A: Workflow Contract Format and Roundtrip

- **Status:** Complete
- **Priority:** P0
- **Branch short name:** `workflow-contract-roundtrip`
- **Dependencies:** SPEC-002A, SPEC-004, SPEC-008
- **Enables:** SPEC-009B, SPEC-012A
- **Scope source:** Phase 8A - Workflow contract roundtrip
- **Acceptance criteria source:** Phase 8A Acceptance Criteria
- **Scope summary:** Define the repo-owned Mission Control workflow contract under `docs/ai/workflows/`, import it into `workflow_templates`, export it back to Markdown, and prove fail-closed validation for invalid YAML, template variables, tracker identity, capability declarations, concurrency/retry fields, sandbox fields, prompt versions, routing-rule hashes, output-schema hashes, and feature-flag dependencies. No product-line seed and no live pilot run.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** workflow contract files under `docs/ai/workflows/`, import/export tooling, focused parity tests, and any small validation helper needed by setup. No autonomous dispatch, no runner launch, no new harness adapter.
- **Autopilot notes:** Treat GitHub Issues as the tracker identity in v1. Preserve last-known-good workflow templates when contract reload fails. Do not bake OpenClaw, Codex, Claude, Hermes, or OpenCode as mandatory; declare capabilities and adapter requirements as data.
- **Definition of done:** Contract import/export parity passes for the Mission Control workflow family; invalid contract fixtures fail closed with operator-visible errors; existing `workflow_templates` behavior is unchanged unless the spec command explicitly imports the contract.
- **Implementation evidence:** Local implementation and post-implementation verification completed on branch `009a-workflow-contract-roundtrip` on 2026-05-06. Evidence includes exact direct `yaml@2.8.2`, canonical contract at `docs/ai/workflows/mission-control/workflow-contract.yaml`, `pnpm workflow-contract` import/apply/export/recover tooling, generated Markdown review export with stable hash `workflow-contract-hash-v1:sha256:2f0e9ef6e21ca80039c49bc6398bf8f7bd1493be454ff5d7e381391b4b8884da`, additive M71 diagnostics/snapshot storage plus rollback SQL, read-only diagnostics API/UI, OpenAPI/API-index parity, fail-closed validation fixtures, full Vitest/build/typecheck/lint/focused Playwright evidence, final GitNexus embeddings rebuild copied to the primary checkout root, and guardrail verification confirming no pilot seed, dispatch, scheduler, runner, harness, GitHub sync, sandbox lifecycle, or governance evaluator path.

### SPEC-009B: Mission Control Product-Line Seed and Flag Activation

- **Status:** Complete
- **Priority:** P0
- **Branch short name:** `mission-control-seed`
- **Dependencies:** SPEC-009A, SPEC-006, SPEC-008
- **Enables:** SPEC-009C1, SPEC-010A
- **Scope source:** Phase 8B - Mission Control product-line seed and flag activation
- **Acceptance criteria source:** Phase 8B Acceptance Criteria
- **Scope summary:** Seed Mission Control as Product Line A with workspace, departments, agent assignments, GitHub repo routing, separate Issue Triage and Issue Remediation workflow families from the SPEC-009A contract mechanism, Phase 1-7 feature flags, and conservative governance policies. This proves configuration and policy shape without dispatching a live autonomous issue.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** `scripts/seed-mission-control-product-line.ts` if authored in TypeScript; seed fixtures/config docs; focused tests for idempotent seed output, GitHub repo preservation, assignments, feature flags, and governance rows.
- **Autopilot notes:** Preserve GitHub linkage and sync metadata for previously synced Mission Control issues. The app remains the setup/observability/control surface; it is not the pilot intake path.
- **Definition of done:** Running the seed twice leaves one Mission Control product-line workspace with expected departments, assignments, repo config, imported Issue Triage and Issue Remediation templates, feature flags, and governance policies; no autonomous issue is claimed or dispatched by this spec.
- **Implementation evidence:** Local implementation and post-implementation verification completed on branch `009b-mission-control-seed` on 2026-05-07. Evidence includes the Mission-Control-specific seed/preflight/verify CLI, idempotent clean-target seed evidence, non-destructive blocked-preflight evidence for non-Mission-Control residue, backup/export-first FocusEngine/OpenClaw cleanup runbook, canonical `PILOT_MISSION_CONTROL_E2E` registry and runbook alignment, corrected Mission Control workflow-contract slugs plus regenerated Markdown export hash `workflow-contract-hash-v1:sha256:4e485c97c7136a79619c362ba7de26cd9439ea49f60ea54a2f14414a7a287c92`, conservative advisory governance rows, focused Vitest coverage, typecheck/lint/build/e2e evidence, and guardrails confirming no synthetic issue, claim, dispatch, scheduler launch, runner state, sandbox lifecycle, generic Product Line B seeder, or auto-merge path.

### SPEC-009C1: GitHub Pilot Issue Ingest and Eligibility

- **Status:** Complete; PR #34 merged, PR #40 post-merge routing fix merged, HAL live smoke passed
- **Priority:** P0
- **Branch short name:** `pilot-issue-ingest`
- **Dependencies:** SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009B
- **Enables:** SPEC-009C2
- **Scope source:** Phase 8C1 - GitHub pilot issue ingest and eligibility
- **Acceptance criteria source:** Phase 8C1 Acceptance Criteria
- **Scope summary:** Select one eligible live `racecraft-lab/mission-control` issue or create one synthetic `[mc-pilot]` GitHub issue only when no safe live issue exists. Ingest/sync it into Mission Control as a GitHub-linked pilot root task and prove local-only tasks cannot enter the pilot lane.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** pilot issue selection, synthetic fallback, GitHub ingest/sync fixtures, eligibility guards, smoke-checklist setup, and no Issue Remediation execution.
- **Autopilot notes:** Start from GitHub ingest/sync. Local-only tasks created through `/api/tasks` or the task board are not eligible. Setup decision: SPEC-009C1 uses operator-triggered or fixture-driven sync only; automatic GitHub sync cron/poller lifecycle is deferred to SPEC-013A1, and production eligibility/evidence surfaces are deferred to SPEC-009E.
- **Definition of done:** Exactly one pilot issue is represented as a GitHub-linked Mission Control task with expected labels, repo linkage, eligibility evidence, and no claim/dispatch/runner state. Branch evidence includes focused SPEC-009C1 Vitest coverage, typecheck, lint, production build, full `pnpm test`, and a passing G7 gate. Post-merge evidence on 2026-05-15 includes HAL deploy at `e6ee19ee`, synthetic issue #42 clean-run smoke, duplicate/no-side-effect/local-only proofs, closure of synthetic issues #37/#39/#41/#42, and cleanup of disposable `[mc-pilot]` Mission Control smoke rows after database backup.

### SPEC-009C2: Triage-to-Remediation Plan Handoff

- **Status:** Complete; PR #43 merged, PR #46 post-merge assignee fix merged, HAL live synthetic smoke passed and cleanup verified
- **Priority:** P0
- **Branch short name:** `triage-remediation-handoff`
- **Dependencies:** SPEC-009C1
- **Enables:** SPEC-009C3
- **Scope source:** Phase 8C2 - triage to remediation plan handoff
- **Acceptance criteria source:** Phase 8C2 Acceptance Criteria
- **Scope summary:** Drive the eligible pilot issue through the Issue Triage workflow family and create the bounded Issue Remediation planning successor only when the disposition is `ACTIONABLE_REMEDIATION`.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** Mission Control workflow-contract correction for triage disposition schema/routing, triage routing fixtures, disposition/artifact evidence, successor creation through existing task-chain helpers, and negative cases for duplicate, OBE, invalid, needs-human, needs-specialist, and `NEEDS_SPEC`.
- **Autopilot notes:** SpecKit/SDD remains a later destination for `NEEDS_SPEC`; it is not the default pilot lane. Production routing/evidence for non-remediation outcomes is deferred to SPEC-009F.
- **Definition of done:** The pilot issue either enters remediation planning with traceable disposition/artifact evidence or exits through a non-remediation disposition without creating remediation work. Branch evidence covers the workflow-contract routing correction, uppercase pilot disposition taxonomy, duplicate actionable idempotency, negative outcome evidence, invalid-output fail-closed behavior, and SPEC-007 lowercase disposition compatibility. Post-merge evidence on 2026-05-15/2026-05-16 includes HAL deploy at `19b2db98`, fresh synthetic issue #47 driving `ACTIONABLE_REMEDIATION` into exactly one remediation-planning successor, duplicate handoff retry preserving one successor/disposition/artifact/activity set, closure of synthetic issues #44/#45/#47, removal of stale disposable task #35, cleanup of all SPEC-009C2 synthetic Mission Control rows and UAT fixture agents/assignments, and backup files retained on HAL before live cleanup.

### SPEC-009C3: Dev/Review/Aegis to Ready for Owner

- **Status:** Complete
- **Priority:** P0
- **Branch short name:** `remediation-ready-for-owner`
- **Dependencies:** SPEC-009C2
- **Enables:** SPEC-009C4
- **Scope source:** Phase 8C3 - remediation execution to ready for owner
- **Acceptance criteria source:** Phase 8C3 Acceptance Criteria
- **Scope summary:** Execute the pilot remediation chain through remediation planning, development, review, and Aegis until the linked PR-producing task reaches `ready_for_owner`.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** focused fixtures for the Issue Remediation family, artifact handoff, governance evidence, Aegis approval, and `ready_for_owner` state. No manual merge reconciliation and no formal claim-state table, sandbox runner, adapter registry, or full SpecKit/SDD execution lane.
- **Autopilot notes:** Operator intervention is still forbidden in this spec; the human merge gate belongs to SPEC-009C4.
- **Governance boundary note:** SPEC-009C3 verifies advisory governance evidence only: no resource-policy violations, no blocked budget/window result, and enough activity/artifact evidence for later review. Remaining durable governance, run-state, claim authority, control-plane, polling, retry/debug, sandbox, and adapter work remains in SPEC-009D, SPEC-009E, SPEC-013A, SPEC-013A1, SPEC-013B, SPEC-013C, and SPEC-014A-D.
- **Definition of done:** The pilot remediation task reaches `ready_for_owner` with a linked PR, disposition/artifact evidence, governance evidence, Aegis approval, and no resource-policy violations.
- **Implementation evidence:** Local G7 passed on branch `009c3-remediation-ready-for-owner` with all 70 generated tasks checked; PR #48 merged as `ac7760a222a33b4cefe886afae605238f479eaa5`. Evidence includes C3 artifact envelope validation and sanitized failure activity, review `pass`/`fix` readiness routing, canonical Aegis approval gating through `quality_reviews`, advisory governance readiness blocking, deterministic fixture PR identity, PR-producing dev-task-only `ready_for_owner`, and scope-guard coverage proving no merge/done reconciliation, claim/run tables, sandbox/adapter work, automatic poller, broad slug migration, or dedicated evidence UI entered the diff. Final verification passed: focused C3 Vitest, full `pnpm test` with 276 files / 2876 tests, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `node scripts/spec-009c3/check-scope-guards.mjs`. Post-merge HAL UAT on 2026-05-19 promoted HAL to `ac7760a222a33b4cefe886afae605238f479eaa5`, backed up `mission-control-data/backups/mission-control.db.spec009c3-uat-20260519-195459.bak`, applied workspace `4` workflow contract run `8`, created draft PR #49 as `isDraft=true`/`mergedAt=null`, drove synthetic dev task `39` through the live quality-review API to `ready_for_owner` with five `spec-009c3.v1` artifacts, one Aegis approval row, and a `task_ready_for_owner` notification, then closed unmerged PR #49 and removed all synthetic Mission Control smoke rows plus the temp branch/worktree. Playwright/e2e was N/A because no UI/browser workflow changed.

### SPEC-009C4: Owner Merge Gate and Done Reconciliation

- **Status:** Complete
- **Priority:** P0
- **Branch short name:** `owner-merge-reconciliation`
- **Dependencies:** SPEC-009C3
- **Enables:** SPEC-009D, SPEC-010B
- **Scope source:** Phase 8C4 - owner merge gate and done reconciliation
- **Acceptance criteria source:** Phase 8C4 Acceptance Criteria
- **Scope summary:** Record the intentional `G_PILOT_MERGE` human gate, merge the linked pilot PR, sync GitHub state back into Mission Control, and prove `ready_for_owner -> done` reconciliation without duplicate launch or local-only terminal completion.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** merge-gate checklist evidence, GitHub closed/merged webhook fixture, reconciliation activity assertions, label/status sync, and no new claim/runner/sandbox model.
- **Autopilot notes:** Operator intervention is allowed only at `G_PILOT_MERGE`. The PR-merge-to-`done` path remains code-checkable through a fixture.
- **Definition of done:** The operator records the merge gate in `docs/qa/pilot-smoke-checklist.md`; GitHub sync transitions the pilot task from `ready_for_owner` to `done`; issue/PR state, labels, activities, and deferred runner fields are traceable for SPEC-009D.
- **Implementation evidence:** Branch `009c4-owner-merge-reconciliation` completed all 55 generated tasks, passed local G7, and merged implementation PR #52 to `main` as `ddc709f2f200a4ee4df51398d39ef42d85bd6e54`. Evidence includes explicit merged-PR truth for the exact linked repo/PR, supporting-only `merged_at`/`merge_commit_sha` fail-closed coverage, wrong PR/repo negative cases, failed-sync no-terminal-side-effect coverage, local-only `done` rejection, `mc:done` projection with stale `mc:ready-for-owner` removal, bounded terminal activity/notification assertions, and duplicate-sync idempotency with no duplicate launch. Final verification passed with Node 22: focused C4 Vitest passed 30 tests; `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm test:all` passed; `pnpm test` reported 275 passed test files / 2894 passed tests, and `pnpm test:all` included 646 passing Playwright tests after refreshing the missing Playwright Chromium cache. Operator-approved live UAT created fresh issue #50 and PR #51, verified the linked task stayed `ready_for_owner` before `G_PILOT_MERGE`, squash-merged PR #51, reconciled the task to `done` through existing `POST /api/github/sync`, proved duplicate sync returned `pulled=0` / `pushed=0`, and cleaned all disposable local UAT rows while retaining issue #50 and merged PR #51 as external audit trail. Post-merge target deployment promotion on HAL fast-forwarded `/home/fredrick-gabelmann/mission-control` to `ddc709f2`, `pnpm build` passed, `mission-control.service` restarted successfully, `/login` returned 200, and authenticated `/api/status` returned 200. Target replay UAT on workspace `4` / project `3` inserted disposable task `41` linked to retained issue #50 / PR #51, `POST /api/github/sync` returned `pulled=1` / `pushed=0`, task `41` reconciled to `done` with `completed_at=1779246054` and `github_synced_at=1779246054`, duplicate sync returned `pulled=0` / `pushed=0`, no successor child was created, and the disposable task row was removed after evidence capture while sync log rows `160`/`161` remain as live deployment audit history. Backup before target replay: `/home/fredrick-gabelmann/mission-control-data/backups/mission-control.db.spec009c4-target-uat-20260520-025827.bak`.

### SPEC-009D: Pilot Review Packet and Lifecycle Snapshot

- **Status:** Complete
- **Priority:** P1
- **Branch short name:** `pilot-review-lifecycle`
- **Dependencies:** SPEC-007, SPEC-008, SPEC-009C4
- **Enables:** SPEC-009E, SPEC-013A
- **Scope source:** Phase 8D - Pilot review packet and lifecycle snapshot
- **Acceptance criteria source:** Phase 8D Acceptance Criteria
- **Scope summary:** Materialize a compact pilot review packet and lifecycle snapshot from existing task, activity, artifact, governance, scheduler, and `AgentRun` surfaces. Unsupported fields are explicitly labeled as SPEC-013A-C/SPEC-014A-D follow-up gaps, not silently inferred.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** review packet assembly, lifecycle snapshot derivation, smoke checklist evidence capture, redaction/reuse of SPEC-007 artifact handling, and tests over current-state derivation.
- **Autopilot notes:** Do not build the formal run-state model here. This spec gives humans enough evidence to trust the pilot and gives SPEC-013A a concrete baseline for what must become durable state.
- **Definition of done:** Operators can inspect one packet that names current stage, latest artifact/error, governance decision, Aegis/owner gate state, linked issue/PR, known duplicate-active-stage check, and all unsupported run/sandbox fields deferred to later specs.
- **Implementation evidence:** Branch `009d-pilot-review-lifecycle` completed all 42 generated tasks and merged implementation PR #54 to `main` as `765264be667bd31d6266f606602a219312f72f23`. Implementation adds a stored-evidence-only packet derivation module, JSON/Markdown artifact publication through existing task artifact behavior, packet-local evidence states, SPEC-013/SPEC-014 deferrals, local-only/partial-proof exclusion, and strict TypeScript/ESLint coverage for SPEC-009D-owned files. Verification passed under Node 22.22.2: focused packet/artifact/disposition tests passed 20 tests, existing task-artifact seam tests passed 38 tests, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm guardrails`, `pnpm audit:high`, `pnpm test` with 278 passed files / 2920 passed tests, and `pnpm test:e2e` with 646 passing Playwright tests. UAT on 2026-05-20 seeded a disposable Mission Control database from retained issue #50 / PR #51 evidence, generated a `proven` packet at stage `done`, published JSON artifact `2` and Markdown artifact `3` through the real artifact store, inspected both through existing `/api/task-artifacts` routes, and cleaned seeded rows after backup. Post-merge `main` CI/CD checks for the merge commit passed: Quality Gate, CodeQL, Mission Control UI E2E, Visual Storybook Snapshots, Playwright visual approval, and Storybook visual approval. No migration, new runtime dependency, packet-specific route, dashboard, fresh GitHub call, poller, claim authority, retry controls, sandbox lifecycle, adapter registry, or real harness execution was added.

### SPEC-009E: Pilot Eligibility and Evidence Surfaces

- **Status:** Pending
- **Priority:** P2
- **Branch short name:** `pilot-evidence-surfaces`
- **Dependencies:** SPEC-009D
- **Enables:** SPEC-009F, SPEC-013A
- **Scope source:** Phase 8E - pilot eligibility and evidence surfaces
- **Acceptance criteria source:** Phase 8E Acceptance Criteria
- **Scope summary:** Convert the SPEC-009C/009D manual smoke and review-packet evidence into durable read-only operator surfaces that show pilot eligibility inputs, GitHub-linked task evidence, current smoke status, and explicitly deferred automation/run-state fields without requiring terminal history.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** read-only API/UI or diagnostics surfaces, evidence derivation from existing task/activity/artifact/governance/review-packet state, smoke checklist linkage, and tests. No GitHub sync automation, no claim authority, no runner/sandbox model, and no new workflow language.
- **Autopilot notes:** This spec exists because SPEC-009C1 intentionally does not add production UI. Use the SPEC-009D packet as the evidence model before deciding exact UI/API shape.
- **Definition of done:** Operators can open one read-only surface for the pilot issue and see eligibility labels, repo/issue linkage, synced task identity, smoke evidence links, current stage, and unsupported fields clearly labeled as future SPEC-013/014 work.

### SPEC-009F: Production Triage Outcome Routing

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `production-triage-routing`
- **Dependencies:** SPEC-009E, SPEC-012A
- **Enables:** Later production triage lanes
- **Scope source:** Phase 8F - production triage outcome routing
- **Acceptance criteria source:** Phase 8F Acceptance Criteria
- **Scope summary:** Turn clean-exit Issue Triage outcomes into production routes and evidence after the pilot evidence surface exists: `NEEDS_SPEC` routes toward a SpecKit/SDD handoff, needs-human routes to a clarification loop, needs-specialist routes to specialist assignment, and duplicate/obsolete/invalid outcomes route to close/reject recommendations without entering Issue Remediation.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** production routing/evidence for non-remediation triage outcomes, operator-visible controls where needed, and tests proving no remediation successor is created for these outcomes. No Issue Remediation execution, no automatic GitHub polling, no formal claim/reconciliation, no runner state, no sandbox lifecycle, no harness adapter work, and no auto-merge policy.
- **Autopilot notes:** Builds on the SPEC-009C2 taxonomy and the SPEC-009E evidence surfaces. It is not required for the SPEC-009C3/C4 pilot remediation path and should not be pulled into SPEC-009C2.
- **Definition of done:** Operators can drive each non-remediation triage fixture and inspect the correct production lane/evidence while verifying that no Issue Remediation successor, claim, runner, sandbox, or auto-close side effect is created unless that side effect is explicitly owned by this spec.

### SPEC-010A: Generic Product-Line Seeder

- **Status:** Pending
- **Priority:** P2
- **Branch short name:** `generic-product-line-seeder`
- **Dependencies:** SPEC-002A, SPEC-009B
- **Enables:** SPEC-010B
- **Scope source:** Phase 9A - Generic product-line seeder
- **Acceptance criteria source:** Phase 9A Acceptance Criteria
- **Scope summary:** Parameterize the Mission Control seed path into a reusable product-line seeder that accepts product-line slug, display name, agent prefix, GitHub repo, workflow family, feature flags, and governance defaults. It does not onboard Product Line B or run a second smoke.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** seed script parameterization, config schema/fixture docs, idempotency tests, validation errors, and no runtime scheduler behavior.
- **Autopilot notes:** Keep facility agents global, product-line agents isolated, and GitHub repo identity explicit. This can run while the remaining SPEC-009C handoff slices are being smoked because it does not touch pilot execution.
- **Definition of done:** The generic seeder can reproduce the Mission Control seed from config and rejects incomplete or unsafe product-line configs without mutating existing workspaces.

### SPEC-010B: Product Line B Onboarding Smoke

- **Status:** Pending
- **Priority:** P2
- **Branch short name:** `product-line-b-smoke`
- **Dependencies:** SPEC-009C4, SPEC-010A
- **Enables:** SPEC-012B
- **Scope source:** Phase 9B - Product Line B onboarding smoke
- **Acceptance criteria source:** Phase 9B Acceptance Criteria
- **Scope summary:** Onboard Product Line B as the second product line, provision or register isolated agents through the configured harness substrate, configure its canonical repo, and run one live or synthetic issue through the already-proven pilot subset. Mission Control Product Line A must remain unaffected.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** Product Line B seed config, isolation assertions, one smoke checklist path, dashboard/API assertions for per-workspace metrics, and no new workflow language.
- **Autopilot notes:** Manual "<1 operator-hour" timing is checklist-only. FocusEngine Mission Control project/repo sync unlink, stale issue cleanup, and GitHub sync/triage cron cleanup are a Product Line B preflight prerequisite, not part of this spec. Existing OpenClaw runtime agents may remain as reusable runtime identities unless separately decommissioned, but Product Line B can use them only through explicit product/project role assignment after the runtime profile has been generalized and adapter eligibility passes. Docker, OpenClaw-owned, Mission-Control-owned worktree, or external-harness sandboxes remain valid choices according to the product-line config.
- **Definition of done:** Product Line B can be seeded, enabled, smoked, disabled, and inspected independently; SQL/API checks prove product-line agent isolation and shared facility-agent reuse.

### SPEC-011: CrabTrap Honeypot Adapter

- **Status:** Pending
- **Priority:** P2
- **Branch short name:** `crabtrap-honeypot`
- **Dependencies:** SPEC-008
- **Enables:** —
- **Scope source:** Phase 7.5 - CrabTrap honeypot adapter
- **Acceptance criteria source:** Phase 7.5 Acceptance Criteria
- **Scope summary:** Add a fork-only optional CrabTrap adapter that validates honeypot webhook payloads and writes bounded `activities.kind='security_intrusion_detected'` rows for Mission Control API and sandbox probes.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** `src/lib/crabtrap-adapter.ts` and focused tests. No schema migration, no OpenAPI contract change, no scheduler/task-dispatch dependency.
- **Autopilot notes:** Runtime adapter only. With `FEATURE_CRABTRAP_HONEYPOT=false`, no CrabTrap path is reachable. Missing binary/config/webhook secret must be absent-safe.
- **Definition of done:** Flag-off no-op, valid webhook-to-activity, malformed webhook safe handling, and CrabTrap-absent handling are covered by tests and human deploy notes.

### SPEC-012A: Repo Knowledge Index and AGENTS Map

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `repo-knowledge-index`
- **Dependencies:** SPEC-002A, SPEC-009A
- **Enables:** SPEC-012B, SPEC-013A
- **Scope source:** Phase 10A - Repo knowledge index and AGENTS map
- **Acceptance criteria source:** Phase 10A Acceptance Criteria
- **Scope summary:** Make repository-local knowledge discoverable without hiding operator context in a giant instruction file: concise `AGENTS.md` map, machine-readable docs index, ownership/freshness metadata, workflow/status pointers, and exact verification commands for durable docs.
- **Tool count / tool names:** N/A - process/tooling spec
- **Strict Scope:** docs index, `AGENTS.md` map updates, link/freshness checks, and CI/local guard scripts. No runtime source, no migrations, no UI.
- **Autopilot notes:** Keep `AGENTS.md` short. Preserve SpecKit workflow files as execution ledgers and this roadmap/PRD as durable intent. Treat unresolvable Obsidian wikilinks as informational unless the repo also contains the referenced fact.
- **Definition of done:** Agents can start a new spec from repo-local indexes, find source-of-truth docs, understand current status, and run a guard that fails on stale/missing ownership metadata.

### SPEC-012B: Harness-Gardening Drift Guards

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `harness-gardening-guards`
- **Dependencies:** SPEC-010B, SPEC-012A
- **Enables:** Later cleanup specs
- **Scope source:** Phase 10B - Harness-gardening drift guards
- **Acceptance criteria source:** Phase 10B Acceptance Criteria
- **Scope summary:** Add narrow cleanup-task generation and drift checks after two product lines exist: stale PRD/roadmap/workflow claims, missing evidence, stale feature-flag status, low-value tests, strict-scope drift, and broken source-of-truth links.
- **Tool count / tool names:** N/A - process/tooling spec
- **Strict Scope:** guard scripts, cleanup workflow template, docs/checklist updates, and tests over representative stale/fresh fixtures. No runtime product behavior.
- **Autopilot notes:** This spec converts harness engineering into recurring small Mission Control tasks, not periodic broad rewrites.
- **Definition of done:** A guard can create or recommend one narrow Mission Control cleanup task for each supported drift class, with evidence and owner metadata attached.

### SPEC-013A: Run-State Persistence Spine

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `run-state-spine`
- **Dependencies:** SPEC-009D, SPEC-012A
- **Enables:** SPEC-013A1
- **Scope source:** Phase 11A - Run-state persistence spine
- **Acceptance criteria source:** Phase 11A Acceptance Criteria
- **Scope summary:** Define the minimum durable state needed for claimed/running/retrying/released task-stage work. Reuse or extend `src/lib/runs.ts` and `AgentRun.metadata` where possible before adding additive schema.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** run-state model, migration only if justified and additive, serialization helpers, fixtures, and read-only debug output. No claim authority, no scheduler launch, no retry policy.
- **Autopilot notes:** The output is an observable state spine that SPEC-013A1 and SPEC-013B can claim against. It must explain why existing `AgentRun` fields are insufficient before adding new tables.
- **Definition of done:** A task-stage attempt can be represented, inspected, archived, and ignored safely with `FEATURE_TASK_CONTROL_PLANE=false`.

### SPEC-013A1: GitHub Sync Automation and Poller Lifecycle

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `github-sync-automation`
- **Dependencies:** SPEC-009D, SPEC-012A, SPEC-013A
- **Enables:** SPEC-013B
- **Scope source:** Phase 11A1 - GitHub sync automation and poller lifecycle
- **Acceptance criteria source:** Phase 11A1 Acceptance Criteria
- **Scope summary:** Make GitHub issue sync automatic, observable, and operator-controllable by wiring or replacing the existing `github-sync-poller` lifecycle through the runtime scheduler/control-plane seams, with safe intervals, startup/shutdown behavior, last-run/error visibility, manual-sync fallback, and disable/rollback behavior.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** GitHub sync poller lifecycle, scheduler/runtime integration, status/debug output, operator disable controls, interval/backoff safety, and tests. No task claim authority, no Issue Remediation execution, no harness adapter, no sandbox lifecycle, and no auto-merge behavior.
- **Autopilot notes:** This spec exists because SPEC-009C1 intentionally uses operator-triggered or fixture-driven sync. It should preserve existing manual `/api/github/sync` behavior and owner-based polling semantics while making automatic sync explicit before SPEC-013B relies on concurrent scheduler ticks.
- **Definition of done:** One product line can enable automatic GitHub issue polling, observe last run/error/disabled state, disable the poller without losing manual sync, and verify no duplicate ingestion when multiple projects share one repo.

### SPEC-013B: Claim and Reconciliation Authority

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `claim-reconciliation`
- **Dependencies:** SPEC-004, SPEC-006, SPEC-008, SPEC-013A1
- **Enables:** SPEC-013C, SPEC-014A
- **Scope source:** Phase 11B - Claim and reconciliation authority
- **Acceptance criteria source:** Phase 11B Acceptance Criteria
- **Scope summary:** Add one coordination path that prevents duplicate dispatch, reconciles task/GitHub/resource state before launch, gates autonomous eligibility on GitHub-linked work, and records release/stop decisions.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** scheduler/task-dispatch claim seam, resource-governance integration, GitHub-linked eligibility, reconciliation checks, and tests for concurrent ticks. No sandbox runner, no harness adapter, no retry UI.
- **Autopilot notes:** Do not duplicate `advanceTaskChain`; SPEC-004 remains successor-selection authority. Web-created local-only tasks remain visible but not autonomous runner intake.
- **Definition of done:** With `FEATURE_TASK_CONTROL_PLANE=true`, concurrent ticks cannot claim the same stage twice, terminal task/GitHub state releases work before dispatch, and governance blocks/deferred states prevent new launches.

### SPEC-013C: Retry/Backoff and Debug Surfaces

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `retry-debug-surfaces`
- **Dependencies:** SPEC-013B
- **Enables:** SPEC-014C
- **Scope source:** Phase 11C - Retry/backoff and debug surfaces
- **Acceptance criteria source:** Phase 11C Acceptance Criteria
- **Scope summary:** Add bounded retry/backoff reason codes, operator cancel/retry/release controls, JSON debug surfaces, audit rows, and refresh triggers on top of the SPEC-013B claim authority.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** retry policy, debug API, minimal UI or CLI/MCP exposure if needed, audit integration, and focused tests. No sandbox lifecycle or adapter registry.
- **Autopilot notes:** Separate normal continuation retries from failure, timeout, stale-state, and operator-release reasons. Do not mutate GitHub issue truth except through the documented sync/reconciliation path.
- **Definition of done:** Operators can inspect, retry, release, or cancel a claimed stage through one documented surface; every mutation emits bounded state and audit evidence.

### SPEC-014A: Sandbox Ownership and Lifecycle Contract

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `sandbox-lifecycle-contract`
- **Dependencies:** SPEC-013B
- **Enables:** SPEC-014B
- **Scope source:** Phase 12A - Sandbox ownership and lifecycle contract
- **Acceptance criteria source:** Phase 12A Acceptance Criteria
- **Scope summary:** Define deterministic, sanitized, product-line-scoped sandbox keys/paths and lifecycle hooks for `mission_control`, `openclaw`, and `external_harness` ownership using fakes only. No real harness launches.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** sandbox path/key helpers, lifecycle hook interface, fake owner implementations, cleanup policy, and tests for path traversal/rollback. No adapter manifest, no token accounting, no real runner.
- **Autopilot notes:** Sandbox ownership is a user/workflow choice. Mission Control-owned worktrees, OpenClaw-owned sandboxes, and external harness handles must all fit the same lifecycle vocabulary.
- **Definition of done:** Sandbox paths cannot escape the configured root; lifecycle events are inspectable; disabling `FEATURE_AGENT_RUNNER_SANDBOXES` prevents all sandbox create/run paths.

### SPEC-014B: Harness Adapter Manifest and Fake Registry

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `adapter-manifest-fakes`
- **Dependencies:** SPEC-014A
- **Enables:** SPEC-014C, SPEC-014D
- **Scope source:** Phase 12B - Harness adapter manifest and fake registry
- **Acceptance criteria source:** Phase 12B Acceptance Criteria
- **Scope summary:** Define the typed harness adapter manifest and registry: launch/resume/stop, transcript/event read, token/runtime accounting, artifact publication, sandbox posture, MCP/skills/plugins/memory exposure, provider/account constraints, approval policy, timeout policy, user-input policy, and runtime-inventory state (`visible`, `unassigned`, `assigned`, `eligible`, `blocked`). Prove the contract with at least two fake adapters.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** adapter types, manifest validation, fake registry, capability-resolution packet, runtime-inventory state model, unsupported-capability fail-closed behavior, and tests. No real Codex/Claude/OpenClaw/Hermes execution.
- **Autopilot notes:** A real adapter cannot land before the fake registry proves Mission Control state is not Codex-specific. Visibility in runtime inventory is not eligibility for work; eligibility requires explicit project-role assignment, selected adapter capability support, product-line runner flag enablement, governance allow, and tracker-linked task eligibility.
- **Definition of done:** Two fake adapters exercise the same contract, runtime inventory can show visible/unassigned entries without making them dispatchable, unsupported capabilities fail the run attempt instead of stalling or silently switching harnesses, and review packets can cite the selected adapter manifest and eligibility evidence.

### SPEC-014C: First Real Harness Adapter Pilot

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `first-real-harness-adapter`
- **Dependencies:** SPEC-013C, SPEC-014B
- **Enables:** Later adapter specs
- **Scope source:** Phase 12C - First real harness adapter pilot
- **Acceptance criteria source:** Phase 12C Acceptance Criteria
- **Scope summary:** Implement one real harness adapter path behind the registry. Prefer Codex app-server if available because structured threads, tool/file requests, approvals, and usage events map cleanly to Mission Control; otherwise choose the smallest locally provable adapter and document the limitation. HAL verification on 2026-05-07 found Codex CLI `0.124.0` installed with the `codex app-server` subcommand available, but not deployed as a Mission Control service.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** one adapter module, one smoke path, token/runtime summaries where available, artifact publication, redaction, and operator-visible run debug. No second real adapter, no OpenClaw-specific behavior unless this spec explicitly selects OpenClaw as the first real pilot.
- **Autopilot notes:** The adapter executes already-claimed GitHub-linked work only. It does not choose successor templates, create local-only tasks, auto-merge, or bypass Aegis/owner gates.
- **Definition of done:** One real adapter can launch or continue a claimed stage, publish artifacts, record usage/failure summaries, and fail safely on unsupported tool/user-input events.

### SPEC-014D: OpenClaw and External Harness Adapter

- **Status:** Pending
- **Priority:** P2
- **Branch short name:** `openclaw-external-adapter`
- **Dependencies:** SPEC-014B
- **Enables:** Later adapter specs
- **Scope source:** Phase 12D - OpenClaw and external harness adapter
- **Acceptance criteria source:** Phase 12D Acceptance Criteria
- **Scope summary:** Add the fork-only optional adapter boundary for OpenClaw-owned sandboxes and external harness handles. OpenClaw may provide gateway/session messaging, sandbox preparation, process control, plugin harness selection, MCP/skills exposure, memory injection, optional health/cost telemetry, and imported runtime-agent inventory; Mission Control still owns tracker state, project-role assignment, claims, governance, reconciliation, review packets, and handoff artifacts.
- **Tool count / tool names:** N/A - not a tool-surface spec
- **Strict Scope:** adapter module(s), absent-safe config checks, fake/OpenClaw gateway fixtures, external-handle lifecycle tests, runtime-inventory import/refresh labels, and deployment docs. No Mission Control-owned sandbox changes unless required by the shared contract.
- **Autopilot notes:** OpenClaw is the current application harness choice, not a product requirement. If OpenClaw is absent or disabled, Mission Control must still support Mission-Control-owned or other external-harness paths through the same registry. Imported OpenClaw agents start as visible unassigned inventory; role/domain workspace files should stay generic, and product/task context belongs in Mission Control assignment/run packets.
- **Definition of done:** `FEATURE_AGENT_RUNNER_SANDBOXES=false` or missing OpenClaw config leaves no OpenClaw path reachable; enabled adapter imports/refreshes OpenClaw runtime agents as non-dispatchable inventory until explicitly assigned and eligible, runs through the same manifest/lifecycle contract, and records failures without mutating GitHub or task terminal state outside reconciliation.

---

## Fork Decision Gates

These are the points where the owner should explicitly decide whether continued upstream compatibility is still the goal or whether a permanent fork is being accepted.

1. **After Phase 0** — additive schema tail starts (`M53–M61`). If this is not acceptable fork pressure, stop and redesign around upstream-safe adapters or upstream contributions before coding farther.
2. **After Phase 3/4** — workflow/state-machine semantics become upstream-divergent, not just schema-divergent.
3. **After Phase 6** — artifact/disposition persistence deepens the fork if upstream does not want those tables.
4. **Phase 7 OpenClaw health costs** — safe to keep fork-only because it is adapter-based and optional; this does **not** by itself justify a permanent fork.

---

## Phase 0 — Foundation Migrations

### Scope

Foundation migrations/seed steps M53–M61 (nine additive SQL-changing migrations/seed steps) plus two no-SQL safety gates for Sandbox terminology and `ready_for_owner` status vocabulary. Pure schema work. No UI, config, type, or runtime behavior changes.

### Upstream Impact

`upstream-divergent`. Runtime-safe for current installs, but these migrations create schema/state that upstream does not currently have. Phase 0 is the first explicit fork-pressure checkpoint.

### Deliverables

- **Safety gate: Sandbox terminology** — live schema verification on 2026-04-24 confirms `agents.workspace_path` DOES exist (added by an earlier migration that conditionally runs `ALTER TABLE agents ADD COLUMN workspace_path TEXT`). SPEC-001 keeps the SQL column name `workspace_path` as-is, does not add `sandbox_path`, and does not ship UI/config/type/doc terminology changes. Sandbox runtime/copy cleanup belongs to SPEC-002+.
- **Safety gate: `ready_for_owner` vocabulary** — live schema verification on 2026-04-24 confirms `tasks.status` is `TEXT NOT NULL DEFAULT 'inbox'` with NO database CHECK constraint (only an inline comment listing valid values at `src/lib/schema.sql:9`). SPEC-001 makes no DB-level CHECK change and does not extend TypeScript/Zod/GitHub-label/Kanban/runtime vocabulary. Application-level support belongs to SPEC-005.
- **M53** — `agents.scope` column + backfill of Aegis / Security Guardian / <operator-agent> (`LOWER(name) IN ('aegis','security-guardian','<operator-agent>')`) to `global`.
- **M54** — `workflow_templates` gains task-chain and artifact-policy columns: `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, `allow_redacted_artifacts`. A "task-chain template" is a domain alias over `workflow_templates`, not a new SQL table.
- **M55** — `tasks` gains workflow-template binding and lineage: `workflow_template_id`, `workflow_template_slug`, `parent_task_id`, `root_task_id`, `chain_id`, `chain_stage`.
- **M56** — `workspaces.feature_flags JSON` stores per-product-line feature-flag overrides. `NULL` = hardcoded default OFF.
- **M57** — `task_dispositions` table + index.
- **M58** — `task_artifacts` table + indexes. Use `workflow_template_slug` in artifact metadata.
- **M59** — seed `workspaces` with `slug='facility'`, `name='Facility'`, and a resolved default tenant (`ORDER BY active status, id ASC`), using the live `name` column, not `display_name` (idempotent; do not hardcode `tenant_id=1`).
- **M60** — `resource_policies` table + scope indexes, using `workflow_template_slug` nomenclature.
- **M61** — `resource_policy_events` table + audit indexes.

### Files Touched

- `src/lib/migrations.ts` (append migrations/seed steps after verifying live schema shape)
- `src/lib/schema.sql` (read-only reference for schema-shape assertions; do not edit unless fresh-install migration ordering is explicitly tested)

### Acceptance Criteria

- [P0-AC1] All migrations run clean on an existing production-shape database.
- [P0-AC2] Migration is idempotent (re-running applies no changes).
- [P0-AC3] `SELECT * FROM agents WHERE scope='global'` returns the three backfilled globals.
- [P0-AC4] `SELECT slug, name FROM workspaces WHERE slug='facility'` returns exactly one row.
- [P0-AC5] `PRAGMA table_info(workflow_templates)` shows the task-chain columns plus `allow_redacted_artifacts`; the partial unique index on `(workspace_id, slug)` exists for non-null slugs.
- [P0-AC6] `PRAGMA table_info(tasks)` shows workflow-template binding and lineage columns.
- [P0-AC7] `PRAGMA table_info(workspaces)` shows `feature_flags`; SPEC-001 validates only the storage column and `NULL` default. Runtime flag resolution is tested in SPEC-002 when `resolveFlag()` is introduced.
- [P0-AC8] `task_artifacts` table queryable; indexes exist for `(task_id, created_at)` and `(workspace_id, artifact_type)`.
- [P0-AC9] `resource_policies` and `resource_policy_events` are queryable; indexes exist for policy scope and policy events by task/time.
- [P0-AC10] Existing test suite passes unchanged (no new behavior yet).
- [P0-AC11] One rollback file exists for each SQL-changing migration or seed: `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql`; each file contains guarded reverse SQL with explicit preconditions, using idempotent `IF EXISTS` forms where SQLite permits them.
- [P0-AC12] `docs/migrations/rollback-procedure.md` exists and documents reverse order, SQLite column-rebuild rollback guidance, and pre-rollback DB snapshot step.
- [P0-AC13] The `ready_for_owner` safety gate makes no DB-level CHECK change and no application-level status-vocabulary change; ripgrep over the SPEC-001 diff finds zero occurrences of `CHECK (status`, `ready_for_owner`, or `mc:ready-for-owner` outside docs and rollback commentary.
- [P0-AC14] The Sandbox terminology safety gate makes no `ALTER TABLE agents RENAME COLUMN`, no `ALTER TABLE agents ADD COLUMN sandbox_path`, and no UI/config/type/doc-copy rename outside SPEC-001 documentation; ripgrep over the diff confirms zero such statements or runtime copy changes.

### Rollback

The live migration runner (`src/lib/migrations.ts:5-9`) is forward-only — `type Migration = { id: string; up: (db) => void }` has no `down()` function. Rollback for Phase 0 is therefore documented as **manual reverse SQL**, not an automated `down()`:

- Each SQL-changing M5x migration ships a paired reverse-SQL file at `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql` (created as part of SPEC-001 deliverables) that contains explicit guarded reverse SQL. M53-M56 use transactional table rebuilds; M57, M58, M60, and M61 use `DROP TABLE`; M59 uses guarded `DELETE FROM workspaces WHERE slug='facility'` only when no migration-052 workspace-scoped table still references the facility row.
- An operator runbook at `docs/migrations/rollback-procedure.md` describes the reverse order (M61 -> M53), SQLite column-rebuild rollback behavior, and the safety pre-checks (snapshot the DB file first).
- Rollback is operator-initiated by manually applying the documented reverse SQL after taking the DB snapshot. SPEC-001 adds no rollback CLI surface.
- A future spec may extend `Migration` with an optional `down?: (db) => void` and a CLI runner; that work is **out of scope for SPEC-001** and is tracked separately.

### Estimated Work

1–2 engineering days for migrations, +0.5 day for the paired rollback SQL files and operator runbook. Zero UI, zero runtime logic.

---

## Phase 1 — Product-Line Switcher + `activeWorkspace` Scoping

### Scope

Introduce the Product Line switcher in the header, wire independent Facility/Product Line scope state, and apply explicit mode-sensitive/Facility-aggregate behavior per D4b. `activeTenant` remains the tenant/facility context and must not be reused as the Product Line switcher. The header must stop labeling tenant context as "Workspace." Gate everything behind `FEATURE_WORKSPACE_SWITCHER`.

### Upstream Impact

`upstream-safe`. This is additive UI/domain work and a plausible upstream candidate if kept generic.

### UI Mode Transition Contract

SPEC-002 uses these canonical terms: **Facility** is the user-facing aggregate mode, **tenant** is the current authenticated compatibility/data boundary for that Facility, and **Product Line** is the selected workspace operating scope. v1 treats authenticated `tenant_id` as the Facility aggregate boundary and does not introduce multi-facility tenant modeling.

Runtime scope is discriminated even if the existing store keeps `activeWorkspace: Workspace | null` for compatibility:

- `scope.kind = "facility"`: authenticated Facility aggregate mode.
- `scope.kind = "productLine"`: one authorized workspace id.
- `activeWorkspace = null` may only be interpreted as Facility after auth/workspace initialization and must never widen access from client input alone.

Requests and cache keys use `scopeKey = tenantId + ":" + ("facility" | productLineId)`.

### Deliverables

- **Header terminology fix**: `header-bar.tsx` must not render `activeTenant` under a "Workspace" label. Tenant/facility context and Product Line context are separate UI chips/controls.
- **New component**: `src/components/layout/workspace-switcher.tsx`.
  - Dropdown in `header-bar.tsx`.
  - Options: exactly one synthetic "Facility" aggregate entry plus authorized non-Facility Product Line workspaces from `GET /api/workspaces`.
  - The real `workspaces.slug='facility'` row is never selectable as the aggregate option and must not create a duplicate Facility option.
  - Desktop placement: left header context cluster near tenant/facility context.
  - Mobile placement: compact trigger remains visible at 320, 375, and 390 px in the fixed `h-14` header; long names truncate without pushing out search, notifications, theme, or account controls.
  - Accessibility: stable accessible name, `aria-controls`, `aria-haspopup`, `aria-expanded`, listbox/options, `aria-selected`, roving focus or `aria-activedescendant`, Escape/outside-click close, Arrow/Home/End navigation, Enter/Space selection, selected state, loading/empty/error rows, and trigger focus return.
- **Zustand store and transition API**: `activeWorkspace: Workspace | null` plus `setActiveProductLine(productLine | null, options)`.
  - **Live state on 2026-04-24:** `src/store/index.ts:4` imports only `subscribeWithSelector`; there is **no existing `persist` middleware** and **no `BroadcastChannel` cross-tab listener** in this codebase. SPEC-002 must therefore implement cross-tab sync from scratch, not piggyback on a non-existent pattern.
  - **Implementation contract:** persist only the Product Line scope slice with `zustand/middleware` (storage = `localStorage`, key = `mc:active-workspace:v1`). Validate persisted scope after `/api/workspaces` before rendering mode-sensitive cached data.
  - **Cross-tab contract:** use `BroadcastChannel('mc:active-workspace')` messages shaped as `{ tenantId, userId/sessionId, productLineId|null, version, originTabId }`; ignore mismatched tenant/session, self echoes, and stale versions. Fall back gracefully when `BroadcastChannel` is unavailable.
  - **Invalidation contract:** scope transitions clear incompatible `activeProject`, selected task/agent/project/conversation state, scoped modals, scoped filters, and scoped drafts unless stored per `scopeKey`. In-flight requests and mutation completions carry the initiating `scopeKey` and are ignored if stale.
- **TypeScript domain type**: `type ProductLine = Workspace` alias exported from `@/types/product-line`.
- **REST scoping contract**: Product Line requests send `workspace_id=<id>`; Facility requests send `workspace_scope=facility`; requests sending both return `400`; unauthorized workspace ids return `403`; omitted scope is allowed only for feature-flag-off legacy behavior.
- **URL scoping contract**: mode-sensitive detail URLs carry `workspace_scope=facility` or `workspace_id=<id>`. URL scope is applied only after auth/workspace validation; invalid scope strips scoped entity params and resets to Facility; unscoped entity params are cleared if ownership cannot be proven.
- **SSE scoping contract**: `/api/events` supports authorized Product Line filtering and authorized Facility aggregation. Workspace-scoped events must include `workspace_id`; selected Product Line clients drop missing/mismatched workspace events; Facility clients receive authorized tenant/facility events; global connection/system events are explicitly whitelisted; EventSource reconnects when scope changes.
- **Mode-sensitive panels**:
  - `task-board-panel.tsx` — uses `scopeKey`; clears stale selected task and incompatible project filters on switch.
  - `agent-squad-panel-phase3.tsx` — group by Facility -> Product Line -> Department -> Agent and include global agents in selected Product Line views.
  - `project-manager-modal.tsx` — lists projects for selected Product Line or Facility aggregate; incompatible `activeProject` is cleared unless revalidated.
  - quality-review surfaces — scoped to the initiating task/workspace and protected against stale mutation completions.
  - DB-backed chat message/conversation surfaces — scoped by Product Line or Facility aggregate.
- **Facility/global surfaces**:
  - `live-feed.tsx`, `notifications-panel.tsx`, `dashboard.tsx`, `system-monitor-panel.tsx`, and `audit-trail-panel.tsx` render Facility aggregate data, not stale authenticated-workspace-only data.
  - `skills-panel.tsx` remains Facility/global. SPEC-002 adds no product-line skill ownership, assignment, permissioning, CRUD, or visibility filters.
  - Local/gateway sessions and transcripts remain Facility/global. SPEC-002 adds no session-to-workspace transcript mapping.
- **API route matrix**: tasks root/detail/comment/broadcast/branch routes, project root/detail/agent routes, agent root/detail/subroutes, quality-review routes, DB chat messages/conversations, Facility aggregate awareness routes, and `/api/events` must either accept explicit scope or authorize by resource id joined back to tenant/workspace.

### Files Touched (estimated)

- `src/components/layout/header-bar.tsx` (~30 lines added; remove `activeTenant` "Workspace" label per P1-AC8)
- `src/components/layout/workspace-switcher.tsx` (new, ~200 lines)
- `src/store/index.ts` (add `activeWorkspace` slice + `persist` middleware + `BroadcastChannel` listener; the live store path is `src/store/index.ts`, not `src/store/mission-control-store.ts`)
- `src/components/panels/task-board-panel.tsx` (~20 lines modified)
- `src/components/panels/agent-squad-panel-phase3.tsx` (~80 lines — hierarchical grouping logic)
- `src/components/panels/project-manager-modal.tsx`, chat message/conversation surfaces, and quality-review surfaces (mode-sensitive wiring)
- `src/components/panels/skills-panel.tsx` (Facility/global boundary only; no product-line skill filtering)
- `src/app/api/tasks/**`, `src/app/api/agents/**`, `src/app/api/projects/**`, `src/app/api/quality-review/**`, DB chat routes, Facility aggregate awareness routes, and `src/app/api/events/route.ts` (explicit scope or resource-id authorization)
- `src/types/product-line.ts` (new)
- `src/lib/feature-flags.ts` (new — see Feature Flag Resolution Policy section)

### Acceptance Criteria

- [P1-AC1] With flag OFF, the existing Vitest + Playwright test suite (`pnpm test:all`) passes unchanged from the pre-Phase-1 baseline commit. "Zero regression" is defined as: 0 new test failures, 0 changed test counts, and 0 visible diffs in the existing Playwright snapshot suite (`tests/e2e/snapshots/*`).
- [P1-AC2] With flag ON and Facility scope selected, the same `pnpm test:all` suite passes unchanged for existing tests while new tests may assert explicit Facility aggregate semantics.
- [P1-AC3] The switcher renders exactly one synthetic "Facility" option. Selecting it stores Facility scope (`activeWorkspace = null` compatibility state) and never selects the real `workspaces.slug='facility'` row.
- [P1-AC4] With flag ON and a selected Product Line workspace, mode-sensitive panels show only that Product Line's authorized data plus allowed global agents; Facility/global surfaces remain Facility aggregate.
- [P1-AC5] Agent squad panel renders hierarchical tree: Facility (globals) -> Mission Control -> {QA, Dev, ...} -> {agents}; duplicate global/local names do not merge stats and mutations use ids where ambiguity exists.
- [P1-AC6] Cross-tab state sync: a Playwright test that opens two browser contexts, sets Product Line scope in context A, and observes the change reflected in context B within 1s passes. Messages include tenant/session guards and stale-version protection. When `BroadcastChannel` is unavailable, the persisted value still propagates after a context-B reload.
- [P1-AC7] `activeTenant` remains independent from Product Line scope; switching Product Lines does not mutate tenant/facility context.
- [P1-AC8] Header no longer labels tenant context as "Workspace." Specifically, ripgrep over `src/components/layout/header-bar.tsx` finds zero string matches for `'workspace'` used as a tenant-context label; tenant context is labeled "Tenant", "Facility", or shown without a label.
- [P1-AC9] Mode-sensitive REST routes implement the explicit request contract: Product Line uses `workspace_id=<id>`, Facility uses `workspace_scope=facility`, both params return `400`, unauthorized workspace ids return `403`, and omitted scope is legacy-only with the feature flag OFF.
- [P1-AC10] `/api/events` returns authorized Product Line-filtered events and authorized Facility aggregate events. Workspace-scoped events include `workspace_id`; selected clients drop missing/mismatched workspace events; global events without workspace scope are explicitly whitelisted.
- [P1-AC11] `src/store/index.ts` exports Product Line scope persistence (key `mc:active-workspace:v1`, storage `localStorage`) and BroadcastChannel sync only for the new scope slice. Vitest unit-tests serialization, hydration validation, guarded broadcast handling, and fallback behavior.
- [P1-AC12] Product terminology is consistent across PRD, roadmap, workflow, generated spec, and UI: Facility is the user-facing aggregate, tenant is the auth/data compatibility boundary, Product Line is workspace scope, and SPEC-002 does not introduce multi-facility tenant modeling.
- [P1-AC13] Header switcher is responsive and accessible: visible at 320/375/390 px without displacing existing controls, truncates long names, provides loading/empty/error states, uses listbox semantics, and returns focus to the trigger after Escape, outside click, and selection.
- [P1-AC14] All mode-sensitive fetch/cache keys include `scopeKey = tenantId + ":" + ("facility" | productLineId)`; scope transitions ignore stale in-flight responses and scoped mutation completions.
- [P1-AC15] URL state is scope-owned: valid scoped URLs resolve after auth/workspace validation; invalid scopes strip scoped entity params and reset to Facility; entity params without provable scope ownership are cleared.
- [P1-AC16] Deferred boundaries are enforced: SPEC-002 does not implement product-line skill ownership, skill filtering, session-to-workspace transcript mapping, or multi-facility tenant modeling; workflow/checklist/analyze gates fail if artifacts claim otherwise.

### Rollback

Flip `FEATURE_WORKSPACE_SWITCHER` to OFF. Switcher hidden. Zustand field ignored.

### Estimated Work

5–7 engineering days.

---

## Phase 1A — Spec Archive and Evidence Retention

### Scope

Add a process/tooling layer that prevents SpecKit artifacts and Playwright screenshots from growing without policy. SPEC-002A evaluates `stn1slv/spec-kit-archive` as the default post-merge archive command, defines which artifacts are durable versus temporary, and adds local/CI guards for committed screenshot evidence before SPEC-003 starts.

### Upstream Impact

`upstream-safe`. This is documentation, workflow, and CI hygiene that can be useful to upstream users without requiring Mission Control runtime behavior.

### Deliverables

- **Archive extension decision**: validate `spec-kit-archive` against the current SpecKit tooling and document whether Mission Control installs, vendors, forks, or rejects it. Any adoption must pin a tag or commit and preserve MIT license metadata.
- **Archive command path**: provide a local and CI-safe way to dry-run archival against `specs/002-product-line-switcher`, producing an archival report with source paths, PR URL, CI run URL, merge commit, screenshot evidence, and conflicts.
- **Artifact classes**: define source-of-truth spec artifacts, durable memory summaries, ephemeral CI artifacts, and permanent curated evidence exceptions.
- **Screenshot/evidence manifest**: define how UI journey screenshots, hashes, CI artifact names, and PR links are recorded for future audits.
- **CI/local guard**: fail on unbounded committed screenshots under `specs/**/screenshots` unless they are manifest-backed and below the approved count/size policy.
- **Constitution/workflow updates**: require future specs to follow the archive/evidence policy and keep the existing Real UI Journey Quality Gate intact.

### Acceptance Criteria

- [P1A-AC1] `specs/002a-spec-archive-evidence/spec.md`, research, requirements checklist, and workflow are present and contain no unresolved clarification placeholders.
- [P1A-AC2] The implementation records an evidence-backed adoption decision for `spec-kit-archive`, including repository URL, license, pinned version/commit, and local modifications if any.
- [P1A-AC3] An archive dry-run against `specs/002-product-line-switcher` completes without deleting or moving source spec files and reports durable memory changes plus screenshot evidence.
- [P1A-AC4] CI and a local command fail on an intentionally oversized or unmanifested committed screenshot fixture and name the offending path.
- [P1A-AC5] CI and a local command pass for approved SPEC-002 evidence or for an artifact-bundle-only path.
- [P1A-AC6] The constitution and workflow docs state that committed screenshots are exceptions, ephemeral CI artifacts require PR-accessible links during review, and durable memory must retain enough provenance for later audit.
- [P1A-AC7] Cleanup of spec folders or screenshots is never performed silently by post-merge CI; any cleanup is proposed as an explicit reviewed change.

### Rollback

Disable the archive guard and extension hook. Source spec folders and existing evidence remain in place because SPEC-002A must not delete or move them automatically.

### Estimated Work

1–2 engineering days.

---

## Phase 2 — Aegis Refactor (Facility Singleton)

### Scope

Replace the `aegisAgentByWorkspace = new Map<number, ReviewAgentRecord>()` declaration at `src/lib/task-dispatch.ts:394` (used at line 422 for `.get()` and line 435 for `.set()`) with a global Aegis lookup via the new `getAegis(db, workspace_id?)` helper. The function `runAegisReviews` starts at `src/lib/task-dispatch.ts:376`; `resolveGatewayAgentIdForReviewAgent` is at `src/lib/task-dispatch.ts:80`. Preserve a shim for legacy workspace-scoped Aegis rows. Touch the ~60+ references cataloged during Q1 verification.

### Upstream Impact

`upstream-divergent` because this design depends on `agents.scope` from Phase 0.

### Known Reference Surface (from Q1 verification)

- `src/app/api/tasks/route.ts` — `hasAegisApproval` DB gate
- `src/app/api/tasks/[id]/route.ts`
- `src/lib/validation.ts`
- `src/lib/scheduler.ts` — `aegis_review` cron task
- `src/lib/task-dispatch.ts` — `runAegisReviews`, `resolveGatewayAgentIdForReviewAgent`, `aegisAgentByWorkspace`
- `src/components/panels/task-board-panel.tsx` — Aegis review UI hooks
- `src/components/chat/*` — Aegis chat surfaces

### Deliverables

- **Helper**: `src/lib/aegis.ts` — `getAegis(db, workspace_id?)` returns the global Aegis (scope=global) OR a legacy workspace-scoped Aegis as fallback. Resolution order documented below.
- **Refactor**: `src/lib/task-dispatch.ts:80` (`resolveGatewayAgentIdForReviewAgent`) and `src/lib/task-dispatch.ts:376` (`runAegisReviews`, which currently declares the workspace-keyed map at line 394) use `getAegis` instead of the local map.
- **Cleanup**: remove the `aegisAgentByWorkspace` map (line 394) once all callers migrated. Leave the legacy-row fallback inside `getAegis`.
- **Feature flag**: `FEATURE_GLOBAL_AEGIS` — when OFF, `getAegis` returns workspace-scoped Aegis first (preserves prior behavior); when ON, global first.
- **Resolution precedence (ON):** (1) the unique `agents` row with `scope='global'` AND `LOWER(name)='aegis'` wins; (2) if no global row exists, fall back to a workspace-scoped row matching `workspace_id = :workspace AND LOWER(name)='aegis'`; (3) if both exist, the global row wins and an `activities` row is written documenting that the workspace-scoped row was shadowed (for audit visibility during the migration window).
- **Resolution precedence (OFF):** workspace-scoped row first, then global, mirroring the legacy code path.

### Files Touched

- `src/lib/aegis.ts` (new, ~100 lines)
- `src/lib/task-dispatch.ts` (substantial refactor, ~150 lines modified)
- `src/lib/scheduler.ts` (minor — invoke `runAegisReviews` unchanged)
- `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts` (swap direct Aegis lookups to `getAegis`)
- `src/lib/validation.ts` (minor)
- `src/components/panels/task-board-panel.tsx` + chat panels (minor UI references)

### Acceptance Criteria

- [P2-AC1] With flag OFF, Aegis resolution matches pre-refactor behavior for every workspace (no regression in existing flows).
- [P2-AC2] With flag ON, Aegis resolves to the single `scope='global'` record even when a workspace has no local Aegis.
- [P2-AC3] If a workspace has a legacy local Aegis record, `getAegis(ws)` returns the local one when compatibility mode requires it. Legacy records can be manually cleaned up later.
- [P2-AC4] `runAegisReviews` scheduler loop runs identically. No new failure modes.
- [P2-AC5] Test suite covers: global-only, workspace-only, workspace-with-legacy (all three scenarios).
- [P2-AC6] Aegis completion gates use the live `quality_reviews.reviewer='aegis'` signal unless a separate migration intentionally adds `quality_reviews.agent_id`; no Phase 2 smoke/test should expect `quality_reviews.agent_id` by default.

### Rollback

Flip `FEATURE_GLOBAL_AEGIS` OFF. `getAegis` reverts to workspace-first resolution.

### Estimated Work

4–5 engineering days. Most of the risk is in the reference sweep, not the logic.

---

## Phase 3 — Task Pipeline Engine + Declarative Routing

### Scope

Extend the live `workflow_templates` table with routing machinery (per D5). A "task-chain template" is a domain alias over `workflow_templates`, not a new SQL table. Implement schema validation, routing-rule evaluation, and successor-task creation in the scheduler. Ship behind `FEATURE_TASK_PIPELINES`.

### Upstream Impact

`upstream-divergent`. This phase depends on new `workflow_templates` and `tasks` binding/lineage schema and introduces task-chain semantics upstream Mission Control does not currently expose. It also adds a narrow partial unique index on non-null `tasks.parent_task_id` so the fork enforces one successor per parent at the database layer.

### Deliverables

- **Workflow-template identity**: `workflow_templates.slug` supports stable per-workspace declarative routing. `workflow_template_id` is the canonical task binding; `workflow_template_slug` is a denormalized snapshot for readability/routing history.
- **Task lineage**: successor tasks set `parent_task_id`, `root_task_id`, `chain_id`, and `chain_stage` so operators can trace multi-stage workflows. On the first successor hop from a parent with no existing lineage, initialize the parent as the chain root before inserting the successor: parent `root_task_id = parent.id`, parent `chain_id` is generated, parent `chain_stage = 0`, and the successor uses the same `root_task_id`/`chain_id` with `chain_stage = 1`.
- **DB successor uniqueness**: SPEC-004 adds an additive M62 migration for `CREATE UNIQUE INDEX idx_tasks_one_successor_per_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL`. Before creating the index, the migration preflights `SELECT parent_task_id, COUNT(*) FROM tasks WHERE parent_task_id IS NOT NULL GROUP BY parent_task_id HAVING COUNT(*) > 1` and must fail closed if any duplicate successor rows exist. The paired rollback file drops only `idx_tasks_one_successor_per_parent`.
- **Shared `createTask()` helper** (prerequisite for FR-D4a / NFR-13 successor side-effect parity): SPEC-004 first extracts a single task-creation function in `src/lib/task-create.ts` that performs INSERT, ticket-counter allocation, activity logging, creator subscription, mention/assignee notifications, and outbound sync (`pushTaskToGitHub` if the project has `github_sync_enabled` and `github_repo`, plus `pushToGnap` if configured). The four current callsites that issue `INSERT INTO tasks` directly (`src/app/api/tasks/route.ts:218`, `src/app/api/github/route.ts:159`, `src/lib/github-sync-engine.ts:189`, `src/lib/recurring-tasks.ts:105`) are migrated to call `createTask`. Routing-engine successor creation calls the same `createTask` — no parallel code path. The helper contract preserves source-specific semantics for API creation, GitHub issue import, GitHub sync import, recurring tasks, and pipeline successors so sync loops/noisy notifications are not introduced. CI greps production runtime source for direct `INSERT INTO tasks` outside `src/lib/task-create.ts` and fails on match; test fixture inserts are deliberately migrated or excluded from the production guardrail.
- **Atomic chain advancement**: `advanceTaskChain` runs parent lineage initialization, validation failure state/activity writes, advancement-stall activity writes, duplicate-successor guard checks, and successor `createTask()` insertion in one database transaction. If the transaction rolls back, no partial lineage, activity, failure state, or successor row remains. If the duplicate-successor guard finds an existing successor for the same `parent_task_id`, the retry returns success as an idempotent no-op and creates no duplicate task. The M62 partial unique index is the final guard against concurrent races or non-helper bypasses.
- **Stable chain activity reasons**: every SPEC-004 validation failure, advancement stall, or `200 OK` retry recovery writes an `activities` row with human-readable `description` plus machine-readable JSON in the existing `activities.data` field. `data.reason_code` is required and limited to: `task_pipeline_output_missing`, `task_pipeline_output_invalid`, `task_pipeline_routing_expression_rejected`, `task_pipeline_routing_budget_exceeded`, `task_pipeline_target_missing`, `task_pipeline_target_disabled`, `task_pipeline_target_duplicate`, `task_pipeline_target_cross_workspace`, `task_pipeline_successor_assignee_missing`, and `task_pipeline_retry_chain_advancement`. Retry recovery activities use `task_pipeline_retry_chain_advancement` and preserve the selected original failure/stall code in `previous_reason_code`; retry `409 Conflict` rejections write no activity. Payloads include non-secret chain context (`parent_task_id`, `workflow_template_id`, `workflow_template_slug`, `target_template_slug`, `chain_id`, `chain_stage`) plus required retry provenance hashes `template_output_schema_sha256`, `template_routing_rules_sha256`, and `template_next_slug_sha256` even when a template field is empty/null.
- **Explicit chain retry recovery**: chain recovery is an operator-only retry action, not a normal status update. Operators call `POST /api/tasks/[id]` with `{ "action": "retry_chain_advancement" }`. Ordinary `PUT /api/tasks/[id]` updates, including changing a failed task to `done`, MUST NOT implicitly rerun `advanceTaskChain`. For `failed` parents, retry is allowed only for prior `task_pipeline_output_missing` or `task_pipeline_output_invalid`; it validates current `tasks.resolution`, leaves the parent `failed` if validation still fails, and only restores terminal success once validation passes. For terminal-success parents with prior advancement-stall reasons (`task_pipeline_routing_expression_rejected`, `task_pipeline_routing_budget_exceeded`, `task_pipeline_target_missing`, `task_pipeline_target_disabled`, `task_pipeline_target_duplicate`, `task_pipeline_target_cross_workspace`, `task_pipeline_successor_assignee_missing`), retry preserves terminal success throughout, re-runs routing/assignee resolution, and never converts the parent to `failed`. Recovery always anchors to the latest eligible SPEC-004 failure/stall activity for the parent task; the API does not accept an `activity_id` override and MUST NOT replay older failure/stall history. All `409 Conflict` retry rejections are side-effect-free: they write no activity, increment no `retry_attempt`, leave state/successors unchanged, and return `{ "retry_rejection_reason": "<enum>" }` in the response body. Allowed rejection enum values are `retry_not_eligible`, `retry_template_provenance_missing`, and `retry_template_drift_unconfirmed`. SPEC-004 does not enforce a hard retry-attempt cap for still-unresolved eligible failures/stalls; repeated eligible retries remain allowed, but every attempt is audited and tests prove repeated invalid/stalled retries do not create successors or corrupt parent state. The selected latest failure/stall activity stores template hashes; if any required selected-activity hash is missing, retry fails closed with `409 Conflict` and `retry_rejection_reason='retry_template_provenance_missing'`, with no `confirm_template_drift` bypass until provenance is manually remediated. Retry uses the current `workflow_templates` row and recomputes those hashes; if any hash differs, the action returns `409 Conflict` with `retry_rejection_reason='retry_template_drift_unconfirmed'` until the operator retries with `{ "action": "retry_chain_advancement", "confirm_template_drift": true }`. The retry action records recovery provenance in `activities.data` with `reason_code='task_pipeline_retry_chain_advancement'`, `recovery_class` (`output_validation_failure` or `advancement_stall`), `recovery_action='retry_chain_advancement'`, a monotonic per-parent `retry_attempt` shared across all recovery classes and reason codes, `previous_reason_code`, relevant task/template/chain ids, original/current template hashes, `template_drift_detected`, `template_drift_confirmed`, and a SHA-256 hash of corrected resolution when applicable; it does not duplicate the full corrected output into activity data. After validation or stall recovery clears, normal route, stall, termination, duplicate-successor, and successor-creation semantics apply using the current template. If a terminal-success advancement-stall retry clears and current routing resolves no matching rule and no `next_template_slug`, the retry succeeds as normal chain termination: no successor is created, no new stall activity is written, `recovery_outcome='chain_terminated'` is recorded on the recovery activity, and the action does not require an extra confirmation flag or return `409 Conflict` beyond the existing provenance/drift checks. Post-recovery retries follow Option C: existing-successor retries return `200 OK` with `recovery_outcome='successor_already_exists'`, `successor_task_id`, `chain_terminated=false`, and `idempotent_successor=true`; retry calls after `recovery_outcome='chain_terminated'` return side-effect-free `409 Conflict` with `retry_rejection_reason='retry_not_eligible'` until a new retry-eligible SPEC-004 failure/stall activity is recorded.
- **Retry response contract**: every `retry_chain_advancement` `200 OK` response returns the normal task detail response shape plus a bounded `chain_retry` summary. `chain_retry` includes `recovery_class`, monotonic `retry_attempt`, `recovery_outcome`, `successor_task_id` or `null`, `chain_terminated`, and `idempotent_successor`. Allowed `recovery_outcome` values are `output_still_invalid`, `stall_persisted`, `successor_created`, `successor_already_exists`, and `chain_terminated`. `successor_already_exists` responses include the existing successor id and `idempotent_successor=true`; `chain_terminated` responses set `successor_task_id=null` and `chain_terminated=true`. The response omits full corrected output, full parsed agent output, and full routing-evaluation traces.
- **Schema validation library**: `src/lib/output-schema-validator.ts` — server-side JSON Schema validator using `ajv` as an explicit direct pinned dependency. Do not import transitive `ajv`. Configure a constrained Mission Control schema profile with the following **numeric bounds**:
  - `maxOutputBytes = 256 * 1024` (256 KiB raw output before parse)
  - `maxSchemaBytes = 64 * 1024` (64 KiB compiled schema source)
  - `maxNestingDepth = 16` for both schema and parsed output
  - `maxKeysPerObject = 256`
  - `maxArrayLength = 1024`
  - `maxStringLength = 32 * 1024`
  - `maxPatternLength = 256` characters
  - `maxValidationMs = 50` (per-call wall-clock; AJV configured for strict behavior, no data mutation/default insertion, no type coercion, no exhaustive error collection, `validateFormats=false`, and `$data=false`)
  - Forbidden: remote `$ref` (only `#/...` local refs), `$dynamicRef`, `$dynamicAnchor`, custom keywords, custom formats, async schemas, the `format` validator (allow only `format` annotations without enforcement), direct SPEC-004 dependency/import/registration of `ajv-formats`, and any `pattern` or `patternProperties` value not whitelisted via `safe-regex` **and** the SPEC-004 conservative pattern subset. A `safe-regex` pass is necessary but not sufficient: accepted patterns are limited to literals, anchors, character classes, and bounded quantifiers; nested quantifiers, backreferences, lookaround, unbounded wildcards, and ambiguous alternation are rejected. Existing transitive `ajv-formats` lockfile entries are allowed only if unused by `src/lib/output-schema-validator.ts`.
  - Compiled validators are cached per `(template_id, schema_sha256)`; cache size capped at 256 entries with LRU eviction.
- **Routing expression evaluator**: `src/lib/routing-rule-evaluator.ts` — safe-subset expression language:
  - Operators: `==`, `!=`, `in`, `not in`, `&&`, `||`, `!`.
  - Left-side: JSONPath-Plus path into output (e.g., `$.disposition`, `$.details.severity`). Implementation MUST use `jsonpath-plus` with JavaScript execution disabled (`eval: false`, or `preventEval: true` on older supported APIs) — explicitly NOT raw `eval`, `Function`, `vm`, or `vm2`. JSONPath filters/script expressions are rejected before calling `JSONPath()`.
  - Right-side: literal string, number, boolean, or array of literals.
  - Forbidden: function calls, dynamic property access, prototype chain access (`__proto__`, `constructor`), arithmetic (`+`, `-`, `*`, `/`), bitwise ops, regex on the right-hand side, and any operator not on the explicit allowlist.
  - The evaluator is implemented as a hand-written recursive-descent parser over the allowlisted grammar; it does NOT delegate parsing to a general-purpose expression library. Tests include adversarial inputs (prototype pollution attempts, deeply nested expressions, malformed JSONPath, oversized literals).
  - Per-call evaluation budget: `maxRuleEvalMs = 10`; rule sets exceeding the budget short-circuit, stall automated chain advancement, leave the parent in its terminal success state, create an operator-visible `activities` row with `data.reason_code='task_pipeline_routing_budget_exceeded'`, and create no successor. Operator triage corrects the routing rule/configuration and retries through `retry_chain_advancement`.
  - Pre-validation caps before synchronous parse/traversal work: `maxRoutingRules=64`, `maxRoutingExpressionBytes=8192`, `maxRoutingTokens=256`, `maxBooleanNestingDepth=16`, `maxJsonPathBytes=512`, `maxJsonPathResults=128`, and `maxLiteralBytes=32768`. The evaluator checks budget before each rule, token parse group, and JSONPath traversal.
- **Scheduler extension**: new shared `advanceTaskChain` function invoked at every live terminal-success transition from non-`done` to `done` for pipeline-bound tasks (`runAegisReviews`, `POST /api/quality-review`, bulk `PUT /api/tasks`, and detail `PUT /api/tasks/[id]`) with DB-backed idempotent duplicate-successor prevention: an existing successor for the same `parent_task_id` returns success without creating another task, and the partial unique index prevents races or bypasses from creating a second successor. Manual/API completions remain valid operator workflows, but no live pipeline-bound `done` path may bypass `advanceTaskChain`.
  1. Read structured output from `tasks.resolution` in Phase 3 as the temporary bridge before Phase 6 artifact publishing exists.
  2. Validate output against `workflow_template.output_schema` — missing `tasks.resolution` or invalid structured output fails the parent task, logs activity with `data.reason_code='task_pipeline_output_missing'` or `data.reason_code='task_pipeline_output_invalid'`, and creates no successor.
  3. Evaluate `workflow_template.routing_rules` in order — first match wins. Unsafe/rejected routing expressions use `data.reason_code='task_pipeline_routing_expression_rejected'`. Missing, disabled, duplicate, or cross-workspace target slugs stall automated chain advancement: leave the parent in its terminal success state, create an operator-visible `activities` row with `data.reason_code='task_pipeline_target_missing'`, `data.reason_code='task_pipeline_target_disabled'`, `data.reason_code='task_pipeline_target_duplicate'`, or `data.reason_code='task_pipeline_target_cross_workspace'`, and create no successor. Operator triage corrects the target/template configuration and retries through `retry_chain_advancement`.
  4. If no rule matches, use `workflow_template.next_template_slug`.
  5. If neither resolves, chain terminates normally.
  6. Inside the same transaction, build the successor input: inherit `workspace_id`, `project_id`; if the parent has no lineage, first update it to `root_task_id = parent.id`, a generated `chain_id`, and `chain_stage = 0`; set successor binding/lineage fields (`workflow_template_id`, `workflow_template_slug`, `parent_task_id`, same `root_task_id`, same `chain_id`, `chain_stage = parent.chain_stage + 1`); resolve `assigned_to` from the live join `SELECT a.name FROM project_agent_assignments paa JOIN agents a ON a.name = paa.agent_name WHERE paa.project_id = :project_id AND paa.role = :workflow_template.agent_role LIMIT 1` (note: `project_agent_assignments` is keyed by `agent_name`, not `agent_id`, per the live schema at `src/lib/migrations.ts:825-836`); parametrize description with output variables. If no matching assignee exists for the resolved successor role, chain advancement stalls with operator-visible activity evidence using `data.reason_code='task_pipeline_successor_assignee_missing'`, the parent remains in terminal success, and no successor is created.
  7. Pass that input to the shared `createTask()` helper (defined above). All outbound sync (GitHub, GNAP), activity logging, ticket-counter allocation, subscriptions, and notifications happen inside `createTask` — successor creation does NOT inline any of that logic. NFR-13 (successor side-effect parity) is enforced structurally by sharing the function, not by parallel implementation.
- **Template UI**: extend the live workflow-template editor in `src/components/panels/orchestration-bar.tsx`, `src/app/api/workflows/route.ts`, and create/update workflow schemas in `src/lib/validation.ts` with `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, and `allow_redacted_artifacts` fields while preserving existing operator-only write authorization. `POST/PUT /api/workflows` must validate and persist every chain field, reject non-empty `routing_rules` unless `output_schema` is present, and allow `next_template_slug` without `output_schema` for static chaining. SPEC-004 must repair the current workflow-template delete mismatch by making `DELETE /api/workflows?id=...` accept the existing live editor query-parameter contract; JSON `{ id }` body support may remain for backward compatibility, but P3-AC12 must verify the query-parameter delete path.
- **Repository docs update**: update `docs/orchestration.md` in the implementation repo when declarative auto-chaining ships. The doc should keep manual follow-up tasks as a supported pattern, add a feature-flagged declarative task-chain section, and refresh lifecycle/status terminology.

### Files Touched

- `src/lib/task-create.ts` (new, ~250 lines) — extracted shared `createTask()` helper consumed by all callsites and the routing engine
- `src/app/api/tasks/route.ts:218`, `src/app/api/github/route.ts:159`, `src/lib/github-sync-engine.ts:189`, `src/lib/recurring-tasks.ts:105` — migrate to `createTask()`
- `src/lib/output-schema-validator.ts` (new, ~150 lines including bounds enforcement)
- `src/lib/routing-rule-evaluator.ts` (new, ~250 lines including hand-written parser + adversarial tests)
- `src/lib/task-dispatch.ts` — add `advanceTaskChain` hook at terminal-success transition points
- `src/lib/migrations.ts` — add M62 partial unique index on non-null `tasks.parent_task_id` after zero-duplicate preflight
- `docs/migrations/rollback-M62.sql` — documented rollback that drops `idx_tasks_one_successor_per_parent`
- `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts` — route bulk and detail pipeline-bound status-to-`done` transitions through `advanceTaskChain` consistently, and add the operator-only `POST /api/tasks/[id]` `{ "action": "retry_chain_advancement" }` recovery action
- `src/app/api/quality-review/route.ts` — call `advanceTaskChain` after operator-approved terminal success
- `src/components/panels/orchestration-bar.tsx` — UI for new workflow-template fields
- `src/app/api/workflows/route.ts`, `src/lib/validation.ts` — create/update persistence and validation for workflow-template chain fields plus `DELETE /api/workflows?id=...` contract repair/compatibility
- `src/types/workflow-template.ts` — add new field types
- `.github/workflows/quality-gate.yml` — add CI steps for `pnpm audit:high` and repository guardrails: direct runtime dependency pins, production direct `INSERT INTO tasks`, unsafe evaluator primitives, and downstream-scope drift
- `package.json`, `pnpm-lock.yaml` — add pinned direct runtime `dependencies` for `ajv` and `jsonpath-plus` and keep `safe-regex` as a pinned direct runtime dependency; make the package/lockfile updates needed to clear the current high-severity audit baseline; CI verifies all three SPEC-004 dependencies are direct and lockfile-pinned, runs `safe-regex` plus the conservative pattern-subset check over referenced schemas, and records passing `pnpm audit --audit-level high` evidence
- `docs/orchestration.md` — update repository documentation when Phase 3 ships

### Acceptance Criteria

- [P3-AC1] With flag OFF, task completion behaves exactly as today (no chain advance regardless of workflow-template fields).
- [P3-AC2] With flag ON, tasks without `workflow_template_id` OR with all new workflow-template fields NULL behave exactly as flag-OFF (null-default safety).
- [P3-AC3] With a bound workflow template that has `output_schema` set and valid agent output in `tasks.resolution`, successor task is created per `routing_rules` / `next_template_slug`. `POST/PUT /api/workflows` rejects non-empty `routing_rules` without `output_schema`; static `next_template_slug` without `output_schema` remains valid and creates a successor without dynamic routing.
- [P3-AC4] With a bound workflow template that has `output_schema` set and missing `tasks.resolution` or INVALID agent output, the parent task transitions to `failed`, an activity records the validation failure with exact `data.reason_code` (`task_pipeline_output_missing` or `task_pipeline_output_invalid`) plus template schema/routing hashes, and no successor is created. Recovery requires the operator-only retry action; ordinary `PUT /api/tasks/[id]` re-marking to `done` does not rerun chain advancement. The retry action validates corrected `tasks.resolution`, detects template hash drift, requires `confirm_template_drift=true` before retrying with changed current rules, fails closed with side-effect-free `409 Conflict` and `retry_rejection_reason='retry_template_provenance_missing'` if selected failure/stall hash provenance is missing, leaves the parent `failed` on repeated validation failure, and restores terminal success before normal chain routing only after validation passes.
- [P3-AC4a] `retry_chain_advancement` also supports terminal-success advancement stalls for routing expression rejection, routing budget overrun, missing/disabled/duplicate/cross-workspace target template, and missing successor assignee. In those cases the parent remains terminal-success throughout; retry re-runs routing/assignee resolution using the current template after the same drift check, creates no successor if the stall remains, records `recovery_class='advancement_stall'`, and never marks the parent `failed`. If the retry resolves to no matching routing rule and no `next_template_slug`, it terminates the chain normally with no successor, no new stall activity, recovery activity `recovery_outcome='chain_terminated'`, and no extra confirmation flag or `409 Conflict` beyond provenance/drift checks. Retry selects only the latest eligible SPEC-004 failure/stall activity for the parent; no `activity_id` override is accepted and older activities are not replayed. Ineligible latest state/reason pairs and post-`chain_terminated` retries return `409 Conflict` with `retry_rejection_reason='retry_not_eligible'`, no activity write, no `retry_attempt` increment, and no state/successor side effects. There is no built-in retry-attempt cap for still-unresolved stalls; repeated attempts are allowed with monotonic per-parent `retry_attempt` audit evidence shared across all retry classes and no successor/state corruption.
- [P3-AC4b] Every eligible `retry_chain_advancement` `200 OK` response returns the normal task detail response plus `chain_retry` with `recovery_class`, `retry_attempt`, `recovery_outcome`, `successor_task_id`, `chain_terminated`, and `idempotent_successor`; the corresponding recovery activity has `data.reason_code='task_pipeline_retry_chain_advancement'` plus `previous_reason_code` for the selected original failure/stall. Tests cover `output_still_invalid`, `stall_persisted`, `successor_created`, `successor_already_exists`, and `chain_terminated`; prove existing-successor post-recovery retry returns `200 OK`/`successor_already_exists` without creating a duplicate; prove post-`chain_terminated` retry returns side-effect-free `409 Conflict` with `retry_rejection_reason='retry_not_eligible'` until a new retry-eligible failure/stall exists; prove the response does not leak full corrected output or routing traces; and prove retry `409 Conflict` rejections write no recovery activity.
- [P3-AC5] Routing expression evaluator rejects unsafe inputs. Vitest covers each forbidden category with an adversarial fixture: `__proto__` access, `constructor` access, attempted invocation of `Function`, attempted invocation of the global code-evaluation primitive, arithmetic operators (`a + b`, `a - 1`), bitwise operators (`a & 1`), regex on right-hand side, JSONPath filters/script expressions (`$[?()]`, `$[?@.x>0]`) rejected before `JSONPath()` runs, malformed JSONPath (`$..`), and oversized literal strings (>32 KiB). Each test asserts the evaluator returns a structured rejection (no exception leak, no successor created) and emits `data.reason_code='task_pipeline_routing_expression_rejected'` when chain advancement stalls. Fixed-seed nested-expression and many-rule fixtures prove `maxRuleEvalMs = 10` budget overruns stall automated chain advancement, leave the parent in its terminal success state, record an `activities` row with `data.reason_code='task_pipeline_routing_budget_exceeded'`, and create no successor. Additional fixtures cover every pre-validation cap (`maxRoutingRules`, expression bytes, token count, boolean nesting depth, JSONPath bytes, JSONPath result count, literal bytes) and assert checks happen before expensive parse/traversal work.
- [P3-AC6] Successor task inherits `workspace_id`, `project_id`; assignee correctly resolved from `project_agent_assignments` via the documented join (`paa.role = template.agent_role` AND `paa.agent_name = agents.name`); first-hop parent lineage is initialized when absent (`root_task_id = parent.id`, generated `chain_id`, `chain_stage = 0`); successor lineage fields are populated (`parent_task_id`, same `root_task_id`, same `chain_id`, `chain_stage = parent.chain_stage + 1`). If assignee resolution finds no matching row, chain advancement stalls with activity evidence containing `data.reason_code='task_pipeline_successor_assignee_missing'`, the parent remains in terminal success, and no successor is created.
- [P3-AC6a] Successor creation calls the shared `createTask()` helper. Vitest asserts the helper is called exactly once per successor, with all expected side effects (activity row, ticket counter increment, subscription, GitHub push if `github_sync_enabled`, GNAP push if `gnap_sync_enabled`) and source-specific behavior preserved for API, GitHub import, GitHub sync import, recurring, and pipeline-successor creation. Ripgrep over production runtime source finds zero `INSERT INTO tasks` statements outside `src/lib/task-create.ts`.
- [P3-AC6b] `advanceTaskChain` wraps parent lineage initialization, validation failure state/activity writes, stall activity writes, duplicate-successor guard checks, and successor `createTask()` insertion in one database transaction. Vitest forces a failure after each write boundary and verifies rollback leaves no partial lineage, activity, failure state, or successor row. A retry with an existing successor for the same `parent_task_id` returns success as an idempotent no-op and creates no duplicate successor. M62 creates `idx_tasks_one_successor_per_parent` only after the duplicate preflight query returns zero rows; tests prove the unique index rejects a second non-null `parent_task_id`, allows multiple NULL `parent_task_id` rows, and the rollback file drops the index.
- [P3-AC7] Unit tests cover: valid routing, missing output, invalid output, no-match fallback to static next, chain terminate (no successor).
- [P3-AC8] `ajv`, `jsonpath-plus`, and `safe-regex` are present as exact pinned direct runtime `dependencies` in `package.json` and `pnpm-lock.yaml`; ripgrep finds no transitive-only imports of any of them, `.github/workflows/quality-gate.yml` runs the SPEC-004 dependency/guardrail checks and `pnpm audit:high`, and `pnpm audit --audit-level high` passes before merge. SPEC-004 owns resolving the current high-severity audit baseline observed on 2026-04-30, including `minimatch`, `rollup`, `flatted`, `picomatch`, `defu`, and `next` advisories; local registry/network failure may be documented during development, but the known audit advisories must not be deferred to another spec.
- [P3-AC9] Validator enforces every numeric bound listed in the deliverables (256 KiB output, 64 KiB schema, depth 16, keys 256, array 1024, string 32 KiB, pattern 256 chars, validation 50 ms) AND rejects: remote `$ref`, `$dynamicRef`, `$dynamicAnchor`, custom keywords, custom formats, async schemas, `ajv-formats` import/registration in SPEC-004 validator code, the `format` validator, and any pattern not whitelisted by both `safe-regex` and the conservative pattern subset. The AJV instance runs with strict behavior, no data mutation/default insertion, no type coercion, no exhaustive error collection, `validateFormats=false`, and `$data=false`. Each rejection has a Vitest fixture.
- [P3-AC10] Compiled validators are cached per `(template_id, schema_sha256)` with LRU eviction at 256 entries; schema validation p95 over 1000 random valid outputs remains ≤ 50 ms. A combined terminal-success benchmark measures validation + routing + chain advancement overhead against a flag-off/null-chain baseline and proves p95 delta ≤ 50 ms. Measured by Vitest with `performance.now()` over a fixed seed corpus.
- [P3-AC11] `docs/orchestration.md` is updated in the repository before Phase 3 is considered shipped. Gate-validator confirms the file's `git log` shows a commit in the SPEC-004 branch.
- [P3-AC12] A real running-app Playwright journey creates, edits, reads back, and deletes workflow-template chain fields in the live Workflows editor, proving `orchestration-bar.tsx`, `POST/PUT/DELETE /api/workflows`, create/update schemas, `routing_rules`-requires-`output_schema` validation, static `next_template_slug` without schema, and the repaired `DELETE /api/workflows?id=...` query-parameter contract work together under operator auth. Component-only tests do not satisfy this acceptance criterion.

### Rollback

Flip `FEATURE_TASK_PIPELINES` OFF. `advanceTaskChain` becomes a no-op. If schema rollback is required, apply `docs/migrations/rollback-M62.sql` after taking a database snapshot; it drops `idx_tasks_one_successor_per_parent` and leaves the SPEC-001 lineage columns intact.

### Estimated Work

7–10 engineering days. Evaluator + schema validation + scheduler wiring + template UI.

---

## Phase 4 — `ready_for_owner` State + Two-Step Terminal Event

### Scope

Add `ready_for_owner` to the task state progression for PR-producing tasks (D6, D7). Integrate with existing GitHub sync to transition `ready_for_owner` → `done` only when the linked PR is merged. Non-PR issue workflows continue to use `produces_pr=false` templates and do not require a PR.

### Upstream Impact

`upstream-divergent`. This changes the task-state machine and depends on schema/state upstream does not currently carry.

### Deliverables

- **Kanban UI**: `task-board-panel.tsx` — add `ready_for_owner` column between `quality_review` and `done`. Distinct styling (operator-action-required class).
- **GitHub label**: `github-label-map.ts` — `STATUS_LABEL_MAP.ready_for_owner = 'mc:ready-for-owner'`; `ALL_STATUS_LABEL_NAMES` updated. `initializeLabels` auto-creates the label.
- **Scheduler branching**: `runAegisReviews` — on successful Aegis approval, branch on `workflow_template.produces_pr`:
  - `true` → transition to `ready_for_owner`.
  - `false` → transition to `done` (current behavior).
- **GH sync transition**: `pullFromGitHub` — on linked PR merge, if a `produces_pr=true` task is in `ready_for_owner`, transition to `done`. If the linked issue closes without a merged linked PR, leave the task in `ready_for_owner` and create an operator-visible reconciliation activity/alert. Existing non-PR sync paths remain supported for `produces_pr=false` templates.
- **Notification class**: new notification type `task_ready_for_owner` wired into `notifications-panel.tsx`.

### Files Touched

- `src/components/panels/task-board-panel.tsx` — new column (~30 lines)
- `src/lib/github-label-map.ts` — 1 new entry
- `src/lib/github-sync-engine.ts` — new transition rule (~15 lines)
- `src/lib/task-dispatch.ts` — branch in `runAegisReviews` (~15 lines)
- `src/lib/db.ts` / existing notification callsites — create `task_ready_for_owner` notifications without adding a generic notification module
- `src/components/panels/notifications-panel.tsx` — render new type

### Acceptance Criteria

- [P4-AC1] With flag OFF, Aegis approval transitions tasks to `done` as today; existing `ready_for_owner` rows remain readable and visible, but no new transition enters `ready_for_owner`.
- [P4-AC2] With flag ON and `template.produces_pr = false`, task transitions `quality_review → done` as today.
- [P4-AC3] With flag ON and `template.produces_pr = true`, task transitions `quality_review → ready_for_owner`.
- [P4-AC4] `produces_pr=true` task in `ready_for_owner` with linked PR merged → `pullFromGitHub` transitions to `done`.
- [P4-AC4a] `produces_pr=true` task in `ready_for_owner` with linked issue closed but no merged linked PR → task remains `ready_for_owner`; reconciliation activity/alert is created.
- [P4-AC4b] `produces_pr=false` close/disposition task can complete without any PR.
- [P4-AC5] Kanban column renders; operator sees tasks awaiting merge in a dedicated lane.
- [P4-AC6] `mc:ready-for-owner` label appears on linked GitHub issue when MC task enters that state.

### Rollback

Flip `FEATURE_TWO_STEP_TERMINAL` OFF. Scheduler transitions direct to `done` as before. The `ready_for_owner` column still renders any existing rows for rollback visibility, but no new automatic or manual transition enters that state while the flag is OFF.

### Estimated Work

3–4 engineering days.

---

## Phase 5 — Area-Label GitHub Sync

### Scope

Add `area:*` label routing (D8) so that a single monorepo per product line can serve multiple department kanbans. The live sync is currently project-driven, so this phase must also introduce repo-level sync ownership or equivalent dedupe for `(workspace_id, github_repo)`. Behind `FEATURE_AREA_LABEL_ROUTING`.

### Upstream Impact

`upstream-safe`. This is additive sync behavior and a good upstream candidate if implemented generically.

### Deliverables

- **Repo-level sync ownership/dedupe**: ensure only one owner or dedupe path polls a given `(workspace_id, github_repo)` even when multiple department projects share the repo. The unique `(workspace_id, github_repo, github_issue_number)` constraint is a guardrail, not the main routing strategy.
- **Label family**: `github-label-map.ts` — `AREA_LABEL_MAP` and `ALL_AREA_LABEL_NAMES`.
- **Label provisioning**: `initializeLabels` creates the `area:*` labels on sync enable (idempotent).
- **Inbound routing**: `pullFromGitHub` on issue ingestion:
  1. Parse `area:*` labels from issue labels.
  2. If exactly one resolvable area exists, resolve `(workspace_id, area_slug) → project_id` via a lookup (seed a `projects.area_slug` column or use `projects.slug`).
  3. Set `task.project_id = resolved`.
  4. If no `area:*` label, multiple `area:*` labels, or lookup failure, route to the workspace's triage/inbox project with `area:triage` tag and create an activity explaining the ambiguity.
- **Outbound sync**: `pushTaskToGitHub` emits `area:<project_slug>` label alongside `mc:*` and `priority:*`.
- **Template updates**: Pilot workflow templates (Phase 8C) emit the correct `area:*` label in their outbound sync paths.

### Files Touched

- `src/lib/github-label-map.ts` — ~15 lines added
- `src/lib/github-sync-engine.ts` — inbound routing (~40 lines), outbound label emission (~10 lines)
- Migration (optional): add `projects.area_slug TEXT NULL` if slug mismatch between MC project and GitHub label is a concern; else reuse `projects.slug`.

### Acceptance Criteria

- [P5-AC1] With flag OFF, GitHub sync behaves as today (one-to-one task↔issue, existing project-driven path).
- [P5-AC2] With flag ON, two or more projects sharing the same `github_repo` do not duplicate-poll or duplicate-ingest the same GitHub issue.
- [P5-AC3] New issues with `area:qa` label are routed to the QA project; `area:dev` to Dev; etc.
- [P5-AC4] Issues with no `area:*` label route to the workspace's triage/inbox project with an `area:triage` tag.
- [P5-AC5] Issues with multiple `area:*` labels route to triage/inbox and create an ambiguity activity; they do not thrash between departments.
- [P5-AC6] Task push to GitHub emits `area:<project_slug>` alongside existing label classes.
- [P5-AC7] `initializeLabels` creates the `area:*` labels on the repo and is idempotent.

### Rollback

Flip `FEATURE_AREA_LABEL_ROUTING` OFF. `pullFromGitHub` ignores `area:*` labels; `pushTaskToGitHub` stops emitting them.

### Estimated Work

3–4 engineering days.

---

## Phase 6 — Disposition Logging + Artifact Store + Admin Panels

### Scope

Log every triage disposition to `task_dispositions` (D9). Add the shared Mission Control task artifact store (D11) as the durable handoff plane between private agent sandboxes. Extend operator surfaces with disposition views and artifact admin/health controls.

### Upstream Impact

`upstream-divergent`. The UI/admin surfaces may be upstreamable, but the current design depends on new persistence tables and artifact semantics upstream does not have.

### Deliverables

- **Insert hook**: in `advanceTaskChain` (Phase 3), after routing resolution, insert a `task_dispositions` row. Fires for every triage template completion regardless of outcome.
- **Artifact publish path**: `src/lib/task-artifacts.ts` imports inline JSON/Markdown or file-backed outputs from an agent sandbox into MC-controlled artifact storage. Writes provenance, hashes, MIME type, preview text, redaction status, scan status, and audit activity.
- **Secret detector contract**: `src/lib/secret-detector.ts` is the single redaction/rejection gate. It exports `detectSecrets(content: string | Buffer, mime: string)` returning `{ findings: SecretFinding[], redacted: string | Buffer }`. The detector ships **MC Secret Detector v1**, a curated rule set sourced from gitleaks v8.x default rules (https://github.com/gitleaks/gitleaks/blob/v8.18.0/config/gitleaks.toml) plus Mission Control additions. Rule families included in v1: AWS access key id (`AKIA[0-9A-Z]{16}`), AWS secret access key (40-char base64-ish heuristic plus AWS context), GitHub PAT (`gh[pousr]_[A-Za-z0-9_]{36,}`), GitHub fine-grained PAT, GitHub OAuth (`gho_…`), Google API key (`AIza[0-9A-Za-z_-]{35}`), Slack token, Stripe key (`sk_live_…`, `pk_live_…`), generic `BEGIN PRIVATE KEY` / `BEGIN RSA PRIVATE KEY` PEM blocks, generic `password=`, `api_key=`, `token=`, `secret=` assignments in `.env`-style lines, JWT (`eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`), generic Bearer header, and Anthropic / OpenAI key patterns (`sk-ant-…`, `sk-…`). The exact regex set is checked into `src/lib/secret-detector.rules.ts` and snapshot-tested with positive/negative fixtures.
- **Redaction policy**: when `detectSecrets` returns ≥1 finding, the artifact publish is REJECTED by default; the producer task gains an `activities` row (kind=`security_violation`) and the publish API returns 422 with the redacted preview. Operator may explicitly opt the workflow template into "redact-and-store" mode (`workflow_templates.allow_redacted_artifacts = 1`, added by M54); in that mode the redacted content is stored and the original is discarded.
- **Secret detector tests** are mandatory: every rule has a positive and negative fixture in `src/lib/__tests__/secret-detector.test.ts`. CI fails if a rule has zero fixtures.
- **Artifact consume path**: successor task dispatch includes artifact references and safe previews. Raw file content is available only through MC-controlled artifact-read APIs.
- **Audit panel**: new tab "Dispositions" in `audit-trail-panel.tsx` with filters on `disposition`, `workspace_id`, date range. Pagination for large result sets.
- **Artifact admin panel**: list/search artifacts, inspect metadata, quarantine unsafe artifacts, delete/archive by policy, repair orphan records, verify hashes, rebuild previews/indexes, and view storage health.
- **Dashboard widget**: simple cards in `dashboard.tsx` showing "Last 7d triage totals" and artifact-store health per workspace.
- **Morning-briefing integration**: daily-ops morning-prep skill can query this table for the daily briefing (separate repo integration — document only, no code here).

### Files Touched

- `src/lib/task-dispatch.ts` — add INSERT in `advanceTaskChain` (~10 lines)
- `src/lib/task-artifacts.ts` — publish/read/quarantine/retention helpers
- `src/app/api/task-artifacts/route.ts` and `src/app/api/task-artifacts/[id]/route.ts` — MC-controlled artifact APIs
- `src/components/panels/audit-trail-panel.tsx` — new tab (~80 lines)
- `src/components/panels/artifact-admin-panel.tsx` — artifact admin/health surface
- `src/components/dashboard/dashboard.tsx` — new widgets (~50 lines)
- `src/app/api/dispositions/route.ts` (new) — GET with filters

### Acceptance Criteria

- [P6-AC1] With flag OFF, no rows inserted into `task_dispositions`.
- [P6-AC2] With flag ON, every triage template completion inserts exactly one row.
- [P6-AC3] Insert failure does not block task advancement (logged to `activities`).
- [P6-AC4] Audit panel renders dispositions with working filters and pagination.
- [P6-AC5] Dashboard widget shows accurate 7-day rollup by disposition.
- [P6-AC6] Agent output can publish inline JSON, Markdown, and file-backed artifacts from a private sandbox into MC artifact storage.
- [P6-AC7] Successor task dispatch includes artifact references and safe previews; no successor reads another agent's private sandbox directly.
- [P6-AC8] Secret-like content in an artifact publish is rejected (or redacted, when the template opts into `allow_redacted_artifacts`) and produces a `security_violation` activity row. Vitest covers every rule family in `secret-detector.rules.ts` with at least one positive fixture (planted secret) and one negative fixture (lookalike that must not match). CI fails on `safe-regex` rejection of any rule. The detector achieves ≥ 95% recall on the curated test fixture set located at `src/lib/__tests__/fixtures/secrets/`.
- [P6-AC9] Artifact admin panel shows counts, bytes, failed publishes/scans/reads, orphan count, storage free space, and p95 publish/read latency. p95 latency is measured server-side over a rolling 1-hour window with at least 100 observations; the Vitest p95 budget is 200 ms for inline artifacts and 1000 ms for ≤ 5 MB file artifacts on the test rig (CI flags slower-than-budget runs as a warning, not a failure, since hardware varies).
- [P6-AC10] Admin actions support quarantine, hash verification, retention/archive/delete by policy, and preview/index rebuild.

### Rollback

Flip `FEATURE_DISPOSITION_LOGGING` and/or `FEATURE_TASK_ARTIFACTS` OFF. INSERT/publish paths become no-ops. Tables remain; queries return empty for new period. Existing artifacts remain readable to preserve auditability unless explicitly archived/deleted by policy.

### Estimated Work

3 engineering days.

---

## Phase 7 — Resource Governance + Cost Tracker Enforcement

### Scope

Extend the existing Cost Tracker from best-effort observability into scheduler-enforced WIP, blackout/degraded-window, and budget governance. This phase must not duplicate token/cost telemetry. It consumes the existing `/api/tokens`, task-cost, provider-subscription, and token-pricing surfaces and adds enforcement decisions around autonomous work.

### Upstream Impact

Mixed:

- Governance core is `upstream-divergent` because the current design depends on `resource_policies` and `resource_policy_events`.
- OpenClaw health electricity / infra cost ingestion is `fork-only optional` and must remain a runtime adapter with no schema migration in v1.

### Deliverables

- **Governance evaluator**: `src/lib/resource-governance.ts` with `evaluateResourceGovernance(context)` returning `allow`, `defer`, `block`, or `override_required`. The evaluator MUST be wrapped in a try/catch at every call site; if `evaluateResourceGovernance` throws, the error path returns `defer` (NOT `block`) so the scheduler retries on the next tick rather than wedging the system; the caught error is written as a `resource_policy_events` row with `decision='defer'`, `reason='evaluator_error: <message>'` and an `activities` row of kind `governance_evaluator_error` is created. A scheduler-wide circuit breaker counts consecutive evaluator errors per minute; on >5 errors/minute the breaker opens and `evaluateResourceGovernance` is bypassed (returns `allow`) until manually reset, with an operator notification of class `governance_circuit_breaker_open`. This combination prevents both silent failure (errors not logged) and full DOS (a buggy evaluator wedging dispatch).
- **Scheduler gates**: call the evaluator before `autoRouteInboxTasks`, `dispatchAssignedTasks`, `advanceTaskChain`, and `runAegisReviews`. The exact call sites in `src/lib/task-dispatch.ts` and `src/lib/scheduler.ts` are documented in the SPEC-008 workflow file.
- **Policy-backed defaults**: preserve current behavior when the flag is OFF; when ON, replace hard-coded `LIMIT 3` and "3+ in-progress tasks" capacity checks with seeded default WIP policies.
- **Cost Tracker UI extension**: add a "Governance" view/tab showing budget utilization, raw token/request/session usage, WIP by scope, active blackout/degraded windows, upcoming windows, policy decisions, and overrides.
- **Budget semantics**: separate `estimated_marginal_cost_usd` from raw usage budgets. The OpenClaw node's OpenAI ChatGPT Pro setup may show `$0` estimated marginal cost, but token/request/session/WIP budgets still enforce.
- **Electricity / infra ingestion**: behind `FEATURE_OPENCLAW_HEALTH_COSTS`, read OpenClaw health artifacts (`~/.openclaw/health/readings.jsonl`, `current-rate.json`, `cost.json`) into a facility-cost model exposed through the Cost Tracker API/UI.
- **Blended cost semantics**: keep token/API cost and electricity/infra cost distinct, but expose combined totals for budgeting and operator visibility.
- **Adapter discipline**: OpenClaw health cost support remains runtime-only in v1. No schema migration. If the files/config are absent, the adapter returns empty data and Cost Tracker / scheduler continue normally.
- **Policy audit**: write every non-allow decision to `resource_policy_events` and emit activity/notification records for operator visibility.
- **Override path**: operator can temporarily override a policy decision with reason, actor, scope, and expiry recorded.

### Files Touched

- `src/lib/resource-governance.ts` (new)
- `src/lib/task-dispatch.ts` — evaluator calls before routing, dispatch, chain advancement, and Aegis review
- `src/app/api/resource-policies/route.ts` and `src/app/api/resource-policy-events/route.ts` (new)
- `src/app/api/tokens/route.ts` — expose governance summary data or reuse existing aggregates
- `src/lib/openclaw-health-costs.ts` (new) — read/normalize electricity rate, power, energy, and cost snapshots from OpenClaw health files
- `src/components/panels/cost-tracker-panel.tsx` — governance tab/view
- `src/components/panels/task-board-panel.tsx` — WIP-limit indicators on columns where useful

### Acceptance Criteria

- [P7-AC1] With `FEATURE_RESOURCE_GOVERNANCE=false`, existing scheduler behavior is unchanged.
- [P7-AC2] With the flag ON and no policies enabled, evaluator returns `allow` and logs no blocking events.
- [P7-AC3] Agent WIP policy `agent_id=a, limit_kind='in_progress_tasks', limit_value=1` prevents a second task from dispatching to that agent and writes a `defer` or `block` event.
- [P7-AC4] Project/status WIP policy prevents more than the configured number of Mission Control Development tasks from entering `in_progress`.
- [P7-AC5] Blackout window policy blocks new autonomous dispatch/chain advancement during the window while allowing already-running work to checkpoint or complete.
- [P7-AC6] Degraded window policy allows only configured critical/local/approved-provider work.
- [P7-AC7] Soft budget threshold emits alert/activity and allows work to continue.
- [P7-AC8] Hard budget threshold blocks or pauses new work according to policy enforcement and requires operator override to continue.
- [P7-AC9] OpenAI subscription path still enforces token/request/session budgets even when estimated marginal USD cost is zero.
- [P7-AC10] With `FEATURE_OPENCLAW_HEALTH_COSTS=false` or with OpenClaw health files absent, existing Cost Tracker and scheduler behavior are unchanged.
- [P7-AC11] With `FEATURE_OPENCLAW_HEALTH_COSTS=true` and valid OpenClaw health files present, facility electricity/infra telemetry appears in Cost Tracker alongside token/API cost, with blended totals available.
- [P7-AC12] Policy evaluation failure fails safe: a thrown error inside `evaluateResourceGovernance` causes the call site to return `defer`; a `resource_policy_events` row with `reason='evaluator_error: …'` is written; an `activities` row of kind `governance_evaluator_error` is written; an operator notification fires. >5 consecutive errors/minute trip the circuit breaker, after which evaluator returns `allow` until reset (with operator alert). Validated by Vitest with a `evaluateResourceGovernance` stub that throws; assertions cover the activity row, the policy event, the notification, and the breaker state transition.

### Rollback

Flip `FEATURE_RESOURCE_GOVERNANCE` OFF. Scheduler returns to legacy behavior. Tables and events remain for auditability. Existing Cost Tracker views continue to work. If needed, also flip `FEATURE_OPENCLAW_HEALTH_COSTS` OFF to remove the fork-only OpenClaw infra adapter without affecting governance core.

### Estimated Work

4–6 engineering days.

---

## Remaining Work Lanes (Small-Spec Execution Map)

### Lane A - Self-Hosting Mission Control Product Line

This is the critical path for using Mission Control to finish its own roadmap. It onboards Mission Control as the first product line, configures its agents/governance/GitHub integration, and proves the system by having agents work Mission Control GitHub issues toward completion and deployment.

| Spec | Slice | Blocked By | Can Run With | Human Validation |
|---|---|---|---|---|
| SPEC-009A | Workflow contract roundtrip | SPEC-008 | SPEC-011, SPEC-012A | Import/export the contract, inspect fail-closed errors, confirm no pilot dispatch |
| SPEC-009B | Product-line seed + flag activation | SPEC-009A | SPEC-010A prep after merge | Run seed on target deployment, inspect product-line config, flags, assignments, governance, Issue Triage family, and Issue Remediation family |
| SPEC-009C1 | GitHub pilot issue ingest + eligibility | SPEC-009B | SPEC-010A | Label or create one pilot issue, ingest it, and prove local-only tasks are ineligible |
| SPEC-009C2 | Triage to remediation handoff | SPEC-009C1 | SPEC-010A | Drive triage to `ACTIONABLE_REMEDIATION` and verify non-remediation outcomes exit cleanly |
| SPEC-009C3 | Remediation to `ready_for_owner` | SPEC-009C2 | SPEC-010A if file scopes are disjoint | Observe remediation plan -> dev -> review -> Aegis -> `ready_for_owner` |
| SPEC-009C4 | Owner merge gate + done reconciliation | SPEC-009C3 | — | Merge PR at `G_PILOT_MERGE`, sync, and verify `ready_for_owner -> done` |
| SPEC-009D | Review packet + lifecycle snapshot | SPEC-009C4 | SPEC-012A/010A follow-on | Inspect one packet with issue/PR/artifact/governance/Aegis/owner-gate state and explicit deferred fields |
| SPEC-009E | Pilot eligibility + evidence surfaces | SPEC-009D | SPEC-012A if file scopes are disjoint | Inspect read-only pilot eligibility, GitHub-linked task evidence, smoke status, and deferred run-state fields |
| SPEC-009F | Production triage outcome routing | SPEC-009E, SPEC-012A | SPEC-013A1 if file scopes are disjoint | Drive non-remediation triage fixtures and inspect correct lane/evidence without remediation successors |

### Lane B - Optional Security Sidecar

SPEC-011 can run any time after SPEC-008. It is deliberately outside the self-hosting critical path. It must stay disabled by default, absent-safe, schema-free, and fork-only optional.

### Lane C - Second Product Line Scale

| Spec | Slice | Blocked By | Can Run With | Human Validation |
|---|---|---|---|---|
| SPEC-010A | Generic product-line seeder | SPEC-009B | SPEC-009C1/C2 | Reproduce Mission Control seed from config without dispatching work |
| SPEC-010B | Product Line B smoke | SPEC-009C4, SPEC-010A, Product Line B preflight cleanup | SPEC-012A cleanup | Onboard Product Line B in under one operator-hour, run first issue smoke, disable workspace cleanly |

### Lane D - Harness Engineering and Repo Knowledge

| Spec | Slice | Blocked By | Can Run With | Human Validation |
|---|---|---|---|---|
| SPEC-012A | Repo knowledge index + AGENTS map | SPEC-002A, SPEC-009A | SPEC-011, SPEC-009B | Start a fresh agent from repo-local docs and verify it can find PRD/roadmap/spec/workflow/runbook truth |
| SPEC-012B | Harness-gardening drift guards | SPEC-010B, SPEC-012A | Later cleanup specs | Trigger each supported drift fixture and confirm one narrow cleanup task recommendation is produced |

### Lane E - Task Control Plane

| Spec | Slice | Blocked By | Can Run With | Human Validation |
|---|---|---|---|---|
| SPEC-013A | Run-state persistence spine | SPEC-009D, SPEC-012A | SPEC-012B | Inspect durable attempt state with the feature flag OFF and confirm legacy dispatch ignores it |
| SPEC-013A1 | GitHub sync automation + poller lifecycle | SPEC-013A | SPEC-009E if file scopes are disjoint | Enable automatic GitHub polling, inspect status/error state, disable it, and verify manual sync fallback |
| SPEC-013B | Claim + reconciliation authority | SPEC-013A1 | SPEC-014A planning only | Run concurrent scheduler ticks and confirm only one claim, GitHub-linked eligibility, governance gating, and terminal-state release |
| SPEC-013C | Retry/backoff + debug surfaces | SPEC-013B | SPEC-014A/014B | Cancel/retry/release one claimed stage and inspect JSON/debug/audit state |

### Lane F - Sandboxes and Harness Adapters

| Spec | Slice | Blocked By | Can Run With | Human Validation |
|---|---|---|---|---|
| SPEC-014A | Sandbox ownership + lifecycle contract | SPEC-013B | SPEC-013C | Create fake Mission-Control/OpenClaw/external sandbox lifecycles and confirm paths/handles/cleanup are bounded |
| SPEC-014B | Adapter manifest + fake registry | SPEC-014A | SPEC-013C | Run two fake adapters through the same manifest, inspect runtime-inventory state transitions, and confirm unsupported capabilities fail closed |
| SPEC-014C | First real harness adapter pilot | SPEC-013C, SPEC-014B | SPEC-014D if adapter files are disjoint | Run one real adapter on an already-claimed GitHub-linked stage and inspect artifacts/usage/failure summaries |
| SPEC-014D | OpenClaw/external harness adapter | SPEC-014B | SPEC-014C if adapter files are disjoint | Enable OpenClaw/external adapter on target deployment, verify absent-safe OFF path, import unassigned inventory, and prove explicit assignment before eligibility |

## Dependency Graph

```
Completed through SPEC-008
    ├─→ SPEC-009A ─→ SPEC-009B ─→ SPEC-009C1 ─→ SPEC-009C2 ─→ SPEC-009C3 ─→ SPEC-009C4 ─→ SPEC-009D
    │                    │                                                                       │              ├─→ SPEC-009E ─→ SPEC-009F
    │                    │                                                                       │              └─→ SPEC-013A ─→ SPEC-013A1 ─→ SPEC-013B ─→ SPEC-013C
    │                    │                                                                       │                                             └─→ SPEC-014A ─→ SPEC-014B ─┬─→ SPEC-014C
    │                    │                                                                       │                                                                      └─→ SPEC-014D
    │                    └─→ SPEC-010A ──────────────────────────────────────────────────────────┴─→ SPEC-010B ─→ SPEC-012B
    ├─→ SPEC-011
    └─→ SPEC-012A ───────────────────────────────┘
```

Phase 0 through Phase 8D are complete and remain the substrate for all later work. SPEC-012A is the highest-priority unblocked next setup target; SPEC-009E, SPEC-010A, and SPEC-011 remain available parallel starts when file ownership stays disjoint. The SPEC-009C family is the first practical self-hosting gate, split into ingest, triage handoff, remediation-to-owner, and merge reconciliation so each PR is reviewable. SPEC-009D bridges pilot smoke to formal run-state by emitting the reviewable lifecycle packet. SPEC-010A extracts the reusable seeder from the Mission Control-specific path, SPEC-009E turns pilot eligibility/evidence into operator-visible read-only surfaces, and SPEC-009F owns production routing/evidence for non-remediation triage outcomes. SPEC-013A-C own run-state, GitHub sync automation, claim/reconciliation, and retry authority. SPEC-014A-D execute already-claimed work and must not own tracker truth, successor selection, governance, or auto-merge policy.

Parallel agents may work simultaneously only when they own disjoint primary files and state:

- SPEC-012A is the highest-priority unblocked pending spec after SPEC-009D because it feeds SPEC-013A.
- SPEC-009E, SPEC-010A, and SPEC-011 may also start when file ownership stays disjoint.
- SPEC-012B waits for SPEC-010B so harness-gardening rules encode real two-product-line behavior.
- SPEC-009E may run after SPEC-009D and does not block SPEC-013A if file ownership stays disjoint.
- SPEC-009F waits for SPEC-009E and SPEC-012A because production non-remediation lanes need both pilot evidence surfaces and current repo/process index truth.
- SPEC-013A1 runs after SPEC-013A and before SPEC-013B so automatic GitHub sync is explicit before claim/reconciliation relies on scheduler ticks.
- SPEC-014C and SPEC-014D may run in parallel only after SPEC-014B and only if adapter modules, fixtures, and deployment docs are isolated.

## Timeline (Small-Spec Estimate)

| Spec | Days | Critical Path? |
|---|---:|---|
| SPEC-009A | 1.5-2 | Yes |
| SPEC-009B | 1.5-2.5 | Yes |
| SPEC-009C1 | 0.75-1.25 | Yes |
| SPEC-009C2 | 1-1.5 | Yes |
| SPEC-009C3 | 1-1.5 | Yes |
| SPEC-009C4 | 0.75-1 | Yes |
| SPEC-009D | 1-1.5 | Yes |
| SPEC-009E | 1-1.5 | Follow-on evidence surface after SPEC-009D |
| SPEC-009F | 1.5-2 | Future production triage routing after SPEC-009E |
| SPEC-010A | 1-1.5 | Parallel after SPEC-009B |
| SPEC-010B | 1.5-2.5 | Parallel branch; feeds SPEC-012B |
| SPEC-011 | 1-2 | Optional parallel |
| SPEC-012A | 1-2 | Parallel after SPEC-009A; feeds SPEC-013A |
| SPEC-012B | 1-1.5 | Parallel cleanup lane |
| SPEC-013A | 1.5-2.5 | Yes after self-hosting packet |
| SPEC-013A1 | 1-1.5 | Yes before claim/reconciliation |
| SPEC-013B | 2-3 | Yes |
| SPEC-013C | 1.5-2 | Yes |
| SPEC-014A | 1.5-2 | Yes |
| SPEC-014B | 1.5-2 | Yes |
| SPEC-014C | 2-3 | Yes for first real adapter |
| SPEC-014D | 2-3 | Optional/fork parallel after SPEC-014B |

First self-hosting proof is roughly 6-9 engineering days after SPEC-008 for one engineer: SPEC-009A through SPEC-009D. The fully observable control-plane path through the first real harness adapter is roughly 18-27 critical-path engineering days, with SPEC-011, SPEC-010A/B, SPEC-012A/B, and SPEC-014D available as parallel work where file ownership is isolated.

## V2 Readiness Backlog

### V2-001: Tenant-Aware Gateway Isolation

- **Status:** Pending (V2 backlog; excluded from the SpecKit-Pro Spec Index until promoted to a future SPEC)
- **Priority:** P2 after Product Line B onboarding
- **Depends On:** SPEC-002, SPEC-008, SPEC-010B
- **Terminology guardrail:** Tenant gateway isolation is keyed to tenant context (`tenant_id` / facility-account boundary). It is not keyed to the seeded `workspaces.slug='facility'` row and not keyed to the null "Facility" aggregate switcher view (`activeWorkspace = null`).
- **Scope:** Clean current global gateway coupling so a future multi-facility deployment can run multiple tenant gateways from one Mission Control instance. Tenant provisioning already carries `openclaw_home` and `gateway_port`; `owner_gateway` is persisted owner/provisioning metadata today, not a runtime gateway endpoint binding. Runtime behavior is mixed: some startup/backend paths still rely on global `gateways.is_primary` fallback or process-level `OPENCLAW_GATEWAY_*` / `config.gatewayHost` / `config.gatewayPort` defaults, while selected-gateway connect and some health paths can use gateway rows. V2 should add tenant-aware gateway associations, runtime resolution, health probes, config paths, and compatibility fallbacks.
- **Acceptance criteria source:** PRD FR-A5, SC-15, and R12.
- **Acceptance checks:** A future V2 spec is not complete until gateway registry/resolution has an explicit tenant context, two tenants can resolve different gateway ports/hosts without data leakage, backend RPC/WS/health paths use the tenant-aware resolver or a documented compatibility fallback, and tests cover selected-gateway connect plus process-global fallback behavior.
- **Definition of done:** Existing global primary/process-env behavior remains available as a compatibility path for single-tenant installs, but new or touched gateway-facing code does not directly add `OPENCLAW_GATEWAY_*`, `config.gatewayHost`, `config.gatewayPort`, or `gateways.is_primary` assumptions outside the approved resolver/adapter surface.
- **Non-goal for v1:** SPEC-002 must not implement tenant-routed gateway selection. It preserves the boundary by keeping `activeTenant` separate from `activeWorkspace` and avoiding new product-line behavior that depends on tenant-scoped gateway state.

## Risk Register (linked to PRD §9)

| # | Phase Impacted | Mitigation Owner |
|---|---|---|
| R1 Aegis refactor surface area | Phase 2 | Dedicated phase + comprehensive tests pre-ship |
| R2 Cross-product MEMORY.md bleed | Phase 3, 8C, 9B | D4a strict-twin enforced; no global promotion without review |
| R3 Routing-rule expression safety | Phase 3 | FR-D8 safe-subset; evaluator tests include adversarial inputs |
| R4 Schema validation false-positives | Phase 3, 8A, 8C | Version `output_schema`; agent prompts reference version |
| R5 GitHub label drift | Phase 5 | `initializeLabels` idempotent; `area:triage` fallback |
| R6 Cross-tab state desync | Phase 1 | No existing pattern in `src/store/index.ts`; Phase 1 implements `persist` + `BroadcastChannel` from scratch for the `activeWorkspace` slice only |
| R7 Disposition/artifact store growth | Phase 6 | Quotas, retention, artifact admin maintenance, and revisit partitioning/storage tiering at scale |
| R8 Feature-flag sprawl | All | Flags default OFF; document in the relevant settings or editor surface |
| R9 ChatGPT Pro / subscribed-provider cost reads as `$0`, hiding runaway usage | Phase 7 | Separate estimated marginal USD from token/request/session/WIP budgets; raw usage budgets still enforce even when dollar cost is zero |
| R10 Additive schema changes mistaken for upstream-safe changes | All schema phases | D13 compatibility labeling; roadmap marks schema/state divergence before implementation |
| R11 OpenClaw health electricity integration leaks OpenClaw-node assumptions upstream | Phase 7 | Fork-only optional adapter, absent-safe runtime checks, and no v1 schema migration for health costs |
| R12 Global gateway coupling blocks clean multi-facility v2 | V2-001 | Preserve `openclaw_home`/`gateway_port` provisioning data and `owner_gateway` metadata in v1; avoid new process-global gateway assumptions; V2-001 owns tenant-aware gateway registry/resolution before multi-facility operation |
| R13 Workflow contract drift between Markdown and `workflow_templates` makes agents run stale prompts | Phase 8A, 10B, 12B | SPEC-009A owns export/import parity checks, prompt/schema/routing hashes, and last-known-good behavior for invalid reloads; SPEC-012B guardrails detect later drift |
| R14 Long-running runner sessions duplicate work after crash/restart | Phase 11B, 12C | Claim state is serialized in Mission Control; dispatch reconciles before launch; restart recovery uses task/GitHub state plus workspace inspection |
| R15 App-server/session logs leak secrets into review packets | Phase 12C | Reuse SPEC-007 secret detection/redaction and SPEC-008 observability redaction before persisting summaries or artifact previews |
| R16 Agents learn bad local patterns and amplify documentation/test debt | Phase 10B | Harness-gardening scans create recurring narrow cleanup tasks instead of relying on periodic broad manual rewrites |

## Rollback Strategy Summary

Each phase is independently rollback-safe:

- **Schema migrations** (Phase 0) — manual reverse SQL files at `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql` plus an operator runbook at `docs/migrations/rollback-procedure.md`. The live migration runner (`src/lib/migrations.ts:5-9`) has no `down()` function; rollback is operator-initiated manual SQL, NOT automatic.
- **Feature flags** (Phases 1–7) — flip OFF (via `workspaces.feature_flags` JSON or the env-var kill-switch documented in the Feature Flag Resolution Policy) → behavior reverts to pre-phase.
- **Self-hosting pilot** (Phases 8B-8D) — flip `PILOT_MISSION_CONTROL_E2E` OFF; workspace/templates remain, but pilot auto-chain stops; operator can fall back to explicit task assignment (Pattern 1).
- **Product-line onboarding** (Phase 9B) — set the Product Line B workspace disabled; sync pauses; agents still run but no new work dispatches for that product line.
- **Harness docs** (Phases 10A-10B) — revert docs/process guardrails; no runtime effect.
- **Task control plane** (Phases 11A-11C) — flip `FEATURE_TASK_CONTROL_PLANE` OFF; run-state rows remain for audit and are ignored.
- **Sandbox runner** (Phases 12A-12D) — flip `FEATURE_AGENT_RUNNER_SANDBOXES` OFF; existing sandboxes/artifacts remain until operator cleanup.

No destructive rollback required at any phase.

## Upstream Compat Checklist (every PR)

- [ ] Does this PR reference `task_templates` as a SQL table? If yes, STOP — live table is `workflow_templates`.
- [ ] Does this PR insert into `workspaces.display_name`? If yes, STOP — live column is `workspaces.name`.
- [ ] Does this PR assume `agents.workspace_path` or a `tasks.status` CHECK constraint exists? If yes, first verify the live `.schema` and document the result.
- [ ] Does this PR rename any column in `workspaces`, `projects`, `tasks`, or `agents`? If yes, STOP unless a compatibility/rollback decision is recorded — DB renames are upstream-divergent and not automatically additive-safe.
- [ ] Does this PR modify any upstream-owned file (`src/app/layout.tsx`, `src/lib/auth.ts`, etc.) in a way that would create merge conflicts? If yes, isolate the change to a new file or extend via hooks.
- [ ] Does this PR add new migrations? If yes, they MUST be additive.
- [ ] Does this PR change public API shapes (existing endpoints)? If yes, version the endpoint or preserve the old shape.
- [ ] Does this PR add or touch gateway-facing code (`OPENCLAW_GATEWAY_*`, `config.gatewayHost`, `config.gatewayPort`, `gateways.is_primary`, or gateway health/connect/control routes)? If yes, STOP unless the diff either preserves existing behavior without adding new global gateway assumptions or routes new resolution through a named compatibility helper/adapter with a V2-001 reference.
- [ ] Feature flag present?
- [ ] If this PR is Symphony-inspired, does it preserve the Mission Control stack and SpecKit task-chain authority rather than importing the Elixir prototype, Linear-only assumptions, or a general distributed scheduler?

Every phase PR passes through this checklist before merge.
