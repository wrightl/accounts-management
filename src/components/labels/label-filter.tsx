"use client";

import { Command } from "cmdk";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LabelChip } from "@/components/labels/label-chip";
import { Label } from "@/components/ui/form";
import type { RowLabel } from "@/lib/labels/queries";
import { cn } from "@/lib/utils";

/** Searchable multi-select; rows match if they carry any selected label. */
export function LabelFilter({
  labels,
  selected,
  onChange,
}: {
  labels: readonly RowLabel[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (labels.length === 0) return null;

  const selectedLabels = labels.filter((l) => selected.includes(l.id));

  return (
    <div ref={rootRef} className="relative">
      <Label htmlFor="label-filter">Labels</Label>
      <button
        id="label-filter"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm text-foreground focus:border-navy focus:outline-none focus:ring-2 focus:ring-accent/50"
      >
        <span className="truncate">
          {selectedLabels.length === 0
            ? "All"
            : selectedLabels.length === 1
              ? selectedLabels[0].name
              : `${selectedLabels.length} labels`}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </button>
      {open ? (
        <div
          className="absolute left-0 z-30 mt-1 w-64 max-w-[80vw] rounded-xl border border-border bg-surface p-2 shadow-lg"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <Command>
            <Command.Input
              autoFocus
              placeholder="Search labels…"
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus:outline-none"
            />
            <Command.List className="mt-2 max-h-56 overflow-y-auto">
              <Command.Empty className="px-2 py-1.5 text-sm text-muted">No labels found.</Command.Empty>
              {labels.map((label) => {
                const isSelected = selected.includes(label.id);
                return (
                  <Command.Item
                    key={label.id}
                    value={label.name}
                    onSelect={() =>
                      onChange(
                        isSelected
                          ? selected.filter((id) => id !== label.id)
                          : [...selected, label.id],
                      )
                    }
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 data-[selected=true]:bg-wash"
                  >
                    <LabelChip name={label.name} color={label.color} />
                    <Check
                      className={cn("h-4 w-4 shrink-0", !isSelected && "invisible")}
                      aria-hidden
                    />
                  </Command.Item>
                );
              })}
            </Command.List>
          </Command>
        </div>
      ) : null}
    </div>
  );
}
