import { AuthFrame } from "@/components/brand/auth-frame";
import { SignUpWithPlan } from "@/components/signup/sign-up-with-plan";
import { getStripeCatalog } from "@/lib/billing/catalog";
import { parseSignupPlanQuery } from "@/lib/signup-plan";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const params = await searchParams;
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
