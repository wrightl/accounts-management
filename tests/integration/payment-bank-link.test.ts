import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  invoices,
  payments,
  reconciliationMatches,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { syncFxDifference } from "@/lib/invoices/fx-difference";
import {
  linkedPaymentIds,
  linkPaymentToBankTransaction,
  listReceiptsForPayment,
} from "@/lib/payments/link-bank";
import { recordInvoicePayment } from "@/lib/payments/record";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/invoices/fx-difference", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/invoices/fx-difference")>();
  // Pass-through spy: every payment path must keep exchange differences in step.
  return { ...actual, syncFxDifference: vi.fn(actual.syncFxDifference) };
});

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let actorId: string;
let accountId: string;
let invoiceId: string;
let paymentId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db)).id;
  const [actor] = await db
    .insert(users)
    .values({ companyId, clerkUserId: "user_1", email: "o@test.dev", name: "O", role: "admin" })
    .returning();
  actorId = actor.id;
  const [account] = await db
    .insert(bankAccounts)
    .values({ companyId, name: "Current", provider: "generic" })
    .returning();
  accountId = account.id;
  const [client] = await db.insert(clients).values({ companyId, name: "Acme" }).returning();
  // An invoice imported as already paid, with the payment the import recorded.
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId,
      number: "OLD-0042",
      clientId: client.id,
      status: "paid",
      source: "import",
      issueDate: "2026-02-01",
      dueDate: "2026-03-01",
      netPence: 25_000,
      grossPence: 25_000,
      paidAt: new Date("2026-02-20T12:00:00Z"),
    })
    .returning();
  invoiceId = inv.id;
  const [payment] = await db
    .insert(payments)
    .values({
      invoiceId,
      amountPence: 25_000,
      method: "import",
      receivedAt: new Date("2026-02-20T12:00:00Z"),
    })
    .returning();
  paymentId = payment.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function bankCredit(amountPence: number, bookedAt = "2026-02-21", externalId = "tx-1") {
  const [tx] = await db
    .insert(bankTransactions)
    .values({ bankAccountId: accountId, externalId, bookedAt, amountPence, counterparty: "ACME" })
    .returning();
  return tx;
}

function link(txId: string, company = companyId) {
  return linkPaymentToBankTransaction({ companyId: company, localUserId: actorId }, paymentId, txId);
}

describe("linking an existing payment to a bank receipt", () => {
  it("lists the exact amount first and links it", async () => {
    const near = await bankCredit(25_100, "2026-02-20", "tx-near");
    const exact = await bankCredit(25_000, "2026-03-15", "tx-exact");
    await bankCredit(90_000, "2026-02-20", "tx-far");

    const receipts = await listReceiptsForPayment(companyId, paymentId);
    expect(receipts.map((r) => r.bankTransactionId)).toEqual([exact.id, near.id]);

    expect((await link(exact.id)).ok).toBe(true);
    expect(syncFxDifference).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      invoiceId,
      "2026-03-15",
    );
    expect(await linkedPaymentIds(companyId, invoiceId)).toEqual(new Set([paymentId]));
    const detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.invoice.status).toBe("paid");
    expect(detail?.payments[0].amountPence).toBe(25_000);
  });

  it("an overpaid receipt becomes the payment and shows a refund due", async () => {
    const tx = await bankCredit(25_100);
    expect((await link(tx.id)).ok).toBe(true);

    const detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.payments[0].amountPence).toBe(25_100);
    expect(detail?.invoice.status).toBe("paid");
    expect(detail?.refundDueMinor).toBe(100);
    const [match] = await db
      .select()
      .from(reconciliationMatches)
      .where(eq(reconciliationMatches.paymentId, paymentId));
    expect(match.note).toMatch(/£250\.00 to the £251\.00 received/);
  });

  it("an underpaid receipt reopens the invoice with the rest owed", async () => {
    const tx = await bankCredit(24_850);
    expect((await link(tx.id)).ok).toBe(true);

    const detail = await getInvoiceDetail(companyId, invoiceId);
    expect(detail?.invoice.status).not.toBe("paid");
    expect(detail?.balanceMinor).toBe(150);
  });

  it("refuses a receipt far above the payment", async () => {
    const tx = await bankCredit(90_000);
    const result = await link(tx.id);
    expect(result.ok).toBe(false);
  });

  it("refuses a second link and a receipt already reconciled", async () => {
    const first = await bankCredit(25_000, "2026-02-21", "tx-a");
    const second = await bankCredit(25_000, "2026-02-22", "tx-b");
    expect((await link(first.id)).ok).toBe(true);
    const again = await link(second.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/already linked/);
  });

  it("can't link another company's payment", async () => {
    const tx = await bankCredit(25_000);
    const other = await seedCompany(db, { slug: "other-co" });
    const result = await link(tx.id, other.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Payment not found/);
  });

  it("doesn't link card payments", async () => {
    await db
      .update(payments)
      .set({ stripeCheckoutSessionId: "cs_1" })
      .where(eq(payments.id, paymentId));
    const tx = await bankCredit(25_000);
    expect((await link(tx.id)).ok).toBe(false);
    expect(await listReceiptsForPayment(companyId, paymentId)).toHaveLength(0);
  });

  describe("one bank receipt claimed twice at once", () => {
    async function secondImportedInvoice() {
      const [client] = await db.insert(clients).values({ companyId, name: "Beta" }).returning();
      const [inv] = await db
        .insert(invoices)
        .values({
          companyId,
          number: "OLD-0043",
          clientId: client.id,
          status: "paid",
          source: "import",
          issueDate: "2026-02-01",
          netPence: 25_000,
          grossPence: 25_000,
          paidAt: new Date("2026-02-20T12:00:00Z"),
        })
        .returning();
      const [payment] = await db
        .insert(payments)
        .values({
          invoiceId: inv.id,
          amountPence: 25_000,
          method: "import",
          receivedAt: new Date("2026-02-20T12:00:00Z"),
        })
        .returning();
      return { inv, payment };
    }

    async function confirmedMatchesFor(txId: string) {
      return db
        .select()
        .from(reconciliationMatches)
        .where(eq(reconciliationMatches.bankTransactionId, txId));
    }

    it("links it to only one of two invoices' payments", async () => {
      const tx = await bankCredit(25_000);
      const second = await secondImportedInvoice();
      const results = await Promise.all([
        link(tx.id),
        linkPaymentToBankTransaction(
          { companyId, localUserId: actorId },
          second.payment.id,
          tx.id,
        ),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await confirmedMatchesFor(tx.id)).toHaveLength(1);
    });

    it("lets only one of Record payment and Link bank receipt claim it", async () => {
      const tx = await bankCredit(25_000);
      const [client] = await db.insert(clients).values({ companyId, name: "Gamma" }).returning();
      const [open] = await db
        .insert(invoices)
        .values({
          companyId,
          number: "DD-2026-0900",
          clientId: client.id,
          status: "sent",
          issueDate: "2026-02-01",
          dueDate: "2099-03-01",
          netPence: 25_000,
          grossPence: 25_000,
        })
        .returning();
      const results = await Promise.all([
        link(tx.id),
        recordInvoicePayment({ companyId, localUserId: actorId }, open.id, {
          amountPounds: "250.00",
          method: "bank_transfer",
          bankTransactionId: tx.id,
        }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await confirmedMatchesFor(tx.id)).toHaveLength(1);
    });
  });
});
