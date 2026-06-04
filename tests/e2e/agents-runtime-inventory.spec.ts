import { expect, test } from '@playwright/test'

test.skip('SPEC-014B agents runtime inventory UAT scaffold requires authenticated disposable workspace fixtures', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.setContent(`
    <main aria-label="Runtime inventory evidence">
      <section>
        <h1>Runtime inventory evidence</h1>
        <article aria-label="Runtime inventory Paddock-owned sandbox fake">
          <h2>Paddock-owned sandbox fake</h2>
          <p>State: eligible</p>
          <p>Manifest: paddock_owned_sandbox_fake</p>
          <p>Lifecycle references: 77:running</p>
        </article>
        <article aria-label="Runtime inventory External harness fake">
          <h2>External harness fake</h2>
          <p>State: blocked</p>
          <p>Reason codes: adapter_unassigned, capability_unsupported</p>
        </article>
      </section>
    </main>
  `)
  await expect(page.getByRole('main', { name: /runtime inventory evidence/i })).toBeVisible()
  await expect(page.getByText(/state: eligible/i)).toBeVisible()
  await expect(page.getByText(/state: blocked/i)).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('article', { name: /paddock-owned sandbox fake/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /launch|retry|assign|lifecycle/i })).toHaveCount(0)
})
