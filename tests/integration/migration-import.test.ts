import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companies,
  invoiceLineItems,
  invoices,
  payments,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import {
  commitClientImport,
  previewClientImport,
} from "@/actions/clients";
import {
  commitInvoiceImport,
  previewInvoiceImport,
} from "@/actions/invoices";
import { updateCompany } from "@/actions/settings";
import { parseInvoiceImportCsv } from "@/lib/invoices/import-csv";
import { financialYearStartDate, todayIsoDate } from "@/lib/dates";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_1", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "lee@dotanddashconsulting.com" },
    firstName: "Lee",
    lastName: "Wright",
    publicMetadata: {},
  })),
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { vatRegistered: true });
  companyId = company.id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_1",
    email: "lee@dotanddashconsulting.com",
    name: "Lee",
    role: "admin",
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

function csvFile(name: string, content: string): FormData {
  const form = new FormData();
  form.set("csv", new File([content], name, { type: "text/csv" }));
  return form;
}

describe("migration CSV import (PGlite)", () => {
  it("previews and commits client CSV create + email update", async () => {
    await db.insert(clients).values({
      companyId,
      name: "Old Name",
      email: "jane@acme.example",
    });

    const csv = [
      "name,company_name,email,notes",
      "Jane Smith,Acme Ltd,jane@acme.example,Updated",
      "Bob Lee,Studio Co,bob@studio.example,",
    ].join("\n");

    const preview = await previewClientImport(csvFile("clients.csv", csv));
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.rows.find((r) => r.email === "jane@acme.example")?.action).toBe(
      "update",
    );
    expect(preview.rows.find((r) => r.email === "bob@studio.example")?.action).toBe(
      "create",
    );

    const committed = await commitClientImport(JSON.stringify(preview.rows));
    expect(committed.ok).toBe(true);
    expect(committed.ok && committed.count).toBe(2);

    const rows = await db
      .select()
      .from(clients)
      .where(eq(clients.companyId, companyId));
    expect(rows).toHaveLength(2);
    const jane = rows.find((r) => r.email === "jane@acme.example");
    expect(jane?.name).toBe("Jane Smith");
    expect(jane?.notes).toBe("Updated");
  });

  it("commits invoices with create-client, partial payment, and seq bump", async () => {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId));
    const fyStart = financialYearStartDate(
      company.financialYearEndMonth,
      todayIsoDate(),
    );

    const csv = [
      "client_email,client_name,client_company,issue_date,number,description,net_gbp,vat_gbp,status,amount_paid_gbp,paid_at,payment_reference",
      `new@client.example,New Client,New Co,${fyStart},DD-2026-0010,Retainer,1000.00,200.00,sent,400.00,${fyStart},PART-1`,
      `new@client.example,New Client,New Co,${fyStart},,Extra work,500.00,100.00,sent,,`,
    ].join("\n");

    const form = csvFile("invoices.csv", csv);
    const preview = await previewInvoiceImport(form);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.rows.every((r) => r.errors.length === 0)).toBe(true);

    const committed = await commitInvoiceImport(JSON.stringify(preview.rows));
    expect(committed.ok).toBe(true);
    expect(committed.ok && committed.count).toBe(2);

    const clientRows = await db
      .select()
      .from(clients)
      .where(eq(clients.companyId, companyId));
    expect(clientRows).toHaveLength(1);
    expect(clientRows[0].email).toBe("new@client.example");

    const invRows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.companyId, companyId));
    expect(invRows).toHaveLength(2);
    const withNumber = invRows.find((i) => i.number === "DD-2026-0010");
    expect(withNumber?.status).toBe("sent");
    expect(withNumber?.grossPence).toBe(120000);

    const pays = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, withNumber!.id));
    expect(pays).toHaveLength(1);
    expect(pays[0].amountPence).toBe(40000);
    expect(pays[0].reference).toBe("PART-1");

    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, withNumber!.id));
    expect(lines).toHaveLength(1);
    expect(lines[0].unitPricePence).toBe(100000);

    const [after] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId));
    // Historical 0010 bumps to at least 11; blank row may allocate 0011
    expect(after.invoiceNextSeq).toBeGreaterThanOrEqual(11);
    expect(after.invoiceSeqYear).toBe(2026);

    // Blank-number row should have been allocated above 0010
    const auto = invRows.find((i) => i.number !== "DD-2026-0010");
    expect(auto?.number).toMatch(/^DD-2026-\d{4}$/);
    const seq = Number(auto!.number.split("-")[2]);
    expect(seq).toBeGreaterThanOrEqual(11);
  });

  it("saves and reads opening cash cutover fields", async () => {
    const form = new FormData();
    form.set("name", "Test Co");
    form.set("legalName", "Test Co Ltd");
    form.set("financialYearStartMonth", "4");
    form.set("invoiceNumberPrefix", "DD");
    form.set("quoteNumberPrefix", "Q");
    form.set("orderNumberPrefix", "O");
    form.set("invoicePaymentTermsDays", "14");
    form.set("defaultVatRate", "20");
    form.set("defaultMileageRatePence", "45");
    form.set("bankProvider", "other");
    form.set("bankName", "Test Bank");
    form.set("openingCashGbp", "12500.50");
    form.set("openingCashAsAt", "2026-04-01");

    const result = await updateCompany(form);
    expect(result.ok).toBe(true);

    const [row] = await db
      .select({
        openingCashPence: companies.openingCashPence,
        openingCashAsAt: companies.openingCashAsAt,
      })
      .from(companies)
      .where(eq(companies.id, companyId));
    expect(row.openingCashPence).toBe(1_250_050);
    expect(row.openingCashAsAt).toBe("2026-04-01");
  });

  it("rejects old paid rows at parse time used by preview", async () => {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId));
    const fyStart = financialYearStartDate(
      company.financialYearEndMonth,
      todayIsoDate(),
    );
    const oldPaid = [
      "client_name,issue_date,description,net_gbp,status,amount_paid_gbp",
      "Acme,2020-01-01,Ancient,100.00,paid,100.00",
    ].join("\n");
    const rows = parseInvoiceImportCsv(oldPaid, {
      fyStart,
      vatRegistered: true,
      existingNumbers: new Set(),
      paymentTermsDays: 14,
    });
    expect(rows[0].errors.length).toBeGreaterThan(0);
  });
});
