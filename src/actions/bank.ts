"use server";

import { eq } from "drizzle-orm";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { mutate, mutateWide } from "@/lib/mutate";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { getBankFeedAdapter } from "@/lib/bank/adapters";
import { parseGenericCsvMapping, isGenericCsvMapping } from "@/lib/bank/generic-csv";
import {
  bankLabel,
  isBankProviderId,
  parseProviderFromLegacyName,
  type BankProviderId,
} from "@/lib/bank/providers";
import {
  BANK_PAGE_SIZE,
  parseBankPageSize,
  type BankListParams,
} from "@/lib/bank/list-params";
import {
  confirmMatch,
  confirmMatchesBatch,
  dismissMatch,
  dismissMatchesBatch,
  findBankTransactionsForInvoice,
  findReimbursementBankMatches,
  getOrCreateBankAccount,
  importBankRows,
  listBankTransactions,
  ReconciliationError,
  saveBankAccountCsvMapping,
  suggestMatches,
  updateTransactionCategory,
  type BankTransactionListResult,
  type InvoiceBankMatch,
  type ReimbursementBankMatch,
  type SuggestedMatch,
} from "@/lib/bank/queries";
import { deleteUnusedBankSpendingCategory } from "@/lib/bank/spending-categories";
import type { ActionResult } from "@/actions/result";

async function resolveCompanyBankProvider(
  companyId: string,
): Promise<
  | { ok: true; provider: BankProviderId; bankName: string | null }
  | { ok: false; error: string }
> {
  const db = getDb();
  const [company] = await db
    .select({
      bankProvider: companies.bankProvider,
      bankName: companies.bankName,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) {
    return { ok: false, error: "Company not found" };
  }

  let provider: BankProviderId | null = null;
  if (company.bankProvider && isBankProviderId(company.bankProvider)) {
    provider = company.bankProvider;
  } else if (company.bankName) {
    provider = parseProviderFromLegacyName(company.bankName);
  }

  if (!provider) {
    return {
      ok: false,
      error: "Choose your bank in Settings before importing a CSV.",
    };
  }

  return { ok: true, provider, bankName: company.bankName };
}

export async function loadBankTransactionsPage(input: {
  q?: string;
  type?: BankListParams["type"];
  category?: string;
  reconciliation?: BankListParams["reconciliation"];
  from?: string;
  to?: string;
  page: number;
  pageSize?: number;
}): Promise<
  | { ok: true; result: BankTransactionListResult }
  | { ok: false; error: string }
> {
  const authz = await requireActionPermission("accounts:read");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const page = Math.max(1, Math.trunc(input.page));
  const pageSize = input.pageSize ?? BANK_PAGE_SIZE;

  const result = await listBankTransactions(companyId, {
    q: input.q,
    type: input.type,
    category: input.category,
    reconciliation: input.reconciliation,
    from: input.from,
    to: input.to,
    page,
    pageSize: parseBankPageSize(String(pageSize)),
  });

  return { ok: true, result };
}

export async function getBankImportContext(): Promise<
  | {
      ok: true;
      provider: BankProviderId;
      bankLabel: string;
      savedMapping: import("@/lib/bank/types").GenericCsvMapping | null;
    }
  | { ok: false; error: string }
> {
  return mutateWide("accounts:write", async ({ companyId }) => {
    const resolved = await resolveCompanyBankProvider(companyId);
    if (!resolved.ok) return resolved;

    const account = await getOrCreateBankAccount(
      companyId,
      resolved.provider,
      resolved.bankName,
    );
    const mapping = account.csvMapping ?? null;

    return {
      ok: true,
      provider: resolved.provider,
      bankLabel:
        resolved.provider === "other"
          ? resolved.bankName?.trim() || "Other bank"
          : bankLabel(resolved.provider),
      savedMapping: mapping,
    };
  });
}

export async function importBankCsv(formData: FormData): Promise<
  ActionResult & {
    inserted?: number;
    skipped?: number;
    skippedNonGbp?: number;
    suggestions?: SuggestedMatch[];
  }
> {
  return mutateWide(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const resolved = await resolveCompanyBankProvider(companyId);
      if (!resolved.ok) return resolved;

      const file = formData.get("csv");
      if (!(file instanceof File) || file.size === 0) {
        return { ok: false, error: "Choose a CSV statement file" };
      }

      const mapping =
        resolved.provider === "other"
          ? parseGenericCsvMapping(formData.get("csvMapping"))
          : null;
      if (resolved.provider === "other" && !mapping) {
        return {
          ok: false,
          error: "Map the CSV columns for your bank before importing.",
        };
      }

      const text = await file.text();
      let rows;
      try {
        rows = getBankFeedAdapter(resolved.provider, mapping).parse(text);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Parse failed" };
      }

      const account = await getOrCreateBankAccount(
        companyId,
        resolved.provider,
        resolved.bankName,
      );
      const { inserted, skipped, skippedNonGbp } = await importBankRows(
        companyId,
        account.id,
        rows,
      );

      if (resolved.provider === "other" && mapping && isGenericCsvMapping(mapping)) {
        await saveBankAccountCsvMapping(companyId, account.id, mapping);
      }

      const suggestions = await suggestMatches(companyId);

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "bank.import",
        entityType: "bank_account",
        entityId: account.id,
        meta: {
          provider: resolved.provider,
          inserted,
          skipped,
          skippedNonGbp,
          suggested: suggestions.length,
        },
      });

      return {
        ok: true,
        id: account.id,
        inserted,
        skipped,
        skippedNonGbp,
        suggestions,
      };
    },
    { paths: ["/transactions"] },
  );
}

/** @deprecated Use importBankCsv. */
export async function importStarlingCsv(formData: FormData) {
  return importBankCsv(formData);
}

export async function runSuggestMatches(): Promise<
  ActionResult & { suggestions?: SuggestedMatch[] }
> {
  return mutateWide(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const suggestions = await suggestMatches(companyId);
      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "bank.suggest",
        meta: { count: suggestions.length },
      });
      return { ok: true, suggestions };
    },
    { paths: ["/transactions"] },
  );
}

export async function confirmBankMatch(matchId: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async () => {
      try {
        await confirmMatch(matchId);
      } catch (e) {
        if (e instanceof ReconciliationError) return { ok: false, error: e.message };
        throw e;
      }
      return { ok: true, id: matchId };
    },
    {
      audit: {
        action: "bank.confirm_match",
        entityType: "reconciliation_match",
        entityId: matchId,
      },
      paths: ["/transactions", "/invoices", "/reimbursements", "/expenses"],
    },
  );
}

export async function findReimbursementBankMatchesAction(
  reimbursementId: string,
): Promise<
  | { ok: true; matches: ReimbursementBankMatch[] }
  | { ok: false; error: string }
> {
  const authz = await requireActionPermission("accounts:read");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const matches = await findReimbursementBankMatches(companyId, reimbursementId);
  return { ok: true, matches };
}

export async function confirmBankMatchesBatch(matchIds: string[]): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      try {
        await confirmMatchesBatch(matchIds);
      } catch (e) {
        if (e instanceof ReconciliationError) return { ok: false, error: e.message };
        throw e;
      }
      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "bank.confirm_match_batch",
        meta: { count: matchIds.length },
      });
      return { ok: true };
    },
    { paths: ["/transactions", "/invoices", "/reimbursements", "/expenses"] },
  );
}

export async function dismissBankMatch(matchId: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async () => {
      await dismissMatch(matchId);
      return { ok: true, id: matchId };
    },
    {
      audit: {
        action: "bank.dismiss_match",
        entityType: "reconciliation_match",
        entityId: matchId,
      },
      paths: ["/transactions"],
    },
  );
}

export async function dismissBankMatchesBatch(matchIds: string[]): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      await dismissMatchesBatch(matchIds);
      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "bank.dismiss_match_batch",
        meta: { count: matchIds.length },
      });
      return { ok: true };
    },
    { paths: ["/transactions"] },
  );
}

export async function findInvoiceBankMatches(
  invoiceId: string,
): Promise<{ ok: true; matches: InvoiceBankMatch[] } | { ok: false; error: string }> {
  const authz = await requireActionPermission("accounts:read");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const matches = await findBankTransactionsForInvoice(companyId, invoiceId);
  return { ok: true, matches };
}

export async function updateBankCategory(
  transactionId: string,
  spendingCategory: string | null,
): Promise<ActionResult> {
  const trimmed = spendingCategory?.trim() ?? "";
  const value = trimmed.length > 0 ? trimmed.slice(0, 120) : null;

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      await updateTransactionCategory(companyId, transactionId, value);
      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "bank.update_category",
        entityType: "bank_transaction",
        entityId: transactionId,
        meta: { spendingCategory: value },
      });
      return { ok: true, id: transactionId };
    },
    { paths: ["/transactions"] },
  );
}

export async function deleteBankSpendingCategory(categoryId: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const result = await deleteUnusedBankSpendingCategory(companyId, categoryId);
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, id: categoryId };
    },
    {
      audit: {
        action: "bank.delete_category",
        entityType: "bank_spending_category",
        entityId: categoryId,
      },
      paths: ["/transactions"],
    },
  );
}

export type { SuggestedMatch, InvoiceBankMatch };
