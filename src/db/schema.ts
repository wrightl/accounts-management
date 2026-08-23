import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "user", "accountant", "pending"]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "overdue",
  "void",
]);
export const expenseStatusEnum = pgEnum("expense_status", [
  "recorded", // logged, not yet classified
  "reimbursable", // owed back to a founder
  "reimbursed", // paid back to the founder
  "company_paid", // paid directly by the company
]);
export const reimbursementStatusEnum = pgEnum("reimbursement_status", [
  "pending",
  "paid",
]);
export const sendJobKindEnum = pgEnum("send_job_kind", [
  "invoice_send",
  "invoice_remind",
]);
export const sendJobStatusEnum = pgEnum("send_job_status", [
  "pending",
  "sent",
  "failed",
]);

/** Local mirror of Clerk users, with the app role. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").unique(),
  email: text("email").notNull(),
  name: text("name"),
  role: roleEnum("role").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Single-row company profile / settings. */
export const companySettings = pgTable(
  "company_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().default("Dot + Dash Consulting"),
    legalName: text("legal_name").notNull().default("Dot and Dash Consulting Ltd"),
    companyNumber: text("company_number"),
    vatNumber: text("vat_number"), // null: not VAT registered
    addressLines: text("address_lines"),
    bankName: text("bank_name").notNull().default("Starling"),
    bankAccountName: text("bank_account_name"),
    sortCode: text("sort_code"),
    accountNumber: text("account_number"),
    financialYearEndMonth: integer("financial_year_end_month").notNull().default(3),
    logoUrl: text("logo_url"),
    /** Invoice number prefix, e.g. "DD" → DD-2026-0001. */
    invoiceNumberPrefix: text("invoice_number_prefix").notNull().default("DD"),
    /** Quote number prefix, e.g. "Q" → Q-2026-0001. */
    quoteNumberPrefix: text("quote_number_prefix").notNull().default("Q"),
    /** Next sequence number to allocate for the current invoiceSeqYear. */
    invoiceNextSeq: integer("invoice_next_seq").notNull().default(1),
    /** Calendar year the sequence applies to; null until the first invoice. */
    invoiceSeqYear: integer("invoice_seq_year"),
    /** Next quote sequence for the current quoteSeqYear. */
    quoteNextSeq: integer("quote_next_seq").notNull().default(1),
    quoteSeqYear: integer("quote_seq_year"),
    /** Always true — unique so this table can only hold one row. */
    singleton: boolean("singleton").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("company_settings_singleton").on(t.singleton),
    check("company_settings_singleton_true", sql`${t.singleton} = true`),
  ],
);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  addressLines: text("address_lines"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    currency: text("currency").notNull().default("GBP"),
    issueDate: date("issue_date"),
    dueDate: date("due_date"),
    notes: text("notes"),
    netPence: integer("net_pence").notNull().default(0),
    vatPence: integer("vat_pence").notNull().default(0),
    grossPence: integer("gross_pence").notNull().default(0),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Blob pathname for the generated PDF (served via authorised route). */
    pdfBlobPath: text("pdf_blob_path"),
  },
  (t) => [index("idx_invoices_client").on(t.clientId), index("idx_invoices_status").on(t.status)],
);

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPricePence: integer("unit_price_pence").notNull().default(0),
    vatRate: integer("vat_rate").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("idx_line_items_invoice").on(t.invoiceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amountPence: integer("amount_pence").notNull(),
    method: text("method"),
    reference: text("reference"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_payments_invoice").on(t.invoiceId)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    description: text("description").notNull(),
    category: text("category"),
    spentAt: date("spent_at"),
    amountPence: integer("amount_pence").notNull().default(0),
    vatPence: integer("vat_pence").notNull().default(0),
    status: expenseStatusEnum("status").notNull().default("recorded"),
    billable: boolean("billable").notNull().default(false),
    billableClientId: uuid("billable_client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    paidByUserId: uuid("paid_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_expenses_status").on(t.status),
    index("idx_expenses_paid_by").on(t.paidByUserId),
    check(
      "expenses_category_known",
      sql`${t.category} is null or ${t.category} in (
        'Travel', 'Meals', 'Software', 'Office', 'Marketing',
        'Professional fees', 'Equipment', 'Training', 'Other'
      )`,
    ),
  ],
);

export const expenseReceipts = pgTable(
  "expense_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    // Blob pathname (NOT a public URL) — served via an authorised route.
    blobPath: text("blob_path").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_receipts_expense").on(t.expenseId)],
);

export const reimbursements = pgTable("reimbursements", {
  id: uuid("id").primaryKey().defaultRandom(),
  payeeUserId: uuid("payee_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  status: reimbursementStatusEnum("status").notNull().default("pending"),
  totalPence: integer("total_pence").notNull().default(0),
  reference: text("reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const reimbursementItems = pgTable(
  "reimbursement_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reimbursementId: uuid("reimbursement_id")
      .notNull()
      .references(() => reimbursements.id, { onDelete: "cascade" }),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("idx_reimb_items_reimb").on(t.reimbursementId),
    uniqueIndex("uniq_reimb_items_expense").on(t.expenseId),
  ],
);

/** Append-only audit trail of sensitive actions. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_audit_entity").on(t.entityType, t.entityId)],
);

// --- Phase 4: bank import & reconciliation ---

export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default("Starling Business"),
  provider: text("provider").notNull().default("starling"),
  currency: text("currency").notNull().default("GBP"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** User-defined spending categories (reusable outside built-in Starling labels). */
export const bankSpendingCategories = pgTable(
  "bank_spending_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uniq_bank_spending_category_name").on(sql`lower(${t.name})`)],
);

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    /** Stable dedupe key from import (e.g. hash of date+amount+reference). */
    externalId: text("external_id").notNull(),
    bookedAt: date("booked_at").notNull(),
    amountPence: integer("amount_pence").notNull(),
    counterparty: text("counterparty"),
    reference: text("reference"),
    description: text("description"),
    spendingCategory: text("spending_category"),
    tags: text("tags").array().notNull().default([]),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_bank_tx_account").on(t.bankAccountId),
    index("idx_bank_tx_booked").on(t.bookedAt),
    uniqueIndex("uniq_bank_tx_external").on(t.bankAccountId, t.externalId),
  ],
);

export const reconciliationMatchTypeEnum = pgEnum("reconciliation_match_type", [
  "invoice_payment",
  "expense",
]);

export const reconciliationMatches = pgTable(
  "reconciliation_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bankTransactionId: uuid("bank_transaction_id")
      .notNull()
      .references(() => bankTransactions.id, { onDelete: "cascade" }),
    matchType: reconciliationMatchTypeEnum("match_type").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    expenseId: uuid("expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
    confirmed: boolean("confirmed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_recon_tx").on(t.bankTransactionId)],
);

// --- Phase 5: dividends ---

export const dividends = pgTable("dividends", {
  id: uuid("id").primaryKey().defaultRandom(),
  declaredAt: date("declared_at").notNull(),
  shareholderName: text("shareholder_name").notNull(),
  amountPence: integer("amount_pence").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Phase 6: quotes & recurring invoices ---

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
  "converted",
]);

export const quoteVersionSourceEnum = pgEnum("quote_version_source", [
  "create",
  "edit",
  "rollback",
]);

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  status: quoteStatusEnum("status").notNull().default("draft"),
  /** Monotonic revision number; incremented on each edit or rollback. */
  version: integer("version").notNull().default(1),
  issueDate: date("issue_date"),
  validUntil: date("valid_until"),
  notes: text("notes"),
  netPence: integer("net_pence").notNull().default(0),
  vatPence: integer("vat_pence").notNull().default(0),
  grossPence: integer("gross_pence").notNull().default(0),
  convertedInvoiceId: uuid("converted_invoice_id").references(() => invoices.id, {
    onDelete: "set null",
  }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  /** Blob pathname for the generated PDF (served via authorised route). */
  pdfBlobPath: text("pdf_blob_path"),
});

export const quoteVersions = pgTable(
  "quote_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    clientId: uuid("client_id").notNull(),
    issueDate: date("issue_date"),
    validUntil: date("valid_until"),
    notes: text("notes"),
    netPence: integer("net_pence").notNull().default(0),
    vatPence: integer("vat_pence").notNull().default(0),
    grossPence: integer("gross_pence").notNull().default(0),
    /** [{ description, quantity, unitPricePence, vatRate, position }] */
    lines: jsonb("lines").notNull(),
    source: quoteVersionSourceEnum("source").notNull(),
    rolledBackFromVersion: integer("rolled_back_from_version"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uniq_quote_versions_quote_version").on(t.quoteId, t.version),
    index("idx_quote_versions_quote").on(t.quoteId),
  ],
);

export const quoteLineItems = pgTable(
  "quote_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPricePence: integer("unit_price_pence").notNull().default(0),
    vatRate: integer("vat_rate").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("idx_quote_lines_quote").on(t.quoteId)],
);

export const sendJobs = pgTable(
  "send_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: sendJobKindEnum("kind").notNull(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    status: sendJobStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_send_jobs_status").on(t.status),
    index("idx_send_jobs_invoice").on(t.invoiceId),
    uniqueIndex("uniq_send_jobs_pending")
      .on(t.kind, t.invoiceId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export const recurringInvoices = pgTable("recurring_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  /** JSON line template: [{description, quantity, unitPricePence}] */
  lineTemplate: jsonb("line_template").notNull(),
  notes: text("notes"),
  /** Day of month to generate (1–28). */
  dayOfMonth: integer("day_of_month").notNull().default(1),
  enabled: boolean("enabled").notNull().default(false),
  lastGeneratedAt: timestamp("last_generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const schema = {
  users,
  companySettings,
  clients,
  invoices,
  invoiceLineItems,
  payments,
  expenses,
  expenseReceipts,
  reimbursements,
  reimbursementItems,
  auditLog,
  bankAccounts,
  bankSpendingCategories,
  bankTransactions,
  reconciliationMatches,
  dividends,
  quotes,
  quoteLineItems,
  quoteVersions,
  recurringInvoices,
  sendJobs,
};
