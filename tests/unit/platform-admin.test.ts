import { describe, expect, it, afterEach } from "vitest";
import {
  isPlatformAdminEmail,
  resolvePlatformAdmin,
  platformAdminEmails,
} from "@/lib/bootstrap";

describe("platformAdminEmails / resolvePlatformAdmin", () => {
  const prev = process.env.PLATFORM_ADMIN_EMAILS;

  afterEach(() => {
    if (prev === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = prev;
  });

  it("treats unset PLATFORM_ADMIN_EMAILS as no allowlist", () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    expect(platformAdminEmails()).toEqual([]);
    expect(isPlatformAdminEmail("admin@dotanddashconsulting.com")).toBe(false);
  });

  it("grants access when role is platform_admin", () => {
    expect(
      resolvePlatformAdmin({
        role: "platform_admin",
        email: "anyone@example.com",
      }),
    ).toBe(true);
  });

  it("respects PLATFORM_ADMIN_EMAILS allowlist", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "ops@example.com";
    expect(isPlatformAdminEmail("ops@example.com")).toBe(true);
    expect(isPlatformAdminEmail("admin@dotanddashconsulting.com")).toBe(false);
    expect(
      resolvePlatformAdmin({
        role: "pending",
        email: "ops@example.com",
      }),
    ).toBe(true);
  });

  it("denies when neither role nor email matches", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "ops@example.com";
    expect(
      resolvePlatformAdmin({
        role: "user",
        email: "user@example.com",
      }),
    ).toBe(false);
  });

  it("treats empty PLATFORM_ADMIN_EMAILS as no allowlist", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "";
    expect(platformAdminEmails()).toEqual([]);
  });
});
