import Link from "next/link";
import { Building2, User } from "lucide-react";
import { GuideCard } from "@/components/guides/guide-card";
import { buttonClasses } from "@/components/ui/button";

export function GuidesTeaser() {
  return (
    <section
      id="guides"
      className="scroll-mt-20 border-t border-border bg-wash px-6 py-16 md:py-20"
    >
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="font-display text-3xl font-normal tracking-tight md:text-4xl">
            UK Financial Guides
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            Clear guidance on record keeping, filing deadlines, and tax
            requirements for limited companies and sole traders — educational,
            not tax advice.
          </p>
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <GuideCard
            href="/guides/limited-companies"
            title="Limited Companies"
            description="Companies House filings, Corporation Tax obligations, and statutory accounts."
            icon={<Building2 className="h-8 w-8" />}
          />
          <GuideCard
            href="/guides/sole-traders"
            title="Sole Traders"
            description="Self Assessment, record keeping, Income Tax, and National Insurance."
            icon={<User className="h-8 w-8" />}
          />
        </div>
        <div className="mt-10 text-center">
          <Link
            href="/guides"
            className={buttonClasses("secondary", "px-6 py-2.5")}
          >
            View all UK Financial Guides
          </Link>
        </div>
      </div>
    </section>
  );
}
