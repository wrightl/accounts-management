import { clientBillToLines } from "@/lib/clients/display";
import { formatIsoDateUk } from "@/lib/dates";
import { describeDocumentRate, isForeignDocumentCurrency, STERLING } from "@/lib/currency";
import {
  formatDiscountPercent,
  formatGBP,
  formatMoney,
  formatQuantity,
  hasLineDiscount,
  lineNetPence,
} from "@/lib/money";
import { formatQuoteVersion } from "@/lib/quotes/status";
import type {
  DocumentView,
  DocumentViewLine,
  LabelledValue,
  PdfClient,
  PdfCompany,
  PdfCreditNoteDetails,
  PdfInvoice,
  PdfLine,
  PdfQuote,
} from "@/lib/pdf/templates/types";

/** The three documents every named template comes in. */
export const DOCUMENT_KINDS = ["invoice", "credit-note", "quote"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

function splitLines(value: string | null | undefined): string[] {
  return value ? value.split("\n").filter((line) => line.trim() !== "") : [];
}

function labelled(label: string, value: string | null | undefined): LabelledValue[] {
  return value ? [{ label, value }] : [];
}

/** Line prices are in the document's currency. */
function viewLines(lines: PdfLine[], currency: string = STERLING): DocumentViewLine[] {
  return lines.map((line) => ({
    description: line.description,
    quantity: formatQuantity(line.quantity),
    unitPrice: formatMoney(line.unitPricePence, currency),
    discount: formatDiscountPercent(line.discountPercent),
    amount: formatMoney(lineNetPence(line), currency),
  }));
}

/**
 * The sterling VAT on a foreign invoice that charges VAT, which HMRC requires
 * a VAT invoice in another currency to show, or null.
 */
export function sterlingVatRow(invoice: PdfInvoice): LabelledValue | null {
  if (
    !isForeignDocumentCurrency(invoice.currency) ||
    invoice.fxRate == null ||
    invoice.vatPence == null ||
    !invoice.vatMinor
  ) {
    return null;
  }
  return {
    label: `VAT in GBP at ${invoice.fxRate} ${invoice.currency} = £1`,
    value: formatGBP(invoice.vatPence),
  };
}

/** How a foreign invoice was converted, for the small print; null for sterling. */
export function invoiceRateNote(invoice: PdfInvoice): string | null {
  if (!isForeignDocumentCurrency(invoice.currency) || invoice.fxRate == null) return null;
  return `Amounts are in ${invoice.currency}. Converted to sterling at ${describeDocumentRate({
    currency: invoice.currency,
    fxRate: invoice.fxRate,
    fxRateDate: invoice.fxRateDate ?? null,
    fxRateSource: invoice.fxRateSource ?? null,
  })}.`;
}

function recipient(label: string, client: PdfClient): DocumentView["recipient"] {
  return {
    label,
    lines: clientBillToLines(client),
    email: client.email,
    addressLines: splitLines(client.addressLines),
  };
}

function sender(
  company: PdfCompany,
  contactEmail: string,
  showVatNumber: boolean,
): DocumentView["sender"] {
  return {
    name: company.name,
    legalName: company.legalName,
    addressLines: splitLines(company.addressLines),
    companyNumber: company.companyNumber,
    vatNumber: showVatNumber ? (company.vatNumber ?? null) : null,
    email: contactEmail,
  };
}

function footerParts(
  company: PdfCompany,
  contactEmail: string,
  showVatNumber: boolean,
): string[] {
  return [
    company.legalName,
    company.companyNumber ? `Company no. ${company.companyNumber}` : null,
    company.vatNumber && showVatNumber ? `VAT ${company.vatNumber}` : null,
    company.addressLines?.replace(/\n/g, ", ") ?? null,
    contactEmail,
  ].filter((part): part is string => Boolean(part));
}

function subtotals(
  net: number | null | undefined,
  vatAmount: number | null | undefined,
  company: PdfCompany,
  currency: string = STERLING,
): LabelledValue[] {
  const vat = vatAmount ?? 0;
  return [
    ...(net != null ? [{ label: "Subtotal", value: formatMoney(net, currency) }] : []),
    ...(vat > 0 || company.vatNumber ? [{ label: "VAT", value: formatMoney(vat, currency) }] : []),
  ];
}

function bankLines(company: PdfCompany): string[] {
  return [
    company.bankName,
    company.bankAccountName ? `Account name: ${company.bankAccountName}` : null,
    company.sortCode ? `Sort code: ${company.sortCode}` : null,
    company.accountNumber ? `Account number: ${company.accountNumber}` : null,
  ].filter((line): line is string => Boolean(line));
}

interface ViewBase {
  client: PdfClient;
  lines: PdfLine[];
  company: PdfCompany;
  /** Company contact address, already resolved (see resolvePdfCompanyEmail). */
  contactEmail: string;
}

export function invoiceView(params: ViewBase & { invoice: PdfInvoice }): DocumentView {
  const { invoice, client, lines, company, contactEmail } = params;
  const isRecord = invoice.source === "import";
  // Today's VAT number may not have applied when an imported invoice was issued.
  const showVatNumber = !isRecord;
  return {
    title: isRecord ? "Invoice record" : "Invoice",
    number: invoice.number,
    meta: [
      ...labelled("Issued", formatIsoDateUk(invoice.issueDate)),
      ...labelled("Due", formatIsoDateUk(invoice.dueDate)),
    ],
    banner: isRecord
      ? "Record of an invoice issued elsewhere. This is not the original document."
      : null,
    recipient: recipient("Bill to", client),
    sender: sender(company, contactEmail, showVatNumber),
    lines: viewLines(lines, invoice.currency),
    showDiscount: hasLineDiscount(lines),
    subtotals: [
      ...subtotals(invoice.netMinor, invoice.vatMinor, company, invoice.currency),
      ...[sterlingVatRow(invoice)].filter((row): row is LabelledValue => row != null),
    ],
    total: { label: "Total due", value: formatMoney(invoice.grossMinor, invoice.currency) },
    notes: invoice.notes ? { title: "Notes", body: invoice.notes } : null,
    detail: {
      title: "Payment details",
      lines: bankLines(company),
      footnote: [`Please quote ${invoice.number} as the payment reference.`, invoiceRateNote(invoice)]
        .filter(Boolean)
        .join(" "),
    },
    footerParts: footerParts(company, contactEmail, showVatNumber),
  };
}

export function creditNoteView(
  params: ViewBase & {
    creditNote: {
      number: string;
      issueDate: string | null;
      netPence: number;
      vatPence: number;
      grossPence: number;
    };
    details: PdfCreditNoteDetails;
  },
): DocumentView {
  const { creditNote, details, client, lines, company, contactEmail } = params;
  return {
    title: "Credit note",
    number: creditNote.number,
    meta: [
      ...labelled("Issued", formatIsoDateUk(creditNote.issueDate)),
      { label: "Credits invoice", value: details.invoiceNumber },
    ],
    banner: null,
    recipient: recipient("Bill to", client),
    sender: sender(company, contactEmail, true),
    lines: viewLines(lines),
    showDiscount: hasLineDiscount(lines),
    subtotals: subtotals(creditNote.netPence, creditNote.vatPence, company),
    total: { label: "Total credited", value: formatGBP(creditNote.grossPence) },
    notes: null,
    detail: { title: "Reason for credit", lines: [details.reason], footnote: null },
    footerParts: footerParts(company, contactEmail, true),
  };
}

export function quoteView(params: ViewBase & { quote: PdfQuote }): DocumentView {
  const { quote, client, lines, company, contactEmail } = params;
  const validUntil = formatIsoDateUk(quote.validUntil);
  return {
    title: "Quote",
    number: quote.number,
    meta: [
      ...labelled("Issued", formatIsoDateUk(quote.issueDate)),
      ...labelled("Valid until", validUntil),
      { label: "Version", value: formatQuoteVersion(quote.version) },
    ],
    banner: null,
    recipient: recipient("Quoted to", client),
    sender: sender(company, contactEmail, true),
    lines: viewLines(lines),
    showDiscount: hasLineDiscount(lines),
    subtotals: subtotals(quote.netPence, quote.vatPence, company),
    total: { label: "Quote total", value: formatGBP(quote.grossPence) },
    notes: quote.notes ? { title: "Terms and conditions", body: quote.notes } : null,
    detail: validUntil
      ? {
          title: "Validity",
          lines: [`This quote is valid until ${validUntil}.`],
          footnote: null,
        }
      : null,
    footerParts: footerParts(company, contactEmail, true),
  };
}
