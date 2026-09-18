import { guardTenantPage } from "@/lib/auth";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  const { companyId } = await guardTenantPage("settings:manage");

  const settings = await getOrCreateCompanySettings(companyId);

  return (
    <div>
      <h1 className="mb-2 font-display text-2xl font-semibold">Settings</h1>
      <p className="mb-8 text-muted">
        Company profile, VAT, financial year, bank details, and invoice/quote numbering.
      </p>
      <SettingsForm settings={settings} />
    </div>
  );
}
