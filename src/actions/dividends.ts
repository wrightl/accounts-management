"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { dividends } from "@/db/schema";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { poundsToPence } from "@/lib/money";
import type { ActionResult } from "@/actions/result";

const dividendSchema = z.object({
  declaredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shareholderName: z.string().trim().min(1).max(200),
  amountPounds: z.string().trim().min(1),
  notes: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
});

export async function createDividend(formData: FormData): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const parsed = dividendSchema.safeParse({
    declaredAt: formData.get("declaredAt"),
    shareholderName: formData.get("shareholderName"),
    amountPounds: formData.get("amountPounds"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let amountPence: number;
  try {
    amountPence = poundsToPence(parsed.data.amountPounds);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }

  const db = getDb();
  const [row] = await db
    .insert(dividends)
    .values({
      declaredAt: parsed.data.declaredAt,
      shareholderName: parsed.data.shareholderName,
      amountPence,
      notes: parsed.data.notes,
    })
    .returning({ id: dividends.id });

  await writeAudit({
    actorUserId: localUserId,
    action: "dividend.create",
    entityType: "dividend",
    entityId: row.id,
  });

  revalidatePath("/dashboard/reports");
  return { ok: true, id: row.id };
}

export async function deleteDividend(id: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  const session = authz.user;
  const localUserId = await ensureLocalUser(session);
  const db = getDb();
  await db.delete(dividends).where(eq(dividends.id, id));
  await writeAudit({
    actorUserId: localUserId,
    action: "dividend.delete",
    entityType: "dividend",
    entityId: id,
  });
  revalidatePath("/dashboard/reports");
  return { ok: true, id };
}
