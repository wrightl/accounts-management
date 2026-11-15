"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { openYearEnd } from "@/actions/year-end";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/form";

export type YearOption = {
  from: string;
  to: string;
  /** "1 April 2025 to 31 March 2026", with "(in progress)" for the current year. */
  label: string;
};

const key = (period: { from: string; to: string }) => `${period.from}_${period.to}`;

/** Step 1 of Year end: pick a standard year, or a custom range for a first or final period. */
export function YearChooser({
  years,
  selected,
  suggested,
  customSelected,
  canRecord,
}: {
  years: YearOption[];
  /** The period being reviewed, if any. */
  selected: { from: string; to: string } | null;
  /** The most recent completed year, chosen until the person picks another. */
  suggested: { from: string; to: string };
  /** The period being reviewed is not one of the standard years. */
  customSelected: boolean;
  /** Whether this person may record the year as reviewed (they can download the pack). */
  canRecord: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(
    selected && !customSelected ? key(selected) : key(suggested),
  );
  const [from, setFrom] = useState(customSelected && selected ? selected.from : "");
  const [to, setTo] = useState(customSelected && selected ? selected.to : "");

  const open = (period: { from: string; to: string }) => {
    setError(null);
    startTransition(async () => {
      // Without permission to record a review, just show the year.
      const result = canRecord ? await openYearEnd(period.from, period.to) : { ok: true as const };
      if (result.ok) {
        router.push(`/year-end?from=${period.from}&to=${period.to}`);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[18rem] flex-1 sm:flex-none">
          <Label htmlFor="year-end-year">Accounting year</Label>
          <Select
            id="year-end-year"
            value={year}
            disabled={pending}
            options={years.map((y) => ({ value: key(y), label: y.label }))}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            const chosen = years.find((y) => key(y) === year);
            if (chosen) open(chosen);
          }}
        >
          {pending ? "Checking…" : "Review this year"}
        </Button>
      </div>

      <details className="mt-4" open={customSelected}>
        <summary className="cursor-pointer text-sm text-muted">
          Advanced: use a custom date range
        </summary>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Only for a first or final period that is longer or shorter than 12 months. Agree the
          dates with your accountant first.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="year-end-from">Period start</Label>
            <Input
              id="year-end-from"
              type="date"
              value={from}
              disabled={pending}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="year-end-to">Period end</Label>
            <Input
              id="year-end-to"
              type="date"
              value={to}
              disabled={pending}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={pending || !from || !to}
            onClick={() => open({ from, to })}
          >
            Review this range
          </Button>
        </div>
      </details>
      <FieldError id="year-end-error">{error}</FieldError>
    </div>
  );
}
