# Mission Control Platform Hardening + Full Agent CLI/TUI PRD

> For Hermes: execute this plan in iterative vertical slices (contract parity -> CLI core -> TUI -> hardening), with tests at each slice.

Goal
Build a production-grade Mission Control operator surface for autonomous agents via a first-party CLI (and optional lightweight TUI), while fixing platform inconsistencies discovered in audit: API contract drift, uneven reliability controls, and incomplete automation ergonomics.

Architecture
Mission Control remains the source of truth with REST + SSE endpoints. A first-party CLI consumes those APIs with profile-based auth and machine-friendly output. TUI is layered on top of CLI API client primitives for shared behavior. API contract reliability is enforced through route-to-spec parity checks in CI.

Tech Stack
- Existing: Next.js app-router API, SQLite, Node runtime, SSE
- New: Node CLI runtime (no heavy deps required for v1), optional TUI in terminal ANSI mode
- Testing: existing Playwright/Vitest patterns + CLI smoke tests + OpenAPI parity checks

---

## 1) Problem statement

Current Mission Control backend has strong capabilities for agent orchestration, but external automation quality is constrained by:
1. API surface drift between route handlers, openapi.json, and /api/index.
2. No first-party comprehensive CLI for operators/agents.
3. Uneven hardening around operational concerns (auth posture defaults, multi-instance rate limiting strategy, spawn history durability).
4. Incomplete UX for non-interactive agent workflows (idempotent commands, stable JSON output, strict exit codes).

Result: agents can use Mission Control partially, but not yet with high confidence as a full control plane.

## 2) Product objectives

Primary objectives
1. Deliver a first-party CLI with functional parity across core agent workflows.
2. Add optional TUI for rapid situational awareness and interactive operations.
3. Establish API contract parity as an enforceable quality gate.
4. Improve reliability and security defaults for autonomous operation.

Success criteria
- 95%+ of documented operator workflows executable via CLI without web UI.
- Contract parity CI gate blocks drift between route handlers and OpenAPI.
- CLI supports machine mode: stable JSON schemas and deterministic exit codes.
- TUI can monitor and trigger core actions (agents/tasks/sessions/events).

Non-goals (v1)
- Replacing the web UI.
- Building an advanced ncurses framework dependency stack if not needed.
- Supporting all historical/legacy endpoint aliases immediately.

## 3) Personas and workflows

Personas
1. Autonomous agent runtime (headless, non-interactive).
2. Human operator (terminal-first incident response).
3. Platform maintainer (release and contract governance).

Critical workflows
- Poll task queue and claim work.
- Manage agents (register/update/diagnose/wake).
- Manage sessions (list/control/continue/transcript).
- Observe events in real time.
- Track token usage and attribution.
- Manage skills, cron jobs, and direct CLI connections.

## 4) Functional requirements

### A. API contract governance
- FR-A1: A parity checker must compare discovered route handlers and OpenAPI paths/methods.
- FR-A2: CI fails on non-ignored mismatches.
- FR-A3: Ignore list must be explicit and reviewable.
- FR-A4: /api/index should be validated or generated from same contract source.

### B. CLI v1 requirements
- FR-B1: Profile-based configuration (URL + auth mode + key/cookie).
- FR-B2: Commands must support --json output and strict exit codes.
- FR-B3: Support key domains:
  - auth
  - agents
  - tasks
  - sessions
  - connect
  - tokens
  - skills
  - cron
  - events watch
  - raw request fallback
- FR-B4: Non-interactive defaults suitable for autonomous agents.
- FR-B5: Request timeout + retry controls for reliable automation.

### C. TUI v1 requirements (optional but included)
- FR-C1: Dashboard with agents/tasks/sessions summary panels.
- FR-C2: Keyboard-driven refresh/navigation.
- FR-C3: Trigger key operations (wake agent, queue poll, session controls).
- FR-C4: Clear degraded mode messaging if endpoints unavailable.

### D. Platform hardening requirements
- FR-D1: Document and enforce least-privilege auth guidance for agent keys.
- FR-D2: Expose explicit warning/controls for global admin API key usage.
- FR-D3: Add durable spawn history persistence (DB-backed) replacing log scraping fallback.
- FR-D4: Add scalable rate-limit strategy plan (in-memory now, pluggable backend next).

## 5) CLI command map (v1)

mc auth
- login --username --password
- logout
- whoami

mc agents
- list
- get --id
- create --name --role
- update --id ...fields
- delete --id
- wake --id
- diagnostics --id
- heartbeat --id
- memory get|set --id
- soul get|set --id

mc tasks
- list [filters]
- get --id
- create --title [--description --priority --assigned-to]
- update --id ...fields
- delete --id
- queue --agent [--max-capacity]
- comments list/add --id
- broadcast --id

mc sessions
- list
- control --id --action monitor|pause|terminate
- continue --kind claude-code|codex-cli --id --prompt
- transcript --id [--source]

mc connect
- register --tool-name --agent-name [...]
- list
- disconnect --connection-id

mc tokens
- list
- stats
- by-agent [--days]
- export --format json|csv

mc skills
- list
- content --source --name
- upsert --source --name --file
- delete --source --name
- check --source --name

mc cron
- list
- create/update/pause/resume/remove/run

mc events
- watch [--types]

mc raw
- raw --method GET --path /api/... [--body '{}']

## 6) UX and interface requirements

- Default output must be concise human-readable; --json returns machine-stable payload.
- All non-2xx responses include normalized error object and non-zero exit.
- Exit code taxonomy:
  - 0 success
  - 2 usage error
  - 3 auth error
  - 4 permission error
  - 5 network/timeout
  - 6 server error
- Pagination/filter flags normalized across list commands.

## 7) Security requirements

- Do not log raw API keys or cookies.
- Redact sensitive headers in verbose/debug output.
- Provide per-profile auth scope awareness (viewer/operator/admin implied risk labeling).
- Strong guidance: prefer agent-scoped keys over global admin key.

## 8) Reliability requirements

- Configurable timeout/retry/backoff.
- Safe JSON parsing and clear error surfaces.
- SSE reconnection strategy for watch mode.
- Graceful handling for partial endpoint availability.

## 9) Testing strategy

Unit
- CLI arg parsing and request mapping.
- Output modes and exit codes.
- API parity checker route extraction and mismatch detection.

Integration
- CLI against local Mission Control test server.
- Auth modes (API key, login session where enabled).
- Session control, queue polling, skills CRUD.

E2E
- Playwright/terminal-driven smoke for critical command paths.
- TUI render and keyboard navigation smoke tests.

Contract tests
- OpenAPI parity check in CI.
- Optional index parity check in CI.

## 10) Rollout plan

Phase 0: Contract stabilization
- Add parity checker and fail CI on drift.
- Resolve existing mismatches.

Phase 1: CLI core
- Ship profile/auth client + core command groups (auth/agents/tasks/sessions/connect).

Phase 2: CLI expansion
- tokens/skills/cron/events/raw + transcript ergonomics.

Phase 3: TUI
- Live dashboard + action shortcuts.

Phase 4: Hardening
- durable spawn history
- auth warnings and safeguards
- scalable rate-limit backend abstraction

## 11) Risks and mitigations

Risk: Large API surface causes long-tail parity gaps.
Mitigation: enforce parity checker + allowlist for temporary exceptions.

Risk: Auth complexity across cookie/key/proxy modes.
Mitigation: profile abstraction + explicit mode selection and diagnostics.

Risk: CLI churn if endpoint contracts continue changing.
Mitigation: typed response normalizers + compatibility layer + semver release notes.

## 12) Acceptance criteria

- PRD approved by maintainers.
- CLI provides end-to-end control for core workflows.
- Contract parity CI gate active and green.
- TUI displays operational state and triggers key actions.
- Security and reliability hardening changes documented and tested.

## 13) Immediate implementation tasks (next 1-2 PRs)

PR 1
1. Add API parity checker script and CI command.
2. Add first-party CLI scaffold with command routing and normalized request layer.
3. Add docs for CLI profiles/auth/output contract.

PR 2
1. Implement full command matrix.
2. Add TUI dashboard shell.
3. Add CLI integration tests.
4. Introduce durable spawn history model and endpoint alignment.
