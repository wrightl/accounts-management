"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  inspectInvoiceImportCsv,
  stageInvoiceImport,
} from "@/actions/invoice-import";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Select } from "@/components/ui/form";
import {
  IMPORT_FIELDS,
  INVOICE_IMPORT_TEMPLATE_CSV,
  type ColumnMapping,
  type ImportDateFormat,
  type ImportField,
} from "@/lib/invoices/import/fields";

export function InvoiceImportStart() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [dateFormat, setDateFormat] = useState<ImportDateFormat>("dmy");
  const [error, setError] = useState<string | null>(null);

  function inspect(selected: File | undefined) {
    setFile(selected ?? null);
    setHeaders(null);
    setError(null);
    if (!selected) return;
    const formData = new FormData();
    formData.set("csv", selected);
    startTransition(async () => {
      const result = await inspectInvoiceImportCsv(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHeaders(result.headers);
      setMapping(result.mapping);
      setRowCount(result.rowCount);
    });
  }

  function stage() {
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.set("csv", file);
    formData.set("mapping", JSON.stringify(mapping));
    formData.set("dateFormat", dateFormat);
    startTransition(async () => {
      const result = await stageInvoiceImport(formData);
      if (result.ok && result.id) router.push(`/invoices/import/${result.id}`);
      else if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <div>
        <Label htmlFor="invoice-csv">CSV file (up to 4 MB)</Label>
        <input
          id="invoice-csv"
          type="file"
          accept=".csv,text/csv"
          disabled={pending}
          aria-describedby={error ? "invoice-import-error" : undefined}
          onChange={(e) => inspect(e.target.files?.[0])}
        />
        <p className="mt-2 text-sm text-muted">
          One row per invoice, or one row per line with the invoice number repeated.{" "}
          <a
            className="underline"
            download="invoice-import-template.csv"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(INVOICE_IMPORT_TEMPLATE_CSV)}`}
          >
            Download a template
          </a>
        </p>
      </div>

      {headers ? (
        <>
          <div>
            <Label htmlFor="date-format">Dates in this file are written as</Label>
            <Select
              id="date-format"
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value as ImportDateFormat)}
            >
              <option value="dmy">Day first (31/01/2026)</option>
              <option value="mdy">Month first (01/31/2026)</option>
            </Select>
          </div>

          <div>
            <h2 className="font-display text-lg font-semibold">
              Match your columns ({rowCount} rows)
            </h2>
            <p className="mt-1 text-sm text-muted">
              Check any column called something like &quot;Amount&quot; or &quot;Reference&quot;,
              as these mean different things in different systems.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(Object.keys(IMPORT_FIELDS) as ImportField[]).map((field) => (
                <div key={field}>
                  <Label htmlFor={`map-${field}`}>{IMPORT_FIELDS[field].label}</Label>
                  <Select
                    id={`map-${field}`}
                    value={mapping[field] ?? ""}
                    onChange={(e) =>
                      setMapping((current) => ({
                        ...current,
                        [field]: e.target.value || undefined,
                      }))
                    }
                  >
                    <option value="">Not in this file</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <Button type="button" disabled={pending} onClick={stage}>
            {pending ? "Reading…" : "Review invoices"}
          </Button>
        </>
      ) : null}
      <FieldError id="invoice-import-error">{error}</FieldError>
    </div>
  );
}
