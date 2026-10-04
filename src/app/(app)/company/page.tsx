import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { monthName } from "@/lib/dates";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const display = value?.trim() ? value : "—";
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-foreground">{display}</dd>
    </div>
  );
}

export default async function CompanyPage() {
  const { companyId } = await guardTenantPage("accounts:read");
  const canManageSettings = await hasPermission("settings:manage");
  const settings = await getOrCreateCompanySettings(companyId);

  const entityLabel =
    settings.entityType === "sole_trader" ? "Sole trader" : "Limited company";
  const yearEnd = monthName(settings.financialYearEndMonth);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Company</h1>
          <p className="mt-1 text-muted">
            Read-only company profile for year-end and the accountant pack.
          </p>
        </div>
        {canManageSettings ? (
          <Link href="/settings" className={buttonClasses("secondary")}>
            Edit in Settings
          </Link>
        ) : null}
      </div>

      <Card className="mt-8 p-6">
        <h2 className="font-display text-lg font-semibold">Identity</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Entity type" value={entityLabel} />
          <Field label="Trading name" value={settings.name} />
          <Field label="Legal name" value={settings.legalName} />
          {settings.entityType === "limited_company" ? (
            <Field label="Company number" value={settings.companyNumber} />
          ) : (
            <Field label="UTR" value={settings.utr} />
          )}
          <Field
            label="VAT registered"
            value={settings.vatRegistered ? "Yes" : "No"}
          />
          <Field label="VAT number" value={settings.vatNumber} />
          <Field label="Email" value={settings.email} />
          <Field label="Financial year end" value={yearEnd} />
          <div className="sm:col-span-2">
            <Field label="Address" value={settings.addressLines} />
          </div>
        </dl>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold">
          Invoice bank details
        </h2>
        <p className="mt-1 text-sm text-muted">
          Shown on invoice PDFs. Separate from imported bank statement accounts.
        </p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Bank" value={settings.bankName} />
          <Field label="Account name" value={settings.bankAccountName} />
          <Field label="Sort code" value={settings.sortCode} />
          <Field label="Account number" value={settings.accountNumber} />
        </dl>
      </Card>
    </div>
  );
}
