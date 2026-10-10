import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import path from 'node:path';

const testDb = path.resolve('..', 'db', 'pmw-smoke-run.sqlite');
const db = () => new Database(testDb, { readonly: true, fileMustExist: true });

test('G70 displays a complete offline requirement ladder', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: 'http://127.0.0.1:3107' }]);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/vehicles/G70');
  await expect(page.getByRole('heading', { name: 'BMW 7 Series', exact: true })).toBeVisible();
  await expect(page.getByText('Evidence-based draft · needs validation', { exact: false })).toBeVisible();
  await expect(page.getByText(/Working hypothesis:/)).toBeVisible();
  await expect(page.getByText(/The successor vehicle shall/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('challenge reduces confidence, moves quadrant and records an audit trail', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: 'http://127.0.0.1:3107' }]);
  const con = db();
  try {
    const r = con.prepare(`SELECT id,confidence,challenge FROM requirements
      WHERE vehicle='G70' AND quadrant='act' AND challenged=0
      AND json_extract(challenge,'$.revised_confidence') < 58 LIMIT 1`).get() as
      { id: string; confidence: number; challenge: string };
    expect(r).toBeTruthy();
    await page.goto(`/vehicles/G70?req=${r.id}`);
    await page.getByRole('button', { name: 'Challenge', exact: true }).click();
    await page.getByLabel('What do you doubt? (optional)').fill('Check missing market voices before approval.');
    await page.getByRole('button', { name: 'Run the challenge', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Challenge result', exact: true })).toBeVisible();
    await expect(page.getByText(/This recommendation could be wrong/)).toBeVisible();
    await expect(page.getByText(/Priority ranges from/)).toBeVisible();
    const updated = con.prepare('SELECT confidence,quadrant,challenged FROM requirements WHERE id=?').get(r.id) as
      { confidence: number; quadrant: string; challenged: number };
    expect(updated.confidence).toBe(JSON.parse(r.challenge).revised_confidence);
    expect(updated.confidence).toBeLessThan(r.confidence);
    expect(updated.quadrant).toBe('validate');
    const events = con.prepare('SELECT action FROM audit_events WHERE entity_id=?').all(r.id) as { action: string }[];
    expect(events.map(e => e.action)).toEqual(expect.arrayContaining(['challenged requirement','revised confidence','moved quadrant']));
    const repeated = await page.request.post(`/api/requirements/${r.id}`, { data: { action: 'challenge' } });
    expect(repeated.ok()).toBeTruthy();
    expect((con.prepare('SELECT confidence FROM requirements WHERE id=?').get(r.id) as { confidence: number }).confidence).toBe(updated.confidence);
    await page.screenshot({ path: 'test-results/g70-challenge.png', fullPage: true });
  } finally { con.close(); }
});

test('China gets summaries without US quotes in HTML or serialized props', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'CN', url: 'http://127.0.0.1:3107' }]);
  const con = db();
  try {
    const r = con.prepare(`SELECT id,customer_voice FROM requirements WHERE vehicle='G70'
      AND markets LIKE '%CN%' ORDER BY priority DESC LIMIT 1`).get() as { id: string; customer_voice: string };
    const response = await page.goto(`/vehicles/G70?req=${r.id}`);
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText('No supporting customer quote is available in your selected region.')).toBeVisible();
    const html = await response!.text();
    // Check a distinctive span of the original raw quote, including hidden RSC props.
    const rawSpan = r.customer_voice.slice(1, 70);
    expect(html).not.toContain(rawSpan);
    expect(await page.locator('body').innerText()).not.toContain(rawSpan);
    expect(con.prepare("SELECT id FROM audit_events WHERE entity_id=? AND region='CN' AND action='viewed evidence (other markets restricted)'").get(r.id)).toBeTruthy();
  } finally { con.close(); }
});

test('data health reports provisional classification and remaining gaps', async ({ page }) => {
  await page.goto('/vehicles/G70?view=data');
  await expect(page.getByText(/comments remain without a topic label;/)).toBeVisible();
  await expect(page.getByText(/rule-labelled/)).toBeVisible();
  await expect(page.getByText('No customer comments from CN.', { exact: true })).toBeVisible();
});
