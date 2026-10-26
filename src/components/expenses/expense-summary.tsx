"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { formatCurrencyAmount, formatGBP } from "@/lib/money";

type LiveSummary = {
  description: string;
  /** Sterling, or null when the form doesn't have a valid amount yet. */
  pence: number | null;
  /** What was paid when it wasn't GBP. */
  original: { currency: string; amountMinor: number | null } | null;
};

const ExpenseSummaryContext = createContext<{
  summary: LiveSummary;
  setSummary: (summary: LiveSummary) => void;
} | null>(null);

/** Shares the form's unsaved description, amount and currency with the page header. */
export function ExpenseSummaryProvider({
  initialDescription,
  initialPence,
  initialOriginal,
  children,
}: {
  initialDescription: string;
  initialPence: number;
  initialOriginal: LiveSummary["original"];
  children: ReactNode;
}) {
  const [summary, setSummary] = useState<LiveSummary>({
    description: initialDescription,
    pence: initialPence,
    original: initialOriginal,
  });
  return (
    <ExpenseSummaryContext.Provider value={{ summary, setSummary }}>
      {children}
    </ExpenseSummaryContext.Provider>
  );
}

export function ExpenseTitle({ fallback }: { fallback: string }) {
  const description = useContext(ExpenseSummaryContext)?.summary.description.trim();
  return (
    <h1 className="font-display text-2xl font-semibold">{description || fallback}</h1>
  );
}

export function ExpenseAmountCard() {
  const context = useContext(ExpenseSummaryContext);
  if (!context) return null;
  const { pence, original } = context.summary;
  return (
    <Card className="min-w-[140px]">
      <CardTitle>Amount</CardTitle>
      <CardValue>{pence == null || (original && pence === 0) ? "—" : formatGBP(pence)}</CardValue>
      {original ? (
        <p className="mt-1 text-xs text-muted">
          {original.amountMinor == null
            ? `Paid in ${original.currency}`
            : `${formatCurrencyAmount(original.amountMinor, original.currency)} paid`}
        </p>
      ) : null}
    </Card>
  );
}

/** Report the form's current values to the page header; a no-op without a provider. */
export function useReportExpenseSummary(
  description: string,
  pence: number | null,
  originalCurrency: string | null,
  originalAmountMinor: number | null,
) {
  const setSummary = useContext(ExpenseSummaryContext)?.setSummary;
  useEffect(() => {
    setSummary?.({
      description,
      pence,
      original: originalCurrency
        ? { currency: originalCurrency, amountMinor: originalAmountMinor }
        : null,
    });
  }, [setSummary, description, pence, originalCurrency, originalAmountMinor]);
}
