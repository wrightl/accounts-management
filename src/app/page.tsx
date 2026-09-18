import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
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

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
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
  );
}
