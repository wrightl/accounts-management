import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, hasDatabaseClient } from "@/db";
import { companyBilling } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform";
import { ensureLocalUser, findLocalUser } from "@/lib/users";
import { Logo } from "@/components/brand/logo";
import { SubscribeGateActions } from "@/components/signup/subscribe-gate-actions";
import { signupPlanLabel } from "@/lib/signup-plan";

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
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

  const db = getDb();
  const [billing] = await db
    .select()
    .from(companyBilling)
    .where(eq(companyBilling.companyId, user.companyId))
    .limit(1);

  if (
    !billing ||
    billing.status !== "unpaid" ||
    billing.stripeSubscriptionId
  ) {
    redirect("/dashboard");
  }

  if (billing.plan !== "essentials" && billing.plan !== "premium") {
    redirect("/dashboard");
  }

  const planLabel = signupPlanLabel({
    plan: billing.plan,
    interval: billing.billingInterval === "year" ? "year" : "month",
  });

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center border-b border-border bg-surface px-6 py-4">
        <Logo size={36} />
      </header>
      <div className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
        <h1 className="font-display text-2xl font-semibold">
          Complete your subscription
        </h1>
        <div className="mt-6">
          <SubscribeGateActions
            planLabel={planLabel}
            canceled={params.checkout === "cancel"}
          />
        </div>
      </div>
    </main>
  );
}
