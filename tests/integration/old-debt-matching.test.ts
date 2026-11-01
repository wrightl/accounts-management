import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  companies,
  invoices,
  payments,
} from "@/db/schema";
import {
  findBankTransactionsForInvoice,
  suggestMatches,
} from "@/lib/bank/queries";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

const BOOKED = "2026-10-01";
const OLD_DUE = "2025-06-01";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;
let accountId: string;
let txCount = 0;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db)).id;
  const [account] = await db
    .insert(bankAccounts)
    .values({ companyId, name: "Bank", provider: "starling" })
    .returning();
  accountId = account.id;
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Jane Smith", companyName: "Acme Ltd" })
    .returning();
  clientId = client.id;
});

afterEach(async () => {
  vi.restoreAllMocks();
  setTestDb(null);
  await ctx.client.close();
});

async function addInvoice(
  number: string,
  values: Partial<typeof invoices.$inferInsert> = {},
) {
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId,
      clientId,
      number,
      status: "sent",
      issueDate: "2025-05-01",
      dueDate: OLD_DUE,
      netPence: 25_000,
      grossPence: 25_000,
      source: "import",
      ...values,
    })
    .returning();
  return inv;
}

async function addCredit(values: Partial<typeof bankTransactions.$inferInsert> = {}) {
  txCount += 1;
  await db.insert(bankTransactions).values({
    bankAccountId: accountId,
    externalId: `tx-${txCount}`,
    bookedAt: BOOKED,
    amountPence: 25_000,
    ...values,
  });
}

describe("matching bank credits to old debts", () => {
  it("suggests an imported debt when the reference matches", async () => {
    const inv = await addInvoice("OLD-0042");
    await addCredit({ reference: "OLD-0042" });
    const [match] = await suggestMatches(companyId);
    expect(match.target).toMatchObject({ invoiceId: inv.id });
  });

  it("suggests an imported debt when the counterparty matches", async () => {
    const inv = await addInvoice("OLD-0043");
    await addCredit({ counterparty: "Acme Ltd" });
    const [match] = await suggestMatches(companyId);
    expect(match.target).toMatchObject({ invoiceId: inv.id });
  });

  it("doesn't suggest one on the amount alone", async () => {
    await addInvoice("OLD-0044");
    await addCredit({ reference: "unrelated", counterparty: "Someone Else" });
    expect(await suggestMatches(companyId)).toEqual([]);
  });

  it("keeps the date limit for invoices created in Alfa", async () => {
    await addInvoice("OWN-1", { source: "alfa" });
    await addCredit({ reference: "OWN-1", counterparty: "Acme Ltd" });
    expect(await suggestMatches(companyId)).toEqual([]);
  });

  it("finds an old debt's bank credit from the invoice page", async () => {
    const inv = await addInvoice("OLD-0045");
    await addCredit({ reference: "OLD-0045" });
    const found = await findBankTransactionsForInvoice(companyId, inv.id);
    expect(found).toHaveLength(1);
  });

  it("doesn't let a payment from before cutover absorb a new credit", async () => {
    await db
      .update(companies)
      .set({ invoiceCutoverDate: "2026-04-01" })
      .where(eq(companies.id, companyId));
    const paid = await addInvoice("PAID-1", {
      status: "paid",
      broughtForward: true,
    });
    await db.insert(payments).values({
      invoiceId: paid.id,
      amountPence: 25_000,
      receivedAt: new Date("2026-03-20T12:00:00Z"),
      method: "import",
      reference: "PAID-1",
    });
    await addCredit({ bookedAt: "2026-03-25", reference: "PAID-1" });
    expect(await suggestMatches(companyId)).toEqual([]);
  });

  it("still suggests a payment recorded after cutover on a brought-forward invoice", async () => {
    await db
      .update(companies)
      .set({ invoiceCutoverDate: "2026-04-01" })
      .where(eq(companies.id, companyId));
    const paid = await addInvoice("PAID-2", {
      status: "paid",
      broughtForward: true,
    });
    const [payment] = await db
      .insert(payments)
      .values({
        invoiceId: paid.id,
        amountPence: 25_000,
        receivedAt: new Date(`${BOOKED}T12:00:00Z`),
        reference: "PAID-2",
      })
      .returning();
    await addCredit({ reference: "PAID-2" });
    const [match] = await suggestMatches(companyId);
    expect(match.target).toMatchObject({ paymentId: payment.id });
  });

  it("runs the same number of queries however many invoices are open", async () => {
    async function selectsWith(openInvoices: number, label: string) {
      for (let i = 0; i < openInvoices; i++) {
        await addInvoice(`${label}-${i}`, { grossPence: 1_000 + i });
      }
      await addCredit({ amountPence: 999, reference: "none" });
      const spy = vi.spyOn(db, "select");
      await suggestMatches(companyId);
      const calls = spy.mock.calls.length;
      spy.mockRestore();
      return calls;
    }
    const few = await selectsWith(1, "FEW");
    const many = await selectsWith(8, "MANY");
    // The second run also has the first run's credit to look at.
    const perCredit = many - few;
    expect(perCredit).toBeLessThan(8);
  });
});
