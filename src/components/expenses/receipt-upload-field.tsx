"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { extractReceiptFields } from "@/actions/expenses";
import type { ReceiptExtraction } from "@/lib/expenses/receipt-parse";
import { receiptOcrProviderLabel } from "@/lib/expenses/receipt-parse";

function extractionSummary(extraction: ReceiptExtraction): string {
  const parts: string[] = [];
  if (extraction.description) parts.push("description");
  if (extraction.amountPounds) parts.push("amount");
  if (extraction.spentAt) parts.push("date");
  if (extraction.category) parts.push("category");
  if (parts.length === 0) return "No fields could be read — fill in the details manually.";
  return `Filled: ${parts.join(", ")}`;
}

export function ReceiptUploadField({
  disabled,
  receiptOcrProvider,
  receiptOcrModel,
  onFileChange,
  onExtraction,
}: {
  disabled?: boolean;
  receiptOcrProvider: string;
  receiptOcrModel?: string;
  onFileChange: (file: File | null) => void;
  onExtraction: (extraction: ReceiptExtraction | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractMessage, setExtractMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function setPreviewForFile(selected: File | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (selected?.type.startsWith("image/")) {
      const url = URL.createObjectURL(selected);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }

  function clearFile() {
    setFile(null);
    setPreviewForFile(null);
    setExtractError(null);
    setExtractMessage(null);
    onFileChange(null);
    onExtraction(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFileSelected(selected: File | null) {
    setExtractError(null);
    setExtractMessage(null);
    setFile(selected);
    setPreviewForFile(selected);
    onFileChange(selected);
    onExtraction(null);

    if (!selected) return;

    const formData = new FormData();
    formData.set("receipt", selected);
    startTransition(async () => {
      const result = await extractReceiptFields(formData);
      if (!result.ok) {
        setExtractError(result.error);
        return;
      }
      onExtraction(result.extraction);
      setExtractMessage(extractionSummary(result.extraction));
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Receipt</h2>
        <p className="mt-1 text-xs text-muted">
          Upload a receipt to pre-fill expense details ({receiptOcrProviderLabel(receiptOcrProvider, receiptOcrModel)}).
          The file will be attached when you save.
        </p>
      </div>

      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Receipt preview"
          className="max-h-40 rounded-md border border-border object-contain"
        />
      )}

      {file && (
        <p className="text-sm text-muted">
          {file.name} ({Math.round(file.size / 1024)} KB)
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Label htmlFor="receipt-upload">Receipt file</Label>
          <Input
            ref={inputRef}
            id="receipt-upload"
            name="receipt"
            type="file"
            accept="image/*,application/pdf"
            disabled={disabled || pending}
            onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
          />
        </div>
        {file && (
          <Button type="button" variant="ghost" disabled={disabled || pending} onClick={clearFile}>
            Remove
          </Button>
        )}
      </div>

      {pending && <p className="text-sm text-muted">Reading receipt…</p>}
      {extractMessage && !pending && (
        <p className="text-sm text-muted">{extractMessage}</p>
      )}
      <FieldError>{extractError}</FieldError>
    </div>
  );
}
