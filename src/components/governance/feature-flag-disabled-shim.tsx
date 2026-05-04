/**
 * SPEC-008 — Feature-flag-disabled empty/disabled state shim (T165).
 *
 * Rendered by every governance subview when
 * `resolveFlag('FEATURE_RESOURCE_GOVERNANCE', ctx)` is OFF for the
 * caller's workspace. Per FR-188, the disabled state MUST:
 *
 *   - Be visible to viewers + operators (but read-only)
 *   - Carry a clear, neutral "feature disabled" message
 *   - NOT call the governance REST surface (no fetch on render)
 *   - Carry an `aria-label` describing the disabled state for SR users
 *
 * The shim is intentionally minimal — when the flag is OFF, the
 * dashboard displays nothing more than a pointer to the workspace
 * admin who can opt in. This keeps the flag-OFF byte-compat surface
 * (FR-186, FR-193) tiny and easy to verify.
 *
 * @see specs/008-resource-governance/spec.md FR-188, FR-305
 * @see specs/008-resource-governance/tasks.md T165
 */

import type { ReactNode } from 'react';

export interface FeatureFlagDisabledShimProps {
  /** Subview label, e.g. "Policies" — appears in the message body. */
  subviewLabel: string;
  /** Optional override for the help text. */
  helpText?: string;
  /** Optional href to the workspace flag-management UI. */
  manageFlagHref?: string;
}

/**
 * Render the "feature disabled" placeholder.
 *
 * Render path is pure — no `useEffect` / `fetch` — so the component
 * is server-renderable and produces zero network traffic when the
 * flag is OFF.
 */
export function FeatureFlagDisabledShim(
  props: FeatureFlagDisabledShimProps,
): ReactNode {
  const message =
    props.helpText ??
    'Resource governance is not enabled for this workspace. Ask your admin to opt in to the FEATURE_RESOURCE_GOVERNANCE flag.';
  return (
    <div
      role="region"
      aria-label={`${props.subviewLabel} (disabled by feature flag)`}
      className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-6 text-center text-sm text-muted-foreground"
      data-feature-flag="FEATURE_RESOURCE_GOVERNANCE"
      data-feature-flag-state="off"
    >
      <p className="mb-2 font-medium text-foreground">
        {props.subviewLabel} unavailable
      </p>
      <p>{message}</p>
      {props.manageFlagHref !== undefined ? (
        <p className="mt-3 text-xs">
          <a
            href={props.manageFlagHref}
            className="text-primary underline underline-offset-2"
          >
            Manage feature flags
          </a>
        </p>
      ) : null}
    </div>
  );
}
