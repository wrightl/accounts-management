"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvoiceFromOrder } from "@/actions/orders";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { formatGBP } from "@/lib/money";
import {
  createInvoiceFromOrderRawFromFormData,
  parseCreateInvoiceFromOrderInput,
} from "@/lib/orders/schema";

type MilestoneOption = {
  id: string;
  label: string;
  amountPence: number;
  amountFormatted: string;
  dueDate: string | null;
  dueInDays: number | null;
  disabled: boolean;
};

type InvoiceMode = "milestone" | "remaining" | "part";

export function OrderActions({
  orderId,
  canWrite,
  remainingPence,
  orderGrossPence,
  availableMilestones,
  defaultDueDate,
}: {
  orderId: string;
  canWrite: boolean;
  remainingPence: number;
  orderGrossPence: number;
  availableMilestones: MilestoneOption[];
  defaultDueDate: string;
}) {
  const router = useRouter();
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
  } = useFieldErrors();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<InvoiceMode>(
    availableMilestones.length > 0 ? "milestone" : "remaining",
  );
  const [milestoneId, setMilestoneId] = useState(availableMilestones[0]?.id ?? "");
  const [partMode, setPartMode] = useState<"amount" | "percent">("amount");
  const [amountPounds, setAmountPounds] = useState("");
  const [percent, setPercent] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const containerRef = useRef<HTMLDivElement>(null);

  const canCreate = canWrite && remainingPence > 0;

  const partPreviewPence = useMemo(() => {
    if (mode !== "part") return null;
    if (partMode === "amount") {
      const pounds = Number(amountPounds.replace(/[£,\s]/g, ""));
      if (!Number.isFinite(pounds) || pounds <= 0) return null;
      return Math.round(pounds * 100);
    }
    const pct = Number(percent);
    if (!Number.isFinite(pct) || pct <= 0) return null;
    return Math.round((orderGrossPence * pct) / 100);
  }, [mode, partMode, amountPounds, percent, orderGrossPence]);

  if (!canWrite) return null;

  function openDialog() {
    clearAll();
    setMode(availableMilestones.length > 0 ? "milestone" : "remaining");
    setMilestoneId(availableMilestones[0]?.id ?? "");
    setPartMode("amount");
    setAmountPounds("");
    setPercent("");
    setDueDate(defaultDueDate);
    setOpen(true);
  }

  function submit() {
    clearAll();
    const formData = new FormData();
    formData.set("mode", mode);
    if (mode === "milestone") formData.set("milestoneId", milestoneId);
    if (mode === "part") {
      formData.set("partMode", partMode);
      if (partMode === "amount") formData.set("amountPounds", amountPounds);
      else formData.set("percent", percent);
    }
    if (dueDate) formData.set("dueDate", dueDate);

    const clientParsed = parseCreateInvoiceFromOrderInput(
      createInvoiceFromOrderRawFromFormData(formData),
    );
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(
        containerRef.current,
        clientParsed.fieldErrors,
      );
      return;
    }

    startTransition(async () => {
      const result = await createInvoiceFromOrder(orderId, formData);
      if (applyActionResult(result) && result.ok) {
        setOpen(false);
        router.push(`/invoices/${result.id}`);
        router.refresh();
      } else if (!result.ok) {
        scheduleFocusFirstFieldError(containerRef.current, result.fieldErrors);
      }
    });
  }

  return (
    <>
      <Button type="button" disabled={pending || !canCreate} onClick={openDialog}>
        {pending ? "Creating…" : "Create Invoice"}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Create invoice">
        <div ref={containerRef} className="space-y-4">
          <p className="text-sm text-muted">
            Remaining on this order: <strong>{formatGBP(remainingPence)}</strong>
          </p>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What to invoice</legend>

            {availableMilestones.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 has-[:checked]:border-navy has-[:checked]:bg-wash/50"
              >
                <input
                  type="radio"
                  name="invoice-mode"
                  className="mt-1"
                  checked={mode === "milestone" && milestoneId === m.id}
                  disabled={pending || m.disabled}
                  onChange={() => {
                    clearField("milestoneId");
                    setMode("milestone");
                    setMilestoneId(m.id);
                  }}
                />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{m.label}</span>
                  <span className="ml-2 text-muted">{m.amountFormatted}</span>
                  {m.disabled ? (
                    <span className="mt-0.5 block text-xs text-destructive">
                      Exceeds remaining balance
                    </span>
                  ) : null}
                </span>
              </label>
            ))}

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 has-[:checked]:border-navy has-[:checked]:bg-wash/50">
              <input
                type="radio"
                name="invoice-mode"
                className="mt-1"
                checked={mode === "remaining"}
                disabled={pending}
                onChange={() => setMode("remaining")}
              />
              <span className="text-sm">
                <span className="font-medium">Full remaining</span>
                <span className="ml-2 text-muted">{formatGBP(remainingPence)}</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 has-[:checked]:border-navy has-[:checked]:bg-wash/50">
              <input
                type="radio"
                name="invoice-mode"
                className="mt-1"
                checked={mode === "part"}
                disabled={pending}
                onChange={() => setMode("part")}
              />
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">Part amount</span>
                {mode === "part" ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-3 text-sm">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="part-mode"
                          checked={partMode === "amount"}
                          disabled={pending}
                          onChange={() => setPartMode("amount")}
                        />
                        £ amount
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="part-mode"
                          checked={partMode === "percent"}
                          disabled={pending}
                          onChange={() => setPartMode("percent")}
                        />
                        % of order
                      </label>
                    </div>
                    {partMode === "amount" ? (
                      <div>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={amountPounds}
                          disabled={pending}
                          aria-invalid={Boolean(fieldErrors.amountPounds)}
                          aria-describedby={
                            fieldErrors.amountPounds
                              ? "amountPounds-error"
                              : undefined
                          }
                          onChange={(e) => {
                            clearField("amountPounds");
                            setAmountPounds(e.target.value);
                          }}
                        />
                        <FieldError id="amountPounds-error">
                          {fieldErrors.amountPounds}
                        </FieldError>
                      </div>
                    ) : (
                      <div>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          placeholder="e.g. 40"
                          value={percent}
                          disabled={pending}
                          aria-invalid={Boolean(fieldErrors.percent)}
                          aria-describedby={
                            fieldErrors.percent ? "percent-error" : undefined
                          }
                          onChange={(e) => {
                            clearField("percent");
                            setPercent(e.target.value);
                          }}
                        />
                        <FieldError id="percent-error">{fieldErrors.percent}</FieldError>
                      </div>
                    )}
                    {partPreviewPence != null ? (
                      <p className="text-xs text-muted">
                        Invoice amount: {formatGBP(partPreviewPence)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </span>
            </label>
            <FieldError id="milestoneId-error">{fieldErrors.milestoneId}</FieldError>
            <FieldError id="mode-error">{fieldErrors.mode}</FieldError>
          </fieldset>

          <div>
            <Label htmlFor="invoice-due-date">Due date</Label>
            <Input
              id="invoice-due-date"
              type="date"
              value={dueDate}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.dueDate)}
              aria-describedby={fieldErrors.dueDate ? "dueDate-error" : undefined}
              onChange={(e) => {
                clearField("dueDate");
                setDueDate(e.target.value);
              }}
            />
            <FieldError id="dueDate-error">{fieldErrors.dueDate}</FieldError>
          </div>

          <FieldError>{error}</FieldError>
          <DialogActions>
            <button
              type="button"
              className={buttonClasses("ghost")}
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <Button type="button" disabled={pending} onClick={submit}>
              {pending ? "Creating…" : "Create invoice"}
            </Button>
          </DialogActions>
        </div>
      </Dialog>

      <FieldError>{error && !open ? error : null}</FieldError>
    </>
  );
}
