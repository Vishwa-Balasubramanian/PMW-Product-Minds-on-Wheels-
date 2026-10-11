import { expect, test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const base = 'http://127.0.0.1:3107';
const source = () => new DatabaseSync(path.resolve('..', 'db', 'pmw-smoke-run.sqlite'), { readOnly: true });

test('Requirements groups each visible requirement once into its existing priority band', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'EU', url: base }]);
  await page.goto('/vehicles/G70');
  const con = source();
  try {
    const rows = con.prepare(`SELECT id,title,priority FROM requirements WHERE vehicle='G70' AND markets LIKE '%"EU"%' ORDER BY priority DESC, confidence DESC`).all() as { id: string; title: string; priority: number }[];
    const cards = page.getByTestId('requirement-card');
    expect(await cards.first().getAttribute('href')).toBeTruthy();
    const shown = await cards.evaluateAll(links => links.map(link => link.getAttribute('data-requirement-id')));
    expect(shown).toEqual(rows.map(r => r.id));
    for (const [key, min, max] of [['must', 65, 101], ['should', 55, 65], ['could', 45, 55], ['wont', 0, 45]] as const) {
      const lane = page.getByTestId(`kanban-${key}`);
      const members = rows.filter(r => r.priority >= min && r.priority < max);
      await expect(lane.getByTestId('requirement-card')).toHaveCount(members.length);
      await expect(lane.getByLabel(`${members.length} requirements`, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('navigation', { name: 'Requirement vehicles' }).getByRole('link', { name: /7 Series/ })).toHaveAttribute('aria-current', 'page');
    const first = cards.first();
    await expect(first.getByText('Priority', { exact: true })).toBeVisible();
    await expect(first.getByText('Confidence', { exact: true })).toBeVisible();
    await first.click();
    await expect(page.getByRole('heading', { name: rows[0].title, exact: true }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back to requirements board' }).click();
    await expect(page.getByTestId('requirements-board')).toBeInViewport();
  } finally { con.close(); }
});

test('search keeps the recommendation filter and evidence selection, with recoverable empty results', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: base }]);
  await page.goto('/vehicles/G70?q=act');
  await page.getByRole('searchbox', { name: 'Search requirements' }).fill('connected');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByTestId('requirement-card')).toHaveCount(1);
  await expect(page).toHaveURL(/q=act.*search=connected/);
  await page.getByTestId('requirement-card').click();
  await expect(page).toHaveURL(/q=act.*search=connected.*req=.*#decision-card/);
  await expect(page.getByRole('heading', { name: 'Connected features that recover gracefully', exact: true }).last()).toBeVisible();
  await page.getByRole('link', { name: 'Back to requirements board' }).click();
  await page.getByRole('searchbox', { name: 'Search requirements' }).fill('No such requirement 12345');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('No requirements match your search');
  await expect(page.getByTestId('requirement-card')).toHaveCount(0);
  await page.getByRole('link', { name: 'Clear search' }).click();
  await expect(page.getByTestId('requirement-card').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get('q')).toBe('act');
  expect(new URL(page.url()).searchParams.has('search')).toBe(false);
});

test('Kanban and model strip are isolated from matrix, signals and data health', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'ALL', url: base }]);
  await page.goto('/vehicles/G70');
  for (const [view, label] of [['matrix', 'Decision matrix'], ['signals', 'Signals'], ['data', 'Data health']] as const) {
    await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`view=${view}`));
    await expect(page.getByTestId('requirements-board')).toHaveCount(0);
    await expect(page.getByTestId('requirement-models')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Priority weights' })).toHaveCount(0);
    if (view === 'matrix') await expect(page.getByRole('img', { name: 'Decision matrix: priority against confidence' })).toBeVisible();
    if (view === 'signals') await expect(page.getByRole('columnheader', { name: 'Topic', exact: true })).toBeVisible();
    if (view === 'data') await expect(page.getByRole('heading', { name: 'Data issues found and how they were handled' })).toBeVisible();
    await page.screenshot({ path: `test-results/kanban-${view}-unchanged.png`, fullPage: true });
  }
  await page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name: 'Requirements', exact: true }).click();
  await expect(page.getByTestId('requirements-board')).toBeVisible();
  // Matrix points still deep-link into the existing requirement review.
  await page.goto('/vehicles/G70?view=matrix');
  const href = await page.getByRole('img', { name: 'Decision matrix: priority against confidence' }).locator('a').first().getAttribute('href');
  await page.goto(href!);
  await expect(page.locator('[data-testid="requirement-card"][aria-current="true"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
});

test('model switching, keyboard review and responsive board preserve usable layouts', async ({ page, context }) => {
  await context.addCookies([{ name: 'pmw_region', value: 'EU', url: base }]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/vehicles/G70');
  const models = page.getByRole('navigation', { name: 'Requirement vehicles' });
  for (const [name, code] of [['5 Series', 'G60'], ['1 Series', 'F70'], ['7 Series', 'G70']]) {
    await models.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page).toHaveURL(new RegExp(`/vehicles/${code}$`));
    await expect(models.getByRole('link', { name: new RegExp(name) })).toHaveAttribute('aria-current', 'page');
  }
  const first = page.getByTestId('requirement-card').first();
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/req=.*#decision-card/);
  await page.goto('/vehicles/G70');
  // Every card remains keyboard reachable, including cards below a desktop lane's fold.
  const laneCards = page.getByTestId('kanban-must').getByTestId('requirement-card');
  for (let i = 0; i < await laneCards.count(); i++) {
    await laneCards.nth(i).focus();
    await expect(laneCards.nth(i)).toBeFocused();
    await expect(laneCards.nth(i)).toBeInViewport();
  }
  await page.goto('/vehicles/G70');
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 900, 1000], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `test-results/kanban-${name}.png` });
    await page.screenshot({ path: `test-results/kanban-${name}-full.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.getByTestId('requirement-models').locator('img')).toHaveCount(3);
    expect(await page.getByTestId('requirement-models').locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await expect(page.getByTestId('requirement-card').first()).toBeVisible();
  }
});
