#!/usr/bin/env node
/*
 Mission Control CLI (v1 scaffold)
 - Zero heavy dependencies
 - API-key first for agent automation
 - JSON mode + stable exit codes
*/

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const EXIT = {
  OK: 0,
  USAGE: 2,
  AUTH: 3,
  FORBIDDEN: 4,
  NETWORK: 5,
  SERVER: 6,
};

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out.flags[key] = true;
      continue;
    }
    out.flags[key] = next;
    i += 1;
  }
  return out;
}

function usage() {
  console.log(`Mission Control CLI

Usage:
  mc <group> <action> [--flags]

Groups:
  auth      login/logout/whoami
  agents    list/get/create/update/delete/wake/diagnostics/heartbeat
  tasks     list/get/create/update/delete/queue/comment
  sessions  list/control/continue
  connect   register/list/disconnect
  tokens    list/stats/by-agent
  skills    list/content/upsert/delete/check
  cron      list/create/update/pause/resume/remove/run
  events    watch
  raw       request fallback

Common flags:
  --profile <name>      profile name (default: default)
  --url <base_url>      override profile URL
  --api-key <key>       override profile API key
  --json                JSON output
  --timeout-ms <n>      request timeout (default 20000)
  --help                show help

Examples:
  mc agents list --json
  mc tasks queue --agent Aegis --max-capacity 2
  mc sessions control --id abc123 --action terminate
  mc raw --method GET --path /api/status --json
`);
}

function profilePath(name) {
  return path.join(os.homedir(), '.mission-control', 'profiles', `${name}.json`);
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadProfile(name) {
  const p = profilePath(name);
  if (!fs.existsSync(p)) {
    return {
      name,
      url: process.env.MC_URL || 'http://127.0.0.1:3000',
      apiKey: process.env.MC_API_KEY || '',
      cookie: process.env.MC_COOKIE || '',
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      name,
      url: parsed.url || process.env.MC_URL || 'http://127.0.0.1:3000',
      apiKey: parsed.apiKey || process.env.MC_API_KEY || '',
      cookie: parsed.cookie || process.env.MC_COOKIE || '',
    };
  } catch {
    return {
      name,
      url: process.env.MC_URL || 'http://127.0.0.1:3000',
      apiKey: process.env.MC_API_KEY || '',
      cookie: process.env.MC_COOKIE || '',
    };
  }
}

function saveProfile(profile) {
  const p = profilePath(profile.name);
  ensureParentDir(p);
  fs.writeFileSync(p, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
}

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function mapStatusToExit(status) {
  if (status === 401) return EXIT.AUTH;
  if (status === 403) return EXIT.FORBIDDEN;
  if (status >= 500) return EXIT.SERVER;
  return EXIT.USAGE;
}

async function httpRequest({ baseUrl, apiKey, cookie, method, route, body, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { Accept: 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  if (cookie) headers['Cookie'] = cookie;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const url = `${normalizeBaseUrl(baseUrl)}${route.startsWith('/') ? route : `/${route}`}`;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return {
      ok: res.ok,
      status: res.status,
      data,
      setCookie: res.headers.get('set-cookie') || '',
      url,
      method,
    };
  } catch (err) {
    clearTimeout(timer);
    if (String(err?.name || '') === 'AbortError') {
      return { ok: false, status: 0, data: { error: `Request timeout after ${timeoutMs}ms` }, timeout: true, url, method };
    }
    return { ok: false, status: 0, data: { error: err?.message || 'Network error' }, network: true, url, method };
  }
}

function printResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.ok) {
    console.log(`OK ${result.status} ${result.method} ${result.url}`);
    if (result.data && Object.keys(result.data).length > 0) {
      console.log(JSON.stringify(result.data, null, 2));
    }
    return;
  }
  console.error(`ERROR ${result.status || 'NETWORK'} ${result.method} ${result.url}`);
  console.error(JSON.stringify(result.data, null, 2));
}

function required(flags, key) {
  const value = flags[key];
  if (value === undefined || value === true || String(value).trim() === '') {
    throw new Error(`Missing required flag --${key}`);
  }
  return value;
}

async function run() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.flags.help || parsed._.length === 0) {
    usage();
    process.exit(EXIT.OK);
  }

  const asJson = Boolean(parsed.flags.json);
  const profileName = String(parsed.flags.profile || 'default');
  const profile = loadProfile(profileName);
  const baseUrl = parsed.flags.url ? String(parsed.flags.url) : profile.url;
  const apiKey = parsed.flags['api-key'] ? String(parsed.flags['api-key']) : profile.apiKey;
  const timeoutMs = Number(parsed.flags['timeout-ms'] || 20000);

  const group = parsed._[0];
  const action = parsed._[1];

  try {
    if (group === 'auth') {
      if (action === 'login') {
        const username = required(parsed.flags, 'username');
        const password = required(parsed.flags, 'password');
        const result = await httpRequest({
          baseUrl,
          method: 'POST',
          route: '/api/auth/login',
          body: { username, password },
          timeoutMs,
        });
        if (result.ok && result.setCookie) {
          profile.url = baseUrl;
          profile.cookie = result.setCookie.split(';')[0];
          if (apiKey) profile.apiKey = apiKey;
          saveProfile(profile);
          result.data = { ...result.data, profile: profile.name, saved_cookie: true };
        }
        printResult(result, asJson);
        process.exit(result.ok ? EXIT.OK : mapStatusToExit(result.status));
      }
      if (action === 'logout') {
        const result = await httpRequest({ baseUrl, apiKey, cookie: profile.cookie, method: 'POST', route: '/api/auth/logout', timeoutMs });
        if (result.ok) {
          profile.cookie = '';
          saveProfile(profile);
        }
        printResult(result, asJson);
        process.exit(result.ok ? EXIT.OK : mapStatusToExit(result.status));
      }
      if (action === 'whoami') {
        const result = await httpRequest({ baseUrl, apiKey, cookie: profile.cookie, method: 'GET', route: '/api/auth/me', timeoutMs });
        printResult(result, asJson);
        process.exit(result.ok ? EXIT.OK : mapStatusToExit(result.status));
      }
    }

    if (group === 'raw') {
      const method = String(required(parsed.flags, 'method')).toUpperCase();
      const route = String(required(parsed.flags, 'path'));
      const body = parsed.flags.body ? JSON.parse(String(parsed.flags.body)) : undefined;
      const result = await httpRequest({ baseUrl, apiKey, cookie: profile.cookie, method, route, body, timeoutMs });
      printResult(result, asJson);
      process.exit(result.ok ? EXIT.OK : mapStatusToExit(result.status));
    }

    const map = {
      agents: {
        list: { method: 'GET', route: '/api/agents' },
        get: { method: 'GET', route: `/api/agents/${required(parsed.flags, 'id')}` },
        create: { method: 'POST', route: '/api/agents', body: { name: required(parsed.flags, 'name'), role: required(parsed.flags, 'role') } },
        update: { method: 'PUT', route: `/api/agents/${required(parsed.flags, 'id')}`, body: parsed.flags.body ? JSON.parse(String(parsed.flags.body)) : {} },
        delete: { method: 'DELETE', route: `/api/agents/${required(parsed.flags, 'id')}` },
        wake: { method: 'POST', route: `/api/agents/${required(parsed.flags, 'id')}/wake` },
        diagnostics: { method: 'GET', route: `/api/agents/${required(parsed.flags, 'id')}/diagnostics` },
        heartbeat: { method: 'POST', route: `/api/agents/${required(parsed.flags, 'id')}/heartbeat` },
      },
      tasks: {
        list: { method: 'GET', route: '/api/tasks' },
        get: { method: 'GET', route: `/api/tasks/${required(parsed.flags, 'id')}` },
        create: { method: 'POST', route: '/api/tasks', body: parsed.flags.body ? JSON.parse(String(parsed.flags.body)) : { title: required(parsed.flags, 'title') } },
        update: { method: 'PUT', route: `/api/tasks/${required(parsed.flags, 'id')}`, body: parsed.flags.body ? JSON.parse(String(parsed.flags.body)) : {} },
        delete: { method: 'DELETE', route: `/api/tasks/${required(parsed.flags, 'id')}` },
        queue: { method: 'GET', route: `/api/tasks/queue?agent=${encodeURIComponent(required(parsed.flags, 'agent'))}${parsed.flags['max-capacity'] ? `&max_capacity=${encodeURIComponent(String(parsed.flags['max-capacity']))}` : ''}` },
      },
      sessions: {
        list: { method: 'GET', route: '/api/sessions' },
        control: { method: 'POST', route: `/api/sessions/${required(parsed.flags, 'id')}/control`, body: { action: required(parsed.flags, 'action') } },
        continue: { method: 'POST', route: '/api/sessions/continue', body: { kind: required(parsed.flags, 'kind'), id: required(parsed.flags, 'id'), prompt: required(parsed.flags, 'prompt') } },
      },
      connect: {
        register: { method: 'POST', route: '/api/connect', body: parsed.flags.body ? JSON.parse(String(parsed.flags.body)) : { tool_name: required(parsed.flags, 'tool-name'), agent_name: required(parsed.flags, 'agent-name') } },
        list: { method: 'GET', route: '/api/connect' },
        disconnect: { method: 'DELETE', route: '/api/connect', body: { connection_id: required(parsed.flags, 'connection-id') } },
      },
      tokens: {
        list: { method: 'GET', route: '/api/tokens?action=list' },
        stats: { method: 'GET', route: '/api/tokens?action=stats' },
        'by-agent': { method: 'GET', route: `/api/tokens/by-agent?days=${encodeURIComponent(String(parsed.flags.days || '30'))}` },
      },
      skills: {
        list: { method: 'GET', route: '/api/skills' },
        content: { method: 'GET', route: `/api/skills?mode=content&source=${encodeURIComponent(required(parsed.flags, 'source'))}&name=${encodeURIComponent(required(parsed.flags, 'name'))}` },
        check: { method: 'GET', route: `/api/skills?mode=check&source=${encodeURIComponent(required(parsed.flags, 'source'))}&name=${encodeURIComponent(required(parsed.flags, 'name'))}` },
        upsert: { method: 'PUT', route: '/api/skills', body: { source: required(parsed.flags, 'source'), name: required(parsed.flags, 'name'), content: fs.readFileSync(required(parsed.flags, 'file'), 'utf8') } },
        delete: { method: 'DELETE', route: `/api/skills?source=${encodeURIComponent(required(parsed.flags, 'source'))}&name=${encodeURIComponent(required(parsed.flags, 'name'))}` },
      },
      cron: {
        list: { method: 'GET', route: '/api/cron' },
        create: { method: 'POST', route: '/api/cron', body: parsed.flags.body ? JSON.parse(String(parsed.flags.body)) : {} },
        update: { method: 'POST', route: '/api/cron', body: parsed.flags.body ? JSON.parse(String(parsed.flags.body)) : {} },
        pause: { method: 'POST', route: '/api/cron', body: parsed.flags.body ? JSON.parse(String(parsed.flags.body)) : {} },
        resume: { method: 'POST', route: '/api/cron', body: parsed.flags.body ? JSON.parse(String(parsed.flags.body)) : {} },
        remove: { method: 'POST', route: '/api/cron', body: parsed.flags.body ? JSON.parse(String(parsed.flags.body)) : {} },
        run: { method: 'POST', route: '/api/cron', body: parsed.flags.body ? JSON.parse(String(parsed.flags.body)) : {} },
      },
      events: {
        watch: null,
      },
    };

    if (group === 'events' && action === 'watch') {
      const result = await httpRequest({ baseUrl, apiKey, cookie: profile.cookie, method: 'GET', route: '/api/events', timeoutMs: Number(parsed.flags['timeout-ms'] || 3600000) });
      // Basic fallback: if server doesn't stream in this fetch mode, print response payload
      printResult(result, asJson);
      process.exit(result.ok ? EXIT.OK : mapStatusToExit(result.status));
    }

    const cfg = map[group] && map[group][action];
    if (!cfg) {
      usage();
      process.exit(EXIT.USAGE);
    }

    const result = await httpRequest({
      baseUrl,
      apiKey,
      cookie: profile.cookie,
      method: cfg.method,
      route: cfg.route,
      body: cfg.body,
      timeoutMs,
    });

    printResult(result, asJson);
    process.exit(result.ok ? EXIT.OK : mapStatusToExit(result.status));
  } catch (err) {
    const message = err?.message || String(err);
    if (asJson) {
      console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    } else {
      console.error(`USAGE ERROR: ${message}`);
    }
    process.exit(EXIT.USAGE);
  }
}

run();
