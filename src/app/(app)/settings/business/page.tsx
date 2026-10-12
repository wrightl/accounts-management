import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { formatIsoDateUk } from "@/lib/dates";
import { companiesHouseConfigured } from "@/lib/companies-house/client";
import { listIncomeCategoriesWithUsage } from "@/lib/bank/income-category-catalog";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { SettingsForm } from "@/components/settings/settings-form";
import { CompaniesHouseForm } from "@/components/company/companies-house-form";
import { Card } from "@/components/ui/card";
import { IncomeCategoriesPanel } from "@/components/settings/income-categories-panel";
import { DeleteCompanyDangerZone } from "@/components/settings/delete-company-danger-zone";
import { SettingsPageHeader, SETTINGS_FORM_WIDTH } from "@/components/settings/settings-page-header";

export default async function BusinessSettingsPage() {
  const { companyId } = await guardTenantPage("settings:manage");

  const [settings, incomeCategories] = await Promise.all([
    getOrCreateCompanySettings(companyId),
    listIncomeCategoriesWithUsage(companyId),
  ]);

  return (
    <div>
      <SettingsPageHeader
        title="Business settings"
        description="Company details, Companies House, VAT, financial year, bank details, numbering, and income categories."
      />
      <div className={SETTINGS_FORM_WIDTH}>
        <SettingsForm settings={settings} />
        {settings.entityType === "limited_company" ? (
          <Card id="companies-house" className="mt-10 scroll-mt-6 p-6">
            <h2 className="font-display text-lg font-semibold">Companies House</h2>
            <p className="mt-1 text-sm text-muted">
              Directors appear on board minutes and dividend vouchers. The dates
              drive your{" "}
              <Link href="/deadlines" className="underline">
                filing deadlines
              </Link>
              .
              {settings.companiesHouseSyncedAt
                ? ` Last updated from Companies House on ${formatIsoDateUk(settings.companiesHouseSyncedAt.toISOString().slice(0, 10))}.`
                : null}
            </p>
            <CompaniesHouseForm
              incorporatedOn={settings.incorporatedOn}
              accountsDue={settings.accountsDue}
              confirmationStatementDue={settings.confirmationStatementDue}
              directorNames={settings.directorNames}
              canRefresh={Boolean(settings.companyNumber) && companiesHouseConfigured()}
            />
          </Card>
        ) : null}
        <IncomeCategoriesPanel categories={incomeCategories} />
        <DeleteCompanyDangerZone companyName={settings.name} />
      </div>
    </div>
  );
}
