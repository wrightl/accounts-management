import { test, expect } from "@playwright/test";

test.describe("Pricing - Public Access", () => {
  test("pricing page is accessible without authentication", async ({ page }) => {
    await page.goto("/pricing");

    await expect(
      page.getByRole("heading", {
        name: "Books for the week. Clear, honest pricing.",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Trial", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Essentials", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Premium", exact: true }),
    ).toBeVisible();

    await expect(page.getByText("£19").first()).toBeVisible();
    await expect(page.getByText("£29").first()).toBeVisible();

    await expect(
      page.getByRole("navigation", { name: "Marketing" }).getByRole("link", {
        name: "Pricing",
      }),
    ).toBeVisible();

    await expect(
      page.locator("footer").getByRole("link", { name: "Pricing" }),
    ).toBeVisible();
  });

  test("shows plan comparison table and FAQ", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto("/pricing");

    const compare = page.locator("#compare");
    await expect(
      compare.getByRole("heading", { name: "Compare plans" }),
    ).toBeVisible();
    await expect(compare.getByRole("columnheader", { name: "Trial" })).toBeVisible();
    await expect(
      compare.getByRole("columnheader", { name: "Essentials" }),
    ).toBeVisible();
    await expect(
      compare.getByRole("columnheader", { name: "Premium" }),
    ).toBeVisible();
    await expect(compare.getByRole("cell", { name: "Users" })).toBeVisible();
    await expect(
      compare.getByRole("cell", { name: "VAT rates + export" }),
    ).toBeVisible();
    await expect(
      compare.getByRole("cell", { name: "Live bank feed" }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Pricing questions" }),
    ).toBeVisible();
    await expect(
      page.locator("#faq").getByText("Is VAT / Making Tax Digital included?"),
    ).toBeVisible();
  });

  test("start free trial CTA goes to sign-up with pricing source", async ({
    page,
  }) => {
    await page.goto("/pricing");

    await page.getByRole("link", { name: "Start free trial" }).first().click();
    await expect(page).toHaveURL(/\/sign-up\?from=pricing$/);
  });

  test("plan cards tag the intended plan on sign-up", async ({ page }) => {
    await page.goto("/pricing");

    const essentials = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Essentials", exact: true }) })
      .getByRole("link", { name: "Start free trial" });
    await expect(essentials).toHaveAttribute(
      "href",
      "/sign-up?from=pricing&plan=essentials",
    );

    const premium = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Premium", exact: true }) })
      .getByRole("link", { name: "Start free trial" });
    await expect(premium).toHaveAttribute(
      "href",
      "/sign-up?from=pricing&plan=premium",
    );
  });

  test("header sign-up on pricing is tagged, other marketing pages are not", async ({
    page,
  }) => {
    await page.goto("/pricing");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Sign up" }),
    ).toHaveAttribute("href", "/sign-up?from=pricing");

    await page.goto("/guides");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Sign up" }),
    ).toHaveAttribute("href", "/sign-up");
  });

  test("pricing is linked from landing page header", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Marketing" });
    await expect(nav.getByRole("link", { name: "Pricing" })).toBeVisible();
    await nav.getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL("/pricing");
  });
});
