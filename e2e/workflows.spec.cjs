const { test, expect } = require(process.env.VB_PLAYWRIGHT_MODULE);
const sample = /Contract \+ Quote Scan/;
test.beforeEach(async ({ page, context, baseURL }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === baseURL || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    window.LanguageModel = { availability: async () => 'available' };
    window.__vbCalls = [];
  });
  await page.goto('/');
});
test('offline Stage 2 produces an on-device result with the simulated model', async ({ page, context }) => {
  await page.getByRole('button', { name: sample }).click();
  const button = page.getByRole('button', { name: /Stage 2 · Rapid Triage \(On-Device\)/ });
  await expect(button).toBeEnabled();
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await button.click();
  await expect(page.getByText('Offline payment review', { exact: true })).toBeVisible();
  const card = page.getByText('Offline payment review', { exact: true }).locator('..').locator('..');
  await expect(card).toContainText('ON_DEVICE');
  expect(await page.evaluate(() => window.__vbCalls.filter(call => !call.online).map(call => call.local))).toEqual([true]);
});
test('Try to leak closes the outbound gate before any cloud call', async ({ page }) => {
  await page.getByRole('button', { name: sample }).click();
  await page.getByRole('button', { name: /Inspect Payload & Proof/ }).click();
  const approve = page.getByRole('button', { name: /Approve & Escalate/ });
  await expect(approve).toBeEnabled();
  await page.getByRole('button', { name: /Try to leak/ }).click();
  await expect(approve).toBeDisabled();
  await expect(page.getByText(/Re-enable redaction toggles/)).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: /Stage 4 · Cross-Doc/ })).toBeDisabled();
  expect(await page.evaluate(() => window.__vbCalls.filter(call => !call.local))).toEqual([]);
});

test('guided demo finishes with a cross-document decision', async ({ page }) => {
  await page.getByTestId('hero-run-demo').click();
  const card = page.getByTestId('decision-card');
  await expect(card).toContainText('Cross-document audit', { timeout: 30_000 });
  await expect(page.getByTestId('decision-verdict')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guided demo', exact: true })).toBeVisible();
});

test('same-window extension intake adds a document and masks the selected text', async ({ page }) => {
  await expect(page.getByTestId('hero-run-demo')).toBeVisible();
  await page.evaluate(() => {
    window.postMessage({
      type: 'veilbench.intake.v1',
      title: 'Selected order',
      text: 'Service deposit: $9,150 for the initial review.',
    }, window.location.origin);
  });
  await expect(page.getByText(/Received "Selected order\.txt"/)).toBeVisible();
  await page.getByRole('button', { name: /Inspect Payload & Proof/ }).click();
  const inspector = page.getByRole('dialog');
  await expect(inspector).toContainText('initial review');
  await expect(inspector).toContainText(/\[MONEY_AMOUNT_\d+\]/);
  await expect(inspector).not.toContainText('$9,150');
  expect(await page.evaluate(() => window.__vbCalls.filter(call => !call.local))).toEqual([]);
});
