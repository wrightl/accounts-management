import { describe, it, expect } from "vitest";
import {
  canEditInvoice,
  canTransition,
  defaultDueDate,
  effectiveStatus,
  isFullySettled,
} from "@/lib/invoices/status";

describe("invoice status", () => {
  it("marks sent invoices overdue when past due", () => {
    expect(effectiveStatus("sent", "2026-01-01", "2026-02-01")).toBe("overdue");
    expect(effectiveStatus("sent", "2026-03-01", "2026-02-01")).toBe("sent");
    expect(effectiveStatus("paid", "2026-01-01", "2026-02-01")).toBe("paid");
    expect(effectiveStatus("void", "2026-01-01", "2026-02-01")).toBe("void");
  });

  it("detects full settlement", () => {
    expect(isFullySettled(10000, 10000)).toBe(true);
    expect(isFullySettled(10000, 5000)).toBe(false);
    expect(isFullySettled(0, 0)).toBe(false);
  });

  it("allows void from draft/sent/overdue only", () => {
    expect(canTransition("draft", "void")).toBe(true);
    expect(canTransition("sent", "void")).toBe(true);
    expect(canTransition("overdue", "void")).toBe(true);
    expect(canTransition("paid", "void")).toBe(false);
    expect(canTransition("void", "sent")).toBe(false);
  });

  it("only drafts are editable", () => {
    expect(canEditInvoice("draft")).toBe(true);
    expect(canEditInvoice("sent")).toBe(false);
  });

  it("defaults due date to issue + 14 days", () => {
    expect(defaultDueDate("2026-03-01")).toBe("2026-03-15");
  });
});
