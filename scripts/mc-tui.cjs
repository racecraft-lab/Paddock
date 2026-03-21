#!/usr/bin/env node
/*
 Mission Control TUI (v2)
 - Zero dependencies (ANSI escape codes)
 - Arrow key navigation between agents/tasks
 - Enter to drill into agent detail with sessions
 - Esc to go back, q to quit
 - Auto-refresh dashboard

 Usage:
   node scripts/mc-tui.cjs [--url <base>] [--api-key <key>] [--profile <name>] [--refresh <ms>]
*/

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
    const key = t.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { flags[key] = true; continue; }
    flags[key] = next;
    i++;
  }
  return flags;
}

function loadProfile(name) {
  const p = path.join(os.homedir(), '.mission-control', 'profiles', `${name}.json`);
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      url: parsed.url || process.env.MC_URL || 'http://127.0.0.1:3000',
      apiKey: parsed.apiKey || process.env.MC_API_KEY || '',
      cookie: parsed.cookie || process.env.MC_COOKIE || '',
    };
  } catch {
    return {
      url: process.env.MC_URL || 'http://127.0.0.1:3000',
      apiKey: process.env.MC_API_KEY || '',
      cookie: process.env.MC_COOKIE || '',
    };
  }
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

async function api(baseUrl, apiKey, cookie, method, route) {
  const headers = { Accept: 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  if (cookie) headers['Cookie'] = cookie;
  const url = `${baseUrl.replace(/\/+$/, '')}${route}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { method, headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { _error: `HTTP ${res.status}` };
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    return { _error: err?.name === 'AbortError' ? 'timeout' : (err?.message || 'network error') };
  }
}

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const ESC = '\x1b[';
const ansi = {
  clear: () => process.stdout.write(`${ESC}2J${ESC}H`),
  moveTo: (row, col) => process.stdout.write(`${ESC}${row};${col}H`),
  bold: (s) => `${ESC}1m${s}${ESC}0m`,
  dim: (s) => `${ESC}2m${s}${ESC}0m`,
  green: (s) => `${ESC}32m${s}${ESC}0m`,
  yellow: (s) => `${ESC}33m${s}${ESC}0m`,
  red: (s) => `${ESC}31m${s}${ESC}0m`,
  cyan: (s) => `${ESC}36m${s}${ESC}0m`,
  magenta: (s) => `${ESC}35m${s}${ESC}0m`,
  bgBlue: (s) => `${ESC}44m${ESC}97m${s}${ESC}0m`,
  bgCyan: (s) => `${ESC}46m${ESC}30m${s}${ESC}0m`,
  inverse: (s) => `${ESC}7m${s}${ESC}0m`,
  hideCursor: () => process.stdout.write(`${ESC}?25l`),
  showCursor: () => process.stdout.write(`${ESC}?25h`),
  clearLine: () => process.stdout.write(`${ESC}2K`),
  enterAltScreen: () => process.stdout.write(`${ESC}?1049h`),
  exitAltScreen: () => process.stdout.write(`${ESC}?1049l`),
};

function getTermSize() {
  return { cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 };
}

function truncate(s, maxLen) {
  if (!s) return '';
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '\u2026' : s;
}

function pad(s, len) {
  const str = String(s || '');
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'online' || s === 'active' || s === 'done' || s === 'healthy' || s === 'completed') return ansi.green(status);
  if (s === 'idle' || s === 'sleeping' || s === 'in_progress' || s === 'pending' || s === 'warning') return ansi.yellow(status);
  if (s === 'offline' || s === 'error' || s === 'failed' || s === 'critical' || s === 'unhealthy') return ansi.red(status);
  return status;
}

function timeSince(ts) {
  const now = Date.now();
  const then = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : new Date(ts).getTime();
  const diff = Math.max(0, now - then);
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatNumber(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// Strip ANSI codes for length calculation
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchDashboardData(baseUrl, apiKey, cookie) {
  const [health, agents, tasks, tokens] = await Promise.all([
    api(baseUrl, apiKey, cookie, 'GET', '/api/status?action=health'),
    api(baseUrl, apiKey, cookie, 'GET', '/api/agents'),
    api(baseUrl, apiKey, cookie, 'GET', '/api/tasks?limit=30'),
    api(baseUrl, apiKey, cookie, 'GET', '/api/tokens?action=stats&timeframe=day'),
  ]);
  return { health, agents, tasks, tokens };
}

async function fetchAgentSessions(baseUrl, apiKey, cookie, agentName) {
  const sessions = await api(baseUrl, apiKey, cookie, 'GET', '/api/sessions');
  if (sessions?._error) return sessions;
  const all = sessions?.sessions || [];
  // Match sessions by agent name (sessions use project path as agent key)
  const matched = all.filter(s => {
    const key = s.agent || s.key || '';
    const name = key.split('/').pop() || key;
    return name === agentName || key.includes(agentName);
  });
  return { sessions: matched.length > 0 ? matched : all.slice(0, 10) };
}

async function fetchTranscript(baseUrl, apiKey, cookie, sessionId, limit) {
  return api(baseUrl, apiKey, cookie, 'GET',
    `/api/sessions/transcript?kind=claude-code&id=${encodeURIComponent(sessionId)}&limit=${limit}`);
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

// State
const state = {
  view: 'dashboard',  // 'dashboard' | 'agent-detail'
  panel: 'agents',    // 'agents' | 'tasks'
  cursorAgent: 0,
  cursorTask: 0,
  scrollOffset: 0,
  selectedAgent: null,
  agentSessions: null,
  agentTranscript: null,
  transcriptSessionIdx: 0,
  transcriptScroll: 0,
  data: { health: {}, agents: {}, tasks: {}, tokens: {} },
  actionMessage: '',
};

function getAgentsList() {
  const raw = state.data.agents?.agents || state.data.agents || [];
  if (!Array.isArray(raw)) return [];
  return [...raw].sort((a, b) => {
    const order = { online: 0, active: 0, idle: 1, sleeping: 2, offline: 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });
}

function getTasksList() {
  const raw = state.data.tasks?.tasks || state.data.tasks || [];
  return Array.isArray(raw) ? raw : [];
}

// --- Dashboard View ---

function renderDashboard() {
  const { cols, rows } = getTermSize();
  ansi.clear();

  // Header
  const title = ' MISSION CONTROL ';
  process.stdout.write(ansi.bgBlue(pad(title, cols)) + '\n');

  const healthData = state.data.health;
  let status;
  if (healthData?._error) {
    status = ansi.red('UNREACHABLE');
  } else {
    const checks = healthData?.checks || [];
    const essentialNames = new Set(['Database', 'Disk Space']);
    const essentialChecks = checks.filter(c => essentialNames.has(c.name));
    const essentialOk = essentialChecks.length > 0 && essentialChecks.every(c => c.status === 'healthy');
    const warnings = checks.filter(c => !essentialNames.has(c.name) && c.status !== 'healthy');
    const warningNames = warnings.map(c => c.name.toLowerCase()).join(', ');
    if (essentialOk && warnings.length === 0) status = ansi.green('healthy');
    else if (essentialOk) status = ansi.yellow('operational') + ansi.dim(` (${warningNames})`);
    else status = statusColor(healthData?.status || 'unknown');
  }
  process.stdout.write(` ${status}  ${ansi.dim(baseUrl)}  ${ansi.dim(new Date().toLocaleTimeString())}\n`);

  // Panel tabs
  const agentTab = state.panel === 'agents' ? ansi.bgCyan(' AGENTS ') : ansi.dim(' AGENTS ');
  const taskTab = state.panel === 'tasks' ? ansi.bgCyan(' TASKS ') : ansi.dim(' TASKS ');
  process.stdout.write(`\n ${agentTab}  ${taskTab}\n`);

  const headerRows = 5;
  const footerRows = 4;
  const panelRows = Math.max(4, rows - headerRows - footerRows);

  if (state.panel === 'agents') {
    renderAgentsList(cols, panelRows);
  } else {
    renderTasksList(cols, panelRows);
  }

  // Costs bar
  const tokensData = state.data.tokens;
  const summary = tokensData?.summary || {};
  const cost = summary.totalCost != null ? `$${summary.totalCost.toFixed(4)}` : '-';
  const tokens = summary.totalTokens != null ? formatNumber(summary.totalTokens) : '-';
  process.stdout.write(`\n ${ansi.dim('24h:')} ${ansi.bold(cost)}  ${ansi.dim('tokens:')} ${tokens}\n`);

  // Footer
  if (state.actionMessage) process.stdout.write(ansi.green(` ${state.actionMessage}\n`));
  const hint = state.panel === 'agents'
    ? ' \u2191\u2193 navigate  enter detail  tab switch  [r]efresh  [w]ake  [q]uit'
    : ' \u2191\u2193 navigate  tab switch  [r]efresh  [q]uit';
  process.stdout.write(ansi.dim(hint) + '\n');
}

function renderAgentsList(cols, maxRows) {
  const agents = getAgentsList();
  if (agents.length === 0) { process.stdout.write(ansi.dim('  (no agents)\n')); return; }

  const nameW = Math.min(22, Math.floor(cols * 0.25));
  const roleW = Math.min(16, Math.floor(cols * 0.15));
  const statusW = 12;
  process.stdout.write(ansi.dim(`  ${pad('Name', nameW)} ${pad('Role', roleW)} ${pad('Status', statusW)} Last Seen\n`));

  // Ensure cursor is visible
  if (state.cursorAgent >= agents.length) state.cursorAgent = agents.length - 1;
  if (state.cursorAgent < 0) state.cursorAgent = 0;

  const listRows = maxRows - 1; // minus header
  // Scroll window
  let start = 0;
  if (state.cursorAgent >= start + listRows) start = state.cursorAgent - listRows + 1;
  if (state.cursorAgent < start) start = state.cursorAgent;

  for (let i = start; i < Math.min(agents.length, start + listRows); i++) {
    const a = agents[i];
    const selected = i === state.cursorAgent;
    const name = pad(truncate(a.name, nameW), nameW);
    const role = pad(truncate(a.role, roleW), roleW);
    const st = statusColor(a.status || 'unknown');
    const stPad = pad(st, statusW + 9);
    const lastSeen = a.last_seen ? ansi.dim(timeSince(a.last_seen)) : ansi.dim('never');
    const line = `  ${name} ${role} ${stPad} ${lastSeen}`;
    process.stdout.write(selected ? ansi.inverse(stripAnsi(line).padEnd(cols)) + '\n' : line + '\n');
  }

  if (agents.length > listRows) {
    process.stdout.write(ansi.dim(`  ${agents.length} total, showing ${start + 1}-${Math.min(agents.length, start + listRows)}\n`));
  }
}

function renderTasksList(cols, maxRows) {
  const tasks = getTasksList();
  if (tasks.length === 0) { process.stdout.write(ansi.dim('  (no tasks)\n')); return; }

  const idW = 5;
  const titleW = Math.min(35, Math.floor(cols * 0.35));
  const statusW = 14;
  const assignW = 16;
  process.stdout.write(ansi.dim(`  ${pad('ID', idW)} ${pad('Title', titleW)} ${pad('Status', statusW)} ${pad('Assigned', assignW)}\n`));

  if (state.cursorTask >= tasks.length) state.cursorTask = tasks.length - 1;
  if (state.cursorTask < 0) state.cursorTask = 0;

  const listRows = maxRows - 1;
  let start = 0;
  if (state.cursorTask >= start + listRows) start = state.cursorTask - listRows + 1;
  if (state.cursorTask < start) start = state.cursorTask;

  for (let i = start; i < Math.min(tasks.length, start + listRows); i++) {
    const t = tasks[i];
    const selected = i === state.cursorTask;
    const id = pad(String(t.id || ''), idW);
    const title = pad(truncate(t.title, titleW), titleW);
    const st = statusColor(t.status || '');
    const stPad = pad(st, statusW + 9);
    const assigned = pad(truncate(t.assigned_to || '-', assignW), assignW);
    const line = `  ${id} ${title} ${stPad} ${assigned}`;
    process.stdout.write(selected ? ansi.inverse(stripAnsi(line).padEnd(cols)) + '\n' : line + '\n');
  }
}

// --- Agent Detail View ---

function renderAgentDetail() {
  const { cols, rows } = getTermSize();
  ansi.clear();

  const agent = state.selectedAgent;
  if (!agent) { state.view = 'dashboard'; renderDashboard(); return; }

  // Header
  process.stdout.write(ansi.bgBlue(pad(` ${agent.name} `, cols)) + '\n');
  process.stdout.write(` Role: ${ansi.cyan(agent.role || '-')}  Status: ${statusColor(agent.status || 'unknown')}  ${ansi.dim(agent.last_activity || '')}\n`);

  // Sessions
  process.stdout.write('\n' + ansi.bold(ansi.cyan(' SESSIONS')) + '\n');

  const sessions = state.agentSessions?.sessions || [];
  if (state.agentSessions?._error) {
    process.stdout.write(ansi.dim(`  (unavailable: ${state.agentSessions._error})\n`));
  } else if (sessions.length === 0) {
    process.stdout.write(ansi.dim('  (no sessions found)\n'));
  } else {
    for (let i = 0; i < Math.min(sessions.length, 5); i++) {
      const s = sessions[i];
      const selected = i === state.transcriptSessionIdx;
      const active = s.active ? ansi.green('*') : ' ';
      const age = s.startTime ? timeSince(s.startTime) : '';
      const cost = s.estimatedCost != null ? `$${s.estimatedCost.toFixed(2)}` : '';
      const model = s.model || '';
      const branch = (s.flags || [])[0] || '';
      const prompt = truncate(s.lastUserPrompt || '', Math.max(20, cols - 70));
      const line = `  ${active} ${pad(truncate(s.id || '', 12), 12)} ${pad(model, 18)} ${pad(age, 8)} ${pad(cost, 8)} ${ansi.dim(branch)}`;
      process.stdout.write(selected ? ansi.inverse(stripAnsi(line).padEnd(cols)) + '\n' : line + '\n');
    }
  }

  // Transcript
  process.stdout.write('\n' + ansi.bold(ansi.magenta(' CHAT')) + '\n');

  const transcript = state.agentTranscript?.messages || [];
  if (state.agentTranscript?._error) {
    process.stdout.write(ansi.dim(`  (unavailable: ${state.agentTranscript._error})\n`));
  } else if (transcript.length === 0) {
    process.stdout.write(ansi.dim('  (no messages — press enter on a session to load)\n'));
  } else {
    const chatRows = Math.max(4, rows - 16);
    const messages = [];
    for (const msg of transcript) {
      const role = msg.role || 'unknown';
      for (const part of (msg.parts || [])) {
        if (part.type === 'text' && part.text) {
          messages.push({ role, text: part.text });
        } else if (part.type === 'tool_use') {
          messages.push({ role, text: ansi.dim(`[tool: ${part.name || part.id || '?'}]`) });
        } else if (part.type === 'tool_result') {
          const preview = typeof part.content === 'string' ? truncate(part.content, 80) : '[result]';
          messages.push({ role, text: ansi.dim(`[result: ${preview}]`) });
        }
      }
    }

    // Scroll from bottom
    const visible = messages.slice(-(chatRows + state.transcriptScroll), messages.length - state.transcriptScroll || undefined);
    for (const m of visible.slice(-chatRows)) {
      const roleLabel = m.role === 'user' ? ansi.green('you') : m.role === 'assistant' ? ansi.cyan('ai ') : ansi.dim(pad(m.role, 3));
      const lines = m.text.split('\n');
      const firstLine = truncate(lines[0], cols - 8);
      process.stdout.write(`  ${roleLabel} ${firstLine}\n`);
      // Show continuation lines (up to 2 more)
      for (let j = 1; j < Math.min(lines.length, 3); j++) {
        process.stdout.write(`      ${truncate(lines[j], cols - 8)}\n`);
      }
    }
  }

  // Footer
  process.stdout.write('\n');
  if (state.actionMessage) process.stdout.write(ansi.green(` ${state.actionMessage}\n`));
  process.stdout.write(ansi.dim(' \u2191\u2193 sessions  enter load chat  pgup/pgdn scroll  esc back  [q]uit') + '\n');
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let baseUrl, apiKey, cookie, refreshMs;

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    console.log(`Mission Control TUI

Usage:
  node scripts/mc-tui.cjs [--url <base>] [--api-key <key>] [--profile <name>] [--refresh <ms>]

Keys (Dashboard):
  up/down     Navigate agents or tasks list
  enter       Open agent detail (sessions + chat)
  tab         Switch between agents and tasks panels
  r           Refresh now
  w           Wake first sleeping agent
  q/Esc       Quit

Keys (Agent Detail):
  up/down     Navigate sessions
  enter       Load chat transcript for selected session
  pgup/pgdn   Scroll chat
  esc         Back to dashboard
  q           Quit
`);
    process.exit(0);
  }

  const profile = loadProfile(String(flags.profile || 'default'));
  baseUrl = flags.url ? String(flags.url) : profile.url;
  apiKey = flags['api-key'] ? String(flags['api-key']) : profile.apiKey;
  cookie = profile.cookie;
  refreshMs = Number(flags.refresh || 5000);

  // Raw mode for keyboard input
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
  }

  ansi.enterAltScreen();
  ansi.hideCursor();

  let running = true;

  function cleanup() {
    running = false;
    ansi.showCursor();
    ansi.exitAltScreen();
    process.exit(0);
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  function render() {
    if (state.view === 'dashboard') renderDashboard();
    else if (state.view === 'agent-detail') renderAgentDetail();
  }

  // Keyboard handler
  process.stdin.on('keypress', async (str, key) => {
    if (!key) return;

    // Global keys
    if (key.name === 'q') { cleanup(); return; }
    if (key.name === 'c' && key.ctrl) { cleanup(); return; }

    if (state.view === 'dashboard') {
      await handleDashboardKey(key, render);
    } else if (state.view === 'agent-detail') {
      await handleAgentDetailKey(key, render);
    }
  });

  // Initial load
  state.actionMessage = 'Loading...';
  render();
  state.data = await fetchDashboardData(baseUrl, apiKey, cookie);
  state.actionMessage = '';
  render();

  // Auto-refresh loop
  while (running) {
    await new Promise(resolve => setTimeout(resolve, refreshMs));
    if (!running) break;
    if (state.view === 'dashboard') {
      state.data = await fetchDashboardData(baseUrl, apiKey, cookie);
      if (state.actionMessage === '') render();
    }
  }
}

async function handleDashboardKey(key, render) {
  if (key.name === 'escape') { cleanup(); return; }

  if (key.name === 'tab') {
    state.panel = state.panel === 'agents' ? 'tasks' : 'agents';
    render();
    return;
  }

  // Also support a/t to switch panels
  if (key.name === 'a') { state.panel = 'agents'; render(); return; }
  if (key.name === 't') { state.panel = 'tasks'; render(); return; }

  if (key.name === 'up') {
    if (state.panel === 'agents') state.cursorAgent = Math.max(0, state.cursorAgent - 1);
    else state.cursorTask = Math.max(0, state.cursorTask - 1);
    render();
    return;
  }

  if (key.name === 'down') {
    if (state.panel === 'agents') {
      const max = getAgentsList().length - 1;
      state.cursorAgent = Math.min(max, state.cursorAgent + 1);
    } else {
      const max = getTasksList().length - 1;
      state.cursorTask = Math.min(max, state.cursorTask + 1);
    }
    render();
    return;
  }

  if (key.name === 'return' && state.panel === 'agents') {
    const agents = getAgentsList();
    if (agents.length === 0) return;
    state.selectedAgent = agents[state.cursorAgent];
    state.view = 'agent-detail';
    state.transcriptSessionIdx = 0;
    state.transcriptScroll = 0;
    state.agentTranscript = null;
    state.actionMessage = 'Loading sessions...';
    render();
    state.agentSessions = await fetchAgentSessions(baseUrl, apiKey, cookie, state.selectedAgent.name);
    state.actionMessage = '';
    render();
    return;
  }

  if (key.name === 'r') {
    state.actionMessage = 'Refreshing...';
    render();
    state.data = await fetchDashboardData(baseUrl, apiKey, cookie);
    state.actionMessage = 'Refreshed';
    render();
    setTimeout(() => { state.actionMessage = ''; render(); }, 2000);
    return;
  }

  if (key.name === 'w') {
    const agents = state.data.agents?.agents || [];
    const sleeping = agents.filter(a => a.status === 'sleeping' || a.status === 'idle' || a.status === 'offline');
    if (sleeping.length === 0) { state.actionMessage = 'No agents to wake'; render(); return; }
    state.actionMessage = 'Waking agent...';
    render();
    const target = sleeping[0];
    const result = await api(baseUrl, apiKey, cookie, 'POST', `/api/agents/${target.id}/wake`);
    state.actionMessage = result?._error ? `Wake failed: ${result._error}` : `Woke agent: ${target.name}`;
    render();
    state.data = await fetchDashboardData(baseUrl, apiKey, cookie);
    render();
    setTimeout(() => { state.actionMessage = ''; render(); }, 3000);
  }
}

async function handleAgentDetailKey(key, render) {
  if (key.name === 'escape') {
    state.view = 'dashboard';
    state.selectedAgent = null;
    state.agentSessions = null;
    state.agentTranscript = null;
    render();
    return;
  }

  const sessions = state.agentSessions?.sessions || [];

  if (key.name === 'up') {
    state.transcriptSessionIdx = Math.max(0, state.transcriptSessionIdx - 1);
    render();
    return;
  }

  if (key.name === 'down') {
    state.transcriptSessionIdx = Math.min(Math.max(0, sessions.length - 1), state.transcriptSessionIdx + 1);
    render();
    return;
  }

  if (key.name === 'return') {
    if (sessions.length === 0) return;
    const session = sessions[state.transcriptSessionIdx];
    if (!session?.id) return;
    state.actionMessage = 'Loading chat...';
    state.transcriptScroll = 0;
    render();
    state.agentTranscript = await fetchTranscript(baseUrl, apiKey, cookie, session.id, 20);
    state.actionMessage = '';
    render();
    return;
  }

  // Page up/down for chat scroll
  if (key.name === 'pageup' || (key.shift && key.name === 'up')) {
    state.transcriptScroll = Math.min(state.transcriptScroll + 5, 100);
    render();
    return;
  }
  if (key.name === 'pagedown' || (key.shift && key.name === 'down')) {
    state.transcriptScroll = Math.max(0, state.transcriptScroll - 5);
    render();
    return;
  }
}

function cleanup() {
  ansi.showCursor();
  ansi.exitAltScreen();
  process.exit(0);
}

main().catch(err => {
  ansi.showCursor();
  ansi.exitAltScreen();
  console.error('TUI error:', err.message);
  process.exit(1);
});
