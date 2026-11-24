export interface PdfCompany {
  name: string;
  legalName: string;
  companyNumber: string | null;
  vatNumber?: string | null;
  addressLines: string | null;
  email?: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  sortCode: string | null;
  accountNumber: string | null;
  logoUrl?: string | null;
}

export interface PdfClient {
  name: string;
  companyName?: string | null;
  email: string | null;
  addressLines: string | null;
}

/**
 * A document's currency and how it was converted. Totals are in `currency`'s
 * minor units; for a foreign document the rate and its VAT in sterling are
 * there too, which a VAT invoice or credit note in another currency must show.
 */
export interface PdfCurrencyFields {
  currency: string;
  vatMinor?: number;
  fxRate?: number;
  fxRateDate?: string | null;
  fxRateSource?: "boe" | "manual" | null;
  vatPence?: number;
}

export interface PdfInvoice extends PdfCurrencyFields {
  number: string;
  issueDate: string | null;
  dueDate: string | null;
  notes: string | null;
  /** Totals in `currency`'s minor units: what the client owes. */
  netMinor: number;
  grossMinor: number;
  /** "import" marks the PDF as a record of an invoice issued elsewhere. */
  source?: "alfa" | "import";
}

export interface PdfLine {
  description: string;
  quantity: number;
  unitPricePence: number;
  /** Line discount percent (0–100); omitted or 0 for none. */
  discountPercent?: number;
}

export interface PdfQuote {
  number: string;
  version: number;
  issueDate: string | null;
  validUntil: string | null;
  notes: string | null;
  netPence?: number;
  vatPence?: number;
  grossPence: number;
}

/** A credit note, in its invoice's currency and converted at its rate. */
export interface PdfCreditNote extends PdfCurrencyFields {
  number: string;
  issueDate: string | null;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
}

/** Set when rendering a credit note. */
export interface PdfCreditNoteDetails {
  invoiceNumber: string;
  reason: string;
}

export interface LabelledValue {
  label: string;
  value: string;
}

export interface DocumentViewLine {
  description: string;
  quantity: string;
  unitPrice: string;
  /** Empty when the line has no discount. */
  discount: string;
  amount: string;
}

/**
 * Everything a template layout draws, already worded and formatted. Layouts
 * take this and nothing else, so an invoice, a credit note and a quote in the
 * same template differ only in the data shown, never in how they look.
 */
export interface DocumentView {
  /** "Invoice", "Credit note", "Quote"… */
  title: string;
  number: string;
  /** Dates and references, in display order. */
  meta: LabelledValue[];
  /** A line of small print under the heading, or null. */
  banner: string | null;
  recipient: {
    /** "Bill to", "Quoted to"… */
    label: string;
    lines: string[];
    email: string | null;
    addressLines: string[];
  };
  sender: {
    name: string;
    legalName: string;
    addressLines: string[];
    companyNumber: string | null;
    vatNumber: string | null;
    email: string;
  };
  lines: DocumentViewLine[];
  showDiscount: boolean;
  /** Rows above the total, such as subtotal and VAT. */
  subtotals: LabelledValue[];
  total: LabelledValue;
  notes: { title: string; body: string } | null;
  /** Payment details, the reason for a credit, or how long a quote stands. */
  detail: { title: string; lines: string[]; footnote: string | null } | null;
  footerParts: string[];
}

export interface TemplateLayoutProps {
  view: DocumentView;
  /** The company's own logo as a data URI, or null when it has none. */
  logoSrc: string | null;
}
