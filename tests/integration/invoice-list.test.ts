import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { clients, invoices, orders } from "@/db/schema";
import { listInvoicePage } from "@/lib/invoices/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let acmeId: string;
let globexId: string;

const PAST = "2000-01-31";
const FUTURE = "2999-01-31";

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db)).id;

  const [acme, globex] = await db
    .insert(clients)
    .values([
      { companyId, name: "Wile E", companyName: "Acme Ltd" },
      { companyId, name: "Hank Scorpio" },
    ])
    .returning();
  acmeId = acme.id;
  globexId = globex.id;
  const [order] = await db
    .insert(orders)
    .values({ companyId, number: "ORD-0042", clientId: acme.id })
    .returning();

  const base = { companyId, grossPence: 1_000, netPence: 1_000 };
  await db.insert(invoices).values([
    { ...base, number: "INV-9", clientId: acme.id, status: "draft", issueDate: "2026-03-01" },
    { ...base, number: "INV-10", clientId: acme.id, status: "sent", issueDate: "2026-04-01", dueDate: PAST, orderId: order.id },
    { ...base, number: "INV-11", clientId: globex.id, status: "sent", issueDate: "2026-05-01", dueDate: FUTURE },
    { ...base, number: "INV-12", clientId: globex.id, status: "overdue", issueDate: "2026-06-01", dueDate: FUTURE },
    { ...base, number: "INV-13", clientId: globex.id, status: "paid", issueDate: "2026-07-01", dueDate: PAST },
    { ...base, number: "INV-14", clientId: acme.id, status: "void", issueDate: "2026-08-01" },
  ]);

  // Another company's invoice, same client name and number.
  const other = await seedCompany(db, { slug: "other-co", name: "Other Co" });
  const [otherClient] = await db
    .insert(clients)
    .values({ companyId: other.id, name: "Acme Ltd" })
    .returning();
  await db.insert(invoices).values({
    ...base,
    companyId: other.id,
    number: "INV-10",
    clientId: otherClient.id,
    status: "sent",
    dueDate: PAST,
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

const numbers = (r: { rows: { number: string }[] }) => r.rows.map((x) => x.number);

describe("listInvoicePage", () => {
  it("lists only this company's invoices", async () => {
    const result = await listInvoicePage(companyId, { sort: "number", dir: "asc" });
    expect(result.total).toBe(6);
    expect(numbers(result)).toEqual(["INV-9", "INV-10", "INV-11", "INV-12", "INV-13", "INV-14"]);
  });

  it("splits sent and overdue on the due date, treating stored overdue as sent", async () => {
    const overdue = await listInvoicePage(companyId, { status: "overdue" });
    expect(numbers(overdue)).toEqual(["INV-10"]);
    expect(overdue.rows[0].status).toBe("overdue");

    const sent = await listInvoicePage(companyId, { status: "sent", sort: "number", dir: "asc" });
    expect(numbers(sent)).toEqual(["INV-11", "INV-12"]);
    expect(sent.rows.map((r) => r.status)).toEqual(["sent", "sent"]);

    const paid = await listInvoicePage(companyId, { status: "paid" });
    expect(numbers(paid)).toEqual(["INV-13"]);
  });

  it("searches number, client and order number", async () => {
    expect(numbers(await listInvoicePage(companyId, { q: "inv-13" }))).toEqual(["INV-13"]);
    expect((await listInvoicePage(companyId, { q: "acme" })).total).toBe(3);
    expect(numbers(await listInvoicePage(companyId, { q: "ord-0042" }))).toEqual(["INV-10"]);
    // LIKE wildcards are stripped, so a bare % filters nothing.
    expect((await listInvoicePage(companyId, { q: "%" })).total).toBe(6);
  });

  it("filters by client and issue date", async () => {
    expect((await listInvoicePage(companyId, { client: globexId })).total).toBe(3);
    const ranged = await listInvoicePage(companyId, {
      client: acmeId,
      from: "2026-03-15",
      to: "2026-08-31",
      sort: "issued",
      dir: "asc",
    });
    expect(numbers(ranged)).toEqual(["INV-10", "INV-14"]);
  });

  it("sorts status in the badge order with overdue computed", async () => {
    const result = await listInvoicePage(companyId, { sort: "status", dir: "asc" });
    expect(result.rows.map((r) => r.status)).toEqual([
      "draft",
      "sent",
      "sent",
      "overdue",
      "paid",
      "void",
    ]);
  });

  it("pages and clamps past the last page", async () => {
    const second = await listInvoicePage(companyId, {
      sort: "number",
      dir: "asc",
      page: 2,
      pageSize: 25,
    });
    expect(second).toMatchObject({ total: 6, page: 1, pageCount: 1 });

    const firstOfTwo = await listInvoicePage(companyId, { sort: "number", dir: "asc", pageSize: 4 });
    expect(firstOfTwo).toMatchObject({ total: 6, page: 1, pageCount: 2 });
    expect(numbers(firstOfTwo)).toEqual(["INV-9", "INV-10", "INV-11", "INV-12"]);

    const secondOfTwo = await listInvoicePage(companyId, { sort: "number", dir: "asc", pageSize: 4, page: 2 });
    expect(numbers(secondOfTwo)).toEqual(["INV-13", "INV-14"]);
  });

  it("leaves drafts and voids out of the accountant pack", async () => {
    const result = await listInvoicePage(companyId, { scope: "pack", sort: "number", dir: "asc" });
    expect(numbers(result)).toEqual(["INV-10", "INV-11", "INV-12", "INV-13"]);
  });
});
