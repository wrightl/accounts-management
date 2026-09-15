import { describe, it, expect } from "vitest";
import { clerkFrontendApiHost } from "@/lib/clerk-frontend-api";

describe("clerkFrontendApiHost", () => {
  it("decodes a development instance host", () => {
    expect(
      clerkFrontendApiHost(
        "pk_test_ZmFuY3ktbXVza3JhdC0xMTE5LmNsZXJrLmFjY291bnRzLmRldiQ",
      ),
    ).toBe("fancy-muskrat-1119.clerk.accounts.dev");
  });

  it("decodes a production instance host", () => {
    expect(
      clerkFrontendApiHost(
        "pk_live_Y2xlcmsuZG90YW5kZGFzaGNvbnN1bHRpbmcuY29tJA",
      ),
    ).toBe("clerk.dotanddashconsulting.com");
  });

  it("returns null for missing or malformed keys", () => {
    expect(clerkFrontendApiHost(undefined)).toBeNull();
    expect(clerkFrontendApiHost("pk_test_not-base64")).toBeNull();
    expect(clerkFrontendApiHost("pk_test_mock")).toBeNull();
  });
});
