"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { BankFields } from "@/components/settings/bank-fields";
import { financialYearStartMonth } from "@/lib/dates";
import { updateCompany } from "@/actions/settings";
import { toast } from "@/components/ui/toast";
import { LOGO_ACCEPT } from "@/lib/company-logo-file";
import { STANDARD_VAT_RATE } from "@/lib/vat";
import {
  companySettingsRawFromFormData,
  parseCompanySettingsInput,
} from "@/lib/settings/schema";

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
  members = [],
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
    creditNoteNumberPrefix: string;
    invoicePaymentTermsDays: number;
    defaultMileageRatePence: number;
    openingCashPence: number | null;
    openingCashAsAt: string | null;
    yearEndOnFifthApril: boolean;
    accountingBasis: "cash" | "accruals" | null;
    tradingStartedOn: string | null;
    ownerUserId: string | null;
    fixedAssetThresholdPence: number;
    logoUrl: string | null;
  };
  /** People in the business, for choosing a sole trader's owner. */
  members?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
  } = useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
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
        : customRate.trim() === ""
          ? ""
          : Number(customRate);

  return (
    <div className="space-y-10">
      <form
        ref={formRef}
        noValidate
        onSubmit={preventResetSubmit((formData) => {
          clearAll();
          formData.set("defaultVatRate", String(resolvedDefaultRate));
          if (!vatRegistered) {
            formData.delete("vatRegistered");
          }
          const raw = companySettingsRawFromFormData(formData);
          const clientParsed = parseCompanySettingsInput(raw, {
            bankRequired: true,
          });
          if (!clientParsed.ok) {
            applyFail(clientParsed);
            scheduleFocusFirstFieldError(
              formRef.current,
              clientParsed.fieldErrors,
            );
            return;
          }
          startTransition(async () => {
            const result = await updateCompany(formData);
            if (applyActionResult(result)) {
              toast("Settings saved.");
              router.refresh();
            } else if (!result.ok) {
              scheduleFocusFirstFieldError(
                formRef.current,
                result.fieldErrors,
              );
            }
          });
        })}
        className="space-y-4"
      >
        <h2 id="details" className="scroll-mt-8 font-display text-lg font-semibold">
          {settings.entityType === "sole_trader"
            ? "Business profile"
            : "Company profile"}
        </h2>
        <div>
          <Label htmlFor="name" required>
            Trading name
          </Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={settings.name}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            onChange={() => clearField("name")}
          />
          <FieldError id="name-error">{fieldErrors.name}</FieldError>
        </div>
        <div>
          <Label htmlFor="legalName" required>
            Legal name
          </Label>
          <Input
            id="legalName"
            name="legalName"
            required
            defaultValue={settings.legalName}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.legalName)}
            aria-describedby={
              fieldErrors.legalName ? "legalName-error" : undefined
            }
            onChange={() => clearField("legalName")}
          />
          <FieldError id="legalName-error">{fieldErrors.legalName}</FieldError>
        </div>
        {settings.entityType === "limited_company" ? (
          <div>
            <Label htmlFor="companyNumber">Company number (optional)</Label>
            <Input
              id="companyNumber"
              name="companyNumber"
              defaultValue={settings.companyNumber ?? ""}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.companyNumber)}
              aria-describedby={
                fieldErrors.companyNumber ? "companyNumber-error" : undefined
              }
              onChange={() => clearField("companyNumber")}
            />
            <FieldError id="companyNumber-error">
              {fieldErrors.companyNumber}
            </FieldError>
          </div>
        ) : null}
        {(
          <div>
            <Label htmlFor="utr">
              {settings.entityType === "limited_company"
                ? "Company UTR (optional)"
                : "Self Assessment UTR (optional)"}
            </Label>
            <Input
              id="utr"
              name="utr"
              defaultValue={settings.utr ?? ""}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.utr)}
              aria-describedby={fieldErrors.utr ? "utr-error" : undefined}
              onChange={() => clearField("utr")}
            />
            <p className="mt-1 text-xs text-muted">
              The 10-digit Unique Taxpayer Reference from HMRC. Your accountant needs it at the year end.
            </p>
            <FieldError id="utr-error">{fieldErrors.utr}</FieldError>
          </div>
        )}
        <div>
          <Label htmlFor="addressLines">Address (optional)</Label>
          <Textarea
            id="addressLines"
            name="addressLines"
            rows={3}
            defaultValue={settings.addressLines ?? ""}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.addressLines)}
            aria-describedby={
              fieldErrors.addressLines ? "addressLines-error" : undefined
            }
            onChange={() => clearField("addressLines")}
          />
          <FieldError id="addressLines-error">
            {fieldErrors.addressLines}
          </FieldError>
        </div>
        <div>
          <Label htmlFor="email">Company email (optional)</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={settings.email ?? ""}
            disabled={pending}
            placeholder="accounts@example.com"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            onChange={() => clearField("email")}
          />
          <p className="mt-1 text-xs text-muted">
            Shown on invoice and quote PDFs.
          </p>
          <FieldError id="email-error">{fieldErrors.email}</FieldError>
        </div>
        <div>
          <Label htmlFor="financialYearStartMonth" required>
            Financial year starts
          </Label>
          <Select
            id="financialYearStartMonth"
            name="financialYearStartMonth"
            defaultValue={String(
              financialYearStartMonth(settings.financialYearEndMonth),
            )}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.financialYearStartMonth)}
            onChange={() => clearField("financialYearStartMonth")}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted">
            Year runs{" "}
            {
              MONTHS[
                financialYearStartMonth(settings.financialYearEndMonth) - 1
              ]
            }
            –{MONTHS[settings.financialYearEndMonth - 1]}.
          </p>
          <FieldError id="financialYearStartMonth-error">
            {fieldErrors.financialYearStartMonth}
          </FieldError>
        </div>
        <h2 id="year-end" className="scroll-mt-8 pt-4 font-display text-lg font-semibold">
          Year end
        </h2>
        {settings.entityType === "sole_trader" ? (
          <>
            <div>
              <Label htmlFor="yearEnd">Accounting year</Label>
              <Select
                id="yearEnd"
                name="yearEnd"
                defaultValue={settings.yearEndOnFifthApril ? "tax_year" : "month_end"}
                disabled={pending}
              >
                <option value="tax_year">The tax year, 6 April to 5 April</option>
                <option value="month_end">
                  A year ending on the last day of {MONTHS[settings.financialYearEndMonth - 1]}
                </option>
              </Select>
              <p className="mt-1 text-xs text-muted">
                Most sole traders use the tax year. To use another year end, choose the second
                option and set &quot;Financial year starts&quot; above.
              </p>
            </div>
            <div>
              <Label htmlFor="accountingBasis">Accounting basis</Label>
              <Select
                id="accountingBasis"
                name="accountingBasis"
                defaultValue={settings.accountingBasis ?? ""}
                disabled={pending}
              >
                <option value="">Not chosen yet</option>
                <option value="cash">Cash basis</option>
                <option value="accruals">Traditional accruals</option>
              </Select>
              <p className="mt-1 text-xs text-muted">
                Cash basis counts income when it is received and expenses when they are paid.
                Traditional accruals counts them when they are invoiced or incurred. Needed before
                the year-end pack can be downloaded.
              </p>
            </div>
            <div>
              <Label htmlFor="tradingStartedOn">Date trading started (optional)</Label>
              <Input
                id="tradingStartedOn"
                name="tradingStartedOn"
                type="date"
                defaultValue={settings.tradingStartedOn ?? ""}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.tradingStartedOn)}
                onChange={() => clearField("tradingStartedOn")}
              />
              <FieldError id="tradingStartedOn-error">{fieldErrors.tradingStartedOn}</FieldError>
            </div>
            {members.length > 1 ? (
              <div>
                <Label htmlFor="ownerUserId">Owner</Label>
                <Select
                  id="ownerUserId"
                  name="ownerUserId"
                  defaultValue={settings.ownerUserId ?? ""}
                  disabled={pending}
                  aria-invalid={Boolean(fieldErrors.ownerUserId)}
                  onChange={() => clearField("ownerUserId")}
                >
                  <option value="">The first admin</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-muted">
                  Business costs the owner pays personally count as money they put in, not as
                  money owed to them.
                </p>
                <FieldError id="ownerUserId-error">{fieldErrors.ownerUserId}</FieldError>
              </div>
            ) : (
              <input type="hidden" name="ownerUserId" value={settings.ownerUserId ?? ""} />
            )}
          </>
        ) : null}
        <div>
          <Label htmlFor="fixedAssetThresholdGbp">Possible fixed assets: equipment over (£)</Label>
          <Input
            id="fixedAssetThresholdGbp"
            name="fixedAssetThresholdGbp"
            inputMode="decimal"
            defaultValue={(settings.fixedAssetThresholdPence / 100).toFixed(2)}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.fixedAssetThresholdGbp)}
            onChange={() => clearField("fixedAssetThresholdGbp")}
          />
          <p className="mt-1 text-xs text-muted">
            Equipment expenses above this amount are listed in the year-end pack for your
            accountant to decide how to treat.
          </p>
          <FieldError id="fixedAssetThresholdGbp-error">
            {fieldErrors.fixedAssetThresholdGbp}
          </FieldError>
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
          <Input
            id="logo"
            name="logo"
            type="file"
            accept={LOGO_ACCEPT}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.logo)}
            aria-describedby={fieldErrors.logo ? "logo-error" : undefined}
            onChange={() => clearField("logo")}
          />
          <p className="text-xs text-muted">
            Shown in the navigation and on invoices. PNG, JPEG, WebP or GIF, under 2 MB.
            Leave empty to keep the current logo.
          </p>
          <FieldError id="logo-error">{fieldErrors.logo}</FieldError>
        </div>

        <h2 id="vat" className="scroll-mt-8 pt-4 font-display text-lg font-semibold">VAT</h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="vatRegistered"
            value="on"
            checked={vatRegistered}
            onChange={(e) => {
              setVatRegistered(e.target.checked);
              clearField("vatNumber");
              clearField("defaultVatRate");
            }}
            disabled={pending}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-foreground">VAT registered</span>
            <span className="mt-0.5 block text-xs text-muted">
              Enables VAT rates on quotes, invoices, orders, and expenses.
              Export only — this app does not submit to HMRC.
            </span>
          </span>
        </label>
        {vatRegistered ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="vatNumber" required>
                VAT number
              </Label>
              <Input
                id="vatNumber"
                name="vatNumber"
                required
                defaultValue={settings.vatNumber ?? ""}
                disabled={pending}
                placeholder="GB434031494"
                aria-invalid={Boolean(fieldErrors.vatNumber)}
                aria-describedby={
                  fieldErrors.vatNumber
                    ? "vatNumber-error vatNumber-hint"
                    : "vatNumber-hint"
                }
                onChange={() => clearField("vatNumber")}
              />
              <p id="vatNumber-hint" className="mt-1 text-xs text-muted">
                UK format, e.g. GB434031494 (spaces allowed).
              </p>
              <FieldError id="vatNumber-error">
                {fieldErrors.vatNumber}
              </FieldError>
            </div>
            <div>
              <Label htmlFor="defaultVatRateChoice" required>
                Default VAT rate
              </Label>
              <Select
                id="defaultVatRateChoice"
                value={rateChoice}
                onChange={(e) => {
                  setRateChoice(e.target.value as "0" | "20" | "custom");
                  clearField("defaultVatRate");
                }}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.defaultVatRate)}
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
                  onChange={(e) => {
                    setCustomRate(e.target.value);
                    clearField("defaultVatRate");
                  }}
                  disabled={pending}
                  placeholder="e.g. 5"
                  aria-label="Custom VAT rate percent"
                  aria-invalid={Boolean(fieldErrors.defaultVatRate)}
                  aria-describedby={
                    fieldErrors.defaultVatRate
                      ? "defaultVatRate-error"
                      : undefined
                  }
                />
              ) : null}
              <input
                type="hidden"
                name="defaultVatRate"
                value={String(resolvedDefaultRate)}
              />
              <p className="mt-1 text-xs text-muted">
                Applied to new document lines. You can override per line.
              </p>
              <FieldError id="defaultVatRate-error">
                {fieldErrors.defaultVatRate}
              </FieldError>
            </div>
          </div>
        ) : (
          <>
            <input type="hidden" name="vatNumber" value="" />
            <input type="hidden" name="defaultVatRate" value="20" />
          </>
        )}

        <h2 id="bank" className="scroll-mt-8 pt-4 font-display text-lg font-semibold">Bank details</h2>
        <BankFields
          bankProvider={settings.bankProvider}
          bankName={settings.bankName}
          bankAccountName={settings.bankAccountName}
          sortCode={settings.sortCode}
          accountNumber={settings.accountNumber}
          disabled={pending}
          required
          errors={fieldErrors}
          onClearError={clearField}
        />

        <h2 id="invoicing" className="scroll-mt-8 pt-4 font-display text-lg font-semibold">Invoicing</h2>
        <div>
          <Label htmlFor="invoiceNumberPrefix" required>
            Invoice number prefix
          </Label>
          <Input
            id="invoiceNumberPrefix"
            name="invoiceNumberPrefix"
            required
            defaultValue={settings.invoiceNumberPrefix}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.invoiceNumberPrefix)}
            aria-describedby={
              fieldErrors.invoiceNumberPrefix
                ? "invoiceNumberPrefix-error"
                : undefined
            }
            onChange={() => clearField("invoiceNumberPrefix")}
          />
          <p className="mt-1 text-xs text-muted">e.g. DD → DD-2026-0001</p>
          <FieldError id="invoiceNumberPrefix-error">
            {fieldErrors.invoiceNumberPrefix}
          </FieldError>
        </div>
        <div>
          <Label htmlFor="quoteNumberPrefix" required>
            Quote number prefix
          </Label>
          <Input
            id="quoteNumberPrefix"
            name="quoteNumberPrefix"
            required
            defaultValue={settings.quoteNumberPrefix}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.quoteNumberPrefix)}
            aria-describedby={
              fieldErrors.quoteNumberPrefix
                ? "quoteNumberPrefix-error"
                : undefined
            }
            onChange={() => clearField("quoteNumberPrefix")}
          />
          <p className="mt-1 text-xs text-muted">e.g. Q → Q-2026-0001</p>
          <FieldError id="quoteNumberPrefix-error">
            {fieldErrors.quoteNumberPrefix}
          </FieldError>
        </div>
        <div>
          <Label htmlFor="orderNumberPrefix" required>
            Order number prefix
          </Label>
          <Input
            id="orderNumberPrefix"
            name="orderNumberPrefix"
            required
            defaultValue={settings.orderNumberPrefix}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.orderNumberPrefix)}
            aria-describedby={
              fieldErrors.orderNumberPrefix
                ? "orderNumberPrefix-error"
                : undefined
            }
            onChange={() => clearField("orderNumberPrefix")}
          />
          <p className="mt-1 text-xs text-muted">e.g. O → O-2026-0001</p>
          <FieldError id="orderNumberPrefix-error">
            {fieldErrors.orderNumberPrefix}
          </FieldError>
        </div>
        <div>
          <Label htmlFor="creditNoteNumberPrefix" required>
            Credit note number prefix
          </Label>
          <Input
            id="creditNoteNumberPrefix"
            name="creditNoteNumberPrefix"
            required
            defaultValue={settings.creditNoteNumberPrefix}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.creditNoteNumberPrefix)}
            aria-describedby={
              fieldErrors.creditNoteNumberPrefix
                ? "creditNoteNumberPrefix-error"
                : undefined
            }
            onChange={() => clearField("creditNoteNumberPrefix")}
          />
          <p className="mt-1 text-xs text-muted">e.g. CN → CN-2026-0001</p>
          <FieldError id="creditNoteNumberPrefix-error">
            {fieldErrors.creditNoteNumberPrefix}
          </FieldError>
        </div>
        <div>
          <Label htmlFor="invoicePaymentTermsDays" required>
            Invoice payment terms (days)
          </Label>
          <Input
            id="invoicePaymentTermsDays"
            name="invoicePaymentTermsDays"
            type="number"
            min={1}
            max={365}
            required
            defaultValue={String(settings.invoicePaymentTermsDays)}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.invoicePaymentTermsDays)}
            aria-describedby={
              fieldErrors.invoicePaymentTermsDays
                ? "invoicePaymentTermsDays-error"
                : undefined
            }
            onChange={() => clearField("invoicePaymentTermsDays")}
          />
          <p className="mt-1 text-xs text-muted">
            Due date defaults to issue date plus this many days for full and
            partial invoices.
          </p>
          <FieldError id="invoicePaymentTermsDays-error">
            {fieldErrors.invoicePaymentTermsDays}
          </FieldError>
        </div>

        <h2 id="cutover" className="scroll-mt-8 pt-4 font-display text-lg font-semibold">
          Spreadsheet cutover
        </h2>
        <p className="text-sm text-muted">
          Optional cash at bank on the day you start using Alfa. Shown on
          Transactions for context — not included in profit and loss. Clear both
          fields to remove.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="openingCashGbp">Opening cash (GBP)</Label>
            <Input
              id="openingCashGbp"
              name="openingCashGbp"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={
                settings.openingCashPence != null
                  ? (settings.openingCashPence / 100).toFixed(2)
                  : ""
              }
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.openingCashGbp)}
              onChange={() => clearField("openingCashGbp")}
            />
            <FieldError id="openingCashGbp-error">
              {fieldErrors.openingCashGbp}
            </FieldError>
          </div>
          <div>
            <Label htmlFor="openingCashAsAt">As at</Label>
            <Input
              id="openingCashAsAt"
              name="openingCashAsAt"
              type="date"
              defaultValue={settings.openingCashAsAt ?? ""}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.openingCashAsAt)}
              onChange={() => clearField("openingCashAsAt")}
            />
            <FieldError id="openingCashAsAt-error">
              {fieldErrors.openingCashAsAt}
            </FieldError>
          </div>
        </div>

        <h2 id="expenses" className="scroll-mt-8 pt-4 font-display text-lg font-semibold">Expenses</h2>
        <div>
          <Label htmlFor="defaultMileageRatePence" required>
            Default mileage rate (pence per mile)
          </Label>
          <Input
            id="defaultMileageRatePence"
            name="defaultMileageRatePence"
            type="number"
            min={1}
            max={1000}
            required
            defaultValue={String(settings.defaultMileageRatePence)}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.defaultMileageRatePence)}
            aria-describedby={
              fieldErrors.defaultMileageRatePence
                ? "defaultMileageRatePence-error"
                : undefined
            }
            onChange={() => clearField("defaultMileageRatePence")}
          />
          <p className="mt-1 text-xs text-muted">
            HMRC-style allowance for Travel expenses, e.g. 45 = 45p per mile.
          </p>
          <FieldError id="defaultMileageRatePence-error">
            {fieldErrors.defaultMileageRatePence}
          </FieldError>
        </div>

        <FormStickyActions error={error}>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </FormStickyActions>
      </form>
    </div>
  );
}
