import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { refreshConnectAccount } from "@/lib/payments/online";
import { onlinePaymentsStatus } from "@/lib/payments/online-status";
import { OnlinePaymentsPanel } from "@/components/settings/online-payments-panel";

export default async function OnlinePaymentsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>;
}) {
  const { companyId } = await guardTenantPage("settings:manage");
  const sp = await searchParams;
  let company = await getOrCreateCompanySettings(companyId);

  // Coming back from Stripe onboarding: pick up the latest status straight
  // away rather than waiting for the account.updated webhook.
  if (company.stripeConnectAccountId && !company.stripeConnectChargesEnabled) {
    try {
      await refreshConnectAccount(company.stripeConnectAccountId);
      company = await getOrCreateCompanySettings(companyId);
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "connect_account_refresh_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
  const status = onlinePaymentsStatus(company);

  return (
    <div>
      <p className="text-sm text-muted">
        <Link href="/settings" className="hover:underline">
          ← Settings
        </Link>
      </p>
      <h1 className="mt-2 mb-2 font-display text-2xl font-semibold">Online payments</h1>
      <p className="mb-8 text-muted">Let clients pay invoices by card from the invoice link.</p>
      {sp.connect === "return" && status === "enabled" ? (
        <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900">
          Stripe is connected. Clients can now pay invoices online.
        </p>
      ) : null}
      <OnlinePaymentsPanel
        status={status}
        accountId={company.stripeConnectAccountId}
        configured={Boolean(process.env.STRIPE_SECRET_KEY)}
      />
    </div>
  );
}
