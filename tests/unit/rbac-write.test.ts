import { describe, it, expect } from "vitest";
import { can } from "@/lib/roles";

describe("RBAC for invoicing writes", () => {
  it("allows admin and user to write accounts", () => {
    expect(can("admin", "accounts:write")).toBe(true);
    expect(can("user", "accounts:write")).toBe(true);
  });

  it("denies accountant write access (server actions use requirePermission)", () => {
    expect(can("accountant", "accounts:write")).toBe(false);
    expect(can("accountant", "accounts:read")).toBe(true);
    expect(can("accountant", "settings:manage")).toBe(false);
  });
});
