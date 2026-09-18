import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export function PricingHero() {
  return (
    <section className="hero-dots relative overflow-hidden px-6 pb-16 pt-16 text-white md:pb-24 md:pt-20">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm tracking-widest text-brand uppercase">Pricing</p>
        <h1 className="mt-4 font-display text-4xl font-normal leading-tight tracking-tight sm:text-5xl md:text-6xl">
          Books for the week. Clear, honest pricing.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-white/75">
          Per organisation, not per seat. Start with a 30-day trial — then from
          £19 / month ex VAT. Replace the spreadsheets; keep your accountant.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/sign-up" className={buttonClasses("primary", "px-6 py-2.5")}>
            Start free trial
          </Link>
          <Link
            href="/sign-in"
            className={buttonClasses(
              "ghost",
              "border border-white/30 text-white hover:bg-white/10",
            )}
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
