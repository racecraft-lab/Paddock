# Agent Setup Guide

This guide covers everything you need to configure agents in Mission Control: registration methods, SOUL personalities, working files, configuration, and liveness monitoring.

## Agent Registration

There are three ways to register agents with Mission Control.

### Method 1: API Self-Registration (Recommended for Autonomous Agents)

Agents register themselves at startup. This is the simplest path and requires no manual setup:

```bash
curl -X POST http://localhost:3000/api/agents/register \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "scout",
    "role": "researcher",
    "capabilities": ["web-search", "summarization"],
    "framework": "claude-sdk"
  }'
```

**Name rules**: 1-63 characters, alphanumeric plus `.`, `-`, `_`. Must start with a letter or digit.

**Valid roles**: `coder`, `reviewer`, `tester`, `devops`, `researcher`, `assistant`, `agent`

The endpoint is idempotent — registering the same name again updates the agent's status to `idle` and refreshes `last_seen`. Rate-limited to 5 registrations per minute per IP.

### Method 2: Manual Creation (UI or API)

Create agents through the dashboard UI or the API:

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "aegis",
    "role": "reviewer",
    "status": "offline",
    "soul_content": "You are Aegis, the quality reviewer...",
    "config": {
      "dispatchModel": "9router/cc/claude-opus-4-6",
      "openclawId": "aegis"
    }
  }'
```

This requires `operator` role and supports additional fields like `soul_content`, `config`, and `template`.

### Method 3: Config Sync (OpenClaw or Local Discovery)

Mission Control can auto-discover agents from:

**OpenClaw config sync** — Reads agents from your `openclaw.json` file:

```bash
curl -X POST http://localhost:3000/api/agents/sync \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source": "config"}'
```

Set `OPENCLAW_CONFIG_PATH` to point to your `openclaw.json`.

**Local agent discovery** — Scans standard directories for agent definitions:

```bash
curl -X POST http://localhost:3000/api/agents/sync \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source": "local"}'
```

Scanned directories:
- `~/.agents/` — Top-level agent directories or `.md` files
- `~/.codex/agents/` — Codex agent definitions
- `~/.claude/agents/` — Claude Code agent definitions
- `~/.hermes/skills/` — Hermes skill definitions

Agent directories are detected by the presence of marker files: `soul.md`, `AGENT.md`, `identity.md`, `config.json`, or `agent.json`.

**Flat markdown files** (Claude Code format) are also supported:

```markdown
---
name: my-agent
description: A research assistant
model: claude-opus-4
tools: ["read", "write", "web-search"]
---
You are a research assistant specializing in competitive analysis...
```

## SOUL.md — Agent Personality

SOUL is the personality and capability definition for an agent. It's a markdown file that gets injected into dispatch prompts, shaping how the agent approaches tasks.

### What Goes in a SOUL

A SOUL defines:
- **Identity** — Who the agent is, its name, role
- **Expertise** — What domains it specializes in
- **Behavior** — How it approaches problems, communication style
- **Constraints** — What it should avoid, limitations

### Example: Developer Agent

```markdown
# Scout — Developer

You are Scout, a senior developer agent specializing in full-stack TypeScript development.

## Expertise
- Next.js, React, Node.js
- Database design (PostgreSQL, SQLite)
- API architecture and testing

## Approach
- Read existing code before proposing changes
- Write tests alongside implementation
- Keep changes minimal and focused

## Constraints
- Never commit secrets or credentials
- Ask for clarification on ambiguous requirements
- Flag security concerns immediately
```

### Example: Researcher Agent

```markdown
# Iris — Researcher

You are Iris, a research agent focused on gathering and synthesizing information.

## Expertise
- Web research and source verification
- Competitive analysis
- Data synthesis and report writing

## Approach
- Always cite sources with URLs
- Present findings in structured format
- Distinguish facts from inferences

## Output Format
- Use bullet points for key findings
- Include a "Sources" section at the end
- Highlight actionable insights
```

### Example: Reviewer Agent

```markdown
# Aegis — Quality Reviewer

You are Aegis, the quality gate for all agent work in Mission Control.

## Role
Review completed tasks for correctness, completeness, and quality.

## Review Criteria
- Does the output address all parts of the task?
- Are there factual errors or hallucinations?
- Is the work actionable and well-structured?

## Verdict Format
Respond with EXACTLY one of:

VERDICT: APPROVED
NOTES: <brief summary>

VERDICT: REJECTED
NOTES: <specific issues to fix>
```

### Managing SOUL Content

**Read** an agent's SOUL:

```bash
curl -s http://localhost:3000/api/agents/1/soul \
  -H "Authorization: Bearer $MC_API_KEY" | jq
```

Response:

```json
{
  "soul_content": "# Scout — Developer\n...",
  "source": "workspace",
  "available_templates": ["developer", "researcher", "reviewer"],
  "updated_at": 1711234567
}
```

The `source` field tells you where the SOUL was loaded from:
- `workspace` — Read from the agent's workspace `soul.md` file on disk
- `database` — Read from the MC database (no workspace file found)
- `none` — No SOUL content set

**Update** a SOUL:

```bash
curl -X PUT http://localhost:3000/api/agents/1/soul \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"soul_content": "# Scout — Developer\n\nYou are Scout..."}'
```

**Apply a template**:

```bash
curl -X PUT http://localhost:3000/api/agents/1/soul \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"template_name": "developer"}'
```

Templates support substitution variables: `{{AGENT_NAME}}`, `{{AGENT_ROLE}}`, `{{TIMESTAMP}}`.

SOUL content syncs bidirectionally — edits in the UI write back to the workspace `soul.md` file, and changes on disk are picked up on the next sync.

## WORKING.md — Runtime Scratchpad

`WORKING.md` is an agent's runtime state file. It tracks:
- Current task context
- Intermediate results
- Session notes from the agent's perspective

**Do not hand-edit WORKING.md** — it's written and managed by the agent during task execution. If you need to give an agent persistent instructions, use SOUL.md instead.

## Agent Configuration

Each agent has a JSON `config` object stored in the database. Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `openclawId` | string | Gateway agent identifier (falls back to agent name) |
| `dispatchModel` | string | Model override for auto-dispatch (e.g., `9router/cc/claude-opus-4-6`) |
| `capabilities` | string[] | List of agent capabilities |
| `framework` | string | Framework that created the agent (e.g., `claude-sdk`, `crewai`) |

Example config:

```json
{
  "openclawId": "scout",
  "dispatchModel": "9router/cc/claude-sonnet-4-6",
  "capabilities": ["code-review", "testing", "documentation"],
  "framework": "claude-sdk"
}
```

Update via API:

```bash
curl -X PUT http://localhost:3000/api/agents \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1,
    "config": {
      "dispatchModel": "9router/cc/claude-opus-4-6"
    }
  }'
```

## Heartbeat and Liveness

Mission Control tracks agent health through heartbeats.

### How It Works

1. Agent sends `POST /api/agents/{id}/heartbeat` every 30 seconds
2. MC updates `status` to `idle` and refreshes `last_seen`
3. If no heartbeat for 10 minutes (configurable), agent is marked `offline`
4. Stale tasks (in_progress for 10+ min with offline agent) are requeued

### Heartbeat Request

```bash
curl -X POST http://localhost:3000/api/agents/1/heartbeat \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "token_usage": {
      "model": "claude-sonnet-4-6",
      "inputTokens": 1500,
      "outputTokens": 300
    }
  }'
```

The heartbeat response includes pending work items (assigned tasks, mentions, notifications), so agents can use it as both a keepalive and a lightweight work check.

### Agent Status Values

| Status | Meaning |
|--------|---------|
| `offline` | No recent heartbeat, agent is unreachable |
| `idle` | Online and ready for work |
| `busy` | Currently executing a task |
| `sleeping` | Paused by user (wake with `POST /api/agents/{id}/wake`) |
| `error` | Agent reported an error state |

## Agent Sources

The `source` field on each agent indicates how it was registered:

| Source | Origin |
|--------|--------|
| `manual` | Created through UI or direct API call |
| `self` | Agent self-registered via `/api/agents/register` |
| `local` | Discovered from `~/.agents/`, `~/.claude/agents/`, etc. |
| `config` | Synced from `openclaw.json` |
| `gateway` | Registered by a gateway connection |

## Agent Templates

When creating agents via API, you can specify a `template` name to pre-populate the config:

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Authorization: Bearer $MC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "scout", "role": "coder", "template": "developer"}'
```

Templates define model tier, tool permissions, and default configuration. Available templates include:
- `developer` — Full coding toolset (read, write, edit, exec, bash)
- `researcher` — Read-only tools plus web and memory access
- `reviewer` — Read-only tools for code review and quality checks

## What's Next

- **[Quickstart](quickstart.md)** — 5-minute first agent tutorial
- **[Orchestration Patterns](orchestration.md)** — Multi-agent workflows, auto-dispatch, quality review
- **[CLI Reference](cli-agent-control.md)** — Full CLI command reference
