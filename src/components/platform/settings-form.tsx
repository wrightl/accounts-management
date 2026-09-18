"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import { updatePlatformSettingsAction } from "@/actions/platform";
import {
  CUSTOM_RECEIPT_OCR_MODEL,
  DEFAULT_RECEIPT_OCR_MODEL,
  receiptOcrModelOptions,
  type ReceiptOcrModelOption,
} from "@/lib/expenses/receipt-ocr-models";

export function PlatformSettingsForm({
  initial,
  ocrModels = [],
}: {
  initial: {
    maintenanceBanner: string | null;
    defaultReceiptOcrProvider: string;
    defaultReceiptOcrModel: string;
  };
  ocrModels?: ReceiptOcrModelOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [ocrProvider, setOcrProvider] = useState(
    initial.defaultReceiptOcrProvider ?? "local",
  );
  const savedModel = initial.defaultReceiptOcrModel || DEFAULT_RECEIPT_OCR_MODEL;
  const modelOptions = receiptOcrModelOptions(ocrModels, savedModel);
  const savedInCatalog = modelOptions.some((item) => item.id === savedModel);
  const [modelChoice, setModelChoice] = useState(
    savedInCatalog ? savedModel : CUSTOM_RECEIPT_OCR_MODEL,
  );
  const [customModel, setCustomModel] = useState(savedInCatalog ? "" : savedModel);
  const gatewaySelected = ocrProvider === "ai_gateway";
  const resolvedModel =
    modelChoice === CUSTOM_RECEIPT_OCR_MODEL
      ? customModel.trim()
      : modelChoice;

  return (
    <form
      className="mt-6 max-w-xl space-y-5 rounded-2xl border border-border bg-white p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setOk(false);
        const formData = new FormData(e.currentTarget);
        formData.set("defaultReceiptOcrProvider", ocrProvider);
        formData.set(
          "defaultReceiptOcrModel",
          resolvedModel || DEFAULT_RECEIPT_OCR_MODEL,
        );
        start(async () => {
          const result = await updatePlatformSettingsAction(formData);
          if (!result.ok) setError(result.error);
          else {
            setOk(true);
            router.refresh();
          }
        });
      }}
    >
      <label className="block text-sm">
        Maintenance banner
        <textarea
          name="maintenanceBanner"
          rows={3}
          defaultValue={initial.maintenanceBanner ?? ""}
          placeholder="Shown at the top of the tenant app when set"
          className="mt-1 w-full rounded-lg border border-border px-3 py-2"
        />
      </label>

      <div className="border-t border-border pt-5">
        <h2 className="font-display text-base font-semibold">Receipt OCR</h2>
        <p className="mt-1 text-xs text-muted">
          Applies to every company for expense receipt uploads and inbound email.
        </p>
      </div>

      <div>
        <Label htmlFor="defaultReceiptOcrProvider">Provider</Label>
        <Select
          id="defaultReceiptOcrProvider"
          name="defaultReceiptOcrProvider"
          value={ocrProvider}
          onChange={(e) => setOcrProvider(e.target.value)}
          disabled={pending}
        >
          <option value="local">
            Local extraction (PDF text + Tesseract for images)
          </option>
          <option value="ai_gateway">Vercel AI Gateway (vision model)</option>
        </Select>
        <p className="mt-1 text-xs text-muted">
          AI Gateway requires <code>AI_GATEWAY_API_KEY</code>.
        </p>
      </div>

      {gatewaySelected ? (
        <div>
          <Label htmlFor="receiptOcrModelChoice">AI Gateway model</Label>
          <Select
            id="receiptOcrModelChoice"
            value={modelChoice}
            onChange={(e) => setModelChoice(e.target.value)}
            disabled={pending}
          >
            {modelOptions.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} — {model.id}
              </option>
            ))}
            <option value={CUSTOM_RECEIPT_OCR_MODEL}>Custom model ID…</option>
          </Select>
          {modelChoice === CUSTOM_RECEIPT_OCR_MODEL ? (
            <Input
              id="receiptOcrModelCustom"
              className="mt-2"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              disabled={pending}
              placeholder={DEFAULT_RECEIPT_OCR_MODEL}
              autoComplete="off"
            />
          ) : null}
          <p className="mt-1 text-xs text-muted">
            Vision model used to read receipt images and PDFs. Use a
            provider/model slug such as {DEFAULT_RECEIPT_OCR_MODEL}.
          </p>
        </div>
      ) : null}

      <input
        type="hidden"
        name="defaultReceiptOcrModel"
        value={resolvedModel || DEFAULT_RECEIPT_OCR_MODEL}
      />

      <FieldError>{error}</FieldError>
      {ok ? <p className="text-sm text-green-700">Saved.</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
