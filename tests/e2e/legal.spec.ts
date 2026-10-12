import { test, expect } from "@playwright/test";

test.describe("Legal pages - Public Access", () => {
  test("privacy notice is accessible without authentication", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page.getByRole("heading", { name: "Privacy Notice", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI and receipt reading" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Sub-processors" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Terms of Service/ })).toBeVisible();
  });

  test("terms include the data processing agreement", async ({ page }) => {
    await page.goto("/terms");

    await expect(page.getByRole("heading", { name: "Terms of Service", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Data processing terms" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy Notice" }).first()).toBeVisible();
  });

  test("footer links to privacy and terms", async ({ page }) => {
    await page.goto("/guides");

    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });
});
