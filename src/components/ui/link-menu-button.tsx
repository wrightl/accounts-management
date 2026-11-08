"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses, type Variant } from "@/components/ui/button";

export type LinkMenuItem = {
  key: string;
  label: string;
  href: string;
};

/** A button that opens a menu of links, such as downloads. Usable from server pages. */
export function LinkMenuButton({
  label,
  items,
  variant = "primary",
}: {
  label: string;
  items: LinkMenuItem[];
  variant?: Variant;
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={buttonClasses(variant)}
      >
        {label}
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-max overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
        >
          {items.map((item) => (
            <li key={item.key} role="none">
              <a
                href={item.href}
                role="menuitem"
                className="flex w-full px-3 py-2 text-left text-sm hover:bg-wash"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
