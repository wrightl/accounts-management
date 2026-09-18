"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import {
  getBankImportContext,
  importBankCsv,
  type SuggestedMatch,
} from "@/actions/bank";
import { parseCsvLine } from "@/lib/bank/csv-client";
import type { GenericCsvMapping } from "@/lib/bank/types";
import type { BankProviderId } from "@/lib/bank/providers";
import { isGenericCsvMapping } from "@/lib/bank/generic-csv-client";

const MAP_FIELDS: {
  key: keyof GenericCsvMapping;
  label: string;
  required?: boolean;
}[] = [
  { key: "date", label: "Date", required: true },
  { key: "amount", label: "Amount (signed)" },
  { key: "moneyOut", label: "Money out / Debit" },
  { key: "moneyIn", label: "Money in / Credit" },
  { key: "counterparty", label: "Counterparty" },
  { key: "reference", label: "Reference" },
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "transactionId", label: "Transaction ID" },
];

function guessMapping(headers: string[]): GenericCsvMapping {
  const find = (...names: string[]) =>
    headers.find((h) => names.includes(h.toLowerCase().replace(/\s+/g, " "))) ??
    null;
  return {
    date: find("date", "transaction date", "created") ?? headers[0] ?? "",
    amount: find("amount", "amount (gbp)", "value"),
    moneyOut: find("money out", "debit", "debit amount", "paid out", "out"),
    moneyIn: find("money in", "credit", "credit amount", "paid in", "in"),
    counterparty: find("counter party", "counterparty", "name", "description", "payee name"),
    reference: find("reference", "payment reference"),
    description: find("description", "narrative", "memo"),
    category: find("category", "spending category"),
    transactionId: find("transaction id", "id"),
  };
}

export function BankImportForm({
  onSuccess,
  onSuggestions,
}: {
  onSuccess?: () => void;
  onSuggestions?: (suggestions: SuggestedMatch[]) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loadingContext, setLoadingContext] = useState(true);
  const [provider, setProvider] = useState<BankProviderId | null>(null);
  const [bankLabelText, setBankLabelText] = useState("your bank");
  const [importHelp, setImportHelp] = useState<string | null>(null);
  const [expectedColumns, setExpectedColumns] = useState<string[]>([]);
  const [savedMapping, setSavedMapping] = useState<GenericCsvMapping | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<GenericCsvMapping | null>(null);
  const [forceMapper, setForceMapper] = useState(false);
  const [matchedColumns, setMatchedColumns] = useState<
    { role: string; header: string }[]
  >([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ctx = await getBankImportContext();
      if (cancelled) return;
      setLoadingContext(false);
      if (!ctx.ok) {
        setError(ctx.error);
        return;
      }
      setProvider(ctx.provider);
      setBankLabelText(ctx.bankLabel);
      setImportHelp(ctx.importHelp);
      setExpectedColumns(ctx.expectedColumns);
      if (ctx.savedMapping && isGenericCsvMapping(ctx.savedMapping)) {
        setSavedMapping(ctx.savedMapping);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isOther = provider === "other";
  const needsMapping = isOther || forceMapper;

  const headerOptions = useMemo(
    () => [
      { value: "", label: "— Not mapped —" },
      ...headers.map((h) => ({ value: h, label: h })),
    ],
    [headers],
  );

  const openMapperForFile = async (file: File) => {
    const text = await file.text();
    const lines = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    if (lines.length < 1) {
      setError("CSV file is empty");
      return;
    }
    const rawHeaders = parseCsvLine(lines[0]);
    setHeaders(rawHeaders);
    const samples: string[][] = [];
    for (let i = 1; i < Math.min(lines.length, 4); i++) {
      samples.push(parseCsvLine(lines[i]));
    }
    setSampleRows(samples);

    const guessed = guessMapping(rawHeaders);
    if (
      savedMapping &&
      savedMapping.date &&
      rawHeaders.some(
        (h) => h.toLowerCase() === savedMapping.date.toLowerCase(),
      )
    ) {
      setMapping(savedMapping);
    } else {
      setMapping(guessed);
    }
    setForceMapper(true);
  };

  const onFileChange = async (file: File | null) => {
    setError(null);
    setMessage(null);
    setHeaders([]);
    setSampleRows([]);
    setMapping(null);
    setMatchedColumns([]);
    setPendingFile(file);
    if (!file) return;
    if (needsMapping || isOther) {
      await openMapperForFile(file);
    }
  };

  if (loadingContext) {
    return <p className="text-sm text-muted">Loading import settings…</p>;
  }

  if (!provider) {
    return (
      <div className="space-y-3">
        <FieldError>{error ?? "Choose your bank in Settings before importing."}</FieldError>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      action={(formData) => {
        setError(null);
        setMessage(null);
        if (needsMapping) {
          if (!mapping?.date) {
            setError("Map a Date column before importing.");
            return;
          }
          const hasAmount = Boolean(mapping.amount?.trim());
          const hasSplit = Boolean(
            mapping.moneyOut?.trim() || mapping.moneyIn?.trim(),
          );
          if (!hasAmount && !hasSplit) {
            setError(
              "Map either an Amount column, or Money out and Money in columns.",
            );
            return;
          }
          formData.set("csvMapping", JSON.stringify(mapping));
          formData.set("forceMapper", "1");
        }
        startTransition(async () => {
          const result = await importBankCsv(formData);
          if (!result.ok) {
            if (result.needsMapping && pendingFile) {
              setError(result.error);
              await openMapperForFile(pendingFile);
              return;
            }
            setError(result.error);
            return;
          }
          const nonGbp =
            result.skippedNonGbp && result.skippedNonGbp > 0
              ? ` ${result.skippedNonGbp} non-GBP row${result.skippedNonGbp === 1 ? "" : "s"} skipped.`
              : "";
          setMessage(
            `Imported ${result.inserted ?? 0} new rows (${result.skipped ?? 0} duplicates skipped).${nonGbp}`,
          );
          if (result.matchedColumns?.length) {
            setMatchedColumns(result.matchedColumns);
          }
          setForceMapper(false);
          router.refresh();
          onSuccess?.();
          if (result.suggestions?.length) {
            onSuggestions?.(result.suggestions);
          }
        });
      }}
    >
      <p className="text-sm text-muted">
        Importing as <span className="font-medium text-foreground">{bankLabelText}</span>
        {isOther || forceMapper
          ? " — map your CSV columns below."
          : ". Change the bank in Settings if this is wrong."}
      </p>

      {importHelp && !forceMapper ? (
        <p className="text-xs text-muted">{importHelp}</p>
      ) : null}

      {!isOther && !forceMapper && expectedColumns.length > 0 ? (
        <p className="text-xs text-muted">
          Expected columns: {expectedColumns.join(", ")}.
        </p>
      ) : null}

      {matchedColumns.length > 0 && !forceMapper ? (
        <div className="rounded-xl border border-border bg-wash/40 p-3 text-xs">
          <p className="mb-1 font-medium text-foreground">Columns matched</p>
          <ul className="space-y-0.5 text-muted">
            {matchedColumns.map((c) => (
              <li key={`${c.role}-${c.header}`}>
                {c.role}: <span className="text-foreground">{c.header}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <Label htmlFor="csv">Statement file</Label>
        <Input
          key={fileKey}
          id="csv"
          name="csv"
          type="file"
          accept=".csv,text/csv"
          required
          disabled={pending}
          onChange={(e) => {
            void onFileChange(e.target.files?.[0] ?? null);
          }}
        />
      </div>

      {needsMapping && headers.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-border bg-wash/40 p-3">
          <p className="text-sm font-medium">Column mapping</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {MAP_FIELDS.map((field) => (
              <div key={field.key}>
                <Label htmlFor={`map-${field.key}`}>{field.label}</Label>
                <Select
                  id={`map-${field.key}`}
                  value={(mapping?.[field.key] as string | null | undefined) ?? ""}
                  onChange={(e) => {
                    setMapping((prev) => ({
                      ...(prev ?? { date: "" }),
                      [field.key]: e.target.value || null,
                    }));
                  }}
                  options={
                    field.required
                      ? headerOptions.filter((o) => o.value !== "")
                      : headerOptions
                  }
                  required={field.required}
                  disabled={pending}
                />
              </div>
            ))}
          </div>
          {sampleRows.length > 0 ? (
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs text-muted">Sample rows</p>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="whitespace-nowrap px-1 py-0.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, i) => (
                    <tr key={i}>
                      {headers.map((_, j) => (
                        <td key={j} className="whitespace-nowrap px-1 py-0.5 text-muted">
                          {row[j] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setFileKey((k) => k + 1);
              setHeaders([]);
              setSampleRows([]);
              setMapping(null);
              setForceMapper(false);
              setPendingFile(null);
            }}
          >
            Choose a different file
          </Button>
        </div>
      ) : null}

      <FieldError>{error}</FieldError>
      {message && <p className="text-sm text-success">{message}</p>}
      <DialogActions>
        <Button
          type="submit"
          disabled={pending || (needsMapping && headers.length === 0)}
        >
          {pending ? "Importing…" : "Import"}
        </Button>
      </DialogActions>
    </form>
  );
}
