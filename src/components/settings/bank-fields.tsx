"use client";

import { useState } from "react";
import { Input, Label, Select } from "@/components/ui/form";
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
        <Label htmlFor="bankProvider">Bank</Label>
        <Select
          id="bankProvider"
          name="bankProvider"
          value={provider}
          onChange={(e) => {
            const next = e.target.value;
            setProvider(
              next === "" || isBankProviderId(next) ? (next as BankProviderId | "") : "",
            );
          }}
          options={selectOptions}
          required={required}
          disabled={disabled}
          placeholder="Select a bank…"
        />
        {optionalHint ? (
          <p className="mt-1 text-xs text-muted">{optionalHint}</p>
        ) : null}
        {!isOther && expectedColumns.length > 0 ? (
          <p className="mt-1 text-xs text-muted">
            CSV import expects columns like: {expectedColumns.join(", ")}.
          </p>
        ) : null}
      </div>

      {isOther ? (
        <div>
          <Label htmlFor="bankName">Bank name</Label>
          <Input
            id="bankName"
            name="bankName"
            required={required}
            defaultValue={
              initialProvider === "other" ? (bankName ?? "") : ""
            }
            disabled={disabled}
            placeholder="e.g. Metro Bank"
          />
          <p className="mt-1 text-xs text-muted">
            Shown on invoices. Column mapping is saved on first successful CSV
            import.
          </p>
        </div>
      ) : (
        // Known banks: server overwrites bankName from the catalog label.
        <input type="hidden" name="bankName" value="" />
      )}

      {showAccountDetails ? (
        <>
          <div>
            <Label htmlFor="bankAccountName">Account name</Label>
            <Input
              id="bankAccountName"
              name="bankAccountName"
              defaultValue={bankAccountName ?? ""}
              disabled={disabled}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sortCode">Sort code</Label>
              <Input
                id="sortCode"
                name="sortCode"
                defaultValue={sortCode ?? ""}
                disabled={disabled}
              />
            </div>
            <div>
              <Label htmlFor="accountNumber">Account number</Label>
              <Input
                id="accountNumber"
                name="accountNumber"
                defaultValue={accountNumber ?? ""}
                disabled={disabled}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
