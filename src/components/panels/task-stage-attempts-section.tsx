'use client'

import { sanitizeEvidenceDisplayText } from '@/lib/task-evidence'
import type {
  SerializedTaskStageAttempt,
  SerializedLifecycleEvent,
  TaskStageAttemptEnvelope,
  TaskStageAttemptWarning,
} from '@/lib/task-stage-attempts'
import type { ReactNode } from 'react'

interface TaskStageAttemptsSectionProps {
  attempts: TaskStageAttemptEnvelope | null
  loading: boolean
  error: string | null
}

const ACTIVE_STATUSES = new Set(['running'])
const LIFECYCLE_LIMIT = 10

export function TaskStageAttemptsSection({ attempts, loading, error }: TaskStageAttemptsSectionProps) {
  if (loading) {
    return (
      <SectionShell>
        <div role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">
          Loading stage attempts...
        </div>
      </SectionShell>
    )
  }

  if (error) {
    return (
      <SectionShell>
        <div role="alert" className="mt-2 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {safeText(error)}
        </div>
      </SectionShell>
    )
  }

  if (!attempts || attempts.attempts.length === 0) {
    return (
      <SectionShell>
        <p className="mt-2 text-xs text-muted-foreground">
          No stage attempts recorded.
        </p>
      </SectionShell>
    )
  }

  return (
    <SectionShell className="space-y-3">
      {attempts.warnings.length > 0 && (
        <div className="space-y-2">
          {attempts.warnings.map((warning, index) => (
            <WarningAlert key={`${warning.code}-${warning.attempt_id}-${String(index)}`} warning={warning} />
          ))}
        </div>
      )}

      {attempts.attempts.map((entry) => (
        <AttemptCard key={entry.id} attempt={entry} />
      ))}
    </SectionShell>
  )
}

function SectionShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section role="region" aria-label="Run state and stage attempts" className={`pt-3 border-t border-border/30 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">Run state</h4>
        <span className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">Stage attempts</span>
      </div>
      {children}
    </section>
  )
}

function AttemptCard({ attempt }: { attempt: SerializedTaskStageAttempt }) {
  const active = ACTIVE_STATUSES.has(attempt.status)
  const stateLabel = attempt.archived_at ? 'Archived attempt' : active ? 'Active attempt' : 'Stored attempt'
  const lifecycle = attempt.lifecycle.slice(-LIFECYCLE_LIMIT)

  return (
    <article className="rounded-md border border-border/30 bg-secondary/20 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className="break-words font-medium text-foreground">
            {`Attempt ${safeText(attempt.stage_key)} #${String(attempt.attempt_number)}`}
          </h5>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="rounded border border-border/40 bg-card/60 px-1.5 py-0.5 text-[10px] text-foreground">
              {stateLabel}
            </span>
            <span className="rounded border border-border/40 bg-card/60 px-1.5 py-0.5 text-[10px] text-foreground">
              {`Stage: ${safeText(attempt.stage_key)}`}
            </span>
            <span className="rounded border border-border/40 bg-card/60 px-1.5 py-0.5 text-[10px] text-foreground">
              {`State: ${safeText(attempt.status)}`}
            </span>
            <span className="rounded border border-border/40 bg-card/60 px-1.5 py-0.5 text-[10px] text-foreground">
              {`Attempt: ${String(attempt.attempt_number)}`}
            </span>
          </div>
        </div>
        {attempt.workflow_template_slug && (
          <span className="max-w-full break-all rounded border border-border/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {safeText(attempt.workflow_template_slug)}
          </span>
        )}
      </div>

      {active && (
        <p role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">
          {`Attempt ${safeText(attempt.stage_key)} #${String(attempt.attempt_number)} is ${safeText(attempt.status)}.`}
        </p>
      )}

      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <AttemptKV label="Created" value={attempt.created_at} />
        <AttemptKV label="Updated" value={attempt.updated_at} />
        {attempt.started_at && <AttemptKV label="Started" value={attempt.started_at} />}
        {attempt.completed_at && <AttemptKV label="Completed" value={attempt.completed_at} />}
        {attempt.archived_at && <AttemptKV label="Archived at" value={attempt.archived_at} />}
      </dl>
      {attempt.archived_at && (
        <p className="mt-2 break-words text-muted-foreground">
          {`Archived at ${safeText(attempt.archived_at)}`}
        </p>
      )}

      <RunReference attempt={attempt} />

      {lifecycle.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">Lifecycle</div>
          <ol className="space-y-1">
            {lifecycle.map((event) => (
              <LifecycleRow key={event.id} event={event} />
            ))}
          </ol>
        </div>
      )}
    </article>
  )
}

function AttemptKV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</dt>
      <dd className="break-words text-foreground/85">{safeText(value)}</dd>
    </div>
  )
}

function RunReference({ attempt }: { attempt: SerializedTaskStageAttempt }) {
  const runLink = attempt.run_link
  if (runLink.state === 'none') {
    return (
      <p className="mt-2 break-words text-muted-foreground">
        No runtime run linked.
      </p>
    )
  }

  if (runLink.state === 'missing_unavailable') {
    return (
      <p className="mt-2 break-all rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
        {`Run missing or unavailable: ${safeText(runLink.run_id)}`}
      </p>
    )
  }

  return (
    <div className="mt-2 rounded border border-border/30 bg-card/40 px-2 py-1">
      <p className="break-all text-xs text-foreground/85">
        {`Linked run (read-only reference): ${safeText(runLink.run_id)}`}
      </p>
      {attempt.run_summary && (
        <p className="mt-1 break-words text-[10px] text-muted-foreground">
          {[
            attempt.run_summary.agent_name ? `agent ${safeText(attempt.run_summary.agent_name)}` : null,
            attempt.run_summary.runtime ? `runtime ${safeText(attempt.run_summary.runtime)}` : null,
            attempt.run_summary.status ? `state ${safeText(attempt.run_summary.status)}` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
}

function LifecycleRow({ event }: { event: SerializedLifecycleEvent }) {
  return (
    <li className="rounded border border-border/30 px-2 py-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 text-[10px] text-zinc-200">
          {`Lifecycle: ${safeText(event.status)}`}
        </span>
        <span className="break-all font-mono text-[10px] text-muted-foreground">{safeText(event.observed_at)}</span>
      </div>
      {event.message && (
        <p className="mt-1 break-words text-foreground/80">{safeText(event.message)}</p>
      )}
    </li>
  )
}

function WarningAlert({ warning }: { warning: TaskStageAttemptWarning }) {
  return (
    <p role="alert" className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
      {warningText(warning)}
    </p>
  )
}

function warningText(warning: TaskStageAttemptWarning): string {
  if (warning.code === 'invalid_attempt_state') {
    return `Invalid stored state: attempt ${safeText(warning.attempt_id)} has invalid ${safeText(warning.field)}.`
  }

  if (warning.code === 'invalid_lifecycle_state') {
    const event = warning.event_id ? ` event ${safeText(warning.event_id)}` : ''
    const value = warning.value ? ` value ${safeText(warning.value)}` : ''
    return `Invalid lifecycle state: attempt ${safeText(warning.attempt_id)}${event} has invalid ${safeText(warning.field)}${value}.`
  }

  return `Projection drift: attempt ${safeText(warning.attempt_id)} ${safeText(warning.field)} stored ${displayNullable(warning.projection_value)}, expected ${displayNullable(warning.expected_value)}.`
}

function safeText(value: string | number | undefined | null): string {
  if (value == null) return ''
  return sanitizeEvidenceDisplayText(String(value))
}

function displayNullable(value: string | null): string {
  return value === null ? 'missing' : safeText(value)
}
