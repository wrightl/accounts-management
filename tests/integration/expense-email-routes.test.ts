import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { expenseReceipts, expenses, inboundEmailJobs, users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { getStorage } from "@/lib/storage";
import { GET as emailBody } from "@/app/api/expenses/[id]/email-body/route";
import { GET as receiptFile } from "@/app/api/receipts/[id]/route";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_email", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "reviewer@example.com" },
    firstName: "Re",
    lastName: "Viewer",
    publicMetadata: {},
  })),
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db, { name: "Co A" })).id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_email",
    email: "reviewer@example.com",
    role: "admin",
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function emailedExpense(
  body: { bodyHtml?: string | null; bodyText?: string | null },
  inCompany = companyId,
) {
  const [job] = await db
    .insert(inboundEmailJobs)
    .values({
      companyId: inCompany,
      resendEmailId: `email-${crypto.randomUUID()}`,
      fromEmail: "founder@example.com",
      toEmail: "expenses@example.com",
      subject: "Lunch",
      status: "processed",
      ...body,
    })
    .returning();
  const [expense] = await db
    .insert(expenses)
    .values({
      companyId: inCompany,
      description: "Lunch",
      status: "pending",
      source: "email",
      inboundEmailJobId: job.id,
    })
    .returning();
  return expense;
}

function getBody(expenseId: string, query = "") {
  return emailBody(new Request(`http://localhost/api/expenses/${expenseId}/email-body${query}`), {
    params: Promise.resolve({ id: expenseId }),
  });
}

describe("email body route", () => {
  it("serves the HTML as sent, sandboxed and frameable only by the app", async () => {
    const html = '<p>Total <b>£24</b></p><script>alert(1)</script>';
    const expense = await emailedExpense({ bodyHtml: html, bodyText: "Total £24" });

    const res = await getBody(expense.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("sandbox");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(await res.text()).toBe(html);
  });

  it("serves the plain text when asked for it", async () => {
    const expense = await emailedExpense({ bodyHtml: "<p>Hi</p>", bodyText: "Hi\n  there" });
    const res = await getBody(expense.id, "?format=text");
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("Hi\n  there");
  });

  it("falls back to plain text when the email had no HTML", async () => {
    const expense = await emailedExpense({ bodyHtml: null, bodyText: "Plain only" });
    const res = await getBody(expense.id);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("Plain only");
  });

  it("returns 404 when no body was kept", async () => {
    const expense = await emailedExpense({});
    expect((await getBody(expense.id)).status).toBe(404);
  });

  it("returns 404 for another company's expense", async () => {
    const other = (await seedCompany(db, { name: "Co B" })).id;
    const expense = await emailedExpense({ bodyText: "Secret" }, other);
    expect((await getBody(expense.id)).status).toBe(404);
  });
});

describe("receipt preview", () => {
  async function receipt(contentType: string, filename: string) {
    const expense = await emailedExpense({});
    const stored = await getStorage().put(
      `receipts/${expense.id}/${filename}`,
      Buffer.from("bytes"),
      contentType,
    );
    const [row] = await db
      .insert(expenseReceipts)
      .values({ expenseId: expense.id, blobPath: stored.path, filename, contentType })
      .returning();
    return row;
  }

  function getReceipt(id: string, query = "") {
    return receiptFile(new Request(`http://localhost/api/receipts/${id}${query}`), {
      params: Promise.resolve({ id }),
    });
  }

  it("shows a PDF or image inline when asked", async () => {
    const pdf = await receipt("application/pdf", "bill.pdf");
    const png = await receipt("image/png", "photo.png");
    for (const r of [pdf, png]) {
      const res = await getReceipt(r.id, "?inline=1");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toMatch(/^inline;/);
      expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
      expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    }
  });

  it("still downloads by default, and for types a browser shouldn't render", async () => {
    const pdf = await receipt("application/pdf", "bill.pdf");
    const svg = await receipt("image/svg+xml", "logo.svg");
    expect((await getReceipt(pdf.id)).headers.get("content-disposition")).toMatch(/^attachment;/);
    expect((await getReceipt(svg.id, "?inline=1")).headers.get("content-disposition")).toMatch(
      /^attachment;/,
    );
  });
});
