import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { clients, orders } from "@/db/schema";
import { getOrdersSummary } from "@/lib/orders/summary";

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

describe("getOrdersSummary", () => {
  it("buckets orders by status and counts active pipeline", async () => {
    const [client] = await db
      .insert(clients)
      .values({ name: "Acme Ltd", email: "acme@test.com" })
      .returning();

    await db.insert(orders).values([
      {
        clientId: client.id,
        number: "ORD-001",
        status: "active",
        issueDate: "2026-08-01",
        grossPence: 100_000,
        netPence: 100_000,
        vatPence: 0,
      },
      {
        clientId: client.id,
        number: "ORD-002",
        status: "active",
        issueDate: "2026-08-02",
        grossPence: 50_000,
        netPence: 50_000,
        vatPence: 0,
      },
      {
        clientId: client.id,
        number: "ORD-003",
        status: "draft",
        issueDate: "2026-08-03",
        grossPence: 25_000,
        netPence: 25_000,
        vatPence: 0,
      },
      {
        clientId: client.id,
        number: "ORD-004",
        status: "completed",
        issueDate: "2026-07-01",
        grossPence: 75_000,
        netPence: 75_000,
        vatPence: 0,
      },
    ]);

    const summary = await getOrdersSummary();

    expect(summary.totalCount).toBe(4);
    expect(summary.totalGrossFormatted).toBe("£2,500.00");
    expect(summary.activeCount).toBe(2);
    expect(summary.activeGrossFormatted).toBe("£1,500.00");

    const active = summary.byStatus.find((row) => row.status === "active");
    const draft = summary.byStatus.find((row) => row.status === "draft");
    const completed = summary.byStatus.find((row) => row.status === "completed");

    expect(active).toMatchObject({ count: 2, grossFormatted: "£1,500.00" });
    expect(draft).toMatchObject({ count: 1, grossFormatted: "£250.00" });
    expect(completed).toMatchObject({ count: 1, grossFormatted: "£750.00" });
    expect(summary.byStatus.some((row) => row.status === "cancelled")).toBe(false);
  });

  it("returns empty summary when no orders exist", async () => {
    const summary = await getOrdersSummary();
    expect(summary.totalCount).toBe(0);
    expect(summary.activeCount).toBe(0);
    expect(summary.byStatus).toEqual([]);
  });
});
