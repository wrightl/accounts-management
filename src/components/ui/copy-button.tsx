"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";

/** Copies `value` to the clipboard and briefly confirms. */
export function CopyButton({ value }: { value: string }) {
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
      className={buttonClasses("secondary", "text-xs shrink-0")}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
