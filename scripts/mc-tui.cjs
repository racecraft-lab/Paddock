#!/usr/bin/env node
/*
 Mission Control TUI (v1)
 - Zero dependencies (ANSI escape codes)
 - Dashboard with agents/tasks/sessions panels
 - Keyboard-driven refresh and navigation
 - Trigger operations: wake agent, queue poll
 - Graceful degradation when endpoints unavailable

 Usage:
   node scripts/mc-tui.cjs [--url <base>] [--api-key <key>] [--profile <name>] [--refresh <ms>]
*/

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');

// ---------------------------------------------------------------------------
// Config (shared with mc-cli.cjs)
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

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchDashboardData(baseUrl, apiKey, cookie) {
  const [health, agents, tasks, tokens] = await Promise.all([
    api(baseUrl, apiKey, cookie, 'GET', '/api/status?action=health'),
    api(baseUrl, apiKey, cookie, 'GET', '/api/agents'),
    api(baseUrl, apiKey, cookie, 'GET', '/api/tasks?limit=15'),
    api(baseUrl, apiKey, cookie, 'GET', '/api/tokens?action=stats&timeframe=day'),
  ]);
  return { health, agents, tasks, tokens };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderHeader(cols, baseUrl, healthData, refreshMs) {
  const title = ' MISSION CONTROL ';
  const bar = ansi.bgBlue(pad(title, cols));
  process.stdout.write(bar + '\n');

  let status;
  if (healthData?._error) {
    status = ansi.red('UNREACHABLE');
  } else {
    // Show healthy if essential checks pass (DB + Disk), even when
    // gateway is down or dev-mode memory is high
    const checks = healthData?.checks || [];
    const essentialNames = new Set(['Database', 'Disk Space']);
    const essentialChecks = checks.filter(c => essentialNames.has(c.name));
    const essentialOk = essentialChecks.length > 0 && essentialChecks.every(c => c.status === 'healthy');
    const warnings = checks.filter(c => !essentialNames.has(c.name) && c.status !== 'healthy');
    const warningNames = warnings.map(c => c.name.toLowerCase()).join(', ');

    if (essentialOk && warnings.length === 0) {
      status = ansi.green('healthy');
    } else if (essentialOk) {
      status = ansi.yellow('operational') + ansi.dim(` (${warningNames})`);
    } else {
      status = statusColor(healthData?.status || 'unknown');
    }
  }
  const url = ansi.dim(baseUrl);
  const refresh = ansi.dim(`refresh: ${refreshMs / 1000}s`);
  const time = ansi.dim(new Date().toLocaleTimeString());
  process.stdout.write(` ${status}  ${url}  ${refresh}  ${time}\n`);
}

function renderAgentsPanel(agentsData, cols, maxRows) {
  process.stdout.write('\n' + ansi.bold(ansi.cyan(' AGENTS')) + '\n');

  if (agentsData?._error) {
    process.stdout.write(ansi.dim(`  (unavailable: ${agentsData._error})\n`));
    return;
  }

  const agents = agentsData?.agents || agentsData || [];
  if (!Array.isArray(agents) || agents.length === 0) {
    process.stdout.write(ansi.dim('  (no agents)\n'));
    return;
  }

  const nameW = 18;
  const roleW = 14;
  const statusW = 12;
  const header = ansi.dim(`  ${pad('Name', nameW)} ${pad('Role', roleW)} ${pad('Status', statusW)} Last Seen`);
  process.stdout.write(header + '\n');

  const sorted = [...agents].sort((a, b) => {
    const order = { online: 0, active: 0, idle: 1, sleeping: 2, offline: 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  for (let i = 0; i < Math.min(sorted.length, maxRows); i++) {
    const a = sorted[i];
    const name = pad(truncate(a.name, nameW), nameW);
    const role = pad(truncate(a.role, roleW), roleW);
    const status = pad(statusColor(a.status || 'unknown'), statusW + 9); // +9 for ANSI codes
    const lastSeen = a.last_heartbeat
      ? ansi.dim(timeSince(a.last_heartbeat))
      : ansi.dim('never');
    process.stdout.write(`  ${name} ${role} ${status} ${lastSeen}\n`);
  }

  if (sorted.length > maxRows) {
    process.stdout.write(ansi.dim(`  ... and ${sorted.length - maxRows} more\n`));
  }
}

function renderTasksPanel(tasksData, cols, maxRows) {
  process.stdout.write('\n' + ansi.bold(ansi.magenta(' TASKS')) + '\n');

  if (tasksData?._error) {
    process.stdout.write(ansi.dim(`  (unavailable: ${tasksData._error})\n`));
    return;
  }

  const tasks = tasksData?.tasks || tasksData || [];
  if (!Array.isArray(tasks) || tasks.length === 0) {
    process.stdout.write(ansi.dim('  (no tasks)\n'));
    return;
  }

  const idW = 5;
  const titleW = Math.min(35, cols - 40);
  const statusW = 14;
  const assignW = 14;
  const header = ansi.dim(`  ${pad('ID', idW)} ${pad('Title', titleW)} ${pad('Status', statusW)} ${pad('Assigned', assignW)}`);
  process.stdout.write(header + '\n');

  for (let i = 0; i < Math.min(tasks.length, maxRows); i++) {
    const t = tasks[i];
    const id = pad(String(t.id || ''), idW);
    const title = pad(truncate(t.title, titleW), titleW);
    const status = pad(statusColor(t.status || ''), statusW + 9);
    const assigned = pad(truncate(t.assigned_to || '-', assignW), assignW);
    process.stdout.write(`  ${id} ${title} ${status} ${assigned}\n`);
  }

  const total = tasksData?.total || tasks.length;
  if (total > maxRows) {
    process.stdout.write(ansi.dim(`  ... ${total} total tasks\n`));
  }
}

function renderTokensPanel(tokensData) {
  process.stdout.write('\n' + ansi.bold(ansi.yellow(' COSTS (24h)')) + '\n');

  if (tokensData?._error) {
    process.stdout.write(ansi.dim(`  (unavailable: ${tokensData._error})\n`));
    return;
  }

  const summary = tokensData?.summary || {};
  const cost = summary.totalCost != null ? `$${summary.totalCost.toFixed(4)}` : '-';
  const tokens = summary.totalTokens != null ? formatNumber(summary.totalTokens) : '-';
  const requests = summary.requestCount != null ? formatNumber(summary.requestCount) : '-';

  process.stdout.write(`  Cost: ${ansi.bold(cost)}  Tokens: ${tokens}  Requests: ${requests}\n`);
}

function renderFooter(cols, selectedPanel, actionMessage) {
  process.stdout.write('\n');
  if (actionMessage) {
    process.stdout.write(ansi.green(` ${actionMessage}\n`));
  }
  const keys = ansi.dim(' [r]efresh  [a]gents  [t]asks  [w]ake agent  [q]uit');
  process.stdout.write(keys + '\n');
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function wakeAgent(baseUrl, apiKey, cookie, agentsData) {
  const agents = agentsData?.agents || agentsData || [];
  const sleeping = agents.filter(a => a.status === 'sleeping' || a.status === 'idle' || a.status === 'offline');

  if (sleeping.length === 0) return 'No sleeping/idle agents to wake';

  // Wake the first sleeping agent
  const target = sleeping[0];
  const result = await api(baseUrl, apiKey, cookie, 'POST', `/api/agents/${target.id}/wake`);
  if (result?._error) return `Wake failed: ${result._error}`;
  return `Woke agent: ${target.name}`;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    console.log(`Mission Control TUI

Usage:
  node scripts/mc-tui.cjs [--url <base>] [--api-key <key>] [--profile <name>] [--refresh <ms>]

Keys:
  r       Refresh now
  a       Focus agents panel
  t       Focus tasks panel
  w       Wake first sleeping agent
  q/Esc   Quit
`);
    process.exit(0);
  }

  const profile = loadProfile(String(flags.profile || 'default'));
  const baseUrl = flags.url ? String(flags.url) : profile.url;
  const apiKey = flags['api-key'] ? String(flags['api-key']) : profile.apiKey;
  const cookie = profile.cookie;
  const refreshMs = Number(flags.refresh || 5000);

  // Raw mode for keyboard input
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
  }

  ansi.enterAltScreen();
  ansi.hideCursor();

  let running = true;
  let data = { health: {}, agents: {}, tasks: {}, tokens: {} };
  let actionMessage = '';
  let selectedPanel = 'agents';

  // Graceful shutdown
  function cleanup() {
    running = false;
    ansi.showCursor();
    ansi.exitAltScreen();
    process.exit(0);
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keyboard handler
  process.stdin.on('keypress', async (str, key) => {
    if (!key) return;
    if (key.name === 'q' || (key.name === 'escape')) {
      cleanup();
      return;
    }
    if (key.name === 'c' && key.ctrl) {
      cleanup();
      return;
    }
    if (key.name === 'r') {
      actionMessage = 'Refreshing...';
      render();
      data = await fetchDashboardData(baseUrl, apiKey, cookie);
      actionMessage = 'Refreshed';
      render();
      setTimeout(() => { actionMessage = ''; render(); }, 2000);
    }
    if (key.name === 'a') { selectedPanel = 'agents'; render(); }
    if (key.name === 't') { selectedPanel = 'tasks'; render(); }
    if (key.name === 'w') {
      actionMessage = 'Waking agent...';
      render();
      actionMessage = await wakeAgent(baseUrl, apiKey, cookie, data.agents);
      render();
      // Refresh after wake
      data = await fetchDashboardData(baseUrl, apiKey, cookie);
      render();
      setTimeout(() => { actionMessage = ''; render(); }, 3000);
    }
  });

  function render() {
    const { cols, rows } = getTermSize();
    ansi.clear();

    renderHeader(cols, baseUrl, data.health, refreshMs);

    // Calculate available rows for panels
    const headerRows = 3;
    const footerRows = 3;
    const panelHeaderRows = 6; // section headers + token panel
    const available = Math.max(4, rows - headerRows - footerRows - panelHeaderRows);
    const agentRows = Math.floor(available * 0.45);
    const taskRows = Math.floor(available * 0.55);

    renderAgentsPanel(data.agents, cols, agentRows);
    renderTasksPanel(data.tasks, cols, taskRows);
    renderTokensPanel(data.tokens);
    renderFooter(cols, selectedPanel, actionMessage);
  }

  // Initial fetch and render
  actionMessage = 'Loading...';
  render();
  data = await fetchDashboardData(baseUrl, apiKey, cookie);
  actionMessage = '';
  render();

  // Auto-refresh loop
  while (running) {
    await new Promise(resolve => setTimeout(resolve, refreshMs));
    if (!running) break;
    data = await fetchDashboardData(baseUrl, apiKey, cookie);
    if (actionMessage === '') render(); // Don't overwrite action messages
  }
}

main().catch(err => {
  ansi.showCursor();
  ansi.exitAltScreen();
  console.error('TUI error:', err.message);
  process.exit(1);
});
