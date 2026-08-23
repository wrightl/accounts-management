"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/form";
import {
  PERIOD_PRESET_OPTIONS,
  formatPeriodRangeLabel,
  periodPresetLabel,
  todayIsoDate,
  type PeriodPreset,
} from "@/lib/dates";
import { bankListHref, type BankListParams } from "@/lib/bank/list-params";
import { cn } from "@/lib/utils";

const ALL_TIME = { value: "", label: "All time" } as const;

function defaultCustomRange(): { from: string; to: string } {
  const today = todayIsoDate();
  const from = `${today.slice(0, 8)}01`;
  return { from, to: today };
}

function periodButtonLabel(params: BankListParams): string {
  if (!params.period) return ALL_TIME.label;
  if (params.period === "custom" && params.from && params.to) {
    return formatPeriodRangeLabel(params.from, params.to);
  }
  return periodPresetLabel(params.period);
}

export function BankPeriodRangeSelect({ params }: { params: BankListParams }) {
  const router = useRouter();
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const defaults = defaultCustomRange();
  const [customFrom, setCustomFrom] = useState(params.from || defaults.from);
  const [customTo, setCustomTo] = useState(params.to || defaults.to);

  useEffect(() => {
    setCustomFrom(params.from || defaults.from);
    setCustomTo(params.to || defaults.to);
  }, [params.from, params.to, defaults.from, defaults.to]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const navigate = (overrides: Partial<BankListParams>) => {
    router.push(bankListHref(params, { ...overrides, page: 1 }));
    setOpen(false);
  };

  const applyCustom = () => {
    navigate({
      period: "custom",
      from: customFrom,
      to: customTo,
    });
    setCustomOpen(false);
  };

  const options: { value: PeriodPreset | ""; label: string }[] = [
    ALL_TIME,
    ...PERIOD_PRESET_OPTIONS,
  ];

  return (
    <>
      <div ref={rootRef} className="relative">
        <Label htmlFor={`${uid}-period`} className="mb-1 block">
          Date range
        </Label>
        <button
          id={`${uid}-period`}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            buttonClasses("secondary"),
            "w-full justify-between gap-2 font-normal",
          )}
        >
          <span className="truncate">{periodButtonLabel(params)}</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>

        {open ? (
          <ul
            role="listbox"
            aria-labelledby={`${uid}-period`}
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-surface py-1 shadow-lg"
          >
            {options.map((option) => {
              const active =
                option.value === params.period ||
                (option.value === "" && !params.period);
              return (
                <li key={option.value || "all-time"} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "flex w-full px-3 py-2 text-left text-sm hover:bg-wash",
                      active && "bg-accent/20 font-medium",
                    )}
                    onClick={() => {
                      if (option.value === "custom") {
                        setOpen(false);
                        setCustomOpen(true);
                        return;
                      }
                      navigate({
                        period: option.value,
                        from: "",
                        to: "",
                      });
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <Dialog
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Custom date range"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${uid}-custom-from`}>From</Label>
            <Input
              id={`${uid}-custom-from`}
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`${uid}-custom-to`}>To</Label>
            <Input
              id={`${uid}-custom-to`}
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        </div>
        <DialogActions>
          <button
            type="button"
            className={buttonClasses("ghost")}
            onClick={() => setCustomOpen(false)}
          >
            Cancel
          </button>
          <button type="button" className={buttonClasses("primary")} onClick={applyCustom}>
            Apply
          </button>
        </DialogActions>
      </Dialog>
    </>
  );
}
