"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { updatePlatformSettingsAction } from "@/actions/platform";
import { toast } from "@/components/ui/toast";
import {
  CUSTOM_RECEIPT_OCR_MODEL,
  DEFAULT_RECEIPT_OCR_MODEL,
  receiptOcrModelOptions,
  type ReceiptOcrModelOption,
} from "@/lib/expenses/receipt-ocr-models";
import {
  parsePlatformSettingsInput,
  platformSettingsRawFromFormData,
} from "@/lib/platform/schema";

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
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
  } = useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
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
      ref={formRef}
      noValidate
      className="mt-6 max-w-xl space-y-5 rounded-2xl border border-border bg-white p-6"
      onSubmit={preventResetSubmit((formData) => {
        clearAll();
        formData.set("defaultReceiptOcrProvider", ocrProvider);
        formData.set(
          "defaultReceiptOcrModel",
          resolvedModel || DEFAULT_RECEIPT_OCR_MODEL,
        );
        const clientParsed = parsePlatformSettingsInput(
          platformSettingsRawFromFormData(formData),
        );
        if (!clientParsed.ok) {
          applyFail(clientParsed);
          scheduleFocusFirstFieldError(
            formRef.current,
            clientParsed.fieldErrors,
          );
          return;
        }
        start(async () => {
          const result = await updatePlatformSettingsAction(formData);
          if (applyActionResult(result)) {
            toast("Saved.");
            router.refresh();
          } else if (!result.ok) {
            scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
          }
        });
      })}
    >
      <div>
        <Label htmlFor="maintenanceBanner">Maintenance banner</Label>
        <Textarea
          id="maintenanceBanner"
          name="maintenanceBanner"
          rows={3}
          defaultValue={initial.maintenanceBanner ?? ""}
          placeholder="Shown at the top of the tenant app when set"
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.maintenanceBanner)}
          aria-describedby={
            fieldErrors.maintenanceBanner ? "maintenanceBanner-error" : undefined
          }
          onChange={() => clearField("maintenanceBanner")}
        />
        <FieldError id="maintenanceBanner-error">
          {fieldErrors.maintenanceBanner}
        </FieldError>
      </div>

      <div className="border-t border-border pt-5">
        <h2 className="font-display text-base font-semibold">Receipt OCR</h2>
        <p className="mt-1 text-xs text-muted">
          Applies to every company for expense receipt uploads and inbound email.
        </p>
      </div>

      <div>
        <Label htmlFor="defaultReceiptOcrProvider" required>
          Provider
        </Label>
        <Select
          id="defaultReceiptOcrProvider"
          name="defaultReceiptOcrProvider"
          value={ocrProvider}
          onChange={(e) => {
            setOcrProvider(e.target.value);
            clearField("defaultReceiptOcrProvider");
            clearField("defaultReceiptOcrModel");
          }}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.defaultReceiptOcrProvider)}
          aria-describedby={
            fieldErrors.defaultReceiptOcrProvider
              ? "defaultReceiptOcrProvider-error"
              : undefined
          }
        >
          <option value="local">
            Local extraction (PDF text + Tesseract for images)
          </option>
          <option value="ai_gateway">Vercel AI Gateway (vision model)</option>
        </Select>
        <p className="mt-1 text-xs text-muted">
          AI Gateway requires <code>AI_GATEWAY_API_KEY</code>.
        </p>
        <FieldError id="defaultReceiptOcrProvider-error">
          {fieldErrors.defaultReceiptOcrProvider}
        </FieldError>
      </div>

      {gatewaySelected ? (
        <div>
          <Label htmlFor="receiptOcrModelChoice" required>
            AI Gateway model
          </Label>
          <Select
            id="receiptOcrModelChoice"
            value={modelChoice}
            onChange={(e) => {
              setModelChoice(e.target.value);
              clearField("defaultReceiptOcrModel");
            }}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.defaultReceiptOcrModel)}
            aria-describedby={
              fieldErrors.defaultReceiptOcrModel
                ? "defaultReceiptOcrModel-error"
                : undefined
            }
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
              onChange={(e) => {
                setCustomModel(e.target.value);
                clearField("defaultReceiptOcrModel");
              }}
              disabled={pending}
              placeholder={DEFAULT_RECEIPT_OCR_MODEL}
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.defaultReceiptOcrModel)}
              aria-describedby={
                fieldErrors.defaultReceiptOcrModel
                  ? "defaultReceiptOcrModel-error"
                  : undefined
              }
            />
          ) : null}
          <p className="mt-1 text-xs text-muted">
            Vision model used to read receipt images and PDFs. Use a
            provider/model slug such as {DEFAULT_RECEIPT_OCR_MODEL}.
          </p>
          <FieldError id="defaultReceiptOcrModel-error">
            {fieldErrors.defaultReceiptOcrModel}
          </FieldError>
        </div>
      ) : null}

      <input
        type="hidden"
        name="defaultReceiptOcrModel"
        value={resolvedModel || DEFAULT_RECEIPT_OCR_MODEL}
      />

      <FormStickyActions error={error}>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </FormStickyActions>
    </form>
  );
}
