"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  expenses,
  reconciliationMatches,
  reimbursementItems,
  reimbursements,
} from "@/db/schema";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  getBankTransactionById,
  isBankTransactionAvailable,
  ReconciliationError,
} from "@/lib/bank/queries";
import { payReimbursementRun, ReimbursementPayError } from "@/lib/reimbursements/pay";
import { canEditReimbursement } from "@/lib/reimbursements/status";
import { ensureLocalUser } from "@/lib/users";
import type { ActionResult } from "@/actions/result";

const createSchema = z.object({
  payeeUserId: z.string().uuid(),
  expenseIds: z.array(z.string().uuid()).min(1, "Select at least one expense"),
  reference: z.string().trim().min(1, "Bank payment reference is required"),
});

const updateSchema = z.object({
  expenseIds: z.array(z.string().uuid()).min(1, "Select at least one expense"),
  reference: z.string().trim().min(1, "Bank payment reference is required"),
});

const markPaidSchema = z.object({
  bankTransactionId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
});

class ReimburseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReimburseError";
  }
}

export async function createReimbursementRun(
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  let expenseIds: string[] = [];
  try {
    expenseIds = JSON.parse(String(formData.get("expenseIdsJson") ?? "[]"));
  } catch {
    return { ok: false, error: "Invalid expense selection" };
  }

  const parsed = createSchema.safeParse({
    payeeUserId: formData.get("payeeUserId"),
    expenseIds,
    reference: formData.get("reference") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  let runId: string;
  let totalPence = 0;
  try {
    runId = await db.transaction(async (tx) => {
      const ids = [...parsed.data.expenseIds].sort();
      for (const id of ids) {
        await tx.execute(sql`select id from expenses where id = ${id} for update`);
      }

      const selected = await tx
        .select()
        .from(expenses)
        .where(
          and(
            inArray(expenses.id, ids),
            eq(expenses.status, "reimbursable"),
            eq(expenses.paidByUserId, parsed.data.payeeUserId),
          ),
        );

      if (selected.length !== ids.length) {
        throw new ReimburseError("Some expenses are not reimbursable for this founder");
      }

      const alreadyLinked = await tx
        .select({ id: reimbursementItems.id })
        .from(reimbursementItems)
        .where(inArray(reimbursementItems.expenseId, ids))
        .limit(1);
      if (alreadyLinked[0]) {
        throw new ReimburseError("An expense is already on a reimbursement run");
      }

      totalPence = selected.reduce((a, e) => a + e.amountPence, 0);

      const [run] = await tx
        .insert(reimbursements)
        .values({
          companyId,
        payeeUserId: parsed.data.payeeUserId,
          status: "pending",
          totalPence,
          reference: parsed.data.reference,
        })
        .returning({ id: reimbursements.id });

      await tx.insert(reimbursementItems).values(
        selected.map((e) => ({
          reimbursementId: run.id,
          expenseId: e.id,
        })),
      );

      return run.id;
    });
  } catch (e) {
    if (e instanceof ReimburseError) return { ok: false, error: e.message };
    throw e;
  }

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "reimbursement.create",
    entityType: "reimbursement",
    entityId: runId,
    meta: { totalPence, count: parsed.data.expenseIds.length },
  });

  revalidatePath("/reimbursements");
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true, id: runId };
}

export async function updateReimbursementRun(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  let expenseIds: string[] = [];
  try {
    expenseIds = JSON.parse(String(formData.get("expenseIdsJson") ?? "[]"));
  } catch {
    return { ok: false, error: "Invalid expense selection" };
  }

  const parsed = updateSchema.safeParse({
    expenseIds,
    reference: formData.get("reference") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  let totalPence = 0;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from reimbursements where id = ${id} for update`);

      const [run] = await tx
        .select()
        .from(reimbursements)
        .where(and(eq(reimbursements.id, id), eq(reimbursements.companyId, companyId)))
        .limit(1);
      if (!run) throw new ReimburseError("Reimbursement not found");
      if (!canEditReimbursement(run.status)) {
        throw new ReimburseError("Only pending runs can be edited");
      }

      const ids = [...parsed.data.expenseIds].sort();
      for (const expenseId of ids) {
        await tx.execute(sql`select id from expenses where id = ${expenseId} for update`);
      }

      const selected = await tx
        .select()
        .from(expenses)
        .where(
          and(
            inArray(expenses.id, ids),
            eq(expenses.status, "reimbursable"),
            eq(expenses.paidByUserId, run.payeeUserId),
          ),
        );

      if (selected.length !== ids.length) {
        throw new ReimburseError("Some expenses are not reimbursable for this founder");
      }

      const alreadyLinked = await tx
        .select({ id: reimbursementItems.id })
        .from(reimbursementItems)
        .where(
          and(
            inArray(reimbursementItems.expenseId, ids),
            ne(reimbursementItems.reimbursementId, id),
          ),
        )
        .limit(1);
      if (alreadyLinked[0]) {
        throw new ReimburseError("An expense is already on another reimbursement run");
      }

      totalPence = selected.reduce((a, e) => a + e.amountPence, 0);

      await tx
        .delete(reimbursementItems)
        .where(eq(reimbursementItems.reimbursementId, id));
      await tx.insert(reimbursementItems).values(
        selected.map((e) => ({
          reimbursementId: id,
          expenseId: e.id,
        })),
      );

      await tx
        .update(reimbursements)
        .set({
          reference: parsed.data.reference,
          totalPence,
        })
        .where(and(eq(reimbursements.id, id), eq(reimbursements.companyId, companyId)));
    });
  } catch (e) {
    if (e instanceof ReimburseError) return { ok: false, error: e.message };
    throw e;
  }

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "reimbursement.update",
    entityType: "reimbursement",
    entityId: id,
    meta: { totalPence, count: parsed.data.expenseIds.length },
  });

  revalidatePath("/reimbursements");
  revalidatePath(`/reimbursements/${id}`);
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true, id };
}

export async function markReimbursementPaid(
  id: string,
  formData?: FormData,
): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const parsed = markPaidSchema.safeParse({
    bankTransactionId: formData?.get("bankTransactionId") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const bankTransactionId = parsed.data.bankTransactionId;
  const db = getDb();
  const [run] = await db
    .select()
    .from(reimbursements)
    .where(and(eq(reimbursements.id, id), eq(reimbursements.companyId, companyId)))
    .limit(1);
  if (!run) return { ok: false, error: "Reimbursement not found" };
  if (run.status === "paid") return { ok: false, error: "Already paid" };

  if (bankTransactionId) {
    const bankTx = await getBankTransactionById(companyId, bankTransactionId);
    if (!bankTx) return { ok: false, error: "Bank transaction not found" };
    if (bankTx.amountPence >= 0) {
      return { ok: false, error: "Only outgoing bank transactions can be linked" };
    }
    if (!(await isBankTransactionAvailable(bankTransactionId))) {
      return { ok: false, error: "Bank transaction is already reconciled" };
    }
    if (Math.abs(bankTx.amountPence) !== run.totalPence) {
      return { ok: false, error: "Amount must match the reimbursement total" };
    }
  }

  const paidAt = bankTransactionId
    ? new Date(`${(await getBankTransactionById(companyId, bankTransactionId))!.bookedAt}T12:00:00Z`)
    : new Date();

  try {
    await db.transaction(async (tx) => {
      await payReimbursementRun(tx, id, paidAt);

      if (bankTransactionId) {
        const existing = await tx
          .select({ id: reconciliationMatches.id })
          .from(reconciliationMatches)
          .where(eq(reconciliationMatches.bankTransactionId, bankTransactionId))
          .limit(1);
        if (existing[0]) {
          throw new ReconciliationError("Bank transaction is already reconciled");
        }
        await tx.insert(reconciliationMatches).values({
          bankTransactionId,
          matchType: "reimbursement",
          reimbursementId: id,
          confirmed: true,
        });
      }
    });
  } catch (e) {
    if (e instanceof ReimbursementPayError || e instanceof ReconciliationError) {
      return { ok: false, error: e.message };
    }
    throw e;
  }

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "reimbursement.pay",
    entityType: "reimbursement",
    entityId: id,
    meta: bankTransactionId ? { bankTransactionId } : undefined,
  });

  revalidatePath("/reimbursements");
  revalidatePath(`/reimbursements/${id}`);
  revalidatePath("/expenses");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true, id };
}
