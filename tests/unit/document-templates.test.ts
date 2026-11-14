import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ get: vi.fn(async () => { throw new Error("no storage"); }) }),
}));
vi.mock("@/env", () => ({
  serverEnv: () => ({ EMAIL_FROM: "books@example.com" }),
}));

import { extractPdfText, isPdfBytes } from "@/lib/expenses/receipt-pdf";
import {
  DOCUMENT_KINDS,
  TEMPLATES,
  resolveTemplateKey,
  type DocumentKind,
} from "@/lib/pdf/templates/registry";
import { renderInvoiceTemplatePdf, renderSampleTemplatePdf } from "@/lib/pdf/templates/render";
import {
  SAMPLE_CLIENT,
  SAMPLE_COMPANY,
  SAMPLE_CREDIT_NOTE,
  SAMPLE_CREDIT_NOTE_DETAILS,
  SAMPLE_INVOICE,
  SAMPLE_LINES,
  SAMPLE_QUOTE,
} from "@/lib/pdf/templates/sample";
import { creditNoteView, invoiceView, quoteView } from "@/lib/pdf/templates/views";

function pageCount(bytes: Uint8Array): number {
  return (Buffer.from(bytes).toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}

/** Text with spacing and case removed: layouts letter-space and upper-case headings. */
function squash(text: string): string {
  return text.replace(/\s/g, "").toLowerCase();
}

const base = {
  client: SAMPLE_CLIENT,
  lines: SAMPLE_LINES,
  company: SAMPLE_COMPANY,
  contactEmail: "accounts@harbourstudio.example",
};

/** What each kind of document must say, whichever template draws it. */
const EXPECTED: Record<DocumentKind, string[]> = {
  invoice: [
    "Invoice",
    SAMPLE_INVOICE.number,
    "13/01/2026",
    "12/02/2026",
    "Total due",
    "Payment details",
    "Sort code: 60-83-71",
    `Please quote ${SAMPLE_INVOICE.number} as the payment reference.`,
    "Thank you for your business.",
  ],
  "credit-note": [
    "Credit note",
    SAMPLE_CREDIT_NOTE.number,
    "20/01/2026",
    "Credits invoice",
    SAMPLE_INVOICE.number,
    "Total credited",
    "Reason for credit",
    SAMPLE_CREDIT_NOTE_DETAILS.reason,
  ],
  quote: [
    "Quote",
    SAMPLE_QUOTE.number,
    "06/01/2026",
    "05/02/2026",
    "v2",
    "Quote total",
    "This quote is valid until 05/02/2026.",
    "Terms and conditions",
  ],
};

const SHARED = [
  "Northfield Partners",
  "Alex Morgan",
  "Harbour Studio",
  "Workshop planning and design",
  "Subtotal",
  "VAT",
  "£2,844.00",
  "10%",
];

describe("template library", () => {
  it("offers five named templates, each as an invoice, a credit note and a quote", () => {
    expect(TEMPLATES.map((template) => template.name)).toEqual([
      "Modern",
      "Classic",
      "Minimal",
      "Corporate",
      "Bold",
    ]);
    expect(DOCUMENT_KINDS).toEqual(["invoice", "credit-note", "quote"]);
  });

  it("falls back to the default for a missing or unknown key", () => {
    expect(resolveTemplateKey(null)).toBe("modern");
    expect(resolveTemplateKey("retired")).toBe("modern");
    expect(resolveTemplateKey("bold")).toBe("bold");
  });

  for (const template of TEMPLATES) {
    for (const kind of DOCUMENT_KINDS) {
      it(`${template.name} ${kind} shows the document's details`, async () => {
        const bytes = await renderSampleTemplatePdf({
          templateKey: template.key,
          kind,
          company: SAMPLE_COMPANY,
        });
        expect(isPdfBytes(Buffer.from(bytes))).toBe(true);
        expect(pageCount(bytes)).toBe(1);

        const text = squash(await extractPdfText(Buffer.from(bytes)));
        for (const expected of [...SHARED, ...EXPECTED[kind]]) {
          expect(text, `${template.name} ${kind}: "${expected}"`).toContain(squash(expected));
        }
      });
    }

    it(`${template.name} runs a long invoice onto more pages`, async () => {
      const bytes = await renderInvoiceTemplatePdf({
        templateKey: template.key,
        invoice: SAMPLE_INVOICE,
        client: SAMPLE_CLIENT,
        company: SAMPLE_COMPANY,
        lines: Array.from({ length: 60 }, (_, i) => ({
          description: `Line ${i + 1}`,
          quantity: 1,
          unitPricePence: 1000,
        })),
      });
      expect(pageCount(bytes)).toBeGreaterThan(1);
      const text = await extractPdfText(Buffer.from(bytes));
      expect(text).toContain("Line 60");
    });
  }

  // The three varieties of a template must look the same. Layouts are handed a
  // prepared view and nothing else, so they have no way to tell the kinds apart.
  it("keeps layouts free of anything specific to one kind of document", () => {
    const dir = join(process.cwd(), "src/lib/pdf/templates/layouts");
    const layouts = readdirSync(dir).filter((file) => file.endsWith(".tsx"));
    expect(layouts).toHaveLength(TEMPLATES.length);
    for (const file of layouts) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source, file).not.toMatch(/invoice|credit|quote|DocumentKind/i);
    }
  });
});

describe("document views", () => {
  it("fills every slot for an invoice", () => {
    const view = invoiceView({ ...base, invoice: SAMPLE_INVOICE });
    expect(view.title).toBe("Invoice");
    expect(view.meta.map((row) => row.label)).toEqual(["Issued", "Due"]);
    expect(view.recipient.label).toBe("Bill to");
    expect(view.subtotals.map((row) => row.label)).toEqual(["Subtotal", "VAT"]);
    expect(view.total).toEqual({ label: "Total due", value: "£2,844.00" });
    expect(view.detail?.title).toBe("Payment details");
    expect(view.showDiscount).toBe(true);
    expect(view.lines[2]).toMatchObject({ discount: "10%", amount: "£270.00" });
    expect(view.banner).toBeNull();
  });

  it("marks an imported invoice as a record and leaves out today's VAT number", () => {
    const view = invoiceView({ ...base, invoice: { ...SAMPLE_INVOICE, source: "import" } });
    expect(view.title).toBe("Invoice record");
    expect(view.banner).toContain("issued elsewhere");
    expect(view.sender.vatNumber).toBeNull();
    expect(view.footerParts.join(" ")).not.toContain("GB123456789");
  });

  it("fills every slot for a credit note", () => {
    const view = creditNoteView({
      ...base,
      creditNote: SAMPLE_CREDIT_NOTE,
      details: SAMPLE_CREDIT_NOTE_DETAILS,
    });
    expect(view.title).toBe("Credit note");
    expect(view.meta.map((row) => row.label)).toEqual(["Issued", "Credits invoice"]);
    expect(view.total.label).toBe("Total credited");
    expect(view.detail).toEqual({
      title: "Reason for credit",
      lines: [SAMPLE_CREDIT_NOTE_DETAILS.reason],
      footnote: null,
    });
  });

  it("fills every slot for a quote", () => {
    const view = quoteView({ ...base, quote: SAMPLE_QUOTE });
    expect(view.title).toBe("Quote");
    expect(view.meta.map((row) => row.label)).toEqual(["Issued", "Valid until", "Version"]);
    expect(view.recipient.label).toBe("Quoted to");
    expect(view.total.label).toBe("Quote total");
    expect(view.notes?.title).toBe("Terms and conditions");
    expect(view.detail?.lines).toEqual(["This quote is valid until 05/02/2026."]);
  });

  it("leaves out the VAT row for a business that isn't registered and charged none", () => {
    const view = invoiceView({
      ...base,
      company: { ...SAMPLE_COMPANY, vatNumber: null },
      invoice: { ...SAMPLE_INVOICE, vatPence: 0, grossPence: SAMPLE_INVOICE.netPence },
    });
    expect(view.subtotals.map((row) => row.label)).toEqual(["Subtotal"]);
  });
});
