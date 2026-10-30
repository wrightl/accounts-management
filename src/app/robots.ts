import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://alfa.dotanddashconsulting.com";

  // Preview (alfa.preview…) and other non-production deployments stay out of search.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/privacy", "/terms", "/llms.txt"],
        disallow: [
          "/dashboard",
          "/platform",
          "/api",
          "/sign-in",
          "/sign-up",
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
          "/help",
          "/inbound-email",
          "/recurring-invoices",
          "/credit-notes",
          "/q/*",
          "/i/*",
        ],
      },
      // Allow AI crawlers and research bots
      {
        userAgent: "GPTBot",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/privacy", "/terms", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api", "/sign-in", "/sign-up", "/onboarding", "/subscribe"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/privacy", "/terms", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api", "/sign-in", "/sign-up", "/onboarding", "/subscribe"],
      },
      {
        userAgent: "Google-Extended",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/privacy", "/terms", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api"],
      },
      {
        userAgent: "anthropic-ai",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/privacy", "/terms", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api"],
      },
      {
        userAgent: "ClaudeBot",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/privacy", "/terms", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api"],
      },
      {
        userAgent: "PerplexityBot",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/privacy", "/terms", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api"],
      },
      {
        userAgent: "Applebot-Extended",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/privacy", "/terms", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api"],
      },
      {
        userAgent: "cohere-ai",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/privacy", "/terms", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
