import { SignUp } from "@clerk/nextjs";
import { isAuthConfigured } from "@/env";
import { AuthNotConfigured } from "@/components/auth-notice";
import { AuthFrame } from "@/components/brand/auth-frame";

export default function SignUpPage() {
  if (!isAuthConfigured()) return <AuthNotConfigured />;
  return (
    <AuthFrame>
      <SignUp />
    </AuthFrame>
  );
}
