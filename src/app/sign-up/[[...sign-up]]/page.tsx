import { SignUp } from "@clerk/nextjs";
import { isAuthConfigured } from "@/env";
import { AuthNotConfigured } from "@/components/auth-notice";

// Access is invite-only; Clerk hosts the sign-up flow for invited users
// (e.g. the external accountant) at this route.
export default function SignUpPage() {
  if (!isAuthConfigured()) return <AuthNotConfigured />;
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-6 py-12">
      <SignUp />
    </div>
  );
}
