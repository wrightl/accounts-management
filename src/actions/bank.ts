"use server";

import { eq } from "drizzle-orm";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { mutate, mutateWide } from "@/lib/mutate";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { getBankFeedAdapter } from "@/lib/bank/adapters";
import { parseCsvTable } from "@/lib/bank/csv";
import { parseGenericCsvMapping, isGenericCsvMapping } from "@/lib/bank/generic-csv";
import {
  detectBankProvider,
  getMatchedColumnLabels,
  matchesPresetFingerprint,
} from "@/lib/bank/presets";
import {
  getImportHelp,
  getPresetExpectedColumns,
} from "@/lib/bank/import-help";
import {
  bankLabel,
  isBankProviderId,
  isPresetBankProviderId,
  parseProviderFromLegacyName,
  type BankProviderId,
  type PresetBankProviderId,
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
      importHelp: string | null;
      expectedColumns: string[];
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

    if (isPresetBankProviderId(resolved.provider)) {
      return {
        ok: true,
        provider: resolved.provider,
        bankLabel: bankLabel(resolved.provider),
        savedMapping: mapping,
        importHelp: getImportHelp(resolved.provider),
        expectedColumns: getPresetExpectedColumns(resolved.provider),
      };
    }

    return {
      ok: true,
      provider: resolved.provider,
      bankLabel: resolved.bankName?.trim() || "Other bank",
      savedMapping: mapping,
      importHelp: null,
      expectedColumns: [],
    };
  });
}

export async function importBankCsv(formData: FormData): Promise<
  ActionResult & {
    inserted?: number;
    skipped?: number;
    skippedNonGbp?: number;
    suggestions?: SuggestedMatch[];
    /** Client should open the generic column mapper for this file. */
    needsMapping?: boolean;
    detectedProvider?: PresetBankProviderId | null;
    matchedColumns?: { role: string; header: string }[];
    usedProvider?: BankProviderId;
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

      const text = await file.text();
      const { headers, rawHeaders } = parseCsvTable(text);
      const forceMapper = formData.get("forceMapper") === "1";
      const mappingFromForm = parseGenericCsvMapping(formData.get("csvMapping"));

      let importProvider: BankProviderId = resolved.provider;
      const mapping = mappingFromForm;
      let detected: PresetBankProviderId | null = null;

      if (forceMapper || resolved.provider === "other") {
        importProvider = "other";
        if (!mapping) {
          return {
            ok: false,
            error: "Map the CSV columns for your bank before importing.",
            needsMapping: true,
            detectedProvider: detectBankProvider(headers),
          };
        }
      } else if (isPresetBankProviderId(resolved.provider)) {
        if (matchesPresetFingerprint(resolved.provider, headers)) {
          importProvider = resolved.provider;
        } else {
          detected = detectBankProvider(headers);
          if (detected && detected !== resolved.provider) {
            // Unique other preset — import with that adapter for this file only.
            importProvider = detected;
          } else if (mapping) {
            importProvider = "other";
          } else {
            return {
              ok: false,
              error:
                "This file does not match your bank in Settings. Map the columns below, or change the bank in Settings.",
              needsMapping: true,
              detectedProvider: detected,
            };
          }
        }
      }

      let rows;
      try {
        rows = getBankFeedAdapter(
          importProvider,
          importProvider === "other" ? mapping : null,
        ).parse(text);
      } catch (e) {
        // Fingerprint rejection → guided mapper instead of hard error.
        if (importProvider !== "other" && !mapping) {
          return {
            ok: false,
            error:
              e instanceof Error
                ? e.message
                : "Could not parse this CSV. Map the columns below.",
            needsMapping: true,
            detectedProvider: detectBankProvider(headers),
          };
        }
        return { ok: false, error: e instanceof Error ? e.message : "Parse failed" };
      }

      // Prefer the adapter we actually used; do not rewrite companies.bank_provider.
      const accountProvider = importProvider;
      const account = await getOrCreateBankAccount(
        companyId,
        accountProvider,
        accountProvider === resolved.provider ? resolved.bankName : null,
      );
      const { inserted, skipped, skippedNonGbp } = await importBankRows(
        companyId,
        account.id,
        rows,
      );

      if (
        importProvider === "other" &&
        mapping &&
        isGenericCsvMapping(mapping)
      ) {
        await saveBankAccountCsvMapping(companyId, account.id, mapping);
      }

      const suggestions = await suggestMatches(companyId);
      const matchedColumns =
        isPresetBankProviderId(importProvider)
          ? getMatchedColumnLabels(importProvider, rawHeaders)
          : [];

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "bank.import",
        entityType: "bank_account",
        entityId: account.id,
        meta: {
          provider: accountProvider,
          usedProvider: importProvider,
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
        usedProvider: importProvider,
        matchedColumns,
        detectedProvider: detected,
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
    async ({ companyId }) => {
      try {
        await confirmMatch(companyId, matchId);
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
        await confirmMatchesBatch(companyId, matchIds);
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
    async ({ companyId }) => {
      try {
        await dismissMatch(companyId, matchId);
      } catch (e) {
        if (e instanceof ReconciliationError) return { ok: false, error: e.message };
        throw e;
      }
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
      try {
        await dismissMatchesBatch(companyId, matchIds);
      } catch (e) {
        if (e instanceof ReconciliationError) return { ok: false, error: e.message };
        throw e;
      }
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
