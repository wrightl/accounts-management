import { describe, expect, it } from "vitest";
import robots, { AI_AGENTS, PRIVATE_PATHS } from "@/app/robots";
import sitemap from "@/app/sitemap";
import {
  ALFA_SUPPORT,
  CAPABILITIES,
  COMPETITORS,
} from "@/lib/marketing/competitors";
import { LIMITATIONS, PLANS, SITE_URL } from "@/lib/marketing/facts";
import { buildLlmsFullTxt, buildLlmsTxt } from "@/lib/marketing/llms";
import { USE_CASES, findUseCase } from "@/lib/marketing/use-cases";
import { existsSync } from "node:fs";
import {
  generateOrganizationSchema,
  generateSoftwareApplicationSchema,
} from "@/lib/structured-data";

const PRICES = {
  essentialsMonth: "£19",
  essentialsYear: "£190",
  premiumMonth: "£29",
  premiumYear: "£290",
};

describe("llms.txt", () => {
  it("follows the llms.txt shape: one H1, then a blockquote summary", () => {
    const txt = buildLlmsTxt(PRICES);
    const lines = txt.split("\n");
    expect(lines[0]).toMatch(/^# \S/);
    expect(lines.filter((l) => /^# /.test(l))).toHaveLength(1);
    expect(lines[2]).toMatch(/^> /);
  });

  it("states live prices when Stripe is available", () => {
    const txt = buildLlmsTxt(PRICES);
    expect(txt).toContain("Essentials: £19 a month or £190 a year");
    expect(txt).toContain("Premium: £29 a month or £290 a year");
  });

  it("points to the pricing page rather than guessing when prices are unavailable", () => {
    const txt = buildLlmsTxt(null);
    expect(txt).not.toMatch(/£\d/);
    expect(txt).toContain(`${SITE_URL}/pricing`);
  });

  it("links every comparison page and the full file", () => {
    const txt = buildLlmsTxt(PRICES);
    for (const c of COMPETITORS) {
      expect(txt).toContain(`${SITE_URL}/compare/${c.slug}`);
    }
    expect(txt).toContain(`${SITE_URL}/llms-full.txt`);
  });

  it("puts every limitation and plan in the full file", () => {
    const txt = buildLlmsFullTxt(PRICES);
    for (const l of LIMITATIONS) expect(txt).toContain(l);
    for (const p of PLANS) expect(txt).toContain(`### ${p.name} (${p.users})`);
  });
});

describe("comparisons", () => {
  it("gives every competitor a unique slug and a value for every capability", () => {
    const slugs = COMPETITORS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of COMPETITORS) {
      for (const cap of CAPABILITIES) {
        expect(c.support[cap.id], `${c.slug} ${cap.id}`).toBeDefined();
      }
      expect(c.chooseAlfaIf.length).toBeGreaterThan(0);
      expect(c.chooseThemIf.length).toBeGreaterThan(0);
    }
  });

  it("matches Alfa's stated limitations", () => {
    expect(ALFA_SUPPORT.bankFeed).toBe("no");
    expect(ALFA_SUPPORT.mtdFiling).toBe("no");
  });
});

describe("robots.txt", () => {
  it("keeps every crawler, AI agents included, out of private pages and client links", () => {
    const { rules } = robots();
    const groups = Array.isArray(rules) ? rules : [rules];
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) {
      const disallow = [group.disallow ?? []].flat();
      expect(disallow).toEqual(expect.arrayContaining(["/i/", "/q/", "/dashboard", "/api"]));
      expect(disallow).toEqual(PRIVATE_PATHS);
    }
  });

  it("names the main AI search and assistant agents", () => {
    expect(AI_AGENTS).toEqual(
      expect.arrayContaining(["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot"]),
    );
  });
});

describe("sitemap", () => {
  it("lists every comparison page with a fixed date", () => {
    const entries = sitemap();
    for (const c of COMPETITORS) {
      expect(entries.map((e) => e.url)).toContain(`${SITE_URL}/compare/${c.slug}`);
    }
    for (const e of entries) expect(e.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("structured data", () => {
  it("points the logo at a file that exists and links the publisher", () => {
    const logoPath = generateOrganizationSchema().logo.slice(SITE_URL.length);
    expect(existsSync(`public${logoPath}`)).toBe(true);
    const schema = generateSoftwareApplicationSchema();
    expect(schema["@id"]).toBe(`${SITE_URL}/#software`);
    expect(schema.publisher["@id"]).toBe(`${SITE_URL}/#organization`);
  });
});

describe("use cases", () => {
  it("are listed in llms.txt, the full file and the sitemap", () => {
    const short = buildLlmsTxt(PRICES);
    const full = buildLlmsFullTxt(PRICES);
    const urls = sitemap().map((e) => e.url);
    for (const u of USE_CASES) {
      const href = `${SITE_URL}/use-cases/${u.slug}`;
      expect(short).toContain(href);
      expect(full).toContain(u.answer);
      expect(urls).toContain(href);
    }
  });

  it("each answer the question first and say where Alfa stops", () => {
    const slugs = USE_CASES.map((u) => u.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const u of USE_CASES) {
      expect(u.answer.length).toBeGreaterThan(80);
      expect(u.limits.length).toBeGreaterThan(0);
      expect(u.faqs.length).toBeGreaterThan(0);
      expect(findUseCase(u.slug)).toBe(u);
    }
  });

  it("only link to pages that exist", () => {
    const known = new Set([
      ...sitemap().map((e) => e.url.slice(SITE_URL.length) || "/"),
    ]);
    for (const u of USE_CASES) {
      for (const r of u.related) expect(known, `${u.slug} → ${r.href}`).toContain(r.href);
    }
  });

  it("are open to every crawler", () => {
    const { rules } = robots();
    for (const group of [rules].flat()) {
      expect([group.allow ?? []].flat()).toEqual(expect.arrayContaining(["/use-cases", "/use-cases/*"]));
    }
  });
});
