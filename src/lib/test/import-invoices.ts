import {
  commitInvoiceImportChunk,
  inspectInvoiceImportCsv,
  stageInvoiceImport,
} from "@/actions/invoice-import";
import type { ColumnMapping, ImportDateFormat } from "@/lib/invoices/import/fields";

function csvForm(csv: string) {
  const form = new FormData();
  form.set("csv", new File([csv], "invoices.csv", { type: "text/csv" }));
  return form;
}

/** Upload a CSV with its suggested column mapping (plus overrides) and stage it. */
export async function stageCsv(
  csv: string,
  options: { mapping?: ColumnMapping; dateFormat?: ImportDateFormat } = {},
): Promise<string> {
  const inspected = await inspectInvoiceImportCsv(csvForm(csv));
  if (!inspected.ok) throw new Error(inspected.error);
  const form = csvForm(csv);
  form.set("mapping", JSON.stringify({ ...inspected.mapping, ...options.mapping }));
  form.set("dateFormat", options.dateFormat ?? "dmy");
  const staged = await stageInvoiceImport(form);
  if (!staged.ok || !staged.id) throw new Error(staged.ok ? "No batch" : staged.error);
  return staged.id;
}

/** Commit every chunk of a staged import, as the review page does. */
export async function commitAll(batchId: string): Promise<void> {
  for (;;) {
    const result = await commitInvoiceImportChunk(batchId);
    if (!result.ok) throw new Error(result.error);
    if (result.remaining === 0 || result.committed === 0) return;
  }
}

export async function importCsv(csv: string): Promise<string> {
  const batchId = await stageCsv(csv);
  await commitAll(batchId);
  return batchId;
}
