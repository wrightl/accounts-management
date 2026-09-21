import { test, expect } from "@playwright/test";

test.describe("Guides - Public Access", () => {
  test("guides hub page is accessible without authentication", async ({ page }) => {
    await page.goto("/guides");
    
    // Verify page loads successfully
    await expect(page.getByRole("heading", { name: "UK Financial Requirements" })).toBeVisible();
    
    // Verify guide cards are visible
    await expect(page.getByRole("link", { name: /Limited Companies/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Sole Traders/ })).toBeVisible();
    
    // Verify comparison table is present
    await expect(page.getByRole("table")).toBeVisible();
    
    // Verify the shared marketing navbar is present
    const nav = page.getByRole("navigation", { name: "Marketing" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Guides" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" }).first()).toBeVisible();
  });

  test("limited companies guide is accessible without authentication", async ({ page }) => {
    await page.goto("/guides/limited-companies");
    
    // Verify page loads successfully
    await expect(page.getByRole("heading", { name: /Limited Company Financial Requirements/ })).toBeVisible();
    
    // Verify table of contents navigation is visible
    await expect(page.getByRole("navigation", { name: "Table of contents" })).toBeVisible();
    
    // Verify main content sections are visible
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Record Keeping Requirements" })).toBeVisible();
    
    // Verify HMRC links are present (external links with icon)
    await expect(page.locator('a[href*="gov.uk"]').first()).toBeVisible();
    
    // Verify back to guides link works
    await expect(page.getByRole("link", { name: /Back to guides/ })).toBeVisible();
  });

  test("sole traders guide is accessible without authentication", async ({ page }) => {
    await page.goto("/guides/sole-traders");
    
    // Verify page loads successfully
    await expect(page.getByRole("heading", { name: /Sole Trader Financial Requirements/ })).toBeVisible();
    
    // Verify table of contents navigation is visible
    await expect(page.getByRole("navigation", { name: "Table of contents" })).toBeVisible();
    
    // Verify main content sections are visible
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Record Keeping Requirements" })).toBeVisible();
    
    // Verify HMRC links are present
    await expect(page.locator('a[href*="gov.uk"]').first()).toBeVisible();
  });

  test("navigation between guide pages works without authentication", async ({ page }) => {
    // Start at hub
    await page.goto("/guides");
    
    // Navigate to limited companies guide
    await page.getByRole("link", { name: /Limited Companies/ }).click();
    await expect(page).toHaveURL("/guides/limited-companies");
    await expect(page.getByRole("heading", { name: /Limited Company Financial Requirements/ })).toBeVisible();
    
    // Navigate back to hub
    await page.getByRole("link", { name: /Back to guides/ }).click();
    await expect(page).toHaveURL("/guides");
    
    // Navigate to sole traders guide
    await page.getByRole("link", { name: /Sole Traders/ }).click();
    await expect(page).toHaveURL("/guides/sole-traders");
    await expect(page.getByRole("heading", { name: /Sole Trader Financial Requirements/ })).toBeVisible();
  });

  test("guides are linked from landing page", async ({ page }) => {
    await page.goto("/");
    
    // Verify landing page has link to guides
    await expect(page.getByRole("link", { name: /UK Financial Guides/ }).first()).toBeVisible();
    
    // Click the link and verify it navigates to guides
    await page.getByRole("link", { name: /View all UK Financial Guides/i }).click();
    await expect(page).toHaveURL("/guides");
    await expect(page.getByRole("heading", { name: "UK Financial Requirements" })).toBeVisible();
  });
});
