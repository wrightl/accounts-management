import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { clients, companyMemberships, invoices, users } from "@/db/schema";
import { getInvoiceDetail, listInvoices } from "@/lib/invoices/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("tenant isolation", () => {
  it("scopes listInvoices and getInvoiceDetail to company", async () => {
    const companyA = await seedCompany(db, { name: "Company A" });
    const companyB = await seedCompany(db, { name: "Company B" });

    const [clientA] = await db
      .insert(clients)
      .values({ companyId: companyA.id, name: "Client A" })
      .returning();
    const [clientB] = await db
      .insert(clients)
      .values({ companyId: companyB.id, name: "Client B" })
      .returning();

    const [invoiceA] = await db
      .insert(invoices)
      .values({
        companyId: companyA.id,
        number: "A-2026-0001",
        clientId: clientA.id,
        status: "sent",
        grossPence: 10_000,
        netPence: 10_000,
      })
      .returning();
    const [invoiceB] = await db
      .insert(invoices)
      .values({
        companyId: companyB.id,
        number: "B-2026-0001",
        clientId: clientB.id,
        status: "sent",
        grossPence: 20_000,
        netPence: 20_000,
      })
      .returning();

    const listedA = await listInvoices(companyA.id);
    expect(listedA.map((row) => row.id)).toEqual([invoiceA.id]);
    expect(listedA.map((row) => row.id)).not.toContain(invoiceB.id);

    const detailForA = await getInvoiceDetail(companyA.id, invoiceB.id);
    expect(detailForA).toBeNull();

    const ownDetail = await getInvoiceDetail(companyA.id, invoiceA.id);
    expect(ownDetail?.invoice.id).toBe(invoiceA.id);
  });

  it("scopes invoices to the accountant's selected company after switch", async () => {
    const companyA = await seedCompany(db, { name: "Company A" });
    const companyB = await seedCompany(db, { name: "Company B" });

    const [accountant] = await db
      .insert(users)
      .values({
        companyId: companyA.id,
        clerkUserId: "user_clerk_accountant",
        email: "accountant@example.com",
        role: "accountant",
      })
      .returning();
    await db.insert(companyMemberships).values([
      {
        userId: accountant.id,
        companyId: companyA.id,
        role: "accountant",
      },
      {
        userId: accountant.id,
        companyId: companyB.id,
        role: "accountant",
      },
    ]);

    const [clientA] = await db
      .insert(clients)
      .values({ companyId: companyA.id, name: "Client A" })
      .returning();
    const [clientB] = await db
      .insert(clients)
      .values({ companyId: companyB.id, name: "Client B" })
      .returning();

    await db.insert(invoices).values([
      {
        companyId: companyA.id,
        number: "A-2026-0001",
        clientId: clientA.id,
        status: "sent",
        grossPence: 10_000,
      },
      {
        companyId: companyB.id,
        number: "B-2026-0001",
        clientId: clientB.id,
        status: "sent",
        grossPence: 20_000,
      },
    ]);

    expect((await listInvoices(companyA.id)).map((r) => r.number)).toEqual([
      "A-2026-0001",
    ]);

    await db
      .update(users)
      .set({ companyId: companyB.id })
      .where(eq(users.id, accountant.id));

    expect((await listInvoices(companyB.id)).map((r) => r.number)).toEqual([
      "B-2026-0001",
    ]);
    expect(await getInvoiceDetail(companyB.id, (await listInvoices(companyA.id))[0]!.id)).toBeNull();
  });
});
