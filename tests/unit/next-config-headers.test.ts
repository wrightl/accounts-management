import { describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import nextConfig from "../../next.config";

/** The headers Next sends for a path: every matching entry in order, later keys win. */
async function headersFor(pathname: string): Promise<Record<string, string>> {
  const entries = (await nextConfig.headers?.()) ?? [];
  const out: Record<string, string> = {};
  for (const entry of entries) {
    // Same options Next's router uses for header routes (router-utils/filesystem).
    const match = getPathMatch(entry.source, {
      strict: true,
      removeUnnamedParams: true,
      regexModifier: (regex) => modifyRouteRegex(regex),
    });
    if (match(pathname) === false) continue;
    for (const { key, value } of entry.headers) out[key.toLowerCase()] = value;
  }
  return out;
}

describe("next.config security headers", () => {
  it.each([
    "/terms",
    "/expenses/abc",
    "/api/receipts",
    "/api/receipts/abc/x",
    "/api/expenses/abc",
    "/api/expenses/abc/email-body/y",
    "/api/mobile/expenses/abc/receipts",
  ])("forbids framing %s", async (path) => {
    const headers = await headersFor(path);
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it.each(["/api/receipts/abc", "/api/expenses/abc/email-body"])(
    "leaves framing to the route for %s, keeping the other headers",
    async (path) => {
      const headers = await headersFor(path);
      expect(headers["x-frame-options"]).toBeUndefined();
      expect(headers["content-security-policy"]).toBeUndefined();
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["strict-transport-security"]).toContain("max-age=");
    },
  );
});
