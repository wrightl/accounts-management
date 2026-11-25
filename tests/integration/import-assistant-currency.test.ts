import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companies,
  fxRates,
  invoiceImportDrafts,
  invoiceLineItems,
  invoiceWriteOffs,
  invoices,
  payments,
  users,
} from "@/db/schema";
import { commitInvoiceImportChunk, undoInvoiceImport } from "@/actions/invoice-import";
import { DRAFT_TOOLS } from "@/lib/assistant/tools/drafts";
import { resetFxFetchBackoff } from "@/lib/bank/fx";
import { invoiceAmountsDue } from "@/lib/invoices/queries";
import { getImportBatchReview } from "@/lib/invoices/import/queries";
import { commitAll, stageCsv } from "@/lib/test/import-invoices";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_1", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "owner@example.com" },
    firstName: "Owner",
    lastName: "One",
    publicMetadata: {},
  })),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "email_1" })),
}));

const HEAD =
  "invoice number,client name,client email,issue date,description,net,vat,status,amount paid,paid date,currency";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let userId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  resetFxFetchBackoff();
  // Rates come from the fx_rates rows tests seed, never the network.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));
  companyId = (await seedCompany(db, { vatRegistered: true })).id;
  const [user] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_1",
      email: "owner@example.com",
      name: "Owner",
      role: "admin",
    })
    .returning();
  userId = user.id;
  await db
    .update(companies)
    .set({ invoiceCutoverDate: "2026-04-01" })
    .where(eq(companies.id, companyId));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  setTestDb(null);
  await ctx.client.close();
});

async function byNumber(number: string) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.companyId, companyId), eq(invoices.number, number)));
  return row;
}

const USD_FILE = [
  HEAD,
  "US-1,Initech,bill@initech.example,01/05/2026,Workshop,1000.00,0,paid,1000.00,20/05/2026,USD",
  "UK-1,Acme,jane@acme.example,01/05/2026,Retainer,100.00,20.00,sent,,,",
].join("\n");

describe("importing invoices in another currency", () => {
  it("keeps the invoice's currency and books it at the issue-date rate", async () => {
    await db
      .insert(fxRates)
      .values({ currency: "USD", observationDate: "2026-05-01", foreignPerGbp: 1.25 });
    const batchId = await stageCsv(USD_FILE);

    const review = await getImportBatchReview(companyId, batchId);
    // Only sterling is summed before saving; the dollars are converted then.
    expect(review).toMatchObject({ counted: 2, foreignCounted: 1, netInAccounts: 10_000 });
    expect(review!.clients.find((c) => c.label === "Initech")?.grossByCurrency).toEqual({
      USD: 100_000,
    });

    await commitAll(batchId);
    const usd = await byNumber("US-1");
    expect(usd).toMatchObject({
      currency: "USD",
      fxRate: 1.25,
      fxRateDate: "2026-05-01",
      fxRateSource: "boe",
      grossMinor: 100_000,
      grossPence: 80_000,
      status: "paid",
    });
    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, usd.id));
    expect(lines[0].unitPricePence).toBe(100_000);
    const [payment] = await db.select().from(payments).where(eq(payments.invoiceId, usd.id));
    // The pounds that reached the bank aren't in the file: estimated at the invoice's rate.
    expect(payment).toMatchObject({
      amountMinor: 100_000,
      amountPence: 80_000,
      amountPenceEstimated: true,
    });
    expect(await byNumber("UK-1")).toMatchObject({ currency: "GBP", fxRate: 1, grossPence: 12_000 });
  });

  it("doesn't save anything when the rate can't be had", async () => {
    const batchId = await stageCsv(USD_FILE);
    const result = await commitInvoiceImportChunk(batchId);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain("USD rate for 2026-05-01");
    expect(await byNumber("UK-1")).toBeUndefined();
    const drafts = await db
      .select({ status: invoiceImportDrafts.status })
      .from(invoiceImportDrafts)
      .where(eq(invoiceImportDrafts.batchId, batchId));
    expect(drafts.every((d) => d.status === "ready")).toBe(true);
  });

  it("removes the exchange difference saving booked when the import is undone", async () => {
    // Net and VAT each round down at 1.3, the payment rounds up: a penny difference.
    await db
      .insert(fxRates)
      .values({ currency: "USD", observationDate: "2026-05-01", foreignPerGbp: 1.3 });
    const batchId = await stageCsv(
      [HEAD, "US-2,Initech,bill@initech.example,01/05/2026,Work,1000.03,1000.03,paid,2000.06,20/05/2026,USD"].join(
        "\n",
      ),
    );
    await commitAll(batchId);
    const inv = await byNumber("US-2");
    const diffs = await db
      .select()
      .from(invoiceWriteOffs)
      .where(eq(invoiceWriteOffs.invoiceId, inv.id));
    expect(diffs.map((d) => d.kind)).toEqual(["fx_difference"]);

    const undone = await undoInvoiceImport(batchId);
    expect(undone.ok).toBe(true);
    expect(await byNumber("US-2")).toBeUndefined();
  });

  it("skips a currency invoices can't be issued in", async () => {
    const batchId = await stageCsv(
      [HEAD, "JP-1,Initech,bill@initech.example,01/05/2026,Work,1000,0,sent,,,JPY"].join("\n"),
    );
    const review = await getImportBatchReview(companyId, batchId);
    expect(review!.totalDrafts).toBe(0);
  });
});

describe("assistant drafts in another currency", () => {
  const tool = (name: string) => DRAFT_TOOLS.find((t) => t.name === name)!;

  it("uses the client's usual currency, at the Bank of England rate", async () => {
    await db
      .insert(fxRates)
      .values({ currency: "EUR", observationDate: "2026-05-01", foreignPerGbp: 1.2 });
    await db.insert(clients).values({ companyId, name: "Société", defaultCurrency: "EUR" });
    const create = tool("create_draft_invoice");
    const result = await create.execute(
      { companyId, localUserId: userId },
      create.inputSchema.parse({
        client: "Société",
        issueDate: "2026-05-01",
        lines: [{ description: "Design", unitPrice: 600, vatRate: 0 }],
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      draft: { currency: "EUR", total: expect.stringContaining("€600.00") },
    });
    const [inv] = await db.select().from(invoices).where(eq(invoices.companyId, companyId));
    expect(inv).toMatchObject({ currency: "EUR", grossMinor: 60_000, grossPence: 50_000 });
  });

  it("takes a currency the person asks for over the client's", async () => {
    await db
      .insert(fxRates)
      .values({ currency: "USD", observationDate: "2026-05-01", foreignPerGbp: 1.25 });
    await db.insert(clients).values({ companyId, name: "Acme" });
    const create = tool("create_draft_quote");
    const result = await create.execute(
      { companyId, localUserId: userId },
      create.inputSchema.parse({
        client: "Acme",
        issueDate: "2026-05-01",
        currency: "usd",
        lines: [{ description: "Build", unitPrice: 1000, vatRate: 0 }],
      }),
    );
    expect(result).toMatchObject({ ok: true, draft: { currency: "USD" } });
    expect(result.ok && result.draft.exchangeRate).toContain("1 GBP = 1.25 USD");
  });

  it("refuses a currency invoices can't be issued in", () => {
    expect(
      tool("create_draft_invoice").inputSchema.safeParse({
        client: "Acme",
        currency: "JPY",
        lines: [{ description: "Build", unitPrice: 10 }],
      }).success,
    ).toBe(false);
  });
});

describe("amounts due for the phone", () => {
  it("are in each invoice's own currency", async () => {
    const [client] = await db.insert(clients).values({ companyId, name: "Initech" }).returning();
    const [inv] = await db
      .insert(invoices)
      .values({
        companyId,
        number: "DD-1",
        clientId: client.id,
        status: "sent",
        currency: "USD",
        fxRate: 1.25,
        netMinor: 10_000,
        grossMinor: 10_000,
        netPence: 8_000,
        grossPence: 8_000,
      })
      .returning();
    await db
      .insert(payments)
      .values({ invoiceId: inv.id, amountMinor: 4_000, amountPence: 3_100, receivedAt: new Date() });
    const due = await invoiceAmountsDue(companyId, [{ id: inv.id, grossMinor: 10_000 }]);
    expect(due.get(inv.id)).toBe(6_000);
  });
});
