import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { eq } from "drizzle-orm";
import {
  clients,
  companies,
  creditNotes,
  invoices,
  orders,
  payments,
  quotes,
  users,
} from "@/db/schema";
import { earliestBooksDate, getDashboardOverview } from "@/lib/dashboard/queries";
import { getOrderDetail } from "@/lib/orders/queries";
import { seedCompany } from "@/lib/test/seed-company";
import type { SessionUser } from "@/lib/auth";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  // Fixtures use fixed September 2026 dates and assert on "this-month";
  // pin the clock (Date only — PGlite needs real timers).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_dash",
    email: "admin@test.com",
    name: "Test Admin",
    role: "admin",
  });
});

afterEach(async () => {
  vi.useRealTimers();
  setTestDb(null);
  await ctx.client.close();
});

function sessionUser(): SessionUser {
  return {
    userId: "user_clerk_dash",
    email: "admin@test.com",
    emailVerified: true,
    name: "Test Admin",
    role: "admin",
    localUserId: null,
    companyId,
    entityType: "limited_company",
  };
}

describe("getDashboardOverview", () => {
  it("aggregates collected, pipeline, and funnel from seeded books", async () => {
    const [client] = await db
      .insert(clients)
      .values({ companyId, name: "Acme Ltd", email: "acme@test.com" })
      .returning();

    const [order] = await db
      .insert(orders)
      .values({
        companyId,
        clientId: client.id,
        number: "ORD-001",
        status: "active",
        issueDate: "2026-08-01",
        grossPence: 200_000,
        netPence: 200_000,
        vatPence: 0,
      })
      .returning();

    const [invoice] = await db
      .insert(invoices)
      .values({
        companyId,
        clientId: client.id,
        orderId: order.id,
        number: "INV-001",
        status: "sent",
        issueDate: "2026-09-05",
        dueDate: "2026-09-20",
        grossPence: 100_000,
        netPence: 100_000,
        vatPence: 0,
      })
      .returning();

    await db.insert(payments).values({
      invoiceId: invoice.id,
      amountPence: 40_000,
      receivedAt: new Date("2026-09-10T12:00:00Z"),
    });

    const overview = await getDashboardOverview(
      companyId,
      sessionUser(),
      "this-month",
    );

    expect(overview.periodKey).toBe("this-month");
    expect(overview.heroes).toHaveLength(4);
    expect(overview.heroes[0]!.key).toBe("collected");
    expect(overview.heroes[0]!.valuePence).toBe(40_000);
    // Only the part of the order not yet invoiced; the rest is in Invoiced.
    expect(overview.funnel.find((s) => s.key === "orders")?.valuePence).toBe(
      100_000,
    );
    expect(overview.funnel.find((s) => s.key === "invoiced")?.valuePence).toBe(
      100_000,
    );
    expect(overview.funnel.find((s) => s.key === "collected")?.valuePence).toBe(
      40_000,
    );
    expect(overview.cashSeries.length).toBe(12);
    expect(overview.topClients[0]?.totalPence).toBe(100_000);
    // Active order 200k − invoiced 100k = 100k unbilled
    expect(overview.attention.unbilledFormatted).toBe("£1,000.00");
  });

  it("nets credit notes out of top clients and order billing", async () => {
    const [acme, beta] = await db
      .insert(clients)
      .values([
        { companyId, name: "Acme Ltd", email: "acme@test.com" },
        { companyId, name: "Beta Ltd", email: "beta@test.com" },
      ])
      .returning();

    const [order] = await db
      .insert(orders)
      .values({
        companyId,
        clientId: acme.id,
        number: "ORD-001",
        status: "active",
        issueDate: "2026-08-01",
        grossPence: 200_000,
        netPence: 200_000,
        vatPence: 0,
      })
      .returning();

    const [acmeInvoice, betaInvoice] = await db
      .insert(invoices)
      .values([
        {
          companyId,
          clientId: acme.id,
          orderId: order.id,
          number: "INV-001",
          status: "sent",
          issueDate: "2026-09-05",
          dueDate: "2026-09-20",
          grossPence: 100_000,
          netPence: 100_000,
          vatPence: 0,
        },
        {
          companyId,
          clientId: beta.id,
          number: "INV-002",
          status: "sent",
          issueDate: "2026-09-06",
          dueDate: "2026-09-20",
          grossPence: 50_000,
          netPence: 50_000,
          vatPence: 0,
        },
      ])
      .returning();

    await db.insert(creditNotes).values([
      {
        companyId,
        invoiceId: acmeInvoice!.id,
        clientId: acme.id,
        number: "CN-2026-0001",
        issueDate: "2026-09-12",
        reason: "Day cancelled",
        netPence: 30_000,
        vatPence: 0,
        grossPence: 30_000,
      },
      {
        companyId,
        invoiceId: betaInvoice!.id,
        clientId: beta.id,
        number: "CN-2026-0002",
        issueDate: "2026-09-13",
        reason: "Billed in error",
        netPence: 50_000,
        vatPence: 0,
        grossPence: 50_000,
      },
    ]);

    const overview = await getDashboardOverview(companyId, sessionUser(), "this-month");

    // Beta is fully credited, so only Acme's net £700 remains.
    expect(overview.topClients).toHaveLength(1);
    expect(overview.topClients[0]?.name).toBe("Acme Ltd");
    expect(overview.topClients[0]?.totalPence).toBe(70_000);
    // Active order 200k − (invoiced 100k − credited 30k) = 130k unbilled
    expect(overview.attention.unbilledFormatted).toBe("£1,300.00");

    const detail = await getOrderDetail(companyId, order.id);
    expect(detail?.priorInvoicedPence).toBe(70_000);
    expect(detail?.remainingPence).toBe(130_000);
  });

  it("counts an accepted quote once it has become an order", async () => {
    const [client] = await db
      .insert(clients)
      .values({ companyId, name: "Acme Ltd" })
      .returning();
    const [won] = await db
      .insert(quotes)
      .values({
        companyId,
        clientId: client.id,
        number: "Q-001",
        status: "accepted",
        grossPence: 50_000,
      })
      .returning();
    await db.insert(quotes).values({
      companyId,
      clientId: client.id,
      number: "Q-002",
      status: "sent",
      grossPence: 20_000,
    });
    await db.insert(orders).values({
      companyId,
      clientId: client.id,
      quoteId: won.id,
      number: "ORD-001",
      status: "active",
      grossPence: 50_000,
    });

    const overview = await getDashboardOverview(companyId, sessionUser(), "this-month");

    expect(overview.funnel.find((s) => s.key === "quotes")?.valuePence).toBe(20_000);
    expect(overview.funnel.find((s) => s.key === "orders")?.valuePence).toBe(50_000);
    expect(overview.heroes.find((h) => h.key === "pipeline")?.valuePence).toBe(70_000);
  });

  it("shows imported history from before cutover in an earlier year", async () => {
    await db
      .update(companies)
      .set({ invoiceCutoverDate: "2026-04-01" })
      .where(eq(companies.id, companyId));
    const [client] = await db
      .insert(clients)
      .values({ companyId, name: "Acme Ltd" })
      .returning();
    const [old] = await db
      .insert(invoices)
      .values({
        companyId,
        clientId: client.id,
        number: "IMP-1",
        status: "paid",
        issueDate: "2024-10-15",
        netPence: 100_000,
        vatPence: 20_000,
        grossPence: 120_000,
        source: "import",
        broughtForward: true,
      })
      .returning();
    await db.insert(payments).values({
      invoiceId: old.id,
      amountPence: 120_000,
      receivedAt: new Date("2024-11-01T12:00:00Z"),
    });

    // Seeded companies have a March year end, so October 2024 is FY 2024/25.
    const overview = await getDashboardOverview(companyId, sessionUser(), "fy-2024");

    expect(overview.periodKey).toBe("fy-2024");
    expect(overview.isPastYear).toBe(true);
    expect(overview.periodBeforeCutover).toBe(true);
    expect(overview.chartWindowLabel).toBe(overview.periodLabel);
    // Net of VAT, and counted although it is brought forward.
    expect(overview.topClients[0]?.totalPence).toBe(100_000);
    expect(overview.heroes.find((h) => h.key === "collected")?.valuePence).toBe(120_000);
    expect(overview.funnel.find((s) => s.key === "invoiced")?.valuePence).toBe(120_000);
    // Profit stays on the accounts basis, as Reports and VAT do.
    expect(overview.heroes.find((h) => h.key === "profit")?.valuePence).toBe(0);
    // Pipeline stages are today's, so an earlier year leaves them out.
    expect(overview.funnel.map((s) => s.key)).toEqual(["invoiced", "collected"]);
  });
});

describe("earliestBooksDate", () => {
  const settings = {
    incorporatedOn: "2025-06-01",
    openingBalancesAsAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  it("reaches back to an earlier invoice", () => {
    expect(earliestBooksDate(settings, "2024-10-15")).toBe("2024-10-15");
  });

  it("keeps incorporation when invoices are later", () => {
    expect(earliestBooksDate(settings, "2025-09-01")).toBe("2025-06-01");
    expect(earliestBooksDate(settings, null)).toBe("2025-06-01");
  });
});
