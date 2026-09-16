"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { BankFields } from "@/components/settings/bank-fields";
import { financialYearStartMonth } from "@/lib/dates";
import { updateCompany } from "@/actions/settings";
import {
  CUSTOM_RECEIPT_OCR_MODEL,
  DEFAULT_RECEIPT_OCR_MODEL,
  receiptOcrModelOptions,
  type ReceiptOcrModelOption,
} from "@/lib/expenses/receipt-ocr-models";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function SettingsForm({
  settings,
  ocrModels = [],
}: {
  settings: {
    entityType: "limited_company" | "sole_trader";
    name: string;
    legalName: string;
    companyNumber: string | null;
    utr: string | null;
    addressLines: string | null;
    email: string | null;
    bankProvider: string | null;
    bankName: string | null;
    bankAccountName: string | null;
    sortCode: string | null;
    accountNumber: string | null;
    financialYearEndMonth: number;
    invoiceNumberPrefix: string;
    quoteNumberPrefix: string;
    orderNumberPrefix: string;
    invoicePaymentTermsDays: number;
    defaultMileageRatePence: number;
    receiptOcrProvider: string;
    receiptOcrModel: string;
    logoUrl: string | null;
  };
  ocrModels?: ReceiptOcrModelOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [ocrProvider, setOcrProvider] = useState(settings.receiptOcrProvider ?? "local");
  const savedModel = settings.receiptOcrModel || DEFAULT_RECEIPT_OCR_MODEL;
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
    <div className="mx-auto max-w-2xl space-y-10">
      <form
        action={(formData) => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await updateCompany(formData);
            if (!result.ok) setError(result.error);
            else {
              setMessage("Settings saved.");
              router.refresh();
            }
          });
        }}
        className="space-y-4"
      >
        <h2 className="font-display text-lg font-semibold">{settings.entityType === "sole_trader" ? "Business profile" : "Company profile"}</h2>
        <div>
          <Label htmlFor="name">Trading name</Label>
          <Input id="name" name="name" required defaultValue={settings.name} disabled={pending} />
        </div>
        <div>
          <Label htmlFor="legalName">Legal name</Label>
          <Input
            id="legalName"
            name="legalName"
            required
            defaultValue={settings.legalName}
            disabled={pending}
          />
        </div>
        {settings.entityType === "limited_company" ? (
          <div>
            <Label htmlFor="companyNumber">Company number</Label>
            <Input
              id="companyNumber"
              name="companyNumber"
              defaultValue={settings.companyNumber ?? ""}
              disabled={pending}
            />
          </div>
        ) : (
          <div>
            <Label htmlFor="utr">UTR (optional)</Label>
            <Input
              id="utr"
              name="utr"
              defaultValue={settings.utr ?? ""}
              disabled={pending}
            />
          </div>
        )}
        <div>
          <Label htmlFor="addressLines">Address</Label>
          <Textarea
            id="addressLines"
            name="addressLines"
            rows={3}
            defaultValue={settings.addressLines ?? ""}
            disabled={pending}
          />
        </div>
        <div>
          <Label htmlFor="email">Company email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={settings.email ?? ""}
            disabled={pending}
            placeholder="accounts@example.com"
          />
          <p className="mt-1 text-xs text-muted">Shown on invoice and quote PDFs.</p>
        </div>
        <div>
          <Label htmlFor="financialYearStartMonth">Financial year starts</Label>
          <Select
            id="financialYearStartMonth"
            name="financialYearStartMonth"
            defaultValue={String(financialYearStartMonth(settings.financialYearEndMonth))}
            disabled={pending}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted">
            Year runs{" "}
            {MONTHS[financialYearStartMonth(settings.financialYearEndMonth) - 1]}–
            {MONTHS[settings.financialYearEndMonth - 1]}.
          </p>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-surface/50 p-4">
          <Label htmlFor="logo">Logo (optional)</Label>
          {settings.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- private storage preview
            <img
              src={`/api/company/logo?v=${encodeURIComponent(settings.logoUrl)}`}
              alt="Company logo"
              className="max-h-24 rounded-md border border-border bg-surface object-contain p-2"
            />
          ) : (
            <p className="text-sm text-muted">No logo uploaded yet.</p>
          )}
          <Input id="logo" name="logo" type="file" accept="image/*" disabled={pending} />
          <p className="text-xs text-muted">
            Shown in the navigation and on invoices. PNG or JPG, under 2 MB. Leave empty to keep the current logo.
          </p>
        </div>

        <h2 className="pt-4 font-display text-lg font-semibold">Bank details</h2>
        <BankFields
          bankProvider={settings.bankProvider}
          bankName={settings.bankName}
          bankAccountName={settings.bankAccountName}
          sortCode={settings.sortCode}
          accountNumber={settings.accountNumber}
          disabled={pending}
          required
        />

        <h2 className="pt-4 font-display text-lg font-semibold">Invoicing</h2>
        <div>
          <Label htmlFor="invoiceNumberPrefix">Invoice number prefix</Label>
          <Input
            id="invoiceNumberPrefix"
            name="invoiceNumberPrefix"
            required
            defaultValue={settings.invoiceNumberPrefix}
            disabled={pending}
          />
          <p className="mt-1 text-xs text-muted">e.g. DD → DD-2026-0001</p>
        </div>
        <div>
          <Label htmlFor="quoteNumberPrefix">Quote number prefix</Label>
          <Input
            id="quoteNumberPrefix"
            name="quoteNumberPrefix"
            required
            defaultValue={settings.quoteNumberPrefix}
            disabled={pending}
          />
          <p className="mt-1 text-xs text-muted">e.g. Q → Q-2026-0001</p>
        </div>
        <div>
          <Label htmlFor="orderNumberPrefix">Order number prefix</Label>
          <Input
            id="orderNumberPrefix"
            name="orderNumberPrefix"
            required
            defaultValue={settings.orderNumberPrefix}
            disabled={pending}
          />
          <p className="mt-1 text-xs text-muted">e.g. O → O-2026-0001</p>
        </div>
        <div>
          <Label htmlFor="invoicePaymentTermsDays">Invoice payment terms (days)</Label>
          <Input
            id="invoicePaymentTermsDays"
            name="invoicePaymentTermsDays"
            type="number"
            min={1}
            max={365}
            required
            defaultValue={String(settings.invoicePaymentTermsDays)}
            disabled={pending}
          />
          <p className="mt-1 text-xs text-muted">
            Due date defaults to issue date plus this many days for full and partial invoices.
          </p>
        </div>

        <h2 className="pt-4 font-display text-lg font-semibold">Expenses</h2>
        <div>
          <Label htmlFor="defaultMileageRatePence">Default mileage rate (pence per mile)</Label>
          <Input
            id="defaultMileageRatePence"
            name="defaultMileageRatePence"
            type="number"
            min={1}
            max={1000}
            required
            defaultValue={String(settings.defaultMileageRatePence)}
            disabled={pending}
          />
          <p className="mt-1 text-xs text-muted">
            HMRC-style allowance for Travel expenses, e.g. 45 = 45p per mile.
          </p>
        </div>
        <div>
          <Label htmlFor="receiptOcrProvider">Receipt OCR provider</Label>
          <Select
            id="receiptOcrProvider"
            name="receiptOcrProvider"
            value={ocrProvider}
            onChange={(e) => setOcrProvider(e.target.value)}
            disabled={pending}
          >
            <option value="local">Local extraction (PDF text + Tesseract for images)</option>
            <option value="ai_gateway">Vercel AI Gateway (vision model)</option>
          </Select>
          <p className="mt-1 text-xs text-muted">
            Used when uploading a receipt on the new expense form to pre-fill fields.
            AI Gateway requires AI_GATEWAY_API_KEY.
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
        <input type="hidden" name="receiptOcrModel" value={resolvedModel || DEFAULT_RECEIPT_OCR_MODEL} />

        <FieldError>{error}</FieldError>
        {message && <p className="text-sm text-success">{message}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </form>

    </div>
  );
}
