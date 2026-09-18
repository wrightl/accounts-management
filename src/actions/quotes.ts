"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { quoteLineItems, quotes } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { invoiceTotals, poundsToPence } from "@/lib/money";
import { allocateQuoteNumber } from "@/lib/invoices/allocate";
import { todayIsoDate } from "@/lib/invoices/status";
import { getQuoteDetail, getQuoteVersionSnapshot } from "@/lib/quotes/queries";
import { loadOrRenderQuotePdf } from "@/lib/quotes/pdf-cache";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { parseVatRate, resolveLineVatRate } from "@/lib/vat";
import { sendEmail } from "@/lib/email";
import {
  canEditQuote,
  canRollbackQuote,
  formatQuoteReference,
  isQuoteStatus,
  type QuoteStatus,
} from "@/lib/quotes/status";
import { insertQuoteVersion, linesToSnapshot } from "@/lib/quotes/versions";
import { upsertDeclineReasonCategory } from "@/lib/quotes/decline-reasons";
import { createOrderFromQuote, replaceQuotePaymentMilestones } from "@/lib/orders/copy-from-quote";
import {
  parseMilestonesJson,
  validateMilestones,
  type PaymentMilestoneInput,
} from "@/lib/quotes/payment-schedule";
import { canTransitionQuote } from "@/lib/quotes/transitions";
import { quoteEmailHtml } from "@/lib/quotes/email";
import {
  generatePublicQuoteToken,
  publicQuoteUrl,
} from "@/lib/quotes/public-token";
import type { ActionResult } from "@/actions/result";

const lineSchema = z.object({
  description: z.string().trim().min(1, "Description is required"),
  quantity: z.coerce
    .number({ error: "Enter a valid quantity" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1"),
  unitPricePounds: z.string().trim().min(1, "Unit price is required"),
  vatRate: z.coerce.number().int().min(0).max(100).optional(),
});

const quoteSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1, "Choose a client")
    .uuid("Choose a client from the list"),
  issueDate: z
    .string()
    .trim()
    .min(1, "Issue date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid issue date"),
  validUntil: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
  notes: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
  lines: z.array(lineSchema).min(1, "Add at least one line item"),
});

function isCompleteLine(line: unknown): boolean {
  if (!line || typeof line !== "object") return false;
  const row = line as Record<string, unknown>;
  const description = String(row.description ?? "").trim();
  const unitPricePounds = String(row.unitPricePounds ?? "").trim();
  return description.length > 0 && unitPricePounds.length > 0;
}

function parseLines(formData: FormData) {
  try {
    const raw = JSON.parse(String(formData.get("linesJson") ?? "[]"));
    if (!Array.isArray(raw)) return [];
    return raw.filter(isCompleteLine);
  } catch {
    return [];
  }
}

function parseAndValidateMilestones(formData: FormData, grossPence: number) {
  const milestones = parseMilestonesJson(String(formData.get("milestonesJson") ?? "[]"));
  const error = validateMilestones(milestones, grossPence);
  if (error) return { ok: false as const, error };
  return { ok: true as const, milestones };
}

export async function createQuote(formData: FormData): Promise<ActionResult> {
  const parsed = quoteSchema.safeParse({
    clientId: formData.get("clientId"),
    issueDate: formData.get("issueDate") || todayIsoDate(),
    validUntil: formData.get("validUntil") ?? "",
    notes: formData.get("notes") ?? "",
    lines: parseLines(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const company = await getOrCreateCompanySettings(companyId);
      let lineValues;
      try {
        lineValues = parsed.data.lines.map((l, i) => ({
          description: l.description,
          quantity: l.quantity,
          unitPricePence: poundsToPence(l.unitPricePounds),
          vatRate: resolveLineVatRate(company, parseVatRate(l.vatRate)),
          position: i,
        }));
      } catch {
        return { ok: false, error: "Enter a valid unit price on each line item" };
      }
      const totals = invoiceTotals(lineValues);
      const milestoneResult = parseAndValidateMilestones(formData, totals.grossPence);
      if (!milestoneResult.ok) return { ok: false, error: milestoneResult.error };

      const db = getDb();
      const quoteId = await db.transaction(async (tx) => {
        const number = await allocateQuoteNumber(tx, companyId, parsed.data.issueDate);
        const [row] = await tx
          .insert(quotes)
          .values({
            companyId,
            number,
            clientId: parsed.data.clientId,
            status: "draft",
            version: 1,
            issueDate: parsed.data.issueDate,
            validUntil: parsed.data.validUntil,
            notes: parsed.data.notes,
            ...totals,
            createdByUserId: localUserId,
          })
          .returning({ id: quotes.id });

        await tx.insert(quoteLineItems).values(
          lineValues.map((l) => ({ ...l, quoteId: row.id })),
        );

        await replaceQuotePaymentMilestones(tx, row.id, milestoneResult.milestones);

        await insertQuoteVersion(tx, {
          quoteId: row.id,
          version: 1,
          snapshot: {
            clientId: parsed.data.clientId,
            issueDate: parsed.data.issueDate,
            validUntil: parsed.data.validUntil,
            notes: parsed.data.notes,
            ...totals,
            lines: linesToSnapshot(lineValues),
          },
          source: "create",
          createdByUserId: localUserId,
        });

        return row.id;
      });

      return { ok: true, id: quoteId };
    },
    {
      audit: { action: "quote.create", entityType: "quote" },
      paths: ["/quotes"],
    },
  );
}

export async function updateQuote(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = quoteSchema.safeParse({
    clientId: formData.get("clientId"),
    issueDate: formData.get("issueDate") || todayIsoDate(),
    validUntil: formData.get("validUntil") ?? "",
    notes: formData.get("notes") ?? "",
    lines: parseLines(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const company = await getOrCreateCompanySettings(companyId);
      let lineValues;
      try {
        lineValues = parsed.data.lines.map((l, i) => ({
          description: l.description,
          quantity: l.quantity,
          unitPricePence: poundsToPence(l.unitPricePounds),
          vatRate: resolveLineVatRate(company, parseVatRate(l.vatRate)),
          position: i,
        }));
      } catch {
        return { ok: false, error: "Enter a valid unit price on each line item" };
      }
      const totals = invoiceTotals(lineValues);
      const milestoneResult = parseAndValidateMilestones(formData, totals.grossPence);
      if (!milestoneResult.ok) return { ok: false, error: milestoneResult.error };

      const db = getDb();
      const [existing] = await db
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Quote not found" };
      if (!canEditQuote(existing.status)) {
        return { ok: false, error: "This quote cannot be edited" };
      }

      const nextVersion = existing.version + 1;

      await db.transaction(async (tx) => {
        await tx
          .update(quotes)
          .set({
            clientId: parsed.data.clientId,
            issueDate: parsed.data.issueDate,
            validUntil: parsed.data.validUntil,
            notes: parsed.data.notes,
            version: nextVersion,
            ...totals,
            pdfBlobPath: null,
          })
          .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)));

        await tx.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, id));
        await tx.insert(quoteLineItems).values(lineValues.map((l) => ({ ...l, quoteId: id })));

        await replaceQuotePaymentMilestones(tx, id, milestoneResult.milestones);

        await insertQuoteVersion(tx, {
          quoteId: id,
          version: nextVersion,
          snapshot: {
            clientId: parsed.data.clientId,
            issueDate: parsed.data.issueDate,
            validUntil: parsed.data.validUntil,
            notes: parsed.data.notes,
            ...totals,
            lines: linesToSnapshot(lineValues),
          },
          source: "edit",
          createdByUserId: localUserId,
        });
      });

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "quote.update",
        entityType: "quote",
        entityId: id,
        meta: { version: nextVersion },
      });

      return { ok: true, id };
    },
    { paths: ["/quotes", `/quotes/${id}`] },
  );
}

export async function rollbackQuote(
  quoteId: string,
  targetVersion: number,
): Promise<ActionResult> {
  if (!Number.isInteger(targetVersion) || targetVersion < 1) {
    return { ok: false, error: "Invalid version" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Quote not found" };
      if (!canRollbackQuote(existing.status)) {
        return { ok: false, error: "This quote cannot be rolled back" };
      }
      if (targetVersion === existing.version) {
        return { ok: false, error: "Already on this version" };
      }

      const snapshot = await getQuoteVersionSnapshot(quoteId, targetVersion);
      if (!snapshot) return { ok: false, error: "Version not found" };

      const nextVersion = existing.version + 1;
      const lineValues = snapshot.lines.map((l, i) => ({
        description: l.description,
        quantity: l.quantity,
        unitPricePence: l.unitPricePence,
        vatRate: l.vatRate,
        position: i,
      }));

      await db.transaction(async (tx) => {
        await tx
          .update(quotes)
          .set({
            clientId: snapshot.clientId,
            issueDate: snapshot.issueDate,
            validUntil: snapshot.validUntil,
            notes: snapshot.notes,
            netPence: snapshot.netPence,
            vatPence: snapshot.vatPence,
            grossPence: snapshot.grossPence,
            version: nextVersion,
            pdfBlobPath: null,
          })
          .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)));

        await tx.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, quoteId));
        await tx.insert(quoteLineItems).values(lineValues.map((l) => ({ ...l, quoteId })));

        await insertQuoteVersion(tx, {
          quoteId,
          version: nextVersion,
          snapshot,
          source: "rollback",
          createdByUserId: localUserId,
          rolledBackFromVersion: targetVersion,
        });
      });

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "quote.rollback",
        entityType: "quote",
        entityId: quoteId,
        meta: { fromVersion: targetVersion, toVersion: nextVersion },
      });

      return { ok: true, id: quoteId };
    },
    { paths: ["/quotes", `/quotes/${quoteId}`] },
  );
}

const declinePayloadSchema = z.object({
  category: z.string().trim().min(1, "Choose a reason category"),
  narrative: z.string().trim().min(1, "Enter a brief explanation"),
});

export async function updateQuoteStatus(
  quoteId: string,
  targetStatus: string,
  payload?: { category?: string; narrative?: string },
): Promise<ActionResult> {
  if (!isQuoteStatus(targetStatus)) {
    return { ok: false, error: "Invalid status" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Quote not found" };

      const fromStatus = existing.status as QuoteStatus;
      if (!canTransitionQuote(fromStatus, targetStatus)) {
        return { ok: false, error: "This status change is not allowed" };
      }

      if (targetStatus === "declined") {
        const parsed = declinePayloadSchema.safeParse(payload ?? {});
        if (!parsed.success) {
          return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
        }
        const category = await upsertDeclineReasonCategory(companyId, parsed.data.category);
        if (!category) return { ok: false, error: "Choose a reason category" };

        await db
          .update(quotes)
          .set({
            status: "declined",
            declinedReasonCategory: category,
            declinedReasonNarrative: parsed.data.narrative,
            declinedAt: new Date(),
          })
          .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)));

        await writeAudit({
          companyId,
          actorUserId: localUserId,
          action: "quote.decline",
          entityType: "quote",
          entityId: quoteId,
          meta: { category },
        });
      } else if (targetStatus === "accepted") {
        const detail = await getQuoteDetail(companyId, quoteId);
        if (!detail) return { ok: false, error: "Quote not found" };

        const milestones: PaymentMilestoneInput[] = detail.milestones.map((m) => ({
          label: m.label,
          amountPence: m.amountPence,
          percentBasisPoints: m.percentBasisPoints,
          dueDate: m.dueDate,
          dueInDays: m.dueInDays,
          position: m.position,
        }));

        let orderId: string;
        try {
          orderId = await db.transaction(async (tx) => {
            const id = await createOrderFromQuote(
              tx,
              companyId,
              { quote: detail.quote, lines: detail.lines },
              milestones,
              localUserId,
            );
            await tx
              .update(quotes)
              .set({ status: "accepted", acceptedAt: new Date() })
              .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)));
            return id;
          });
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Could not create order",
          };
        }

        await writeAudit({
          companyId,
          actorUserId: localUserId,
          action: "quote.accept",
          entityType: "quote",
          entityId: quoteId,
          meta: { orderId },
        });

        return { ok: true, id: orderId };
      } else if (targetStatus === "sent") {
        const now = new Date();
        await db
          .update(quotes)
          .set({
            status: "sent",
            sentAt: existing.sentAt ?? now,
          })
          .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)));

        await writeAudit({
          companyId,
          actorUserId: localUserId,
          action: "quote.mark_sent",
          entityType: "quote",
          entityId: quoteId,
        });
      } else if (targetStatus === "draft" && fromStatus === "declined") {
        await db
          .update(quotes)
          .set({
            status: "draft",
            declinedReasonCategory: null,
            declinedReasonNarrative: null,
            declinedAt: null,
          })
          .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)));

        await writeAudit({
          companyId,
          actorUserId: localUserId,
          action: "quote.reopen",
          entityType: "quote",
          entityId: quoteId,
        });
      }

      return { ok: true, id: quoteId };
    },
    {
      paths:
        targetStatus === "accepted"
          ? ["/quotes", `/quotes/${quoteId}`, "/orders"]
          : ["/quotes", `/quotes/${quoteId}`],
    },
  );
}

const sendQuoteSchema = z.object({
  to: z.string().trim().email("Enter a valid email address"),
  message: z.string().trim().min(1, "Message is required"),
});

export async function sendQuote(quoteId: string, formData: FormData): Promise<ActionResult> {
  const parsed = sendQuoteSchema.safeParse({
    to: formData.get("to"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const detail = await getQuoteDetail(companyId, quoteId);
      if (!detail) return { ok: false, error: "Quote not found" };
      if (detail.quote.status === "accepted") {
        return { ok: false, error: "Cannot send an accepted quote" };
      }
      if (detail.quote.status === "declined") {
        return { ok: false, error: "Cannot send a declined quote" };
      }

      const company = await getOrCreateCompanySettings(companyId);
      const { bytes, filename } = await loadOrRenderQuotePdf(companyId, quoteId);

      const db = getDb();
      let rawToken = detail.quote.publicToken;
      if (!rawToken) {
        rawToken = generatePublicQuoteToken();
        await db
          .update(quotes)
          .set({ publicToken: rawToken })
          .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)));
      }
      const publicUrl = publicQuoteUrl(rawToken);

      await sendEmail({
        to: parsed.data.to,
        subject: `Quote ${formatQuoteReference(detail.quote.number, detail.quote.version)} from ${company.name}`,
        html: quoteEmailHtml({
          message: parsed.data.message,
          publicUrl,
        }),
        text: parsed.data.message,
        attachments: [
          {
            filename,
            content: Buffer.from(bytes),
            contentType: "application/pdf",
          },
        ],
      });

      const now = new Date();
      await db
        .update(quotes)
        .set({
          status: detail.quote.status === "draft" ? "sent" : detail.quote.status,
          sentAt: now,
        })
        .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, companyId)));

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "quote.send",
        entityType: "quote",
        entityId: quoteId,
        meta: { to: parsed.data.to, hasPublicLink: true },
      });

      return { ok: true, id: quoteId };
    },
    { paths: ["/quotes", `/quotes/${quoteId}`] },
  );
}
