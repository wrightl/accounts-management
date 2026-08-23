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
  dismissMatch,
  getOrCreateDefaultBankAccount,
  importBankRows,
  listBankTransactions,
  suggestMatches,
  updateTransactionCategory,
  type BankTransactionListResult,
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
    from: input.from,
    to: input.to,
    page,
    pageSize: parseBankPageSize(String(pageSize)),
  });

  return { ok: true, result };
}

export async function importStarlingCsv(formData: FormData): Promise<
  ActionResult & { inserted?: number; skipped?: number }
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
  const suggested = await suggestMatches();

  await writeAudit({
    actorUserId: localUserId,
    action: "bank.import",
    entityType: "bank_account",
    entityId: account.id,
    meta: { inserted, skipped, suggested },
  });

  revalidateTransactions();
  return { ok: true, id: account.id, inserted, skipped };
}

export async function runSuggestMatches(): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);
  const count = await suggestMatches();
  await writeAudit({
    actorUserId: localUserId,
    action: "bank.suggest",
    meta: { count },
  });
  revalidateTransactions();
  return { ok: true };
}

export async function confirmBankMatch(matchId: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);
  await confirmMatch(matchId);
  await writeAudit({
    actorUserId: localUserId,
    action: "bank.confirm_match",
    entityType: "reconciliation_match",
    entityId: matchId,
  });
  revalidateTransactions();
  return { ok: true, id: matchId };
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
