"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatGBP } from "@/lib/money";
import {
  commitExpenseImport,
  previewExpenseImport,
  type ExpenseImportPreviewResult,
} from "@/actions/expenses";
import type { ParsedExpenseImportRow } from "@/lib/expenses/import-csv";
import { expenseStatusLabel, type ExpenseStatus } from "@/lib/expenses/categories";

export function ExpenseImportButton({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedExpenseImportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite) return null;

  function resetState() {
    setRows(null);
    setError(null);
    setMessage(null);
  }

  function handleClose() {
    if (pending) return;
    setOpen(false);
    resetState();
  }

  function handlePreview(formData: FormData) {
    setError(null);
    setMessage(null);
    setRows(null);
    startTransition(async () => {
      const result: ExpenseImportPreviewResult = await previewExpenseImport(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows(result.rows);
    });
  }

  function handleCommit() {
    if (!rows) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await commitExpenseImport(JSON.stringify(rows));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      resetState();
      router.refresh();
    });
  }

  const hasErrors = rows?.some((r) => r.errors.length > 0) ?? false;

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Import CSV
      </Button>

      <Dialog
        open={open}
        onClose={handleClose}
        title="Import expenses from CSV"
        className="max-w-3xl"
      >
        <p className="text-sm text-muted">
          Columns: date, description, amount_gbp (or miles), category, paid_by (email or name),
          status (optional).
        </p>

        <form action={handlePreview} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="expenseCsv">CSV file</Label>
            <Input
              id="expenseCsv"
              name="csv"
              type="file"
              accept=".csv,text/csv"
              disabled={pending}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending && !rows ? "Parsing…" : "Preview import"}
          </Button>
        </form>

        {rows && rows.length > 0 && (
          <div className="mt-6 max-h-64 overflow-y-auto rounded-lg border border-border">
            <Table>
              <THead>
                <TR>
                  <TH>Row</TH>
                  <TH>Date</TH>
                  <TH>Description</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Issues</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.rowNumber} className={r.errors.length ? "bg-destructive/5" : undefined}>
                    <TD>{r.rowNumber}</TD>
                    <TD className="text-muted">{r.spentAt || "—"}</TD>
                    <TD>{r.description || "—"}</TD>
                    <TD>{expenseStatusLabel(r.status as ExpenseStatus)}</TD>
                    <TD className="text-right">
                      {r.amountPence > 0 ? formatGBP(r.amountPence) : "—"}
                    </TD>
                    <TD className="text-sm text-destructive">
                      {r.errors.length ? r.errors.join("; ") : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}

        <FieldError>{error}</FieldError>
        {message && <p className="mt-2 text-sm text-success">{message}</p>}

        {rows && rows.length > 0 && (
          <DialogActions>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setRows(null)}>
              Clear preview
            </Button>
            <Button type="button" disabled={pending || hasErrors} onClick={handleCommit}>
              {pending ? "Importing…" : `Import ${rows.length} expenses`}
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </>
  );
}
