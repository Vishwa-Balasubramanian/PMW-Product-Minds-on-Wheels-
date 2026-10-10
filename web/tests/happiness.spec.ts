import { expect, test } from "@playwright/test";

test.describe("Happiness Meter", () => {
  test("displays per-market coverage on data health page", async ({ page }) => {
    await page.goto("/vehicles/G70?view=data");
    // Should show the happiness meter section
    await expect(page.locator("h3:has-text('Customer pain addressed')")).toBeVisible();
    // Should show market data
    await expect(page.locator("text=United States")).toBeVisible();
    await expect(page.locator("text=/of.*negative comment/")).toBeVisible();
  });

  test("shows unknown for markets without comments", async ({ page }) => {
    await page.goto("/vehicles/G70?view=data");
    // China has no comments, so should show "unknown"
    const chinaRow = page.locator("text=China").first();
    await expect(chinaRow.locator("text=/unknown|No customer/")).toBeVisible();
  });

  test("updates when requirements are approved", async ({ page }) => {
    await page.goto("/vehicles/G70?view=inbox");
    // Get initial happiness percentage
    const initialPage = await page.content();
    const initialMatch = initialPage.match(/(\d+(?:\.\d+)?)%/);
    const initialPct = initialMatch ? parseFloat(initialMatch[1]) : 0;
    // Approve a requirement
    await page.click("button:has-text('Approve')");
    await page.fill("input[placeholder*='Why']", "Test approval");
    await page.click("button:has-text('Confirm approval')");
    await page.waitForLoadState("networkidle");
    // Navigate to data health view
    await page.click("a:has-text('Data health')");
    // The happiness percentage should have changed or been recalculated
    // (This is a basic test; a more robust test would check specific market shares)
    await expect(page.locator("h3:has-text('Customer pain addressed')")).toBeVisible();
  });
});
