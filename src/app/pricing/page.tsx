import type { Metadata } from "next";
import { PublicHeader } from "@/components/marketing/public-header";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PricingHero } from "@/components/marketing/pricing-hero";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { PricingIncluded } from "@/components/marketing/pricing-included";
import { WhoItsFor } from "@/components/marketing/who-its-for";
import { PricingFaq } from "@/components/marketing/pricing-faq";
import { FinalCta } from "@/components/marketing/final-cta";
import {
  StructuredData,
  generatePricingSchema,
  generateBreadcrumbSchema,
} from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Pricing - UK Accounting Software £19-£29/month | Free 30-Day Trial",
  description:
    "Transparent pricing for UK accounting software. Free 30-day trial with full access. Essentials plan from £19/month or Premium from £29/month (ex VAT). Includes quotes, invoices, expenses, bank reconciliation, VAT support, and accountant collaboration. Built for UK limited companies and sole traders. No hidden fees or per-user charges.",
  keywords: [
    "UK accounting software pricing",
    "UK bookkeeping software cost",
    "accounting software £19",
    "UK invoice software price",
    "UK consultancy accounting cost",
    "affordable UK accounting",
    "UK small business accounting price",
    "accounting software free trial UK",
  ],
  openGraph: {
    title: "Pricing - UK Accounting Software £19-£29/month | Free 30-Day Trial",
    description:
      "Transparent pricing for UK accounting software. Free 30-day trial. Essentials £19/month or Premium £29/month. Built for UK limited companies and sole traders.",
    url: "https://accounts-manager.dotanddashconsulting.com/pricing",
    siteName: "Alfa by Dot+Dash",
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing - UK Accounting Software £19-£29/month",
    description:
      "Free 30-day trial. Essentials £19/month or Premium £29/month. Built for UK businesses. No hidden fees.",
  },
  alternates: {
    canonical: "https://accounts-manager.dotanddashconsulting.com/pricing",
  },
};

export default function PricingPage() {
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Pricing", url: "/pricing" },
  ];

  return (
    <>
      <StructuredData data={generatePricingSchema()} />
      <StructuredData data={generateBreadcrumbSchema(breadcrumbs)} />
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
          ctaLocation="final_cta"
          from="pricing"
        />
        <PublicFooter />
      </main>
    </>
  );
}
