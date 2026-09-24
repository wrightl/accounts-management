import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform";
import { ensureLocalUser, findLocalUser } from "@/lib/users";
import { hasDatabaseClient } from "@/db";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { Logo } from "@/components/brand/logo";
import { getStripeCatalog } from "@/lib/billing/catalog";
import {
  SIGNUP_PLAN_COOKIE,
  parseSignupPlanCookie,
} from "@/lib/signup-plan";

export default async function OnboardingPage() {
  let user = await requireUser();
  if (hasDatabaseClient()) {
    await ensureLocalUser(user);
    const local = await findLocalUser(user.userId);
    if (local) {
      user = {
        ...user,
        role: local.role,
        name: user.name ?? local.name,
        companyId: local.companyId,
        localUserId: local.id,
      };
    }
  }

  if (isPlatformAdmin(user)) {
    redirect("/platform");
  }
  if (user.companyId) {
    redirect("/dashboard");
  }

  const jar = await cookies();
  const initialPlanChoice = parseSignupPlanCookie(
    jar.get(SIGNUP_PLAN_COOKIE)?.value,
  );

  let catalog = null;
  try {
    catalog = await getStripeCatalog();
  } catch {
    catalog = null;
  }

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center border-b border-border bg-surface px-6 py-4">
        <Logo size={36} />
      </header>
      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <OnboardingForm
          defaultEmail={user.email}
          defaultName={user.name}
          catalog={catalog}
          initialPlanChoice={initialPlanChoice}
        />
      </div>
    </main>
  );
}
