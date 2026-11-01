"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveImportDrafts,
  updateImportDraft,
} from "@/actions/invoice-import-pdf";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
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
  errors,
  warnings,
  approved,
}: {
  batchId: string;
  draftId: string;
  invoice: ParsedInvoice;
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
    clientName: invoice.client.name ?? "",
    clientCompany: invoice.client.companyName ?? "",
    clientEmail: invoice.client.email ?? "",
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

  const set = (field: keyof typeof form, value: string) => {
    setDirty(true);
    setForm((f) => ({ ...f, [field]: value }));
  };

  function save() {
    setError(null);
    const gross = toPence(form.gross);
    const paid = toPence(form.paid);
    const next: ParsedInvoice = {
      ...invoice,
      number: form.number.trim() || null,
      client: {
        ...invoice.client,
        name: form.clientName.trim() || null,
        companyName: form.clientCompany.trim() || null,
        email: form.clientEmail.trim() || null,
      },
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
      const result = await updateImportDraft(batchId, draftId, next);
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
        <div className="grid gap-3 sm:grid-cols-2">
          {field("number", "Invoice number")}
          {field("clientName", "Client name")}
          {field("clientCompany", "Client company")}
          {field("clientEmail", "Client email")}
          {field("issueDate", "Issue date", "date")}
          {field("dueDate", "Due date", "date")}
          {field("net", "Net")}
          {field("vat", "VAT")}
          {field("gross", "Gross")}
          {field("paid", "Amount paid")}
          {field("paidDate", "Paid date", "date")}
        </div>
        <div className="space-y-2">
          <p className="font-medium">Lines</p>
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-4 gap-2">
              <Input
                aria-label={`Line ${i + 1} description`}
                className="col-span-4"
                value={line.description}
                disabled={pending}
                onChange={(e) => {
                  setDirty(true);
                  setLines((all) => all.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)));
                }}
              />
              <Input
                aria-label={`Line ${i + 1} quantity`}
                value={line.quantity}
                disabled={pending}
                onChange={(e) => {
                  setDirty(true);
                  setLines((all) => all.map((l, j) => (j === i ? { ...l, quantity: e.target.value } : l)));
                }}
              />
              <Input
                aria-label={`Line ${i + 1} unit price`}
                value={line.unit}
                disabled={pending}
                onChange={(e) => {
                  setDirty(true);
                  setLines((all) => all.map((l, j) => (j === i ? { ...l, unit: e.target.value } : l)));
                }}
              />
              <Input
                aria-label={`Line ${i + 1} VAT rate`}
                value={line.vatRate}
                disabled={pending}
                onChange={(e) => {
                  setDirty(true);
                  setLines((all) => all.map((l, j) => (j === i ? { ...l, vatRate: e.target.value } : l)));
                }}
              />
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
