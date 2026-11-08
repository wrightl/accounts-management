"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { Input, Label } from "@/components/ui/form";

// Typing a year into a date input fires a change per keystroke ("0002", "0020", …),
// so wait for a pause and ignore years that can't be meant.
const DEBOUNCE_MS = 400;
const isUsableDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number(iso.slice(0, 4)) >= 1900;

/** From/To period picker that reloads the report as soon as either date changes. */
export function ReportPeriodForm({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const scheduleUpdate = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const nextFrom = fromRef.current?.value ?? "";
      const nextTo = toRef.current?.value ?? "";
      if (!isUsableDate(nextFrom) || !isUsableDate(nextTo)) return;
      if (nextFrom === from && nextTo === to) return;
      const params = new URLSearchParams({ from: nextFrom, to: nextTo });
      startTransition(() => {
        router.replace(`${pathname}?${params}`, { scroll: false });
      });
    }, DEBOUNCE_MS);
  };

  return (
    <div className="mt-6 flex flex-wrap items-end gap-3">
      <div>
        <Label htmlFor="from">From</Label>
        <Input ref={fromRef} id="from" name="from" type="date" defaultValue={from} onChange={scheduleUpdate} />
      </div>
      <div>
        <Label htmlFor="to">To</Label>
        <Input ref={toRef} id="to" name="to" type="date" defaultValue={to} onChange={scheduleUpdate} />
      </div>
      <p className="pb-2 text-sm text-muted" aria-live="polite">
        {pending ? "Updating…" : ""}
      </p>
    </div>
  );
}
