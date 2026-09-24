import type { Metadata } from "next";
import { PublicHeader } from "@/components/marketing/public-header";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PricingHero } from "@/components/marketing/pricing-hero";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { PricingIncluded } from "@/components/marketing/pricing-included";
import { CalmFocusSection } from "@/components/marketing/calm-focus";
import { WhoItsFor } from "@/components/marketing/who-its-for";
import { PricingFaq } from "@/components/marketing/pricing-faq";
import { FinalCta } from "@/components/marketing/final-cta";
import {
  StructuredData,
  generatePricingSchema,
  generateBreadcrumbSchema,
} from "@/lib/structured-data";
import {
  formatCatalogPounds,
  getStripeCatalog,
} from "@/lib/billing/catalog";
import { penceToPounds } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await getStripeCatalog();
  const e = catalog
    ? formatCatalogPounds(catalog.essentials.month.amountPence)
    : null;
  const p = catalog
    ? formatCatalogPounds(catalog.premium.month.amountPence)
    : null;
  const range =
    e && p ? `${e}-${p}/month` : "transparent UK accounting software pricing";
  const title = e && p
    ? `Pricing - UK Accounting Software ${e}-${p}/month | Free 30-Day Trial`
    : "Pricing - UK Accounting Software | Free 30-Day Trial";
  const description =
    e && p
      ? `Transparent pricing for UK accounting software. Free 30-day trial. Essentials from ${e}/month or Premium from ${p}/month (ex VAT). Quotes, invoices, expenses, bank matching, VAT support — plus display and focus controls for neurodiverse founders. No per-user charges.`
      : "Transparent pricing for UK accounting software. Free 30-day trial. Quotes, invoices, expenses, bank matching, VAT support — plus display and focus controls for neurodiverse founders. No per-user charges.";

  return {
    title,
    description,
    keywords: [
      "UK accounting software pricing",
      "UK bookkeeping software cost",
      ...(e ? [`accounting software ${e}`] : []),
      "UK invoice software price",
      "UK consultancy accounting cost",
      "affordable UK accounting",
      "UK small business accounting price",
      "accounting software free trial UK",
      "accessible bookkeeping UK",
    ],
    openGraph: {
      title,
      description:
        e && p
          ? `Free 30-day trial. Essentials ${e}/month or Premium ${p}/month. Built for UK service firms and neurodiverse founders — display controls on every plan.`
          : "Free 30-day trial. Built for UK service firms and neurodiverse founders — display controls on every plan.",
      url: "https://alfa.dotanddashconsulting.com/pricing",
      siteName: "Alfa by Dot+Dash",
      locale: "en_GB",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: e && p
        ? `Pricing - UK Accounting Software ${range}`
        : "Pricing - UK Accounting Software",
      description:
        e && p
          ? `Free 30-day trial. Essentials ${e}/month or Premium ${p}/month. Display and focus controls included. No hidden fees.`
          : "Free 30-day trial. Display and focus controls included. No hidden fees.",
    },
    alternates: {
      canonical: "https://alfa.dotanddashconsulting.com/pricing",
    },
  };
}

export default async function PricingPage() {
  const catalog = await getStripeCatalog();
  const essentialsMonthLabel = catalog
    ? formatCatalogPounds(catalog.essentials.month.amountPence)
    : null;
  const annualAnswer = catalog
    ? `Pay yearly and get two months free — Essentials ${formatCatalogPounds(catalog.essentials.year.amountPence)} / year or Premium ${formatCatalogPounds(catalog.premium.year.amountPence)} / year, both ex VAT.`
    : "Pay yearly and get two months free on Essentials and Premium (ex VAT). Live amounts appear when billing is configured.";

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Pricing", url: "/pricing" },
  ];

  const offerAmounts = catalog
    ? {
        essentials: String(penceToPounds(catalog.essentials.month.amountPence)),
        premium: String(penceToPounds(catalog.premium.month.amountPence)),
        essentialsName: catalog.essentials.name,
        premiumName: catalog.premium.name,
        essentialsDescription: catalog.essentials.description,
        premiumDescription: catalog.premium.description,
      }
    : null;

  return (
    <>
      <StructuredData data={generatePricingSchema(offerAmounts)} />
      <StructuredData data={generateBreadcrumbSchema(breadcrumbs)} />
      <PublicHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 flex-col bg-navy text-foreground"
      >
        <PricingHero essentialsMonthLabel={essentialsMonthLabel} />
        <PricingPlans catalog={catalog} />
        <PricingFaq annualAnswer={annualAnswer} />
        <PricingIncluded />
        <CalmFocusSection />
        <WhoItsFor />
        <FinalCta
          heading="Start with a free trial."
          body="Thirty days to run quotes, invoices, expenses, and bank CSV matching — with display and focus controls included. Choose Essentials or Premium when you are ready."
          primaryLabel="Start free trial"
          ctaLocation="final_cta"
          from="pricing"
        />
      </main>
      <PublicFooter />
    </>
  );
}

