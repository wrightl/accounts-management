import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLog,
  companies,
  taxSubmissions,
  type TaxSubmission,
} from "@/db/schema";
import type { HmrcEnvironment } from "@/lib/hmrc/config";

const SECRET_KEY = /token|secret|password|authori[sz]ation|api[-_]?key|cookie/i;
export const REDACTED = "[removed]";

/** A copy with any value under a secret-looking key replaced, at any depth. */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactSecrets) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? REDACTED : redactSecrets(v)]),
    ) as T;
  }
  return value;
}

export interface RecordTaxSubmissionInput {
  companyId: string;
  kind: TaxSubmission["kind"];
  environment: HmrcEnvironment;
  periodKey: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  request: Record<string, unknown>;
  response: Record<string, unknown> | null;
  httpStatus: number | null;
  /** HMRC's receipt; null when HMRC didn't accept the submission. */
  receiptId: string | null;
  correlationId?: string | null;
  submittedByUserId: string | null;
  /**
   * Lock the books up to and including this date once HMRC accepts the
   * submission, usually the period's last day. The lock only ever moves
   * forward here; an earlier date leaves it where it is.
   */
  lockThrough?: string | null;
}

/**
 * Record a submission to HMRC and, when HMRC accepted it, move the books
 * lock forward, in one transaction so a filed period can't be left unlocked.
 * Both changes are audited. Request and response are stored with secrets
 * removed.
 */
export async function recordTaxSubmission(input: RecordTaxSubmissionInput): Promise<TaxSubmission> {
  const db = getDb();
  const { companyId } = input;
  return db.transaction(async (tx) => {
    let lockedThrough: string | null = null;
    if (input.receiptId && input.lockThrough) {
      const [company] = await tx
        .select({ lockedThrough: companies.booksLockedThrough })
        .from(companies)
        .where(eq(companies.id, companyId))
        .for("update");
      if (!company) throw new Error("Company not found");
      const previous = company.lockedThrough;
      lockedThrough = previous && previous >= input.lockThrough ? previous : input.lockThrough;
      if (lockedThrough !== previous) {
        await tx
          .update(companies)
          .set({ booksLockedThrough: lockedThrough, updatedAt: new Date() })
          .where(eq(companies.id, companyId));
        await tx.insert(auditLog).values({
          companyId,
          actorUserId: input.submittedByUserId,
          action: "books.lock",
          entityType: "company",
          entityId: companyId,
          meta: { from: previous, to: lockedThrough, reason: "tax_submission", periodKey: input.periodKey },
        });
      }
    }

    const [row] = await tx
      .insert(taxSubmissions)
      .values({
        companyId,
        kind: input.kind,
        environment: input.environment,
        periodKey: input.periodKey,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        request: redactSecrets(input.request),
        response: input.response ? redactSecrets(input.response) : null,
        httpStatus: input.httpStatus,
        receiptId: input.receiptId,
        correlationId: input.correlationId ?? null,
        submittedByUserId: input.submittedByUserId,
        lockedThrough,
      })
      .returning();

    await tx.insert(auditLog).values({
      companyId,
      actorUserId: input.submittedByUserId,
      action: input.receiptId ? "tax.submitted" : "tax.submission_failed",
      entityType: "tax_submission",
      entityId: row!.id,
      meta: { kind: input.kind, periodKey: input.periodKey, status: input.httpStatus, receiptId: input.receiptId },
    });
    return row!;
  });
}

