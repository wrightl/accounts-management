import "server-only";
import { TAX_CODES, defaultLineTax } from "@/lib/tax-codes";
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
import { DOCUMENT_CURRENCIES, describeDocumentRate, isDocumentCurrency, STERLING } from "@/lib/currency";
import { formatDocumentAmount, formatGBP } from "@/lib/money";
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
): Promise<
  | { ok: true; id: string; name: string; defaultCurrency: string | null }
  | { ok: false; error: string }
> {
  const wanted = name.trim();
  const escaped = wanted.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = await getDb()
    .select({ id: clients.id, name: clients.name, defaultCurrency: clients.defaultCurrency })
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

/**
 * An amount in pounds, refused unless it's whole pence, so what's created is
 * exactly what the person confirmed rather than a rounded float.
 */
function pounds(max: number) {
  return z
    .number()
    .min(0)
    .max(max)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use pounds and pence: at most 2 decimal places");
}

const invoiceLine = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(1_000_000).default(1),
  unitPrice: pounds(10_000_000).describe(
    "Price per unit in the document's currency (pounds unless a currency is given), before VAT",
  ),
  taxCode: z
    .enum(TAX_CODES)
    .optional()
    .describe(
      "VAT tax code for this line, e.g. standard (20%), reduced (5%), zero_rated, exempt or outside_scope. Leave out to use vatRate or the company's usual code",
    ),
  vatRate: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe("VAT % for this line (0, 5 or 20) when no taxCode is given; leave both out to use the company's usual code"),
});

type LineInput = z.infer<typeof invoiceLine>;

const documentCurrency = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isDocumentCurrency, `Use one of ${DOCUMENT_CURRENCIES.join(", ")}`)
  .optional()
  .describe(
    "ISO currency code the client is billed in, e.g. USD or EUR. Leave out to use the client's usual currency, or GBP",
  );

/** The currency asked for, else the client's usual one, else sterling. */
function currencyFor(asked: string | undefined, client: { defaultCurrency: string | null }) {
  return asked ?? (isDocumentCurrency(client.defaultCurrency) ? client.defaultCurrency! : STERLING);
}

/** The currency and totals columns invoices and quotes share. */
function totalsColumns(t: typeof invoices | typeof quotes) {
  return {
    currency: t.currency,
    fxRate: t.fxRate,
    fxRateDate: t.fxRateDate,
    fxRateSource: t.fxRateSource,
    netMinor: t.netMinor,
    vatMinor: t.vatMinor,
    grossMinor: t.grossMinor,
    netPence: t.netPence,
    vatPence: t.vatPence,
    grossPence: t.grossPence,
  };
}

type TotalsRow = {
  currency: string;
  fxRate: number;
  fxRateDate: string | null;
  fxRateSource: string | null;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  netPence: number;
  vatPence: number;
  grossPence: number;
};

/** Totals as the person sees them: in the document's currency, with pounds for a foreign one. */
function draftTotals(doc: TotalsRow) {
  return {
    currency: doc.currency,
    net: formatDocumentAmount(doc.netMinor, doc.netPence, doc.currency),
    vat: formatDocumentAmount(doc.vatMinor, doc.vatPence, doc.currency),
    total: formatDocumentAmount(doc.grossMinor, doc.grossPence, doc.currency),
    ...(doc.currency !== STERLING
      ? {
          exchangeRate: describeDocumentRate({
            ...doc,
            fxRateSource: doc.fxRateSource as "boe" | "manual" | null,
          }),
        }
      : {}),
  };
}

/**
 * Lines as the shared invoice and quote schemas expect them. A line with
 * neither a code nor a rate takes the company's default code.
 */
function documentLines(lines: LineInput[], company: Parameters<typeof defaultLineTax>[0]) {
  const fallback = defaultLineTax(company);
  return lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPricePounds: l.unitPrice.toFixed(2),
    ...(l.taxCode || l.vatRate !== undefined
      ? { taxCode: l.taxCode, vatRate: l.vatRate }
      : { taxCode: fallback.taxCode, vatRate: fallback.vatRate }),
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
      currency: documentCurrency,
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
        currency: currencyFor(input.currency, client),
        fxRate: "",
        notes: input.notes ?? "",
        lines: documentLines(input.lines, company),
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
          ...totalsColumns(invoices),
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
          ...draftTotals(invoice!),
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
      currency: documentCurrency,
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
        currency: currencyFor(input.currency, client),
        fxRate: "",
        notes: input.notes ?? "",
        lines: documentLines(input.lines, company),
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
          ...totalsColumns(quotes),
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
          ...draftTotals(quote!),
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
      amount: pounds(10_000_000)
        .refine((v) => v > 0, "Enter an amount above zero")
        .describe("Total paid in pounds, including any VAT"),
      spentOn: isoDate.optional().describe("Defaults to today"),
      category: z.enum(EXPENSE_CATEGORIES).optional(),
      taxCode: z
        .enum(TAX_CODES)
        .optional()
        .describe("VAT tax code on the receipt, if known, e.g. standard, reduced, zero_rated, exempt or reverse_charge"),
      vatRate: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe("VAT % on the receipt (0, 5 or 20), if known and no taxCode is given"),
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
        taxCode: input.taxCode,
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
