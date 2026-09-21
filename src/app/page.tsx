import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { PublicHeader } from "@/components/marketing/public-header";
import { PublicFooter } from "@/components/marketing/public-footer";
import { MarketingHero } from "@/components/marketing/hero";
import { AudienceStrip } from "@/components/marketing/audience-strip";
import { ProblemSection } from "@/components/marketing/problem-section";
import { ProductVideo } from "@/components/marketing/product-video";
import { FeatureSplits } from "@/components/marketing/feature-splits";
import { HowItWorks } from "@/components/marketing/how-it-works";
import {
  DifferentiatorSection,
  WhoItsFor,
} from "@/components/marketing/who-its-for";
import { FaqSection } from "@/components/marketing/faq";
import { GuidesTeaser } from "@/components/marketing/guides-teaser";
import { FinalCta } from "@/components/marketing/final-cta";
import {
  StructuredData,
  generateOrganizationSchema,
  generateSoftwareApplicationSchema,
  generateFaqSchema,
} from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "UK Accounting Software for Limited Companies & Sole Traders",
  description:
    "Alfa is accounting software built specifically for UK consultancies, studios, and small agencies. Manage quotes, invoices, expenses, bank reconciliation, VAT, and reporting. Supports limited companies and sole traders. Replace spreadsheets with integrated bookkeeping. Free 30-day trial.",
  keywords: [
    "UK accounting software",
    "UK bookkeeping software",
    "limited company accounting UK",
    "sole trader accounting UK",
    "UK consultancy accounting",
    "UK freelancer invoicing",
    "UK small business accounting",
    "UK expense tracking",
    "UK invoice software",
    "UK VAT software",
    "UK quote software",
    "accounting for UK consultancies",
    "UK studio accounting",
    "UK agency bookkeeping",
  ],
  openGraph: {
    title: "Alfa - UK Accounting Software for Limited Companies & Sole Traders",
    description:
      "Replace spreadsheets with integrated bookkeeping. Quotes, invoices, expenses, bank reconciliation, and reporting built specifically for UK businesses. Free 30-day trial.",
    url: "https://alfa.dotanddashconsulting.com",
    siteName: "Alfa by Dot+Dash",
    locale: "en_GB",
    type: "website",
    images: [
      {
        url: "https://alfa.dotanddashconsulting.com/marketing/dashboard.png",
        width: 1440,
        height: 900,
        alt: "Alfa dashboard showing receivables, overdue invoices, and needs-attention items",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Alfa - UK Accounting Software for Limited Companies & Sole Traders",
    description:
      "Replace spreadsheets with integrated bookkeeping. Built specifically for UK consultancies, studios, and agencies. Free 30-day trial.",
    images: ["https://alfa.dotanddashconsulting.com/marketing/dashboard.png"],
  },
  alternates: {
    canonical: "https://alfa.dotanddashconsulting.com",
  },
};

const FAQ_DATA = [
  {
    q: "Is this full accounting software?",
    a: "It replaces the spreadsheets and folders you use day to day — quotes, invoices, expenses, bank CSV matching, and reports. Your accountant still files returns and handles Companies House.",
  },
  {
    q: "Do you support VAT or Making Tax Digital?",
    a: "If you are VAT-registered you can set rates and export a period VAT CSV for your accountant. We do not submit to HMRC or claim Making Tax Digital filing.",
  },
  {
    q: "Is there a live bank feed?",
    a: "No. Export a CSV from your bank (Starling, Monzo, and others), import it, and match payments to invoices.",
  },
  {
    q: "Can my accountant use it?",
    a: "Yes. Invite them read-only. They can export an accountant pack with CSVs, invoice PDFs, receipts, and bank data.",
  },
  {
    q: "Limited company or sole trader?",
    a: "Both. Day-to-day books are the same. Limited companies also get shareholders and dividends. See our UK Financial Guides for obligations by structure.",
  },
  {
    q: "What currency do you support?",
    a: "GBP only. Foreign receipts can be logged for information, but the books stay in pounds.",
  },
];

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <>
      <StructuredData data={generateOrganizationSchema()} />
      <StructuredData data={generateSoftwareApplicationSchema()} />
      <StructuredData data={generateFaqSchema(FAQ_DATA)} />
      <main className="flex flex-1 flex-col bg-navy text-foreground">
        <PublicHeader />
        <MarketingHero />
        <AudienceStrip />
        <ProblemSection />
        <ProductVideo />
        <FeatureSplits />
        <HowItWorks />
        <DifferentiatorSection />
        <WhoItsFor />
        <FaqSection />
        <GuidesTeaser />
        <FinalCta />
        <PublicFooter />
      </main>
    </>
  );
}
