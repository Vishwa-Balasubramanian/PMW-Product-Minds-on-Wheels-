import { expect, test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const testDb = path.resolve('..', 'db', 'pmw-smoke-run.sqlite');
const db = () => new DatabaseSync(testDb, { readOnly: true });

test('equipment quick win displays only its matching wishing comments', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: 'http://127.0.0.1:3107' }]);
  const con = db();
  try {
    const r = con.prepare(`SELECT id,title,already_exists FROM requirements
      WHERE vehicle='G60' AND kind='quick_win' AND title LIKE '%ventilated%'`).get() as
      { id: string; title: string; already_exists: string };
    expect(r).toBeTruthy();
    const ids = [...new Set((JSON.parse(r.already_exists) as { feedback_ids: string[] }[])
      .flatMap(m => m.feedback_ids))].sort();
    await page.goto(`/vehicles/G60?req=${r.id}`);
    await expect(page.getByRole('heading', { name: r.title, exact: true })).toBeVisible();
    await expect(page.getByText(/Make ventilated front seats available on the successor/)).toBeVisible();
    expect(r.title).toContain('7VB');
    const evidence = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Customer evidence', exact: true }) });
    const shownIds = await evidence.locator('li .font-mono').allTextContents();
    expect(shownIds.sort()).toEqual(ids);
  } finally { con.close(); }
});

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

test('invalid decision input returns a validation error without changing data', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: 'http://127.0.0.1:3107' }]);
  const con = db();
  try {
    const r = con.prepare("SELECT id,status FROM requirements WHERE vehicle='G60' AND kind='signal' LIMIT 1").get() as { id: string; status: string };
    const before = con.prepare('SELECT COUNT(*) n FROM audit_events WHERE entity_id=?').get(r.id);
    for (const data of [null, [], { action: 'unknown' }, { action: 'approve', rationale: 42 },
      { action: 'edit', rationale: 'review', fields: { title: 42 } },
      { action: 'edit', rationale: 'review', fields: { title: '   ' } },
      { action: 'edit', rationale: 'review', fields: { priority: 100 } }]) {
      const response = await page.request.post(`/api/requirements/${r.id}`, { data });
      expect(response.status(), JSON.stringify(data)).toBe(400);
      expect((await response.json()).ok).toBe(false);
    }
    expect(con.prepare('SELECT status FROM requirements WHERE id=?').get(r.id)?.status).toBe(r.status);
    expect(con.prepare('SELECT COUNT(*) n FROM audit_events WHERE entity_id=?').get(r.id)).toEqual(before);
  } finally { con.close(); }
});

test('switching requirements discards the previous unsaved edit', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: 'http://127.0.0.1:3107' }]);
  const con = db();
  try {
    const rows = con.prepare("SELECT id,title FROM requirements WHERE vehicle='G60' AND kind='signal' ORDER BY priority DESC LIMIT 2").all() as { id: string; title: string }[];
    await page.goto(`/vehicles/G60?req=${rows[0].id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Unsaved text from a different requirement');
    await page.locator(`aside a[href$="req=${rows[1].id}"]`).click();
    await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(rows[1].title);
  } finally { con.close(); }
});

test('decision controls recover from a failed request and prevent duplicate submissions', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: 'http://127.0.0.1:3107' }]);
  await page.goto('/vehicles/G60');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/requirements/*', async route => { await held; await route.abort('failed'); });
  await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
  try {
    await expect(page.getByRole('button', { name: 'Confirm approval', exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(page.getByRole('alert').filter({ hasText: 'Could not save' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm approval', exact: true })).toBeEnabled();
});

test('PM can edit, validate, approve, reopen and reject with an audit trail', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: 'http://127.0.0.1:3107' }]);
  const con = db();
  try {
    const r = con.prepare("SELECT id FROM requirements WHERE vehicle='G60' AND kind='signal' ORDER BY priority ASC LIMIT 1").get() as { id: string };
    const status = () => con.prepare('SELECT status FROM requirements WHERE id=?').get(r.id)?.status;
    await page.goto(`/vehicles/G60?req=${r.id}`);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Controls checked with owners');
    await page.getByLabel('Reason for the edit').fill('Clarify the customer task after review.');
    await page.getByRole('button', { name: 'Save edit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Controls checked with owners', exact: true })).toBeVisible();
    await expect.poll(status).toBe('edited');
    await page.getByRole('button', { name: 'Validate first', exact: true }).click();
    await page.getByLabel('What needs validating?').fill('Run the customer task in Europe.');
    await page.getByRole('button', { name: 'Request validation', exact: true }).click();
    await expect.poll(status).toBe('validate');
    await expect(page.getByLabel('What needs validating?')).toHaveCount(0);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible();
    expect(status()).toBe('approved');
    // A subsequent material edit must receive review again, even via the API.
    const edited = await page.request.post(`/api/requirements/${r.id}`, { data: {
      action: 'edit', rationale: 'New evidence after approval.', fields: { title: 'Controls ready for a second review' } } });
    expect(edited.ok()).toBeTruthy();
    expect(status()).toBe('edited');
    await page.reload();
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
    await page.getByRole('button', { name: 'Reopen', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeVisible();
    expect(status()).toBe('proposed');
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.getByLabel('Reason', { exact: true }).fill('Defer until the missing evidence is collected.');
    await page.getByRole('button', { name: 'Confirm rejection', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible();
    expect(status()).toBe('rejected');
    const events = con.prepare("SELECT action,rationale FROM audit_events WHERE entity_id=? AND actor_type='pm'").all(r.id);
    expect(events.map(e => e.action)).toEqual(expect.arrayContaining([
      'edited title', 'marked requirement for review after edit', 'requested validation before deciding',
      'approved requirement', 'reopened requirement', 'rejected requirement']));
    expect(events.find(e => e.action === 'rejected requirement')?.rationale).toBe('Defer until the missing evidence is collected.');
    await page.goto('/audit?vehicle=G60&who=pm');
    await expect(page.getByText('“Defer until the missing evidence is collected.”', { exact: true })).toBeVisible();
  } finally { con.close(); }
});

test('region restrictions and required reasons protect decision writes', async ({ page, context }) => {
  const con = db();
  try {
    const r = con.prepare("SELECT id,status FROM requirements WHERE vehicle='F70' AND markets NOT LIKE '%US%' LIMIT 1").get() as { id: string; status: string };
    await context.addCookies([{ name: 'pmw_region', value: 'US', url: 'http://127.0.0.1:3107' }]);
    const blocked = await page.request.post(`/api/requirements/${r.id}`, { data: { action: 'approve' } });
    expect(blocked.status()).toBe(400);
    expect((await blocked.json()).error).toContain('region');
    await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: 'http://127.0.0.1:3107' }]);
    for (const action of ['reject', 'validate', 'edit']) {
      const response = await page.request.post(`/api/requirements/${r.id}`, { data: {
        action, rationale: '  ', ...(action === 'edit' ? { fields: { title: 'A proposed edit' } } : {}) } });
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toContain('reason');
    }
    expect(con.prepare('SELECT status FROM requirements WHERE id=?').get(r.id)?.status).toBe(r.status);
  } finally { con.close(); }
});

test('region picker reports failure and can retry successfully on mobile', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'US', url: 'http://127.0.0.1:3107' }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vehicles/G70');
  await page.getByRole('button', { name: /Your region/ }).click();
  await page.getByRole('radio', { name: /^China/ }).check();
  await page.route('**/api/region', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Could not change region');
  await page.unroute('**/api/region');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Your region China/ })).toBeVisible();
  await expect(page.getByText('No supporting customer quote is available in your selected region.')).toBeVisible();
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, viewport: window.innerWidth,
    overflowing: [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > window.innerWidth)
      .slice(0, 8).map(el => `${el.tagName}.${el.className}`),
  }));
  expect(layout.width, layout.overflowing.join('\n')).toBeLessThanOrEqual(layout.viewport);
});

for (const [code, name] of [['F70', 'BMW 1 Series'], ['G60', 'BMW 5 Series'], ['G70', 'BMW 7 Series']]) {
  test(`${code} views render across all five regions`, async ({ page, context }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const region of ['ALL', 'US', 'EU', 'CN', 'ROW']) {
      await context.addCookies([{ name: 'pmw_region', value: region, url: 'http://127.0.0.1:3107' }]);
      for (const view of ['inbox', 'matrix', 'signals', 'data']) {
        const response = await page.goto(`/vehicles/${code}?view=${view}`);
        expect(response?.ok(), `${code}/${region}/${view}`).toBeTruthy();
        await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      }
    }
    expect(errors).toEqual([]);
  });
}

test('home, assets, unknown routes and mismatched selections behave consistently', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: 'http://127.0.0.1:3107' }]);
  const con = db();
  try {
    await page.goto('/');
    for (const name of ['BMW 1 Series', 'BMW 5 Series', 'BMW 7 Series']) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    const photos = con.prepare('SELECT DISTINCT photo FROM requirements WHERE photo IS NOT NULL').all();
    for (const { photo } of photos) {
      const response = await page.request.get(String(photo));
      expect(response.ok(), String(photo)).toBeTruthy();
      expect(response.headers()['content-type']).toContain('image/');
    }
    const other = con.prepare("SELECT id FROM requirements WHERE vehicle='G60' LIMIT 1").get()?.id;
    await page.goto(`/vehicles/G70?req=${other}&view=invalid&q=invalid`);
    await expect(page.getByText('Evidence-based draft · needs validation', { exact: false })).toBeVisible();
    await expect(page.getByText(String(other), { exact: true })).toHaveCount(0);
    expect((await page.request.get('/vehicles/UNKNOWN')).status()).toBe(404);
    expect((await page.request.post('/api/region', { data: { region: 'UNKNOWN' } })).status()).toBe(400);
    const robots = await page.request.get('/robots.txt');
    expect(await robots.text()).toContain('Disallow: /');
  } finally { con.close(); }
});
