import Image from "next/image";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { PRODUCT_LOCKUP } from "@/lib/product";

export function MarketingHero() {
  return (
    <section className="hero-dots relative overflow-hidden px-6 pb-16 pt-16 text-white md:pb-24 md:pt-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="text-center lg:text-left">
          <p className="text-sm tracking-widest text-brand uppercase">{PRODUCT_LOCKUP}</p>
          <h1 className="mt-4 font-display text-4xl font-normal leading-tight tracking-tight sm:text-5xl md:text-6xl">
            Your books, in one place.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/75 mx-auto lg:mx-0">
            Quotes, invoices, expenses, reimbursements and reporting for UK
            limited companies and sole traders — no more spreadsheets and shared
            folders. Clear language, quieter screens, and display controls when
            you need them.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Link href="/sign-up" className={buttonClasses("primary", "px-6 py-2.5")}>
              Sign up
            </Link>
            <Link
              href="#product"
              className={buttonClasses(
                "ghost",
                "border border-white/30 text-white hover:bg-white/10",
              )}
            >
              See how it works
            </Link>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
          <div className="overflow-hidden rounded-2xl border border-white/15 bg-navy/40 shadow-2xl shadow-black/40 ring-1 ring-white/10">
            <Image
              src="/marketing/dashboard.png"
              alt="Alfa dashboard showing receivables, overdue invoices, and needs-attention items"
              width={1440}
              height={900}
              className="h-auto w-full"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
