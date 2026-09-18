"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createOrder } from "@/actions/orders";
import { PaymentScheduleEditor } from "@/components/quotes/payment-schedule-editor";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import {
  VatRateField,
  choiceFromVatRate,
  vatRateFromChoice,
  type VatRateFieldValue,
} from "@/components/documents/vat-rate-field";
import { formatGBP, invoiceTotals, poundsToPence } from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";

type LineDraft = {
  key: string;
  description: string;
  quantity: string;
  unitPricePounds: string;
  vatRate: number;
};

function newLine(defaultVatRate: number): LineDraft {
  return {
    key: crypto.randomUUID(),
    description: "",
    quantity: "1",
    unitPricePounds: "",
    vatRate: defaultVatRate,
  };
}

function isCompleteLine(line: LineDraft): boolean {
  return line.description.trim().length > 0 && line.unitPricePounds.trim().length > 0;
}

export function OrderForm({
  clients,
  vatRegistered = false,
  defaultVatRate = 0,
}: {
  clients: { id: string; name: string; companyName?: string | null }[];
  vatRegistered?: boolean;
  defaultVatRate?: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lineDefault = vatRegistered ? defaultVatRate : 0;
  const [lines, setLines] = useState<LineDraft[]>([newLine(lineDefault)]);

  const totals = useMemo(() => {
    try {
      return invoiceTotals(
        lines
          .filter(isCompleteLine)
          .map((l) => ({
            quantity: Number(l.quantity) || 0,
            unitPricePence: poundsToPence(l.unitPricePounds),
            vatRate: vatRegistered ? l.vatRate : 0,
          })),
      );
    } catch {
      return { netPence: 0, vatPence: 0, grossPence: 0 };
    }
  }, [lines, vatRegistered]);

  function setLineVat(index: number, value: VatRateFieldValue) {
    setLines((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, vatRate: vatRateFromChoice(value) } : l,
      ),
    );
  }

  function onSubmit(formData: FormData) {
    const completeLines = lines.filter(isCompleteLine);
    if (completeLines.length === 0) {
      setError("Add at least one line item");
      return;
    }

    formData.set(
      "linesJson",
      JSON.stringify(
        completeLines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPricePounds: l.unitPricePounds,
          vatRate: vatRegistered ? l.vatRate : 0,
        })),
      ),
    );
    setError(null);
    startTransition(async () => {
      const result = await createOrder(formData);
      if (!result.ok) setError(result.error);
      else {
        router.push(`/orders/${result.id}`);
        router.refresh();
      }
    });
  }

  return (
    <form className="space-y-4" action={onSubmit}>
      <div>
        <Label htmlFor="clientId">Client</Label>
        <Select id="clientId" name="clientId" required disabled={pending}>
          <option value="">Select…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {clientDisplayName(c)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="issueDate">Issue date</Label>
        <Input
          id="issueDate"
          name="issueDate"
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <div
          className={`hidden gap-2 text-xs font-medium text-muted sm:grid ${
            vatRegistered
              ? "sm:grid-cols-[1fr_70px_100px_110px_2.5rem]"
              : "sm:grid-cols-[1fr_70px_100px_2.5rem]"
          }`}
        >
          <span>Description</span>
          <span>Qty</span>
          <span>Unit £ (ex VAT)</span>
          {vatRegistered ? <span>VAT</span> : null}
          <span className="sr-only">Remove</span>
        </div>
        {lines.map((line, index) => (
          <div
            key={line.key}
            className={`grid gap-2 ${
              vatRegistered
                ? "sm:grid-cols-[1fr_70px_100px_110px_2.5rem]"
                : "sm:grid-cols-[1fr_70px_100px_2.5rem]"
            }`}
          >
            <Input
              placeholder="Description"
              value={line.description}
              disabled={pending}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l, i) =>
                    i === index ? { ...l, description: e.target.value } : l,
                  ),
                )
              }
            />
            <Input
              type="number"
              min={1}
              value={line.quantity}
              disabled={pending}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l, i) =>
                    i === index ? { ...l, quantity: e.target.value } : l,
                  ),
                )
              }
            />
            <Input
              placeholder="£"
              value={line.unitPricePounds}
              disabled={pending}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l, i) =>
                    i === index ? { ...l, unitPricePounds: e.target.value } : l,
                  ),
                )
              }
            />
            {vatRegistered ? (
              <VatRateField
                id={`vat-${line.key}`}
                label=""
                compact
                value={choiceFromVatRate(line.vatRate)}
                onChange={(v) => setLineVat(index, v)}
                disabled={pending}
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="size-9 shrink-0 px-0"
              aria-label="Remove line"
              disabled={pending || lines.length === 1}
              onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setLines((p) => [...p, newLine(lineDefault)])}
        >
          <Plus className="h-4 w-4" /> Add line
        </Button>
        <div className="space-y-1 text-right">
          {vatRegistered && totals.vatPence > 0 ? (
            <>
              <p className="text-sm text-muted">
                Net {formatGBP(totals.netPence)}
              </p>
              <p className="text-sm text-muted">
                VAT {formatGBP(totals.vatPence)}
              </p>
            </>
          ) : null}
          <p className="font-medium">Total {formatGBP(totals.grossPence)}</p>
        </div>
      </div>
      <PaymentScheduleEditor grossPence={totals.grossPence} disabled={pending} />
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} disabled={pending} />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create order"}
      </Button>
    </form>
  );
}
