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

export interface PdfInvoice {
  number: string;
  issueDate: string | null;
  dueDate: string | null;
  notes: string | null;
  netPence: number;
  vatPence?: number;
  grossPence: number;
  currency: string;
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
