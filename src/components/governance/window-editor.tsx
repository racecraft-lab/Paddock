/**
 * SPEC-008 — Window editor (T173).
 *
 * Per FR-310. Edit-form for blackout/degraded windows with start_local,
 * end_local, timezone, enabled, and an explicit DST-warning when the
 * window straddles a DST boundary.
 *
 * Stories cover: default / editing / DST-warning / conflict /
 * disabled-by-flag.
 *
 * @see specs/008-resource-governance/tasks.md T173
 */

'use client';

import { useState, type ReactNode, type SyntheticEvent } from 'react';
import type { WindowSummary } from './windows-subview';

export type WindowEditorState = 'default' | 'editing' | 'dst_warning' | 'conflict' | 'submitting';

export interface WindowEditorProps {
  window: WindowSummary;
  state?: WindowEditorState;
  conflictMessage?: string;
  onSubmit?: (next: WindowSummary) => void;
  onCancel?: () => void;
}

export function WindowEditor(props: WindowEditorProps): ReactNode {
  const [policyType, setPolicyType] = useState<'blackout' | 'degraded'>(
    props.window.policy_type,
  );
  const [startLocal, setStartLocal] = useState(props.window.start_local);
  const [endLocal, setEndLocal] = useState(props.window.end_local);
  const [timezone, setTimezone] = useState(props.window.timezone);
  const [enabled, setEnabled] = useState(props.window.enabled);

  const state = props.state ?? 'default';
  const submitting = state === 'submitting';

  function submit(e: SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault();
    props.onSubmit?.({
      id: props.window.id,
      policy_type: policyType,
      start_local: startLocal,
      end_local: endLocal,
      timezone,
      enabled,
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-md border p-4"
      aria-labelledby={`window-editor-${String(props.window.id)}-heading`}
    >
      <h3
        id={`window-editor-${String(props.window.id)}-heading`}
        className="text-sm font-semibold"
      >
        Edit window {String(props.window.id)}
      </h3>

      <label className="flex flex-col gap-1 text-xs">
        <span>Policy type</span>
        <select
          value={policyType}
          onChange={(e) => {
            setPolicyType(e.target.value as 'blackout' | 'degraded');
          }}
          disabled={submitting}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="blackout">blackout</option>
          <option value="degraded">degraded</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span>Start (local)</span>
          <input
            type="text"
            value={startLocal}
            onChange={(e) => {
              setStartLocal(e.target.value);
            }}
            disabled={submitting}
            placeholder="2026-01-01T00:00"
            className="rounded border px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>End (local)</span>
          <input
            type="text"
            value={endLocal}
            onChange={(e) => {
              setEndLocal(e.target.value);
            }}
            disabled={submitting}
            placeholder="2026-01-02T00:00"
            className="rounded border px-2 py-1 text-sm"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        <span>Timezone</span>
        <input
          type="text"
          value={timezone}
          onChange={(e) => {
            setTimezone(e.target.value);
          }}
          disabled={submitting}
          placeholder="America/New_York"
          className="rounded border px-2 py-1 text-sm"
        />
      </label>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
          }}
          disabled={submitting}
        />
        <span>Enabled</span>
      </label>

      {state === 'dst_warning' ? (
        <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="font-medium">DST boundary detected</p>
          <p>
            This window crosses a Daylight Saving Time transition.
            Verify the start/end times are intentional.
          </p>
        </div>
      ) : null}

      {state === 'conflict' ? (
        <div role="alert" className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {props.conflictMessage ?? 'Window overlaps an existing record.'}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          {submitting ? 'Saving...' : 'Save'}
        </button>
        {props.onCancel !== undefined ? (
          <button
            type="button"
            onClick={props.onCancel}
            disabled={submitting}
            className="rounded border px-3 py-1.5 text-xs"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
