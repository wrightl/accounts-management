import { describe, it, expect } from "vitest";
import { can, isRole, roleLabel, ROLES } from "@/lib/roles";

describe("roles", () => {
  it("recognises valid roles", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("user")).toBe(true);
    expect(isRole("accountant")).toBe(true);
    expect(isRole("pending")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("grants admin every permission", () => {
    expect(can("admin", "accounts:write")).toBe(true);
    expect(can("admin", "users:manage")).toBe(true);
    expect(can("admin", "settings:manage")).toBe(true);
    expect(can("admin", "reports:export")).toBe(true);
  });

  it("gives the co-founder (user) full accounts access but not admin controls", () => {
    expect(can("user", "accounts:read")).toBe(true);
    expect(can("user", "accounts:write")).toBe(true);
    expect(can("user", "reports:export")).toBe(true);
    expect(can("user", "users:manage")).toBe(false);
    expect(can("user", "settings:manage")).toBe(false);
  });

  it("restricts the accountant to read + export only", () => {
    expect(can("accountant", "accounts:read")).toBe(true);
    expect(can("accountant", "reports:read")).toBe(true);
    expect(can("accountant", "reports:export")).toBe(true);
    expect(can("accountant", "accounts:write")).toBe(false);
    expect(can("accountant", "users:manage")).toBe(false);
    expect(can("accountant", "settings:manage")).toBe(false);
  });

  it("denies everything for pending, unknown, or absent roles", () => {
    expect(can("pending", "accounts:read")).toBe(false);
    expect(can("pending", "accounts:write")).toBe(false);
    expect(can(null, "accounts:read")).toBe(false);
    expect(can(undefined, "reports:read")).toBe(false);
  });

  it("labels every role", () => {
    for (const role of ROLES) {
      expect(roleLabel(role)).toBeTruthy();
    }
  });
});
