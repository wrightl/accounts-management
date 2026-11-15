import "server-only";
import { getCreditNoteDetail } from "@/lib/credit-notes/queries";
import { csvCell } from "@/lib/csv/write";
import { todayIsoDate } from "@/lib/dates";
import { safeFilename } from "@/lib/files";
import { loadOriginalInvoiceDocument } from "@/lib/invoices/original-document";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import {
  renderCompanyCreditNotePdf,
  renderCompanyInvoicePdf,
} from "@/lib/pdf/templates/company-render";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { getStorage } from "@/lib/storage";
import { buildXlsx } from "@/lib/xlsx/write";
import { blockingItems, type Check, type CheckItem } from "@/lib/year-end/checks";
import { loadYearEndData, type YearEndData } from "@/lib/year-end/data";
import { deriveFigures, type Figures } from "@/lib/year-end/figures";
import { periodLabel, type PackPeriod } from "@/lib/year-end/period";
import { sheetTextRows, toXlsxSheets, type PackSheet } from "@/lib/year-end/sheets";
import { buildWorkbook, type Workbook } from "@/lib/year-end/workbook";
import { zipStoreStream as zipStream, type ZipEntry } from "@/lib/zip/store";

export { listStoreZipEntries, type ZipEntry } from "@/lib/zip/store";

export type PackFormat = "xlsx" | "csv";

export const WORKBOOK_PATH = "year-end-pack.xlsx";

const FETCH_CONCURRENCY = 5;

export type YearEndPack = {
  data: YearEndData;
  figures: Figures;
  workbook: Workbook;
  checks: Check[];
};

/**
 * The pack for a period as the Year end page shows it: the records, the
 * figures, the checks and the workbook, before any file is fetched.
 */
export async function prepareYearEndPack(options: {
  companyId: string;
  period: PackPeriod;
  /** The plan includes VAT export; the VAT tab also needs the business to be VAT registered. */
  includeVat: boolean;
}): Promise<YearEndPack> {
  const data = await loadYearEndData(options.companyId, options.period);
  const figures = deriveFigures(data);
  const workbook = buildWorkbook(data, figures, {
    includeVat: options.includeVat,
    exportedOn: todayIsoDate(),
  });
  return { data, figures, workbook, checks: workbook.checks };
}

export type YearEndPackResult =
  | { ok: true; filename: string; stream: ReadableStream<Uint8Array>; outstandingChecks: number }
  /** A blocking check has items: nothing is produced until they are fixed. */
  | { ok: false; blockers: CheckItem[] };

/**
 * Stream the year-end pack: the workbook (or one CSV per tab), receipts named
 * by expense reference, and invoice and credit note PDFs named by number.
 * Queries run before this resolves, so they can still fail the request; files
 * are fetched as the stream is read.
 */
export async function streamYearEndPack(options: {
  companyId: string;
  period: PackPeriod;
  includeVat: boolean;
  format?: PackFormat;
}): Promise<YearEndPackResult> {
  const { companyId, period, includeVat } = options;
  const format = options.format ?? "xlsx";
  const { data, figures, checks } = await prepareYearEndPack(options);
  const blockers = blockingItems(checks);
  if (blockers.length > 0) return { ok: false, blockers };

  const warnings: string[] = [];
  const written = new Set<string>();
  const used = new Set<string>();

  const invoiceFiles = new Map(
    data.invoices.map((inv) => [
      inv.id,
      uniqueZipPath(`invoices/${safeFilename(`${inv.number}.pdf`)}`, used),
    ]),
  );
  const creditNoteFiles = new Map(
    data.creditNotes.map((note) => [
      note.id,
      uniqueZipPath(`credit-notes/${safeFilename(`${note.number}.pdf`)}`, used),
    ]),
  );
  // A receipt is named after its expense's reference, as the Expenses tab shows it.
  const receiptFiles = [...data.expenses.values()].flatMap((expense) => {
    const ref = figures.expenseRef.get(expense.id);
    if (!ref) return [];
    return expense.receipts.map((receipt) => ({
      expense,
      receipt,
      zipPath: uniqueZipPath(`receipts/${ref}${extension(receipt.filename)}`, used),
    }));
  });
  const receiptPathsByExpense = Map.groupBy(receiptFiles, (f) => f.expense.id);
  const ifWritten = (path: string | undefined) => (path && written.has(path) ? path : undefined);

  async function* entries(): AsyncGenerator<[string, ZipEntry]> {
    yield* fetchInBatches(data.invoices, written, async (inv) => {
      const path = invoiceFiles.get(inv.id)!;
      try {
        const original = await loadOriginalInvoiceDocument(inv);
        if (original) return [path, original];
        if (inv.originalDocumentPath) {
          warnings.push(`Original of invoice ${inv.number} is missing, so a generated copy is included.`);
        }
        // An import's cached PDF could predate the record marking.
        return [path, await resolveInvoicePdf(companyId, inv.id, inv.source === "import" ? null : inv.pdfBlobPath)];
      } catch (err) {
        warnings.push(`Invoice ${inv.number} has no PDF in this pack (${formatError(err)}).`);
        return null;
      }
    });

    const company = data.company;
    yield* fetchInBatches(data.creditNotes, written, async (note) => {
      try {
        const detail = await getCreditNoteDetail(companyId, note.id);
        if (!detail) throw new Error("not found");
        const bytes = await renderCompanyCreditNotePdf(company, {
          creditNote: detail.creditNote,
          invoiceNumber: detail.invoice.number,
          client: detail.client,
          lines: detail.lines,
        });
        return [creditNoteFiles.get(note.id)!, bytes];
      } catch (err) {
        warnings.push(`Credit note ${note.number} has no PDF in this pack (${formatError(err)}).`);
        return null;
      }
    });

    yield* fetchInBatches(receiptFiles, written, async ({ expense, receipt, zipPath }) => {
      try {
        return [zipPath, await loadReceiptBytes(receipt.blobPath)];
      } catch (err) {
        warnings.push(
          `Receipt for ${figures.expenseRef.get(expense.id)} (${expense.description}) could not be included (${formatError(err)}).`,
        );
        return null;
      }
    });

    // Built after the files are fetched, so cells only link to files that are in the zip.
    const { sheets } = buildWorkbook(data, figures, {
      includeVat,
      exportedOn: todayIsoDate(),
      invoiceFile: (id) => ifWritten(invoiceFiles.get(id)),
      creditNoteFile: (id) => ifWritten(creditNoteFiles.get(id)),
      receiptFiles: (id) =>
        (receiptPathsByExpense.get(id) ?? []).map((f) => f.zipPath).filter((p) => written.has(p)),
    });
    if (format === "xlsx") {
      yield [WORKBOOK_PATH, await buildXlsx(toXlsxSheets(sheets))];
    } else {
      for (const [path, csv] of csvFiles(sheets)) yield [path, csv];
    }

    // Last, so it can list every warning from the files above.
    yield ["README.txt", buildReadme({ period, format, sheets, warnings })];
  }

  return {
    ok: true,
    filename: `year-end-pack-${period.from}_${period.to}${format === "csv" ? "-csv" : ""}.zip`,
    stream: zipStoreStream(entries()),
    outstandingChecks: checks.reduce((total, c) => total + c.items.length, 0),
  };
}

/** One CSV per tab, numbered in tab order: `csv/05-sales-invoices.csv`. */
export function csvFiles(sheets: PackSheet[]): [string, string][] {
  return sheets.map((sheet, i) => {
    const slug = sheet.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return [`csv/${String(i + 1).padStart(2, "0")}-${slug}.csv`, toCsv(sheetTextRows(sheet))];
  });
}

/** Every cell goes through csvCell, so outside text can't run as a spreadsheet formula. */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

function buildReadme({
  period,
  format,
  sheets,
  warnings,
}: {
  period: PackPeriod;
  format: PackFormat;
  sheets: PackSheet[];
  warnings: string[];
}): string {
  const lines = [
    "Alfa year-end pack",
    `Accounting period: ${periodLabel(period)}`,
    "",
    "In this zip:",
    format === "xlsx"
      ? `  ${WORKBOOK_PATH}: the workbook. Start with the Cover tab.`
      : "  csv/: one CSV file per tab, numbered in order. Start with 01-cover.csv.",
    "  receipts/: receipt files, named by the expense Ref on the Expenses tab.",
    "  invoices/: sales invoice PDFs, named by invoice number.",
    "  credit-notes/: credit note PDFs, named by number.",
    "",
    "Tabs:",
    ...sheets.map((s) => `  ${s.name}: ${s.about}`),
  ];
  if (format === "xlsx") {
    lines.push(
      "",
      "Opening linked files:",
      "  Extract the whole zip first and keep the workbook beside the receipts, invoices and credit-notes folders.",
      "  Excel for Mac asks for permission the first time you open a linked file. Click Select, then choose the",
      "  extracted folder rather than the single file, so every file in it opens without asking again.",
    );
  }
  if (warnings.length > 0) {
    lines.push("", "Files that could not be included:", ...warnings.map((w) => `  - ${w}`));
  }
  return lines.join("\n");
}

/**
 * Fetch a batch at a time, so a large pack only holds one batch in memory.
 * Adds each path to `written` as it goes into the zip.
 */
async function* fetchInBatches<T>(
  items: readonly T[],
  written: Set<string>,
  fetchFile: (item: T) => Promise<[string, Uint8Array] | null>,
): AsyncGenerator<[string, ZipEntry]> {
  for (let i = 0; i < items.length; i += FETCH_CONCURRENCY) {
    const files = await Promise.all(items.slice(i, i + FETCH_CONCURRENCY).map(fetchFile));
    for (const file of files) {
      if (!file) continue;
      written.add(file[0]);
      yield file;
    }
  }
}

/** `.pdf` from `Receipt March.PDF`; empty when the name has no usable extension. */
function extension(filename: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(filename.trim());
  return match ? `.${match[1]!.toLowerCase()}` : "";
}

/** Suffix a repeated path (`a.jpg`, `a-2.jpg`). Ignores case, as unzipping on macOS and Windows does. */
function uniqueZipPath(path: string, used: Set<string>): string {
  const dot = path.lastIndexOf(".");
  const hasExtension = dot > path.lastIndexOf("/") + 1;
  const stem = hasExtension ? path.slice(0, dot) : path;
  const ext = hasExtension ? path.slice(dot) : "";
  let candidate = path;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    candidate = `${stem}-${n}${ext}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Resolve invoice PDF bytes from storage or regenerate (no DB cache update). */
export async function resolveInvoicePdf(
  companyId: string,
  invoiceId: string,
  pdfBlobPath: string | null,
): Promise<Uint8Array> {
  if (pdfBlobPath?.includes(".v2.")) {
    try {
      const obj = await getStorage().get(pdfBlobPath);
      return new Uint8Array(obj.body);
    } catch {
      // Fall through to regenerate.
    }
  }
  const detail = await getInvoiceDetail(companyId, invoiceId);
  if (!detail) throw new Error("Invoice not found");
  const company = await getOrCreateCompanySettings(companyId);
  return renderCompanyInvoicePdf(company, detail);
}

/** Load receipt bytes from private storage. */
export async function loadReceiptBytes(blobPath: string): Promise<Uint8Array> {
  const obj = await getStorage().get(blobPath);
  return new Uint8Array(obj.body);
}

/** The pack's zip stream; a failure is logged as the year-end pack's. */
export function zipStoreStream(
  entries: AsyncIterable<[string, ZipEntry]>,
): ReadableStream<Uint8Array> {
  return zipStream(entries, "Year-end pack");
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
