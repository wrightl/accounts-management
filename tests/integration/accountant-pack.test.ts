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

    const bankCsv = extractZipText(zip, "bank-transactions.csv");
    expect(bankCsv.split("\n")[0]).toContain("bank_account");
    expect(bankCsv.split("\n")[0]).toContain("tags");
    expect(bankCsv).toContain("Starling Business");

    const lineItemsCsv = extractZipText(zip, "invoice-line-items.csv");
    expect(lineItemsCsv).toContain("Consulting");

    const expensesCsv = extractZipText(zip, "expenses.csv");
    expect(expensesCsv).toContain("Train ticket");

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
