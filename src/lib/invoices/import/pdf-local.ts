import {
  createSharedImageOcr,
  extractPdfTextWithFallback,
} from "@/lib/expenses/receipt-ocr";
import type { InvoiceExtraction } from "@/lib/invoices/import/pdf-extract";
import { parseImportDate } from "@/lib/invoices/import/parse";

/**
 * Read an invoice PDF without AI: its text layer, or Tesseract on page 1 for
 * a scan. Much rougher than the model, so every field needs checking. Gives
 * up after `timeoutMs`, stopping the OCR worker, so it fits the request.
 */
export async function readInvoicePdfLocally(
  bytes: Buffer,
  timeoutMs: number,
): Promise<InvoiceExtraction> {
  const ocr = createSharedImageOcr(1);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const text = await Promise.race([
      extractPdfTextWithFallback(bytes, ocr.ocrImage),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Local read took over ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    if (!text.trim()) throw new Error("No text found in the PDF");
    return parseInvoiceText(text);
  } finally {
    clearTimeout(timer);
    await ocr.close();
  }
}

const MONEY = String.raw`(-?[£$€]?\s?\d{1,3}(?:,\d{3})+\.\d{2}|-?[£$€]?\s?\d+\.\d{2})`;
const DATE = String.raw`(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?[\s-][A-Za-z]{3,9}\.?,?[\s-]\d{4})`;
/** What may sit between a label and its value: punctuation, spaces, line breaks. */
const GAP = String.raw`[^\dA-Za-z£$€]{0,20}`;

/** First value after any of the labels, tried in order. */
function labelled(text: string, labels: string[], value: string, gap = GAP): string | null {
  for (const label of labels) {
    const match = new RegExp(`(?:${label})${gap}${value}`, "i").exec(text);
    if (match) return match[1];
  }
  return null;
}

/** Every value after a label, for picking the largest of several "Total" lines. */
function allLabelled(text: string, label: string, value: string, gap = GAP): string[] {
  return [...text.matchAll(new RegExp(`(?:${label})${gap}${value}`, "gi"))].map((m) => m[1]);
}

function pounds(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.replace(/[£$€,\s]/g, "");
  return Number.isFinite(Number(value)) ? value : null;
}

function date(raw: string | null): string | null {
  if (!raw) return null;
  // parseImportDate wants "3 Nov 2026": drop ordinals and stray punctuation.
  const tidy = raw.replace(/(\d)(?:st|nd|rd|th)/i, "$1").replace(/[.,]/g, "").replace(/\s+/g, " ");
  return parseImportDate(tidy, "dmy");
}

function currencyOf(amount: string | null, text: string): string | null {
  if (amount?.includes("£")) return "GBP";
  if (amount?.includes("$")) return "USD";
  if (amount?.includes("€")) return "EUR";
  if (/£|\bGBP\b/.test(text)) return "GBP";
  return null;
}

const NOT_VAT = String.raw`(?!\s*(?:vat|tax|net|ex\b|excl|excluding))`;
const GROSS_LABELS = [
  String.raw`amount\s*due`,
  String.raw`balance\s*due`,
  String.raw`total\s*due`,
  String.raw`total\s*payable`,
  String.raw`grand\s*total`,
  String.raw`invoice\s*total`,
  String.raw`total\s*(?:inc|incl|including)\.?\s*vat`,
];

/**
 * Best-effort read of invoice text from labels such as "Invoice No",
 * "Due date" and "Total". Anything not found is null, like the model's
 * answer, and the reviewer fills it in.
 */
export function parseInvoiceText(text: string): InvoiceExtraction {
  const number = labelled(
    text,
    [String.raw`invoice\s*(?:no\.?|number|num|#)`, String.raw`\binv\s*(?:no\.?|#)`],
    // Must hold a digit, so the next label ("Invoice Date") isn't taken for it.
    String.raw`((?=[A-Z/_.-]*\d)[A-Z0-9][A-Z0-9/_.-]{0,39})`,
    "[\\s:#.]{0,20}",
  );
  const issue = labelled(
    text,
    [
      String.raw`invoice\s*date`,
      String.raw`issue\s*date`,
      String.raw`date\s*of\s*issue`,
      String.raw`tax\s*point`,
      String.raw`(?<!due\s)\bdate\b`,
    ],
    DATE,
  );
  const due = labelled(
    text,
    [String.raw`due\s*date`, String.raw`payment\s*due`, String.raw`due\s*(?:by|on)`],
    DATE,
  );

  const net = labelled(
    text,
    [
      String.raw`sub-?\s*total`,
      String.raw`total\s*(?:ex|excl|excluding)\.?\s*vat`,
      String.raw`net\s*(?:total|amount)`,
    ],
    MONEY,
  );
  const vat = labelled(
    text,
    [String.raw`(?<!(?:ex|excl|excluding|inc|incl|including)\.?\s)(?:total\s*)?\bvat\b(?:\s*(?:total|amount))?`],
    MONEY,
    // Allows a rate such as "VAT @ 20%" before the amount.
    String.raw`${GAP}(?:\d{1,2}(?:\.\d+)?\s*%${GAP})?`,
  );
  const gross =
    labelled(text, GROSS_LABELS, MONEY) ??
    allLabelled(text, String.raw`\btotal\b${NOT_VAT}`, MONEY).sort(
      (a, b) => Number(pounds(b)) - Number(pounds(a)),
    )[0] ??
    null;
  const paid = labelled(
    text,
    [String.raw`amount\s*paid`, String.raw`payments?\s*received`],
    MONEY,
  );

  // The client is whoever the invoice is addressed to; the issuer's own
  // details (usually at the top) mustn't be taken for theirs.
  const billTo = /(?:bill(?:ed)?\s*to|invoice\s*to|invoiced\s*to|customer)\s*:?\s*\n?([\s\S]{0,300})/i.exec(text);
  const block = billTo?.[1] ?? "";
  const clientName =
    block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /[A-Za-z]/.test(line) && !line.includes("@")) ?? null;
  const clientEmail = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(block)?.[0] ?? null;

  return {
    issuerName: null,
    issuerVatNumber: null,
    invoiceCount: null,
    number,
    issueDate: date(issue),
    dueDate: date(due),
    clientName,
    clientCompany: null,
    clientEmail,
    clientAddress: null,
    currency: currencyOf(gross, text),
    netPounds: pounds(net),
    vatPounds: pounds(vat),
    grossPounds: pounds(gross),
    amountPaidPounds: pounds(paid),
    paidDate: null,
    lines: [],
  };
}
