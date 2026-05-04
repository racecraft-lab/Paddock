/**
 * SPEC-008 — Governance UI a11y wiring tests (T201 + T202).
 *
 * T201 — Keyboard navigation + ARIA roles for tab list / panel /
 * form components per FR-200 baseline.
 *
 * T202 — `aria-describedby` from form to `role="alert"` error-summary
 * on 409 / 412 / 422 / 423 modals per FR-090p(d).
 *
 * The tests render the relevant components and assert the ARIA
 * attributes are present. Full axe-core integration runs in
 * Storybook visual pipeline — this file is the unit-level guard
 * that the source markup carries the wiring axe-core would check.
 *
 * @see specs/008-resource-governance/tasks.md T201, T202
 */

import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BulkPromoteModal } from '../bulk-promote-modal';
import { DiagnosticFeed } from '../diagnostic-feed';
import { GovernanceTab } from '../governance-tab';
import { OverrideGrantForm } from '../override-grant-form';

describe('SPEC-008 governance UI a11y wiring (T201 + T202)', () => {
  it('GovernanceTab renders role=tablist + role=tab + role=tabpanel with aria-controls + aria-labelledby', () => {
    const html = renderToString(<GovernanceTab />);
    expect(html).toMatch(/role="tablist"/);
    expect(html).toMatch(/role="tab"/);
    expect(html).toMatch(/role="tabpanel"/);
    expect(html).toMatch(/aria-controls="governance-panel-policies"/);
    expect(html).toMatch(/aria-labelledby="governance-tab-policies"/);
    // aria-selected toggles per active tab.
    expect(html).toMatch(/aria-selected="true"/);
  });

  it('OverrideGrantForm in error_422 state wires aria-describedby to role=alert error-summary (FR-090p)', () => {
    const html = renderToString(
      <OverrideGrantForm
        state="error_422"
        errorMessage="Validation failed"
        validationIssues={[
          { field_path: 'reason', message: 'reason is required', code: 'required' },
        ]}
      />,
    );
    expect(html).toMatch(/aria-describedby="override-grant-error-summary"/);
    expect(html).toMatch(/id="override-grant-error-summary"/);
    // role="alert" surrounds the summary.
    expect(html).toMatch(/role="alert"/);
  });

  it('OverrideGrantForm in error_423 state surfaces alert summary for governance_grants_disabled', () => {
    const html = renderToString(
      <OverrideGrantForm
        state="error_423"
        errorMessage="grants disabled"
      />,
    );
    expect(html).toMatch(/role="alert"/);
    expect(html).toMatch(/aria-describedby="override-grant-error-summary"/);
  });

  it('BulkPromoteModal carries role=dialog + aria-modal + aria-labelledby + aria-describedby', () => {
    const html = renderToString(
      <BulkPromoteModal
        policyCount={5}
        targetWorkspaceLabel="alpha"
        confirmationPhrase="PROMOTE 5 POLICIES"
      />,
    );
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
    expect(html).toMatch(/aria-labelledby="bulk-promote-heading"/);
    expect(html).toMatch(/aria-describedby="bulk-promote-description"/);
  });

  it('DiagnosticFeed live region carries aria-live=polite + aria-relevant=additions (FR-090o)', () => {
    const html = renderToString(
      <DiagnosticFeed
        state="ready"
        events={[
          {
            id: 1,
            decision: 'allow',
            reason_code: 'within_budget',
            scope_kind: 'workspace',
            scope_id: 1,
            policy_id: null,
            observed_amount: 0,
            observed_unit: 'usd',
            captured_at: '2026-05-02T15:30:00Z',
          },
        ]}
      />,
    );
    expect(html).toMatch(/aria-live="polite"/);
    expect(html).toMatch(/aria-relevant="additions"/);
    expect(html).toMatch(/role="feed"/);
  });
});
