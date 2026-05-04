/**
 * SPEC-008 — axe-core fixture shim for Playwright.
 *
 * Bakes the WCAG 2.1 AA scan into a single canonical hook so every
 * SPEC-008 e2e spec can `await axeAssert(page, 'state-name')` without
 * recapturing the boilerplate. Closes the advisor-flagged "axe-core
 * trap": if T299-T308 hand-add per-state assertions inconsistently,
 * T319 (the CI scanner) will fail closed and force a re-author.
 *
 * The dependency `@axe-core/playwright` is gated behind the env var
 * `SPEC_008_AXE_ENABLED=1`. When the dep is installed AND the env var
 * is set, the scan runs and any `serious|critical` violation throws.
 * When the dep is missing (typical during initial bring-up), the
 * fixture records a `governance_a11y_scan_skipped` console warning
 * and returns — letting the test continue. CI bootstrap installs the
 * dep + sets `SPEC_008_AXE_ENABLED=1` so the gate is real in CI.
 *
 * Static source presence of `axeAssert(` calls is what
 * `scripts/spec-008/check-axe-coverage.mjs` (T319) scans for; the
 * runtime shim is decoupled.
 *
 * @see specs/008-resource-governance/spec.md FR-090n WCAG 2.1 AA
 * @see specs/008-resource-governance/tasks.md T298, T299..T308, T319
 */

import type { Page } from '@playwright/test'

/**
 * Run axe-core against the current page state and assert no
 * serious|critical violations. Stores the scan label so the runner
 * can attribute violations to the operator-meaningful state name.
 *
 * The scan is **scoped to SPEC-008 surfaces** by default (any element
 * with a `data-testid` that begins with `governance-`). Constitution XIV
 * NON-NEGOTIABLE applies to *new* SPEC-008 UI; pre-existing a11y
 * issues elsewhere on the cost-tracker page are out-of-scope for this
 * spec and tracked separately. Pass an explicit `contextSelector` to
 * override.
 *
 * @param page The Playwright page handle.
 * @param stateLabel Operator-meaningful name for the page-state.
 *  Examples: 'wip-policy.empty', 'wip-policy.dense', 'budget.95pct'.
 * @param contextSelector Optional CSS selector that scopes the scan
 *  to a specific subtree. Defaults to the governance tabpanel
 *  (`[data-testid^='governance-'][role='tabpanel']`).
 */
export async function axeAssert(
  page: Page,
  stateLabel: string,
  contextSelector?: string,
): Promise<void> {
  if (process.env.SPEC_008_AXE_ENABLED !== '1') {
    // Per FR-090n the scan is required in CI; in local dev we skip
    // to avoid forcing every contributor to install the dep.
    console.warn(
      `[spec-008] axe scan skipped for state="${stateLabel}" (SPEC_008_AXE_ENABLED!=1)`,
    )
    return
  }

  // Defer import so test files don't require the module at module
  // resolution time — only when the runtime gate is on.
  const dyn = (Function('m', 'return import(m)') as unknown) as (m: string) => Promise<unknown>
  let mod:
    | {
        injectAxe: (page: Page) => Promise<void>
        checkA11y: (page: Page, ctx: unknown, opts: unknown) => Promise<void>
      }
    | undefined
  try {
    mod = (await dyn('axe-playwright')) as typeof mod
  } catch {
    mod = undefined
  }

  if (!mod || typeof mod.injectAxe !== 'function') {
    // Fail closed under the runtime gate: Constitution XIV requires a
    // real a11y gate in CI. Silent skip would mask coverage regressions
    // (FR-090n WCAG 2.1 AA). When the flag is OFF we never reach this
    // branch — local devs without the dep installed still bypass via
    // the early return above.
    throw new Error(
      'SPEC-008: axe-playwright not installed but SPEC_008_AXE_ENABLED=1 (Constitution XIV gate)',
    )
  }

  await mod.injectAxe(page)
  // Default scope: the governance tabpanel(s) only. Constitution XIV
  // applies to SPEC-008-owned UI; pre-existing cost-tracker-panel /
  // workspace-shell a11y issues are out of scope for this spec.
  const defaultScope = `[data-testid^='governance-'][role='tabpanel']`
  let scope = contextSelector ?? defaultScope
  try {
    await page.waitForSelector(scope, { timeout: 10_000 })
  } catch (error) {
    if (contextSelector !== undefined) throw error
    scope = 'body'
  }
  await mod.checkA11y(page, scope, {
    detailedReport: true,
    detailedReportOptions: { html: false },
    axeOptions: {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    },
    includedImpacts: ['serious', 'critical'],
  })
}
