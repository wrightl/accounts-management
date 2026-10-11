import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companies,
  invoiceLineItems,
  invoices,
  quotes,
  sendJobs,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { createQuote, updateQuote } from "@/actions/quotes";
import { acceptPublicQuote } from "@/actions/public-quotes";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { getUsedMilestoneIds } from "@/lib/orders/invoice-from-order";
import { todayIsoDate } from "@/lib/invoices/status";

const createSession = vi.fn();
const afterCallbacks: Array<() => unknown> = [];

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => afterCallbacks.push(cb),
}));
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: createSession } } }),
  appBaseUrl: () => "http://localhost:3001",
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_dep", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "dep@example.com" },
    firstName: "Dep",
    lastName: "Osit",
    publicMetadata: {},
  })),
}));

const ACCOUNT = "acct_test_dep";
const TOKEN = "tok-deposit";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, {
    stripeConnectAccountId: ACCOUNT,
    stripeConnectChargesEnabled: true,
    sortCode: "04-00-04",
    accountNumber: "12345678",
    vatRegistered: true,
  });
  companyId = company.id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_dep",
    email: "dep@example.com",
    name: "Dep Osit",
    role: "admin",
  });
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Acme", email: "ap@acme.test" })
    .returning();
  clientId = client.id;
  createSession.mockReset();
  createSession.mockResolvedValue({ id: "cs_dep", url: "https://checkout.stripe.com/c/cs_dep" });
  afterCallbacks.length = 0;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

const SCHEDULE = [
  { label: "Deposit", percentBasisPoints: 3000, dueInDays: 7, position: 0 },
  { label: "On delivery", percentBasisPoints: 7000, dueInDays: 30, position: 1 },
];

function quoteForm(opts: { deposit: boolean; milestones?: unknown[] }) {
  const form = new FormData();
  form.set("clientId", clientId);
  form.set("issueDate", todayIsoDate());
  // £1,000 net + 20% VAT = £1,200 gross.
  form.set(
    "linesJson",
    JSON.stringify([
      { description: "Website", quantity: 1, unitPricePounds: "1000", vatRate: "20" },
    ]),
  );
  form.set("milestonesJson", JSON.stringify(opts.milestones ?? SCHEDULE));
  if (opts.deposit) form.set("depositOnAccept", "on");
  return form;
}

async function seedQuote(opts: { deposit: boolean; milestones?: unknown[] }) {
  const created = await createQuote(quoteForm(opts));
  if (!created.ok || !created.id) throw new Error("createQuote failed");
  await db
    .update(quotes)
    .set({ status: "sent", publicToken: TOKEN })
    .where(eq(quotes.id, created.id));
  return created.id;
}

async function acceptExpectingRedirect(): Promise<string> {
  try {
    await acceptPublicQuote(TOKEN);
  } catch (e) {
    return (e as { url: string }).url;
  }
  throw new Error("Expected a redirect");
}

describe("deposit on accept", () => {
  it("raises the first milestone as a sent invoice and opens Checkout", async () => {
    const quoteId = await seedQuote({ deposit: true });

    const url = await acceptExpectingRedirect();
    expect(url).toBe("https://checkout.stripe.com/c/cs_dep");

    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(quote.status).toBe("accepted");
    const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, quote.orderId!));
    expect(invoice).toMatchObject({
      status: "sent",
      issueDate: todayIsoDate(),
      grossPence: 36000,
      vatPence: 6000,
      clientId,
    });
    expect(invoice.sentAt).not.toBeNull();

    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id));
    expect(lines[0]!.description).toMatch(/^Deposit — /);

    // The milestone is used, so staff can't invoice it twice from the order.
    const used = await getUsedMilestoneIds(db as unknown as Database, quote.orderId!);
    expect(used.has(invoice.paymentMilestoneId!)).toBe(true);

    // Checkout is for the deposit, on the company's own Stripe account.
    const [params, options] = createSession.mock.calls[0]!;
    expect(options).toEqual({ stripeAccount: ACCOUNT });
    expect(params.line_items[0].price_data.unit_amount).toBe(36000);
    expect(params.metadata).toMatchObject({ invoiceId: invoice.id });

    // A copy of the invoice is queued for the client, sent after the response.
    const jobs = await db.select().from(sendJobs).where(eq(sendJobs.invoiceId, invoice.id));
    expect(jobs).toHaveLength(1);
    expect(afterCallbacks).toHaveLength(1);
  });

  it("falls back to the invoice page when the company can't take cards", async () => {
    await db
      .update(companies)
      .set({ stripeConnectAccountId: null, stripeConnectChargesEnabled: false })
      .where(eq(companies.id, companyId));
    await seedQuote({ deposit: true });

    const url = await acceptExpectingRedirect();
    const [invoice] = await db.select().from(invoices);
    expect(url).toBe(`/i/${invoice!.publicToken}?accepted=1`);
    expect(createSession).not.toHaveBeenCalled();

    const detail = await getInvoiceDetail(companyId, invoice!.id);
    expect(detail?.balancePence).toBe(36000);
  });

  it("still accepts if Stripe fails, sending the client to the invoice page", async () => {
    createSession.mockRejectedValue(new Error("Stripe is down"));
    const quoteId = await seedQuote({ deposit: true });

    const url = await acceptExpectingRedirect();
    expect(url).toMatch(/^\/i\/[0-9a-f]{64}\?accepted=1$/);
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(quote.status).toBe("accepted");
  });

  it("uses a fixed-amount first milestone as given", async () => {
    await seedQuote({
      deposit: true,
      milestones: [
        { label: "Booking fee", amountPence: 50000, dueInDays: 1, position: 0 },
        { label: "Balance", amountPence: 70000, dueInDays: 30, position: 1 },
      ],
    });
    await acceptExpectingRedirect();
    const [invoice] = await db.select().from(invoices);
    expect(invoice!.grossPence).toBe(50000);
  });

  it("just accepts when the quote doesn't ask for a deposit", async () => {
    const quoteId = await seedQuote({ deposit: false });
    const result = await acceptPublicQuote(TOKEN);
    expect(result.ok).toBe(true);
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(quote.orderId).not.toBeNull();
    expect(await db.select().from(invoices)).toHaveLength(0);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("only keeps the option on quotes with a payment schedule", async () => {
    const quoteId = await seedQuote({ deposit: true, milestones: [] });
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(quote.depositOnAccept).toBe(false);

    await db.update(quotes).set({ status: "draft" }).where(eq(quotes.id, quoteId));
    expect((await updateQuote(quoteId, quoteForm({ deposit: true }))).ok).toBe(true);
    const [edited] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    expect(edited.depositOnAccept).toBe(true);
  });
});
