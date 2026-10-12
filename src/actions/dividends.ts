"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { dividendDeclarations, dividendPayouts } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { splitDividendPence } from "@/lib/dividends/split";
import {
  dividendRawFromFormData,
  parseDeclareDividendInput,
} from "@/lib/dividends/schema";
import {
  assertRegisterBalanced,
  getActiveShareholdersForSplit,
} from "@/lib/shareholders/queries";
import type { ActionResult } from "@/actions/result";
import { checkPeriodOpen } from "@/lib/period-lock-queries";
import { getReservesPosition } from "@/lib/ledger/queries";
import { formatGBP } from "@/lib/money";
import { formatIsoDateUk } from "@/lib/dates";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";

/**
 * Declare a dividend split across active shareholders. Refused when it is
 * more than the estimated distributable reserves at the declaration date,
 * unless the form confirms the reserves have been checked (for example
 * against interim accounts, or opening balances not yet entered).
 */
export async function declareDividend(formData: FormData): Promise<ActionResult> {
  const parsed = parseDeclareDividendInput(dividendRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const { totalPence } = parsed.data;

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId, entityType }) => {
      if (entityType !== "limited_company") {
        return { ok: false, error: "Dividends are only available for limited companies." };
      }
      const locked = await checkPeriodOpen(companyId, parsed.data.declaredAt);
      if (locked) return { ok: false, error: locked };

      const reserves = await getReservesPosition(companyId, parsed.data.declaredAt);
      const overReserves = totalPence > reserves.availablePence;
      if (overReserves && formData.get("confirmOverReserves") !== "on") {
        const message = `This is more than the ${formatGBP(reserves.availablePence)} the company has available to distribute, estimated at ${formatIsoDateUk(parsed.data.declaredAt)}. Dividends can only be paid from profits after tax.`;
        return {
          ok: false,
          error: FORM_FIELD_ERROR_SUMMARY,
          fieldErrors: { confirmOverReserves: message },
        };
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
          availableReservesPence: reserves.availablePence,
          overReservesConfirmed: overReserves,
        })
        .returning({ id: dividendDeclarations.id });

      await db.insert(dividendPayouts).values(
        splits.map((s) => ({
          declarationId: decl.id,
          shareholderId: s.id,
          shareholderName: s.name,
          shareCount: s.shareCount,
          amountPence: s.amountPence,
        })),
      );

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "dividend.declare",
        entityType: "dividend_declaration",
        entityId: decl.id,
        meta: {
          totalPence,
          payoutCount: splits.length,
          availableReservesPence: reserves.availablePence,
          overReserves,
        },
      });

      return { ok: true, id: decl.id };
    },
    { paths: ["/dividends", "/reserves"] },
  );
}

export async function deleteDividendDeclaration(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [existing] = await db
        .select({ id: dividendDeclarations.id, declaredAt: dividendDeclarations.declaredAt })
        .from(dividendDeclarations)
        .where(
          and(eq(dividendDeclarations.id, id), eq(dividendDeclarations.companyId, companyId)),
        )
        .limit(1);
      if (!existing) return { ok: false, error: "Dividend declaration not found" };
      const locked = await checkPeriodOpen(companyId, existing.declaredAt);
      if (locked) return { ok: false, error: locked };

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
      paths: ["/dividends", "/reserves"],
    },
  );
}
