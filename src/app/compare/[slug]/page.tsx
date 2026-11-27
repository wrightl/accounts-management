import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CompareTable } from "@/components/marketing/compare-table";
import { FinalCta } from "@/components/marketing/final-cta";
import {
  COMPETITORS,
  COMPETITORS_CHECKED,
  competitorBySlug,
  type Competitor,
} from "@/lib/marketing/competitors";
import { ONE_LINE_SUMMARY, SITE_URL } from "@/lib/marketing/facts";
import { priceLines } from "@/lib/marketing/llms";
import { marketingPriceLabels } from "@/lib/marketing/prices";
import {
  StructuredData,
  generateBreadcrumbSchema,
  generateFaqSchema,
} from "@/lib/structured-data";

// Alfa's own prices come from Stripe, which is cached for an hour.
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

function describe(c: Competitor): string {
  return `Alfa vs ${c.name} for UK consultancies, studios and small agencies: features, pricing, and when to choose each.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const c = competitorBySlug((await params).slug);
  if (!c) return {};
  const title = `Alfa vs ${c.name}: UK accounting software compared`;
  return {
    title,
    description: describe(c),
    openGraph: {
      title,
      description: describe(c),
      url: `${SITE_URL}/compare/${c.slug}`,
      siteName: "Alfa by Dot+Dash",
      locale: "en_GB",
      type: "article",
    },
    alternates: { canonical: `${SITE_URL}/compare/${c.slug}` },
  };
}

function faqsFor(c: Competitor, alfaPrices: string): Array<{ q: string; a: string }> {
  return [
    {
      q: `Should I use Alfa or ${c.name}?`,
      a: `Choose Alfa if: ${c.chooseAlfaIf.join("; ")}. Choose ${c.name} if: ${c.chooseThemIf.join("; ")}.`,
    },
    {
      q: `How much do Alfa and ${c.name} cost?`,
      a: `Alfa: ${alfaPrices} ${c.name}: ${c.pricing} (checked ${COMPETITORS_CHECKED}, ex VAT).`,
    },
  ];
}

export default async function CompareCompetitorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const c = competitorBySlug((await params).slug);
  if (!c) notFound();

  const alfaPrices = priceLines(await marketingPriceLabels()).join(" ");

  return (
    <>
      <StructuredData
        data={generateBreadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Compare", url: "/compare" },
          { name: `Alfa vs ${c.name}`, url: `/compare/${c.slug}` },
        ])}
      />
      <StructuredData data={generateFaqSchema(faqsFor(c, alfaPrices))} />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col bg-background">
        <article className="mx-auto w-full max-w-5xl px-6 py-16">
          <Link
            href="/compare"
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            All comparisons
          </Link>
          <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Alfa vs {c.name}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">
            {describe(c)}
          </p>

          <section className="mt-12 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-wash/50 p-6">
              <h2 className="font-display text-xl font-semibold text-navy">Alfa</h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                {ONE_LINE_SUMMARY}
              </p>
              <p className="mt-4 text-sm font-medium text-foreground">Pricing</p>
              <p className="mt-1 text-sm text-foreground/90">{alfaPrices}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-6">
              <h2 className="font-display text-xl font-semibold text-foreground">{c.name}</h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground/90">{c.summary}</p>
              <p className="mt-4 text-sm font-medium text-foreground">Pricing</p>
              <p className="mt-1 text-sm text-foreground/90">
                {c.pricing} {c.pricingModel}
              </p>
            </div>
          </section>

          <section className="mt-12 grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="font-display text-2xl font-semibold text-foreground">
                Choose Alfa if
              </h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-foreground/90">
                {c.chooseAlfaIf.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-display text-2xl font-semibold text-foreground">
                Choose {c.name} if
              </h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-foreground/90">
                {c.chooseThemIf.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mt-16">
            <h2 className="font-display text-2xl font-semibold text-foreground">
              Feature by feature
            </h2>
            <div className="mt-6">
              <CompareTable competitors={[c]} />
            </div>
          </section>

          <p className="mt-12 text-sm text-muted">
            {c.name} details are from its public website, checked{" "}
            {COMPETITORS_CHECKED}. Prices exclude VAT and change often; check
            the vendor&apos;s site before deciding. &quot;Partly&quot; means
            limited, an add-on or only on some plans.
          </p>
        </article>
        <FinalCta
          heading="Try Alfa free for 30 days."
          body="No card required. Import a bank CSV, raise an invoice and see if it fits your week."
          primaryLabel="Start free trial"
        />
      </main>
    </>
  );
}
