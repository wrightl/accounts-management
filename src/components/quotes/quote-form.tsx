"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { formatGBP, invoiceTotals, poundsToPence } from "@/lib/money";
import { createQuote, convertQuoteToInvoice } from "@/actions/quotes";
import { Plus, Trash2 } from "lucide-react";

type Line = { key: string; description: string; quantity: string; unitPricePounds: string };

function newLine(): Line {
  return { key: crypto.randomUUID(), description: "", quantity: "1", unitPricePounds: "" };
}

export function QuoteCreateForm({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const totals = useMemo(() => {
    try {
      return invoiceTotals(
        lines
          .filter((l) => l.description && l.unitPricePounds)
          .map((l) => ({
            quantity: Number(l.quantity) || 0,
            unitPricePence: poundsToPence(l.unitPricePounds || "0"),
          })),
      );
    } catch {
      return { netPence: 0, vatPence: 0, grossPence: 0 };
    }
  }, [lines]);

  return (
    <form
      className="space-y-4"
      action={(formData) => {
        formData.set(
          "linesJson",
          JSON.stringify(
            lines.map((l) => ({
              description: l.description,
              quantity: Number(l.quantity),
              unitPricePounds: l.unitPricePounds,
            })),
          ),
        );
        setError(null);
        startTransition(async () => {
          const result = await createQuote(formData);
          if (!result.ok) setError(result.error);
          else {
            router.push(`/dashboard/quotes/${result.id}`);
            router.refresh();
          }
        });
      }}
    >
      <div>
        <Label htmlFor="clientId">Client</Label>
        <Select id="clientId" name="clientId" required disabled={pending}>
          <option value="">Select…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="issueDate">Issue date</Label>
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            disabled={pending}
          />
        </div>
        <div>
          <Label htmlFor="validUntil">Valid until</Label>
          <Input id="validUntil" name="validUntil" type="date" disabled={pending} />
        </div>
      </div>
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_70px_100px_36px]">
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
          onClick={() => setLines((p) => [...p, newLine()])}
        >
          <Plus className="h-4 w-4" /> Add line
        </Button>
        <p className="text-right font-medium">Total {formatGBP(totals.grossPence)}</p>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} disabled={pending} />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        Create quote
      </Button>
    </form>
  );
}

export function ConvertQuoteButton({
  quoteId,
  status,
  canWrite,
}: {
  quoteId: string;
  status: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite || status === "converted") return null;

  return (
    <div>
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await convertQuoteToInvoice(quoteId);
            if (!result.ok) setError(result.error);
            else {
              router.push(`/dashboard/invoices/${result.id}`);
              router.refresh();
            }
          });
        }}
      >
        {pending ? "Converting…" : "Convert to invoice"}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
