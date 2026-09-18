"use client";

import { useState } from "react";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import {
  BANK_PROVIDER_OPTIONS,
  isBankProviderId,
  isPresetBankProviderId,
  parseProviderFromLegacyName,
  type BankProviderId,
} from "@/lib/bank/providers";
import { getPresetExpectedColumns } from "@/lib/bank/import-help";

export function BankFields({
  bankProvider,
  bankName,
  bankAccountName,
  sortCode,
  accountNumber,
  disabled,
  required = true,
  showAccountDetails = true,
  optionalHint,
  errors,
  onClearError,
}: {
  bankProvider?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  sortCode?: string | null;
  accountNumber?: string | null;
  disabled?: boolean;
  /** When false, bank can be left empty (onboarding). */
  required?: boolean;
  showAccountDetails?: boolean;
  optionalHint?: string;
  errors?: Record<string, string>;
  onClearError?: (key: string) => void;
}) {
  const initialProvider: BankProviderId | "" = (() => {
    if (bankProvider && isBankProviderId(bankProvider)) return bankProvider;
    if (bankName) return parseProviderFromLegacyName(bankName);
    return required ? "starling" : "";
  })();

  const [provider, setProvider] = useState<BankProviderId | "">(initialProvider);
  const isOther = provider === "other";
  const expectedColumns =
    provider && isPresetBankProviderId(provider)
      ? getPresetExpectedColumns(provider)
      : [];

  const selectOptions = required
    ? BANK_PROVIDER_OPTIONS
    : [{ value: "", label: "Select later…" }, ...BANK_PROVIDER_OPTIONS];

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="bankProvider" required={required}>
          Bank
        </Label>
        <Select
          id="bankProvider"
          name="bankProvider"
          value={provider}
          onChange={(e) => {
            const next = e.target.value;
            setProvider(
              next === "" || isBankProviderId(next)
                ? (next as BankProviderId | "")
                : "",
            );
            onClearError?.("bankProvider");
            onClearError?.("bankName");
          }}
          options={selectOptions}
          required={required}
          disabled={disabled}
          placeholder="Select a bank…"
          aria-invalid={Boolean(errors?.bankProvider)}
          aria-describedby={
            errors?.bankProvider ? "bankProvider-error" : undefined
          }
        />
        {optionalHint ? (
          <p className="mt-1 text-xs text-muted">{optionalHint}</p>
        ) : null}
        {!isOther && expectedColumns.length > 0 ? (
          <p className="mt-1 text-xs text-muted">
            CSV import expects columns like: {expectedColumns.join(", ")}.
          </p>
        ) : null}
        <FieldError id="bankProvider-error">{errors?.bankProvider}</FieldError>
      </div>

      {isOther ? (
        <div>
          <Label htmlFor="bankName" required={required}>
            Bank name
          </Label>
          <Input
            id="bankName"
            name="bankName"
            required={required}
            defaultValue={
              initialProvider === "other" ? (bankName ?? "") : ""
            }
            disabled={disabled}
            placeholder="e.g. Metro Bank"
            aria-invalid={Boolean(errors?.bankName)}
            aria-describedby={errors?.bankName ? "bankName-error" : undefined}
            onChange={() => onClearError?.("bankName")}
          />
          <p className="mt-1 text-xs text-muted">
            Shown on invoices. Column mapping is saved on first successful CSV
            import.
          </p>
          <FieldError id="bankName-error">{errors?.bankName}</FieldError>
        </div>
      ) : (
        // Known banks: server overwrites bankName from the catalog label.
        <input type="hidden" name="bankName" value="" />
      )}

      {showAccountDetails ? (
        <>
          <div>
            <Label htmlFor="bankAccountName">Account name (optional)</Label>
            <Input
              id="bankAccountName"
              name="bankAccountName"
              defaultValue={bankAccountName ?? ""}
              disabled={disabled}
              aria-invalid={Boolean(errors?.bankAccountName)}
              aria-describedby={
                errors?.bankAccountName ? "bankAccountName-error" : undefined
              }
              onChange={() => onClearError?.("bankAccountName")}
            />
            <FieldError id="bankAccountName-error">
              {errors?.bankAccountName}
            </FieldError>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sortCode">Sort code (optional)</Label>
              <Input
                id="sortCode"
                name="sortCode"
                defaultValue={sortCode ?? ""}
                disabled={disabled}
                aria-invalid={Boolean(errors?.sortCode)}
                aria-describedby={
                  errors?.sortCode ? "sortCode-error" : undefined
                }
                onChange={() => onClearError?.("sortCode")}
              />
              <FieldError id="sortCode-error">{errors?.sortCode}</FieldError>
            </div>
            <div>
              <Label htmlFor="accountNumber">Account number (optional)</Label>
              <Input
                id="accountNumber"
                name="accountNumber"
                defaultValue={accountNumber ?? ""}
                disabled={disabled}
                aria-invalid={Boolean(errors?.accountNumber)}
                aria-describedby={
                  errors?.accountNumber ? "accountNumber-error" : undefined
                }
                onChange={() => onClearError?.("accountNumber")}
              />
              <FieldError id="accountNumber-error">
                {errors?.accountNumber}
              </FieldError>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
