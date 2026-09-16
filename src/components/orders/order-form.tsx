"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createOrder } from "@/actions/orders";
import { PaymentScheduleEditor } from "@/components/quotes/payment-schedule-editor";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { formatGBP, invoiceTotals, poundsToPence } from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";

type LineDraft = {
  key: string;
  description: string;
  quantity: string;
  unitPricePounds: string;
};

function newLine(): LineDraft {
  return { key: crypto.randomUUID(), description: "", quantity: "1", unitPricePounds: "" };
}

function isCompleteLine(line: LineDraft): boolean {
  return line.description.trim().length > 0 && line.unitPricePounds.trim().length > 0;
}

export function OrderForm({
  clients,
}: {
  clients: { id: string; name: string; companyName?: string | null }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  const totals = useMemo(() => {
    try {
      return invoiceTotals(
        lines
          .filter(isCompleteLine)
          .map((l) => ({
            quantity: Number(l.quantity) || 0,
            unitPricePence: poundsToPence(l.unitPricePounds),
          })),
      );
    } catch {
      return { netPence: 0, vatPence: 0, grossPence: 0 };
    }
  }, [lines]);

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
        {lines.map((line, index) => (
          <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_70px_100px_2.5rem]">
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
        <Button type="button" variant="secondary" onClick={() => setLines((p) => [...p, newLine()])}>
          <Plus className="h-4 w-4" /> Add line
        </Button>
        <p className="text-right font-medium">Total {formatGBP(totals.grossPence)}</p>
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
