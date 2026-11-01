import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companies,
  invoices,
  notifications,
  payments,
  sendJobs,
  users,
} from "@/db/schema";
import {
  chaseAllImportedInvoices,
  setInvoiceChase,
} from "@/actions/invoice-chase";
import { sendInvoice } from "@/actions/invoices";
import { raiseLatePaymentInvoice } from "@/actions/late-payment";
import { getWeeklyCloseChecklist } from "@/lib/close/checklist";
import { todayIsoDate } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { getBroughtForwardDebtsPence } from "@/lib/forecast/queries";
import {
  countOverdueInvoices,
  getUnchasedImports,
} from "@/lib/invoices/queries";
import { addDays } from "@/lib/ledger/corporation-tax";
import { runNotificationScanners } from "@/lib/notifications/cron";
import { enqueueOverdueReminders, processSendJob } from "@/lib/outbox";
import { importCsv } from "@/lib/test/import-invoices";
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

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;

const overdueDate = () => addDays(todayIsoDate(), -30);

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db, { latePaymentCharges: true })).id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_1",
    email: "owner@example.com",
    name: "Owner",
    role: "admin",
  });
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Client", email: "client@example.com" })
    .returning();
  clientId = client.id;
  vi.mocked(sendEmail).mockClear();
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function addInvoice(
  number: string,
  values: Partial<typeof invoices.$inferInsert> = {},
) {
  const due = overdueDate();
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId,
      clientId,
      number,
      status: "sent",
      issueDate: due,
      dueDate: due,
      netPence: 10_000,
      grossPence: 10_000,
      source: "import",
      chaseEnabled: false,
      ...values,
    })
    .returning();
  return inv;
}

async function jobsFor(invoiceId: string) {
  return db.select().from(sendJobs).where(eq(sendJobs.invoiceId, invoiceId));
}

describe("imported invoices and reminders", () => {
  it("queues nothing for an imported overdue invoice", async () => {
    const inv = await addInvoice("IMP-1");
    await enqueueOverdueReminders();
    expect(await jobsFor(inv.id)).toHaveLength(0);
  });

  it("starts imports with chasing off", async () => {
    await db
      .update(companies)
      .set({ invoiceCutoverDate: "2020-01-01" })
      .where(eq(companies.id, companyId));
    await importCsv(
      [
        "invoice number,client email,client name,issue date,due date,description,net,status",
        `IMP-CSV,client@example.com,Client,${overdueDate()},${overdueDate()},Work,100.00,sent`,
      ].join("\n"),
    );
    const [inv] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.number, "IMP-CSV"));
    expect(inv.chaseEnabled).toBe(false);
    await enqueueOverdueReminders();
    expect(await jobsFor(inv.id)).toHaveLength(0);
  });

  it("sends exactly one reminder after opting in, without charges", async () => {
    const inv = await addInvoice("IMP-2");
    expect((await setInvoiceChase(inv.id, true)).ok).toBe(true);

    await enqueueOverdueReminders();
    await enqueueOverdueReminders();
    const jobs = await jobsFor(inv.id);
    expect(jobs).toHaveLength(1);

    expect((await processSendJob(jobs[0].id)).ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0]![0].text).not.toContain(
      "statutory interest",
    );
  });

  it("still adds charges for invoices created in Alfa", async () => {
    const inv = await addInvoice("ALFA-1", {
      source: "alfa",
      chaseEnabled: true,
    });
    await enqueueOverdueReminders();
    const [job] = await jobsFor(inv.id);
    await processSendJob(job.id);
    expect(vi.mocked(sendEmail).mock.calls[0]![0].text).toContain(
      "statutory interest",
    );
  });

  it("drops a queued reminder when the user stops chasing", async () => {
    const inv = await addInvoice("IMP-3", { chaseEnabled: true });
    await enqueueOverdueReminders();
    const [job] = await jobsFor(inv.id);
    await setInvoiceChase(inv.id, false);

    await processSendJob(job.id);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("can queue a skipped step again when chasing is turned back on", async () => {
    const inv = await addInvoice("IMP-10", { chaseEnabled: true });
    await enqueueOverdueReminders();
    const [job] = await jobsFor(inv.id);
    await setInvoiceChase(inv.id, false);
    await processSendJob(job.id);
    expect(await jobsFor(inv.id)).toHaveLength(0);

    await setInvoiceChase(inv.id, true);
    await enqueueOverdueReminders();
    const [requeued] = await jobsFor(inv.id);
    expect(requeued.reminderStep).toBe(job.reminderStep);
    await processSendJob(requeued.id);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("won't email an imported invoice without confirmation", async () => {
    const inv = await addInvoice("IMP-11");
    expect((await sendInvoice(inv.id)).ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await sendInvoice(inv.id, { confirmedImported: true })).ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("opts in every open import in bulk, and nothing else", async () => {
    const open = await addInvoice("IMP-4");
    const paid = await addInvoice("IMP-5", { status: "paid" });
    expect((await chaseAllImportedInvoices()).ok).toBe(true);
    const rows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.companyId, companyId));
    const byId = new Map(rows.map((r) => [r.id, r.chaseEnabled]));
    expect(byId.get(open.id)).toBe(true);
    expect(byId.get(paid.id)).toBe(false);
  });

  it("can't change another company's invoice", async () => {
    const other = await seedCompany(db, { name: "Other" });
    const [otherClient] = await db
      .insert(clients)
      .values({ companyId: other.id, name: "Theirs" })
      .returning();
    const [theirs] = await db
      .insert(invoices)
      .values({
        companyId: other.id,
        clientId: otherClient.id,
        number: "X-1",
        source: "import",
        chaseEnabled: false,
      })
      .returning();
    const result = await setInvoiceChase(theirs.id, true);
    expect(result.ok).toBe(false);
  });
});

describe("in-app alerts for imported invoices", () => {
  it("raises no overdue notification until chasing is on", async () => {
    const inv = await addInvoice("IMP-6");
    await runNotificationScanners();
    const before = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "invoice.overdue"));
    expect(before).toHaveLength(0);

    await setInvoiceChase(inv.id, true);
    await runNotificationScanners();
    const after = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "invoice.overdue"));
    expect(after.length).toBeGreaterThan(0);
  });

  it("keeps unchased imports out of the badge and close, but in the plain count", async () => {
    await addInvoice("IMP-7");
    expect(await countOverdueInvoices(companyId)).toBe(1);
    expect(await countOverdueInvoices(companyId, { chasableOnly: true })).toBe(0);
    const checklist = await getWeeklyCloseChecklist(companyId);
    const overdue = checklist.items.find((i) => i.key === "overdue");
    expect(overdue?.count).toBe(0);
  });

  it("summarises what isn't being chased", async () => {
    const [noEmail] = await db
      .insert(clients)
      .values({ companyId, name: "No Email" })
      .returning();
    await addInvoice("IMP-8");
    await addInvoice("IMP-9", { clientId: noEmail.id });
    const summary = await getUnchasedImports(companyId);
    expect(summary).toMatchObject({ count: 2, withoutEmail: 1 });
    expect(summary.totalFormatted).toContain("200");
  });
});

describe("forecast note", () => {
  it("totals what's still owed on brought-forward invoices only", async () => {
    const old = await addInvoice("BF-OWED", { broughtForward: true });
    await addInvoice("BF-PAID", { broughtForward: true, status: "paid" });
    await addInvoice("COUNTED");
    await db.insert(payments).values({
      invoiceId: old.id,
      amountPence: 4_000,
      receivedAt: new Date(),
    });
    expect(await getBroughtForwardDebtsPence(companyId)).toBe(6_000);
  });
});

describe("late payment claims", () => {
  it("refuses a claim on a debt older than the rate table", async () => {
    const inv = await addInvoice("OLD", {
      issueDate: "2020-01-01",
      dueDate: "2020-02-01",
    });
    const result = await raiseLatePaymentInvoice(inv.id);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("older than");
  });
});

describe("0072 backfill", () => {
  async function runBackfill() {
    const migration = await readFile("drizzle/0072_invoice_chase.sql", "utf8");
    await ctx.client.exec(migration.split("--> statement-breakpoint").at(-1)!);
  }

  it("keeps chasing only imports that already had reminders", async () => {
    const chased = await addInvoice("BF-1", { chaseEnabled: true });
    const quiet = await addInvoice("BF-2", { chaseEnabled: true });
    const native = await addInvoice("BF-3", {
      source: "alfa",
      chaseEnabled: true,
    });
    await db.insert(sendJobs).values({
      companyId,
      invoiceId: chased.id,
      kind: "invoice_remind",
      reminderStep: 1,
    });

    await runBackfill();

    const rows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.companyId, companyId));
    const byId = new Map(rows.map((r) => [r.id, r.chaseEnabled]));
    expect(byId.get(chased.id)).toBe(true);
    expect(byId.get(quiet.id)).toBe(false);
    expect(byId.get(native.id)).toBe(true);
  });
});
