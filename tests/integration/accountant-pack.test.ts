import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  companies,
  dividendDeclarations,
  dividendPayouts,
  expenseReceipts,
  expenses,
  invoiceLineItems,
  invoices,
  payments,
  reconciliationMatches,
  reimbursementItems,
  reimbursements,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { listExpenses } from "@/lib/expenses/queries";
import { listInvoices } from "@/lib/invoices/queries";
import {
  listStoreZipEntries,
  streamAccountantPack,
  toCsv,
  zipStoreStream,
  type ZipEntry,
} from "@/lib/reports/accountant-pack";
import { renderVatSummaryPdf } from "@/lib/reports/vat-pdf";
import { getStorage } from "@/lib/storage";
import { readStoreZipEntries } from "@/lib/zip/store";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/reports/vat-pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/vat-pdf")>();
  return { ...actual, renderVatSummaryPdf: vi.fn(actual.renderVatSummaryPdf) };
});

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

async function collect(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function buildPack(options: Parameters<typeof streamAccountantPack>[0]) {
  const { stream } = await streamAccountantPack(options);
  return { zip: await collect(stream) };
}

async function insertExpense() {
  const [user] = await db
    .insert(users)
    .values({ companyId, email: "payer@example.com", role: "user" })
    .returning();
  const [expense] = await db
    .insert(expenses)
    .values({
      companyId,
      description: "Receipts test",
      category: "Travel",
      spentAt: "2026-04-12",
      amountPence: 4500,
      vatPence: 0,
      status: "recorded",
      source: "manual",
      paidByUserId: user.id,
    })
    .returning();
  return expense;
}

async function insertReceipt(
  expenseId: string,
  blobPath: string,
  filename: string,
  data?: Uint8Array,
) {
  if (data) await getStorage().put(blobPath, data, "image/jpeg");
  await db.insert(expenseReceipts).values({
    expenseId,
    blobPath,
    filename,
    contentType: "image/jpeg",
    sizeBytes: data?.byteLength ?? 0,
  });
}

describe("accountant pack integration", () => {
  it("contains the same invoices and expenses an accountant sees on screen", async () => {
    const [client] = await db.insert(clients).values({ companyId, name: "Acme" }).returning();
    for (const status of ["draft", "sent", "paid", "void"] as const) {
      await db.insert(invoices).values({
        companyId,
        number: `SCOPE-${status}`,
        clientId: client.id,
        status,
        issueDate: "2026-04-10",
      });
    }
    for (const status of ["pending", "recorded", "company_paid"] as const) {
      await db.insert(expenses).values({
        companyId,
        description: `scope-${status}`,
        status,
        spentAt: "2026-04-11",
      });
    }

    const { zip } = await buildPack({ companyId, ...PERIOD });
    const invoicesCsv = extractZipText(zip, "invoices.csv");
    const expensesCsv = extractZipText(zip, "expenses.csv");

    const onScreenInvoices = await listInvoices(companyId, "pack");
    expect(onScreenInvoices.map((r) => r.number).sort()).toEqual(["SCOPE-paid", "SCOPE-sent"]);
    for (const status of ["draft", "sent", "paid", "void"]) {
      expect(invoicesCsv.includes(`SCOPE-${status}`)).toBe(
        onScreenInvoices.some((r) => r.number === `SCOPE-${status}`),
      );
    }

    const onScreenExpenses = await listExpenses(companyId, { scope: "pack" });
    expect(onScreenExpenses.map((r) => r.description).sort()).toEqual([
      "scope-company_paid",
      "scope-recorded",
    ]);
    for (const status of ["pending", "recorded", "company_paid"]) {
      expect(expensesCsv.includes(`scope-${status}`)).toBe(
        onScreenExpenses.some((r) => r.description === `scope-${status}`),
      );
    }
  });

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
        notes: "Booked for the Leeds workshop",
        noteSharedWithAccountant: true,
      })
      .returning();
    await db.insert(expenses).values({
      companyId,
      description: "Coffee",
      spentAt: "2026-04-12",
      amountPence: 300,
      status: "recorded",
      notes: "not for the accountant",
    });

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
        notes: "Return leg, client visit",
        noteSharedWithAccountant: true,
      })
      .returning();
    await db.insert(bankTransactions).values({
      bankAccountId: account.id,
      externalId: "tx-2",
      bookedAt: "2026-04-17",
      amountPence: -900,
      counterparty: "Cafe",
      notes: "team-only aside",
    });

    await db.insert(reconciliationMatches).values({
      bankTransactionId: bankTx.id,
      matchType: "expense",
      expenseId: expense.id,
      confirmed: true,
    });

    await db
      .update(companies)
      .set({
        bankName: "Starling Bank",
        bankAccountName: "Pack Test Ltd",
        sortCode: "60-83-71",
        accountNumber: "91405512",
      })
      .where(eq(companies.id, companyId));

    const { zip } = await buildPack({ companyId, ...PERIOD });
    const entries = listStoreZipEntries(zip);

    expect(entries).toContain("invoices.csv");
    expect(entries).toContain("invoice-line-items.csv");
    expect(entries).toContain("payments.csv");
    expect(entries).toContain("expenses.csv");
    expect(entries).toContain("receipts-index.csv");
    expect(entries).toContain("dividends.csv");
    expect(entries).toContain("shareholders.csv");
    expect(entries).toContain("recurring-invoices.csv");
    expect(entries).toContain("bank-transactions.csv");
    expect(entries).toContain("reconciliation-matches.csv");
    expect(entries).toContain("summary/company.csv");
    expect(entries).toContain("summary/pnl.csv");
    expect(entries).toContain("summary/vat.csv");
    expect(entries).toContain("summary/aged-receivables.csv");
    expect(entries).toContain("README.txt");
    expect(entries).toContain("invoices/DD-2026-0100.pdf");
    expect(entries).toContain(`receipts/${expense.id}/receipt.jpg`);

    const invoicesCsv = extractZipText(zip, "invoices.csv");
    expect(invoicesCsv).toContain("DD-2026-0100");
    expect(invoicesCsv).toContain("Acme Ltd");
    expect(invoicesCsv.split("\n")[0]).toContain("recurring_schedule");

    const companyCsv = extractZipText(zip, "summary/company.csv");
    expect(companyCsv).toContain("trading_name");
    expect(companyCsv).toContain("financial_year_end_month");
    expect(companyCsv).not.toContain("sort_code");
    expect(companyCsv).not.toContain("60-83-71");
    expect(companyCsv).not.toContain("91405512");
    expect(companyCsv).not.toContain("Pack Test Ltd");

    const bankCsv = extractZipText(zip, "bank-transactions.csv");
    expect(bankCsv.split("\n")[0]).toContain("bank_account");
    expect(bankCsv.split("\n")[0]).toContain("tags");
    expect(bankCsv).toContain("Starling Business");
    expect(bankCsv.split("\n")[0].split(",").at(-1)).toBe("notes");
    expect(bankCsv).toContain("Return leg, client visit");
    expect(bankCsv).not.toContain("team-only aside");

    const lineItemsCsv = extractZipText(zip, "invoice-line-items.csv");
    expect(lineItemsCsv).toContain("Consulting");

    const expensesCsv = extractZipText(zip, "expenses.csv");
    expect(expensesCsv).toContain("Train ticket");
    expect(expensesCsv).toContain("Booked for the Leeds workshop");
    expect(expensesCsv).not.toContain("not for the accountant");

    const paymentsCsv = extractZipText(zip, "payments.csv");
    expect(paymentsCsv).toContain("DD-2026-0100");

    const dividendsCsv = extractZipText(zip, "dividends.csv");
    expect(dividendsCsv.split("\n")[0]).toContain("share_count");
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

    const { zip } = await buildPack({ companyId, ...PERIOD });
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

  it("selects reimbursements by the London date they were paid", async () => {
    const [payee] = await db
      .insert(users)
      .values({
        companyId,
        clerkUserId: "user_reimb",
        email: "lee@example.com",
        name: "Lee",
        role: "admin",
      })
      .returning();
    const [run, ...others] = await db
      .insert(reimbursements)
      .values(
        [
          // Created before the period, paid in it.
          { reference: "PAID-IN-APRIL", createdAt: "2026-03-20T12:00:00Z", paidAt: "2026-04-10T12:00:00Z" },
          // First and last moments of April in London (BST).
          { reference: "PAID-FIRST-MOMENT", createdAt: "2026-03-20T12:00:00Z", paidAt: "2026-03-31T23:30:00Z" },
          { reference: "PAID-LAST-MOMENT", createdAt: "2026-04-10T12:00:00Z", paidAt: "2026-04-30T22:30:00Z" },
          // Created in the period, paid after it: already 1 May in London.
          { reference: "PAID-IN-MAY", createdAt: "2026-04-10T12:00:00Z", paidAt: "2026-04-30T23:30:00Z" },
          { reference: "PAID-IN-MARCH", createdAt: "2026-03-01T12:00:00Z", paidAt: "2026-03-31T22:30:00Z" },
        ].map((r) => ({
          companyId,
          payeeUserId: payee.id,
          status: "paid" as const,
          totalPence: 4500,
          reference: r.reference,
          createdAt: new Date(r.createdAt),
          paidAt: new Date(r.paidAt),
        })),
      )
      .returning();
    const [pending] = await db
      .insert(reimbursements)
      .values({
        companyId,
        payeeUserId: payee.id,
        status: "pending",
        totalPence: 1200,
        reference: "UNPAID",
        createdAt: new Date("2026-04-10T12:00:00Z"),
      })
      .returning();
    const [paidExpense, excludedExpense] = await db
      .insert(expenses)
      .values(
        ["In-period run item", "Out-of-period run item"].map((description) => ({
          companyId,
          description,
          spentAt: "2026-03-15",
          amountPence: 4500,
          status: "reimbursed" as const,
          paidByUserId: payee.id,
          createdByUserId: payee.id,
        })),
      )
      .returning();
    await db.insert(reimbursementItems).values([
      { reimbursementId: run.id, expenseId: paidExpense.id },
      { reimbursementId: others[2].id, expenseId: excludedExpense.id },
    ]);
    expect(pending.paidAt).toBeNull();

    const { zip } = await buildPack({ companyId, ...PERIOD });

    const csv = extractZipText(zip, "reimbursements.csv");
    expect(csv).toContain("PAID-IN-APRIL");
    expect(csv).toContain("PAID-FIRST-MOMENT");
    expect(csv).toContain("PAID-LAST-MOMENT");
    expect(csv).not.toContain("PAID-IN-MAY");
    expect(csv).not.toContain("PAID-IN-MARCH");
    expect(csv).not.toContain("UNPAID");

    const itemsCsv = extractZipText(zip, "reimbursement-items.csv");
    expect(itemsCsv).toContain("In-period run item");
    expect(itemsCsv).not.toContain("Out-of-period run item");
  });

  it("puts every table in one linked workbook in Excel format", async () => {
    const [client] = await db
      .insert(clients)
      .values({ companyId, name: "Acme", companyName: "Acme Ltd" })
      .returning();
    const [invoice] = await db
      .insert(invoices)
      .values({
        companyId,
        number: "DD-2026-0200",
        clientId: client.id,
        status: "paid",
        issueDate: "2026-04-10",
        netPence: 10_000,
        vatPence: 0,
        grossPence: 10_000,
        pdfBlobPath: await storePdf("invoices/inv-200.pdf", "excel-invoice"),
      })
      .returning();
    const [payment] = await db
      .insert(payments)
      .values({
        invoiceId: invoice.id,
        amountPence: 10_000,
        receivedAt: new Date("2026-04-15T10:00:00Z"),
      })
      .returning();
    const expense = await insertExpense();
    await insertReceipt(expense.id, "receipts/e/ok.jpg", "ok.jpg", new Uint8Array([1, 2, 3]));
    await insertReceipt(expense.id, "receipts/e/gone.jpg", "gone.jpg");
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();
    const [bankTx] = await db
      .insert(bankTransactions)
      .values({
        bankAccountId: account.id,
        externalId: "tx-excel",
        bookedAt: "2026-04-15",
        amountPence: 10_000,
      })
      .returning();
    await db.insert(reconciliationMatches).values({
      bankTransactionId: bankTx.id,
      matchType: "invoice_payment",
      paymentId: payment.id,
      invoiceId: invoice.id,
      confirmed: true,
    });
    const [expenseTx] = await db
      .insert(bankTransactions)
      .values({
        bankAccountId: account.id,
        externalId: "tx-excel-expense",
        bookedAt: "2026-04-16",
        amountPence: -4500,
        counterparty: "Trainline",
      })
      .returning();
    await db.insert(reconciliationMatches).values({
      bankTransactionId: expenseTx.id,
      matchType: "expense",
      expenseId: expense.id,
      confirmed: true,
    });

    const { stream, filename } = await streamAccountantPack({
      companyId,
      ...PERIOD,
      format: "xlsx",
      webBase: "https://alfa.test",
    });
    const zip = await collect(stream);
    const entries = listStoreZipEntries(zip);

    expect(filename).toBe("accountant-pack-2026-04-01_2026-04-30-excel.zip");
    expect(entries).toContain("accountant-pack.xlsx");
    expect(entries).toContain("invoices/DD-2026-0200.pdf");
    expect(entries).toContain(`receipts/${expense.id}/ok.jpg`);
    expect(entries).toContain("README.txt");
    expect(entries.filter((e) => e.endsWith(".csv"))).toEqual([]);
    const readme = extractZipText(zip, "README.txt");
    expect(readme).toContain("accountant-pack.xlsx — one tab per table");
    expect(readme).toContain("Excel for Mac asks for permission");
    expect(readme).toContain("Open in Alfa column");

    const book = readWorkbook(zip);
    expect([...book.keys()]).toEqual(
      expect.arrayContaining(["Company", "P&L", "VAT", "Invoices", "Payments", "Expenses", "Receipts", "Reconciliation"]),
    );
    // Most-used tabs first; reference and setup tabs at the end.
    expect([...book.keys()].slice(0, 6)).toEqual(["P&L", "VAT", "Aged receivables", "Invoices", "Expenses", "Bank transactions"]);
    expect([...book.keys()].slice(-4)).toEqual(["Company", "Cutover", "Brought forward invoices", "Open brought forward"]);

    // Each tab is an Excel table, with plain-English headers matching its columns.
    const invoicesTab = book.get("Invoices")!;
    expect(invoicesTab.xml).toContain('<tableParts count="1">');
    expect(invoicesTab.table).toContain('name="Table_Invoices"');
    expect(invoicesTab.table).toContain('<tableColumn id="5" name="Issue date"/>');
    expect(invoicesTab.table).toContain('name="Net (£)"');
    expect(invoicesTab.xml).toContain(">Issue date<");
    expect(invoicesTab.xml).not.toContain(">issue_date<");
    expect(book.get("P&L")!.table).toContain('name="Table_PandL"');

    const paymentsSheet = book.get("Payments")!;
    expect(paymentsSheet.xml).toContain(`<hyperlink ref="B2" location="'Invoices'!A2"/>`);
    expect(paymentsSheet.xml).toContain('<c r="D2" s="1"><v>100</v></c>');
    // Back to the bank transaction it was reconciled with.
    expect(paymentsSheet.xml).toContain(`location="'Bank transactions'!A2"`);

    // Bank transactions link to what they were reconciled to, and the records link back.
    const bankTab = book.get("Bank transactions")!.xml;
    expect(bankTab).toContain(">Matched to<");
    expect(bankTab).toContain(">Payment for DD-2026-0200<");
    expect(bankTab).toContain(`location="'Payments'!A2"`);
    // A bank credit that paid an invoice names it and links to its row.
    expect(bankTab).toContain(">Invoice<");
    expect(bankTab).toMatch(/<hyperlink ref="K\d+" location="'Invoices'!A2"\/>/);
    expect(bankTab).toContain(">DD-2026-0200<");
    expect(bankTab).toContain(">Expense: Receipts test<");
    expect(bankTab).toContain(`location="'Expenses'!A2"`);
    expect(book.get("Expenses")!.xml).toContain(">2026-04-16 Trainline<");
    expect(book.get("Expenses")!.xml).toContain(`location="'Bank transactions'!A3"`);
    expect(invoicesTab.xml).toContain(">1 payment<");

    expect(book.get("Invoices")!.rels).toContain('Target="invoices/DD-2026-0200.pdf"');
    expect(book.get("Invoices")!.xml).toContain(">Open in Alfa<");
    expect(book.get("Invoices")!.rels).toContain(
      `Target="https://alfa.test/api/invoices/${invoice.id}/pdf" TargetMode="External"`,
    );

    const receiptsSheet = book.get("Receipts")!;
    expect(receiptsSheet.xml).toContain(`location="'Expenses'!A2"`);
    expect(receiptsSheet.rels).toContain(`Target="receipts/${expense.id}/ok.jpg"`);
    expect(receiptsSheet.rels).not.toContain("gone.jpg");
    expect(receiptsSheet.xml).toContain(">MISSING<");
    const receiptIds = (await db.select().from(expenseReceipts)).map((r) => r.id);
    expect(receiptIds).toHaveLength(2);
    for (const id of receiptIds) {
      expect(receiptsSheet.rels).toContain(`Target="https://alfa.test/api/receipts/${id}?inline=1"`);
    }

    // Two receipts, so the expense links to its rows on the Receipts tab.
    expect(book.get("Expenses")!.xml).toContain(">2 receipts<");
    expect(book.get("Expenses")!.xml).toContain(`location="'Receipts'!A`);

    const recon = book.get("Reconciliation")!.xml;
    expect(recon).toContain(`location="'Bank transactions'!A2"`);
    expect(recon).toContain(`location="'Payments'!A2"`);
    expect(recon).toContain(`location="'Invoices'!A2"`);
  });

  it("leaves the VAT tab out of the workbook when the plan has no VAT export", async () => {
    const { stream } = await streamAccountantPack({
      companyId,
      ...PERIOD,
      includeVat: false,
      format: "xlsx",
    });
    const zip = await collect(stream);
    const book = readWorkbook(zip);

    expect(book.has("P&L")).toBe(true);
    expect(book.has("VAT")).toBe(false);
    // Without Alfa's address there's nothing to link to online.
    expect(book.get("Invoices")!.xml).not.toContain("Open in Alfa");
    expect(extractZipText(zip, "README.txt")).not.toContain("Open in Alfa");
  });

  it("leaves out the VAT summary when the plan has no VAT export", async () => {
    const { zip } = await buildPack({ companyId, ...PERIOD, includeVat: false });
    const entries = listStoreZipEntries(zip);

    expect(entries).toContain("summary/pnl.csv");
    expect(entries).toContain("invoices.csv");
    expect(entries).not.toContain("summary/vat.csv");
    expect(entries).not.toContain("summary/vat.pdf");
    expect(extractZipText(zip, "README.txt")).toContain(
      "VAT summary needs Essentials or Premium",
    );
  });

  it("streams a pack larger than Vercel's 4.5 MB limit on buffered responses", async () => {
    const expense = await insertExpense();
    const receiptSize = 2_000_000;
    for (let i = 0; i < 4; i++) {
      await insertReceipt(
        expense.id,
        `receipts/large/${i}.jpg`,
        `large-${i}.jpg`,
        new Uint8Array(receiptSize).fill(i + 1),
      );
    }

    const { zip } = await buildPack({ companyId, ...PERIOD });

    expect(zip.byteLength).toBeGreaterThan(4_500_000);
    for (let i = 0; i < 4; i++) {
      const data = extractZipEntry(zip, `receipts/${expense.id}/large-${i}.jpg`);
      expect(data.byteLength).toBe(receiptSize);
      expect(data.every((byte) => byte === i + 1)).toBe(true);
    }
    expect(readCentralDirectory(zip)).toContain("README.txt");
  });

  it("marks an unavailable receipt as missing and still finishes the pack", async () => {
    const expense = await insertExpense();
    await insertReceipt(expense.id, "receipts/gone.jpg", "gone.jpg");

    const { zip } = await buildPack({ companyId, ...PERIOD });

    expect(listStoreZipEntries(zip)).not.toContain(`receipts/${expense.id}/gone.jpg`);
    expect(extractZipText(zip, "receipts-index.csv")).toContain("MISSING");
    expect(extractZipText(zip, "README.txt")).toContain("Receipt file missing: gone.jpg");
  });

  it("keeps both receipts when an expense has two with the same filename", async () => {
    const expense = await insertExpense();
    const first = new Uint8Array([1, 1, 1]);
    const second = new Uint8Array([2, 2, 2]);
    await insertReceipt(expense.id, "receipts/same-a.jpg", "receipt.jpg", first);
    await insertReceipt(expense.id, "receipts/same-b.jpg", "receipt.jpg", second);

    const { zip } = await buildPack({ companyId, ...PERIOD });

    const dir = `receipts/${expense.id}`;
    const paths = [`${dir}/receipt.jpg`, `${dir}/receipt-2.jpg`];
    const contents = paths.map((path) => [...extractZipEntry(zip, path)]);
    expect(contents).toEqual(expect.arrayContaining([[...first], [...second]]));
    const index = extractZipText(zip, "receipts-index.csv");
    for (const path of paths) expect(index).toContain(path);
  });

  it("reports a failed VAT PDF in the README", async () => {
    vi.mocked(renderVatSummaryPdf).mockRejectedValueOnce(new Error("render failed"));

    const { zip } = await buildPack({ companyId, ...PERIOD });

    expect(listStoreZipEntries(zip)).not.toContain("summary/vat.pdf");
    expect(extractZipText(zip, "README.txt")).toContain("VAT PDF skipped: render failed");
  });
});

async function* zipEntries(files: Record<string, ZipEntry>) {
  yield* Object.entries(files);
}

describe("zipStoreStream", () => {
  it("round-trips text and binary entries", async () => {
    const pdf = fakePdf("test");
    const zip = await collect(
      zipStoreStream(zipEntries({ "hello.txt": "hello", "bin/test.pdf": pdf })),
    );

    expect(listStoreZipEntries(zip)).toEqual(["hello.txt", "bin/test.pdf"]);
    expect(extractZipEntry(zip, "bin/test.pdf")).toEqual(pdf);
    expect(readCentralDirectory(zip)).toEqual(["hello.txt", "bin/test.pdf"]);
  });

  it("writes the standard CRC-32 to both headers", async () => {
    const zip = await collect(zipStoreStream(zipEntries({ "hello.txt": "hello" })));
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

    expect(view.getUint32(14, true)).toBe(0x3610a686);
    const centralStart = 30 + "hello.txt".length + "hello".length;
    expect(view.getUint32(centralStart + 16, true)).toBe(0x3610a686);
  });

  it("writes the version and a real date Excel's package check needs", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-08T12:34:56Z"), toFake: ["Date"] });
    const zip = await collect(zipStoreStream(zipEntries({ "hello.txt": "hello" })));
    vi.useRealTimers();
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const centralStart = 30 + "hello.txt".length + "hello".length;
    const dosTime = (12 << 11) | (34 << 5) | 28;
    const dosDate = ((2026 - 1980) << 9) | (11 << 5) | 8;

    expect(view.getUint16(4, true)).toBe(20);
    expect(view.getUint16(10, true)).toBe(dosTime);
    expect(view.getUint16(12, true)).toBe(dosDate);
    expect(view.getUint16(centralStart + 4, true)).toBe(20);
    expect(view.getUint16(centralStart + 6, true)).toBe(20);
    expect(view.getUint16(centralStart + 12, true)).toBe(dosTime);
    expect(view.getUint16(centralStart + 14, true)).toBe(dosDate);
  });

  it("fails the stream when an entry fails, rather than ending as a valid zip", async () => {
    async function* failing(): AsyncGenerator<[string, ZipEntry]> {
      yield ["first.txt", "first"];
      throw new Error("storage down");
    }
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(collect(zipStoreStream(failing()))).rejects.toThrow("storage down");

    expect(logged).toHaveBeenCalledWith(
      "Accountant pack stream failed:",
      expect.objectContaining({ message: "storage down" }),
    );
    logged.mockRestore();
  });

  it("stops reading entries when the download is cancelled", async () => {
    let finished = false;
    async function* entries(): AsyncGenerator<[string, ZipEntry]> {
      try {
        yield ["first.txt", "first"];
        yield ["second.txt", "second"];
      } finally {
        finished = true;
      }
    }

    const reader = zipStoreStream(entries()).getReader();
    await reader.read();
    await reader.cancel();

    expect(finished).toBe(true);
  });
});

/** Read names from the central directory, which is what most unzip tools use. */
function readCentralDirectory(zip: Uint8Array): string[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const endStart = zip.byteLength - 22;
  expect(view.getUint32(endStart, true)).toBe(0x06054b50);
  const count = view.getUint16(endStart + 10, true);
  let offset = view.getUint32(endStart + 16, true);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const nameLen = view.getUint16(offset + 28, true);
    const localOffset = view.getUint32(offset + 42, true);
    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    names.push(new TextDecoder().decode(zip.subarray(offset + 46, offset + 46 + nameLen)));
    offset += 46 + nameLen;
  }
  return names;
}

/** Each tab of the pack's workbook by name: its sheet XML, its links and its table. */
function readWorkbook(zip: Uint8Array) {
  const parts = new Map(
    readStoreZipEntries(extractZipEntry(zip, "accountant-pack.xlsx")).map(
      ([name, data]) => [name, new TextDecoder().decode(data)],
    ),
  );
  const sheets = [...parts.get("xl/workbook.xml")!.matchAll(/<sheet name="([^"]+)" sheetId="(\d+)"/g)];
  return new Map(
    sheets.map(([, name, id]) => [
      name.replace(/&amp;/g, "&"),
      {
        xml: parts.get(`xl/worksheets/sheet${id}.xml`)!,
        rels: parts.get(`xl/worksheets/_rels/sheet${id}.xml.rels`) ?? "",
        table: parts.get(`xl/tables/table${id}.xml`) ?? "",
      },
    ]),
  );
}

/** Read a text entry from a store-only ZIP by scanning local headers. */
function extractZipText(zip: Uint8Array, target: string): string {
  return new TextDecoder().decode(extractZipEntry(zip, target));
}

function extractZipEntry(zip: Uint8Array, target: string): Uint8Array {
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
      return zip.subarray(dataStart, dataStart + compSize);
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
