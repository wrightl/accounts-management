/**
 * Sign in as the existing fictional demo company, seed demo data into that
 * company, and capture landing-page screenshots + a tour clip.
 *
 * Does not create a Clerk user or company. The video starts on the dashboard
 * after sign-in — sign-in itself is not recorded.
 *
 * Prefer a production-mode target (deployed URL or `next start`) so the Next.js
 * DevTools chip never appears. Never uses PLATFORM_ADMIN_EMAILS.
 *
 * Usage:
 *   npm run marketing:capture
 *   PROMO_BASE_URL=https://alfa.dotanddashconsulting.com npm run marketing:capture:production
 *
 * Production capture needs live Clerk + DB secrets in `.env.production.local`
 * (Vercel marks them Sensitive and will not pull them).
 */
import { config } from 'dotenv';
import {
    existsSync,
    mkdirSync,
    writeFileSync,
    renameSync,
    copyFileSync,
    readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { chromium, type Page } from '@playwright/test';
import { createClerkClient } from '@clerk/backend';
import {
    clerkSetup,
    clerk,
    setupClerkTestingToken,
} from '@clerk/testing/playwright';
import { postgresConnectionString } from '../src/db/connection-string';
import { schema } from '../src/db/schema';
import { seedPromoDemo } from '../src/db/seed-promo-demo';
import type { Database } from '../src/db';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const marketingDir = join(root, 'public', 'marketing');
const rawDir = join(root, 'promo', 'raw-marketing');
const routesPath = join(root, 'promo', 'routes.json');

const PRODUCTION_URL = 'https://alfa.dotanddashconsulting.com';

// Load local env first, then optionally overlay non-placeholder production secrets.
config({ path: '.env.local' });
config({ path: '.env' });

const BASE_URL = (
    process.env.PROMO_BASE_URL ?? 'http://localhost:3001'
).replace(/\/$/, '');

const isRemoteTarget = /^https?:\/\/(?!localhost|127\.0\.0\.1)/i.test(BASE_URL);

function loadProductionEnvOverlay() {
    const prodPath = join(root, '.env.production.local');
    if (!existsSync(prodPath)) return;
    // Parse manually so "[SENSITIVE]" placeholders never clobber real local values.
    for (const line of readFileSync(prodPath, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq);
        let val = trimmed.slice(eq + 1);
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (!val || val === '[SENSITIVE]') continue;
        process.env[key] = val;
    }
}

if (isRemoteTarget) {
    loadProductionEnvOverlay();
}

const DEMO = {
    // Reset on the existing founder so headless sign-in can reuse the company.
    password: process.env.PROMO_FOUNDER_PASSWORD ?? 'PromoCapture!Harbor2026',
    tradingName: 'Northline Studio Ltd',
    companyNumber: '14998821',
};

async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
    const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    if (!url || url.includes('SENSITIVE')) {
        throw new Error(
            'DATABASE_URL / DATABASE_URL_UNPOOLED is required. ' +
                'For production capture, set them in .env.production.local.',
        );
    }
    const client = new pg.Client({
        connectionString: postgresConnectionString(url),
    });
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.end().catch(() => {});
    }
}

/** Founder of the existing fictional demo company. Never creates one. */
async function findExistingDemoFounder(): Promise<{
    email: string;
    companyId: string;
    companyName: string;
}> {
    const preferred = process.env.PROMO_CLERK_EMAIL?.trim().toLowerCase();
    return withDb(async (client) => {
        const { rows } = await client.query<{
            id: string;
            name: string;
            email: string;
        }>(
            `select c.id, c.name, u.email
             from companies c
             join users u on u.company_id = c.id
             where c.company_number = $1
               and c.name = $2
               and u.role <> 'platform_admin'
               and u.clerk_user_id is not null
             order by c.created_at desc`,
            [DEMO.companyNumber, DEMO.tradingName],
        );
        const match = preferred
            ? rows.find((row) => row.email.toLowerCase() === preferred)
            : rows[0];
        if (!match) {
            throw new Error(
                preferred
                    ? `PROMO_CLERK_EMAIL ${preferred} is not a member of ${DEMO.tradingName}. Refusing to create a company.`
                    : `No existing company named ${DEMO.tradingName} (${DEMO.companyNumber}). Refusing to create one.`,
            );
        }
        return {
            email: match.email,
            companyId: match.id,
            companyName: match.name,
        };
    });
}

function clerkKeyKind(): 'live' | 'test' | 'missing' {
    const key = process.env.CLERK_SECRET_KEY ?? '';
    if (key.startsWith('sk_live')) return 'live';
    if (key.startsWith('sk_test')) return 'test';
    if (!key || key.includes('SENSITIVE')) return 'missing';
    return 'test';
}

async function waitForApp(page: Page) {
    await page
        .waitForLoadState('networkidle', { timeout: 30_000 })
        .catch(() => {});
}

/** Strip Next.js DevTools / portal from the viewport before screenshots. */
async function hideDevChrome(page: Page) {
    await page.addStyleTag({
        content: `
      nextjs-portal,
      [data-nextjs-toast],
      [data-next-badge],
      [data-nextjs-dev-tools-button],
      #__next-build-watcher {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `,
    });
    await page.evaluate(() => {
        document.querySelectorAll('nextjs-portal').forEach((el) => el.remove());
    });
}

async function createFounderInClerk(email: string) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey || secretKey.includes('SENSITIVE')) {
        throw new Error(
            'CLERK_SECRET_KEY is required (live key for production capture). ' +
                'Fill it in .env.production.local — Vercel will not pull Sensitive values.',
        );
    }
    const client = createClerkClient({ secretKey });

    const existing = await client.users.getUserList({
        emailAddress: [email],
        limit: 1,
    });
    const user = existing.data[0];
    if (!user) {
        throw new Error(
            `No Clerk user for ${email}. Refusing to create one — reuse the existing demo company.`,
        );
    }
    await client.users.updateUser(user.id, {
        password: DEMO.password,
        skipPasswordChecks: true,
    });
    console.log(`Reusing Clerk user ${user.id} (${email})`);
    return user;
}

/** Password sign-in via the Clerk UI (works against live / production instances). */
async function signInFounderWithPassword(page: Page, email: string) {
    await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    const emailInput = page
        .locator(
            'input[name="identifier"], input[name="emailAddress"], input[type="email"]',
        )
        .first();
    await emailInput.waitFor({ state: 'visible', timeout: 20_000 });
    await emailInput.fill(email);

    const continueBtn = page
        .getByRole('button', { name: /^continue$/i })
        .first();
    if (await continueBtn.isVisible().catch(() => false)) {
        await continueBtn.click();
    }

    const password = page
        .locator('input[name="password"], input[type="password"]')
        .first();
    await password.waitFor({ state: 'visible', timeout: 20_000 });
    await password.fill(DEMO.password);

    await page
        .getByRole('button', { name: /continue|sign in/i })
        .first()
        .click();
    await page.waitForURL(/\/(onboarding|dashboard|subscribe)/, {
        timeout: 60_000,
    });
    console.log(`Signed in via password ${email} → ${page.url()}`);
}

async function seedForActor(email: string) {
    process.env.PROMO_SEED_ALLOW_REMOTE =
        process.env.PROMO_SEED_ALLOW_REMOTE ?? '1';

    return withDb(async (client) => {
        const db = drizzle(client, { schema });
        const result = await seedPromoDemo(db as unknown as Database, {
            force: true,
            actorEmail: email,
        });
        mkdirSync(dirname(routesPath), { recursive: true });
        writeFileSync(
            routesPath,
            JSON.stringify(result.routes, null, 2) + '\n',
        );
        console.log('Seeded promo demo for', email);
        return result.routes;
    });
}

/** Confirm the signed-in founder already has a company and can open the app. */
async function assertOnDashboard(page: Page) {
    if (!/\/dashboard(?:\?|$|\/)/.test(page.url())) {
        await page.goto(`${BASE_URL}/dashboard`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForApp(page);
    }
    const url = page.url();
    if (url.includes('/onboarding')) {
        throw new Error(
            'Signed-in user has no company. Refusing to create one.',
        );
    }
    if (url.includes('/subscribe')) {
        throw new Error(
            `Existing company is blocked at ${url}. It needs app access before capture.`,
        );
    }
    if (!/\/dashboard(?:\?|$|\/)/.test(url)) {
        throw new Error(`Expected the dashboard, landed on ${url}`);
    }
    console.log(`On dashboard → ${url}`);
}

async function captureStill(page: Page, name: string, path: string) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await hideDevChrome(page);
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
    for (const path of paths) {
        await page.goto(`${BASE_URL}${path}`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForApp(page);
        await hideDevChrome(page);
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
    void name;
}

function encodeWebmToMp4(webm: string, mp4: string) {
    const result = spawnSync(
        'ffmpeg',
        [
            '-y',
            // Drop the blank page Playwright records before the dashboard paints.
            '-ss',
            '0.6',
            '-i',
            webm,
            '-an',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            mp4,
        ],
        { encoding: 'utf8' },
    );
    if (result.status !== 0) {
        console.warn(
            `ffmpeg failed for ${webm}: ${result.stderr?.slice(0, 400)}`,
        );
        if (existsSync(webm)) {
            copyFileSync(webm, mp4.replace(/\.mp4$/, '.webm'));
        }
        return false;
    }
    console.log(`Encoded ${mp4}`);
    return true;
}

async function provisionFounder(page: Page, email: string) {
    const kind = clerkKeyKind();
    const wantsLive = isRemoteTarget;

    if (wantsLive && kind !== 'live') {
        throw new Error(
            `Remote target ${BASE_URL} but Clerk key is ${kind}. ` +
                'Put sk_live in .env.production.local so the existing founder can sign in.',
        );
    }

    await createFounderInClerk(email);
    await page.waitForTimeout(1500);

    if (kind === 'live' || wantsLive) {
        await signInFounderWithPassword(page, email);
        await assertOnDashboard(page);
        return;
    }

    await setupClerkTestingToken({ page });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await clerk.loaded({ page });
    await clerk.signIn({ page, emailAddress: email });
    await page.waitForTimeout(1500);
    await page.goto(`${BASE_URL}/dashboard`, {
        waitUntil: 'domcontentloaded',
    });
    await waitForApp(page);
    if (page.url().includes('/sign-in')) {
        await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
        await clerk.loaded({ page });
        await clerk.signIn({
            page,
            signInParams: {
                strategy: 'password',
                identifier: email,
                password: DEMO.password,
            },
        });
        await page.goto(`${BASE_URL}/dashboard`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForApp(page);
    }
    if (page.url().includes('/sign-in')) {
        throw new Error(`Sign-in failed; still on ${page.url()}`);
    }
    await assertOnDashboard(page);
    console.log(`Signed in ${email} → ${page.url()}`);
}

async function main() {
    // Refuse platform admin emails
    const blocked = (
        process.env.PLATFORM_ADMIN_EMAILS ??
        'lee+admin@dotanddashconsulting.com'
    )
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

    const founder = await findExistingDemoFounder();
    const email = founder.email;
    if (blocked.includes(email.toLowerCase())) {
        throw new Error('Demo founder email is in PLATFORM_ADMIN_EMAILS');
    }

    if (!isRemoteTarget) {
        await clerkSetup();
    }

    mkdirSync(marketingDir, { recursive: true });
    mkdirSync(rawDir, { recursive: true });

    console.log(`Marketing capture against ${BASE_URL}`);
    console.log(`Reusing ${founder.companyName} as ${email}`);
    console.log(`Clerk key: ${clerkKeyKind()}`);
    if (BASE_URL.includes('localhost') && !process.env.PROMO_BASE_URL) {
        console.log(
            `Tip: for the live site use PROMO_BASE_URL=${PRODUCTION_URL} with live secrets.`,
        );
    }

    const viewport = { width: 1440, height: 900 };
    const authBrowser = await chromium.launch({ headless: true });
    const authContext = await authBrowser.newContext({
        viewport,
        deviceScaleFactor: 1,
    });
    if (!isRemoteTarget || clerkKeyKind() === 'test') {
        await setupClerkTestingToken({ context: authContext }).catch(() => {
            /* testing tokens are development-only */
        });
    }
    const authPage = await authContext.newPage();

    let routes: Awaited<ReturnType<typeof seedForActor>>;
    let storageState: Awaited<ReturnType<typeof authContext.storageState>>;
    try {
        await provisionFounder(authPage, email);
        routes = await seedForActor(email);
        storageState = await authContext.storageState();
    } finally {
        await authContext.close();
        await authBrowser.close();
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        storageState,
        recordVideo: {
            dir: rawDir,
            size: viewport,
        },
    });
    if (!isRemoteTarget || clerkKeyKind() === 'test') {
        await setupClerkTestingToken({ context }).catch(() => {
            /* testing tokens are development-only */
        });
    }
    const page = await context.newPage();

    try {
        await page.goto(`${BASE_URL}/dashboard`, {
            waitUntil: 'domcontentloaded',
        });
        await waitForApp(page);
        await assertOnDashboard(page);
        await hideDevChrome(page);
        await page.waitForTimeout(1500);

        await captureStill(page, 'dashboard', routes.dashboard);
        await captureStill(page, 'quote', routes.quoteUrl);
        await captureStill(page, 'order', routes.orderUrl);
        await captureStill(page, 'invoice', routes.invoiceSentUrl);
        await captureStill(page, 'expense', routes.expenseUrl);
        await captureStill(page, 'transactions', routes.transactionsUrl);
        await captureStill(page, 'reports', routes.reportsUrl);

        await captureClip(page, 'clip-dashboard', [routes.dashboard], 600);
        await captureClip(page, 'clip-sales', [
            routes.quoteUrl,
            routes.orderUrl,
            routes.invoiceSentUrl,
        ]);
        await captureClip(page, 'clip-expenses', [
            routes.expenseUrl,
            routes.reimbursementUrl,
        ]);

        copyFileSync(
            join(marketingDir, 'dashboard.png'),
            join(marketingDir, 'poster.png'),
        );
    } finally {
        const video = page.video();
        await context.close();
        await browser.close();
        if (video) {
            const src = await video.path();
            const destWebm = join(rawDir, 'session.webm');
            renameSync(src, destWebm);
            const destMp4 = join(marketingDir, 'tour.mp4');
            encodeWebmToMp4(destWebm, destMp4);
            console.log(`Session video → ${destWebm}`);
        }
    }

    writeFileSync(
        join(rawDir, 'capture-meta.json'),
        JSON.stringify(
            {
                email,
                baseUrl: BASE_URL,
                capturedAt: new Date().toISOString(),
                company: founder.companyName,
                note: 'Reused existing fictional demo company; video starts on the dashboard',
            },
            null,
            2,
        ) + '\n',
    );

    console.log('Marketing assets written to public/marketing/');
    console.log(`Reused ${founder.companyName} (${email})`);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
