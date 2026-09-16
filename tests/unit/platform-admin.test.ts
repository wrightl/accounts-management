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

  it("defaults to admin@dotanddashconsulting.com when unset", () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    expect(platformAdminEmails()).toContain("admin@dotanddashconsulting.com");
    expect(isPlatformAdminEmail("admin@dotanddashconsulting.com")).toBe(true);
  });

  it("grants access when role is platform_admin", () => {
    expect(
      resolvePlatformAdmin({
        role: "platform_admin",
        email: "anyone@example.com",
      }),
    ).toBe(true);
  });

  it("respects PLATFORM_ADMIN_EMAILS override", () => {
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
