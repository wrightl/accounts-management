"use client";

import { useState } from "react";
import { useDocumentRate } from "@/components/documents/document-currency-fields";
import { FieldError, Input, Label } from "@/components/ui/form";
import { toSterlingPence } from "@/lib/currency";
import { formatGBP, poundsToPence } from "@/lib/money";

/** How far typed pounds can be from the day's rate before the field warns. */
const WARN_TOLERANCE = 0.1;

function parseMinor(value: string): number | null {
  try {
    const minor = poundsToPence(value);
    return minor > 0 ? minor : null;
  } catch {
    return null;
  }
}

/**
 * The sterling that a payment or refund in a foreign currency became, typed by
 * hand. Shows the Bank of England value of `foreignAmount` on `date`, which is
 * used when the field is left blank, and warns (without blocking) when the
 * typed pounds are more than 10% from it, which is more often a typo than a
 * bank's charges. Submits `name`.
 */
export function SterlingAmountField({
  id,
  name = "sterlingPounds",
  label,
  currency,
  foreignAmount,
  date,
  disabled,
  error,
  onChange,
}: {
  id: string;
  name?: string;
  label: string;
  currency: string;
  /** The amount in `currency`, as typed. */
  foreignAmount: string;
  /** ISO date the money moved; today when blank. */
  date: string;
  disabled: boolean;
  error?: string;
  onChange?: () => void;
}) {
  const [typed, setTyped] = useState("");
  const rate = useDocumentRate(
    currency,
    /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10),
  );
  const minor = parseMinor(foreignAmount);
  const expected = rate?.fxRate && minor ? toSterlingPence(minor, rate.fxRate) : null;
  const typedPence = typed.trim() ? parseMinor(typed) : null;
  const far =
    expected != null &&
    typedPence != null &&
    Math.abs(typedPence - expected) > expected * WARN_TOLERANCE;

  let hint: string;
  if (expected != null) {
    hint = `About ${formatGBP(expected)} at the Bank of England rate of ${rate!.fxRate}. Leave blank to use that until the bank line confirms it.`;
  } else if (rate && rate.fxRate == null) {
    hint = "Leave blank to use the invoice's rate until the bank line confirms it.";
  } else {
    hint = "Leave blank to estimate at the Bank of England rate until the bank line confirms it.";
  }

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        inputMode="decimal"
        value={typed}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error ${id}-hint` : `${id}-hint`}
        onChange={(e) => {
          setTyped(e.target.value);
          onChange?.();
        }}
      />
      <FieldError id={`${id}-error`}>{error}</FieldError>
      {far ? (
        <p className="mt-1 text-xs text-warning" role="status">
          That&apos;s more than 10% from the {formatGBP(expected!)} the {currency} amount was worth
          that day. Check it before saving.
        </p>
      ) : null}
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
        {hint}
      </p>
    </div>
  );
}
