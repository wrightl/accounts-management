import { MetadataRoute } from "next";
import { COMPETITORS } from "@/lib/marketing/competitors";
import { FACTS_UPDATED, SITE_URL } from "@/lib/marketing/facts";

/**
 * Dates are when the content last changed, not the time of the request, so
 * crawlers can tell what is worth fetching again. Product pages follow
 * FACTS_UPDATED; bump the others when their copy changes.
 */
const GUIDES_UPDATED = "2026-11-07";
const LEGAL_UPDATED = "2026-11-07";

export default function sitemap(): MetadataRoute.Sitemap {
  const page = (
    path: string,
    lastModified: string,
    changeFrequency: "weekly" | "monthly" | "yearly",
    priority: number,
  ) => ({
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  });

  return [
    page("/", FACTS_UPDATED, "weekly", 1.0),
    page("/pricing", FACTS_UPDATED, "monthly", 0.9),
    page("/compare", FACTS_UPDATED, "monthly", 0.8),
    ...COMPETITORS.map((c) => page(`/compare/${c.slug}`, FACTS_UPDATED, "monthly", 0.7)),
    page("/guides", GUIDES_UPDATED, "monthly", 0.8),
    page("/guides/limited-companies", GUIDES_UPDATED, "monthly", 0.8),
    page("/guides/sole-traders", GUIDES_UPDATED, "monthly", 0.8),
    page("/privacy", LEGAL_UPDATED, "yearly", 0.3),
    page("/terms", LEGAL_UPDATED, "yearly", 0.3),
  ];
}
