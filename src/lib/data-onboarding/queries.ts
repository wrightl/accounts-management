import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, min, sum } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  companies,
  dataOnboarding,
  expenses,
  invoiceImportBatches,
  invoices,
  shareholders,
  type DataOnboardingStatus,
  type EntityType,
} from "@/db/schema";
import { financialYearStartDate, todayIsoDate, type DateFormat } from "@/lib/dates";
import { buildChecklist, type Checklist, type OnboardingFacts } from "./checklist";

export type DataOnboardingRow = typeof dataOnboarding.$inferSelect;

export async function getDataOnboardingRow(companyId: string): Promise<DataOnboardingRow | null> {
  const [row] = await getDb()
    .select()
    .from(dataOnboarding)
    .where(eq(dataOnboarding.companyId, companyId))
    .limit(1);
  return row ?? null;
}

/** Everything the checklist reads from the books, in one round of small queries. */
export async function getOnboardingFacts(
  companyId: string,
  recordsStartDate: string | null,
): Promise<OnboardingFacts> {
  const db = getDb();
  const fromStart = (column: AnyPgColumn) =>
    recordsStartDate ? gte(column, recordsStartDate) : undefined;

  const [banks, [clientRow], [invoiceRow], [beforeRow], batches, [expenseRow], [company], [shareRow]] =
    await Promise.all([
      db
        .select({ name: bankAccounts.name, firstBookedAt: min(bankTransactions.bookedAt) })
        .from(bankAccounts)
        .leftJoin(bankTransactions, eq(bankTransactions.bankAccountId, bankAccounts.id))
        .where(eq(bankAccounts.companyId, companyId))
        .groupBy(bankAccounts.id, bankAccounts.name, bankAccounts.createdAt)
        .orderBy(asc(bankAccounts.createdAt)),
      db.select({ n: count() }).from(clients).where(eq(clients.companyId, companyId)),
      db
        .select({ n: count() })
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), fromStart(invoices.issueDate))),
      recordsStartDate
        ? db
            .select({ n: count() })
            .from(invoices)
            .where(
              and(
                eq(invoices.companyId, companyId),
                eq(invoices.source, "import"),
                lt(invoices.issueDate, recordsStartDate),
              ),
            )
        : Promise.resolve([{ n: 0 }]),
      db
        .select({ id: invoiceImportBatches.id, status: invoiceImportBatches.status })
        .from(invoiceImportBatches)
        .where(
          and(
            eq(invoiceImportBatches.companyId, companyId),
            inArray(invoiceImportBatches.status, ["draft", "committed"]),
          ),
        )
        .orderBy(desc(invoiceImportBatches.createdAt)),
      db
        .select({ n: count() })
        .from(expenses)
        .where(and(eq(expenses.companyId, companyId), fromStart(expenses.spentAt))),
      db
        .select({
          openingBalancesAsAt: companies.openingBalancesAsAt,
          invoiceCutoverDate: companies.invoiceCutoverDate,
          totalShares: companies.totalShares,
          financialYearEndMonth: companies.financialYearEndMonth,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1),
      db
        .select({ total: sum(shareholders.shareCount) })
        .from(shareholders)
        .where(and(eq(shareholders.companyId, companyId), isNull(shareholders.archivedAt))),
    ]);

  return {
    bankAccounts: banks.map((b) => ({ name: b.name, firstBookedAt: b.firstBookedAt ?? null })),
    clientCount: clientRow?.n ?? 0,
    invoicesFromStart: invoiceRow?.n ?? 0,
    importedInvoicesBeforeStart: beforeRow?.n ?? 0,
    committedInvoiceBatches: batches.filter((b) => b.status === "committed").length,
    draftInvoiceBatchId: batches.find((b) => b.status === "draft")?.id ?? null,
    expensesFromStart: expenseRow?.n ?? 0,
    openingBalancesAsAt: company?.openingBalancesAsAt ?? null,
    invoiceCutoverDate: company?.invoiceCutoverDate ?? null,
    totalShares: company?.totalShares ?? null,
    activeShareSum: Number(shareRow?.total ?? 0),
    financialYearEndMonth: company?.financialYearEndMonth ?? 3,
  };
}

export interface DataOnboardingView {
  /** "not_started" when the company has no row yet. */
  status: DataOnboardingStatus | "not_started";
  recordsStartDate: string | null;
  /** Start of the current financial year, offered when no start date is chosen. */
  suggestedStartDate: string;
  checklist: Checklist;
}

export async function getDataOnboarding(
  companyId: string,
  entityType: EntityType | null,
  fmt: DateFormat,
): Promise<DataOnboardingView> {
  const row = await getDataOnboardingRow(companyId);
  const facts = await getOnboardingFacts(companyId, row?.recordsStartDate ?? null);
  return {
    status: row?.status ?? "not_started",
    recordsStartDate: row?.recordsStartDate ?? null,
    suggestedStartDate: financialYearStartDate(facts.financialYearEndMonth, todayIsoDate()),
    checklist: buildChecklist(facts, row, entityType, fmt),
  };
}
