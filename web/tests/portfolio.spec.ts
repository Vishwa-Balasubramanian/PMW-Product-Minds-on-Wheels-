import { expect, test } from '@playwright/test';

const base = 'http://127.0.0.1:3107';

test('Cross-Model Radar shows the heatmap with the header, links to signals, and fits a phone', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'CN', url: base }]);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Radar', exact: true }).click();
  await expect(page).toHaveURL(/\/portfolio$/);
  await expect(page.getByRole('heading', { name: 'Cross-Model Radar', level: 1 })).toBeVisible();
  const heatmap = page.getByTestId('portfolio-heatmap');
  await expect(heatmap.locator('tbody tr').first()).toBeVisible();
  expect(await heatmap.locator('tbody tr').count()).toBeGreaterThan(10);
  // Aggregate counts only: no customer comment IDs on the page, whatever the region.
  expect(await page.locator('main').innerText()).not.toMatch(/\b[A-Z]\d{2}-\d{4}\b/);
  await heatmap.locator('tbody a').first().click();
  await expect(page).toHaveURL(/\/vehicles\/[A-Z0-9]+\?view=signals/);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/portfolio');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
