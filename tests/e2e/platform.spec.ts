import { test, expect } from "@playwright/test";

test.describe("Platform admin portal - access", () => {
  test("signed-out visitors are sent to sign-in", async ({ page }) => {
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("deep links are protected too", async ({ page }) => {
    await page.goto("/platform/companies");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
