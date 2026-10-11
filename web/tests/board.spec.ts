import { expect, test, type Page } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const base = 'http://127.0.0.1:3107';
const testDb = path.resolve('..', 'db', 'pmw-smoke-run.sqlite');
const read = <T,>(sql: string, ...args: (string | number)[]) => {
  const con = new DatabaseSync(testDb, { readOnly: true });
  try { return con.prepare(sql).all(...args) as T[]; } finally { con.close(); }
};
const write = (sql: string, ...args: (string | number)[]) => {
  const con = new DatabaseSync(testDb);
  try { con.prepare(sql).run(...args); } finally { con.close(); }
};
const region = (page: Page, value: string) => page.context().addCookies([{ name: 'pmw_region', value, url: base }]);
const column = (page: Page, title: string) => page.locator('.board-column').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const card = (page: Page, id: string) => page.locator(`[data-card-id="${id}"]`);

test('board and KPIs show every accessible requirement in exactly one status column', async ({ page }) => {
  await region(page, 'ALL');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Product Requirements Board', level: 1 })).toBeVisible();
  const counts = Object.fromEntries(read<{ status: string; n: number }>('SELECT status, COUNT(*) n FROM requirements GROUP BY status').map((r) => [r.status, r.n]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  for (const [title, status] of [['To Review', 'proposed'], ['Needs Validation', 'validate'], ['Edited / Re-review', 'edited'], ['Approved', 'approved'], ['Rejected', 'rejected']]) {
    await expect(column(page, title).locator('.board-count')).toHaveText(String(counts[status] ?? 0));
    await expect(column(page, title).locator('.board-card')).toHaveCount(counts[status] ?? 0);
  }
  const kpi = (label: string) => page.locator('.board-kpis div').filter({ hasText: label }).locator('dd');
  await expect(kpi('Awaiting Review')).toHaveText(String((counts.proposed ?? 0) + (counts.edited ?? 0)));
  await expect(kpi('Needs Validation')).toHaveText(String(counts.validate ?? 0));
  await expect(kpi('Approved')).toHaveText(String(counts.approved ?? 0));
  await expect(kpi('Total Requirements')).toHaveText(String(total));

  // Region and vehicle scope: a US product manager sees only requirements with US evidence.
  await region(page, 'US');
  await page.goto('/?vehicle=G70');
  const us = read<{ n: number }>("SELECT COUNT(*) n FROM requirements WHERE vehicle='G70' AND markets LIKE '%\"US\"%'")[0].n;
  await expect(kpi('Total Requirements')).toHaveText(String(us));
  await expect(page.locator('.board-card')).toHaveCount(us);
});

test('filters, search, sort and list view use real scores', async ({ page }) => {
  await region(page, 'ALL');
  const threshold = JSON.parse(read<{ value: string }>("SELECT value FROM settings WHERE key='weights'")[0].value).thresholds.confidence;
  await page.goto('/vehicles/G60?conf=low');
  const scores = await page.locator('.board-card-scores dd.is-weak').allTextContents();
  expect(scores.length).toBe(read<{ n: number }>("SELECT COUNT(*) n FROM requirements WHERE vehicle='G60' AND confidence < ?", threshold)[0].n);
  const target = read<{ id: string; title: string }>("SELECT id, title FROM requirements WHERE vehicle='F70' ORDER BY priority DESC LIMIT 1")[0];
  await page.goto('/');
  await page.getByLabel('Search').fill(target.id);
  await expect(page.locator('.board-card')).toHaveCount(1);
  await expect(card(page, target.id)).toBeVisible();
  await page.goto('/?sort=confidence&layout=list');
  const lowest = read<{ confidence: number }>('SELECT MIN(confidence) confidence FROM requirements')[0].confidence;
  await expect(page.locator('.board-list tbody tr').first().locator('td.num').nth(1)).toHaveText(String(lowest));
});

test('a card opens the evidence drawer and Escape closes it', async ({ page }) => {
  await region(page, 'ALL');
  const r = read<{ id: string; title: string }>("SELECT id, title FROM requirements WHERE vehicle='G70' AND kind='signal' AND status='proposed' ORDER BY priority DESC LIMIT 1")[0];
  await page.goto('/vehicles/G70');
  await card(page, r.id).locator('.board-card-title').click();
  const drawer = page.getByRole('dialog', { name: new RegExp(r.id) });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('tab', { name: 'Evidence', exact: true }).click();
  await expect(drawer.getByRole('tab', { name: 'Evidence', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(drawer.getByText('Why the AI recommends this.')).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('open')).toBeNull();
});

test('moving cards uses existing actions, needs confirmation and is audited', async ({ page }) => {
  await region(page, 'ALL');
  const r = read<{ id: string; status: string; updated_at: string }>("SELECT id, status, updated_at FROM requirements WHERE vehicle='G70' AND status='proposed' ORDER BY priority ASC LIMIT 1")[0];
  const status = () => read<{ status: string }>('SELECT status FROM requirements WHERE id=?', r.id)[0].status;
  const move = async (to: string) => {
    await card(page, r.id).getByRole('button', { name: `Move ${r.id}` }).click();
    await page.getByRole('menuitem', { name: `Move to ${to}` }).click();
  };
  try {
    await page.goto(`/vehicles/G70?search=${r.id}`);
    // Cancelling the confirmation writes nothing.
    await move('Approved');
    await expect(page.getByRole('dialog', { name: 'Approve this requirement?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(status()).toBe('proposed');

    // Rejection needs a reason before the server is called.
    await move('Rejected');
    await page.getByRole('button', { name: 'Confirm rejection' }).click();
    await expect(page.getByRole('dialog', { name: 'Reject this requirement?' })).toBeVisible();
    expect(status()).toBe('proposed');
    await page.getByLabel('Reason').fill('Board test: defer until China evidence exists.');
    await page.getByRole('button', { name: 'Confirm rejection' }).click();
    await expect(column(page, 'Rejected').locator(`[data-card-id="${r.id}"]`)).toBeVisible();
    expect(status()).toBe('rejected');

    // A decided card cannot jump to another decision; it must be reopened first.
    await move('Approved');
    await expect(page.getByRole('status').filter({ hasText: 'Reopen' })).toBeVisible();
    expect(status()).toBe('rejected');
    await move('To Review');
    await page.getByRole('button', { name: 'Reopen', exact: true }).click();
    await expect(column(page, 'To Review').locator(`[data-card-id="${r.id}"]`)).toBeVisible();

    // Drag and drop opens the same confirmation.
    await card(page, r.id).dragTo(column(page, 'Needs Validation'));
    await expect(page.getByRole('dialog', { name: 'Request validation?' })).toBeVisible();
    await page.getByLabel('What needs validating?').fill('Board test: check with a European clinic.');
    await page.getByRole('button', { name: 'Request validation' }).click();
    await expect(column(page, 'Needs Validation').locator(`[data-card-id="${r.id}"]`)).toBeVisible();
    expect(status()).toBe('validate');

    // Edited needs real text changes, so the board opens the requirement instead of faking a status.
    await move('Edited / Re-review');
    await expect(page.getByRole('dialog', { name: new RegExp(r.id) })).toBeVisible();
    expect(status()).toBe('validate');

    const actions = read<{ action: string; rationale: string | null }>("SELECT action, rationale FROM audit_events WHERE entity_id=? AND actor_type='pm' ORDER BY id", r.id).map((e) => e.action);
    expect(actions).toEqual(['rejected requirement', 'reopened requirement', 'requested validation before deciding']);
  } finally {
    write('UPDATE requirements SET status=?, updated_at=? WHERE id=?', r.status, r.updated_at, r.id);
  }
});

test('board fits a mobile screen and the drawer works there', async ({ page }) => {
  await region(page, 'ALL');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.board-card-title').first().click();
  const drawer = page.locator('.drawer-panel');
  await expect(drawer).toBeVisible();
  const box = (await drawer.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.width).toBeLessThanOrEqual(390);
  await page.getByRole('link', { name: 'Close requirement panel' }).last().click();
  await expect(drawer).toHaveCount(0);
});
