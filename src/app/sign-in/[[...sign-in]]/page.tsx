import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { AuthFrame } from "@/components/brand/auth-frame";

export default function SignInPage() {
  return (
    <AuthFrame>
      <div className="flex flex-col items-center gap-4">
        <SignIn />
        <Link
          href="/forgot-password"
          className="text-sm text-white underline underline-offset-4 hover:text-white/80"
        >
          Forgot your password?
        </Link>
      </div>
    </AuthFrame>
  );
}
