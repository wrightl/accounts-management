"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  approveImportDrafts,
  findImportDraftBankMatches,
  updateImportDraft,
} from "@/actions/invoice-import-pdf";
import { DisplayDate } from "@/components/date-format-provider";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import type { InvoiceBankMatch } from "@/lib/bank/queries";
import type { ParsedInvoice } from "@/lib/invoices/import/parse";
import { penceToPounds, poundsToPence } from "@/lib/money";

function pounds(pence: number): string {
  return penceToPounds(pence).toFixed(2);
}

function toPence(value: string): number {
  try {
    return poundsToPence(value || "0");
  } catch {
    return Number.NaN;
  }
}

/** Check a PDF draft beside the file, correct it, then approve it. */
export function InvoiceDraftEditor({
  batchId,
  draftId,
  invoice,
  clientLabel,
  bankTransactionId,
  errors,
  warnings,
  approved,
}: {
  batchId: string;
  draftId: string;
  invoice: ParsedInvoice;
  /** The client chosen for this invoice, changed from its row in the list. */
  clientLabel: string;
  bankTransactionId: string | null;
  errors: string[];
  warnings: string[];
  approved: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState({
    number: invoice.number ?? "",
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate ?? "",
    paidDate: invoice.paidDate ?? "",
    net: pounds(invoice.netPence),
    vat: pounds(invoice.vatPence),
    gross: pounds(invoice.grossPence),
    paid: pounds(invoice.amountPaidPence),
  });
  const [lines, setLines] = useState(
    invoice.lines.map((l) => ({
      ...l,
      quantity: String(l.quantity),
      unit: pounds(l.unitPricePence),
      vatRate: String(l.vatRate),
    })),
  );

  const [bankTx, setBankTx] = useState<string | null>(bankTransactionId);
  const [matches, setMatches] = useState<InvoiceBankMatch[] | null>(null);

  // Candidates follow the saved gross, so they refresh after each save.
  useEffect(() => {
    let live = true;
    findImportDraftBankMatches(batchId, draftId).then((result) => {
      if (live) setMatches(result.ok ? result.matches : []);
    });
    return () => {
      live = false;
    };
  }, [batchId, draftId, invoice.grossPence]);

  const set = (field: keyof typeof form, value: string) => {
    setDirty(true);
    setForm((f) => ({ ...f, [field]: value }));
  };

  const grossPence = toPence(form.gross);
  const paidInFull = grossPence > 0 && toPence(form.paid) >= grossPence;

  function markPaid(paid: boolean) {
    setDirty(true);
    if (paid) {
      setForm((f) => ({
        ...f,
        paid: f.gross,
        paidDate: f.paidDate || f.dueDate || f.issueDate,
      }));
    } else {
      setForm((f) => ({ ...f, paid: "0.00", paidDate: "" }));
      setBankTx(null);
    }
  }

  function linkBankTx(id: string) {
    setDirty(true);
    setBankTx(id || null);
    const match = matches?.find((m) => m.bankTransactionId === id);
    if (match) setForm((f) => ({ ...f, paidDate: match.bookedAt }));
  }

  function save() {
    setError(null);
    const gross = toPence(form.gross);
    const paid = toPence(form.paid);
    const next: ParsedInvoice = {
      ...invoice,
      number: form.number.trim() || null,
      issueDate: form.issueDate,
      dueDate: form.dueDate || null,
      paidDate: form.paidDate || null,
      netPence: toPence(form.net),
      vatPence: toPence(form.vat),
      grossPence: gross,
      amountPaidPence: paid,
      status: gross > 0 && paid >= gross ? "paid" : "sent",
      lines: lines.map(({ unit, quantity, vatRate, ...line }) => ({
        ...line,
        quantity: Number(quantity),
        unitPricePence: toPence(unit),
        vatRate: Number(vatRate),
      })),
    };
    startTransition(async () => {
      const result = await updateImportDraft(
        batchId,
        draftId,
        next,
        gross > 0 && paid >= gross ? bankTx : null,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDirty(false);
      router.refresh();
    });
  }

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveImportDrafts(batchId, { draftId });
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  const field = (key: keyof typeof form, label: string, type = "text") => (
    <div>
      <Label htmlFor={`${draftId}-${key}`}>{label}</Label>
      <Input
        id={`${draftId}-${key}`}
        type={type}
        value={form[key]}
        disabled={pending}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  );

  return (
    <div className="grid gap-4 py-3 lg:grid-cols-2">
      <iframe
        title={`Uploaded invoice ${invoice.number ?? ""}`}
        src={`/api/invoice-imports/drafts/${draftId}/document`}
        className="h-[32rem] w-full rounded-xl border border-border"
      />
      <div className="space-y-3 text-sm">
        {errors.map((e) => (
          <p key={e} className="font-medium">{e}</p>
        ))}
        {warnings.map((w) => (
          <p key={w} className="text-muted">{w}</p>
        ))}
        <p>
          <span className="text-muted">Client: </span>
          <span className="font-medium">{clientLabel}</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("number", "Invoice number")}
          {field("issueDate", "Issue date", "date")}
          {field("dueDate", "Due date", "date")}
          {field("net", "Net")}
          {field("vat", "VAT")}
          {field("gross", "Gross")}
        </div>
        <fieldset className="space-y-3">
          <legend className="font-medium">Payment</legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={paidInFull}
              disabled={pending}
              onChange={(e) => markPaid(e.target.checked)}
            />
            Mark as paid
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("paid", "Amount paid")}
            {field("paidDate", "Paid date", "date")}
          </div>
          {paidInFull ? (
            <div>
              <Label htmlFor={`${draftId}-bank`}>Bank payment</Label>
              <Select
                id={`${draftId}-bank`}
                value={bankTx ?? ""}
                disabled={pending || matches === null}
                onChange={(e) => linkBankTx(e.target.value)}
                options={[
                  {
                    value: "",
                    label:
                      matches === null
                        ? "Looking for bank payments…"
                        : matches.length === 0
                          ? "No unreconciled bank payment for this amount"
                          : "Don't link a bank payment",
                  },
                  ...(matches ?? []).map((m) => ({
                    value: m.bankTransactionId,
                    label: (
                      <>
                        <DisplayDate value={m.bookedAt} /> · {m.amountFormatted} ·{" "}
                        {m.counterparty ?? m.reference ?? "Bank payment"}
                      </>
                    ),
                  })),
                ]}
              />
              <p className="mt-1 text-xs text-muted">
                Linking reconciles the bank payment to this invoice when the import is saved.
              </p>
            </div>
          ) : null}
        </fieldset>
        <div className="space-y-3">
          <p className="font-medium">Lines</p>
          {lines.map((line, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-3">
              <div>
                <Label htmlFor={`${draftId}-line-${i}-description`}>Line {i + 1} description</Label>
                <Input
                  id={`${draftId}-line-${i}-description`}
                  value={line.description}
                  disabled={pending}
                  onChange={(e) => {
                    setDirty(true);
                    setLines((all) => all.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)));
                  }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label htmlFor={`${draftId}-line-${i}-quantity`}>Quantity</Label>
                  <Input
                    id={`${draftId}-line-${i}-quantity`}
                    inputMode="decimal"
                    value={line.quantity}
                    disabled={pending}
                    onChange={(e) => {
                      setDirty(true);
                      setLines((all) => all.map((l, j) => (j === i ? { ...l, quantity: e.target.value } : l)));
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor={`${draftId}-line-${i}-unit`}>Unit price (£)</Label>
                  <Input
                    id={`${draftId}-line-${i}-unit`}
                    inputMode="decimal"
                    value={line.unit}
                    disabled={pending}
                    onChange={(e) => {
                      setDirty(true);
                      setLines((all) => all.map((l, j) => (j === i ? { ...l, unit: e.target.value } : l)));
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor={`${draftId}-line-${i}-vat`}>VAT rate (%)</Label>
                  <Input
                    id={`${draftId}-line-${i}-vat`}
                    inputMode="numeric"
                    value={line.vatRate}
                    disabled={pending}
                    onChange={(e) => {
                      setDirty(true);
                      setLines((all) => all.map((l, j) => (j === i ? { ...l, vatRate: e.target.value } : l)));
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={pending || !dirty} onClick={save}>
            Save changes
          </Button>
          {!approved ? (
            <Button type="button" disabled={pending || dirty || errors.length > 0} onClick={approve}>
              Approve
            </Button>
          ) : (
            <span className="self-center">Approved</span>
          )}
        </div>
        <FieldError id={`${draftId}-error`}>{error}</FieldError>
      </div>
    </div>
  );
}
