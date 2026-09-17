import type { Metadata } from "next";
import Link from "next/link";
import { Building2, User } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { GuideCard } from "@/components/guides/guide-card";
import { ComparisonTable } from "@/components/guides/comparison-table";

export const metadata: Metadata = {
  title: "UK Financial Requirements Guides",
  description:
    "Comprehensive guides to UK financial requirements, record keeping, and tax obligations for limited companies and sole traders.",
  openGraph: {
    title: "UK Financial Requirements Guides",
    description:
      "Comprehensive guides to UK financial requirements, record keeping, and tax obligations for limited companies and sole traders.",
  },
};

export default function GuidesPage() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <header className="border-b border-border bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/">
            <Logo showConsulting size={44} />
          </Link>
          <Link
            href="/sign-in"
            className={buttonClasses("secondary", "text-sm")}
          >
            Sign in
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-6 py-16">
        <div className="text-center">
          <h1 className="font-display text-5xl font-semibold tracking-tight text-foreground md:text-6xl">
            UK Financial Requirements
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            Understanding your financial obligations is essential for running a
            compliant business in the UK. These guides provide comprehensive
            information about record keeping, filing deadlines, and tax
            requirements.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2">
          <GuideCard
            href="/guides/limited-companies"
            title="Limited Companies"
            description="Complete guide to financial requirements for UK limited companies, including Companies House filings, Corporation Tax obligations, and statutory accounts."
            icon={<Building2 className="h-8 w-8" />}
          />
          <GuideCard
            href="/guides/sole-traders"
            title="Sole Traders"
            description="Everything you need to know about Self Assessment, record keeping requirements, Income Tax, and National Insurance for sole traders."
            icon={<User className="h-8 w-8" />}
          />
        </div>

        <section className="mt-20">
          <h2 className="font-display text-3xl font-semibold text-foreground">
            Key Differences
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
            Limited companies and sole traders have different legal structures
            and financial obligations. This quick comparison highlights the main
            differences to help you understand which requirements apply to your
            business.
          </p>
          <div className="mt-8">
            <ComparisonTable />
          </div>
        </section>

        <section className="mt-20 rounded-2xl border border-yellow-600/20 bg-yellow-50 p-8">
          <h2 className="font-display text-2xl font-semibold text-yellow-900">
            Important Disclaimer
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-yellow-900">
            <p>
              These guides are provided for informational purposes only and
              should not be considered professional tax or legal advice. UK tax
              laws and regulations change regularly, and your specific
              circumstances may require different treatment.
            </p>
            <p>
              Always consult with a qualified accountant or tax advisor for
              advice tailored to your business. HMRC provides official guidance
              at{" "}
              <a
                href="https://www.gov.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline"
              >
                gov.uk
              </a>
              .
            </p>
            <p className="text-xs text-yellow-800">
              Last updated: September 2026
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
