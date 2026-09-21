import { test, expect } from "@playwright/test";

test("landing page renders the brand and primary actions", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(
    /UK Accounting Software for Limited Companies & Sole Traders/,
  );
  await expect(page.getByRole("heading", { name: "Your books, in one place." }).first()).toBeVisible();
  await expect(page.getByText("Alfa by Dot+Dash").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign up" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
});

test("landing page links to UK financial guides", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "UK Financial Guides" })).toBeVisible();
  await expect(page.getByRole("link", { name: /View all UK Financial Guides/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Limited Companies/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Sole Traders/i }).first()).toBeVisible();

  // Nav Guides link
  await expect(page.getByRole("navigation", { name: "Marketing" }).getByRole("link", { name: "Guides" })).toBeVisible();
});

test("who it's for section is present", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Who it's for/i })).toBeVisible();
});

test("health endpoint reports ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
});

test("sign-in route is reachable", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("link", { name: /Alfa/i }).first()).toBeVisible();
});

test("invoices route redirects to sign-in", async ({ page }) => {
  await page.goto("/invoices");
  await expect(page).toHaveURL(/\/sign-in/);
});
