/**
 * Backfill of tax codes onto rows saved before tax codes existed (roadmap item
 * 17, PR 2). Used by data migration 0005 and by `scripts/tax-code-dry-run.ts`.
 *
 * Only `tax_code` and `tax_code_needs_review` are written. Rates and amounts
 * are never touched, so every report, return and locked period keeps its
 * figures. Rows that already have a code are left alone, so it is safe to run
 * again, for example on rows saved between this deploy and PR 3.
 *
 * Every statement is scoped to one company, as the tenant-scope rule requires.
 */
import { and, count, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db";
import {
  companies,
  creditNoteLineItems,
  creditNotes,
  expenses,
  invoiceLineItems,
  invoices,
  orderLineItems,
  orders,
  quoteLineItems,
  quotes,
  quoteVersions,
  recurringInvoices,
} from "@/db/schema";
import { rowOfCompany } from "@/lib/tenant-scope";
import {
  inferExpenseTaxCode,
  inferTaxCodeFromRate,
  isTaxCode,
  type InferredTaxCode,
  type TaxCode,
} from "@/lib/tax-codes";

export const BACKFILL_TABLES = [
  "invoice_line_items",
  "credit_note_line_items",
  "quote_line_items",
  "order_line_items",
  "expenses",
  "quote_versions",
  "recurring_invoices",
] as const;

export type BackfillTable = (typeof BACKFILL_TABLES)[number];

/** Rows (or, for JSON line lists, lines) that will get one tax code. */
export interface BackfillGroup {
  table: BackfillTable;
  vatRate: number;
  /** Expenses only. */
  category?: string | null;
  /** Expenses only: the currency paid in, null for sterling. */
  currency?: string | null;
  rows: number;
  taxCode: TaxCode;
  needsReview: boolean;
}

export interface CompanyBackfillPlan {
  companyId: string;
  companyName: string;
  vatRegistered: boolean;
  /** The company default to set, or null when it stays unset. */
  defaultTaxCode: TaxCode | null;
  /** The default rate isn't a UK rate, so the default code is left unset. */
  defaultNeedsReview: boolean;
  groups: BackfillGroup[];
}

type Company = { id: string; name: string; vatRegistered: boolean; defaultVatRate: number; defaultTaxCode: TaxCode | null };

interface JsonLine {
  vatRate?: unknown;
  taxCode?: unknown;
  taxCodeNeedsReview?: unknown;
  [key: string]: unknown;
}

function lineRate(line: JsonLine): number {
  return typeof line.vatRate === "number" ? line.vatRate : Number(line.vatRate ?? 0);
}

/** JSON line lists with a code added to each line that has none. Null when nothing changes. */
function withTaxCodes(lines: unknown, company: Company): JsonLine[] | null {
  if (!Array.isArray(lines)) return null;
  let changed = false;
  const next = lines.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") return raw as JsonLine;
    const line = raw as JsonLine;
    if (isTaxCode(line.taxCode)) return line;
    changed = true;
    const inferred = inferTaxCodeFromRate(lineRate(line), company);
    return { ...line, taxCode: inferred.code, taxCodeNeedsReview: inferred.needsReview };
  });
  return changed ? next : null;
}

function countJsonLines(lists: unknown[], company: Company, table: BackfillTable): BackfillGroup[] {
  const groups = new Map<string, BackfillGroup>();
  for (const lines of lists) {
    if (!Array.isArray(lines)) continue;
    for (const raw of lines) {
      if (!raw || typeof raw !== "object" || isTaxCode((raw as JsonLine).taxCode)) continue;
      const rate = lineRate(raw as JsonLine);
      const inferred = inferTaxCodeFromRate(rate, company);
      const key = `${rate}`;
      const group = groups.get(key) ?? { table, vatRate: rate, rows: 0, ...toGroup(inferred) };
      group.rows += 1;
      groups.set(key, group);
    }
  }
  return [...groups.values()];
}

function toGroup(inferred: InferredTaxCode) {
  return { taxCode: inferred.code, needsReview: inferred.needsReview };
}

const sameValue = (column: SQL | Parameters<typeof eq>[0], value: string | null) =>
  sql`${column} is not distinct from ${value}`;

async function lineGroups(db: Database, company: Company): Promise<BackfillGroup[]> {
  const companyId = company.id;
  const results: { table: BackfillTable; rows: { vatRate: number; rows: number }[] }[] = [
    {
      table: "invoice_line_items",
      rows: await db
        .select({ vatRate: invoiceLineItems.vatRate, rows: count() })
        .from(invoiceLineItems)
        .where(
          and(
            isNull(invoiceLineItems.taxCode),
            rowOfCompany(invoiceLineItems.invoiceId, invoices, companyId),
          ),
        )
        .groupBy(invoiceLineItems.vatRate),
    },
    {
      table: "credit_note_line_items",
      rows: await db
        .select({ vatRate: creditNoteLineItems.vatRate, rows: count() })
        .from(creditNoteLineItems)
        .where(
          and(
            isNull(creditNoteLineItems.taxCode),
            rowOfCompany(creditNoteLineItems.creditNoteId, creditNotes, companyId),
          ),
        )
        .groupBy(creditNoteLineItems.vatRate),
    },
    {
      table: "quote_line_items",
      rows: await db
        .select({ vatRate: quoteLineItems.vatRate, rows: count() })
        .from(quoteLineItems)
        .where(
          and(isNull(quoteLineItems.taxCode), rowOfCompany(quoteLineItems.quoteId, quotes, companyId)),
        )
        .groupBy(quoteLineItems.vatRate),
    },
    {
      table: "order_line_items",
      rows: await db
        .select({ vatRate: orderLineItems.vatRate, rows: count() })
        .from(orderLineItems)
        .where(
          and(isNull(orderLineItems.taxCode), rowOfCompany(orderLineItems.orderId, orders, companyId)),
        )
        .groupBy(orderLineItems.vatRate),
    },
  ];
  return results.flatMap(({ table, rows }) =>
    rows.map((r) => ({
      table,
      vatRate: r.vatRate,
      rows: r.rows,
      ...toGroup(inferTaxCodeFromRate(r.vatRate, company)),
    })),
  );
}

async function expenseGroups(db: Database, company: Company): Promise<BackfillGroup[]> {
  const rows = await db
    .select({
      vatRate: expenses.vatRate,
      category: expenses.category,
      currency: expenses.detectedCurrency,
      rows: count(),
    })
    .from(expenses)
    .where(and(eq(expenses.companyId, company.id), isNull(expenses.taxCode)))
    .groupBy(expenses.vatRate, expenses.category, expenses.detectedCurrency);
  return rows.map((r) => ({
    table: "expenses" as const,
    vatRate: r.vatRate,
    category: r.category,
    currency: r.currency,
    rows: r.rows,
    ...toGroup(inferExpenseTaxCode(r, company)),
  }));
}

async function jsonGroups(db: Database, company: Company): Promise<BackfillGroup[]> {
  const companyId = company.id;
  const versions = await db
    .select({ lines: quoteVersions.lines })
    .from(quoteVersions)
    .where(rowOfCompany(quoteVersions.quoteId, quotes, companyId));
  const templates = await db
    .select({ lines: recurringInvoices.lineTemplate })
    .from(recurringInvoices)
    .where(eq(recurringInvoices.companyId, companyId));
  return [
    ...countJsonLines(
      versions.map((v) => v.lines),
      company,
      "quote_versions",
    ),
    ...countJsonLines(
      templates.map((t) => t.lines),
      company,
      "recurring_invoices",
    ),
  ];
}

async function companiesToBackfill(db: Database, companyId?: string): Promise<Company[]> {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      vatRegistered: companies.vatRegistered,
      defaultVatRate: companies.defaultVatRate,
      defaultTaxCode: companies.defaultTaxCode,
    })
    .from(companies)
    .where(companyId ? eq(companies.id, companyId) : undefined)
    .orderBy(companies.name);
  return rows;
}

function defaultFor(company: Company): { code: TaxCode | null; needsReview: boolean } {
  if (company.defaultTaxCode) return { code: company.defaultTaxCode, needsReview: false };
  if (!company.vatRegistered) return { code: null, needsReview: false };
  const inferred = inferTaxCodeFromRate(company.defaultVatRate, company);
  return inferred.needsReview
    ? { code: null, needsReview: true }
    : { code: inferred.code, needsReview: false };
}

async function planFor(db: Database, company: Company): Promise<CompanyBackfillPlan> {
  const defaults = defaultFor(company);
  return {
    companyId: company.id,
    companyName: company.name,
    vatRegistered: company.vatRegistered,
    defaultTaxCode: defaults.code,
    defaultNeedsReview: defaults.needsReview,
    groups: [
      ...(await lineGroups(db, company)),
      ...(await expenseGroups(db, company)),
      ...(await jsonGroups(db, company)),
    ],
  };
}

/** What the backfill would write, per company. Reads only. */
export async function planTaxCodeBackfill(
  db: Database,
  options: { companyId?: string } = {},
): Promise<CompanyBackfillPlan[]> {
  const plans: CompanyBackfillPlan[] = [];
  for (const company of await companiesToBackfill(db, options.companyId)) {
    plans.push(await planFor(db, company));
  }
  return plans;
}

async function applyLineGroup(db: Database, companyId: string, group: BackfillGroup) {
  const set = { taxCode: group.taxCode, taxCodeNeedsReview: group.needsReview };
  switch (group.table) {
    case "invoice_line_items":
      await db
        .update(invoiceLineItems)
        .set(set)
        .where(
          and(
            isNull(invoiceLineItems.taxCode),
            eq(invoiceLineItems.vatRate, group.vatRate),
            rowOfCompany(invoiceLineItems.invoiceId, invoices, companyId),
          ),
        );
      return;
    case "credit_note_line_items":
      await db
        .update(creditNoteLineItems)
        .set(set)
        .where(
          and(
            isNull(creditNoteLineItems.taxCode),
            eq(creditNoteLineItems.vatRate, group.vatRate),
            rowOfCompany(creditNoteLineItems.creditNoteId, creditNotes, companyId),
          ),
        );
      return;
    case "quote_line_items":
      await db
        .update(quoteLineItems)
        .set(set)
        .where(
          and(
            isNull(quoteLineItems.taxCode),
            eq(quoteLineItems.vatRate, group.vatRate),
            rowOfCompany(quoteLineItems.quoteId, quotes, companyId),
          ),
        );
      return;
    case "order_line_items":
      await db
        .update(orderLineItems)
        .set(set)
        .where(
          and(
            isNull(orderLineItems.taxCode),
            eq(orderLineItems.vatRate, group.vatRate),
            rowOfCompany(orderLineItems.orderId, orders, companyId),
          ),
        );
      return;
    case "expenses":
      await db
        .update(expenses)
        .set(set)
        .where(
          and(
            eq(expenses.companyId, companyId),
            isNull(expenses.taxCode),
            eq(expenses.vatRate, group.vatRate),
            sameValue(expenses.category, group.category ?? null),
            sameValue(expenses.detectedCurrency, group.currency ?? null),
          ),
        );
      return;
    case "quote_versions":
    case "recurring_invoices":
      // Rewritten row by row in applyJsonLines.
      return;
  }
}

async function applyJsonLines(db: Database, company: Company) {
  const companyId = company.id;
  const versions = await db
    .select({ id: quoteVersions.id, lines: quoteVersions.lines })
    .from(quoteVersions)
    .where(rowOfCompany(quoteVersions.quoteId, quotes, companyId));
  for (const version of versions) {
    const lines = withTaxCodes(version.lines, company);
    if (!lines) continue;
    await db
      .update(quoteVersions)
      .set({ lines })
      .where(
        and(eq(quoteVersions.id, version.id), rowOfCompany(quoteVersions.quoteId, quotes, companyId)),
      );
  }

  const templates = await db
    .select({ id: recurringInvoices.id, lines: recurringInvoices.lineTemplate })
    .from(recurringInvoices)
    .where(eq(recurringInvoices.companyId, companyId));
  for (const template of templates) {
    const lines = withTaxCodes(template.lines, company);
    if (!lines) continue;
    await db
      .update(recurringInvoices)
      .set({ lineTemplate: lines })
      .where(and(eq(recurringInvoices.id, template.id), eq(recurringInvoices.companyId, companyId)));
  }
}

/**
 * Write tax codes onto every row that has none, and set each registered
 * company's default code. Returns the plan it applied.
 */
export async function applyTaxCodeBackfill(
  db: Database,
  options: { companyId?: string } = {},
): Promise<CompanyBackfillPlan[]> {
  const plans: CompanyBackfillPlan[] = [];
  for (const company of await companiesToBackfill(db, options.companyId)) {
    const plan = await planFor(db, company);
    for (const group of plan.groups) await applyLineGroup(db, company.id, group);
    await applyJsonLines(db, company);
    if (plan.defaultTaxCode && !company.defaultTaxCode) {
      await db
        .update(companies)
        .set({ defaultTaxCode: plan.defaultTaxCode })
        .where(and(eq(companies.id, company.id), isNull(companies.defaultTaxCode)));
    }
    plans.push(plan);
  }
  return plans;
}

/** A plain-text summary of a plan, one block per company, for the dry run. */
export function formatBackfillPlan(plans: CompanyBackfillPlan[]): string {
  const out: string[] = [];
  let total = 0;
  let review = 0;
  for (const plan of plans) {
    const registered = plan.vatRegistered ? "VAT registered" : "not VAT registered";
    out.push(`${plan.companyName} (${plan.companyId}), ${registered}`);
    if (plan.defaultNeedsReview) out.push("  default tax code: left unset, default rate is not a UK rate");
    else if (plan.defaultTaxCode) out.push(`  default tax code: ${plan.defaultTaxCode}`);
    if (plan.groups.length === 0) out.push("  nothing to backfill");
    for (const g of plan.groups) {
      const extra =
        g.table === "expenses" ? ` category=${g.category ?? "none"} currency=${g.currency ?? "GBP"}` : "";
      const flag = g.needsReview ? "  NEEDS REVIEW" : "";
      out.push(`  ${g.table} rate=${g.vatRate}%${extra}: ${g.rows} -> ${g.taxCode}${flag}`);
      total += g.rows;
      if (g.needsReview) review += g.rows;
    }
  }
  out.push("");
  out.push(`${plans.length} companies, ${total} rows or lines to code, ${review} flagged for review.`);
  return out.join("\n");
}
