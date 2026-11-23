import { guardTenantPage } from "@/lib/auth";
import { getBillingPageData } from "@/lib/billing/queries";
import { BillingSettingsPanel } from "@/components/settings/billing-settings";
import { SettingsPageHeader, SETTINGS_FORM_WIDTH } from "@/components/settings/settings-page-header";
import { Callout } from "@/components/ui/callout";

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
      />
      {sp.checkout === "success" ? (
        <Callout tone="success" className="mb-6">
          Checkout complete. Your plan will update in a moment.
        </Callout>
      ) : null}
      {sp.checkout === "cancel" ? (
        <Callout className="mb-6">
          Checkout cancelled. No changes were made.
        </Callout>
      ) : null}
      <div className={SETTINGS_FORM_WIDTH}>
        <BillingSettingsPanel data={data} />
      </div>
    </div>
  );
}
