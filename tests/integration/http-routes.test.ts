import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { eq } from "drizzle-orm";
import { clients, companies, invoices, users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { storeCompanyLogo } from "@/lib/company-logo";
import { getStorage } from "@/lib/storage";
import { GET as dailyCron } from "@/app/api/cron/daily/route";
import { POST as resendWebhook } from "@/app/api/webhooks/resend/route";
import { GET as invoicePdf } from "@/app/api/invoices/[id]/pdf/route";
import { GET as companyLogo } from "@/app/api/company/logo/route";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_http", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "http@example.com" },
    firstName: "Http",
    lastName: "User",
    publicMetadata: {},
  })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: clerkMocks.auth,
  currentUser: clerkMocks.currentUser,
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let prevCron: string | undefined;
let prevWebhook: string | undefined;
let prevResendKey: string | undefined;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  prevCron = process.env.CRON_SECRET;
  prevWebhook = process.env.RESEND_WEBHOOK_SECRET;
  prevResendKey = process.env.RESEND_API_KEY;
  clerkMocks.auth.mockResolvedValue({
    userId: "user_clerk_http",
    sessionClaims: {},
  });
  clerkMocks.currentUser.mockResolvedValue({
    primaryEmailAddress: { emailAddress: "http@example.com" },
    firstName: "Http",
    lastName: "User",
    publicMetadata: {},
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
  if (prevCron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevCron;
  if (prevWebhook === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = prevWebhook;
  if (prevResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = prevResendKey;
});

describe("HTTP route auth boundaries", () => {
  it("cron daily returns 503 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await dailyCron(
      new Request("http://localhost/api/cron/daily", {
        headers: { authorization: "Bearer anything" },
      }),
    );
    expect(res.status).toBe(503);
  });

  it("cron daily returns 401 for a wrong bearer token", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const res = await dailyCron(
      new Request("http://localhost/api/cron/daily", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("cron daily allows a matching bearer token", async () => {
    process.env.CRON_SECRET = "correct-secret";
    // No DATABASE_URL path still succeeds after auth
    const res = await dailyCron(
      new Request("http://localhost/api/cron/daily", {
        headers: { authorization: "Bearer correct-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });

  it("resend webhook returns 503 when secret is unset", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await resendWebhook(
      new Request("http://localhost/api/webhooks/resend", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(res.status).toBe(503);
  });

  it("resend webhook returns 400 for an invalid signature", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
    process.env.RESEND_API_KEY = "re_test_key";
    const res = await resendWebhook(
      new Request("http://localhost/api/webhooks/resend", {
        method: "POST",
        body: '{"type":"email.received"}',
        headers: {
          "svix-id": "msg_1",
          "svix-timestamp": "1",
          "svix-signature": "v1,bad",
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("invoice PDF returns 404 for another company's invoice", async () => {
    const companyA = await seedCompany(db, { name: "Co A" });
    const companyB = await seedCompany(db, { name: "Co B" });

    await db.insert(users).values({
      companyId: companyA.id,
      clerkUserId: "user_clerk_http",
      email: "http@example.com",
      role: "admin",
    });

    const [clientB] = await db
      .insert(clients)
      .values({ companyId: companyB.id, name: "Other" })
      .returning();
    const [invoiceB] = await db
      .insert(invoices)
      .values({
        companyId: companyB.id,
        number: "B-2026-0001",
        clientId: clientB.id,
        status: "sent",
        grossPence: 1000,
      })
      .returning();

    const res = await invoicePdf(new Request("http://localhost/api/invoices/x/pdf"), {
      params: Promise.resolve({ id: invoiceB.id }),
    });
    expect(res.status).toBe(404);
  });
});

describe("company logo", () => {
  const SVG = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>',
  );
  // PNG signature then padding: enough for the type to be read from the bytes.
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);

  async function signedInCompany() {
    const company = await seedCompany(db, { name: "Logo Co" });
    await db.insert(users).values({
      companyId: company.id,
      clerkUserId: "user_clerk_http",
      email: "http@example.com",
      role: "admin",
    });
    return company.id;
  }

  it("refuses an SVG, whatever type the browser says it is", async () => {
    const companyId = await signedInCompany();
    for (const type of ["image/svg+xml", "image/png"]) {
      const result = await storeCompanyLogo(companyId, new File([SVG], "logo.svg", { type }));
      expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/PNG, JPEG, WebP or GIF/) });
    }
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    expect(company!.logoUrl).toBeNull();
  });

  it("stores a picture under the type its bytes show", async () => {
    const companyId = await signedInCompany();
    const result = await storeCompanyLogo(
      companyId,
      new File([PNG], "logo.png", { type: "application/octet-stream" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect((await getStorage().get(result.path)).contentType).toBe("image/png");
  });

  it("serves a picture with nothing allowed to run, and never an SVG stored before uploads were checked", async () => {
    const companyId = await signedInCompany();

    await getStorage().put(`company/${companyId}/logo-png`, PNG, "image/png");
    await db.update(companies).set({ logoUrl: `company/${companyId}/logo-png` }).where(eq(companies.id, companyId));
    const ok = await companyLogo();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("content-security-policy")).toContain("sandbox");
    expect(ok.headers.get("content-security-policy")).toContain("default-src 'none'");

    await getStorage().put(`company/${companyId}/logo-svg`, SVG, "image/svg+xml");
    await db.update(companies).set({ logoUrl: `company/${companyId}/logo-svg` }).where(eq(companies.id, companyId));
    const svg = await companyLogo();
    expect(svg.status).toBe(404);
    expect(svg.headers.get("content-type")).not.toContain("svg");
  });
});
