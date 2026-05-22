'use client'

import {
  ALLOWED_EVIDENCE_STATES,
  sanitizeEvidenceDisplayText,
  type ArtifactReference,
  type EvidenceState,
  type GitHubReference,
  type TaskEvidenceResponse,
} from '@/lib/task-evidence'
import type { ReactNode } from 'react'

interface TaskEvidenceSectionProps {
  evidence: TaskEvidenceResponse | null
  loading: boolean
  error: string | null
}

const ALLOWED_STATE_SET = new Set<string>(ALLOWED_EVIDENCE_STATES)

export function TaskEvidenceSection({ evidence, loading, error }: TaskEvidenceSectionProps) {
  if (loading) {
    return (
      <section role="region" aria-label="Task evidence" className="pt-3 border-t border-border/30">
        <h4 className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">Evidence</h4>
        <div role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">
          Loading evidence...
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section role="region" aria-label="Task evidence" className="pt-3 border-t border-border/30">
        <h4 className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">Evidence</h4>
        <div role="alert" className="mt-2 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {sanitizeEvidenceDisplayText(error)}
        </div>
      </section>
    )
  }

  if (!evidence) {
    return (
      <section role="region" aria-label="Task evidence" className="pt-3 border-t border-border/30">
        <h4 className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">Evidence</h4>
        <p className="mt-2 text-xs text-muted-foreground">No stored evidence.</p>
      </section>
    )
  }

  const unsupportedStates = collectUnsupportedStates(evidence)
  const currentStage = safeText(evidence.current_stage.current_status)
  const eligibilityInputs = evidence.pilot_eligibility.inputs?.map(safeText).filter(Boolean).join(', ') ?? ''

  return (
    <section role="region" aria-label="Task evidence" className="pt-3 border-t border-border/30 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">Evidence</h4>
        <StateBadge state={evidence.pilot_eligibility.state} />
      </div>

      {unsupportedStates.map((entry) => (
        <p key={`${entry.section}-${entry.state}`} className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Unsupported evidence state: {entry.state}
        </p>
      ))}

      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <EvidenceBlock label="Current stage">
          <span className="break-words font-medium text-foreground">
            {withFallback(currentStage, 'missing')}
          </span>
        </EvidenceBlock>
        <EvidenceBlock label="Eligibility inputs">
          <span className="break-words text-foreground/80">
            {withFallback(eligibilityInputs, 'no stored inputs')}
          </span>
        </EvidenceBlock>
      </div>

      <EvidenceBlock label="GitHub identity">
        <div className="flex flex-wrap gap-1.5">
          {renderGitHubReference(evidence.identity.issue)}
          {renderGitHubReference(evidence.identity.pull_request)}
          {evidence.identity.missing.map((reason) => (
            <span key={reason} className="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground break-all">
              {safeText(reason)}
            </span>
          ))}
          {!evidence.identity.issue && !evidence.identity.pull_request && evidence.identity.missing.length === 0 && (
            <span className="text-muted-foreground">missing</span>
          )}
        </div>
      </EvidenceBlock>

      <EvidenceBlock label="Packet artifacts">
        {evidence.packet_artifacts.references.length === 0 ? (
          <span className="text-muted-foreground">{withFallback(safeText(evidence.packet_artifacts.unavailable_reason), 'missing')}</span>
        ) : (
          <ul className="space-y-1">
            {evidence.packet_artifacts.references.map((reference) => (
              <ArtifactReferenceRow key={`${reference.kind}-${reference.artifact_id ?? reference.display_name}`} reference={reference} />
            ))}
          </ul>
        )}
      </EvidenceBlock>

      <TriageRoutingBlock evidence={evidence} />

      <EvidenceBlock label="Smoke proof">
        <div className="flex flex-wrap gap-1.5">
          {evidence.smoke.references.length > 0
            ? evidence.smoke.references.map((reference) => (
              <span key={reference} className="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80 break-all">
                {safeText(reference)}
              </span>
            ))
            : <span className="text-muted-foreground">{withFallback(evidence.smoke.missing.map(safeText).join(', '), 'missing')}</span>}
        </div>
      </EvidenceBlock>

      {(evidence.pilot_eligibility.reasons.length > 0 || evidence.warnings.length > 0) && (
        <EvidenceBlock label="Warnings and missing proof">
          <ul className="space-y-1">
            {evidence.pilot_eligibility.reasons.map((reason) => (
              <li key={`reason-${reason}`} className="break-all font-mono text-[10px] text-amber-200">
                {safeText(reason)}
              </li>
            ))}
            {evidence.warnings.map((warning) => (
              <li key={`${warning.code}-${warning.section}-${warning.reason}`} className="break-words text-muted-foreground">
                <span className="font-mono text-[10px] text-amber-200">{safeText(warning.reason)}</span>
                <span className="ml-1">{safeText(warning.message)}</span>
              </li>
            ))}
          </ul>
        </EvidenceBlock>
      )}

      <EvidenceBlock label="Deferred future state">
        <ul className="grid gap-1 sm:grid-cols-2">
          {evidence.deferrals.map((deferral) => (
            <li key={deferral.category} className="rounded-md border border-border/30 bg-secondary/20 px-2 py-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="break-words text-foreground/90">{safeText(deferral.label)}</span>
                <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 text-[10px] text-zinc-300">
                  {deferral.state}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{safeText(deferral.owner_spec)}</span>
              </div>
            </li>
          ))}
        </ul>
      </EvidenceBlock>

      {evidence.source_map.length > 0 && (
        <EvidenceBlock label="Source map">
          <ul className="space-y-1">
            {evidence.source_map.slice(0, 6).map((entry, index) => (
              <li key={`${entry.section}-${entry.source_type}-${entry.source_id ?? String(index)}`} className="break-words text-muted-foreground">
                <span className="font-mono text-[10px] text-foreground/70">{safeText(entry.source_type)}</span>
                {entry.source_id && <span className="ml-1 font-mono text-[10px]">{safeText(entry.source_id)}</span>}
                {entry.note && <span className="ml-1">{safeText(entry.note)}</span>}
              </li>
            ))}
          </ul>
        </EvidenceBlock>
      )}
    </section>
  )
}

function TriageRoutingBlock({ evidence }: { evidence: TaskEvidenceResponse }) {
  const route = evidence.triage_routing
  const title = route.routing_status === 'recorded' && route.state === 'available'
    ? 'Routing recorded'
    : route.routing_status === 'conflict'
      ? 'Triage routing conflict'
      : route.state === 'incomplete'
        ? 'Triage routing incomplete'
        : route.state === 'unavailable'
          ? 'Triage routing unavailable'
          : route.state === 'superseded'
            ? 'Superseded routing evidence'
            : 'No triage routing recorded.'
  const detail = route.lane_detail
  const specialistUnassigned = detail && 'specialist_state' in detail && detail.specialist_state === 'unassigned'

  return (
    <EvidenceBlock label="Triage routing">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">{title}</span>
          <StateBadge state={route.state} />
          <span className="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">
            {safeText(route.routing_status)}
          </span>
        </div>

        <dl className="grid gap-1 sm:grid-cols-2">
          {route.disposition && <EvidenceKV label="Disposition" value={route.disposition} />}
          {route.lane && <EvidenceKV label="Lane" value={route.lane} />}
          {route.artifact && <EvidenceKV label="Artifact" value={`${route.artifact.display_name} ${route.artifact.artifact_id}`} />}
          {route.activity_reference && <EvidenceKV label="Activity" value={route.activity_reference} />}
          {route.idempotency_key && <EvidenceKV label="Idempotency" value={route.idempotency_key} />}
          {route.recommended_next_action && <EvidenceKV label="Recommended next action" value={route.recommended_next_action} />}
        </dl>

        {specialistUnassigned && (
          <p className="rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
            Specialist unassigned
          </p>
        )}

        {route.missing.length > 0 && (
          <TokenList label="Missing" values={route.missing} tone="amber" />
        )}
        {route.warnings.length > 0 && (
          <TokenList label="Warnings" values={route.warnings} tone="amber" />
        )}
        {route.proposed_labels.length > 0 && (
          <TokenList
            label="Proposed labels"
            values={route.proposed_labels.map((label) => `${label.name} applied: ${String(label.applied)}`)}
          />
        )}
        {route.deferred_side_effects.length > 0 && (
          <TokenList
            label="Deferred side effects"
            values={route.deferred_side_effects.map((effect) => `${effect.side_effect}: ${effect.reason}`)}
          />
        )}
        {route.superseded_artifacts.length > 0 && (
          <TokenList
            label="Superseded routing evidence"
            values={route.superseded_artifacts.map((artifact) => `${artifact.display_name} ${artifact.artifact_id}`)}
          />
        )}
      </div>
    </EvidenceBlock>
  )
}

function EvidenceKV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</dt>
      <dd className="break-words text-foreground/85">{safeText(value)}</dd>
    </div>
  )
}

function TokenList({ label, values, tone }: { label: string; values: readonly string[]; tone?: 'amber' }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</div>
      <ul className="flex flex-wrap gap-1.5">
        {values.map((value, index) => (
          <li
            key={`${label}-${String(index)}-${value}`}
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] break-all ${
              tone === 'amber'
                ? 'border-amber-500/25 text-amber-100'
                : 'border-border/40 text-foreground/80'
            }`}
          >
            {safeText(value)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function EvidenceBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border/30 bg-secondary/20 px-3 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</div>
      {children}
    </div>
  )
}

function ArtifactReferenceRow({ reference }: { reference: ArtifactReference }) {
  return (
    <li className="flex flex-wrap items-center gap-1.5 break-words">
      <span className="font-mono text-[10px] text-muted-foreground">{safeText(reference.kind)}</span>
      <span className="min-w-0 flex-1 break-words text-foreground/85">{safeText(reference.display_name)}</span>
      <StateBadge state={reference.state} />
      {reference.warning_codes.map((warning) => (
        <span key={warning} className="rounded border border-amber-500/25 px-1.5 py-0.5 font-mono text-[10px] text-amber-200 break-all">
          {safeText(warning)}
        </span>
      ))}
    </li>
  )
}

function StateBadge({ state }: { state: EvidenceState }) {
  return (
    <span className="rounded border border-border/40 bg-card/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
      {state}
    </span>
  )
}

function renderGitHubReference(reference: GitHubReference | undefined) {
  if (!reference) return null
  const label = withFallback(safeText(reference.label), `#${String(reference.number)}`)
  if (reference.url && isSafeGithubUrl(reference.url)) {
    return (
      <a
        key={reference.url}
        href={reference.url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[10px] text-primary hover:border-primary/50 break-all"
      >
        {label}
      </a>
    )
  }
  return (
    <span key={`${label}-${String(reference.number)}`} className="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80 break-all">
      {label}
    </span>
  )
}

function isSafeGithubUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com'
  } catch {
    return false
  }
}

function collectUnsupportedStates(evidence: TaskEvidenceResponse): { section: string; state: string }[] {
  const states: { section: string; state: string }[] = [
    { section: 'task', state: evidence.task.state },
    { section: 'pilot_eligibility', state: evidence.pilot_eligibility.state },
    { section: 'identity', state: evidence.identity.state },
    { section: 'packet_artifacts', state: evidence.packet_artifacts.state },
    { section: 'smoke', state: evidence.smoke.state },
    { section: 'current_stage', state: evidence.current_stage.state },
    { section: 'triage_routing', state: evidence.triage_routing.state },
  ]
  for (const reference of evidence.packet_artifacts.references) {
    states.push({ section: `artifact:${reference.artifact_id ?? reference.kind}`, state: reference.state })
  }
  return states
    .filter(({ state }) => !ALLOWED_STATE_SET.has(state))
}

function safeText(value: string | number | undefined | null): string {
  if (value == null) return ''
  return sanitizeEvidenceDisplayText(String(value))
}

function withFallback(value: string, fallback: string): string {
  return value.trim().length > 0 ? value : fallback
}
