/**
 * Sign up a fresh founder (not platform admin), onboard a fictional Ltd,
 * seed demo data into that company, and capture landing-page screenshots + clips.
 *
 * Creates the Clerk user via Backend API (avoids OAuth/CAPTCHA flakiness on
 * /sign-up), then signs in with Clerk testing helpers and completes onboarding
 * in the browser. Never uses PLATFORM_ADMIN_EMAILS.
 *
 * Usage: npm run marketing:capture
 * Requires: dev server at PROMO_BASE_URL (default http://localhost:3001),
 * Clerk keys in .env.local.
 */
import { config } from "dotenv";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  copyFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { chromium, type Page } from "@playwright/test";
import { createClerkClient } from "@clerk/backend";
import { clerkSetup, clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { schema } from "../src/db/schema";
import { seedPromoDemo } from "../src/db/seed-promo-demo";
import type { Database } from "../src/db";

config({ path: ".env.local" });
config({ path: ".env" });

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const marketingDir = join(root, "public", "marketing");
const rawDir = join(root, "promo", "raw-marketing");
const routesPath = join(root, "promo", "routes.json");

const BASE_URL = process.env.PROMO_BASE_URL ?? "http://localhost:3001";

const DEMO = {
  firstName: "Alex",
  lastName: "Harbor",
  password: `Promo!${Date.now().toString(36)}Aa1`,
  tradingName: "Northline Studio Ltd",
  legalName: "Northline Studio Limited",
  companyNumber: "14998821",
  address: "Unit 12\nCanvas Works\nManchester M1 2AB",
};

function uniqueEmail(): string {
  return `promo.${Date.now()}@example.com`;
}

async function waitForApp(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
}

async function createFounderInClerk(email: string) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required");
  const client = createClerkClient({ secretKey });
  const user = await client.users.createUser({
    emailAddress: [email],
    password: DEMO.password,
    firstName: DEMO.firstName,
    lastName: DEMO.lastName,
    skipPasswordChecks: true,
    skipPasswordRequirement: false,
  });
  console.log(`Created Clerk user ${user.id} (${email})`);
  return user;
}

async function signInFounder(page: Page, email: string) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress: email });
  await page.goto(`${BASE_URL}/onboarding`, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  console.log(`Signed in ${email} → ${page.url()}`);
}

async function completeOnboarding(page: Page, email: string) {
  if (!page.url().includes("/onboarding")) {
    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: "domcontentloaded" });
  }
  await waitForApp(page);

  await page.getByRole("button", { name: /Limited company/i }).click();
  await page.locator("#userName").fill(`${DEMO.firstName} ${DEMO.lastName}`);
  await page.locator("#name").fill(DEMO.tradingName);
  await page.locator("#legalName").fill(DEMO.legalName);
  await page.locator("#companyNumber").fill(DEMO.companyNumber);
  await page.locator("#addressLines").fill(DEMO.address);
  await page.locator("#email").fill(email);

  await page.getByRole("button", { name: /Create account/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  console.log("Onboarding complete → dashboard");
}

async function seedForActor(email: string) {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const db = drizzle(client, { schema });
    const result = await seedPromoDemo(db as unknown as Database, {
      force: true,
      actorEmail: email,
    });
    mkdirSync(dirname(routesPath), { recursive: true });
    writeFileSync(routesPath, JSON.stringify(result.routes, null, 2) + "\n");
    console.log("Seeded promo demo for", email);
    return result.routes;
  } finally {
    await client.end().catch(() => {});
  }
}

async function captureStill(page: Page, name: string, path: string) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  await waitForApp(page);
  await page.waitForTimeout(1200);
  const dest = join(marketingDir, `${name}.png`);
  await page.screenshot({ path: dest, fullPage: false });
  console.log(`Screenshot ${dest}`);
}

async function captureClip(
  page: Page,
  name: string,
  paths: string[],
  scrollPx = 0,
) {
  mkdirSync(rawDir, { recursive: true });
  // Recording is on the context; we navigate within the already-recording page.
  for (const path of paths) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await page.waitForTimeout(1800);
    if (scrollPx > 0) {
      const steps = 8;
      const step = scrollPx / steps;
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, step);
        await page.waitForTimeout(100);
      }
      await page.waitForTimeout(800);
    }
  }
  // Video is saved when context closes — caller handles rename.
  void name;
}

function encodeWebmToMp4(webm: string, mp4: string) {
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      webm,
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.warn(`ffmpeg failed for ${webm}: ${result.stderr?.slice(0, 400)}`);
    // Fall back to copying webm if ffmpeg missing
    if (existsSync(webm)) {
      copyFileSync(webm, mp4.replace(/\.mp4$/, ".webm"));
    }
    return false;
  }
  console.log(`Encoded ${mp4}`);
  return true;
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error("CLERK_SECRET_KEY is required");
  }

  // Refuse platform admin emails
  const blocked = (process.env.PLATFORM_ADMIN_EMAILS ?? "admin@dotanddashconsulting.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const email = uniqueEmail();
  if (blocked.includes(email.toLowerCase())) {
    throw new Error("Generated email collided with PLATFORM_ADMIN_EMAILS");
  }

  await clerkSetup();
  mkdirSync(marketingDir, { recursive: true });
  mkdirSync(rawDir, { recursive: true });

  console.log(`Marketing capture against ${BASE_URL}`);
  console.log(`Founder: ${email}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: rawDir,
      size: { width: 1440, height: 900 },
    },
  });
  await setupClerkTestingToken({ context });
  const page = await context.newPage();

  let routes: Awaited<ReturnType<typeof seedForActor>>;

  try {
    await createFounderInClerk(email);
    await signInFounder(page, email);
    await completeOnboarding(page, email);
    routes = await seedForActor(email);

    // Re-sign in may not be needed — session should still be valid.
    // Refresh dashboard so seeded KPIs appear.
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await page.waitForTimeout(1500);

    // Stills for feature sections
    await captureStill(page, "dashboard", routes.dashboard);
    await captureStill(page, "quote", routes.quoteUrl);
    await captureStill(page, "order", routes.orderUrl);
    await captureStill(page, "invoice", routes.invoiceSentUrl);
    await captureStill(page, "expense", routes.expenseUrl);
    await captureStill(page, "transactions", routes.transactionsUrl);
    await captureStill(page, "reports", routes.reportsUrl);

    // Short motion clips (same session; video file covers remaining navigations)
    await captureClip(page, "clip-dashboard", [routes.dashboard], 600);
    await captureClip(page, "clip-sales", [
      routes.quoteUrl,
      routes.orderUrl,
      routes.invoiceSentUrl,
    ]);
    await captureClip(page, "clip-expenses", [
      routes.expenseUrl,
      routes.reimbursementUrl,
    ]);

    // Poster = dashboard still
    copyFileSync(
      join(marketingDir, "dashboard.png"),
      join(marketingDir, "poster.png"),
    );
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      const src = await video.path();
      const destWebm = join(rawDir, "session.webm");
      renameSync(src, destWebm);
      const destMp4 = join(marketingDir, "tour.mp4");
      encodeWebmToMp4(destWebm, destMp4);
      console.log(`Session video → ${destWebm}`);
    }
  }

  writeFileSync(
    join(rawDir, "capture-meta.json"),
    JSON.stringify(
      {
        email,
        capturedAt: new Date().toISOString(),
        note: "Fictional demo user — safe to delete from Clerk dashboard",
      },
      null,
      2,
    ) + "\n",
  );

  console.log("Marketing assets written to public/marketing/");
  console.log(`Leftover Clerk user: ${email} (delete in Clerk dashboard if desired)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
