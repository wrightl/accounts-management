"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  commitClientImport,
  previewClientImport,
  type ClientImportPreviewResult,
} from "@/actions/clients";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import {
  CLIENT_IMPORT_TEMPLATE_CSV,
  parseClientImportCsvFile,
  type ParsedClientImportRow,
} from "@/lib/clients/import-csv";

export function ClientImportButton({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedClientImportRow[] | null>(null);
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
    const clientParsed = parseClientImportCsvFile(formData);
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(formRef.current, clientParsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result: ClientImportPreviewResult = await previewClientImport(formData);
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
      const result = await commitClientImport(JSON.stringify(rows));
      if (!applyActionResult(result)) {
        if (!result.ok) {
          scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        }
        return;
      }
      toast(
        `Imported ${result.count ?? 0} client${
          (result.count ?? 0) === 1 ? "" : "s"
        }.`,
      );
      setOpen(false);
      resetState();
      router.refresh();
    });
  }

  const hasErrors =
    rows?.some(
      (r) => r.errors.length > 0 && r.action !== "skip_duplicate_in_file",
    ) ?? false;

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Import CSV
      </Button>

      <Dialog
        open={open}
        onClose={handleClose}
        title="Import clients from CSV"
        className="max-w-3xl"
      >
        <p className="text-sm text-muted">
          Columns: name (required), company_name, email, address_lines, notes.
          Matching email updates an existing client.
        </p>
        <p className="mt-2 text-sm">
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(CLIENT_IMPORT_TEMPLATE_CSV)}`}
            download="clients-template.csv"
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
            <Label htmlFor="clientCsv" required>
              CSV file
            </Label>
            <Input
              id="clientCsv"
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
                  <TH>Name</TH>
                  <TH>Company</TH>
                  <TH>Email</TH>
                  <TH>Action</TH>
                  <TH>Errors</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.rowNumber}>
                    <TD className="text-muted">{r.rowNumber}</TD>
                    <TD>{r.name || "—"}</TD>
                    <TD className="text-muted">{r.companyName ?? "—"}</TD>
                    <TD className="text-muted">{r.email ?? "—"}</TD>
                    <TD className="text-sm">
                      {r.action === "update"
                        ? "Update"
                        : r.action === "skip_duplicate_in_file"
                          ? "Skip"
                          : "Create"}
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
          <Button type="button" variant="ghost" disabled={pending} onClick={handleClose}>
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
