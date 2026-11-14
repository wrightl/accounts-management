import type {
  PdfClient,
  PdfCompany,
  PdfCreditNoteDetails,
  PdfInvoice,
  PdfLine,
  PdfQuote,
} from "@/lib/pdf/templates/types";

/** Made-up documents for template previews and thumbnails. */
export const SAMPLE_COMPANY: PdfCompany = {
  name: "Harbour Studio",
  legalName: "Harbour Studio Ltd",
  companyNumber: "12345678",
  vatNumber: "GB123456789",
  addressLines: "1 Quay Street\nBristol\nBS1 1AA",
  email: "accounts@harbourstudio.example",
  bankName: "Starling Bank",
  bankAccountName: "Harbour Studio Ltd",
  sortCode: "60-83-71",
  accountNumber: "12345678",
  logoUrl: null,
};

export const SAMPLE_CLIENT: PdfClient = {
  name: "Alex Morgan",
  companyName: "Northfield Partners",
  email: "alex@northfield.example",
  addressLines: "10 High Street\nLondon\nE1 1AA",
};

export const SAMPLE_LINES: PdfLine[] = [
  { description: "Workshop planning and design", quantity: 1, unitPricePence: 80000 },
  { description: "Facilitation, two days", quantity: 2, unitPricePence: 65000 },
  { description: "Follow-up report", quantity: 1, unitPricePence: 30000, discountPercent: 10 },
];

export const SAMPLE_INVOICE: PdfInvoice = {
  number: "INV-2026-0042",
  issueDate: "2026-01-13",
  dueDate: "2026-02-12",
  notes: "Thank you for your business.",
  netPence: 237000,
  vatPence: 47400,
  grossPence: 284400,
  currency: "GBP",
};

export const SAMPLE_CREDIT_NOTE = {
  number: "CN-2026-0003",
  issueDate: "2026-01-20",
  netPence: 237000,
  vatPence: 47400,
  grossPence: 284400,
};

export const SAMPLE_CREDIT_NOTE_DETAILS: PdfCreditNoteDetails = {
  invoiceNumber: SAMPLE_INVOICE.number,
  reason: "Workshop postponed at the client's request.",
};

export const SAMPLE_QUOTE: PdfQuote = {
  number: "Q-2026-0017",
  version: 2,
  issueDate: "2026-01-06",
  validUntil: "2026-02-05",
  notes: "Half is payable on acceptance and the balance on completion.",
  netPence: 237000,
  vatPence: 47400,
  grossPence: 284400,
};
