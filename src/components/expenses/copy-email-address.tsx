"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";

export function CopyEmailAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(address);
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
