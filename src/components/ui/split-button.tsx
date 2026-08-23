"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses, type Variant } from "@/components/ui/button";

export type SplitButtonOption = {
  key: string;
  label: string;
  onSelect: () => void;
};

export function SplitButton({
  primaryLabel,
  onPrimary,
  options,
  disabled,
  variant = "primary",
  menuAriaLabel = "More actions",
}: {
  primaryLabel: string;
  onPrimary: () => void;
  options: SplitButtonOption[];
  disabled?: boolean;
  variant?: Variant;
  menuAriaLabel?: string;
}) {
  const uid = useId();
  const menuId = `${uid}-menu`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (options.length === 0) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onPrimary}
        className={buttonClasses(variant)}
      >
        {primaryLabel}
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        onClick={onPrimary}
        className={cn(buttonClasses(variant), "rounded-r-none pr-4")}
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={menuAriaLabel}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          buttonClasses(variant),
          "rounded-l-none border-l border-white/25 px-2.5",
        )}
      >
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-max overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
        >
          {options.map((option) => (
            <li key={option.key} role="none">
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2 text-left text-sm hover:bg-wash"
                onClick={() => {
                  setOpen(false);
                  option.onSelect();
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
