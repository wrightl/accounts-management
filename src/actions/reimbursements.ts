"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  expenses,
  reimbursementItems,
  reimbursements,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import type { ActionResult } from "@/actions/clients";

const createSchema = z.object({
  payeeUserId: z.string().uuid(),
  expenseIds: z.array(z.string().uuid()).min(1, "Select at least one expense"),
  reference: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
});

export async function createReimbursementRun(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requirePermission("accounts:write");
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
  const selected = await db
    .select()
    .from(expenses)
    .where(
      and(
        inArray(expenses.id, parsed.data.expenseIds),
        eq(expenses.status, "reimbursable"),
        eq(expenses.paidByUserId, parsed.data.payeeUserId),
      ),
    );

  if (selected.length !== parsed.data.expenseIds.length) {
    return {
      ok: false,
      error: "Some expenses are not reimbursable for this founder",
    };
  }

  const totalPence = selected.reduce((a, e) => a + e.amountPence, 0);

  const runId = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(reimbursements)
      .values({
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

  await writeAudit({
    actorUserId: localUserId,
    action: "reimbursement.create",
    entityType: "reimbursement",
    entityId: runId,
    meta: { totalPence, count: selected.length },
  });

  revalidatePath("/dashboard/reimbursements");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard");
  return { ok: true, id: runId };
}

export async function markReimbursementPaid(id: string): Promise<ActionResult> {
  const session = await requirePermission("accounts:write");
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const [run] = await db
    .select()
    .from(reimbursements)
    .where(eq(reimbursements.id, id))
    .limit(1);
  if (!run) return { ok: false, error: "Reimbursement not found" };
  if (run.status === "paid") return { ok: false, error: "Already paid" };

  const items = await db
    .select()
    .from(reimbursementItems)
    .where(eq(reimbursementItems.reimbursementId, id));

  const paidAt = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(reimbursements)
      .set({ status: "paid", paidAt })
      .where(eq(reimbursements.id, id));

    if (items.length > 0) {
      await tx
        .update(expenses)
        .set({ status: "reimbursed" })
        .where(
          inArray(
            expenses.id,
            items.map((i) => i.expenseId),
          ),
        );
    }
  });

  await writeAudit({
    actorUserId: localUserId,
    action: "reimbursement.pay",
    entityType: "reimbursement",
    entityId: id,
  });

  revalidatePath("/dashboard/reimbursements");
  revalidatePath(`/dashboard/reimbursements/${id}`);
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard");
  return { ok: true, id };
}
