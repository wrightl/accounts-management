import { SignIn } from "@clerk/nextjs";
import { isAuthConfigured } from "@/env";
import { AuthNotConfigured } from "@/components/auth-notice";
import { AuthFrame } from "@/components/brand/auth-frame";

export default function SignInPage() {
  if (!isAuthConfigured()) return <AuthNotConfigured />;
  return (
    <AuthFrame>
      <SignIn />
    </AuthFrame>
  );
}
