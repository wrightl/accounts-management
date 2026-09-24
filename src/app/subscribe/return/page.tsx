import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, hasDatabaseClient } from "@/db";
import { companyBilling } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform";
import { ensureLocalUser, findLocalUser } from "@/lib/users";
import { getStripe } from "@/lib/billing/stripe";
import { applySubscriptionToCompany } from "@/lib/billing/sync";
import { Logo } from "@/components/brand/logo";

/**
 * Stripe Checkout return URL for paid sign-up.
 * Syncs the subscription immediately so the app layout gate does not bounce
 * the user while the webhook is still in flight.
 */
export default async function SubscribeReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
}) {
  const params = await searchParams;
  let user = await requireUser();
  if (hasDatabaseClient()) {
    await ensureLocalUser(user);
    const local = await findLocalUser(user.userId);
    if (local) {
      user = {
        ...user,
        role: local.role,
        companyId: local.companyId,
        localUserId: local.id,
      };
    }
  }

  if (isPlatformAdmin(user)) {
    redirect("/platform");
  }
  if (!user.companyId) {
    redirect("/onboarding");
  }

  if (params.checkout === "cancel") {
    redirect("/subscribe?checkout=cancel");
  }

  if (params.checkout !== "success" || !params.session_id) {
    redirect("/subscribe");
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(params.session_id, {
      expand: ["subscription"],
    });

    const metaCompanyId = session.metadata?.companyId;
    if (metaCompanyId && metaCompanyId !== user.companyId) {
      redirect("/subscribe");
    }

    const sub =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;

    if (sub && typeof sub !== "string") {
      await applySubscriptionToCompany(user.companyId, sub);
      try {
        const { sendBillingEmail } = await import("@/lib/billing/emails");
        await sendBillingEmail(
          user.companyId,
          "subscription_started",
          sub.id,
        );
      } catch {
        /* best-effort */
      }
    }
  } catch {
    // Fall through: webhook may still sync; check billing status below.
  }

  const db = getDb();
  const [billing] = await db
    .select({
      status: companyBilling.status,
      stripeSubscriptionId: companyBilling.stripeSubscriptionId,
    })
    .from(companyBilling)
    .where(eq(companyBilling.companyId, user.companyId))
    .limit(1);

  if (
    billing &&
    billing.status !== "unpaid" &&
    billing.stripeSubscriptionId
  ) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center border-b border-border bg-surface px-6 py-4">
        <Logo size={36} />
      </header>
      <div className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
        <h1 className="font-display text-2xl font-semibold">
          Confirming your payment…
        </h1>
        <p className="mt-4 text-sm text-muted">
          Payment succeeded but your subscription is still syncing.{" "}
          <a href="/subscribe" className="underline underline-offset-2">
            Return to subscription
          </a>{" "}
          or{" "}
          <a href="/dashboard" className="underline underline-offset-2">
            try the dashboard
          </a>
          .
        </p>
      </div>
    </main>
  );
}
