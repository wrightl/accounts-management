"use client";

import { Input, Label, Select } from "@/components/ui/form";
import { STANDARD_VAT_RATE } from "@/lib/vat";

export type VatRateFieldValue = {
  choice: "0" | "20" | "custom";
  custom: string;
};

export function vatRateFromChoice(value: VatRateFieldValue): number {
  if (value.choice === "0") return 0;
  if (value.choice === "20") return STANDARD_VAT_RATE;
  const n = Number(value.custom);
  if (!Number.isFinite(n)) return STANDARD_VAT_RATE;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function choiceFromVatRate(rate: number): VatRateFieldValue {
  if (rate === 0) return { choice: "0", custom: "" };
  if (rate === STANDARD_VAT_RATE) return { choice: "20", custom: "" };
  return { choice: "custom", custom: String(rate) };
}

export function VatRateField({
  id,
  label = "VAT",
  value,
  onChange,
  disabled,
  compact,
}: {
  id: string;
  label?: string;
  value: VatRateFieldValue;
  onChange: (next: VatRateFieldValue) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "min-w-[7rem]" : undefined}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Select
        id={id}
        value={value.choice}
        onChange={(e) =>
          onChange({
            ...value,
            choice: e.target.value as VatRateFieldValue["choice"],
          })
        }
        disabled={disabled}
        aria-label={label || "VAT rate"}
      >
        <option value="20">20%</option>
        <option value="0">0%</option>
        <option value="custom">Custom…</option>
      </Select>
      {value.choice === "custom" ? (
        <Input
          className="mt-1"
          type="number"
          min={0}
          max={100}
          value={value.custom}
          onChange={(e) => onChange({ ...value, custom: e.target.value })}
          disabled={disabled}
          placeholder="%"
          aria-label="Custom VAT percent"
        />
      ) : null}
    </div>
  );
}
