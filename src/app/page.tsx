import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";

export default function Home() {
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

      <footer className="px-6 py-8 text-center text-sm text-white/50">
        © {new Date().getFullYear()} Dot and Dash Consulting Ltd
      </footer>
    </main>
  );
}
