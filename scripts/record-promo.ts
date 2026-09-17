/**
 * Record promo video beats with Playwright + Clerk testing helpers.
 * Usage: npm run promo:record
 *
 * Requires dev server at PROMO_BASE_URL (default http://localhost:3001),
 * promo/routes.json from promo:seed, and Clerk keys in .env.local.
 */
import { config } from "dotenv";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { clerkSetup, clerk } from "@clerk/testing/playwright";

config({ path: ".env.local" });
config({ path: ".env" });

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawDir = join(root, "promo", "raw");
const routesPath = join(root, "promo", "routes.json");

const BASE_URL = process.env.PROMO_BASE_URL ?? "http://localhost:3001";
const CLERK_EMAIL = process.env.PROMO_CLERK_EMAIL?.trim();

function assertNotPlatformAdmin(email: string) {
  const blocked = (process.env.PLATFORM_ADMIN_EMAILS ?? "admin@dotanddashconsulting.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (blocked.includes(email.toLowerCase())) {
    throw new Error(
      `Refusing to record as platform admin (${email}). Set PROMO_CLERK_EMAIL to a founder account, or use npm run marketing:capture.`,
    );
  }
}

interface PromoRoutes {
  landing: string;
  dashboard: string;
  quoteUrl: string;
  orderUrl: string;
  invoiceSentUrl: string;
  expenseUrl: string;
  reimbursementUrl: string;
  inboundEmailUrl: string;
  transactionsUrl: string;
  reportsUrl: string;
}

function loadRoutes(): PromoRoutes {
  if (!existsSync(routesPath)) {
    throw new Error("promo/routes.json not found — run npm run promo:seed first");
  }
  return JSON.parse(readFileSync(routesPath, "utf8")) as PromoRoutes;
}

async function waitForApp(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
}

async function scrollSlow(page: Page, pixels: number, steps = 8) {
  const step = pixels / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(120);
  }
}

async function recordBeat(
  name: string,
  fn: (page: Page, routes: PromoRoutes) => Promise<void>,
  routes: PromoRoutes,
) {
  mkdirSync(rawDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: rawDir,
      size: { width: 1920, height: 1080 },
    },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL + routes.landing, { waitUntil: "domcontentloaded" });
    await clerk.signIn({ page, emailAddress: CLERK_EMAIL! });
    await fn(page, routes);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      const src = await video.path();
      const dest = join(rawDir, `${name}.webm`);
      const { renameSync } = await import("node:fs");
      renameSync(src, dest);
      console.log(`Recorded ${dest}`);
    }
  }
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error("CLERK_SECRET_KEY is required for promo recording");
  }
  if (!CLERK_EMAIL) {
    throw new Error(
      "PROMO_CLERK_EMAIL is required. Do not use the platform admin — create a founder via npm run marketing:capture, or set PROMO_CLERK_EMAIL to an existing tenant user.",
    );
  }
  assertNotPlatformAdmin(CLERK_EMAIL);

  await clerkSetup();
  const routes = loadRoutes();

  console.log(`Recording promo beats against ${BASE_URL} as ${CLERK_EMAIL}`);

  await recordBeat("01-hook", async (page, r) => {
    await page.goto(BASE_URL + r.landing);
    await waitForApp(page);
    await page.waitForTimeout(2500);
    await page.goto(BASE_URL + r.dashboard);
    await waitForApp(page);
    await page.waitForTimeout(1500);
  }, routes);

  await recordBeat("02-dashboard", async (page, r) => {
    await page.goto(BASE_URL + r.dashboard);
    await waitForApp(page);
    await page.waitForTimeout(1500);
    await scrollSlow(page, 900);
    await page.waitForTimeout(2000);
  }, routes);

  await recordBeat("03-money-in", async (page, r) => {
    await page.goto(BASE_URL + r.quoteUrl);
    await waitForApp(page);
    await page.waitForTimeout(2000);
    await page.goto(BASE_URL + r.orderUrl);
    await waitForApp(page);
    await page.waitForTimeout(2000);
    await page.goto(BASE_URL + r.invoiceSentUrl);
    await waitForApp(page);
    await page.waitForTimeout(2500);
  }, routes);

  await recordBeat("04-money-out", async (page, r) => {
    await page.goto(BASE_URL + r.inboundEmailUrl);
    await waitForApp(page);
    await page.waitForTimeout(2000);
    await page.goto(BASE_URL + r.expenseUrl);
    await waitForApp(page);
    await page.waitForTimeout(2000);
    await page.goto(BASE_URL + r.reimbursementUrl);
    await waitForApp(page);
    await page.waitForTimeout(2500);
  }, routes);

  await recordBeat("05-trust", async (page, r) => {
    await page.goto(BASE_URL + r.transactionsUrl);
    await waitForApp(page);
    await page.waitForTimeout(2500);
    await scrollSlow(page, 400);
    await page.waitForTimeout(1500);
    await page.goto(BASE_URL + r.reportsUrl);
    await waitForApp(page);
    await page.waitForTimeout(2500);
  }, routes);

  console.log("All beats recorded in promo/raw/");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
