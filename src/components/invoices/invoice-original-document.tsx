"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  attachInvoiceDocument,
  removeInvoiceDocument,
} from "@/actions/invoice-documents";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Label } from "@/components/ui/form";
import { MAX_RECEIPT_BYTES } from "@/lib/expenses/receipt-file";

/** Attach the PDF the client actually received, for an imported invoice. */
export function InvoiceOriginalDocument({
  invoiceId,
  filename,
}: {
  invoiceId: string;
  filename: string | null;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_RECEIPT_BYTES) {
      setError("The PDF can be up to 4.5 MB");
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set("document", file);
    startTransition(async () => {
      const result = await attachInvoiceDocument(invoiceId, formData);
      if (inputRef.current) inputRef.current.value = "";
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  async function onRemove() {
    const ok = await confirm({
      title: "Remove the original",
      message:
        "This invoice's PDF will become a generated record, marked as issued elsewhere. Clients with the link will see that instead.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await removeInvoiceDocument(invoiceId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="mt-3 rounded-xl bg-wash px-4 py-3 text-sm">
      <p>
        {filename
          ? `Original attached: ${filename}. It's used wherever this invoice's PDF appears.`
          : "No original attached, so this invoice's PDF is a generated record, marked as issued elsewhere."}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="invoice-original">
            {filename ? "Replace the original (PDF)" : "Attach the original (PDF)"}
          </Label>
          <input
            ref={inputRef}
            id="invoice-original"
            type="file"
            accept="application/pdf"
            disabled={pending}
            aria-describedby={error ? "invoice-original-error" : undefined}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
        {filename ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
      <FieldError id="invoice-original-error">{error}</FieldError>
    </div>
  );
}
