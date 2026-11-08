import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  clients,
  creditNotes,
  dividendDeclarations,
  expenses,
  invoices,
  orders,
  quotes,
  reimbursements,
  shareholders,
  users,
} from "@/db/schema";
import { listAuditPage } from "@/lib/audit";
import { listClientPage } from "@/lib/clients/queries";
import { listCreditNotePage } from "@/lib/credit-notes/queries";
import { listExpensePage } from "@/lib/expenses/queries";
import { LIST_PAGE_SIZE } from "@/lib/list-paging";
import { listOrderPage } from "@/lib/orders/queries";
import { listQuotePage } from "@/lib/quotes/queries";
import { listReimbursementPage } from "@/lib/reimbursements/queries";
import { listDividendDeclarationPage } from "@/lib/reports/queries";
import { listShareholderPage } from "@/lib/shareholders/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let otherCompanyId: string;

/** More than one page at the default size, with repeated sort values to test the tie-break. */
const ROWS = LIST_PAGE_SIZE + 5;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db, { name: "Paged Co", slug: "paged-co" })).id;
  otherCompanyId = (await seedCompany(db, { name: "Other Co", slug: "other-co" })).id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

type Page = { rows: { id: string }[]; total: number; page: number; pageCount: number };

/** Every page's ids in order, checking the totals agree on every page. */
async function allPages(fetch: (page: number) => Promise<Page>): Promise<string[]> {
  const first = await fetch(1);
  const ids = first.rows.map((r) => r.id);
  for (let page = 2; page <= first.pageCount; page++) {
    const next = await fetch(page);
    expect(next.total).toBe(first.total);
    ids.push(...next.rows.map((r) => r.id));
  }
  return ids;
}

async function expectPagesCover(
  fetch: (page: number) => Promise<Page>,
  expectedTotal: number,
) {
  const ids = await allPages(fetch);
  expect(ids).toHaveLength(expectedTotal);
  expect(new Set(ids).size).toBe(expectedTotal);
  const past = await fetch(99);
  expect(past.page).toBe(past.pageCount);
}

async function seedClient(id: string, name: string) {
  const [row] = await db.insert(clients).values({ companyId: id, name }).returning();
  return row;
}

describe("record lists page in the database", () => {
  it("pages clients by every column, ignoring other companies", async () => {
    await db.insert(clients).values(
      range(ROWS).map((i) => ({ companyId, name: `Client ${i % 3}`, email: i % 4 ? `c${i}@x.test` : null })),
    );
    await seedClient(otherCompanyId, "Not ours");
    for (const sort of ["name", "company", "email"] as const) {
      for (const dir of ["asc", "desc"] as const) {
        await expectPagesCover(
          (page) => listClientPage(companyId, { sort, dir, page, pageSize: 25 }),
          ROWS,
        );
      }
    }
  });

  it("pages quotes, orders and credit notes by every column", async () => {
    const client = await seedClient(companyId, "Acme");
    const [quote] = await db
      .insert(quotes)
      .values(range(ROWS).map((i) => ({ companyId, clientId: client.id, number: `Q-${i}`, grossPence: i % 2 })))
      .returning();
    await db
      .insert(orders)
      .values(range(ROWS).map((i) => ({ companyId, clientId: client.id, number: `O-${i}`, quoteId: i === 1 ? quote.id : null })));
    const [invoice] = await db
      .insert(invoices)
      .values({ companyId, clientId: client.id, number: "INV-1", status: "sent" })
      .returning();
    await db.insert(creditNotes).values(
      range(ROWS).map((i) => ({
        companyId,
        clientId: client.id,
        invoiceId: invoice.id,
        number: `CN-${i}`,
        issueDate: "2026-04-01",
        reason: "Refund",
      })),
    );

    for (const dir of ["asc", "desc"] as const) {
      for (const sort of ["created", "number", "version", "client", "status", "total"] as const) {
        await expectPagesCover((page) => listQuotePage(companyId, { sort, dir, page, pageSize: 25 }), ROWS);
      }
      for (const sort of ["created", "number", "client", "quote", "status", "total"] as const) {
        await expectPagesCover((page) => listOrderPage(companyId, { sort, dir, page, pageSize: 25 }), ROWS);
      }
      for (const sort of ["created", "number", "client", "invoice", "status", "issued", "total"] as const) {
        await expectPagesCover(
          (page) => listCreditNotePage(companyId, { sort, dir, page, pageSize: 25 }),
          ROWS,
        );
      }
    }
    expect((await listQuotePage(otherCompanyId, { sort: "created", dir: "desc", page: 1, pageSize: 25 })).total).toBe(0);
  });

  it("filters reimbursement runs by status before paging", async () => {
    const [payee] = await db
      .insert(users)
      .values({ companyId, clerkUserId: "u_pay", email: "pay@x.test", role: "user" })
      .returning();
    await db.insert(reimbursements).values(
      range(ROWS).map((i) => ({
        companyId,
        payeeUserId: payee.id,
        status: i % 3 === 0 ? ("paid" as const) : ("pending" as const),
        totalPence: 100,
      })),
    );
    const pending = await listReimbursementPage(companyId, {
      status: "pending",
      sort: "payee",
      dir: "asc",
      page: 1,
      pageSize: 25,
    });
    expect(pending.total).toBe(range(ROWS).filter((i) => i % 3 !== 0).length);
    expect(pending.rows.every((r) => r.status === "pending")).toBe(true);
    await expectPagesCover(
      (page) => listReimbursementPage(companyId, { sort: "total", dir: "desc", page, pageSize: 25 }),
      ROWS,
    );
  });

  it("counts the expenses filter across pages", async () => {
    await db.insert(expenses).values(
      range(ROWS).map((i) => ({
        companyId,
        description: i % 2 ? "Taxi" : "Lunch",
        spentAt: "2026-04-01",
        amountPence: 100,
        status: "recorded" as const,
      })),
    );
    const taxis = await listExpensePage(companyId, { q: "taxi", page: 1, pageSize: 25 });
    expect(taxis.total).toBe(range(ROWS).filter((i) => i % 2).length);
    await expectPagesCover((page) => listExpensePage(companyId, { page, pageSize: 25 }), ROWS);
  });

  it("totals dividends for the whole period, not just the page", async () => {
    await db.insert(dividendDeclarations).values(
      range(ROWS).map((i) => ({ companyId, declaredAt: `2026-04-${String((i % 28) + 1).padStart(2, "0")}`, totalPence: 1000 })),
    );
    await db.insert(dividendDeclarations).values({ companyId, declaredAt: "2025-01-01", totalPence: 99 });
    const page = await listDividendDeclarationPage(companyId, {
      from: "2026-04-01",
      to: "2026-04-30",
      page: 2,
      pageSize: 25,
    });
    expect(page.rows).toHaveLength(ROWS - 25);
    expect(page.total).toBe(ROWS);
    expect(page.periodTotalPence).toBe(ROWS * 1000);
  });

  it("pages active and archived shareholders separately", async () => {
    await db.insert(shareholders).values([
      ...range(ROWS).map((i) => ({ companyId, name: `Holder ${i}`, shareCount: 1 })),
      { companyId, name: "Gone", shareCount: 5, archivedAt: new Date() },
    ]);
    const active = await listShareholderPage(companyId, { archived: false, totalShares: ROWS, page: 1, pageSize: 25 });
    const archived = await listShareholderPage(companyId, { archived: true, totalShares: ROWS, page: 1, pageSize: 25 });
    expect(active.total).toBe(ROWS);
    expect(active.rows[0].percent).toBeCloseTo(100 / ROWS);
    expect(archived.rows.map((r) => r.name)).toEqual(["Gone"]);
  });

  it("pages the audit log without showing another company's entries", async () => {
    await db.insert(auditLog).values([
      ...range(ROWS).map(() => ({ companyId, action: "invoice.update" })),
      { companyId: otherCompanyId, action: "secret.action" },
    ]);
    await expectPagesCover((page) => listAuditPage(companyId, { page, pageSize: 25 }), ROWS);
  });
});
