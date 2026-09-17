import { describe, it, expect } from "vitest";
import { cronAuthError } from "@/lib/cron";

describe("cronAuthError", () => {
  it("refuses to run when the secret is unset", () => {
    expect(cronAuthError("Bearer anything", undefined)).toEqual({
      status: 503,
      error: "Cron is not configured",
    });
    expect(cronAuthError("Bearer anything", "")).toEqual({
      status: 503,
      error: "Cron is not configured",
    });
  });

  it("returns 401 when the bearer token does not match", () => {
    expect(cronAuthError("Bearer wrong", "secret")).toEqual({
      status: 401,
      error: "Unauthorized",
    });
    expect(cronAuthError(null, "secret")).toEqual({
      status: 401,
      error: "Unauthorized",
    });
    expect(cronAuthError("Basic secret", "secret")).toEqual({
      status: 401,
      error: "Unauthorized",
    });
  });

  it("allows a matching bearer token", () => {
    expect(cronAuthError("Bearer secret", "secret")).toBeNull();
  });

  it("rejects tokens that differ only by length", () => {
    expect(cronAuthError("Bearer secre", "secret")).toEqual({
      status: 401,
      error: "Unauthorized",
    });
    expect(cronAuthError("Bearer secrets", "secret")).toEqual({
      status: 401,
      error: "Unauthorized",
    });
  });
});
