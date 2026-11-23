"use client";

import { CircleHelp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * A help icon that opens how a set of figures is worked out. Keeps method
 * notes off the page so the figures come first; put it beside the heading
 * of the figures it explains.
 */
export function HowWorkedOut({
  title = "How this is worked out",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={buttonClasses("ghost", "size-8 shrink-0 border-transparent px-0")}
        aria-label={title}
        title={title}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <CircleHelp className="h-4 w-4" aria-hidden />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title}>
        <div className="space-y-3 text-sm">{children}</div>
      </Dialog>
    </>
  );
}
