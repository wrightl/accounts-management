import Link from "next/link";
import { BackLink } from "@/components/ui/back-link";
import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import { listSubscriptionTiers } from "@/lib/platform/billing-queries";
import { SubscriptionTiersForm } from "@/components/platform/subscription-tiers-form";

export default async function PlatformBillingTiersPage() {
  await requirePlatformAdmin();

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Subscription tiers</h1>
        <p className="mt-2 text-muted">Connect a database to edit tiers.</p>
      </div>
    );
  }

  const tiers = await listSubscriptionTiers();

  return (
    <div>
      <BackLink href="/platform/billing">Billing</BackLink>
      <h1 className="mt-4 font-display text-2xl font-semibold">
        Subscription tiers
      </h1>
      <p className="mt-1 max-w-2xl text-muted">
        Limits apply immediately to all companies on that tier. Existing members
        above a lowered user cap are grandfathered — new invites are blocked.
        Stripe price IDs are managed in{" "}
        <Link href="/platform/settings" className="underline">
          Platform → Settings
        </Link>
        .
      </p>
      <div className="mt-8 max-w-2xl">
        <SubscriptionTiersForm tiers={tiers} />
      </div>
    </div>
  );
}
