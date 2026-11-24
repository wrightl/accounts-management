"use client";

import { useEffect, useState } from "react";
import { fetchDocumentExchangeRate } from "@/actions/document-rate";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import { DOCUMENT_CURRENCIES, STERLING } from "@/lib/currency";
import { formatIsoDateLong } from "@/lib/dates";

type FetchedRate = {
  key: string;
  fxRate: number | null;
  fxRateDate: string | null;
  error: string | null;
};

/**
 * The Bank of England rate for a document in `currency` dated `date`, fetched
 * as either changes. `null` while loading or for sterling.
 */
export function useDocumentRate(currency: string, date: string) {
  const foreign = currency !== STERLING;
  const key = `${currency}:${date}`;
  const [fetched, setFetched] = useState<FetchedRate | null>(null);
  useEffect(() => {
    if (!foreign) return;
    let cancelled = false;
    void fetchDocumentExchangeRate(currency, date).then((r) => {
      if (cancelled) return;
      setFetched(
        r.ok
          ? { key, fxRate: r.fxRate, fxRateDate: r.fxRateDate, error: null }
          : { key, fxRate: null, fxRateDate: null, error: r.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [foreign, currency, date, key]);
  return foreign && fetched?.key === key ? fetched : null;
}

/** A typed rate as a number, or null when blank or not a positive number. */
export function parseManualRate(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Currency picker and exchange rate for a document. For a foreign currency the
 * rate is the Bank of England one for the document date unless the user types
 * their own; leaving it blank keeps following the Bank of England rate.
 * Submits `currency` and `fxRate`.
 */
export function DocumentCurrencyFields({
  currency,
  onCurrencyChange,
  manualRate,
  onManualRateChange,
  bankRate,
  disabled,
  fieldErrors,
  clearField,
}: {
  currency: string;
  onCurrencyChange: (code: string) => void;
  manualRate: string;
  onManualRateChange: (value: string) => void;
  bankRate: FetchedRate | null;
  disabled: boolean;
  fieldErrors: Record<string, string | undefined>;
  clearField: (field: string) => void;
}) {
  const foreign = currency !== STERLING;
  let hint: string;
  if (!bankRate) {
    hint = "Getting the Bank of England rate…";
  } else if (bankRate.fxRate == null) {
    hint = bankRate.error ?? `No Bank of England ${currency} rate is available. Enter the rate yourself.`;
  } else {
    const dated = bankRate.fxRateDate ? `, ${formatIsoDateLong(bankRate.fxRateDate)}` : "";
    hint = manualRate.trim()
      ? `The Bank of England rate is ${bankRate.fxRate}${dated}. Clear your rate to use it.`
      : `Leave blank to use the Bank of England rate, ${bankRate.fxRate}${dated}. It follows the issue date while you can still edit this.`;
  }

  return (
    <>
      <div>
        <Label htmlFor="currency">Currency</Label>
        <Select
          id="currency"
          name="currency"
          value={currency}
          onChange={(e) => {
            clearField("currency");
            clearField("fxRate");
            onCurrencyChange(e.target.value);
          }}
          disabled={disabled}
          aria-invalid={Boolean(fieldErrors.currency)}
          aria-describedby={fieldErrors.currency ? "currency-error" : undefined}
        >
          {DOCUMENT_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
        <FieldError id="currency-error">{fieldErrors.currency}</FieldError>
      </div>
      {foreign ? (
        <div>
          <Label htmlFor="fxRate">Exchange rate ({currency} per £1)</Label>
          <Input
            id="fxRate"
            name="fxRate"
            inputMode="decimal"
            placeholder={bankRate?.fxRate != null ? String(bankRate.fxRate) : ""}
            value={manualRate}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors.fxRate)}
            aria-describedby={fieldErrors.fxRate ? "fxRate-error fxRate-hint" : "fxRate-hint"}
            onChange={(e) => {
              clearField("fxRate");
              onManualRateChange(e.target.value);
            }}
          />
          <FieldError id="fxRate-error">{fieldErrors.fxRate}</FieldError>
          <p id="fxRate-hint" className="mt-1 text-xs text-muted">
            {hint}
          </p>
        </div>
      ) : null}
    </>
  );
}

/**
 * Currency state for a document form: starts in the document's currency or
 * else the client's default, follows the client until the user picks a
 * currency by hand, and keeps the typed rate and the Bank of England one.
 */
export function useDocumentCurrency(opts: {
  clients: ReadonlyArray<{ id: string; defaultCurrency?: string | null }>;
  clientId: string;
  document?: { currency: string; fxRate: number; fxRateSource: "boe" | "manual" | null } | null;
  issueDate: string;
}) {
  const [created, setCreated] = useState<Record<string, string | null>>({});
  const clientCurrency = (id: string, made?: { defaultCurrency: string | null }) =>
    (made ?? opts.clients.find((c) => c.id === id))?.defaultCurrency ?? created[id] ?? STERLING;
  const [currency, setCurrency] = useState(
    opts.document?.currency ?? clientCurrency(opts.clientId),
  );
  const [touched, setTouched] = useState(Boolean(opts.document));
  const [manualRate, setManualRate] = useState(
    opts.document?.fxRateSource === "manual" ? String(opts.document.fxRate) : "",
  );
  const foreign = currency !== STERLING;
  const bankRate = useDocumentRate(currency, opts.issueDate);
  const effectiveRate = foreign ? (parseManualRate(manualRate) ?? bankRate?.fxRate ?? null) : 1;

  function changeCurrency(code: string, byHand: boolean) {
    if (byHand) setTouched(true);
    setCurrency(code);
    setManualRate("");
  }

  return {
    currency,
    foreign,
    manualRate,
    setManualRate,
    bankRate,
    effectiveRate,
    /** The user picked a currency. */
    pickCurrency: (code: string) => changeCurrency(code, true),
    /** The client changed: follow its default unless a currency was picked. */
    clientChanged(id: string, made?: { defaultCurrency: string | null }) {
      if (made) setCreated((prev) => ({ ...prev, [id]: made.defaultCurrency }));
      if (!touched) changeCurrency(clientCurrency(id, made), false);
    },
  };
}
