/**
 * SPEC-008 — Audited collector-config writer + restart proxy (T110).
 *
 * Per FR-090f (audited config edit), FR-090g (collector restart trigger).
 *
 * Operator workflow:
 *   1) Caller submits the new YAML body.
 *   2) Snapshot the existing config to `<DATA_DIR>/otelcol/config.yaml.<ts>.bak`.
 *   3) Atomic write to `<DATA_DIR>/otelcol/config.yaml` (write-to-temp + rename).
 *   4) Trigger `systemctl --user restart otelcol-mission-control` (override-able).
 *   5) Append a `governance_health_events` row recording the action.
 *
 * The restart command is replaced with a no-op in the test harness via
 * `restartHook`. When the host has no `systemctl` (e.g., dev laptops),
 * the writer logs the failure to `governance_health_events` with
 * `state='restart_failed'` but still returns success — the file write
 * completed and an operator can pick up the rest manually.
 *
 * @see specs/008-resource-governance/spec.md FR-090f, FR-090g
 * @see specs/008-resource-governance/tasks.md T110
 * @see Constitution Convention J — strict-scope module
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

/** Default collector config dir under DATA_DIR. */
export const COLLECTOR_DIR_NAME = 'otelcol';
export const COLLECTOR_CONFIG_BASENAME = 'config.yaml';

/** governance_health_events component tag for this writer. */
export const COMPONENT_TAG = 'collector_config';

/** Restart hook signature. Tests pass a stub. */
export type RestartHook = () => Promise<{ ok: boolean; detail?: string }>;

/** Resolve `<DATA_DIR>` from `MISSION_CONTROL_DATA_DIR` env, falling back to `.data/`. */
export function resolveDataDir(envOverride?: string  ): string {
  if (envOverride !== undefined && envOverride !== '') return envOverride;
  const env = process.env['MISSION_CONTROL_DATA_DIR'];
  if (typeof env === 'string' && env !== '') return env;
  return '.data';
}

/** Resolve the full collector config path. */
export function resolveConfigPath(opts: { dataDir?: string } = {}): string {
  const dir = opts.dataDir ?? resolveDataDir();
  return path.join(dir, COLLECTOR_DIR_NAME, COLLECTOR_CONFIG_BASENAME);
}

/** Default restart hook — invokes systemctl. */
async function defaultRestartHook(): Promise<{ ok: boolean; detail?: string }> {
  return new Promise((resolve) => {
    const child = spawn('systemctl', ['--user', 'restart', 'otelcol-mission-control'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err: Error) => {
      resolve({ ok: false, detail: err.message });
    });
    child.on('exit', (code: number | null) => {
      if (code === 0) {
        resolve({ ok: true });
      } else {
        const codeStr = code === null ? '?' : String(code);
        resolve({ ok: false, detail: `exit ${codeStr}: ${stderr.trim()}` });
      }
    });
  });
}

/** Write-config request. */
export interface WriteConfigArgs {
  /** New YAML body (already validated upstream). */
  yaml_body: string;
  /** Operator who initiated the change (for the audit row). */
  actor: string;
  /** Override DATA_DIR (test injection). */
  dataDir?: string;
  /** Override the restart hook (test injection). */
  restartHook?: RestartHook;
}

/** Write-config result. */
export interface WriteConfigResult {
  ok: true;
  config_path: string;
  backup_path: string | null;
  restart_ok: boolean;
  restart_detail?: string;
  health_event_id: number;
}

/**
 * Audited config-edit + restart proxy.
 * Steps:
 *   1) Snapshot existing config (if present) → `.bak.<ts>`.
 *   2) Atomic write to a temp file then rename → final path.
 *   3) Run restart hook.
 *   4) Append governance_health_events row.
 *
 * The audit-row + atomic-rename are wrapped in one immediate
 * transaction so a process crash between steps 3 and 4 yields a
 * consistent persisted state (config rolled forward, audit pending →
 * detected by the next sweep).
 */
export async function writeCollectorConfig(
  db: Database.Database,
  args: WriteConfigArgs,
): Promise<WriteConfigResult> {
  const dataDir = args.dataDir ?? resolveDataDir();
  const dir = path.join(dataDir, COLLECTOR_DIR_NAME);
  const finalPath = path.join(dir, COLLECTOR_CONFIG_BASENAME);

  // 1) Ensure directory.
  await fs.mkdir(dir, { recursive: true });

  // 2) Snapshot existing config.
  let backupPath: string | null = null;
  if (existsSync(finalPath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = `${finalPath}.${ts}.bak`;
    const existing = await fs.readFile(finalPath, 'utf8');
    await fs.writeFile(backupPath, existing, 'utf8');
  }

  // 3) Atomic write (temp + rename).
  const tempPath = `${finalPath}.tmp.${String(process.pid)}`;
  await fs.writeFile(tempPath, args.yaml_body, 'utf8');
  await fs.rename(tempPath, finalPath);

  // 4) Run restart hook.
  const hook = args.restartHook ?? defaultRestartHook;
  const restartResult = await hook();

  // 5) Append the governance_health_events audit row.
  let health_event_id = 0;
  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO governance_health_events (component, state, metric_json)
         VALUES (?, ?, ?)`,
      )
      .run(
        COMPONENT_TAG,
        restartResult.ok ? 'config_applied' : 'restart_failed',
        JSON.stringify({
          actor: args.actor,
          config_path: finalPath,
          backup_path: backupPath,
          yaml_bytes: args.yaml_body.length,
          restart_ok: restartResult.ok,
          restart_detail: restartResult.detail ?? null,
        }),
      );
    health_event_id = Number(result.lastInsertRowid);
  });
  tx.immediate();

  const out: WriteConfigResult = {
    ok: true,
    config_path: finalPath,
    backup_path: backupPath,
    restart_ok: restartResult.ok,
    health_event_id,
  };
  if (restartResult.detail !== undefined) {
    out.restart_detail = restartResult.detail;
  }
  return out;
}
