import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

type FinalCtaProps = {
  heading?: string;
  body?: string;
  primaryLabel?: string;
  primaryHref?: string;
};

export function FinalCta({
  heading = "Your books, in one place.",
  body = "Sign up and set up your company in minutes. Bring your accountant when you are ready.",
  primaryLabel = "Sign up",
  primaryHref = "/sign-up",
}: FinalCtaProps = {}) {
  return (
    <section className="hero-dots px-6 py-20 text-center text-white md:py-24">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-display text-3xl font-normal tracking-tight md:text-5xl">
          {heading}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-white/75">{body}</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href={primaryHref} className={buttonClasses("primary", "px-6 py-2.5")}>
            {primaryLabel}
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
