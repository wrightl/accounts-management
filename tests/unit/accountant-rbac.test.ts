import { describe, it, expect } from "vitest";
import { can, permissionsFor } from "@/lib/roles";

describe("accountant RBAC (filing only)", () => {
  it("holds exactly the permissions needed to file the accounts", () => {
    expect(permissionsFor("accountant").sort()).toEqual([
      "books:lock",
      "filing:read",
      "reports:export",
      "workspace:read",
    ]);
  });

  it("cannot read or change day-to-day records or management figures", () => {
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
