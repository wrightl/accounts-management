import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
        <Link href="/sign-in" className={buttonClasses("ghost")}>
          Sign in
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-20">
        <p className="text-sm font-medium uppercase tracking-widest text-brand">
          Accounts
        </p>
        <h1 className="mt-3 max-w-2xl text-5xl font-semibold leading-tight tracking-tight">
          Your books, in one place.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted">
          Invoicing, expenses, reimbursements and reporting for Dot + Dash
          Consulting — no more spreadsheets and shared folders.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Link href="/dashboard" className={buttonClasses("primary")}>
            Go to dashboard
          </Link>
          <Link href="/sign-in" className={buttonClasses("secondary")}>
            Sign in
          </Link>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-5xl px-6 py-8 text-sm text-muted">
        © {new Date().getFullYear()} Dot and Dash Consulting Ltd
      </footer>
    </main>
  );
}
