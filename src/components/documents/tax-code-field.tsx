"use client";

import { Label, Select } from "@/components/ui/form";
import {
  inferTaxCodeFromRate,
  isTaxCode,
  rateForTaxCode,
  taxCodeDisplay,
  taxCodesFor,
  TAX_CODE_INFO,
  type TaxCode,
  type TaxCodeUse,
} from "@/lib/tax-codes";

export type TaxCodeFieldValue = { taxCode: TaxCode };

/**
 * The code to show for a line. A line saved before tax codes (or with a rate
 * that isn't a UK rate) shows the code its rate implies; saving it stores
 * that code and the code's own rate.
 */
export function choiceFromLineTax(line: { vatRate: number; taxCode?: string | null }): TaxCodeFieldValue {
  if (isTaxCode(line.taxCode)) return { taxCode: line.taxCode };
  return { taxCode: inferTaxCodeFromRate(line.vatRate, { vatRegistered: true }).code };
}

/** A line's code and rate made consistent: the rate always comes from the code. */
export function normaliseLineTax<T extends { vatRate: number; taxCode?: TaxCode }>(line: T): T {
  const { taxCode } = choiceFromLineTax(line);
  return { ...line, taxCode, vatRate: rateForTaxCode(taxCode) };
}

/** The code and rate a picker choice sets on a line. */
export function lineTaxFromChoice(value: TaxCodeFieldValue): { taxCode: TaxCode; vatRate: number } {
  return { taxCode: value.taxCode, vatRate: rateForTaxCode(value.taxCode) };
}

export function TaxCodeField({
  id,
  label = "VAT",
  value,
  onChange,
  use = "sales",
  disabled,
  compact,
  required,
  invalid,
  describedBy,
}: {
  id: string;
  label?: string;
  value: TaxCodeFieldValue;
  onChange: (next: TaxCodeFieldValue) => void;
  /** Sales lines and purchases offer different codes. */
  use?: TaxCodeUse;
  disabled?: boolean;
  compact?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const codes = taxCodesFor(use);
  return (
    <div className={compact ? "min-w-[9rem]" : undefined}>
      {label ? (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      ) : null}
      <Select
        id={id}
        value={value.taxCode}
        onChange={(e) => {
          const next = e.target.value;
          if (isTaxCode(next)) onChange({ taxCode: next });
        }}
        disabled={disabled}
        aria-label={label || "VAT tax code"}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        {codes.map((code) => (
          <option key={code} value={code} title={TAX_CODE_INFO[code].hint}>
            {taxCodeDisplay(code)}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * A line's tax as the form posts it and totals it: its code and that code's
 * rate when the document charges VAT, else 0% with no code (the server
 * stores outside scope).
 */
export function postedLineTax(
  line: { vatRate: number; taxCode?: string | null },
  chargesVat: boolean,
): { taxCode?: TaxCode; vatRate: number } {
  if (!chargesVat) return { vatRate: 0 };
  return lineTaxFromChoice(choiceFromLineTax(line));
}
