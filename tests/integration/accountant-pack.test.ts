import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  dividendDeclarations,
  dividendPayouts,
  expenseReceipts,
  expenses,
  invoiceLineItems,
  invoices,
  payments,
  reconciliationMatches,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import {
  buildAccountantPack,
  buildStoreZip,
  listStoreZipEntries,
  toCsv,
} from "@/lib/reports/accountant-pack";
import { getStorage } from "@/lib/storage";

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
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

const PERIOD = { from: "2026-04-01", to: "2026-04-30" };

function fakePdf(label: string) {
  return new TextEncoder().encode(`%PDF-1.4 ${label}`);
}

async function storePdf(path: string, label: string) {
  const storage = getStorage();
  await storage.put(path, Buffer.from(fakePdf(label)), "application/pdf");
  return path;
}

describe("accountant pack integration", () => {
  it("includes CSVs, summary reports, invoice PDFs, and receipt files", async () => {
    const [client] = await db
      .insert(clients)
      .values({ companyId, name: "Acme", companyName: "Acme Ltd", email: "ap@acme.test" })
      .returning();

    const [user] = await db
      .insert(users)
      .values({ companyId, email: "founder@example.com", role: "user" })
      .returning();

    const pdfPath = await storePdf("invoices/inv-sent.pdf", "sent-invoice");

    const [sentInvoice] = await db
      .insert(invoices)
      .values({
        companyId,
        number: "DD-2026-0100",
        clientId: client.id,
        status: "sent",
        issueDate: "2026-04-10",
        dueDate: "2026-04-24",
        netPence: 10_000,
        vatPence: 0,
        grossPence: 10_000,
        pdfBlobPath: pdfPath,
      })
      .returning();

    await db.insert(invoiceLineItems).values({
      invoiceId: sentInvoice.id,
      description: "Consulting",
      quantity: 1,
      unitPricePence: 10_000,
      vatRate: 0,
      position: 0,
    });

    await db.insert(payments).values({
      invoiceId: sentInvoice.id,
      amountPence: 10_000,
      method: "bank_transfer",
      reference: "REF1",
      receivedAt: new Date("2026-04-15T10:00:00Z"),
    });

    const [expense] = await db
      .insert(expenses)
      .values({
        companyId,
        description: "Train ticket",
        category: "Travel",
        spentAt: "2026-04-12",
        amountPence: 4500,
        vatPence: 0,
        status: "recorded",
        source: "manual",
        paidByUserId: user.id,
      })
      .returning();

    const receiptPath = "receipts/exp-1/receipt.jpg";
    await getStorage().put(
      receiptPath,
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      "image/jpeg",
    );

    await db.insert(expenseReceipts).values({
      expenseId: expense.id,
      blobPath: receiptPath,
      filename: "receipt.jpg",
      contentType: "image/jpeg",
      sizeBytes: 4,
    });

    await db.insert(dividendDeclarations).values({
      companyId,
      id: "00000000-0000-4000-8000-0000000000d1",
      declaredAt: "2026-04-20",
      totalPence: 50_000,
      notes: "Interim",
    });
    await db.insert(dividendPayouts).values({
      declarationId: "00000000-0000-4000-8000-0000000000d1",
      shareholderName: "Lee Wright",
      amountPence: 50_000,
    });

    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling Business", provider: "starling" })
      .returning();

    const [bankTx] = await db
      .insert(bankTransactions)
      .values({
        bankAccountId: account.id,
        externalId: "tx-1",
        bookedAt: "2026-04-16",
        amountPence: -4500,
        counterparty: "Trainline",
        description: "Train",
      })
      .returning();

    await db.insert(reconciliationMatches).values({
      bankTransactionId: bankTx.id,
      matchType: "expense",
      expenseId: expense.id,
      confirmed: true,
    });

    const { zip } = await buildAccountantPack({ companyId, ...PERIOD });
    const entries = listStoreZipEntries(zip);

    expect(entries).toContain("invoices.csv");
    expect(entries).toContain("invoice-line-items.csv");
    expect(entries).toContain("payments.csv");
    expect(entries).toContain("expenses.csv");
    expect(entries).toContain("receipts-index.csv");
    expect(entries).toContain("dividends.csv");
    expect(entries).toContain("bank-transactions.csv");
    expect(entries).toContain("reconciliation-matches.csv");
    expect(entries).toContain("summary/pnl.csv");
    expect(entries).toContain("summary/vat.csv");
    expect(entries).toContain("summary/aged-receivables.csv");
    expect(entries).toContain("README.txt");
    expect(entries).toContain("invoices/DD-2026-0100.pdf");
    expect(entries).toContain(`receipts/${expense.id}/receipt.jpg`);

    const invoicesCsv = extractZipText(zip, "invoices.csv");
    expect(invoicesCsv).toContain("DD-2026-0100");
    expect(invoicesCsv).toContain("Acme Ltd");

    const lineItemsCsv = extractZipText(zip, "invoice-line-items.csv");
    expect(lineItemsCsv).toContain("Consulting");

    const expensesCsv = extractZipText(zip, "expenses.csv");
    expect(expensesCsv).toContain("Train ticket");

    const paymentsCsv = extractZipText(zip, "payments.csv");
    expect(paymentsCsv).toContain("DD-2026-0100");
  });

  it("excludes void and draft invoices, pending expenses, and out-of-period payments", async () => {
    const [client] = await db
      .insert(clients)
      .values({ companyId, name: "Beta", email: "beta@test.com" })
      .returning();

    const pdfPath = await storePdf("invoices/void.pdf", "void");

    await db.insert(invoices).values([
      {
        companyId,
        number: "DD-2026-VOID",
        clientId: client.id,
        status: "void",
        issueDate: "2026-04-05",
        grossPence: 1000,
        netPence: 1000,
        pdfBlobPath: pdfPath,
      },
      {
        companyId,
        number: "DD-2026-DRAFT",
        clientId: client.id,
        status: "draft",
        issueDate: "2026-04-06",
        grossPence: 2000,
        netPence: 2000,
      },
    ]);

    const [inPeriodInvoice] = await db
      .insert(invoices)
      .values({
        companyId,
        number: "DD-2026-0200",
        clientId: client.id,
        status: "sent",
        issueDate: "2026-04-08",
        grossPence: 5000,
        netPence: 5000,
        pdfBlobPath: pdfPath,
      })
      .returning();

    await db.insert(payments).values([
      {
        invoiceId: inPeriodInvoice.id,
        amountPence: 5000,
        receivedAt: new Date("2026-04-10T12:00:00Z"),
      },
      {
        invoiceId: inPeriodInvoice.id,
        amountPence: 1000,
        receivedAt: new Date("2026-05-01T12:00:00Z"),
      },
    ]);

    await db.insert(expenses).values([
      {
        companyId,
        description: "Pending email expense",
        spentAt: "2026-04-11",
        amountPence: 999,
        status: "pending",
        source: "email",
      },
      {
        companyId,
        description: "Recorded expense",
        spentAt: "2026-04-11",
        amountPence: 1500,
        status: "recorded",
        source: "manual",
      },
    ]);

    const { zip } = await buildAccountantPack({ companyId, ...PERIOD });
    const entries = listStoreZipEntries(zip);

    const invoicesCsv = extractZipText(zip, "invoices.csv");
    expect(invoicesCsv).toContain("DD-2026-0200");
    expect(invoicesCsv).not.toContain("DD-2026-VOID");
    expect(invoicesCsv).not.toContain("DD-2026-DRAFT");
    expect(entries).not.toContain("invoices/DD-2026-VOID.pdf");

    const expensesCsv = extractZipText(zip, "expenses.csv");
    expect(expensesCsv).toContain("Recorded expense");
    expect(expensesCsv).not.toContain("Pending email expense");

    const paymentsCsv = extractZipText(zip, "payments.csv");
    const paymentLines = paymentsCsv.split("\n").slice(1).filter(Boolean);
    expect(paymentLines).toHaveLength(1);
    expect(paymentLines[0]).toContain("50.00");
  });
});

describe("buildStoreZip", () => {
  it("round-trips text and binary entries", () => {
    const pdf = fakePdf("test");
    const zip = buildStoreZip({
      "hello.txt": "hello",
      "bin/test.pdf": pdf,
    });
    const entries = listStoreZipEntries(zip);
    expect(entries).toEqual(["hello.txt", "bin/test.pdf"]);
  });
});

/** Read a text entry from a store-only ZIP by scanning local headers. */
function extractZipText(zip: Uint8Array, target: string): string {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let offset = 0;
  while (offset + 30 <= zip.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(
      zip.subarray(nameStart, nameStart + nameLen),
    );
    const dataStart = nameStart + nameLen + extraLen;
    if (name === target) {
      return new TextDecoder().decode(
        zip.subarray(dataStart, dataStart + compSize),
      );
    }
    offset = dataStart + compSize;
  }
  throw new Error(`Entry not found: ${target}`);
}

describe("toCsv", () => {
  it("escapes commas and quotes", () => {
    const csv = toCsv(["a", "b"], [["1", 'say "hi"'], ["2", "a,b"]]);
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"a,b"');
  });
});
