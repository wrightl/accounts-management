import { test, expect } from "@playwright/test";

test("landing page renders the brand and primary actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your books, in one place." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
});

test("health endpoint reports ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
});

test("sign-in route is reachable", async ({ page }) => {
  await page.goto("/sign-in");
  // Either the Clerk widget (configured) or the not-configured notice renders.
  await expect(page.locator("body")).toContainText(/sign in|not configured/i);
});

test("invoices route redirects to sign-in or shows not-configured notice", async ({
  page,
}) => {
  await page.goto("/invoices");
  // Without a Clerk session: the dashboard layout redirects to sign-in, or
  // (when auth env is absent) shows AuthNotConfigured.
  await expect(page.locator("body")).toContainText(
    /sign in|not configured|authentication/i,
  );
});
