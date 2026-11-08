import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  bankAccounts,
  bankTransactions,
  clients,
  creditNotes,
  dividendDeclarations,
  expenseReceipts,
  expenses,
  invoices,
  notifications,
  payments,
  reconciliationMatches,
  recurringInvoices,
  reimbursements,
  shareholders,
  users,
  accountantQueries,
  accountantQueryMessages,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedCompany } from "@/lib/test/seed-company";
import { listInvoices, getInvoiceDetail } from "@/lib/invoices/queries";
import { listExpenses } from "@/lib/expenses/queries";
import { listReimbursements } from "@/lib/reimbursements/queries";
import { getQueryDetail, listQueries, listQueriesForRecords } from "@/lib/queries/queries";
import {
  closeQuery,
  raiseQuery,
  reopenQuery,
  replyToQuery,
} from "@/actions/accountant-queries";
import { createClient } from "@/actions/clients";
import { deleteExpense } from "@/actions/expenses";
import { updateInvoiceStatus } from "@/actions/invoices";
import { setRowNoteAction } from "@/actions/labels";
import { loadBankTransactionsPage } from "@/actions/bank";
import { GET as invoicePdf } from "@/app/api/invoices/[id]/pdf/route";
import { GET as receiptFile } from "@/app/api/receipts/[id]/route";
import InvoiceDetailPage from "@/app/(app)/invoices/[id]/page";
import ExpensesPage from "@/app/(app)/expenses/page";
import CreditNotesPage from "@/app/(app)/credit-notes/page";
import DividendsPage from "@/app/(app)/dividends/page";
import InvoicesPage from "@/app/(app)/invoices/page";
import RecurringInvoicesPage from "@/app/(app)/recurring-invoices/page";
import ReimbursementsPage from "@/app/(app)/reimbursements/page";
import ShareholdersPage from "@/app/(app)/shareholders/page";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const sendEmail = vi.hoisted(() => vi.fn(async () => ({ id: null })));
vi.mock("@/lib/email", async (original) => ({
  ...(await original<typeof import("@/lib/email")>()),
  sendEmail,
}));

const clerk = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "clerk_accountant", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "accountant@example.com" },
    firstName: "Alex",
    lastName: "Accountant",
    publicMetadata: {},
  })),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: clerk.auth, currentUser: clerk.currentUser }));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let otherCompanyId: string;
let accountantId: string;
let adminId: string;
let clientId: string;

function signInAs(role: "accountant" | "admin" | "user") {
  const email = `${role}@example.com`;
  clerk.auth.mockResolvedValue({ userId: `clerk_${role}`, sessionClaims: {} });
  clerk.currentUser.mockResolvedValue({
    primaryEmailAddress: { emailAddress: email },
    firstName: role,
    lastName: "Person",
    publicMetadata: {},
  });
}

async function seedInvoice(status: "draft" | "sent" | "void", number: string) {
  const [row] = await db
    .insert(invoices)
    .values({ companyId, clientId, number, status, issueDate: "2026-03-01", grossPence: 1000 })
    .returning();
  return row;
}

async function seedExpense(status: "pending" | "recorded", description: string) {
  const [row] = await db
    .insert(expenses)
    .values({ companyId, description, status, spentAt: "2026-03-02", amountPence: 500 })
    .returning();
  return row;
}

/** A page's element tree as text, skipping React's circular internals. */
function pageText(element: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(element, (key, value) => {
    if (key === "_owner" || key === "_store" || key === "type") return undefined;
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return undefined;
      seen.add(value);
    }
    return value;
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = () => new Request("http://localhost/x") as never;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { name: "Filing Co", slug: "filing-co" });
  const other = await seedCompany(db, { name: "Other Co", slug: "other-co" });
  companyId = company.id;
  otherCompanyId = other.id;
  const inserted = await db
    .insert(users)
    .values(
      (["accountant", "admin", "user"] as const).map((role) => ({
        companyId,
        clerkUserId: `clerk_${role}`,
        email: `${role}@example.com`,
        name: `${role} Person`,
        role,
      })),
    )
    .returning();
  accountantId = inserted.find((u) => u.role === "accountant")!.id;
  adminId = inserted.find((u) => u.role === "admin")!.id;
  const [client] = await db.insert(clients).values({ companyId, name: "Client" }).returning();
  clientId = client.id;
  signInAs("accountant");
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("raising a query from the expenses list", () => {
  const listProps = { searchParams: Promise.resolve({}) };

  it("offers accountants a query on the row, before the date", async () => {
    const expense = await seedExpense("recorded", "Logged");
    const text = pageText(await ExpensesPage(listProps));

    const query = text.indexOf(`"recordKind":"expense","recordId":"${expense.id}"`);
    expect(query).toBeGreaterThan(-1);
    expect(query).toBeLessThan(text.indexOf('"value":"2026-03-02"'));
  });

  it("doesn't offer it to the team", async () => {
    await seedExpense("recorded", "Logged");
    signInAs("admin");

    const text = pageText(await ExpensesPage(listProps));
    expect(text).toContain('"canRaise":false');
    expect(text).not.toContain('"canRaise":true');
  });
});

describe("raising a query from the other record lists", () => {
  const listProps = {
    searchParams: Promise.resolve({ from: "2026-01-01", to: "2026-12-31" }),
  } as never;
  type ListPage = (props: never) => Promise<unknown>;

  it.each<[string, ListPage, () => Promise<string>]>([
    ["invoice", InvoicesPage, async () => (await seedInvoice("sent", "S-1")).id],
    [
      "credit_note",
      CreditNotesPage,
      async () => {
        const invoice = await seedInvoice("sent", "S-1");
        const [row] = await db
          .insert(creditNotes)
          .values({
            companyId,
            invoiceId: invoice.id,
            clientId,
            number: "CN-1",
            status: "issued",
            issueDate: "2026-03-05",
            reason: "Mistake",
          })
          .returning();
        return row.id;
      },
    ],
    [
      "recurring_invoice",
      RecurringInvoicesPage,
      async () => {
        const [row] = await db
          .insert(recurringInvoices)
          .values({ companyId, clientId, name: "Retainer", lineTemplate: [] })
          .returning();
        return row.id;
      },
    ],
    [
      "reimbursement",
      ReimbursementsPage,
      async () => {
        const [row] = await db
          .insert(reimbursements)
          .values({ companyId, payeeUserId: adminId, status: "paid", paidAt: new Date() })
          .returning();
        return row.id;
      },
    ],
    [
      "shareholder",
      ShareholdersPage,
      async () => {
        const [row] = await db
          .insert(shareholders)
          .values({ companyId, name: "Sam", shareCount: 10 })
          .returning();
        return row.id;
      },
    ],
  ])("offers accountants a %s query at the start of the row", async (kind, page, seed) => {
    const id = await seed();
    const row = JSON.parse(pageText(await page(listProps)));
    const found: { kind?: string; id?: string }[] = [];
    (function walk(node: unknown) {
      if (!node || typeof node !== "object") return;
      const children = (node as { props?: { children?: unknown } }).props?.children;
      const list = (Array.isArray(children) ? children : [children]).filter(Boolean);
      const first = list[0] as { props?: { kind?: string; id?: string } } | undefined;
      if (first?.props?.kind) found.push(first.props);
      list.forEach(walk);
      if (Array.isArray(node)) node.forEach(walk);
    })(row);
    expect(found).toContainEqual({ kind, id, canRaise: true });

    signInAs("admin");
    expect(pageText(await page(listProps))).not.toContain(`"kind":"${kind}"`);
  });

  it("offers it on each dividend, before the date", async () => {
    const [row] = await db
      .insert(dividendDeclarations)
      .values({ companyId, declaredAt: "2026-03-05", totalPence: 1000 })
      .returning();
    const text = pageText(await DividendsPage(listProps));

    const query = text.indexOf(`"recordKind":"dividend_declaration","recordId":"${row.id}"`);
    expect(query).toBeGreaterThan(-1);
    expect(query).toBeLessThan(text.indexOf('"value":"2026-03-05"'));
  });
});

describe("query state on record lists", () => {
  const listProps = { searchParams: Promise.resolve({}) };

  async function seedQuery(values: { companyId: string; recordId: string; status: string }) {
    const [row] = await db
      .insert(accountantQueries)
      .values({ ...values, subject: "About this", recordKind: "invoice" })
      .returning();
    return row;
  }

  it("never returns another company's queries", async () => {
    const invoice = await seedInvoice("sent", "S-1");
    const mine = await seedQuery({ companyId, recordId: invoice.id, status: "open" });
    await seedQuery({ companyId: otherCompanyId, recordId: invoice.id, status: "closed" });

    const found = await listQueriesForRecords(companyId, "invoice", [invoice.id]);
    expect(found.get(invoice.id)).toEqual([{ id: mine.id, subject: "About this", status: "open" }]);
    expect((await listQueriesForRecords(companyId, "invoice", [])).size).toBe(0);
  });

  it("shows the team a column only once a record has a query", async () => {
    const invoice = await seedInvoice("sent", "S-1");
    signInAs("admin");
    expect(pageText(await InvoicesPage(listProps))).not.toContain('"kind":"invoice"');

    await seedQuery({ companyId, recordId: invoice.id, status: "answered" });
    const text = pageText(await InvoicesPage(listProps));
    expect(text).toContain(`"kind":"invoice","id":"${invoice.id}"`);
    expect(text).toContain('"status":"answered"');
    expect(text).toContain('"canRaise":false');
  });

  it("returns query state when the transactions feed loads more rows", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Current", provider: "generic" })
      .returning();
    const [tx] = await db
      .insert(bankTransactions)
      .values({
        bankAccountId: account.id,
        externalId: "feed-1",
        bookedAt: "2026-03-02",
        amountPence: -500,
      })
      .returning();
    await db.insert(accountantQueries).values({
      companyId,
      subject: "About this",
      recordKind: "bank_transaction",
      recordId: tx.id,
    });

    const loaded = await loadBankTransactionsPage({ page: 1 });
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.result.rows[0].queries?.map((q) => q.status)).toEqual(["open"]);
  });
});

describe("bank rows in pack scope", () => {
  let accountId: string;

  beforeEach(async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Current", provider: "generic" })
      .returning();
    accountId = account.id;
  });

  /** A bank row matched to something, as the accountant's feed returns it. */
  async function matchedRow(
    match: Partial<typeof reconciliationMatches.$inferInsert> & { matchType: string },
  ) {
    const [tx] = await db
      .insert(bankTransactions)
      .values({
        bankAccountId: accountId,
        externalId: crypto.randomUUID(),
        bookedAt: "2026-03-02",
        amountPence: -500,
      })
      .returning();
    await db
      .insert(reconciliationMatches)
      .values({ confirmed: true, ...match, bankTransactionId: tx.id });
    const loaded = await loadBankTransactionsPage({ page: 1 });
    if (!loaded.ok) throw new Error(loaded.error);
    return loaded.result.rows.find((r) => r.id === tx.id)!;
  }

  it("doesn't name a pending expense, but still shows the row as matched", async () => {
    const pending = await seedExpense("pending", "Secret purchase");
    const row = await matchedRow({ matchType: "expense", expenseId: pending.id });

    expect(row).toMatchObject({
      reconciled: true,
      matchLabel: "Expense",
      matchHref: null,
    });
    expect(JSON.stringify(row)).not.toContain("Secret purchase");
  });

  it("doesn't name a draft invoice, matched directly or through a payment", async () => {
    const draft = await seedInvoice("draft", "D-1");
    const direct = await matchedRow({ matchType: "invoice_payment", invoiceId: draft.id });
    expect(direct).toMatchObject({ matchLabel: "Invoice payment", matchHref: null });

    const [payment] = await db
      .insert(payments)
      .values({ invoiceId: draft.id, amountPence: 500 })
      .returning();
    const viaPayment = await matchedRow({ matchType: "invoice_payment", paymentId: payment.id });
    expect(viaPayment).toMatchObject({ matchLabel: "Invoice payment", matchHref: null });
  });

  it("doesn't name an unpaid reimbursement run", async () => {
    const [run] = await db
      .insert(reimbursements)
      .values({ companyId, payeeUserId: adminId, status: "pending" })
      .returning();
    const row = await matchedRow({ matchType: "reimbursement", reimbursementId: run.id });

    expect(row).toMatchObject({ matchLabel: "Reimbursement", matchHref: null });
    expect(JSON.stringify(row)).not.toContain("admin");
  });

  it("names records the pack contains", async () => {
    const sent = await seedInvoice("sent", "S-1");
    const recorded = await seedExpense("recorded", "Logged");

    expect(await matchedRow({ matchType: "invoice_payment", invoiceId: sent.id })).toMatchObject({
      matchHref: `/invoices/${sent.id}`,
      matchLabel: expect.stringContaining("S-1"),
    });
    expect(await matchedRow({ matchType: "expense", expenseId: recorded.id })).toMatchObject({
      matchHref: `/expenses/${recorded.id}`,
      matchLabel: "Logged",
    });
  });

  it("hides suggested matches from accountants but not the team", async () => {
    const recorded = await seedExpense("recorded", "Logged");
    const row = await matchedRow({
      matchType: "expense",
      expenseId: recorded.id,
      confirmed: false,
    });
    expect(row).toMatchObject({ suggested: false, reconciled: false, matchLabel: null });

    signInAs("admin");
    const loaded = await loadBankTransactionsPage({ page: 1 });
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.result.rows.find((r) => r.id === row.id)).toMatchObject({
      suggested: true,
      matchLabel: "Logged",
    });
  });

  it("still names a pending expense for the team", async () => {
    const pending = await seedExpense("pending", "Secret purchase");
    const asAccountant = await matchedRow({ matchType: "expense", expenseId: pending.id });

    signInAs("admin");
    const loaded = await loadBankTransactionsPage({ page: 1 });
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.result.rows.find((r) => r.id === asAccountant.id)).toMatchObject({
      matchLabel: "Secret purchase",
      matchHref: `/expenses/${pending.id}`,
    });
  });
});

describe("pack scope", () => {
  it("lists only invoices the pack contains, while the team still sees them all", async () => {
    await seedInvoice("draft", "D-1");
    await seedInvoice("void", "V-1");
    const sent = await seedInvoice("sent", "S-1");

    expect((await listInvoices(companyId, "pack")).map((r) => r.id)).toEqual([sent.id]);
    expect(await listInvoices(companyId)).toHaveLength(3);
  });

  it("gives a 404 for a draft invoice's page and PDF", async () => {
    const draft = await seedInvoice("draft", "D-1");

    expect(await getInvoiceDetail(companyId, draft.id, "pack")).toBeNull();
    await expect(InvoiceDetailPage(params(draft.id))).rejects.toThrow("NOT_FOUND");
    expect((await invoicePdf(request(), params(draft.id))).status).toBe(404);
  });

  it("hides pending expenses and their receipts", async () => {
    const pending = await seedExpense("pending", "Emailed in");
    const recorded = await seedExpense("recorded", "Logged");
    const [receipt] = await db
      .insert(expenseReceipts)
      .values({ expenseId: pending.id, blobPath: "x", filename: "x.pdf" })
      .returning();

    const rows = await listExpenses(companyId, { scope: "pack" });
    expect(rows.map((r) => r.id)).toEqual([recorded.id]);
    expect(await listExpenses(companyId)).toHaveLength(2);
    expect((await receiptFile(request(), params(receipt.id))).status).toBe(404);
  });

  it("lists only reimbursement runs that have been paid", async () => {
    await db.insert(reimbursements).values({ companyId, payeeUserId: adminId, status: "pending" });
    const [paid] = await db
      .insert(reimbursements)
      .values({ companyId, payeeUserId: adminId, status: "paid", paidAt: new Date("2026-03-03") })
      .returning();

    expect((await listReimbursements(companyId, "pack")).map((r) => r.id)).toEqual([paid.id]);
    expect(await listReimbursements(companyId)).toHaveLength(2);
  });

  it("doesn't leak the client link or the client page link on an invoice", async () => {
    const sent = await seedInvoice("sent", "S-1");
    const html = pageText(await InvoiceDetailPage(params(sent.id)));
    expect(html).toContain("S-1");
    expect(html).not.toContain(`/clients/${clientId}`);
    expect(html).not.toContain("Copy Client Link");
    expect(html).not.toContain("/i/");
    expect(html).not.toContain("Raise credit note");

    signInAs("admin");
    const adminHtml = pageText(await InvoiceDetailPage(params(sent.id)));
    expect(adminHtml).toContain(`/clients/${clientId}`);
    expect(adminHtml).toContain("Copy Client Link");
    expect(adminHtml).toContain("/i/");
  });
});

describe("notes in pack scope", () => {
  it("shows the accountant only the notes the team shared, and no labels", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Current", provider: "generic" })
      .returning();
    const [shared, kept] = await db
      .insert(bankTransactions)
      .values([
        {
          bankAccountId: account.id,
          externalId: "note-1",
          bookedAt: "2026-03-02",
          amountPence: -500,
          notes: "Paid twice, refund due",
          noteSharedWithAccountant: true,
        },
        {
          bankAccountId: account.id,
          externalId: "note-2",
          bookedAt: "2026-03-03",
          amountPence: -700,
          notes: "team only",
        },
      ])
      .returning();
    const loaded = await loadBankTransactionsPage({ page: 1 });
    if (!loaded.ok) throw new Error(loaded.error);
    const byId = new Map(loaded.result.rows.map((r) => [r.id, r]));
    expect(byId.get(shared.id)?.notes).toBe("Paid twice, refund due");
    expect(byId.get(kept.id)?.notes).toBeNull();

    await db.insert(expenses).values([
      { companyId, description: "A", status: "recorded", spentAt: "2026-03-02", amountPence: 500, notes: "client lunch", noteSharedWithAccountant: true },
      { companyId, description: "B", status: "recorded", spentAt: "2026-03-02", amountPence: 500, notes: "private aside" },
    ]);
    const text = pageText(await ExpensesPage({ searchParams: Promise.resolve({}) }));
    expect(text).toContain("client lunch");
    expect(text).not.toContain("private aside");

    signInAs("admin");
    expect(pageText(await ExpensesPage({ searchParams: Promise.resolve({}) }))).toContain("private aside");
  });
});

describe("accountants stay read-only", () => {
  it("refuses a change in each area", async () => {
    const invoice = await seedInvoice("sent", "S-1");
    const expense = await seedExpense("recorded", "Logged");
    const denied = "You do not have permission to do that.";

    const form = new FormData();
    form.set("name", "New client");
    expect(await createClient(form)).toMatchObject({ ok: false, error: denied });
    expect(await updateInvoiceStatus(invoice.id, "paid")).toMatchObject({ ok: false, error: denied });
    expect(await deleteExpense(expense.id)).toMatchObject({ ok: false, error: denied });
    expect(await setRowNoteAction("expense", expense.id, "note")).toMatchObject({
      ok: false,
      error: denied,
    });
  });
});

describe("accountant queries", () => {
  const general = { subject: "Year-end plan", body: "secret detail", recordKind: null, recordId: null };

  async function raise(input: Parameters<typeof raiseQuery>[0] = general) {
    const result = await raiseQuery(input);
    if (!result.ok) throw new Error(result.error);
    return result.id!;
  }

  it("runs from raised through answered and closed to reopened", async () => {
    const id = await raise();
    expect((await getQueryDetail(companyId, id))?.query.status).toBe("open");

    signInAs("user");
    expect(await replyToQuery(id, { body: "Here you go" })).toMatchObject({ ok: true });
    expect((await getQueryDetail(companyId, id))?.query.status).toBe("answered");

    signInAs("accountant");
    expect(await replyToQuery(id, { body: "One more thing" })).toMatchObject({ ok: true });
    expect((await getQueryDetail(companyId, id))?.query.status).toBe("open");

    expect(await closeQuery(id)).toMatchObject({ ok: true });
    const closed = await getQueryDetail(companyId, id);
    expect(closed?.query.status).toBe("closed");
    expect(closed?.query.closedAt).not.toBeNull();
    expect(closed?.messages.map((m) => m.body)).toEqual([
      "secret detail",
      "Here you go",
      "One more thing",
    ]);

    expect(await reopenQuery(id)).toMatchObject({ ok: true });
    const reopened = await getQueryDetail(companyId, id);
    expect(reopened?.query.status).toBe("open");
    expect(reopened?.query.closedAt).toBeNull();
  });

  it("only lets accountants raise, close and reopen", async () => {
    const id = await raise();
    signInAs("admin");
    expect((await raiseQuery(general)).ok).toBe(false);
    expect((await closeQuery(id)).ok).toBe(false);
    expect((await reopenQuery(id)).ok).toBe(false);
  });

  it("refuses replies on a closed query", async () => {
    const id = await raise();
    await closeQuery(id);
    signInAs("admin");
    const result = await replyToQuery(id, { body: "Too late" });
    expect(result).toMatchObject({ ok: false, error: "This query is closed. Reopen it to reply." });
    expect((await getQueryDetail(companyId, id))?.messages).toHaveLength(1);
  });

  it("validates the subject, body and record pairing", async () => {
    expect((await raiseQuery({ ...general, subject: "  " })).ok).toBe(false);
    expect((await raiseQuery({ ...general, body: "" })).ok).toBe(false);
    expect((await raiseQuery({ ...general, recordKind: "invoice" })).ok).toBe(false);
  });

  it("labels a query from the record itself, and refuses records outside the pack", async () => {
    const sent = await seedInvoice("sent", "S-1");
    const draft = await seedInvoice("draft", "D-1");
    const base = { subject: "VAT?", body: "Which rate?", recordKind: "invoice" };

    const id = await raise({ ...base, recordId: sent.id });
    expect((await getQueryDetail(companyId, id))?.query.recordLabel).toBe("Invoice S-1");
    expect(await raiseQuery({ ...base, recordId: draft.id })).toMatchObject({
      ok: false,
      error: "Record not found",
    });
  });

  it("refuses another company's bank row, which has no company of its own", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId: otherCompanyId, name: "Theirs", provider: "generic" })
      .returning();
    const [tx] = await db
      .insert(bankTransactions)
      .values({ bankAccountId: account.id, externalId: "x", bookedAt: "2026-03-01", amountPence: -100 })
      .returning();

    expect(
      await raiseQuery({
        subject: "Whose?",
        body: "?",
        recordKind: "bank_transaction",
        recordId: tx.id,
      }),
    ).toMatchObject({ ok: false, error: "Record not found" });
  });

  it("keeps threads inside their company", async () => {
    const id = await raise();
    expect(await getQueryDetail(otherCompanyId, id)).toBeNull();
    expect(await listQueries(otherCompanyId)).toEqual([]);

    await db.update(users).set({ companyId: otherCompanyId }).where(eq(users.id, adminId));
    signInAs("admin");
    expect((await replyToQuery(id, { body: "Crossing over" })).ok).toBe(false);
    const messages = await db
      .select()
      .from(accountantQueryMessages)
      .where(eq(accountantQueryMessages.queryId, id));
    expect(messages).toHaveLength(1);
    const [query] = await db.select().from(accountantQueries).where(eq(accountantQueries.id, id));
    expect(query.status).toBe("open");
  });

  it("notifies the other side, without the message text", async () => {
    const id = await raise();
    const forUser = (userId: string) =>
      db.select().from(notifications).where(eq(notifications.userId, userId));

    const toAdmin = await forUser(adminId);
    expect(toAdmin.map((n) => n.type)).toEqual(["accountant_query.raised"]);
    expect(toAdmin[0].href).toBe(`/queries/${id}`);
    expect(JSON.stringify(toAdmin)).not.toContain("secret detail");
    expect(await forUser(accountantId)).toHaveLength(0);

    signInAs("admin");
    await replyToQuery(id, { body: "A second private message" });
    const toAccountant = await forUser(accountantId);
    expect(toAccountant.map((n) => n.type)).toEqual(["accountant_query.replied"]);
    expect(JSON.stringify(toAccountant)).not.toContain("private message");
  });

  it("emails the team the message when a query is raised, but keeps it out of in-app notifications", async () => {
    sendEmail.mockClear();
    const id = await raise();

    const sent = sendEmail.mock.calls.map(([m]) => m as unknown as { to: string; subject: string; text: string });
    expect(sent.map((m) => m.to).sort()).toEqual(["admin@example.com", "user@example.com"]);
    expect(sent[0].subject).toBe("New accountant query");
    expect(sent[0].text).toContain("Year-end plan");
    expect(sent[0].text).toContain(`/queries/${id}`);
    expect(sent[0].text).toContain("secret detail");
    const inApp = await db.select().from(notifications).where(eq(notifications.userId, adminId));
    expect(JSON.stringify(inApp)).not.toContain("secret detail");
  });

  it("still raises the query when the email fails", async () => {
    sendEmail.mockRejectedValueOnce(new Error("provider down"));
    await expect(raiseQuery(general)).resolves.toMatchObject({ ok: true });
  });

  it("audits each step without recording what was said", async () => {
    const id = await raise();
    await closeQuery(id);
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(rows.map((r) => r.action).sort()).toEqual(["query.close", "query.raise"]);
    expect(JSON.stringify(rows)).not.toContain("secret detail");
  });
});

describe("credit notes in pack scope", () => {
  it("includes void credit notes, as the pack does", async () => {
    const invoice = await seedInvoice("sent", "S-1");
    await db.insert(creditNotes).values({
      companyId,
      invoiceId: invoice.id,
      clientId,
      number: "CN-1",
      status: "void",
      issueDate: "2026-03-05",
      reason: "Mistake",
    });
    const { listCreditNotePage } = await import("@/lib/credit-notes/queries");
    const page = await listCreditNotePage(companyId, {
      scope: "pack",
      sort: "created",
      dir: "desc",
      page: 1,
      pageSize: 25,
    });
    expect(page.rows.map((r) => r.number)).toEqual(["CN-1"]);
  });
});
