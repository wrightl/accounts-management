import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  invoices,
  orders,
  payments,
  users,
} from "@/db/schema";
import { getDashboardOverview } from "@/lib/dashboard/queries";
import { seedCompany } from "@/lib/test/seed-company";
import type { SessionUser } from "@/lib/auth";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
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
  setTestDb(null);
  await ctx.client.close();
});

function sessionUser(): SessionUser {
  return {
    userId: "user_clerk_dash",
    email: "admin@test.com",
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
    expect(overview.funnel.find((s) => s.key === "orders")?.valuePence).toBe(
      200_000,
    );
    expect(overview.funnel.find((s) => s.key === "invoiced")?.valuePence).toBe(
      100_000,
    );
    expect(overview.funnel.find((s) => s.key === "collected")?.valuePence).toBe(
      40_000,
    );
    expect(overview.cashSeries.length).toBe(12);
    expect(overview.topClients[0]?.grossPence).toBe(100_000);
    // Active order 200k − invoiced 100k = 100k unbilled
    expect(overview.attention.unbilledFormatted).toBe("£1,000.00");
  });
});
