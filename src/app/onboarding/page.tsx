import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/env";
import { requireUser } from "@/lib/auth";
import { ensureLocalUser } from "@/lib/users";
import { hasDatabaseClient } from "@/db";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { AuthNotConfigured } from "@/components/auth-notice";
import { Logo } from "@/components/brand/logo";

export default async function OnboardingPage() {
  if (!isAuthConfigured()) return <AuthNotConfigured />;

  const user = await requireUser();
  if (hasDatabaseClient()) {
    await ensureLocalUser(user);
  }
  if (user.companyId) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center border-b border-border bg-surface px-6 py-4">
        <Logo size={36} />
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <OnboardingForm defaultEmail={user.email} defaultName={user.name} />
      </div>
    </main>
  );
}
