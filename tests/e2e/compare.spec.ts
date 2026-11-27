import { test, expect } from "@playwright/test";

test.describe("Compare and AI assistant files - Public Access", () => {
  test("compare hub links each comparison without signing in", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByRole("heading", { name: "How Alfa compares" })).toBeVisible();
    await page.getByRole("link", { name: /Alfa vs Xero/ }).click();
    await expect(page.getByRole("heading", { name: "Alfa vs Xero", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose Xero if" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("an unknown comparison is not found", async ({ page }) => {
    const response = await page.goto("/compare/not-a-product");
    expect(response?.status()).toBe(404);
  });

  test("llms.txt and llms-full.txt are served as markdown", async ({ request }) => {
    for (const path of ["/llms.txt", "/llms-full.txt"]) {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("text/markdown");
      expect(await response.text()).toMatch(/^# Alfa by Dot\+Dash/);
    }
  });

  test("footer links to the comparisons", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("footer").getByRole("link", { name: "Compare" })).toBeVisible();
  });
});
