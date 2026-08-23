import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  quoteLineItems,
  quoteVersions,
  quotes,
  users,
} from "@/db/schema";
import { createQuote, rollbackQuote, sendQuote, updateQuote } from "@/actions/quotes";
import { getQuoteVersionDetail } from "@/lib/quotes/queries";
import { defaultQuoteEmailMessage } from "@/lib/quotes/email";
import { quotePdfFilename } from "@/lib/quotes/status";
import { renderQuotePdf } from "@/lib/quotes/pdf";

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

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("quote PDF and send", () => {
  async function seedQuote() {
    await db
      .insert(users)
      .values({
        clerkUserId: "user_clerk_1",
        email: "lee@dotanddashconsulting.com",
        name: "Lee",
        role: "admin",
      })
      .returning();
    const [client] = await db
      .insert(clients)
      .values({ name: "Acme", email: "ap@acme.test" })
      .returning();

    const form = new FormData();
    form.set("clientId", client.id);
    form.set("issueDate", "2026-08-23");
    form.set(
      "linesJson",
      JSON.stringify([
        { description: "Workshop", quantity: 2, unitPricePounds: "500" },
      ]),
    );

    const created = await createQuote(form);
    if (!created.ok || !created.id) throw new Error("createQuote failed");
    return { quoteId: created.id, clientEmail: client.email! };
  }

  it("renderQuotePdf returns a non-empty buffer", async () => {
    const bytes = await renderQuotePdf({
      quote: {
        number: "Q-2026-0001",
        version: 2,
        issueDate: "2026-08-23",
        validUntil: "2026-09-23",
        notes: "Payment due within 30 days.",
        grossPence: 100000,
      },
      client: {
        name: "Sheffield Digital",
        email: "chris@sheffield.digital",
        addressLines: "The Workstation\n15 Paternoster Row\nSheffield, S1 2BX",
      },
      lines: [
        { description: "Facilitation workshop", quantity: 2, unitPricePence: 50000 },
      ],
      company: {
        name: "Dot + Dash Consulting",
        legalName: "Dot and Dash Consulting Ltd",
        companyNumber: "15552561",
        addressLines: "Apartment 8, Whiteley Wood House\n50 Woofindin Avenue\nSheffield S11 7FG",
        bankName: "Starling Bank",
        bankAccountName: "Dot And Dash Consulting Ltd",
        sortCode: "60-83-71",
        accountNumber: "91405512",
      },
    });

    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("sendQuote emails the quote and marks it sent", async () => {
    const { quoteId } = await seedQuote();

    const form = new FormData();
    form.set("to", "client@example.com");
    form.set("message", "Please see the attached quote.");

    const result = await sendQuote(quoteId, form);
    expect(result.ok).toBe(true);

    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(quote.status).toBe("sent");
    expect(quote.sentAt).not.toBeNull();
  });

  it("sendQuote rejects blank message", async () => {
    const { quoteId } = await seedQuote();

    const form = new FormData();
    form.set("to", "client@example.com");
    form.set("message", "   ");

    const result = await sendQuote(quoteId, form);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBe("Message is required");
  });

  it("sendQuote rejects invalid email", async () => {
    const { quoteId } = await seedQuote();

    const form = new FormData();
    form.set("to", "not-an-email");
    form.set("message", "Hello");

    const result = await sendQuote(quoteId, form);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBe("Enter a valid email address");
  });

  it("updateQuote increments version and records history", async () => {
    const { quoteId } = await seedQuote();

    const form = new FormData();
    form.set("clientId", (await db.select().from(clients).limit(1))[0].id);
    form.set("issueDate", "2026-08-23");
    form.set(
      "linesJson",
      JSON.stringify([
        { description: "Updated workshop", quantity: 1, unitPricePounds: "750" },
      ]),
    );

    const result = await updateQuote(quoteId, form);
    expect(result.ok).toBe(true);

    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(quote.version).toBe(2);
    expect(quote.grossPence).toBe(75000);

    const versions = await db
      .select()
      .from(quoteVersions)
      .where(eq(quoteVersions.quoteId, quoteId));
    expect(versions).toHaveLength(2);
  });

  it("rollbackQuote restores a prior version as a new revision", async () => {
    const { quoteId } = await seedQuote();
    const [client] = await db.select().from(clients).limit(1);

    const editForm = new FormData();
    editForm.set("clientId", client.id);
    editForm.set("issueDate", "2026-08-23");
    editForm.set(
      "linesJson",
      JSON.stringify([
        { description: "Revised scope", quantity: 1, unitPricePounds: "900" },
      ]),
    );
    await updateQuote(quoteId, editForm);

    const rolled = await rollbackQuote(quoteId, 1);
    expect(rolled.ok).toBe(true);

    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(quote.version).toBe(3);
    expect(quote.grossPence).toBe(100000);

    const lines = await db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, quoteId));
    expect(lines[0].description).toBe("Workshop");
  });

  it("getQuoteVersionDetail returns snapshot for older versions", async () => {
    const { quoteId } = await seedQuote();

    const form = new FormData();
    form.set("clientId", (await db.select().from(clients).limit(1))[0].id);
    form.set("issueDate", "2026-08-23");
    form.set(
      "linesJson",
      JSON.stringify([
        { description: "Revised workshop", quantity: 1, unitPricePounds: "850" },
      ]),
    );
    await updateQuote(quoteId, form);

    const v1 = await getQuoteVersionDetail(quoteId, 1);
    expect(v1).not.toBeNull();
    expect(v1!.isCurrent).toBe(false);
    expect(v1!.lines[0].description).toBe("Workshop");
    expect(v1!.quote.grossPence).toBe(100000);

    const current = await getQuoteVersionDetail(quoteId, 2);
    expect(current!.isCurrent).toBe(true);
    expect(current!.lines[0].description).toBe("Revised workshop");
  });

  it("defaultQuoteEmailMessage includes version", () => {
    const message = defaultQuoteEmailMessage({
      number: "Q-2026-0001",
      version: 2,
      grossFormatted: "£1,000.00",
      companyName: "Dot + Dash Consulting",
    });
    expect(message).toContain("Q-2026-0001 (v2)");
  });

  it("quotePdfFilename includes version", () => {
    expect(quotePdfFilename("Q-2026-0001", 2)).toBe("Q-2026-0001-v2.pdf");
  });
});
