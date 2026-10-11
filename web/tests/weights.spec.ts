import { expect, test, type Page } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const testDb = path.resolve('..', 'db', 'pmw-smoke-run.sqlite');
const db = () => new DatabaseSync(testDb, { readOnly: true });
const base = 'http://127.0.0.1:3107';

/** The ranked list as "priority: title" in display order. */
async function ranked(page: Page): Promise<string[]> {
  const labels = await page.locator('aside section[aria-label] a[aria-label]').evaluateAll(
    (as) => as.map((a) => a.getAttribute('aria-label') ?? ''));
  return labels.map((l) => l.replace(/^.*?, priority /, ''));
}

test('priority weights re-rank the 7 Series, are audited, persist and reset exactly', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: base }]);
  try {
    await page.goto('/vehicles/G70?view=inbox');
    const before = await ranked(page);
    expect(before.length).toBeGreaterThan(10);
    await expect(page.getByTestId('ranking-note')).toHaveCount(0);

    await page.getByRole('button', { name: /Priority weights/ }).click();
    await page.getByRole('button', { name: 'Customer first', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Priority weights' }).locator('ol li');
    await expect(preview).toHaveCount(5);
    const previewed = (await preview.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());

    // A reason is required.
    await page.getByRole('button', { name: 'Apply to the team' }).click();
    expect(await page.getByLabel('Reason').evaluate((el) => (el as HTMLInputElement).validity.valueMissing)).toBe(true);
    await expect(page.getByTestId('ranking-note')).toHaveCount(0);

    await page.getByLabel('Reason').fill('Rank by customer pain for the 7 Series review');
    await page.getByRole('button', { name: 'Apply to the team' }).click();
    await expect(page.getByTestId('ranking-note')).toContainText('Ranking: Customer first');
    await expect(page.getByTestId('ranking-note')).toContainText('Head of product');

    const after = await ranked(page);
    expect(after).not.toEqual(before);
    expect(after.slice().sort()).not.toEqual(before.slice().sort()); // priorities changed, not just the order
    // The live preview predicted the real top 5 (title and priority, in order).
    after.slice(0, 5).forEach((row, i) => {
      const [priority, title] = [row.split(': ')[0], row.split(': ').slice(1).join(': ')];
      expect(previewed[i]).toContain(title);
      expect(previewed[i].endsWith(priority)).toBeTruthy();
    });

    const con = db();
    try {
      const active = JSON.parse((con.prepare("SELECT value FROM settings WHERE key='weights_active'").get() as { value: string }).value);
      expect(active.preset).toBe('customer_first');
      expect(active.region).toBe('ALL');
      const ev = con.prepare("SELECT * FROM audit_events WHERE entity_type='weights' ORDER BY id DESC LIMIT 1").get() as Record<string, string>;
      expect(ev).toMatchObject({ entity_id: 'priority', field: 'weights', actor_type: 'pm', region: 'ALL', rationale: 'Rank by customer pain for the 7 Series review' });
      expect(JSON.parse(ev.after).impact).toBe(0.45);
      // Stored scores are untouched; only reads re-rank.
      const stored = con.prepare("SELECT COUNT(*) n FROM requirements WHERE vehicle='G70'").get() as { n: number };
      expect(stored.n).toBe(before.length);
    } finally { con.close(); }

    await page.reload();
    expect(await ranked(page)).toEqual(after);

    const csv = await (await page.request.get('/api/export?vehicle=G70&format=csv')).text();
    const firstRow = csv.split('\r\n')[1];
    expect(firstRow).toContain('weight 45%');

    await page.goto('/audit');
    await expect(page.getByText('set priority weights: Customer first').first()).toBeVisible();
    await expect(page.getByText('Rank by customer pain for the 7 Series review').first()).toBeVisible();

    await page.goto('/vehicles/G70?view=inbox');
    await page.getByRole('button', { name: /Priority weights/ }).click();
    await page.getByLabel('Reason').fill('Back to the reviewed defaults');
    await page.getByRole('button', { name: 'Reset to defaults' }).click();
    await expect(page.getByTestId('ranking-note')).toHaveCount(0);
    expect(await ranked(page)).toEqual(before);
  } finally {
    // Weights are global: never leave them set for the other tests.
    await page.request.post('/api/weights', { data: { action: 'reset', rationale: 'Test cleanup' } });
  }
});

test('weights API validates input and writes nothing on error', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'US', url: base }]);
  const count = () => {
    const con = db();
    try { return (con.prepare("SELECT COUNT(*) n FROM audit_events WHERE entity_type='weights'").get() as { n: number }).n; }
    finally { con.close(); }
  };
  const n = count();
  const valid = { impact: 45, frequency: 35, market: 10, competitive: 5, future: 5 };
  for (const data of [
    { action: 'set', weights: valid },
    { action: 'set', weights: valid, rationale: '   ' },
    { action: 'set', weights: { ...valid, impact: 0, frequency: 0, market: 0, competitive: 0, future: 0 }, rationale: 'x' },
    { action: 'set', weights: { ...valid, price: 1 }, rationale: 'x' },
    { action: 'set', weights: { ...valid, future: -1 }, rationale: 'x' },
    { action: 'set', weights: { ...valid, future: 'high' }, rationale: 'x' },
    { action: 'reset', rationale: 'x' }, // already default
    { action: 'drop' },
  ]) {
    const res = await page.request.post('/api/weights', { data });
    expect(res.status(), JSON.stringify(data)).toBe(400);
    expect((await res.json()).ok).toBe(false);
  }
  expect(count()).toBe(n);
});
