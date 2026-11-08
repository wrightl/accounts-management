import { describe, it, expect } from "vitest";
import {
  clerkErrorMessage,
  isIdentifierNotFound,
  isRateLimited,
  parsePasswordChange,
  parsePasswordReset,
  parseResetEmail,
} from "@/lib/password/schema";

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe("parsePasswordChange", () => {
  it("requires the current password when the user has one", () => {
    const result = parsePasswordChange(
      form({ newPassword: "longenough1", confirmPassword: "longenough1" }),
      true,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.currentPassword).toBe("Enter your current password");
  });

  it("does not ask for a current password when setting one for the first time", () => {
    const result = parsePasswordChange(
      form({ newPassword: "longenough1", confirmPassword: "longenough1" }),
      false,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects short passwords and mismatched confirmation", () => {
    const short = parsePasswordChange(
      form({ currentPassword: "old", newPassword: "short", confirmPassword: "short" }),
      true,
    );
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.fieldErrors.newPassword).toMatch(/at least 8/);

    const mismatch = parsePasswordChange(
      form({
        currentPassword: "old",
        newPassword: "longenough1",
        confirmPassword: "longenough2",
      }),
      true,
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.fieldErrors.confirmPassword).toBe("Passwords do not match");
    }
  });

  it("returns the current password when valid", () => {
    const result = parsePasswordChange(
      form({
        currentPassword: "old-pass",
        newPassword: "longenough1",
        confirmPassword: "longenough1",
      }),
      true,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        currentPassword: "old-pass",
        newPassword: "longenough1",
      });
    }
  });
});

describe("parseResetEmail", () => {
  it("trims and validates the email", () => {
    const ok = parseResetEmail(form({ email: "  a@example.com " }));
    expect(ok.ok && ok.data.email).toBe("a@example.com");
    const bad = parseResetEmail(form({ email: "nope" }));
    expect(bad.ok).toBe(false);
  });
});

describe("parsePasswordReset", () => {
  it("accepts a 6 digit code with spaces", () => {
    const result = parsePasswordReset(
      form({ code: "123 456", newPassword: "longenough1", confirmPassword: "longenough1" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.code).toBe("123456");
  });

  it("rejects a malformed code", () => {
    const result = parsePasswordReset(
      form({ code: "12ab", newPassword: "longenough1", confirmPassword: "longenough1" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.code).toMatch(/6 digit code/);
  });
});

describe("clerkErrorMessage", () => {
  it("prefers the first API error's long message", () => {
    const err = {
      message: "outer",
      errors: [{ message: "short", longMessage: "Password is incorrect. Try again." }],
    };
    expect(clerkErrorMessage(err, "fallback")).toBe("Password is incorrect. Try again.");
  });

  it("uses the error's own long message, then message", () => {
    expect(clerkErrorMessage({ longMessage: "long", message: "msg" }, "f")).toBe("long");
    expect(clerkErrorMessage(new Error("plain"), "f")).toBe("plain");
  });

  it("falls back when nothing useful is present", () => {
    expect(clerkErrorMessage(null, "fallback")).toBe("fallback");
    expect(clerkErrorMessage({ message: "  " }, "fallback")).toBe("fallback");
  });
});

describe("isRateLimited", () => {
  it("spots a 429 or the too_many_requests code", () => {
    expect(isRateLimited({ status: 429 })).toBe(true);
    expect(isRateLimited({ code: "too_many_requests" })).toBe(true);
    expect(isRateLimited({ errors: [{ code: "too_many_requests" }] })).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isRateLimited({ code: "form_identifier_not_found" })).toBe(false);
    expect(isRateLimited({ status: 422, errors: [{ code: "strategy_for_user_invalid" }] })).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });
});

describe("isIdentifierNotFound", () => {
  it("spots the not-found code on a ClerkError or in an API error list", () => {
    expect(isIdentifierNotFound({ code: "form_identifier_not_found" })).toBe(true);
    expect(
      isIdentifierNotFound({ errors: [{ code: "form_identifier_not_found" }] }),
    ).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isIdentifierNotFound({ code: "too_many_requests" })).toBe(false);
    expect(isIdentifierNotFound(null)).toBe(false);
  });
});
