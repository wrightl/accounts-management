import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { AuthFrame } from "@/components/brand/auth-frame";
import { buttonClasses } from "@/components/ui/button";

/** Shown on auth screens before Clerk credentials are configured. */
export function AuthNotConfigured() {
  return (
    <AuthFrame>
      <div className="w-full max-w-md rounded-2xl bg-surface px-8 py-10 text-center text-foreground">
        <Logo className="justify-center" size={56} />
        <h1 className="mt-6 font-display text-2xl font-normal">
          Authentication not configured
        </h1>
        <p className="mt-3 text-muted">
          Sign-in becomes available once the Clerk credentials
          (<code className="text-foreground">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
          <code className="text-foreground">CLERK_SECRET_KEY</code>) are added to the
          environment.
        </p>
        <Link href="/" className={buttonClasses("secondary", "mt-6")}>
          Back home
        </Link>
      </div>
    </AuthFrame>
  );
}
