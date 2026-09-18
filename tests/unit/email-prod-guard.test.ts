import { afterEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCache } from "@/env";
import {
  getEmailProvider,
  resetEmailProviderCache,
  sendEmail,
} from "@/lib/email";

vi.mock("server-only", () => ({}));

describe("email provider production guard", () => {
  afterEach(() => {
    resetEmailProviderCache();
    resetServerEnvCache();
    vi.unstubAllEnvs();
  });

  it("allows console provider outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("EMAIL_PROVIDER", "console");
    resetServerEnvCache();
    resetEmailProviderCache();
    expect(getEmailProvider().name).toBe("console");
  });

  it("refuses console provider in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "console");
    resetServerEnvCache();
    resetEmailProviderCache();
    expect(() => getEmailProvider()).toThrow(/not allowed in production/i);
    await expect(
      sendEmail({
        to: "a@b.test",
        subject: "x",
        html: "<p>x</p>",
      }),
    ).rejects.toThrow(/not allowed in production/i);
  });
});
