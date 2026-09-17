import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getMock = vi.fn();

vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ get: getMock }),
}));

vi.mock("@/env", () => ({
  serverEnv: () => ({ EMAIL_FROM: "books@example.com" }),
}));

import { extractPdfText, isPdfBytes } from "@/lib/expenses/receipt-pdf";
import { renderInvoicePdfV2 } from "@/lib/invoices/pdf-v2";
import type { PdfClient, PdfCompany, PdfInvoice, PdfLine } from "@/lib/invoices/pdf";

/** 1×1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const company: PdfCompany = {
  name: "Harbor Digital",
  legalName: "Harbor Digital Ltd",
  companyNumber: "12345678",
  addressLines: "1 Quay Street\nBristol\nBS1 1AA",
  email: "accounts@harbor.example",
  bankName: "Starling Bank",
  bankAccountName: "Harbor Digital Ltd",
  sortCode: "60-83-71",
  accountNumber: "12345678",
  logoUrl: "company/harbor/logo.png",
};

const client: PdfClient = {
  name: "Alex Client",
  companyName: "Client Co",
  email: "alex@client.example",
  addressLines: "10 High Street\nLondon\nE1 1AA",
};

const invoice: PdfInvoice = {
  number: "INV-2026-0001",
  issueDate: "2026-03-01",
  dueDate: "2026-03-31",
  notes: "Thank you for your business.",
  netPence: 150000,
  grossPence: 150000,
  currency: "GBP",
};

const lines: PdfLine[] = [
  { description: "Discovery workshop", quantity: 1, unitPricePence: 100000 },
  { description: "Design sprint", quantity: 2, unitPricePence: 25000 },
];

describe("renderInvoicePdfV2", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("renders a PDF with invoice content when company logo is present", async () => {
    getMock.mockResolvedValue({
      body: TINY_PNG,
      contentType: "image/png",
    });

    const bytes = await renderInvoicePdfV2({ invoice, client, lines, company });
    expect(isPdfBytes(Buffer.from(bytes))).toBe(true);
    expect(getMock).toHaveBeenCalledWith("company/harbor/logo.png");

    const text = await extractPdfText(Buffer.from(bytes));
    expect(text).toContain("INV-2026-0001");
    expect(text).toContain("Harbor Digital");
    expect(text).toContain("Client Co");
    expect(text).toContain("Discovery workshop");
    expect(text).toContain("accounts@harbor.example");
    expect(text).toMatch(/Subtotal/i);
    expect(text).toMatch(/Total due/i);
    expect(text).toContain("Please quote INV-2026-0001 as the payment reference.");
    expect(text).toContain("Thank you for your business.");
    expect(text).toContain("01/03/2026");
    expect(text).toContain("31/03/2026");
  });

  it("renders without a logo when logoUrl is missing", async () => {
    const bytes = await renderInvoicePdfV2({
      invoice,
      client,
      lines,
      company: { ...company, logoUrl: null },
    });
    expect(isPdfBytes(Buffer.from(bytes))).toBe(true);
    expect(getMock).not.toHaveBeenCalled();

    const text = await extractPdfText(Buffer.from(bytes));
    expect(text).toContain("INV-2026-0001");
    expect(text).toContain("Harbor Digital");
  });

  it("omits logo when storage read fails", async () => {
    getMock.mockRejectedValue(new Error("not found"));

    const bytes = await renderInvoicePdfV2({ invoice, client, lines, company });
    expect(isPdfBytes(Buffer.from(bytes))).toBe(true);

    const text = await extractPdfText(Buffer.from(bytes));
    expect(text).toContain("INV-2026-0001");
  });

  it("produces a valid multi-page PDF for long line lists", async () => {
    getMock.mockResolvedValue({
      body: TINY_PNG,
      contentType: "image/png",
    });

    const manyLines: PdfLine[] = Array.from({ length: 40 }, (_, i) => ({
      description: `Line item ${i + 1} — consulting delivery`,
      quantity: 1,
      unitPricePence: 1000 + i,
    }));

    const bytes = await renderInvoicePdfV2({
      invoice,
      client,
      lines: manyLines,
      company,
    });
    expect(isPdfBytes(Buffer.from(bytes))).toBe(true);

    const text = await extractPdfText(Buffer.from(bytes));
    expect(text).toContain("Line item 1");
    expect(text).toContain("Line item 40");
  });
});
