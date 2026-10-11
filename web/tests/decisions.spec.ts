import { expect, test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const base = 'http://127.0.0.1:3107';
const db = () => new DatabaseSync(path.resolve('..', 'db', 'pmw-smoke-run.sqlite'), { readOnly: true });

test('decision board places each visible requirement once, in its stored status column', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'EU', url: base }]);
  await page.goto('/vehicles/G70?view=decisions');
  const con = db();
  try {
    const rows = con.prepare(`SELECT id, status FROM requirements WHERE vehicle='G70' AND markets LIKE '%"EU"%'`).all() as { id: string; status: string }[];
    await expect(page.getByTestId('decision-card')).toHaveCount(rows.length);
    for (const s of ['proposed', 'validate', 'edited', 'approved', 'rejected']) {
      await expect(page.getByTestId(`decision-${s}`).getByTestId('decision-card')).toHaveCount(rows.filter(r => r.status === s).length);
    }
    await expect(page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Decisions', exact: true })).toHaveAttribute('aria-current', 'page');
  } finally { con.close(); }
});

test('moving a card runs the decision action with its reason, and the card can be reopened', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: base }]);
  const con = db();
  const r = con.prepare("SELECT id, title FROM requirements WHERE vehicle='F70' AND kind='signal' AND status='proposed' ORDER BY priority ASC LIMIT 1").get() as { id: string; title: string };
  const status = () => (con.prepare('SELECT status FROM requirements WHERE id=?').get(r.id) as { status: string }).status;
  try {
    await page.goto('/vehicles/F70?view=decisions');
    const card = page.locator(`[data-testid="decision-card"][data-requirement-id="${r.id}"]`);
    await card.getByLabel(`Move ${r.title} to`).selectOption('rejected');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Confirm rejection' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Add a short reason');
    await dialog.getByRole('textbox').fill('Covered by another requirement');
    await dialog.getByRole('button', { name: 'Confirm rejection' }).click();
    await expect(page.getByTestId('decision-rejected').locator(`[data-requirement-id="${r.id}"]`)).toBeVisible();
    expect(status()).toBe('rejected');
    const audit = con.prepare("SELECT rationale FROM audit_events WHERE entity_id=? AND action='rejected requirement' ORDER BY id DESC LIMIT 1").get(r.id) as { rationale: string };
    expect(audit.rationale).toBe('Covered by another requirement');

    // A decided card cannot jump straight to another decision; it is reopened first.
    const moved = page.locator(`[data-testid="decision-card"][data-requirement-id="${r.id}"]`);
    await moved.getByLabel(`Move ${r.title} to`).selectOption('approved');
    await expect(moved.getByRole('status')).toContainText('Move it to To Review (Reopen)');
    await moved.getByLabel(`Move ${r.title} to`).selectOption('proposed');
    await page.getByRole('dialog').getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByTestId('decision-proposed').locator(`[data-requirement-id="${r.id}"]`)).toBeVisible();
    expect(status()).toBe('proposed');
  } finally { con.close(); }
});

test('a card opens its Decision Card, and the board fits a phone', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: base }]);
  await page.goto('/vehicles/G70?view=decisions');
  const first = page.getByTestId('decision-card').first();
  const id = await first.getAttribute('data-requirement-id');
  await first.getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`req=${id}`));
  await expect(page.getByRole('button', { name: 'Challenge', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vehicles/G70?view=decisions');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByTestId('decision-card').first()).toBeVisible();
});
