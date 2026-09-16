/**
 * Idempotent fictional demo dataset for the promo video.
 * All entities use fixed document numbers (900x suffix) and fictional UK clients.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  companies,
  expenses,
  inboundEmailJobs,
  invoiceLineItems,
  invoices,
  orderLineItems,
  orders,
  payments,
  quoteLineItems,
  quoteVersions,
  quotes,
  reimbursementItems,
  reimbursements,
  users,
} from "@/db/schema";
import { bootstrapAdminEmails } from "@/lib/bootstrap";

/** Fixed promo document numbers — safe to upsert by. */
export const PROMO_NUMBERS = {
  quote: "Q-2026-9001",
  order: "O-2026-9001",
  invoiceSent: "DD-2026-9001",
  invoicePaid: "DD-2026-9002",
  invoiceOverdue: "DD-2026-9003",
} as const;

export const PROMO_CLIENT_NAMES = [
  "Harbor Digital Ltd",
  "Northbridge Studio Ltd",
  "Meridian Agency Ltd",
] as const;

export interface PromoSeedResult {
  routes: {
    landing: string;
    dashboard: string;
    quoteId: string;
    quoteUrl: string;
    orderId: string;
    orderUrl: string;
    invoiceSentId: string;
    invoiceSentUrl: string;
    expensePendingId: string;
    expenseUrl: string;
    reimbursementId: string;
    reimbursementUrl: string;
    inboundEmailUrl: string;
    transactionsUrl: string;
    reportsUrl: string;
  };
  cleared: boolean;
}

function assertPromoSeedAllowed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("promo seed refused: NODE_ENV=production");
  }
  const url = process.env.DATABASE_URL ?? "";
  if (/vercel\.app/i.test(url) && process.env.PROMO_SEED_ALLOW_REMOTE !== "1") {
    throw new Error(
      "promo seed refused: DATABASE_URL looks like a remote host. Set PROMO_SEED_ALLOW_REMOTE=1 to override.",
    );
  }
}

async function findAdminUser(db: Database) {
  const emails = bootstrapAdminEmails();
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    const [row] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (row) return row;
  }
  throw new Error(
    "No bootstrap admin user in database. Run npm run db:seed first.",
  );
}

async function clearPromoEntities(db: Database) {
  const promoClients = await db
    .select({ id: clients.id })
    .from(clients)
    .where(inArray(clients.name, [...PROMO_CLIENT_NAMES]));
  const clientIds = promoClients.map((c) => c.id);
  if (clientIds.length === 0) return;

  const promoInvoices = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(inArray(invoices.number, Object.values(PROMO_NUMBERS).filter((n) => n.startsWith("DD"))));
  const invoiceIds = promoInvoices.map((i) => i.id);

  const promoQuotes = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(eq(quotes.number, PROMO_NUMBERS.quote));
  const quoteIds = promoQuotes.map((q) => q.id);

  const promoOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.number, PROMO_NUMBERS.order));
  const orderIds = promoOrders.map((o) => o.id);

  const promoExpenses = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(
      sql`${expenses.description} like '[PROMO]%'`,
    );

  if (promoExpenses.length) {
    const expenseIds = promoExpenses.map((e) => e.id);
    await db
      .delete(reimbursementItems)
      .where(inArray(reimbursementItems.expenseId, expenseIds));
    await db.delete(expenses).where(inArray(expenses.id, expenseIds));
  }

  if (invoiceIds.length) {
    await db.delete(payments).where(inArray(payments.invoiceId, invoiceIds));
    await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invoiceIds));
    await db.delete(invoices).where(inArray(invoices.id, invoiceIds));
  }

  if (quoteIds.length) {
    await db.delete(quoteLineItems).where(inArray(quoteLineItems.quoteId, quoteIds));
    await db.delete(quoteVersions).where(inArray(quoteVersions.quoteId, quoteIds));
    await db.delete(quotes).where(inArray(quotes.id, quoteIds));
  }

  if (orderIds.length) {
    await db.delete(orderLineItems).where(inArray(orderLineItems.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }

  await db.delete(inboundEmailJobs).where(
    sql`${inboundEmailJobs.resendEmailId} like 'promo-%'`,
  );

  await db
    .delete(bankTransactions)
    .where(sql`${bankTransactions.externalId} like 'promo-%'`);

  if (clientIds.length) {
    await db.delete(clients).where(inArray(clients.id, clientIds));
  }
}

export async function seedPromoDemo(
  db: Database,
  opts?: { force?: boolean },
): Promise<PromoSeedResult> {
  assertPromoSeedAllowed();

  let cleared = false;
  if (opts?.force !== false) {
    await clearPromoEntities(db);
    cleared = true;
  }

  const admin = await findAdminUser(db);

  const [primary] = await db
    .select({ id: companies.id })
    .from(companies)
    .orderBy(asc(companies.createdAt))
    .limit(1);
  const companyId = admin.companyId ?? primary?.id;
  if (!companyId) {
    throw new Error("No company in database. Run migrations / seed a company first.");
  }

  const [harbor, northbridge, meridian] = await db
    .insert(clients)
    .values([
      {
        companyId,
        name: "Harbor Digital Ltd",
        companyName: "Harbor Digital Ltd",
        email: "finance@harbor-digital.example",
        addressLines: "Studio 4\n15 Paternoster Row\nSheffield S1 2BX",
        notes: "[PROMO] Fictional client for demo video.",
      },
      {
        companyId,
        name: "Northbridge Studio Ltd",
        companyName: "Northbridge Studio Ltd",
        email: "hello@northbridge-studio.example",
        addressLines: "12 Bridge Street\nLeeds LS1 4DY",
        notes: "[PROMO] Fictional client.",
      },
      {
        companyId,
        name: "Meridian Agency Ltd",
        companyName: "Meridian Agency Ltd",
        email: "accounts@meridian-agency.example",
        addressLines: "Unit 8\nMedia City\nManchester M50 2EQ",
        notes: "[PROMO] Fictional client.",
      },
    ])
    .returning();

  const quoteLines = [
    {
      description: "Discovery & UX workshop",
      quantity: 2,
      unitPricePence: 75_000,
      vatRate: 0,
      position: 0,
    },
    {
      description: "Prototype build (fixed)",
      quantity: 1,
      unitPricePence: 120_000,
      vatRate: 0,
      position: 1,
    },
  ];
  const quoteNet = 270_000;
  const quoteGross = 270_000;

  const [order] = await db
    .insert(orders)
    .values({
      companyId,
      number: PROMO_NUMBERS.order,
      clientId: harbor.id,
      status: "active",
      issueDate: "2026-07-01",
      notes: "[PROMO] Order from accepted quote.",
      netPence: quoteNet,
      vatPence: 0,
      grossPence: quoteGross,
      createdByUserId: admin.id,
    })
    .returning();

  await db.insert(orderLineItems).values(
    quoteLines.map((l) => ({
      orderId: order.id,
      description: l.description,
      quantity: l.quantity,
      unitPricePence: l.unitPricePence,
      vatRate: l.vatRate,
      position: l.position,
    })),
  );

  const [quote] = await db
    .insert(quotes)
    .values({
      companyId,
      number: PROMO_NUMBERS.quote,
      clientId: harbor.id,
      status: "accepted",
      version: 1,
      issueDate: "2026-06-15",
      validUntil: "2026-07-15",
      notes: "Payment: 40% on acceptance, 60% on delivery.",
      netPence: quoteNet,
      vatPence: 0,
      grossPence: quoteGross,
      orderId: order.id,
      acceptedAt: new Date("2026-06-20T10:00:00Z"),
      createdByUserId: admin.id,
    })
    .returning();

  await db.insert(quoteLineItems).values(
    quoteLines.map((l) => ({
      quoteId: quote.id,
      description: l.description,
      quantity: l.quantity,
      unitPricePence: l.unitPricePence,
      vatRate: l.vatRate,
      position: l.position,
    })),
  );

  await db.insert(quoteVersions).values({
    quoteId: quote.id,
    version: 1,
    clientId: harbor.id,
    issueDate: "2026-06-15",
    validUntil: "2026-07-15",
    notes: "Payment: 40% on acceptance, 60% on delivery.",
    netPence: quoteNet,
    vatPence: 0,
    grossPence: quoteGross,
    lines: quoteLines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPricePence: l.unitPricePence,
      vatRate: l.vatRate,
      position: l.position,
    })),
    source: "create",
    createdByUserId: admin.id,
  });

  const [invoiceSent] = await db
    .insert(invoices)
    .values({
      companyId,
      number: PROMO_NUMBERS.invoiceSent,
      clientId: harbor.id,
      orderId: order.id,
      status: "sent",
      issueDate: "2026-07-05",
      dueDate: "2026-07-19",
      notes: "[PROMO] Deposit invoice.",
      netPence: 108_000,
      vatPence: 0,
      grossPence: 108_000,
      sentAt: new Date("2026-07-05T09:00:00Z"),
      createdByUserId: admin.id,
    })
    .returning();

  await db.insert(invoiceLineItems).values({
    invoiceId: invoiceSent.id,
    description: "Deposit (40%) — Discovery & prototype",
    quantity: 1,
    unitPricePence: 108_000,
    vatRate: 0,
    position: 0,
  });

  const [invoicePaid] = await db
    .insert(invoices)
    .values({
      companyId,
      number: PROMO_NUMBERS.invoicePaid,
      clientId: northbridge.id,
      status: "paid",
      issueDate: "2026-05-01",
      dueDate: "2026-05-15",
      netPence: 45_000,
      vatPence: 0,
      grossPence: 45_000,
      sentAt: new Date("2026-05-01T09:00:00Z"),
      paidAt: new Date("2026-05-10T14:00:00Z"),
      createdByUserId: admin.id,
    })
    .returning();

  await db.insert(invoiceLineItems).values({
    invoiceId: invoicePaid.id,
    description: "Brand refresh — phase 1",
    quantity: 1,
    unitPricePence: 45_000,
    vatRate: 0,
    position: 0,
  });

  await db.insert(payments).values({
    invoiceId: invoicePaid.id,
    amountPence: 45_000,
    method: "Bank transfer",
    reference: "NB-MAY-2026",
    receivedAt: new Date("2026-05-10T14:00:00Z"),
  });

  const [invoiceOverdue] = await db
    .insert(invoices)
    .values({
      companyId,
      number: PROMO_NUMBERS.invoiceOverdue,
      clientId: meridian.id,
      status: "sent",
      issueDate: "2026-06-01",
      dueDate: "2026-06-15",
      netPence: 32_000,
      vatPence: 0,
      grossPence: 32_000,
      sentAt: new Date("2026-06-01T09:00:00Z"),
      createdByUserId: admin.id,
    })
    .returning();

  await db.insert(invoiceLineItems).values({
    invoiceId: invoiceOverdue.id,
    description: "Retainer — June 2026",
    quantity: 1,
    unitPricePence: 32_000,
    vatRate: 0,
    position: 0,
  });

  const [expensePending] = await db
    .insert(expenses)
    .values({
      companyId,
      description: "[PROMO] Client lunch — Harbor Digital kick-off",
      category: "Meals",
      spentAt: "2026-07-03",
      amountPence: 4_850,
      vatPence: 0,
      status: "pending",
      source: "email",
      billable: true,
      billableClientId: harbor.id,
      paidByUserId: admin.id,
      createdByUserId: admin.id,
    })
    .returning();

  await db.insert(inboundEmailJobs).values({
    companyId,
    resendEmailId: "promo-email-receipt-001",
    fromEmail: "founder@studio.example",
    toEmail: "expenses@dotanddashconsulting.com",
    subject: "Receipt — Harbor kick-off lunch",
    status: "processed",
    expenseId: expensePending.id,
    processedAt: new Date("2026-07-04T08:30:00Z"),
  });

  const [expenseReimbursable] = await db
    .insert(expenses)
    .values({
      companyId,
      description: "[PROMO] Train to client workshop — Leeds",
      category: "Travel",
      spentAt: "2026-07-08",
      amountPence: 8_420,
      vatPence: 0,
      status: "reimbursable",
      source: "manual",
      paidByUserId: admin.id,
      createdByUserId: admin.id,
    })
    .returning();

  const [reimbursement] = await db
    .insert(reimbursements)
    .values({
      companyId,
      payeeUserId: admin.id,
      status: "pending",
      totalPence: 8_420,
      reference: "PROMO-JUL-2026",
    })
    .returning();

  await db.insert(reimbursementItems).values({
    reimbursementId: reimbursement.id,
    expenseId: expenseReimbursable.id,
  });

  let [bankAccount] = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.companyId, companyId))
    .limit(1);
  if (!bankAccount) {
    [bankAccount] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Starling Business", provider: "starling" })
      .returning();
  }

  await db.insert(bankTransactions).values([
    {
      bankAccountId: bankAccount.id,
      externalId: "promo-tx-harbor-payment",
      bookedAt: "2026-07-12",
      amountPence: 108_000,
      counterparty: "Harbor Digital Ltd",
      reference: "DD20269001 deposit",
      description: "Faster payment in",
    },
    {
      bankAccountId: bankAccount.id,
      externalId: "promo-tx-software",
      bookedAt: "2026-07-09",
      amountPence: -2_400,
      counterparty: "Figma",
      reference: "FIGMA PRO",
      description: "Card payment",
      spendingCategory: "Software",
    },
  ]);

  return {
    routes: {
      landing: "/",
      dashboard: "/dashboard",
      quoteId: quote.id,
      quoteUrl: `/quotes/${quote.id}`,
      orderId: order.id,
      orderUrl: `/orders/${order.id}`,
      invoiceSentId: invoiceSent.id,
      invoiceSentUrl: `/invoices/${invoiceSent.id}`,
      expensePendingId: expensePending.id,
      expenseUrl: `/expenses/${expensePending.id}`,
      reimbursementId: reimbursement.id,
      reimbursementUrl: `/reimbursements/${reimbursement.id}`,
      inboundEmailUrl: "/inbound-email",
      transactionsUrl: "/transactions",
      reportsUrl: "/reports",
    },
    cleared,
  };
}
