import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { PricingAwareSignUpLink } from "@/components/marketing/pricing-aware-sign-up-link";

export function PublicFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-white/10 bg-navy px-6 py-12 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div>
          <Logo size={36} />
          <p className="mt-3 max-w-xs text-sm text-white/60">
            Books for UK consultancies, studios, and small agencies — quotes,
            invoices, expenses, and an accountant pack in one place.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
          <div>
            <p className="font-medium text-white">Product</p>
            <ul className="mt-3 space-y-2 text-white/60">
              <li>
                <Link href="/#product" className="hover:text-white">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/#how" className="hover:text-white">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-white">
                  Pricing
                </Link>
              </li>
              <li>
                <PricingAwareSignUpLink location="footer" className="hover:text-white">
                  Sign up
                </PricingAwareSignUpLink>
              </li>
              <li>
                <Link href="/sign-in" className="hover:text-white">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-white">UK Financial Guides</p>
            <ul className="mt-3 space-y-2 text-white/60">
              <li>
                <Link href="/guides" className="hover:text-white">
                  All guides
                </Link>
              </li>
              <li>
                <Link href="/guides/limited-companies" className="hover:text-white">
                  Limited companies
                </Link>
              </li>
              <li>
                <Link href="/guides/sole-traders" className="hover:text-white">
                  Sole traders
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-white">Company</p>
            <ul className="mt-3 space-y-2 text-white/60">
              <li>
                <a
                  href="https://www.dotanddashconsulting.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white"
                >
                  Dot + Dash Consulting
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-6xl border-t border-white/10 pt-6 text-center text-xs text-white/40">
        © {year} Dot and Dash Consulting Ltd
      </div>
    </footer>
  );
}
