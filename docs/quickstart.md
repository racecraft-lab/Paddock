# Quickstart: Your First Agent in 5 Minutes

Get from zero to a working agent loop with nothing but Mission Control and `curl`. No gateway, no OpenClaw, no extra dependencies.

## Prerequisites

- Mission Control running (`pnpm dev` or Docker)
- An admin account (visit `/setup` on first run)
- Your API key (auto-generated on first run, shown in Settings)

## Step 1: Start Mission Control

```bash
pnpm dev
```

Open http://localhost:3000 and log in. If this is your first run, visit http://localhost:3000/setup to create your admin account.

Your API key is displayed in **Settings > API Key**. Export it for the commands below:

```bash
export MC_URL=http://localhost:3000
export MC_API_KEY=your-api-key
```

## Step 2: Register an Agent

Agents can self-register via the API. This is how autonomous agents announce themselves to Mission Control:

```bash
curl -s -X POST "$MC_URL/api/agents/register" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "scout", "role": "researcher"}' | jq
```

Expected response:

```json
{
  "agent": {
    "id": 1,
    "name": "scout",
    "role": "researcher",
    "status": "idle",
    "created_at": 1711234567
  },
  "registered": true,
  "message": "Agent registered successfully"
}
```

Note the `id` — you'll need it for heartbeats. The registration is idempotent: calling it again with the same name just updates the agent's status to `idle`.

**Valid roles**: `coder`, `reviewer`, `tester`, `devops`, `researcher`, `assistant`, `agent`

## Step 3: Create a Task

```bash
curl -s -X POST "$MC_URL/api/tasks" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Research competitor pricing",
    "description": "Find pricing pages for the top 3 competitors and summarize their tiers.",
    "priority": "medium",
    "assigned_to": "scout"
  }' | jq
```

Expected response:

```json
{
  "task": {
    "id": 1,
    "title": "Research competitor pricing",
    "status": "assigned",
    "priority": "medium",
    "assigned_to": "scout",
    "tags": [],
    "metadata": {}
  }
}
```

The task starts in `assigned` status because you specified `assigned_to`. If you omit it, the task goes to `inbox` for manual triage.

## Step 4: Poll the Task Queue

This is how your agent picks up work. The queue endpoint atomically claims the highest-priority available task:

```bash
curl -s "$MC_URL/api/tasks/queue?agent=scout" \
  -H "Authorization: Bearer $MC_API_KEY" | jq
```

Expected response:

```json
{
  "task": {
    "id": 1,
    "title": "Research competitor pricing",
    "status": "in_progress",
    "assigned_to": "scout"
  },
  "reason": "assigned",
  "agent": "scout",
  "timestamp": 1711234600
}
```

The task status automatically moved from `assigned` to `in_progress`. The `reason` field tells you why this task was returned:

| Reason | Meaning |
|--------|---------|
| `assigned` | Claimed a new task from the queue |
| `continue_current` | Agent already has a task in progress |
| `at_capacity` | Agent is at max concurrent tasks |
| `no_tasks_available` | Nothing in the queue for this agent |

## Step 5: Complete the Task

When your agent finishes work, update the task status and add a resolution:

```bash
curl -s -X PUT "$MC_URL/api/tasks/1" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "done",
    "resolution": "Found pricing for Acme ($29/49/99), Widget Corp ($19/39/79), and Gadget Inc ($25/50/100). All use 3-tier SaaS model. Summary doc attached."
  }' | jq
```

## Step 6: Send a Heartbeat

Heartbeats tell Mission Control your agent is alive. Without them, agents are marked offline after 10 minutes:

```bash
curl -s -X POST "$MC_URL/api/agents/1/heartbeat" \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

Expected response:

```json
{
  "success": true,
  "token_recorded": false,
  "work_items": [],
  "timestamp": 1711234700
}
```

In a real agent, you'd send heartbeats every 30 seconds in a background loop. The `work_items` array returns any pending tasks, mentions, or notifications.

## The Agent Loop

Here's the complete pattern your agent should follow:

```
┌─────────────────────────────────┐
│  1. Register with MC            │
│     POST /api/agents/register   │
└──────────────┬──────────────────┘
               │
               v
┌─────────────────────────────────┐
│  2. Poll for work               │◄──────┐
│     GET /api/tasks/queue        │       │
└──────────────┬──────────────────┘       │
               │                          │
               v                          │
┌─────────────────────────────────┐       │
│  3. Do the work                 │       │
│     (your agent logic here)     │       │
└──────────────┬──────────────────┘       │
               │                          │
               v                          │
┌─────────────────────────────────┐       │
│  4. Report result               │       │
│     PUT /api/tasks/{id}         │       │
└──────────────┬──────────────────┘       │
               │                          │
               v                          │
┌─────────────────────────────────┐       │
│  5. Heartbeat + repeat          │───────┘
│     POST /api/agents/{id}/hb    │
└─────────────────────────────────┘
```

## Using the CLI Instead

If you prefer the CLI over `curl`, the same flow works with `pnpm mc`:

```bash
# List agents
node scripts/mc-cli.cjs agents list --json

# Create an agent
node scripts/mc-cli.cjs agents create --name scout --role researcher --json

# Create a task
node scripts/mc-cli.cjs tasks create --title "Research competitors" --body '{"assigned_to":"scout","priority":"medium"}' --json

# Poll the queue
node scripts/mc-cli.cjs tasks queue --agent scout --json

# Watch events in real time
node scripts/mc-cli.cjs events watch --types task,agent
```

See [CLI Reference](cli-agent-control.md) for the full command list.

## Using the MCP Server (for Claude Code agents)

For agents built with Claude Code, the MCP server is the recommended integration:

```bash
claude mcp add mission-control -- node /path/to/mission-control/scripts/mc-mcp-server.cjs
```

Set `MC_URL` and `MC_API_KEY` in your environment. The MCP server exposes 35+ tools for agents, tasks, sessions, memory, and more. See [CLI Integration](cli-integration.md) for details.

## What's Next?

- **[Agent Setup Guide](agent-setup.md)** — Configure SOUL personalities, agent sources, and heartbeat settings
- **[Orchestration Patterns](orchestration.md)** — Multi-agent workflows, auto-dispatch, quality review gates
- **[CLI Reference](cli-agent-control.md)** — Full CLI command reference
- **[CLI Integration](cli-integration.md)** — Direct CLI and gateway-free connections
- **[Deployment Guide](deployment.md)** — Production deployment options
