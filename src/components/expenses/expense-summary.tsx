"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { formatExpenseAmount } from "@/lib/money";

type LiveSummary = { description: string; pence: number | null; currency: string };

const ExpenseSummaryContext = createContext<{
  summary: LiveSummary;
  setSummary: (summary: LiveSummary) => void;
} | null>(null);

/** Shares the form's unsaved description, amount and currency with the page header. */
export function ExpenseSummaryProvider({
  initialDescription,
  initialPence,
  initialCurrency,
  children,
}: {
  initialDescription: string;
  initialPence: number;
  initialCurrency: string;
  children: ReactNode;
}) {
  const [summary, setSummary] = useState<LiveSummary>({
    description: initialDescription,
    pence: initialPence,
    currency: initialCurrency,
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
  const { pence, currency } = context.summary;
  return (
    <Card className="min-w-[140px]">
      <CardTitle>Amount</CardTitle>
      <CardValue>{pence == null ? "—" : formatExpenseAmount(pence, currency)}</CardValue>
    </Card>
  );
}

/** Report the form's current values to the page header; a no-op without a provider. */
export function useReportExpenseSummary(
  description: string,
  pence: number | null,
  currency: string,
) {
  const setSummary = useContext(ExpenseSummaryContext)?.setSummary;
  useEffect(() => {
    setSummary?.({ description, pence, currency });
  }, [setSummary, description, pence, currency]);
}
