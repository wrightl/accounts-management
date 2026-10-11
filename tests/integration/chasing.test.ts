import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  companies,
  expenses,
  invoiceLineItems,
  invoices,
  notifications,
  orderPaymentMilestones,
  orders,
  payments,
  reconciliationMatches,
  sendJobs,
  users,
  weeklyCloses,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { sendEmail } from "@/lib/email";
import { enqueueOverdueReminders, processSendJob } from "@/lib/outbox";
import { raiseLatePaymentInvoice } from "@/actions/late-payment";
import { closeWeek } from "@/actions/close";
import { saveReminderSettings } from "@/actions/reminders";
import { getWeeklyCloseChecklist } from "@/lib/close/checklist";
import { sendWeeklyCloseDigests } from "@/lib/close/digest";
import { addDays } from "@/lib/ledger/corporation-tax";
import { todayIsoDate } from "@/lib/dates";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_chase", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "chase@example.com" },
    firstName: "Chase",
    lastName: "Er",
    publicMetadata: {},
  })),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "email_1" })),
}));
vi.mock("@/lib/email/resolve-client-sender", () => ({
  resolveClientEmailSender: vi.fn(async () => ({
    from: "Test Co <billing@test.example>",
    replyTo: "chase@example.com",
  })),
}));

const today = todayIsoDate();

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;
let userId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
  const [user] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_chase",
      email: "chase@example.com",
      name: "Chase Er",
      role: "admin",
    })
    .returning();
  userId = user.id;
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Acme", email: "ap@acme.test" })
    .returning();
  clientId = client.id;
  vi.mocked(sendEmail).mockClear();
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function seedInvoice(opts: { issueDate: string; dueDate: string; grossPence?: number }) {
  const gross = opts.grossPence ?? 500_000;
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId,
      number: `INV-${opts.dueDate}`,
      clientId,
      status: "sent",
      issueDate: opts.issueDate,
      dueDate: opts.dueDate,
      netPence: gross,
      vatPence: 0,
      grossPence: gross,
    })
    .returning();
  await db.insert(invoiceLineItems).values({
    invoiceId: inv.id,
    description: "Work",
    quantity: 1,
    unitPricePence: gross,
    position: 0,
  });
  return inv.id;
}

async function remindJobs(invoiceId: string) {
  return db
    .select()
    .from(sendJobs)
    .where(and(eq(sendJobs.invoiceId, invoiceId), eq(sendJobs.kind, "invoice_remind")));
}

describe("reminder schedule", () => {
  it("queues the latest step reached, once per step", async () => {
    const soon = await seedInvoice({ issueDate: addDays(today, -10), dueDate: addDays(today, 3) });
    const late = await seedInvoice({ issueDate: addDays(today, -30), dueDate: addDays(today, -2) });

    expect(await enqueueOverdueReminders()).toBe(2);
    expect((await remindJobs(soon)).map((j) => j.reminderStep)).toEqual([-3]);
    expect((await remindJobs(late)).map((j) => j.reminderStep)).toEqual([1]);

    expect(await enqueueOverdueReminders()).toBe(0);
  });

  it("follows the company's schedule and skips paid invoices", async () => {
    const late = await seedInvoice({ issueDate: addDays(today, -30), dueDate: addDays(today, -8) });
    const paid = await seedInvoice({ issueDate: addDays(today, -30), dueDate: addDays(today, -9) });
    await db.insert(payments).values({ invoiceId: paid, amountPence: 500_000 });

    const form = new FormData();
    form.set("remindersEnabled", "on");
    form.append("reminderStep", "3");
    form.append("reminderStep", "30");
    expect((await saveReminderSettings(form)).ok).toBe(true);

    expect(await enqueueOverdueReminders()).toBe(1);
    expect((await remindJobs(late)).map((j) => j.reminderStep)).toEqual([3]);
    expect(await remindJobs(paid)).toHaveLength(0);
  });

  it("sends nothing when reminders are off", async () => {
    await seedInvoice({ issueDate: addDays(today, -30), dueDate: addDays(today, -2) });
    const form = new FormData();
    expect((await saveReminderSettings(form)).ok).toBe(true);
    expect(await enqueueOverdueReminders()).toBe(0);
  });

  it("needs at least one step while reminders are on", async () => {
    const form = new FormData();
    form.set("remindersEnabled", "on");
    const result = await saveReminderSettings(form);
    expect(result.ok).toBe(false);
  });
});

describe("reminder emails", () => {
  it("nudges before the due date and adds late charges once overdue", async () => {
    await db
      .update(companies)
      .set({ latePaymentCharges: true })
      .where(eq(companies.id, companyId));
    const soon = await seedInvoice({ issueDate: addDays(today, -10), dueDate: addDays(today, 3) });
    const late = await seedInvoice({ issueDate: addDays(today, -30), dueDate: addDays(today, -2) });
    await enqueueOverdueReminders();

    const [soonJob] = await remindJobs(soon);
    expect((await processSendJob(soonJob!.id)).ok).toBe(true);
    const nudge = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(nudge.subject).toMatch(/is due on/);
    expect(nudge.text).not.toMatch(/Late Payment/);

    const [lateJob] = await remindJobs(late);
    expect((await processSendJob(lateJob!.id)).ok).toBe(true);
    const overdue = vi.mocked(sendEmail).mock.calls[1]![0];
    expect(overdue.subject).toMatch(/overdue/);
    expect(overdue.text).toMatch(/Late Payment of Commercial Debts/);
    expect(overdue.text).toMatch(/fixed compensation of £70\.00/);
  });

  it("closes the job without emailing if the invoice is paid first", async () => {
    const late = await seedInvoice({ issueDate: addDays(today, -30), dueDate: addDays(today, -2) });
    await enqueueOverdueReminders();
    await db.insert(payments).values({ invoiceId: late, amountPence: 500_000 });

    const [job] = await remindJobs(late);
    expect((await processSendJob(job!.id)).ok).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    const [after] = await remindJobs(late);
    expect(after).toMatchObject({ status: "sent", lastError: expect.stringMatching(/Skipped/) });
  });
});

describe("late payment invoice", () => {
  it("raises a draft claiming interest and compensation, once", async () => {
    const late = await seedInvoice({ issueDate: addDays(today, -60), dueDate: addDays(today, -30) });
    const result = await raiseLatePaymentInvoice(late);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [claim] = await db.select().from(invoices).where(eq(invoices.id, result.id!));
    expect(claim).toMatchObject({
      status: "draft",
      vatPence: 0,
      latePaymentForInvoiceId: late,
      clientId,
    });
    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, claim!.id));
    expect(lines.map((l) => l.unitPricePence)).toEqual([
      claim!.grossPence - 7_000,
      7_000,
    ]);
    expect(lines[0]!.description).toMatch(/30 days/);

    expect((await raiseLatePaymentInvoice(late)).ok).toBe(false);
  });

  it("refuses an invoice that isn't overdue", async () => {
    const notDue = await seedInvoice({ issueDate: today, dueDate: addDays(today, 14) });
    expect((await raiseLatePaymentInvoice(notDue)).ok).toBe(false);
  });
});

describe("weekly close", () => {
  async function seedWork() {
    await seedInvoice({ issueDate: addDays(today, -30), dueDate: addDays(today, -2) });
    await db.insert(expenses).values([
      { companyId, description: "Forwarded receipt", spentAt: today, amountPence: 1_200, status: "pending" },
      {
        companyId,
        description: "Train",
        spentAt: today,
        amountPence: 3_000,
        status: "reimbursable",
        paidByUserId: userId,
      },
    ]);
    const [order] = await db
      .insert(orders)
      .values({
        companyId,
        number: "O-1",
        clientId,
        status: "active",
        issueDate: today,
        netPence: 100_000,
        vatPence: 0,
        grossPence: 100_000,
      })
      .returning();
    await db.insert(orderPaymentMilestones).values([
      { orderId: order.id, label: "Kick-off", amountPence: 40_000, dueDate: addDays(today, 3), position: 0 },
      { orderId: order.id, label: "Delivery", amountPence: 60_000, dueDate: addDays(today, 40), position: 1 },
    ]);
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling", provider: "starling" })
      .returning();
    const [done, open] = await db
      .insert(bankTransactions)
      .values([
        { bankAccountId: account.id, externalId: "t1", bookedAt: addDays(today, -9), amountPence: 500, counterparty: "A" },
        { bankAccountId: account.id, externalId: "t2", bookedAt: addDays(today, -5), amountPence: -900, counterparty: "B" },
      ])
      .returning();
    await db
      .insert(reconciliationMatches)
      .values({ bankTransactionId: done!.id, matchType: "transfer", confirmed: true });
    return { openBankDate: open!.bookedAt };
  }

  it("lists what to clear and when the bank is reconciled to", async () => {
    const { openBankDate } = await seedWork();
    const checklist = await getWeeklyCloseChecklist(companyId);
    const counts = Object.fromEntries(checklist.items.map((i) => [i.key, i.count]));
    expect(counts).toEqual({ bank: 1, receipts: 1, overdue: 1, milestones: 1, reimbursements: 1 });
    expect(checklist.milestones[0]).toMatchObject({ label: "Kick-off", amountPence: 40_000 });
    expect(checklist.bankReconciledThrough).toBe(addDays(openBankDate, -1));
  });

  it("records a close with what was left open", async () => {
    await seedWork();
    expect((await closeWeek()).ok).toBe(true);
    const [close] = await db.select().from(weeklyCloses);
    expect(close).toMatchObject({
      closedByUserId: userId,
      snapshot: { bank: 1, receipts: 1, overdue: 1, milestones: 1, reimbursements: 1 },
    });
  });

  it("sends a Monday digest once, and nothing on other days", async () => {
    await seedWork();
    expect((await sendWeeklyCloseDigests("2026-10-13")).notified).toBe(0);
    expect((await sendWeeklyCloseDigests("2026-10-12")).notified).toBe(1);
    expect((await sendWeeklyCloseDigests("2026-10-12")).notified).toBe(0);
    const [n] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "close.weekly"));
    expect(n).toMatchObject({ userId, href: "/close", title: "Weekly close: 5 things to clear" });
    expect(n!.body).toMatch(/Receipts to review: 1/);
  });
});
