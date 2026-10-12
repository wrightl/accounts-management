import { guardTenantPage } from "@/lib/auth";
import { getBillingPageData } from "@/lib/billing/queries";
import { BillingSettingsPanel } from "@/components/settings/billing-settings";
import { SettingsPageHeader, SETTINGS_FORM_WIDTH } from "@/components/settings/settings-page-header";

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { companyId } = await guardTenantPage("settings:manage");
  const data = await getBillingPageData(companyId);
  const sp = await searchParams;

  return (
    <div>
      <SettingsPageHeader
        title="Billing"
        description="Manage your organisation plan, trial, and payment method."
      />
      {sp.checkout === "success" ? (
        <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900">
          Checkout complete. Your plan will update in a moment.
        </p>
      ) : null}
      {sp.checkout === "cancel" ? (
        <p className="mb-6 rounded-xl bg-wash px-4 py-3 text-sm text-muted">
          Checkout cancelled. No changes were made.
        </p>
      ) : null}
      <div className={SETTINGS_FORM_WIDTH}>
        <BillingSettingsPanel data={data} />
      </div>
    </div>
  );
}
