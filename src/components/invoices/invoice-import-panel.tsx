"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  commitInvoiceImport,
  previewInvoiceImport,
  type InvoiceImportPreviewResult,
} from "@/actions/invoices";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import {
  INVOICE_IMPORT_TEMPLATE_CSV,
  invoiceImportHasErrors,
  parseInvoiceImportCsvFile,
  type ParsedInvoiceImportRow,
} from "@/lib/invoices/import-csv";
import { formatGBP } from "@/lib/money";

export function InvoiceImportButton({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedInvoiceImportRow[] | null>(null);
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
  } = useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite) return null;

  function resetState() {
    setRows(null);
    clearAll();
  }

  function handleClose() {
    if (pending) return;
    setOpen(false);
    resetState();
  }

  function handlePreview(formData: FormData) {
    clearAll();
    setRows(null);
    const clientParsed = parseInvoiceImportCsvFile(formData);
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(formRef.current, clientParsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result: InvoiceImportPreviewResult =
        await previewInvoiceImport(formData);
      if (!result.ok) {
        applyFail(result);
        scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        return;
      }
      setRows(result.rows);
    });
  }

  function handleCommit() {
    if (!rows) return;
    clearAll();
    startTransition(async () => {
      const result = await commitInvoiceImport(JSON.stringify(rows));
      if (!applyActionResult(result)) {
        if (!result.ok) {
          scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        }
        return;
      }
      toast(
        `Imported ${result.count ?? 0} invoice${
          (result.count ?? 0) === 1 ? "" : "s"
        }.`,
      );
      setOpen(false);
      resetState();
      router.refresh();
    });
  }

  const hasErrors = rows ? invoiceImportHasErrors(rows) : false;

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Import CSV
      </Button>

      <Dialog
        open={open}
        onClose={handleClose}
        title="Import invoices from CSV"
        className="max-w-4xl"
      >
        <p className="text-sm text-muted">
          Import open or partly paid invoices (any date), plus fully paid
          invoices issued in the current financial year. Older paid history
          stays in your spreadsheet archive.
        </p>
        <p className="mt-2 text-sm">
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(INVOICE_IMPORT_TEMPLATE_CSV)}`}
            download="invoices-template.csv"
            className="font-medium text-navy underline underline-offset-2"
          >
            Download template
          </a>
        </p>

        <form
          ref={formRef}
          noValidate
          onSubmit={preventResetSubmit(handlePreview)}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="invoiceCsv" required>
              CSV file
            </Label>
            <Input
              id="invoiceCsv"
              name="csv"
              type="file"
              accept=".csv,text/csv"
              required
              disabled={pending}
              onChange={() => clearField("csv")}
            />
            <FieldError>{fieldErrors.csv}</FieldError>
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending && !rows ? "Reading…" : "Preview"}
          </Button>
        </form>
        <FieldError>{error}</FieldError>

        {rows ? (
          <div className="mt-4 max-h-80 overflow-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Row</TH>
                  <TH>Client</TH>
                  <TH>Number</TH>
                  <TH>Issue</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Gross</TH>
                  <TH>Errors</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.rowNumber}>
                    <TD className="text-muted">{r.rowNumber}</TD>
                    <TD>
                      {r.clientName || r.clientEmail || "—"}
                      {r.clientCompany ? (
                        <span className="block text-xs text-muted">
                          {r.clientCompany}
                        </span>
                      ) : null}
                    </TD>
                    <TD className="text-muted">{r.number ?? "(auto)"}</TD>
                    <TD className="text-muted">{r.issueDate || "—"}</TD>
                    <TD className="text-sm">{r.status}</TD>
                    <TD className="text-right font-medium">
                      {formatGBP(r.grossPence)}
                    </TD>
                    <TD className="text-sm text-destructive">
                      {r.errors.join("; ") || "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        ) : null}

        <DialogActions>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={handleClose}
          >
            Cancel
          </Button>
          {rows ? (
            <Button
              type="button"
              disabled={pending || hasErrors}
              onClick={handleCommit}
            >
              {pending ? "Importing…" : "Import"}
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>
    </>
  );
}
