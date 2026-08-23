"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  expenses,
  reimbursementItems,
  reimbursements,
} from "@/db/schema";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import type { ActionResult } from "@/actions/result";

const createSchema = z.object({
  payeeUserId: z.string().uuid(),
  expenseIds: z.array(z.string().uuid()).min(1, "Select at least one expense"),
  reference: z
    .string()
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
    actorUserId: localUserId,
    action: "reimbursement.create",
    entityType: "reimbursement",
    entityId: runId,
    meta: { totalPence, count: parsed.data.expenseIds.length },
  });

  revalidatePath("/dashboard/reimbursements");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard");
  return { ok: true, id: runId };
}

export async function markReimbursementPaid(id: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
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
