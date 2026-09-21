import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://accounts-manager.dotanddashconsulting.com";
  
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/llms.txt"],
        disallow: [
          "/dashboard",
          "/platform",
          "/api",
          "/sign-in",
          "/sign-up",
          "/onboarding",
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
          "/q/*",
        ],
      },
      // Allow AI crawlers and research bots
      {
        userAgent: "GPTBot",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api", "/sign-in", "/sign-up", "/onboarding"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api", "/sign-in", "/sign-up", "/onboarding"],
      },
      {
        userAgent: "Google-Extended",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api"],
      },
      {
        userAgent: "anthropic-ai",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api"],
      },
      {
        userAgent: "ClaudeBot",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api"],
      },
      {
        userAgent: "PerplexityBot",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api"],
      },
      {
        userAgent: "Applebot-Extended",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api"],
      },
      {
        userAgent: "cohere-ai",
        allow: ["/", "/pricing", "/guides", "/guides/*", "/llms.txt"],
        disallow: ["/dashboard", "/platform", "/api"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
