"use server";

import { z } from "zod";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, companies, creditNotes, invoices, payments } from "@/db/schema";
import { todayIsoDate } from "@/lib/dates";
import {
  cutoverImpact,
  cutoverWarnings,
  type CutoverImpact,
} from "@/lib/invoices/cutover";
import { mutate, mutateWide } from "@/lib/mutate";
import { periodLockError } from "@/lib/period-lock";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import type { ActionResult } from "@/actions/result";

const cutoverSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

type Parsed =
  | { ok: true; cutover: string | null }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

function parseCutover(formData: FormData): Parsed {
  const raw = String(formData.get("cutover") ?? "").trim();
  if (!raw) return { ok: true, cutover: null };
  const parsed = cutoverSchema.safeParse(raw);
  const error = !parsed.success
    ? "Enter a valid date"
    : raw > todayIsoDate()
      ? "Choose today or an earlier date"
      : null;
  if (error) {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: { cutover: error },
    };
  }
  return { ok: true, cutover: raw };
}

type Reader = Pick<ReturnType<typeof getDb>, "select">;

async function loadImpact(
  db: Reader,
  companyId: string,
  current: string | null,
  next: string | null,
): Promise<CutoverImpact> {
  const imported = await db
    .select({
      id: invoices.id,
      issueDate: invoices.issueDate,
      netPence: invoices.netPence,
      vatPence: invoices.vatPence,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.source, "import"),
        notInArray(invoices.status, ["draft", "void"]),
      ),
    );

  const issueDateById = new Map(imported.map((i) => [i.id, i.issueDate]));
  const ids = imported.map((i) => i.id);
  const [paymentRows, creditRows] = await Promise.all([
    db
      .select({
        invoiceId: payments.invoiceId,
        date: sql<string>`to_char(${payments.receivedAt} AT TIME ZONE 'Europe/London', 'YYYY-MM-DD')`,
      })
      .from(payments)
      .where(inArray(payments.invoiceId, ids)),
    db
      .select({
        invoiceId: creditNotes.invoiceId,
        date: creditNotes.issueDate,
        refundedAt: creditNotes.refundedAt,
        netPence: creditNotes.netPence,
        vatPence: creditNotes.vatPence,
      })
      .from(creditNotes)
      .where(
        and(
          inArray(creditNotes.invoiceId, ids),
          eq(creditNotes.status, "issued"),
        ),
      ),
  ]);

  return cutoverImpact(current, next, {
    invoices: imported,
    payments: paymentRows.map((p) => ({
      invoiceIssueDate: issueDateById.get(p.invoiceId) ?? null,
      date: p.date,
    })),
    credits: creditRows.map((c) => ({
      invoiceIssueDate: issueDateById.get(c.invoiceId) ?? null,
      date: c.date,
      netPence: c.netPence,
      vatPence: c.vatPence,
    })),
    refunds: creditRows.flatMap((c) =>
      c.refundedAt
        ? [
            {
              invoiceIssueDate: issueDateById.get(c.invoiceId) ?? null,
              date: c.refundedAt,
            },
          ]
        : [],
    ),
  });
}

export type InvoiceCutoverPreview =
  | { ok: true; impact: CutoverImpact; warnings: string[]; lockError: string | null }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** What saving this cutover would move, without changing anything. */
export async function previewInvoiceCutover(
  formData: FormData,
): Promise<InvoiceCutoverPreview> {
  const parsed = parseCutover(formData);
  if (!parsed.ok) return parsed;

  return mutateWide<InvoiceCutoverPreview>(
    "books:lock",
    async ({ companyId, entityType }) => {
      const db = getDb();
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId));
      const impact = await loadImpact(
        db,
        companyId,
        company.invoiceCutoverDate,
        parsed.cutover,
      );
      return {
        ok: true,
        impact,
        warnings: cutoverWarnings({
          cutover: parsed.cutover,
          isLimitedCompany: entityType === "limited_company",
          openingBalancesAsAt: company.openingBalancesAsAt,
        }),
        lockError: periodLockError(
          company.booksLockedThrough,
          ...impact.affectedDates,
        ),
      };
    },
  );
}

/**
 * Set or clear (blank) the cutover and reclassify imported invoices with it.
 * Refused when any figure that would move falls in the locked period.
 */
export async function saveInvoiceCutover(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseCutover(formData);
  if (!parsed.ok) return parsed;
  const next = parsed.cutover;

  return mutate(
    "books:lock",
    async ({ companyId, localUserId }) => {
      const db = getDb();
      const locked = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select id from companies where id = ${companyId} for update`,
        );
        const [company] = await tx
          .select()
          .from(companies)
          .where(eq(companies.id, companyId));
        const current = company.invoiceCutoverDate;
        if (current === next) return null;

        const impact = await loadImpact(tx, companyId, current, next);
        const lockError = periodLockError(
          company.booksLockedThrough,
          ...impact.affectedDates,
        );
        if (lockError) return lockError;

        await tx
          .update(companies)
          .set({ invoiceCutoverDate: next, updatedAt: new Date() })
          .where(eq(companies.id, companyId));
        await tx
          .update(invoices)
          .set({
            broughtForward: next
              ? sql`coalesce(${invoices.issueDate} < ${next}, false)`
              : false,
          })
          .where(
            and(
              eq(invoices.companyId, companyId),
              eq(invoices.source, "import"),
            ),
          );
        // In the transaction, so the figures can't move without a record of it.
        await tx.insert(auditLog).values({
          companyId,
          actorUserId: localUserId,
          action: "invoice.cutover_change",
          entityType: "company",
          entityId: companyId,
          meta: {
            from: current,
            to: next,
            invoicesBroughtForward: impact.invoicesBroughtForward,
            invoicesCounted: impact.invoicesCounted,
            incomeChangePence: impact.incomeChangePence,
            vatChangePence: impact.vatChangePence,
            activityChanged: impact.activityChanged,
          },
        });
        return null;
      });

      if (locked) {
        return {
          ok: false,
          error: FORM_FIELD_ERROR_SUMMARY,
          fieldErrors: { cutover: locked },
        };
      }
      return { ok: true, id: companyId };
    },
    { paths: ["/reports", "/dashboard", "/invoices", "/reserves"] },
  );
}
