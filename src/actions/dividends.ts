"use server";

import { revalidatePath } from "next/cache";
import { and, eq} from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { dividendDeclarations, dividendPayouts } from "@/db/schema";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { poundsToPence } from "@/lib/money";
import { splitDividendPence } from "@/lib/dividends/split";
import {
  assertRegisterBalanced,
  getActiveShareholdersForSplit,
} from "@/lib/shareholders/queries";
import type { ActionResult } from "@/actions/result";

const declareSchema = z.object({
  declaredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountPounds: z.string().trim().min(1),
  notes: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
});

export async function declareDividend(formData: FormData): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  if (authz.user.entityType !== "limited_company") {
    return { ok: false, error: "Dividends are only available for limited companies." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const parsed = declareSchema.safeParse({
    declaredAt: formData.get("declaredAt"),
    amountPounds: formData.get("amountPounds"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let totalPence: number;
  try {
    totalPence = poundsToPence(parsed.data.amountPounds);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
  }
  if (totalPence <= 0) {
    return { ok: false, error: "Amount must be greater than zero" };
  }

  const balanced = await assertRegisterBalanced(companyId, );
  if (!balanced.ok) return balanced;

  const { shareholders, totalShares } = await getActiveShareholdersForSplit(companyId);
  if (!totalShares) {
    return { ok: false, error: "Set total shares before declaring a dividend." };
  }

  let splits;
  try {
    splits = splitDividendPence(totalPence, shareholders, totalShares);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not split dividend" };
  }

  const db = getDb();
  const [decl] = await db
    .insert(dividendDeclarations)
    .values({
      companyId,
        declaredAt: parsed.data.declaredAt,
      totalPence,
      notes: parsed.data.notes,
    })
    .returning({ id: dividendDeclarations.id });

  await db.insert(dividendPayouts).values(
    splits.map((s) => ({
      declarationId: decl.id,
      shareholderId: s.id,
      shareholderName: s.name,
      amountPence: s.amountPence,
    })),
  );

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "dividend.declare",
    entityType: "dividend_declaration",
    entityId: decl.id,
    meta: { totalPence, payoutCount: splits.length },
  });

  revalidatePath("/dashboard/dividends");
  return { ok: true, id: decl.id };
}

export async function deleteDividendDeclaration(id: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);
  const db = getDb();
  await db.delete(dividendDeclarations).where(eq(dividendDeclarations.id, id));
  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "dividend.delete",
    entityType: "dividend_declaration",
    entityId: id,
  });
  revalidatePath("/dashboard/dividends");
  return { ok: true, id };
}
