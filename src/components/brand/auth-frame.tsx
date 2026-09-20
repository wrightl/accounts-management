import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/** Shared chrome for sign-in, sign-up and auth notices. */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-navy">
      <header className="bg-accent px-6 py-4 text-white">
        <Link href="/" className="inline-flex">
          <Logo size={40} priority />
        </Link>
      </header>
      <div className="hero-dots flex flex-1 items-center justify-center px-6 py-12">
        {children}
      </div>
    </div>
  );
}
