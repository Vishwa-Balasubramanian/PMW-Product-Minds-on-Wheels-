import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: 'http://127.0.0.1:3107' }]);
});

async function expectNoOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    return {
      document: document.documentElement.scrollWidth - window.innerWidth,
      workspace: main.scrollWidth - main.clientWidth,
    };
  });
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.workspace).toBeLessThanOrEqual(1);
}

test('portfolio shows real program totals and regional availability', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Product Requirements Board', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Portfolio', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.board-kpis > div')).toHaveCount(4);
  await expect(page.locator('.board-column')).toHaveCount(5);
  await expectNoOverflow(page);
  await page.screenshot({ path: 'test-results/workspace-portfolio-desktop.png' });
  await context.addCookies([{ name: 'pmw_region', value: 'US', url: 'http://127.0.0.1:3107' }]);
  await page.goto('/?vehicle=F70');
  await expect(page.getByLabel('Vehicle').locator('option', { hasText: 'BMW 1 Series' })).toHaveText(/not sold in United States/);
  await expect(page.getByText('BMW 1 Series is not sold in United States', { exact: false })).toBeVisible();
  await expect(page.locator('.board-card')).toHaveCount(0);
  await context.addCookies([{ name: 'pmw_region', value: 'CN', url: 'http://127.0.0.1:3107' }]);
  await page.goto('/?vehicle=G70');
  await expect(page.getByText('Thin evidence.', { exact: true }).first()).toBeVisible();
});

test('review tabs retain all evidence, scoring and history with keyboard access', async ({ page }) => {
  await page.goto('/vehicles/G70?view=inbox');
  await expect(page.getByRole('heading', { name: 'From customer voice to requirement' })).toBeVisible();
  await expect(page.getByText(/Working hypothesis:/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Customer evidence', exact: true })).not.toBeVisible();
  await page.getByRole('tab', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Evidence', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Customer evidence', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Survey evidence', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Priority', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Decision matrix: priority against confidence' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('heading', { name: 'Audit trail', exact: true })).toBeVisible();
  await page.locator('.requirement-row').nth(1).click();
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'From customer voice to requirement' })).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: 'test-results/workspace-review-desktop.png' });
});

test('desktop list and review scroll independently and preserve selection history', async ({ page }) => {
  await page.goto('/vehicles/G70?view=inbox');
  const rows = page.locator('.requirement-rows');
  await rows.evaluate(el => { el.scrollTop = 500; });
  const previousScroll = await rows.evaluate(el => el.scrollTop);
  const row = page.locator('.requirement-row').nth(8);
  const selectedHref = await row.getAttribute('href');
  await row.click();
  await expect(page.locator('.requirement-row[aria-current=true]')).toHaveAttribute('href', selectedHref!);
  await expect(page).toHaveURL(`http://127.0.0.1:3107${selectedHref}`);
  const selectedURL = page.url();
  expect(await rows.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(previousScroll).toBeGreaterThan(0);
  await page.locator('.requirement-detail').evaluate(el => { el.scrollTop = 600; });
  const actions = await page.locator('.decision-actions').boundingBox();
  const detail = await page.locator('.requirement-detail').boundingBox();
  expect(Math.abs(actions!.y - detail!.y)).toBeLessThan(2);
  await page.locator('.requirement-row').nth(9).click();
  await expect(page).not.toHaveURL(selectedURL);
  await expect.poll(() => page.locator('.requirement-detail').evaluate(el => el.scrollTop)).toBe(0);
  await page.goBack();
  await expect(page).toHaveURL(selectedURL);
});

test('responsive workspace supports navigation, filters, detail and browser back', async ({ page }) => {
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/vehicles/G70?q=validate');
    await expect(page.locator('.requirements-list')).toBeVisible();
    if (width < 1280) await expect(page.locator('.requirement-detail')).not.toBeVisible();
    const row = page.locator('.requirement-row').first();
    const href = await row.getAttribute('href');
    await row.click();
    await expect(page).toHaveURL(new RegExp(href!.replace('?', '\\?')));
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();
    await expectNoOverflow(page);
    if (width < 1280) {
      await expect(page.locator('.requirements-list')).not.toBeVisible();
      await page.getByRole('link', { name: 'Back to requirements' }).click();
      await expect(page).toHaveURL(/\?q=validate$/);
      await expect(page.locator('.requirements-list')).toBeVisible();
      await page.goBack();
      await expect(page.locator('.requirement-detail')).toBeVisible();
    }
    await page.screenshot({ path: `test-results/workspace-review-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation' });
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await drawer.getByRole('link', { name: 'Audit trail', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Audit trail', exact: true })).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: 'test-results/workspace-audit-mobile.png' });
});

test('all small-screen views and review tabs stay within the workspace', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const route of ['/', '/vehicles/G70?view=matrix', '/vehicles/G70?view=signals', '/vehicles/G70?view=data', '/audit', '/workflow']) {
    await page.goto(route);
    await expectNoOverflow(page);
  }
  await page.goto('/vehicles/G70?view=inbox');
  await page.locator('.requirement-row').first().click();
  for (const tab of ['Overview', 'Evidence', 'Scoring', 'Activity']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expectNoOverflow(page);
    const detail = page.locator('.requirement-detail');
    expect(await detail.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test('incoming workflow and weight controls fit the mobile workspace', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vehicles/G70?view=inbox');
  await page.getByRole('button', { name: /Priority weights/ }).click();
  await expect(page.getByRole('slider')).toHaveCount(5);
  await page.getByRole('button', { name: 'Customer first', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply to the team', exact: true })).toBeEnabled();
  await page.getByLabel('Reason', { exact: true }).fill('Preview only');
  await expectNoOverflow(page);
  expect(await page.locator('.workspace-weights').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator('.requirement-row').first()).toBeInViewport();
  await page.screenshot({ path: 'test-results/main-merge-weights-mobile.png' });
  await page.goto('/workflow'); // Hidden from the navigation; still reachable by URL.
  await expect(page.getByRole('heading', { name: 'From customer voice to a decision a product manager can defend.' })).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Your region/ })).toHaveCount(1);
  await expectNoOverflow(page);
  await page.screenshot({ path: 'test-results/main-merge-workflow-mobile.png' });
});

test('workspace exports remain available on mobile and respect the selected region', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([{ name: 'pmw_region', value: 'CN', url: 'http://127.0.0.1:3107' }]);
  await page.goto('/vehicles/G70');
  await page.locator('.export-menu summary').click();
  await expect(page.getByRole('link', { name: 'Export CSV', exact: true })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Export CSV', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^pmw-requirements-G70-CN-.*\.csv$/);
  expect(await download.failure()).toBeNull();
  await expect(page.getByRole('link', { name: 'Export JSON', exact: true })).toBeVisible();
  const response = await page.request.get('/api/export?vehicle=G70&format=json');
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.region).toBe('China');
  expect(data.count).toBeGreaterThan(0);
  expect(data.requirements.every((r: { customer_voice: string; comment_ids: string[] }) => !r.customer_voice && r.comment_ids.length === 0)).toBeTruthy();
  await expectNoOverflow(page);
});
