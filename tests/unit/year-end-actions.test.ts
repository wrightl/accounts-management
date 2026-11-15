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
const clearStaleConfirmations = vi.hoisted(() => vi.fn());
const saveNoteResponses = vi.hoisted(() => vi.fn());
vi.mock("@/lib/year-end/responses", () => ({ clearStaleConfirmations, saveNoteResponses }));
vi.mock("@/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/mutate", () => ({ mutate: vi.fn() }));
const writeAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ writeAudit }));
vi.mock("@/lib/users", () => ({ ensureLocalUser: vi.fn(async () => "user-1") }));

const { openYearEnd, saveYearEndNotes, saveYearEndStartDate } = await import("@/actions/year-end");
const { mutate } = await import("@/lib/mutate");

const NOTES = { sections: [], unconfirmed: 0, startDateMissing: false };
const { requireActionPermission } = await import("@/lib/auth");

beforeEach(() => {
  vi.clearAllMocks();
  prepareYearEndPack.mockResolvedValue({
    checks: [{ items: [{ text: "a" }, { text: "b" }] }],
    notes: NOTES,
  });
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
    // Ticks whose figure has changed since are removed when the year is opened.
    expect(clearStaleConfirmations).toHaveBeenCalledWith(
      "company-1",
      { from: "2025-04-01", to: "2026-03-31" },
      NOTES,
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

describe("saveYearEndNotes", () => {
  const entry = { key: "general", confirmed: false, explanation: "Moved office in May", answer: "" as const };

  it("saves against the notes worked out on the server, and records who did it", async () => {
    state.role = "admin";
    const result = await saveYearEndNotes("2025-04-01", "2026-03-31", [
      entry,
      // Anything that is not a real tick, answer or text is read as empty.
      { key: "pay", confirmed: "yes", explanation: 7, answer: "maybe" } as never,
    ]);

    expect(result).toEqual({ ok: true, id: "2025-04-01_2026-03-31" });
    expect(requireActionPermission).toHaveBeenCalledWith("reports:export");
    expect(saveNoteResponses).toHaveBeenCalledWith(
      "company-1",
      { from: "2025-04-01", to: "2026-03-31" },
      NOTES,
      [entry, { key: "pay", confirmed: false, explanation: "", answer: "" }],
      "user-1",
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-1", action: "year_end.notes" }),
    );
  });

  it("refuses a role that cannot download the pack, and writes nothing", async () => {
    state.role = "pending";
    const result = await saveYearEndNotes("2025-04-01", "2026-03-31", [entry]);

    expect(result.ok).toBe(false);
    expect(saveNoteResponses).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("refuses dates that are not a period", async () => {
    state.role = "admin";
    const result = await saveYearEndNotes("2026-03-31", "2025-04-01", [entry]);

    expect(result.ok).toBe(false);
    expect(saveNoteResponses).not.toHaveBeenCalled();
  });
});

describe("saveYearEndStartDate", () => {
  it("refuses a date in the future or one that is not a date, before touching settings", async () => {
    expect((await saveYearEndStartDate("2999-01-01")).ok).toBe(false);
    expect((await saveYearEndStartDate("not a date")).ok).toBe(false);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("needs the permission to manage settings", async () => {
    await saveYearEndStartDate("2019-06-03");
    expect(mutate).toHaveBeenCalledWith("settings:manage", expect.any(Function), expect.anything());
  });
});
