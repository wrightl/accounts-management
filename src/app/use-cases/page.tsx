import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SITE_URL } from "@/lib/marketing/facts";
import { USE_CASES } from "@/lib/marketing/use-cases";
import { StructuredData, generateBreadcrumbSchema } from "@/lib/structured-data";

const TITLE = "How UK founders use Alfa";
const DESCRIPTION =
  "Short answers on running the books of a UK consultancy, studio or agency with Alfa: founder expenses, dividends, director's loans and invoicing overseas clients.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/use-cases`,
    siteName: "Alfa by Dot+Dash",
    locale: "en_GB",
    type: "website",
  },
  alternates: { canonical: `${SITE_URL}/use-cases` },
};

export default function UseCasesPage() {
  return (
    <>
      <StructuredData
        data={generateBreadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Use cases", url: "/use-cases" },
        ])}
      />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col bg-background">
        <div className="mx-auto w-full max-w-5xl px-6 py-16">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            {TITLE}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">{DESCRIPTION}</p>
          <ul className="mt-12 grid gap-4">
            {USE_CASES.map((u) => (
              <li key={u.slug}>
                <Link
                  href={`/use-cases/${u.slug}`}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-white p-6 hover:border-navy/40"
                >
                  <span>
                    <span className="block font-display text-xl font-semibold text-foreground">
                      {u.title}
                    </span>
                    <span className="mt-2 block text-sm leading-relaxed text-muted">{u.answer}</span>
                  </span>
                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
