import { beforeEach, describe, expect, it, vi } from "vitest";
import { can, type Permission, type Role } from "@/lib/roles";

const state = vi.hoisted(() => ({ role: "admin" as string }));
const prepareYearEndPack = vi.hoisted(() => vi.fn());
const recordYearEndRun = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireActionPermission: vi.fn(async (permission: Permission) =>
    can(state.role as Role, permission)
      ? { ok: true, user: { companyId: "company-1", role: state.role } }
      : { ok: false, error: "You do not have permission to do that." },
  ),
}));
vi.mock("@/lib/billing/entitlements", () => ({
  getEntitlements: vi.fn(async () => ({ vatExport: true })),
}));
vi.mock("@/lib/year-end/pack", () => ({ prepareYearEndPack }));
vi.mock("@/lib/year-end/runs", () => ({ recordYearEndRun }));
const writeAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ writeAudit }));
vi.mock("@/lib/users", () => ({ ensureLocalUser: vi.fn(async () => "user-1") }));

const { openYearEnd } = await import("@/actions/year-end");
const { requireActionPermission } = await import("@/lib/auth");

beforeEach(() => {
  vi.clearAllMocks();
  prepareYearEndPack.mockResolvedValue({ checks: [{ items: [{ text: "a" }, { text: "b" }] }] });
});

describe("openYearEnd", () => {
  it("needs the permission to download the pack, not just to read filing pages", async () => {
    await openYearEnd("2025-04-01", "2026-03-31");
    expect(requireActionPermission).toHaveBeenCalledWith("reports:export");
  });

  it("records the year and how many items the checks found", async () => {
    state.role = "accountant";
    const result = await openYearEnd("2025-04-01", "2026-03-31");

    expect(result).toEqual({ ok: true, id: "2025-04-01_2026-03-31" });
    expect(recordYearEndRun).toHaveBeenCalledWith(
      "company-1",
      { from: "2025-04-01", to: "2026-03-31" },
      2,
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        actorUserId: "user-1",
        action: "year_end.review",
        meta: { from: "2025-04-01", to: "2026-03-31", outstandingChecks: 2 },
      }),
    );
  });

  it("refuses a role without it, and writes nothing", async () => {
    state.role = "pending";
    const result = await openYearEnd("2025-04-01", "2026-03-31");

    expect(result).toEqual({ ok: false, error: "You do not have permission to do that." });
    expect(prepareYearEndPack).not.toHaveBeenCalled();
    expect(recordYearEndRun).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("refuses dates that are not a period", async () => {
    state.role = "admin";
    const result = await openYearEnd("2026-03-31", "2025-04-01");

    expect(result.ok).toBe(false);
    expect(recordYearEndRun).not.toHaveBeenCalled();
  });
});
