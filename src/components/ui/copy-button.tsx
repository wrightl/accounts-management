"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Copies `value` to the clipboard and briefly confirms. */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={label}
      className={cn(buttonClasses("secondary", "text-xs shrink-0"), className)}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
