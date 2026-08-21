import { describe, it, expect } from "vitest";
import { can } from "@/lib/roles";

describe("accountant RBAC (reports export, no write)", () => {
  it("can read and export reports but not write accounts", () => {
    expect(can("accountant", "reports:read")).toBe(true);
    expect(can("accountant", "reports:export")).toBe(true);
    expect(can("accountant", "accounts:read")).toBe(true);
    expect(can("accountant", "accounts:write")).toBe(false);
    expect(can("accountant", "users:manage")).toBe(false);
  });
});
