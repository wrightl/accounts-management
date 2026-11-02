import { describe, it, expect } from "vitest";
import { can, permissionsFor } from "@/lib/roles";

describe("accountant RBAC (filing, read-only records and queries)", () => {
  it("holds exactly the permissions needed to file and ask about the accounts", () => {
    expect(permissionsFor("accountant").sort()).toEqual([
      "books:lock",
      "filing:read",
      "queries:raise",
      "queries:read",
      "records:read",
      "reports:export",
      "workspace:read",
    ]);
  });

  it("only the accountant raises queries; the team can read and reply", () => {
    expect(can("admin", "queries:raise")).toBe(false);
    expect(can("user", "queries:raise")).toBe(false);
    expect(can("admin", "queries:read")).toBe(true);
    expect(can("user", "queries:read")).toBe(true);
    expect(can("pending", "queries:read")).toBe(false);
  });

  it("cannot change records, or read beyond the pack or management figures", () => {
    expect(can("accountant", "accounts:read")).toBe(false);
    expect(can("accountant", "accounts:write")).toBe(false);
    expect(can("accountant", "reports:read")).toBe(false);
    expect(can("accountant", "users:manage")).toBe(false);
  });

  it("keeps co-founders and admins on everything they had", () => {
    for (const role of ["admin", "user"] as const) {
      for (const permission of ["accounts:read", "reports:read", "filing:read", "workspace:read"] as const) {
        expect(can(role, permission)).toBe(true);
      }
    }
  });
});
