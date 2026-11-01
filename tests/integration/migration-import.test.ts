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
import { updateCompany } from "@/actions/settings";

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
});
