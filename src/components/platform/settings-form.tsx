"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import {
  refreshStripeCatalogAction,
  updatePlatformSettingsAction,
} from "@/actions/platform";
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

type CatalogPreview = {
  essentials: {
    name: string;
    description: string | null;
    monthLabel: string;
    yearLabel: string;
  } | null;
  premium: {
    name: string;
    description: string | null;
    monthLabel: string;
    yearLabel: string;
  } | null;
};

export function PlatformSettingsForm({
  initial,
  ocrModels = [],
  catalogPreview,
}: {
  initial: {
    maintenanceBanner: string | null;
    defaultReceiptOcrProvider: string;
    defaultReceiptOcrModel: string;
    stripePriceEssentialsMonthly: string | null;
    stripePriceEssentialsYearly: string | null;
    stripePricePremiumMonthly: string | null;
    stripePricePremiumYearly: string | null;
  };
  ocrModels?: ReceiptOcrModelOption[];
  catalogPreview: CatalogPreview;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [refreshPending, startRefresh] = useTransition();
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

      <div className="border-t border-border pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">Stripe plans</h2>
            <p className="mt-1 text-xs text-muted">
              Paste Price IDs from the Stripe Dashboard. Name, description, and
              amounts are loaded from Stripe and cached.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={refreshPending || pending}
            onClick={() => {
              startRefresh(async () => {
                const result = await refreshStripeCatalogAction();
                if (result.ok) {
                  toast("Stripe catalog refreshed.");
                  router.refresh();
                } else {
                  toast(result.error ?? "Could not refresh catalog.");
                }
              });
            }}
          >
            {refreshPending ? "Refreshing…" : "Refresh Stripe catalog"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="stripePriceEssentialsMonthly">
            Essentials monthly
          </Label>
          <Input
            id="stripePriceEssentialsMonthly"
            name="stripePriceEssentialsMonthly"
            defaultValue={initial.stripePriceEssentialsMonthly ?? ""}
            placeholder="price_…"
            disabled={pending}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.stripePriceEssentialsMonthly)}
            aria-describedby={
              fieldErrors.stripePriceEssentialsMonthly
                ? "stripePriceEssentialsMonthly-error"
                : undefined
            }
            onChange={() => clearField("stripePriceEssentialsMonthly")}
          />
          <FieldError id="stripePriceEssentialsMonthly-error">
            {fieldErrors.stripePriceEssentialsMonthly}
          </FieldError>
        </div>
        <div>
          <Label htmlFor="stripePriceEssentialsYearly">
            Essentials yearly
          </Label>
          <Input
            id="stripePriceEssentialsYearly"
            name="stripePriceEssentialsYearly"
            defaultValue={initial.stripePriceEssentialsYearly ?? ""}
            placeholder="price_…"
            disabled={pending}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.stripePriceEssentialsYearly)}
            aria-describedby={
              fieldErrors.stripePriceEssentialsYearly
                ? "stripePriceEssentialsYearly-error"
                : undefined
            }
            onChange={() => clearField("stripePriceEssentialsYearly")}
          />
          <FieldError id="stripePriceEssentialsYearly-error">
            {fieldErrors.stripePriceEssentialsYearly}
          </FieldError>
        </div>
      </div>
      {catalogPreview.essentials ? (
        <p className="rounded-xl bg-wash/60 px-3 py-2 text-xs text-muted">
          <span className="font-medium text-foreground">
            {catalogPreview.essentials.name}
          </span>
          {catalogPreview.essentials.description
            ? ` — ${catalogPreview.essentials.description}`
            : null}
          <br />
          {catalogPreview.essentials.monthLabel}/mo ·{" "}
          {catalogPreview.essentials.yearLabel}/yr
        </p>
      ) : (
        <p className="text-xs text-muted">
          Cached Essentials details appear here once both price IDs are set and
          Stripe responds.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="stripePricePremiumMonthly">Premium monthly</Label>
          <Input
            id="stripePricePremiumMonthly"
            name="stripePricePremiumMonthly"
            defaultValue={initial.stripePricePremiumMonthly ?? ""}
            placeholder="price_…"
            disabled={pending}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.stripePricePremiumMonthly)}
            aria-describedby={
              fieldErrors.stripePricePremiumMonthly
                ? "stripePricePremiumMonthly-error"
                : undefined
            }
            onChange={() => clearField("stripePricePremiumMonthly")}
          />
          <FieldError id="stripePricePremiumMonthly-error">
            {fieldErrors.stripePricePremiumMonthly}
          </FieldError>
        </div>
        <div>
          <Label htmlFor="stripePricePremiumYearly">Premium yearly</Label>
          <Input
            id="stripePricePremiumYearly"
            name="stripePricePremiumYearly"
            defaultValue={initial.stripePricePremiumYearly ?? ""}
            placeholder="price_…"
            disabled={pending}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.stripePricePremiumYearly)}
            aria-describedby={
              fieldErrors.stripePricePremiumYearly
                ? "stripePricePremiumYearly-error"
                : undefined
            }
            onChange={() => clearField("stripePricePremiumYearly")}
          />
          <FieldError id="stripePricePremiumYearly-error">
            {fieldErrors.stripePricePremiumYearly}
          </FieldError>
        </div>
      </div>
      {catalogPreview.premium ? (
        <p className="rounded-xl bg-wash/60 px-3 py-2 text-xs text-muted">
          <span className="font-medium text-foreground">
            {catalogPreview.premium.name}
          </span>
          {catalogPreview.premium.description
            ? ` — ${catalogPreview.premium.description}`
            : null}
          <br />
          {catalogPreview.premium.monthLabel}/mo ·{" "}
          {catalogPreview.premium.yearLabel}/yr
        </p>
      ) : (
        <p className="text-xs text-muted">
          Cached Premium details appear here once both price IDs are set and
          Stripe responds.
        </p>
      )}

      <FormStickyActions error={error}>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </FormStickyActions>
    </form>
  );
}
