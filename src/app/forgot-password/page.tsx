import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/brand/auth-frame";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getCurrentUser } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false },
};

export default async function ForgotPasswordPage() {
  // Signed-in users change their password from their profile instead.
  const user = await getCurrentUser();
  if (user) {
    redirect(
      isPlatformAdmin(user) ? "/platform/profile#password" : "/profile#password",
    );
  }

  return (
    <AuthFrame>
      <ForgotPasswordForm />
    </AuthFrame>
  );
}
