import { clientBillToLines } from "@/lib/clients/display";
import { formatIsoDateUk } from "@/lib/dates";
import { formatGBP } from "@/lib/money";
import {
  SAMPLE_CLIENT,
  SAMPLE_COMPANY,
  SAMPLE_CREDIT_NOTE,
  SAMPLE_CREDIT_NOTE_DETAILS,
  SAMPLE_INVOICE,
  SAMPLE_LINES,
  SAMPLE_QUOTE,
} from "@/lib/pdf/templates/sample";
import type {
  PdfClient,
  PdfCompany,
  PdfCreditNoteDetails,
  PdfInvoice,
  PdfLine,
  PdfQuote,
} from "@/lib/pdf/templates/types";
import type { DocumentKind } from "@/lib/pdf/templates/views";
import { formatQuoteVersion } from "@/lib/quotes/status";

/** The document a design is filled from, whichever kind it is. */
export interface DesignDocument {
  number: string;
  issueDate: string | null;
  /** Invoices only. */
  dueDate: string | null;
  /** Quotes only. */
  validUntil: string | null;
  /** Quotes only. */
  version: number | null;
  /** Invoice notes, or a quote's terms. */
  notes: string | null;
  /** Credit notes only: the invoice being credited. */
  creditedInvoiceNumber: string | null;
  /** Credit notes only. */
  reason: string | null;
  netPence: number | null;
  vatPence: number;
  grossPence: number;
}

/** What a design's placeholders are filled from. */
export interface DesignData {
  kind: DocumentKind;
  document: DesignDocument;
  client: PdfClient;
  company: PdfCompany;
  lines: PdfLine[];
  /** Company contact address, already resolved (see resolvePdfCompanyEmail). */
  contactEmail: string;
}

type DesignParties = Pick<DesignData, "client" | "company" | "lines" | "contactEmail">;

const NO_DOCUMENT_EXTRAS = {
  dueDate: null,
  validUntil: null,
  version: null,
  notes: null,
  creditedInvoiceNumber: null,
  reason: null,
};

export function invoiceDesignData(invoice: PdfInvoice, parties: DesignParties): DesignData {
  return {
    ...parties,
    kind: "invoice",
    document: {
      ...NO_DOCUMENT_EXTRAS,
      number: invoice.number,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      notes: invoice.notes,
      netPence: invoice.netPence,
      vatPence: invoice.vatPence ?? 0,
      grossPence: invoice.grossPence,
    },
  };
}

export function quoteDesignData(quote: PdfQuote, parties: DesignParties): DesignData {
  return {
    ...parties,
    kind: "quote",
    document: {
      ...NO_DOCUMENT_EXTRAS,
      number: quote.number,
      issueDate: quote.issueDate,
      validUntil: quote.validUntil,
      version: quote.version,
      notes: quote.notes,
      netPence: quote.netPence ?? null,
      vatPence: quote.vatPence ?? 0,
      grossPence: quote.grossPence,
    },
  };
}

export function creditNoteDesignData(
  creditNote: {
    number: string;
    issueDate: string | null;
    netPence: number;
    vatPence: number;
    grossPence: number;
  },
  details: PdfCreditNoteDetails,
  parties: DesignParties,
): DesignData {
  return {
    ...parties,
    kind: "credit-note",
    document: {
      ...NO_DOCUMENT_EXTRAS,
      number: creditNote.number,
      issueDate: creditNote.issueDate,
      creditedInvoiceNumber: details.invoiceNumber,
      reason: details.reason,
      netPence: creditNote.netPence,
      vatPence: creditNote.vatPence,
      grossPence: creditNote.grossPence,
    },
  };
}

export const FIELD_GROUPS = ["Document", "Client", "Your business", "Bank", "Totals"] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];

/** Heading of the first group of fields for each kind of document. */
export const DOCUMENT_FIELD_GROUP_LABELS: Record<DocumentKind, string> = {
  invoice: "Invoice",
  quote: "Quote",
  "credit-note": "Credit note",
};

export function fieldGroupLabel(group: FieldGroup, kind: DocumentKind): string {
  return group === "Document" ? DOCUMENT_FIELD_GROUP_LABELS[kind] : group;
}

/** Wording of the emphasised total for each kind of document. */
export const TOTAL_LABELS: Record<DocumentKind, string> = {
  invoice: "Total due",
  quote: "Quote total",
  "credit-note": "Total credited",
};

export interface DesignField {
  /** Written in text as `{{token}}`. */
  token: string;
  label: string;
  group: FieldGroup;
  /** May span several lines (addresses). Empty when the document has no value. */
  resolve: (data: DesignData) => string;
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

const date = (value: string | null) => formatIsoDateUk(value) ?? "";

/** The fields that belong to one kind of document only. */
const DOCUMENT_FIELDS: Record<DocumentKind, DesignField[]> = {
  invoice: [
    { token: "invoice.number", label: "Invoice number", group: "Document", resolve: (d) => d.document.number },
    { token: "invoice.issueDate", label: "Invoice date", group: "Document", resolve: (d) => date(d.document.issueDate) },
    { token: "invoice.dueDate", label: "Due date", group: "Document", resolve: (d) => date(d.document.dueDate) },
    { token: "invoice.notes", label: "Notes", group: "Document", resolve: (d) => text(d.document.notes) },
  ],
  quote: [
    { token: "quote.number", label: "Quote number", group: "Document", resolve: (d) => d.document.number },
    { token: "quote.issueDate", label: "Quote date", group: "Document", resolve: (d) => date(d.document.issueDate) },
    { token: "quote.validUntil", label: "Valid until", group: "Document", resolve: (d) => date(d.document.validUntil) },
    {
      token: "quote.version",
      label: "Version",
      group: "Document",
      resolve: (d) => (d.document.version == null ? "" : formatQuoteVersion(d.document.version)),
    },
    { token: "quote.terms", label: "Terms", group: "Document", resolve: (d) => text(d.document.notes) },
  ],
  "credit-note": [
    { token: "creditNote.number", label: "Credit note number", group: "Document", resolve: (d) => d.document.number },
    { token: "creditNote.issueDate", label: "Credit note date", group: "Document", resolve: (d) => date(d.document.issueDate) },
    {
      token: "creditNote.invoiceNumber",
      label: "Credited invoice number",
      group: "Document",
      resolve: (d) => text(d.document.creditedInvoiceNumber),
    },
    { token: "creditNote.reason", label: "Reason for credit", group: "Document", resolve: (d) => text(d.document.reason) },
  ],
};

/** Fields every kind of document has. */
const SHARED_FIELDS: DesignField[] = [
  {
    token: "client.name",
    label: "Client name",
    group: "Client",
    resolve: (d) => clientBillToLines(d.client).join("\n"),
  },
  { token: "client.contact", label: "Contact name", group: "Client", resolve: (d) => text(d.client.name) },
  {
    token: "client.company",
    label: "Client company",
    group: "Client",
    resolve: (d) => text(d.client.companyName),
  },
  { token: "client.email", label: "Client email", group: "Client", resolve: (d) => text(d.client.email) },
  {
    token: "client.address",
    label: "Client address",
    group: "Client",
    resolve: (d) => text(d.client.addressLines),
  },
  { token: "company.name", label: "Business name", group: "Your business", resolve: (d) => d.company.name },
  {
    token: "company.legalName",
    label: "Legal name",
    group: "Your business",
    resolve: (d) => d.company.legalName,
  },
  {
    token: "company.address",
    label: "Business address",
    group: "Your business",
    resolve: (d) => text(d.company.addressLines),
  },
  { token: "company.email", label: "Business email", group: "Your business", resolve: (d) => d.contactEmail },
  {
    token: "company.number",
    label: "Company number",
    group: "Your business",
    resolve: (d) => text(d.company.companyNumber),
  },
  {
    token: "company.vatNumber",
    label: "VAT number",
    group: "Your business",
    resolve: (d) => text(d.company.vatNumber),
  },
  { token: "bank.name", label: "Bank name", group: "Bank", resolve: (d) => text(d.company.bankName) },
  {
    token: "bank.accountName",
    label: "Account name",
    group: "Bank",
    resolve: (d) => text(d.company.bankAccountName),
  },
  { token: "bank.sortCode", label: "Sort code", group: "Bank", resolve: (d) => text(d.company.sortCode) },
  {
    token: "bank.accountNumber",
    label: "Account number",
    group: "Bank",
    resolve: (d) => text(d.company.accountNumber),
  },
  {
    token: "totals.subtotal",
    label: "Subtotal",
    group: "Totals",
    resolve: (d) => (d.document.netPence == null ? "" : formatGBP(d.document.netPence)),
  },
  { token: "totals.vat", label: "VAT", group: "Totals", resolve: (d) => formatGBP(d.document.vatPence) },
];

function buildFields(kind: DocumentKind): DesignField[] {
  return [
    ...DOCUMENT_FIELDS[kind],
    ...SHARED_FIELDS,
    {
      token: "totals.total",
      label: TOTAL_LABELS[kind],
      group: "Totals",
      resolve: (d) => formatGBP(d.document.grossPence),
    },
  ];
}

const FIELDS: Record<DocumentKind, DesignField[]> = {
  invoice: buildFields("invoice"),
  quote: buildFields("quote"),
  "credit-note": buildFields("credit-note"),
};

const FIELDS_BY_TOKEN: Record<DocumentKind, Map<string, DesignField>> = {
  invoice: new Map(FIELDS.invoice.map((field) => [field.token, field])),
  quote: new Map(FIELDS.quote.map((field) => [field.token, field])),
  "credit-note": new Map(FIELDS["credit-note"].map((field) => [field.token, field])),
};

/** Every piece of data that can be dropped onto a design for this kind of document. */
export function designFields(kind: DocumentKind): DesignField[] {
  return FIELDS[kind];
}

export function designField(token: string, kind: DocumentKind): DesignField | undefined {
  return FIELDS_BY_TOKEN[kind].get(token);
}

export function fieldToken(token: string): string {
  return `{{${token}}}`;
}

export const TOKEN_PATTERN =/\{\{\s*([a-zA-Z.]+)\s*\}\}/g;

export type ContentPart = { kind: "text"; text: string } | { kind: "field"; field: DesignField };

/** Split text into literal runs and the fields named in it, for showing placeholders. */
export function contentParts(content: string, kind: DocumentKind): ContentPart[] {
  const parts: ContentPart[] = [];
  let last = 0;
  for (const match of content.matchAll(TOKEN_PATTERN)) {
    const field = designField(match[1], kind);
    if (!field) continue;
    if (match.index > last) parts.push({ kind: "text", text: content.slice(last, match.index) });
    parts.push({ kind: "field", field });
    last = match.index + match[0].length;
  }
  if (last < content.length) parts.push({ kind: "text", text: content.slice(last) });
  return parts;
}

/**
 * Text with its placeholders filled in. A line whose placeholders all came
 * out empty is dropped, so "VAT no: {{company.vatNumber}}" leaves no stray
 * label on a document from a business that isn't VAT registered.
 */
export function fillContent(content: string, data: DesignData): string {
  return content
    .split("\n")
    .flatMap((line) => {
      let fields = 0;
      let filled = 0;
      const out = line.replace(TOKEN_PATTERN, (whole, token: string) => {
        const field = designField(token, data.kind);
        if (!field) return whole;
        fields += 1;
        const value = field.resolve(data);
        if (value) filled += 1;
        return value;
      });
      return fields > 0 && filled === 0 ? [] : [out];
    })
    .join("\n");
}

/** A made-up document of this kind, shown in the editor and in previews. */
export function sampleDesignData(kind: DocumentKind): DesignData {
  const parties: DesignParties = {
    client: SAMPLE_CLIENT,
    company: SAMPLE_COMPANY,
    lines: SAMPLE_LINES,
    contactEmail: SAMPLE_COMPANY.email ?? "",
  };
  if (kind === "quote") return quoteDesignData(SAMPLE_QUOTE, parties);
  if (kind === "credit-note") {
    return creditNoteDesignData(SAMPLE_CREDIT_NOTE, SAMPLE_CREDIT_NOTE_DETAILS, parties);
  }
  return invoiceDesignData(SAMPLE_INVOICE, parties);
}
