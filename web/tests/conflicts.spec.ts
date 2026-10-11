import { expect, test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const testDb = path.resolve('..', 'db', 'pmw-smoke-run.sqlite');
const db = () => new DatabaseSync(testDb, { readOnly: true });
const base = 'http://127.0.0.1:3107';

/** Requirement IDs of the rows currently listed. */
const listed = (page: import('@playwright/test').Page) =>
  page.locator('.requirement-row').evaluateAll(as => as.map(a => new URL((a as HTMLAnchorElement).href).searchParams.get('req')));

test('conflicts chip lists market conflict cards per region; US sees none', async ({ page, context }) => {
  const con = db();
  try {
    const conflicts = (con.prepare("SELECT id FROM requirements WHERE vehicle='G70' AND kind='market_conflict'").all() as { id: string }[])
      .map(r => r.id).sort();
    expect(conflicts.length).toBe(3);
    for (const region of ['ALL', 'CN']) {
      await context.addCookies([{ name: 'pmw_region', value: region, url: base }]);
      await page.goto('/vehicles/G70?view=inbox');
      await expect(page.getByRole('link', { name: `Conflicts ${conflicts.length}`, exact: true })).toBeVisible();
      await page.getByRole('link', { name: `Conflicts ${conflicts.length}`, exact: true }).click();
      await expect(page).toHaveURL(/[?&]q=conflict/);
      await expect(page.locator('.requirement-row')).toHaveCount(conflicts.length);
      expect((await listed(page)).sort()).toEqual(conflicts);
      await expect(page.locator('.requirement-rows').getByText('Market conflict', { exact: true })).toHaveCount(conflicts.length);
    }

    await context.addCookies([{ name: 'pmw_region', value: 'US', url: base }]);
    await page.goto('/vehicles/G70?view=inbox');
    await expect(page.getByRole('link', { name: 'Conflicts 0', exact: true })).toBeVisible();
    for (const id of conflicts) expect(await listed(page)).not.toContain(id);
    await page.goto('/vehicles/G70?q=conflict');
    await expect(page.getByText('No market conflicts with evidence in United States.')).toBeVisible();
    await expect(page.getByTestId('conflict-block')).toHaveCount(0);
  } finally { con.close(); }
});

test('global or market-specific block shows survey means and records the scope decision', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: base }]);
  const con = db();
  const r = con.prepare("SELECT id,title FROM requirements WHERE vehicle='G70' AND kind='market_conflict' AND title LIKE 'Front interior%'")
    .get() as { id: string; title: string };
  con.close();
  expect(r).toBeTruthy();
  try {
    await page.goto(`/vehicles/G70?q=conflict&req=${r.id}`);
    await expect(page.getByRole('heading', { name: r.title, exact: true })).toBeVisible();
    const block = page.getByTestId('conflict-block');
    await expect(block.getByRole('heading', { name: 'Global or market-specific?' })).toBeVisible();
    await expect(block).toContainText('Front interior roominess');
    await expect(block.getByTestId('conflict-mean-CN')).toContainText('7.69');
    await expect(block.getByTestId('conflict-mean-EU')).toContainText('9.69');
    await expect(block.getByTestId('conflict-gap')).toHaveText('2.00');
    await expect(block).toContainText('23.8%');
    await expect(block).toContainText('31.0%');
    await expect(block).toContainText('CN/EU customer study 2025, means only, no sample sizes');
    await expect(block).toContainText('China has no customer comments');
    await expect(block.getByRole('button', { name: 'Approve as China-specific' })).toBeVisible();
    // The general Approve is hidden: a conflict card can only be approved with a scope.
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);

    // No horizontal overflow at phone width.
    await page.setViewportSize({ width: 375, height: 812 });
    await block.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.screenshot({ path: 'test-results/conflict-block-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    await block.getByRole('button', { name: 'Approve as global requirement' }).click();
    await expect(page.getByTestId('conflict-decision')).toContainText('Approved as global requirement');
    await expect(block.getByRole('button', { name: /^Approve as/ })).toHaveCount(0);
    const audit = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Audit trail', exact: true }) });
    await expect(audit.getByText('“Scope decision: global requirement.”')).toBeVisible();
    await page.screenshot({ path: 'test-results/conflict-block-desktop.png', fullPage: true });

    const check = db();
    try {
      expect((check.prepare('SELECT status FROM requirements WHERE id=?').get(r.id) as { status: string }).status).toBe('approved');
      const e = check.prepare("SELECT rationale FROM audit_events WHERE entity_id=? AND field='status' AND after='approved' ORDER BY id DESC")
        .get(r.id) as { rationale: string };
      expect(e.rationale).toBe('Scope decision: global requirement.');
    } finally { check.close(); }
  } finally {
    // Leave the shared test database as other specs expect it.
    await page.request.post(`/api/requirements/${r.id}`, { data: { action: 'reopen', rationale: 'Reset after the scope decision test.' } });
  }
});
