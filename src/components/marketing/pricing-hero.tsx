import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { TrackedSignUpLink } from "@/components/marketing/tracked-sign-up-link";

export function PricingHero({
  essentialsMonthLabel,
}: {
  essentialsMonthLabel: string | null;
}) {
  return (
    <section className="hero-dots relative overflow-hidden px-6 pb-16 pt-16 text-white md:pb-24 md:pt-20">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm tracking-widest text-brand uppercase">Pricing</p>
        <h1 className="mt-4 font-display text-4xl font-normal leading-tight tracking-tight sm:text-5xl md:text-6xl">
          Books for the week. Clear, honest pricing.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-white/75">
          Per organisation, not per seat. Start with a 30-day trial
          {essentialsMonthLabel
            ? ` — then from ${essentialsMonthLabel} / month ex VAT`
            : ""}
          . Replace the spreadsheets; keep your accountant. Display and focus
          controls included on every plan.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <TrackedSignUpLink
            location="hero"
            className={buttonClasses("primary", "px-6 py-2.5")}
          >
            Start free trial
          </TrackedSignUpLink>
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
