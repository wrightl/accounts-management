import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companies,
  fxRates,
  invoices,
  invoiceLineItems,
  notifications,
  recurringInvoices,
  users,
} from "@/db/schema";
import { resetFxFetchBackoff } from "@/lib/bank/fx";
import { seedCompany } from "@/lib/test/seed-company";
import {
  generateRecurringInvoiceForTemplate,
  generateRecurringInvoices,
} from "@/lib/invoices/recurring-generate";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/outbox", () => ({
  enqueueSendJob: vi.fn(async () => "job-1"),
  processSendJob: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
}));

import { enqueueSendJob, processSendJob } from "@/lib/outbox";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;

  await db
    .update(companies)
    .set({ invoicePaymentTermsDays: 30 })
    .where(eq(companies.id, companyId));

  vi.mocked(enqueueSendJob).mockClear();
  vi.mocked(processSendJob).mockClear();
  vi.mocked(processSendJob).mockResolvedValue({ ok: true });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function insertTemplate(
  overrides: Partial<{
    dayOfMonth: number;
    onGenerate: string;
    enabled: boolean;
    endsOn: string | null;
    maxOccurrences: number | null;
    occurrenceCount: number;
    clientEmail: string | null;
    currency: string;
  }> = {},
) {
  const [client] = await db
    .insert(clients)
    .values({
      companyId,
      name: "Retainer Co",
      email: overrides.clientEmail === undefined ? "ap@retainer.test" : overrides.clientEmail,
    })
    .returning();

  const [tmpl] = await db
    .insert(recurringInvoices)
    .values({
      companyId,
      clientId: client.id,
      name: "Monthly retainer",
      lineTemplate: [
        { description: "Retainer", quantity: 1, unitPricePence: 150000 },
      ],
      dayOfMonth: overrides.dayOfMonth ?? 15,
      onGenerate: overrides.onGenerate ?? "draft",
      enabled: overrides.enabled ?? true,
      endsOn: overrides.endsOn ?? null,
      maxOccurrences: overrides.maxOccurrences ?? null,
      occurrenceCount: overrides.occurrenceCount ?? 0,
      currency: overrides.currency ?? "GBP",
      nextRunOn: "2026-03-15",
    })
    .returning();

  return { client, tmpl };
}

describe("generateRecurringInvoices (PGlite)", () => {
  it("generates a draft on the matching day with company payment terms", async () => {
    await insertTemplate({ dayOfMonth: 15, onGenerate: "draft" });

    const result = await generateRecurringInvoices({ today: "2026-03-15" });
    expect(result.skipped).toBeUndefined();
    if (result.skipped) return;
    expect(result.generated).toBe(1);
    expect(result.sent).toBe(0);

    const [inv] = await db.select().from(invoices);
    expect(inv.status).toBe("draft");
    expect(inv.issueDate).toBe("2026-03-15");
    expect(inv.dueDate).toBe("2026-04-14"); // 30-day terms
    expect(inv.grossPence).toBe(150000);
    expect(inv.recurringInvoiceId).toBeTruthy();

    const lines = await db.select().from(invoiceLineItems);
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Retainer");
  });

  it("is idempotent within the same calendar month", async () => {
    await insertTemplate({ dayOfMonth: 15 });
    await generateRecurringInvoices({ today: "2026-03-15" });
    const second = await generateRecurringInvoices({ today: "2026-03-15" });
    expect(second.generated).toBe(0);
    const all = await db.select().from(invoices);
    expect(all).toHaveLength(1);
  });

  it("overlapping runs generate one invoice", async () => {
    await insertTemplate({ dayOfMonth: 15 });
    await Promise.all([
      generateRecurringInvoices({ today: "2026-03-15" }),
      generateRecurringInvoices({ today: "2026-03-15" }),
    ]);
    const all = await db.select().from(invoices);
    expect(all).toHaveLength(1);
  });

  it("skips templates past endsOn", async () => {
    await insertTemplate({
      dayOfMonth: 15,
      endsOn: "2026-02-01",
    });
    const result = await generateRecurringInvoices({ today: "2026-03-15" });
    expect(result.generated).toBe(0);
  });

  it("skips when max occurrences already reached", async () => {
    await insertTemplate({
      dayOfMonth: 15,
      maxOccurrences: 2,
      occurrenceCount: 2,
    });
    const result = await generateRecurringInvoices({ today: "2026-03-15" });
    expect(result.generated).toBe(0);
  });

  it("auto-disables after hitting max occurrences", async () => {
    const { tmpl } = await insertTemplate({
      dayOfMonth: 15,
      maxOccurrences: 1,
      occurrenceCount: 0,
    });
    await generateRecurringInvoices({ today: "2026-03-15" });
    const [updated] = await db
      .select()
      .from(recurringInvoices)
      .where(eq(recurringInvoices.id, tmpl.id));
    expect(updated.enabled).toBe(false);
    expect(updated.occurrenceCount).toBe(1);
  });

  it("enqueues send when onGenerate is send and client has email", async () => {
    await insertTemplate({ dayOfMonth: 15, onGenerate: "send" });
    const result = await generateRecurringInvoices({ today: "2026-03-15" });
    if (result.skipped) throw new Error("unexpected skip");
    expect(result.generated).toBe(1);
    expect(result.sent).toBe(1);
    expect(enqueueSendJob).toHaveBeenCalled();
    expect(processSendJob).toHaveBeenCalled();
  });

  it("falls back to draft when client has no email", async () => {
    await insertTemplate({
      dayOfMonth: 15,
      onGenerate: "send",
      clientEmail: null,
    });
    const result = await generateRecurringInvoices({ today: "2026-03-15" });
    if (result.skipped) throw new Error("unexpected skip");
    expect(result.generated).toBe(1);
    expect(result.draftFallback).toBe(1);
    expect(result.sent).toBe(0);
    expect(enqueueSendJob).not.toHaveBeenCalled();
  });

  it("generateRecurringInvoiceForTemplate rejects second generate in same month", async () => {
    const { tmpl } = await insertTemplate({ dayOfMonth: 1 });
    const first = await generateRecurringInvoiceForTemplate(tmpl.id, {
      today: "2026-03-20",
    });
    expect(first.ok).toBe(true);
    const second = await generateRecurringInvoiceForTemplate(tmpl.id, {
      today: "2026-03-21",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toMatch(/this month/i);
    }
  });
});

describe("recurring invoices in a foreign currency", () => {
  beforeEach(() => {
    resetFxFetchBackoff();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("generates each invoice in the template's currency at that day's rate", async () => {
    await db.insert(fxRates).values({ currency: "USD", observationDate: "2026-03-15", foreignPerGbp: 1.25 });
    const { tmpl } = await insertTemplate({ currency: "USD" });
    const result = await generateRecurringInvoices({ today: "2026-03-15" });
    if (result.skipped) throw new Error("unexpected skip");
    expect(result.generated).toBe(1);
    const [inv] = await db.select().from(invoices).where(eq(invoices.recurringInvoiceId, tmpl.id));
    expect(inv).toMatchObject({
      currency: "USD",
      fxRate: 1.25,
      fxRateDate: "2026-03-15",
      fxRateSource: "boe",
      grossMinor: 150000,
      grossPence: 120000,
    });
  });

  it("doesn't generate without a rate, and says so", async () => {
    await db.insert(users).values({
      companyId,
      clerkUserId: "user_fx",
      email: "o@test.dev",
      name: "O",
      role: "admin",
    });
    const { tmpl } = await insertTemplate({ currency: "EUR" });
    const result = await generateRecurringInvoices({ today: "2026-03-15" });
    if (result.skipped) throw new Error("unexpected skip");
    expect(result.generated).toBe(0);
    expect(await db.select().from(invoices).where(eq(invoices.recurringInvoiceId, tmpl.id))).toHaveLength(0);
    const [note] = await db.select().from(notifications).where(eq(notifications.companyId, companyId));
    expect(note?.title).toBe("Monthly retainer invoice not generated");

    const now = await generateRecurringInvoiceForTemplate(tmpl.id, { today: "2026-03-15" });
    expect(now).toMatchObject({ ok: false, error: expect.stringMatching(/EUR rate/) });
    // Retries the same day don't notify again.
    await generateRecurringInvoices({ today: "2026-03-15" });
    expect(
      await db.select().from(notifications).where(eq(notifications.companyId, companyId)),
    ).toHaveLength(1);
  });
});
