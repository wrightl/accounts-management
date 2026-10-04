"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  clients,
  companies,
  invoiceLineItems,
  invoices,
  payments,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate, mutateWide } from "@/lib/mutate";
import { invoiceTotals, poundsToPence } from "@/lib/money";
import { allocateInvoiceNumber } from "@/lib/invoices/allocate";
import {
  bumpInvoiceSeqAfterImport,
  invoiceImportHasErrors,
  parseInvoiceImportCsv,
  parseInvoiceImportCsvFile,
  type ParsedInvoiceImportRow,
} from "@/lib/invoices/import-csv";
import { parseIssueYear } from "@/lib/invoices/numbering";
import {
  canEditInvoice,
  canTransition,
  defaultDueDate,
  storedStatus,
  type InvoiceStatus,
} from "@/lib/invoices/status";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import {
  invoiceRawFromFormData,
  parseInvoiceInput,
  type InvoiceParsed,
} from "@/lib/invoices/schema";
import { financialYearStartDate, todayIsoDate } from "@/lib/dates";
import { enqueueSendJob, processSendJob } from "@/lib/outbox";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { parseVatRate, resolveLineVatRate } from "@/lib/vat";
import type { ActionResult } from "@/actions/result";

export type InvoiceImportPreviewResult =
  | { ok: true; rows: ParsedInvoiceImportRow[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function buildLineValues(
  lines: InvoiceParsed["lines"],
  company: { vatRegistered: boolean },
) {
  return lines.map((l, i) => {
    const unitPricePence = poundsToPence(l.unitPricePounds);
    return {
      description: l.description,
      quantity: l.quantity,
      unitPricePence,
      vatRate: resolveLineVatRate(company, parseVatRate(l.vatRate)),
      position: i,
    };
  });
}

export async function createInvoice(formData: FormData): Promise<ActionResult> {
  const parsed = parseInvoiceInput(invoiceRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const issueDate = parsed.data.issueDate;
  const dueDate =
    parsed.data.dueDate && parsed.data.dueDate.length > 0
      ? parsed.data.dueDate
      : defaultDueDate(issueDate);

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const company = await getOrCreateCompanySettings(companyId);
      let lineValues;
      try {
        lineValues = buildLineValues(parsed.data.lines, company);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
      }
      const totals = invoiceTotals(lineValues);

      const db = getDb();
      const invoiceId = await db.transaction(async (tx) => {
        const number = await allocateInvoiceNumber(tx, companyId, issueDate);
        const [inv] = await tx
          .insert(invoices)
          .values({
            companyId,
            number,
            clientId: parsed.data.clientId,
            status: "draft",
            issueDate,
            dueDate,
            notes: parsed.data.notes,
            netPence: totals.netPence,
            vatPence: totals.vatPence,
            grossPence: totals.grossPence,
            createdByUserId: localUserId,
          })
          .returning({ id: invoices.id });

        await tx.insert(invoiceLineItems).values(
          lineValues.map((l) => ({ ...l, invoiceId: inv.id })),
        );
        return inv.id;
      });

      return { ok: true, id: invoiceId };
    },
    {
      audit: { action: "invoice.create", entityType: "invoice" },
      paths: ["/invoices", "/dashboard"],
    },
  );
}

export async function updateInvoice(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseInvoiceInput(invoiceRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const issueDate = parsed.data.issueDate;
  const dueDate =
    parsed.data.dueDate && parsed.data.dueDate.length > 0
      ? parsed.data.dueDate
      : defaultDueDate(issueDate);

  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const company = await getOrCreateCompanySettings(companyId);
      let lineValues;
      try {
        lineValues = buildLineValues(parsed.data.lines, company);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Invalid amount" };
      }
      const totals = invoiceTotals(lineValues);

      const db = getDb();
      const [existing] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Invoice not found" };
      if (!canEditInvoice(existing.status as InvoiceStatus)) {
        return { ok: false, error: "Only draft invoices can be edited" };
      }

      await db.transaction(async (tx) => {
        await tx
          .update(invoices)
          .set({
            clientId: parsed.data.clientId,
            issueDate,
            dueDate,
            notes: parsed.data.notes,
            netPence: totals.netPence,
            vatPence: totals.vatPence,
            grossPence: totals.grossPence,
            pdfBlobPath: null,
          })
          .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)));

        await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
        await tx.insert(invoiceLineItems).values(
          lineValues.map((l) => ({ ...l, invoiceId: id })),
        );
      });

      return { ok: true, id };
    },
    {
      audit: { action: "invoice.update", entityType: "invoice", entityId: id },
      paths: ["/invoices", `/invoices/${id}`, "/dashboard"],
    },
  );
}

export async function voidInvoice(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Invoice not found" };

      const from = storedStatus(existing.status);
      if (!canTransition(from, "void")) {
        return { ok: false, error: `Cannot void an invoice in status "${from}"` };
      }

      await db
        .update(invoices)
        .set({ status: "void" })
        .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)));

      return { ok: true, id };
    },
    {
      audit: { action: "invoice.void", entityType: "invoice", entityId: id },
      paths: ["/invoices", `/invoices/${id}`, "/dashboard"],
    },
  );
}

export async function sendInvoice(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const detail = await getInvoiceDetail(companyId, id);
      if (!detail) return { ok: false, error: "Invoice not found" };

      const from = storedStatus(detail.invoice.status);
      if (from !== "draft" && from !== "sent") {
        return { ok: false, error: `Cannot send an invoice in status "${from}"` };
      }
      if (!detail.client.email) {
        return { ok: false, error: "Client has no email address" };
      }

      const jobId = await enqueueSendJob("invoice_send", companyId, id, localUserId);
      const delivered = await processSendJob(jobId);
      if (!delivered.ok) {
        return {
          ok: false,
          error: delivered.error ?? "Failed to send invoice. It will retry automatically.",
        };
      }

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "invoice.send",
        entityType: "invoice",
        entityId: id,
        meta: { to: detail.client.email, jobId },
      });

      return { ok: true, id };
    },
    { paths: ["/invoices", `/invoices/${id}`, "/dashboard"] },
  );
}

const updateStatusSchema = z.object({
  status: z.enum(["draft", "sent", "paid", "void"]),
});

export async function updateInvoiceStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  const parsed = updateStatusSchema.safeParse({ status });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid status" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const detail = await getInvoiceDetail(companyId, id);
      if (!detail) return { ok: false, error: "Invoice not found" };

      const current = detail.invoice.status as InvoiceStatus;
      const target = parsed.data.status;

      if (!canTransition(current, target)) {
        return {
          ok: false,
          error: `Cannot change status from ${current} to ${target}`,
        };
      }

      const db = getDb();
      const [existing] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Invoice not found" };

      const now = new Date();
      await db
        .update(invoices)
        .set({
          status: target,
          sentAt: target === "sent" ? (existing.sentAt ?? now) : existing.sentAt,
          paidAt: target === "paid" ? now : existing.paidAt,
        })
        .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)));

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "invoice.status",
        entityType: "invoice",
        entityId: id,
        meta: { from: storedStatus(current), to: target },
      });

      return { ok: true, id };
    },
    { paths: ["/invoices", `/invoices/${id}`, "/dashboard"] },
  );
}

export async function previewInvoiceImport(
  formData: FormData,
): Promise<InvoiceImportPreviewResult> {
  const fileParsed = parseInvoiceImportCsvFile(formData);
  if (!fileParsed.ok) {
    return {
      ok: false,
      error: fileParsed.error,
      fieldErrors: fileParsed.fieldErrors,
    };
  }

  return mutateWide("accounts:write", async ({ companyId }) => {
    const company = await getOrCreateCompanySettings(companyId);
    const db = getDb();
    const existing = await db
      .select({ number: invoices.number })
      .from(invoices)
      .where(eq(invoices.companyId, companyId));
    const text = await fileParsed.data.file.text();
    const rows = parseInvoiceImportCsv(text, {
      fyStart: financialYearStartDate(
        company.financialYearEndMonth,
        todayIsoDate(),
      ),
      vatRegistered: company.vatRegistered,
      existingNumbers: new Set(existing.map((r) => r.number.toLowerCase())),
      paymentTermsDays: company.invoicePaymentTermsDays,
    });
    if (rows.length === 0) {
      return {
        ok: false,
        error: "No data rows found in CSV",
        fieldErrors: { csv: "No data rows found in CSV" },
      };
    }
    return { ok: true, rows };
  });
}

export async function commitInvoiceImport(
  rowsJson: string,
): Promise<ActionResult & { count?: number }> {
  let rows: ParsedInvoiceImportRow[];
  try {
    rows = JSON.parse(rowsJson) as ParsedInvoiceImportRow[];
  } catch {
    return {
      ok: false,
      error: "Invalid import payload",
      fieldErrors: { commit: "Invalid import payload" },
    };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      error: "No rows to import",
      fieldErrors: { commit: "No rows to import" },
    };
  }
  if (invoiceImportHasErrors(rows)) {
    return {
      ok: false,
      error: "Fix validation errors before importing",
      fieldErrors: { commit: "Fix validation errors before importing" },
    };
  }

  return mutateWide(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const company = await getOrCreateCompanySettings(companyId);
      const db = getDb();
      const fyStart = financialYearStartDate(
        company.financialYearEndMonth,
        todayIsoDate(),
      );

      const existing = await db
        .select({ number: invoices.number })
        .from(invoices)
        .where(eq(invoices.companyId, companyId));
      const existingNumbers = new Set(
        existing.map((r) => r.number.toLowerCase()),
      );
      const seenInBatch = new Set<string>();
      for (const row of rows) {
        if (
          row.status === "paid" &&
          row.issueDate &&
          row.issueDate < fyStart
        ) {
          return {
            ok: false,
            error: `Row ${row.rowNumber}: fully paid before financial year start`,
            fieldErrors: {
              commit: `Row ${row.rowNumber}: fully paid before financial year start`,
            },
          };
        }
        if (row.number) {
          const key = row.number.toLowerCase();
          if (existingNumbers.has(key) || seenInBatch.has(key)) {
            return {
              ok: false,
              error: `Invoice number already exists: ${row.number}`,
              fieldErrors: {
                commit: `Invoice number already exists: ${row.number}`,
              },
            };
          }
          seenInBatch.add(key);
        }
      }

      const existingClients = await db
        .select()
        .from(clients)
        .where(eq(clients.companyId, companyId));
      const clientByEmail = new Map(
        existingClients
          .filter((c) => c.email)
          .map((c) => [c.email!.toLowerCase(), c]),
      );

      const historicalNumbers = rows
        .map((r) => r.number)
        .filter((n): n is string => Boolean(n));

      await db.transaction(async (tx) => {
        // Bump sequence for historical numbers before allocating blanks
        const year = parseIssueYear(todayIsoDate());
        const bumped = bumpInvoiceSeqAfterImport(
          {
            invoiceNumberPrefix: company.invoiceNumberPrefix,
            invoiceNextSeq: company.invoiceNextSeq,
            invoiceSeqYear: company.invoiceSeqYear,
          },
          historicalNumbers,
          year,
        );
        if (
          bumped.invoiceNextSeq !== company.invoiceNextSeq ||
          bumped.invoiceSeqYear !== company.invoiceSeqYear
        ) {
          await tx
            .update(companies)
            .set({
              invoiceNextSeq: bumped.invoiceNextSeq,
              invoiceSeqYear: bumped.invoiceSeqYear,
              updatedAt: new Date(),
            })
            .where(eq(companies.id, companyId));
        }

        for (const row of rows) {
          let clientId: string | null = null;
          if (row.clientEmail && clientByEmail.has(row.clientEmail)) {
            clientId = clientByEmail.get(row.clientEmail)!.id;
          } else {
            const [created] = await tx
              .insert(clients)
              .values({
                companyId,
                name: row.clientName || row.clientEmail || "Client",
                companyName: row.clientCompany,
                email: row.clientEmail,
              })
              .returning();
            clientId = created.id;
            if (row.clientEmail) {
              clientByEmail.set(row.clientEmail, created);
            }
          }

          let number = row.number;
          if (!number) {
            number = await allocateInvoiceNumber(tx, companyId, row.issueDate);
          }

          const status = row.status;
          const paidAt =
            status === "paid"
              ? row.paidAt
                ? new Date(`${row.paidAt}T12:00:00Z`)
                : new Date()
              : null;
          const sentAt =
            status === "sent" || status === "paid" ? new Date() : null;

          const [inv] = await tx
            .insert(invoices)
            .values({
              companyId,
              number,
              clientId,
              status,
              issueDate: row.issueDate,
              dueDate:
                row.dueDate ??
                defaultDueDate(row.issueDate, company.invoicePaymentTermsDays),
              netPence: row.netPence,
              vatPence: row.vatPence,
              grossPence: row.grossPence,
              sentAt,
              paidAt,
              createdByUserId: localUserId,
            })
            .returning({ id: invoices.id });

          const vatRate =
            row.netPence > 0
              ? Math.round((row.vatPence / row.netPence) * 100)
              : 0;

          await tx.insert(invoiceLineItems).values({
            invoiceId: inv.id,
            description: row.description,
            quantity: 1,
            unitPricePence: row.netPence,
            vatRate,
            position: 0,
          });

          if (row.amountPaidPence > 0) {
            const receivedAt = row.paidAt
              ? new Date(`${row.paidAt}T12:00:00Z`)
              : new Date(`${row.issueDate}T12:00:00Z`);
            await tx.insert(payments).values({
              invoiceId: inv.id,
              amountPence: Math.min(row.amountPaidPence, row.grossPence),
              receivedAt,
              reference: row.paymentReference,
              method: "import",
            });
          }
        }
      });

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "invoice.import",
        entityType: "invoice",
        meta: { count: rows.length },
      });

      return { ok: true, count: rows.length };
    },
    { paths: ["/invoices", "/clients", "/dashboard", "/reports"] },
  );
}
