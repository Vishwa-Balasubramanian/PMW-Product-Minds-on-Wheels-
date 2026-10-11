import { expect, test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const testDb = path.resolve('..', 'db', 'pmw-smoke-run.sqlite');
const base = 'http://127.0.0.1:3107';
const value = async (page: import('@playwright/test').Page, market: string) =>
  (await page.getByTestId(`happiness-${market}-value`).textContent())?.trim();

test('Happiness Meter shows per-market coverage, unknown for China, and a sales-weighted total', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: base }]);
  await page.goto('/vehicles/G70?view=data');
  await expect(page.getByRole('heading', { name: 'Customer pain addressed' })).toBeVisible();
  expect(await value(page, 'US')).toMatch(/^\d+(\.\d)?%$/);
  // China has no customer comments: never 0% or 100%.
  expect(await value(page, 'CN')).toBe('unknown');
  await expect(page.getByTestId('happiness-total')).toContainText('weighted by 2025 sales');
  await expect(page.getByTestId('happiness-total')).toContainText(/Unknown for China/);
});

test('a market product manager sees only their own market and no total', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'US', url: base }]);
  await page.goto('/vehicles/G70?view=data');
  await expect(page.getByTestId('happiness-US')).toBeVisible();
  await expect(page.getByTestId('happiness-CN')).toHaveCount(0);
  await expect(page.getByTestId('happiness-total')).toHaveCount(0);
});

test('approving a requirement raises the coverage of its market', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: base }]);
  const con = new DatabaseSync(testDb, { readOnly: true });
  const r = con.prepare(
    `SELECT r.id FROM requirements r JOIN signals s ON s.id = r.signal_id AND s.in_scope = 1
     JOIN signal_feedback sf ON sf.signal_id = r.signal_id JOIN feedback f ON f.id = sf.feedback_id
     WHERE r.vehicle = 'G70' AND r.kind = 'signal' AND r.status = 'proposed' AND f.market = 'US'
     GROUP BY r.id ORDER BY COUNT(*) DESC LIMIT 1`,
  ).get() as { id: string } | undefined;
  con.close();
  expect(r).toBeTruthy();
  await page.goto('/vehicles/G70?view=data');
  const before = parseFloat((await value(page, 'US')) ?? '');
  try {
    const res = await page.request.post(`/api/requirements/${r!.id}`, { data: { action: 'approve', rationale: 'Happiness Meter test' } });
    expect(res.ok()).toBeTruthy();
    await page.reload();
    expect(parseFloat((await value(page, 'US')) ?? '')).toBeGreaterThan(before);
  } finally {
    await page.request.post(`/api/requirements/${r!.id}`, { data: { action: 'reopen' } });
  }
});
