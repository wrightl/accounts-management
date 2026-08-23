import { guardPage } from "@/lib/auth";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { SettingsForm } from "@/components/settings/settings-form";
import { isDatabaseConfigured } from "@/env";

export default async function SettingsPage() {
  await guardPage("settings:manage");

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-muted">Connect a database to edit company settings.</p>
      </div>
    );
  }

  const settings = await getOrCreateCompanySettings();

  return (
    <div>
      <h1 className="mb-2 font-display text-2xl font-semibold">Settings</h1>
      <p className="mb-8 text-muted">
        Company profile, financial year, Starling bank details, and invoice/quote numbering.
      </p>
      <SettingsForm settings={settings} />
    </div>
  );
}
