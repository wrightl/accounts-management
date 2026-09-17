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
import type { GenericCsvMapping } from "@/lib/bank/types";

export const roleEnum = pgEnum("role", [
  "admin",
  "user",
  "accountant",
  "pending",
  "platform_admin",
]);
export const entityTypeEnum = pgEnum("entity_type", [
  "limited_company",
  "sole_trader",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "overdue",
  "void",
]);
export const expenseStatusEnum = pgEnum("expense_status", [
  "pending", // submitted by email, awaiting review
  "recorded", // logged, not yet classified
  "reimbursable", // owed back to a founder
  "reimbursed", // paid back to the founder
  "company_paid", // paid directly by the company
]);
export const expenseSourceEnum = pgEnum("expense_source", ["manual", "email"]);
export const inboundEmailJobStatusEnum = pgEnum("inbound_email_job_status", [
  "pending",
  "processed",
  "rejected",
  "failed",
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

/**
 * One row per legal entity (tenant). Replaces the old singleton
 * `company_settings` table.
 */
export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: entityTypeEnum("entity_type").notNull(),
  name: text("name").notNull(),
  legalName: text("legal_name").notNull(),
  /**
   * Stable slug for inbound expense plus-addresses
   * (`expenses+{slug}.{user}@domain`). Generated once; not renamed.
   */
  slug: text("slug").notNull().unique(),
  companyNumber: text("company_number"),
  /** Sole trader unique taxpayer reference (optional). */
  utr: text("utr"),
  vatNumber: text("vat_number"), // null: not VAT registered
  addressLines: text("address_lines"),
  email: text("email"),
  /**
   * Catalog slug from `BANK_PROVIDERS` (`starling`, `monzo`, …, `other`).
   * Null until the company picks a bank in Settings / onboarding.
   */
  bankProvider: text("bank_provider"),
  /** Invoice PDF display name; catalog label for known banks, freetext for other. */
  bankName: text("bank_name"),
  bankAccountName: text("bank_account_name"),
  sortCode: text("sort_code"),
  accountNumber: text("account_number"),
  financialYearEndMonth: integer("financial_year_end_month").notNull().default(3),
  logoUrl: text("logo_url"),
  /** Invoice number prefix, e.g. "DD" → DD-2026-0001. */
  invoiceNumberPrefix: text("invoice_number_prefix").notNull().default("DD"),
  /** Quote number prefix, e.g. "Q" → Q-2026-0001. */
  quoteNumberPrefix: text("quote_number_prefix").notNull().default("Q"),
  /** Order number prefix, e.g. "O" → O-2026-0001. */
  orderNumberPrefix: text("order_number_prefix").notNull().default("O"),
  /** Next sequence number to allocate for the current invoiceSeqYear. */
  invoiceNextSeq: integer("invoice_next_seq").notNull().default(1),
  /** Calendar year the sequence applies to; null until the first invoice. */
  invoiceSeqYear: integer("invoice_seq_year"),
  /** Next quote sequence for the current quoteSeqYear. */
  quoteNextSeq: integer("quote_next_seq").notNull().default(1),
  quoteSeqYear: integer("quote_seq_year"),
  /** Next order sequence for the current orderSeqYear. */
  orderNextSeq: integer("order_next_seq").notNull().default(1),
  orderSeqYear: integer("order_seq_year"),
  /** Default days from issue date until invoice due date. */
  invoicePaymentTermsDays: integer("invoice_payment_terms_days").notNull().default(14),
  /** Default HMRC mileage rate in pence per mile (e.g. 45 = 45p/mi). */
  defaultMileageRatePence: integer("default_mileage_rate_pence").notNull().default(45),
  /** Total issued ordinary shares (Ltd only; must match active shareholder sum). */
  totalShares: integer("total_shares"),
  /** When set, tenant writes and outbound cron for this company are blocked. */
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** @deprecated Use `companies`. Alias kept for gradual migration of imports. */
export const companySettings = companies;

/** Local mirror of Clerk users, with the app role and optional tenant.
 *  Platform operators use role `platform_admin` and have no company.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").unique(),
    email: text("email").notNull(),
    name: text("name"),
    role: roleEnum("role").notNull().default("pending"),
    /** Null until onboarding completes (self-serve) or invite claims a company. */
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "restrict",
    }),
    /**
     * Per-user inbound expense local-part tag
     * (`expenses+{companySlug}.{expenseInboundSlug}@domain`). Stable once set.
     */
    expenseInboundSlug: text("expense_inbound_slug"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_users_company").on(t.companyId),
    uniqueIndex("uniq_users_company_expense_inbound_slug")
      .on(t.companyId, t.expenseInboundSlug)
      .where(sql`${t.companyId} is not null and ${t.expenseInboundSlug} is not null`),
    check(
      "users_platform_admin_detached",
      sql`${t.role} <> 'platform_admin' or (${t.companyId} is null and ${t.expenseInboundSlug} is null)`,
    ),
  ],
);

/**
 * Per-company membership. Accountants may belong to many companies;
 * founders (admin/user) stay 1:1. `users.companyId` / `users.role` mirror
 * the currently selected membership for session tenancy.
 * `platform_admin` is a users-only role, never stored on memberships.
 */
export const companyMemberships = pgTable(
  "company_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uniq_company_memberships_user_company").on(t.userId, t.companyId),
    index("idx_company_memberships_company").on(t.companyId),
    index("idx_company_memberships_user").on(t.userId),
    check(
      "company_memberships_tenant_role",
      sql`${t.role} <> 'platform_admin'`,
    ),
  ],
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    companyName: text("company_name"),
    email: text("email"),
    addressLines: text("address_lines"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_clients_company").on(t.companyId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
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
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    paymentMilestoneId: uuid("payment_milestone_id").references(
      () => orderPaymentMilestones.id,
      { onDelete: "set null" },
    ),
    /** Blob pathname for the generated PDF (served via authorised route). */
    pdfBlobPath: text("pdf_blob_path"),
  },
  (t) => [
    uniqueIndex("uniq_invoices_company_number").on(t.companyId, t.number),
    /** One non-void invoice per payment milestone (matches drizzle/0012). */
    uniqueIndex("uniq_invoice_milestone_active")
      .on(t.paymentMilestoneId)
      .where(sql`${t.status} <> 'void' AND ${t.paymentMilestoneId} IS NOT NULL`),
    index("idx_invoices_company").on(t.companyId),
    index("idx_invoices_client").on(t.clientId),
    index("idx_invoices_status").on(t.status),
    index("idx_invoices_order").on(t.orderId),
    index("idx_invoices_payment_milestone").on(t.paymentMilestoneId),
  ],
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
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    category: text("category"),
    spentAt: date("spent_at"),
    amountPence: integer("amount_pence").notNull().default(0),
    vatPence: integer("vat_pence").notNull().default(0),
    status: expenseStatusEnum("status").notNull().default("recorded"),
    source: expenseSourceEnum("source").notNull().default("manual"),
    billable: boolean("billable").notNull().default(false),
    billableClientId: uuid("billable_client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    paidByUserId: uuid("paid_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    mileageMiles: integer("mileage_miles"),
    mileageRatePence: integer("mileage_rate_pence"),
    /**
     * Non-GBP currency detected during OCR (e.g. USD, EUR). Null when
     * unset or sterling. Used to warn on pending email review.
     */
    detectedCurrency: text("detected_currency"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_expenses_company").on(t.companyId),
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

export const reimbursements = pgTable(
  "reimbursements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    payeeUserId: uuid("payee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: reimbursementStatusEnum("status").notNull().default("pending"),
    totalPence: integer("total_pence").notNull().default(0),
    reference: text("reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("idx_reimbursements_company").on(t.companyId)],
);

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
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_audit_company").on(t.companyId),
    index("idx_audit_entity").on(t.entityType, t.entityId),
  ],
);

// --- Phase 4: bank import & reconciliation ---

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    currency: text("currency").notNull().default("GBP"),
    /**
     * Last successful generic CSV column mapping (Other bank only).
     */
    csvMapping: jsonb("csv_mapping").$type<GenericCsvMapping>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_bank_accounts_company").on(t.companyId)],
);

/** User-defined spending categories (reusable outside built-in Starling labels). */
export const bankSpendingCategories = pgTable(
  "bank_spending_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uniq_bank_spending_category_company_name").on(
      t.companyId,
      sql`lower(${t.name})`,
    ),
  ],
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
  "reimbursement",
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
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    expenseId: uuid("expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
    reimbursementId: uuid("reimbursement_id").references(() => reimbursements.id, {
      onDelete: "set null",
    }),
    confirmed: boolean("confirmed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_recon_tx").on(t.bankTransactionId)],
);

// --- Phase 5: dividends & shareholders ---

export const shareholders = pgTable(
  "shareholders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    shareCount: integer("share_count").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_shareholders_company").on(t.companyId)],
);

export const dividendDeclarations = pgTable(
  "dividend_declarations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    declaredAt: date("declared_at").notNull(),
    totalPence: integer("total_pence").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_dividend_declarations_company").on(t.companyId)],
);

export const dividendPayouts = pgTable(
  "dividend_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    declarationId: uuid("declaration_id")
      .notNull()
      .references(() => dividendDeclarations.id, { onDelete: "cascade" }),
    shareholderId: uuid("shareholder_id").references(() => shareholders.id, {
      onDelete: "set null",
    }),
    /** Snapshot of shareholder name at declare time (accountant export). */
    shareholderName: text("shareholder_name").notNull(),
    amountPence: integer("amount_pence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_dividend_payouts_declaration").on(t.declarationId)],
);

// --- Phase 6: quotes, orders & recurring invoices ---

export const orderStatusEnum = pgEnum("order_status", [
  "draft",
  "active",
  "completed",
  "cancelled",
]);

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
]);

export const quoteVersionSourceEnum = pgEnum("quote_version_source", [
  "create",
  "edit",
  "rollback",
]);

export const quoteDeclineReasonCategories = pgTable(
  "quote_decline_reason_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uniq_quote_decline_reason_categories_company_name").on(
      t.companyId,
      sql`lower(${t.name})`,
    ),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    quoteId: uuid("quote_id").unique(),
    status: orderStatusEnum("status").notNull().default("active"),
    issueDate: date("issue_date"),
    notes: text("notes"),
    netPence: integer("net_pence").notNull().default(0),
    vatPence: integer("vat_pence").notNull().default(0),
    grossPence: integer("gross_pence").notNull().default(0),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uniq_orders_company_number").on(t.companyId, t.number),
    index("idx_orders_company").on(t.companyId),
    index("idx_orders_client").on(t.clientId),
    index("idx_orders_status").on(t.status),
  ],
);

export const orderLineItems = pgTable(
  "order_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPricePence: integer("unit_price_pence").notNull().default(0),
    vatRate: integer("vat_rate").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("idx_order_lines_order").on(t.orderId)],
);

export const orderPaymentMilestones = pgTable(
  "order_payment_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    amountPence: integer("amount_pence"),
    percentBasisPoints: integer("percent_basis_points"),
    dueDate: date("due_date"),
    dueInDays: integer("due_in_days"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("idx_order_milestones_order").on(t.orderId)],
);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
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
    orderId: uuid("order_id")
      .unique()
      .references(() => orders.id, { onDelete: "set null" }),
    declinedReasonCategory: text("declined_reason_category"),
    declinedReasonNarrative: text("declined_reason_narrative"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Blob pathname for the generated PDF (served via authorised route). */
    pdfBlobPath: text("pdf_blob_path"),
  },
  (t) => [
    uniqueIndex("uniq_quotes_company_number").on(t.companyId, t.number),
    index("idx_quotes_company").on(t.companyId),
  ],
);

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

export const quotePaymentMilestones = pgTable(
  "quote_payment_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    amountPence: integer("amount_pence"),
    percentBasisPoints: integer("percent_basis_points"),
    dueDate: date("due_date"),
    dueInDays: integer("due_in_days"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("idx_quote_milestones_quote").on(t.quoteId)],
);

export const sendJobs = pgTable(
  "send_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
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
    index("idx_send_jobs_company").on(t.companyId),
    index("idx_send_jobs_status").on(t.status),
    index("idx_send_jobs_invoice").on(t.invoiceId),
    uniqueIndex("uniq_send_jobs_pending")
      .on(t.kind, t.invoiceId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export const inboundEmailJobs = pgTable(
  "inbound_email_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    resendEmailId: text("resend_email_id").notNull().unique(),
    fromEmail: text("from_email").notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject"),
    status: inboundEmailJobStatusEnum("status").notNull().default("pending"),
    expenseId: uuid("expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_inbound_email_jobs_company").on(t.companyId),
    index("idx_inbound_email_jobs_status").on(t.status),
    index("idx_inbound_email_jobs_created").on(t.createdAt),
  ],
);

export const recurringInvoices = pgTable(
  "recurring_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
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
  },
  (t) => [index("idx_recurring_invoices_company").on(t.companyId)],
);

/** Singleton platform knobs (id = 1). Secrets stay in env. */
export const platformSettings = pgTable("platform_settings", {
  id: integer("id").primaryKey(),
  maintenanceBanner: text("maintenance_banner"),
  recurringInvoicesEnabled: boolean("recurring_invoices_enabled")
    .notNull()
    .default(false),
  /** Platform-wide receipt OCR provider: "local" (Tesseract) or "ai_gateway". */
  defaultReceiptOcrProvider: text("default_receipt_ocr_provider")
    .notNull()
    .default("local"),
  /** Platform-wide AI Gateway model when provider is "ai_gateway". */
  defaultReceiptOcrModel: text("default_receipt_ocr_model")
    .notNull()
    .default("google/gemini-2.5-flash"),
  lastCronDailyAt: timestamp("last_cron_daily_at", { withTimezone: true }),
  lastCronInboundAt: timestamp("last_cron_inbound_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Persisted app-level errors/warnings for the platform portal. */
export const platformLogs = pgTable(
  "platform_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    level: text("level").notNull(),
    source: text("source").notNull(),
    message: text("message").notNull(),
    digest: text("digest"),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_platform_logs_level_created").on(t.level, t.createdAt),
    index("idx_platform_logs_source").on(t.source),
    index("idx_platform_logs_created").on(t.createdAt),
  ],
);

/** Append-only support notes visible only in the platform portal. */
export const companySupportNotes = pgTable(
  "company_support_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_company_support_notes_company").on(t.companyId)],
);

export type EntityType = (typeof entityTypeEnum.enumValues)[number];
export type Company = typeof companies.$inferSelect;
export type PlatformSettings = typeof platformSettings.$inferSelect;
export type PlatformLogLevel = "error" | "warn" | "info";

export const schema = {
  users,
  companies,
  companySettings,
  companyMemberships,
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
  shareholders,
  dividendDeclarations,
  dividendPayouts,
  quotes,
  quoteLineItems,
  quotePaymentMilestones,
  quoteDeclineReasonCategories,
  quoteVersions,
  orders,
  orderLineItems,
  orderPaymentMilestones,
  recurringInvoices,
  sendJobs,
  inboundEmailJobs,
  platformSettings,
  platformLogs,
  companySupportNotes,
};
