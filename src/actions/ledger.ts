"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, directorLoanEntries, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { formatIsoDateUk, todayIsoDate } from "@/lib/dates";
import { poundsToPence } from "@/lib/money";
import { getLedgerSettings, isFinancialYearEnd } from "@/lib/ledger/queries";
import { checkPeriodOpen } from "@/lib/period-lock-queries";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import type { ActionResult } from "@/actions/result";

const LEDGER_PATHS = ["/reserves", "/directors-loans", "/dividends/new"];
const LTD_ONLY = "Only limited companies have reserves and director's loan accounts.";

function fieldError(field: string, message: string): ActionResult {
  return { ok: false, error: FORM_FIELD_ERROR_SUMMARY, fieldErrors: { [field]: message } };
}

/** Signed pence from a pounds field; blank is zero. */
function parseSignedPounds(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? "").trim();
  if (!value) return 0;
  try {
    return poundsToPence(value);
  } catch {
    return null;
  }
}

/**
 * Opening balances at the last year end before Alfa's records: retained
 * earnings and each director's loan balance. A blank date clears them.
 */
export async function saveOpeningBalances(formData: FormData): Promise<ActionResult> {
  const asAt = String(formData.get("openingBalancesAsAt") ?? "").trim() || null;
  const associated = Number(String(formData.get("associatedCompanies") ?? "0").trim() || "0");
  if (!Number.isInteger(associated) || associated < 0 || associated > 50) {
    return fieldError("associatedCompanies", "Enter a whole number, 0 or more");
  }
  const reservesPence = parseSignedPounds(formData.get("openingReservesPounds"));
  if (reservesPence == null) return fieldError("openingReservesPounds", "Enter an amount");
  if (asAt && !/^\d{4}-\d{2}-\d{2}$/.test(asAt)) {
    return fieldError("openingBalancesAsAt", "Enter a valid date");
  }
  if (asAt && asAt >= todayIsoDate()) {
    return fieldError("openingBalancesAsAt", "Choose a year end before today");
  }

  return mutate(
    "books:lock",
    async ({ companyId, localUserId, entityType }) => {
      if (entityType !== "limited_company") return { ok: false, error: LTD_ONLY };
      const settings = await getLedgerSettings(companyId);
      if (asAt && !isFinancialYearEnd(settings.financialYearEndMonth, asAt)) {
        return fieldError(
          "openingBalancesAsAt",
          "Use the last day of a financial year, matching your year end in Settings",
        );
      }

      const db = getDb();
      const companyUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.companyId, companyId));
      const directorBalances: Array<{ userId: string; pence: number }> = [];
      for (const u of companyUsers) {
        const pence = parseSignedPounds(formData.get(`opening_${u.id}`));
        if (pence == null) return fieldError(`opening_${u.id}`, "Enter an amount");
        // Entered as a positive amount with a direction.
        const owedByDirector = formData.get(`openingDirection_${u.id}`) === "owed_by_director";
        if (pence !== 0 && asAt) {
          directorBalances.push({ userId: u.id, pence: owedByDirector ? -Math.abs(pence) : Math.abs(pence) });
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .update(companies)
          .set({
            openingBalancesAsAt: asAt,
            openingReservesPence: asAt ? reservesPence : null,
            associatedCompanies: associated,
            updatedAt: new Date(),
          })
          .where(eq(companies.id, companyId));
        await tx
          .delete(directorLoanEntries)
          .where(
            and(
              eq(directorLoanEntries.companyId, companyId),
              eq(directorLoanEntries.kind, "opening"),
            ),
          );
        if (asAt && directorBalances.length > 0) {
          await tx.insert(directorLoanEntries).values(
            directorBalances.map((d) => ({
              companyId,
              directorUserId: d.userId,
              kind: "opening" as const,
              entryDate: asAt,
              amountPence: d.pence,
              description: `Opening balance at ${formatIsoDateUk(asAt)}`,
              createdByUserId: localUserId,
            })),
          );
        }
      });

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "ledger.opening_balances",
        entityType: "company",
        entityId: companyId,
        meta: {
          from: {
            asAt: settings.openingBalancesAsAt,
            reservesPence: settings.openingReservesPence,
            associatedCompanies: settings.associatedCompanies,
          },
          to: { asAt, reservesPence: asAt ? reservesPence : null, associatedCompanies: associated },
          directors: directorBalances,
        },
      });
      return { ok: true, id: companyId };
    },
    { paths: LEDGER_PATHS },
  );
}

const entrySchema = z.object({
  directorUserId: z.string().uuid("Choose a director"),
  kind: z.enum(["drawing", "paid_in"], { message: "Choose what happened" }),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
});

/** Record money a director took out of, or paid into, the company. */
export async function addDirectorLoanEntry(formData: FormData): Promise<ActionResult> {
  const parsed = entrySchema.safeParse({
    directorUserId: formData.get("directorUserId"),
    kind: formData.get("kind"),
    entryDate: formData.get("entryDate"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: FORM_FIELD_ERROR_SUMMARY, fieldErrors };
  }
  const amountPence = parseSignedPounds(formData.get("amountPounds"));
  if (amountPence == null || amountPence <= 0) {
    return fieldError("amountPounds", "Enter an amount greater than zero");
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId, entityType }) => {
      if (entityType !== "limited_company") return { ok: false, error: LTD_ONLY };
      const locked = await checkPeriodOpen(companyId, parsed.data.entryDate);
      if (locked) return { ok: false, error: locked };

      const settings = await getLedgerSettings(companyId);
      if (settings.openingBalancesAsAt && parsed.data.entryDate <= settings.openingBalancesAsAt) {
        return fieldError(
          "entryDate",
          `Choose a date after the opening balances (${formatIsoDateUk(settings.openingBalancesAsAt)})`,
        );
      }

      const db = getDb();
      const [director] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, parsed.data.directorUserId), eq(users.companyId, companyId)))
        .limit(1);
      if (!director) return fieldError("directorUserId", "Choose a director");

      const [row] = await db
        .insert(directorLoanEntries)
        .values({
          companyId,
          directorUserId: director.id,
          kind: parsed.data.kind,
          entryDate: parsed.data.entryDate,
          amountPence,
          description: parsed.data.description,
          createdByUserId: localUserId,
        })
        .returning({ id: directorLoanEntries.id });

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "director_loan.add",
        entityType: "director_loan_entry",
        entityId: row.id,
        meta: { kind: parsed.data.kind, amountPence, directorUserId: director.id },
      });
      return { ok: true, id: row.id };
    },
    { paths: LEDGER_PATHS },
  );
}

export async function deleteDirectorLoanEntry(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [entry] = await db
        .select()
        .from(directorLoanEntries)
        .where(and(eq(directorLoanEntries.id, id), eq(directorLoanEntries.companyId, companyId)))
        .limit(1);
      if (!entry || entry.kind === "opening") return { ok: false, error: "Entry not found" };
      const locked = await checkPeriodOpen(companyId, entry.entryDate);
      if (locked) return { ok: false, error: locked };

      await db.delete(directorLoanEntries).where(eq(directorLoanEntries.id, id));
      return { ok: true, id };
    },
    {
      audit: { action: "director_loan.delete", entityType: "director_loan_entry", entityId: id },
      paths: LEDGER_PATHS,
    },
  );
}
