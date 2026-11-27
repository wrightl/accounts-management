import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CompareTable } from "@/components/marketing/compare-table";
import { FinalCta } from "@/components/marketing/final-cta";
import { COMPETITORS, COMPETITORS_CHECKED } from "@/lib/marketing/competitors";
import { LIMITATIONS, SITE_URL } from "@/lib/marketing/facts";
import {
  StructuredData,
  generateBreadcrumbSchema,
} from "@/lib/structured-data";

const TITLE = "Compare Alfa with Xero, FreeAgent and other UK accounting software";
const DESCRIPTION =
  "How Alfa compares with Xero, FreeAgent, Starling Accounting, Crunch, Bonsai, Harvest and spreadsheets for UK consultancies, studios and small agencies, with when each is the better choice.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/compare`,
    siteName: "Alfa by Dot+Dash",
    locale: "en_GB",
    type: "article",
  },
  alternates: { canonical: `${SITE_URL}/compare` },
};

export default function ComparePage() {
  const mainRivals = COMPETITORS.filter((c) =>
    ["xero", "freeagent", "bonsai"].includes(c.slug),
  );

  return (
    <>
      <StructuredData
        data={generateBreadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Compare", url: "/compare" },
        ])}
      />
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: TITLE,
          itemListElement: COMPETITORS.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `Alfa vs ${c.name}`,
            url: `${SITE_URL}/compare/${c.slug}`,
          })),
        }}
      />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col bg-background">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            How Alfa compares
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">
            Alfa is day-to-day books for UK consultancies, studios and small
            agencies: quote to order to milestone invoice, founder expenses and
            reimbursements, bank CSV matching and a pack for your accountant.
            It is not the right choice for everyone, so each comparison says
            when the other product is the better fit.
          </p>

          <ul className="mt-12 grid gap-4 md:grid-cols-2">
            {COMPETITORS.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/compare/${c.slug}`}
                  className="flex h-full items-start justify-between gap-4 rounded-2xl border border-border bg-white p-6 hover:border-navy/40"
                >
                  <span>
                    <span className="block font-display text-xl font-semibold text-foreground">
                      Alfa vs {c.name}
                    </span>
                    <span className="mt-1 block text-sm text-muted">{c.kind}</span>
                  </span>
                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <section className="mt-20">
            <h2 className="font-display text-3xl font-semibold text-foreground">
              At a glance
            </h2>
            <div className="mt-8">
              <CompareTable competitors={mainRivals} />
            </div>
          </section>

          <section className="mt-20">
            <h2 className="font-display text-3xl font-semibold text-foreground">
              What Alfa does not do
            </h2>
            <ul className="mt-6 max-w-3xl list-disc space-y-2 pl-5 text-base leading-relaxed text-foreground/90">
              {LIMITATIONS.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>

          <p className="mt-16 max-w-3xl text-sm text-muted">
            Competitor details are from their public websites, checked{" "}
            {COMPETITORS_CHECKED}. Prices exclude VAT and change often; check
            the vendor&apos;s site before deciding. &quot;Partly&quot; means
            limited, an add-on or only on some plans.
          </p>
        </div>
        <FinalCta
          heading="Try Alfa free for 30 days."
          body="No card required. Bring your bank CSVs and invite your accountant when you are ready."
          primaryLabel="Start free trial"
        />
      </main>
    </>
  );
}
