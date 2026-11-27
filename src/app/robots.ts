import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/marketing/facts";

/** Public marketing pages: the only places any crawler may go. */
export const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/compare",
  "/compare/*",
  "/guides",
  "/guides/*",
  "/privacy",
  "/terms",
  "/llms.txt",
  "/llms-full.txt",
];

/**
 * Everything behind sign-in, plus the token links clients use to view
 * invoices and quotes (/i, /q), which must never be crawled or used for
 * training. A crawler follows only the most specific group that names it, so
 * every group carries this whole list.
 */
export const PRIVATE_PATHS = [
  "/dashboard",
  "/platform",
  "/api",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/onboarding",
  "/subscribe",
  "/orders",
  "/quotes",
  "/invoices",
  "/expenses",
  "/clients",
  "/settings",
  "/profile",
  "/transactions",
  "/spending",
  "/reimbursements",
  "/shareholders",
  "/dividends",
  "/users",
  "/audit",
  "/bank",
  "/reports",
  "/year-end",
  "/help",
  "/inbound-email",
  "/recurring-invoices",
  "/credit-notes",
  "/q/",
  "/i/",
];

/**
 * AI search, assistant and training crawlers, named so the welcome is
 * explicit. Search and user-triggered agents (OAI-SearchBot, ChatGPT-User,
 * Claude-SearchBot, Claude-User, Perplexity-User and the like) are what put
 * Alfa into answers; the training crawlers help models know Alfa exists.
 */
export const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot",
  "Applebot-Extended",
  "Amazonbot",
  "meta-externalagent",
  "MistralAI-User",
  "DuckAssistBot",
  "cohere-ai",
];

export default function robots(): MetadataRoute.Robots {
  // Preview (alfa.preview…) and other non-production deployments stay out of search.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      { userAgent: "*", allow: PUBLIC_PATHS, disallow: PRIVATE_PATHS },
      { userAgent: AI_AGENTS, allow: PUBLIC_PATHS, disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
