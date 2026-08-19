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
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "user", "accountant"]);
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

/** Local mirror of Clerk users, with the app role. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").unique(),
  email: text("email").notNull(),
  name: text("name"),
  role: roleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Single-row company profile / settings. */
export const companySettings = pgTable("company_settings", {
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
  (t) => [index("idx_expenses_status").on(t.status), index("idx_expenses_paid_by").on(t.paidByUserId)],
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
  (t) => [index("idx_reimb_items_reimb").on(t.reimbursementId)],
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
};
