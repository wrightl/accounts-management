import { beforeEach, describe, expect, it, vi } from "vitest";

const { extractPdfTextWithFallback, closeOcr } = vi.hoisted(() => ({
  extractPdfTextWithFallback: vi.fn(),
  closeOcr: vi.fn(async () => {}),
}));
vi.mock("@/lib/expenses/receipt-ocr", () => ({
  extractPdfTextWithFallback,
  createSharedImageOcr: () => ({ ocrImage: vi.fn(), close: closeOcr }),
}));

import { draftFromExtraction } from "@/lib/invoices/import/pdf-extract";
import { parseInvoiceText, readInvoicePdfLocally } from "@/lib/invoices/import/pdf-local";

// pdf.js joins text items with line breaks, so labels and values often sit
// on separate lines.
const PDF_TEXT = `Test Co Ltd
1 Mill Lane, Leeds
hello@testco.example
VAT Registration No: GB 123 4567 89
INVOICE
Invoice Number
INV-0042
Invoice Date
3 November 2026
Due Date
03/12/2026
Bill to:
Acme Ltd
jane@acme.example
2 High St, York
Consulting  £1,000.00
Subtotal
£1,000.00
VAT @ 20%
£200.00
Total
£1,200.00
Amount due
£1,200.00`;

describe("parseInvoiceText", () => {
  it("reads labelled fields from a text-layer PDF", () => {
    expect(parseInvoiceText(PDF_TEXT)).toMatchObject({
      number: "INV-0042",
      issueDate: "2026-11-03",
      dueDate: "2026-12-03",
      clientName: "Acme Ltd",
      clientEmail: "jane@acme.example",
      currency: "GBP",
      netPounds: "1000.00",
      vatPounds: "200.00",
      grossPounds: "1200.00",
      amountPaidPounds: null,
      issuerName: null,
      lines: [],
    });
  });

  it("reads one-line labels, and takes the larger total when unlabelled", () => {
    const text = `Invoice #: 7781  Date: 15/01/2026
Total ex VAT £50.00
Total VAT £10.00
Total £60.00`;
    expect(parseInvoiceText(text)).toMatchObject({
      number: "7781",
      issueDate: "2026-01-15",
      dueDate: null,
      netPounds: "50.00",
      vatPounds: "10.00",
      grossPounds: "60.00",
    });
  });

  it("doesn't take the next label for the invoice number", () => {
    expect(parseInvoiceText("Invoice Number\nInvoice Date\n01/02/2026").number).toBeNull();
  });

  it("returns nulls when it finds nothing, never guesses", () => {
    expect(parseInvoiceText("Thank you for your business")).toMatchObject({
      number: null,
      issueDate: null,
      grossPounds: null,
      clientName: null,
      currency: null,
    });
  });

  it("notes a currency shown on the total, which blocks the draft", () => {
    const extraction = parseInvoiceText("Amount due: $99.00");
    expect(extraction.currency).toBe("USD");
    const { errors } = draftFromExtraction(extraction, {
      name: "Test Co",
      legalName: null,
      vatNumber: null,
    });
    expect(errors.join()).toContain("Alfa only holds invoices in GBP");
  });
});

describe("readInvoicePdfLocally", () => {
  beforeEach(() => {
    extractPdfTextWithFallback.mockReset();
    closeOcr.mockClear();
  });

  it("parses whatever text the PDF (or its OCR) gives", async () => {
    extractPdfTextWithFallback.mockResolvedValue(PDF_TEXT);
    expect((await readInvoicePdfLocally(Buffer.from("%PDF-"), 5_000)).number).toBe("INV-0042");
    expect(closeOcr).toHaveBeenCalled();
  });

  it("fails when there's no text at all, so the caller leaves a blank draft", async () => {
    extractPdfTextWithFallback.mockResolvedValue("  ");
    await expect(readInvoicePdfLocally(Buffer.from("%PDF-"), 5_000)).rejects.toThrow();
  });

  it("gives up when OCR runs past its time, and stops the worker", async () => {
    extractPdfTextWithFallback.mockReturnValue(new Promise(() => {}));
    await expect(readInvoicePdfLocally(Buffer.from("%PDF-"), 20)).rejects.toThrow(/took over/);
    expect(closeOcr).toHaveBeenCalled();
  });
});
