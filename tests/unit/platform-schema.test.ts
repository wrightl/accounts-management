import { describe, it, expect } from "vitest";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";
import {
  parseCompanySupportNoteInput,
  parsePlatformInviteAdminInput,
  parsePlatformSettingsInput,
  parseSuspendCompanyInput,
} from "@/lib/platform/schema";

describe("parsePlatformSettingsInput", () => {
  it("accepts local provider without model format check", () => {
    const result = parsePlatformSettingsInput({
      maintenanceBanner: "  Hello  ",
      defaultReceiptOcrProvider: "local",
      defaultReceiptOcrModel: "",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.maintenanceBanner).toBe("Hello");
    expect(result.data.defaultReceiptOcrProvider).toBe("local");
    expect(result.data.defaultReceiptOcrModel).toBe("google/gemini-2.5-flash");
  });

  it("rejects invalid gateway model with fieldErrors", () => {
    const result = parsePlatformSettingsInput({
      maintenanceBanner: "",
      defaultReceiptOcrProvider: "ai_gateway",
      defaultReceiptOcrModel: "not-a-slug",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(FORM_FIELD_ERROR_SUMMARY);
    expect(result.fieldErrors.defaultReceiptOcrModel).toMatch(/provider\/model/);
  });
});

describe("parsePlatformInviteAdminInput", () => {
  it("requires a valid email", () => {
    const result = parsePlatformInviteAdminInput({ email: "", name: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.email).toBeTruthy();
  });

  it("accepts optional name", () => {
    const result = parsePlatformInviteAdminInput({
      email: "ops@example.com",
      name: "  Ops  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe("Ops");
  });
});

const companyId = "550e8400-e29b-41d4-a716-446655440000";

describe("parseCompanySupportNoteInput", () => {
  it("rejects empty body", () => {
    const result = parseCompanySupportNoteInput({
      companyId,
      body: "   ",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.body).toBe("Enter a support note");
  });
});

describe("parseSuspendCompanyInput", () => {
  it("allows empty reason", () => {
    const result = parseSuspendCompanyInput({
      companyId,
      reason: "",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reason).toBeNull();
  });
});
