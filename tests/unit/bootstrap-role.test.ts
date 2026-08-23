import { describe, it, expect } from "vitest";
import { bootstrapAdminEmails, bootstrapRole } from "@/lib/bootstrap";

describe("bootstrapRole", () => {
  it("defaults Lee to admin and Angel to co-founder", () => {
    expect(bootstrapRole("lee@dotanddashconsulting.com")).toBe("admin");
    expect(bootstrapRole("angel@dotanddashconsulting.com")).toBe("user");
  });

  it("leaves unknown emails pending", () => {
    expect(bootstrapRole("accountant@example.com")).toBe("pending");
    expect(bootstrapRole(null)).toBe("pending");
  });

  it("exposes the default admin email for seeding", () => {
    expect(bootstrapAdminEmails()).toContain("lee@dotanddashconsulting.com");
  });
});
