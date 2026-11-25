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
  // Simulate the extension's one-time receipt: it confirms exactly the delivered title and text, once.
  await page.evaluate(() => {
    const delivered = { title: 'Selected order', text: 'Service deposit: $9,150 for the initial review.' };
    let used = false;
    window.__receiptChecks = [];
    window.chrome = { runtime: { sendMessage: (id, msg, cb) => {
      window.__receiptChecks.push(id);
      const ok = !used && id === 'bjcpdpdkofjdbcaekocglpijpijjeeac' && msg.type === 'veilbench.verify.v1'
        && msg.title === delivered.title && msg.text === delivered.text;
      if (ok) used = true;
      cb(ok);
    } } };
  });
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
  expect(await page.evaluate(() => window.__receiptChecks)).toEqual(['bjcpdpdkofjdbcaekocglpijpijjeeac']);
});

test('an intake message without the extension receipt is ignored', async ({ page }) => {
  await expect(page.getByTestId('hero-run-demo')).toBeVisible();
  await page.evaluate(() => {
    window.postMessage({ type: 'veilbench.intake.v1', title: 'Forged', text: 'Pay $1 to someone else.' }, window.location.origin);
  });
  await page.waitForTimeout(3500); // longer than the receipt timeout
  await expect(page.getByText(/Received "Forged\.txt"/)).toHaveCount(0);
  await expect(page.getByTestId('hero-run-demo')).toBeVisible();
});

test('a relay link fragment is stripped before any request and never leaves the page', async ({ page, context }) => {
  const id = '0123456789abcdef0123456789abcdef';
  const seen = [];
  context.on('request', request => seen.push(request.url()));
  await page.goto('/#relay=' + id);
  await expect(page.getByTestId('relay-panel')).toBeVisible();
  expect(page.url()).not.toContain('relay=');
  expect(await page.evaluate(() => window.location.hash)).toBe('');
  expect(seen.filter(url => url.includes(id))).toEqual([]);
  await expect(page.locator('#relay-link')).toHaveValue('');
});

test('cancelling an in-flight run leaves no failure card or late result', async ({ page }) => {
  await page.evaluate(() => {
    window.__holdTriage = signal => new Promise(resolve => {
      window.__triageSignal = signal;
      window.__finishTriage = resolve;
    });
  });
  await page.getByRole('button', { name: sample }).click();
  const triage = page.getByRole('button', { name: /Stage 2 · Rapid Triage/ });
  await triage.click();
  await page.waitForFunction(() => typeof window.__finishTriage === 'function');
  await page.getByTestId('cancel-run').click();
  await expect(page.getByText(/^Cancelled\./)).toBeVisible();
  expect(await page.evaluate(() => window.__triageSignal.aborted)).toBe(true);
  await page.evaluate(async () => {
    window.__finishTriage();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(triage).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dismiss error' })).toHaveCount(0);
  await expect(page.getByText('Offline payment review', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('decision-card')).toHaveCount(0);
});

test('opening or pasting an invalid iPhone link displays a clear error', async ({ page }) => {
  const malformed = 'https://veilbench-hybrid-ai.web.app/#relay=invalid';
  const panel = page.getByTestId('relay-panel');
  const message = 'Paste the link shared from VeilBench Pocket on your iPhone.';
  await page.getByTestId('relay-open').click();
  await panel.getByLabel('Shared link').fill(malformed);
  await panel.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveText(message);
  await expect(page.getByTestId('relay-result')).toHaveCount(0);
  // A fresh visit exercises captureRelayFragment before React subscribes to hash changes.
  await page.goto('about:blank');
  await page.goto('/#relay=invalid');
  await expect(panel.getByRole('alert')).toHaveText(message);
  expect(await page.evaluate(() => location.hash)).toBe('');
  await expect(page.getByTestId('relay-result')).toHaveCount(0);
});
