"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { getBankFeedAdapter } from "@/lib/bank/starling-csv";
import {
  confirmMatch,
  dismissMatch,
  getOrCreateDefaultBankAccount,
  importBankRows,
  suggestMatches,
} from "@/lib/bank/queries";
import type { ActionResult } from "@/actions/clients";

export async function importStarlingCsv(formData: FormData): Promise<
  ActionResult & { inserted?: number; skipped?: number }
> {
  const session = await requirePermission("accounts:write");
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

  revalidatePath("/dashboard/bank");
  return { ok: true, id: account.id, inserted, skipped };
}

export async function runSuggestMatches(): Promise<ActionResult> {
  const session = await requirePermission("accounts:write");
  const localUserId = await ensureLocalUser(session);
  const count = await suggestMatches();
  await writeAudit({
    actorUserId: localUserId,
    action: "bank.suggest",
    meta: { count },
  });
  revalidatePath("/dashboard/bank");
  return { ok: true };
}

export async function confirmBankMatch(matchId: string): Promise<ActionResult> {
  const session = await requirePermission("accounts:write");
  const localUserId = await ensureLocalUser(session);
  await confirmMatch(matchId);
  await writeAudit({
    actorUserId: localUserId,
    action: "bank.confirm_match",
    entityType: "reconciliation_match",
    entityId: matchId,
  });
  revalidatePath("/dashboard/bank");
  return { ok: true, id: matchId };
}

export async function dismissBankMatch(matchId: string): Promise<ActionResult> {
  const session = await requirePermission("accounts:write");
  const localUserId = await ensureLocalUser(session);
  await dismissMatch(matchId);
  await writeAudit({
    actorUserId: localUserId,
    action: "bank.dismiss_match",
    entityType: "reconciliation_match",
    entityId: matchId,
  });
  revalidatePath("/dashboard/bank");
  return { ok: true, id: matchId };
}
