import { AuthFrame } from "@/components/brand/auth-frame";
import { ClerkSignUp, SignUpWithPlan } from "@/components/signup/sign-up-with-plan";
import { getStripeCatalog } from "@/lib/billing/catalog";
import { parseSignupPlanQuery } from "@/lib/signup-plan";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; __clerk_ticket?: string }>;
}) {
  const params = await searchParams;
  // Invitees join an existing company, so skip the plan picker.
  if (params.__clerk_ticket) {
    return (
      <AuthFrame>
        <ClerkSignUp />
      </AuthFrame>
    );
  }
  const initialPlan = parseSignupPlanQuery(params.plan);
  let catalog = null;
  try {
    catalog = await getStripeCatalog();
  } catch {
    catalog = null;
  }

  return (
    <AuthFrame>
      <SignUpWithPlan catalog={catalog} initialPlan={initialPlan} />
    </AuthFrame>
  );
}
