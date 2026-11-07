import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { companiesHouseConfigured } from "@/lib/companies-house/client";
import { listIncomeCategoriesWithUsage } from "@/lib/bank/income-category-catalog";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { SettingsForm } from "@/components/settings/settings-form";
import { CompaniesHouseForm } from "@/components/company/companies-house-form";
import { Card } from "@/components/ui/card";
import { IncomeCategoriesPanel } from "@/components/settings/income-categories-panel";
import { DeleteCompanyDangerZone } from "@/components/settings/delete-company-danger-zone";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { SettingsWithRail, type SettingsSection } from "@/components/settings/settings-section-nav";
import { DisplayDate } from "@/components/date-format-provider";

export default async function BusinessSettingsPage() {
  const { companyId } = await guardTenantPage("settings:manage");

  const [settings, incomeCategories] = await Promise.all([
    getOrCreateCompanySettings(companyId),
    listIncomeCategoriesWithUsage(companyId),
  ]);

  const limited = settings.entityType === "limited_company";
  const sections: SettingsSection[] = [
    { id: "details", label: limited ? "Company profile" : "Business profile" },
    { id: "vat", label: "VAT" },
    { id: "bank", label: "Bank details" },
    { id: "invoicing", label: "Invoicing" },
    { id: "cutover", label: "Spreadsheet cutover" },
    { id: "expenses", label: "Expenses" },
    ...(limited ? [{ id: "companies-house", label: "Companies House" }] : []),
    { id: "income-categories", label: "Income categories" },
    { id: "danger-zone", label: "Delete company" },
  ];

  return (
    <div>
      <SettingsWithRail
        sections={sections}
        header={
          <SettingsPageHeader
            title="Business settings"
            description="Company details, Companies House, VAT, financial year, bank details, numbering, and income categories."
          />
        }
      >
        <SettingsForm settings={settings} />
        {limited ? (
          <Card id="companies-house" className="mt-10 scroll-mt-8 p-6">
            <h2 className="font-display text-lg font-semibold">Companies House</h2>
            <p className="mt-1 text-sm text-muted">
              Directors appear on board minutes and dividend vouchers. The dates
              drive your{" "}
              <Link href="/deadlines" className="underline">
                filing deadlines
              </Link>
              .
              {settings.companiesHouseSyncedAt
                ? <> Last updated from Companies House on <DisplayDate value={settings.companiesHouseSyncedAt} />.</>
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
        <div id="income-categories" className="scroll-mt-8">
          <IncomeCategoriesPanel categories={incomeCategories} />
        </div>
        <div id="danger-zone" className="scroll-mt-8">
          <DeleteCompanyDangerZone companyName={settings.name} />
        </div>
      </SettingsWithRail>
    </div>
  );
}
