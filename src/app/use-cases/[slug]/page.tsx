import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { FinalCta } from "@/components/marketing/final-cta";
import { SITE_URL } from "@/lib/marketing/facts";
import {
  USE_CASES,
  USE_CASES_CHECKED,
  findUseCase,
} from "@/lib/marketing/use-cases";
import {
  StructuredData,
  generateBreadcrumbSchema,
  generateFaqSchema,
} from "@/lib/structured-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return USE_CASES.map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const u = findUseCase((await params).slug);
  if (!u) return {};
  return {
    title: u.metaTitle,
    description: u.answer,
    openGraph: {
      title: u.metaTitle,
      description: u.answer,
      url: `${SITE_URL}/use-cases/${u.slug}`,
      siteName: "Alfa by Dot+Dash",
      locale: "en_GB",
      type: "article",
    },
    alternates: { canonical: `${SITE_URL}/use-cases/${u.slug}` },
  };
}

export default async function UseCasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const u = findUseCase((await params).slug);
  if (!u) notFound();

  return (
    <>
      <StructuredData
        data={generateBreadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Use cases", url: "/use-cases" },
          { name: u.title, url: `/use-cases/${u.slug}` },
        ])}
      />
      <StructuredData data={generateFaqSchema([...u.faqs])} />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col bg-background">
        <article className="mx-auto w-full max-w-3xl px-6 py-16">
          <Link
            href="/use-cases"
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            All use cases
          </Link>
          <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            {u.title}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-foreground/90">{u.answer}</p>

          {u.sections.map((s) => (
            <section key={s.heading} className="mt-12">
              <h2 className="font-display text-2xl font-semibold text-foreground">{s.heading}</h2>
              {s.paragraphs?.map((p) => (
                <p key={p} className="mt-4 text-base leading-relaxed text-foreground/90">
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-foreground/90">
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section className="mt-12 rounded-2xl border border-border bg-wash/50 p-6">
            <h2 className="font-display text-xl font-semibold text-foreground">
              What Alfa does not do here
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground/90">
              {u.limits.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>

          <section className="mt-12">
            <h2 className="font-display text-2xl font-semibold text-foreground">Questions</h2>
            <div className="mt-6 space-y-6">
              {u.faqs.map((f) => (
                <div key={f.q}>
                  <h3 className="font-semibold text-foreground">{f.q}</h3>
                  <p className="mt-2 text-base leading-relaxed text-foreground/90">{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          <nav aria-label="Related" className="mt-12">
            <h2 className="text-sm font-medium text-foreground">Related</h2>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {u.related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="text-navy underline hover:no-underline">
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <p className="mt-12 text-sm text-muted">
            Checked {USE_CASES_CHECKED}. This is general information, not tax
            advice; ask your accountant about your own circumstances.
          </p>
        </article>
        <FinalCta
          heading="Try Alfa free for 30 days."
          body="No card required. Set up your company in minutes and invite your accountant when you are ready."
          primaryLabel="Start free trial"
        />
      </main>
    </>
  );
}
