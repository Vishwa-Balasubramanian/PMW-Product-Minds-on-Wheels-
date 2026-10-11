import { expect, test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const base = 'http://127.0.0.1:3107';
const ID = /\b[A-Z]\d{2}-\d{4}\b/g;
// China has no customer comments, so a China product manager must never see a comment ID.
const leaks = (text: string) => [...new Set(text.match(ID) ?? [])];

test('a China product manager sees no comment IDs in exports, cards, the board drawer or the data tabs', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'CN', url: base }]);
  const con = new DatabaseSync(path.resolve('..', 'db', 'pmw-smoke-run.sqlite'), { readOnly: true });
  const cited = con.prepare("SELECT id, vehicle FROM requirements WHERE root_cause GLOB '*[A-Z][0-9][0-9]-[0-9][0-9][0-9][0-9]*' AND markets LIKE '%\"CN\"%' LIMIT 3").all() as { id: string; vehicle: string }[];
  con.close();
  expect(cited.length).toBeGreaterThan(0);
  for (const v of ['G70', 'G60']) {
    const res = await page.request.get(`/api/export?vehicle=${v}&format=json`);
    expect(leaks(await res.text())).toEqual([]);
    for (const view of ['signals', 'data']) {
      await page.goto(`/vehicles/${v}?view=${view}`);
      expect(leaks(await page.locator('main').innerText())).toEqual([]);
    }
  }
  for (const r of cited) {
    await page.goto(`/vehicles/${r.vehicle}?req=${r.id}`);
    const card = page.locator('[data-open-requirement]');
    for (const tab of ['Overview', 'Evidence', 'Scoring', 'Activity']) {
      await card.getByRole('tab', { name: tab, exact: true }).click();
      expect(leaks(await card.innerText())).toEqual([]);
    }
    // The page payload (server-rendered props) must not carry them either.
    expect(leaks(await page.content())).toEqual([]);
    await page.goto(`/vehicles/${r.vehicle}?view=decisions&open=${r.id}`);
    await expect(page.locator('.drawer-panel')).toBeVisible();
    expect(leaks(await page.locator('.drawer-panel').innerText())).toEqual([]);
  }
});
