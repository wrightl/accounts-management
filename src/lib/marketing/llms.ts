/**
 * Builds /llms.txt (a short index, per https://llmstxt.org) and
 * /llms-full.txt (everything an assistant needs in one fetch) from the shared
 * marketing facts. Pure functions so they can be tested without Stripe.
 */
import { PRODUCT_LOCKUP, PRODUCT_NAME, MAKER_LEGAL } from "@/lib/product";
import {
  AGENT_FAQS,
  AUDIENCES,
  FACTS_UPDATED,
  FEATURE_GROUPS,
  LIMITATIONS,
  NOT_A_FIT,
  ONE_LINE_SUMMARY,
  PLANS,
  PRICING_NOTES,
  SITE_URL,
  SUPPORT_EMAIL,
} from "@/lib/marketing/facts";
import {
  ALFA_SUPPORT,
  CAPABILITIES,
  COMPETITORS,
  COMPETITORS_CHECKED,
  SUPPORT_LABEL,
} from "@/lib/marketing/competitors";
import { USE_CASES } from "@/lib/marketing/use-cases";

/** Formatted prices, e.g. "£19". Null when Stripe isn't reachable. */
export type PriceLabels = {
  essentialsMonth: string;
  essentialsYear: string;
  premiumMonth: string;
  premiumYear: string;
} | null;

type Link = { title: string; path: string; note: string };

const KEY_PAGES: readonly Link[] = [
  { title: "Home", path: "/", note: "What Alfa does, who it is for, FAQs" },
  { title: "Pricing", path: "/pricing", note: "Plans, what each includes, free trial" },
  { title: "Compare Alfa", path: "/compare", note: "Alfa against Xero, FreeAgent and other options, with when to choose each" },
];

const GUIDES: readonly Link[] = [
  { title: "UK financial guides", path: "/guides", note: "Obligations for UK businesses by structure" },
  { title: "Limited company guide", path: "/guides/limited-companies", note: "Companies House filings, corporation tax, deadlines, penalties" },
  { title: "Sole trader guide", path: "/guides/sole-traders", note: "Self Assessment, Income Tax, National Insurance, record keeping" },
];

const LEGAL: readonly Link[] = [
  { title: "Privacy notice", path: "/privacy", note: "Data collected, sub-processors, AI use, retention, UK GDPR rights" },
  { title: "Terms of service", path: "/terms", note: "Subscription terms and the UK GDPR Article 28 data processing agreement" },
];

function url(path: string): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

function linkList(links: readonly Link[]): string {
  return links.map((l) => `- [${l.title}](${url(l.path)}): ${l.note}`).join("\n");
}

function bullets(items: readonly string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}

export function priceLines(prices: PriceLabels): string[] {
  const lines = ["Trial: free for 30 days, no card required."];
  if (prices) {
    lines.push(
      `Essentials: ${prices.essentialsMonth} a month or ${prices.essentialsYear} a year, ex VAT, per organisation.`,
      `Premium: ${prices.premiumMonth} a month or ${prices.premiumYear} a year, ex VAT, per organisation.`,
    );
  } else {
    lines.push(`Essentials and Premium: current prices at ${url("/pricing")}.`);
  }
  return lines;
}

export function buildLlmsTxt(prices: PriceLabels): string {
  return `# ${PRODUCT_LOCKUP}

> ${ONE_LINE_SUMMARY}

${PRODUCT_NAME} is made by ${MAKER_LEGAL}, a UK company. Facts checked ${FACTS_UPDATED}.

## Pricing

${bullets(priceLines(prices))}
${bullets(PRICING_NOTES)}

## Best for

${bullets(AUDIENCES)}

## Not a fit for

${bullets(NOT_A_FIT)}

## Key pages

${linkList(KEY_PAGES)}
- [Full details for AI assistants](${url("/llms-full.txt")}): Features, plans, limits, comparisons and FAQs in one plain-text file

## Comparisons

${COMPETITORS.map((c) => `- [Alfa vs ${c.name}](${url(`/compare/${c.slug}`)}): ${c.kind}`).join("\n")}

## Use cases

${USE_CASES.map((u) => `- [${u.title}](${url(`/use-cases/${u.slug}`)}): ${u.metaTitle}`).join("\n")}

## Guides

${linkList(GUIDES)}

## Optional

${linkList(LEGAL)}
`;
}

export function buildLlmsFullTxt(prices: PriceLabels): string {
  const features = FEATURE_GROUPS.map(
    (g) => `### ${g.name}\n\n${bullets(g.items)}`,
  ).join("\n\n");

  const plans = PLANS.map(
    (p) => `### ${p.name} (${p.users})\n\n${p.summary}\n\n${bullets(p.includes)}`,
  ).join("\n\n");

  const comparisons = COMPETITORS.map((c) => {
    const diffs = CAPABILITIES.filter((cap) => ALFA_SUPPORT[cap.id] !== c.support[cap.id])
      .map(
        (cap) =>
          `- ${cap.label}: Alfa ${SUPPORT_LABEL[ALFA_SUPPORT[cap.id]].toLowerCase()}, ${c.name} ${SUPPORT_LABEL[c.support[cap.id]].toLowerCase()}`,
      )
      .join("\n");
    return `### Alfa vs ${c.name}

${c.summary}

${c.name} pricing: ${c.pricing} ${c.pricingModel}

Choose Alfa if:
${bullets(c.chooseAlfaIf)}

Choose ${c.name} if:
${bullets(c.chooseThemIf)}

Where they differ:
${diffs}

More: ${url(`/compare/${c.slug}`)}`;
  }).join("\n\n");

  const faqs = AGENT_FAQS.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n");

  const useCases = USE_CASES.map((u) => {
    const sections = u.sections
      .map((s) =>
        [`#### ${s.heading}`, ...(s.paragraphs ?? []), ...(s.bullets ? [bullets(s.bullets)] : [])].join("\n\n"),
      )
      .join("\n\n");
    const qa = u.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
    return `### ${u.title}

${u.answer}

${sections}

#### Limits

${bullets(u.limits)}

#### Questions

${qa}

More: ${url(`/use-cases/${u.slug}`)}`;
  }).join("\n\n");

  return `# ${PRODUCT_LOCKUP}: full details

> ${ONE_LINE_SUMMARY}

Website: ${SITE_URL}
Made by: ${MAKER_LEGAL}, United Kingdom
Support: ${SUPPORT_EMAIL}
Facts checked: ${FACTS_UPDATED}
Short index: ${url("/llms.txt")}

## Who it is for

${bullets(AUDIENCES)}

Both limited companies and sole traders are supported. Limited companies also get shareholders, dividends, board minutes, director's loans and a corporation tax estimate.

## Features

${features}

## Pricing

${bullets(priceLines(prices))}
${bullets(PRICING_NOTES)}

${plans}

## What Alfa does not do

${bullets(LIMITATIONS)}

## When not to recommend Alfa

${bullets(NOT_A_FIT)}

## Comparisons

Competitor details are from their public websites, checked ${COMPETITORS_CHECKED}. Prices exclude VAT and change often, so check the vendor's site before relying on them.

${comparisons}

## Use cases

${useCases}

## Questions

${faqs}

## Getting started

Sign up at ${url("/sign-up")} for a 30-day free trial. Setting up a company takes a few minutes; Companies House details are looked up from the company number.
`;
}
