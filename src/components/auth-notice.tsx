import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";

/** Shown on auth screens before Clerk credentials are configured. */
export function AuthNotConfigured() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo className="text-2xl" />
      <h1 className="mt-6 text-2xl font-semibold">Authentication not configured</h1>
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
  );
}
