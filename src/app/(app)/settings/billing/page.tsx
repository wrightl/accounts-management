import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { getBillingPageData } from "@/lib/billing/queries";
import { BillingSettingsPanel } from "@/components/settings/billing-settings";

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
      <p className="text-sm text-muted">
        <Link href="/settings" className="hover:underline">
          ← Settings
        </Link>
      </p>
      <h1 className="mt-2 mb-2 font-display text-2xl font-semibold">Billing</h1>
      <p className="mb-8 text-muted">
        Manage your organisation plan, trial, and payment method.
      </p>
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
      <BillingSettingsPanel data={data} />
    </div>
  );
}
