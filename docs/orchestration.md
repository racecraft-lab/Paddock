# Orchestration Patterns

This guide covers the task orchestration patterns available in Paddock, from simple manual assignment to fully automated multi-agent workflows.

Workspace scope for API examples depends on deployment mode. On legacy
single-workspace installs, omit explicit workspace scope. On factory/multi-workspace
deployments where `FEATURE_WORKSPACE_SWITCHER` is enabled, scope requests with
either `workspace_id=<id>` (Product Line) or `workspace_scope=facility` (Facility),
and never send both.

## Task Lifecycle

The core manual queue and review path follows this status flow:

```
inbox ──► assigned ──► in_progress ──► review ──► done
  │          │             │              │
  │          │             │              └──► in_progress (rejected verdict retry)
  │          │             │
  │          │             └──► failed (max retries or timeout)
  │          │
  │          └──► failed
  │
  └──► assigned (triaged by human or auto-dispatch)
```

Key transitions:
- **inbox → assigned**: Human triages or auto-dispatch picks it up
- **assigned → in_progress**: Agent claims via queue poll or auto-dispatch sends it
- **in_progress → review**: Agent completes work, awaits quality check
- **review → done**: Aegis approves the work
- **review → in_progress**: Aegis rejects, task is returned with feedback

Other task states are used by specialized flows: `backlog` for pre-triage work,
`awaiting_owner` and `ready_for_owner` for owner-gated work, `quality_review`
for explicit review stages, and `failed` for terminal failure.

Feature-flagged task chains add work after a task reaches terminal success. When `FEATURE_TASK_PIPELINES` is off, or when a completed task is not bound to a workflow template with advancement-driving chain metadata, the lifecycle above is unchanged. When it is on, a non-`done` to `done` transition can validate structured output, choose a successor template, and create exactly one follow-up task.

## Pattern 1: Manual Assignment

The simplest pattern. A human creates a task and assigns it to a specific agent.

```bash
# Create and assign in one step
curl -X POST "$MC_URL/api/tasks" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix login page CSS",
    "description": "The login button overlaps the form on mobile viewports.",
    "priority": "high",
    "assigned_to": "scout"
  }'
```

The agent picks it up on the next queue poll:

```bash
curl "$MC_URL/api/tasks/queue?agent=scout" \
  -H "Authorization: Bearer $MC_API_KEY"
```

**When to use**: Small teams, well-known agent capabilities, human-driven task triage.

## Pattern 2: Queue-Based Dispatch

Agents poll the queue and Paddock assigns the highest-priority available task. No human triage needed.

### Setup

1. Create tasks in `inbox` status (no `assigned_to`):

```bash
curl -X POST "$MC_URL/api/tasks" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Update API documentation",
    "priority": "medium"
  }'
```

2. Agents poll the queue. Paddock atomically claims the best task:

```bash
# Agent "scout" asks for work
curl "$MC_URL/api/tasks/queue?agent=scout" \
  -H "Authorization: Bearer $MC_API_KEY"

# Agent "iris" also asks — gets a different task (no race condition)
curl "$MC_URL/api/tasks/queue?agent=iris" \
  -H "Authorization: Bearer $MC_API_KEY"
```

### Priority Ordering

Tasks are assigned in this order:
1. **Priority**: critical > high > medium > low
2. **Due date**: Earliest due date first (null = last)
3. **Created at**: Oldest first (FIFO within same priority)

### Capacity Control

Each agent can set `max_capacity` to limit concurrent tasks:

```bash
# Agent can handle 3 tasks at once
curl "$MC_URL/api/tasks/queue?agent=scout&max_capacity=3" \
  -H "Authorization: Bearer $MC_API_KEY"
```

If the agent already has `max_capacity` tasks in `in_progress`, the response returns `"reason": "at_capacity"` with no task.

**When to use**: Multiple agents with overlapping capabilities, want automatic load balancing.

## Pattern 3: Auto-Dispatch (Gateway Required)

The scheduler automatically dispatches `assigned` tasks to agents through the OpenClaw gateway. This is the fully hands-off mode.

### How It Works

1. Tasks are created with `assigned_to` set
2. The scheduler's `dispatchAssignedTasks` job runs periodically
3. For each task, Paddock:
   - Marks it `in_progress`
   - Resolves the target gateway agent and optional dispatch-model override
   - Sends the task prompt to the agent via the gateway
   - Parses the response and stores the resolution
   - Moves the task to `review` status

### Model Routing

By default, Paddock does not inject a model override into gateway dispatch.
The OpenClaw agent uses its own configured default model. Paddock only sends a
model field when the assigned agent config includes `dispatchModel`.

Set an override per agent with `config.dispatchModel`:

```bash
curl -X PUT "$MC_URL/api/agents" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id": 1, "config": {"dispatchModel": "9router/cc/claude-opus-4-6"}}'
```

### Retry Handling

- Failed dispatches increment `dispatch_attempts` and revert to `assigned`
- After 5 failed attempts, task moves to `failed`
- Each failure is logged as a comment on the task

**When to use**: Fully autonomous operation with an OpenClaw gateway. Best for production agent fleets.

## Pattern 4: Quality Review (Aegis)

Aegis is Paddock's built-in quality gate. When a task reaches `review` status, the scheduler sends it to the Aegis reviewer agent for sign-off.

### Flow

```
in_progress ──► review ──► Aegis reviews ──► APPROVED ──► done
                                          └─► REJECTED ──► in_progress (with feedback)
```

### How Aegis Reviews

1. Scheduler's `runAegisReviews` job picks up tasks in `review` status
2. Builds a review prompt with the task description and agent's resolution
3. Sends to the workspace's configured Aegis agent record, falling back to
   direct Claude review only when the gateway is unavailable and an Anthropic
   API key is configured
4. Parses the verdict:
   - `VERDICT: APPROVED` → task moves to `done`
   - `VERDICT: REJECTED` → feedback is attached as a comment, task returns to `in_progress`
5. Rejected tasks continue with the feedback stored on the task for the next work pass

### Retry Limits

- Up to 3 Aegis review cycles per task
- After 3 rejections, task moves to `failed` with accumulated feedback
- All review results are stored in the `quality_reviews` table

### Setting Up Aegis

Aegis is just a regular agent with a reviewer SOUL. Create it:

```bash
# Register the Aegis agent
curl -X POST "$MC_URL/api/agents/register" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "aegis", "role": "reviewer"}'

# Set its SOUL
curl -X PUT "$MC_URL/api/agents/1/soul" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"template_name": "reviewer"}'
```

**When to use**: When you want automated quality checks before tasks are marked complete.

## Pattern 5: Recurring Tasks (Cron)

Schedule tasks to be created automatically on a recurring basis using natural language or cron expressions.

### CLI

```bash
pnpm mc cron create --body '{
  "action": "add",
  "name": "daily-standup-report",
  "schedule": "0 9 * * 1-5",
  "command": "Summarize all completed tasks from the past 24 hours.",
  "model": "gpt-5.5"
}'
```

### API

```bash
curl -X POST "$MC_URL/api/cron" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "add",
    "name": "weekly-security-scan",
    "schedule": "0 2 * * 0",
    "command": "Run the weekly security audit.",
    "model": "gpt-5.5"
  }'
```

The scheduler stores an OpenClaw cron job whose payload sends the configured command on each trigger. Manage cron jobs with `toggle`, `trigger`, `clone`, and `remove` actions.

**When to use**: Reports, health checks, periodic audits, maintenance tasks.

## Pattern 6: Declarative Task Chains

Declarative task chains let operators model a multi-step handoff in workflow templates instead of asking agents to create follow-up tasks manually.

### Workflow Template Fields

Use the Workflows tab or `/api/workflows` to configure chain fields:

- `slug`: Stable template identifier used by routing and successor metadata.
- `output_schema`: JSON Schema profile for the parent task's structured `resolution`.
- `routing_rules`: Ordered rules that inspect validated output and select a `next_template_slug`.
- `next_template_slug`: Static fallback successor template when no routing rule matches.
- `agent_role`: Role used to resolve the successor assignee from the parent project assignments.

Routing rules require an `output_schema`. Static `next_template_slug` chains are allowed without an output schema.

### Advancement Behavior

On every live transition from a non-`done` status to `done`, Paddock checks the feature flag, parent task, and workflow template:

1. Unbound tasks and templates with no advancement-driving metadata keep legacy completion behavior.
2. If `output_schema` is present, `resolution` is validated before routing.
3. Ordered `routing_rules` run first; `next_template_slug` is used as fallback.
4. If neither a route nor a static next template resolves, the chain terminates normally with no successor.
5. If a successor resolves, Paddock creates one assigned child task with parent/root/chain lineage.

Missing or invalid structured output marks the parent `failed` and creates no successor. Routing expression rejection, routing budget overrun, missing or duplicate target templates, cross-workspace targets, and missing successor assignees preserve the parent as terminal success, write an operator-visible activity, and create no successor.

### Retry Recovery

Ordinary task edits do not replay a chain. Operators recover eligible chain failures through:

```bash
curl -X POST "$MC_URL/api/tasks/$TASK_ID" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "retry_chain_advancement"}'
```

Retry uses only the latest eligible failure or stall activity for the parent task. It checks template provenance hashes, fails closed if provenance is missing, and requires explicit drift confirmation before retrying across template changes. Successful retry responses include a bounded `chain_retry` summary and do not expose full corrected output, parsed output, or routing traces.

Current limitations:

- The parent task's `resolution` field is the temporary structured-output bridge for SPEC-004.
- SPEC-004 records lineage and one-successor guarantees only; it does not implement downstream ready-for-owner states, artifact handoff, governance approval, pilot seeding, area routing, or CrabTrap behavior.
- The reserved `task_pipeline_target_disabled` stall code is emitted only if the live workflow-template schema exposes an explicit enabled/disabled target state.

**When to use**: Repeatable handoffs where the next agent depends on the previous task's structured output.

## Pattern 7: Multi-Agent Handoff

Agent A completes a task, then creates a follow-up task assigned to Agent B. This chains agents into a pipeline.

### Example: Research → Implement → Review

```bash
# Step 1: Research task for iris
curl -X POST "$MC_URL/api/tasks" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Research caching strategies for API layer",
    "priority": "high",
    "assigned_to": "iris"
  }'
```

When iris completes the research, create the implementation task:

```bash
# Step 2: Implementation task for scout (after iris finishes)
curl -X POST "$MC_URL/api/tasks" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement Redis caching for /api/products",
    "description": "Based on research in TASK-1: Use cache-aside pattern with 5min TTL...",
    "priority": "high",
    "assigned_to": "scout"
  }'
```

After scout finishes, Aegis reviews automatically (if auto-dispatch is active), or you create a review task:

```bash
# Step 3: Review task for aegis
curl -X POST "$MC_URL/api/tasks" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Review caching implementation in TASK-2",
    "priority": "high",
    "assigned_to": "aegis"
  }'
```

**When to use**: Ad hoc workflows where different agents have different specializations and the follow-up task should stay human- or agent-authored instead of template-driven.

## Pattern 8: Stale Task Recovery

Paddock automatically recovers from stuck agents. The `requeueStaleTasks` scheduler job:

1. Finds tasks stuck in `in_progress` for 10+ minutes with an offline agent
2. Reverts them to `assigned` with a comment explaining the stall
3. After 5 stale requeues, moves the task to `failed`

This happens automatically — no configuration needed.

## Combining Patterns

In practice, you'll combine these patterns. A typical production setup:

1. **Cron** creates recurring tasks (Pattern 5)
2. **Queue-based dispatch** distributes tasks to available agents (Pattern 2)
3. **Model routing** picks the right model per task (Pattern 3)
4. **Aegis** reviews all completed work (Pattern 4)
5. **Declarative task chains** create template-owned successor work after approved completions (Pattern 6)
6. **Stale recovery** handles agent failures (Pattern 8)

```
 Cron ──► inbox ──► Queue assigns ──► Agent works ──► Aegis reviews ──► done ──► chain successor
                                          │                  │
                                          └── timeout ───────┘── requeue
```

## Event Streaming

Monitor orchestration in real time with SSE:

```bash
# Watch all task and agent events
pnpm mc events watch --types task,agent --json
```

Or via API:

```bash
curl -N "$MC_URL/api/events" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Accept: text/event-stream"
```

Events include: `task.created`, `task.updated`, `task.completed`, `agent.created`, `agent.status_changed`, and more.

## SPEC-008 Resource Governance Integration

When `FEATURE_RESOURCE_GOVERNANCE` is ON for a workspace, task-stage claim
reconciliation calls `resourcePolicyEvaluator(decisionInput)`
(`src/lib/resource-evaluator.ts`) before a dispatch claim is acquired. The
evaluator returns `{decision, reasons, policy_ids, evaluated_at_ms}` where
`decision` is `allow`, `defer`, or `block`, and `reasons` contains namespaced
codes from `src/types/resource-governance.ts`.

Gate sites:

- **Scheduler / dispatcher** (`src/lib/task-dispatch.ts` +
  `src/lib/task-claim-reconciliation.ts`): claim reconciliation admits,
  defers, or blocks the task based on the evaluator decision before the
  dispatcher starts work.
- **REST + SSE** (`src/app/api/governance/**`): operators inspect
  decisions, manage policies/budgets/windows/overrides, and resolve
  one-click recovery gestures.
- **Cost Tracker UI** (`src/components/governance/**`): adds the
  Governance tab when the flag is ON; the tab is hidden in byte-compat
  mode when OFF (per FR-305).

When the resource-governance flag is OFF, the evaluator returns
`allow:feature_flag_off` without consulting policies, preserving the legacy
admission path byte-compat (FR-305 / FR-238).

For runbook references see:

- `docs/feature-flags-runbook.md` — flag policy + matrix tests.
- `docs/runbook/breaker-stuck-open.md` — circuit breaker recovery.
- `docs/runbook/aegis-emergency-reserve-depletion.md` — Aegis reserve.
- `docs/operator-guides/visual-baseline-approval.md` — visual review.

## Reference

- **[Quickstart](quickstart.md)** — 5-minute first agent tutorial
- **[Agent Setup](agent-setup.md)** — Registration, SOUL, configuration
- **[CLI Reference](cli-agent-control.md)** — Full CLI command list
- **[CLI Integration](cli-integration.md)** — Direct connections without a gateway
