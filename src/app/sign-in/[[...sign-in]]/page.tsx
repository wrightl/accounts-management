import { SignIn } from "@clerk/nextjs";
import { isAuthConfigured } from "@/env";
import { AuthNotConfigured } from "@/components/auth-notice";

export default function SignInPage() {
  if (!isAuthConfigured()) return <AuthNotConfigured />;
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-6 py-12">
      <SignIn />
    </div>
  );
}
