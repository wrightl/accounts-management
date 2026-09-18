import type { Metadata } from "next";
import { PublicHeader } from "@/components/marketing/public-header";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PricingHero } from "@/components/marketing/pricing-hero";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { PricingIncluded } from "@/components/marketing/pricing-included";
import { WhoItsFor } from "@/components/marketing/who-its-for";
import { PricingFaq } from "@/components/marketing/pricing-faq";
import { FinalCta } from "@/components/marketing/final-cta";

export const metadata: Metadata = {
  title: "Pricing for UK consultancy invoicing",
  description:
    "Books for UK consultancies, studios, and small agencies. 30-day free trial, then from £19 per organisation per month (ex VAT). Spreadsheet replacement — quotes, invoices, expenses, and an accountant pack.",
  openGraph: {
    title: "Pricing for UK consultancy invoicing",
    description:
      "Books for UK consultancies, studios, and small agencies. 30-day free trial, then from £19 per organisation per month (ex VAT).",
  },
};

export default function PricingPage() {
  return (
    <main className="flex flex-1 flex-col bg-navy text-foreground">
      <PublicHeader />
      <PricingHero />
      <PricingPlans />
      <PricingFaq />
      <PricingIncluded />
      <WhoItsFor />
      <FinalCta
        heading="Start with a free trial."
        body="Thirty days to run quotes, invoices, expenses, and bank CSV matching. Choose Essentials or Premium when you are ready."
        primaryLabel="Start free trial"
      />
      <PublicFooter />
    </main>
  );
}
