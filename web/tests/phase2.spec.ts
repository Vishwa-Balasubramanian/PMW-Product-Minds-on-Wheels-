import { expect, test, type Page } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const database = () => new DatabaseSync(path.resolve('..', 'db', 'pmw-smoke-run.sqlite'), { readOnly: true });

async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    return [document.documentElement.scrollWidth - innerWidth, main.scrollWidth - main.clientWidth];
  });
  expect(sizes.every(n => n <= 1)).toBeTruthy();
}

test('regional evidence meter uses pipeline mixes for US comments and China surveys', async ({ page, context }) => {
  const db = database();
  const row = db.prepare("SELECT id, evidence_mix_by_market FROM requirements WHERE vehicle='G70' AND json_extract(evidence_mix_by_market,'$.CN.survey')>0 AND json_extract(evidence_mix_by_market,'$.US.observed')>0 ORDER BY priority DESC LIMIT 1").get()!;
  db.close();
  const profiles = JSON.parse(String(row.evidence_mix_by_market));
  for (const region of ['US', 'CN']) {
    await context.addCookies([{ name: 'pmw_region', value: region, url: 'http://127.0.0.1:3107' }]);
    await page.goto(`/vehicles/G70?req=${row.id}`);
    const meter = page.getByTestId('evidence-meter');
    await expect(meter).toBeVisible();
    for (const [key, value] of Object.entries(profiles[region])) {
      await expect(meter.locator(`[data-part=${key}]`)).toHaveAttribute('data-value', String(value));
    }
    const displayed = await meter.locator('li strong').allTextContents();
    expect(displayed.reduce((total, value) => total + parseInt(value), 0)).toBe(100);
    await expect(meter.getByRole('img')).toHaveAttribute('aria-label', /Observed comments.*Survey measures.*Inference.*Assumptions/);
    if (region === 'CN') {
      await expect(meter.locator('[data-part=observed]')).toHaveText('Observed comments0%');
      await meter.getByText('How this mix is calculated', { exact: true }).click();
      await expect(meter.getByText(/No observed customer comments/)).toBeVisible();
      await meter.getByText('How this mix is calculated', { exact: true }).click();
    }
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      expect(await meter.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/phase2-meter-${region}-${width}.png` });
    }
  }
});

test('portfolio cells match signals and stay identical in every region without raw comments', async ({ page, context }) => {
  const db = database();
  const signals = db.prepare('SELECT vehicle, topic, SUM(n_comments) AS comments, SUM(n_negative) AS negative FROM signals WHERE in_scope=1 GROUP BY vehicle, topic').all();
  const ids = db.prepare('SELECT id FROM feedback ORDER BY id LIMIT 30').all().map(r => String(r.id));
  const vehicles = db.prepare('SELECT code FROM vehicles ORDER BY code').all().map(r => String(r.code));
  db.close();
  let baseline: string | undefined;
  for (const region of ['US', 'EU', 'CN', 'ROW', 'ALL']) {
    await context.addCookies([{ name: 'pmw_region', value: region, url: 'http://127.0.0.1:3107' }]);
    const response = await page.goto('/portfolio');
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Cross-Model Radar', exact: true })).toBeVisible();
    const table = page.getByTestId('portfolio-heatmap');
    const content = await table.innerText();
    if (baseline) expect(content).toBe(baseline);
    baseline = content;
    const html = await response!.text();
    for (const id of ids) expect(html).not.toContain(id);
    const actual = await table.locator('tbody a').evaluateAll(links => links.map(el => ({ label: el.getAttribute('aria-label'), href: el.getAttribute('href') })));
    expect(actual.length).toBe(new Set(signals.map(s => s.topic)).size * vehicles.length);
    for (const signal of signals) {
      const share = Math.round(Number(signal.negative) / Number(signal.comments) * 100);
      expect(actual).toContainEqual({ label: `${signal.topic}, ${signal.vehicle}: ${share}% negative, ${signal.negative} of ${signal.comments} comments. Open signals`, href: `/vehicles/${signal.vehicle}?view=signals` });
    }
    expect(actual.every(cell => vehicles.some(v => cell.href === `/vehicles/${v}?view=signals`))).toBeTruthy();
  }
});

test('portfolio scrolls inside its table at 375px and every vehicle link opens signals', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'CN', url: 'http://127.0.0.1:3107' }]);
  await page.goto('/portfolio');
  await page.screenshot({ path: 'test-results/phase2-portfolio-1440.png' });
  await page.setViewportSize({ width: 375, height: 900 });
  await noOverflow(page);
  const scroll = page.getByRole('region', { name: 'Scrollable portfolio heatmap' });
  expect(await scroll.evaluate(el => el.scrollWidth > el.clientWidth)).toBeTruthy();
  await scroll.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroll.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await scroll.evaluate(el => { el.scrollLeft = 0; el.blur(); document.querySelector('main')!.scrollTop = 0; });
  await page.screenshot({ path: 'test-results/phase2-portfolio-375.png' });
  for (const code of ['F70', 'G60', 'G70']) {
    await page.getByTestId('portfolio-heatmap').locator(`a[href="/vehicles/${code}?view=signals"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/vehicles/${code}\\?view=signals$`));
    await expect(page.getByRole('columnheader', { name: 'Topic', exact: true })).toBeVisible();
    await page.goto('/portfolio');
  }
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Cross-Model Radar', exact: true })).toHaveAttribute('aria-current', 'page');
});
