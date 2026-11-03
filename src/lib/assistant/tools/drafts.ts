import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, ilike } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoices, quotes } from "@/db/schema";
import { formatIsoDateUk, todayIsoDate } from "@/lib/dates";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import { createExpenseRecord } from "@/lib/expenses/create";
import { parseExpenseInput } from "@/lib/expenses/schema";
import { createDraftInvoiceRecord } from "@/lib/invoices/create";
import { parseInvoiceInput } from "@/lib/invoices/schema";
import { createDraftQuoteRecord } from "@/lib/quotes/create";
import { parseQuoteInput } from "@/lib/quotes/schema";
import { formatQuoteReference } from "@/lib/quotes/status";
import { defaultDueDate } from "@/lib/invoices/status";
import { formatGBP } from "@/lib/money";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import type { ActionResult } from "@/actions/result";
import { defineDraftTool, isoDate, type AssistantDraftTool, type DraftResult } from "./define";

function failed(result: Extract<ActionResult, { ok: false }>): DraftResult {
  const details = Object.values(result.fieldErrors ?? {});
  return { ok: false, error: details.length > 0 ? details.join(". ") : result.error };
}

/** One of the company's clients by name: an exact match, or the only partial one. */
async function findClient(
  companyId: string,
  name: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const wanted = name.trim();
  const escaped = wanted.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = await getDb()
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.companyId, companyId), ilike(clients.name, `%${escaped}%`)))
    .limit(10);
  const exact = rows.filter((r) => r.name.trim().toLowerCase() === wanted.toLowerCase());
  const matches = exact.length > 0 ? exact : rows;
  if (matches.length === 1) return { ok: true, ...matches[0]! };
  if (matches.length === 0) {
    return {
      ok: false,
      error: `No client called "${wanted}". Check list_clients, or add the client in Alfa first.`,
    };
  }
  return {
    ok: false,
    error: `More than one client matches "${wanted}": ${matches.map((m) => m.name).join(", ")}. Say which one.`,
  };
}

const invoiceLine = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(1_000_000).default(1),
  unitPrice: z.number().min(0).max(10_000_000).describe("Price per unit in pounds, before VAT"),
  vatRate: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe("VAT % for this line; leave out to use the company's usual rate"),
});

type LineInput = z.infer<typeof invoiceLine>;

/** Lines as the shared invoice and quote schemas expect them. */
function documentLines(lines: LineInput[], defaultVatRate: number) {
  return lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPricePounds: l.unitPrice.toFixed(2),
    vatRate: l.vatRate ?? defaultVatRate,
  }));
}

/**
 * Tools that create something for the person to check in Alfa. Founders only
 * (accounts:write); nothing is sent, paid, approved or deleted.
 */
export const DRAFT_TOOLS: readonly AssistantDraftTool[] = [
  defineDraftTool({
    name: "create_draft_invoice",
    audit: { action: "invoice.create", entityType: "invoice" },
    href: (id) => `/invoices/${id}`,
    description:
      "Create a DRAFT invoice for an existing client. It is not sent: the person reviews and sends it in Alfa. Confirm the client, lines and prices with the person before calling, and call once per invoice.",
    permission: "accounts:write",
    inputSchema: z.object({
      client: z.string().trim().min(1).max(200).describe("The client's name, as in list_clients"),
      lines: z.array(invoiceLine).min(1).max(50),
      issueDate: isoDate.optional().describe("Defaults to today"),
      dueDate: isoDate.optional().describe("Defaults to the company's payment terms"),
      notes: z.string().trim().max(2000).optional(),
    }),
    execute: async ({ companyId, localUserId }, input) => {
      const client = await findClient(companyId, input.client);
      if (!client.ok) return client;
      const company = await getOrCreateCompanySettings(companyId);
      const issueDate = input.issueDate ?? todayIsoDate();
      const parsed = parseInvoiceInput({
        clientId: client.id,
        issueDate,
        dueDate: input.dueDate ?? defaultDueDate(issueDate, company.invoicePaymentTermsDays),
        notes: input.notes ?? "",
        lines: documentLines(input.lines, company.defaultVatRate),
      });
      if (!parsed.ok) return failed(parsed);

      const created = await createDraftInvoiceRecord({ companyId, localUserId }, parsed.data);
      if (!created.ok) return failed(created);
      revalidatePath("/invoices");
      revalidatePath("/dashboard");

      const [invoice] = await getDb()
        .select({
          number: invoices.number,
          issueDate: invoices.issueDate,
          dueDate: invoices.dueDate,
          netPence: invoices.netPence,
          vatPence: invoices.vatPence,
          grossPence: invoices.grossPence,
        })
        .from(invoices)
        .where(and(eq(invoices.id, created.id!), eq(invoices.companyId, companyId)))
        .limit(1);
      return {
        ok: true,
        id: created.id!,
        draft: {
          status: "Draft invoice. Not sent: review and send it in Alfa.",
          number: invoice!.number,
          client: client.name,
          issueDate: formatIsoDateUk(invoice!.issueDate),
          dueDate: formatIsoDateUk(invoice!.dueDate),
          net: formatGBP(invoice!.netPence),
          vat: formatGBP(invoice!.vatPence),
          total: formatGBP(invoice!.grossPence),
        },
      };
    },
  }),
  defineDraftTool({
    name: "create_draft_quote",
    audit: { action: "quote.create", entityType: "quote" },
    href: (id) => `/quotes/${id}`,
    description:
      "Create a DRAFT quote for an existing client. It is not sent: the person reviews and sends it in Alfa. Confirm the client, lines and prices with the person before calling, and call once per quote.",
    permission: "accounts:write",
    inputSchema: z.object({
      client: z.string().trim().min(1).max(200).describe("The client's name, as in list_clients"),
      lines: z.array(invoiceLine).min(1).max(50),
      issueDate: isoDate.optional().describe("Defaults to today"),
      validUntil: isoDate.optional().describe("Last day the client can accept it, if the person gives one"),
      notes: z.string().trim().max(2000).optional(),
    }),
    execute: async ({ companyId, localUserId }, input) => {
      const client = await findClient(companyId, input.client);
      if (!client.ok) return client;
      const company = await getOrCreateCompanySettings(companyId);
      const issueDate = input.issueDate ?? todayIsoDate();
      if (input.validUntil && input.validUntil < issueDate) {
        return { ok: false, error: "The valid-until date is before the quote's date." };
      }
      const parsed = parseQuoteInput({
        clientId: client.id,
        issueDate,
        validUntil: input.validUntil ?? "",
        notes: input.notes ?? "",
        lines: documentLines(input.lines, company.defaultVatRate),
      });
      if (!parsed.ok) return failed(parsed);

      const created = await createDraftQuoteRecord({ companyId, localUserId }, parsed.data);
      if (!created.ok) return failed(created);
      revalidatePath("/quotes");

      const [quote] = await getDb()
        .select({
          number: quotes.number,
          version: quotes.version,
          issueDate: quotes.issueDate,
          validUntil: quotes.validUntil,
          netPence: quotes.netPence,
          vatPence: quotes.vatPence,
          grossPence: quotes.grossPence,
        })
        .from(quotes)
        .where(and(eq(quotes.id, created.id!), eq(quotes.companyId, companyId)))
        .limit(1);
      return {
        ok: true,
        id: created.id!,
        draft: {
          status: "Draft quote. Not sent: review and send it in Alfa.",
          reference: formatQuoteReference(quote!.number, quote!.version),
          client: client.name,
          issueDate: formatIsoDateUk(quote!.issueDate),
          validUntil: formatIsoDateUk(quote!.validUntil),
          net: formatGBP(quote!.netPence),
          vat: formatGBP(quote!.vatPence),
          total: formatGBP(quote!.grossPence),
        },
      };
    },
  }),
  defineDraftTool({
    name: "create_draft_expense",
    audit: { action: "expense.create", entityType: "expense" },
    href: (id) => `/expenses/${id}`,
    description:
      "Add an expense to Alfa's review queue, like an emailed receipt. It isn't recorded until someone approves it in Alfa, where they add the receipt and say who paid. Confirm the details with the person before calling, and call once per expense.",
    permission: "accounts:write",
    inputSchema: z.object({
      description: z.string().trim().min(1).max(500).describe("What it was for, and who from"),
      amount: z.number().positive().max(10_000_000).describe("Total paid in pounds, including any VAT"),
      spentOn: isoDate.optional().describe("Defaults to today"),
      category: z.enum(EXPENSE_CATEGORIES).optional(),
      vatRate: z.number().int().min(0).max(100).optional().describe("VAT % on the receipt, if known"),
    }),
    execute: async ({ companyId, localUserId }, input) => {
      const parsed = parseExpenseInput({
        description: input.description,
        category: input.category ?? "",
        spentAt: input.spentOn ?? todayIsoDate(),
        amountPounds: input.amount.toFixed(2),
        currency: "GBP",
        // Placeholder: a pending expense's status is chosen when it's approved.
        status: "recorded",
        vatRate: input.vatRate ?? 0,
      });
      if (!parsed.ok) return failed(parsed);

      const created = await createExpenseRecord({ companyId, localUserId }, parsed.data, {
        pending: true,
      });
      if (!created.ok) return failed(created);
      revalidatePath("/expenses");

      return {
        ok: true,
        id: created.id!,
        draft: {
          status: "Waiting for review in Alfa. Add the receipt and say who paid when you approve it.",
          description: parsed.data.description,
          amount: formatGBP(parsed.data.amountPence),
          spentOn: formatIsoDateUk(parsed.data.spentAt),
          category: parsed.data.category || null,
        },
      };
    },
  }),
];
