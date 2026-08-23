"use server";

import { revalidatePath } from "next/cache";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { getBankFeedAdapter } from "@/lib/bank/starling-csv";
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
  getOrCreateDefaultBankAccount,
  importBankRows,
  listBankTransactions,
  ReconciliationError,
  suggestMatches,
  updateTransactionCategory,
  type BankTransactionListResult,
  type InvoiceBankMatch,
  type ReimbursementBankMatch,
  type SuggestedMatch,
} from "@/lib/bank/queries";
import { deleteUnusedBankSpendingCategory } from "@/lib/bank/spending-categories";
import type { ActionResult } from "@/actions/result";

function revalidateTransactions() {
  revalidatePath("/dashboard/transactions");
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

  const page = Math.max(1, Math.trunc(input.page));
  const pageSize = input.pageSize ?? BANK_PAGE_SIZE;

  const result = await listBankTransactions({
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

export async function importStarlingCsv(formData: FormData): Promise<
  ActionResult & { inserted?: number; skipped?: number; suggestions?: SuggestedMatch[] }
> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a Starling CSV file" };
  }

  const text = await file.text();
  let rows;
  try {
    rows = getBankFeedAdapter().parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Parse failed" };
  }

  const account = await getOrCreateDefaultBankAccount();
  const { inserted, skipped } = await importBankRows(account.id, rows);
  const suggestions = await suggestMatches();

  await writeAudit({
    actorUserId: localUserId,
    action: "bank.import",
    entityType: "bank_account",
    entityId: account.id,
    meta: { inserted, skipped, suggested: suggestions.length },
  });

  revalidateTransactions();
  return { ok: true, id: account.id, inserted, skipped, suggestions };
}

export async function runSuggestMatches(): Promise<
  ActionResult & { suggestions?: SuggestedMatch[] }
> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);
  const suggestions = await suggestMatches();
  await writeAudit({
    actorUserId: localUserId,
    action: "bank.suggest",
    meta: { count: suggestions.length },
  });
  revalidateTransactions();
  return { ok: true, suggestions };
}

export async function confirmBankMatch(matchId: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);
  try {
    await confirmMatch(matchId);
  } catch (e) {
    if (e instanceof ReconciliationError) return { ok: false, error: e.message };
    throw e;
  }
  await writeAudit({
    actorUserId: localUserId,
    action: "bank.confirm_match",
    entityType: "reconciliation_match",
    entityId: matchId,
  });
  revalidateTransactions();
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/reimbursements");
  revalidatePath("/dashboard/expenses");
  return { ok: true, id: matchId };
}

export async function findReimbursementBankMatchesAction(
  reimbursementId: string,
): Promise<
  | { ok: true; matches: ReimbursementBankMatch[] }
  | { ok: false; error: string }
> {
  const authz = await requireActionPermission("accounts:read");
  if (!authz.ok) return authz;
  const matches = await findReimbursementBankMatches(reimbursementId);
  return { ok: true, matches };
}

export async function confirmBankMatchesBatch(matchIds: string[]): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);
  try {
    await confirmMatchesBatch(matchIds);
  } catch (e) {
    if (e instanceof ReconciliationError) return { ok: false, error: e.message };
    throw e;
  }
  await writeAudit({
    actorUserId: localUserId,
    action: "bank.confirm_match_batch",
    meta: { count: matchIds.length },
  });
  revalidateTransactions();
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/reimbursements");
  revalidatePath("/dashboard/expenses");
  return { ok: true };
}

export async function dismissBankMatch(matchId: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);
  await dismissMatch(matchId);
  await writeAudit({
    actorUserId: localUserId,
    action: "bank.dismiss_match",
    entityType: "reconciliation_match",
    entityId: matchId,
  });
  revalidateTransactions();
  return { ok: true, id: matchId };
}

export async function dismissBankMatchesBatch(matchIds: string[]): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);
  await dismissMatchesBatch(matchIds);
  await writeAudit({
    actorUserId: localUserId,
    action: "bank.dismiss_match_batch",
    meta: { count: matchIds.length },
  });
  revalidateTransactions();
  return { ok: true };
}

export async function findInvoiceBankMatches(
  invoiceId: string,
): Promise<{ ok: true; matches: InvoiceBankMatch[] } | { ok: false; error: string }> {
  const authz = await requireActionPermission("accounts:read");
  if (!authz.ok) return authz;
  const matches = await findBankTransactionsForInvoice(invoiceId);
  return { ok: true, matches };
}

export async function updateBankCategory(
  transactionId: string,
  spendingCategory: string | null,
): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const trimmed = spendingCategory?.trim() ?? "";
  const value = trimmed.length > 0 ? trimmed.slice(0, 120) : null;

  await updateTransactionCategory(transactionId, value);
  await writeAudit({
    actorUserId: localUserId,
    action: "bank.update_category",
    entityType: "bank_transaction",
    entityId: transactionId,
    meta: { spendingCategory: value },
  });
  revalidateTransactions();
  return { ok: true, id: transactionId };
}

export async function deleteBankSpendingCategory(categoryId: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const result = await deleteUnusedBankSpendingCategory(categoryId);
  if (!result.ok) return { ok: false, error: result.error };

  await writeAudit({
    actorUserId: localUserId,
    action: "bank.delete_category",
    entityType: "bank_spending_category",
    entityId: categoryId,
  });
  revalidateTransactions();
  return { ok: true, id: categoryId };
}

export type { SuggestedMatch, InvoiceBankMatch };
