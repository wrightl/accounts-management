import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { isAuthConfigured } from "@/env";

export default async function Home() {
  if (isAuthConfigured()) {
    const { userId } = await auth();
    if (userId) redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col bg-navy text-white">
      <header className="flex items-center justify-between bg-accent px-6 py-4 text-white">
        <Logo showConsulting size={44} priority />
        <Link
          href="/sign-in"
          className={buttonClasses("ghost", "text-white hover:bg-white/15")}
        >
          Sign in
        </Link>
      </header>

      <section className="hero-dots flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <Logo showWordmark={false} size={96} priority className="mb-8" />
        <p className="text-sm tracking-widest text-brand uppercase">Accounts</p>
        <h1 className="mt-4 max-w-3xl font-display text-5xl font-normal leading-tight tracking-tight md:text-6xl">
          Your books, in one place.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/75">
          Invoicing, expenses, reimbursements and reporting for limited companies
          and sole traders — no more spreadsheets and shared folders.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/sign-up" className={buttonClasses("primary", "px-6 py-2.5")}>
            Sign up
          </Link>
          <Link
            href="/sign-in"
            className={buttonClasses("ghost", "border border-white/30 text-white hover:bg-white/10")}
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="border-t border-white/10 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-display text-3xl font-normal tracking-tight">
            Understanding UK Tax Requirements
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/75">
            Get clear guidance on your financial obligations as a limited company
            or sole trader. Our comprehensive guides cover record keeping, filing
            deadlines, and tax requirements.
          </p>
          <Link
            href="/guides"
            className={buttonClasses("ghost", "mt-6 border border-white/30 text-white hover:bg-white/10")}
          >
            View UK Financial Guides
          </Link>
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-sm text-white/50">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <span>© {new Date().getFullYear()} Dot and Dash Consulting Ltd</span>
          <span className="text-white/30">·</span>
          <Link href="/guides" className="hover:text-white/75">
            UK Financial Guides
          </Link>
        </div>
      </footer>
    </main>
  );
}
