import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { auditLog, companies, taxSubmissions, users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

const { recordTaxSubmission, redactSecrets, REDACTED } = await import("@/lib/tax/submissions");

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let otherCompanyId: string;
let adminId: string;

const RETURN = { periodKey: "26A1", vatDueSales: 100, finalised: true };

function submission(overrides: Partial<Parameters<typeof recordTaxSubmission>[0]> = {}) {
  return recordTaxSubmission({
    companyId,
    kind: "vat_return",
    environment: "sandbox",
    periodKey: "26A1",
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    request: RETURN,
    response: { formBundleNumber: "256660290587", processingDate: "2026-04-10T09:30:00Z" },
    httpStatus: 201,
    receiptId: "256660290587",
    correlationId: "corr-1",
    submittedByUserId: adminId,
    lockThrough: "2026-03-31",
    ...overrides,
  });
}

async function lockOf(id: string) {
  const [row] = await db.select({ lock: companies.booksLockedThrough }).from(companies).where(eq(companies.id, id));
  return row!.lock;
}

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db, { name: "Filing Ltd", vatRegistered: true }))!.id;
  otherCompanyId = (await seedCompany(db, { name: "Other Ltd" }))!.id;
  const [admin] = await db
    .insert(users)
    .values({ companyId, clerkUserId: "user_admin", email: "admin@example.com", name: "Ada", role: "admin" })
    .returning();
  adminId = admin!.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("recording a submission", () => {
  it("stores the submission and locks the period in one go", async () => {
    const row = await submission();
    expect(row).toMatchObject({ companyId, periodKey: "26A1", receiptId: "256660290587", lockedThrough: "2026-03-31" });
    expect(await lockOf(companyId)).toBe("2026-03-31");
    expect(await lockOf(otherCompanyId)).toBeNull();

    const audits = await db.select().from(auditLog).where(eq(auditLog.companyId, companyId));
    expect(audits.map((a) => a.action).sort()).toEqual(["books.lock", "tax.submitted"]);
    expect(audits.find((a) => a.action === "books.lock")!.meta).toMatchObject({
      from: null,
      to: "2026-03-31",
      reason: "tax_submission",
    });
  });

  it("never moves the lock backwards", async () => {
    await db.update(companies).set({ booksLockedThrough: "2026-06-30" }).where(eq(companies.id, companyId));
    const row = await submission();
    expect(row.lockedThrough).toBe("2026-06-30");
    expect(await lockOf(companyId)).toBe("2026-06-30");
    const locks = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.companyId, companyId), eq(auditLog.action, "books.lock")));
    expect(locks).toHaveLength(0);
  });

  it("records a rejected submission without touching the lock", async () => {
    const row = await submission({
      httpStatus: 403,
      receiptId: null,
      response: { code: "DUPLICATE_SUBMISSION", message: "Already submitted" },
    });
    expect(row.lockedThrough).toBeNull();
    expect(await lockOf(companyId)).toBeNull();
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "tax.submission_failed"));
    expect(audit!.meta).toMatchObject({ periodKey: "26A1", status: 403 });
  });

  it("allows only one accepted submission per period", async () => {
    await submission();
    await submission({ receiptId: null, httpStatus: 403, response: null });
    await expect(submission()).rejects.toThrow();
    const rows = await db.select().from(taxSubmissions).where(eq(taxSubmissions.companyId, companyId));
    expect(rows).toHaveLength(2);
    // The failed insert rolled back with its lock change and audit entry.
    const submitted = await db.select().from(auditLog).where(eq(auditLog.action, "tax.submitted"));
    expect(submitted).toHaveLength(1);
  });

  it("removes secrets from what it stores", async () => {
    const row = await submission({
      request: { ...RETURN, headers: { Authorization: "Bearer abc", "Gov-Client-Device-ID": "d" }, access_token: "t" },
    });
    expect(row.request).toEqual({
      ...RETURN,
      headers: { Authorization: REDACTED, "Gov-Client-Device-ID": "d" },
      access_token: REDACTED,
    });
  });
});

describe("redactSecrets", () => {
  it("reaches into arrays and nested objects", () => {
    expect(redactSecrets({ a: [{ refreshToken: "x", ok: 1 }], clientSecret: "s", n: null })).toEqual({
      a: [{ refreshToken: REDACTED, ok: 1 }],
      clientSecret: REDACTED,
      n: null,
    });
  });
});
