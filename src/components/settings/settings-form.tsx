"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { BankFields } from "@/components/settings/bank-fields";
import { financialYearStartMonth } from "@/lib/dates";
import { updateCompany } from "@/actions/settings";
import { STANDARD_VAT_RATE } from "@/lib/vat";

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
}: {
  settings: {
    entityType: "limited_company" | "sole_trader";
    name: string;
    legalName: string;
    companyNumber: string | null;
    utr: string | null;
    vatRegistered: boolean;
    vatNumber: string | null;
    defaultVatRate: number;
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
    logoUrl: string | null;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [vatRegistered, setVatRegistered] = useState(settings.vatRegistered);
  const initialRate = settings.defaultVatRate;
  const [rateChoice, setRateChoice] = useState<"0" | "20" | "custom">(
    initialRate === 0 ? "0" : initialRate === STANDARD_VAT_RATE ? "20" : "custom",
  );
  const [customRate, setCustomRate] = useState(
    initialRate !== 0 && initialRate !== STANDARD_VAT_RATE
      ? String(initialRate)
      : "",
  );

  const resolvedDefaultRate =
    rateChoice === "0"
      ? 0
      : rateChoice === "20"
        ? STANDARD_VAT_RATE
        : Number(customRate) || STANDARD_VAT_RATE;

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <form
        action={(formData) => {
          setError(null);
          setMessage(null);
          formData.set("defaultVatRate", String(resolvedDefaultRate));
          if (!vatRegistered) {
            formData.delete("vatRegistered");
          }
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

        <h2 className="pt-4 font-display text-lg font-semibold">VAT</h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="vatRegistered"
            value="on"
            checked={vatRegistered}
            onChange={(e) => setVatRegistered(e.target.checked)}
            disabled={pending}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-foreground">VAT registered</span>
            <span className="mt-0.5 block text-xs text-muted">
              Enables VAT rates on quotes, invoices, orders, and expenses. Export
              only — this app does not submit to HMRC.
            </span>
          </span>
        </label>
        {vatRegistered ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="vatNumber">VAT number</Label>
              <Input
                id="vatNumber"
                name="vatNumber"
                required
                defaultValue={settings.vatNumber ?? ""}
                disabled={pending}
                placeholder="GB123456789"
              />
            </div>
            <div>
              <Label htmlFor="defaultVatRateChoice">Default VAT rate</Label>
              <Select
                id="defaultVatRateChoice"
                value={rateChoice}
                onChange={(e) =>
                  setRateChoice(e.target.value as "0" | "20" | "custom")
                }
                disabled={pending}
              >
                <option value="20">20% (standard)</option>
                <option value="0">0% (zero-rated)</option>
                <option value="custom">Custom…</option>
              </Select>
              {rateChoice === "custom" ? (
                <Input
                  className="mt-2"
                  type="number"
                  min={0}
                  max={100}
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  disabled={pending}
                  placeholder="e.g. 5"
                  aria-label="Custom VAT rate percent"
                />
              ) : null}
              <input type="hidden" name="defaultVatRate" value={resolvedDefaultRate} />
              <p className="mt-1 text-xs text-muted">
                Applied to new document lines. You can override per line.
              </p>
            </div>
          </div>
        ) : (
          <>
            <input type="hidden" name="vatNumber" value="" />
            <input type="hidden" name="defaultVatRate" value="20" />
          </>
        )}

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

        <FieldError>{error}</FieldError>
        {message && <p className="text-sm text-success">{message}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </form>

    </div>
  );
}
