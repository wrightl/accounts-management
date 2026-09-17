"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { dividendDeclarations, dividendPayouts } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
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

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId, entityType }) => {
      if (entityType !== "limited_company") {
        return { ok: false, error: "Dividends are only available for limited companies." };
      }

      const balanced = await assertRegisterBalanced(companyId);
      if (!balanced.ok) return balanced;

      const { shareholders, totalShares } = await getActiveShareholdersForSplit(companyId);
      if (!totalShares) {
        return {
          ok: false,
          error: "Add at least one active shareholder before declaring a dividend.",
        };
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

      return { ok: true, id: decl.id };
    },
    { paths: ["/dividends"] },
  );
}

export async function deleteDividendDeclaration(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [existing] = await db
        .select({ id: dividendDeclarations.id })
        .from(dividendDeclarations)
        .where(
          and(eq(dividendDeclarations.id, id), eq(dividendDeclarations.companyId, companyId)),
        )
        .limit(1);
      if (!existing) return { ok: false, error: "Dividend declaration not found" };

      await db
        .delete(dividendDeclarations)
        .where(
          and(eq(dividendDeclarations.id, id), eq(dividendDeclarations.companyId, companyId)),
        );
      return { ok: true, id };
    },
    {
      audit: {
        action: "dividend.delete",
        entityType: "dividend_declaration",
        entityId: id,
      },
      paths: ["/dividends"],
    },
  );
}
